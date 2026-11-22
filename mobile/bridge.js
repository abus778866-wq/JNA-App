// Android/web entry point: provides window.api (same channels as preload.js) by running the unchanged main.js + database.js in the WebView.
import './shims/globals.js';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { mem, mkdir, readFile, mount, isMounted, recoverInterruptedSave } from './shims/vfs.js';
import { invoke, markReady, takeOutbox, pickDirectory } from './shims/electron.js';
import * as store from './storage.js';
import * as permissions from './permissions.js';
import * as database from './.gen/database.js';
import './.gen/main.js';

const CHANNELS = ['status', 'chooseDbDir', 'setDbDir', 'db', 'setLogo', 'exportStudents', 'saveImage', 'backupDb', 'restoreDb', 'showDbFolder', 'login', 'logout', 'printPage', 'savePdf', 'saveImages', 'importFile', 'importTemplate', 'uploadStudentDocs', 'viewStudentDocument', 'saveStudentDocument'];

async function prepare() {
  try { mem.set('/app/logo.png', Buffer.from(await (await fetch('logo.png')).arrayBuffer())); } catch { /* the app falls back to no default logo */ }
  await mkdir('/data/.app');                         // app-private: only the small config file lives here
  // Re-attach the folders the user granted earlier (Android keeps the grant across restarts), so the saved database folder opens again.
  for (const f of await store.listFolders()) mount(f.label, f.uri);
  try {
    const cfg = JSON.parse((await readFile('/data/.app/config.json')).toString('utf8'));
    if (cfg.dbDir && isMounted(cfg.dbDir)) await recoverInterruptedSave(cfg.dbDir);
  } catch { /* first launch: no folder chosen yet, the app shows the "choose where to store your data" screen */ }
  const hasConfig = await readFile('/data/.app/config.json').then(() => true, () => false);
  markReady();
  // With a saved folder, wait (max 30 s) until the database is open. On first launch there is nothing to wait for.
  for (let i = 0; hasConfig && i < 300 && !database.isOpen(); i++) await new Promise(r => setTimeout(r, 100));
}
const ready = prepare();

/** Gives files to the user: native share sheet (Save to Drive / Files / WhatsApp / print...) or a normal download in a browser. */
async function deliver(files) {
  if (!files.length) return;
  if (Capacitor.isNativePlatform()) {
    const uris = [];
    for (const f of files) {
      const path = 'exports/' + f.name;
      await Filesystem.writeFile({ path, directory: Directory.Cache, data: f.data.toString('base64'), recursive: true });
      uris.push((await Filesystem.getUri({ path, directory: Directory.Cache })).uri);
    }
    try { await Share.share({ title: files[0].name, files: uris, dialogTitle: 'Save or share' }); } catch { /* sheet dismissed */ }
    return;
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.data])); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
  }
}

const clone = v => { try { return structuredClone(v); } catch { return v; } };

window.api = {
  invoke: async (channel, ...args) => {
    if (!CHANNELS.includes(channel)) return { ok: false, error: 'Blocked channel.' };
    await ready;
    takeOutbox();                                   // clear leftovers
    if (channel === 'setDbDir' && !isMounted(String(args[0] || ''))) {
      // Android only allows folders chosen in the system picker (a typed path would be refused), so open the picker now.
      try {
        const picked = await pickDirectory({ persist: true });
        if (!picked) return { ok: false, error: 'No folder chosen. Tap Browse and pick a folder to store your data.' };
        args = [picked.label];
      } catch (e) { return { ok: false, error: e.message || 'Could not open the folder picker.' }; }
    }
    const res = await invoke(channel, ...clone(args));
    const files = takeOutbox();
    if (res && res.ok && files.length) await deliver(files);
    return clone(res);
  }
};

// Save to storage whenever the app goes to the background (replaces Electron's before-quit).
const save = () => { try { database.flushAsync(); } catch { /* nothing open */ } };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
window.addEventListener('pagehide', save);

// Permissions: ask once on first launch (camera, microphone, media) with a plain-language explanation. Denial never blocks the app.
// Other code can call window.jamiaPermissions.request('camera') right before it needs a permission.
window.jamiaPermissions = permissions.api;
permissions.startup();
