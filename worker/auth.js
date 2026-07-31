// Credential storage + opaque session cookies.
//
// This Worker never receives a password. src/auth/crypto.js runs PBKDF2 at
// 210k iterations in the browser and sends the resulting 256-bit key; all we do
// is salt and hash that key before storing it.
//
// Why so few iterations here: stretching exists to make guessing a low-entropy
// secret expensive. The value arriving at this endpoint is not low-entropy —
// it is a uniformly random 256-bit key, which cannot be brute-forced at any
// iteration count. Anyone with a stolen database still has to guess the
// *password*, and every guess costs them the browser's full 210k derivation.
// So the server-side stretch only needs to be non-trivial, not expensive.
//
// Measured in workerd (not Node — workerd's BoringSSL is ~3x slower, so never
// benchmark this on the host and extrapolate): 1k ≈ 0.5 ms, well inside the
// Workers free plan's 10 ms CPU per invocation.
const SERVER_ITERATIONS = 1_000;
const AUTH_KEY_BYTES    = 32;
const SESSION_TTL_MS    = 30 * 24 * 60 * 60 * 1000;
const COOKIE            = 'nb_session';

const enc = new TextEncoder();

const b64  = (bytes) => btoa(String.fromCharCode(...bytes));
const ub64 = (s)     => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function pbkdf2(secret, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
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

/**
 * Decode the client's derived key. Rejects anything that is not exactly 32
 * bytes of base64, so a caller cannot downgrade the scheme by posting a short
 * or empty value.
 * @returns {Uint8Array | null}
 */
export function parseAuthKey(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  let bytes;
  try { bytes = ub64(value); } catch { return null; }
  return bytes.length === AUTH_KEY_BYTES ? bytes : null;
}

export async function hashAuthKey(authKey) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(authKey, salt, SERVER_ITERATIONS);
  return `ckdf1$${SERVER_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

/** @returns {{ok: boolean, needsRehash: boolean}} */
export async function verifyAuthKey(authKey, stored) {
  if (!stored.startsWith('ckdf1$')) return { ok: false, needsRehash: false };
  const [, iter, salt, hash] = stored.split('$');
  const got = await pbkdf2(authKey, ub64(salt), Number(iter));
  // Any mismatch, not just a lower count, so changing SERVER_ITERATIONS in
  // either direction migrates rows on next sign-in.
  return { ok: equal(got, ub64(hash)), needsRehash: Number(iter) !== SERVER_ITERATIONS };
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
