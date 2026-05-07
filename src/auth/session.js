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
  await supabase.auth.signOut();
}

export async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
}
