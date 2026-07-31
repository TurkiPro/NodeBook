import { api, socketUrl, cloudEnabled } from './client.js';
import { state, getCleanData } from '../canvas/state.js';
import { setSyncStatus } from '../utils/sync-status.js';
import { saveLocal } from './storage.js';

// ── Graph list / CRUD ──────────────────────────────────────────────────────
// Signatures keep their userId parameter for call-site compatibility; the Worker
// scopes every query to the session cookie, so it is no longer sent.

export async function listGraphs(_userId) {
  if (!cloudEnabled) return [];
  return api('/graphs');
}

export async function fetchGraphById(graphId) {
  if (!cloudEnabled) return null;
  try {
    const g = await api(`/graphs/${graphId}`);
    return { ...g.data, graphId: g.id, graphTitle: g.title, version: g.version };
  } catch {
    return null;
  }
}

export async function createGraph(_userId, title = 'Untitled', folderId = null) {
  const { id } = await api('/graphs', { method: 'POST', body: { title, folderId } });
  return id;
}

export async function renameGraph(id, title) {
  await api(`/graphs/${id}`, { method: 'PATCH', body: { title } });
}

export async function deleteGraphs(ids) {
  await api('/graphs/delete', { method: 'POST', body: { ids } });
}

// ── Folder CRUD ────────────────────────────────────────────────────────────

export async function listFolders(_userId) {
  if (!cloudEnabled) return [];
  try {
    return await api('/folders');
  } catch {
    return [];
  }
}

export async function createFolder(_userId, name = 'New Folder') {
  const { id } = await api('/folders', { method: 'POST', body: { name } });
  return id;
}

export async function renameFolder(id, name) {
  await api(`/folders/${id}`, { method: 'PATCH', body: { name } });
}

export async function deleteFolder(id) {
  await api(`/folders/${id}`, { method: 'DELETE' });
}

export async function moveGraphsToFolder(ids, folderId) {
  await api('/graphs/move', { method: 'POST', body: { ids, folderId } });
}

// ── Active graph sync ──────────────────────────────────────────────────────

export async function pushGraph() {
  if (!cloudEnabled) return false;

  try {
    if (state.graphId) {
      // The server owns the version counter and returns the new value.
      const { version } = await api(`/graphs/${state.graphId}`, {
        method: 'PUT',
        body: { data: getCleanData(), title: state.graphTitle || 'Untitled' },
      });
      state.version = version;
      saveLocal();
      setSyncStatus('synced');
      return true;
    }

    // Fallback — the picker normally creates the row before the canvas opens.
    const id = await createGraph(null, state.graphTitle || 'Untitled');
    state.graphId = id;
    const { version } = await api(`/graphs/${id}`, {
      method: 'PUT',
      body: { data: getCleanData(), title: state.graphTitle || 'Untitled' },
    });
    state.version = version;
    saveLocal();
    setSyncStatus('synced');
    return true;
  } catch (e) {
    if (e.status === 404) state.graphId = null;   // row deleted elsewhere
    if (!navigator.onLine) setSyncStatus('offline');
    return false;
  }
}

// ── Realtime (Durable Object room, replaces postgres_changes) ───────────────

let socket      = null;
let keepalive   = null;
let retryTimer  = null;
let retryDelay  = 1000;
let closing     = false;

export function subscribeToGraph(graphId, onUpdate) {
  if (!cloudEnabled || socket) return;
  closing = false;
  connect(graphId, onUpdate);
}

function connect(graphId, onUpdate) {
  socket = new WebSocket(socketUrl(graphId));

  socket.addEventListener('open', () => {
    retryDelay = 1000;
    // Cloudflare drops idle sockets; a cheap ping keeps the room warm.
    clearInterval(keepalive);
    keepalive = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
    }, 25_000);
  });

  socket.addEventListener('message', (e) => {
    if (e.data === 'pong') return;
    try {
      const msg = JSON.parse(e.data);
      onUpdate({ ...msg.data, version: msg.version });
    } catch { /* ignore malformed frame */ }
  });

  socket.addEventListener('close', () => {
    clearInterval(keepalive);
    socket = null;
    if (closing) return;
    // Exponential backoff to 30 s — covers sleep/wake and flaky networks.
    retryTimer = setTimeout(() => connect(graphId, onUpdate), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  });

  socket.addEventListener('error', () => socket?.close());
}

export function unsubscribeFromGraph() {
  closing = true;
  clearTimeout(retryTimer);
  clearInterval(keepalive);
  if (socket) { socket.close(); socket = null; }
}
