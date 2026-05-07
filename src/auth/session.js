import { supabase } from '../sync/client.js';

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
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
