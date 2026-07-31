import { api, cloudEnabled } from '../sync/client.js';

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
  const { user } = await api('/auth/signin', { method: 'POST', body: { email, password } });
  listener?.(user);
}

export async function signUp(email, password) {
  // No confirmation email — the Worker signs the new account straight in.
  const { user } = await api('/auth/signup', { method: 'POST', body: { email, password } });
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
