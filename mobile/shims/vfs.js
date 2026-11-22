// File system used instead of Node's `fs`. Three kinds of paths:
//
//   /storage/...  REAL phone storage. A folder the user picked in the system folder picker is "mounted" under its real-looking
//                 path (e.g. /storage/emulated/0/Documents/JamiaData). Reads and writes go straight to that folder through the
//                 native JamiaStorage plugin (Storage Access Framework). Database + student documents live here.
//   /data/...     app-private storage (Capacitor Filesystem, Directory.Data): only the small config file, and data of
//                 older app versions that kept the database privately.
//   /tmp, /app    memory. /tmp/picked = files the user chose, /tmp/out = files to hand over (share sheet / download).
//
// Android only lets an app use folders the user chose, so a /storage path that is not mounted fails with a clear message.
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Buffer } from 'buffer';
import path from 'path-browserify';
import * as store from '../storage.js';

export const mem = new Map();            // path -> Buffer
export const outbox = new Set();         // /tmp/out/... paths written during the current call
const D = Directory.Data;
const norm = p => path.normalize(String(p)).replace(/(.)\/+$/, '$1');
const enoent = p => Object.assign(new Error(`ENOENT: no such file or directory, '${p}'`), { code: 'ENOENT' });
const toBuf = d => (typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(d));
const memDirHas = p => { const pre = p.endsWith('/') ? p : p + '/'; for (const k of mem.keys()) if (k.startsWith(pre)) return true; return false; };

/* ------------------------------------------------------------------ mounts */
const mounts = new Map();                // "/storage/emulated/0/Documents/JamiaData" -> content:// tree uri
export function mount(label, uri) { mounts.set(norm(label), uri); }
export function unmount(label) { mounts.delete(norm(label)); }
export function mountedUri(p) { const m = find(norm(p)); return m ? m.uri : null; }
export const isMounted = p => !!find(norm(p));

function find(p) {
  let best = null;
  for (const [root, uri] of mounts) {
    if ((p === root || p.startsWith(root + '/')) && (!best || root.length > best.root.length)) best = { root, uri, rel: p.slice(root.length).replace(/^\//, '') };
  }
  return best;
}
const notPicked = p => Object.assign(new Error(`The app cannot use "${p}". Android only allows folders you choose: tap Browse and pick the folder.`), { code: 'EACCES' });

/** Where a path really lives: { kind: 'saf', uri, rel } | { kind: 'priv', rel } | { kind: 'mem' }. */
function route(p) {
  p = norm(p);
  if (p === '/storage' || p.startsWith('/storage/')) { const m = find(p); if (!m) throw notPicked(p); return { kind: 'saf', uri: m.uri, rel: m.rel, p }; }
  if (p === '/data' || p.startsWith('/data/')) return { kind: 'priv', rel: p.replace(/^\/data\/?/, ''), p };
  return { kind: 'mem', p };
}

/* -------------------------------------------------------------- operations */
export async function readFile(p) {
  const r = route(p);
  if (r.kind === 'mem') { if (mem.has(r.p)) return Buffer.from(mem.get(r.p)); throw enoent(r.p); }
  if (r.kind === 'saf') {
    try { return Buffer.from(await store.readFile(r.uri, r.rel), 'base64'); }
    catch (e) { throw e.code === 'ENOENT' ? enoent(r.p) : e; }
  }
  try {
    const { data } = await Filesystem.readFile({ path: r.rel, directory: D });
    return typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(await data.arrayBuffer());
  } catch { throw enoent(r.p); }
}

export async function writeFile(p, data) {
  const r = route(p), buf = toBuf(data);
  if (r.kind === 'mem') { mem.set(r.p, buf); if (r.p.startsWith('/tmp/out/')) outbox.add(r.p); return; }
  if (r.kind === 'saf') return store.writeFile(r.uri, r.rel, buf.toString('base64'));
  await Filesystem.writeFile({ path: r.rel, directory: D, data: buf.toString('base64'), recursive: true });
}

export async function mkdir(p) {
  const r = route(p);
  if (r.kind === 'mem') return;
  if (r.kind === 'saf') return store.mkdir(r.uri, r.rel);
  try { await Filesystem.mkdir({ path: r.rel, directory: D, recursive: true }); } catch { /* already exists */ }
}

export async function stat(p) {
  const r = route(p);
  if (r.kind === 'mem') {
    if (mem.has(r.p)) return { size: mem.get(r.p).length, isFile: () => true, isDirectory: () => false };
    if (memDirHas(r.p)) return { size: 0, isFile: () => false, isDirectory: () => true };
    throw enoent(r.p);
  }
  if (r.kind === 'saf') {
    const s = await store.stat(r.uri, r.rel);          // permission problems throw EACCES (not "missing")
    if (!s.exists) throw enoent(r.p);
    return { size: s.size, mtimeMs: s.modified, isFile: () => !!s.isFile, isDirectory: () => !!s.isDirectory };
  }
  try {
    const s = await Filesystem.stat({ path: r.rel, directory: D });
    return { size: s.size, isFile: () => s.type === 'file', isDirectory: () => s.type === 'directory' };
  } catch { throw enoent(r.p); }
}
export const access = async p => { await stat(p); };

export async function readdir(p) {
  const r = route(p);
  if (r.kind === 'mem') { const pre = r.p.endsWith('/') ? r.p : r.p + '/'; const names = new Set(); for (const k of mem.keys()) if (k.startsWith(pre)) names.add(k.slice(pre.length).split('/')[0]); return [...names]; }
  if (r.kind === 'saf') { try { return await store.readdir(r.uri, r.rel); } catch (e) { throw e.code === 'ENOENT' ? enoent(r.p) : e; } }
  try { return (await Filesystem.readdir({ path: r.rel, directory: D })).files.map(f => f.name || f); } catch { return []; }
}

export async function unlink(p) {
  const r = route(p);
  if (r.kind === 'mem') { mem.delete(r.p); outbox.delete(r.p); return; }
  if (r.kind === 'saf') return store.deleteFile(r.uri, r.rel);
  await Filesystem.deleteFile({ path: r.rel, directory: D });
}

export async function rm(p, opts = {}) {
  try {
    const r = route(p);
    if (r.kind === 'mem') { for (const k of [...mem.keys()]) if (k === r.p || k.startsWith(r.p + '/')) mem.delete(k); return; }
    if (r.kind === 'saf') { if (!r.rel) throw new Error('Refusing to delete the storage folder itself.'); return await store.deleteFile(r.uri, r.rel); }
    const s = await stat(r.p);
    if (s.isDirectory()) await Filesystem.rmdir({ path: r.rel, directory: D, recursive: true }); else await Filesystem.deleteFile({ path: r.rel, directory: D });
  } catch (e) { if (!opts.force) throw e; }
}

export async function rename(from, to) {
  const a = route(from), b = route(to);
  if (a.kind === 'saf' && b.kind === 'saf' && a.uri === b.uri) {
    try { return await store.rename(a.uri, a.rel, b.rel); }          // atomic "temp file -> real file" (replaces the target)
    catch (e) { if (e.code !== 'CROSS_FOLDER') throw e; }
  } else if (a.kind === 'priv' && b.kind === 'priv') {
    try { await Filesystem.rename({ from: a.rel, to: b.rel, directory: D, toDirectory: D }); }
    catch { try { await Filesystem.deleteFile({ path: b.rel, directory: D }); } catch { /* none */ } await Filesystem.rename({ from: a.rel, to: b.rel, directory: D, toDirectory: D }); }
    return;
  }
  await writeFile(to, await readFile(from)); await unlink(from);
}
export async function copyFile(from, to) { await writeFile(to, await readFile(from)); }
export async function cp(src, dst, opts = {}) {
  const s = await stat(src);
  if (s.isFile()) { await writeFile(dst, await readFile(src)); return; }
  if (!opts.recursive) throw new Error('cp: recursive option required for directories');
  await mkdir(dst);
  for (const name of await readdir(src)) await cp(path.join(norm(src), name), path.join(norm(dst), name), opts);
}

/* Synchronous variants exist only because database.flush() (app exit) calls them. Writes are queued; flushAsync() is what the app really uses. */
let chain = Promise.resolve();
export function readFileSync(p) { p = norm(p); if (mem.has(p)) return Buffer.from(mem.get(p)); throw enoent(p); }
export function writeFileSync(p, d) { chain = chain.then(() => writeFile(p, d)).catch(() => {}); }
export function renameSync(a, b) { chain = chain.then(() => rename(a, b)).catch(() => {}); }

export const promises = { readFile, writeFile, mkdir, stat, access, readdir, unlink, rm, rename, copyFile, cp };

/** After a crash the real database may be missing while a complete temp copy exists (rename interrupted): put it back. */
export async function recoverInterruptedSave(dir) {
  try {
    const names = await readdir(dir);
    for (const n of names) {
      if (!/\.sqlite\.tmp$/i.test(n)) continue;
      const real = n.replace(/\.tmp$/i, '');
      if (!names.includes(real)) await rename(path.join(norm(dir), n), path.join(norm(dir), real));
    }
  } catch { /* folder not available: the normal start-up error handling reports it */ }
}
