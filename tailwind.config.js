/** Tailwind build config: scans the HTML and renderer for class names.
 *  Every colour is a CSS variable (see src/input.css), so the whole palette switches between the light
 *  (ivory, light emerald, refined gold) and the dark theme without changing any class names. */
const v = name => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name, steps) => Object.fromEntries(steps.map(s => [s, v(`${name}-${s}`)]));
module.exports = {
  content: ['./index.html', './renderer.js', './mobile-ui.js'],
  theme: {
    extend: {
      colors: {
        emerald: scale('emerald', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        teal: scale('teal', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        gold: scale('gold', [50, 100, 200, 300, 400, 500, 600, 700]),
        ivory: scale('ivory', [50, 100, 200, 300]),
        white: v('white')
      },
      fontFamily: {
        display: ['"Palatino Linotype"', '"Book Antiqua"', 'Palatino', 'Georgia', 'serif'],
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
