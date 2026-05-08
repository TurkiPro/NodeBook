import { supabase } from './client.js';
import { state, getCleanData } from '../canvas/state.js';
import { setSyncStatus } from '../utils/sync-status.js';
import { saveLocal } from './storage.js';

let subscription = null;

export async function fetchGraph(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('graphs')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data.data, graphId: data.id, version: data.version };
}

export async function pushGraph() {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const userId    = session.user.id;
  const graphData = getCleanData();

  try {
    if (state.graphId) {
      // UPDATE — check that a row was actually affected; if not, fall through to INSERT
      const { data: rows, error } = await supabase
        .from('graphs')
        .update({
          data: graphData,
          version: (state.version || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', state.graphId)
        .eq('user_id', userId)
        .select('id');

      if (!error && rows && rows.length > 0) {
        state.version = (state.version || 0) + 1;
        saveLocal();
        setSyncStatus('synced');
        return true;
      }
      // Row missing — clear graphId and fall through to INSERT below
      state.graphId = null;
    }

    // INSERT (new user or recovered missing row)
    const { data, error } = await supabase
      .from('graphs')
      .insert({ user_id: userId, data: graphData, version: 1 })
      .select()
      .single();
    if (error) throw error;
    state.graphId = data.id;
    state.version = 1;
    saveLocal();
    setSyncStatus('synced');
    return true;
  } catch {
    // Only show Offline when the browser has no network — Supabase project
    // pausing is a transient failure; the queue will retry automatically.
    if (!navigator.onLine) setSyncStatus('offline');
    return false;
  }
}

export function subscribeToGraph(userId, onUpdate) {
  if (!supabase || subscription) return;
  subscription = supabase
    .channel('graph-changes')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'graphs',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      onUpdate({ ...payload.new.data, version: payload.new.version });
    })
    .subscribe();
}

export function unsubscribeFromGraph() {
  if (subscription && supabase) {
    supabase.removeChannel(subscription);
    subscription = null;
  }
}
