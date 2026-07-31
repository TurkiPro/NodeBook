import { api, cloudEnabled } from '../sync/client.js';
import { deriveAuthKey, MIN_PASSWORD } from './crypto.js';

// GoTrue's onAuthStateChange is gone; this is the replacement signal that
// auth/index.js listens on to swap between the auth form and the picker.
let listener = null;
export function onAuthChange(fn) { listener = fn; }

/** @returns {{id, email} | null} — resolves the HttpOnly session cookie. */
export async function getSessionUser() {
  if (!cloudEnabled) return null;
  try {
    const { user } = await api('/auth/me');
    return user;
  } catch {
    return null;                      // 401, or the API is unreachable
  }
}

export async function signIn(email, password) {
  const authKey = await deriveAuthKey(email, password);
  const { user } = await api('/auth/signin', { method: 'POST', body: { email, authKey } });
  listener?.(user);
}

export async function signUp(email, password) {
  // The server never sees the password, so it cannot enforce a length floor —
  // that check has to live here. ui.js switches on _tag to render the message.
  if (String(password).length < MIN_PASSWORD) {
    const err = new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
    err._tag = 'weak_password';
    throw err;
  }
  const authKey = await deriveAuthKey(email, password);
  // No confirmation email — the Worker signs the new account straight in.
  const { user } = await api('/auth/signup', { method: 'POST', body: { email, authKey } });
  listener?.(user);
}

export async function signOut() {
  try {
    await Promise.race([
      api('/auth/signout', { method: 'POST' }),
      new Promise((_, reject) => setTimeout(reject, 3000)),
    ]);
  } catch { /* clear locally regardless */ }
  // nodebook.v1 (the offline graph cache) is deliberately kept.
  sessionStorage.clear();
  window.location.href = '/';
}
