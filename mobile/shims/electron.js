// Minimal stand-in for Electron so the unchanged main.js (all handlers and the role/permission rules) runs inside the Android WebView.
import { Buffer } from 'buffer';
import { unzipSync, zipSync } from 'fflate';
import { mem, outbox, writeFile, readFile, mkdir, mount, mountedUri } from './vfs.js';
import { printTargetToPdf } from './pdf.js';
import * as store from '../storage.js';

const handlers = new Map();
export const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
export const invoke = (channel, ...args) => (handlers.has(channel) ? handlers.get(channel)({}, ...args) : Promise.resolve({ ok: false, error: 'Unknown channel.' }));

let readyResolve; const ready = new Promise(r => { readyResolve = r; });
export const markReady = () => readyResolve();
export const app = {
  getPath: name => (name === 'documents' ? '/storage/emulated/0/Documents' : '/data/.app'),   // userData (config) stays app-private; documents = suggested real location
  whenReady: () => ready, on() {}, quit() {}
};
export const Menu = { setApplicationMenu() {} };
export class BrowserWindow {
  constructor() { this.webContents = webContents; }
  loadFile() {} show() {} once(ev, cb) { if (ev === 'ready-to-show') queueMicrotask(cb); }
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const webContents = {
  async printToPDF(o) { return printTargetToPdf(!!(o && o.landscape)); },
  async print(o, cb) {
    try { await writeFile(`/tmp/out/Jamia-print-${stamp()}.pdf`, await printTargetToPdf(!!(o && o.landscape))); cb(true); } catch { cb(false); }
  }
};

const safeName = n => String(n || 'file').split(/[\\/]/).pop().replace(/[^\w.\- ]+/g, '_');
/** Opens the phone's real folder picker, mounts the chosen folder so the app can read/write in it, and returns its path.
 *  Returns null when the user cancels. Throws a readable error for unusable choices (cloud drive, read-only folder). */
export async function pickDirectory({ persist }) {
  const r = await store.pickFolder({ persist });
  if (!r || r.cancelled) return null;
  mount(r.label, r.uri);
  return r;
}

export const dialog = {
  async showSaveDialog(_w, o) { return { canceled: false, filePath: '/tmp/out/' + safeName(o && o.defaultPath) }; },
  async showOpenDialog(_w, o = {}) {
    const props = o.properties || [];
    if (props.includes('openDirectory')) {
      // Real native folder picker. Only the database folder is remembered across restarts; other choices (e.g. page images) are used once.
      const r = await pickDirectory({ persist: /database folder/i.test(o.title || '') });
      return r ? { canceled: false, filePaths: [r.label] } : { canceled: true, filePaths: [] };
    }
    const exts = (o.filters || []).flatMap(f => f.extensions || []);
    const multi = props.includes('multiSelections') || /database backup/i.test(o.title || '');   // restore: backup .sqlite plus optional documents .zip
    const files = await pickFiles({ multi, accept: exts.includes('pdf') ? 'image/*,application/pdf' : '' });
    if (!files.length) return { canceled: true, filePaths: [] };
    const paths = [], zips = [];
    for (const f of files) {
      const p = '/tmp/picked/' + safeName(f.name), buf = Buffer.from(await f.arrayBuffer());
      if (/\.zip$/i.test(f.name) && files.length > 1) { zips.push(buf); continue; }
      mem.set(p, buf); paths.push(p);
    }
    if (paths.length) for (const z of zips) {   // documents zip -> /tmp/picked/<backup name>_documents/...
      const base = paths[0].replace(/\.(sqlite3?|db)$/i, '') + '_documents';
      for (const [name, data] of Object.entries(unzipSync(new Uint8Array(z)))) if (data.length) mem.set(base + '/' + name, Buffer.from(data));
    }
    return { canceled: !paths.length, filePaths: paths };
  }
};
function pickFiles({ multi, accept }) {
  return new Promise(resolve => {
    const i = document.createElement('input');
    i.type = 'file'; i.multiple = !!multi; if (accept) i.accept = accept; i.style.display = 'none';
    i.addEventListener('change', () => { resolve([...i.files]); i.remove(); });
    i.addEventListener('cancel', () => { resolve([]); i.remove(); });
    document.body.appendChild(i); i.click();
  });
}

export const shell = {
  async openPath(file) { const name = safeName(file); await writeFile('/tmp/out/' + name, await readFile(file)); return ''; },   // handed to the share sheet so a PDF viewer can open it
  showItemInFolder(file) { const uri = mountedUri(String(file || '')); if (uri) store.openFolder(uri); }   // opens the Files app at the data folder
};
export const net = { fetch: (...a) => fetch(...a) };

/** Files written under /tmp/out during one call. Sub-folders (the documents backup) are zipped into one file. Returns [{name, data}]. */
export function takeOutbox() {
  const top = [], dirs = new Map();
  for (const p of outbox) {
    const parts = p.slice('/tmp/out/'.length).split('/');
    if (parts.length === 1) top.push({ name: parts[0], data: mem.get(p) });
    else { if (!dirs.has(parts[0])) dirs.set(parts[0], {}); dirs.get(parts[0])['' + parts.slice(1).join('/')] = new Uint8Array(mem.get(p)); }
  }
  for (const [d, files] of dirs) top.push({ name: d + '.zip', data: Buffer.from(zipSync(files, { level: 0 })) });
  for (const p of [...outbox]) mem.delete(p);
  outbox.clear();
  return top;
}
export { mkdir };
