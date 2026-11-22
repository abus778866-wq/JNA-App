import { Buffer } from 'buffer';
globalThis.Buffer = globalThis.Buffer || Buffer;
// Minimal `process` for path-browserify. Deliberately no `versions.node`, so sql.js picks its browser code path.
globalThis.process = globalThis.process || { cwd: () => '/', env: {}, platform: 'browser', versions: {}, nextTick: f => queueMicrotask(f) };
globalThis.setImmediate = globalThis.setImmediate || ((f, ...a) => setTimeout(f, 0, ...a));   // main.js yields to the UI with setImmediate
