import { supabase } from '../sync/client.js';

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user?.identities?.length === 0) {
    throw new Error('An account with this email already exists. Try signing in instead.');
  }
}

export async function signOut() {
  try { await supabase.auth.signOut(); } catch {}
  // Force-clear cached session even if the API call failed (e.g. project paused)
  Object.keys(localStorage)
    .filter(k => k.startsWith('sb-'))
    .forEach(k => localStorage.removeItem(k));
  window.location.reload();
}

export async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
}
