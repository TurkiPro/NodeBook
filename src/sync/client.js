// Thin fetch wrapper around the Cloudflare Worker API.
//
// Cloud mode is opt-in: with no VITE_CLOUD the app runs local-only — no account,
// no network, graph in localStorage. Production builds set VITE_CLOUD=1.

const BASE = import.meta.env.VITE_API_URL || '/api';

export const cloudEnabled = import.meta.env.VITE_CLOUD === '1';

/** Identifies this tab so the realtime room can skip echoing our own writes. */
export const clientId = crypto.randomUUID();

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'same-origin',          // the session cookie is HttpOnly
    headers: {
      'X-Client-Id': clientId,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let payload = {};
    try { payload = await res.json(); } catch { /* non-JSON error body */ }
    const err = new Error(payload.message || `Request failed (${res.status})`);
    err._tag  = payload.error;           // src/auth/ui.js switches on this
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export function socketUrl(graphId) {
  const url = new URL(`${BASE}/graphs/${graphId}/socket`, location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('cid', clientId);
  return url.toString();
}
