// Runtime permissions (camera, microphone, photos/videos/audio) with plain-language dialogs.
// A denial is a normal answer: nothing here throws, and the rest of the app keeps working.
// Storage for the database needs NO permission here: choosing the folder in the system picker is the permission.
import * as store from './storage.js';

const LABELS = { camera: 'Camera (student photos and documents)', microphone: 'Microphone (video and audio capture)', media: 'Photos, videos and audio (choose existing files)' };
const ASKED_KEY = 'jamia.permissions.asked.v1';

const wasAsked = () => { try { return localStorage.getItem(ASKED_KEY) === '1'; } catch { return false; } };
const markAsked = () => { try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* storage unavailable */ } };
const domReady = () => (document.readyState === 'loading' ? new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true })) : Promise.resolve());

/** Small modal. Resolves the id of the pressed button. */
function ask({ title, body, buttons }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.45);font-family:system-ui,sans-serif';
    const box = document.createElement('div');
    box.style.cssText = 'max-width:420px;width:100%;background:#fbf7ec;color:#0b3d2e;border-radius:16px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.35)';
    const h = document.createElement('h2'); h.textContent = title; h.style.cssText = 'margin:0 0 8px;font-size:18px;font-weight:700';
    const p = document.createElement('div'); p.style.cssText = 'font-size:14px;line-height:1.5;white-space:pre-line;margin-bottom:16px'; p.textContent = body;
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button'; el.textContent = b.text;
      el.style.cssText = `border:0;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;${b.primary ? 'background:#0b6b4a;color:#fff' : 'background:#e3f1e8;color:#0b3d2e'}`;
      el.addEventListener('click', () => { wrap.remove(); resolve(b.id); });
      row.appendChild(el);
    }
    box.append(h, p, row); wrap.appendChild(box); document.body.appendChild(wrap);
  });
}

const notGranted = (status, groups) => groups.filter(g => status[g] && status[g].state !== 'granted');
const list = groups => groups.map(g => '• ' + (LABELS[g] || g)).join('\n');

/** After a refusal: say what stops working and offer the app's settings page (only if Android will not ask again). */
async function explainDenied(status, groups) {
  const blocked = notGranted(status, groups);
  if (!blocked.length) return;
  const canAsk = blocked.some(g => status[g].canAskAgain !== false);
  const settings = await ask({
    title: 'Permission not allowed',
    body: `The app keeps working, but these features are off:\n${list(blocked)}\n\n${canAsk ? 'You can allow them later from this app.' : 'To allow them, open the app settings > Permissions.'}`,
    buttons: [{ id: 'later', text: 'Not now' }, ...(canAsk ? [] : [{ id: 'settings', text: 'Open settings', primary: true }])]
  });
  if (settings === 'settings') await store.openAppSettings();
}

/** Asks for the given permissions (all by default) with an explanation first. Always resolves the final status. */
export async function request(groups = store.ALL_GROUPS, { explain = true } = {}) {
  await domReady();
  let status = await store.checkPermissions(groups);
  const missing = notGranted(status, groups);
  if (!missing.length) return status;
  if (explain) {
    const go = await ask({
      title: 'Allow access?',
      body: `The app would like to use:\n${list(missing)}\n\nYour school data is saved in the folder you choose, not in these permissions.`,
      buttons: [{ id: 'no', text: 'Not now' }, { id: 'yes', text: 'Continue', primary: true }]
    });
    if (go !== 'yes') return status;
  }
  const blockedForGood = missing.filter(g => status[g].canAskAgain === false);
  if (blockedForGood.length === missing.length) { await explainDenied(status, missing); return status; }
  status = await store.requestPermissions(groups);
  await explainDenied(status, groups);
  return status;
}

/** First launch only: ask once, never nag. Later, features can call jamiaPermissions.request('camera') when they need it. */
export async function startup() {
  if (!store.isNative() || wasAsked()) return;
  markAsked();
  try { await request(store.ALL_GROUPS); } catch { /* never block start-up */ }
}

export const api = {
  check: groups => store.checkPermissions([].concat(groups || store.ALL_GROUPS)),
  request: groups => request([].concat(groups || store.ALL_GROUPS)),
  openSettings: store.openAppSettings
};
