// Replacement for Node's `crypto` (only what database.js uses). scrypt parameters match Node's defaults
// (N=16384, r=8, p=1), so password hashes created on the desktop app keep working on Android and vice versa.
import { Buffer } from 'buffer';
import { scrypt } from '@noble/hashes/scrypt';

export function randomBytes(n) { return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n))); }
export function scryptSync(password, salt, keylen) {
  return Buffer.from(scrypt(password, salt, { N: 16384, r: 8, p: 1, dkLen: keylen }));
}
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
