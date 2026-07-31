// Client-side key derivation.
//
// The browser does the expensive work, not the Worker: PBKDF2 at the full OWASP
// iteration count runs here (~100 ms, hidden behind the button's spinner), and
// the plaintext password never leaves the device. The server only ever sees the
// 256-bit derived key, which it salts and hashes cheaply before storing.
//
// That inverts the usual free-tier compromise. Cracking a stolen database still
// costs a full 210k-iteration PBKDF2 per password guess, but the Worker spends
// well under a millisecond per sign-in instead of ~85 ms.
//
// The salt is derived from the email rather than fetched from the server: a
// /salt?email=… endpoint would tell anyone who asks which addresses are
// registered. A salt only needs to be unique per user, not secret.

const ITERATIONS = 210_000;
const enc = new TextEncoder();

export const MIN_PASSWORD = 12;

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

/** @returns {string} base64 of 32 bytes — what the API takes in place of a password. */
export async function deriveAuthKey(email, password) {
  const addr = String(email).trim().toLowerCase();
  const salt = await sha256(enc.encode(`nodebook|v1|${addr}`));
  const key  = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
