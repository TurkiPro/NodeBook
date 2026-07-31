// Thin fetch wrapper around the Cloudflare Worker API.
//
// Cloud mode is the DEFAULT, and local-only is the thing you opt into. That
// direction matters: a build that forgets a flag still ships a working app.
// The reverse — cloud gated behind a flag — meant any build environment without
// .env.local (Cloudflare's build container, a fresh CI runner) silently emitted
// a bundle with auth and sync tree-shaken out, which deploys perfectly happily
// and is only obvious to a user staring at a missing login screen.
//
// Local-only is set by .claude/skills/run-nodebook/serve.mjs, which injects the
// flag via Vite's `define` rather than relying on an env file being absent.

const BASE = import.meta.env.VITE_API_URL || '/api';

export const cloudEnabled = import.meta.env.VITE_LOCAL_ONLY !== '1';

/** Identifies this tab so the realtime room can skip echoing our own writes. */
export const clientId = crypto.randomUUID();

/**
 * Every rejection from here carries `_tag` and `status`, so callers can branch
 * without sniffing message strings. A dropped connection surfaces as status 0
 * rather than a bare TypeError, which previously made `e.status === 401`-style
 * checks silently fall through to the wrong branch.
 */
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',          // the session cookie is HttpOnly
      headers: {
        'X-Client-Id': clientId,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error(
      navigator.onLine ? 'Could not reach the server.' : 'You are offline.');
    err._tag   = navigator.onLine ? 'unreachable' : 'offline';
    err.status = 0;
    throw err;
  }

  if (!res.ok) {
    let payload = {};
    try { payload = await res.json(); } catch { /* non-JSON error body */ }
    const err = new Error(payload.message || `Request failed (${res.status})`);
    err._tag  = payload.error || `http_${res.status}`;   // src/auth/ui.js switches on this
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  try {
    return await res.json();
  } catch {
    const err = new Error('The server sent a malformed response.');
    err._tag = 'bad_response';
    err.status = res.status;
    throw err;
  }
}

export function socketUrl(graphId) {
  const url = new URL(`${BASE}/graphs/${graphId}/socket`, location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('cid', clientId);
  return url.toString();
}
