import { api, socketUrl, cloudEnabled } from './client.js';
import { state, getCleanData } from '../canvas/state.js';
import { setSyncStatus } from '../utils/sync-status.js';
import { showToast } from '../utils/toast.js';
import { saveLocal } from './storage.js';

// ── Graph list / CRUD ──────────────────────────────────────────────────────
// Signatures keep their userId parameter for call-site compatibility; the Worker
// scopes every query to the session cookie, so it is no longer sent.

export async function listGraphs(_userId) {
  if (!cloudEnabled) return [];
  return api('/graphs');
}

/**
 * @returns the graph, or null only when the server confirms it does not exist.
 * Throws on every other failure — a network blip must not be reported as "empty
 * graph", because the caller renders that as a blank canvas and the next
 * autosave would push the blank over the real data.
 */
export async function fetchGraphById(graphId) {
  if (!cloudEnabled) return null;
  try {
    const g = await api(`/graphs/${graphId}`);
    return { ...g.data, graphId: g.id, graphTitle: g.title, version: g.version };
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
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
  // Deliberately not swallowed: this used to return [] on any failure, which
  // rendered every graph as ungrouped and looked exactly like "you have no
  // folders". Let it throw so the picker shows its load-failed panel instead.
  return api('/folders');
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

/** @returns {true | false | 'fatal'} — see the contract in sync/queue.js */
export async function pushGraph() {
  if (!cloudEnabled) return 'fatal';   // local-only: nothing to push, don't retry

  try {
    let id = state.graphId;
    if (!id) {
      // Fallback — the picker normally creates the row before the canvas opens.
      id = await createGraph(null, state.graphTitle || 'Untitled');
      state.graphId = id;
    }
    // The server owns the version counter and returns the new value.
    const { version } = await api(`/graphs/${id}`, {
      method: 'PUT',
      body: { data: getCleanData(), title: state.graphTitle || 'Untitled' },
    });
    state.version = version;
    saveLocal();
    setSyncStatus('synced');
    return true;
  } catch (e) {
    return reportPushFailure(e);
  }
}

function reportPushFailure(e) {
  // The local copy is already in localStorage, so nothing is lost either way —
  // what matters is that the user is told the cloud copy is behind.
  switch (e.status) {
    case 0:                                    // offline or unreachable
      setSyncStatus(e._tag === 'offline' ? 'offline' : 'error', e.message);
      return false;                            // worth retrying

    case 401:
      setSyncStatus('error', 'Your session expired.');
      showToast('Session expired — reload and sign in to keep syncing');
      return 'fatal';

    case 404:
      // Graph deleted from another device. Detach so the next push creates a
      // fresh row instead of retrying a write that can never land.
      state.graphId = null;
      setSyncStatus('error', 'This graph no longer exists on the server.');
      showToast('This graph was deleted elsewhere — your copy is local only');
      return 'fatal';

    case 400:
    case 413:
      setSyncStatus('error', e.message);
      showToast(e.message || 'This graph could not be saved');
      return 'fatal';

    default:
      setSyncStatus('error', e.message || 'Sync failed.');
      return false;                            // 5xx and friends — retry
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
  retryDelay = 1000;          // otherwise the next graph inherits a 30 s backoff
  if (socket) { socket.close(); socket = null; }
}
