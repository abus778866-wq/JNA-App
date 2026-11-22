/* mobile-ui.js: responsive helpers (phones and tablets). Safe on desktop: it only adds CSS hooks.
   - tables (.tbl) with up to 14 columns get data-label cells + .m-stack (CSS turns rows into cards on phones)
   - every other wide table is wrapped in a sideways scroll box (.m-scroll)
   - grids that contain inputs are tagged .m-form-grid (one column on phones)
   - the sidebar returns to normal when the window grows past 1024 px */
(function () {
  'use strict';
  const MAX_STACK_COLS = 14;
  const compact = window.matchMedia('(max-width: 1023.98px)');
  let queued = false;

  function labelTable(t) {
    const heads = [...t.querySelectorAll(':scope > thead > tr:last-child > th')].map(h => h.textContent.trim());
    t.querySelectorAll(':scope > tbody > tr:not([data-mlbl])').forEach(tr => {
      let i = 0;
      [...tr.children].forEach(td => {
        td.setAttribute('data-label', td.hasAttribute('colspan') ? '' : (heads[i] || ''));
        i += Number(td.getAttribute('colspan') || 1);
      });
      tr.setAttribute('data-mlbl', '1');
    });
  }

  function scrollable(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
      if (p.id === 'view' || p.id === 'modalRoot') break;
    }
    return false;
  }

  function pass() {
    queued = false;
    document.querySelectorAll('table').forEach(t => {
      if (t.closest('.sheet, .class-page, .print-target')) return;          // printable sheets keep their exact layout
      if (t.classList.contains('tbl') && !t.dataset.mui) {
        const cols = t.querySelectorAll(':scope > thead > tr:last-child > th').length;
        const hasRowspan = t.querySelector('[rowspan]');
        if (cols && cols <= MAX_STACK_COLS && !hasRowspan) t.classList.add('m-stack');
        t.dataset.mui = '1';
      }
      if (t.classList.contains('m-stack')) labelTable(t);
      if (!t.dataset.mwrap) {
        t.dataset.mwrap = '1';
        if (!t.classList.contains('m-stack') && t.parentElement && !t.parentElement.classList.contains('m-scroll') && !scrollable(t)) {
          const w = document.createElement('div');
          w.className = 'm-scroll';
          t.parentElement.insertBefore(w, t);
          w.appendChild(t);
        }
      }
    });
    document.querySelectorAll('.grid[class*="grid-cols-"]:not(.m-form-grid):not([data-mgrid])').forEach(g => {
      g.dataset.mgrid = '1';
      if (g.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea')) g.classList.add('m-form-grid');
    });
  }
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(pass); } };

  function syncNav() {
    const side = document.getElementById('side');
    if (!side) return;
    if (compact.matches) side.classList.remove('collapsed');
    else {
      document.body.classList.remove('nav-open');
      let saved = false; try { saved = localStorage.getItem('navCollapsed') === '1'; } catch { /* storage unavailable */ }
      side.classList.toggle('collapsed', saved);
    }
  }

  function start() {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    (compact.addEventListener ? compact.addEventListener('change', syncNav) : compact.addListener(syncNav));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') document.body.classList.remove('nav-open'); });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
