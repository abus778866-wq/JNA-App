/* ==========================================================================
   database.js — Local SQLite storage for Jamia Noor-ul-Anwar

   Uses sql.js (SQLite compiled to WebAssembly) so `npm install` works on any
   Windows PC without C++ build tools. The database lives in memory and is
   written to <chosen folder>/jamia_noor_ul_anwar.sqlite after every change.

   Every function inside `api` is callable from the UI through IPC.
   ========================================================================== */
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const FILE_NAME = 'jamia_noor_ul_anwar.sqlite';
const SECTIONS = ['boys', 'girls'];
const STREAMS = ['Quran', 'Dars-e-Nizami', 'School', 'Other'];
const TEACHER_BACKDATE_DAYS = 7;   // teachers may save attendance for today and up to this many days back
const STATUSES = ['Active', 'Inactive', 'Left', 'Passed out'];
const FIELD_TYPES = ['text', 'number', 'date', 'select', 'textarea'];   // types an admin can pick for custom fields
const LOCKED_FIELDS = ['roll_no', 'name', 'class_id'];                  // always shown: a student cannot be saved without them
/** The standard admission form. Each section gets its own copy that can be reordered, hidden and renamed. */
const BUILTIN_FIELDS = [
  { builtin: 'roll_no', label: 'Roll / registration number', type: 'text', required: 1 },
  { builtin: 'name', label: 'Student name', type: 'text', required: 1 },
  { builtin: 'photo', label: 'Student photo', type: 'photo' },
  { builtin: 'father_name', label: "Father's name", type: 'text' },
  { builtin: 'gender', label: 'Gender', type: 'select', options: 'Male\nFemale' },
  { builtin: 'admission_date', label: 'Admission date', type: 'date' },
  { builtin: 'session', label: 'Academic session', type: 'session', before: 'stream' },
  { builtin: 'stream', label: 'Stream', type: 'stream' },
  { builtin: 'class_id', label: 'Class', type: 'class', required: 1 },
  { builtin: 'father_phone', label: "Father's phone number", type: 'text' },
  { builtin: 'emergency_contact', label: 'Emergency contact', type: 'text' },
  { builtin: 'province', label: 'Province', type: 'province', before: 'address' },
  { builtin: 'city', label: 'City', type: 'city', before: 'address' },
  { builtin: 'district', label: 'District', type: 'district', before: 'address' },
  { builtin: 'tehsil', label: 'Tehsil', type: 'tehsil', before: 'address' },
  { builtin: 'address', label: 'Address', type: 'text' },
  { builtin: 'fee', label: 'Monthly fee', type: 'number' },
  { builtin: 'opening_dues', label: 'Previous dues', type: 'number' }
];
/** Month (YYYY-MM) a student was admitted; students count from this month onwards. */
const ADMIT_MONTH = "SUBSTR(COALESCE(NULLIF(s.admission_date, ''), s.admitted_on, '0000'), 1, 7)";
/** The official Jamia logo shipped with the app (logo.png), used until another logo is set in Settings. */
let logoCache = null;
function officialLogo() {
  if (logoCache === null) {
    try { logoCache = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'logo.png')).toString('base64'); } catch { logoCache = ''; }
  }
  return logoCache;
}
const STREAM_ORDER = "CASE c.stream WHEN 'Quran' THEN 1 WHEN 'Dars-e-Nizami' THEN 2 WHEN 'School' THEN 3 ELSE 4 END";

let SQL = null;        // sql.js module
let db = null;         // active database
let filePath = null;   // full path of the .sqlite file
let saveTimer = null;  // debounce timer for disk writes

/* -------------------------------------------------------------------------
   Date helpers (local computer time)
   ------------------------------------------------------------------------- */
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowStamp = () => { const d = new Date(); return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const monthOf = v => (/^\d{4}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 7) : '');
const nextMonth = m => { let [y, mo] = m.split('-').map(Number); mo++; if (mo > 12) { mo = 1; y++; } return `${y}-${pad(mo)}`; };
const round2 = n => Math.round(n * 100) / 100;
const prevMonth = m => { let [y, mo] = m.split('-').map(Number); mo--; if (mo < 1) { mo = 12; y--; } return `${y}-${pad(mo)}`; };
/** Days in a month that are neither Fridays nor custom holidays (up to today for the current month). */
function workingDaysIn(month, holidays, endDate) {
  const [y, mo] = month.split('-').map(Number);
  if (endDate && String(endDate).slice(0, 7) < month) return 0;                       // after the exit month: nothing counts
  let last = month === today().slice(0, 7) ? new Date().getDate() : new Date(y, mo, 0).getDate();
  if (endDate && String(endDate).slice(0, 7) === month) last = Math.min(last, Number(String(endDate).slice(8, 10)));   // the exit month counts up to the exit date
  let n = 0;
  for (let d = 1; d <= last; d++) if (new Date(y, mo - 1, d).getDay() !== 5 && !(holidays && holidays.has(`${month}-${pad(d)}`))) n++;
  return n;
}
const validImage = v => typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v) && v.length < 3_000_000;

/* -------------------------------------------------------------------------
   Low-level helpers (the "In" versions work on any sql.js database handle)
   ------------------------------------------------------------------------- */
const clean = params => params.map(v => (v === undefined ? null : v));

function allIn(d, sql, params = []) {
  const stmt = d.prepare(sql);
  try {
    stmt.bind(clean(params));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}
const all = (sql, params) => allIn(db, sql, params);
const get = (sql, params) => all(sql, params)[0] || null;
const exec = (sql, params = []) => db.run(sql, clean(params));
const lastId = () => db.exec('SELECT last_insert_rowid()')[0].values[0][0];

function run(sql, params = []) {
  exec(sql, params);
  const id = lastId();
  scheduleSave();
  return id;
}

/** Runs several statements atomically. */
function transaction(fn) {
  db.run('BEGIN');
  try {
    fn();
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
  scheduleSave();
}

/** Writes the database to disk now (temp file + rename = safe against crashes). */
function flush() {
  if (!db || !filePath) return;
  clearTimeout(saveTimer);
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, Buffer.from(db.export()));
  fs.renameSync(tmp, filePath);
}
/** Non-blocking save: the database is snapshotted in memory, then written on a queue (temp file + rename).
 *  Writes never overlap and the window is never blocked by disk I/O. flush() above stays for app exit only. */
let writeChain = Promise.resolve();
function flushAsync() {
  if (!db || !filePath) return Promise.resolve();
  clearTimeout(saveTimer);
  const target = filePath, data = Buffer.from(db.export());
  writeChain = writeChain.catch(() => {}).then(async () => {
    const tmp = target + '.tmp';
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, target);
  });
  return writeChain;
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { flushAsync().catch(err => console.error('Could not save database:', err)); }, 500);
}
const exists = p => fsp.access(p).then(() => true, () => false);

/* -------------------------------------------------------------------------
   Opening / relocating the database
   ------------------------------------------------------------------------- */
async function ensureSql() {
  if (!SQL) {
    const wasmDir = path.dirname(require.resolve('sql.js'));
    SQL = await initSqlJs({ locateFile: f => path.join(wasmDir, f) });
  }
}

async function open(dir) {
  await ensureSql();
  await fsp.mkdir(dir, { recursive: true });
  const target = path.join(dir, FILE_NAME);

  let next;
  let migrated = false;
  if (await exists(target)) next = new SQL.Database(await fsp.readFile(target)); // use existing data
  else if (db) { next = db; migrated = true; }                                  // copy current data to the new folder
  else next = new SQL.Database();                                               // brand new database

  const previous = { db, filePath };
  db = next;
  filePath = target;
  try {
    migrate(db);
    seed();
    await flushAsync();
  } catch (err) {               // e.g. folder is read-only: roll back to the old location
    db = previous.db;
    filePath = previous.filePath;
    throw new Error('Could not write to that folder: ' + err.message);
  }
  if (previous.db && previous.db !== next) previous.db.close();
  return { migrated, file: target };
}
const isOpen = () => !!db;
const getFilePath = () => filePath;

/* -------------------------------------------------------------------------
   Schema (also upgrades databases created by older versions of the app)
   ------------------------------------------------------------------------- */
const hasColumn = (d, table, col) => allIn(d, `PRAGMA table_info(${table})`).some(c => c.name === col);
const addColumn = (d, table, col, ddl) => { if (!hasColumn(d, table, col)) d.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`); };

function migrate(d) {
  d.run(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL,
      stream TEXT NOT NULL DEFAULT 'School',   -- Quran | Dars-e-Nizami | School | Other
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,   -- promotion order inside a stream
      class_teacher_id INTEGER                 -- teacher whose signature appears on result cards
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL,
      roll_no TEXT NOT NULL,
      name TEXT NOT NULL,
      father_name TEXT,
      phone TEXT,
      father_phone TEXT,
      cnic TEXT,
      address TEXT,
      dob TEXT,
      gender TEXT,
      admission_date TEXT,
      emergency_contact TEXT,
      province TEXT,
      city TEXT,
      district TEXT,
      tehsil TEXT,
      class_id INTEGER,
      fee REAL NOT NULL DEFAULT 0,             -- monthly fee
      opening_dues REAL NOT NULL DEFAULT 0,    -- dues carried forward from before the system
      status TEXT NOT NULL DEFAULT 'Active',
      status_date TEXT,                        -- when the student stopped being Active
      extra TEXT,                              -- JSON of custom admission fields
      admitted_on TEXT
    );

    CREATE TABLE IF NOT EXISTS custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      sort_order INTEGER NOT NULL DEFAULT 0,
      builtin TEXT,                            -- set for standard fields (column name), NULL for custom ones
      options TEXT,                            -- choices for Select fields, one per line
      visible INTEGER NOT NULL DEFAULT 1,
      required INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      qualification TEXT,
      subjects TEXT,
      joined_on TEXT
    );

    CREATE TABLE IF NOT EXISTS teacher_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      subject TEXT NOT NULL
    );

    -- One row per student per month. "due" is the fee at the time it was first recorded.
    CREATE TABLE IF NOT EXISTS fee_payments (
      student_id INTEGER NOT NULL,
      month TEXT NOT NULL,                     -- YYYY-MM
      due REAL NOT NULL,
      paid REAL NOT NULL DEFAULT 0,
      paid_on TEXT,
      PRIMARY KEY (student_id, month)
    );

    CREATE TABLE IF NOT EXISTS fines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      paid REAL NOT NULL DEFAULT 0
    );

    -- Only "present" days are stored; no row means absent.
    CREATE TABLE IF NOT EXISTS attendance (
      section TEXT NOT NULL,
      kind TEXT NOT NULL,                      -- 'student' | 'teacher'
      person_id INTEGER NOT NULL,
      date TEXT NOT NULL,                      -- YYYY-MM-DD
      marked_at TEXT,                          -- system-clock timestamp
      marked_by TEXT,                          -- 'admin' | 'teacher'
      PRIMARY KEY (kind, person_id, date)
    );

    -- Photos and signatures live in their own tables so student lists stay light
    CREATE TABLE IF NOT EXISTS student_photos (student_id INTEGER PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS teacher_signatures (teacher_id INTEGER PRIMARY KEY, data TEXT NOT NULL);

    -- A class + day saved by a teacher is locked for teachers; the admin can still edit or unlock it
    CREATE TABLE IF NOT EXISTS attendance_locks (
      section TEXT NOT NULL,
      class_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      locked_at TEXT,
      PRIMARY KEY (class_id, date)
    );

    -- Subjects (with total marks) assigned to each class; they pre-fill mark sheets and result cards
    CREATE TABLE IF NOT EXISTS class_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 100,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- Exam names. No stream and no class = every class; a stream or a class narrows it.
    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL,
      name TEXT NOT NULL,
      stream TEXT,
      class_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS marks (
      student_id INTEGER NOT NULL,
      exam TEXT NOT NULL,                      -- 'Half-Yearly' | 'Annual'
      year TEXT NOT NULL,
      subject TEXT NOT NULL,
      obtained REAL NOT NULL,
      total REAL NOT NULL,
      PRIMARY KEY (student_id, exam, year, subject)
    );
  `);

  // Upgrades from the first version of the app
  addColumn(d, 'classes', 'stream', "TEXT NOT NULL DEFAULT 'School'");
  addColumn(d, 'classes', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  d.run('UPDATE classes SET sort_order = id WHERE sort_order = 0');
  for (const [col, ddl] of [
    ['father_phone', 'TEXT'], ['cnic', 'TEXT'], ['dob', 'TEXT'], ['gender', 'TEXT'], ['admission_date', 'TEXT'],
    ['emergency_contact', 'TEXT'], ['opening_dues', 'REAL NOT NULL DEFAULT 0'], ['status', "TEXT NOT NULL DEFAULT 'Active'"],
    ['status_date', 'TEXT'], ['extra', 'TEXT'], ['province', 'TEXT'], ['city', 'TEXT'], ['district', 'TEXT'], ['tehsil', 'TEXT']
  ]) addColumn(d, 'students', col, ddl);
  addColumn(d, 'attendance', 'marked_at', 'TEXT');
  addColumn(d, 'attendance', 'marked_by', 'TEXT');
  addColumn(d, 'classes', 'class_teacher_id', 'INTEGER');
  addColumn(d, 'custom_fields', 'builtin', 'TEXT');
  addColumn(d, 'custom_fields', 'options', 'TEXT');
  addColumn(d, 'custom_fields', 'visible', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(d, 'custom_fields', 'required', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(d, 'teachers', 'username', 'TEXT');
  addColumn(d, 'teachers', 'password_hash', 'TEXT');
  addColumn(d, 'teachers', 'salary', 'REAL NOT NULL DEFAULT 0');
  addColumn(d, 'teachers', 'status', "TEXT NOT NULL DEFAULT 'Active'");
  addColumn(d, 'teachers', 'left_on', 'TEXT');
  addColumn(d, 'students', 'session', 'TEXT');
  addColumn(d, 'students', 'person_id', 'INTEGER');          // profiles sharing a person_id are the same physical person (linked by the admin)
  addColumn(d, 'custom_fields', 'mask', 'TEXT');             // input template for custom text fields, e.g. 0000-0000000
  d.run(`
    CREATE TABLE IF NOT EXISTS student_documents (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, original_name TEXT NOT NULL, stored_name TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL, size INTEGER NOT NULL, uploaded_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (name TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS student_status_log (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, status TEXT NOT NULL, date TEXT NOT NULL, note TEXT);
    CREATE TABLE IF NOT EXISTS teacher_history (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL, event TEXT NOT NULL, date TEXT NOT NULL, note TEXT);
    INSERT INTO teacher_history (teacher_id, event, date, note) SELECT id, 'Joined', COALESCE(NULLIF(joined_on, ''), date('now')), '' FROM teachers WHERE id NOT IN (SELECT teacher_id FROM teacher_history);
    INSERT INTO student_status_log (student_id, status, date, note) SELECT id, status, COALESCE(NULLIF(status_date, ''), date('now')), '' FROM students
      WHERE status <> 'Active' AND id NOT IN (SELECT student_id FROM student_status_log);
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS teacher_salaries (teacher_id INTEGER NOT NULL, month TEXT NOT NULL, base REAL NOT NULL DEFAULT 0, manual_deduction REAL,
      status TEXT NOT NULL DEFAULT 'Unpaid', paid_on TEXT, remarks TEXT, PRIMARY KEY (teacher_id, month));
    CREATE TABLE IF NOT EXISTS class_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, from_class_id INTEGER, to_class_id INTEGER, date TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS result_remarks (student_id INTEGER NOT NULL, exam TEXT NOT NULL, year TEXT NOT NULL, remark TEXT, PRIMARY KEY (student_id, exam, year));
    CREATE TABLE IF NOT EXISTS hostel_residents (id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, student_id INTEGER, name TEXT NOT NULL, guardian TEXT, phone TEXT,
      family TEXT, room TEXT, fee REAL NOT NULL DEFAULT 0, joined_on TEXT, status TEXT NOT NULL DEFAULT 'Active');
    CREATE TABLE IF NOT EXISTS hostel_fees (resident_id INTEGER NOT NULL, month TEXT NOT NULL, due REAL NOT NULL, paid REAL NOT NULL DEFAULT 0, paid_on TEXT, PRIMARY KEY (resident_id, month));
    CREATE TABLE IF NOT EXISTS hostel_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, date TEXT NOT NULL, category TEXT, amount REAL NOT NULL, note TEXT);
    CREATE TABLE IF NOT EXISTS hostel_leaves (id INTEGER PRIMARY KEY AUTOINCREMENT, resident_id INTEGER NOT NULL, from_date TEXT, to_date TEXT, reason TEXT,
      status TEXT NOT NULL DEFAULT 'Pending', photo TEXT);
    CREATE TABLE IF NOT EXISTS student_funds (id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, student_id INTEGER NOT NULL, date TEXT NOT NULL,
      type TEXT NOT NULL, amount REAL NOT NULL, note TEXT);
  `);
  addColumn(d, 'attendance', 'status', "TEXT NOT NULL DEFAULT 'P'");          // P = present, L = on leave (no row = absent)
  addColumn(d, 'hostel_residents', 'left_on', 'TEXT');
  addColumn(d, 'sessions', 'kind', "TEXT NOT NULL DEFAULT 'year'");          // 'year' = academic year, 'course' = multi-year course (Dars-e-Nizami)
  addColumn(d, 'sessions', 'stream', 'TEXT');                                // optional: the session belongs to one stream
  addColumn(d, 'students', 'session_year', 'INTEGER NOT NULL DEFAULT 0');    // session years already completed (and promoted for)
  addColumn(d, 'hostel_leaves', 'returned_on', 'TEXT');
  d.run(`
    CREATE TABLE IF NOT EXISTS hostel_contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, resident_id INTEGER NOT NULL, relation TEXT NOT NULL, name TEXT NOT NULL, phone TEXT);
    CREATE TABLE IF NOT EXISTS hostel_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, resident_id INTEGER NOT NULL, amount REAL NOT NULL, paid_on TEXT NOT NULL, note TEXT);
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS holidays (section TEXT NOT NULL, date TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (section, date));
    CREATE TABLE IF NOT EXISTS fee_history (kind TEXT NOT NULL, ref_id INTEGER NOT NULL, effective_month TEXT NOT NULL, fee REAL NOT NULL, PRIMARY KEY (kind, ref_id, effective_month));
    -- Timetable: each schedule (e.g. normal days, Thursday, Saturday) has its own periods and timings; a cell = subject + teacher for one class in one period
    CREATE TABLE IF NOT EXISTS timetable_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, name TEXT NOT NULL, days TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS timetable_periods (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL, label TEXT NOT NULL, start_time TEXT NOT NULL DEFAULT '', end_time TEXT NOT NULL DEFAULT '', is_break INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS timetable_cells (schedule_id INTEGER NOT NULL, class_id INTEGER NOT NULL, period_id INTEGER NOT NULL, subject TEXT NOT NULL DEFAULT '', teacher TEXT NOT NULL DEFAULT '', PRIMARY KEY (period_id, class_id));
    -- Student sequence per class (attendance sheets) and its lock
    CREATE TABLE IF NOT EXISTS class_student_order (class_id INTEGER NOT NULL, student_id INTEGER NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (class_id, student_id));
    CREATE TABLE IF NOT EXISTS class_order_locks (class_id INTEGER PRIMARY KEY, locked INTEGER NOT NULL DEFAULT 0, locked_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_att_person ON attendance (kind, person_id, date);
    CREATE INDEX IF NOT EXISTS idx_students_class ON students (class_id);
    INSERT INTO fee_history (kind, ref_id, effective_month, fee) SELECT 'student', id, '0000-00', fee FROM students WHERE id NOT IN (SELECT ref_id FROM fee_history WHERE kind = 'student');
    INSERT INTO fee_history (kind, ref_id, effective_month, fee) SELECT 'hostel', id, '0000-00', fee FROM hostel_residents WHERE id NOT IN (SELECT ref_id FROM fee_history WHERE kind = 'hostel');
  `);
  if (hasColumn(d, 'students', 'fines')) {
    d.run("INSERT INTO fines (student_id, date, amount, reason, paid) SELECT id, COALESCE(admitted_on, date('now')), fines, 'Carried over', 0 FROM students WHERE fines > 0");
    try { d.run('ALTER TABLE students DROP COLUMN fines'); } catch { /* harmless */ }
  }
  if (hasColumn(d, 'students', 'paid')) { try { d.run('ALTER TABLE students DROP COLUMN paid'); } catch { /* harmless */ } }
  d.run("UPDATE students SET admission_date = admitted_on WHERE (admission_date IS NULL OR admission_date = '') AND admitted_on IS NOT NULL");
}

/** Makes sure a section has all standard admission fields (also upgrades older databases). */
function ensureFormFields(section) {
  // Never keep two copies of the same standard field (the oldest wins)
  exec(`DELETE FROM custom_fields WHERE section = ? AND builtin IS NOT NULL
        AND id NOT IN (SELECT MIN(id) FROM custom_fields WHERE section = ? AND builtin IS NOT NULL GROUP BY builtin)`, [section, section]);
  const have = new Set(all('SELECT builtin FROM custom_fields WHERE section = ? AND builtin IS NOT NULL', [section]).map(r => r.builtin));
  if (have.size < BUILTIN_FIELDS.length) {
    const fresh = have.size === 0;
    // Custom fields that existed before go after the standard ones; standard fields added later go to the end
    if (fresh) exec('UPDATE custom_fields SET sort_order = sort_order + 100 WHERE section = ?', [section]);
    let ord = fresh ? 0 : get('SELECT COALESCE(MAX(sort_order), 0) AS n FROM custom_fields WHERE section = ?', [section]).n;
    BUILTIN_FIELDS.forEach((f, i) => {
      if (have.has(f.builtin)) return;
      let order = fresh ? i + 1 : null;
      if (order === null && f.before && have.has(f.before)) {   // slot it in just ahead of its neighbour
        order = get('SELECT sort_order FROM custom_fields WHERE section = ? AND builtin = ?', [section, f.before]).sort_order - 0.5 + i * 0.001;
      }
      if (order === null) order = ++ord;
      exec('INSERT INTO custom_fields (section, key, label, type, sort_order, builtin, options, visible, required) VALUES (?,?,?,?,?,?,?,1,?)',
        [section, 'b_' + f.builtin, f.label, f.type, order, f.builtin, f.options ?? null, f.required ? 1 : 0]);
    });
  }
  // Custom fields that repeat a standard label, or each other, are hidden so nothing shows twice
  exec(`UPDATE custom_fields SET visible = 0 WHERE section = ? AND builtin IS NULL AND visible = 1 AND
        (LOWER(TRIM(label)) IN (SELECT LOWER(TRIM(label)) FROM custom_fields WHERE section = ? AND builtin IS NOT NULL)
         OR id NOT IN (SELECT MIN(id) FROM custom_fields WHERE section = ? AND builtin IS NULL GROUP BY LOWER(TRIM(label))))`, [section, section, section]);
}

/** Every section starts with Half-Yearly and Annual, plus any exam names already used in saved marks. */
function ensureExams(section) {
  if (get('SELECT COUNT(*) AS n FROM exams WHERE section = ?', [section]).n > 0) return;
  const names = new Set(['Half-Yearly', 'Annual']);
  for (const r of all('SELECT DISTINCT m.exam FROM marks m JOIN students s ON s.id = m.student_id WHERE s.section = ?', [section])) names.add(r.exam);
  [...names].forEach((n, i) => exec('INSERT INTO exams (section, name, stream, class_id, sort_order) VALUES (?,?,NULL,NULL,?)', [section, n, i + 1]));
}

const DEFAULT_GRADING = { 'A+': 80, A: 70, B: 60, C: 50, D: 40, pass: 40 };
const GRADE_KEYS = ['A+', 'A', 'B', 'C', 'D'];
const DEFAULT_LABELS = { 'A+': 'A+', A: 'A', B: 'B', C: 'C', D: 'D', F: 'F' };   // display names, editable (e.g. ممتاز)
function readGrading() {
  let g = {};
  try { g = JSON.parse(getSetting('grading') || '{}'); } catch { /* use defaults */ }
  return { all: { ...DEFAULT_GRADING, ...(g.all || {}) }, byStream: g.byStream || {}, labels: { ...DEFAULT_LABELS, ...(g.labels || {}) }, scales: g.scales || {} };
}
function checkGrading(r) {
  const n = GRADE_KEYS.map(k => Number(r[k]));
  if (n.some(v => !Number.isFinite(v) || v < 0 || v > 100)) throw new Error('Every cut-off must be a number between 0 and 100.');
  for (let i = 1; i < n.length; i++) if (n[i] >= n[i - 1]) throw new Error('Cut-offs must go down from A+ to D (for example 80, 70, 60, 50, 40).');
  const pass = Number(r.pass);
  if (!Number.isFinite(pass) || pass < 0 || pass > 100) throw new Error('The pass mark must be between 0 and 100.');
  return { 'A+': n[0], A: n[1], B: n[2], C: n[3], D: n[4], pass };
}

const LAYOUT_KEYS = ['father_name', 'roll_no', 'class', 'stream'];
function readLayout() {
  let l = {};
  try { l = JSON.parse(getSetting('resultLayout') || '{}'); } catch { /* use defaults */ }
  const saved = Array.isArray(l.fields) ? l.fields.filter(f => LAYOUT_KEYS.includes(f.key)) : [];
  const fields = [...saved.map(f => ({ key: f.key, visible: f.visible !== false })),
    ...LAYOUT_KEYS.filter(k => !saved.some(f => f.key === k)).map(key => ({ key, visible: true }))];
  return { fields, subtitle: l.subtitle !== false, gregorian: l.gregorian !== false, hijri: l.hijri !== false };
}

/** First run: default login, promotion defaults and a starter list of classes (all editable). */
function seed() {
  if (!getSetting('passwordHash')) setSetting('passwordHash', hashPassword('admin123'));
  SECTIONS.forEach(ensureFormFields);
  SECTIONS.forEach(ensureExams);
  if (!getSetting('teacherPasswordHash')) setSetting('teacherPasswordHash', hashPassword('teach123'));
  if (getSetting('promotionDate') === null) { setSetting('promotionDate', '04-01'); setSetting('promotionEnabled', '0'); }
  if (get('SELECT COUNT(*) AS n FROM sessions').n === 0) {   // this year's and next year's session (April to March); edit them in Settings
    const y = new Date().getFullYear(), a = new Date().getMonth() + 1 >= 4 ? y : y - 1;
    for (const k of [a, a + 1]) exec('INSERT INTO sessions (name, start_date, end_date) VALUES (?,?,?)', [`${k}-${k + 1}`, `${k}-04-01`, `${k + 1}-03-31`]);
  }
  if (get('SELECT COUNT(*) AS n FROM classes').n === 0) {
    const defaults = {
      'Quran': ['Nazra', 'Hifz'],
      'Dars-e-Nizami': ['Year 1', 'Year 2', 'Year 3'],
      'School': ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5']
    };
    for (const section of SECTIONS) {
      for (const [stream, names] of Object.entries(defaults)) {
        names.forEach((name, i) => exec('INSERT INTO classes (section, stream, name, sort_order) VALUES (?,?,?,?)', [section, stream, name, i + 1]));
      }
    }
  }
}

/* -------------------------------------------------------------------------
   Settings + password hashing
   ------------------------------------------------------------------------- */
function getSetting(key) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
}
function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}
function setSettings(obj) {
  for (const [k, v] of Object.entries(obj)) setSetting(k, v);
}

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  const test = crypto.scryptSync(pw, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash));
}

/* -------------------------------------------------------------------------
   Validation helpers
   ------------------------------------------------------------------------- */
function needSection(section) {
  if (!SECTIONS.includes(section)) throw new Error('Unknown section.');
}
function needText(value, label) {
  const v = String(value ?? '').trim();
  if (!v) throw new Error(`${label} is required.`);
  return v;
}
const str = v => String(v ?? '').trim();
const num = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
const parseJson = s => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
const groupBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }
  return m;
};

const STUDENT_SELECT = `
  SELECT s.*, c.name AS class_name, c.stream AS stream
  FROM students s LEFT JOIN classes c ON c.id = s.class_id`;
const STUDENT_ORDER = 'ORDER BY CAST(s.roll_no AS INTEGER), s.roll_no';

/** data URL = set, null/'' = remove. */
function setPhoto(id, data) {
  if (!data) { run('DELETE FROM student_photos WHERE student_id = ?', [id]); return; }
  if (!validImage(data)) throw new Error('The photo must be a PNG, JPG or WEBP image under 2 MB.');
  run('INSERT INTO student_photos (student_id, data) VALUES (?, ?) ON CONFLICT(student_id) DO UPDATE SET data = excluded.data', [id, data]);
}

/** Leaving / pass-out / inactive: `date` is the exact day entered by the admin (kept if none is given). Fees, attendance and working days stop after it. */
function setStatus(id, status, note, date) {
  if (!STATUSES.includes(status)) throw new Error('Unknown status.');
  const cur = get('SELECT status, status_date, admission_date, admitted_on FROM students WHERE id = ?', [id]);
  if (!cur) throw new Error('Student not found.');
  if (status === 'Active') {
    run('UPDATE students SET status = ?, status_date = NULL WHERE id = ?', [status, id]);
    if (cur.status !== status) logStudentStatus(id, status, today(), note);
    return;
  }
  const given = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) && !Number.isNaN(new Date(`${date}T00:00:00`).getTime()) ? String(date) : '';
  const exit = given || (cur.status !== 'Active' && cur.status_date) || today();
  const adm = String(cur.admission_date || cur.admitted_on || '').slice(0, 10);
  if (adm && exit < adm) throw new Error('The exit date cannot be before the admission date.');
  run('UPDATE students SET status = ?, status_date = ? WHERE id = ?', [status, exit, id]);
  if (cur.status !== status) logStudentStatus(id, status, exit, note);
  else if (cur.status_date !== exit) logStudentStatus(id, status, exit, 'Exit date changed');
}

/* -------------------------------------------------------------------------
   Fee ledger
   Fees accrue monthly from the admission month until the student stops being
   Active. Payments are stored per month. "Previous dues" (بقیہ فیس) = dues
   brought forward + unpaid amounts of all earlier months.
   ------------------------------------------------------------------------- */
function buildAccount(s, month, payRows, fineRows) {
  const byMonth = new Map(payRows.map(r => [r.month, r]));
  const hist = s.fee_hist || feeRows('student', s.id);
  const start = monthOf(s.admission_date) || monthOf(s.admitted_on) || month;
  const end = s.status !== 'Active' && s.status_date ? monthOf(s.status_date) : null;
  const last = end && end < month ? end : month;
  const months = [];
  for (let m = start, guard = 0; m <= last && guard < 720; m = nextMonth(m), guard++) {
    const r = byMonth.get(m);
    const due = r ? r.due : feeAt(hist, m, s.fee || 0);   // a month with no payment yet uses the fee that applied to that month
    const paid = r ? r.paid : 0;
    months.push({ month: m, due, paid, paid_on: r ? r.paid_on : null, owed: Math.max(round2(due - paid), 0) });
  }
  const current = months.find(m => m.month === month) || null;
  const opening = s.opening_dues || 0;
  const previous = round2(opening + months.filter(m => m.month < month).reduce((t, m) => t + m.owed, 0));
  const currentDue = current ? current.due : 0;
  const currentPaid = current ? current.paid : 0;
  const currentOwed = current ? current.owed : 0;
  const finesOut = round2(fineRows.filter(f => monthOf(f.date) <= month).reduce((t, f) => t + Math.max(f.amount - f.paid, 0), 0));
  const payable = round2(previous + currentOwed + finesOut);
  const status = payable <= 0 ? (currentDue > 0 ? 'Paid' : 'No dues') : (currentPaid > 0 ? 'Partial' : 'Unpaid');
  return { opening, months, previous, currentDue, currentPaid, currentOwed, finesOut, payable, status };
}

function feeSheet(section, month) {
  const students = all(`${STUDENT_SELECT} WHERE s.section = ? ${STUDENT_ORDER}`, [section]);
  const pays = groupBy(all('SELECT p.* FROM fee_payments p JOIN students s ON s.id = p.student_id WHERE s.section = ? ORDER BY p.month', [section]), 'student_id');
  const fines = groupBy(all('SELECT f.* FROM fines f JOIN students s ON s.id = f.student_id WHERE s.section = ?', [section]), 'student_id');
  const hists = groupBy(all("SELECT ref_id, effective_month, fee FROM fee_history WHERE kind = 'student' AND ref_id IN (SELECT id FROM students WHERE section = ?) ORDER BY effective_month", [section]), 'ref_id');
  return students.map(s => {
    s.fee_hist = hists.get(s.id) || [];
    const { months, opening, ...acct } = buildAccount(s, month, pays.get(s.id) || [], fines.get(s.id) || []);
    const nxt = s.fee_hist.find(r => r.effective_month > month);
    return { student_id: s.id, roll_no: s.roll_no, name: s.name, class_id: s.class_id, class_name: s.class_name, stream: s.stream, student_status: s.status, monthly_fee: feeAt(s.fee_hist, month, s.fee),
      next_fee: nxt ? nxt.fee : null, next_fee_from: nxt ? nxt.effective_month : null, ...acct };
  });
}

/* -------------------------------------------------------------------------
   Yearly promotion
   Students move to the next class (by order) inside their stream.
   Students in the last class of a stream become "Passed out".
   ------------------------------------------------------------------------- */
function classChains(section) {
  const classes = all('SELECT * FROM classes WHERE section = ? ORDER BY sort_order, id', [section]);
  const next = new Map();
  for (const stream of STREAMS) {
    const list = classes.filter(c => c.stream === stream);
    list.forEach((c, i) => next.set(c.id, list[i + 1] || null));
  }
  return { classes, next };
}
function promotionPreview() {
  const rows = [];
  for (const section of SECTIONS) {
    const { classes, next } = classChains(section);
    for (const c of classes) {
      const count = get("SELECT COUNT(*) AS n FROM students WHERE class_id = ? AND status = 'Active' AND COALESCE(session, '') = ''", [c.id]).n;
      const managed = get("SELECT COUNT(*) AS n FROM students WHERE class_id = ? AND status = 'Active' AND COALESCE(session, '') <> ''", [c.id]).n;   // moved on by their session instead
      const to = next.get(c.id);
      rows.push({ section, class_id: c.id, stream: c.stream, from: c.name, to: to ? to.name : null, count, managed });
    }
  }
  return rows;
}
/** `only` (optional) = list of class ids to promote; every other class stays where it is. */
function runPromotion(only) {
  const pick = Array.isArray(only) ? new Set(only.map(Number)) : null;
  let moved = 0, graduated = 0;
  const date = today();
  transaction(() => {
    for (const section of SECTIONS) {
      const { next } = classChains(section);
      const students = all("SELECT id, class_id FROM students WHERE section = ? AND status = 'Active' AND class_id IS NOT NULL AND COALESCE(session, '') = ''", [section]);   // students with a session are promoted by it
      for (const s of students) {
        if (!next.has(s.class_id) || (pick && !pick.has(s.class_id))) continue;
        const to = next.get(s.class_id);
        if (to) {
          exec('UPDATE students SET class_id = ? WHERE id = ?', [to.id, s.id]);
          exec('INSERT INTO class_transfers (student_id, from_class_id, to_class_id, date, note) VALUES (?,?,?,?,?)', [s.id, s.class_id, to.id, date, 'Yearly promotion']);
          moved++;
        } else {
          exec("UPDATE students SET status = 'Passed out', status_date = ? WHERE id = ?", [date, s.id]);
          exec('INSERT INTO student_status_log (student_id, status, date, note) VALUES (?,?,?,?)', [s.id, 'Passed out', date, 'Completed the last class']);
          graduated++;
        }
      }
    }
    setSetting('lastPromotionYear', date.slice(0, 4));
  });
  return { moved, graduated };
}

/* -------------------------------------------------------------------------
   Restore / merge a backup file
   ------------------------------------------------------------------------- */
function looksLikeJamia(d) {
  try {
    const names = allIn(d, "SELECT name FROM sqlite_master WHERE type = 'table'").map(r => r.name);
    return ['settings', 'classes', 'students'].every(n => names.includes(n));
  } catch { return false; }
}

/** Copies the live database next to itself before anything risky happens. */
async function safetyCopy() {
  await flushAsync();
  const d = new Date();
  const stamp = `${today()}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const dest = path.join(path.dirname(filePath), `jamia_noor_ul_anwar.before-restore-${stamp}.sqlite`);
  await fsp.copyFile(filePath, dest);
  return dest;
}

async function restore(buffer, mode) {
  if (!db) throw new Error('The database is not open yet.');
  let incoming;
  try { incoming = new SQL.Database(new Uint8Array(buffer)); } catch { throw new Error('That file is not a valid SQLite database.'); }
  let adopted = false;
  try {
    if (!looksLikeJamia(incoming)) throw new Error('That file is not a Jamia Noor-ul-Anwar database.');
    migrate(incoming);
    const safety = await safetyCopy();
    if (mode === 'replace') {
      const old = db;
      db = incoming;
      adopted = true;
      try { seed(); await flushAsync(); } catch (err) { db = old; adopted = false; throw err; }
      old.close();
      return { mode, safety };
    }
    const stats = mergeFrom(incoming);
    await flushAsync();
    return { mode, safety, ...stats };
  } finally {
    if (!adopted) incoming.close();
  }
}

/** Adds records from the backup that are missing here. Existing records are never overwritten. */
function mergeFrom(src) {
  const st = { classes: 0, students: 0, skipped: 0, teachers: 0 };
  const newClasses = new Map(), classMap = new Map(), studentMap = new Map(), teacherMap = new Map(), keyMap = new Map(), fresh = new Set();
  const remapExtra = json => {
    const out = {};
    for (const [k, v] of Object.entries(parseJson(json))) out[keyMap.get(k) || k] = v;
    return JSON.stringify(out);
  };

  transaction(() => {
    // Custom admission fields: matched by key, then by label
    for (const f of allIn(src, 'SELECT * FROM custom_fields ORDER BY sort_order, id')) {
      if (f.builtin) continue;   // standard fields already exist here
      const ex = get('SELECT key FROM custom_fields WHERE key = ?', [f.key]) ||
                 get('SELECT key FROM custom_fields WHERE section = ? AND LOWER(label) = LOWER(?)', [f.section, f.label]);
      if (ex) { keyMap.set(f.key, ex.key); continue; }
      const ord = get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM custom_fields WHERE section = ?', [f.section]).n;
      exec('INSERT INTO custom_fields (section, key, label, type, sort_order, options, visible, required) VALUES (?,?,?,?,?,?,?,?)',
        [f.section, f.key, f.label, f.type, ord, f.options, f.visible ?? 1, f.required ?? 0]);
      keyMap.set(f.key, f.key);
    }

    // Classes: matched by section + stream + name
    for (const c of allIn(src, 'SELECT * FROM classes ORDER BY sort_order, id')) {
      const ex = get('SELECT id FROM classes WHERE section = ? AND stream = ? AND LOWER(name) = LOWER(?)', [c.section, c.stream, c.name]);
      if (ex) { classMap.set(c.id, ex.id); continue; }
      const ord = get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM classes WHERE section = ? AND stream = ?', [c.section, c.stream]).n;
      exec('INSERT INTO classes (section, stream, name, sort_order) VALUES (?,?,?,?)', [c.section, c.stream, c.name, ord]);
      classMap.set(c.id, lastId());
      newClasses.set(c.id, c);
      st.classes++;
    }

    // Students: matched by section + roll number
    for (const s of allIn(src, 'SELECT * FROM students ORDER BY id')) {
      const ex = get('SELECT id FROM students WHERE section = ? AND roll_no = ?', [s.section, s.roll_no]);
      if (ex) { studentMap.set(s.id, ex.id); st.skipped++; continue; }
      exec(
        `INSERT INTO students (section, roll_no, name, father_name, phone, father_phone, cnic, address, dob, gender, admission_date,
           emergency_contact, province, city, district, tehsil, class_id, fee, opening_dues, status, status_date, extra, admitted_on)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [s.section, s.roll_no, s.name, s.father_name, s.phone, s.father_phone, s.cnic, s.address, s.dob, s.gender, s.admission_date,
         s.emergency_contact, s.province, s.city, s.district, s.tehsil, classMap.get(s.class_id) ?? null, s.fee || 0, s.opening_dues || 0, s.status || 'Active', s.status_date,
         remapExtra(s.extra), s.admitted_on]);
      const id = lastId();
      studentMap.set(s.id, id);
      fresh.add(id);
      st.students++;
    }

    // Fees, fines (new students only, they have no natural key), marks
    for (const p of allIn(src, 'SELECT * FROM fee_payments')) {
      const sid = studentMap.get(p.student_id);
      if (sid) exec('INSERT OR IGNORE INTO fee_payments (student_id, month, due, paid, paid_on) VALUES (?,?,?,?,?)', [sid, p.month, p.due, p.paid, p.paid_on]);
    }
    for (const f of allIn(src, 'SELECT * FROM fines')) {
      const sid = studentMap.get(f.student_id);
      if (sid && fresh.has(sid)) exec('INSERT INTO fines (student_id, date, amount, reason, paid) VALUES (?,?,?,?,?)', [sid, f.date, f.amount, f.reason, f.paid]);
    }
    for (const m of allIn(src, 'SELECT * FROM marks')) {
      const sid = studentMap.get(m.student_id);
      if (sid) exec('INSERT OR IGNORE INTO marks (student_id, exam, year, subject, obtained, total) VALUES (?,?,?,?,?,?)', [sid, m.exam, m.year, m.subject, m.obtained, m.total]);
    }

    // Teachers: matched by section + name + phone
    for (const t of allIn(src, 'SELECT * FROM teachers ORDER BY id')) {
      const ex = get("SELECT id FROM teachers WHERE section = ? AND LOWER(name) = LOWER(?) AND COALESCE(phone, '') = COALESCE(?, '')", [t.section, t.name, t.phone]);
      if (ex) { teacherMap.set(t.id, ex.id); continue; }
      exec('INSERT INTO teachers (section, name, phone, qualification, subjects, joined_on) VALUES (?,?,?,?,?,?)', [t.section, t.name, t.phone, t.qualification, t.subjects, t.joined_on]);
      teacherMap.set(t.id, lastId());
      st.teachers++;
    }
    for (const a of allIn(src, 'SELECT * FROM teacher_assignments')) {
      const tid = teacherMap.get(a.teacher_id), cid = classMap.get(a.class_id);
      if (tid && cid && !get('SELECT id FROM teacher_assignments WHERE teacher_id = ? AND class_id = ? AND LOWER(subject) = LOWER(?)', [tid, cid, a.subject])) {
        exec('INSERT INTO teacher_assignments (teacher_id, class_id, subject) VALUES (?,?,?)', [tid, cid, a.subject]);
      }
    }

    // Attendance and teacher locks
    for (const a of allIn(src, 'SELECT * FROM attendance')) {
      const pid = (a.kind === 'student' ? studentMap : teacherMap).get(a.person_id);
      if (pid) exec('INSERT OR IGNORE INTO attendance (section, kind, person_id, date, marked_at, marked_by) VALUES (?,?,?,?,?,?)', [a.section, a.kind, pid, a.date, a.marked_at, a.marked_by]);
    }
    for (const l of allIn(src, 'SELECT * FROM attendance_locks')) {
      const cid = classMap.get(l.class_id);
      if (cid) exec('INSERT OR IGNORE INTO attendance_locks (section, class_id, date, locked_at) VALUES (?,?,?,?)', [l.section, cid, l.date, l.locked_at]);
    }

    // Subjects of classes that were added by this merge, and any exam names we do not have yet
    for (const cs of allIn(src, 'SELECT * FROM class_subjects ORDER BY class_id, sort_order, id')) {
      if (newClasses.has(cs.class_id)) exec('INSERT INTO class_subjects (class_id, subject, total, sort_order) VALUES (?,?,?,?)', [classMap.get(cs.class_id), cs.subject, cs.total, cs.sort_order]);
    }
    for (const ex of allIn(src, 'SELECT * FROM exams ORDER BY sort_order, id')) {
      const cid = ex.class_id ? classMap.get(ex.class_id) : null;
      if (ex.class_id && !cid) continue;
      if (get('SELECT id FROM exams WHERE section = ? AND LOWER(name) = LOWER(?) AND stream IS ? AND class_id IS ?', [ex.section, ex.name, ex.stream, cid])) continue;
      const ord = get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM exams WHERE section = ?', [ex.section]).n;
      exec('INSERT INTO exams (section, name, stream, class_id, sort_order) VALUES (?,?,?,?,?)', [ex.section, ex.name, ex.stream, cid, ord]);
    }

    // Photos, teacher signatures and class teachers
    for (const ph of allIn(src, 'SELECT * FROM student_photos')) {
      const sid = studentMap.get(ph.student_id);
      if (sid) exec('INSERT OR IGNORE INTO student_photos (student_id, data) VALUES (?,?)', [sid, ph.data]);
    }
    for (const sg of allIn(src, 'SELECT * FROM teacher_signatures')) {
      const tid = teacherMap.get(sg.teacher_id);
      if (tid) exec('INSERT OR IGNORE INTO teacher_signatures (teacher_id, data) VALUES (?,?)', [tid, sg.data]);
    }
    for (const [srcId, c] of newClasses) {
      const tid = c.class_teacher_id ? teacherMap.get(c.class_teacher_id) : null;
      if (tid) exec('UPDATE classes SET class_teacher_id = ? WHERE id = ?', [tid, classMap.get(srcId)]);
    }
    const sigRow = allIn(src, "SELECT value FROM settings WHERE key = 'principalSignature'")[0];
    if (sigRow && sigRow.value && !getSetting('principalSignature')) setSetting('principalSignature', sigRow.value);

    // Keep the current logo unless there is none
    const logo = allIn(src, "SELECT value FROM settings WHERE key = 'logoData'")[0];
    if (logo && logo.value && !getSetting('logoData')) setSetting('logoData', logo.value);
  });
  return st;
}

/* -------------------------------------------------------------------------
   Public API (exposed to the UI)
   ------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------
   Student documents: images, PDFs and scans are kept as files in a "student_documents" folder
   next to the database (one sub-folder per student); only the details live in the database.
   The functions that touch files take a path from the main process only. They are deliberately
   not part of `api`, so the page can never ask for an arbitrary file.
   ------------------------------------------------------------------------- */
const DOC_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', pdf: 'application/pdf' };
const DOC_MAX_BYTES = 15 * 1024 * 1024, DOC_MAX_PER_STUDENT = 40;
const docsDir = () => (filePath ? path.join(path.dirname(filePath), 'student_documents') : null);
/** The file's first bytes must match what its extension claims, so a renamed program or text file is refused. */
function docContentOk(buf, ext) {
  const at = (i, s) => buf.slice(i, i + s.length).toString('latin1') === s;
  switch (ext) {
    case 'pdf': return at(0, '%PDF-');
    case 'png': return at(0, '\x89PNG');
    case 'jpg': case 'jpeg': return at(0, '\xff\xd8\xff');
    case 'gif': return at(0, 'GIF8');
    case 'bmp': return at(0, 'BM');
    case 'webp': return at(0, 'RIFF') && at(8, 'WEBP');
    case 'tif': case 'tiff': return at(0, 'II*\0') || at(0, 'MM\0*');
    default: return false;
  }
}
const docFolder = studentId => path.join(docsDir(), String(Number(studentId)));
/** Copies a chosen file into the student's folder and records it. Returns the new document id. */
async function addDocument(studentId, srcPath) {
  const stu = get('SELECT id FROM students WHERE id = ?', [studentId]);
  if (!stu) throw new Error('Student not found.');
  const base = path.basename(String(srcPath)), ext = path.extname(base).slice(1).toLowerCase();
  if (!DOC_TYPES[ext]) throw new Error(`${base}: only images (JPG, PNG, WEBP, GIF, BMP, TIFF) and PDF files can be uploaded.`);
  const st = await fsp.stat(srcPath);
  if (!st.isFile() || st.size === 0) throw new Error(`${base}: the file is empty or is not a file.`);
  if (st.size > DOC_MAX_BYTES) throw new Error(`${base}: larger than ${DOC_MAX_BYTES / 1048576} MB.`);
  if (get('SELECT COUNT(*) AS n FROM student_documents WHERE student_id = ?', [studentId]).n >= DOC_MAX_PER_STUDENT) throw new Error(`A student can have at most ${DOC_MAX_PER_STUDENT} files.`);
  const buf = await fsp.readFile(srcPath);
  if (!docContentOk(buf, ext)) throw new Error(`${base}: the contents do not look like a real ${ext.toUpperCase()} file.`);
  const id = run('INSERT INTO student_documents (student_id, original_name, stored_name, mime, size, uploaded_at) VALUES (?,?,?,?,?,?)', [studentId, base.slice(0, 120), '', DOC_TYPES[ext], buf.length, nowStamp()]);
  const stored = `${id}.${ext}`;
  try {
    await fsp.mkdir(docFolder(studentId), { recursive: true });
    await fsp.writeFile(path.join(docFolder(studentId), stored), buf);
  } catch (e) {
    run('DELETE FROM student_documents WHERE id = ?', [id]);
    throw new Error(`${base}: could not be saved (${e.message}).`);
  }
  run('UPDATE student_documents SET stored_name = ? WHERE id = ?', [stored, id]);
  return id;
}
/** Where a stored document is on disk (checked to be inside the documents folder). */
async function getDocumentFile(id) {
  const d = get('SELECT * FROM student_documents WHERE id = ?', [id]);
  if (!d || !d.stored_name) throw new Error('Document not found.');
  const file = path.join(docFolder(d.student_id), d.stored_name);
  if (!path.resolve(file).startsWith(path.resolve(docsDir()) + path.sep)) throw new Error('Document not found.');
  if (!(await exists(file))) throw new Error('The file is missing from the documents folder. It may have been moved or deleted.');
  return { file, name: d.original_name, mime: d.mime, size: d.size };
}

/* -------------------------------------------------------------------------
   Fee history (a new fee applies from a later month only), holidays, session years, Hijri text
   ------------------------------------------------------------------------- */
/** Rows are sorted by month. The fee in force for `month` is the latest row that starts on or before it. */
const feeAt = (rows, month, fallback) => { let f = null; for (const r of rows) { if (r.effective_month <= month) f = r.fee; else break; } return f ?? (rows[0] ? rows[0].fee : fallback); };
const feeRows = (kind, id) => all('SELECT effective_month, fee FROM fee_history WHERE kind = ? AND ref_id = ? ORDER BY effective_month', [kind, id]);
/** Past and current months keep the fee they had: a change can start next month at the earliest. */
function feeStart(m) {
  const earliest = nextMonth(today().slice(0, 7));
  if (!m) return earliest;
  if (!/^\d{4}-\d{2}$/.test(String(m)) || m < earliest) throw new Error(`A new fee applies from ${earliest} at the earliest. Past and current months keep their old fee.`);
  if (Number(m.slice(0, 4)) > Number(earliest.slice(0, 4)) + 10) throw new Error('Choose a month within the next ten years.');
  return m;
}
function setFeeFrom(kind, id, fee, month) {
  const table = kind === 'hostel' ? 'hostel_residents' : 'students';
  const cur = get(`SELECT fee FROM ${table} WHERE id = ?`, [id]);
  transaction(() => {
    exec('DELETE FROM fee_history WHERE kind = ? AND ref_id = ? AND effective_month >= ?', [kind, id, month]);
    if (!get('SELECT 1 AS x FROM fee_history WHERE kind = ? AND ref_id = ?', [kind, id])) exec('INSERT INTO fee_history (kind, ref_id, effective_month, fee) VALUES (?,?,?,?)', [kind, id, '0000-00', cur ? cur.fee : 0]);
    exec('INSERT INTO fee_history (kind, ref_id, effective_month, fee) VALUES (?,?,?,?)', [kind, id, month, fee]);
    exec(`UPDATE ${table} SET fee = ? WHERE id = ?`, [fee, id]);
  });
}

const holidayMap = (section, month) => new Map(all('SELECT date, name FROM holidays WHERE section = ? AND date LIKE ?', [section, `${month}-%`]).map(r => [r.date, r.name]));
/** Why a day is not a working day ('' when it is one). */
function offDay(section, date) {
  if (new Date(`${date}T00:00:00`).getDay() === 5) return 'Friday is a weekly off-day.';
  const h = get('SELECT name FROM holidays WHERE section = ? AND date = ?', [section, date]);
  return h ? `${date} is a holiday: ${h.name}.` : '';
}

/** Multi-year sessions: the year boundaries fall on the start date's anniversaries. */
const addYears = (iso, k) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y + k, m - 1, d)); if (t.getUTCMonth() !== m - 1) t.setUTCDate(0); return t.toISOString().slice(0, 10); };
const sessionYears = (a, b) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / (365.25 * 86400000)));
const yearsDone = (ss, date) => { let k = 0; const years = sessionYears(ss.start_date, ss.end_date); while (k < years && addYears(ss.start_date, k + 1) <= date) k++; return k; };

/** The fee in force today and each change: base (from admission), past, current, or scheduled for a later month. */
function feeSchedule(kind, id) {
  const rows = feeRows(kind, id), cur = today().slice(0, 7);
  let now = -1;
  rows.forEach((r, i) => { if (r.effective_month <= cur) now = i; });
  return rows.map((r, i) => ({ ...r, state: i > now ? 'scheduled' : i === now ? 'current' : 'past' }));
}
const CONTACT_RELATIONS = ['Mother', 'Father', 'Sibling', 'Grandparent', 'Uncle', 'Aunt', 'Other'];
/** Family contacts of a hostel resident (mother, father, siblings...). Empty rows are dropped; a row needs a name. */
function cleanContacts(list) {
  const rows = (Array.isArray(list) ? list : []).filter(c => str(c && c.name) || str(c && c.phone));
  if (rows.length > 12) throw new Error('A resident can have at most 12 family contacts.');
  return rows.map(c => ({ relation: CONTACT_RELATIONS.includes(c.relation) ? c.relation : 'Other', name: needText(c.name, 'Family contact name').slice(0, 80), phone: str(c.phone).slice(0, 30) }));
}
function saveContacts(id, rows) {
  if (!rows) return;
  exec('DELETE FROM hostel_contacts WHERE resident_id = ?', [id]);
  for (const c of rows) exec('INSERT INTO hostel_contacts (resident_id, relation, name, phone) VALUES (?,?,?,?)', [id, c.relation, c.name, c.phone]);
  scheduleSave();
}
/** Month by month for one resident, from joining to `month` (or the month they left): fee, paid and what is still owed. */
function hostelMonths(r, month, rows, hist) {
  const by = new Map(rows.map(p => [p.month, p]));
  const start = monthOf(r.joined_on) || month, end = r.status === 'Left' && r.left_on ? monthOf(r.left_on) : '';
  const last = end && end < month ? end : month, out = [];
  for (let m = start, g = 0; m <= last && g < 720; m = nextMonth(m), g++) { const p = by.get(m), due = p ? p.due : feeAt(hist, m, r.fee), paid = p ? p.paid : 0; out.push({ month: m, due, paid, balance: round2(Math.max(due - paid, 0)) }); }
  return out;
}

/** Hostel dues up to `month`: earlier unpaid months (previous), this month's fee and what is payable. Billing stops in the month a resident leaves. */
function hostelDues(r, month, rows, hist) {
  const ms = hostelMonths(r, month, rows, hist), cur = ms.find(m => m.month === month);
  const previous = round2(ms.filter(m => m.month !== month).reduce((t, m) => t + m.balance, 0)), due = cur ? cur.due : 0, paid = cur ? cur.paid : 0;
  return { previous, due, paid, payable: round2(previous + Math.max(due - paid, 0)) };
}
/** For the student report: is the student a hostel resident, and what do they owe. */
function studentHostel(s) {
  const r = get("SELECT * FROM hostel_residents WHERE student_id = ? ORDER BY (status = 'Active') DESC, id DESC LIMIT 1", [s.id]);
  if (!r) return { resident: false };
  const month = today().slice(0, 7), hist = feeRows('hostel', r.id);
  return { resident: true, month, status: r.status, room: r.room, guardian: r.guardian, joined_on: r.joined_on, left_on: r.left_on, fee: feeAt(hist, month, r.fee), schedule: feeSchedule('hostel', r.id),
    ...hostelDues(r, month, all('SELECT * FROM hostel_fees WHERE resident_id = ?', [r.id]), hist) };
}
/** For the student report: money held for the student (deposits are the contributions). */
function studentFunds(id) {
  const t = get("SELECT COUNT(*) AS n, COALESCE(SUM(CASE type WHEN 'deposit' THEN amount END), 0) AS deposited, COALESCE(SUM(CASE type WHEN 'withdraw' THEN amount END), 0) AS withdrawn FROM student_funds WHERE student_id = ?", [id]);
  return { entries: t.n, deposited: t.deposited, withdrawn: t.withdrawn, balance: round2(t.deposited - t.withdrawn),
    recent: all('SELECT date, type, amount, note FROM student_funds WHERE student_id = ? ORDER BY date DESC, id DESC LIMIT 5', [id]) };
}

/** Hijri date for exports (Umm al-Qura plus the administrator's adjustment). */
function hijriText(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ''))) return '';
  try {
    const t = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).getTime() + Number(getSetting('hijriOffset') || 0) * 86400000;
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(t));
    const part = k => (parts.find(x => x.type === k) || {}).value || '';
    return `${part('day')} ${part('month')} ${part('year')} AH`;
  } catch { return ''; }
}

/* -------------------------------------------------------------------------
   Sessions, history, input masks, teacher month maths, bulk import helpers
   ------------------------------------------------------------------------- */
const logStudentStatus = (id, status, date, note) => run('INSERT INTO student_status_log (student_id, status, date, note) VALUES (?,?,?,?)', [id, status, date, note || '']);
const logTeacher = (id, event, date, note) => run('INSERT INTO teacher_history (teacher_id, event, date, note) VALUES (?,?,?,?)', [id, event, date, note || '']);
/** After a student's session changes: count the session years that are already over, so nobody is promoted retroactively. */
function syncSessionYear(id) {
  const ss = get('SELECT ss.start_date, ss.end_date FROM students s JOIN sessions ss ON ss.name = s.session WHERE s.id = ?', [id]);
  run('UPDATE students SET session_year = ? WHERE id = ?', [ss ? yearsDone(ss, today()) : 0, id]);
}
/** A linked group with fewer than two profiles is no group at all. */
const tidyGroup = pid => { if (pid && get('SELECT COUNT(*) AS n FROM students WHERE person_id = ?', [pid]).n < 2) exec('UPDATE students SET person_id = NULL WHERE person_id = ?', [pid]); };

/** Input template for custom fields: 0 = digit, A = letter, X = letter or digit, anything else is a fixed character. */
function maskRegex(mask) {
  return new RegExp('^' + [...mask].map(c => (c === '0' ? '\\d' : c === 'A' ? '[A-Za-z]' : c === 'X' ? '[A-Za-z0-9]' : c.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&'))).join('') + '$');
}

/** Movement history for the student report: admission, class transfers (and promotions) and every status change. */
function studentHistory(s) {
  const ev = [{ date: s.admission_date || s.admitted_on || '', type: 'admission', to: s.session || '', note: '', order: 0 }];
  for (const t of all(`SELECT t.id, t.date, t.note, (SELECT name FROM classes WHERE id = t.from_class_id) AS from_name, (SELECT name FROM classes WHERE id = t.to_class_id) AS to_name
                       FROM class_transfers t WHERE t.student_id = ?`, [s.id])) ev.push({ date: t.date, type: 'transfer', from: t.from_name, to: t.to_name, note: t.note, order: t.id });
  for (const l of all('SELECT * FROM student_status_log WHERE student_id = ?', [s.id])) ev.push({ date: l.date, type: 'status', status: l.status, note: l.note, order: l.id });
  return ev.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.order - b.order);
}

/** Working days (Fridays off) of a month up to today, split into days the teacher was employed and days they were not (before joining / after leaving). */
function monthDays(month, joined, left, hol) {
  const [y, mo] = month.split('-').map(Number);
  const full = new Date(y, mo, 0).getDate(), last = month === today().slice(0, 7) ? new Date().getDate() : full;
  let work = 0, fullWork = 0, away = 0;
  for (let d = 1; d <= full; d++) {
    const ds = `${month}-${pad(d)}`;
    if (new Date(y, mo - 1, d).getDay() === 5 || (hol && hol.has(ds))) continue;
    fullWork++;
    if (d <= last) { if ((!joined || ds >= joined) && (!left || ds <= left)) work++; else away++; }
  }
  return { work, fullWork, away };
}
function salaryRow(t, month, marked, hol) {
  const row = get('SELECT * FROM teacher_salaries WHERE teacher_id = ? AND month = ?', [t.id, month]);
  const base = row ? row.base : t.salary || 0;
  const { work, fullWork, away } = monthDays(month, t.joined_on, t.left_on, hol);
  const att = get("SELECT COALESCE(SUM(status = 'P'), 0) AS p, COALESCE(SUM(status = 'L'), 0) AS l FROM attendance WHERE kind = 'teacher' AND person_id = ? AND date LIKE ?", [t.id, `${month}-%`]);
  const present = att.p, leave = att.l, leavePaid = getSetting('teacherLeavePaid') !== '0';       // approved leave is excused unless the setting says otherwise
  const absent = marked ? Math.max(work - present - (leavePaid ? leave : 0), 0) : 0;
  const auto = fullWork ? Math.min(base, round2((base / fullWork) * (absent + away))) : 0;   // days before joining or after leaving are unpaid too
  const manual = !!row && row.manual_deduction !== null;
  const deduction = manual ? row.manual_deduction : auto;
  return { teacher_id: t.id, name: t.name, joined_on: t.joined_on, left_on: t.left_on, base, work, present, leave, absent, pre: away, auto, manual, deduction, net: Math.max(round2(base - deduction), 0),
    status: row ? row.status : 'Unpaid', paid_on: row ? row.paid_on : null, remarks: row ? row.remarks || '' : '', marked };
}

/* Bulk import: spreadsheet headers are matched loosely (case, spaces and punctuation are ignored) */
const normHead = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
const IMPORT_STUDENT_COLS = {
  roll_no: ['rollno', 'roll', 'rollnumber', 'regno', 'registrationnumber', 'rollregistrationnumber', 'rollregnumber'], name: ['name', 'studentname'], father_name: ['fathername', 'father', 'fathersname'],
  gender: ['gender', 'sex'], admission_date: ['admissiondate', 'dateofadmission'], stream: ['stream'], class: ['class', 'classname'], session: ['session', 'academicsession'],
  father_phone: ['fatherphone', 'fathersphone', 'phone', 'mobile', 'contact'], emergency_contact: ['emergencycontact'], province: ['province'], city: ['city'], district: ['district'],
  tehsil: ['tehsil'], address: ['address'], fee: ['monthlyfee', 'fee'], opening_dues: ['previousdues', 'openingdues', 'duesbroughtforward', 'dues']
};
const IMPORT_TEACHER_COLS = {
  name: ['name', 'teachername'], phone: ['phone', 'mobile', 'contact'], qualification: ['qualification'], joined_on: ['joiningdate', 'joineddate', 'recruitmentdate', 'dateofjoining', 'joining'],
  salary: ['salary', 'monthlysalary'], username: ['username', 'login'], password: ['password']
};
function mapRow(raw, cols) {
  const out = {};
  for (const [key, val] of Object.entries(raw || {})) {
    const n = normHead(key), target = Object.keys(cols).find(k => cols[k].includes(n));
    if (target && out[target] === undefined) out[target] = String(val ?? '').trim();
  }
  return out;
}
/** '' = empty, null = not a valid date, otherwise YYYY-MM-DD. Accepts 2026-04-01 and 1/4/2026. */
function normDate(v) {
  v = String(v ?? '').trim();
  if (!v) return '';
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(v), y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else return null;
  const t = new Date(y, mo - 1, d);
  return t.getFullYear() === y && t.getMonth() === mo - 1 && t.getDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

/* ---------- Saved student sequence per class ---------- */
const orderLocked = classId => { const r = get('SELECT locked FROM class_order_locks WHERE class_id = ?', [classId]); return !!(r && r.locked); };
function writeOrder(classId, ids) {
  const valid = new Set(all('SELECT id FROM students WHERE class_id = ?', [classId]).map(r => r.id));
  const list = [...new Set((ids || []).map(Number))].filter(i => valid.has(i));
  transaction(() => {
    exec('DELETE FROM class_student_order WHERE class_id = ?', [classId]);
    list.forEach((sid, i) => exec('INSERT INTO class_student_order (class_id, student_id, position) VALUES (?,?,?)', [classId, sid, i]));
  });
}
/** Saved students come first in their saved order; anyone new follows in roll-number order. */
function applyOrder(classId, rows) {
  const pos = new Map(all('SELECT student_id, position FROM class_student_order WHERE class_id = ?', [classId]).map(r => [r.student_id, r.position]));
  if (!pos.size) return rows;
  return rows.map((r, i) => ({ r, i })).sort((a, b) => ((pos.has(a.r.id) ? pos.get(a.r.id) : 1e9) - (pos.has(b.r.id) ? pos.get(b.r.id) : 1e9)) || a.i - b.i).map(x => x.r);
}

/* ---------- Report helpers: one grouped query for many months instead of one query per month ---------- */
function backMonths(from, n) { let m = from; for (let i = 0; i < n; i++) m = prevMonth(m); return m; }
function yearList(startMonth, curMonth) { const out = []; for (let y = +startMonth.slice(0, 4); y <= +curMonth.slice(0, 4); y++) out.push(String(y)); return out; }
/** Months of the chosen year (up to the current month), or every month from `start` for "all". */
function reportMonths(start, cur, sel) {
  const out = [];
  if (sel === 'all') { for (let m = start, g = 0; m <= cur && g < 1200; m = nextMonth(m), g++) out.push(m); }
  else for (let mo = 1; mo <= 12; mo++) { const m = `${sel}-${pad(mo)}`; if (m <= cur) out.push(m); }
  return out;
}
function monthlyAttendance(kind, personId, months, endDate) {
  if (!months.length) return new Map();
  const upper = endDate && endDate < `${months[months.length - 1]}-31` ? endDate : `${months[months.length - 1]}-31`;
  const rows = all("SELECT SUBSTR(date, 1, 7) AS m, COALESCE(SUM(status = 'P'), 0) AS p, COALESCE(SUM(status = 'L'), 0) AS l FROM attendance WHERE kind = ? AND person_id = ? AND date >= ? AND date <= ? GROUP BY m",
    [kind, personId, `${months[0]}-01`, upper]);
  return new Map(rows.map(r => [r.m, r]));
}
function holidaysByMonth(section, months) {
  const map = new Map(months.map(m => [m, new Map()]));
  if (!months.length) return map;
  for (const r of all('SELECT date, name FROM holidays WHERE section = ? AND date >= ? AND date <= ?', [section, `${months[0]}-01`, `${months[months.length - 1]}-31`])) {
    const m = r.date.slice(0, 7);
    if (map.has(m)) map.get(m).set(r.date, r.name);
  }
  return map;
}
const TT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const api = {
  /* ---------- Authentication & settings ---------- */
  /** Used by the main process only. kind is 'admin' or 'teacher'. */
  verifyLogin(kind, username, password) {
    const u = String(username).trim().toLowerCase();
    if (kind === 'admin') return u === 'admin' && verifyPassword(String(password), getSetting('passwordHash')) ? {} : false;
    if (kind !== 'teacher') return false;
    const t = get('SELECT id, section, password_hash, status FROM teachers WHERE LOWER(username) = ?', [u]);
    if (t && t.password_hash && t.status && t.status !== 'Active') return false;   // a teacher who has left or is inactive cannot sign in
    if (t && t.password_hash) return verifyPassword(String(password), t.password_hash) ? { teacherId: t.id, section: t.section } : false;
    // The old shared teacher login keeps working only until the first individual teacher account is created
    const individual = get('SELECT COUNT(*) AS n FROM teachers WHERE password_hash IS NOT NULL').n > 0;
    return !individual && u === 'teach123' && verifyPassword(String(password), getSetting('teacherPasswordHash')) ? { teacherId: null, section: null } : false;
  },
  /** Classes a teacher may work with: those they teach or lead. Used by the main process for permission checks. */
  getTeacherClassIds(id) {
    if (!get("SELECT 1 AS x FROM teachers WHERE id = ? AND status = 'Active'", [id])) return [];
    return all('SELECT class_id AS c FROM teacher_assignments WHERE teacher_id = ? UNION SELECT id FROM classes WHERE class_teacher_id = ?', [id, id]).map(r => r.c);
  },
  changePassword(current, next) {
    if (!verifyPassword(String(current), getSetting('passwordHash'))) throw new Error('Current password is incorrect.');
    if (String(next).length < 4) throw new Error('New password must be at least 4 characters.');
    setSetting('passwordHash', hashPassword(String(next)));
    return true;
  },
  setTeacherPassword(next) {
    if (String(next).length < 4) throw new Error('The teacher password must be at least 4 characters.');
    setSetting('teacherPasswordHash', hashPassword(String(next)));
    return true;
  },
  /** Safe to show before sign-in (login screen logo). */
  getPublicSettings() {
    return { logoUrl: getSetting('logoUrl') || '', logoData: getSetting('logoData') || officialLogo() };
  },
  getSettings() {
    return {
      ...api.getPublicSettings(),
      principalSignature: getSetting('principalSignature') || '',
      promotionEnabled: getSetting('promotionEnabled') === '1',
      promotionDate: getSetting('promotionDate') || '04-01',
      lastPromotionYear: Number(getSetting('lastPromotionYear') || 0),
      grading: readGrading(),
      sessions: api.getSessions(),
      autoGraduate: getSetting('autoGraduate') !== '0',
      autoPromote: getSetting('autoPromote') !== '0',
      leavePaid: getSetting('teacherLeavePaid') !== '0',
      layout: readLayout(),
      hijriOffset: Number(getSetting('hijriOffset') || 0)
    };
  },
  saveHijriOffset(days) {
    days = Math.round(Number(days));
    if (!Number.isFinite(days) || days < -3 || days > 3) throw new Error('The Hijri adjustment must be between -3 and +3 days.');
    setSetting('hijriOffset', String(days));
    return true;
  },
  /** scope: 'all' or a stream. rules null removes a stream's own rules (it then follows the institution-wide ones). */
  saveGradingRules(scope, rules) {
    const g = readGrading();
    if (scope === 'all') g.all = checkGrading(rules || DEFAULT_GRADING);
    else if (STREAMS.includes(scope)) { if (rules) g.byStream[scope] = checkGrading(rules); else delete g.byStream[scope]; }
    else throw new Error('Choose institution-wide or a stream.');
    setSetting('grading', JSON.stringify(g));
    return true;
  },
  saveResultLayout(layout) {
    const l = layout || {};
    const fields = (Array.isArray(l.fields) ? l.fields : []).filter(f => LAYOUT_KEYS.includes(f.key)).map(f => ({ key: f.key, visible: f.visible !== false }));
    setSetting('resultLayout', JSON.stringify({ fields, subtitle: l.subtitle !== false, gregorian: l.gregorian !== false, hijri: l.hijri !== false }));
    return true;
  },
  setPrincipalSignature(data) {
    if (data && !validImage(data)) throw new Error('Choose a PNG, JPG or WEBP image under 2 MB.');
    setSetting('principalSignature', data || '');
    return true;
  },

  /* ---------- Yearly promotion ---------- */
  savePromotionSettings(enabled, mmdd) {
    const m = /^(\d{2})-(\d{2})$/.exec(String(mmdd));
    if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] < 1 || +m[2] > 31) throw new Error('Choose a valid promotion date.');
    setSetting('promotionEnabled', enabled ? '1' : '0');
    setSetting('promotionDate', mmdd);
    return true;
  },
  /** A custom scale for one stream: any number of named grades with their own cut-offs (for example Dars-e-Nizami: ممتاز, جید جدا, جید, مقبول).
   *  scale = { grades: [{ name, min }], fail, pass }. null removes it and the stream goes back to the standard letter grades. */
  saveGradeScale(stream, scale) {
    if (!STREAMS.includes(stream)) throw new Error('Choose a stream.');
    const g = readGrading();
    if (!scale) delete g.scales[stream];
    else {
      const grades = (scale.grades || []).map(x => ({ name: str(x.name).slice(0, 20), min: Number(x.min) }));
      if (!grades.length || grades.length > 10) throw new Error('A scale needs between 1 and 10 grades.');
      if (grades.some(x => !x.name)) throw new Error('Give every grade a name.');
      if (grades.some(x => !Number.isFinite(x.min) || x.min < 0 || x.min > 100)) throw new Error('Every cut-off must be a number between 0 and 100.');
      for (let i = 1; i < grades.length; i++) if (grades[i].min >= grades[i - 1].min) throw new Error('Cut-offs must go down from the top grade to the lowest (for example 80, 70, 60, 40).');
      const pass = Number(scale.pass);
      if (!Number.isFinite(pass) || pass < 0 || pass > 100) throw new Error('The pass mark must be between 0 and 100.');
      g.scales[stream] = { grades, fail: str(scale.fail).slice(0, 20) || 'F', pass };
    }
    setSetting('grading', JSON.stringify(g));
    return true;
  },
  getSessions() { return all('SELECT * FROM sessions ORDER BY start_date, name').map(x => ({ ...x, years: sessionYears(x.start_date, x.end_date) })); },
  /** kind 'year' = one academic year; 'course' = a multi-year course such as Dars-e-Nizami (8 years). */
  saveSession(x) {
    const name = needText(x.name, 'Session name').slice(0, 40);
    const a = normDate(x.start_date), b = normDate(x.end_date);
    if (!a || !b) throw new Error('Enter valid start and end dates.');
    if (b <= a) throw new Error('The session must end after it starts.');
    const stream = str(x.stream);
    if (stream && !STREAMS.includes(stream)) throw new Error('Unknown stream.');
    const kind = x.kind === 'course' || (x.kind === undefined && sessionYears(a, b) > 1) ? 'course' : 'year';
    run('INSERT INTO sessions (name, start_date, end_date, kind, stream) VALUES (?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET start_date = excluded.start_date, end_date = excluded.end_date, kind = excluded.kind, stream = excluded.stream',
      [name, a, b, kind, stream || null]);
    for (const st of all('SELECT id FROM students WHERE session = ?', [name])) syncSessionYear(st.id);   // dates may have changed
    return true;
  },
  deleteSession(name) {
    const n = get('SELECT COUNT(*) AS n FROM students WHERE session = ?', [name]).n;
    if (n) throw new Error(`${n} student${n > 1 ? 's are' : ' is'} assigned to this session. Change their session first.`);
    run('DELETE FROM sessions WHERE name = ?', [name]);
    return true;
  },
  /** Gives every Active student of a class the same session (or none). Returns how many students changed. */
  assignSessionToClass(classId, session) {
    const c = get('SELECT id, stream FROM classes WHERE id = ?', [classId]);
    if (!c) throw new Error('Choose a class.');
    session = str(session);
    const ss = session ? get('SELECT * FROM sessions WHERE name = ?', [session]) : null;
    if (session && !ss) throw new Error('Unknown session.');
    if (ss && ss.stream && ss.stream !== c.stream) throw new Error(`Session ${session} is for the ${ss.stream} stream.`);
    const rows = all("SELECT id FROM students WHERE class_id = ? AND status = 'Active'", [classId]);
    transaction(() => { for (const r of rows) exec('UPDATE students SET session = ?, session_year = ? WHERE id = ?', [session || null, ss ? yearsDone(ss, today()) : 0, r.id]); });
    return rows.length;
  },
  setAutoGraduate(on) { setSetting('autoGraduate', on ? '1' : '0'); return !!on; },
  setAutoPromote(on) { setSetting('autoPromote', on ? '1' : '0'); return !!on; },
  setLeavePaid(on) { setSetting('teacherLeavePaid', on ? '1' : '0'); return !!on; },
  /** Moves students on as their session years finish: each completed year promotes them to the next class of their stream
   *  (the last class becomes Passed out). When the session itself ends, an academic-year session passes students on to the
   *  next one; a multi-year course passes them out (if automatic pass-out is on). Students without a session are not touched. */
  runSessionRollover(date) {
    const d = normDate(date) || today(), res = { promoted: 0, graduated: 0, noNextSession: 0 };
    if (getSetting('autoPromote') === '0') return res;
    const passOut = getSetting('autoGraduate') !== '0';
    const sessions = all('SELECT * FROM sessions ORDER BY start_date').map(x => ({ ...x, years: sessionYears(x.start_date, x.end_date) }));
    const byName = new Map(sessions.map(x => [x.name, x]));
    const chains = Object.fromEntries(SECTIONS.map(sec => [sec, classChains(sec).next]));
    const rows = all("SELECT id, section, class_id, session, session_year FROM students WHERE status = 'Active' AND COALESCE(session, '') <> ''");
    const stamp = (id, status, when, note) => exec('INSERT INTO student_status_log (student_id, status, date, note) VALUES (?,?,?,?)', [id, status, when, note]);
    const out = (id, when, note) => { exec("UPDATE students SET status = 'Passed out', status_date = ? WHERE id = ?", [when, id]); stamp(id, 'Passed out', when, note); res.graduated++; };
    transaction(() => {
      for (const s of rows) {
        let ss = byName.get(s.session), year = s.session_year, cls = s.class_id, gone = false;
        for (let guard = 0; ss && !gone && guard < 12; guard++) {
          const done = yearsDone(ss, d);
          while (year < done && !gone) {                               // each finished session year = one class up
            const to = chains[s.section].get(cls), when = addYears(ss.start_date, year + 1);
            if (to) {
              exec('UPDATE students SET class_id = ? WHERE id = ?', [to.id, s.id]);
              exec('INSERT INTO class_transfers (student_id, from_class_id, to_class_id, date, note) VALUES (?,?,?,?,?)', [s.id, cls, to.id, when > d ? d : when, `Session ${ss.name}: year ${year + 1} completed`]);
              cls = to.id; res.promoted++;
            } else if (chains[s.section].has(cls)) { out(s.id, when > d ? d : when, `Completed the last class (session ${ss.name})`); gone = true; }
            else break;
            year++;
          }
          if (gone || done < ss.years) break;                          // the session is still running
          if (ss.kind === 'course') { if (passOut) out(s.id, ss.end_date, `Course session ${ss.name} ended`); gone = true; break; }
          const nx = sessions.find(x => x.kind === 'year' && x.start_date >= ss.end_date && (!x.stream || x.stream === (get('SELECT stream FROM classes WHERE id = ?', [cls]) || {}).stream));
          if (!nx) { res.noNextSession++; break; }                     // next year's session has not been created yet
          exec('UPDATE students SET session = ? WHERE id = ?', [nx.name, s.id]);
          ss = nx; year = 0;
        }
        if (!gone) exec('UPDATE students SET session_year = ? WHERE id = ?', [year, s.id]);
      }
    });
    return res;
  },
  getPromotionPreview() { return promotionPreview(); },
  runPromotion(ids) { return runPromotion(ids); },
  /** Called after login: promotes once per year when the designated date has passed. */
  checkAutoPromotion(date) {
    if (getSetting('promotionEnabled') !== '1') return { ran: false };
    const year = Number(String(date).slice(0, 4));
    const last = Number(getSetting('lastPromotionYear') || 0);
    if (last < year && date >= `${year}-${getSetting('promotionDate')}`) return { ran: true, ...runPromotion() };
    return { ran: false };
  },

  /* ---------- Classes (grouped in streams) ---------- */
  getClasses(section) {
    needSection(section);
    return all(
      `SELECT c.*, (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS student_count,
              (SELECT name FROM teachers t WHERE t.id = c.class_teacher_id) AS class_teacher_name
       FROM classes c WHERE c.section = ? ORDER BY ${STREAM_ORDER}, c.sort_order, c.id`, [section]);
  },
  addClass(section, stream, name) {
    needSection(section);
    if (!STREAMS.includes(stream)) throw new Error('Choose a valid stream.');
    name = needText(name, 'Class name');
    if (get('SELECT id FROM classes WHERE section = ? AND stream = ? AND LOWER(name) = LOWER(?)', [section, stream, name])) throw new Error('This stream already has a class with that name.');
    const ord = get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM classes WHERE section = ? AND stream = ?', [section, stream]).n;
    return run('INSERT INTO classes (section, stream, name, sort_order) VALUES (?,?,?,?)', [section, stream, name, ord]);
  },
  renameClass(id, name) {
    name = needText(name, 'Class name');
    const cls = get('SELECT section, stream FROM classes WHERE id = ?', [id]);
    if (!cls) throw new Error('Class not found.');
    if (get('SELECT id FROM classes WHERE section = ? AND stream = ? AND LOWER(name) = LOWER(?) AND id <> ?', [cls.section, cls.stream, name, id])) throw new Error('This stream already has a class with that name.');
    run('UPDATE classes SET name = ? WHERE id = ?', [name, id]);
    return true;
  },
  deleteClass(id) {
    if (get('SELECT COUNT(*) AS n FROM students WHERE class_id = ?', [id]).n > 0) throw new Error('This class still has students. Move or remove them first.');
    transaction(() => {
      exec('DELETE FROM teacher_assignments WHERE class_id = ?', [id]);
      exec('DELETE FROM attendance_locks WHERE class_id = ?', [id]);
      exec('DELETE FROM class_subjects WHERE class_id = ?', [id]);
      exec('DELETE FROM exams WHERE class_id = ?', [id]);
      exec('DELETE FROM classes WHERE id = ?', [id]);
    });
    return true;
  },
  setClassTeacher(classId, teacherId) {
    const cls = get('SELECT section FROM classes WHERE id = ?', [classId]);
    if (!cls) throw new Error('Class not found.');
    if (teacherId && !get('SELECT id FROM teachers WHERE id = ? AND section = ?', [teacherId, cls.section])) throw new Error('Choose a teacher from this section.');
    run('UPDATE classes SET class_teacher_id = ? WHERE id = ?', [teacherId || null, classId]);
    return true;
  },
  /** Moves a class up or down inside its stream (this is also the promotion order). */
  moveClass(id, direction) {
    const cls = get('SELECT section, stream FROM classes WHERE id = ?', [id]);
    if (!cls) throw new Error('Class not found.');
    const list = all('SELECT id FROM classes WHERE section = ? AND stream = ? ORDER BY sort_order, id', [cls.section, cls.stream]).map(r => r.id);
    const i = list.indexOf(id), j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return true;
    [list[i], list[j]] = [list[j], list[i]];
    transaction(() => list.forEach((cid, idx) => exec('UPDATE classes SET sort_order = ? WHERE id = ?', [idx + 1, cid])));
    return true;
  },

  /* ---------- Admission form builder (one form per section) ---------- */
  /** Every field of the form, in display order, including hidden ones. */
  getFormFields(section) {
    needSection(section);
    ensureFormFields(section);
    scheduleSave();
    return all('SELECT * FROM custom_fields WHERE section = ? ORDER BY sort_order, id', [section]);
  },
  /** Adds a custom field, or edits an existing one (standard fields: label, options, visibility, required). */
  saveFormField(f) {
    needSection(f.section);
    const label = needText(f.label, 'Field label');
    const cur = f.id ? get('SELECT * FROM custom_fields WHERE id = ?', [f.id]) : null;
    if (f.id && !cur) throw new Error('Field not found.');
    if (get('SELECT id FROM custom_fields WHERE section = ? AND LOWER(label) = LOWER(?) AND id IS NOT ?', [f.section, label, f.id ?? null])) throw new Error('A field with this label already exists.');
    const type = cur && cur.builtin ? cur.type : f.type;
    if (!(cur && cur.builtin) && !FIELD_TYPES.includes(type)) throw new Error('Choose a valid field type.');
    let options = null;
    if (type === 'select') {
      const list = String(f.options || '').split('\n').map(x => x.trim()).filter(Boolean);
      if (!list.length) throw new Error('Add at least one option for a Select field (one per line).');
      options = list.join('\n');
    }
    let mask = null;
    if (type === 'text' && !(cur && cur.builtin) && str(f.mask)) {
      mask = str(f.mask);
      if (mask.length > 40 || !/[0AX]/.test(mask)) throw new Error('The input format needs at least one 0 (digit), A (letter) or X (letter or digit), and at most 40 characters.');
    }
    const locked = !!(cur && cur.builtin && LOCKED_FIELDS.includes(cur.builtin));
    const visible = locked || f.visible !== false ? 1 : 0;
    const required = locked ? 1 : f.required ? 1 : 0;
    if (cur) {
      run('UPDATE custom_fields SET label = ?, type = ?, options = ?, visible = ?, required = ?, mask = ? WHERE id = ?', [label, type, options, visible, required, mask, f.id]);
      return f.id;
    }
    const ord = get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM custom_fields WHERE section = ?', [f.section]).n;
    return run('INSERT INTO custom_fields (section, key, label, type, sort_order, options, visible, required, mask) VALUES (?,?,?,?,?,?,?,?,?)',
      [f.section, 'f_' + crypto.randomBytes(4).toString('hex'), label, type, ord, options, visible, required, mask]);
  },
  setFieldVisible(id, visible) {
    const f = get('SELECT builtin FROM custom_fields WHERE id = ?', [id]);
    if (!f) throw new Error('Field not found.');
    if (f.builtin && LOCKED_FIELDS.includes(f.builtin)) throw new Error('This field is required and cannot be hidden.');
    run('UPDATE custom_fields SET visible = ? WHERE id = ?', [visible ? 1 : 0, id]);
    return true;
  },
  moveFormField(id, direction) {
    const f = get('SELECT section FROM custom_fields WHERE id = ?', [id]);
    if (!f) throw new Error('Field not found.');
    const list = all('SELECT id FROM custom_fields WHERE section = ? ORDER BY sort_order, id', [f.section]).map(r => r.id);
    const i = list.indexOf(id), j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return true;
    [list[i], list[j]] = [list[j], list[i]];
    transaction(() => list.forEach((fid, idx) => exec('UPDATE custom_fields SET sort_order = ? WHERE id = ?', [idx + 1, fid])));
    return true;
  },
  deleteFormField(id) {
    const f = get('SELECT * FROM custom_fields WHERE id = ?', [id]);
    if (!f) return true;
    if (f.builtin) throw new Error('Standard fields can be hidden but not deleted.');
    transaction(() => {
      for (const s of all('SELECT id, extra FROM students WHERE section = ? AND extra IS NOT NULL', [f.section])) {
        const extra = parseJson(s.extra);
        if (f.key in extra) { delete extra[f.key]; exec('UPDATE students SET extra = ? WHERE id = ?', [JSON.stringify(extra), s.id]); }
      }
      exec('DELETE FROM custom_fields WHERE id = ?', [id]);
    });
    return true;
  },

  /* ---------- Students ---------- */
  getStudents(section) {
    needSection(section);
    return all(`${STUDENT_SELECT} WHERE s.section = ? ${STUDENT_ORDER}`, [section]);
  },
  getStudent(id) {
    return get(`${STUDENT_SELECT} WHERE s.id = ?`, [id]);
  },
  searchStudents(section, q) {
    needSection(section);
    q = String(q || '').trim();
    if (!q) return [];
    const like = `%${q}%`;
    return all(
      `${STUDENT_SELECT}
       WHERE s.section = ? AND (s.roll_no = ? OR CAST(s.id AS TEXT) = ? OR s.roll_no LIKE ? OR s.name LIKE ? OR s.father_name LIKE ?)
       ${STUDENT_ORDER} LIMIT 8`, [section, q, q, like, like, like]);
  },
  /** Saves a student. Only fields present in `s` are written, so fields hidden from the form keep their values. */
  saveStudent(s) {
    needSection(s.section);
    const roll = needText(s.roll_no, 'Roll / registration number');
    const name = needText(s.name, 'Student name');
    if (s.photo && !validImage(s.photo)) throw new Error('The photo must be a PNG, JPG or WEBP image under 2 MB.');   // check before anything is written
    if (!s.class_id || !get('SELECT id FROM classes WHERE id = ? AND section = ?', [s.class_id, s.section])) throw new Error('Please select a class.');
    if (get('SELECT id FROM students WHERE section = ? AND roll_no = ? AND id IS NOT ?', [s.section, roll, s.id ?? null])) throw new Error(`Roll number ${roll} is already in use.`);

    const optional = { father_name: str, gender: str, admission_date: v => str(v) || today(),
      session: v => { v = str(v); if (v && !get('SELECT 1 FROM sessions WHERE name = ?', [v])) throw new Error('Unknown academic session. Add it in Settings first.'); return v; }, father_phone: str, emergency_contact: str, province: str, city: str, district: str, tehsil: str, address: str, opening_dues: num };
    const cols = ['roll_no', 'name', 'class_id'];
    const vals = [roll, name, s.class_id];
    for (const [col, clean] of Object.entries(optional)) if (s[col] !== undefined) { cols.push(col); vals.push(clean(s[col])); }
    const extra = s.extra && typeof s.extra === 'object' ? s.extra : undefined;
    if (extra) for (const f of all("SELECT key, label, mask FROM custom_fields WHERE section = ? AND builtin IS NULL AND mask IS NOT NULL AND mask <> ''", [s.section])) {
      const v = str(extra[f.key]);
      if (v && !maskRegex(f.mask).test(v)) throw new Error(`${f.label} must look like ${f.mask} (0 = digit, A = letter, X = letter or digit).`);
    }

    let classStream = null;
    if (s.session) {                                           // a session that belongs to one stream only fits students of that stream
      const ss = get('SELECT stream FROM sessions WHERE name = ?', [str(s.session)]);
      classStream = (get('SELECT stream FROM classes WHERE id = ?', [s.class_id]) || {}).stream;
      if (ss && ss.stream && ss.stream !== classStream) throw new Error(`Session ${s.session} is for the ${ss.stream} stream.`);
    }
    const newFee = s.fee === undefined ? undefined : num(s.fee);
    if (s.id) {
      const existing = get('SELECT id, extra, fee, session FROM students WHERE id = ?', [s.id]);
      if (!existing) throw new Error('Student not found.');
      const feeFrom = newFee !== undefined && newFee !== existing.fee ? feeStart(s.fee_effective) : null;   // validated before anything is written
      const sets = cols.map(c => `${c} = ?`);
      if (extra) { sets.push('extra = ?'); vals.push(JSON.stringify({ ...parseJson(existing.extra), ...extra })); }
      run(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, [...vals, s.id]);
      if (feeFrom) setFeeFrom('student', s.id, newFee, feeFrom);              // the new fee starts later; earlier months keep the old one
      if (s.session !== undefined && str(s.session) !== (existing.session || '')) syncSessionYear(s.id);
      if (s.status) setStatus(s.id, s.status, undefined, s.status_date);
      if (s.photo !== undefined) setPhoto(s.id, s.photo);
      return s.id;
    }
    if (!cols.includes('admission_date')) { cols.push('admission_date'); vals.push(today()); }
    cols.push('extra', 'admitted_on', 'section', 'fee');
    vals.push(JSON.stringify(extra || {}), today(), s.section, newFee ?? 0);
    const id = run(`INSERT INTO students (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
    run('INSERT INTO fee_history (kind, ref_id, effective_month, fee) VALUES (?,?,?,?)', ['student', id, '0000-00', newFee ?? 0]);
    if (s.session) syncSessionYear(id);
    if (s.photo) setPhoto(id, s.photo);
    return id;
  },
  getStudentPhoto(id) {
    const r = get('SELECT data FROM student_photos WHERE student_id = ?', [id]);
    return r ? r.data : '';
  },
  /** Photos for a list of students: { id: dataUrl } */
  getStudentPhotos(ids) {
    const out = {};
    for (const id of (ids || []).slice(0, 300)) { const r = get('SELECT data FROM student_photos WHERE student_id = ?', [id]); if (r) out[id] = r.data; }
    return out;
  },
  /** Quick edit from the student list. */
  updateStudentField(id, field, value) {
    const allowed = ['father_phone', 'address', 'emergency_contact', 'status', 'session'];
    if (!allowed.includes(field)) throw new Error('This field cannot be edited here.');
    value = str(value);
    if (field === 'status') setStatus(id, value);
    else if (field === 'session') {                       // the Session dropdown on the Students page
      const st = get('SELECT s.session, c.stream FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?', [id]);
      if (!st) throw new Error('Student not found.');
      const ss = value ? get('SELECT stream FROM sessions WHERE name = ?', [value]) : null;
      if (value && !ss) throw new Error('Unknown academic session. Add it in Settings first.');
      if (ss && ss.stream && ss.stream !== st.stream) throw new Error(`Session ${value} is for the ${ss.stream} stream.`);
      if (value !== (st.session || '')) { run('UPDATE students SET session = ? WHERE id = ?', [value || null, id]); syncSessionYear(id); }
    } else run(`UPDATE students SET ${field} = ? WHERE id = ?`, [value, id]);
    return value;
  },
  deleteStudent(id) {
    transaction(() => {
      const pid = (get('SELECT person_id FROM students WHERE id = ?', [id]) || {}).person_id;
      exec('DELETE FROM student_photos WHERE student_id = ?', [id]);
      exec("DELETE FROM fee_history WHERE kind = 'student' AND ref_id = ?", [id]);
      for (const t of ['result_remarks', 'class_transfers', 'student_funds', 'student_status_log', 'student_documents']) exec(`DELETE FROM ${t} WHERE student_id = ?`, [id]);
      exec('UPDATE hostel_residents SET student_id = NULL WHERE student_id = ?', [id]);
      exec('DELETE FROM marks WHERE student_id = ?', [id]);
      exec('DELETE FROM fee_payments WHERE student_id = ?', [id]);
      exec('DELETE FROM fines WHERE student_id = ?', [id]);
      exec("DELETE FROM attendance WHERE kind = 'student' AND person_id = ?", [id]);
      exec('DELETE FROM students WHERE id = ?', [id]);
      tidyGroup(pid);
    });
    if (docsDir()) fsp.rm(docFolder(id), { recursive: true, force: true }).catch(() => { /* nothing to remove */ });
    return true;
  },
  /** Rows for the Excel export (all students, or only the given ids). */
  getExportRows(section, ids) {
    const fields = api.getFormFields(section).filter(f => !f.builtin);
    let list = api.getStudents(section);
    if (Array.isArray(ids)) { const keep = new Set(ids); list = list.filter(s => keep.has(s.id)); }
    return list.map(s => {
      const extra = parseJson(s.extra);
      const row = {
        'Roll / Reg Number': s.roll_no, 'Student Name': s.name, "Father's Name": s.father_name, 'Gender': s.gender,
        "Father's Phone": s.father_phone, 'Emergency Contact': s.emergency_contact, 'Province': s.province, 'City': s.city, 'District': s.district, 'Tehsil': s.tehsil,
        'Address': s.address, 'Admission Date': s.admission_date, 'Admission Date (Hijri)': hijriText(s.admission_date), 'Academic Session': s.session,
        'Stream': s.stream, 'Class': s.class_name, 'Status': s.status, 'Monthly Fee': s.fee, 'Dues Brought Forward': s.opening_dues
      };
      for (const f of fields) row[f.label] = extra[f.key] ?? '';
      return row;
    });
  },

  /* ---------- Teachers & class/subject assignments ---------- */
  getTeachers(section) {
    needSection(section);
    const teachers = all('SELECT t.*, (SELECT COUNT(*) FROM teacher_signatures g WHERE g.teacher_id = t.id) AS has_signature FROM teachers t WHERE t.section = ? ORDER BY t.name', [section])
      .map(t => ({ ...t, has_login: !!t.password_hash, password_hash: undefined }));   // never send hashes to the UI
    const assignments = all(
      `SELECT a.id, a.teacher_id, a.class_id, a.subject, c.name AS class_name, c.stream
       FROM teacher_assignments a JOIN classes c ON c.id = a.class_id JOIN teachers t ON t.id = a.teacher_id
       WHERE t.section = ? ORDER BY ${STREAM_ORDER}, c.sort_order, a.subject`, [section]);
    return teachers.map(t => ({ ...t, assignments: assignments.filter(a => a.teacher_id === t.id) }));
  },
  saveTeacher(t) {
    needSection(t.section);
    const name = needText(t.name, 'Teacher name');
    const vals = [name, str(t.phone), str(t.qualification)];
    if (t.signature && !validImage(t.signature)) throw new Error('The signature must be a PNG, JPG or WEBP image under 2 MB.');   // check before anything is written
    // Individual login: validated before anything is written
    const user = str(t.username).toLowerCase(), pw = String(t.password || '');
    let hash = null;
    if (user) {
      if (!/^[a-z0-9._-]{3,30}$/.test(user) || ['admin', 'teach123'].includes(user)) throw new Error('Username: 3-30 letters, numbers, dot, dash or underscore (not "admin").');
      if (get('SELECT id FROM teachers WHERE LOWER(username) = ? AND id IS NOT ?', [user, t.id ?? null])) throw new Error('That username is already taken.');
      const cur = t.id ? get('SELECT password_hash FROM teachers WHERE id = ?', [t.id]) : null;
      if (pw && pw.length < 4) throw new Error('The teacher password must be at least 4 characters.');
      hash = pw ? hashPassword(pw) : cur && cur.password_hash;
      if (!hash) throw new Error('Set a password for this username.');
    }
    const joined = /^\d{4}-\d{2}-\d{2}$/.test(str(t.joined_on)) ? str(t.joined_on) : null;
    const curT = t.id ? get('SELECT status, left_on, joined_on FROM teachers WHERE id = ?', [t.id]) : null;
    const nextStatus = t.status === undefined ? (curT ? curT.status : 'Active') : ['Left', 'Inactive'].includes(t.status) ? t.status : 'Active';
    const joinDate = joined || (curT && curT.joined_on) || today();
    let leftOn = null;
    if (nextStatus !== 'Active') {
      leftOn = /^\d{4}-\d{2}-\d{2}$/.test(str(t.left_on)) ? str(t.left_on) : (curT && curT.status !== 'Active' && curT.left_on) || today();
      if (leftOn < joinDate) throw new Error('The exit date cannot be before the joining date.');
    }
    let id = t.id;
    if (id) run('UPDATE teachers SET name=?, phone=?, qualification=?, joined_on=COALESCE(?, joined_on), salary=COALESCE(?, salary) WHERE id=?', [...vals, joined, t.salary === undefined ? null : num(t.salary), id]);
    else id = run('INSERT INTO teachers (name, phone, qualification, joined_on, salary, section) VALUES (?,?,?,?,?,?)', [...vals, joined || today(), num(t.salary), t.section]);
    if (t.username !== undefined) run('UPDATE teachers SET username=?, password_hash=? WHERE id=?', [user || null, hash, id]);
    run('UPDATE teachers SET status = ?, left_on = ? WHERE id = ?', [nextStatus, leftOn, id]);
    if (!t.id) logTeacher(id, 'Joined', joinDate, '');
    else if (curT.status !== nextStatus) logTeacher(id, nextStatus !== 'Active' ? nextStatus : 'Rejoined', nextStatus !== 'Active' ? leftOn : today(), str(t.status_note));
    else if (nextStatus !== 'Active' && curT.left_on !== leftOn) logTeacher(id, 'Exit date changed', leftOn, str(t.status_note));
    if (t.signature !== undefined) {            // data URL = set, null/'' = remove
      if (!t.signature) run('DELETE FROM teacher_signatures WHERE teacher_id = ?', [id]);
      else if (!validImage(t.signature)) throw new Error('The signature must be a PNG, JPG or WEBP image under 2 MB.');
      else run('INSERT INTO teacher_signatures (teacher_id, data) VALUES (?, ?) ON CONFLICT(teacher_id) DO UPDATE SET data = excluded.data', [id, t.signature]);
    }
    return id;
  },
  getTeacherSignature(id) {
    const r = get('SELECT data FROM teacher_signatures WHERE teacher_id = ?', [id]);
    return r ? r.data : '';
  },
  /** Signatures printed on a student's result card: principal + the class teacher. */
  getSignatures(studentId) {
    const s = get('SELECT class_id FROM students WHERE id = ?', [studentId]);
    const cls = s && s.class_id ? get('SELECT class_teacher_id FROM classes WHERE id = ?', [s.class_id]) : null;
    const t = cls && cls.class_teacher_id ? get('SELECT name FROM teachers WHERE id = ?', [cls.class_teacher_id]) : null;
    const sig = cls && cls.class_teacher_id ? get('SELECT data FROM teacher_signatures WHERE teacher_id = ?', [cls.class_teacher_id]) : null;
    return { principal: getSetting('principalSignature') || '', teacher: sig ? sig.data : '', teacherName: t ? t.name : '' };
  },
  deleteTeacher(id) {
    transaction(() => {
      exec('DELETE FROM teacher_assignments WHERE teacher_id = ?', [id]);
      exec('DELETE FROM teacher_signatures WHERE teacher_id = ?', [id]);
      exec('DELETE FROM teacher_salaries WHERE teacher_id = ?', [id]);
      exec('DELETE FROM teacher_history WHERE teacher_id = ?', [id]);
      exec('UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = ?', [id]);
      exec("DELETE FROM attendance WHERE kind = 'teacher' AND person_id = ?", [id]);
      exec('DELETE FROM teachers WHERE id = ?', [id]);
    });
    return true;
  },
  addAssignment(teacherId, classId, subject) {
    subject = needText(subject, 'Subject');
    const t = get('SELECT section FROM teachers WHERE id = ?', [teacherId]);
    if (!t || !get('SELECT id FROM classes WHERE id = ? AND section = ?', [classId, t.section])) throw new Error('Choose a class from this section.');
    if (get('SELECT id FROM teacher_assignments WHERE teacher_id = ? AND class_id = ? AND LOWER(subject) = LOWER(?)', [teacherId, classId, subject])) throw new Error('This assignment already exists.');
    return run('INSERT INTO teacher_assignments (teacher_id, class_id, subject) VALUES (?,?,?)', [teacherId, classId, subject]);
  },
  removeAssignment(id) {
    run('DELETE FROM teacher_assignments WHERE id = ?', [id]);
    return true;
  },

  /* ---------- Attendance ---------- */
  /** Marked days for one month ("YYYY-MM"): status P (present) or L (leave). A day with no row is an absence. */
  getAttendance(section, kind, month) {
    needSection(section);
    return all('SELECT person_id, date, status, marked_at FROM attendance WHERE section = ? AND kind = ? AND date LIKE ?', [section, kind, `${month}-%`]);
  },
  /** state: 'P' present, 'L' leave, anything else (false) = absent. true still means present. */
  setAttendance(section, kind, personId, date, state) {
    needSection(section);
    if (!['student', 'teacher'].includes(kind)) throw new Error('Invalid attendance type.');
    if (Number.isNaN(new Date(`${date}T00:00:00`).getTime())) throw new Error('Invalid date.');
    const off = offDay(section, date);
    if (off) throw new Error(off);
    const st = state === true || state === 'P' ? 'P' : state === 'L' ? 'L' : '';
    if (st) {                                                  // nothing can be marked after the exit date
      const ex = kind === 'student' ? get("SELECT status_date AS d FROM students WHERE id = ? AND status <> 'Active'", [personId]) : get("SELECT left_on AS d FROM teachers WHERE id = ? AND status <> 'Active'", [personId]);
      if (ex && ex.d && date > String(ex.d).slice(0, 10)) throw new Error(`Attendance cannot be marked after the exit date (${String(ex.d).slice(0, 10)}).`);
    }
    if (st && kind === 'student') {
      const s = get('SELECT admission_date, admitted_on FROM students WHERE id = ?', [personId]);
      const m = s && (monthOf(s.admission_date) || monthOf(s.admitted_on));
      if (m && date.slice(0, 7) < m) throw new Error('This student was admitted after this month.');
    }
    if (st) run('INSERT INTO attendance (section, kind, person_id, date, marked_at, marked_by, status) VALUES (?,?,?,?,?,?,?) ON CONFLICT(kind, person_id, date) DO UPDATE SET status = excluded.status, marked_at = excluded.marked_at', [section, kind, personId, date, nowStamp(), 'admin', st]);
    else run('DELETE FROM attendance WHERE kind = ? AND person_id = ? AND date = ?', [kind, personId, date]);
    return nowStamp();
  },

  /* ---- Custom holidays and leaves, per section and day (Fridays are always off) ---- */
  getHolidays(section, month) {
    needSection(section);
    return all('SELECT date, name FROM holidays WHERE section = ? AND date LIKE ? ORDER BY date', [section, `${month}-%`]);
  },
  /** Marks every day from `from` to `to` (one day if `to` is empty) as a holiday. Fridays are skipped. `both` applies it to both sections. */
  saveHoliday(x) {
    const sections = x.both ? SECTIONS : [x.section];
    sections.forEach(needSection);
    const name = needText(x.name, 'Holiday name').slice(0, 60);
    const from = normDate(x.from), to = normDate(x.to) || from;
    if (!from || !to) throw new Error('Choose a valid date.');
    if (to < from) throw new Error('The last day cannot be before the first day.');
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > 62) throw new Error('A holiday can span at most 63 days.');
    let n = 0;
    transaction(() => {
      for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000) {
        const day = new Date(t).toISOString().slice(0, 10);
        if (new Date(`${day}T12:00:00Z`).getUTCDay() === 5) continue;
        for (const sec of sections) exec('INSERT INTO holidays (section, date, name) VALUES (?,?,?) ON CONFLICT(section, date) DO UPDATE SET name = excluded.name', [sec, day, name]);
        n++;
      }
    });
    return n;
  },
  deleteHoliday(section, date) { needSection(section); run('DELETE FROM holidays WHERE section = ? AND date = ?', [section, date]); return true; },

  /* ---- Teacher portal: one saved sheet per class per day, locked afterwards ---- */
  getClassRoster(section, classId, date) {
    needSection(section);
    const cls = get('SELECT * FROM classes WHERE id = ? AND section = ?', [classId, section]);
    if (!cls) throw new Error('Choose a class.');
    const students = all(
      `SELECT s.id, s.roll_no, s.name, (SELECT data FROM student_photos p WHERE p.student_id = s.id) AS photo
       FROM students s WHERE s.section = ? AND s.class_id = ? AND s.status = 'Active' AND ${ADMIT_MONTH} <= ? ${STUDENT_ORDER}`, [section, classId, String(date).slice(0, 7)]);
    const marks = new Map(all("SELECT person_id, status FROM attendance WHERE kind = 'student' AND section = ? AND date = ?", [section, date]).map(r => [r.person_id, r.status]));
    const lock = get('SELECT locked_at FROM attendance_locks WHERE class_id = ? AND date = ?', [classId, date]);
    return { className: cls.name, stream: cls.stream, locked: !!lock, locked_at: lock ? lock.locked_at : null, off: offDay(section, date),
      students: applyOrder(classId, students).map(s => ({ ...s, photo: s.photo || '', state: marks.get(s.id) || '', present: marks.get(s.id) === 'P' })) };
  },
  saveClassAttendance(section, classId, date, presentIds, leaveIds) {
    needSection(section);
    if (!get('SELECT id FROM classes WHERE id = ? AND section = ?', [classId, section])) throw new Error('Choose a class.');
    const d = new Date(`${date}T00:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || Number.isNaN(d.getTime())) throw new Error('Invalid date.');
    const off = offDay(section, date);
    if (off) throw new Error(off);
    if (date > today()) throw new Error('Attendance cannot be saved for a future date.');
    const age = Math.round((new Date(`${today()}T00:00:00`) - d) / 86400000);
    if (age > TEACHER_BACKDATE_DAYS) throw new Error(`Attendance can only be saved for today and the last ${TEACHER_BACKDATE_DAYS} days.`);
    if (get('SELECT 1 AS x FROM attendance_locks WHERE class_id = ? AND date = ?', [classId, date])) throw new Error('This class and day are already saved and locked. Ask the administrator to make changes.');
    const present = new Set((presentIds || []).map(Number)), leave = new Set((leaveIds || []).map(Number));
    const stamp = nowStamp();
    transaction(() => {
      for (const st of all(`SELECT s.id FROM students s WHERE s.section = ? AND s.class_id = ? AND s.status = 'Active' AND ${ADMIT_MONTH} <= ?`, [section, classId, date.slice(0, 7)])) {
        const state = present.has(st.id) ? 'P' : leave.has(st.id) ? 'L' : '';
        if (state) exec('INSERT INTO attendance (section, kind, person_id, date, marked_at, marked_by, status) VALUES (?,?,?,?,?,?,?) ON CONFLICT(kind, person_id, date) DO UPDATE SET status = excluded.status, marked_at = excluded.marked_at', [section, 'student', st.id, date, stamp, 'teacher', state]);
        else exec("DELETE FROM attendance WHERE kind = 'student' AND person_id = ? AND date = ?", [st.id, date]);
      }
      exec('INSERT INTO attendance_locks (section, class_id, date, locked_at) VALUES (?,?,?,?)', [section, classId, date, stamp]);
    });
    return { locked_at: stamp };
  },
  getAttendanceLocks(section, month) {
    needSection(section);
    return all(
      `SELECT l.class_id, c.name AS class_name, c.stream, l.date, l.locked_at
       FROM attendance_locks l JOIN classes c ON c.id = l.class_id
       WHERE l.section = ? AND l.date LIKE ? ORDER BY l.date DESC, c.name`, [section, `${month}-%`]);
  },
  unlockAttendance(classId, date) {
    run('DELETE FROM attendance_locks WHERE class_id = ? AND date = ?', [classId, date]);
    return true;
  },

  /* ---- Student sequence per class: saved order + lock (attendance sheets) ---- */
  getClassOrders(section) {
    needSection(section);
    const out = {};
    for (const c of all('SELECT id FROM classes WHERE section = ?', [section])) out[c.id] = { locked: false, order: [] };
    for (const r of all('SELECT o.class_id, o.student_id FROM class_student_order o JOIN classes c ON c.id = o.class_id WHERE c.section = ? ORDER BY o.class_id, o.position', [section])) if (out[r.class_id]) out[r.class_id].order.push(r.student_id);
    for (const r of all('SELECT l.class_id, l.locked FROM class_order_locks l JOIN classes c ON c.id = l.class_id WHERE c.section = ?', [section])) if (out[r.class_id]) out[r.class_id].locked = !!r.locked;
    return out;
  },
  saveClassOrder(classId, ids) {
    classId = Number(classId);
    if (!get('SELECT id FROM classes WHERE id = ?', [classId])) throw new Error('Choose a class.');
    if (orderLocked(classId)) throw new Error('The student order of this class is locked. Unlock it first.');
    writeOrder(classId, ids);
    return true;
  },
  /** Back to the default sequence (roll number order). */
  sortClassByRoll(classId) {
    classId = Number(classId);
    if (orderLocked(classId)) throw new Error('The student order of this class is locked. Unlock it first.');
    run('DELETE FROM class_student_order WHERE class_id = ?', [classId]);
    return true;
  },
  /** Locking saves the sequence permanently (the one shown on screen, or roll order if none was saved). */
  setClassOrderLock(classId, locked, ids) {
    classId = Number(classId);
    if (!get('SELECT id FROM classes WHERE id = ?', [classId])) throw new Error('Choose a class.');
    const stamp = nowStamp();
    if (locked) {
      if (!orderLocked(classId)) {
        if (Array.isArray(ids) && ids.length) writeOrder(classId, ids);
        else if (!get('SELECT 1 AS x FROM class_student_order WHERE class_id = ?', [classId])) writeOrder(classId, all(`SELECT s.id FROM students s WHERE s.class_id = ? ${STUDENT_ORDER}`, [classId]).map(r => r.id));
      }
      run('INSERT INTO class_order_locks (class_id, locked, locked_at) VALUES (?,1,?) ON CONFLICT(class_id) DO UPDATE SET locked = 1, locked_at = excluded.locked_at', [classId, stamp]);
    } else run('INSERT INTO class_order_locks (class_id, locked, locked_at) VALUES (?,0,?) ON CONFLICT(class_id) DO UPDATE SET locked = 0, locked_at = excluded.locked_at', [classId, stamp]);
    return { locked: !!locked, locked_at: stamp };
  },

  /* ---- Timetable: schedules (normal days / Thursday / Saturday ...), periods with times, and a subject + teacher in every class x period cell ---- */
  getTimetable(section) {
    needSection(section);
    const schedules = all('SELECT * FROM timetable_schedules WHERE section = ? ORDER BY sort_order, id', [section]);
    const ids = schedules.map(s => s.id), q = ids.length ? ids.map(() => '?').join(',') : 'NULL';
    const periods = all(`SELECT id, schedule_id, label, start_time, end_time, is_break FROM timetable_periods WHERE schedule_id IN (${q}) ORDER BY sort_order, id`, ids);
    const cells = all(`SELECT schedule_id, class_id, period_id, subject, teacher FROM timetable_cells WHERE schedule_id IN (${q})`, ids);
    return schedules.map(s => ({
      id: s.id, name: s.name, days: s.days ? s.days.split(',').map(Number) : [],
      periods: periods.filter(p => p.schedule_id === s.id).map(p => ({ ...p, is_break: !!p.is_break })),
      cells: cells.filter(c => c.schedule_id === s.id)
    }));
  },
  saveTimetableSchedule(x) {
    needSection(x.section);
    const name = needText(x.name, 'Schedule name').slice(0, 60);
    const days = [...new Set((x.days || []).map(Number))].filter(d => d >= 0 && d <= 6).sort((a, b) => a - b).join(',');
    if (x.id) {
      if (!get('SELECT id FROM timetable_schedules WHERE id = ? AND section = ?', [x.id, x.section])) throw new Error('Schedule not found.');
      run('UPDATE timetable_schedules SET name = ?, days = ? WHERE id = ?', [name, days, x.id]);
      return x.id;
    }
    const order = get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM timetable_schedules WHERE section = ?', [x.section]).n;
    return run('INSERT INTO timetable_schedules (section, name, days, sort_order) VALUES (?,?,?,?)', [x.section, name, days, order]);
  },
  deleteTimetableSchedule(id) {
    transaction(() => {
      exec('DELETE FROM timetable_cells WHERE schedule_id = ?', [id]);
      exec('DELETE FROM timetable_periods WHERE schedule_id = ?', [id]);
      exec('DELETE FROM timetable_schedules WHERE id = ?', [id]);
    });
    return true;
  },
  /** Copies a schedule with its periods and every cell, so Thursday or Saturday can start from the normal day. */
  duplicateTimetableSchedule(fromId, name, days) {
    const src = get('SELECT * FROM timetable_schedules WHERE id = ?', [fromId]);
    if (!src) throw new Error('Schedule not found.');
    const newId = api.saveTimetableSchedule({ section: src.section, name, days });
    transaction(() => {
      const map = new Map();
      for (const p of all('SELECT * FROM timetable_periods WHERE schedule_id = ? ORDER BY sort_order, id', [fromId])) {
        exec('INSERT INTO timetable_periods (schedule_id, label, start_time, end_time, is_break, sort_order) VALUES (?,?,?,?,?,?)', [newId, p.label, p.start_time, p.end_time, p.is_break, p.sort_order]);
        map.set(p.id, lastId());
      }
      for (const c of all('SELECT * FROM timetable_cells WHERE schedule_id = ?', [fromId])) if (map.has(c.period_id)) exec('INSERT INTO timetable_cells (schedule_id, class_id, period_id, subject, teacher) VALUES (?,?,?,?,?)', [newId, c.class_id, map.get(c.period_id), c.subject, c.teacher]);
    });
    return newId;
  },
  saveTimetablePeriod(x) {
    const sch = get('SELECT id FROM timetable_schedules WHERE id = ?', [x.schedule_id]);
    if (!sch) throw new Error('Schedule not found.');
    const label = needText(x.label, 'Period name').slice(0, 40);
    const start = String(x.start || '').trim(), end = String(x.end || '').trim();
    if ((start && !TT_TIME.test(start)) || (end && !TT_TIME.test(end))) throw new Error('Times must look like 08:30.');
    if (start && end && end <= start) throw new Error('A period must end after it starts.');
    if (x.id) {
      if (!get('SELECT id FROM timetable_periods WHERE id = ? AND schedule_id = ?', [x.id, x.schedule_id])) throw new Error('Period not found.');
      run('UPDATE timetable_periods SET label = ?, start_time = ?, end_time = ?, is_break = ? WHERE id = ?', [label, start, end, x.is_break ? 1 : 0, x.id]);
      return x.id;
    }
    const order = get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM timetable_periods WHERE schedule_id = ?', [x.schedule_id]).n;
    return run('INSERT INTO timetable_periods (schedule_id, label, start_time, end_time, is_break, sort_order) VALUES (?,?,?,?,?,?)', [x.schedule_id, label, start, end, x.is_break ? 1 : 0, order]);
  },
  deleteTimetablePeriod(id) {
    transaction(() => { exec('DELETE FROM timetable_cells WHERE period_id = ?', [id]); exec('DELETE FROM timetable_periods WHERE id = ?', [id]); });
    return true;
  },
  moveTimetablePeriod(id, direction) {
    const p = get('SELECT schedule_id FROM timetable_periods WHERE id = ?', [id]);
    if (!p) throw new Error('Period not found.');
    const list = all('SELECT id FROM timetable_periods WHERE schedule_id = ? ORDER BY sort_order, id', [p.schedule_id]).map(r => r.id);
    const i = list.indexOf(id), j = direction === 'left' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return true;
    [list[i], list[j]] = [list[j], list[i]];
    transaction(() => list.forEach((pid, idx) => exec('UPDATE timetable_periods SET sort_order = ? WHERE id = ?', [idx + 1, pid])));
    return true;
  },
  saveTimetableCell(x) {
    const per = get('SELECT p.id, s.section FROM timetable_periods p JOIN timetable_schedules s ON s.id = p.schedule_id WHERE p.id = ? AND p.schedule_id = ?', [x.period_id, x.schedule_id]);
    if (!per) throw new Error('Period not found.');
    if (!get('SELECT id FROM classes WHERE id = ? AND section = ?', [x.class_id, per.section])) throw new Error('Class not found.');
    const subject = String(x.subject || '').trim().slice(0, 80), teacher = String(x.teacher || '').trim().slice(0, 80);
    if (!subject && !teacher) run('DELETE FROM timetable_cells WHERE period_id = ? AND class_id = ?', [x.period_id, x.class_id]);
    else run('INSERT INTO timetable_cells (schedule_id, class_id, period_id, subject, teacher) VALUES (?,?,?,?,?) ON CONFLICT(period_id, class_id) DO UPDATE SET subject = excluded.subject, teacher = excluded.teacher', [x.schedule_id, x.class_id, x.period_id, subject, teacher]);
    return true;
  },
  /** First-time setup: a normal-day schedule plus Thursday (جمعرات) and Saturday (ہفتہ), with example timings the admin then edits. */
  quickStartTimetable(section) {
    needSection(section);
    if (get('SELECT 1 AS x FROM timetable_schedules WHERE section = ?', [section])) throw new Error('This section already has a timetable.');
    const make = (name, days, periods) => {
      const id = api.saveTimetableSchedule({ section, name, days });
      periods.forEach(([label, start, end, brk]) => api.saveTimetablePeriod({ schedule_id: id, label, start, end, is_break: brk }));
    };
    const P = n => `Period ${n}`;
    make('Normal days', [0, 1, 2, 3], [[P(1), '08:00', '08:40'], [P(2), '08:40', '09:20'], [P(3), '09:20', '10:00'], ['Break', '10:00', '10:20', true], [P(4), '10:20', '11:00'], [P(5), '11:00', '11:40'], [P(6), '11:40', '12:20'], [P(7), '12:20', '13:00']]);
    make('Thursday - جمعرات', [4], [[P(1), '08:00', '08:35'], [P(2), '08:35', '09:10'], [P(3), '09:10', '09:45'], ['Break', '09:45', '10:05', true], [P(4), '10:05', '10:40'], [P(5), '10:40', '11:15']]);
    make('Saturday - ہفتہ', [6], [[P(1), '08:00', '08:40'], [P(2), '08:40', '09:20'], [P(3), '09:20', '10:00'], ['Break', '10:00', '10:20', true], [P(4), '10:20', '11:00'], [P(5), '11:00', '11:40'], [P(6), '11:40', '12:20']]);
    return true;
  },

  /* ---------- Fees & fines ---------- */
  getFeeSheet(section, month) {
    needSection(section);
    return feeSheet(section, month);
  },
  getFeeAccount(studentId, month) {
    const s = get(`${STUDENT_SELECT} WHERE s.id = ?`, [studentId]);
    if (!s) throw new Error('Student not found.');
    const fines = all('SELECT * FROM fines WHERE student_id = ? ORDER BY date DESC, id DESC', [studentId]);
    const acct = buildAccount(s, month, all('SELECT * FROM fee_payments WHERE student_id = ? ORDER BY month', [studentId]), fines);
    return { student: { id: s.id, name: s.name, roll_no: s.roll_no, class_name: s.class_name, fee: s.fee, status: s.status }, ...acct, fines };
  },
  /** Records a payment. It clears the oldest dues first, then the selected month. */
  collectFee(studentId, month, amount, date) {
    amount = round2(Number(amount));
    if (!(amount > 0)) throw new Error('Enter an amount greater than zero.');
    const s = get(`${STUDENT_SELECT} WHERE s.id = ?`, [studentId]);
    if (!s) throw new Error('Student not found.');
    const pays = all('SELECT * FROM fee_payments WHERE student_id = ? ORDER BY month', [studentId]);
    const acct = buildAccount(s, month, pays, []);
    const max = round2(acct.previous + acct.currentOwed);
    if (amount > max + 0.001) throw new Error(`The most that can be collected is ${max}.`);
    const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date : today();
    let rest = amount;
    transaction(() => {
      if (s.opening_dues > 0) {
        const take = Math.min(rest, s.opening_dues);
        exec('UPDATE students SET opening_dues = opening_dues - ? WHERE id = ?', [round2(take), studentId]);
        rest = round2(rest - take);
      }
      for (const m of acct.months) {
        if (rest <= 0) break;
        if (m.owed <= 0) continue;
        const take = round2(Math.min(rest, m.owed));
        exec(`INSERT INTO fee_payments (student_id, month, due, paid, paid_on) VALUES (?,?,?,?,?)
              ON CONFLICT(student_id, month) DO UPDATE SET paid = paid + excluded.paid, paid_on = excluded.paid_on`,
          [studentId, m.month, m.due, take, paidOn]);
        rest = round2(rest - take);
      }
    });
    return true;
  },
  addFine(studentId, amount, reason, date) {
    amount = Number(amount);
    if (!(amount > 0)) throw new Error('Enter a fine amount greater than zero.');
    if (!get('SELECT id FROM students WHERE id = ?', [studentId])) throw new Error('Student not found.');
    return run('INSERT INTO fines (student_id, date, amount, reason, paid) VALUES (?,?,?,?,0)', [studentId, /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date : today(), amount, str(reason)]);
  },
  payFine(id) {
    run('UPDATE fines SET paid = amount WHERE id = ?', [id]);
    return true;
  },
  deleteFine(id) {
    run('DELETE FROM fines WHERE id = ?', [id]);
    return true;
  },

  /** Twelve months of attendance and fees (current month and the eleven before it). Months before admission are flagged. */
  /** `year`: a four-digit year, or 'all'. Defaults to the current year. Months before admission are greyed (not tracked). */
  getStudentReport(studentId, year) {
    const s = get(`${STUDENT_SELECT} WHERE s.id = ?`, [studentId]);
    if (!s) throw new Error('Student not found.');
    const cur = today().slice(0, 7);
    const start = monthOf(s.admission_date) || monthOf(s.admitted_on) || backMonths(cur, 11);
    const years = yearList(start < cur ? start : cur, cur);
    const sel = String(year) === 'all' ? 'all' : (years.includes(String(year)) ? String(year) : cur.slice(0, 4));
    const months = reportMonths(start < cur ? start : cur, cur, sel);
    const acct = buildAccount(s, cur, all('SELECT * FROM fee_payments WHERE student_id = ? ORDER BY month', [studentId]), []);
    const byMonth = new Map(acct.months.map(x => [x.month, x]));
    const exitDate = s.status !== 'Active' && s.status_date ? String(s.status_date).slice(0, 10) : '', endM = monthOf(exitDate) || '9999-12';
    const att = monthlyAttendance('student', studentId, months, exitDate), hols = holidaysByMonth(s.section, months);
    return {
      start, years, year: sel, exit_date: exitDate, exit_status: exitDate ? s.status : '',
      history: studentHistory(s),
      current: { status: s.status, status_date: s.status_date, session: s.session },
      hostel: studentHostel(s),
      funds: studentFunds(studentId),
      fee_schedule: feeSchedule('student', studentId),
      attendance: months.map(month => {
        const tracked = month >= start && month <= endM, a = att.get(month) || { p: 0, l: 0 };
        const present = a.p, working = tracked ? workingDaysIn(month, hols.get(month), exitDate) : 0;
        return { month, tracked, after: month > endM, present, leave: a.l, working, pct: working ? Math.min(Math.round((present / working) * 1000) / 10, 100) : 0 };
      }),
      fees: months.map(month => { const x = byMonth.get(month); return { month, tracked: month >= start && month <= endM, after: month > endM, due: x ? x.due : 0, paid: x ? x.paid : 0 }; })
    };
  },

  /* ---------- Subjects assigned to classes ---------- */
  getClassSubjects(classId) {
    return all('SELECT id, class_id, subject, total, sort_order FROM class_subjects WHERE class_id = ? ORDER BY sort_order, id', [classId]);
  },
  getAllClassSubjects(section) {
    needSection(section);
    return all('SELECT cs.* FROM class_subjects cs JOIN classes c ON c.id = cs.class_id WHERE c.section = ? ORDER BY cs.class_id, cs.sort_order, cs.id', [section]);
  },
  saveClassSubject(x) {
    const subject = needText(x.subject, 'Subject name');
    const total = Number(x.total);
    if (!(total > 0)) throw new Error('Total marks must be greater than zero.');
    if (!get('SELECT id FROM classes WHERE id = ?', [x.class_id])) throw new Error('Class not found.');
    if (get('SELECT id FROM class_subjects WHERE class_id = ? AND LOWER(subject) = LOWER(?) AND id IS NOT ?', [x.class_id, subject, x.id ?? null])) throw new Error('This class already has that subject.');
    if (x.id) { run('UPDATE class_subjects SET subject = ?, total = ? WHERE id = ?', [subject, total, x.id]); return x.id; }
    const ord = get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM class_subjects WHERE class_id = ?', [x.class_id]).n;
    return run('INSERT INTO class_subjects (class_id, subject, total, sort_order) VALUES (?,?,?,?)', [x.class_id, subject, total, ord]);
  },
  deleteClassSubject(id) { run('DELETE FROM class_subjects WHERE id = ?', [id]); return true; },
  moveClassSubject(id, direction) {
    const row = get('SELECT class_id FROM class_subjects WHERE id = ?', [id]);
    if (!row) throw new Error('Subject not found.');
    const list = all('SELECT id FROM class_subjects WHERE class_id = ? ORDER BY sort_order, id', [row.class_id]).map(r => r.id);
    const i = list.indexOf(id), j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return true;
    [list[i], list[j]] = [list[j], list[i]];
    transaction(() => list.forEach((sid, idx) => exec('UPDATE class_subjects SET sort_order = ? WHERE id = ?', [idx + 1, sid])));
    return true;
  },
  /** Adds the subjects of one class to another (subjects the target already has are skipped). */
  copyClassSubjects(fromId, toId) {
    if (fromId === toId) throw new Error('Choose a different class to copy from.');
    let added = 0;
    transaction(() => {
      let ord = get('SELECT COALESCE(MAX(sort_order), 0) AS n FROM class_subjects WHERE class_id = ?', [toId]).n;
      for (const r of all('SELECT subject, total FROM class_subjects WHERE class_id = ? ORDER BY sort_order, id', [fromId])) {
        if (get('SELECT id FROM class_subjects WHERE class_id = ? AND LOWER(subject) = LOWER(?)', [toId, r.subject])) continue;
        exec('INSERT INTO class_subjects (class_id, subject, total, sort_order) VALUES (?,?,?,?)', [toId, r.subject, r.total, ++ord]);
        added++;
      }
    });
    return added;
  },

  /* ---------- Exam names ---------- */
  getExams(section) {
    needSection(section);
    ensureExams(section);
    scheduleSave();
    return all('SELECT e.*, (SELECT name FROM classes c WHERE c.id = e.class_id) AS class_name FROM exams e WHERE e.section = ? ORDER BY e.sort_order, e.id', [section]);
  },
  saveExam(e) {
    needSection(e.section);
    const name = needText(e.name, 'Exam name');
    const classId = e.class_id ? Number(e.class_id) : null;
    const stream = classId ? null : (e.stream || null);
    if (stream && !STREAMS.includes(stream)) throw new Error('Choose a valid stream.');
    if (classId && !get('SELECT id FROM classes WHERE id = ? AND section = ?', [classId, e.section])) throw new Error('Choose a class from this section.');
    if (get('SELECT id FROM exams WHERE section = ? AND LOWER(name) = LOWER(?) AND stream IS ? AND class_id IS ? AND id IS NOT ?', [e.section, name, stream, classId, e.id ?? null])) throw new Error('This exam already exists for that scope.');
    if (e.id) {
      const old = get('SELECT * FROM exams WHERE id = ?', [e.id]);
      if (!old) throw new Error('Exam not found.');
      transaction(() => {
        // Renaming keeps saved marks attached to the exam, unless another exam still uses the old name
        if (old.name !== name && !get('SELECT id FROM exams WHERE section = ? AND name = ? AND id <> ?', [e.section, old.name, e.id])) {
          if (get('SELECT 1 AS x FROM marks m JOIN students s ON s.id = m.student_id WHERE s.section = ? AND m.exam = ?', [e.section, name])) throw new Error('Marks are already saved under that exam name. Choose a different name.');
          exec('UPDATE marks SET exam = ? WHERE exam = ? AND student_id IN (SELECT id FROM students WHERE section = ?)', [name, old.name, e.section]);
        }
        exec('UPDATE exams SET name = ?, stream = ?, class_id = ? WHERE id = ?', [name, stream, classId, e.id]);
      });
      return e.id;
    }
    const ord = get('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM exams WHERE section = ?', [e.section]).n;
    return run('INSERT INTO exams (section, name, stream, class_id, sort_order) VALUES (?,?,?,?,?)', [e.section, name, stream, classId, ord]);
  },
  deleteExam(id) {
    const e = get('SELECT section FROM exams WHERE id = ?', [id]);
    if (!e) return true;
    if (get('SELECT COUNT(*) AS n FROM exams WHERE section = ?', [e.section]).n <= 1) throw new Error('Keep at least one exam. Saved marks are not deleted when an exam name is removed.');
    run('DELETE FROM exams WHERE id = ?', [id]);
    return true;
  },

  /** Everything the class result sheet needs: assigned subjects first, then any others that have marks. */
  getClassResults(section, classId, exam, year) {
    needSection(section);
    const cls = get('SELECT * FROM classes WHERE id = ? AND section = ?', [classId, section]);
    if (!cls) throw new Error('Choose a class.');
    const assigned = api.getClassSubjects(classId);
    const rows = all(
      `SELECT s.id AS student_id, s.roll_no, s.name, s.father_name, m.subject, m.obtained, m.total
       FROM marks m JOIN students s ON s.id = m.student_id
       WHERE s.section = ? AND s.class_id = ? AND m.exam = ? AND m.year = ?
       ORDER BY CAST(s.roll_no AS INTEGER), s.roll_no, m.rowid`, [section, classId, exam, String(year)]);
    const subjects = assigned.map(a => ({ name: a.subject, total: a.total }));
    const students = new Map();
    for (const r of rows) {
      if (!subjects.some(x => x.name.toLowerCase() === r.subject.toLowerCase())) subjects.push({ name: r.subject, total: r.total });
      if (!students.has(r.student_id)) students.set(r.student_id, { id: r.student_id, roll_no: r.roll_no, name: r.name, father_name: r.father_name, marks: {} });
      students.get(r.student_id).marks[r.subject.toLowerCase()] = { obtained: r.obtained, total: r.total };
    }
    const without = get("SELECT COUNT(*) AS n FROM students WHERE section = ? AND class_id = ? AND status = 'Active'", [section, classId]).n - students.size;
    return { className: cls.name, stream: cls.stream, subjects, students: [...students.values()], withoutMarks: Math.max(without, 0) };
  },

  /* ---------- Results ---------- */
  getMarks(studentId, exam, year) {
    return all('SELECT subject, obtained, total FROM marks WHERE student_id = ? AND exam = ? AND year = ? ORDER BY rowid', [studentId, exam, String(year)]);
  },
  saveMarks(studentId, exam, year, rows) {
    year = String(year);
    transaction(() => {
      exec('DELETE FROM marks WHERE student_id = ? AND exam = ? AND year = ?', [studentId, exam, year]);
      for (const r of rows) exec('INSERT INTO marks (student_id, exam, year, subject, obtained, total) VALUES (?,?,?,?,?,?)', [studentId, exam, year, r.subject, r.obtained, r.total]);
    });
    return true;
  },
  deleteMarks(studentId, exam, year) {
    run('DELETE FROM marks WHERE student_id = ? AND exam = ? AND year = ?', [studentId, exam, String(year)]);
    return true;
  },
  getResultSummaries(studentId) {
    return all(
      `SELECT exam, year, SUM(obtained) AS obtained, SUM(total) AS total, COUNT(*) AS subjects
       FROM marks WHERE student_id = ? GROUP BY exam, year ORDER BY year DESC, exam`, [studentId]);
  },

  /* ---------- Dashboard ---------- */
  /* ---------- Student documents (the file work itself happens in main.js) ---------- */
  getDocumentSummary(section) {
    needSection(section);
    return all(`SELECT d.student_id, COUNT(*) AS n, SUM(d.size) AS bytes, MAX(d.uploaded_at) AS last
                FROM student_documents d JOIN students s ON s.id = d.student_id WHERE s.section = ? GROUP BY d.student_id`, [section]);
  },
  getStudentDocuments(studentId) {
    return all('SELECT id, student_id, original_name, mime, size, uploaded_at FROM student_documents WHERE student_id = ? ORDER BY id DESC', [studentId]);
  },
  deleteStudentDocument(id) {
    const d = get('SELECT student_id, stored_name FROM student_documents WHERE id = ?', [id]);
    if (!d) return true;
    if (d.stored_name) fsp.unlink(path.join(docFolder(d.student_id), d.stored_name)).catch(() => { /* already gone */ });
    run('DELETE FROM student_documents WHERE id = ?', [id]);
    return true;
  },

  /* ---------- Fee ledger: what applies from when. Changes only ever start in a later month. ---------- */
  getFeeSchedule(kind, id) {
    if (!['student', 'hostel'].includes(kind)) throw new Error('Unknown fee type.');
    return feeSchedule(kind, id);
  },
  /** Takes back a change that has not started yet. Changes that have started are history and stay. */
  cancelFeeChange(kind, id, month) {
    if (!['student', 'hostel'].includes(kind)) throw new Error('Unknown fee type.');
    if (!(String(month) > today().slice(0, 7))) throw new Error('Only a change that has not started yet can be cancelled.');
    if (!get("SELECT 1 AS x FROM fee_history WHERE kind = ? AND ref_id = ? AND effective_month = ?", [kind, id, month])) throw new Error('That fee change was not found.');
    transaction(() => {
      exec('DELETE FROM fee_history WHERE kind = ? AND ref_id = ? AND effective_month = ?', [kind, id, month]);
      const last = feeRows(kind, id).pop();
      if (last) exec(`UPDATE ${kind === 'hostel' ? 'hostel_residents' : 'students'} SET fee = ? WHERE id = ?`, [last.fee, id]);
    });
    return feeSchedule(kind, id);
  },
  /** One hostel resident: fee changes, month by month, and every payment received. */
  getHostelLedger(id) {
    const r = get('SELECT * FROM hostel_residents WHERE id = ?', [id]);
    if (!r) throw new Error('Resident not found.');
    const month = today().slice(0, 7), hist = feeRows('hostel', id), rows = all('SELECT * FROM hostel_fees WHERE resident_id = ?', [id]);
    return { resident: { id: r.id, name: r.name, room: r.room, status: r.status, joined_on: r.joined_on, left_on: r.left_on, fee: feeAt(hist, month, r.fee) }, month,
      schedule: feeSchedule('hostel', id), months: hostelMonths(r, month, rows, hist).reverse(), payments: all('SELECT * FROM hostel_payments WHERE resident_id = ? ORDER BY paid_on DESC, id DESC', [id]), ...hostelDues(r, month, rows, hist) };
  },

  /* ---------- Teacher history, reports and subject assignment ---------- */
  getTeacherHistory(id) { return all('SELECT * FROM teacher_history WHERE teacher_id = ? ORDER BY date, id', [id]); },
  getTeacherReport(id, year) {
    const t = get('SELECT * FROM teachers WHERE id = ?', [id]);
    if (!t) throw new Error('Teacher not found.');
    delete t.password_hash;
    const cur = today().slice(0, 7);
    const start = monthOf(t.joined_on) || backMonths(cur, 11), end = monthOf(t.left_on) || '9999-12';
    const years = yearList(start < cur ? start : cur, cur);
    const sel = String(year) === 'all' ? 'all' : (years.includes(String(year)) ? String(year) : cur.slice(0, 4));
    const months = reportMonths(start < cur ? start : cur, cur, sel);
    const exitDate = t.status !== 'Active' && t.left_on ? String(t.left_on).slice(0, 10) : '';
    const att = monthlyAttendance('teacher', id, months, exitDate), hols = holidaysByMonth(t.section, months);
    const marks = new Map(all("SELECT SUBSTR(date, 1, 7) AS m, COUNT(*) AS n FROM attendance WHERE kind = 'teacher' AND section = ? AND date >= ? AND date <= ? GROUP BY m", [t.section, `${months[0] || cur}-01`, `${months[months.length - 1] || cur}-31`]).map(r => [r.m, r.n]));
    const attendance = [], salaries = [];
    for (const month of months) {
      const tracked = month >= start && month <= end;
      const hol = hols.get(month), { work } = monthDays(month, t.joined_on, t.left_on, hol);
      const a = att.get(month) || { p: 0, l: 0 }, present = a.p;
      attendance.push({ month, tracked, after: month > end, present, leave: a.l, working: tracked ? work : 0, pct: tracked && work ? Math.min(Math.round((present / work) * 1000) / 10, 100) : 0 });
      if (tracked) {
        const r = salaryRow(t, month, (marks.get(month) || 0) > 0, hol);
        salaries.push({ month, base: r.base, absent: r.absent, deduction: r.deduction, manual: r.manual, net: r.net, status: r.status, paid_on: r.paid_on, remarks: r.remarks });
      }
    }
    return {
      teacher: t, years, year: sel, start, exit_date: exitDate, attendance, salaries, history: api.getTeacherHistory(id),
      assignments: all(`SELECT a.class_id, a.subject, c.name AS class_name, c.stream FROM teacher_assignments a JOIN classes c ON c.id = a.class_id
                        WHERE a.teacher_id = ? ORDER BY ${STREAM_ORDER}, c.sort_order, a.subject`, [id]),
      classTeacherOf: all('SELECT name FROM classes WHERE class_teacher_id = ?', [id]).map(c => c.name)
    };
  },
  /** Every class of a stream with its subjects and the teacher who teaches each (Dars-e-Nizami and the other streams). */
  getSubjectAssignments(section, stream) {
    needSection(section);
    if (!STREAMS.includes(stream)) throw new Error('Choose a stream.');
    return all('SELECT id, name FROM classes WHERE section = ? AND stream = ? ORDER BY sort_order, id', [section, stream]).map(c => {
      const asg = all('SELECT a.teacher_id, a.subject, t.name AS teacher_name FROM teacher_assignments a JOIN teachers t ON t.id = a.teacher_id WHERE a.class_id = ? ORDER BY a.id', [c.id]);
      const names = all('SELECT subject, total FROM class_subjects WHERE class_id = ? ORDER BY sort_order, id', [c.id]);
      const known = new Set(names.map(n => n.subject.toLowerCase()));
      for (const a of asg) if (!known.has(a.subject.toLowerCase())) { known.add(a.subject.toLowerCase()); names.push({ subject: a.subject, total: null }); }
      return {
        class_id: c.id, class_name: c.name,
        subjects: names.map(n => {
          const mine = asg.filter(a => a.subject.toLowerCase() === n.subject.toLowerCase());
          return { subject: n.subject, total: n.total, teacher_id: mine[0] ? mine[0].teacher_id : null, extra: Math.max(mine.length - 1, 0) };
        })
      };
    });
  },
  /** One teacher per subject and class: replaces whoever was assigned before (teacherId null = unassign). */
  setSubjectTeacher(classId, subject, teacherId) {
    subject = needText(subject, 'Subject');
    const c = get('SELECT id, section FROM classes WHERE id = ?', [classId]);
    if (!c) throw new Error('Class not found.');
    if (teacherId) {
      const t = get('SELECT status FROM teachers WHERE id = ? AND section = ?', [teacherId, c.section]);
      if (!t) throw new Error('Choose a teacher from this section.');
      if (t.status && t.status !== 'Active') throw new Error('This teacher is no longer active.');
    }
    transaction(() => {
      exec('DELETE FROM teacher_assignments WHERE class_id = ? AND LOWER(subject) = LOWER(?)', [classId, subject]);
      if (teacherId) exec('INSERT INTO teacher_assignments (teacher_id, class_id, subject) VALUES (?,?,?)', [teacherId, classId, subject]);
    });
    return true;
  },

  /* ---------- Bulk import (students and teachers) ---------- */
  getImportTemplate(kind, section) {
    needSection(section);
    if (kind === 'teachers') return { headers: ['Name', 'Phone', 'Qualification', 'Joining Date', 'Salary', 'Username', 'Password'], sample: ['Muhammad Ahmad', '0300-1234567', 'Dars-e-Nizami', '2026-04-01', '30000', '', ''], classes: [] };
    return {
      headers: ['Roll No', 'Name', "Father's Name", 'Gender', 'Admission Date', 'Stream', 'Class', 'Academic Session', "Father's Phone", 'Emergency Contact', 'Province', 'City', 'District', 'Tehsil', 'Address', 'Monthly Fee', 'Previous Dues'],
      sample: ['101', 'Abdullah', 'Muhammad Ali', 'Male', '2026-04-01', 'School', 'Class 1', '', '0300-1234567', '', 'Punjab', 'Multan', 'Multan', 'Multan City', 'Street 4', '1500', '0'],
      classes: all('SELECT stream, name FROM classes WHERE section = ? ORDER BY sort_order, id', [section]).map(c => [c.stream, c.name])
    };
  },
  /** dryRun = check only (for the preview). Otherwise every valid row is saved and the bad rows are reported. */
  importStudents(section, rows, dryRun) {
    needSection(section);
    if (!Array.isArray(rows) || !rows.length) throw new Error('The file has no rows.');
    const classes = all('SELECT id, stream, name FROM classes WHERE section = ?', [section]);
    const seen = new Set(all('SELECT roll_no FROM students WHERE section = ?', [section]).map(r => String(r.roll_no).toLowerCase()));
    const errors = [], valid = [];
    rows.slice(0, 5000).forEach((raw, i) => {
      const r = mapRow(raw, IMPORT_STUDENT_COLS), line = i + 2;
      try {
        const roll = needText(r.roll_no, 'Roll No'), name = needText(r.name, 'Name');
        if (seen.has(roll.toLowerCase())) throw new Error(`Roll number ${roll} already exists.`);
        const cn = str(r.class).toLowerCase(), st = str(r.stream).toLowerCase();
        if (!cn) throw new Error('Class is required.');
        const hit = classes.filter(c => c.name.toLowerCase() === cn && (!st || c.stream.toLowerCase() === st));
        if (hit.length !== 1) throw new Error(hit.length ? `Class "${r.class}" exists in several streams: fill the Stream column.` : `Class "${r.class}"${st ? ` in stream "${r.stream}"` : ''} was not found.`);
        const date = normDate(r.admission_date);
        if (date === null) throw new Error('Admission date is not valid (use YYYY-MM-DD).');
        const sess = str(r.session);
        if (sess && !get('SELECT 1 AS x FROM sessions WHERE name = ?', [sess])) throw new Error(`Academic session "${sess}" is not defined in Settings.`);
        seen.add(roll.toLowerCase());
        valid.push({ _line: line, _stream: hit[0].stream, _class: hit[0].name, section, roll_no: roll, name, class_id: hit[0].id, father_name: r.father_name, gender: str(r.gender) || (section === 'boys' ? 'Male' : 'Female'),
          admission_date: date || today(), session: sess, father_phone: r.father_phone, emergency_contact: r.emergency_contact, province: r.province, city: r.city, district: r.district, tehsil: r.tehsil,
          address: r.address, fee: r.fee, opening_dues: r.opening_dues });
      } catch (e) { errors.push({ row: line, message: e.message }); }
    });
    if (dryRun) return { total: Math.min(rows.length, 5000), valid: valid.length, errors, sample: valid.slice(0, 8).map(v => [v.roll_no, v.name, v.father_name, `${v._stream}: ${v._class}`, v.session]) };
    let added = 0;
    for (const v of valid) {
      const { _line, _stream, _class, ...stu } = v;
      try { api.saveStudent(stu); added++; } catch (e) { errors.push({ row: _line, message: e.message }); }
    }
    return { total: Math.min(rows.length, 5000), added, errors };
  },
  importTeachers(section, rows, dryRun) {
    needSection(section);
    if (!Array.isArray(rows) || !rows.length) throw new Error('The file has no rows.');
    const seen = new Set(all('SELECT name, phone FROM teachers WHERE section = ?', [section]).map(t => `${String(t.name).toLowerCase()}|${String(t.phone || '')}`));
    const errors = [], valid = [];
    rows.slice(0, 2000).forEach((raw, i) => {
      const r = mapRow(raw, IMPORT_TEACHER_COLS), line = i + 2;
      try {
        const name = needText(r.name, 'Name'), key = `${name.toLowerCase()}|${r.phone || ''}`;
        if (seen.has(key)) throw new Error(`${name} already exists.`);
        const date = normDate(r.joined_on);
        if (date === null) throw new Error('Joining date is not valid (use YYYY-MM-DD).');
        if (r.salary && !(Number(r.salary) >= 0)) throw new Error('Salary must be a number.');
        if (r.username && !r.password) throw new Error('A username needs a password.');
        seen.add(key);
        valid.push({ _line: line, section, name, phone: r.phone, qualification: r.qualification, joined_on: date || today(), salary: r.salary, ...(r.username ? { username: r.username, password: r.password } : {}) });
      } catch (e) { errors.push({ row: line, message: e.message }); }
    });
    if (dryRun) return { total: Math.min(rows.length, 2000), valid: valid.length, errors, sample: valid.slice(0, 8).map(v => [v.name, v.phone, v.qualification, v.joined_on, v.salary]) };
    let added = 0;
    for (const v of valid) { const { _line, ...t } = v; try { api.saveTeacher(t); added++; } catch (e) { errors.push({ row: _line, message: e.message }); } }
    return { total: Math.min(rows.length, 2000), added, errors };
  },

  /* ---------- Unique students: the admin links the profiles that are the same physical person ---------- */
  getUniqueStudents(section, activeOnly) {
    needSection(section);
    const list = all(`${STUDENT_SELECT} WHERE s.section = ? ${activeOnly ? "AND s.status = 'Active'" : ''} ${STUDENT_ORDER}`, [section]);
    const groups = new Map();
    for (const s of list) {
      const key = s.person_id ? 'p' + s.person_id : 's' + s.id;
      if (!groups.has(key)) groups.set(key, { person_id: s.person_id || null, name: s.name, father_name: s.father_name, enrollments: [] });
      groups.get(key).enrollments.push({ id: s.id, roll_no: s.roll_no, stream: s.stream, class_name: s.class_name, status: s.status });
    }
    return {
      unique: groups.size, enrollments: list.length, dual: [...groups.values()].filter(g => g.enrollments.length > 1),
      byStream: Object.fromEntries(STREAMS.map(x => [x, list.filter(s => s.stream === x).length])),
      byClass: api.getClasses(section).map(c => ({ id: c.id, stream: c.stream, name: c.name, count: list.filter(s => s.class_id === c.id).length }))
    };
  },
  /** Marks two profiles as the same person (joins their groups if they already belong to one). One person has one profile per stream. */
  linkStudents(aId, bId) {
    aId = Number(aId); bId = Number(bId);
    if (!aId || !bId || aId === bId) throw new Error('Choose two different student profiles.');
    const a = get(`${STUDENT_SELECT} WHERE s.id = ?`, [aId]), b = get(`${STUDENT_SELECT} WHERE s.id = ?`, [bId]);
    if (!a || !b) throw new Error('Student not found.');
    if (a.section !== b.section) throw new Error('Both profiles must be in the same section.');
    if (a.person_id && a.person_id === b.person_id) throw new Error('These profiles are already linked.');
    const ids = new Set([aId, bId]);
    for (const p of [a.person_id, b.person_id].filter(Boolean)) for (const r of all('SELECT id FROM students WHERE person_id = ?', [p])) ids.add(r.id);
    const members = all(`${STUDENT_SELECT} WHERE s.id IN (${[...ids].map(() => '?').join(',')})`, [...ids]);
    if (new Set(members.map(m => m.stream)).size !== members.length) throw new Error('Two profiles in the same stream cannot be the same person. Link profiles from different streams.');
    const pid = a.person_id || b.person_id || get('SELECT COALESCE(MAX(person_id), 0) + 1 AS n FROM students').n;
    transaction(() => { for (const id of ids) exec('UPDATE students SET person_id = ? WHERE id = ?', [pid, id]); });
    return pid;
  },
  unlinkStudent(id) {
    const s = get('SELECT person_id FROM students WHERE id = ?', [id]);
    if (!s || !s.person_id) return true;
    transaction(() => { exec('UPDATE students SET person_id = NULL WHERE id = ?', [id]); tidyGroup(s.person_id); });
    return true;
  },

  /* ---------- Class transfers and result-card remarks ---------- */
  transferStudent(studentId, toClassId, date, note) {
    const s = get('SELECT id, section, class_id FROM students WHERE id = ?', [studentId]);
    if (!s) throw new Error('Student not found.');
    if (!get('SELECT id FROM classes WHERE id = ? AND section = ?', [toClassId, s.section])) throw new Error('Choose a class in this section.');
    if (s.class_id === Number(toClassId)) throw new Error('The student is already in that class.');
    transaction(() => {
      exec('UPDATE students SET class_id = ? WHERE id = ?', [toClassId, studentId]);
      exec('INSERT INTO class_transfers (student_id, from_class_id, to_class_id, date, note) VALUES (?,?,?,?,?)', [studentId, s.class_id, toClassId, /^\d{4}-\d{2}-\d{2}$/.test(str(date)) ? str(date) : today(), str(note)]);
    });
    return true;
  },
  getTransfers(studentId) {
    return all(`SELECT t.*, (SELECT name FROM classes WHERE id = t.from_class_id) AS from_name, (SELECT name FROM classes WHERE id = t.to_class_id) AS to_name
                FROM class_transfers t WHERE t.student_id = ? ORDER BY t.date DESC, t.id DESC`, [studentId]);
  },
  getRemark(studentId, exam, year) {
    const r = get('SELECT remark FROM result_remarks WHERE student_id = ? AND exam = ? AND year = ?', [studentId, exam, year]);
    return r ? r.remark : '';
  },
  saveRemark(studentId, exam, year, remark) {
    remark = str(remark).slice(0, 500);
    if (!remark) run('DELETE FROM result_remarks WHERE student_id = ? AND exam = ? AND year = ?', [studentId, exam, year]);
    else run('INSERT INTO result_remarks (student_id, exam, year, remark) VALUES (?,?,?,?) ON CONFLICT(student_id, exam, year) DO UPDATE SET remark = excluded.remark', [studentId, exam, year, remark]);
    return remark;
  },
  /** Display names for grades, e.g. { 'A+': 'ممتاز' }. Empty = the grade's own letter. */
  saveGradeLabels(labels) {
    const g = readGrading(), out = {};
    for (const k of Object.keys(DEFAULT_LABELS)) out[k] = str(labels && labels[k]).slice(0, 20) || DEFAULT_LABELS[k];
    g.labels = out;
    setSetting('grading', JSON.stringify(g));
    return out;
  },

  /* ---------- Teacher salaries ---------- */
  /** One row per teacher for a month. Absent days come from teacher attendance (Fridays off, days outside employment excluded). */
  getSalarySheet(section, month) {
    needSection(section);
    if (!/^\d{4}-\d{2}$/.test(String(month))) throw new Error('Choose a month.');
    const marked = get("SELECT COUNT(*) AS n FROM attendance WHERE kind = 'teacher' AND section = ? AND date LIKE ?", [section, `${month}-%`]).n > 0;   // nothing marked = no automatic deduction
    const hol = holidayMap(section, month);
    return all('SELECT * FROM teachers WHERE section = ? ORDER BY name', [section])
      .filter(t => (!t.joined_on || monthOf(t.joined_on) <= month) && (!t.left_on || monthOf(t.left_on) >= month))
      .map(t => salaryRow(t, month, marked, hol));
  },
  saveSalary(x) {
    const t = get('SELECT id, salary FROM teachers WHERE id = ?', [x.teacher_id]);
    if (!t) throw new Error('Teacher not found.');
    if (!/^\d{4}-\d{2}$/.test(String(x.month))) throw new Error('Choose a month.');
    if (!['Paid', 'Unpaid'].includes(x.status)) throw new Error('Status must be Paid or Unpaid.');
    const cur = get('SELECT * FROM teacher_salaries WHERE teacher_id = ? AND month = ?', [t.id, x.month]);
    const manual = x.manual_deduction === '' || x.manual_deduction == null ? null : num(x.manual_deduction);
    const base = x.base !== undefined && x.base !== '' ? num(x.base) : cur ? cur.base : t.salary;
    const paidOn = x.status === 'Paid' ? (cur && cur.status === 'Paid' && cur.paid_on) || today() : null;
    run(`INSERT INTO teacher_salaries (teacher_id, month, base, manual_deduction, status, paid_on, remarks) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(teacher_id, month) DO UPDATE SET base = excluded.base, manual_deduction = excluded.manual_deduction, status = excluded.status, paid_on = excluded.paid_on, remarks = excluded.remarks`,
      [t.id, x.month, base, manual, x.status, paidOn, str(x.remarks).slice(0, 300)]);
    return true;
  },

  /* ---------- Hostel: residents (with extended family), fees, expenses, leave applications ---------- */
  getHostelResidents(section) {
    needSection(section);
    const contacts = groupBy(all('SELECT c.* FROM hostel_contacts c JOIN hostel_residents r ON r.id = c.resident_id WHERE r.section = ? ORDER BY c.id', [section]), 'resident_id');
    return all("SELECT r.*, (SELECT roll_no FROM students WHERE id = r.student_id) AS roll_no FROM hostel_residents r WHERE r.section = ? ORDER BY r.status, r.name", [section])
      .map(r => ({ ...r, contacts: contacts.get(r.id) || [] }));
  },
  saveHostelResident(x) {
    needSection(x.section);
    const contacts = x.contacts === undefined ? null : cleanContacts(x.contacts);            // validated before anything is written
    let name = str(x.name);
    const sid = x.student_id ? Number(x.student_id) : null;
    if (sid) {
      const st = get('SELECT name FROM students WHERE id = ? AND section = ?', [sid, x.section]);
      if (!st) throw new Error('Choose a student from this section.');
      name = name || st.name;
    }
    name = needText(name, 'Resident name');
    const vals = [sid, name, str(x.guardian), str(x.phone), str(x.family).slice(0, 1000), str(x.room), num(x.fee), /^\d{4}-\d{2}-\d{2}$/.test(str(x.joined_on)) ? str(x.joined_on) : today(), x.status === 'Left' ? 'Left' : 'Active'];
    const status = vals[8];
    if (x.id) {
      const cur = get('SELECT fee, status, left_on FROM hostel_residents WHERE id = ? AND section = ?', [x.id, x.section]);
      if (!cur) throw new Error('Resident not found.');
      const feeFrom = num(x.fee) !== cur.fee ? feeStart(x.fee_effective) : null;          // validated before anything is written
      if (feeFrom) setFeeFrom('hostel', x.id, num(x.fee), feeFrom);                       // a new hostel fee starts later; earlier months keep the old one
      run('UPDATE hostel_residents SET student_id=?, name=?, guardian=?, phone=?, family=?, room=?, fee=?, joined_on=?, status=?, left_on=? WHERE id=? AND section=?',
        [...vals, status === 'Left' ? (cur.status === 'Left' && cur.left_on) || today() : null, x.id, x.section]);
      saveContacts(x.id, contacts);
      return x.id;
    }
    const id = run('INSERT INTO hostel_residents (student_id, name, guardian, phone, family, room, fee, joined_on, status, left_on, section) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [...vals, status === 'Left' ? today() : null, x.section]);
    run('INSERT INTO fee_history (kind, ref_id, effective_month, fee) VALUES (?,?,?,?)', ['hostel', id, '0000-00', num(x.fee)]);
    saveContacts(id, contacts);
    return id;
  },
  deleteHostelResident(id) {
    transaction(() => { for (const t of ['hostel_fees', 'hostel_leaves', 'hostel_contacts', 'hostel_payments']) exec(`DELETE FROM ${t} WHERE resident_id = ?`, [id]); exec("DELETE FROM fee_history WHERE kind = 'hostel' AND ref_id = ?", [id]); exec('DELETE FROM hostel_residents WHERE id = ?', [id]); });
    return true;
  },
  getHostelFees(section, month) {
    needSection(section);
    const pays = groupBy(all('SELECT p.* FROM hostel_fees p JOIN hostel_residents r ON r.id = p.resident_id WHERE r.section = ?', [section]), 'resident_id');
    const hists = groupBy(all("SELECT ref_id, effective_month, fee FROM fee_history WHERE kind = 'hostel' AND ref_id IN (SELECT id FROM hostel_residents WHERE section = ?) ORDER BY effective_month", [section]), 'ref_id');
    return all("SELECT * FROM hostel_residents WHERE section = ? AND status = 'Active' ORDER BY name", [section]).filter(r => (monthOf(r.joined_on) || month) <= month)
      .map(r => {
        const d = hostelDues(r, month, pays.get(r.id) || [], hists.get(r.id) || []);
        return { id: r.id, name: r.name, room: r.room, ...d, status: d.payable <= 0 ? 'Paid' : d.previous > 0 ? 'Overdue' : d.paid > 0 ? 'Partial' : 'Unpaid' };
      });
  },
  /** Payments clear the oldest unpaid months first; anything left over goes to the chosen month. */
  collectHostelFee(id, month, amount, date) {
    const r = get('SELECT * FROM hostel_residents WHERE id = ?', [id]);
    if (!r) throw new Error('Resident not found.');
    let left = num(amount);
    if (left <= 0) throw new Error('Enter an amount greater than zero.');
    const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(str(date)) ? str(date) : today();
    const hist = feeRows('hostel', id);
    transaction(() => {
      exec('INSERT INTO hostel_payments (resident_id, amount, paid_on, note) VALUES (?,?,?,?)', [id, left, paidOn, `Payment recorded in ${month}`]);
      for (let m = monthOf(r.joined_on) || month, g = 0; m <= month && left > 0 && g < 720; m = nextMonth(m), g++) {
        const p = get('SELECT due, paid FROM hostel_fees WHERE resident_id = ? AND month = ?', [id, m]);
        const due = p ? p.due : feeAt(hist, m, r.fee), owed = Math.max(due - (p ? p.paid : 0), 0);
        const pay = m === month ? left : Math.min(owed, left);
        if (pay <= 0) continue;
        exec('INSERT INTO hostel_fees (resident_id, month, due, paid, paid_on) VALUES (?,?,?,?,?) ON CONFLICT(resident_id, month) DO UPDATE SET paid = paid + excluded.paid, paid_on = excluded.paid_on', [id, m, due, pay, paidOn]);
        left = round2(left - pay);
      }
    });
    return true;
  },
  getHostelExpenses(section, month) {
    needSection(section);
    return all('SELECT * FROM hostel_expenses WHERE section = ? AND date LIKE ? ORDER BY date DESC, id DESC', [section, `${month}-%`]);
  },
  addHostelExpense(x) {
    needSection(x.section);
    const amount = num(x.amount);
    if (amount <= 0) throw new Error('Enter an amount greater than zero.');
    return run('INSERT INTO hostel_expenses (section, date, category, amount, note) VALUES (?,?,?,?,?)', [x.section, /^\d{4}-\d{2}-\d{2}$/.test(str(x.date)) ? str(x.date) : today(), str(x.category) || 'General', amount, str(x.note)]);
  },
  deleteHostelExpense(id) { run('DELETE FROM hostel_expenses WHERE id = ?', [id]); return true; },
  getHostelLeaves(section) {
    needSection(section);
    return all(`SELECT l.id, l.resident_id, l.from_date, l.to_date, l.reason, l.status, l.returned_on, (l.photo IS NOT NULL AND l.photo <> '') AS has_photo, r.name
                FROM hostel_leaves l JOIN hostel_residents r ON r.id = l.resident_id WHERE r.section = ? ORDER BY l.from_date DESC, l.id DESC`, [section]);
  },
  addHostelLeave(x) {
    if (!get('SELECT id FROM hostel_residents WHERE id = ?', [x.resident_id])) throw new Error('Choose a resident.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str(x.from_date)) || !/^\d{4}-\d{2}-\d{2}$/.test(str(x.to_date)) || x.to_date < x.from_date) throw new Error('Choose valid leave dates (the end cannot be before the start).');
    if (x.photo && !validImage(x.photo)) throw new Error('The application photo must be a PNG, JPG or WEBP image under 2 MB.');
    return run('INSERT INTO hostel_leaves (resident_id, from_date, to_date, reason, status, photo) VALUES (?,?,?,?,?,?)', [x.resident_id, x.from_date, x.to_date, str(x.reason).slice(0, 300), 'Pending', x.photo || null]);
  },
  /** Records the day the resident came back (empty date clears it). */
  markHostelLeaveReturned(id, date) {
    const l = get('SELECT from_date, status FROM hostel_leaves WHERE id = ?', [id]);
    if (!l) throw new Error('Leave not found.');
    const d = date === '' ? null : normDate(date) || today();
    if (d && d < l.from_date) throw new Error('The return date cannot be before the leave starts.');
    run('UPDATE hostel_leaves SET returned_on = ? WHERE id = ?', [d, id]);
    return d;
  },
  setHostelLeaveStatus(id, status) {
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) throw new Error('Unknown status.');
    run('UPDATE hostel_leaves SET status = ? WHERE id = ?', [status, id]);
    return true;
  },
  getHostelLeavePhoto(id) { const r = get('SELECT photo FROM hostel_leaves WHERE id = ?', [id]); return r && r.photo ? r.photo : ''; },
  deleteHostelLeave(id) { run('DELETE FROM hostel_leaves WHERE id = ?', [id]); return true; },

  /* ---------- Student funds portal (money held for a student: deposits and withdrawals) ---------- */
  getFundBalances(section) {
    needSection(section);
    return all(`SELECT s.id AS student_id, s.roll_no, s.name, c.name AS class_name, c.stream, COUNT(*) AS entries,
                       SUM(CASE f.type WHEN 'deposit' THEN f.amount ELSE -f.amount END) AS balance
                FROM student_funds f JOIN students s ON s.id = f.student_id LEFT JOIN classes c ON c.id = s.class_id
                WHERE f.section = ? GROUP BY s.id ORDER BY CAST(s.roll_no AS INTEGER), s.roll_no`, [section]);
  },
  getFundLedger(studentId) { return all('SELECT * FROM student_funds WHERE student_id = ? ORDER BY date DESC, id DESC', [studentId]); },
  addFundEntry(x) {
    const s = get('SELECT id, section FROM students WHERE id = ?', [x.student_id]);
    if (!s) throw new Error('Choose a student.');
    if (!['deposit', 'withdraw'].includes(x.type)) throw new Error('Choose deposit or withdrawal.');
    const amount = num(x.amount);
    if (amount <= 0) throw new Error('Enter an amount greater than zero.');
    const bal = get("SELECT COALESCE(SUM(CASE type WHEN 'deposit' THEN amount ELSE -amount END), 0) AS b FROM student_funds WHERE student_id = ?", [s.id]).b;
    if (x.type === 'withdraw' && amount > bal) throw new Error(`The fund balance is only Rs. ${bal}.`);
    return run('INSERT INTO student_funds (section, student_id, date, type, amount, note) VALUES (?,?,?,?,?,?)', [s.section, s.id, /^\d{4}-\d{2}-\d{2}$/.test(str(x.date)) ? str(x.date) : today(), x.type, amount, str(x.note)]);
  },
  deleteFundEntry(id) {
    const e = get('SELECT * FROM student_funds WHERE id = ?', [id]);
    if (!e) return true;
    const bal = get("SELECT COALESCE(SUM(CASE type WHEN 'deposit' THEN amount ELSE -amount END), 0) AS b FROM student_funds WHERE student_id = ?", [e.student_id]).b;
    if (e.type === 'deposit' && bal - e.amount < 0) throw new Error('Deleting this deposit would make the balance negative.');
    run('DELETE FROM student_funds WHERE id = ?', [id]);
    return true;
  },

  getStats(section, date) {
    needSection(section);
    const n = (sql, p) => get(sql, p).n;
    const sheet = feeSheet(section, String(date).slice(0, 7));
    const statusCounts = Object.fromEntries(STATUSES.map(x => [x, 0]));
    for (const r of all('SELECT status, COUNT(*) AS n FROM students WHERE section = ? GROUP BY status', [section])) if (r.status in statusCounts) statusCounts[r.status] = r.n;
    return {
      students: statusCounts.Active,
      total: Object.values(statusCounts).reduce((t, v) => t + v, 0),
      unique: api.getUniqueStudents(section, false).unique,
      statusCounts,
      teachers: n('SELECT COUNT(*) AS n FROM teachers WHERE section = ?', [section]),
      classes: n('SELECT COUNT(*) AS n FROM classes WHERE section = ?', [section]),
      activeClasses: n("SELECT COUNT(DISTINCT class_id) AS n FROM students WHERE section = ? AND status = 'Active' AND class_id IS NOT NULL", [section]),
      presentToday: n("SELECT COUNT(*) AS n FROM attendance a JOIN students s ON s.id = a.person_id WHERE a.kind = 'student' AND a.section = ? AND a.date = ? AND a.status = 'P' AND s.status = 'Active'", [section, date]),
      leaveToday: n("SELECT COUNT(*) AS n FROM attendance a JOIN students s ON s.id = a.person_id WHERE a.kind = 'student' AND a.section = ? AND a.date = ? AND a.status = 'L' AND s.status = 'Active'", [section, date]),
      off: offDay(section, String(date)),
      collected: round2(sheet.reduce((t, r) => t + r.currentPaid, 0)),
      due: round2(sheet.reduce((t, r) => t + r.currentDue, 0)),
      outstanding: round2(sheet.reduce((t, r) => t + r.payable, 0))
    };
  }
};

module.exports = { open, isOpen, flush, flushAsync, getFilePath, restore, setSettings, docsDir, addDocument, getDocumentFile, api };
