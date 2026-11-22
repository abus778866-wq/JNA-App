/* animations.js: startup loader, scroll reveal and lazy-list helpers.
 * Loaded at the end of <body> (CSP-safe external file). Needs the CSS in index.html. */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SHOW_MS = reduce ? 600 : 5200;           // the loader stays at least this long ...
  const FADE_MS = reduce ? 150 : 1000;           // ... then fades out over this long
  const STEPS = [[0, 'Starting up'], [18, 'Opening the database'], [42, 'Loading students and classes'], [66, 'Preparing reports'], [86, 'Almost ready'], [99, 'Welcome']];
  const t0 = performance.now();
  const splash = document.getElementById('splash');
  const SEL = '.card, .rv, .rv-row';              // what slides up when it scrolls into view
  const SKIP = '.sheet, .no-reveal, #modalRoot, #receiptRoot, #toast, #attBody, #ttBody';   // printable sheets and live-edited grids stay put
  let io = null, started = false;

  /* ---------- Scroll reveal ---------- */
  function observer() {
    if (io || reduce || !('IntersectionObserver' in window)) return io;
    io = new IntersectionObserver(entries => {
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        io.unobserve(el);
        el.style.setProperty('--d', Math.min(i++, 8) * 70 + 'ms');        // neighbours appear one after another
        el.classList.add('rv-in');
        el.addEventListener('animationend', () => el.style.removeProperty('--d'), { once: true });
      }
    }, { threshold: 0.06, rootMargin: '0px 0px -5% 0px' });
    return io;
  }
  function consider(el) {
    if (el.__rv || el.closest(SKIP) || !observer()) return;
    el.__rv = true;
    el.classList.add('rv');                                                 // hidden until it enters the viewport
    io.observe(el);
  }
  function scan(root) {
    if (!started || !root || root.nodeType !== 1) return;
    if (root.matches(SEL)) consider(root);
    root.querySelectorAll(SEL).forEach(consider);
  }
  let queue = [], raf = 0;
  const mo = new MutationObserver(list => {
    for (const m of list) m.addedNodes.forEach(n => { if (n.nodeType === 1) queue.push(n); });
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const q = queue; queue = []; q.forEach(scan); });
  });
  mo.observe(document.body, { childList: true, subtree: true });

  /* ---------- Startup loader ---------- */
  const fill = document.getElementById('spFill'), pct = document.getElementById('spPct'), msg = document.getElementById('spMsg');
  function progress() {                                                      // eased 0 -> 100 over the loader time, with status text
    if (!splash || !fill) return;
    const t = Math.min((performance.now() - t0) / (SHOW_MS - 300), 1), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, p = Math.round(e * 100);
    fill.style.transform = `scaleX(${e})`; pct.textContent = p + '%';
    const step = STEPS.filter(s => p >= s[0]).pop(); if (step && msg.textContent !== step[1]) msg.textContent = step[1];
    if (t < 1 && splash.isConnected && !splash.classList.contains('sp-out')) requestAnimationFrame(progress);
  }
  progress();
  function begin() {
    started = true;
    scan(document.body);                                                    // the first screen fades up as the loader leaves
    if (!splash) return;
    splash.classList.add('sp-out');
    setTimeout(() => { splash.remove(); document.documentElement.classList.remove('splash-on'); }, FADE_MS + 60);
  }
  const loaded = new Promise(res => document.readyState === 'complete' ? res() : window.addEventListener('load', res, { once: true }));
  loaded.then(() => setTimeout(begin, Math.max(0, SHOW_MS - (performance.now() - t0))));
  if (!splash) started = true;

  /* ---------- Login character: hidden behind the card, walks out, reacts, walks back ----------
   * Drop your transparent PNGs into assets/ : boy-character.png and girl-character.png (optional sad faces:
   * boy-character-sad.png, girl-character-sad.png). One is picked at random on every sign-in attempt. */
  const LoginPal = (function () {
    const CFG = {
      peekMs: 1400,      // first steps: slides out just past the card edge
      lookMs: 1000,      // pauses and looks around
      walkMs: 3200,      // the walk out to stand beside the card
      turnMs: 500,       // turns around to face the card
      okHoldMs: 3000,    // "yes" gesture and thumbs-up
      badHoldMs: 2500,   // "no" gesture
      backMs: 3400       // the walk back behind the card
    };
    const IMG = { boy: 'assets/boy-character.png', girl: 'assets/girl-character.png' };
    const SAD = { boy: 'assets/boy-character-sad.png', girl: 'assets/girl-character-sad.png' };
    const TEXT = { ok: 'ٹھیک ہے! خوش آمدید', bad: 'غلط پاس ورڈ! دوبارہ کوشش کریں' };
    const CARD_W = 340, PAL_W = 150, GAP = 32, HIDDEN = (CARD_W - PAL_W) / 2;
    const EASE = 'cubic-bezier(.42, .06, .3, 1)';
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const lite = () => reduce || window.innerWidth < 900;
    let token = 0, cur = null;                                       // token cancels an attempt that is no longer on screen

    const host = () => document.getElementById('loginPal');
    const loadImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = src; });
    const spots = side => side === 'right'
      ? { peek: CARD_W - PAL_W + 28, end: CARD_W + GAP }                // right edge of the picture just past the card's right edge
      : { peek: -28, end: -(PAL_W + GAP) };

    async function move(h, from, to, ms, t) {
      const a = h.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: ms, easing: EASE, fill: 'forwards' });
      try { await a.finished; } catch { /* cancelled */ }
      if (t === token) h.style.transform = `translateX(${to}px)`;
      a.cancel();
    }
    function turn(h, toFace, ms, t) {
      const el = h.querySelector('.pal-turn'), from = Number(h.dataset.face || 1);
      if (from === toFace) return Promise.resolve();
      const a = el.animate([{ transform: `scaleX(${from})` }, { transform: 'scaleX(.05)', offset: .5 }, { transform: `scaleX(${toFace})` }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
      return a.finished.catch(() => {}).then(() => { if (t === token) { el.style.setProperty('--face', toFace); h.dataset.face = String(toFace); } a.cancel(); });
    }
    const setMode = (h, m) => { h.classList.remove('walking', 'idle', 'curious'); if (m) h.classList.add(m); };

    const THUMB = '<span class="pal-thumb"><svg viewBox="0 0 64 64" width="58" height="58"><g stroke="#c98a6a" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M22 30C22 20 24 10 29 8C33 7 35 11 34 16L32 28H50C55 28 58 32 57 36L55 48C54 53 50 56 45 56H26C23 56 22 54 22 51Z" fill="#f4c7a8"/><path d="M34 38H52M33 44H51M32 50H49" fill="none" stroke="#d9a283"/></g><rect x="5" y="30" width="17" height="27" rx="5" fill="var(--cuff,#fff)" stroke="#cfc39a" stroke-width="1.4"/></svg></span>';
    const SWEAT = '<svg class="pal-sweat" viewBox="0 0 14 20"><path d="M7 1C7 1 1 9 1 13a6 6 0 0 0 12 0C13 9 7 1 7 1Z" fill="#8fd0ee" stroke="#5aa9d0" stroke-width="1"/></svg>';

    async function walkOut() {
      const t = ++token;
      const h = host();
      if (!h || lite()) { await wait(900); return; }
      const kind = Math.random() < .5 ? 'boy' : 'girl', side = Math.random() < .5 ? 'right' : 'left', dir = side === 'right' ? 1 : -1;
      cur = { t, kind, side, dir, lite: false };
      if (!(await loadImg(IMG[kind]))) { cur.lite = true; await wait(900); return; }   // picture missing: carry on without it
      if (t !== token) return;
      const sp = spots(side);
      h.className = `pal side-${side}`;
      h.dataset.kind = kind; h.dataset.face = String(dir);
      h.style.transform = `translateX(${HIDDEN}px)`;
      h.innerHTML = `<div class="pal-bubble ur" lang="ur" dir="rtl"></div><div class="pal-shadow"></div>
        <div class="pal-walk"><div class="pal-turn" style="--face:${dir}"><div class="pal-fig"><img class="pal-img pal-lower" src="${IMG[kind]}" alt=""><img class="pal-img pal-head" src="${IMG[kind]}" alt=""></div></div></div>
        ${THUMB}${SWEAT}<span class="pal-spark s1">&#10022;</span><span class="pal-spark s2">&#10022;</span><span class="pal-spark s3">&#10022;</span>`;
      h.classList.add('on'); setMode(h, 'walking');
      await move(h, HIDDEN, sp.peek, CFG.peekMs, t);                          // Step 1: peeks out from behind the card
      if (t !== token) return;
      setMode(h, 'curious'); await wait(CFG.lookMs);                          // looks around
      if (t !== token) return;
      setMode(h, 'walking');
      await move(h, sp.peek, sp.end, CFG.walkMs, t);                          // walks out to stand beside the card
      if (t !== token) return;
      setMode(h, 'idle');
      await turn(h, -dir, CFG.turnMs, t);                                     // turns to face the card
    }

    async function react(kind) {
      const h = host();
      if (!h || !cur || cur.lite || lite() || cur.t !== token) { await wait(kind === 'ok' ? 1400 : 1200); return; }
      const t = token;
      h.querySelector('.pal-bubble').textContent = TEXT[kind];
      h.classList.add(kind === 'ok' ? 'state-ok' : 'state-bad');
      if (kind === 'bad' && await loadImg(SAD[cur.kind])) h.querySelectorAll('.pal-img').forEach(im => { im.src = SAD[cur.kind]; });   // disappointed face
      if (t !== token) return;
      await wait(380); h.classList.add('bubble-on');                          // bubble pops up
      await wait(kind === 'ok' ? CFG.okHoldMs : CFG.badHoldMs);
    }

    async function walkBack() {
      const h = host();
      if (!h || !cur || cur.lite || cur.t !== token) return;
      const t = token, sp = spots(cur.side);
      h.classList.remove('bubble-on'); await wait(350);
      h.classList.remove('state-bad', 'state-ok');
      h.querySelectorAll('.pal-img').forEach(im => { im.src = IMG[cur.kind]; });
      await turn(h, cur.dir, CFG.turnMs, t);                                  // turns back towards the card
      if (t !== token) return;
      setMode(h, 'walking');
      await move(h, sp.end, HIDDEN, CFG.backMs, t);                           // walks back and hides behind the card
      if (t !== token) return;
      h.classList.remove('on'); setMode(h, null);
      cur = null;
    }

    function leave() { const h = host(); if (h) h.classList.add('fade-away'); }   // correct password: fades as the card leaves
    function reset() { token++; cur = null; const h = host(); if (h) { h.className = 'pal'; h.innerHTML = ''; } }
    return { walkOut, react, walkBack, leave, reset, config: CFG };
  })();
  window.LoginPal = LoginPal;

  /* ---------- Section entrance: every section loads like the dashboard ----------
   * Called by go() once a section's content is in place. The page heading, cards, sheets, tab bars and standalone
   * tables rise one after another. Anything on screen animates straight away (a plain one-shot animation, so nothing
   * can stay hidden, which matters for the timetable, attendance and printable sheets); anything below the fold
   * uses the scroll reveal above. Redraws inside a section later on do not replay it. */
  const BLOCK = '.pg-head, .card, .sheet, .tt-sheet, .seg-bar, :scope > .tbl, :scope > div > .tbl, :scope > div > .overflow-auto, :scope > div > .grid > div';
  function view(holder) {
    if (!holder || reduce) return;
    const all = Array.from(holder.querySelectorAll(BLOCK));
    const set = new Set(all);
    const blocks = all.filter(el => { for (let p = el.parentElement; p && p !== holder; p = p.parentElement) if (set.has(p)) return false; return true; });   // outermost only
    const vh = window.innerHeight; let i = 0;
    for (const el of blocks) {
      if (el.__rv) continue;                                                // already waiting for the scroll reveal
      el.__rv = true;                                                       // claimed: the scroll reveal must not hide it again
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0 || el.closest(SKIP)) {
        el.style.setProperty('--d', Math.min(i++, 9) * 65 + 'ms');
        el.classList.add('rv-go');
        el.addEventListener('animationend', () => { el.classList.remove('rv-go'); el.style.removeProperty('--d'); }, { once: true });
      } else { el.__rv = false; consider(el); }
    }
  }

  window.Reveal = { scan: () => scan(document.body), view };
})();
