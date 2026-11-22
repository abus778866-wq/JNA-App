// Storage + permission API used by the rest of the mobile code.
//   Android app : every call goes to the native JamiaStorage plugin (plugins/jamia-storage), i.e. the phone's REAL storage,
//                 inside the folder the user picked in the system folder picker.
//   Plain browser (only for testing on a PC): the same calls are served from the browser's own storage so the UI still runs.
//                 It is clearly labelled "/browser/..." and is NOT used on the phone.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const Native = registerPlugin('JamiaStorage');
export const isNative = () => Capacitor.isNativePlatform();

/** Normalises plugin errors to { code, message } (ENOENT, EACCES, EIO, CANCELLED ...). */
export function fsError(e, fallback = 'Storage error') {
  const err = new Error((e && e.message) || fallback);
  err.code = (e && e.code) || 'EIO';
  return err;
}
async function call(fn) { try { return await fn(); } catch (e) { throw fsError(e); } }

/* ----------------------------------------------------------------- folders */

/** Opens the system folder picker. Resolves { uri, label } or { cancelled: true }. persist=false keeps access for this session only. */
export async function pickFolder({ persist = true, initialUri } = {}) {
  if (isNative()) return call(() => Native.pickFolder({ persist, initialUri }));
  return { uri: 'web:JamiaData', label: '/browser/JamiaData' };
}
export async function listFolders() {
  if (!isNative()) return [{ uri: 'web:JamiaData', label: '/browser/JamiaData' }];
  try { return (await Native.listFolders()).folders || []; } catch { return []; }
}
export const releaseFolder = uri => (isNative() ? Native.releaseFolder({ uri }).catch(() => {}) : Promise.resolve());
export async function openFolder(uri) {
  if (!isNative()) return;
  try { await Native.openFolder({ uri }); } catch { /* no file browser available: ignore */ }
}

/* ------------------------------------------------------------ file operations
   uri = the folder the user picked; path = relative path inside it ("sub/file.txt"). */
const webPath = (uri, p) => `Storage/${uri.slice(4)}/${p}`.replace(/\/+$/, '');
const W = { directory: Directory.Data };

export async function stat(uri, path) {
  if (isNative()) return call(() => Native.stat({ uri, path }));
  try {
    const s = await Filesystem.stat({ path: webPath(uri, path), ...W });
    return { exists: true, isFile: s.type === 'file', isDirectory: s.type === 'directory', size: s.size, modified: s.mtime };
  } catch { return { exists: path === '', isFile: false, isDirectory: path === '', size: 0, modified: 0 }; }
}
export async function readdir(uri, path) {
  if (isNative()) return (await call(() => Native.readdir({ uri, path }))).files;
  try { return (await Filesystem.readdir({ path: webPath(uri, path), ...W })).files.map(f => f.name || f); }
  catch (e) { throw fsError(Object.assign(e, { code: 'ENOENT' })); }
}
export async function mkdir(uri, path) {
  if (isNative()) return call(() => Native.mkdir({ uri, path }));
  try { await Filesystem.mkdir({ path: webPath(uri, path), ...W, recursive: true }); } catch { /* exists */ }
}
/** Resolves a base64 string. */
export async function readFile(uri, path) {
  if (isNative()) return (await call(() => Native.readFile({ uri, path }))).data;
  try {
    const { data } = await Filesystem.readFile({ path: webPath(uri, path), ...W });
    return typeof data === 'string' ? data : btoa(String.fromCharCode(...new Uint8Array(await data.arrayBuffer())));
  } catch (e) { throw fsError(Object.assign(e, { code: 'ENOENT' })); }
}
export async function writeFile(uri, path, base64) {
  if (isNative()) return call(() => Native.writeFile({ uri, path, data: base64 }));
  return call(() => Filesystem.writeFile({ path: webPath(uri, path), ...W, data: base64, recursive: true }));
}
export async function deleteFile(uri, path) {
  if (isNative()) return call(() => Native.deleteFile({ uri, path }));
  try {
    const s = await Filesystem.stat({ path: webPath(uri, path), ...W });
    if (s.type === 'directory') await Filesystem.rmdir({ path: webPath(uri, path), ...W, recursive: true });
    else await Filesystem.deleteFile({ path: webPath(uri, path), ...W });
  } catch { /* already gone */ }
}
/** Rename inside one folder; an existing target is replaced. Throws code CROSS_FOLDER when source and target are in different folders. */
export async function rename(uri, from, to) {
  if (isNative()) return call(() => Native.rename({ uri, from, to, overwrite: true }));
  try { await Filesystem.deleteFile({ path: webPath(uri, to), ...W }); } catch { /* none */ }
  return call(() => Filesystem.rename({ from: webPath(uri, from), to: webPath(uri, to), directory: Directory.Data, toDirectory: Directory.Data }));
}

/* ------------------------------------------------------------- permissions
   groups: 'camera' | 'microphone' | 'media' (photos, videos, audio; the correct set for the Android version)
   result: { camera: { state: 'granted' | 'prompt' | 'denied', canAskAgain }, ... }. Never throws. */
export const ALL_GROUPS = ['camera', 'microphone', 'media'];
const unknown = groups => Object.fromEntries(groups.map(g => [g, { state: isNative() ? 'prompt' : 'granted', canAskAgain: true }]));

export async function checkPermissions(groups = ALL_GROUPS) {
  if (!isNative()) return unknown(groups);
  try { return await Native.checkAppPermissions({ groups }); } catch { return unknown(groups); }
}
export async function requestPermissions(groups = ALL_GROUPS) {
  if (!isNative()) return unknown(groups);
  try { return await Native.requestAppPermissions({ groups }); } catch { return checkPermissions(groups); }
}
export async function openAppSettings() {
  if (isNative()) { try { await Native.openAppSettings(); } catch { /* ignore */ } }
}
