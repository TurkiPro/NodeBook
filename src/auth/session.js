import { supabase } from '../sync/client.js';

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message?.toLowerCase() || '';
    if (msg.includes('not confirmed')) error._tag = 'email_not_confirmed';
    else if (msg.includes('invalid') || error.status === 400) error._tag = 'invalid_credentials';
    throw error;
  }
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user?.identities?.length === 0) {
    const err = new Error('This email is already registered.');
    err._tag = 'email_exists';
    throw err;
  }
}

export async function signOut() {
  // Race signOut against a 3s timeout — when the project is paused the fetch hangs indefinitely
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise((_, reject) => setTimeout(() => reject(), 3000))
    ]);
  } catch {}
  // Clear only session tokens — nodebook.v1 (local graph cache) is deliberately kept
  Object.keys(localStorage)
    .filter(k => k.startsWith('sb-'))
    .forEach(k => localStorage.removeItem(k));
  sessionStorage.clear();
  window.location.href = '/';
}

export async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
}
