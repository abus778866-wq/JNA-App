/* ==========================================================================
   main.js — Electron main process for Jamia Noor-ul-Anwar
   Handles the window, the database folder choice, logo download,
   Excel export and image saving. The UI talks to it through preload.js.
   ========================================================================== */
'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const XLSX = require('xlsx');
const database = require('./database');

let win = null;

/* ---------- Small config file (remembers where the database folder is) ---------- */
const configFile = () => path.join(app.getPath('userData'), 'config.json');
async function readConfig() {
  try { return JSON.parse(await fsp.readFile(configFile(), 'utf8')); } catch { return {}; }
}
async function writeConfig(cfg) {
  await fsp.mkdir(path.dirname(configFile()), { recursive: true });
  await fsp.writeFile(configFile(), JSON.stringify(cfg, null, 2));
}
const exists = p => fsp.access(p).then(() => true, () => false);
/** Lets the window repaint between heavy steps so the UI never feels stuck. */
const yieldNow = () => new Promise(r => setImmediate(r));

/* ---------- Who is signed in? (enforced here, not in the UI) ---------- */
let role = null;                         // 'admin' | 'teacher' | null
let teacherId = null, teacherSection = null;   // set for teachers with an individual login (null id = old shared login)
let failedLogins = 0, lockedUntil = 0;   // slows down password guessing

/** Teachers may only call these database operations: view reports, manage marks, save attendance once. */
const TEACHER_METHODS = new Set([
  'getSettings', 'getClasses', 'getStudents', 'getStudent', 'searchStudents', 'getStudentPhoto', 'getStudentPhotos',
  'getStudentReport', 'getMarks', 'saveMarks', 'deleteMarks', 'getResultSummaries', 'getSignatures',
  'getClassRoster', 'saveClassAttendance', 'getAttendanceLocks',
  'getExams', 'getClassSubjects', 'getClassResults', 'getRemark', 'saveRemark', 'getHolidays',
  'getClassOrders', 'getTimetable'
]);

/* Class-level limits for teachers with an individual login: only classes they teach or lead, only their own section.
   Argument positions: which argument is a section, a class id or a student id. Lists are filtered after the call. */
const T_SECTION = new Set(['getClassOrders', 'getTimetable', 'getHolidays', 'getClasses', 'getStudents', 'searchStudents', 'getClassRoster', 'saveClassAttendance', 'getAttendanceLocks', 'getExams', 'getClassResults']);
const T_CLASS_ARG = { getClassRoster: 1, saveClassAttendance: 1, getClassResults: 1, getClassSubjects: 0 };
const T_STUDENT = new Set(['getStudent', 'getStudentPhoto', 'getStudentReport', 'getMarks', 'saveMarks', 'deleteMarks', 'getResultSummaries', 'getSignatures', 'getRemark', 'saveRemark']);
const T_FILTER = { getClasses: 'id', getStudents: 'class_id', searchStudents: 'class_id', getAttendanceLocks: 'class_id' };

/** Throws unless this call stays inside the signed-in teacher's classes. Returns the allowed class ids (or null = no limit). */
function teacherLimits(method, args) {
  if (role !== 'teacher' || !teacherId) return null;
  const deny = () => { throw new Error('You can only access your own classes.'); };
  const ids = new Set(database.api.getTeacherClassIds(teacherId));
  if (T_SECTION.has(method) && args[0] !== teacherSection) deny();
  if (method in T_CLASS_ARG && !ids.has(Number(args[T_CLASS_ARG[method]]))) deny();
  if (T_STUDENT.has(method)) { const st = database.api.getStudent(args[0]); if (!st || !ids.has(st.class_id)) deny(); }
  if (method === 'getStudentPhotos') args[0] = (args[0] || []).filter(i => { const st = database.api.getStudent(i); return st && ids.has(st.class_id); });
  return ids;
}
const PUBLIC_METHODS = new Set(['getPublicSettings']);   // login screen logo

/** allow: 'any', or a list of roles, or a function returning true/false. Default: administrators only. */
function handle(channel, fn, allow = ['admin']) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const ok = allow === 'any' || (typeof allow === 'function' ? allow() : allow.includes(role));
      if (!ok) throw new Error(role ? 'You do not have permission for this action.' : 'Please sign in first.');
      return { ok: true, data: await fn(...args) };
    } catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
}

handle('login', (kind, username, password) => {
  if (!database.isOpen()) throw new Error('The database is not open yet.');
  if (Date.now() < lockedUntil) throw new Error(`Too many failed attempts. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)} seconds.`);
  const who = ['admin', 'teacher'].includes(kind) ? database.api.verifyLogin(kind, username, password) : false;
  if (!who) {
    if (++failedLogins >= 5) { lockedUntil = Date.now() + 30000; failedLogins = 0; }
    return false;
  }
  failedLogins = 0;
  role = kind;
  teacherId = who.teacherId || null;
  teacherSection = who.section || null;
  return { section: teacherSection };     // a teacher with an individual login goes straight to their own section
}, 'any');
handle('logout', () => { role = null; teacherId = null; teacherSection = null; return true; }, 'any');

/* ---------- Database location ---------- */
handle('status', async () => ({
  dbReady: database.isOpen(),
  dbDir: (await readConfig()).dbDir || null,
  dbFile: database.getFilePath(),
  defaultDir: path.join(app.getPath('documents'), 'JamiaData')
}), 'any');

handle('chooseDbDir', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose database folder',
    properties: ['openDirectory', 'createDirectory']
  });
  return res.canceled ? null : res.filePaths[0];
}, () => !database.isOpen() || role === 'admin');

handle('setDbDir', async dir => {
  dir = String(dir || '').trim();
  if (!dir) throw new Error('Enter or choose a folder first.');
  const resolved = path.resolve(dir);
  const oldDocs = database.isOpen() ? database.docsDir() : null;
  const result = await database.open(resolved);
  if (result.migrated && oldDocs && await exists(oldDocs)) await fsp.cp(oldDocs, database.docsDir(), { recursive: true });   // uploaded student files go with the database
  await writeConfig({ ...(await readConfig()), dbDir: resolved });
  return { dir: resolved, migrated: result.migrated };
}, () => !database.isOpen() || role === 'admin');

/* ---------- Database calls (only functions exported in database.api) ---------- */
handle('db', async (method, args) => {
  const fn = database.api[method];
  if (typeof fn !== 'function') throw new Error(`Unknown operation: ${method}`);
  if (!database.isOpen()) throw new Error('The database is not open yet.');
  const allowed = PUBLIC_METHODS.has(method) || role === 'admin' || (role === 'teacher' && TEACHER_METHODS.has(method));
  if (!allowed) throw new Error(role ? 'You do not have permission for this action.' : 'Please sign in first.');
  args = args || [];
  const ids = teacherLimits(method, args);
  await yieldNow();                       // let the window paint first
  const out = await fn(...args);          // api functions may be sync or async
  if (role === 'teacher' && method === 'getStudentReport') { delete out.hostel; delete out.funds; }   // hostel dues and money held are for the administrator only
  return ids && T_FILTER[method] ? out.filter(r => ids.has(r[T_FILTER[method]])) : out;
}, 'any');

/* ---------- Institution logo from a Google Drive link ---------- */
function driveFileId(url) {
  const m = url.match(/\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/);
  return m ? m[1] : null;
}

/** Downloads the image once and stores it inside the database, so it works offline
 *  and can be drawn into the JPG export without cross-origin problems. */
async function downloadLogo(url) {
  const id = driveFileId(url);
  const candidates = id
    ? [`https://drive.google.com/thumbnail?id=${id}&sz=w600`, `https://drive.google.com/uc?export=view&id=${id}`]
    : [url];
  for (const candidate of candidates) {
    try {
      const res = await net.fetch(candidate);
      const type = (res.headers.get('content-type') || '').split(';')[0];
      if (res.ok && type.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer());
        return `data:${type};base64,${buf.toString('base64')}`;
      }
    } catch { /* try the next candidate */ }
  }
  throw new Error('Could not load an image from this link. Check your internet connection and make sure the file is shared as "Anyone with the link".');
}

handle('setLogo', async url => {
  url = String(url || '').trim();
  if (!url) {
    database.setSettings({ logoUrl: '', logoData: '' });
    return { logoUrl: '', logoData: '' };
  }
  const logoData = await downloadLogo(url);
  database.setSettings({ logoUrl: url, logoData });
  return { logoUrl: url, logoData };
});

/* ---------- Excel export of admissions ---------- */
handle('exportStudents', async (section, ids) => {
  const rows = database.api.getExportRows(section, ids);
  if (!rows.length) throw new Error('There are no students to export yet.');
  const res = await dialog.showSaveDialog(win, {
    title: 'Export admissions',
    defaultPath: `${section}-admissions.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  });
  if (res.canceled) return null;
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 16) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Admissions');
  await fsp.writeFile(res.filePath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return res.filePath;
});

/* ---------- Student documents: upload, view and save images, PDFs and scans (administrator only) ---------- */
handle('uploadStudentDocs', async studentId => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose images, PDFs or scanned files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images, PDF and scans', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'pdf'] }]
  });
  if (res.canceled) return null;
  let added = 0;
  const errors = [];
  for (const f of res.filePaths) {
    try { await database.addDocument(Number(studentId), f); added++; } catch (e) { errors.push(e.message); }
  }
  return { added, errors };
});

/** Pictures open inside the app; PDFs and TIFF scans open in the computer's own viewer. */
handle('viewStudentDocument', async id => {
  const d = await database.getDocumentFile(Number(id));
  if (d.mime.startsWith('image/') && d.mime !== 'image/tiff') return { kind: 'image', name: d.name, data: `data:${d.mime};base64,${(await fsp.readFile(d.file)).toString('base64')}` };
  const err = await shell.openPath(d.file);
  if (err) throw new Error(`Could not open the file: ${err}`);
  return { kind: 'opened', name: d.name };
});

handle('saveStudentDocument', async id => {
  const d = await database.getDocumentFile(Number(id));
  const res = await dialog.showSaveDialog(win, { title: 'Save a copy', defaultPath: d.name });
  if (res.canceled) return null;
  await fsp.copyFile(d.file, res.filePath);
  return res.filePath;
});

/* ---------- Bulk import: read a spreadsheet, or save a blank template (administrator only) ---------- */
handle('importFile', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a spreadsheet to import',
    properties: ['openFile'],
    filters: [{ name: 'Excel or CSV', extensions: ['xlsx', 'xls', 'csv'] }]
  });
  if (res.canceled) return null;
  const ws = (wb => wb.Sheets[wb.SheetNames[0]])(XLSX.read(await fsp.readFile(res.filePaths[0]), { cellDates: true }));
  for (const addr of Object.keys(ws)) {                       // dates always come out as YYYY-MM-DD, whatever the cell format was
    const c = ws[addr];
    if (c && c.t === 'd') { c.z = 'yyyy-mm-dd'; delete c.w; }
  }
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }).slice(0, 5000);
  if (!rows.length) throw new Error('That file has no data rows. The first row must contain the column names.');
  return { name: path.basename(res.filePaths[0]), rows };
});

handle('importTemplate', async (kind, section) => {
  const t = database.api.getImportTemplate(kind, section);
  const res = await dialog.showSaveDialog(win, {
    title: 'Save import template',
    defaultPath: `${kind === 'teachers' ? 'teachers' : 'students'}-import-template.xlsx`,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  });
  if (res.canceled) return null;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([t.headers, t.sample]);
  ws['!cols'] = t.headers.map(h => ({ wch: Math.max(h.length + 2, 16) }));
  XLSX.utils.book_append_sheet(wb, ws, kind === 'teachers' ? 'Teachers' : 'Students');
  if (t.classes.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Stream', 'Class'], ...t.classes]), 'Valid classes');
  await fsp.writeFile(res.filePath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return res.filePath;
});

/* ---------- Backup, restore and folder shortcuts ---------- */
/** Student files are saved next to a backup in a folder named like it: backup.sqlite -> backup_documents */
const backupDocsFolder = file => file.replace(/\.(sqlite3?|db)$/i, '') + '_documents';

handle('backupDb', async () => {
  await database.flushAsync();
  const file = database.getFilePath();
  if (!file) throw new Error('The database is not open yet.');
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const res = await dialog.showSaveDialog(win, {
    title: 'Back up database (choose your USB or external drive)',
    defaultPath: `jamia_noor_ul_anwar_backup_${stamp}.sqlite`,
    filters: [{ name: 'SQLite database', extensions: ['sqlite'] }]
  });
  if (res.canceled) return null;
  await fsp.copyFile(file, res.filePath);
  const docs = database.docsDir();
  if (docs && await exists(docs)) await fsp.cp(docs, backupDocsFolder(res.filePath), { recursive: true });   // student files: keep this folder next to the backup
  return res.filePath;
});

handle('restoreDb', async mode => {
  if (!['replace', 'merge'].includes(mode)) throw new Error('Unknown restore mode.');
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a database backup',
    properties: ['openFile'],
    filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db', 'sqlite3'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (res.canceled) return null;
  if (path.resolve(res.filePaths[0]) === path.resolve(database.getFilePath() || '')) throw new Error('That is the database currently in use. Choose a backup copy instead.');
  const out = await database.restore(await fsp.readFile(res.filePaths[0]), mode);
  const src = backupDocsFolder(res.filePaths[0]);
  if (mode === 'replace' && await exists(src)) await fsp.cp(src, database.docsDir(), { recursive: true });   // bring the student files back too
  return out;
});

handle('showDbFolder', () => {
  const file = database.getFilePath();
  if (file) shell.showItemInFolder(file);
  return true;
});

/* ---------- Save the result card as JPG ---------- */
handle('saveImage', async (dataUrl, fileName) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Save result card',
    defaultPath: fileName,
    filters: [{ name: 'JPEG Image', extensions: ['jpg'] }]
  });
  if (res.canceled) return null;
  await fsp.writeFile(res.filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return res.filePath;
}, ['admin', 'teacher']);

/* ---------- Print and save-as-PDF (the UI marks what to print before calling these) ---------- */
/** `landscape` is used for the class result sheets (A4 landscape); cards and receipts are portrait. */
const NO_MARGINS = { marginType: 'none' };
handle('printPage', landscape => new Promise(resolve => {
  win.webContents.print({ printBackground: true, landscape: !!landscape, margins: NO_MARGINS }, success => resolve(success));
}), ['admin', 'teacher']);

handle('savePdf', async (fileName, landscape) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Save as PDF',
    defaultPath: fileName,
    filters: [{ name: 'PDF document', extensions: ['pdf'] }]
  });
  if (res.canceled) return null;
  const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape: !!landscape, margins: NO_MARGINS });
  await fsp.writeFile(res.filePath, pdf);
  return res.filePath;
}, ['admin', 'teacher']);

/** Several page images at once (class result sheets): the user picks a folder. */
handle('saveImages', async files => {
  if (!Array.isArray(files) || !files.length) throw new Error('There is nothing to save.');
  const res = await dialog.showOpenDialog(win, { title: 'Choose a folder for the page images', properties: ['openDirectory', 'createDirectory'] });
  if (res.canceled) return null;
  for (const f of files) {
    const name = String(f.name).replace(/[^\w.-]+/g, '_');
    await fsp.writeFile(path.join(res.filePaths[0], name), Buffer.from(String(f.dataUrl).split(',')[1], 'base64'));
  }
  return res.filePaths[0];
}, ['admin', 'teacher']);

/* ---------- Window + lifecycle ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1150,
    minHeight: 700,
    backgroundColor: '#e3f1e8',
    title: 'Jamia Noor-ul-Anwar',
    show: false,
    icon: path.join(__dirname, 'icon.png'),   // official Jamia logo (window and taskbar)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const { dbDir } = await readConfig();
  if (dbDir) {
    try { await database.open(dbDir); }
    catch (err) { console.error('Could not open saved database folder:', err.message); } // UI will ask for a new folder
  }
  createWindow();
});

app.on('before-quit', () => { try { database.flush(); } catch (err) { console.error(err); } });
app.on('window-all-closed', () => app.quit());
