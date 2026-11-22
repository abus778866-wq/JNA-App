/* ==========================================================================
   renderer.js — user interface for Jamia Noor-ul-Anwar
   Screens: setup → login → portal (Boys / Girls) → main app (sidebar + views)
   No framework: each view builds HTML and events use data-* attributes.
   ========================================================================== */
'use strict';

/* ---------- Constants (edit these to change school rules) ---------- */
const INSTITUTE = 'Jamia Noor-ul-Anwar';
const SECTIONS = { boys: 'Boys Section', girls: 'Girls Section' };
const STREAMS = [
  { key: 'Quran', ur: 'قرآن' },
  { key: 'Dars-e-Nizami', ur: 'درس نظامی' },
  { key: 'School', ur: 'سکول' },
  { key: 'Other', ur: 'دیگر' }
];
const STATUSES = ['Active', 'Inactive', 'Left', 'Passed out'];
const DEFAULT_SUBJECTS = {
  'Quran': ['Quran recitation', 'Tajweed', 'Memorization', 'Duas and masail', 'Urdu'],
  'Dars-e-Nizami': ['Sarf', 'Nahw', 'Fiqh', 'Hadith', 'Tafsir', 'Mantiq', 'Arabic adab'],
  'School': ['English', 'Urdu', 'Mathematics', 'Science', 'Islamiat', 'Social studies'],
  'Other': ['Urdu', 'English', 'Mathematics']
};
/** Sidebar by role: [view id, label, icon]. Teachers get a smaller portal. */
const NAV = {
  admin: [
    ['dashboard', 'Dashboard', 'dashboard'], ['admission', 'Admission', 'admission'], ['students', 'Students', 'students'], ['documents', 'Student documents', 'folder'],
    ['reports', 'Reports', 'card'], ['teachers', 'Teachers', 'teachers'], ['subjectassign', 'Subject assignment', 'results'], ['classes', 'Classes', 'classes'],
    ['attendance', 'Attendance', 'attendance'], ['timetable', 'Timetable', 'classes'], ['holidays', 'Holidays and leave', 'attendance'], ['fees', 'Fees', 'fees'], ['salaries', 'Teacher salary', 'fees'], ['hostel', 'Hostel', 'hostel'],
    ['funds', 'Student funds', 'wallet'], ['results', 'Result entry', 'results'], ['classresult', 'Class result', 'results'],
    ['import', 'Data import', 'upload'], ['settings', 'Settings', 'settings']
  ],
  teacher: [
    ['dashboard', 'Dashboard', 'dashboard'], ['mark', 'Mark attendance', 'attendance'], ['timetable', 'Timetable', 'classes'],
    ['reports', 'Reports', 'card'], ['results', 'Result entry', 'results'], ['classresult', 'Class result', 'results']
  ]
};

/* ---------- Tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'Rs. ' + Number(n || 0).toLocaleString('en-US');
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const curMonth = () => ymd(new Date()).slice(0, 7);
const daysIn = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
const dow = (m, d) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, d).getDay(); };
const isFriday = (m, d) => dow(m, d) === 5;
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const fmt1 = n => String(Math.round(n * 10) / 10);

/** Calls the main process; throws a readable Error on failure. */
async function rpc(channel, ...args) {
  const res = await window.api.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
const db = (method, ...args) => rpc('db', method, args);

/** True on phones and small tablets (below 1024 px wide): the layout switches to the drawer menu and stacked content. */
/** True inside the Android app (data is kept in the app's own storage; nothing leaves the phone unless the user taps Export Data). */
const IS_APP = () => !!(window.api && window.api.builtIn);
const isCompact = () => window.matchMedia('(max-width: 1023.98px)').matches;
const closeNavDrawer = () => document.body.classList.remove('nav-open');

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'fade-in rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ' +
    (type === 'ok' ? 'border-l-4 border-gold-400 bg-white/95 text-emerald-900 ring-1 ring-gold-300/50' : 'toast-err');
  t.textContent = msg;
  $('#toast').append(t);
  setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 260); }, 3600);
}

/* ---------- Icons ---------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  admission: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M19 8v6M16 11h6"/>',
  students: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 4a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.6"/>',
  teachers: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  classes: '<path d="M12 3 2 8l10 5 10-5zM2 13l10 5 10-5"/>',
  attendance: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>',
  fees: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h4"/>',
  results: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4"/>',
  card: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  swap: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
};
const ico = (name, cls = 'h-5 w-5') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

Object.assign(ICONS, {
  hostel: '<path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-3v3"/><circle cx="17" cy="13.5" r="1"/>'
});

/** Institution logo (official logo.png unless another one is set in Settings) or a gold crescent badge when none is set. */
function logoEl(size = 'h-12 w-12') {
  if (S.settings.logoData) return `<img src="${S.settings.logoData}" alt="Institution logo" class="${size} shrink-0 rounded-2xl bg-white/90 object-contain p-1 shadow">`;
  return `<div class="${size} grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-200 to-gold-500 text-emerald-950 shadow">${ico('moon', 'h-1/2 w-1/2')}</div>`;
}

/* ---------- Application state ---------- */
const S = {
  screen: 'setup',          // setup | login | portal | settings | main
  status: null,
  settings: { logoUrl: '', logoData: '', principalSignature: '' },
  role: null,               // 'admin' | 'teacher'
  teacherSection: null,     // section of a teacher with an individual login
  settingsTab: 'institute', cfgSection: '', cfgStream: '', gradeScope: 'all', cfg: { classes: [], subjects: [], exams: [] },
  navCollapsed: (() => { try { return localStorage.getItem('navCollapsed') === '1'; } catch { return false; } })(),
  loginKind: 'admin',
  section: null,            // 'boys' | 'girls'
  tab: 'dashboard',
  classes: [],
  fields: [],               // custom admission fields
  students: [],
  nav: 0,                   // guards against stale async renders
  att: { kind: 'student', month: '', classId: '', people: [], present: new Set() },
  filter: { text: '', classId: '' },
  feeClass: '',
  res: null,
  card: null
};

/* ---------- Event delegation (CSP forbids inline handlers) ---------- */
const actions = {}, forms = {}, changes = {}, inputs = {};
const safe = fn => (...a) => Promise.resolve().then(() => fn(...a)).catch(e => toast(e.message || String(e), 'err'));
/** Waits until typing or clicking pauses, then runs once (errors still show as toasts). */
const debounce = (fn, ms = 220) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => safe(fn)(...a), ms); }; };

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) safe(actions[el.dataset.act])(el, e);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  if (forms[f.dataset.form]) safe(forms[f.dataset.form])(f, Object.fromEntries(new FormData(f)));
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) safe(changes[el.dataset.change])(el);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]');
  if (el && inputs[el.dataset.input]) safe(inputs[el.dataset.input])(el);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.combo-list:not(.hidden)')) { closeCombos(); return; }   // close an open location list before anything else
  closeModal();
  closeReceipt();
});

/* ---------- Modal ---------- */
function openModal(title, body, wide = false) {
  $('#modalRoot').innerHTML = `
    <div class="fixed inset-0 z-40 grid place-items-center bg-emerald-900/15 p-6 backdrop-blur-sm fade-in">
      <div class="card max-h-[90vh] overflow-auto ${wide === 'xl' ? 'w-[1180px]' : wide ? 'w-[780px]' : 'w-[520px]'} max-w-[96vw]">
        <div class="mb-5 flex items-center justify-between">
          <h3 class="font-display text-xl font-bold">${title}</h3>
          <button type="button" data-act="closeModal" class="btn-ghost !px-3 !py-1.5">Close</button>
        </div>${body}
      </div>
    </div>`;
}
const closeModal = () => {
  $('#modalRoot').innerHTML = '';
  if (S.uniqDirty) { S.uniqDirty = false; if (S.screen === 'main' && S.tab === 'dashboard') go('dashboard').catch(e => toast(e.message, 'err')); }   // profile links changed: refresh the counts
  if (S.builderOpen) { // the admission form builder was open: reload the form so changes show
    S.builderOpen = false;
    if (S.screen === 'main') go(S.tab).catch(e => toast(e.message, 'err'));
  }
};
actions.closeModal = closeModal;

/* ---------- Live clock (synced with the computer's system time) ---------- */
function tickClock() {
  const c = $('#clock');
  if (!c) return;
  const n = new Date();
  c.innerHTML = `<div class="text-lg font-bold tabular-nums">${n.toLocaleTimeString('en-US')}</div>
    <div class="text-xs text-teal-600">${layoutOf().hijri ? `${esc(hijriDate(n).text)} &middot; ` : ''}${n.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>`;
}
setInterval(tickClock, 1000);

/* ==========================================================================
   Screens
   ========================================================================== */
function render() {
  ({ setup: renderSetup, login: renderLogin, portal: renderPortal, settings: renderSettingsScreen, main: renderMain })[S.screen]();
  if (S.screen !== 'main') $('#app').insertAdjacentHTML('beforeend', `<div class="theme-corner no-print">${themeToggle()}</div>`);   // the main screen has it in the header
}

/* ---------- First launch: choose database folder ---------- */
function renderSetup() {
  $('#app').innerHTML = `
    <div class="grid min-h-screen place-items-center p-6">
      <form data-form="setup" class="card fade-in w-[600px]">
        <div class="mb-6 flex items-center gap-4">${logoEl('h-16 w-16')}
          <div><h1 class="font-display text-2xl font-bold">Choose where to store your data</h1>
          <p class="text-sm text-emerald-900/70">Pick any drive or folder, for example C:\\JamiaData or D:\\SchoolDB. You can change it later in Settings.</p></div>
        </div>
        <label class="label">Database folder</label>
        <div class="flex gap-2">
          <input name="dir" class="field" value="${esc(S.status.dbDir || S.status.defaultDir)}" required>
          <button type="button" data-act="browseDir" class="btn-ghost">Browse</button>
        </div>
        <button class="btn-gold mt-6 w-full">Use this folder</button>
      </form>
    </div>`;
}
actions.browseDir = async () => {
  const dir = await rpc('chooseDbDir');
  if (dir) $('[name=dir]').value = dir;
};
forms.setup = async (f, d) => {
  await rpc('setDbDir', d.dir);
  S.status = await rpc('status');
  await loadSettings();
  S.screen = 'login';
  render();
};
async function loadSettings() { S.settings = { principalSignature: '', ...(await db(S.role ? 'getSettings' : 'getPublicSettings')) }; }

/* ---------- Login (administrator or teacher) ---------- */
function renderLogin() {
  const tab = (kind, label) => `<button type="button" data-act="loginKind" data-kind="${kind}" class="seg flex-1 ${S.loginKind === kind ? 'seg-on' : ''}">${label}</button>`;
  $('#app').innerHTML = `
    <div class="login-wrap grid min-h-screen place-items-center p-4">
      <div class="login-orb login-o1"></div><div class="login-orb login-o2"></div><div class="login-orb login-o3"></div>
      <div class="login-stack">
        <div id="loginPal" class="pal" aria-hidden="true"></div>
        <form data-form="login" class="login-card card fade-in w-[340px] !p-6">
          <div class="mb-3 flex justify-center">${logoEl('h-16 w-16')}</div>
          <h1 class="text-center font-display text-2xl font-bold">${INSTITUTE}</h1>
          <div class="mb-4 mt-4 flex rounded-xl bg-emerald-900/10 p-1">${tab('admin', 'Administrator')}${tab('teacher', 'Teacher')}</div>
          <div class="space-y-3">
            <div><label class="label">Username</label><input name="username" class="field" autocomplete="off" required></div>
            <div><label class="label">Password</label><input name="password" type="password" class="field" required></div>
          </div>
          <button class="btn-primary mt-5 w-full">Sign in</button>
        </form>
      </div>
    </div>`;
  $('[name=username]').focus();
  if (window.LoginPal) window.LoginPal.reset();   // the character starts hidden behind the card
}
actions.loginKind = el => { S.loginKind = el.dataset.kind; renderLogin(); };
/** Sign in. The character walks out from behind the card while the password is checked, reacts, and the screen changes after a correct one. */
forms.login = async (f, d) => {
  if (f.dataset.busy) return;
  f.dataset.busy = '1';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pal = window.LoginPal || { walkOut: () => wait(400), react: () => wait(900), walkBack: () => wait(0), leave: () => {} };
  const btn = f.querySelector('.btn-primary'), pwd = f.querySelector('[name=password]'), label = btn.textContent;
  const lock = on => { f.classList.toggle('login-busy', on); f.querySelectorAll('input,button').forEach(x => { x.disabled = on; }); };
  lock(true); btn.textContent = 'Checking...';
  let wrong = false;
  try {
    const [ok] = await Promise.all([rpc('login', S.loginKind, d.username, d.password), pal.walkOut()]);   // check the password while the character walks out
    if (!ok) {
      wrong = true;
      f.classList.remove('shake-err'); void f.offsetWidth; f.classList.add('shake-err');   // restart the shake even on repeated wrong tries
      toast('Incorrect username or password.', 'err');
      await pal.react('bad');                                                              // shakes head "no", speech bubble
      await pal.walkBack();                                                                // walks back behind the card
      return;
    }
    f.classList.add('login-ok'); btn.textContent = 'Verified!';                            // green card and button
    const prep = (async () => {
      S.role = S.loginKind;
      S.teacherSection = ok.section || null;
      await loadSettings();
      const promo = S.role === 'admin' ? await db('checkAutoPromotion', ymd(new Date())) : { ran: false };   // yearly promotion, once the designated date has passed
      const grad = S.role === 'admin' ? await db('runSessionRollover', ymd(new Date())) : { promoted: 0, graduated: 0, noNextSession: 0 };   // then students whose session years have finished
      return { promo, grad };
    })();
    const [{ promo, grad }] = await Promise.all([prep, pal.react('ok')]);                  // nods "yes", thumbs-up, speech bubble
    pal.leave();
    f.classList.add('login-leave');
    await wait(550);
    if (S.role === 'teacher' && S.teacherSection) { S.section = S.teacherSection; S.tab = 'dashboard'; S.screen = 'main'; }   // straight to their own section
    else S.screen = 'portal';
    render();
    if (promo.ran) toast(`Yearly promotion done: ${promo.moved} promoted, ${promo.graduated} passed out.${promo.noNextSession ? ` ${promo.noNextSession} students have no later session defined.` : ''}`);
    if (grad.promoted || grad.graduated) toast(`Sessions: ${grad.promoted} promoted, ${grad.graduated} passed out.${grad.noNextSession ? ` ${grad.noNextSession} students are waiting for the next session to be created.` : ''}`);
  } finally {
    delete f.dataset.busy;
    if (S.screen === 'login' && f.isConnected) {                                           // still on the sign-in screen: unlock it again
      lock(false); btn.textContent = label;
      if (wrong) { pwd.value = ''; pwd.focus(); }
    }
  }
};
actions.logout = async () => {
  await rpc('logout');
  S.role = null; S.section = null; S.teacherSection = null; S.screen = 'login';
  await loadSettings();   // back to the public settings (logo only)
  render();
};

/* ---------- Portal: Boys / Girls (compact, fits without scrolling) ---------- */
function renderPortal() {
  const card = (key, tone, side) => `
    <button data-act="enterSection" data-section="${key}"
      class="portal-card pt-card ${side} group relative overflow-hidden rounded-3xl ${tone} p-6 text-left text-emerald-900">
      <div class="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gold-400/20 blur-2xl transition-all duration-500 group-hover:scale-125"></div>
      <span class="pt-shine"></span>
      <div class="pt-icon grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-gold-200 to-gold-400 text-emerald-900 shadow-sm">${ico('students', 'h-6 w-6')}</div>
      <div class="mt-5 font-display text-2xl font-bold">${SECTIONS[key]}</div>
      <p class="mt-1 text-xs text-teal-700">${S.role === 'teacher' ? 'Attendance, reports and results' : 'Students, fees, attendance and results'}</p>
      <div class="pt-go mt-4 flex items-center gap-1 text-sm font-semibold text-gold-700">Enter <span class="pt-arrow">&rarr;</span></div>
    </button>`;
  $('#app').innerHTML = `
    <div class="pt-root relative isolate flex min-h-screen flex-col items-center justify-center px-6 py-6">
      <div class="pt-orb pt-o1"></div><div class="pt-orb pt-o2"></div><div class="pt-orb pt-o3"></div>
      <div class="pt-top absolute right-4 top-4 flex gap-2">
        ${S.role === 'admin' ? `<button data-act="openSettings" class="btn-ghost !px-3 !py-2">${ico('settings', 'h-4 w-4')} Settings</button>` : ''}
        <button data-act="logout" class="btn-ghost !px-3 !py-2">${ico('logout', 'h-4 w-4')} Log out</button>
      </div>
      <div class="pt-top flex flex-col items-center">
        <div class="pt-logo">${logoEl('h-16 w-16')}</div>
        <h1 class="pt-title mt-3 text-center font-display text-3xl font-bold">${INSTITUTE}</h1>
        <div class="pt-rule"></div>
        <p class="pt-sub mt-2 text-sm text-emerald-900/70">${S.role === 'teacher' ? 'Teacher portal: choose a section' : 'Choose a section to continue'}</p>
      </div>
      <div class="mt-7 grid w-full max-w-xl grid-cols-2 gap-5">
        ${S.teacherSection !== 'girls' ? card('boys', 'portal-boys', 'pt-l') : ''}
        ${S.teacherSection !== 'boys' ? card('girls', 'portal-girls', 'pt-r') : ''}
      </div>
    </div>`;
}
/** The chosen card lifts, everything else fades, then the main screen slides in. */
actions.enterSection = el => {
  const root = $('#app .pt-root');
  if (root && root.classList.contains('portal-leaving')) return;
  const sec = el.dataset.section, quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches || !root;
  if (!quick) { root.classList.add('portal-leaving'); el.classList.add('picked'); }
  setTimeout(() => {
    document.body.classList.add('shell-enter');
    S.section = sec; S.tab = 'dashboard'; S.screen = 'main'; render();
    setTimeout(() => document.body.classList.remove('shell-enter'), 1500);
  }, quick ? 0 : 520);
};
actions.switchSection = () => { S.screen = 'portal'; render(); };
actions.openSettings = async () => { await loadSettings(); S.cfgSection = S.cfgSection || 'boys'; S.screen = 'settings'; render(); };

function renderSettingsScreen() {
  $('#app').innerHTML = `
    <div class="mx-auto max-w-4xl p-8 fade-in">
      <button data-act="switchSection" class="btn-ghost mb-6">${ico('back', 'h-4 w-4')} Back to sections</button>
      <div id="settingsBody"></div>
    </div>`;
  drawSettings($('#settingsBody'));
}

/* ---------- Main shell: sidebar (logo, hamburger, navigation) + header + view ---------- */
function renderMain() {
  const collapsed = S.navCollapsed && !isCompact();   // on phones and small tablets the menu is a slide-in drawer, never an icon rail
  $('#app').innerHTML = `
    <div class="app-shell flex h-screen">
      <div class="side-backdrop" data-act="closeNav"></div>
      <aside id="side" class="side ${collapsed ? 'collapsed' : ''}">
        <div class="flex flex-col items-center gap-3 px-3 pb-3 pt-4">
          ${logoEl('h-12 w-12')}
          <button class="burger" data-act="toggleNav" title="Show or hide the menu" aria-label="Show or hide the menu" aria-expanded="${!collapsed}"><span class="bars"><i></i><i></i><i></i></span></button>
        </div>
        <nav class="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          ${NAV[S.role].map(([id, label, icon]) => `<button data-act="nav" data-tab="${id}" title="${label}" class="nav-item ${id === S.tab ? 'active' : ''}">${ico(icon, 'h-5 w-5 shrink-0')}<span class="nav-label">${label}</span></button>`).join('')}
        </nav>
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="topbar flex items-center justify-between px-6 py-3 text-emerald-900">
          <div class="topbar-title flex min-w-0 items-center gap-3">
            <button type="button" class="burger menu-btn" data-act="openNav" title="Menu" aria-label="Open the menu"><span class="bars"><i></i><i></i><i></i></span></button>
            <div class="min-w-0"><div class="topbar-name font-display text-xl font-bold leading-tight">${INSTITUTE}</div>
            <div class="text-sm font-semibold text-gold-700">${SECTIONS[S.section]}${S.role === 'teacher' ? ', Teacher portal' : ''}</div></div>
          </div>
          <div class="topbar-actions flex items-center gap-5">
            <div id="clock" class="text-right"></div>
            ${themeToggle()}
            <button data-act="switchSection" class="btn-ghost" title="Switch section" aria-label="Switch section">${ico('swap', 'h-4 w-4')} <span class="hdr-lbl">Switch section</span></button>
            <button data-act="logout" class="btn-gold" title="Log out" aria-label="Log out">${ico('logout', 'h-4 w-4')} <span class="hdr-lbl">Log out</span></button>
          </div>
        </header>
        <main id="view" class="min-w-0 flex-1 overflow-y-auto p-8"></main>
      </div>
    </div>`;
  tickClock();
  go(S.tab);
}
/** Collapses the sidebar to an icon rail (or expands it). The page area stretches to fill the freed width. */
actions.toggleNav = el => {
  if (isCompact()) { closeNavDrawer(); return; }   // inside the drawer the three-line button simply closes it
  S.navCollapsed = !S.navCollapsed;
  try { localStorage.setItem('navCollapsed', S.navCollapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  $('#side').classList.toggle('collapsed', S.navCollapsed);
  el.setAttribute('aria-expanded', String(!S.navCollapsed));
};
actions.nav = el => { closeNavDrawer(); go(el.dataset.tab); };
actions.openNav = () => document.body.classList.add('nav-open');
actions.closeNav = () => closeNavDrawer();

/** Switches the main view. Classes are reloaded each time so dropdowns are always current. */
async function go(tab) {
  if (!NAV[S.role] || !NAV[S.role].some(n => n[0] === tab)) tab = 'dashboard';   // a role never lands on a view it cannot use
  S.tab = tab;
  const token = ++S.nav;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const view = $('#view');
  if (!view) return;
  [S.classes, S.fields] = await Promise.all([db('getClasses', S.section), S.role === 'admin' ? db('getFormFields', S.section) : []]);
  if (token !== S.nav) return;
  view.innerHTML = '<div></div>';
  const holder = view.firstChild;
  await VIEWS[tab](holder);              // dashboard/students/admission/reports fetch their own data here; this can take a moment
  if (token !== S.nav) return;           // a different tab was opened meanwhile: don't fade in content nobody is looking at
  view.scrollTop = 0;
  holder.classList.add('fade-in');       // only start the fade now that the real content is actually in place, not on the empty shell
  if (window.Reveal) Reveal.view(holder);   // headings, cards and tables rise one after another, the same way the dashboard does
}


/* ==========================================================================
   Shared view helpers
   ========================================================================== */
const VIEWS = {};

/* ----- Grading rules (institution-wide, optionally overridden per stream) ----- */
const DEFAULT_GRADING = { 'A+': 80, A: 70, B: 60, C: 50, D: 40, pass: 40 };
const GRADE_KEYS = ['A+', 'A', 'B', 'C', 'D'];
function gradingFor(stream) {
  const g = S.settings.grading;
  return (g && g.byStream && g.byStream[stream]) || (g && g.all) || DEFAULT_GRADING;
}
/** Grade shown to people: the cut-off letter, or the institution's own name for it (e.g. ممتاز). */
const gradeOf = (p, stream) => {
  const sc = ((S.settings.grading || {}).scales || {})[stream];                  // a stream with its own named scale (e.g. Dars-e-Nizami)
  if (sc) { const hit = sc.grades.find(g => p >= g.min); return hit ? hit.name : sc.fail; }
  const g = gradingFor(stream), k = GRADE_KEYS.find(x => p >= g[x]) || 'F';
  return ((S.settings.grading || {}).labels || {})[k] || k;
};
const passMark = stream => { const sc = ((S.settings.grading || {}).scales || {})[stream]; return sc ? sc.pass : gradingFor(stream).pass; };   // a custom scale has its own pass mark
/** A student passes when every entered subject reaches the pass mark. */
const hasPassed = (rows, stream) => rows.length > 0 && rows.every(r => pct(Number(r.obtained) || 0, Number(r.total) || 0) >= passMark(stream));

/* ----- Dates: Gregorian and Islamic (Hijri, Umm al-Qura with an admin adjustment) ----- */
const HIJRI_FMT = (() => { try { return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return null; } })();
function hijriDate(date = new Date()) {
  if (!HIJRI_FMT) return { day: '', month: '', year: '', text: '' };
  const parts = HIJRI_FMT.formatToParts(new Date(date.getTime() + Number(S.settings.hijriOffset || 0) * 86400000));
  const part = t => (parts.find(x => x.type === t) || {}).value || '';
  return { day: part('day'), month: part('month'), year: part('year'), text: `${part('day')} ${part('month')} ${part('year')} AH` };
}
const gregorianDate = (date = new Date()) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const DEFAULT_LAYOUT = { fields: ['father_name', 'roll_no', 'class', 'stream'].map(key => ({ key, visible: true })), subtitle: true, gregorian: true, hijri: true };
const layoutOf = () => S.settings.layout || DEFAULT_LAYOUT;
/** "4 November 2026  |  24 Jumada I 1448 AH", following the layout switches in Settings. */
function dateLine(date = new Date()) {
  const L = layoutOf();
  return [L.gregorian ? gregorianDate(date) : '', L.hijri ? hijriDate(date).text : ''].filter(Boolean).join('   |   ');
}

const urdu = t => `<span class="ur" lang="ur">${t}</span>`;
const parseExtra = s => { try { return JSON.parse(s.extra || '{}') || {}; } catch { return {}; } };
/** A YYYY-MM-DD string as a Date (noon, so time zones never move the day), or null. */
const isoDay = x => (/^\d{4}-\d{2}-\d{2}/.test(String(x || '')) ? new Date(`${String(x).slice(0, 10)}T12:00:00`) : null);
const hijriOf = x => { const d = isoDay(x); return d && layoutOf().hijri ? hijriDate(d).text : ''; };
/** A date for tables and logs: the Gregorian date with its Hijri date underneath. */
const dateBoth = x => { const h = hijriOf(x); return `${esc(String(x || '').slice(0, 10))}${h ? `<div class="text-xs text-teal-600">${esc(h)}</div>` : ''}`; };
/** The same on one line, for badges and sentences. */
const dateText = x => { const h = hijriOf(x); return `${esc(String(x || '').slice(0, 10))}${h ? ` (${esc(h)})` : ''}`; };
/** The Hijri month or months a Gregorian month falls in, e.g. "Jumada I-II 1448 AH". */
function hijriMonthSpan(m) {
  const [y, mo] = m.split('-').map(Number), a = hijriDate(new Date(y, mo - 1, 1, 12)), b = hijriDate(new Date(y, mo, 0, 12));
  if (!a.year) return '';
  if (a.year === b.year) return a.month === b.month ? `${a.month} ${a.year} AH` : `${a.month} - ${b.month} ${a.year} AH`;
  return `${a.month} ${a.year} - ${b.month} ${b.year} AH`;
}
const monthBoth = m => `${esc(new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))}${layoutOf().hijri ? `<div class="text-xs text-teal-600">${esc(hijriMonthSpan(m))}</div>` : ''}`;
const monthLabel = m => { const g = new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); return layoutOf().hijri ? `${g} (${hijriMonthSpan(m)})` : g; };
const streamOf = key => STREAMS.find(s => s.key === key);

const pageTitle = (title, sub, right = '') => `
  <div class="pg-head mb-6 flex items-end justify-between gap-4">
    <div><h2 class="font-display text-3xl font-bold">${title}</h2><span class="title-rule"></span><p class="mt-2 text-sm text-teal-700">${sub}</p></div>
    <div class="flex gap-3">${right}</div>
  </div>`;

/** Class dropdown options, grouped by stream. */
const classOptions = selected => STREAMS.map(st => {
  const list = S.classes.filter(c => c.stream === st.key);
  return list.length
    ? `<optgroup label="${st.key}">${list.map(c => `<option value="${c.id}" ${String(c.id) === String(selected) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`
    : '';
}).join('');

/** One labelled input. `label` may contain HTML (e.g. Urdu text). */
const fld = (label, name, value = '', { type = 'text', required = false } = {}) => `
  <div><label class="label">${label}</label>
  <input class="field" name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${type === 'number' ? 'min="0" step="any"' : ''}></div>`;
const selectFld = (label, name, options, value) => `
  <div><label class="label">${label}</label>
  <select class="field" name="${name}">${options.map(o => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
const miniBox = (label, value, cls = '') => `<div class="rounded-2xl bg-white/70 p-3 text-center"><div class="font-bold tabular-nums ${cls}">${value}</div><div class="text-xs text-emerald-900/65">${label}</div></div>`;
/** Reads an image file, shrinks it and returns a data URL (keeps the database small). */
function readImage(file, { maxW, maxH, type = 'image/jpeg', quality = 0.85 }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image.'));
      img.onload = () => {
        const k = Math.min(1, maxW / img.width, maxH / img.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        const ctx = c.getContext('2d');
        if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL(type, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
const photoInner = src => (src ? `<img src="${src}" alt="Student photo" class="h-full w-full object-cover">` : ico('students', 'h-8 w-8'));
/** Student photo for reports and cards. */
const photoImg = (src, cls = 'h-24 w-20') => (src
  ? `<img src="${src}" alt="Student photo" class="${cls} shrink-0 rounded-lg border border-emerald-900/20 bg-white object-cover">`
  : `<div class="${cls} grid shrink-0 place-items-center rounded-lg border border-emerald-900/20 bg-white text-emerald-900/30">${ico('students', 'h-8 w-8')}</div>`);

const sigInner = src => (src ? `<img src="${src}" alt="Signature" class="h-full w-full object-contain">` : '');
/** Signature picker: hidden inputs carry the new image, or the request to remove it. */
const signaturePicker = (label, src) => `
  <div class="col-span-2"><label class="label">${label}</label>
    <div class="flex items-center gap-3">
      <div class="sig-box h-14 w-40 shrink-0 overflow-hidden rounded-xl border border-dashed border-emerald-900/30 bg-white/70">${sigInner(src)}</div>
      <input type="file" accept="image/*" data-change="sigPick" class="w-52 text-xs">
      <button type="button" data-act="sigClear" class="btn-ghost !px-2 !py-1 text-xs">Remove</button>
    </div>
    <input type="hidden" name="signature" value=""><input type="hidden" name="signature_remove" value="">
  </div>`;
changes.sigPick = async el => {
  const file = el.files[0];
  if (!file) return;
  const url = await readImage(file, { maxW: 500, maxH: 200, type: 'image/png' });   // PNG keeps a transparent background
  const form = el.closest('form');
  form.querySelector('[name=signature]').value = url;
  form.querySelector('[name=signature_remove]').value = '';
  form.querySelector('.sig-box').innerHTML = sigInner(url);
};
actions.sigClear = el => {
  const form = el.closest('form');
  form.querySelector('[name=signature]').value = '';
  form.querySelector('[name=signature_remove]').value = '1';
  form.querySelector('[type=file]').value = '';
  form.querySelector('.sig-box').innerHTML = '';
};
/** Value to send to the database: data URL = set, null = remove, undefined = unchanged. */
const signatureValue = d => (d.signature ? d.signature : d.signature_remove === '1' ? null : undefined);

const feeBadge = status => `<span class="badge ${status === 'Paid' || status === 'No dues' ? 'badge-ok' : status === 'Partial' ? 'badge-warn' : 'badge-bad'}">${status}</span>`;

const noClassesNote = () => S.classes.length ? '' :
  '<p class="mb-4 rounded-xl bg-gold-100 px-4 py-3 text-sm text-gold-700">There are no classes yet. Create one in the Classes panel first.</p>';

/* ==========================================================================
   Dashboard
   ========================================================================== */
/** Teacher dashboard: what has been saved today. */
async function teacherDashboard(v) {
  const [students, locks, hols] = await Promise.all([db('getStudents', S.section), db('getAttendanceLocks', S.section, curMonth()), db('getHolidays', S.section, curMonth())]);
  const today = ymd(new Date()), friday = new Date().getDay() === 5, holiday = hols.find(h => h.date === today), off = friday ? 'Weekly off' : holiday ? `Holiday: ${holiday.name}` : '';
  const done = new Map(locks.filter(l => l.date === today).map(l => [l.class_id, l.locked_at]));
  const tile = (label, value, icon) => `<div class="card flex items-center gap-4 !p-5"><div class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-100 to-gold-100 text-emerald-700">${ico(icon, 'h-6 w-6')}</div><div><div class="text-2xl font-bold tabular-nums">${value}</div><div class="text-xs font-medium text-emerald-900/65">${label}</div></div></div>`;
  v.innerHTML = pageTitle('Teacher dashboard', `${SECTIONS[S.section]}, ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`) + `
    <div class="grid grid-cols-3 gap-4">
      ${tile('Active students', students.filter(s => s.status === 'Active').length, 'students')}
      ${tile('Classes', S.classes.length, 'classes')}
      ${tile('Attendance saved today', off ? (friday ? 'Weekly off' : 'Holiday') : `${done.size} / ${S.classes.length}`, 'attendance')}
    </div>
    <div class="mt-6 grid grid-cols-3 gap-6">
      <div class="card col-span-2"><h3 class="mb-4 font-display text-lg font-bold">Today's attendance by class</h3>
        ${S.classes.length ? `<table class="tbl"><thead><tr><th>Stream</th><th>Class</th><th>Status</th></tr></thead><tbody>${S.classes.map(c => `<tr><td>${esc(c.stream)}</td><td class="font-semibold">${esc(c.name)}</td><td>${off ? `<span class="badge badge-warn">${esc(off)}</span>` : done.has(c.id) ? `<span class="badge badge-ok">Saved and locked ${esc((done.get(c.id) || '').slice(11, 16))}</span>` : '<span class="badge badge-bad">Not saved yet</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="text-sm text-emerald-900/70">No classes have been created yet.</p>'}
      </div>
      <div class="card h-fit"><h3 class="mb-4 font-display text-lg font-bold">Quick actions</h3><div class="grid gap-3">
        <button data-act="nav" data-tab="mark" class="btn-gold">Mark attendance</button>
        <button data-act="nav" data-tab="reports" class="btn-primary">Reports</button>
        <button data-act="nav" data-tab="results" class="btn-ghost">Result entry</button>
      </div></div>
    </div>`;
}

const STATUS_COLORS = { 'Active': '#2b6451', 'Inactive': '#b08d44', 'Left': '#dc2626', 'Passed out': '#3e5d62' };
const STATUS_LABELS = { 'Active': 'Active students', 'Inactive': 'Inactive students', 'Left': 'Left / withdrawn', 'Passed out': 'Passed out (alumni)' };

VIEWS.dashboard = async v => {
  if (S.role === 'teacher') return teacherDashboard(v);
  const [st, feeRows] = await Promise.all([db('getStats', S.section, ymd(new Date())), db('getFeeSheet', S.section, curMonth())]);
  const friday = new Date().getDay() === 5;
  const tile = (label, value, icon, sub = '', act = '') => `
    <div ${act ? `data-act="${act}" role="button" tabindex="0" title="Click for details"` : ''} class="card flex items-center gap-4 !p-5 ${act ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-xl' : ''}">
      <div class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-100 to-gold-100 text-emerald-700">${ico(icon, 'h-6 w-6')}</div>
      <div class="min-w-0"><div class="truncate text-2xl font-bold tabular-nums">${value}</div><div class="text-xs font-medium text-emerald-900/65">${label}</div>${sub ? `<div class="text-[11px] text-emerald-900/50">${sub}</div>` : ''}</div>
    </div>`;
  const feeBy = new Map();
  for (const r of feeRows.filter(x => x.student_status === 'Active')) {
    const g = feeBy.get(r.class_id) || { n: 0, paid: 0, collected: 0, owed: 0 };
    g.n++; if (r.payable <= 0) g.paid++; g.collected += r.current_paid || 0; g.owed += Math.max(r.payable, 0);
    feeBy.set(r.class_id, g);
  }
  const feeRowsHtml = S.classes.filter(c => feeBy.has(c.id)).map(c => { const g = feeBy.get(c.id); return `<tr><td>${esc(c.stream)}</td><td class="font-semibold">${esc(c.name)}</td><td class="num">${g.n}</td><td class="num">${g.paid}</td><td class="num">${g.n - g.paid}</td><td class="num">${money(g.collected)}</td><td class="num font-semibold">${money(g.owed)}</td></tr>`; }).join('');
  const classRows = STREAMS.map(sm => {
    const list = S.classes.filter(c => c.stream === sm.key);
    return list.map((c, i) => `<tr><td>${i === 0 ? `<span class="font-semibold">${sm.key}</span> ${urdu(sm.ur)}` : ''}</td><td>${esc(c.name)}</td><td class="num">${c.student_count}</td></tr>`).join('');
  }).join('');
  v.innerHTML = pageTitle('Dashboard', `${SECTIONS[S.section]} at a glance, ${dateLine(new Date())}`) + `
    <div class="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-6">
      ${tile('Total active students', st.students, 'students')}
      ${tile('Teachers', st.teachers, 'teachers')}
      ${tile('Active classes', st.activeClasses, 'classes', `of ${st.classes} classes`)}
      ${tile("Today's present students", st.off ? (friday ? 'Weekly off' : 'Holiday') : `${st.presentToday} / ${st.students}`, 'attendance', st.off ? (friday ? '' : st.off) : (st.leaveToday ? `${st.leaveToday} on leave` : ''))}
      ${tile(`Fee collection, ${monthLabel(curMonth())}`, money(st.collected), 'fees', `of ${money(st.due)} due`)}
      ${tile('Overall students (unique)', st.unique, 'students', `${st.total} profiles, click to manage links`, 'openUnique')}
    </div>
    <div class="mt-6 grid grid-cols-3 gap-6">
      <div class="card"><h3 class="mb-3 font-display text-lg font-bold">Student status</h3>
        <table class="tbl"><thead><tr><th>Status</th><th class="num">Students</th><th class="num">Share</th></tr></thead><tbody>
          ${STATUSES.map(k => { const n = st.statusCounts[k] || 0; return `<tr><td class="font-semibold">${STATUS_LABELS[k]}</td><td class="num">${n}</td><td class="num">${st.total ? fmt1((n / st.total) * 100) : 0}%</td></tr>`; }).join('')}
          <tr><td class="font-bold">All</td><td class="num font-bold">${st.total}</td><td class="num">100%</td></tr></tbody></table></div>
      <div class="card col-span-2"><h3 class="mb-3 font-display text-lg font-bold">Fees by class, ${monthLabel(curMonth())}</h3>
        <div class="max-h-72 overflow-auto"><table class="tbl"><thead><tr><th>Stream</th><th>Class</th><th class="num">Active</th><th class="num">Paid in full</th><th class="num">Unpaid</th><th class="num">Collected</th><th class="num">Outstanding</th></tr></thead><tbody>
          ${feeRowsHtml || emptyRow(7, 'No active students yet.')}</tbody></table></div></div>
    </div>
    <div class="mt-6 grid grid-cols-3 gap-6">
      <div class="card col-span-2"><h3 class="mb-3 font-display text-lg font-bold">Students per class</h3>
        <div class="max-h-72 overflow-auto"><table class="tbl"><thead><tr><th>Stream</th><th>Class</th><th class="num">Students</th></tr></thead><tbody>
          ${classRows || emptyRow(3, 'No classes have been created yet.')}</tbody></table></div></div>
      <div class="card h-fit"><h3 class="mb-4 font-display text-lg font-bold">Quick actions</h3>
        <div class="grid gap-3">
          <button data-act="nav" data-tab="admission" class="btn-gold">Admit a student</button>
          <button data-act="nav" data-tab="attendance" class="btn-primary">Mark attendance</button>
          <button data-act="nav" data-tab="fees" class="btn-ghost">Collect fees</button>
          <button data-act="nav" data-tab="results" class="btn-ghost">Enter results</button>
          <button data-act="nav" data-tab="reports" class="btn-ghost">Open reports</button>
          <button data-act="nav" data-tab="import" class="btn-ghost">Import records</button>
        </div></div>
    </div>`;
};

/* ==========================================================================
   Admission form (standard fields + custom fields)
   ========================================================================== */
/* ==========================================================================
   Searchable Pakistan location boxes: Province, City, District, Tehsil
   Typing filters the list ("M" gives Multan, Muzaffargarh, Mianwali...). Picking a district fills in
   its province; picking a tehsil fills in its district and province. Any other text is kept as typed.
   ========================================================================== */
const LOCATION_TYPES = ['province', 'city', 'district', 'tehsil'];
const norm = v => String(v || '').trim().toLowerCase();

function locOptions(kind, form, query) {
  const val = n => (form.querySelector(`[name=${n}]`) || {}).value || '';
  const prov = PK.provinces.find(p => norm(p.name) === norm(val('province')));
  const dist = PK.districts.find(d => norm(d.name) === norm(val('district')) && (!prov || d.province === prov.name));
  let list;
  if (kind === 'province') list = PK.provinces.map(p => ({ name: p.name, names: [p.name, ...p.alias], hint: p.alias[0] || '' }));
  else if (kind === 'district') list = PK.districts.filter(d => !prov || d.province === prov.name).map(d => ({ name: d.name, names: [d.name], hint: d.province, province: d.province }));
  else if (kind === 'tehsil') {
    list = PK.tehsils.filter(t => (dist ? t.district === dist.name && t.province === dist.province : !prov || t.province === prov.name))
      .map(t => ({ name: t.name, names: [t.name], hint: t.district, province: t.province, district: t.district }));
  } else list = PK.cities.filter(c => !prov || c.province === prov.name).map(c => ({ name: c.name, names: [c.name], hint: c.province, province: c.province }));
  return list.map(o => ({ o, sc: pkScore(query, o.names) })).filter(x => x.sc >= 0)
    .sort((a, b) => a.sc - b.sc || a.o.name.localeCompare(b.o.name)).map(x => x.o);
}
/** Marks the part of a name that matches what was typed. */
function highlight(name, q) {
  q = String(q || '').trim();
  const i = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1;
  return i < 0 ? esc(name) : `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + q.length))}</mark>${esc(name.slice(i + q.length))}`;
}
function renderComboList(input, focusing) {
  const box = input.closest('.combo').querySelector('.combo-list'), kind = input.dataset.kind;
  const q = focusing ? '' : input.value;   // on focus show the whole (context-filtered) list
  const opts = locOptions(kind, input.closest('form'), q).slice(0, 60);
  box.innerHTML = opts.length
    ? opts.map(o => `<button type="button" class="combo-opt" data-act="comboPick" data-kind="${kind}" data-name="${esc(o.name)}" data-province="${esc(o.province || '')}" data-district="${esc(o.district || '')}"><span>${highlight(o.name, q)}</span>${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`).join('')
    : '<div class="px-3 py-2 text-xs text-emerald-900/60">No match in the list. What you type will be saved as written.</div>';
  box.classList.remove('hidden');
}
function closeCombos() { document.querySelectorAll('.combo-list').forEach(b => b.classList.add('hidden')); }
const comboHTML = (kind, label, value) => `
  <div class="combo relative"><label class="label">${label}</label>
    <input class="field" name="${kind}" value="${esc(value)}" autocomplete="off" data-input="combo" data-kind="${kind}">
    <div class="combo-list hidden"></div></div>`;

inputs.combo = el => renderComboList(el, false);
actions.comboPick = el => {
  const form = el.closest('form'), kind = el.dataset.kind, name = el.dataset.name;
  const input = n => form.querySelector(`[name=${n}]`);
  const val = n => (input(n) ? input(n).value : '');
  const set = (n, v) => { if (input(n)) input(n).value = v; };
  set(kind, name);
  if (kind === 'province') {            // clear choices that belong to another province
    const d = PK.districts.find(x => norm(x.name) === norm(val('district')));
    if (d && d.province !== name) { set('district', ''); set('tehsil', ''); }
    const c = PK.cities.find(x => norm(x.name) === norm(val('city')));
    if (c && c.province !== name) set('city', '');
  } else if (kind === 'district') {
    set('province', el.dataset.province);
    if (val('tehsil') && !PK.tehsils.some(t => norm(t.name) === norm(val('tehsil')) && t.district === name)) set('tehsil', '');
  } else if (kind === 'tehsil') {
    set('district', el.dataset.district);
    set('province', el.dataset.province);
  } else if (kind === 'city' && !val('province')) set('province', el.dataset.province);
  closeCombos();
};
document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('input[data-input=combo]')) renderComboList(e.target, true); });
document.addEventListener('click', e => {
  const i = e.target.closest && e.target.closest('input[data-input=combo]');
  if (i && i.closest('.combo').querySelector('.combo-list').classList.contains('hidden')) renderComboList(i, true);
});
document.addEventListener('mousedown', e => { if (!(e.target.closest && e.target.closest('.combo'))) closeCombos(); });
document.addEventListener('keydown', e => {            // arrow keys, Enter to choose
  const input = e.target.closest && e.target.closest('.combo input');
  if (!input) return;
  const box = input.closest('.combo').querySelector('.combo-list');
  const opts = [...box.querySelectorAll('.combo-opt')], at = opts.findIndex(o => o.classList.contains('on'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (box.classList.contains('hidden')) { renderComboList(input, true); return; }
    if (!opts.length) return;
    const next = e.key === 'ArrowDown' ? Math.min(at + 1, opts.length - 1) : Math.max(at - 1, 0);
    opts.forEach((o, n) => o.classList.toggle('on', n === next));
    opts[next].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && at >= 0 && !box.classList.contains('hidden')) { e.preventDefault(); opts[at].click(); }
});

/** Street address plus the chosen location, without repeating a name twice. */
const fullAddress = s => [...new Set([s.address, s.city, s.tehsil, s.district, s.province].map(x => String(x || '').trim()).filter(Boolean))].join(', ');

/* The admission form is built from S.fields (one list per section), in the order the admin chose. */
const LOCKED_FIELDS = ['roll_no', 'name', 'class_id'];
const fieldName = f => (f.builtin ? f.builtin : 'x_' + f.key);
const optionList = f => String(f.options || '').split('\n').filter(Boolean);
const classOptionsFlat = (stream, selected) => S.classes.filter(c => c.stream === stream)
  .map(c => `<option value="${c.id}" ${String(c.id) === String(selected) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

function renderField(f, s, extra) {
  const name = fieldName(f), label = esc(f.label), req = !!f.required;
  const val = f.builtin ? s[f.builtin] : extra[f.key];
  if (LOCATION_TYPES.includes(f.type)) return comboHTML(f.type, label, val);
  if (f.type === 'photo') {
    return `<div><label class="label">${label}</label>
      <div class="flex items-center gap-3">
        <div class="photo-box grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/70 text-emerald-900/40">${photoInner(s.photo)}</div>
        <div class="space-y-1.5"><input type="file" accept="image/*" data-change="photoPick" class="w-44 text-xs"><button type="button" data-act="photoClear" class="btn-ghost !px-2 !py-1 text-xs">Remove photo</button></div>
      </div>
      <input type="hidden" name="photo" value=""><input type="hidden" name="photo_remove" value=""></div>`;
  }
  if (f.type === 'stream') {
    const cur = s.stream || (S.classes[0] && S.classes[0].stream) || STREAMS[0].key;
    return `<div><label class="label">${label}</label><select class="field" name="stream_ui" data-change="admStream">${STREAMS.map(st => `<option ${st.key === cur ? 'selected' : ''}>${st.key}</option>`).join('')}</select></div>`;
  }
  if (f.type === 'class') {
    const streamShown = S.fields.some(x => x.type === 'stream' && x.visible);
    const cur = s.stream || (S.classes[0] && S.classes[0].stream) || STREAMS[0].key;
    return `<div><label class="label">${label}</label><select name="class_id" class="field" required>${streamShown ? classOptionsFlat(cur, s.class_id) : classOptions(s.class_id)}</select></div>`;
  }
  if (f.type === 'session') {
    return `<div><label class="label">${label}</label><select class="field" name="${name}"><option value="">Not assigned</option>${(S.settings.sessions || []).map(x => `<option value="${esc(x.name)}" ${x.name === val ? 'selected' : ''}>${esc(x.name)}${x.years > 1 ? ` (${x.years}-year course)` : ''}${x.stream ? ` - ${esc(x.stream)}` : ''}</option>`).join('')}</select></div>`;
  }
  if (f.mask && !f.builtin) {
    return `<div><label class="label">${label}</label><input class="field" name="${name}" value="${esc(val)}" placeholder="${esc(f.mask)}" maxlength="${f.mask.length}" data-input="maskInput" data-mask="${esc(f.mask)}" ${req ? 'required' : ''}></div>`;
  }
  if (f.type === 'select') {
    const def = f.builtin === 'gender' && !val ? (S.section === 'boys' ? 'Male' : 'Female') : val;
    return `<div><label class="label">${label}</label><select class="field" name="${name}" ${req ? 'required' : ''}>${req ? '' : '<option value=""></option>'}${optionList(f).map(o => `<option ${o === def ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
  }
  if (f.type === 'textarea') return `<div class="col-span-3"><label class="label">${label}</label><textarea class="field" rows="2" name="${name}" ${req ? 'required' : ''}>${esc(val)}</textarea></div>`;
  const defaults = { admission_date: ymd(new Date()), fee: 0, opening_dues: 0 };
  const shown = val ?? (f.builtin ? defaults[f.builtin] ?? '' : '');
  const html = fld(label, name, shown, { type: f.type, required: req });
  return f.builtin === 'address' ? `<div class="col-span-2">${html}</div>` : html;
}

const studentFields = (s = {}, withStatus = false) => {
  const extra = parseExtra(s);
  // A field is drawn once: skip repeats of the same standard field or the same label
  const seen = new Set();
  const once = f => {
    const keys = [f.builtin ? 'b:' + f.builtin : null, 'l:' + f.label.trim().toLowerCase()].filter(Boolean);
    if (keys.some(k => seen.has(k))) return false;
    keys.forEach(k => seen.add(k));
    return true;
  };
  return S.fields.filter(f => f.visible && f.builtin !== 'session').filter(once).map(f => renderField(f, s, extra)).join('') +
    (withStatus ? selectFld('Status', 'status', STATUSES, s.status) + `<div>${fld('Exit date (leaving / pass-out / inactive)', 'status_date', s.status_date || '', { type: 'date' })}<p class="mt-1 text-xs text-teal-700">Used when Status is not Active. Attendance, working days and fees stop after this date. Leave empty to use today.</p></div>` : '');
};
/** Picking a stream shows only that stream's classes. */
changes.photoPick = async el => {
  const file = el.files[0];
  if (!file) return;
  const url = await readImage(file, { maxW: 360, maxH: 440 });
  const form = el.closest('form');
  form.querySelector('[name=photo]').value = url;
  form.querySelector('[name=photo_remove]').value = '';
  form.querySelector('.photo-box').innerHTML = photoInner(url);
};
actions.photoClear = el => {
  const form = el.closest('form');
  form.querySelector('[name=photo]').value = '';
  form.querySelector('[name=photo_remove]').value = '1';
  form.querySelector('[type=file]').value = '';
  form.querySelector('.photo-box').innerHTML = photoInner('');
};
changes.admStream = el => {
  const sel = el.closest('form').querySelector('[name=class_id]');
  if (sel) sel.innerHTML = classOptionsFlat(el.value, '');
};

VIEWS.admission = async v => {
  v.innerHTML = pageTitle('Admission', 'Register a new student',
    '<button data-act="customizeForm" class="btn-ghost">Customize form</button><button data-act="exportAll" class="btn-ghost">Export to Excel</button>') + `
    <form data-form="studentSave" class="card max-w-5xl">
      <div class="mb-5 flex items-center gap-4">${logoEl('h-14 w-14')}
        <div><div class="font-display text-xl font-bold">${INSTITUTE}</div><div class="text-sm text-emerald-900/70">${SECTIONS[S.section]} admission form</div></div>
      </div>
      ${noClassesNote()}
      <div class="grid grid-cols-3 gap-4">${studentFields()}</div>
      <div class="mt-6 flex justify-end"><button class="btn-gold" ${S.classes.length ? '' : 'disabled'}>Admit student</button></div>
    </form>`;
};

forms.studentSave = async (f, d) => {
  const payload = { fee_effective: d.fee_effective || undefined, id: d.id ? Number(d.id) : null, section: S.section, roll_no: d.roll_no, name: d.name, class_id: Number(d.class_id) || null, status: d.status, status_date: d.status === 'Active' ? '' : (d.status_date || ''), extra: {} };
  // Only fields that are visible on the form are sent, so hidden ones keep their saved values
  for (const fd of S.fields) {
    if (!fd.visible || ['roll_no', 'name', 'class_id', 'stream'].includes(fd.builtin)) continue;
    if (fd.builtin === 'photo') continue;
    if (fd.builtin) payload[fd.builtin] = ['fee', 'opening_dues'].includes(fd.builtin) ? Number(d[fd.builtin] || 0) : d[fd.builtin];
    else payload.extra[fd.key] = d['x_' + fd.key] || '';
  }
  if (d.photo) payload.photo = d.photo;                       // a new photo was chosen
  else if (d.photo_remove === '1') payload.photo = null;      // the photo was removed
  await db('saveStudent', payload);
  if (payload.id) { toast('Student updated'); closeModal(); await go(S.tab); }
  else {
    toast('Student admitted');
    f.reset();
    const box = f.querySelector('.photo-box');
    if (box) box.innerHTML = photoInner('');
    const st = f.querySelector('[name=stream_ui]');
    if (st) changes.admStream(st);
    f.querySelector('[name=roll_no]').focus();
  }
};
actions.exportAll = async () => { if (await rpc('exportStudents', S.section, null)) toast('Excel file saved'); };

/* ----- Admission form builder: reorder, show/hide, rename, add fields ----- */
async function openFieldBuilder(editId) {
  S.fields = await db('getFormFields', S.section);
  const e = S.fields.find(f => f.id === editId) || {};
  const types = { session: 'Academic session', province: 'Province (search)', city: 'City (search)', district: 'District (search)', tehsil: 'Tehsil (search)', photo: 'Photo', text: 'Text', number: 'Number', date: 'Date', select: 'Select (dropdown)', textarea: 'Long text', stream: 'Stream', class: 'Class' };
  const isBuiltin = !!e.builtin, isLocked = LOCKED_FIELDS.includes(e.builtin);
  const creatable = ['text', 'number', 'date', 'select', 'textarea'];
  openModal(`Customize admission form: ${SECTIONS[S.section]}`, `
    <p class="mb-4 text-sm text-emerald-900/70">Move fields up or down, show or hide them, rename them, or add your own. This form belongs to the ${SECTIONS[S.section]} only. Roll number, student name and class are required and always shown.</p>
    <div class="mb-5 max-h-72 overflow-y-auto"><table class="tbl"><thead><tr><th>Order</th><th>Field label</th><th>Type</th><th>Shown</th><th></th></tr></thead><tbody>
      ${S.fields.filter(f => f.builtin !== 'session').map((f, i, arr) => `<tr class="${f.visible ? '' : 'opacity-60'}">
        <td class="whitespace-nowrap"><button data-act="moveField" data-id="${f.id}" data-dir="up" class="btn-ghost !px-2.5 !py-1" ${i === 0 ? 'disabled' : ''}>Up</button>
          <button data-act="moveField" data-id="${f.id}" data-dir="down" class="btn-ghost !px-2.5 !py-1" ${i === arr.length - 1 ? 'disabled' : ''}>Down</button></td>
        <td class="font-semibold">${esc(f.label)}${f.required ? ' <span class="neg">*</span>' : ''}</td>
        <td>${types[f.type]}${f.builtin ? ' <span class="badge badge-ok">Standard</span>' : ''}${f.mask ? ` <span class="badge badge-warn">${esc(f.mask)}</span>` : ''}</td>
        <td><input type="checkbox" data-change="fieldVisible" data-id="${f.id}" ${f.visible ? 'checked' : ''} ${LOCKED_FIELDS.includes(f.builtin) ? 'disabled' : ''}></td>
        <td class="whitespace-nowrap text-right"><button data-act="editField" data-id="${f.id}" class="btn-ghost !px-3 !py-1.5">Edit</button>
          ${f.builtin ? '' : `<button data-act="removeField" data-id="${f.id}" class="btn-danger !px-3 !py-1.5">Remove</button>`}</td></tr>`).join('')}
    </tbody></table></div>
    <form data-form="fieldSave" class="rounded-2xl bg-white/50 p-4"><input type="hidden" name="id" value="${e.id || ''}">
      <h4 class="mb-3 font-semibold">${e.id ? `Edit field: ${esc(e.label)}` : 'Add a new field'}</h4>
      <div class="grid grid-cols-2 gap-4">
        ${fld('Field label', 'label', e.label, { required: true })}
        <div><label class="label">Type</label><select name="type" class="field" data-change="fieldType" ${isBuiltin ? 'disabled' : ''}>
          ${(isBuiltin ? [e.type] : creatable).map(k => `<option value="${k}" ${k === e.type ? 'selected' : ''}>${types[k]}</option>`).join('')}</select></div>
        <div id="optWrap" class="col-span-2 ${e.type === 'select' ? '' : 'hidden'}"><label class="label">Dropdown choices (one per line)</label><textarea name="options" class="field" rows="3">${esc(e.options)}</textarea></div>
        <div id="maskWrap" class="col-span-2 ${!isBuiltin && (e.type || 'text') === 'text' ? '' : 'hidden'}"><label class="label">Input format (optional)</label><input class="field" name="mask" maxlength="40" value="${esc(e.mask)}" placeholder="0000-0000000">
          <p class="mt-1 text-xs text-teal-600">0 = digit, A = letter, X = letter or digit. Other characters are typed for you. Example: 00000-0000000-0 for a CNIC number.</p></div>
        <label class="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="required" ${e.required ? 'checked' : ''} ${isLocked ? 'disabled' : ''}> Required</label>
        <label class="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="visible" ${e.id ? (e.visible ? 'checked' : '') : 'checked'} ${isLocked ? 'disabled' : ''}> Show on the form</label>
      </div>
      <div class="mt-4 flex justify-end gap-2">${e.id ? '<button type="button" data-act="fieldCancel" class="btn-ghost">Cancel</button>' : ''}<button class="btn-gold">${e.id ? 'Save field' : 'Add field'}</button></div>
    </form>
    <div class="mt-5 flex justify-end"><button type="button" data-act="fieldsDone" class="btn-primary">Done</button></div>`, true);
  S.builderOpen = true;
}
actions.customizeForm = () => openFieldBuilder();
actions.editField = el => openFieldBuilder(Number(el.dataset.id));
actions.fieldCancel = () => openFieldBuilder();
actions.fieldsDone = () => closeModal();
actions.moveField = async el => { await db('moveFormField', Number(el.dataset.id), el.dataset.dir); await openFieldBuilder(); };
actions.removeField = async el => {
  if (!confirm('Remove this field? Values already saved in it will be deleted from all students.')) return;
  await db('deleteFormField', Number(el.dataset.id));
  await openFieldBuilder();
};
changes.fieldVisible = async el => {
  try { await db('setFieldVisible', Number(el.dataset.id), el.checked); }
  catch (err) { el.checked = !el.checked; throw err; }
  el.closest('tr').classList.toggle('opacity-60', !el.checked);
};
changes.fieldType = el => { $('#optWrap').classList.toggle('hidden', el.value !== 'select'); $('#maskWrap').classList.toggle('hidden', el.value !== 'text'); };
forms.fieldSave = async (f, d) => {
  await db('saveFormField', { id: d.id ? Number(d.id) : null, section: S.section, label: d.label, type: d.type, options: d.options, mask: d.mask, required: d.required === 'on', visible: d.visible === 'on' });
  toast(d.id ? 'Field updated' : 'Field added');
  await openFieldBuilder();
};

/* ==========================================================================
   Students panel with quick inline editing
   ========================================================================== */
VIEWS.students = async v => {
  S.students = await db('getStudents', S.section);
  S.filter = { text: '', stream: '', classId: '', status: '', year: '' };
  v.innerHTML = pageTitle('Students', "Search, edit, or remove students. Father's phone, address and status can be changed right in the table.",
    `<select class="field !w-auto" data-change="stuYear" title="Filter by admission year" aria-label="Admission year">${yearOptions()}</select><button data-act="exportFiltered" class="btn-ghost">Export filtered list</button><button data-act="exportAll" class="btn-ghost">Export all</button>`) + `
    <div class="card">
      <div class="mb-4 grid grid-cols-4 gap-4">
        <div><label class="label">Search by roll, name, father or father's phone</label><input class="field" data-input="stuFilter"></div>
        <div><label class="label">Stream</label><select class="field" data-change="stuStream"><option value="">All streams</option>${STREAMS.map(s => `<option>${s.key}</option>`).join('')}</select></div>
        <div><label class="label">Class</label><select class="field" data-change="stuClass"><option value="">All classes</option>${classOptions('')}</select></div>
        <div><label class="label">Status</label><select class="field" data-change="stuStatus"><option value="">All statuses</option>${STATUSES.map(s => `<option>${s}</option>`).join('')}</select></div>
      </div>
      <div id="stuYears"></div>
      <div class="sticky-wrap"><table class="tbl whitespace-nowrap">
        <thead><tr><th>Roll</th><th>Name</th><th>Father</th><th>Class</th><th>Session</th><th>Location</th><th>Father's phone</th><th>Address</th><th>Status</th><th class="num">Fee</th><th></th></tr></thead>
        <tbody id="stuRows"></tbody>
      </table></div>
      <p id="stuCount" class="mt-3 text-sm text-emerald-900/65"></p>
    </div>`;
  drawStudents();
};
function filteredStudents() {
  const t = S.filter.text.toLowerCase(), f = S.filter;
  return S.students.filter(s =>
    (!f.stream || s.stream === f.stream) && (!f.classId || String(s.class_id) === f.classId) && (!f.status || s.status === f.status) && (!f.year || admYear(s) === f.year) &&
    (!t || [s.roll_no, s.name, s.father_name, s.father_phone].some(x => String(x || '').toLowerCase().includes(t))));
}
/** Students are drawn in small batches. The next batch is added only when the end of the list scrolls near the screen,
 *  and every row fades up as it enters view, so thousands of records open instantly with no lag. */
const STU_CHUNK = 40;
let stuObserver = null;
function stuRowHTML(s) {
  // Phone and address look like plain text; a border appears on hover so they can still be edited in place
  const plain = (s, field, width) => `<input class="plain" style="width:${width}px" data-change="inline" data-id="${s.id}" data-f="${field}" value="${esc(s[field])}" title="${esc(s[field])}">`;
  return `
    <tr class="rv-row"><td>${esc(s.roll_no)}</td><td class="font-semibold">${esc(s.name)}${s.person_id ? ' <span class="badge badge-ok" title="Linked to another profile of the same person">Linked</span>' : ''}</td><td>${esc(s.father_name)}</td>
    <td>${esc(s.class_name)}<div class="text-xs text-teal-600">${esc(s.stream)}</div></td>
    <td><select class="field !py-1.5 text-sm" style="width:170px;min-width:170px" data-change="inline" data-id="${s.id}" data-f="session" title="Academic session"><option value="">None</option>${(S.settings.sessions || []).map(x => `<option value="${esc(x.name)}" ${x.name === s.session ? 'selected' : ''}>${esc(x.name)}${x.years > 1 ? ` (${x.years} yrs)` : ''}</option>`).join('')}</select></td>
    <td>${esc([s.tehsil, s.district].filter(Boolean).join(', '))}</td>
    <td>${plain(s, 'father_phone', 150)}</td><td>${plain(s, 'address', 260)}</td>
    <td><select class="field !py-1.5 text-sm" style="width:160px;min-width:160px" data-change="inline" data-id="${s.id}" data-f="status">${STATUSES.map(x => `<option ${x === s.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
    <td class="num">${money(s.fee)}</td>
    <td class="text-right">
      <button data-act="transferStudent" data-id="${s.id}" class="btn-ghost !px-3 !py-1.5">Transfer</button>
      <button data-act="editStudent" data-id="${s.id}" class="btn-ghost !px-3 !py-1.5">Edit</button>
      <button data-act="deleteStudent" data-id="${s.id}" class="btn-danger !px-3 !py-1.5">Remove</button>
    </td></tr>`;
}
function appendStudentRows() {
  const L = S.stuList, body = $('#stuRows');
  if (!L || !body) return;
  const old = $('#stuMore'); if (old) { if (stuObserver) stuObserver.unobserve(old); old.remove(); }
  const next = L.rows.slice(L.shown, L.shown + STU_CHUNK);
  L.shown += next.length;
  body.insertAdjacentHTML('beforeend', next.map(stuRowHTML).join(''));
  if (L.shown < L.rows.length) {
    body.insertAdjacentHTML('beforeend', `<tr id="stuMore"><td colspan="11" class="py-4 text-center text-xs text-teal-600">Loading more students... (${L.shown} of ${L.rows.length})</td></tr>`);
    if (stuObserver) stuObserver.observe($('#stuMore'));
  }
  $('#stuCount').textContent = `${L.rows.length} of ${S.students.length} students shown`;
}
function drawStudents() {
  const rows = filteredStudents();
  if (stuObserver) stuObserver.disconnect();
  stuObserver = 'IntersectionObserver' in window ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) appendStudentRows(); }, { rootMargin: '500px 0px' }) : null;
  S.stuList = { rows, shown: 0 };
  $('#stuRows').innerHTML = rows.length ? '' : '<tr><td colspan="11" class="py-8 text-center text-emerald-900/60">No students match.</td></tr>';
  if (rows.length) {
    if (stuObserver) appendStudentRows();
    else { S.stuList.shown = 0; while (S.stuList.shown < rows.length) appendStudentRows(); }   // no observer support: draw everything
  }
  $('#stuCount').textContent = `${rows.length} of ${S.students.length} students shown`;
  drawStudentYears();
}
inputs.stuFilter = debounce(el => { S.filter.text = el.value; drawStudents(); }, 180);
changes.stuStream = el => { S.filter.stream = el.value; drawStudents(); };
changes.stuClass = el => { S.filter.classId = el.value; drawStudents(); };
changes.stuStatus = el => { S.filter.status = el.value; drawStudents(); };

/** Saves one field straight from the table. */
changes.inline = async el => {
  const s = S.students.find(x => x.id === Number(el.dataset.id)), f = el.dataset.f, old = s[f];
  try {
    s[f] = await db('updateStudentField', s.id, f, el.value);
  } catch (err) { el.value = old; throw err; }
  el.classList.add('ring-4', 'ring-emerald-300');
  setTimeout(() => el.classList.remove('ring-4', 'ring-emerald-300'), 900);
};
actions.exportFiltered = async () => {
  const ids = filteredStudents().map(s => s.id);
  if (!ids.length) throw new Error('No students match the current filters.');
  if (await rpc('exportStudents', S.section, ids)) toast('Excel file saved');
};
actions.editStudent = async el => {
  const found = S.students.find(x => x.id === Number(el.dataset.id));
  const s = { ...found, photo: await db('getStudentPhoto', found.id) };
  openModal('Edit student', `
    <form data-form="studentSave"><input type="hidden" name="id" value="${s.id}">
      <div class="grid grid-cols-3 gap-4">${studentFields(s, true)}</div>
      ${feeEffectiveBox()}
      <div class="mt-6 flex justify-end gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button class="btn-gold">Save changes</button></div>
    </form>`, true);
};
actions.deleteStudent = async el => {
  const s = S.students.find(x => x.id === Number(el.dataset.id));
  if (!confirm(`Remove ${s.name}? Their results, fees, fines and attendance will also be deleted.`)) return;
  await db('deleteStudent', s.id);
  toast('Student removed');
  await go(S.tab);
};

/* ==========================================================================
   Teachers: profiles + class/subject assignments
   ========================================================================== */
VIEWS.teachers = async v => {
  S.teachers = await db('getTeachers', S.section);
  v.innerHTML = pageTitle('Teachers', 'Recruit teachers and assign their classes and subjects',
    '<button data-act="addTeacher" class="btn-gold">Recruit teacher</button>') + `
    <div class="card"><div class="overflow-x-auto"><table class="tbl">
      <thead><tr><th>Name</th><th>Phone</th><th>Joined / left</th><th>Qualification</th><th>Teaching load</th><th></th></tr></thead>
      <tbody>${S.teachers.length ? S.teachers.map(t => `
        <tr><td class="font-semibold">${esc(t.name)}${t.has_signature ? ' <span class="badge badge-ok">Signature</span>' : ''}${t.has_login ? ' <span class="badge badge-ok">Login</span>' : ''}${t.status && t.status !== 'Active' ? ` <span class="badge badge-bad">${esc(t.status)}</span>` : ''}</td><td>${esc(t.phone)}</td><td>${esc(t.joined_on)}${t.status && t.status !== 'Active' ? `<div class="text-xs neg">${esc(t.status)} ${dateText(t.left_on)}</div>` : ''}</td><td>${esc(t.qualification)}</td>
        <td>${loadHTML(t)}</td>
        <td class="whitespace-nowrap text-right">
          <button data-act="teacherHistory" data-id="${t.id}" class="btn-ghost !px-3 !py-1.5">History</button>
        <button data-act="assignTeacher" data-id="${t.id}" class="btn-primary !px-3 !py-1.5" ${t.status && t.status !== 'Active' ? 'disabled' : ''}>Assign classes</button>
          <button data-act="editTeacher" data-id="${t.id}" class="btn-ghost !px-3 !py-1.5">Edit</button>
          <button data-act="deleteTeacher" data-id="${t.id}" class="btn-danger !px-3 !py-1.5">Remove</button>
        </td></tr>`).join('') : '<tr><td colspan="6" class="py-8 text-center text-emerald-900/60">No teachers have been recruited yet.</td></tr>'}
      </tbody></table></div></div>`;
};
const loadSummary = t => {
  const classes = new Set(t.assignments.map(a => a.class_id)).size;
  return t.assignments.length ? `${t.assignments.length} subject${t.assignments.length > 1 ? 's' : ''} in ${classes} class${classes > 1 ? 'es' : ''}` : 'Not assigned yet';
};
const loadHTML = t => t.assignments.length
  ? `<div class="mb-1 text-xs font-semibold text-emerald-800">${loadSummary(t)}</div><div class="flex flex-wrap gap-1">${t.assignments.map(a => `<span class="badge badge-ok">${esc(a.class_name)}: ${esc(a.subject)}</span>`).join('')}</div>`
  : '<span class="text-emerald-900/55">Not assigned yet</span>';

const teacherForm = (t = {}) => `
  <form data-form="teacherSave"><input type="hidden" name="id" value="${t.id || ''}">
    <div class="grid grid-cols-2 gap-4">
      ${fld('Teacher name', 'name', t.name, { required: true })}
      ${fld('Phone', 'phone', t.phone)}
      ${fld('Joining (recruitment) date', 'joined_on', t.joined_on || ymd(new Date()), { type: 'date', required: true })}
      ${fld('Monthly salary (Rs.)', 'salary', t.salary || '', { type: 'number' })}
      ${selectFld('Employment status', 'status', ['Active', 'Left', 'Inactive'], t.status || 'Active')}
      ${fld('Exit date (if left or inactive)', 'left_on', t.left_on || '', { type: 'date' })}
      <div class="col-span-2">${fld('Status note (kept in the history)', 'status_note')}</div>
      <div class="col-span-2">${fld('Qualification', 'qualification', t.qualification)}</div>
      <div class="col-span-2 rounded-2xl bg-white/50 p-4"><div class="mb-1 text-sm font-semibold text-emerald-800">Individual login ${t.has_login ? '<span class="badge badge-ok">Active</span>' : ''}</div>
        <p class="mb-3 text-xs text-emerald-900/65">The teacher signs in from the Teacher tab and sees only the classes assigned to them. Leave both empty for no login. When editing, leave the password empty to keep it.</p>
        <div class="grid grid-cols-2 gap-4">${fld('Username', 'username', t.username || '')}<div><label class="label">Password</label><input class="field" name="password" type="password" autocomplete="new-password" placeholder="${t.has_login ? 'unchanged' : ''}"></div></div></div>
      ${signaturePicker('Signature (printed on result cards when this teacher is the class teacher)', t.signature)}
    </div>
    <div class="mt-6 flex justify-end gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button class="btn-gold">${t.id ? 'Save changes' : 'Recruit teacher'}</button></div>
  </form>`;
actions.addTeacher = () => openModal('Recruit teacher', teacherForm());
actions.editTeacher = async el => {
  const t = S.teachers.find(x => x.id === Number(el.dataset.id));
  openModal('Edit teacher', teacherForm({ ...t, signature: t.has_signature ? await db('getTeacherSignature', t.id) : '' }));
};
actions.deleteTeacher = async el => {
  const t = S.teachers.find(x => x.id === Number(el.dataset.id));
  if (!confirm(`Remove ${t.name}? Their assignments and attendance records will also be deleted.`)) return;
  await db('deleteTeacher', t.id);
  toast('Teacher removed');
  await go(S.tab);
};
forms.teacherSave = async (f, d) => {
  await db('saveTeacher', { id: d.id ? Number(d.id) : null, section: S.section, name: d.name, phone: d.phone, qualification: d.qualification, signature: signatureValue(d), joined_on: d.joined_on, salary: d.salary, status: d.status, left_on: d.left_on, status_note: d.status_note, username: d.username, password: d.password });
  toast(d.id ? 'Teacher updated' : 'Teacher recruited');
  closeModal();
  await go(S.tab);
};

async function openAssignments(teacherId) {
  S.teachers = await db('getTeachers', S.section);
  const t = S.teachers.find(x => x.id === teacherId);
  openModal(`Assignments: ${esc(t.name)}`, `
    <p class="mb-4 text-sm font-semibold text-emerald-800">${loadSummary(t)}</p>
    <table class="tbl mb-5"><thead><tr><th>Stream</th><th>Class</th><th>Subject</th><th></th></tr></thead><tbody>
      ${t.assignments.length ? t.assignments.map(a => `<tr><td>${esc(a.stream)}</td><td>${esc(a.class_name)}</td><td class="font-semibold">${esc(a.subject)}</td>
        <td class="text-right"><button data-act="removeAssignment" data-id="${a.id}" data-teacher="${t.id}" class="btn-danger !px-3 !py-1.5">Remove</button></td></tr>`).join('')
        : '<tr><td colspan="4" class="py-6 text-center text-emerald-900/60">No classes assigned yet.</td></tr>'}
    </tbody></table>
    <form data-form="assignAdd" class="rounded-2xl bg-white/50 p-4"><input type="hidden" name="teacher" value="${t.id}">
      <div class="grid grid-cols-3 items-end gap-4">
        <div><label class="label">Class</label><select name="class_id" class="field" required>${classOptions('')}</select></div>
        ${fld('Subject', 'subject', '', { required: true })}
        <button class="btn-gold">Assign</button>
      </div>
    </form>
    <div class="mt-5 flex justify-end"><button type="button" data-act="assignDone" class="btn-primary">Done</button></div>`, true);
}
actions.assignTeacher = el => openAssignments(Number(el.dataset.id));
actions.assignDone = async () => { closeModal(); await go(S.tab); };
actions.removeAssignment = async el => { await db('removeAssignment', Number(el.dataset.id)); await openAssignments(Number(el.dataset.teacher)); };
forms.assignAdd = async (f, d) => { await db('addAssignment', Number(d.teacher), Number(d.class_id), d.subject); toast('Assigned'); await openAssignments(Number(d.teacher)); };

/* ==========================================================================
   Classes: three streams, each with its own ordered class list
   ========================================================================== */
VIEWS.classes = async v => {
  S.teachers = await db('getTeachers', S.section);
  v.innerHTML = pageTitle('Classes', 'Each stream has its own classes. The order is the yearly promotion order, and the last class of a stream graduates.') +
    `<div class="grid gap-6">${STREAMS.map(st => {
      const list = S.classes.filter(c => c.stream === st.key);
      return `
      <div class="card">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-display text-xl font-bold">${st.key} <span class="text-emerald-800">${urdu(st.ur)}</span></h3>
          <form data-form="classAdd" class="flex items-end gap-2"><input type="hidden" name="stream" value="${st.key}">
            <div><label class="label">New class name</label><input name="name" class="field !py-1.5" required></div>
            <button class="btn-gold !py-2">Add class</button></form>
        </div>
        <table class="tbl"><thead><tr><th>Class</th><th class="num">Students</th><th>Class teacher</th><th></th></tr></thead><tbody>
          ${list.length ? list.map((c, i) => `
            <tr><td class="font-semibold">${esc(c.name)}</td><td class="num">${c.student_count}</td>
            <td><select class="field !py-1 text-sm" style="min-width:180px" data-change="classTeacher" data-id="${c.id}"><option value="">None</option>${S.teachers.map(t => `<option value="${t.id}" ${t.id === c.class_teacher_id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></td>
            <td class="whitespace-nowrap text-right">
              <button data-act="moveClass" data-id="${c.id}" data-dir="up" class="btn-ghost !px-3 !py-1.5" ${i === 0 ? 'disabled' : ''}>Up</button>
              <button data-act="moveClass" data-id="${c.id}" data-dir="down" class="btn-ghost !px-3 !py-1.5" ${i === list.length - 1 ? 'disabled' : ''}>Down</button>
              <button data-act="renameClass" data-id="${c.id}" class="btn-ghost !px-3 !py-1.5">Rename</button>
              <button data-act="deleteClass" data-id="${c.id}" class="btn-danger !px-3 !py-1.5">Delete</button>
            </td></tr>`).join('') : '<tr><td colspan="4" class="py-6 text-center text-emerald-900/60">No classes in this stream yet.</td></tr>'}
        </tbody></table>
      </div>`;
    }).join('')}</div>`;
};
changes.classTeacher = async el => { await db('setClassTeacher', Number(el.dataset.id), Number(el.value) || null); toast('Class teacher updated'); };
forms.classAdd = async (f, d) => { await db('addClass', S.section, d.stream, d.name); toast('Class added'); await go(S.tab); };
actions.moveClass = async el => { await db('moveClass', Number(el.dataset.id), el.dataset.dir); await go(S.tab); };
actions.renameClass = el => {
  const c = S.classes.find(x => x.id === Number(el.dataset.id));
  openModal('Rename class', `
    <form data-form="classRename"><input type="hidden" name="id" value="${c.id}">
      ${fld('Class name', 'name', c.name, { required: true })}
      <div class="mt-6 flex justify-end gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button class="btn-gold">Save name</button></div>
    </form>`);
};
forms.classRename = async (f, d) => { await db('renameClass', Number(d.id), d.name); toast('Class renamed'); closeModal(); await go(S.tab); };
actions.deleteClass = async el => {
  const c = S.classes.find(x => x.id === Number(el.dataset.id));
  if (!confirm(`Delete ${c.name}? Teacher assignments for this class will also be removed.`)) return;
  await db('deleteClass', c.id);
  toast('Class deleted');
  await go(S.tab);
};

/* ==========================================================================
   Attendance: monthly checkbox matrix + overview. Fridays are off-days.
   ========================================================================== */
VIEWS.attendance = async v => {
  const a = S.att;
  if (!a.month) a.month = curMonth();
  v.innerHTML = pageTitle('Attendance', 'Click a day to cycle absent, present and leave. Fridays and custom holidays are off-days.') + `
    <div class="card mb-5"><div class="flex flex-wrap items-end gap-4">
      <div class="flex rounded-xl bg-emerald-900/10 p-1">
        <button data-act="attKind" data-kind="student" class="seg ${a.kind === 'student' ? 'seg-on' : ''}">Student attendance</button>
        <button data-act="attKind" data-kind="teacher" class="seg ${a.kind === 'teacher' ? 'seg-on' : ''}">Teacher attendance</button>
      </div>
      <div><label class="label">Month</label><input type="month" class="field" value="${a.month}" data-change="attMonth"></div>
      ${a.kind === 'student' ? `<div><label class="label">Class</label><select class="field" data-change="attClass"><option value="">All classes</option>${classOptions(a.classId)}</select></div>` : ''}
      <button data-act="attToday" class="btn-ghost">Current month</button>
    </div></div>
    <div id="attBody"></div><div id="attLocks"></div>`;
  await loadAtt();
};
async function loadAtt() {
  const a = S.att;
  const [people, rows, hols, orders] = await Promise.all([db(a.kind === 'student' ? 'getStudents' : 'getTeachers', S.section), db('getAttendance', S.section, a.kind, a.month), db('getHolidays', S.section, a.month), a.kind === 'student' ? db('getClassOrders', S.section) : {}]);
  a.orders = orders || {};
  a.hol = new Map(hols.map(h => [h.date, h.name]));
  // Only people who had joined by this month are listed: earlier months are hidden. Teachers who already have marks stay visible.
  const marked = new Set(rows.map(r => r.person_id));
  const joinedBy = p => { const m = String((a.kind === 'student' ? p.admission_date || p.admitted_on : p.joined_on) || '').slice(0, 7); return !m || m <= a.month; };
  // Students who left or passed out stay visible for the months they were still enrolled; teachers who left, for the months up to their leaving date
  const enrolled = p => p.status === 'Active' || (p.status_date && String(p.status_date).slice(0, 7) >= a.month);
  const list = people.filter(p => (a.kind === 'student' ? enrolled(p) && joinedBy(p) : (joinedBy(p) && (!p.left_on || String(p.left_on).slice(0, 7) >= a.month)) || marked.has(p.id)));
  a.people = a.kind === 'student' && a.classId ? list.filter(p => String(p.class_id) === String(a.classId)) : list;
  if (a.kind === 'student') a.people = orderStudents(a.people);
  a.present = new Map(rows.map(r => [`${r.person_id}|${r.date}`, { st: r.status, at: r.marked_at }]));
  drawAtt();
  await drawLocks();
}
/** Days saved by teachers. The admin can still edit the grid above or unlock a day for the teacher. */
async function drawLocks() {
  const box = $('#attLocks');
  if (!box) return;
  if (S.att.kind !== 'student') { box.innerHTML = ''; return; }
  const locks = await db('getAttendanceLocks', S.section, S.att.month);
  box.innerHTML = `<div class="card mt-6"><h3 class="mb-1 font-display text-lg font-bold">Saved by teachers</h3>
    <p class="mb-4 text-sm text-emerald-900/70">These class sheets are locked for teachers. You can still change the grid above, or unlock a day so the teacher can save it again.</p>
    <table class="tbl"><thead><tr><th>Date</th><th>Stream</th><th>Class</th><th>Saved at</th><th></th></tr></thead><tbody>
    ${locks.length ? locks.map(l => `<tr><td>${dateBoth(l.date)}</td><td>${esc(l.stream)}</td><td class="font-semibold">${esc(l.class_name)}</td><td>${dateBoth(String(l.locked_at).slice(0, 10))}<div class="text-xs text-teal-600">${esc(String(l.locked_at).slice(11, 16))}</div></td>
      <td class="text-right"><button data-act="unlockAtt" data-class="${l.class_id}" data-date="${l.date}" class="btn-ghost !px-3 !py-1.5">Unlock</button></td></tr>`).join('')
      : '<tr><td colspan="5" class="py-5 text-center text-emerald-900/60">No teacher-saved days this month.</td></tr>'}
    </tbody></table></div>`;
}
actions.unlockAtt = async el => {
  if (!confirm('Unlock this class and day so the teacher can save it again?')) return;
  await db('unlockAttendance', Number(el.dataset.class), el.dataset.date);
  toast('Unlocked');
  await drawLocks();
};
/** Applies each class's saved sequence (students not yet in it follow in roll order). */
function orderStudents(list) {
  const groups = new Map();
  for (const p of list) { if (!groups.has(p.class_id)) groups.set(p.class_id, []); groups.get(p.class_id).push(p); }
  const out = [];
  for (const [cid, g] of groups) {
    const ord = ((S.att.orders || {})[cid] || {}).order || [];
    if (ord.length) { const pos = new Map(ord.map((id, i) => [id, i])); g.sort((x, y) => (pos.has(x.id) ? pos.get(x.id) : 1e9) - (pos.has(y.id) ? pos.get(y.id) : 1e9)); }
    out.push(...g);
  }
  return out;
}
const orderState = () => ({ locked: false, order: [], ...((S.att.orders || {})[Number(S.att.classId)] || {}) });
function saveOrder() {
  const a = S.att, cid = Number(a.classId), ids = a.people.map(p => p.id);
  a.orders[cid] = { locked: false, order: ids };
  a.saveChain = (a.saveChain || Promise.resolve()).then(() => db('saveClassOrder', cid, ids)).catch(e => toast(e.message || String(e), 'err'));   // one write at a time, in order
}
const ATT_NEXT = { '': 'P', P: 'L', L: '' };
const attTitle = (st, m) => `${st === 'P' ? 'Present' : st === 'L' ? 'On leave' : 'Absent'}${m ? `, marked ${m.at}` : ''}`;
function drawAtt() {
  const sw = $('#attBody .sticky-wrap'), keep = sw ? [sw.scrollTop, sw.scrollLeft] : null;   // keep the scroll position when a student is moved
  const a = S.att, dim = new Date(+a.month.slice(0, 4), +a.month.slice(5), 0).getDate(), today = ymd(new Date());
  const days = Array.from({ length: dim }, (_, i) => i + 1), dow = d => new Date(+a.month.slice(0, 4), +a.month.slice(5) - 1, d).getDay();
  const off = d => (dow(d) === 5 ? 'Friday: weekly off-day' : a.hol.has(`${a.month}-${pad(d)}`) ? `Holiday: ${a.hol.get(`${a.month}-${pad(d)}`)}` : '');
  if (!a.people.length) { $('#attBody').innerHTML = `<div class="card py-10 text-center text-emerald-900/70">No ${a.kind === 'student' ? 'active students admitted by this month' : 'teachers who had joined by this month'} to show.</div>`; return; }
  const head = days.map(d => { const ds = `${a.month}-${pad(d)}`, o = off(d); return `<th class="${o ? 'fri' : ''} ${ds === today ? 'today' : ''}" title="${esc(dateText(ds))}${o ? ' - ' + esc(o) : ''}"><div class="text-[10px] opacity-70">${'SMTWTFS'[dow(d)]}</div>${d}</th>`; }).join('');
  const canOrder = a.kind === 'student' && a.classId && S.role === 'admin', lockedOrder = canOrder && orderState().locked;
  const ctl = (p, i) => canOrder ? `<span class="ord-handle ${lockedOrder ? 'off' : ''}" title="${lockedOrder ? 'Order is locked' : 'Drag to move'}">&#8942;&#8942;</span><button type="button" class="ord-btn" data-act="attMove" data-id="${p.id}" data-dir="up" title="Move up" ${lockedOrder || i === 0 ? 'disabled' : ''}>&uarr;</button><button type="button" class="ord-btn" data-act="attMove" data-id="${p.id}" data-dir="down" title="Move down" ${lockedOrder || i === a.people.length - 1 ? 'disabled' : ''}>&darr;</button>` : '';
  const body = a.people.map((p, i) => `<tr data-pid="${p.id}"><td class="nm"><div class="flex items-center gap-1">${ctl(p, i)}<span class="ml-1">${esc(p.roll_no ? p.roll_no + ' - ' : '')}${esc(p.name)}</span></div></td>${days.map(d => {
    const ds = `${a.month}-${pad(d)}`, o = off(d);
    if (o) return `<td class="fri" title="${esc(o)}">${a.hol.has(ds) ? 'H' : ''}</td>`;
    if (exitOf(p) && ds > exitOf(p)) return `<td class="fri" title="After the exit date (${esc(exitOf(p))})"></td>`;
    const m = a.present.get(`${p.id}|${ds}`), st = m ? m.st : '';
    return `<td class="${ds === today ? 'today-col' : ''}"><button type="button" class="att-cell ${st.toLowerCase()}" data-act="attCycle" data-id="${p.id}" data-date="${ds}" data-st="${st}" title="${esc(attTitle(st, m))}">${st === 'P' ? '&#10003;' : st}</button></td>`;
  }).join('')}</tr>`).join('');
  const orderBar = canOrder ? `<div class="mb-3 flex flex-wrap items-center gap-2">
      <button type="button" data-act="attSortRoll" class="btn-ghost !px-3 !py-1.5" ${lockedOrder ? 'disabled' : ''}>Sort by Roll No</button>
      <button type="button" data-act="attLockOrder" class="${lockedOrder ? 'btn-gold' : 'btn-ghost'} !px-3 !py-1.5">${lockedOrder ? 'Unlock order' : 'Lock order'}</button>
      <span class="text-xs text-teal-700">${lockedOrder ? 'This order is locked and saved. It cannot change until you unlock it.' : 'Drag the handle or use the arrows to arrange students. Changes save automatically. Lock the order when it is final.'}</span></div>`
    : a.kind === 'student' ? '<p class="mb-3 text-xs text-teal-700">Choose one class to arrange its students by roll number.</p>' : '';
  $('#attBody').innerHTML = `<div class="card !p-4">${orderBar}<div class="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-teal-700"><span class="font-semibold">${esc(monthLabel(a.month))}</span>
    <span><span class="att-cell p inline-block w-6 text-center">&#10003;</span> present</span><span><span class="att-cell l inline-block w-6 text-center">L</span> leave</span><span>blank = absent</span><span>hatched = Friday, H = holiday</span></div>
    <div class="sticky-wrap"><table class="att ${canOrder ? 'ordering' : ''}"><thead><tr><th class="nm">${a.kind === 'student' ? 'Student' : 'Teacher'}</th>${head}</tr></thead><tbody>${body}</tbody></table></div></div>
    <div class="card mt-5"><h3 class="mb-3 font-display text-lg font-bold">Monthly summary</h3><div id="attSummary" class="max-h-72 overflow-auto"></div></div>`;
  drawAttSummary();
  if (keep) { const w = $('#attBody .sticky-wrap'); if (w) { w.scrollTop = keep[0]; w.scrollLeft = keep[1]; } }
}
/** Working days = days in the month minus Fridays (counted up to today for the current month). */
/** The day a student or teacher stopped (leaving, pass-out or inactive date), or '' while still active. */
const exitOf = p => { const d = S.att.kind === 'student' ? p.status_date : p.left_on; return p.status && p.status !== 'Active' && d ? String(d).slice(0, 10) : ''; };
function workingDays(month, hol, cap) {
  if (cap && cap.slice(0, 7) < month) return 0;
  const [y, mo] = month.split('-').map(Number);
  let last = month === curMonth() ? new Date().getDate() : new Date(y, mo, 0).getDate();
  if (cap && cap.slice(0, 7) === month) last = Math.min(last, Number(cap.slice(8, 10)));
  let n = 0;
  for (let d = 1; d <= last; d++) if (new Date(y, mo - 1, d).getDay() !== 5 && !(hol && hol.has(`${month}-${pad(d)}`))) n++;
  return n;
}
function drawAttSummary() {
  const a = S.att, box = $('#attSummary');
  if (!box) return;
  const dim = new Date(+a.month.slice(0, 4), +a.month.slice(5), 0).getDate();
  const rows = a.people.map(p => {
    const wd = workingDays(a.month, a.hol, exitOf(p));
    let present = 0, leave = 0;
    for (let d = 1; d <= dim; d++) { const m = a.present.get(`${p.id}|${a.month}-${pad(d)}`); if (m) { if (m.st === 'P') present++; else leave++; } }
    const p100 = Math.min(pct(present, wd), 100);
    return `<tr><td class="font-semibold">${esc(p.name)}</td><td class="num">${present}</td><td class="num">${leave}</td><td class="num">${wd}</td><td class="num">${Math.max(wd - present - leave, 0)}</td>
      <td class="w-64"><div class="flex items-center gap-3"><div class="h-2.5 flex-1 overflow-hidden rounded-full bg-emerald-900/10"><div class="h-full rounded-full ${p100 >= 75 ? 'bg-emerald-600' : p100 >= 50 ? 'bg-gold-500' : 'bg-red-500'}" style="width:${p100}%"></div></div><span class="w-12 text-right text-sm font-semibold tabular-nums">${fmt1(p100)}%</span></div></td></tr>`;
  }).join('');
  box.innerHTML = `<table class="tbl"><thead><tr><th>Name</th><th class="num">Present</th><th class="num">Leave</th><th class="num">Working days</th><th class="num">Absent</th><th>Attendance</th></tr></thead><tbody>${rows}</tbody></table>`;
}
/** Smooth move: rows slide from their old position to the new one instead of jumping. */
function flipRows(change) {
  const rows = () => [...document.querySelectorAll('#attBody tr[data-pid]')];
  const first = new Map(rows().map(r => [r.dataset.pid, r.getBoundingClientRect().top]));
  change();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const r of rows()) {
    const d = first.get(r.dataset.pid) - r.getBoundingClientRect().top;
    if (d && r.animate) r.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}
actions.attMove = el => {
  const a = S.att, i = a.people.findIndex(p => p.id === Number(el.dataset.id)), j = el.dataset.dir === 'up' ? i - 1 : i + 1;
  if (orderState().locked) throw new Error('The order is locked. Unlock it first.');
  if (i < 0 || j < 0 || j >= a.people.length) return;
  [a.people[i], a.people[j]] = [a.people[j], a.people[i]];
  flipRows(() => { saveOrder(); drawAtt(); });
};
actions.attSortRoll = async () => {
  const a = S.att, cid = Number(a.classId);
  if (orderState().locked) throw new Error('The order is locked. Unlock it first.');
  await a.saveChain;
  await db('sortClassByRoll', cid);
  a.orders[cid] = { locked: false, order: [] };
  a.people.sort((x, y) => String(x.roll_no).localeCompare(String(y.roll_no), undefined, { numeric: true }));
  drawAtt(); toast('Sorted by roll number');
};
actions.attLockOrder = async () => {
  const a = S.att, cid = Number(a.classId), st = orderState();
  await a.saveChain;
  if (st.locked) {
    if (!confirm('Unlock the student order so it can be changed again?')) return;
    await db('setClassOrderLock', cid, false);
    a.orders[cid] = { ...st, locked: false };
    toast('Order unlocked');
  } else {
    const ids = a.people.map(p => p.id);
    await db('setClassOrderLock', cid, true, ids);
    a.orders[cid] = { locked: true, order: ids };
    toast('Order locked and saved');
  }
  drawAtt();
};
/* Drag and drop: the handle makes its row draggable; dropping puts the student where the target row is. */
let dragPid = null;
const attRow = e => (e.target.closest ? e.target.closest('#attBody tr[data-pid]') : null);
document.addEventListener('mousedown', e => { const h = e.target.closest && e.target.closest('.ord-handle:not(.off)'); if (h) h.closest('tr').draggable = true; });
document.addEventListener('mouseup', () => document.querySelectorAll('#attBody tr[draggable=true]').forEach(tr => { tr.draggable = false; }));
document.addEventListener('dragstart', e => {
  const tr = attRow(e);
  if (!tr || !tr.draggable) return;
  dragPid = Number(tr.dataset.pid);
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragPid));
  tr.classList.add('dragging');
});
document.addEventListener('dragover', e => {
  const tr = attRow(e);
  if (!tr || dragPid === null) return;
  e.preventDefault();
  document.querySelectorAll('#attBody tr.drag-over').forEach(x => x !== tr && x.classList.remove('drag-over'));
  tr.classList.add('drag-over');
});
document.addEventListener('drop', e => {
  const tr = attRow(e);
  if (!tr || dragPid === null) return;
  e.preventDefault();
  const a = S.att, from = a.people.findIndex(p => p.id === dragPid), to = a.people.findIndex(p => p.id === Number(tr.dataset.pid));
  dragPid = null;
  if (from < 0 || to < 0 || from === to) return drawAtt();
  if (orderState().locked) return;
  a.people.splice(to, 0, a.people.splice(from, 1)[0]);
  flipRows(() => { saveOrder(); drawAtt(); });
});
document.addEventListener('dragend', () => { dragPid = null; document.querySelectorAll('#attBody tr.dragging, #attBody tr.drag-over, #attBody tr[draggable=true]').forEach(tr => { tr.classList.remove('dragging', 'drag-over'); tr.draggable = false; }); });
actions.attKind = el => { S.att.kind = el.dataset.kind; return go('attendance'); };
actions.attToday = () => { S.att.month = curMonth(); return go('attendance'); };
changes.attMonth = el => { if (!el.value) return; S.att.month = el.value; return loadAtt(); };
changes.attClass = el => { S.att.classId = el.value; return loadAtt(); };
actions.attCycle = async el => {
  const a = S.att, key = `${el.dataset.id}|${el.dataset.date}`, next = ATT_NEXT[el.dataset.st];
  const stamp = await db('setAttendance', S.section, a.kind, Number(el.dataset.id), el.dataset.date, next || false);   // an off-day or a date before admission is refused here
  if (next) a.present.set(key, { st: next, at: stamp }); else a.present.delete(key);
  el.dataset.st = next; el.className = `att-cell ${next.toLowerCase()}`; el.innerHTML = next === 'P' ? '&#10003;' : next; el.title = attTitle(next, next ? { at: stamp } : null);
  drawAttSummary();
};

/* ==========================================================================
   Fees: monthly ledger, previous dues (بقیہ فیس) and fines (جرمانہ)
   ========================================================================== */
VIEWS.fees = async v => {
  S.fee = { month: curMonth(), classId: '', text: '', sheet: [] };
  v.innerHTML = pageTitle('Fees', 'Monthly fees with previous dues and fines. Payments clear the oldest dues first.') + `
    <div class="card mb-5"><div class="grid grid-cols-4 gap-4">
      <div><label class="label">Month</label><input type="month" class="field" value="${S.fee.month}" data-change="feeMonth"></div>
      <div><label class="label">Class</label><select class="field" data-change="feeClass"><option value="">All classes</option>${classOptions('')}</select></div>
      <div class="col-span-2"><label class="label">Search by roll number or name</label><input class="field" data-input="feeText"></div>
    </div></div>
    <div id="feeSummary" class="mb-5 grid grid-cols-5 gap-4"></div>
    <div class="card"><div class="overflow-x-auto"><table class="tbl">
      <thead><tr><th>Roll</th><th>Student</th><th>Class</th><th class="num">Previous dues ${urdu('بقیہ فیس')}</th><th class="num">Monthly fee</th><th class="num">Paid</th><th class="num">Fines ${urdu('جرمانہ')}</th><th class="num">Total payable</th><th>Status</th><th></th></tr></thead>
      <tbody id="feeRows"></tbody></table></div></div>`;
  await loadFees();
};
async function loadFees() { S.fee.sheet = await db('getFeeSheet', S.section, S.fee.month); drawFees(); }
function drawFees() {
  const F = S.fee, t = F.text.toLowerCase();
  const list = F.sheet.filter(r =>
    (r.student_status === 'Active' || r.payable > 0) && (!F.classId || String(r.class_id) === F.classId) &&
    (!t || r.name.toLowerCase().includes(t) || String(r.roll_no).toLowerCase().includes(t)));
  const sum = k => list.reduce((x, r) => x + r[k], 0);
  const box = (label, val) => `<div class="card !p-5"><div class="text-xl font-bold tabular-nums">${money(val)}</div><div class="text-xs font-medium text-emerald-900/65">${label}</div></div>`;
  $('#feeSummary').innerHTML = box(`Fees due, ${monthLabel(F.month)}`, sum('currentDue')) + box('Collected this month', sum('currentPaid')) +
    box('Previous dues', sum('previous')) + box('Fines outstanding', sum('finesOut')) + box('Total payable', sum('payable'));
  $('#feeRows').innerHTML = list.length ? list.map(r => `
    <tr><td>${esc(r.roll_no)}</td><td class="whitespace-nowrap font-semibold">${esc(r.name)}</td><td class="whitespace-nowrap">${esc(r.class_name)}</td>
    <td class="num">${money(r.previous)}</td><td class="num">${money(r.currentDue)}${r.next_fee != null ? `<div class="text-xs text-gold-700" title="The new fee applies from this month; earlier months keep their old fee">&rarr; ${money(r.next_fee)} from ${esc(shortMonth(r.next_fee_from))}</div>` : ''}</td><td class="num">${money(r.currentPaid)}</td>
    <td class="num">${money(r.finesOut)}</td><td class="num font-bold">${money(r.payable)}</td><td>${feeBadge(r.status)}</td>
    <td class="whitespace-nowrap text-right">
      <button data-act="collectFee" data-id="${r.student_id}" class="btn-gold !px-3 !py-1.5" ${r.previous + r.currentOwed <= 0 ? 'disabled' : ''}>Collect</button>
      <button data-act="feeAccount" data-id="${r.student_id}" class="btn-ghost !px-3 !py-1.5">Account</button>
      <button data-act="receipt" data-id="${r.student_id}" class="btn-primary !px-3 !py-1.5">Receipt</button>
    </td></tr>`).join('') : '<tr><td colspan="10" class="py-8 text-center text-emerald-900/60">No students to show.</td></tr>';
}
changes.feeMonth = el => { if (!el.value) return; S.fee.month = el.value; return loadFees(); };
changes.feeClass = el => { S.fee.classId = el.value; drawFees(); };
inputs.feeText = debounce(el => { S.fee.text = el.value; drawFees(); }, 180);

actions.collectFee = el => {
  const r = S.fee.sheet.find(x => x.student_id === Number(el.dataset.id));
  const max = r.previous + r.currentOwed;
  openModal('Collect fee', `
    <form data-form="feeCollect"><input type="hidden" name="id" value="${r.student_id}">
      <p class="mb-3 font-semibold">${esc(r.name)} <span class="font-normal text-emerald-900/60">Roll ${esc(r.roll_no)}</span></p>
      <div class="mb-4 grid grid-cols-3 gap-3 text-sm">${miniBox(`Previous dues`, money(r.previous))}${miniBox(`${monthLabel(S.fee.month)} fee owed`, money(r.currentOwed))}${miniBox('Collectable now', money(max), 'text-emerald-800')}</div>
      <div class="grid grid-cols-2 gap-4">${fld('Amount received', 'amount', '', { type: 'number', required: true })}${fld('Payment date', 'paid_on', ymd(new Date()), { type: 'date', required: true })}</div>
      <p class="mt-3 text-xs text-emerald-900/65">The payment clears dues brought forward first, then the oldest unpaid months, then this month. Fines are paid in the Account window.</p>
      <div class="mt-6 flex justify-end gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button class="btn-gold">Save payment</button></div>
    </form>`);
  $('[name=amount]').focus();
};
forms.feeCollect = async (f, d) => {
  await db('collectFee', Number(d.id), S.fee.month, Number(d.amount), d.paid_on);
  toast('Payment recorded');
  closeModal();
  await loadFees();
};

async function openAccount(id) {
  const [a, sch] = await Promise.all([db('getFeeAccount', id, S.fee.month), db('getFeeSchedule', 'student', id)]);
  S.fee.accountId = id;
  openModal(`Fee account: ${esc(a.student.name)}`, `
    <div class="mb-5 grid grid-cols-4 gap-3 text-sm">
      ${miniBox(`Previous dues ${urdu('بقیہ فیس')}`, money(a.previous))}${miniBox(`${monthLabel(S.fee.month)} fee owed`, money(a.currentOwed))}
      ${miniBox(`Fines ${urdu('جرمانہ')}`, money(a.finesOut))}${miniBox('Total payable', money(a.payable), 'text-emerald-800')}
    </div>
    ${feeLedgerBlock('student', id, sch, a.months, a.opening)}
    <h4 class="mb-2 font-display text-lg font-bold">Fines ${urdu('جرمانہ')}</h4>
    <table class="tbl mb-4"><thead><tr><th>Date</th><th>Reason</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${a.fines.length ? a.fines.map(f => `<tr><td>${dateBoth(f.date)}</td><td>${esc(f.reason)}</td><td class="num">${money(f.amount)}</td>
        <td>${f.paid >= f.amount ? '<span class="badge badge-ok">Paid</span>' : '<span class="badge badge-bad">Unpaid</span>'}</td>
        <td class="whitespace-nowrap text-right">${f.paid >= f.amount ? '' : `<button data-act="payFine" data-id="${f.id}" class="btn-gold !px-3 !py-1.5">Mark paid</button>`}
        <button data-act="deleteFine" data-id="${f.id}" class="btn-danger !px-3 !py-1.5">Delete</button></td></tr>`).join('')
        : '<tr><td colspan="5" class="py-4 text-center text-emerald-900/60">No fines recorded.</td></tr>'}
    </tbody></table>
    <form data-form="fineAdd" class="rounded-2xl bg-white/50 p-4"><input type="hidden" name="id" value="${id}">
      <div class="grid grid-cols-4 items-end gap-4">
        ${fld('Fine amount', 'amount', '', { type: 'number', required: true })}${fld('Reason', 'reason', '')}${fld('Date', 'date', ymd(new Date()), { type: 'date', required: true })}
        <button class="btn-gold">Add fine</button>
      </div>
    </form>
    <div class="mt-5 flex justify-end gap-3"><button type="button" data-act="receipt" data-id="${id}" class="btn-gold">Fee receipt</button><button type="button" data-act="closeModal" class="btn-primary">Close</button></div>`, true);
}
actions.feeAccount = el => openAccount(Number(el.dataset.id));
forms.fineAdd = async (f, d) => { await db('addFine', Number(d.id), Number(d.amount), d.reason, d.date); toast('Fine added'); await openAccount(Number(d.id)); await loadFees(); };
actions.payFine = async el => { await db('payFine', Number(el.dataset.id)); toast('Fine marked as paid'); await openAccount(S.fee.accountId); await loadFees(); };
actions.deleteFine = async el => {
  if (!confirm('Delete this fine?')) return;
  await db('deleteFine', Number(el.dataset.id));
  await openAccount(S.fee.accountId);
  await loadFees();
};

/* ==========================================================================
   Result entry (subject-wise marks, live percentage and grade)
   ========================================================================== */
/** Exam names that apply to a student or class: every-class exams plus those set for its stream or class. */
function examNames(ctx) {
  const names = [];
  for (const e of S.exams) {
    const ok = (!e.stream && !e.class_id) || (ctx && ((e.stream && e.stream === ctx.stream) || (e.class_id && e.class_id === ctx.class_id)));
    if (ok && !names.includes(e.name)) names.push(e.name);
  }
  return names;
}
const resContext = () => {
  const R = S.res, stu = S.students.find(x => String(x.id) === String(R.studentId));
  if (stu) return { stream: stu.stream, class_id: stu.class_id };
  const cls = S.classes.find(c => String(c.id) === String(R.classId));
  return cls ? { stream: cls.stream, class_id: cls.id } : null;
};
VIEWS.results = async v => {
  [S.students, S.exams] = await Promise.all([db('getStudents', S.section), db('getExams', S.section)]);
  S.res = { classId: '', studentId: '', exam: '', year: String(new Date().getFullYear()), rows: [] };
  v.innerHTML = pageTitle('Result entry', 'Enter subject-wise marks. Subjects come from the class assignment, and the percentage and grade follow your grading rules.',
    '<button data-act="nav" data-tab="classresult" class="btn-ghost">Export class result</button>') + '<div id="resWrap"></div>';
  drawRes();
};
function drawRes() {
  const R = S.res;
  const list = S.students.filter(s => !R.classId || String(s.class_id) === R.classId);
  const names = examNames(resContext());
  if (!names.includes(R.exam)) R.exam = names[0] || '';
  $('#resWrap').innerHTML = `
    <div class="card mb-5"><div class="grid grid-cols-4 gap-4">
      <div><label class="label">Class</label><select class="field" data-change="resClass"><option value="">All classes</option>${classOptions(R.classId)}</select></div>
      <div><label class="label">Student</label><select class="field" data-change="resStudent"><option value=""></option>
        ${list.map(s => `<option value="${s.id}" ${String(s.id) === String(R.studentId) ? 'selected' : ''}>${esc(s.roll_no)} - ${esc(s.name)}</option>`).join('')}</select></div>
      <div><label class="label">Exam</label><select class="field" data-change="resExam">${names.map(e => `<option ${e === R.exam ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
      <div><label class="label">Year</label><input type="number" class="field" value="${esc(R.year)}" data-change="resYear"></div>
    </div></div>
    ${R.studentId ? marksPanel() : ''}`;
  if (R.studentId) refreshMarkCalc();
}
function marksPanel() {
  const R = S.res, stu = S.students.find(s => String(s.id) === String(R.studentId));
  return `
    <div class="card">
      <div class="mb-4 flex items-center justify-between">
        <div><h3 class="font-display text-xl font-bold">${esc(stu.name)}</h3><p class="text-sm text-emerald-900/70">Roll ${esc(stu.roll_no)}, ${esc(stu.class_name)}, ${esc(R.exam)} ${esc(R.year)}</p></div>
        <button data-act="addSubject" class="btn-ghost">Add subject</button>
      </div>
      <table class="tbl"><thead><tr><th>Subject</th><th class="w-32">Total marks</th><th class="w-32">Obtained</th><th class="num w-24">Percent</th><th class="w-20">Grade</th><th class="w-20"></th></tr></thead>
        <tbody id="markRows">${markRowsHTML()}</tbody></table>
      <div id="markSummary" class="mt-5 grid grid-cols-5 gap-3"></div>
      <div class="mt-5 flex justify-end gap-3">
        ${R.saved ? '<button data-act="deleteMarks" class="btn-danger">Delete this record</button>' : ''}
        <button data-act="saveMarks" class="btn-gold">Save results</button>
      </div>
    </div>`;
}
function markRowsHTML() {
  return S.res.rows.map((r, i) => `
    <tr><td><input class="field !py-1.5" data-input="mark" data-i="${i}" data-k="subject" value="${esc(r.subject)}"></td>
    <td><input type="number" min="0" step="any" class="field !py-1.5" data-input="mark" data-i="${i}" data-k="total" value="${esc(r.total)}"></td>
    <td><input type="number" min="0" step="any" class="field !py-1.5" data-input="mark" data-i="${i}" data-k="obtained" value="${esc(r.obtained)}"></td>
    <td class="num" id="pc${i}"></td><td class="font-semibold" id="gr${i}"></td>
    <td class="text-right"><button data-act="removeSubject" data-i="${i}" class="btn-danger !px-2.5 !py-1">Remove</button></td></tr>`).join('');
}
/** Updates percent / grade cells and totals without re-rendering the inputs (keeps focus). Empty rows are "not entered". */
function refreshMarkCalc() {
  const rows = S.res.rows, stream = (resContext() || {}).stream;
  const entered = r => r.obtained !== '' && r.obtained != null;
  let tot = 0, obt = 0;
  rows.forEach((r, i) => {
    const pc = $(`#pc${i}`), gr = $(`#gr${i}`);
    if (!entered(r)) { if (pc) pc.textContent = ''; if (gr) gr.textContent = ''; return; }
    const o = Number(r.obtained) || 0, t = Number(r.total) || 0;
    tot += t; obt += o;
    const p = pct(o, t);
    if (pc) pc.textContent = fmt1(p) + '%';
    if (gr) gr.textContent = gradeOf(p, stream);
  });
  const p = pct(obt, tot), passed = hasPassed(rows.filter(entered), stream);
  const box = (label, val, cls = '') => `<div class="rounded-2xl bg-white/70 p-4 text-center"><div class="text-xl font-bold tabular-nums ${cls}">${val}</div><div class="text-xs font-medium text-emerald-900/65">${label}</div></div>`;
  const sum = $('#markSummary');
  if (sum) sum.innerHTML = box('Total marks', tot) + box('Obtained', obt) + box('Percentage', fmt1(p) + '%') + box('Grade', gradeOf(p, stream)) + box('Result', passed ? 'Pass' : 'Fail', passed ? 'text-emerald-700' : 'neg');
}
/** Loads saved marks, or starts a fresh sheet from the class's assigned subjects (falling back to stream defaults). */
async function loadMarks() {
  const R = S.res;
  if (!R.studentId) { R.rows = []; return drawRes(); }
  const stu = S.students.find(x => String(x.id) === String(R.studentId));
  const names = examNames(resContext());
  if (!names.includes(R.exam)) R.exam = names[0] || '';
  if (!R.exam) { R.rows = []; R.saved = false; return drawRes(); }
  const [saved, assigned] = await Promise.all([db('getMarks', Number(R.studentId), R.exam, R.year), db('getClassSubjects', stu.class_id || 0)]);
  R.saved = saved.length > 0;
  const rows = saved.map(m => ({ subject: m.subject, total: m.total, obtained: m.obtained }));
  for (const a of assigned) {   // assigned subjects not yet marked appear as empty rows
    if (!rows.some(r => r.subject.toLowerCase() === a.subject.toLowerCase())) rows.push({ subject: a.subject, total: a.total, obtained: '' });
  }
  if (!rows.length) (DEFAULT_SUBJECTS[stu.stream] || DEFAULT_SUBJECTS.School).forEach(n => rows.push({ subject: n, total: 100, obtained: '' }));
  // keep assigned subjects in their assigned order
  const order = n => { const i = assigned.findIndex(a => a.subject.toLowerCase() === n.toLowerCase()); return i < 0 ? 999 : i; };
  R.rows = rows.map((r, i) => ({ r, i })).sort((a, b) => order(a.r.subject) - order(b.r.subject) || a.i - b.i).map(x => x.r);
  drawRes();
}
changes.resClass = el => { S.res.classId = el.value; S.res.studentId = ''; S.res.rows = []; drawRes(); };
changes.resStudent = el => { S.res.studentId = el.value; return loadMarks(); };
changes.resExam = el => { S.res.exam = el.value; return loadMarks(); };
changes.resYear = el => { S.res.year = el.value; return loadMarks(); };
inputs.mark = el => { S.res.rows[Number(el.dataset.i)][el.dataset.k] = el.value; refreshMarkCalc(); };
actions.addSubject = () => { S.res.rows.push({ subject: '', total: 100, obtained: '' }); $('#markRows').innerHTML = markRowsHTML(); refreshMarkCalc(); };
actions.removeSubject = el => { S.res.rows.splice(Number(el.dataset.i), 1); $('#markRows').innerHTML = markRowsHTML(); refreshMarkCalc(); };
actions.saveMarks = async () => {
  const R = S.res;
  if (!/^\d{4}$/.test(R.year)) throw new Error('Enter a four-digit year.');
  // rows left empty are "not entered" and are not saved (an empty box is not the same as zero marks)
  const rows = R.rows.filter(r => r.obtained !== '' && r.obtained != null && String(r.subject).trim())
    .map(r => ({ subject: r.subject.trim(), total: Number(r.total) || 0, obtained: Number(r.obtained) || 0 }));
  if (!rows.length) throw new Error('Enter marks for at least one subject. Empty rows are not saved.');
  const bad = rows.find(r => r.total <= 0 || r.obtained < 0 || r.obtained > r.total);
  if (bad) throw new Error(`Check the marks entered for ${bad.subject}.`);
  if (new Set(rows.map(r => r.subject.toLowerCase())).size !== rows.length) throw new Error('Each subject name must be unique.');
  await db('saveMarks', Number(R.studentId), R.exam, R.year, rows);
  toast('Results saved');
  await loadMarks();
};
actions.deleteMarks = async () => {
  const R = S.res;
  if (!confirm(`Delete the ${R.exam} ${R.year} record for this student?`)) return;
  await db('deleteMarks', Number(R.studentId), R.exam, R.year);
  toast('Record deleted');
  await loadMarks();
};

/* ==========================================================================
   Student report: bio, photo, graphs, result card (admin and teacher)
   and the digital fee receipt (admin)
   ========================================================================== */
const shortMonth = m => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const safeName = (...parts) => parts.join('_').replace(/[^\w-]+/g, '_');

/** Marks one sheet as the thing to print (the print stylesheet hides everything else) while `action` runs. */
async function outputSheet(el, mode, action) {
  document.body.classList.add('printing-' + mode);
  el.classList.add('print-target');
  try { return await action(); }
  finally { el.classList.remove('print-target'); document.body.classList.remove('printing-' + mode); }
}
async function sheetToJpg(el, name) {
  const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  if (await rpc('saveImage', canvas.toDataURL('image/jpeg', 0.95), name)) toast('Saved as JPG');
}

/* ----- Charts (plain SVG, work offline): 12 months, greyed out before admission ----- */
const CH = { slot: 64, left: 40 };
/** Background band for one month: tinted when tracked, grey before the student was admitted. */
const monthBand = (i, tracked, top, height) => `<rect x="${CH.left + i * CH.slot + 2}" y="${top}" width="${CH.slot - 4}" height="${height}" rx="8" fill="${tracked ? '#2b6451' : '#64748b'}" fill-opacity="${tracked ? '.06' : '.14'}"/>`;
const admittedTag = (i, y) => `<text x="${CH.left + i * CH.slot + CH.slot / 2}" y="${y}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#6f5628">Admitted</text>`;

function attendanceChart(items, start) {
  const { slot, left } = CH, base = 150, area = 108, W = left + items.length * slot;
  const grid = [0, 50, 100].map(v => { const y = base - (area * v) / 100; return `<line x1="${left - 6}" x2="${W}" y1="${y}" y2="${y}" stroke="#183f34" stroke-opacity=".12"/><text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#183f34" fill-opacity=".6">${v}%</text>`; }).join('');
  const cols = items.map((it, i) => {
    const x = left + i * slot + 14, w = slot - 28, cx = x + w / 2;
    const h = it.tracked && it.working ? (area * it.pct) / 100 : 0;
    const color = it.pct >= 75 ? '#2b6451' : it.pct >= 50 ? '#b08d44' : '#dc2626';
    return `${monthBand(i, it.tracked, 16, base - 16 + 44)}
      ${it.tracked ? `<rect x="${x}" y="${base - h}" width="${w}" height="${it.working ? Math.max(h, 2) : 0}" rx="6" fill="${color}"/>
      <text x="${cx}" y="${base - h - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#183f34">${it.working ? fmt1(it.pct) + '%' : '-'}</text>` : `<text x="${cx}" y="${base - 6}" text-anchor="middle" font-size="11" fill="#64748b">-</text>`}
      <text x="${cx}" y="${base + 16}" text-anchor="middle" font-size="11" font-weight="600" fill="${it.tracked ? '#183f34' : '#94a3b8'}">${shortMonth(it.month)}</text>
      <text x="${cx}" y="${base + 30}" text-anchor="middle" font-size="9.5" fill="#183f34" fill-opacity="${it.tracked ? '.7' : '.4'}">${it.tracked ? `${it.present}/${it.working} days` : (it.after ? 'after exit' : 'not admitted')}</text>
      ${it.month === start ? admittedTag(i, base + 43) : ''}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} 205" class="w-full" role="img" aria-label="Attendance over the last twelve months">${grid}${cols}</svg>`;
}
function feeChart(items, start) {
  const { slot, left } = CH, base = 150, area = 100, W = left + items.length * slot;
  const max = Math.max(1, ...items.flatMap(i => [i.due, i.paid]));
  const bar = (x, v, color) => { const h = (area * v) / max; return `<rect x="${x}" y="${base - h}" width="17" height="${v ? Math.max(h, 2) : 0}" rx="3" fill="${color}"/><text x="${x + 8.5}" y="${base - h - 4}" text-anchor="middle" font-size="8.5" fill="#183f34">${v ? Math.round(v) : ''}</text>`; };
  const cols = items.map((it, i) => {
    const x = left + i * slot + 5, cx = left + i * slot + slot / 2;
    const note = !it.tracked ? (it.after ? 'after exit' : 'not admitted') : it.due ? (it.paid >= it.due ? 'Paid' : 'Owes ' + Math.round(it.due - it.paid)) : '-';
    return `${monthBand(i, it.tracked, 16, base - 16 + 44)}
      ${it.tracked ? `${bar(x + 4, it.due, '#a9c6b8')}${bar(x + 25, it.paid, '#214f41')}` : ''}
      <text x="${cx}" y="${base + 16}" text-anchor="middle" font-size="11" font-weight="600" fill="${it.tracked ? '#183f34' : '#94a3b8'}">${shortMonth(it.month)}</text>
      <text x="${cx}" y="${base + 30}" text-anchor="middle" font-size="9.5" fill="${!it.tracked ? '#94a3b8' : it.due && it.paid < it.due ? '#b91c1c' : '#214f41'}">${note}</text>
      ${it.month === start ? admittedTag(i, base + 43) : ''}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} 205" class="w-full" role="img" aria-label="Monthly fee due and paid over twelve months">
    <rect x="${left}" y="0" width="10" height="10" rx="2" fill="#a9c6b8"/><text x="${left + 14}" y="9" font-size="10" fill="#183f34">Fee due</text>
    <rect x="${left + 74}" y="0" width="10" height="10" rx="2" fill="#214f41"/><text x="${left + 88}" y="9" font-size="10" fill="#183f34">Paid</text>${cols}</svg>`;
}
/** Month-by-month table. Months before admission are greyed out; tracking is highlighted from the admission month. */
function timelineTable(report, withFees) {
  const fee = new Map(report.fees.map(f => [f.month, f]));
  const rows = report.attendance.map(a => {
    const f = fee.get(a.month) || { due: 0, paid: 0 };
    const cls = !a.tracked ? 'tl-off' : a.month === report.start ? 'tl-start' : 'tl-on';
    const state = !a.tracked ? (a.after ? 'After exit date' : 'Before admission') : a.month === report.start ? 'Admission month' : 'Tracked';
    return `<tr class="${cls}"><td class="font-semibold">${monthLabel(a.month)}</td><td>${state}</td>
      <td class="num">${a.tracked ? `${a.present} of ${a.working}${a.leave ? ` (+${a.leave} leave)` : ''}` : '-'}</td><td class="num">${a.tracked && a.working ? fmt1(a.pct) + '%' : '-'}</td>
      ${withFees ? `<td class="num">${a.tracked ? money(f.due) : '-'}</td><td class="num">${a.tracked ? money(f.paid) : '-'}</td><td class="num">${a.tracked ? money(Math.max(f.due - f.paid, 0)) : '-'}</td>` : ''}</tr>`;
  }).join('');
  return `<div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Month</th><th>Status</th><th class="num">Days present</th><th class="num">Attendance</th>${withFees ? '<th class="num">Fee due</th><th class="num">Paid</th><th class="num">Balance</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ----- Year filter and paging for the report cards ----- */
const REP_PAGE = 12;
/** Page 0 is the newest 12 months; higher pages go back in time. */
const pageSlice = (arr, page) => { const end = arr.length - page * REP_PAGE; return arr.slice(Math.max(0, end - REP_PAGE), Math.max(0, end)); };
function pagerHTML(total, page, act) {
  const pages = Math.ceil(total / REP_PAGE);
  if (pages <= 1) return '';
  return `<div class="no-print mt-3 flex items-center justify-end gap-2"><button type="button" data-act="${act}" data-dir="-1" class="btn-ghost !px-3 !py-1.5" ${page <= 0 ? 'disabled' : ''}>Newer</button>
    <span class="text-xs text-teal-700">Page ${page + 1} of ${pages} (${REP_PAGE} months each)</span><button type="button" data-act="${act}" data-dir="1" class="btn-ghost !px-3 !py-1.5" ${page >= pages - 1 ? 'disabled' : ''}>Older</button></div>`;
}
const yearSelect = (years, cur, change) => `<select class="field" data-change="${change}"><option value="all" ${cur === 'all' ? 'selected' : ''}>All years</option>${[...years].reverse().map(y => `<option value="${y}" ${y === cur ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
/** Adds up every tracked month of the chosen year (or all years): present, leave, working days and the overall percentage. */
function attTotals(list) {
  let p = 0, l = 0, w = 0, m = 0;
  for (const a of list) if (a.tracked && a.working) { p += a.present; l += a.leave; w += a.working; m++; }
  return { p, l, w, m, absent: Math.max(w - p - l, 0), pct: w ? Math.min((p / w) * 100, 100) : 0 };
}
const attSummaryHTML = (list, label) => {
  const t = attTotals(list), tone = t.pct >= 75 ? 'text-emerald-800' : t.pct >= 50 ? 'text-gold-700' : 'text-red-600';
  return `<div class="card mb-5"><h3 class="mb-3 font-display text-lg font-bold">Overall attendance, ${label}</h3>
    <div class="grid grid-cols-6 gap-3">${miniBox('Overall attendance', t.w ? fmt1(t.pct) + '%' : '-', tone)}${miniBox('Days present', t.p)}${miniBox('Days on leave', t.l)}${miniBox('Days absent', t.absent)}${miniBox('Working days', t.w)}${miniBox('Months counted', t.m)}</div>
    <div class="mt-3 h-2.5 overflow-hidden rounded-full bg-emerald-900/10"><div class="h-full rounded-full ${t.pct >= 75 ? 'bg-emerald-600' : t.pct >= 50 ? 'bg-gold-500' : 'bg-red-500'}" style="width:${t.pct}%"></div></div>
    <p class="mt-2 text-xs text-emerald-900/65">All tracked months of the selected period added together (not only the page shown). Months before admission or joining are left out.</p></div>`;
};
function studentYearHTML() {
  const C = S.card, r = C.yr, all = r.year === 'all', label = all ? 'all years' : r.year;
  const view = { ...r, attendance: pageSlice(r.attendance, C.page), fees: pageSlice(r.fees, C.page) };
  const pager = all ? pagerHTML(r.attendance.length, C.page, 'repPage') : '';
  return `<div class="card mb-5"><div class="flex flex-wrap items-end gap-4"><div><label class="label">Report year</label>${yearSelect(r.years, r.year, 'repYear')}</div>
      <p class="max-w-xl text-xs text-emerald-900/65">${r.exit_date ? `<b>${esc(r.exit_status)} on ${esc(r.exit_date)}.</b> Attendance, working days and fees stop after this date. ` : ''}From the admission year (${esc(r.start.slice(0, 4))}) to the current year. Greyed months are before the admission date (${esc(monthLabel(r.start))}). Tracking starts from the admission month.</p></div></div>
    ${attSummaryHTML(r.attendance, label)}
    <div class="mb-5 grid gap-5">
      <div class="card"><h3 class="mb-1 font-display text-lg font-bold">Attendance, ${label}</h3>${view.attendance.length ? attendanceChart(view.attendance, r.start) : '<p class="text-sm text-teal-700">No months to show.</p>'}</div>
      <div class="card"><h3 class="mb-1 font-display text-lg font-bold">Monthly fee tracking, ${label}</h3><p class="mb-2 text-xs text-emerald-900/65">Fee due and amount paid each month</p>${view.fees.length ? feeChart(view.fees, r.start) : ''}</div>
      <div class="card"><h3 class="mb-3 font-display text-lg font-bold">Month-by-month timeline, ${label}</h3>${timelineTable(view, S.role === 'admin')}${pager}</div>
    </div>`;
}
changes.repYear = debounce(async el => {
  const C = S.card, id = C.stu && C.stu.id, y = el.value;
  if (!id) return;
  C.page = 0;
  if (!C.cache.has(y)) C.cache.set(y, await db('getStudentReport', id, y));
  if (!C.stu || C.stu.id !== id) return;                 // another student was opened meanwhile
  C.year = y; C.yr = C.cache.get(y);
  const box = $('#repYear'); if (box) box.innerHTML = studentYearHTML();
}, 150);
actions.repPage = el => {
  const C = S.card, pages = Math.ceil(C.yr.attendance.length / REP_PAGE);
  C.page = Math.min(Math.max(C.page + Number(el.dataset.dir), 0), pages - 1);
  const box = $('#repYear'); if (box) box.innerHTML = studentYearHTML();
};

/* ----- Search and profile ----- */
let searchTimer = null;
VIEWS.report = async v => {
  S.card = { stu: null, photo: '', records: [], sel: null, marks: [], report: null, fee: null, sigs: null };
  v.innerHTML = `
    <div class="card mb-5">
      <label class="label">Search</label>
      <input class="field" data-input="cardSearch">
      <div id="cardMatches" class="mt-3 flex flex-wrap gap-2"></div>
    </div>
    <div id="cardBody"></div>`;
  $('[data-input=cardSearch]').focus();
};
inputs.cardSearch = el => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(safe(async () => {
    const matches = await db('searchStudents', S.section, el.value);
    $('#cardMatches').innerHTML = matches.length
      ? matches.map(s => `<button data-act="pickStudent" data-id="${s.id}" class="btn-ghost">${esc(s.roll_no)} - ${esc(s.name)} <span class="font-normal text-emerald-900/60">${esc(s.class_name)}, ID ${s.id}</span></button>`).join('')
      : (el.value.trim() ? '<span class="text-sm text-emerald-900/60">No student found.</span>' : '');
  }), 200);
};
actions.pickStudent = async el => {
  const C = S.card, id = Number(el.dataset.id);
  C.stu = await db('getStudent', id);
  [C.photo, C.records, C.report, C.sigs, C.subjects] = await Promise.all([db('getStudentPhoto', id), db('getResultSummaries', id), db('getStudentReport', id), db('getSignatures', id), db('getClassSubjects', C.stu.class_id || 0)]);
  C.yr = C.report; C.year = C.report.year; C.cache = new Map([[C.year, C.report]]); C.page = 0;   // the year shown (current year first)
  C.fee = S.role === 'admin' ? await db('getFeeAccount', id, curMonth()) : null;   // fee amounts are for administrators
  C.sel = C.records[0] || null;
  await loadCardMarks();
};
actions.pickRecord = async el => { S.card.sel = S.card.records[Number(el.dataset.i)]; await loadCardMarks(); };
async function loadCardMarks() {
  const C = S.card;
  C.marks = C.sel ? await db('getMarks', C.stu.id, C.sel.exam, C.sel.year) : [];
  C.remark = C.sel ? await db('getRemark', C.stu.id, C.sel.exam, C.sel.year) : '';
  drawCard();
}
function drawCard() {
  const C = S.card, s = C.stu, fa = C.fee;
  const kv = (k, val, cls = '') => `<div class="${cls}"><div class="text-xs font-medium text-emerald-900/60">${k}</div><div class="font-semibold">${esc(val) || '-'}</div></div>`;
  $('#cardBody').innerHTML = `
    <div class="card mb-5">
      <div class="flex gap-5">
        ${photoImg(C.photo, 'h-40 w-32')}
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <div><h3 class="font-display text-2xl font-bold">${esc(s.name)}</h3><p class="text-sm text-emerald-900/70">Roll ${esc(s.roll_no)}, student ID ${s.id}</p></div>
            <div class="flex items-center gap-2"><span class="badge ${s.status === 'Active' ? 'badge-ok' : 'badge-warn'}">${esc(s.status)}${s.status !== 'Active' && s.status_date ? ' on ' + esc(String(s.status_date).slice(0, 10)) : ''}</span>${fa ? feeBadge(fa.status) : ''}
              ${S.role === 'admin' ? `<button data-act="feeLedger" data-kind="student" data-id="${s.id}" class="btn-ghost !px-3 !py-1.5">Fee ledger</button> <button data-act="receipt" data-id="${s.id}" class="btn-gold !px-3 !py-1.5">Fee receipt</button>` : ''}</div>
          </div>
          <div class="mt-4 grid grid-cols-4 gap-4 text-sm">
            ${kv("Father's name", s.father_name)}${kv("Father's phone", s.father_phone)}${kv('Gender', s.gender)}<div><div class="text-xs font-medium text-emerald-900/60">Admission date</div><div class="font-semibold">${dateBoth(s.admission_date) || '-'}</div></div>
            ${kv('Stream', s.stream)}${kv('Class', s.class_name)}${kv('Emergency contact', s.emergency_contact)}${kv('Address', fullAddress(s), 'col-span-2')}
          </div>
          ${fa ? `<div class="mt-4 grid grid-cols-4 gap-3">${miniBox('Monthly fee', money(s.fee))}${miniBox('Previous dues', money(fa.previous))}${miniBox('Fines', money(fa.finesOut))}${miniBox('Total payable', money(fa.payable))}</div>` : ''}
        </div>
      </div>
    </div>
    ${historyCard(C.report)}
    ${hostelFundsCard(C.report)}
    <div id="repYear">${studentYearHTML()}</div>
    <div class="card mb-5">
      <h3 class="mb-3 font-display text-lg font-bold">Academic records</h3>
      ${C.records.length ? `<div class="flex flex-wrap gap-2">${C.records.map((r, i) => {
        const p = pct(r.obtained, r.total), on = C.sel && C.sel.exam === r.exam && C.sel.year === r.year;
        return `<button data-act="pickRecord" data-i="${i}" class="${on ? 'btn-primary' : 'btn-ghost'}">${esc(r.exam)} ${esc(r.year)}: ${fmt1(p)}% (${gradeOf(p, s.stream)})</button>`;
      }).join('')}</div>` : '<p class="text-sm text-emerald-900/70">No results have been recorded for this student yet.</p>'}
    </div>
    ${C.sel ? `
      <form data-form="remark" class="card mb-4"><h3 class="mb-2 font-display text-lg font-bold">Teacher's remarks <span class="text-sm font-normal text-emerald-900/60">(printed on the result card)</span></h3>
        <textarea name="remark" rows="2" maxlength="500" class="field" placeholder="For example: Hardworking student, needs to improve handwriting.">${esc(C.remark)}</textarea>
        <div class="mt-3 flex justify-end"><button class="btn-gold">Save remarks</button></div></form>
      <div class="mb-4 flex justify-end gap-3">
        <button data-act="printCard" class="btn-ghost">Print</button>
        <button data-act="pdfCard" class="btn-ghost">Save as PDF</button>
        <button data-act="downloadJpg" class="btn-gold">Download as JPG</button>
      </div>
      <div class="overflow-x-auto pb-6">${resultSheet(s, C.marks, C.sel.exam, C.sel.year, C.photo, C.sigs, C.subjects)}</div>` : ''}`;
}

/** Signature above a line: the uploaded image when there is one, otherwise space to sign by hand. */
const sigBlock = (label, img, name) => `
  <div>${img ? `<img src="${img}" alt="${label} signature" style="height:56px;margin:0 auto;object-fit:contain">` : '<div style="height:56px"></div>'}
    <div class="border-t-2 border-emerald-900 pt-1 font-semibold">${label}</div>
    <div class="text-xs text-emerald-900/60">${name ? esc(name) : 'Signature and stamp'}</div></div>`;

const LAYOUT_LABELS = { father_name: "Father's name", roll_no: 'Roll number', class: 'Class', stream: 'Stream' };

/**
 * The printable result card. Solid colours only, so html2canvas and PDF output match the screen.
 * The details block follows the layout chosen in Settings (order and visibility), and the header shows
 * the Gregorian and Hijri dates. `subjects` are the class's assigned subjects: they appear in that order,
 * with "-" for any that have no marks yet.
 */
function resultSheet(stu, rows, exam, year, photo, sigs, subjects = []) {
  const L = layoutOf(), stream = stu.stream, now = new Date();
  const byName = new Map(rows.map(r => [r.subject.toLowerCase(), r]));
  const ordered = subjects.map(a => ({ subject: a.subject, total: a.total, row: byName.get(a.subject.toLowerCase()) }));
  rows.filter(r => !subjects.some(a => a.subject.toLowerCase() === r.subject.toLowerCase())).forEach(r => ordered.push({ subject: r.subject, total: r.total, row: r }));
  const entered = ordered.filter(o => o.row).map(o => o.row);
  const tot = entered.reduce((t, r) => t + r.total, 0), obt = entered.reduce((t, r) => t + r.obtained, 0);
  const p = pct(obt, tot), passed = hasPassed(entered, stream);
  const values = { father_name: stu.father_name, roll_no: stu.roll_no, class: stu.class_name, stream: stu.stream };
  const info = (k, val) => `<div class="flex gap-2 border-b border-emerald-900/20 pb-1"><span class="text-emerald-900/70">${k}:</span><span class="font-semibold">${esc(val) || '-'}</span></div>`;
  const box = (k, val) => `<div class="rounded-lg border border-emerald-900/25 py-2"><div class="text-lg font-bold">${val}</div><div class="text-xs text-emerald-900/70">${k}</div></div>`;
  const dates = dateLine(now);
  return `
    <div id="cardSheet" class="sheet"><div class="sheet-in">
      <div class="flex items-center justify-between border-b-2 border-gold-500 pb-4">
        <div class="w-24">${logoEl('h-20 w-20')}</div>
        <div class="flex-1 text-center">
          <div class="font-display text-3xl font-bold text-emerald-900">${INSTITUTE}</div>
          ${L.subtitle ? `<div class="mt-1 text-sm font-semibold text-gold-700">${SECTIONS[S.section]} &nbsp;|&nbsp; Session ${esc(hijriDate(now).year)} AH / ${esc(year)}</div>` : ''}
          <div class="mt-3 inline-block rounded-full bg-emerald-900 px-6 py-1.5 text-sm font-semibold text-white">${esc(exam)} result card, ${esc(year)}</div>
          ${dates ? `<div class="mt-2 text-xs text-emerald-900/70">${esc(dates)}</div>` : ''}
        </div>
        <div class="flex w-24 justify-end">${photoImg(photo, 'h-28 w-24')}</div>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
        ${info('Student name', stu.name)}${L.fields.filter(f => f.visible).map(f => info(LAYOUT_LABELS[f.key], values[f.key])).join('')}
      </div>
      <table class="sheet-tbl mt-5">
        <thead><tr><th>Subject</th><th style="text-align:right">Total marks</th><th style="text-align:right">Obtained</th><th style="text-align:right">Percent</th><th>Grade</th></tr></thead>
        <tbody>${ordered.map(o => {
          if (!o.row) return `<tr><td>${esc(o.subject)}</td><td style="text-align:right">${o.total}</td><td style="text-align:right">-</td><td style="text-align:right">-</td><td>-</td></tr>`;
          const rp = pct(o.row.obtained, o.row.total);
          return `<tr><td>${esc(o.subject)}</td><td style="text-align:right">${o.row.total}</td><td style="text-align:right">${o.row.obtained}</td><td style="text-align:right">${fmt1(rp)}%</td><td style="font-weight:600">${gradeOf(rp, stream)}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <div class="mt-5 grid grid-cols-4 gap-3 text-center">${box('Total marks', tot)}${box('Obtained marks', obt)}${box('Percentage', fmt1(p) + '%')}${box('Grade', gradeOf(p, stream))}</div>
      <div class="mt-4 text-center text-lg font-bold ${passed ? 'text-emerald-800' : 'neg'}">Result: ${passed ? 'Pass' : 'Fail'}</div>
      ${S.card && S.card.remark ? `<div class="mt-5 rounded-lg border border-emerald-900/25 p-3 text-sm"><span class="font-semibold">Teacher's remarks:</span> ${esc(S.card.remark)}</div>` : ''}
      <div class="mt-16 grid grid-cols-2 gap-16 text-center text-sm">
        ${sigBlock('Class teacher', sigs && sigs.teacher, sigs && sigs.teacherName)}
        ${sigBlock('Principal', sigs && sigs.principal)}
      </div>
    </div></div>`;
}
const cardFile = () => safeName(S.card.stu.roll_no, S.card.sel.exam, S.card.sel.year);
actions.printCard = () => outputSheet($('#cardSheet'), 'card', () => rpc('printPage'));
actions.pdfCard = async () => { if (await outputSheet($('#cardSheet'), 'card', () => rpc('savePdf', cardFile() + '.pdf'))) toast('Saved as PDF'); };
actions.downloadJpg = () => sheetToJpg($('#cardSheet'), cardFile() + '.jpg');

/* ----- Digital fee receipt ----- */
async function openReceipt(id) {
  const [a, photo] = await Promise.all([db('getFeeAccount', id, curMonth()), db('getStudentPhoto', id)]);
  S.receipt = { a, name: safeName('Fee_receipt', a.student.roll_no, curMonth()) };
  const no = `FR-${String(id).padStart(4, '0')}-${ymd(new Date()).replace(/-/g, '')}`;
  $('#receiptRoot').innerHTML = `
    <div class="fixed inset-0 z-50 overflow-auto bg-emerald-900/35 p-6 fade-in">
      <div class="no-print mx-auto mb-4 flex max-w-[794px] items-center justify-between gap-3 rounded-2xl bg-white/95 p-3">
        <div class="font-display text-lg font-bold">Fee receipt</div>
        <div class="flex gap-2">
          <button data-act="receiptPrint" class="btn-ghost">Print</button>
          <button data-act="receiptPdf" class="btn-ghost">Save as PDF</button>
          <button data-act="receiptJpg" class="btn-gold">Download JPG</button>
          <button data-act="receiptClose" class="btn-primary">Close</button>
        </div>
      </div>
      ${receiptSheet(a, photo, no)}
    </div>`;
}
function closeReceipt() { $('#receiptRoot').innerHTML = ''; }
actions.receipt = el => openReceipt(Number(el.dataset.id));
actions.receiptClose = closeReceipt;
actions.receiptPrint = () => outputSheet($('#receiptSheet'), 'receipt', () => rpc('printPage'));
actions.receiptPdf = async () => { if (await outputSheet($('#receiptSheet'), 'receipt', () => rpc('savePdf', S.receipt.name + '.pdf'))) toast('Saved as PDF'); };
actions.receiptJpg = () => sheetToJpg($('#receiptSheet'), S.receipt.name + '.jpg');

function receiptSheet(a, photo, no) {
  const st = a.student, months = a.months, now = new Date();
  const recent = months.slice(-18), older = months.slice(0, Math.max(0, months.length - 18));
  const sum = (list, k) => list.reduce((t, m) => t + m[k], 0);
  const paidMonths = months.filter(m => m.paid > 0).length, totalPaid = sum(months, 'paid');
  const stat = m => (m.owed <= 0 ? 'Paid' : m.paid > 0 ? 'Part paid' : 'Due');
  const td = 'style="text-align:right"';
  const rows = (older.length ? `<tr><td>Earlier months (${older.length})</td><td ${td}>${money(sum(older, 'due'))}</td><td ${td}>${money(sum(older, 'paid'))}</td><td></td><td ${td}>${money(sum(older, 'owed'))}</td><td>${sum(older, 'owed') > 0 ? 'Due' : 'Paid'}</td></tr>` : '') +
    recent.map(m => `<tr><td>${monthLabel(m.month)}</td><td ${td}>${money(m.due)}</td><td ${td}>${money(m.paid)}</td><td>${dateBoth(m.paid_on)}</td><td ${td}>${money(m.owed)}</td><td style="font-weight:600;color:${m.owed <= 0 ? '#214f41' : '#b91c1c'}">${stat(m)}</td></tr>`).join('');
  const sumRow = (k, v, strong) => `<div class="flex justify-between ${strong ? 'border-t-2 border-emerald-900 pt-2 text-lg font-bold' : 'py-0.5'}"><span>${k}</span><span class="tabular-nums">${v}</span></div>`;
  return `
    <div id="receiptSheet" class="sheet"><div class="sheet-in" style="min-height:0">
      <div class="flex items-center justify-between border-b-2 border-gold-500 pb-4">
        <div class="w-24">${logoEl('h-20 w-20')}</div>
        <div class="flex-1 text-center">
          <div class="font-display text-3xl font-bold text-emerald-900">${INSTITUTE}</div>
          <div class="mt-1 text-sm font-semibold text-gold-700">${SECTIONS[S.section]}</div>
          <div class="mt-3 inline-block rounded-full bg-emerald-900 px-6 py-1.5 text-sm font-semibold text-white">Fee receipt</div>
        </div>
        <div class="flex w-24 justify-end">${photoImg(photo, 'h-24 w-20')}</div>
      </div>
      <div class="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <div><span class="text-emerald-900/70">Receipt no:</span> <span class="font-semibold">${no}</span></div>
        <div><span class="text-emerald-900/70">Issued:</span> <span class="font-semibold">${esc(dateLine(now) || gregorianDate(now))}</span> <span class="text-emerald-900/60">${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div><span class="text-emerald-900/70">Student:</span> <span class="font-semibold">${esc(st.name)}</span></div>
        <div><span class="text-emerald-900/70">Roll number:</span> <span class="font-semibold">${esc(st.roll_no)}</span></div>
        <div><span class="text-emerald-900/70">Class:</span> <span class="font-semibold">${esc(st.class_name)}</span></div>
        <div><span class="text-emerald-900/70">Monthly fee:</span> <span class="font-semibold">${money(a.currentDue)}</span></div>
      </div>
      <h4 class="mb-2 mt-5 font-display text-lg font-bold text-emerald-900">Monthly fee statement</h4>
      <table class="sheet-tbl"><thead><tr><th>Month</th><th ${td}>Fee</th><th ${td}>Paid</th><th>Paid on</th><th ${td}>Balance</th><th>Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center">No months billed yet.</td></tr>'}</tbody></table>
      <p class="mt-1 text-xs text-emerald-900/70">${paidMonths} of ${months.length} billed months have a payment recorded. Any unpaid balance is carried forward to the next month until it is cleared.</p>
      <h4 class="mb-2 mt-4 font-display text-lg font-bold text-emerald-900">Fines</h4>
      <table class="sheet-tbl"><thead><tr><th>Date</th><th>Reason</th><th ${td}>Amount</th><th>Status</th></tr></thead>
        <tbody>${a.fines.length ? a.fines.map(f => `<tr><td>${dateBoth(f.date)}</td><td>${esc(f.reason)}</td><td ${td}>${money(f.amount)}</td><td style="font-weight:600;color:${f.paid >= f.amount ? '#214f41' : '#b91c1c'}">${f.paid >= f.amount ? 'Paid' : 'Unpaid'}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center">No fines recorded.</td></tr>'}</tbody></table>
      <div class="ml-auto mt-5 w-80 text-sm">
        ${sumRow('Total paid to date', money(totalPaid))}
        ${sumRow('Previous dues (brought forward)', money(a.previous))}
        ${sumRow(`${monthLabel(curMonth())} fee balance`, money(a.currentOwed))}
        ${sumRow('Fines outstanding', money(a.finesOut))}
        ${sumRow('Total balance payable', money(a.payable), true)}
      </div>
      <div class="mt-10 grid grid-cols-2 gap-16 text-center text-sm">
        <div class="text-left text-xs text-emerald-900/60">This is a computer-generated receipt of the account position on the date shown.</div>
        ${sigBlock('Authorized signature', S.settings.principalSignature)}
      </div>
    </div></div>`;
}

/* ==========================================================================
   Teacher portal: mark attendance (one save per class per day, then locked)
   ========================================================================== */
VIEWS.mark = async v => {
  const today = ymd(new Date()), min = new Date(); min.setDate(min.getDate() - 7);
  S.mark = { classId: '', date: today, roster: null, state: new Map() };
  v.innerHTML = pageTitle('Mark attendance', 'Choose Present, Leave or Absent for each student, then save. A saved day is locked and only the administrator can change it.') + `
    <div class="card mb-5"><div class="grid grid-cols-3 gap-4">
      <div><label class="label">Class</label><select class="field" data-change="markClass"><option value=""></option>${classOptions('')}</select></div>
      <div><label class="label">Date</label><input type="date" class="field" value="${today}" min="${ymd(min)}" max="${today}" data-change="markDate"></div>
    </div></div>
    <div id="markBody"></div>`;
  drawRoster();
};
async function loadRoster() {
  const M = S.mark;
  M.roster = M.classId ? await db('getClassRoster', S.section, Number(M.classId), M.date) : null;
  M.state = new Map(M.roster ? M.roster.students.filter(s => s.state).map(s => [s.id, s.state]) : []);
  drawRoster();
}
function drawRoster() {
  const M = S.mark, box = $('#markBody');
  if (!M.classId || !M.roster) { box.innerHTML = ''; return; }
  const R = M.roster;
  if (R.off) { box.innerHTML = `<div class="card text-center text-emerald-900/70">${esc(R.off)} Attendance is not taken on off-days.</div>`; return; }
  if (!R.students.length) { box.innerHTML = '<div class="card text-center text-emerald-900/70">There are no active students in this class.</div>'; return; }
  const stateBadge = st => (st === 'P' ? '<span class="badge badge-ok">Present</span>' : st === 'L' ? '<span class="badge badge-warn">Leave</span>' : '<span class="badge badge-bad">Absent</span>');
  box.innerHTML = `<div class="card"><div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h3 class="font-display text-lg font-bold">${esc(R.className)} <span class="text-sm font-normal text-teal-700">${esc(R.stream)}</span></h3><div class="text-sm text-teal-700" id="markCount"></div></div>
      ${R.locked ? `<span class="badge badge-ok">Saved and locked ${dateText(String(R.locked_at || '').slice(0, 10))} ${esc(String(R.locked_at || '').slice(11, 16))}</span>` : '<div class="flex gap-3"><button data-act="markAll" class="btn-ghost">Mark all present</button><button data-act="markSave" class="btn-gold">Save attendance</button></div>'}</div>
    <table class="tbl"><thead><tr><th>Roll</th><th>Student</th><th>Attendance</th></tr></thead><tbody>
      ${R.students.map(s => `<tr><td>${esc(s.roll_no)}</td><td class="font-semibold">${esc(s.name)}</td><td>${R.locked ? stateBadge(M.state.get(s.id)) : `<div class="tri" data-row="${s.id}">
        <button type="button" data-act="markSet" data-id="${s.id}" data-state="P">Present</button><button type="button" data-act="markSet" data-id="${s.id}" data-state="L">Leave</button><button type="button" data-act="markSet" data-id="${s.id}" data-state="">Absent</button></div>`}</td></tr>`).join('')}
    </tbody></table></div>`;
  if (!R.locked) R.students.forEach(s => paintTri(s.id));
  updateMarkCount();
}
function paintTri(id) {
  const st = S.mark.state.get(id) || '', row = document.querySelector(`.tri[data-row="${id}"]`);
  if (row) row.querySelectorAll('button').forEach(b => { b.className = b.dataset.state === st ? `on-${st ? st.toLowerCase() : 'a'}` : ''; });
}
function updateMarkCount() {
  const c = $('#markCount'), M = S.mark; if (!c) return;
  const v = [...M.state.values()], n = M.roster.students.length, p = v.filter(x => x === 'P').length, l = v.filter(x => x === 'L').length;
  c.textContent = `${p} present, ${l} on leave, ${n - p - l} absent, of ${n}`;
}
changes.markClass = el => { S.mark.classId = el.value; return loadRoster(); };
changes.markDate = el => { if (!el.value) return; S.mark.date = el.value; return loadRoster(); };
actions.markSet = el => { const id = Number(el.dataset.id); if (el.dataset.state) S.mark.state.set(id, el.dataset.state); else S.mark.state.delete(id); paintTri(id); updateMarkCount(); };
actions.markAll = () => { S.mark.state = new Map(S.mark.roster.students.map(s => [s.id, 'P'])); S.mark.roster.students.forEach(s => paintTri(s.id)); updateMarkCount(); };
actions.markSave = async () => {
  const M = S.mark, of = k => [...M.state].filter(([, v]) => v === k).map(([id]) => id);
  if (!confirm(`Save attendance for ${M.roster.className} on ${M.date}? It will be locked, and only the administrator can change it afterwards.`)) return;
  await db('saveClassAttendance', S.section, Number(M.classId), M.date, of('P'), of('L'));
  toast('Attendance saved and locked');
  await loadRoster();
};

/* ==========================================================================
   Class result: a ranked sheet for a whole class, exported as A4 landscape pages
   ========================================================================== */
const examsForClass = classId => {
  const cls = S.classes.find(c => String(c.id) === String(classId));
  return examNames(cls ? { stream: cls.stream, class_id: cls.id } : null);
};
VIEWS.classresult = async v => {
  S.exams = await db('getExams', S.section);
  S.cr = { classId: '', exam: '', year: String(new Date().getFullYear()) };
  v.innerHTML = pageTitle('Class result', 'Rank a whole class for one exam and export it as a multi-page A4 sheet (PDF, JPG or print)') + '<div id="crWrap"></div>';
  drawCr();
};
function drawCr() {
  const C = S.cr, names = examsForClass(C.classId);
  if (!names.includes(C.exam)) C.exam = names[0] || '';
  $('#crWrap').innerHTML = `
    <div class="card"><div class="grid grid-cols-4 items-end gap-4">
      <div><label class="label">Class</label><select class="field" data-change="crClass"><option value=""></option>${classOptions(C.classId)}</select></div>
      <div><label class="label">Exam</label><select class="field" data-change="crExam">${names.map(e => `<option ${e === C.exam ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
      <div><label class="label">Year</label><input type="number" class="field" value="${esc(C.year)}" data-change="crYear"></div>
      <button data-act="crGenerate" class="btn-gold" ${C.classId && C.exam ? '' : 'disabled'}>Generate sheet</button>
    </div></div>`;
}
changes.crClass = el => { S.cr.classId = el.value; drawCr(); };
changes.crExam = el => { S.cr.exam = el.value; };
changes.crYear = el => { S.cr.year = el.value; };
actions.crGenerate = async () => {
  const C = S.cr;
  if (!/^\d{4}$/.test(C.year)) throw new Error('Enter a four-digit year.');
  const data = await db('getClassResults', S.section, Number(C.classId), C.exam, C.year);
  if (!data.students.length) throw new Error('No marks have been saved for this class, exam and year yet.');
  const sigs = await db('getSignatures', data.students[0].id);
  const sheet = classSheetHTML(data, C.exam, C.year, sigs);
  S.classSheet = { name: safeName('Class_result', data.className, C.exam, C.year), pages: sheet.pages };
  $('#receiptRoot').innerHTML = `
    <div class="fixed inset-0 z-50 overflow-auto bg-emerald-900/35 p-6 fade-in">
      <div class="no-print mx-auto mb-4 flex max-w-[1122px] items-center justify-between gap-3 rounded-2xl bg-white/95 p-3">
        <div><div class="font-display text-lg font-bold">Class result: ${esc(data.className)}, ${esc(C.exam)} ${esc(C.year)}</div>
          <div class="text-xs text-emerald-900/65">${data.students.length} students ranked, ${sheet.pages} page${sheet.pages > 1 ? 's' : ''}${data.withoutMarks ? `, ${data.withoutMarks} active student${data.withoutMarks > 1 ? 's' : ''} without marks are not listed` : ''}</div></div>
        <div class="flex gap-2">
          <button data-act="classPrint" class="btn-ghost">Print</button>
          <button data-act="classPdf" class="btn-ghost">Save as PDF</button>
          <button data-act="classJpg" class="btn-gold">Download JPG</button>
          <button data-act="receiptClose" class="btn-primary">Close</button>
        </div>
      </div>
      <div id="classSheet" class="mx-auto" style="width:1122px">${sheet.html}</div>
    </div>`;
};
actions.classPrint = () => outputSheet($('#classSheet'), 'receipt', () => rpc('printPage', true));
actions.classPdf = async () => { if (await outputSheet($('#classSheet'), 'receipt', () => rpc('savePdf', S.classSheet.name + '.pdf', true))) toast('Saved as PDF'); };
/** One JPG per page: a single page asks for a file name, several pages ask for a folder. */
actions.classJpg = async () => {
  const pages = [...document.querySelectorAll('#classSheet .class-page')], files = [];
  for (let i = 0; i < pages.length; i++) {
    const canvas = await window.html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    files.push({ name: `${S.classSheet.name}_page${i + 1}.jpg`, dataUrl: canvas.toDataURL('image/jpeg', 0.92) });
  }
  const done = files.length === 1 ? await rpc('saveImage', files[0].dataUrl, files[0].name) : await rpc('saveImages', files);
  if (done) toast(files.length === 1 ? 'Saved as JPG' : `${files.length} page images saved`);
};

/**
 * Pages of the ranked class sheet. Every page repeats the header (logo, name, exam, stream, class) and the
 * indexed subject list; columns 1..N in the table follow that list.
 */
function classSheetHTML(data, exam, year, sigs) {
  const stream = data.stream, subjects = data.subjects, now = new Date(), sm = streamOf(stream), L = layoutOf();
  const ranked = data.students.map(st => {
    const entries = subjects.map(sub => st.marks[sub.name.toLowerCase()] || null);
    const entered = entries.filter(Boolean);
    const obt = entered.reduce((t, m) => t + m.obtained, 0), max = entered.reduce((t, m) => t + m.total, 0), p = pct(obt, max);
    return { st, entries, obt, max, p, grade: gradeOf(p, stream), pass: hasPassed(entered, stream) };
  }).sort((a, b) => b.p - a.p || a.st.name.localeCompare(b.st.name));
  const perPage = subjects.length > 10 ? 11 : 13;
  const pageCount = Math.max(1, Math.ceil(ranked.length / perPage));
  const pass = passMark(stream), dates = dateLine(now);
  const list = subjects.map((sub, i) => `<span class="mr-4 inline-block whitespace-nowrap"><b>${i + 1}.</b> ${esc(sub.name)} <span style="color:#6b8f80">(${sub.total})</span></span>`).join('');
  const header = `
    <div class="flex items-center gap-4 border-b-2 pb-2" style="border-color:#b08d44">
      ${logoEl('h-14 w-14')}
      <div class="flex-1 text-center">
        <div class="font-display text-2xl font-bold text-emerald-900">${INSTITUTE}</div>
        ${L.subtitle ? `<div class="text-xs font-semibold text-gold-700">${SECTIONS[S.section]} &nbsp;|&nbsp; Session ${esc(hijriDate(now).year)} AH / ${esc(year)}</div>` : ''}
        <div class="mt-1 text-sm font-semibold text-emerald-900">Examination: ${esc(exam)} ${esc(year)} &nbsp;&nbsp; Stream: ${esc(stream)}${sm ? ` <span class="ur">${sm.ur}</span>` : ''} &nbsp;&nbsp; Class: ${esc(data.className)}</div>
      </div>
      <div class="w-44 text-right text-[11px] text-emerald-900/70">${esc(dates)}</div>
    </div>
    <div class="mt-2 text-[12px] leading-5"><b>Subjects:</b> ${list}</div>`;
  const head = `<tr><th style="width:36px">S.No</th><th class="l" style="width:150px">Student name</th><th class="l" style="width:130px">Father name</th>${subjects.map((_, i) => `<th>${i + 1}</th>`).join('')}<th>Total obtained</th><th>Max marks</th><th>%</th><th>Grade</th><th>Status</th></tr>`;
  let html = '';
  for (let n = 0; n < pageCount; n++) {
    const slice = ranked.slice(n * perPage, (n + 1) * perPage);
    const rows = slice.map((r, i) => `<tr><td>${n * perPage + i + 1}</td><td class="l" style="font-weight:600">${esc(r.st.name)}</td><td class="l">${esc(r.st.father_name)}</td>
      ${r.entries.map(m => m ? `<td${pct(m.obtained, m.total) < pass ? ' style="color:#b91c1c;font-weight:600"' : ''}>${m.obtained}</td>` : '<td>-</td>').join('')}
      <td style="font-weight:600">${r.obt}</td><td>${r.max}</td><td style="font-weight:600">${fmt1(r.p)}%</td><td style="font-weight:700">${r.grade}</td>
      <td style="font-weight:700;color:${r.pass ? '#214f41' : '#b91c1c'}">${r.pass ? 'Pass' : 'Fail'}</td></tr>`).join('');
    html += `<div class="class-page">${header}
      <table class="crs" style="margin-top:8px"><thead>${head}</thead><tbody>${rows}</tbody></table>
      ${n === pageCount - 1 ? `<div class="grid grid-cols-2 gap-40 text-center text-xs" style="position:absolute;left:32px;right:32px;bottom:34px">${sigBlock('Class teacher', sigs && sigs.teacher, sigs && sigs.teacherName)}${sigBlock('Principal', sigs && sigs.principal)}</div>` : ''}
      <div class="text-[11px] text-emerald-900/60" style="position:absolute;left:32px;right:32px;bottom:12px;display:flex;justify-content:space-between"><span>Pass mark: ${pass}% in every subject. Red marks are below the pass mark.</span><span>Page ${n + 1} of ${pageCount}</span></div>
    </div>`;
  }
  return { html, pages: pageCount };
}

/* ==========================================================================
   Settings: logo, password, database folder, backup / restore, promotion
   ========================================================================== */
/* ----- Settings tabs ----- */
const SETTINGS_TABS = [['institute', 'Institute settings'], ['subjects', 'Subjects and classes'], ['exams', 'Exams and result card'], ['grading', 'Grading rules']];
VIEWS.settings = async v => { await loadSettings(); S.cfgSection = S.section || S.cfgSection || 'boys'; drawSettings(v); };

function drawSettings(el) {
  S.cfgSection = S.cfgSection || S.section || 'boys';
  el.innerHTML = pageTitle('Settings', 'Institute details, subject assignment, exams and grading') + `
    <div class="mb-6 flex w-fit rounded-xl bg-emerald-900/10 p-1">
      ${SETTINGS_TABS.map(([id, label]) => `<button data-act="settingsTab" data-tab="${id}" class="seg ${S.settingsTab === id ? 'seg-on' : ''}">${label}</button>`).join('')}
    </div>
    <div id="settingsPane"></div>`;
  drawSettingsPane();
}
async function drawSettingsPane() {
  const pane = $('#settingsPane');
  if (!pane) return;
  await ({ institute: paneInstitute, subjects: paneSubjects, exams: paneExams, grading: paneGrading }[S.settingsTab] || paneInstitute)(pane);
}
actions.settingsTab = el => { S.settingsTab = el.dataset.tab; drawSettings($('#settingsPane').parentElement); };
actions.cfgSection = el => { S.cfgSection = el.dataset.section; return drawSettingsPane(); };
/** Boys / Girls switch used by the tabs whose data is kept per section. */
const sectionSwitch = () => `<div class="mb-5 flex w-fit rounded-xl bg-emerald-900/10 p-1">${Object.entries(SECTIONS).map(([k, label]) => `<button data-act="cfgSection" data-section="${k}" class="seg ${S.cfgSection === k ? 'seg-on' : ''}">${label}</button>`).join('')}</div>`;

/* ===== Tab 2: subjects and total marks for every class, under all four streams ===== */
async function paneSubjects(el) {
  const [classes, subjects] = await Promise.all([db('getClasses', S.cfgSection), db('getAllClassSubjects', S.cfgSection)]);
  S.cfg = { classes, subjects };
  S.cfgStream = S.cfgStream || STREAMS[0].key;
  const inStream = classes.filter(c => c.stream === S.cfgStream);
  const sm = streamOf(S.cfgStream);
  const classCard = c => {
    const list = subjects.filter(x => x.class_id === c.id);
    const others = classes.filter(o => o.id !== c.id);
    return `<div class="card mb-5">
      <div class="mb-3 flex items-center justify-between"><h3 class="font-display text-lg font-bold">${esc(c.name)}</h3>
        <span class="text-sm text-emerald-900/65">${list.length} subject${list.length === 1 ? '' : 's'}, total ${list.reduce((t, x) => t + x.total, 0)} marks</span></div>
      <table class="tbl"><thead><tr><th class="w-12">#</th><th>Subject</th><th class="w-36">Total marks</th><th class="w-56"></th></tr></thead><tbody>
        ${list.length ? list.map((x, i) => `<tr><td>${i + 1}</td>
          <td><input class="plain w-full" data-change="subjEdit" data-id="${x.id}" data-f="subject" value="${esc(x.subject)}"></td>
          <td><input type="number" min="1" step="any" class="plain w-28" data-change="subjEdit" data-id="${x.id}" data-f="total" value="${esc(x.total)}"></td>
          <td class="whitespace-nowrap text-right"><button data-act="subjMove" data-id="${x.id}" data-dir="up" class="btn-ghost !px-2.5 !py-1" ${i === 0 ? 'disabled' : ''}>Up</button>
            <button data-act="subjMove" data-id="${x.id}" data-dir="down" class="btn-ghost !px-2.5 !py-1" ${i === list.length - 1 ? 'disabled' : ''}>Down</button>
            <button data-act="subjRemove" data-id="${x.id}" class="btn-danger !px-2.5 !py-1">Remove</button></td></tr>`).join('')
          : '<tr><td colspan="4" class="py-5 text-center text-emerald-900/60">No subjects assigned yet.</td></tr>'}
      </tbody></table>
      <div class="mt-4 grid grid-cols-2 gap-4">
        <form data-form="subjAdd" class="flex items-end gap-2 rounded-2xl bg-white/50 p-3"><input type="hidden" name="class_id" value="${c.id}">
          <div class="flex-1">${fld('Subject', 'subject', '', { required: true })}</div><div class="w-28">${fld('Total marks', 'total', 100, { type: 'number', required: true })}</div>
          <button class="btn-gold">Add</button></form>
        <form data-form="subjCopy" class="flex items-end gap-2 rounded-2xl bg-white/50 p-3"><input type="hidden" name="to" value="${c.id}">
          <div class="flex-1"><label class="label">Copy subjects from another class</label><select name="from" class="field" required><option value=""></option>${others.map(o => `<option value="${o.id}">${esc(o.name)} (${esc(o.stream)})</option>`).join('')}</select></div>
          <button class="btn-ghost">Copy</button></form>
      </div>
    </div>`;
  };
  el.innerHTML = sectionSwitch() + `
    <p class="mb-4 text-sm text-emerald-900/70">Subjects assigned here fill the mark sheet in Result entry and the rows of result cards and class result sheets, in this order.</p>
    <div class="mb-5 flex w-fit flex-wrap rounded-xl bg-emerald-900/10 p-1">${STREAMS.map(st => `<button data-act="cfgStream" data-stream="${st.key}" class="seg ${S.cfgStream === st.key ? 'seg-on' : ''}">${st.key} ${urdu(st.ur)}</button>`).join('')}</div>
    <h3 class="mb-3 font-display text-xl font-bold">${S.cfgStream} ${urdu(sm.ur)}</h3>
    ${inStream.length ? inStream.map(classCard).join('') : '<div class="card text-center text-emerald-900/70">There are no classes in this stream yet. Add them in the Classes panel.</div>'}`;
}
actions.cfgStream = el => { S.cfgStream = el.dataset.stream; return drawSettingsPane(); };
forms.subjAdd = async (f, d) => { await db('saveClassSubject', { class_id: Number(d.class_id), subject: d.subject, total: Number(d.total) }); toast('Subject added'); await drawSettingsPane(); };
forms.subjCopy = async (f, d) => {
  if (!d.from) throw new Error('Choose a class to copy from.');
  const n = await db('copyClassSubjects', Number(d.from), Number(d.to));
  toast(n ? `${n} subject${n > 1 ? 's' : ''} copied` : 'Nothing new to copy');
  await drawSettingsPane();
};
actions.subjMove = async el => { await db('moveClassSubject', Number(el.dataset.id), el.dataset.dir); await drawSettingsPane(); };
actions.subjRemove = async el => { await db('deleteClassSubject', Number(el.dataset.id)); await drawSettingsPane(); };
changes.subjEdit = async el => {
  const row = S.cfg.subjects.find(x => x.id === Number(el.dataset.id)), f = el.dataset.f, old = row[f];
  const next = { id: row.id, class_id: row.class_id, subject: f === 'subject' ? el.value : row.subject, total: f === 'total' ? Number(el.value) : row.total };
  try { await db('saveClassSubject', next); } catch (err) { el.value = old; throw err; }
  row[f] = next[f];
  el.classList.add('ring-4', 'ring-emerald-300');
  setTimeout(() => el.classList.remove('ring-4', 'ring-emerald-300'), 900);
};

/* ===== Tab 3: custom exams, and what the result card shows ===== */
const scopeValue = e => (e.class_id ? `c:${e.class_id}` : e.stream ? `s:${e.stream}` : '');
const scopeLabel = e => (e.class_id ? `Class: ${e.class_name}` : e.stream ? `Stream: ${e.stream}` : 'All classes');
const scopeSelect = (selected = '') => `<select name="scope" class="field">
  <option value="" ${selected === '' ? 'selected' : ''}>All classes</option>
  <optgroup label="One stream">${STREAMS.map(st => `<option value="s:${st.key}" ${selected === 's:' + st.key ? 'selected' : ''}>${st.key}</option>`).join('')}</optgroup>
  ${STREAMS.map(st => { const list = S.cfg.classes.filter(c => c.stream === st.key); return list.length ? `<optgroup label="Class in ${st.key}">${list.map(c => `<option value="c:${c.id}" ${selected === 'c:' + c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}
</select>`;

async function paneExams(el) {
  const [exams, classes] = await Promise.all([db('getExams', S.cfgSection), db('getClasses', S.cfgSection)]);
  S.cfg = { exams, classes };
  const L = layoutOf();
  el.innerHTML = sectionSwitch() + `
    <div class="mb-6 grid grid-cols-3 gap-6">
      <div class="card col-span-2">
        <h3 class="mb-1 font-display text-lg font-bold">Exam names</h3>
        <p class="mb-4 text-sm text-emerald-900/70">Add exams such as Monthly Test, Mid-Term, Annual or Sanawiyyah. An exam can apply to every class, one stream, or a single class. Renaming an exam keeps its saved marks.</p>
        <table class="tbl"><thead><tr><th>Exam</th><th>Applies to</th><th></th></tr></thead><tbody>
          ${exams.map(e => `<tr><td class="font-semibold">${esc(e.name)}</td><td>${esc(scopeLabel(e))}</td>
            <td class="whitespace-nowrap text-right"><button data-act="editExam" data-id="${e.id}" class="btn-ghost !px-3 !py-1.5">Edit</button><button data-act="deleteExam" data-id="${e.id}" class="btn-danger !px-3 !py-1.5">Delete</button></td></tr>`).join('')}
        </tbody></table>
      </div>
      <form data-form="examSave" class="card h-fit"><h3 class="mb-3 font-display text-lg font-bold">Add an exam</h3>
        <div class="space-y-3">${fld('Exam name', 'name', '', { required: true })}<div><label class="label">Applies to</label>${scopeSelect('')}</div></div>
        <button class="btn-gold mt-4 w-full">Add exam</button></form>
    </div>
    <div class="card">
      <h3 class="mb-1 font-display text-lg font-bold">Result card layout</h3>
      <p class="mb-4 text-sm text-emerald-900/70">Choose which details appear on result cards and class result sheets, and in what order. Changes apply to every section.</p>
      <div class="grid grid-cols-2 gap-8">
        <div class="space-y-2">
          <div class="flex items-center gap-3 rounded-xl bg-white/50 px-3 py-2"><span class="w-6 text-center text-xs text-emerald-900/50">1</span><span class="flex-1 font-semibold">Student name</span><span class="text-xs text-emerald-900/55">always shown</span></div>
          ${L.fields.map((f, i) => `<div class="flex items-center gap-3 rounded-xl bg-white/50 px-3 py-2"><span class="w-6 text-center text-xs text-emerald-900/50">${i + 2}</span><span class="flex-1 font-semibold">${LAYOUT_LABELS[f.key]}</span>
            <label class="flex items-center gap-1.5 text-sm"><input type="checkbox" data-change="layoutVis" data-key="${f.key}" ${f.visible ? 'checked' : ''}> Show</label>
            <button data-act="layoutMove" data-key="${f.key}" data-dir="up" class="btn-ghost !px-2.5 !py-1" ${i === 0 ? 'disabled' : ''}>Up</button>
            <button data-act="layoutMove" data-key="${f.key}" data-dir="down" class="btn-ghost !px-2.5 !py-1" ${i === L.fields.length - 1 ? 'disabled' : ''}>Down</button></div>`).join('')}
        </div>
        <div class="space-y-3 text-sm">
          <label class="flex items-center gap-2 font-semibold"><input type="checkbox" data-change="layoutOpt" data-opt="subtitle" ${L.subtitle ? 'checked' : ''}> Section subtitle with the Islamic year header</label>
          <label class="flex items-center gap-2 font-semibold"><input type="checkbox" data-change="layoutOpt" data-opt="gregorian" ${L.gregorian ? 'checked' : ''}> Show the Gregorian date</label>
          <label class="flex items-center gap-2 font-semibold"><input type="checkbox" data-change="layoutOpt" data-opt="hijri" ${L.hijri ? 'checked' : ''}> Show the Hijri date</label>
          <p class="rounded-xl bg-white/50 p-3 text-emerald-900/75">Today: ${esc(gregorianDate())} &nbsp;|&nbsp; ${esc(hijriDate().text)}</p>
        </div>
      </div>
    </div>`;
}
forms.examSave = async (f, d) => {
  const [kind, id] = String(d.scope || '').split(':');
  await db('saveExam', { id: d.id ? Number(d.id) : null, section: S.cfgSection, name: d.name, stream: kind === 's' ? id : null, class_id: kind === 'c' ? Number(id) : null });
  toast(d.id ? 'Exam updated' : 'Exam added');
  closeModal();
  await drawSettingsPane();
};
actions.editExam = el => {
  const e = S.cfg.exams.find(x => x.id === Number(el.dataset.id));
  openModal('Edit exam', `<form data-form="examSave"><input type="hidden" name="id" value="${e.id}">
    <div class="space-y-4">${fld('Exam name', 'name', e.name, { required: true })}<div><label class="label">Applies to</label>${scopeSelect(scopeValue(e))}</div></div>
    <div class="mt-6 flex justify-end gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button class="btn-gold">Save exam</button></div></form>`);
};
actions.deleteExam = async el => {
  if (!confirm('Delete this exam name? Marks already saved under it are kept.')) return;
  await db('deleteExam', Number(el.dataset.id));
  await drawSettingsPane();
};
async function saveLayout(next) { await db('saveResultLayout', next); await loadSettings(); await drawSettingsPane(); }
changes.layoutVis = el => { const L = structuredClone(layoutOf()); L.fields.find(f => f.key === el.dataset.key).visible = el.checked; return saveLayout(L); };
actions.layoutMove = el => {
  const L = structuredClone(layoutOf()), i = L.fields.findIndex(f => f.key === el.dataset.key), j = el.dataset.dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= L.fields.length) return;
  [L.fields[i], L.fields[j]] = [L.fields[j], L.fields[i]];
  return saveLayout(L);
};
changes.layoutOpt = el => { const L = structuredClone(layoutOf()); L[el.dataset.opt] = el.checked; return saveLayout(L); };

/* ===== Tab 4: grading rules, institution-wide or per stream ===== */
function paneGrading(el) {
  const g = S.settings.grading || { all: DEFAULT_GRADING, byStream: {} };
  const scope = S.gradeScope || 'all';
  const own = scope === 'all' ? g.all : g.byStream[scope];
  const shown = own || g.all;
  const scopes = [['all', 'Institution-wide'], ...STREAMS.map(st => [st.key, st.key])];
  const inputs_ = ['A+', 'A', 'B', 'C', 'D'].map(k => `<div><label class="label">${k} from (%)</label><input class="field" type="number" min="0" max="100" step="any" name="${k}" value="${esc(shown[k])}" ${own ? '' : 'disabled'} required></div>`).join('');
  el.innerHTML = `
    <div class="card mb-6">
      <h3 class="mb-1 font-display text-lg font-bold">Grade cut-offs</h3>
      <p class="mb-4 text-sm text-emerald-900/70">A student gets the first grade whose cut-off the percentage reaches. Below the D cut-off the grade is F. A stream can use its own rules, otherwise it follows the institution-wide ones.</p>
      <div class="mb-5 flex w-fit flex-wrap rounded-xl bg-emerald-900/10 p-1">${scopes.map(([k, label]) => `<button data-act="gradeScope" data-scope="${k}" class="seg ${scope === k ? 'seg-on' : ''}">${label}${k !== 'all' && g.byStream[k] ? ' *' : ''}</button>`).join('')}</div>
      <form data-form="grading"><input type="hidden" name="scope" value="${scope}">
        <div class="grid grid-cols-6 items-end gap-4">${inputs_}
          <div><label class="label">Pass mark per subject (%)</label><input class="field" type="number" min="0" max="100" step="any" name="pass" value="${esc(shown.pass)}" ${own ? '' : 'disabled'} required></div></div>
        <div class="mt-5 flex items-center justify-between">
          <p class="text-sm text-emerald-900/70">${own ? (scope === 'all' ? 'These rules apply to every stream without its own rules.' : `${scope} uses its own rules.`) : `${scope} follows the institution-wide rules. Set its own rules to change them.`}</p>
          <div class="flex gap-3">
            ${scope !== 'all' && own ? '<button type="button" data-act="gradeInherit" class="btn-ghost">Use institution-wide rules</button>' : ''}
            ${own ? '<button class="btn-gold">Save rules</button>' : '<button type="button" data-act="gradeCustom" class="btn-gold">Set rules for this stream</button>'}
          </div>
        </div>
      </form>
    </div>
    <div class="card"><h3 class="mb-3 font-display text-lg font-bold">Rules in effect</h3>
      <table class="tbl"><thead><tr><th>Applies to</th><th class="num">A+</th><th class="num">A</th><th class="num">B</th><th class="num">C</th><th class="num">D</th><th class="num">Pass mark</th></tr></thead><tbody>
        ${scopes.map(([k, label]) => { const r = k === 'all' ? g.all : g.byStream[k] || g.all; if ((g.scales || {})[k]) return `<tr><td class="font-semibold">${label} <span class="badge badge-ok">Custom scale</span></td><td colspan="6">${scaleSummary(g.scales[k])}</td></tr>`; return `<tr><td class="font-semibold">${label}${k !== 'all' && !g.byStream[k] ? ' <span class="text-xs font-normal text-emerald-900/55">(institution-wide)</span>' : ''}</td>${['A+', 'A', 'B', 'C', 'D', 'pass'].map(x => `<td class="num">${r[x]}%</td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div>
    <form data-form="gradeLabels" class="card mt-6"><h3 class="mb-1 font-display text-lg font-bold">Grade names</h3>
      <p class="mb-4 text-sm text-emerald-900/70">Choose how each grade is written on result cards, class results and reports: for example ممتاز, جید جدا, A+ or Distinction. An empty box uses the letter. The cut-offs above decide who gets which grade.</p>
      <div class="grid grid-cols-6 gap-4">${[...GRADE_KEYS, 'F'].map(k => `<div><label class="label">${k === 'F' ? 'Below D (fail)' : k}</label><input class="field" dir="auto" name="${k}" maxlength="20" placeholder="${k}" value="${esc(((g.labels || {})[k] === k ? '' : (g.labels || {})[k]) || '')}"></div>`).join('')}</div>
      <div class="mt-5 flex justify-end"><button class="btn-gold">Save grade names</button></div></form>${scaleCard(g, scope)}`;
}
actions.gradeScope = el => { S.gradeScope = el.dataset.scope; return drawSettingsPane(); };
actions.gradeCustom = async () => {   // start the stream's own rules from the institution-wide ones
  await db('saveGradingRules', S.gradeScope, { ...S.settings.grading.all });
  await loadSettings();
  await drawSettingsPane();
};
actions.gradeInherit = async () => {
  await db('saveGradingRules', S.gradeScope, null);
  await loadSettings();
  toast('This stream now follows the institution-wide rules');
  await drawSettingsPane();
};
forms.grading = async (f, d) => {
  const rules = { pass: Number(d.pass) };
  for (const k of GRADE_KEYS) rules[k] = Number(d[k]);
  await db('saveGradingRules', d.scope, rules);
  await loadSettings();
  toast('Grading rules saved');
  await drawSettingsPane();
};

/* ===== Tab 1: institute settings ===== */
forms.hijri = async (f, d) => { await db('saveHijriOffset', Number(d.offset)); await loadSettings(); toast('Hijri adjustment saved'); await drawSettingsPane(); };

function paneInstitute(el) {
  const P = S.settings, year = new Date().getFullYear();
  el.innerHTML = `
    <div class="grid gap-6">
      <form data-form="logo" class="card">
        <h3 class="mb-1 font-display text-lg font-bold">Institution logo</h3>
        <p class="mb-4 text-sm text-emerald-900/70">Paste a Google Drive image link and set the file's sharing to "Anyone with the link". The logo is downloaded once and stored in the database, so it works offline on the login screen, header, admission form, result cards and JPG exports.</p>
        <div class="flex items-end gap-4">
          ${logoEl('h-20 w-20')}
          <div class="flex-1"><label class="label">Google Drive image link</label><input name="url" class="field" value="${esc(P.logoUrl)}"></div>
          <button class="btn-gold">Save logo</button>
          <button type="button" data-act="removeLogo" class="btn-danger">Remove</button>
        </div>
      </form>

      <form data-form="principalSig" class="card">
        <h3 class="mb-1 font-display text-lg font-bold">Principal signature</h3>
        <p class="mb-4 text-sm text-emerald-900/70">The image is printed on result cards and fee receipts. A PNG with a transparent background looks best. Without one, a clean line is left for signing by hand. Each teacher's signature is added in the Teachers panel, and a class teacher is chosen in Classes.</p>
        <div class="grid grid-cols-3 items-end gap-4">${signaturePicker('Signature image', P.principalSignature)}<div class="flex justify-end"><button class="btn-gold">Save signature</button></div></div>
      </form>

      <form data-form="hijri" class="card">
        <h3 class="mb-1 font-display text-lg font-bold">Hijri date adjustment</h3>
        <p class="mb-4 text-sm text-emerald-900/70">Hijri dates on result cards, receipts and class sheets follow the Umm al-Qura calendar. If your local moon sighting differs, shift the date by a day or two. Today: ${esc(gregorianDate())} &nbsp;|&nbsp; <span class="font-semibold">${esc(hijriDate().text)}</span></p>
        <div class="flex items-end gap-4"><div class="w-60"><label class="label">Adjustment</label><select name="offset" class="field">${[-2, -1, 0, 1, 2].map(n => `<option value="${n}" ${Number(P.hijriOffset || 0) === n ? 'selected' : ''}>${n === 0 ? 'No adjustment' : (n > 0 ? '+' : '') + n + (Math.abs(n) === 1 ? ' day' : ' days')}</option>`).join('')}</select></div><button class="btn-gold">Save adjustment</button></div>
      </form>

      <form data-form="teacherPw" class="card">
        <h3 class="mb-1 font-display text-lg font-bold">Teacher portal password</h3>
        <p class="mb-4 text-sm text-emerald-900/70">Teachers sign in from the Teacher tab on the login screen with the username teach123. They can save attendance once per class per day, view student reports, and manage marks and result cards.</p>
        <div class="grid grid-cols-3 items-end gap-4">
          ${fld('New teacher password', 'next', '', { type: 'password', required: true })}
          ${fld('Confirm new password', 'confirm', '', { type: 'password', required: true })}
          <div class="flex justify-end"><button class="btn-primary">Set teacher password</button></div>
        </div>
      </form>

      <form data-form="password" class="card">
        <h3 class="mb-4 font-display text-lg font-bold">Admin password</h3>
        <div class="grid grid-cols-3 gap-4">
          ${fld('Current password', 'current', '', { type: 'password', required: true })}
          ${fld('New password', 'next', '', { type: 'password', required: true })}
          ${fld('Confirm new password', 'confirm', '', { type: 'password', required: true })}
        </div>
        <div class="mt-5 flex justify-end"><button class="btn-primary">Change password</button></div>
      </form>

      <form data-form="dbPath" class="card">
        <h3 class="mb-1 font-display text-lg font-bold">Database folder</h3>
        <p class="mb-4 text-sm text-emerald-900/70">Choose any drive or folder. Your current data is copied to the new folder automatically, and the old file stays behind as a backup.</p>
        <label class="label">Database folder</label>
        <div class="flex gap-2"><input name="dir" class="field" value="${esc(S.status.dbDir)}" required><button type="button" data-act="browseDir" class="btn-ghost">Browse</button><button class="btn-gold">Use this folder</button></div>
      </form>

      <div class="card">
        <h3 class="mb-1 font-display text-lg font-bold">Backup and restore</h3>
        ${IS_APP() ? `<p class="mb-3 text-sm text-emerald-900/70">All data is saved automatically inside this app. Nothing is copied outside the app unless you tap <span class="font-semibold">Export Data</span>.</p>
        <ol class="mb-5 list-decimal space-y-1 pl-5 text-sm">
          <li>Tap Export Data. A dated copy of all records is created.</li>
          <li>Choose where to save it: Files, Google Drive, WhatsApp and so on.</li>
          <li>To bring records back, use Replace or Merge below and pick that file.</li>
        </ol>` : `        <p class="mb-3 text-sm text-emerald-900/70">Your data is one file: <span class="font-semibold">${esc(S.status.dbFile || '')}</span></p>
        <ol class="mb-5 list-decimal space-y-1 pl-5 text-sm">
          <li>Plug in your USB or external drive.</li>
          <li>Click Back up now and choose the drive. A dated copy of the file is saved there.</li>
          <li>Or click Show database file and copy <span class="font-semibold">jamia_noor_ul_anwar.sqlite</span> yourself.</li>
          <li>To bring old records back, use Replace or Merge below and pick the backup file.</li>
        </ol>`}
        <div class="flex flex-wrap gap-3">
          <button data-act="backupNow" class="btn-gold">${IS_APP() ? 'Export Data' : 'Back up now'}</button>
          <button data-act="openDbFolder" class="btn-ghost">Show database file</button>
        </div>
        <div class="mt-5 grid grid-cols-2 gap-4 border-t border-emerald-900/10 pt-5">
          <div><div class="mb-1 font-semibold">Replace with a backup</div><p class="mb-3 text-sm text-emerald-900/70">All current data is swapped for the backup. The login password also comes from the backup. A safety copy of today's data is saved first.</p><button data-act="restoreReplace" class="btn-danger">Choose backup to restore</button></div>
          <div><div class="mb-1 font-semibold">Merge a backup into current data</div><p class="mb-3 text-sm text-emerald-900/70">Adds students, teachers, classes, fees, results and attendance that are missing here. Nothing existing is overwritten. Students are matched by roll number.</p><button data-act="restoreMerge" class="btn-primary">Choose backup to merge</button></div>
        </div>
      </div>

      <div class="card"><h3 class="mb-1 font-display text-lg font-bold">Sessions and automatic promotion</h3>
        <p class="mb-4 text-sm text-teal-700">A session is an <b>academic year</b> or a <b>multi-year course</b>, such as an 8-year Dars-e-Nizami. Give a student a session on the admission form, or give a whole class one on the Classes page. Each time a session year finishes, its students move up one class of their stream, and the last class becomes Passed out. When an academic-year session ends, students carry on in the next academic-year session; when a course ends, students are passed out. Students with no session are not touched (use Promote students below for them). This runs when the administrator signs in.</p>
        <div class="mb-4 grid gap-2">
          <label class="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" data-change="autoPromote" ${P.autoPromote ? 'checked' : ''}> Promote students automatically when a session year finishes</label>
          <label class="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" data-change="autoGrad" ${P.autoGraduate ? 'checked' : ''}> Pass students out automatically when a multi-year course ends</label></div>
        <table class="tbl mb-4"><thead><tr><th>Session</th><th>Type</th><th>Stream</th><th class="num">Years</th><th>Starts</th><th>Ends</th><th></th></tr></thead><tbody>
          ${(P.sessions || []).map(x => `<tr><td class="font-semibold">${esc(x.name)}</td><td><span class="badge ${x.kind === 'course' ? 'badge-warn' : 'badge-ok'}">${x.kind === 'course' ? 'Course' : 'Academic year'}</span></td><td>${esc(x.stream || 'Any')}</td><td class="num">${x.years}</td><td>${dateBoth(x.start_date)}</td><td>${dateBoth(x.end_date)}</td><td class="text-right"><button data-act="sessionDelete" data-name="${esc(x.name)}" class="btn-danger !px-3 !py-1.5">Remove</button></td></tr>`).join('') || emptyRow(7, 'No sessions yet.')}</tbody></table>
        <form data-form="sessionSave" class="grid grid-cols-6 items-end gap-3">${fld('Session name', 'name', '', { required: true })}
          <div><label class="label">Type</label><select name="kind" class="field"><option value="year">Academic year</option><option value="course">Multi-year course</option></select></div>
          <div><label class="label">Stream</label><select name="stream" class="field"><option value="">Any</option>${STREAMS.map(x => `<option>${x.key}</option>`).join('')}</select></div>
          ${fld('Starts', 'start_date', '', { type: 'date', required: true })}${fld('Ends', 'end_date', '', { type: 'date', required: true })}<button class="btn-gold">Save session</button></form>
        <p class="mt-2 text-xs text-teal-600">Saving a session with an existing name updates it. A course of 8 years runs from its first day to the day before its eighth anniversary, for example 2026-04-01 to 2034-03-31.</p></div>

      <form data-form="promotion" class="card">
        <h3 class="mb-1 font-display text-lg font-bold">Yearly class promotion</h3>
        <p class="mb-4 text-sm text-emerald-900/70">On the date below each year, Active students move to the next class in their stream (see the order in Classes). Students in the last class of a stream become "Passed out". It runs once a year, the first time you sign in on or after that date.</p>
        <div class="flex flex-wrap items-end gap-6">
          <label class="flex items-center gap-2 pb-2 text-sm font-semibold"><input type="checkbox" name="enabled" ${P.promotionEnabled ? 'checked' : ''}> Promote automatically every year</label>
          ${fld('Promotion date', 'date', `${year}-${P.promotionDate}`, { type: 'date', required: true })}
          <button class="btn-gold">Save promotion settings</button>
          <button type="button" data-act="promotePreview" class="btn-ghost">Preview and promote now</button>
        </div>
        <p class="mt-3 text-sm text-emerald-900/65">${P.lastPromotionYear ? `Last promotion ran in ${P.lastPromotionYear}.` : 'No promotion has run yet.'}</p>
      </form>
    </div>`;
}

/** Re-draws everything so a new logo or restored data shows up everywhere. */
function refreshAll() {
  if (S.screen === 'main') { S.tab = 'settings'; renderMain(); } else renderSettingsScreen();
}
forms.logo = async (f, d) => {
  S.settings = { ...S.settings, ...(await rpc('setLogo', d.url)) };
  toast(S.settings.logoData ? 'Logo updated' : 'Logo removed');
  refreshAll();
};
actions.removeLogo = async () => {
  S.settings = { ...S.settings, ...(await rpc('setLogo', '')) };
  toast('Logo removed');
  refreshAll();
};
forms.principalSig = async (f, d) => {
  const v = signatureValue(d);
  if (v === undefined) throw new Error('Choose a signature image first.');
  await db('setPrincipalSignature', v || '');
  await loadSettings();
  toast(v ? 'Principal signature saved' : 'Principal signature removed');
  refreshAll();
};
forms.teacherPw = async (f, d) => {
  if (d.next !== d.confirm) throw new Error('The passwords do not match.');
  await db('setTeacherPassword', d.next);
  toast('Teacher portal password changed');
  f.reset();
};
forms.password = async (f, d) => {
  if (d.next !== d.confirm) throw new Error('The new passwords do not match.');
  await db('changePassword', d.current, d.next);
  toast('Password changed');
  f.reset();
};
forms.dbPath = async (f, d) => {
  const res = await rpc('setDbDir', d.dir);
  S.status = await rpc('status');
  toast(res.migrated ? 'Data copied to the new folder' : 'Database folder updated');
  refreshAll();
};

/* ----- Backup and restore ----- */
actions.backupNow = async () => { if (await rpc('backupDb')) toast(IS_APP() ? 'Data exported' : 'Backup saved'); };
actions.openDbFolder = () => rpc('showDbFolder');
async function doRestore(mode) {
  const r = await rpc('restoreDb', mode);
  if (!r) return;
  await loadSettings();
  if (mode === 'replace') toast('Backup restored. A safety copy of the previous data is in the database folder.');
  else toast(`Merged: ${r.students} students, ${r.teachers} teachers and ${r.classes} classes added. ${r.skipped} students already existed.`);
  refreshAll();
}
actions.restoreReplace = async () => {
  if (!confirm('Replace ALL current data with a backup file? A safety copy of the current data is saved first, and the login password will come from the backup.')) return;
  await doRestore('replace');
};
actions.restoreMerge = async () => {
  if (!confirm('Merge a backup into the current data? Missing records are added; existing ones are not changed. A safety copy is saved first.')) return;
  await doRestore('merge');
};

/* ----- Yearly promotion ----- */
forms.promotion = async (f, d) => {
  await db('savePromotionSettings', d.enabled === 'on', d.date.slice(5));
  await loadSettings();
  toast('Promotion settings saved');
};
/* ==========================================================================
   Added in v1.5: unique-student breakdown, teacher salaries, hostel, student funds,
   class transfers, result remarks, paid/unpaid fee chart
   ========================================================================== */
const flash = el => { el.classList.add('ring-4', 'ring-emerald-300'); setTimeout(() => el.classList.remove('ring-4', 'ring-emerald-300'), 900); };
const statBox = (label, value) => `<div class="card !p-5"><div class="text-xl font-bold tabular-nums">${value}</div><div class="text-xs font-medium text-emerald-900/65">${label}</div></div>`;
const monthPick = (value, change) => `<div><label class="label">Month</label><input type="month" class="field" value="${value}" data-change="${change}"></div>`;
const tabBar = (items, current, act) => `<div class="seg-bar mb-5 flex w-fit flex-wrap rounded-xl bg-emerald-900/10 p-1">${items.map(([k, l]) => `<button data-act="${act}" data-tab="${k}" class="seg ${current === k ? 'seg-on' : ''}">${l}</button>`).join('')}</div>`;
const formButtons = label => `<div class="mt-6 flex justify-end gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button class="btn-gold">${label}</button></div>`;
const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="py-8 text-center text-emerald-900/60">${text}</td></tr>`;

/* ----- Class transfers ----- */
actions.transferStudent = async el => {
  const s = S.students.find(x => x.id === Number(el.dataset.id));
  const hist = await db('getTransfers', s.id);
  openModal(`Transfer ${esc(s.name)}`, `
    <form data-form="transferSave"><input type="hidden" name="id" value="${s.id}">
      <p class="mb-4 text-sm text-emerald-900/70">Currently in <b>${esc(s.class_name || '-')}</b> (${esc(s.stream || '-')}). Fees, results and attendance stay with the student.</p>
      <div class="grid grid-cols-2 gap-4"><div class="col-span-2"><label class="label">Move to class</label><select name="class_id" class="field" required><option value="">Choose a class</option>${classOptions('')}</select></div>
        ${fld('Transfer date', 'date', ymd(new Date()), { type: 'date', required: true })}${fld('Note (optional)', 'note')}</div>
      ${formButtons('Transfer student')}
    </form>
    ${hist.length ? `<h4 class="mb-2 mt-5 font-semibold">Transfer history</h4><table class="tbl"><thead><tr><th>Date</th><th>From</th><th>To</th><th>Note</th></tr></thead><tbody>${hist.map(h => `<tr><td>${dateBoth(h.date)}</td><td>${esc(h.from_name || '-')}</td><td>${esc(h.to_name || '-')}</td><td>${esc(h.note)}</td></tr>`).join('')}</tbody></table>` : ''}`);
};
forms.transferSave = async (f, d) => {
  await db('transferStudent', Number(d.id), Number(d.class_id), d.date, d.note);
  toast('Student transferred');
  closeModal();
  await go(S.tab);
};

/* ----- Result card: teacher's remarks ----- */
forms.remark = async (f, d) => {
  const C = S.card;
  C.remark = await db('saveRemark', C.stu.id, C.sel.exam, C.sel.year, d.remark);
  toast('Remarks saved');
  drawCard();
};

/* ----- Grade names ----- */
forms.gradeLabels = async (f, d) => { await db('saveGradeLabels', d); await loadSettings(); toast('Grade names saved'); await drawSettingsPane(); };

/* ==========================================================================
   Teacher salary: base salary, automatic or manual absence deduction, status, remarks
   ========================================================================== */
S.sal = { month: '', rows: [] };
VIEWS.salaries = async v => {
  if (!S.sal.month) S.sal.month = curMonth();
  v.innerHTML = pageTitle('Teacher salary', 'Monthly salary with deductions from teacher attendance, paid status and remarks') + `
    <div class="card mb-5"><div class="flex flex-wrap items-end gap-6">${monthPick(S.sal.month, 'salMonth')}
      <p class="max-w-2xl text-xs text-emerald-900/65">Daily rate = salary divided by the month's working days (Fridays off). Absent days are working days (not Fridays or custom holidays) with no attendance, counted from the joining date. Days marked Leave are not deducted while approved leave is paid (Holidays and leave page). Nothing is deducted until attendance has been marked for the month. Type a manual deduction in Edit to override it. Marking a teacher Paid locks the deduction amount.</p></div></div>
    <div id="salSummary" class="mb-5 grid grid-cols-4 gap-4"></div><div id="salBody"></div>`;
  await loadSal();
};
async function loadSal() { S.sal.rows = await db('getSalarySheet', S.section, S.sal.month); drawSal(); }
function drawSal() {
  const R = S.sal.rows, sum = k => R.reduce((t, r) => t + r[k], 0);
  $('#salSummary').innerHTML = statBox('Total salaries', money(sum('base'))) + statBox('Deductions', money(sum('deduction'))) + statBox('Net payable', money(sum('net'))) + statBox('Not yet paid', R.filter(r => r.status !== 'Paid').length);
  $('#salBody').innerHTML = `<div class="card"><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Teacher</th><th class="num">Salary</th><th class="num">Present / working</th><th class="num">Leave</th><th class="num">Absent</th><th class="num">Deduction</th><th class="num">Net</th><th>Status</th><th>Remarks</th><th></th></tr></thead><tbody>
    ${R.length ? R.map(r => `<tr><td class="whitespace-nowrap font-semibold">${esc(r.name)}<div class="text-xs font-normal text-emerald-900/55">Joined ${esc(r.joined_on || '-')}</div></td>
      <td class="num">${money(r.base)}</td><td class="num">${r.present} / ${r.work}</td><td class="num">${r.leave}</td><td class="num">${r.absent}${r.pre ? ` <span class="text-xs text-emerald-900/55" title="Working days before joining">(+${r.pre})</span>` : ''}</td>
      <td class="num">${money(r.deduction)} <span class="badge ${r.manual ? 'badge-warn' : 'badge-ok'}">${r.manual ? 'Manual' : r.marked ? 'Auto' : 'No attendance'}</span></td>
      <td class="num font-bold">${money(r.net)}</td>
      <td><select class="field !py-1.5 text-sm" style="width:110px" data-change="salStatus" data-id="${r.teacher_id}"><option ${r.status === 'Unpaid' ? 'selected' : ''}>Unpaid</option><option ${r.status === 'Paid' ? 'selected' : ''}>Paid</option></select>${r.paid_on ? `<div class="text-xs text-emerald-900/55">${dateText(r.paid_on)}</div>` : ''}</td>
      <td><input class="plain" style="width:200px" maxlength="300" placeholder="Add a remark" data-change="salRemark" data-id="${r.teacher_id}" value="${esc(r.remarks)}"></td>
      <td class="text-right"><button data-act="editSalary" data-id="${r.teacher_id}" class="btn-ghost !px-3 !py-1.5">Edit</button></td></tr>`).join('') : emptyRow(10, 'No teachers have joined by this month.')}
    </tbody></table></div></div>`;
}
const salRow = el => S.sal.rows.find(x => x.teacher_id === Number(el.dataset.id));
/** Payload for saveSalary. A Paid salary keeps its deduction fixed even if attendance changes later. */
const salPayload = (r, patch = {}) => {
  const status = patch.status || r.status;
  return { teacher_id: r.teacher_id, month: S.sal.month, base: r.base, manual_deduction: r.manual || status === 'Paid' ? r.deduction : '', status, remarks: r.remarks, ...patch };
};
changes.salMonth = el => { if (!el.value) return; S.sal.month = el.value; return loadSal(); };
changes.salStatus = async el => { await db('saveSalary', salPayload(salRow(el), { status: el.value })); toast(`Marked ${el.value}`); await loadSal(); };
changes.salRemark = async el => { const r = salRow(el); await db('saveSalary', salPayload(r, { remarks: el.value })); r.remarks = el.value; flash(el); };
actions.editSalary = el => {
  const r = salRow(el);
  openModal(`Salary: ${esc(r.name)}`, `
    <form data-form="salarySave"><input type="hidden" name="id" value="${r.teacher_id}">
      <div class="mb-4 grid grid-cols-3 gap-3">${miniBox('Absent days', r.absent)}${miniBox('Automatic deduction', money(r.auto))}${miniBox('Net now', money(r.net), 'text-emerald-800')}</div>
      <div class="grid grid-cols-2 gap-4">${fld('Salary for this month (Rs.)', 'base', r.base, { type: 'number', required: true })}
        <div><label class="label">Manual deduction (Rs.)</label><input class="field" name="manual" type="number" min="0" step="any" value="${r.manual ? esc(r.deduction) : ''}" placeholder="Automatic: ${esc(r.auto)}"></div>
        ${selectFld('Status', 'status', ['Unpaid', 'Paid'], r.status)}<div></div>
        <div class="col-span-2"><label class="label">Remarks</label><textarea class="field" name="remarks" rows="2" maxlength="300">${esc(r.remarks)}</textarea></div></div>
      <p class="mt-3 text-xs text-emerald-900/65">Leave the manual deduction empty to use the automatic one.</p>${formButtons('Save salary')}
    </form>`);
};
forms.salarySave = async (f, d) => {
  const r = S.sal.rows.find(x => x.teacher_id === Number(d.id));
  await db('saveSalary', { teacher_id: r.teacher_id, month: S.sal.month, base: d.base, manual_deduction: d.manual !== '' ? d.manual : d.status === 'Paid' ? r.deduction : '', status: d.status, remarks: d.remarks });
  toast('Salary saved');
  closeModal();
  await loadSal();
};

/* ==========================================================================
   Hostel: residents (with extended family), fees, expenses, leave applications
   ========================================================================== */
S.host = { tab: 'residents', month: '' };
VIEWS.hostel = async v => {
  if (!S.host.month) S.host.month = curMonth();
  v.innerHTML = pageTitle('Hostel', 'Residents and their extended family, hostel fees, expenses and leave applications') +
    tabBar([['residents', 'Residents'], ['fees', 'Hostel fees'], ['expenses', 'Expenses'], ['leaves', 'Leave applications']], S.host.tab, 'hostTab') + '<div id="hostBody"></div>';
  await drawHostel();
};
actions.hostTab = el => { S.host.tab = el.dataset.tab; return go('hostel'); };
const drawHostel = () => ({ residents: hostResidents, fees: hostFees, expenses: hostExpenses, leaves: hostLeaves })[S.host.tab]($('#hostBody'));
changes.hostMonth = el => { if (!el.value) return; S.host.month = el.value; return drawHostel(); };
const hostDone = async () => { closeModal(); await drawHostel(); };

actions.addResident = () => residentForm();
actions.editResident = el => residentForm(S.hostRes.find(x => x.id === Number(el.dataset.id)));
actions.deleteResident = async el => {
  const r = S.hostRes.find(x => x.id === Number(el.dataset.id));
  if (!confirm(`Remove ${r.name} from the hostel? Their hostel fees and leave applications will also be deleted.`)) return;
  await db('deleteHostelResident', r.id);
  toast('Resident removed');
  await drawHostel();
};
forms.residentSave = async (f, d) => { await db('saveHostelResident', { ...d, contacts: readContacts(), id: d.id ? Number(d.id) : null, student_id: d.student_id ? Number(d.student_id) : null, section: S.section }); toast('Resident saved'); await hostDone(); };

actions.hostCollect = el => {
  const r = S.hostFees.find(x => x.id === Number(el.dataset.id));
  openModal('Collect hostel fee', `
    <form data-form="hostCollect"><input type="hidden" name="id" value="${r.id}">
      <p class="mb-3 font-semibold">${esc(r.name)} <span class="font-normal text-emerald-900/60">${esc(r.room)}</span></p>
      <div class="mb-4 grid grid-cols-2 gap-3">${miniBox('Previous dues', money(r.previous))}${miniBox('Total payable', money(r.payable), 'text-emerald-800')}</div>
      <div class="grid grid-cols-2 gap-4">${fld('Amount received', 'amount', '', { type: 'number', required: true })}${fld('Payment date', 'paid_on', ymd(new Date()), { type: 'date', required: true })}</div>
      <p class="mt-3 text-xs text-emerald-900/65">Payments clear the oldest unpaid months first.</p>${formButtons('Save payment')}
    </form>`);
  $('[name=amount]').focus();
};
forms.hostCollect = async (f, d) => { await db('collectHostelFee', Number(d.id), S.host.month, Number(d.amount), d.paid_on); toast('Payment recorded'); await hostDone(); };

forms.hostExpense = async (f, d) => { await db('addHostelExpense', { ...d, section: S.section }); toast('Expense added'); await drawHostel(); };
actions.delExpense = async el => { if (!confirm('Delete this expense?')) return; await db('deleteHostelExpense', Number(el.dataset.id)); await drawHostel(); };

changes.leavePhoto = async el => {
  const file = el.files[0];
  if (file) el.closest('form').querySelector('[name=photo]').value = await readImage(file, { maxW: 1200, maxH: 1600, quality: 0.8 });
};
forms.hostLeave = async (f, d) => { await db('addHostelLeave', { ...d, resident_id: Number(d.resident_id), photo: d.photo || null }); toast('Leave application saved'); await drawHostel(); };
changes.leaveStatus = async el => { await db('setHostelLeaveStatus', Number(el.dataset.id), el.value); toast(`Marked ${el.value}`); };
actions.viewLeave = async el => {
  const img = await db('getHostelLeavePhoto', Number(el.dataset.id));
  openModal('Leave application', img ? `<img src="${img}" alt="Leave application" class="mx-auto max-h-[70vh] rounded-xl border border-emerald-900/20">` : '<p>No photo.</p>', true);
};
actions.delLeave = async el => { if (!confirm('Delete this leave application?')) return; await db('deleteHostelLeave', Number(el.dataset.id)); await drawHostel(); };

/* ==========================================================================
   Student funds portal: money held for a student (deposits and withdrawals)
   ========================================================================== */
VIEWS.funds = async v => {
  const rows = await db('getFundBalances', S.section);
  const held = rows.reduce((t, r) => t + r.balance, 0);
  v.innerHTML = pageTitle('Student funds', 'Money the institute holds for students. Kept separate from fees.', '<button data-act="fundNew" class="btn-gold">New entry</button>') + `
    <div class="mb-5 grid grid-cols-3 gap-4">${statBox('Total held', money(held))}${statBox('Students with a fund', rows.length)}${statBox('Students with a balance', rows.filter(r => r.balance > 0).length)}</div>
    <div class="card"><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Roll</th><th>Student</th><th>Class</th><th class="num">Entries</th><th class="num">Balance</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map(r => `<tr><td>${esc(r.roll_no)}</td><td class="font-semibold">${esc(r.name)}</td><td>${esc(r.class_name)}<div class="text-xs text-emerald-900/55">${esc(r.stream)}</div></td><td class="num">${r.entries}</td><td class="num font-bold">${money(r.balance)}</td>
      <td class="text-right"><button data-act="fundOpen" data-id="${r.student_id}" class="btn-primary !px-3 !py-1.5">Open ledger</button></td></tr>`).join('') : emptyRow(6, 'No student funds yet. Use New entry to record the first deposit.')}
    </tbody></table></div></div>`;
};
actions.fundNew = () => {
  openModal('Find student', `<label class="label">Roll number, name or student ID</label><input class="field" data-input="fundSearch" autocomplete="off"><div id="fundMatches" class="mt-3 flex flex-wrap gap-2"></div>`);
  $('[data-input=fundSearch]').focus();
};
let fundTimer = null;
inputs.fundSearch = el => {
  clearTimeout(fundTimer);
  fundTimer = setTimeout(safe(async () => {
    const m = await db('searchStudents', S.section, el.value);
    $('#fundMatches').innerHTML = m.map(s => `<button data-act="fundOpen" data-id="${s.id}" class="btn-ghost">${esc(s.roll_no)} - ${esc(s.name)} <span class="font-normal text-emerald-900/60">${esc(s.class_name)}</span></button>`).join('') || (el.value.trim() ? '<span class="text-sm text-emerald-900/60">No student found.</span>' : '');
  }), 200);
};
async function openLedger(id) {
  const [s, ledger] = await Promise.all([db('getStudent', id), db('getFundLedger', id)]);
  const balance = ledger.reduce((t, e) => t + (e.type === 'deposit' ? e.amount : -e.amount), 0);
  openModal(`Fund: ${esc(s.name)}`, `
    <p class="mb-4 text-sm text-emerald-900/70">Roll ${esc(s.roll_no)}, ${esc(s.class_name || '-')}</p>
    <div class="mb-4 grid grid-cols-3 gap-3">${miniBox('Balance', money(balance), 'text-emerald-800')}${miniBox('Deposited', money(ledger.filter(e => e.type === 'deposit').reduce((t, e) => t + e.amount, 0)))}${miniBox('Withdrawn', money(ledger.filter(e => e.type === 'withdraw').reduce((t, e) => t + e.amount, 0)))}</div>
    <form data-form="fundSave" class="mb-5 rounded-2xl bg-white/50 p-4"><input type="hidden" name="student_id" value="${id}">
      <div class="grid grid-cols-4 items-end gap-3"><div><label class="label">Type</label><select name="type" class="field"><option value="deposit">Deposit</option><option value="withdraw">Withdrawal</option></select></div>
        ${fld('Amount (Rs.)', 'amount', '', { type: 'number', required: true })}${fld('Date', 'date', ymd(new Date()), { type: 'date', required: true })}${fld('Note', 'note')}</div>
      <div class="mt-3 flex justify-end"><button class="btn-gold">Save entry</button></div></form>
    <table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>
    ${ledger.length ? ledger.map(e => `<tr><td>${dateBoth(e.date)}</td><td><span class="badge ${e.type === 'deposit' ? 'badge-ok' : 'badge-warn'}">${e.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</span></td><td>${esc(e.note)}</td><td class="num">${money(e.amount)}</td>
      <td class="text-right"><button data-act="fundDelete" data-id="${e.id}" data-student="${id}" class="btn-danger !px-3 !py-1.5">Delete</button></td></tr>`).join('') : emptyRow(5, 'No entries yet.')}
    </tbody></table>`, true);
}
actions.fundOpen = el => openLedger(Number(el.dataset.id));
forms.fundSave = async (f, d) => { await db('addFundEntry', { ...d, student_id: Number(d.student_id) }); toast('Entry saved'); await openLedger(Number(d.student_id)); if (S.tab === 'funds') await refreshView(); };
actions.fundDelete = async el => { if (!confirm('Delete this entry?')) return; await db('deleteFundEntry', Number(el.dataset.id)); await openLedger(Number(el.dataset.student)); if (S.tab === 'funds') await refreshView(); };
/** Redraws the current main view without touching the open modal. */
async function refreshView() { const view = $('#view'); if (view && VIEWS[S.tab]) { view.firstChild.innerHTML = ''; await VIEWS[S.tab](view.firstChild); } }

/* ----- Selective, class-wise yearly promotion ----- */
actions.promotePreview = async () => {
  const rows = (await db('getPromotionPreview')).filter(r => r.count > 0);
  openModal('Promote students', `
    <p class="mb-4 text-sm text-emerald-900/70">Tick the classes to promote. Active students in a ticked class move to the next class in their stream, and the last class of a stream becomes Passed out. Unticked classes stay as they are. Fee dues and results stay on record. Running this counts as this year's promotion, so automatic promotion will not run again this year.</p>
    <div class="mb-5 max-h-80 overflow-y-auto"><table class="tbl"><thead><tr><th><input type="checkbox" checked data-change="promoAll" title="Select all"></th><th>Section</th><th>Stream</th><th>From</th><th>To</th><th class="num">Students</th></tr></thead><tbody>
      ${rows.length ? rows.map(r => `<tr><td><input type="checkbox" class="promoCb" value="${r.class_id}" checked></td><td>${SECTIONS[r.section]}</td><td>${esc(r.stream)}</td><td>${esc(r.from)}</td><td>${r.to ? esc(r.to) : '<span class="badge badge-warn">Passed out</span>'}</td><td class="num">${r.count}${r.managed ? `<div class="text-xs text-teal-600" title="These students are moved by their session">+${r.managed} by session</div>` : ''}</td></tr>`).join('')
        : emptyRow(6, 'There are no active students to promote.')}
    </tbody></table></div>
    <div class="flex justify-end gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button type="button" data-act="promoteNow" class="btn-gold" ${rows.length ? '' : 'disabled'}>Promote selected classes</button></div>`, true);
};
changes.promoAll = el => document.querySelectorAll('.promoCb').forEach(c => { c.checked = el.checked; });
actions.promoteNow = async () => {
  const ids = [...document.querySelectorAll('.promoCb:checked')].map(c => Number(c.value));
  if (!ids.length) throw new Error('Tick at least one class.');
  if (!confirm(`Promote ${ids.length} class${ids.length > 1 ? 'es' : ''} now? This cannot be undone automatically.`)) return;
  const r = await db('runPromotion', ids);
  closeModal();
  await loadSettings();
  toast(`Promotion done: ${r.moved} promoted, ${r.graduated} passed out.${r.noNextSession ? ` ${r.noNextSession} students have no later session defined.` : ''}`);
  refreshAll();
};


/* ==========================================================================
   Overall students: the admin links the profiles that are the same physical person
   ========================================================================== */
S.uniq = { activeOnly: false };
S.link = { a: null, b: null };
async function openUnique() {
  S.link = { a: null, b: null };
  const u = await db('getUniqueStudents', S.section, S.uniq.activeOnly);
  const cell = e => e ? `<div class="font-semibold">${esc(e.class_name)}</div><div class="text-xs text-teal-600">Roll ${esc(e.roll_no)}${e.status !== 'Active' ? ', ' + esc(e.status) : ''}</div>` : '<span class="text-emerald-900/30">-</span>';
  const linked = u.dual.map(d => `<tr><td class="font-semibold">${esc(d.name)}<div class="text-xs font-normal text-teal-600">${esc(d.father_name)}</div></td>
    ${STREAMS.map(st => `<td>${cell(d.enrollments.find(e => e.stream === st.key))}</td>`).join('')}
    <td class="whitespace-nowrap text-right">${d.enrollments.map(e => `<button data-act="unlinkProfile" data-id="${e.id}" class="btn-ghost !px-2 !py-1 text-xs" title="Remove this profile from the link">Unlink ${esc(e.stream)}</button>`).join(' ')}</td></tr>`).join('');
  const slot = (k, n) => `<div><label class="label">Profile ${n}</label><input class="field" data-input="linkSearch" data-slot="${k}" placeholder="Roll, name or student ID" autocomplete="off">
    <div id="linkMatch_${k}" class="mt-2 flex flex-col gap-1"></div><div id="linkPick_${k}" class="mt-2 text-sm font-semibold text-emerald-800"></div></div>`;
  openModal('Overall students', `
    <div class="mb-4 flex items-center justify-between gap-3"><p class="text-sm text-teal-700">Each profile is counted separately until you link the profiles that belong to the same person.</p>
      <button data-act="uniqToggle" class="btn-ghost shrink-0 !px-3 !py-1.5">${S.uniq.activeOnly ? 'Active only' : 'All statuses'}</button></div>
    <h4 class="mb-2 font-semibold">Linked people, class in each stream <span class="font-normal text-teal-600">(${u.dual.length})</span></h4>
    <div class="mb-5 max-h-72 overflow-auto"><table class="tbl"><thead><tr><th>Student</th>${STREAMS.map(st => `<th>${st.key}</th>`).join('')}<th></th></tr></thead><tbody>
      ${linked || emptyRow(6, 'No profiles are linked yet.')}</tbody></table></div>
    <div class="mb-5 rounded-2xl bg-white/50 p-4"><h4 class="mb-1 font-semibold">Link two profiles of the same person</h4>
      <p class="mb-3 text-xs text-teal-700">Search for each profile and pick it. One person can have one profile per stream, so profiles in the same stream cannot be linked.</p>
      <div class="grid grid-cols-2 gap-4">${slot('a', 1)}${slot('b', 2)}</div>
      <div class="mt-4 flex justify-end"><button data-act="linkGo" class="btn-gold">Link profiles</button></div></div>
    <div class="mb-5 grid grid-cols-3 gap-3">${miniBox('Unique students', u.unique, 'text-emerald-800')}${miniBox('Profiles (all streams)', u.enrollments)}${miniBox('Linked people', u.dual.length, 'text-gold-700')}</div>
    <div class="mb-5 grid grid-cols-2 gap-5">
      <div><h4 class="mb-2 font-semibold">Stream-wise</h4><table class="tbl"><thead><tr><th>Stream</th><th class="num">Profiles</th></tr></thead><tbody>
        ${STREAMS.map(st => `<tr><td class="font-semibold">${st.key} ${urdu(st.ur)}</td><td class="num">${u.byStream[st.key]}</td></tr>`).join('')}
        <tr><td class="font-bold">All streams</td><td class="num font-bold">${u.enrollments}</td></tr></tbody></table></div>
      <div><h4 class="mb-2 font-semibold">Class-wise</h4><div class="max-h-56 overflow-y-auto"><table class="tbl"><thead><tr><th>Stream</th><th>Class</th><th class="num">Students</th></tr></thead><tbody>
        ${u.byClass.map(c => `<tr><td>${esc(c.stream)}</td><td class="font-semibold">${esc(c.name)}</td><td class="num">${c.count}</td></tr>`).join('') || emptyRow(3, 'No classes yet.')}</tbody></table></div></div>
    </div>`, 'xl');
}
actions.openUnique = () => openUnique();
actions.uniqToggle = async () => { S.uniq.activeOnly = !S.uniq.activeOnly; await openUnique(); };
let linkTimer = null;
inputs.linkSearch = el => {
  clearTimeout(linkTimer);
  linkTimer = setTimeout(safe(async () => {
    const slot = el.dataset.slot, m = await db('searchStudents', S.section, el.value);
    $(`#linkMatch_${slot}`).innerHTML = m.map(s => `<button type="button" data-act="linkPick" data-slot="${slot}" data-id="${s.id}" data-label="${esc(`${s.roll_no} - ${s.name} (${s.stream}: ${s.class_name})`)}" class="btn-ghost !justify-start !py-1.5 text-left">${esc(s.roll_no)} - ${esc(s.name)} <span class="font-normal text-teal-600">${esc(s.stream)}: ${esc(s.class_name)}${s.person_id ? ', already linked' : ''}</span></button>`).join('')
      || (el.value.trim() ? '<span class="text-sm text-teal-600">No student found.</span>' : '');
  }), 200);
};
actions.linkPick = el => {
  const slot = el.dataset.slot;
  S.link[slot] = { id: Number(el.dataset.id) };
  $(`#linkPick_${slot}`).textContent = 'Selected: ' + el.dataset.label;
  $(`#linkMatch_${slot}`).innerHTML = '';
};
actions.linkGo = async () => {
  if (!S.link.a || !S.link.b) throw new Error('Pick a profile in both boxes first.');
  await db('linkStudents', S.link.a.id, S.link.b.id);
  S.uniqDirty = true;
  toast('Profiles linked');
  await openUnique();
};
actions.unlinkProfile = async el => { await db('unlinkStudent', Number(el.dataset.id)); S.uniqDirty = true; toast('Profile unlinked'); await openUnique(); };

/* ----- Input templates for custom fields (0 = digit, A = letter, X = letter or digit) ----- */
function maskApply(mask, value) {
  const src = String(value).replace(/[^A-Za-z0-9]/g, '');
  let out = '', i = 0;
  for (const m of mask) {
    if (i >= src.length) break;
    if ('0AX'.includes(m)) {
      const ok = m === '0' ? /\d/ : m === 'A' ? /[A-Za-z]/ : /[A-Za-z0-9]/;
      while (i < src.length && !ok.test(src[i])) i++;
      if (i >= src.length) break;
      out += src[i++];
    } else out += m;
  }
  return out;
}
inputs.maskInput = el => { const v = maskApply(el.dataset.mask, el.value); if (v !== el.value) el.value = v; };

/* ----- Student report: class transfers, left and passed-out history ----- */
function historyCard(r) {
  const ev = r.history || [], cur = r.current || {};
  const when = st => { const e = [...ev].reverse().find(x => x.type === 'status' && x.status === st); return e ? e.date : ''; };
  const moves = ev.filter(e => e.type === 'transfer' && e.note !== 'Yearly promotion'), lastMove = moves[moves.length - 1];
  const label = e => e.type === 'admission' ? '<span class="badge badge-ok">Admitted</span>'
    : e.type === 'transfer' ? `<span class="badge ${e.note === 'Yearly promotion' ? 'badge-ok' : 'badge-warn'}">${e.note === 'Yearly promotion' ? 'Promoted' : 'Class transfer'}</span>`
      : `<span class="badge ${e.status === 'Active' ? 'badge-ok' : e.status === 'Passed out' ? 'badge-warn' : 'badge-bad'}">${e.status === 'Active' ? 'Re-activated' : esc(e.status)}</span>`;
  const detail = e => e.type === 'admission' ? (e.to ? `Session ${esc(e.to)}` : '')
    : e.type === 'transfer' ? `Previous class: <b>${esc(e.from || '-')}</b> &rarr; New class: <b>${esc(e.to || '-')}</b>${e.note && e.note !== 'Yearly promotion' ? ` <span class="text-teal-600">(${esc(e.note)})</span>` : ''}`
      : esc(e.note || '');
  return `<div class="card mb-5"><h3 class="mb-3 font-display text-lg font-bold">Movement and status history</h3>
    <div class="mb-4 grid grid-cols-4 gap-3">
      ${miniBox('Current status', esc(cur.status || '-'), cur.status === 'Active' ? 'text-emerald-800' : 'text-gold-700')}
      ${miniBox('Academic session', esc(cur.session || '-'))}
      ${miniBox('Class transfers', `${moves.length}${lastMove ? ` <span class="text-xs font-normal text-teal-600">last ${esc(lastMove.date)}</span>` : ''}`)}
      ${miniBox(when('Left') ? 'Left on' : when('Passed out') ? 'Passed out on' : 'Left / passed out', esc(when('Left') || when('Passed out') || 'Not applicable'))}
    </div>
    <table class="tbl"><thead><tr><th>Date</th><th>Event</th><th>Details</th></tr></thead><tbody>
      ${ev.map(e => `<tr><td class="whitespace-nowrap">${dateBoth(e.date)}</td><td>${label(e)}</td><td>${detail(e)}</td></tr>`).join('') || emptyRow(3, 'No history recorded.')}
    </tbody></table></div>`;
}

/* ==========================================================================
   Teachers: status history
   ========================================================================== */
actions.teacherHistory = async el => {
  const t = S.teachers.find(x => x.id === Number(el.dataset.id)), h = await db('getTeacherHistory', t.id);
  openModal(`History: ${esc(t.name)}`, `<table class="tbl"><thead><tr><th>Date</th><th>Event</th><th>Note</th></tr></thead><tbody>
    ${h.map(e => `<tr><td class="whitespace-nowrap">${dateBoth(e.date)}</td><td><span class="badge ${['Left', 'Inactive'].includes(e.event) ? 'badge-bad' : 'badge-ok'}">${esc(e.event)}</span></td><td>${esc(e.note)}</td></tr>`).join('') || emptyRow(3, 'No history yet.')}</tbody></table>`);
};

/* ==========================================================================
   Subject assignment: which teacher teaches which subject, stream by stream (Dars-e-Nizami first)
   ========================================================================== */
S.sub = { stream: 'Dars-e-Nizami' };
VIEWS.subjectassign = async v => {
  const [rows, teachers] = await Promise.all([db('getSubjectAssignments', S.section, S.sub.stream), db('getTeachers', S.section)]);
  const byId = new Map(teachers.map(t => [t.id, t]));
  const opts = cur => `<option value="">Unassigned</option>${teachers.filter(t => t.status === 'Active' || !t.status || t.id === cur).map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${esc(t.name)}${t.status === 'Left' ? ' (left)' : ''}</option>`).join('')}`;
  const all = rows.flatMap(c => c.subjects.map(s => ({ ...s, class_name: c.class_name })));
  const load = new Map();
  for (const s of all) if (s.teacher_id) load.set(s.teacher_id, [...(load.get(s.teacher_id) || []), `${s.class_name}: ${s.subject}`]);
  v.innerHTML = pageTitle('Subject assignment', 'Assign a teacher to each subject of a class. A teacher can open only the classes they are assigned to.') +
    tabBar(STREAMS.map(s => [s.key, s.key]), S.sub.stream, 'subStream') + `
    <div class="mb-5 grid grid-cols-3 gap-4">${statBox('Subjects in this stream', all.length)}${statBox('Assigned', all.filter(s => s.teacher_id).length)}${statBox('Still unassigned', all.filter(s => !s.teacher_id).length)}</div>
    ${rows.length ? rows.map(c => `<div class="card mb-5"><h3 class="mb-3 font-display text-lg font-bold">${esc(c.class_name)}</h3>
      <table class="tbl"><thead><tr><th>Subject</th><th class="num">Total marks</th><th style="width:340px">Teacher</th></tr></thead><tbody>
      ${c.subjects.map(s => `<tr><td class="font-semibold">${esc(s.subject)}</td><td class="num">${s.total ?? '-'}</td>
        <td><select class="field !py-1.5" data-change="subTeacher" data-class="${c.class_id}" data-subject="${esc(s.subject)}">${opts(s.teacher_id)}</select>${s.extra ? `<span class="ml-2 text-xs text-teal-600">+${s.extra} more, saving replaces them</span>` : ''}</td></tr>`).join('') || emptyRow(3, 'No subjects yet. Add the first one below.')}
      </tbody></table>
      <form data-form="subAdd" class="mt-4 flex items-end gap-3"><input type="hidden" name="class_id" value="${c.class_id}">
        <div class="flex-1"><label class="label">Add a subject to this class</label><input class="field" name="subject" required placeholder="Subject name"></div>
        <div style="width:120px"><label class="label">Total marks</label><input class="field" name="total" type="number" min="1" value="100" required></div><button class="btn-ghost">Add subject</button></form>
    </div>`).join('') : '<div class="card text-center text-teal-700">There are no classes in this stream yet. Create them under Classes.</div>'}
    <div class="card"><h3 class="mb-3 font-display text-lg font-bold">Teaching load in this stream</h3><table class="tbl"><thead><tr><th>Teacher</th><th class="num">Subjects</th><th>Classes and subjects</th></tr></thead><tbody>
      ${[...load.entries()].map(([id, list]) => `<tr><td class="font-semibold">${esc((byId.get(id) || {}).name || '')}</td><td class="num">${list.length}</td><td class="text-sm">${list.map(esc).join(', ')}</td></tr>`).join('') || emptyRow(3, 'No subject has a teacher yet.')}</tbody></table></div>`;
};
actions.subStream = el => { S.sub.stream = el.dataset.tab; return go('subjectassign'); };
changes.subTeacher = async el => { await db('setSubjectTeacher', Number(el.dataset.class), el.dataset.subject, Number(el.value) || null); toast('Assignment saved'); flash(el); };
forms.subAdd = async (f, d) => { await db('saveClassSubject', { class_id: Number(d.class_id), subject: d.subject, total: Number(d.total) }); toast('Subject added'); await go('subjectassign'); };

/* ==========================================================================
   Reports: one place for student and teacher reports
   ========================================================================== */
S.rep = { tab: 'student', teacherId: '', year: '', page: 0, cache: new Map() };
VIEWS.reports = async v => {
  const tabs = S.role === 'admin' ? [['student', 'Student reports'], ['teacher', 'Teacher reports']] : [['student', 'Student reports']];
  if (!tabs.some(t => t[0] === S.rep.tab)) S.rep.tab = 'student';
  S.rep.cache = new Map();
  v.innerHTML = pageTitle('Reports', 'Student and teacher reports in one place') + (tabs.length > 1 ? tabBar(tabs, S.rep.tab, 'repTab') : '') + '<div id="repBody"></div>';
  await (S.rep.tab === 'teacher' ? teacherReports : VIEWS.report)($('#repBody'));
};
actions.repTab = el => { S.rep.tab = el.dataset.tab; return go('reports'); };
async function teacherReports(box) {
  S.teachers = await db('getTeachers', S.section);
  box.innerHTML = `<div class="card mb-5"><label class="label">Teacher</label><select class="field max-w-md" data-change="repTeacher"><option value="">Choose a teacher</option>
    ${S.teachers.map(t => `<option value="${t.id}" ${String(t.id) === String(S.rep.teacherId) ? 'selected' : ''}>${esc(t.name)}${t.status && t.status !== 'Active' ? ` (${esc(t.status.toLowerCase())})` : ''}</option>`).join('')}</select></div><div id="teacherReport"></div>`;
  if (S.rep.teacherId) await drawTeacherReport();
}
changes.repTeacher = async el => { S.rep.teacherId = el.value; S.rep.year = ''; S.rep.page = 0; S.rep.cache = new Map(); if (el.value) await drawTeacherReport(); else $('#teacherReport').innerHTML = ''; };
changes.repTYear = debounce(async el => { S.rep.year = el.value; S.rep.page = 0; await drawTeacherReport(); }, 150);
actions.repTPage = async el => { S.rep.page += Number(el.dataset.dir); await drawTeacherReport(); };
async function drawTeacherReport() {
  const key = `${S.rep.teacherId}|${S.rep.year}`;
  if (!S.rep.cache.has(key)) S.rep.cache.set(key, await db('getTeacherReport', Number(S.rep.teacherId), S.rep.year || undefined));
  const r = S.rep.cache.get(key), t = r.teacher, left = t.status !== 'Active';
  S.rep.year = r.year;
  const pages = Math.max(1, Math.ceil(r.attendance.length / REP_PAGE));
  S.rep.page = Math.min(Math.max(S.rep.page, 0), pages - 1);
  const attPage = pageSlice(r.attendance, S.rep.page), monthsOn = new Set(attPage.map(a => a.month)), salPage = r.salaries.filter(x => monthsOn.has(x.month));
  const pager = r.year === 'all' ? pagerHTML(r.attendance.length, S.rep.page, 'repTPage') : '';
  const yLabel = r.year === 'all' ? 'all years' : r.year;
  const row = (...cells) => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  $('#teacherReport').innerHTML = `
    <div class="card mb-5"><div class="flex flex-wrap items-end gap-4"><div><label class="label">Report year</label>${yearSelect(r.years, r.year, 'repTYear')}</div><p class="text-xs text-emerald-900/65">${r.exit_date ? `<b>${esc(t.status)} on ${esc(r.exit_date)}.</b> Attendance, working days and salary stop after this date. ` : ''}From the joining year (${esc(r.start.slice(0, 4))}) to the current year.</p></div></div>
    ${attSummaryHTML(r.attendance, yLabel)}
    <div class="card mb-5"><div class="flex items-start justify-between gap-4"><div><h3 class="font-display text-2xl font-bold">${esc(t.name)}</h3>
        <p class="text-sm text-teal-700">${esc(t.qualification || 'Qualification not recorded')}</p></div>
      <span class="badge ${left ? 'badge-bad' : 'badge-ok'}">${left ? `${esc(t.status)} on ${esc(t.left_on)}` : 'Active'}</span></div>
      <div class="mt-4 grid grid-cols-4 gap-3">${miniBox('Phone', esc(t.phone || '-'))}${miniBox('Joined', dateText(t.joined_on || '-'))}${miniBox('Monthly salary', money(t.salary || 0))}${miniBox('Class teacher of', esc(r.classTeacherOf.join(', ') || '-'))}</div></div>
    <div class="mb-5 grid grid-cols-2 gap-5">
      <div class="card"><h3 class="mb-3 font-display text-lg font-bold">Assigned classes and subjects</h3><table class="tbl"><thead><tr><th>Stream</th><th>Class</th><th>Subject</th></tr></thead><tbody>
        ${r.assignments.map(a => row(esc(a.stream), `<b>${esc(a.class_name)}</b>`, esc(a.subject))).join('') || emptyRow(3, 'Not assigned to any class.')}</tbody></table></div>
      <div class="card"><h3 class="mb-3 font-display text-lg font-bold">Status history</h3><table class="tbl"><thead><tr><th>Date</th><th>Event</th><th>Note</th></tr></thead><tbody>
        ${r.history.map(h => row(dateBoth(h.date), `<span class="badge ${['Left', 'Inactive'].includes(h.event) ? 'badge-bad' : 'badge-ok'}">${esc(h.event)}</span>`, esc(h.note))).join('')}</tbody></table></div>
    </div>
    <div class="card mb-5"><h3 class="mb-3 font-display text-lg font-bold">Attendance, ${yLabel}</h3><table class="tbl"><thead><tr><th>Month</th><th class="num">Days present</th><th class="num">Leave</th><th class="num">Working days</th><th class="num">Attendance</th></tr></thead><tbody>
      ${attPage.map(a => a.tracked ? `<tr><td class="font-semibold">${esc(monthLabel(a.month))}</td><td class="num">${a.present}</td><td class="num">${a.leave}</td><td class="num">${a.working}</td><td class="num">${a.pct}%</td></tr>`
        : `<tr class="tl-off"><td>${esc(monthLabel(a.month))}</td><td colspan="4">${a.after ? 'After exit date' : 'Not employed'}</td></tr>`).join('')}</tbody></table>${pager}</div>
    <div class="card"><h3 class="mb-3 font-display text-lg font-bold">Salary record, ${yLabel}</h3><table class="tbl"><thead><tr><th>Month</th><th class="num">Salary</th><th class="num">Absent</th><th class="num">Deduction</th><th class="num">Net</th><th>Status</th><th>Paid on</th><th>Remarks</th></tr></thead><tbody>
      ${salPage.map(s => row(`<b>${esc(monthLabel(s.month))}</b>`, `<span class="block text-right">${money(s.base)}</span>`, `<span class="block text-right">${s.absent}</span>`, `<span class="block text-right">${money(s.deduction)}${s.manual ? ' *' : ''}</span>`, `<span class="block text-right font-bold">${money(s.net)}</span>`,
        `<span class="badge ${s.status === 'Paid' ? 'badge-ok' : 'badge-warn'}">${esc(s.status)}</span>`, esc(s.paid_on || ''), esc(s.remarks))).join('') || emptyRow(8, 'No salary months yet.')}</tbody></table>
      <p class="mt-2 text-xs text-teal-600">* manual deduction</p></div>`;
}

/* ==========================================================================
   Data import: bulk students and teachers from Excel or CSV
   ========================================================================== */
S.imp = { kind: 'students', file: '', rows: null, preview: null, result: null };
VIEWS.import = async v => {
  const I = S.imp;
  const tips = I.kind === 'students'
    ? ['Required columns: Roll No, Name and Class.', 'Stream is only needed when the same class name exists in more than one stream.', 'Academic Session must already exist in Settings. Dates: YYYY-MM-DD or D/M/YYYY.', 'Roll numbers that already exist are skipped and listed.']
    : ['Required column: Name.', 'Username and Password together create an individual login.', 'Joining Date and Salary are optional (the joining date defaults to today).', 'A teacher with the same name and phone is skipped and listed.'];
  v.innerHTML = pageTitle('Data import', `Add many records at once from an Excel or CSV file into the ${SECTIONS[S.section]}`) +
    tabBar([['students', 'Students'], ['teachers', 'Teachers']], I.kind, 'impKind') + `
    <div class="grid grid-cols-3 gap-6"><div class="card h-fit">
      <h3 class="mb-3 font-display text-lg font-bold">How it works</h3>
      <ol class="mb-4 list-decimal space-y-1 pl-5 text-sm text-teal-800"><li>Download the template and fill it in.</li><li>Choose the file. You will see a preview and any problems.</li><li>Press Import. Rows with problems are skipped and listed.</li></ol>
      <ul class="mb-5 list-disc space-y-1 pl-5 text-xs text-teal-700">${tips.map(t => `<li>${t}</li>`).join('')}</ul>
      <div class="grid gap-3"><button data-act="impTemplate" class="btn-ghost">Download template</button><button data-act="impChoose" class="btn-gold">Choose file</button></div></div>
      <div class="card col-span-2" id="impPane"></div></div>`;
  drawImport();
};
function drawImport() {
  const I = S.imp, pane = $('#impPane'), st = I.kind === 'students';
  const errs = list => list.length ? `<h4 class="mb-2 mt-5 font-semibold">Rows with problems</h4><div class="max-h-56 overflow-y-auto"><table class="tbl"><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>${list.slice(0, 100).map(e => `<tr><td class="num">${e.row}</td><td>${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>${list.length > 100 ? `<p class="mt-2 text-xs text-teal-600">${list.length - 100} more not shown.</p>` : ''}` : '';
  if (I.result) {
    pane.innerHTML = `<h3 class="mb-3 font-display text-lg font-bold">Import finished</h3><div class="grid grid-cols-3 gap-3">${miniBox('Rows in file', I.result.total)}${miniBox('Imported', I.result.added, 'text-emerald-800')}${miniBox('Skipped', I.result.errors.length, I.result.errors.length ? 'text-gold-700' : '')}</div>${errs(I.result.errors)}
      <div class="mt-5 flex justify-end"><button data-act="impReset" class="btn-primary">Import another file</button></div>`;
  } else if (I.preview) {
    const p = I.preview;
    pane.innerHTML = `<div class="mb-3 flex items-center justify-between"><h3 class="font-display text-lg font-bold">Preview: ${esc(I.file)}</h3><button data-act="impReset" class="btn-ghost !px-3 !py-1.5">Choose another file</button></div>
      <div class="mb-4 grid grid-cols-3 gap-3">${miniBox('Rows in file', p.total)}${miniBox('Ready to import', p.valid, 'text-emerald-800')}${miniBox('Rows with problems', p.errors.length, p.errors.length ? 'text-gold-700' : '')}</div>
      <table class="tbl"><thead><tr>${(st ? ['Roll', 'Name', "Father's name", 'Class', 'Session'] : ['Name', 'Phone', 'Qualification', 'Joined', 'Salary']).map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${p.sample.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || emptyRow(5, 'No valid rows.')}</tbody></table>
      ${p.valid > 8 ? `<p class="mt-2 text-xs text-teal-600">Showing the first 8 of ${p.valid} rows.</p>` : ''}${errs(p.errors)}
      <div class="mt-5 flex justify-end"><button data-act="impRun" class="btn-gold" ${p.valid ? '' : 'disabled'}>Import ${p.valid} ${st ? 'student' : 'teacher'}${p.valid === 1 ? '' : 's'}</button></div>`;
  } else {
    pane.innerHTML = '<div class="grid h-full min-h-[14rem] place-items-center text-center text-teal-700"><div><div class="font-display text-xl font-bold text-emerald-900">No file chosen yet</div><p class="mt-1 text-sm">Download the template, fill it in, then choose the file.</p></div></div>';
  }
}
const impMethod = () => (S.imp.kind === 'teachers' ? 'importTeachers' : 'importStudents');
actions.impKind = el => { S.imp = { kind: el.dataset.tab, file: '', rows: null, preview: null, result: null }; return go('import'); };
actions.impReset = () => { Object.assign(S.imp, { file: '', rows: null, preview: null, result: null }); drawImport(); };
actions.impTemplate = async () => { if (await rpc('importTemplate', S.imp.kind, S.section)) toast('Template saved'); };
actions.impChoose = async () => {
  const f = await rpc('importFile');
  if (!f) return;
  Object.assign(S.imp, { file: f.name, rows: f.rows, result: null, preview: await db(impMethod(), S.section, f.rows, true) });
  drawImport();
};
actions.impRun = async () => {
  const I = S.imp;
  if (!confirm(`Import ${I.preview.valid} record${I.preview.valid === 1 ? '' : 's'} into the ${SECTIONS[S.section]}?`)) return;
  I.result = await db(impMethod(), S.section, I.rows, false);
  I.preview = null; I.rows = null;
  toast(`${I.result.added} imported`);
  drawImport();
};

/* ----- Settings: academic sessions and automatic pass-out ----- */
forms.sessionSave = async (f, d) => { await db('saveSession', d); await loadSettings(); toast('Session saved'); await drawSettingsPane(); };
actions.sessionDelete = async el => { if (!confirm(`Remove session ${el.dataset.name}?`)) return; await db('deleteSession', el.dataset.name); await loadSettings(); await drawSettingsPane(); };
changes.autoGrad = async el => { await db('setAutoGraduate', el.checked); await loadSettings(); toast(el.checked ? 'Automatic pass-out is on' : 'Automatic pass-out is off'); };
changes.autoPromote = async el => { await db('setAutoPromote', el.checked); await loadSettings(); toast(el.checked ? 'Automatic promotion is on' : 'Automatic promotion is off'); };


/* ==========================================================================
   Student documents: every student by ID and name, with upload, view, save and delete
   ========================================================================== */
const fmtSize = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
S.docs = { q: '', classId: '', students: [], summary: new Map() };
VIEWS.documents = async v => {
  v.innerHTML = pageTitle('Student documents', "Upload, store and view each student's images, PDFs and scanned files") + `
    <div id="docStats" class="mb-5 grid grid-cols-4 gap-4"></div>
    <div class="card mb-5"><div class="grid grid-cols-3 gap-4">
      <div class="col-span-2"><label class="label">Find a student</label><input class="field" data-input="docSearch" placeholder="Student ID, roll number, name or father's name" value="${esc(S.docs.q)}" autocomplete="off"></div>
      <div><label class="label">Class</label><select class="field" data-change="docClass"><option value="">All classes</option>${classOptions(S.docs.classId)}</select></div></div></div>
    <div class="card"><div class="sticky-wrap" id="docTable"></div></div>`;
  await loadDocs();
};
async function loadDocs() {
  const [students, summary] = await Promise.all([db('getStudents', S.section), db('getDocumentSummary', S.section)]);
  S.docs.students = students;
  S.docs.summary = new Map(summary.map(r => [r.student_id, r]));
  drawDocs();
}
function drawDocs() {
  if (!$('#docTable')) return;
  const D = S.docs, q = D.q.trim().toLowerCase();
  const rows = D.students.filter(s => (!D.classId || String(s.class_id) === String(D.classId))
    && (!q || String(s.id) === q || [s.roll_no, s.name, s.father_name].some(x => String(x || '').toLowerCase().includes(q))));
  const sums = [...D.summary.values()];
  $('#docStats').innerHTML = statBox('Students', D.students.length) + statBox('With files', sums.length) + statBox('Files stored', sums.reduce((t, r) => t + r.n, 0)) + statBox('Space used', fmtSize(sums.reduce((t, r) => t + (r.bytes || 0), 0)));
  $('#docTable').innerHTML = `<table class="tbl whitespace-nowrap"><thead><tr><th>ID</th><th>Roll</th><th>Name</th><th>Father</th><th>Class</th><th class="num">Files</th><th></th></tr></thead><tbody>
    ${rows.map(s => { const r = D.summary.get(s.id); return `<tr><td class="font-semibold tabular-nums">${s.id}</td><td>${esc(s.roll_no)}</td>
      <td class="font-semibold">${esc(s.name)}${s.status !== 'Active' ? ` <span class="badge badge-warn">${esc(s.status)}</span>` : ''}</td><td>${esc(s.father_name)}</td>
      <td>${esc(s.class_name)}<div class="text-xs text-teal-600">${esc(s.stream)}</div></td><td class="num">${r ? `${r.n} <span class="text-xs text-teal-600">(${fmtSize(r.bytes || 0)})</span>` : '<span class="text-emerald-900/35">-</span>'}</td>
      <td class="text-right"><button data-act="docUpload" data-id="${s.id}" class="btn-gold !px-3 !py-1.5">Upload</button>
        <button data-act="docFiles" data-id="${s.id}" class="btn-ghost !px-3 !py-1.5">View files${r ? ` (${r.n})` : ''}</button></td></tr>`; }).join('') || emptyRow(7, 'No students match.')}
    </tbody></table>`;
}
inputs.docSearch = debounce(el => { S.docs.q = el.value; drawDocs(); }, 180);
changes.docClass = el => { S.docs.classId = el.value; drawDocs(); };

async function uploadDocs(studentId) {
  const r = await rpc('uploadStudentDocs', studentId);
  if (!r) return null;                                   // the file chooser was closed
  if (r.added) toast(`${r.added} file${r.added > 1 ? 's' : ''} uploaded`);
  await loadDocs();
  if (r.errors.length) openModal('Some files were not uploaded', `<p class="mb-3 text-sm text-teal-700">${r.added} uploaded, ${r.errors.length} skipped:</p>
    <ul class="list-disc space-y-1 pl-5 text-sm">${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
    <div class="mt-5 flex justify-end"><button data-act="docFiles" data-id="${studentId}" class="btn-primary">View files</button></div>`);
  return r;
}
async function openDocFiles(id) {
  const s = S.docs.students.find(x => x.id === id) || await db('getStudent', id);
  const list = await db('getStudentDocuments', id);
  const kind = m => (m === 'application/pdf' ? 'PDF' : m === 'image/tiff' ? 'Scan (TIFF)' : 'Image');
  openModal(`Documents: ${esc(s.name)}`, `
    <div class="mb-4 flex items-center justify-between gap-3"><p class="text-sm text-teal-700">ID ${s.id}, roll ${esc(s.roll_no)}, ${esc(s.class_name || '')}</p><button data-act="docUpload" data-id="${id}" class="btn-gold">Upload files</button></div>
    <table class="tbl"><thead><tr><th>File</th><th>Type</th><th class="num">Size</th><th>Uploaded</th><th></th></tr></thead><tbody>
      ${list.map(d => `<tr><td class="break-all font-semibold">${esc(d.original_name)}</td><td>${kind(d.mime)}</td><td class="num">${fmtSize(d.size)}</td><td class="whitespace-nowrap">${dateBoth(String(d.uploaded_at).slice(0, 10))}</td>
        <td class="whitespace-nowrap text-right"><button data-act="docView" data-id="${d.id}" data-student="${id}" class="btn-primary !px-3 !py-1.5">View</button>
          <button data-act="docSave" data-id="${d.id}" class="btn-ghost !px-3 !py-1.5">Save copy</button>
          <button data-act="docDelete" data-id="${d.id}" data-student="${id}" class="btn-danger !px-3 !py-1.5">Delete</button></td></tr>`).join('') || emptyRow(5, 'No files yet. Use Upload files to add images, PDFs or scans.')}
    </tbody></table><p class="mt-3 text-xs text-teal-600">Images, PDFs and scanned files, up to 15 MB each and 40 files per student. PDFs and TIFF scans open in your computer's own viewer.</p>`, 'xl');
}
actions.docUpload = async el => { const id = Number(el.dataset.id), r = await uploadDocs(id); if (r && r.added && !r.errors.length) await openDocFiles(id); };
actions.docFiles = el => openDocFiles(Number(el.dataset.id));
actions.docView = async el => {
  const r = await rpc('viewStudentDocument', Number(el.dataset.id));
  if (r.kind === 'opened') { toast(`${r.name} opened in your viewer`); return; }
  openModal(esc(r.name), `<img src="${r.data}" alt="${esc(r.name)}" class="mx-auto max-h-[68vh] rounded-xl border border-gold-300/60 bg-white">
    <div class="mt-4 flex justify-between"><button data-act="docFiles" data-id="${el.dataset.student}" class="btn-ghost">Back to files</button><button data-act="docSave" data-id="${el.dataset.id}" class="btn-ghost">Save copy</button></div>`, true);
};
actions.docSave = async el => { if (await rpc('saveStudentDocument', Number(el.dataset.id))) toast('Copy saved'); };
actions.docDelete = async el => {
  if (!confirm('Delete this file permanently?')) return;
  await db('deleteStudentDocument', Number(el.dataset.id));
  toast('File deleted');
  await loadDocs();
  await openDocFiles(Number(el.dataset.student));
};


/* ==========================================================================
   Light / dark switch
   ========================================================================== */
Object.assign(ICONS, {
  themeSun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  themeMoon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'
});
const themeToggle = () => `<button type="button" class="theme-toggle" data-act="toggleTheme" role="switch" aria-checked="${Theme.get() === 'dark'}" aria-label="Dark mode" title="Switch between light and dark mode"><span class="knob">${ico('themeSun', 'h-4 w-4 sun')}${ico('themeMoon', 'h-4 w-4 moon')}</span></button>`;
actions.toggleTheme = () => {
  Theme.toggle();
  document.querySelectorAll('.theme-toggle').forEach(b => b.setAttribute('aria-checked', String(Theme.get() === 'dark')));
};

/* ==========================================================================
   Holidays and leave: custom off-days per month (Fridays are always off)
   ========================================================================== */
S.hol = { month: '', rows: [] };
VIEWS.holidays = async v => {
  if (!S.hol.month) S.hol.month = curMonth();
  v.innerHTML = pageTitle('Holidays and leave', 'Fridays are always off. Add custom holidays here: attendance is not taken on them and they are not counted as working days.') + `
    <div class="grid grid-cols-3 gap-6">
      <div class="card col-span-2"><div class="mb-4 flex flex-wrap items-end justify-between gap-4">${monthPick(S.hol.month, 'holMonth')}<div class="text-right text-sm font-semibold text-teal-700" id="holTitle"></div></div>
        <div id="holCal"></div><p class="mt-3 text-xs text-teal-600">Click a day to start a holiday on it, or click a gold day to remove it. Small numbers are the Hijri dates.</p></div>
      <div class="grid h-fit gap-5">
        <form data-form="holidaySave" class="card"><h3 class="mb-3 font-display text-lg font-bold">Add a holiday or leave</h3>
          <div class="grid gap-3">${fld('Name (Eid break, exams, ...)', 'name', '', { required: true })}
            <div class="grid grid-cols-2 gap-3">${fld('First day', 'from', S.hol.month + '-01', { type: 'date', required: true })}${fld('Last day (optional)', 'to', '', { type: 'date' })}</div>
            <label class="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="both"> Apply to both sections</label>
            <button class="btn-gold">Save holiday</button></div></form>
        <div class="card"><h3 class="mb-3 font-display text-lg font-bold">This month</h3><div id="holList"></div></div>
        <div class="card"><h3 class="mb-2 font-display text-lg font-bold">Teacher leave</h3>
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-change="leavePaid" ${S.settings.leavePaid ? 'checked' : ''}><span><b>Approved leave is paid.</b> Days marked Leave are not deducted from a teacher's salary. Turn this off to treat leave like an absence.</span></label></div>
      </div></div>`;
  await loadHolidays();
};
async function loadHolidays() { S.hol.rows = await db('getHolidays', S.section, S.hol.month); drawHolidays(); }
function drawHolidays() {
  const [y, mo] = S.hol.month.split('-').map(Number), first = new Date(y, mo - 1, 1).getDay(), dim = new Date(y, mo, 0).getDate();
  const names = new Map(S.hol.rows.map(h => [h.date, h.name])), today = ymd(new Date()), showHijri = layoutOf().hijri;
  $('#holTitle').textContent = monthLabel(S.hol.month);
  const cells = Array.from({ length: first }, () => '<div class="cal-cell blank"></div>');
  for (let d = 1; d <= dim; d++) {
    const ds = `${S.hol.month}-${pad(d)}`, fri = new Date(y, mo - 1, d).getDay() === 5, name = names.get(ds), h = showHijri ? hijriDate(isoDay(ds)) : null;
    cells.push(`<button type="button" class="cal-cell ${fri ? 'fri' : ''} ${name ? 'hol' : ''} ${ds === today ? 'now' : ''}" data-act="holPick" data-date="${ds}" ${fri ? 'disabled' : ''} title="${esc(dateText(ds))}">
      <div class="g">${d}</div>${h ? `<div class="h">${esc(h.day === '1' ? `${h.day} ${h.month}` : h.day)}</div>` : ''}${name ? `<div class="n">${esc(name)}</div>` : fri ? '<div class="n opacity-60">Friday</div>' : ''}</button>`);
  }
  $('#holCal').innerHTML = `<div class="cal">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(n => `<div class="cal-head">${n}</div>`).join('')}${cells.join('')}</div>`;
  $('#holList').innerHTML = S.hol.rows.length ? `<table class="tbl"><tbody>${S.hol.rows.map(h => `<tr><td><div class="font-semibold">${esc(h.name)}</div><div class="text-xs text-teal-600">${dateText(h.date)}</div></td><td class="text-right"><button data-act="holDelete" data-date="${h.date}" class="btn-danger !px-2 !py-1 text-xs">Remove</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="text-sm text-teal-700">No custom holidays this month.</p>';
}
changes.holMonth = el => { if (!el.value) return; S.hol.month = el.value; return VIEWS.holidays($('#view').firstChild); };
actions.holPick = async el => {
  const ds = el.dataset.date, name = S.hol.rows.find(h => h.date === ds);
  if (name) { if (confirm(`Remove the holiday "${name.name}" on ${ds}?`)) { await db('deleteHoliday', S.section, ds); toast('Holiday removed'); await loadHolidays(); } return; }
  const f = document.querySelector('form[data-form=holidaySave]');
  f.from.value = ds; f.to.value = ''; refreshDateHints(); f.name.focus();
};
actions.holDelete = async el => { await db('deleteHoliday', S.section, el.dataset.date); toast('Holiday removed'); await loadHolidays(); };
forms.holidaySave = async (f, d) => {
  const n = await db('saveHoliday', { section: S.section, name: d.name, from: d.from, to: d.to, both: d.both === 'on' });
  toast(n ? `${n} day${n > 1 ? 's' : ''} saved as holiday` : 'Those days are Fridays, which are already off');
  f.name.value = '';
  await loadHolidays();
};
changes.leavePaid = async el => { await db('setLeavePaid', el.checked); await loadSettings(); toast(el.checked ? 'Approved leave is paid' : 'Leave now counts as an absence for salary'); };

/* ==========================================================================
   Student report: hostel and funds
   ========================================================================== */
function hostelFundsCard(r) {
  if (!r.hostel || !r.funds) return '';                       // teachers never see money held or owed
  const h = r.hostel, f = r.funds;
  const sched = rows => rows.length > 1 ? rows.map(x => `${money(x.fee)} ${x.effective_month === '0000-00' ? 'from admission' : `from ${monthLabel(x.effective_month)}`}`).join(' &rarr; ') : '';
  const hostel = h.resident ? `
    <div class="mb-3 flex flex-wrap items-center gap-2"><span class="badge ${h.status === 'Active' ? 'badge-ok' : 'badge-warn'}">${h.status === 'Active' ? 'Hostel resident' : 'Former hostel resident'}</span>
      <span class="text-sm text-teal-700">Room ${esc(h.room || '-')}, joined ${dateText(h.joined_on)}${h.left_on ? `, left ${dateText(h.left_on)}` : ''}</span></div>
    <div class="grid grid-cols-2 gap-3">${miniBox('Hostel fee, monthly', money(h.fee))}${miniBox('Previous dues', money(h.previous))}${miniBox(`Due, ${esc(monthLabel(h.month))}`, money(Math.max(h.due - h.paid, 0)))}${miniBox('Hostel balance owed', money(h.payable), h.payable > 0 ? 'neg' : 'pos')}</div>
    ${sched(h.schedule) ? `<p class="mt-2 text-xs text-teal-600">Fee schedule: ${sched(h.schedule)}</p>` : ''}`
    : '<span class="badge badge-warn">Not a hostel resident</span><p class="mt-2 text-sm text-teal-700">This student has no hostel record.</p>';
  const funds = f.entries ? `<div class="grid grid-cols-3 gap-3">${miniBox('Contributions', money(f.deposited))}${miniBox('Withdrawn', money(f.withdrawn))}${miniBox('Fund balance', money(f.balance), 'pos')}</div>
    <table class="tbl mt-3"><thead><tr><th>Date</th><th>Type</th><th class="num">Amount</th></tr></thead><tbody>${f.recent.map(e => `<tr><td>${dateBoth(e.date)}</td><td>${e.type === 'deposit' ? 'Contribution' : 'Withdrawal'}${e.note ? `<div class="text-xs text-teal-600">${esc(e.note)}</div>` : ''}</td><td class="num">${money(e.amount)}</td></tr>`).join('')}</tbody></table>`
    : '<span class="badge badge-warn">No fund contributions</span><p class="mt-2 text-sm text-teal-700">Nothing is held for this student.</p>';
  return `<div class="mb-5 grid grid-cols-2 gap-5"><div class="card"><h3 class="mb-3 font-display text-lg font-bold">Hostel</h3>${hostel}</div><div class="card"><h3 class="mb-3 font-display text-lg font-bold">Student fund</h3>${funds}</div></div>`;
}

/* ==========================================================================
   Fee changes apply to future months only
   ========================================================================== */
const shiftMonth = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5) - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const feeEffectiveBox = () => `<div class="mt-4 rounded-2xl bg-white/50 p-4"><div class="text-sm font-semibold text-emerald-800">If you change the monthly fee</div>
  <p class="my-2 text-xs text-teal-700">The new amount applies from the month you choose onwards: next month at the earliest, and any later month or year. Past and current months keep the fee they already had, and nothing is recalculated. Unpaid balances still carry forward.</p>
  <div class="max-w-xs"><label class="label">New fee applies from</label><input class="field" type="month" name="fee_effective" min="${shiftMonth(curMonth(), 1)}" value="${shiftMonth(curMonth(), 1)}"></div></div>`;

/* ==========================================================================
   Sessions on classes: assign one session to every active student of a class
   ========================================================================== */
const classesView = VIEWS.classes;
VIEWS.classes = async v => {
  await classesView(v);
  const sess = S.settings.sessions || [];
  v.insertAdjacentHTML('beforeend', `<form data-form="classSession" class="card mt-6"><h3 class="mb-1 font-display text-lg font-bold">Assign a session to a class</h3>
    <p class="mb-4 text-sm text-teal-700">Give every active student of a class the same session, for example an 8-year Dars-e-Nizami course. When each session year finishes, the students move up one class automatically. Create sessions in Settings.</p>
    <div class="grid grid-cols-4 items-end gap-4"><div class="col-span-1"><label class="label">Class</label><select name="class_id" class="field" required><option value="">Choose a class</option>${S.classes.map(c => `<option value="${c.id}">${esc(c.stream)}: ${esc(c.name)}</option>`).join('')}</select></div>
      <div class="col-span-2"><label class="label">Session</label><select name="session" class="field"><option value="">No session (remove)</option>${sess.map(x => `<option value="${esc(x.name)}">${esc(x.name)}${x.years > 1 ? ` (${x.years}-year course)` : ''}${x.stream ? ` - ${esc(x.stream)}` : ''}</option>`).join('')}</select></div>
      <button class="btn-gold">Assign</button></div></form>`);
};
forms.classSession = async (f, d) => { const n = await db('assignSessionToClass', Number(d.class_id), d.session); toast(`${n} student${n === 1 ? '' : 's'} updated`); await go('classes'); };

/* ==========================================================================
   Grading: a named scale of your own for a stream (Dars-e-Nizami and others)
   ========================================================================== */
const SCALE_PRESETS = {
  'Dars-e-Nizami': { rows: [{ name: 'ممتاز', min: 80 }, { name: 'جید جدا', min: 70 }, { name: 'جید', min: 60 }, { name: 'مقبول', min: 40 }], fail: 'راسب', pass: 40 },
  _: { rows: [{ name: 'Excellent', min: 80 }, { name: 'Very good', min: 70 }, { name: 'Good', min: 60 }, { name: 'Pass', min: 40 }], fail: 'Fail', pass: 40 }
};
const scaleSummary = sc => `${sc.grades.map(x => `${esc(x.name)} ${x.min}%+`).join(' &middot; ')} &middot; ${esc(sc.fail)} below ${sc.pass}%`;
function scaleCard(g, scope) {
  const head = '<h3 class="mb-1 font-display text-lg font-bold">Custom grading scale</h3>';
  if (scope === 'all') return `<div class="card mt-6">${head}<p class="text-sm text-teal-700">Choose a stream above (for example Dars-e-Nizami) to give it its own named grades with your own cut-offs, such as ممتاز, جید جدا, جید and مقبول.</p></div>`;
  const saved = (g.scales || {})[scope], draft = S.scaleDraft && S.scaleDraft.scope === scope ? S.scaleDraft : null;
  const src = draft || (saved ? { rows: saved.grades, fail: saved.fail, pass: saved.pass } : null);
  if (!src) return `<div class="card mt-6">${head}<p class="mb-4 text-sm text-teal-700">${esc(scope)} uses the standard grades above. You can give it a scale of its own instead, with any number of named grades.</p>
    <div class="flex flex-wrap gap-3"><button data-act="scaleStart" class="btn-gold">Create a scale for ${esc(scope)}</button></div></div>`;
  return `<form data-form="scaleSave" class="card mt-6">${head}<p class="mb-4 text-sm text-teal-700">Name each grade and set the lowest percentage that earns it, from the top grade down. Below the pass mark a student gets the fail name. This scale replaces the standard grades for ${esc(scope)} everywhere: result cards, class results and reports.</p>
    <table class="tbl mb-3"><thead><tr><th>Grade name</th><th class="num" style="width:150px">From (%)</th><th style="width:70px"></th></tr></thead><tbody id="scaleRows">
      ${src.rows.map((x, i) => `<tr><td><input class="field" dir="auto" maxlength="20" data-scale="name" value="${esc(x.name)}" placeholder="Grade name"></td><td><input class="field text-right" type="number" min="0" max="100" step="any" data-scale="min" value="${esc(x.min)}"></td>
        <td class="text-right"><button type="button" data-act="scaleRemoveRow" data-i="${i}" class="btn-danger !px-2 !py-1 text-xs" ${src.rows.length < 2 ? 'disabled' : ''}>Remove</button></td></tr>`).join('')}</tbody></table>
    <div class="mb-4 grid grid-cols-3 items-end gap-4"><div><label class="label">Pass mark (%)</label><input class="field" type="number" min="0" max="100" step="any" data-scale="pass" value="${esc(src.pass)}"></div>
      <div><label class="label">Name below the pass mark</label><input class="field" dir="auto" maxlength="20" data-scale="fail" value="${esc(src.fail)}"></div><button type="button" data-act="scaleAdd" class="btn-ghost" ${src.rows.length >= 10 ? 'disabled' : ''}>Add a grade</button></div>
    <div class="flex flex-wrap justify-end gap-3">${saved ? '<button type="button" data-act="scaleDelete" class="btn-danger">Use the standard grades</button>' : ''}${draft ? '<button type="button" data-act="scaleCancel" class="btn-ghost">Cancel</button>' : ''}<button class="btn-gold">Save scale</button></div></form>`;
}
function scaleRead() {
  const names = [...document.querySelectorAll('[data-scale=name]')], mins = [...document.querySelectorAll('[data-scale=min]')];
  return { rows: names.map((n, i) => ({ name: n.value, min: mins[i].value })), pass: $('[data-scale=pass]').value, fail: $('[data-scale=fail]').value };
}
const scaleScope = () => S.gradeScope || 'all';
const scaleRedraw = () => drawSettingsPane();
actions.scaleStart = () => { const p = SCALE_PRESETS[scaleScope()] || SCALE_PRESETS._; S.scaleDraft = { scope: scaleScope(), rows: p.rows.map(x => ({ ...x })), fail: p.fail, pass: p.pass }; return scaleRedraw(); };
actions.scaleAdd = () => { const d = { scope: scaleScope(), ...scaleRead() }; d.rows.push({ name: '', min: '' }); S.scaleDraft = d; return scaleRedraw(); };
actions.scaleRemoveRow = el => { const d = { scope: scaleScope(), ...scaleRead() }; d.rows.splice(Number(el.dataset.i), 1); S.scaleDraft = d; return scaleRedraw(); };
actions.scaleCancel = () => { S.scaleDraft = null; return scaleRedraw(); };
actions.scaleDelete = async () => { if (!confirm(`Go back to the standard grades for ${scaleScope()}?`)) return; await db('saveGradeScale', scaleScope(), null); S.scaleDraft = null; await loadSettings(); toast('Standard grades restored'); await scaleRedraw(); };
forms.scaleSave = async () => { await db('saveGradeScale', scaleScope(), { grades: scaleRead().rows, fail: scaleRead().fail, pass: scaleRead().pass }); S.scaleDraft = null; await loadSettings(); toast('Grading scale saved'); await scaleRedraw(); };


/* ==========================================================================
   Dual calendar: every date field shows its Hijri date, and its picker shows both calendars
   ========================================================================== */
const DD = { input: null, month: '' };
const ddPop = () => document.getElementById('ddPop');
function ddClose() { const p = ddPop(); if (p) p.remove(); DD.input = null; }
function ddDraw() {
  const inp = DD.input, old = ddPop();
  if (!inp) return;
  const [y, mo] = DD.month.split('-').map(Number), first = new Date(y, mo - 1, 1).getDay(), dim = new Date(y, mo, 0).getDate();
  const min = inp.getAttribute('min') || '', max = inp.getAttribute('max') || '', today = ymd(new Date()), showH = layoutOf().hijri;
  const cells = Array.from({ length: first }, () => '<span class="dd-cell blank"></span>');
  for (let d = 1; d <= dim; d++) {
    const ds = `${DD.month}-${pad(d)}`, h = showH ? hijriDate(isoDay(ds)) : null, off = (min && ds < min) || (max && ds > max);
    cells.push(`<button type="button" class="dd-cell ${new Date(y, mo - 1, d).getDay() === 5 ? 'fri' : ''} ${ds === inp.value ? 'sel' : ''} ${ds === today ? 'now' : ''}" data-act="ddPick" data-date="${ds}" ${off ? 'disabled' : ''} title="${esc(dateText(ds))}"><span class="g">${d}</span>${h ? `<span class="h">${esc(h.day === '1' ? h.month.slice(0, 6) : h.day)}</span>` : ''}</button>`);
  }
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-GB', { month: 'long' })), cy = new Date().getFullYear();
  const years = Array.from({ length: 56 }, (_, i) => cy - 40 + i);
  const html = `<div class="dd-head"><button type="button" class="dd-nav" data-act="ddPrev" aria-label="Previous month">&lsaquo;</button>
      <div class="dd-title"><div class="flex justify-center gap-1"><select class="dd-sel" data-change="ddMonth" aria-label="Month">${months.map((m, i) => `<option value="${i + 1}" ${i + 1 === mo ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <select class="dd-sel" data-change="ddYear" aria-label="Year">${years.map(v => `<option ${v === y ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="dd-sub">${showH ? esc(hijriMonthSpan(DD.month)) : ''}</div></div>
      <button type="button" class="dd-nav" data-act="ddNext" aria-label="Next month">&rsaquo;</button></div>
    <div class="dd-grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(n => `<div class="dd-dow">${n}</div>`).join('')}${cells.join('')}</div>
    <div class="dd-foot"><button type="button" class="btn-ghost !px-3 !py-1.5" data-act="ddToday">Today</button>${inp.required ? '' : '<button type="button" class="btn-ghost !px-3 !py-1.5" data-act="ddClear">Clear</button>'}<button type="button" class="btn-ghost !px-3 !py-1.5" data-act="ddClose">Close</button></div>`;
  let pop = old;
  if (!pop) { pop = document.createElement('div'); pop.id = 'ddPop'; pop.className = 'dd-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choose a date'); document.body.appendChild(pop); }
  pop.innerHTML = html;
  const r = inp.getBoundingClientRect(), h = pop.offsetHeight, w = pop.offsetWidth;                // below the field, or above it when there is no room
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  pop.style.top = `${r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
}
function ddOpen(inp) {
  if (DD.input === inp) return;
  DD.input = inp;
  DD.month = /^\d{4}-\d{2}/.test(inp.value) ? inp.value.slice(0, 7) : (inp.getAttribute('max') && inp.getAttribute('max') < ymd(new Date()) ? inp.getAttribute('max').slice(0, 7) : curMonth());
  ddDraw();
}
const ddSet = value => { const inp = DD.input; if (!inp) return; inp.value = value; ['input', 'change'].forEach(t => inp.dispatchEvent(new Event(t, { bubbles: true }))); refreshDateHints(); ddClose(); };
actions.ddPick = el => ddSet(el.dataset.date);
actions.ddToday = () => ddSet(ymd(new Date()));
actions.ddClear = () => ddSet('');
actions.ddClose = ddClose;
actions.ddPrev = () => { DD.month = shiftMonth(DD.month, -1); ddDraw(); };
actions.ddNext = () => { DD.month = shiftMonth(DD.month, 1); ddDraw(); };
changes.ddMonth = el => { DD.month = `${DD.month.slice(0, 4)}-${pad(el.value)}`; ddDraw(); };
changes.ddYear = el => { DD.month = `${el.value}-${DD.month.slice(5)}`; ddDraw(); };
/** Turns every date box into a read-only box that opens the dual picker, and adds the Hijri line under date and month boxes. */
function decorateDates() {
  document.querySelectorAll('input[type=date]:not([data-dd])').forEach(inp => {
    inp.dataset.dd = '1'; inp.type = 'text'; inp.readOnly = true; inp.autocomplete = 'off'; inp.classList.add('dual-date'); if (!inp.placeholder) inp.placeholder = 'Choose a date';
    inp.insertAdjacentHTML('afterend', '<div class="dd-hint"></div>');
  });
  document.querySelectorAll('input[type=month]:not([data-dd])').forEach(inp => { inp.dataset.dd = '1'; inp.insertAdjacentHTML('afterend', '<div class="dd-hint"></div>'); });
  refreshDateHints();
}
function refreshDateHints() {
  document.querySelectorAll('input[data-dd]').forEach(inp => {
    const hint = inp.nextElementSibling;
    if (hint && hint.classList.contains('dd-hint')) hint.textContent = !inp.value || !layoutOf().hijri ? '' : inp.dataset.dd && inp.classList.contains('dual-date') ? hijriOf(inp.value) : hijriMonthSpan(inp.value);
  });
}
document.addEventListener('click', e => {
  const path = e.composedPath();                                   // the path at dispatch time: a button the picker has just re-drawn is already detached from the page
  const box = path.find(n => n.matches && n.matches('input.dual-date'));
  if (box) ddOpen(box); else if (DD.input && !path.some(n => n.id === 'ddPop')) ddClose();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && DD.input) ddClose(); else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('input.dual-date')) { e.preventDefault(); ddOpen(e.target); } });
['input', 'change'].forEach(t => document.addEventListener(t, () => setTimeout(refreshDateHints, 0)));
let ddTimer = null;
new MutationObserver(() => { clearTimeout(ddTimer); ddTimer = setTimeout(decorateDates, 25); }).observe(document.body, { childList: true, subtree: true });

/* ==========================================================================
   Students page: the Session dropdown in the table, and the admission-year filter with counts
   ========================================================================== */
const admYear = s => String(s.admission_date || s.admitted_on || '').slice(0, 4);
const yearCounts = () => [...S.students.reduce((m, s) => m.set(admYear(s), (m.get(admYear(s)) || 0) + 1), new Map())].filter(([y]) => y).sort((a, b) => b[0].localeCompare(a[0]));
const yearOptions = () => `<option value="">All admission years</option>${yearCounts().map(([y, n]) => `<option value="${y}" ${S.filter.year === y ? 'selected' : ''}>${y} (${n})</option>`).join('')}`;
function drawStudentYears() {
  const box = $('#stuYears'); if (!box) return;
  const years = yearCounts(), pick = S.filter.year, inYear = S.students.filter(s => !pick || admYear(s) === pick);
  const perClass = S.classes.map(c => [c, inYear.filter(s => s.class_id === c.id).length]).filter(([, n]) => n > 0);
  box.innerHTML = `<div class="mb-4 grid grid-cols-2 gap-5 rounded-2xl bg-white/40 p-4">
    <div><h4 class="mb-2 text-sm font-semibold">Students by admission year <span class="font-normal text-teal-600">(click a year to filter)</span></h4><div class="flex flex-wrap gap-2">
      ${years.map(([y, n]) => `<button type="button" data-act="stuYearPick" data-year="${y}" class="badge ${pick === y ? 'badge-warn' : 'badge-ok'}">${y}: ${n}</button>`).join('') || '<span class="text-sm text-teal-600">No students yet.</span>'}</div></div>
    <div><h4 class="mb-2 text-sm font-semibold">${pick ? `Admitted in ${pick}, by class` : 'All years, by class'} <span class="font-normal text-teal-600">(${inYear.length} students, all statuses)</span></h4><div class="flex flex-wrap gap-2">
      ${perClass.map(([c, n]) => `<span class="badge badge-ok" title="${esc(c.stream)}">${esc(c.name)}: ${n}</span>`).join('') || '<span class="text-sm text-teal-600">No students.</span>'}</div></div></div>`;
}
changes.stuYear = el => { S.filter.year = el.value; drawStudents(); };
actions.stuYearPick = el => { S.filter.year = S.filter.year === el.dataset.year ? '' : el.dataset.year; const sel = $('[data-change=stuYear]'); if (sel) sel.value = S.filter.year; drawStudents(); };

/* ==========================================================================
   Fee ledger: what applies from when, month by month, and cancelling a change that has not started
   ========================================================================== */
/** Fee changes (with Cancel for one that has not started) and the month-by-month table with the balance carried forward. */
function feeLedgerBlock(kind, id, sch, rows, opening) {
  let acc = opening || 0;
  const lines = rows.map(m => { const bf = acc; acc = Math.round((acc + m.owed) * 100) / 100; return { ...m, bf, out: acc }; }).reverse();      // oldest first to carry the balance, newest shown first
  const dated = rows.some(m => 'paid_on' in m);
  const stateBadge = z => (z.state === 'scheduled' ? '<span class="badge badge-warn">Scheduled</span>' : z.state === 'current' ? '<span class="badge badge-ok">In force now</span>' : '<span class="badge">Past</span>');
  return `<h4 class="mb-2 font-semibold">Fee changes</h4>
    <table class="tbl mb-5"><thead><tr><th>Applies from</th><th class="num">Monthly fee</th><th>Status</th><th></th></tr></thead><tbody>
      ${sch.map(z => `<tr><td>${z.effective_month === '0000-00' ? 'The start (admission)' : monthBoth(z.effective_month)}</td><td class="num font-semibold">${money(z.fee)}</td><td>${stateBadge(z)}</td>
        <td class="text-right">${z.state === 'scheduled' && S.role === 'admin' ? `<button type="button" data-act="feeCancel" data-kind="${kind}" data-id="${id}" data-month="${z.effective_month}" class="btn-danger !px-2 !py-1 text-xs">Cancel this change</button>` : ''}</td></tr>`).join('') || emptyRow(4, 'No fee recorded.')}</tbody></table>
    <h4 class="mb-2 font-semibold">Month by month</h4>
    <div class="mb-5 max-h-72 overflow-auto"><table class="tbl"><thead><tr><th>Month</th><th class="num">Brought forward</th><th class="num">Fee</th><th class="num">Paid</th>${dated ? '<th>Paid on</th>' : ''}<th class="num">Owed</th><th class="num">Total outstanding</th></tr></thead><tbody>
      ${opening > 0 ? `<tr><td colspan="${dated ? 6 : 5}" class="font-semibold">Brought forward from before this system</td><td class="num">${money(opening)}</td></tr>` : ''}
      ${lines.map(m => `<tr><td class="whitespace-nowrap">${monthBoth(m.month)}</td><td class="num">${money(m.bf)}</td><td class="num">${money(m.due)}</td><td class="num">${money(m.paid)}</td>${dated ? `<td class="whitespace-nowrap">${dateBoth(m.paid_on)}</td>` : ''}<td class="num ${m.owed > 0 ? 'neg font-semibold' : ''}">${money(m.owed)}</td><td class="num font-bold">${money(m.out)}</td></tr>`).join('') || emptyRow(dated ? 7 : 6, 'No months billed yet.')}</tbody></table></div>`;
}
async function openFeeLedger(kind, id) {
  const hostel = kind === 'hostel';
  const [sch, led] = await Promise.all([db('getFeeSchedule', kind, id), hostel ? db('getHostelLedger', id) : db('getFeeAccount', id, curMonth())]);
  openModal(`Fee ledger: ${esc(hostel ? led.resident.name : led.student.name)}`, `
    <p class="mb-4 text-sm text-teal-700">${hostel ? 'Hostel fee' : 'Monthly fee'}. A new fee starts in a later month only: months before it keep the fee they already had, and unpaid balances carry forward from month to month.</p>
    ${feeLedgerBlock(kind, id, sch, hostel ? led.months.map(m => ({ ...m, owed: m.balance })).reverse() : led.months, hostel ? 0 : led.opening)}
    ${hostel ? `<h4 class="mb-2 font-semibold">Payments received</h4><table class="tbl"><thead><tr><th>Date</th><th class="num">Amount</th><th>Note</th></tr></thead><tbody>
      ${led.payments.map(q => `<tr><td>${dateBoth(q.paid_on)}</td><td class="num">${money(q.amount)}</td><td>${esc(q.note)}</td></tr>`).join('') || emptyRow(3, 'No payments yet.')}</tbody></table>` : ''}`, true);
}
actions.feeLedger = el => openFeeLedger(el.dataset.kind, Number(el.dataset.id));
actions.feeCancel = async el => {
  if (!confirm(`Cancel the fee change that starts in ${monthLabel(el.dataset.month)}?`)) return;
  await db('cancelFeeChange', el.dataset.kind, Number(el.dataset.id), el.dataset.month);
  toast('Fee change cancelled');
  await openFeeLedger(el.dataset.kind, Number(el.dataset.id));
  if (S.tab === 'students' || S.tab === 'hostel' || S.tab === 'fees') await refreshView();
};

/* ==========================================================================
   Hostel: residents with family contacts, fee status, leave log with return, expenses by category
   ========================================================================== */
const CONTACT_RELATIONS = ['Mother', 'Father', 'Sibling', 'Grandparent', 'Uncle', 'Aunt', 'Other'];
S.hostContacts = [];
const readContacts = () => [...document.querySelectorAll('[data-contact]')].map(row => ({ relation: row.querySelector('[data-c=relation]').value, name: row.querySelector('[data-c=name]').value, phone: row.querySelector('[data-c=phone]').value }));
function drawContacts() {
  $('#contactBox').innerHTML = S.hostContacts.length ? S.hostContacts.map((c, i) => `<div class="mb-2 grid items-center gap-2" style="grid-template-columns:8.5rem 1fr 1fr auto" data-contact="${i}">
    <select class="field" data-c="relation">${CONTACT_RELATIONS.map(x => `<option ${x === c.relation ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <input class="field" data-c="name" placeholder="Name" maxlength="80" value="${esc(c.name)}"><input class="field" data-c="phone" placeholder="Phone" maxlength="30" value="${esc(c.phone)}">
    <button type="button" data-act="contactRemove" data-i="${i}" class="btn-danger !px-2.5 !py-1.5" title="Remove this contact">&times;</button></div>`).join('') : '<p class="text-sm text-teal-600">No family contacts yet.</p>';
}
actions.contactAdd = el => { S.hostContacts = [...readContacts(), { relation: el.dataset.rel, name: '', phone: '' }]; drawContacts(); const rows = document.querySelectorAll('[data-contact]'); rows[rows.length - 1].querySelector('[data-c=name]').focus(); };
actions.contactRemove = el => { const rows = readContacts(); rows.splice(Number(el.dataset.i), 1); S.hostContacts = rows; drawContacts(); };

async function hostResidents(box) {
  S.hostRes = await db('getHostelResidents', S.section);
  const R = S.hostRes, active = R.filter(r => r.status === 'Active'), by = (r, rel) => r.contacts.filter(c => c.relation === rel);
  const person = c => `<div class="mb-1">${esc(c.name)}${c.phone ? `<div class="text-xs text-teal-600">${esc(c.phone)}</div>` : ''}</div>`;
  box.innerHTML = `<div class="mb-5 grid grid-cols-4 gap-4">${statBox('Residents now', active.length)}${statBox('Left the hostel', R.length - active.length)}${statBox('Monthly hostel fees', money(active.reduce((t, r) => t + r.fee, 0)))}${statBox('Family contacts on file', R.reduce((t, r) => t + r.contacts.length, 0))}</div>
    <div class="card"><div class="mb-4 flex items-center justify-between"><h3 class="font-display text-lg font-bold">Residents</h3><button data-act="addResident" class="btn-gold">Add resident</button></div>
    <div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Resident</th><th>Mother</th><th>Siblings</th><th>Guardian</th><th>Room</th><th class="num">Monthly fee</th><th>Joined</th><th>Status</th><th></th></tr></thead><tbody>
    ${R.length ? R.map(r => `<tr><td class="font-semibold" title="${esc(r.contacts.map(c => `${c.relation}: ${c.name} ${c.phone}`).join('; '))}">${esc(r.name)}${r.roll_no ? `<div class="text-xs font-normal text-teal-600">Roll ${esc(r.roll_no)}</div>` : ''}</td>
      <td>${by(r, 'Mother').map(person).join('') || '<span class="text-emerald-900/35">-</span>'}</td>
      <td>${by(r, 'Sibling').map(person).join('') || '<span class="text-emerald-900/35">-</span>'}</td>
      <td>${esc(r.guardian)}<div class="text-xs text-teal-600">${esc(r.phone)}</div></td><td>${esc(r.room)}</td><td class="num">${money(r.fee)}</td><td>${dateBoth(r.joined_on)}</td>
      <td><span class="badge ${r.status === 'Active' ? 'badge-ok' : 'badge-warn'}">${esc(r.status)}</span></td>
      <td class="whitespace-nowrap text-right"><button data-act="editResident" data-id="${r.id}" class="btn-ghost !px-3 !py-1.5">Edit</button> <button data-act="feeLedger" data-kind="hostel" data-id="${r.id}" class="btn-ghost !px-3 !py-1.5">Ledger</button> <button data-act="deleteResident" data-id="${r.id}" class="btn-danger !px-3 !py-1.5">Remove</button></td></tr>`).join('') : emptyRow(9, 'No hostel residents yet.')}
    </tbody></table></div></div>`;
}
async function residentForm(r = {}) {
  const studs = (await db('getStudents', S.section)).filter(s => s.status === 'Active');
  S.hostContacts = r.id ? r.contacts.map(c => ({ ...c })) : [{ relation: 'Mother', name: '', phone: '' }];
  openModal(r.id ? 'Edit resident' : 'Add resident', `
    <form data-form="residentSave"><input type="hidden" name="id" value="${r.id || ''}">
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2"><label class="label">Enrolled student (optional)</label><select name="student_id" class="field"><option value="">Not an enrolled student</option>${studs.map(s => `<option value="${s.id}" ${s.id === r.student_id ? 'selected' : ''}>${esc(s.roll_no)} - ${esc(s.name)}</option>`).join('')}</select></div>
        ${fld('Name (leave empty to use the student name)', 'name', r.name)}${fld('Guardian', 'guardian', r.guardian)}${fld('Guardian phone', 'phone', r.phone)}${fld('Room / bed', 'room', r.room)}
        ${fld('Monthly hostel fee (Rs.)', 'fee', r.fee || '', { type: 'number' })}${fld('Joined hostel on', 'joined_on', r.joined_on || ymd(new Date()), { type: 'date', required: true })}
        ${selectFld('Status', 'status', ['Active', 'Left'], r.status || 'Active')}<div></div>
        <div class="col-span-2 rounded-2xl bg-white/40 p-4"><div class="mb-2 flex flex-wrap items-center justify-between gap-2"><div class="text-sm font-semibold text-emerald-800">Family contacts</div>
          <div class="flex flex-wrap gap-2"><button type="button" data-act="contactAdd" data-rel="Mother" class="btn-ghost !px-2.5 !py-1 text-xs">+ Mother</button><button type="button" data-act="contactAdd" data-rel="Father" class="btn-ghost !px-2.5 !py-1 text-xs">+ Father</button><button type="button" data-act="contactAdd" data-rel="Sibling" class="btn-ghost !px-2.5 !py-1 text-xs">+ Sibling</button><button type="button" data-act="contactAdd" data-rel="Other" class="btn-ghost !px-2.5 !py-1 text-xs">+ Other</button></div></div>
          <div id="contactBox"></div></div>
        <div class="col-span-2"><label class="label">Other notes about the family (optional)</label><textarea name="family" rows="2" maxlength="1000" class="field">${esc(r.family)}</textarea></div>
      </div>${r.id ? feeEffectiveBox() : ''}${formButtons(r.id ? 'Save changes' : 'Add resident')}
    </form>`, true);
  drawContacts();
}
async function hostFees(box) {
  S.hostFees = await db('getHostelFees', S.section, S.host.month);
  const sum = k => S.hostFees.reduce((t, r) => t + r[k], 0), badge = st => `<span class="badge ${st === 'Paid' ? 'badge-ok' : st === 'Partial' ? 'badge-warn' : 'badge-bad'}">${st}</span>`;
  box.innerHTML = `<div class="card mb-5">${monthPick(S.host.month, 'hostMonth')}</div>
    <div class="mb-5 grid grid-cols-4 gap-4">${statBox('Fees due this month', money(sum('due')))}${statBox('Collected this month', money(sum('paid')))}${statBox('Previous dues carried forward', money(sum('previous')))}${statBox('Total payable', money(sum('payable')))}</div>
    <div class="card"><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Resident</th><th>Room</th><th class="num">Previous dues</th><th class="num">Monthly fee</th><th class="num">Paid</th><th class="num">Total payable</th><th>Status</th><th></th></tr></thead><tbody>
    ${S.hostFees.length ? S.hostFees.map(r => `<tr><td class="font-semibold">${esc(r.name)}</td><td>${esc(r.room)}</td><td class="num">${money(r.previous)}</td><td class="num">${money(r.due)}</td><td class="num">${money(r.paid)}</td><td class="num font-bold">${money(r.payable)}</td><td>${badge(r.status)}</td>
      <td class="whitespace-nowrap text-right"><button data-act="hostCollect" data-id="${r.id}" class="btn-gold !px-3 !py-1.5" ${r.payable <= 0 ? 'disabled' : ''}>Collect</button> <button data-act="feeLedger" data-kind="hostel" data-id="${r.id}" class="btn-ghost !px-3 !py-1.5">Ledger</button></td></tr>`).join('') : emptyRow(8, 'No active residents for this month.')}
    </tbody></table></div></div>`;
}
async function hostExpenses(box) {
  const rows = await db('getHostelExpenses', S.section, S.host.month), total = rows.reduce((t, r) => t + r.amount, 0);
  const cats = [...rows.reduce((m, r) => m.set(r.category, (m.get(r.category) || 0) + r.amount), new Map())].sort((a, b) => b[1] - a[1]);
  box.innerHTML = `<div class="card mb-5"><div class="flex flex-wrap items-end gap-4">${monthPick(S.host.month, 'hostMonth')}<div class="ml-auto text-right"><div class="text-xl font-bold tabular-nums">${money(total)}</div><div class="text-xs text-teal-700">Expenses, ${esc(monthLabel(S.host.month))}</div></div></div></div>
    <form data-form="hostExpense" class="card mb-5"><div class="grid grid-cols-5 items-end gap-4">${fld('Date', 'date', ymd(new Date()), { type: 'date', required: true })}${fld('Category (food, utilities...)', 'category')}${fld('Amount (Rs.)', 'amount', '', { type: 'number', required: true })}${fld('Note', 'note')}<button class="btn-gold">Add expense</button></div></form>
    ${cats.length ? `<div class="card mb-5"><h3 class="mb-3 font-display text-lg font-bold">By category</h3><table class="tbl"><thead><tr><th>Category</th><th class="num">Amount</th><th class="num">Share</th></tr></thead><tbody>${cats.map(([c, n]) => `<tr><td class="font-semibold">${esc(c)}</td><td class="num">${money(n)}</td><td class="num">${fmt1(total ? (n / total) * 100 : 0)}%</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="card"><table class="tbl"><thead><tr><th>Date</th><th>Category</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map(r => `<tr><td>${dateBoth(r.date)}</td><td class="font-semibold">${esc(r.category)}</td><td>${esc(r.note)}</td><td class="num">${money(r.amount)}</td><td class="text-right"><button data-act="delExpense" data-id="${r.id}" class="btn-danger !px-3 !py-1.5">Delete</button></td></tr>`).join('') : emptyRow(5, 'No expenses recorded this month.')}
    </tbody></table></div>`;
}
async function hostLeaves(box) {
  const [rows, residents] = await Promise.all([db('getHostelLeaves', S.section), db('getHostelResidents', S.section)]);
  const today = ymd(new Date()), open = l => l.status !== 'Rejected' && !l.returned_on, overdue = l => open(l) && l.to_date < today, nowOut = l => l.status === 'Approved' && !l.returned_on && l.from_date <= today;
  box.innerHTML = `<div class="mb-5 grid grid-cols-3 gap-4">${statBox('Out on leave now', rows.filter(nowOut).length)}${statBox('Overdue to return', rows.filter(overdue).length)}${statBox('Applications logged', rows.length)}</div>
    <form data-form="hostLeave" class="card mb-5"><h3 class="mb-3 font-display text-lg font-bold">New leave application</h3>
      <div class="grid grid-cols-4 items-end gap-4"><div><label class="label">Resident</label><select name="resident_id" class="field" required><option value="">Choose</option>${residents.filter(r => r.status === 'Active').map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>
        ${fld('From', 'from_date', ymd(new Date()), { type: 'date', required: true })}${fld('To', 'to_date', ymd(new Date()), { type: 'date', required: true })}${fld('Reason', 'reason')}
        <div class="col-span-3"><label class="label">Photo of the leave application (optional)</label><input type="file" accept="image/*" data-change="leavePhoto" class="w-full text-xs"><input type="hidden" name="photo" value=""></div><button class="btn-gold">Save application</button></div></form>
    <div class="card"><div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Resident</th><th>From</th><th>To</th><th>Reason</th><th>Application</th><th>Status</th><th>Returned</th><th></th></tr></thead><tbody>
    ${rows.length ? rows.map(l => `<tr><td class="font-semibold">${esc(l.name)}</td><td>${dateBoth(l.from_date)}</td><td>${dateBoth(l.to_date)}</td><td>${esc(l.reason)}</td>
      <td>${l.has_photo ? `<button data-act="viewLeave" data-id="${l.id}" class="btn-ghost !px-3 !py-1.5">View photo</button>` : '<span class="text-emerald-900/45">No photo</span>'}</td>
      <td><select class="field !py-1.5 text-sm" style="width:120px" data-change="leaveStatus" data-id="${l.id}">${['Pending', 'Approved', 'Rejected'].map(x => `<option ${x === l.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
      <td>${l.returned_on ? `${dateBoth(l.returned_on)}<button data-act="leaveUndo" data-id="${l.id}" class="mt-1 text-xs underline">Undo</button>` : l.status === 'Rejected' ? '<span class="text-emerald-900/45">-</span>' : `${overdue(l) ? '<span class="badge badge-bad">Overdue</span> ' : ''}<button data-act="leaveReturned" data-id="${l.id}" class="btn-ghost !px-2.5 !py-1 text-xs">Mark returned</button>`}</td>
      <td class="text-right"><button data-act="delLeave" data-id="${l.id}" class="btn-danger !px-3 !py-1.5">Delete</button></td></tr>`).join('') : emptyRow(8, 'No leave applications yet.')}
    </tbody></table></div></div>`;
}
actions.leaveReturned = async el => { await db('markHostelLeaveReturned', Number(el.dataset.id)); toast('Marked as returned'); await drawHostel(); };
actions.leaveUndo = async el => { await db('markHostelLeaveReturned', Number(el.dataset.id), ''); await drawHostel(); };


/* ==========================================================================
   Timetable: classes as rows, periods as columns. Each schedule (normal days, Thursday, Saturday ...)
   has its own period timings. A cell holds the subject / book and the teacher.
   ========================================================================== */
const TT_DAYS = [[0, 'Sun', 'اتوار'], [1, 'Mon', 'پیر'], [2, 'Tue', 'منگل'], [3, 'Wed', 'بدھ'], [4, 'Thu', 'جمعرات'], [5, 'Fri', 'جمعہ'], [6, 'Sat', 'ہفتہ']];
S.tt = { list: [], sel: null, stream: '', teachers: [], teacher: '' };
const ttTeacherOf = name => S.tt.teachers.find(t => t.name.trim().toLowerCase() === String(name || '').trim().toLowerCase()) || null;
/** "Class: Subject" chips for what a teacher has been assigned (Teachers / Subject assignment), the ones for `classId` highlighted. */
const ttAssignChips = (t, classId, clickable) => t && t.assignments.length
  ? t.assignments.map(a => { const mine = classId && a.class_id === classId;
      return `<span ${clickable && mine ? `data-act="ttUseSubject" data-subject="${esc(a.subject)}" role="button" tabindex="0" title="Use this subject"` : ''} class="badge ${mine ? 'badge-ok' : ''} ${clickable && mine ? 'cursor-pointer' : ''}" style="${mine ? '' : 'opacity:.75'}">${esc(a.class_name)}: ${esc(a.subject)}</span>`; }).join(' ')
  : '<span class="text-xs text-teal-700">No classes or subjects assigned to this teacher yet. Assign them under Teachers or Subject assignment.</span>';
const ttSel = () => S.tt.list.find(x => x.id === S.tt.sel) || null;
const ttClock = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)}`; };
const ttRange = p => (p.start_time || p.end_time ? `${ttClock(p.start_time)}${p.end_time ? ' - ' + ttClock(p.end_time) : ''}` : '');
const ttDaysText = d => d.length ? d.map(i => TT_DAYS[i][1]).join(', ') : 'No days chosen';
async function ttReload() {
  S.tt.list = await db('getTimetable', S.section);
  if (!ttSel()) S.tt.sel = S.tt.list[0] ? S.tt.list[0].id : null;
  drawTT();
}
VIEWS.timetable = async v => {
  v.innerHTML = '<div id="ttBody"></div>';
  if (S.role === 'admin') S.tt.teachers = await db('getTeachers', S.section);
  await ttReload();
};
function drawTT() {
  const box = $('#ttBody');
  if (!box) return;
  const admin = S.role === 'admin', T = S.tt, sch = ttSel();
  const head = pageTitle('Timetable', 'Classes down the side, periods across. Each schedule has its own period timings (for example normal days, Thursday and Saturday).');
  if (!T.list.length) {
    box.innerHTML = head + `<div class="card py-10 text-center"><p class="mb-4 text-emerald-900/70">No timetable has been created for the ${SECTIONS[S.section]} yet.</p>
      ${admin ? '<div class="flex justify-center gap-3"><button data-act="ttQuick" class="btn-gold">Quick start: Normal, Thursday and Saturday</button><button data-act="ttSchedForm" class="btn-ghost">Add a schedule</button></div>' : ''}</div>`;
    return;
  }
  const tch = admin && T.teacher ? T.teachers.find(t => String(t.id) === String(T.teacher)) : null;
  const myCls = tch ? new Set([...tch.assignments.map(a => a.class_id), ...sch.cells.filter(c => (c.teacher || '').trim().toLowerCase() === tch.name.trim().toLowerCase()).map(c => c.class_id)]) : null;
  const classes = S.classes.filter(c => (!T.stream || c.stream === T.stream) && (!myCls || myCls.has(c.id)));
  const cell = new Map(sch.cells.map(c => [`${c.class_id}|${c.period_id}`, c]));
  const busy = new Map();                                    // same teacher in two classes in the same period = clash
  for (const c of sch.cells) if (c.teacher) { const k = `${c.period_id}|${c.teacher.toLowerCase()}`; busy.set(k, (busy.get(k) || 0) + 1); }
  const periods = sch.periods;
  const th = periods.map((p, i) => `<th class="tt-th ${p.is_break ? 'tt-break-h' : ''}"><div class="font-bold">${esc(p.label)}</div><div class="tt-time">${esc(ttRange(p))}</div>
    ${admin ? `<div class="no-print mt-1 flex justify-center gap-1"><button data-act="ttMovePeriod" data-id="${p.id}" data-dir="left" class="ord-btn" title="Move left" ${i === 0 ? 'disabled' : ''}>&larr;</button><button data-act="ttPeriodForm" data-id="${p.id}" class="ord-btn" title="Edit period">&#9998;</button><button data-act="ttDelPeriod" data-id="${p.id}" class="ord-btn" title="Delete period">&times;</button><button data-act="ttMovePeriod" data-id="${p.id}" data-dir="right" class="ord-btn" title="Move right" ${i === periods.length - 1 ? 'disabled' : ''}>&rarr;</button></div>` : ''}</th>`).join('');
  const rows = classes.map((c, ri) => `<tr><td class="tt-class">${esc(c.name)}<div class="tt-time">${esc(c.stream)}</div></td>${periods.map(p => {
    if (p.is_break) return ri === 0 ? `<td class="tt-break" rowspan="${classes.length}"><div class="tt-vert">${esc(p.label)}</div></td>` : '';
    const x = cell.get(`${c.id}|${p.id}`), clash = x && x.teacher && busy.get(`${p.id}|${x.teacher.toLowerCase()}`) > 1;
    const mine = tch && x && (x.teacher || '').trim().toLowerCase() === tch.name.trim().toLowerCase();
    return `<td class="tt-cell ${admin ? 'tt-edit' : ''} ${clash ? 'tt-clash' : ''} ${tch ? (mine ? 'tt-mine' : 'tt-dim') : ''}" ${admin ? `data-act="ttCell" data-class="${c.id}" data-period="${p.id}"` : ''} ${clash ? 'title="This teacher is also in another class in this period"' : ''}>
      ${x ? `<div class="tt-subj">${esc(x.subject)}</div><div class="tt-teacher">${esc(x.teacher)}</div>` : ''}</td>`;
  }).join('')}</tr>`).join('');
  const sub = [SECTIONS[S.section], T.stream || 'All streams', ttDaysText(sch.days)].join(' | ');
  box.innerHTML = head + `
    <div class="no-print">
    ${tabBar(T.list.map(x => [String(x.id), esc(x.name)]), String(T.sel), 'ttTab')}
    <div class="card mb-5"><div class="flex flex-wrap items-end gap-3">
      <div><label class="label">Stream</label><select class="field" data-change="ttStream"><option value="">All streams</option>${STREAMS.map(s => `<option value="${s.key}" ${T.stream === s.key ? 'selected' : ''}>${s.key}</option>`).join('')}</select></div>
      ${admin ? `<div><label class="label">Teacher</label><select class="field" data-change="ttTeacherFilter"><option value="">All teachers</option>${T.teachers.filter(t => !t.status || t.status === 'Active' || String(t.id) === String(T.teacher)).map(t => `<option value="${t.id}" ${String(T.teacher) === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>` : ''}
      <div class="text-sm text-teal-700">Days: <b>${esc(ttDaysText(sch.days))}</b></div><div class="flex-1"></div>
      ${admin ? `<button data-act="ttPeriodForm" class="btn-ghost">Add period</button><button data-act="ttSchedForm" data-id="${sch.id}" class="btn-ghost">Edit schedule</button><button data-act="ttDup" class="btn-ghost">Duplicate</button><button data-act="ttDelSched" class="btn-ghost">Delete</button><button data-act="ttSchedForm" class="btn-ghost">New schedule</button>` : ''}
      <button data-act="ttPrint" class="btn-ghost">Print</button><button data-act="ttPdf" class="btn-ghost">Save as PDF</button><button data-act="ttJpg" class="btn-gold">Download JPG</button>
    </div>${tch ? `<div class="mt-4 rounded-2xl bg-white/50 p-3"><div class="mb-1.5 text-sm font-semibold text-emerald-800">${esc(tch.name)} teaches (${tch.assignments.length} subject${tch.assignments.length === 1 ? '' : 's'} in ${new Set(tch.assignments.map(a => a.class_id)).size} class${new Set(tch.assignments.map(a => a.class_id)).size === 1 ? '' : 'es'}):</div><div class="flex flex-wrap gap-1">${ttAssignChips(tch, 0, false)}</div></div>` : ''}${admin ? '<p class="mt-3 text-xs text-teal-700">Click a cell to set its subject / book and teacher. A red cell means the same teacher is in two classes in that period.</p>' : ''}</div></div>
    <div id="ttSheet" class="sheet tt-sheet"><div class="tt-head">${logoEl('h-14 w-14')}<div><div class="font-display text-xl font-bold">${INSTITUTE}</div>
      <div class="text-sm font-semibold">Timetable: ${esc(sch.name)}</div><div class="text-xs">${esc(sub)}</div></div></div>
      ${periods.length && classes.length ? `<div class="tt-scroll"><table class="tt"><thead><tr><th class="tt-th">Class</th>${th}</tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="py-8 text-center text-sm">${periods.length ? 'There are no classes in this stream.' : 'This schedule has no periods yet. Use Add period.'}</p>`}</div>`;
}
actions.ttTab = el => { S.tt.sel = Number(el.dataset.tab); drawTT(); };
changes.ttStream = el => { S.tt.stream = el.value; drawTT(); };
changes.ttTeacherFilter = el => { S.tt.teacher = el.value; drawTT(); };
actions.ttQuick = async () => { await db('quickStartTimetable', S.section); toast('Timetable created. Edit the period timings to match your sheet.'); await ttReload(); };

const dayChecks = days => `<div><label class="label">Days this schedule applies to</label><div class="flex flex-wrap gap-2">${TT_DAYS.map(([i, en, ur]) =>
  `<label class="flex items-center gap-1.5 rounded-xl bg-white/60 px-3 py-1.5 text-sm"><input type="checkbox" name="d${i}" ${days.includes(i) ? 'checked' : ''}> ${en} ${urdu(ur)}</label>`).join('')}</div></div>`;
const readDays = d => TT_DAYS.map(x => x[0]).filter(i => d['d' + i]);
actions.ttSchedForm = el => {
  const s = el.dataset.id ? ttSel() : null;
  openModal(s ? 'Edit schedule' : 'New schedule', `<form data-form="ttSched" class="grid gap-4"><input type="hidden" name="id" value="${s ? s.id : ''}">
    ${fld('Schedule name', 'name', s ? s.name : '', { required: true })}${dayChecks(s ? s.days : [])}
    <div class="flex justify-end gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button class="btn-gold">Save</button></div></form>`);
};
forms.ttSched = async (f, d) => {
  const id = await db('saveTimetableSchedule', { id: Number(d.id) || undefined, section: S.section, name: d.name, days: readDays(d) });
  S.tt.sel = id; closeModal(); toast('Schedule saved'); await ttReload();
};
actions.ttDup = () => {
  const s = ttSel();
  openModal('Duplicate schedule', `<form data-form="ttDup" class="grid gap-4"><p class="text-sm text-teal-700">Copies every period and cell of <b>${esc(s.name)}</b>, so you only change what differs.</p>
    ${fld('New schedule name', 'name', s.name + ' (copy)', { required: true })}${dayChecks([])}
    <div class="flex justify-end gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button class="btn-gold">Duplicate</button></div></form>`);
};
forms.ttDup = async (f, d) => { S.tt.sel = await db('duplicateTimetableSchedule', S.tt.sel, d.name, readDays(d)); closeModal(); toast('Schedule duplicated'); await ttReload(); };
actions.ttDelSched = async () => {
  const s = ttSel();
  if (!confirm(`Delete the schedule "${s.name}" with all its periods and cells?`)) return;
  await db('deleteTimetableSchedule', s.id); S.tt.sel = null; toast('Schedule deleted'); await ttReload();
};
actions.ttPeriodForm = el => {
  const p = el.dataset.id ? ttSel().periods.find(x => x.id === Number(el.dataset.id)) : null;
  openModal(p ? 'Edit period' : 'Add period', `<form data-form="ttPeriod" class="grid gap-4"><input type="hidden" name="id" value="${p ? p.id : ''}">
    ${fld('Period name', 'label', p ? p.label : `Period ${ttSel().periods.filter(x => !x.is_break).length + 1}`, { required: true })}
    <div class="grid grid-cols-2 gap-4">${fld('Starts', 'start', p ? p.start_time : '', { type: 'time' })}${fld('Ends', 'end', p ? p.end_time : '', { type: 'time' })}</div>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="is_break" ${p && p.is_break ? 'checked' : ''}> This is a break (no subject or teacher)</label>
    <div class="flex justify-end gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button class="btn-gold">Save period</button></div></form>`);
};
forms.ttPeriod = async (f, d) => {
  await db('saveTimetablePeriod', { id: Number(d.id) || undefined, schedule_id: S.tt.sel, label: d.label, start: d.start, end: d.end, is_break: !!d.is_break });
  closeModal(); toast('Period saved'); await ttReload();
};
actions.ttDelPeriod = async el => {
  if (!confirm('Delete this period and every subject entered under it?')) return;
  await db('deleteTimetablePeriod', Number(el.dataset.id)); await ttReload();
};
actions.ttMovePeriod = async el => { await db('moveTimetablePeriod', Number(el.dataset.id), el.dataset.dir); await ttReload(); };
/** Teacher choices for a cell: teachers assigned to this class first (with their subject here), then everyone else. */
function ttTeacherOptions(cid, current) {
  const act = S.tt.teachers.filter(t => !t.status || t.status === 'Active' || t.name === current);
  const here = act.filter(t => t.assignments.some(a => a.class_id === cid)), other = act.filter(t => !here.includes(t));
  const opt = t => { const subs = t.assignments.filter(a => a.class_id === cid).map(a => a.subject); return `<option value="${esc(t.name)}" ${ttTeacherOf(current) === t ? 'selected' : ''}>${esc(t.name)}${subs.length ? ' (' + esc(subs.join(', ')) + ')' : ''}</option>`; };
  const typed = current && !ttTeacherOf(current) ? `<option value="${esc(current)}" selected>${esc(current)}</option>` : '';
  return `<option value="">No teacher</option>${typed}${here.length ? `<optgroup label="Assigned to this class">${here.map(opt).join('')}</optgroup>` : ''}${other.length ? `<optgroup label="Other teachers">${other.map(opt).join('')}</optgroup>` : ''}`;
}
/** Under the teacher box: everything this teacher is assigned, and a one-click subject for this class. */
function ttTeacherInfo(name, cid) {
  const t = ttTeacherOf(name);
  if (!t) return '';
  const here = t.assignments.filter(a => a.class_id === cid);
  return `<div class="rounded-2xl bg-white/50 p-3"><div class="mb-1.5 text-xs font-semibold text-emerald-800">${esc(t.name)}: ${here.length ? 'tap a subject to use it' : 'not assigned to this class'}</div><div class="flex flex-wrap gap-1">${ttAssignChips(t, cid, true)}</div></div>`;
}
actions.ttCell = el => {
  const sch = ttSel(), cid = Number(el.dataset.class), pid = Number(el.dataset.period);
  const cls = S.classes.find(c => c.id === cid), per = sch.periods.find(p => p.id === pid), x = sch.cells.find(c => c.class_id === cid && c.period_id === pid) || {};
  const subjects = [...new Set(S.tt.list.flatMap(s => s.cells.map(c => c.subject)).filter(Boolean))].sort();
  openModal(`${esc(cls.name)}: ${esc(per.label)}`, `<form data-form="ttCell" class="grid gap-4"><input type="hidden" name="class_id" value="${cid}"><input type="hidden" name="period_id" value="${pid}">
    <p class="text-xs text-teal-700">${esc(sch.name)}${ttRange(per) ? ', ' + esc(ttRange(per)) : ''}</p>
    <div><label class="label">Teacher</label><select class="field" name="teacher" data-change="ttPickTeacher" data-class="${cid}">${ttTeacherOptions(cid, x.teacher || '')}</select></div>
    <div id="ttTeacherInfo">${ttTeacherInfo(x.teacher, cid)}</div>
    <div><label class="label">Subject / book</label><input class="field" name="subject" value="${esc(x.subject || '')}" list="ttSubjects" autocomplete="off"><datalist id="ttSubjects">${subjects.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
    <div class="flex justify-between gap-3"><button type="button" data-act="ttClear" data-class="${cid}" data-period="${pid}" class="btn-ghost">Clear cell</button>
    <div class="flex gap-3"><button type="button" data-act="closeModal" class="btn-ghost">Cancel</button><button class="btn-gold">Save</button></div></div></form>`);
};
changes.ttPickTeacher = el => {
  const cid = Number(el.dataset.class), form = el.closest('form'), subj = form.querySelector('[name=subject]');
  $('#ttTeacherInfo').innerHTML = ttTeacherInfo(el.value, cid);
  const t = ttTeacherOf(el.value), here = t ? [...new Set(t.assignments.filter(a => a.class_id === cid).map(a => a.subject))] : [];
  if (here.length === 1 && !subj.value.trim()) subj.value = here[0];       // one subject in this class: fill it in
};
actions.ttUseSubject = el => { const f = el.closest('form'); if (f) f.querySelector('[name=subject]').value = el.dataset.subject; };
forms.ttCell = async (f, d) => {
  await db('saveTimetableCell', { schedule_id: S.tt.sel, class_id: Number(d.class_id), period_id: Number(d.period_id), subject: d.subject, teacher: d.teacher });
  closeModal(); await ttReload();
};
actions.ttClear = async el => { await db('saveTimetableCell', { schedule_id: S.tt.sel, class_id: Number(el.dataset.class), period_id: Number(el.dataset.period), subject: '', teacher: '' }); closeModal(); await ttReload(); };
const ttFile = () => safeName('Timetable', SECTIONS[S.section], (ttSel() || {}).name || '');
actions.ttPrint = () => outputSheet($('#ttSheet'), 'card', () => rpc('printPage', true));
actions.ttPdf = async () => { if (await outputSheet($('#ttSheet'), 'card', () => rpc('savePdf', ttFile() + '.pdf', true))) toast('Saved as PDF'); };
actions.ttJpg = async () => {
  const el = $('#ttSheet');
  el.classList.add('exporting');                       // full width, no scrollbars, no edit buttons
  try { await sheetToJpg(el, ttFile() + '.jpg'); } finally { el.classList.remove('exporting'); }
};

/* ==========================================================================
   Start
   ========================================================================== */
(async function boot() {
  try {
    S.status = await rpc('status');
    if (S.status.dbReady || IS_APP()) { await loadSettings(); S.screen = 'login'; }   // the app always opens straight to the login screen
    else S.screen = 'setup';
    render();
  } catch (err) {
    document.body.innerHTML = `<div style="padding:24px;font:15px system-ui"><p>Could not start: ${esc(err.message)}</p><button id="retryBoot" style="margin-top:12px;padding:10px 18px;border-radius:10px">Try again</button></div>`;
    const rb = document.getElementById('retryBoot'); if (rb) rb.addEventListener('click', () => location.reload());
  }
})();
