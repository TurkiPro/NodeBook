// Password hashing + opaque session cookies.
//
// One hash format: pbkdf2$<iterations>$<salt_b64>$<hash_b64>. Raising
// PBKDF2_ITERATIONS later costs nothing — verifyPassword reads the iteration
// count out of the stored string, and flags anything below the current setting
// for a silent re-hash on the user's next sign-in.

// OWASP 2023 floor for PBKDF2-HMAC-SHA256. Costs CPU, and Workers meters it:
// measured on a dev box, 210k ≈ 30 ms, 100k ≈ 15 ms, 50k ≈ 7 ms. The Workers
// FREE plan allows 10 ms CPU per invocation, so sign-in needs the paid plan
// (30 s) at this setting. Lower it only with that trade-off in mind — it
// weakens every password in the table.
const PBKDF2_ITERATIONS = 210_000;
const SESSION_TTL_MS    = 30 * 24 * 60 * 60 * 1000;
const COOKIE            = 'nb_session';

const enc = new TextEncoder();

const b64  = (bytes) => btoa(String.fromCharCode(...bytes));
const ub64 = (s)     => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

/** Constant-time-ish compare — length is public, contents are not. */
function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

/** @returns {{ok: boolean, needsRehash: boolean}} */
export async function verifyPassword(password, stored) {
  if (!stored.startsWith('pbkdf2$')) return { ok: false, needsRehash: false };
  const [, iter, salt, hash] = stored.split('$');
  const got = await pbkdf2(password, ub64(salt), Number(iter));
  return { ok: equal(got, ub64(hash)), needsRehash: Number(iter) < PBKDF2_ITERATIONS };
}

async function sha256hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function readCookie(request, name = COOKIE) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function cookieHeader(token, request, maxAgeSec) {
  // `Secure` on http://localhost would make wrangler dev unusable.
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export async function createSession(env, request, userId) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).bind(await sha256hex(token), userId, now + SESSION_TTL_MS, now).run();

  // Opportunistic GC — cheap, and keeps the table from growing without bound.
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();

  return cookieHeader(token, request, SESSION_TTL_MS / 1000);
}

export async function destroySession(env, request) {
  const token = readCookie(request);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256hex(token)).run();
  }
  return cookieHeader('', request, 0);
}

/** @returns {{id, email} | null} */
export async function currentUser(env, request) {
  const token = readCookie(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(await sha256hex(token), Date.now()).first();
  return row || null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;
