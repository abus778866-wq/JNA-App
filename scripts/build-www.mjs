// Builds www/ (the web bundle Capacitor wraps). Desktop sources are NOT modified: patched copies go to mobile/.gen.
// Usage: npm run build:css && node scripts/build-www.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'package.json'));
const gen = path.join(root, 'mobile/.gen'), www = path.join(root, 'www');
fs.rmSync(gen, { recursive: true, force: true }); fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(gen, { recursive: true }); fs.mkdirSync(www, { recursive: true });

/* 1. Patched copies of the desktop main process + database (every patch must match, or the build fails loudly) */
function patch(src, edits) {
  let s = fs.readFileSync(path.join(root, src), 'utf8');
  for (const [from, to] of edits) { if (!s.includes(from)) throw new Error(`${src}: patch target not found:\n${from}`); s = s.replace(from, to); }
  fs.writeFileSync(path.join(gen, path.basename(src)), s);
}
patch('database.js', [[
  "const wasmDir = path.dirname(require.resolve('sql.js'));\n    SQL = await initSqlJs({ locateFile: f => path.join(wasmDir, f) });",
  "// sql.js gets the WebAssembly bytes inside the bundle (no fetch): works with Capacitor's native HTTP patch, CSP and offline\n    SQL = await initSqlJs({ wasmBinary: require('sql-wasm-binary') });"
]]);
// Phone: the folder choice must stay possible until someone is signed in as a teacher (e.g. after a half-finished first setup the
// database may already be open while the "choose where to store your data" screen is still showing).
const folderGate = ["}, () => !database.isOpen() || role === 'admin');", "}, () => role !== 'teacher');"];
patch('main.js', [folderGate, folderGate]);

/* 2. Bundle: Node/Electron modules are replaced by the shims in mobile/shims */
const sh = f => path.join(root, 'mobile/shims', f);
const alias = {
  name: 'alias',
  setup(b) {
    const map = { 'sql-wasm-binary': require.resolve('sql.js/dist/sql-wasm.wasm'), fs: sh('fs.js'), crypto: sh('crypto.js'), electron: sh('electron.js'), path: require.resolve('path-browserify'), xlsx: require.resolve('xlsx/dist/xlsx.full.min.js') };
    b.onResolve({ filter: /^(fs|crypto|electron|path|xlsx|sql-wasm-binary)$/ }, a => ({ path: map[a.path] }));
  }
};
await build({
  entryPoints: [path.join(root, 'mobile/bridge.js')], outfile: path.join(www, 'mobile-bridge.js'),
  bundle: true, format: 'iife', platform: 'browser', target: ['chrome90'], minify: true, legalComments: 'none',
  loader: { '.wasm': 'binary' }, plugins: [alias], inject: [sh('buffer-inject.js')],
  define: { __dirname: '"/app"', global: 'globalThis', 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning'
});

/* 3. Static files */
const copy = (from, to = from) => { const d = path.join(www, to); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.isAbsolute(from) ? from : path.join(root, from), d); };
for (const f of ['renderer.js', 'animations.js', 'theme.js', 'locations.js', 'mobile-ui.js', 'logo.png', 'icon.png', 'src/styles.css']) copy(f);
for (const f of fs.readdirSync(path.join(root, 'assets'))) copy(`assets/${f}`);
copy(require.resolve('sql.js/dist/sql-wasm.wasm'), 'sql-wasm.wasm');
copy(require.resolve('html2canvas/dist/html2canvas.min.js'), 'node_modules/html2canvas/dist/html2canvas.min.js');

/* 4. index.html: allow WebAssembly in the CSP and load the bridge before renderer.js */
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const csp = "script-src 'self'";
if (!html.includes(csp)) throw new Error('index.html: CSP not found');
html = html.replace(csp, "script-src 'self' 'wasm-unsafe-eval'").replace("img-src 'self' data:", "img-src 'self' data: blob:");
html = html.replace('<script src="theme.js"></script>', '<script src="theme.js"></script>\n  <script src="mobile-bridge.js"></script>');
fs.writeFileSync(path.join(www, 'index.html'), html);
console.log('www/ ready');
