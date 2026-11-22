/* Light / dark theme. Loaded in <head> so the saved choice is applied before the first paint (no flash). */
(function () {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem('jamia-theme'); } catch { /* storage unavailable: stay on light */ }
  const apply = t => {
    root.dataset.theme = t;
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = t === 'dark' ? '#0f1a17' : '#fbf7ec';
  };
  apply(saved === 'dark' ? 'dark' : 'light');
  window.Theme = {
    get: () => root.dataset.theme,
    set(t) {
      root.classList.add('theme-anim');                    // a short, smooth cross-fade (removed again so normal use stays snappy)
      apply(t);
      try { localStorage.setItem('jamia-theme', t); } catch { /* ignore */ }
      clearTimeout(this.timer);
      this.timer = setTimeout(() => root.classList.remove('theme-anim'), 600);
    },
    toggle() { this.set(this.get() === 'dark' ? 'light' : 'dark'); }
  };
})();
