import { supabase } from './client.js';
import { state, getCleanData } from '../canvas/state.js';
import { setSyncStatus } from '../utils/sync-status.js';
import { saveLocal } from './storage.js';

let subscription = null;

// ── Graph list / CRUD ──────────────────────────────────────────────────────

export async function listGraphs(userId) {
  if (!supabase) return [];

  // Attempt 1: full schema with folder_id (migration 003 applied)
  const { data: d1, error: e1 } = await supabase
    .from('graphs')
    .select('id, title, folder_id, version, updated_at, data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (!e1) return d1 || [];

  // Attempt 2: without folder_id (migration 003 not yet applied)
  const { data: d2, error: e2 } = await supabase
    .from('graphs')
    .select('id, title, version, updated_at, data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (!e2) return (d2 || []).map(g => ({ ...g, folder_id: null }));

  // Attempt 3: minimal — covers any older schema variant
  const { data: d3, error: e3 } = await supabase
    .from('graphs')
    .select('id, version, updated_at, data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (!e3) return (d3 || []).map(g => ({ ...g, folder_id: null, title: 'My Graph' }));

  throw e3;
}

export async function fetchGraphById(graphId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('graphs')
    .select('*')
    .eq('id', graphId)
    .single();
  if (error || !data) return null;
  return { ...data.data, graphId: data.id, graphTitle: data.title, version: data.version };
}

export async function createGraph(userId, title = 'Untitled', folderId = null) {
  const { data, error } = await supabase
    .from('graphs')
    .insert({
      user_id:   userId,
      title,
      folder_id: folderId || null,
      data:      { nodes: {}, edges: [], view: { tx: 0, ty: 0, scale: 1 } },
      version:   1,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function renameGraph(id, title) {
  const { error } = await supabase.from('graphs').update({ title }).eq('id', id);
  if (error) throw error;
}

export async function deleteGraphs(ids) {
  const { error } = await supabase.from('graphs').delete().in('id', ids);
  if (error) throw error;
}

// ── Folder CRUD ────────────────────────────────────────────────────────────

export async function listFolders(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('folders')
    .select('id, name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) return []; // folders table may not exist yet (migration 003 not run)
  return data || [];
}

export async function createFolder(userId, name = 'New Folder') {
  const { data, error } = await supabase
    .from('folders')
    .insert({ user_id: userId, name })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function renameFolder(id, name) {
  const { error } = await supabase.from('folders').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteFolder(id) {
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) throw error;
}

export async function moveGraphsToFolder(ids, folderId) {
  const { error } = await supabase
    .from('graphs')
    .update({ folder_id: folderId || null })
    .in('id', ids);
  if (error) throw error;
}

// ── Active graph sync ──────────────────────────────────────────────────────

export async function pushGraph() {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const userId    = session.user.id;
  const graphData = getCleanData();

  try {
    if (state.graphId) {
      const { data: rows, error } = await supabase
        .from('graphs')
        .update({
          data:       graphData,
          title:      state.graphTitle || 'Untitled',
          version:    (state.version || 0) + 1,
          updated_at: new Date().toISOString(),
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
      state.graphId = null;
    }

    // INSERT (fallback — should rarely happen since picker always creates the row first)
    const { data, error } = await supabase
      .from('graphs')
      .insert({
        user_id: userId,
        title:   state.graphTitle || 'Untitled',
        data:    graphData,
        version: 1,
      })
      .select()
      .single();
    if (error) throw error;
    state.graphId = data.id;
    state.version = 1;
    saveLocal();
    setSyncStatus('synced');
    return true;
  } catch {
    if (!navigator.onLine) setSyncStatus('offline');
    return false;
  }
}

export function subscribeToGraph(graphId, onUpdate) {
  if (!supabase || subscription) return;
  subscription = supabase
    .channel(`graph-${graphId}`)
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'graphs',
      filter: `id=eq.${graphId}`,
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
