import { supabase } from '../sync/client.js';
import { showAuthForm, hideAuthForm } from './ui.js';
import { signOut } from './session.js';
import { loadLocal, save } from '../sync/storage.js';
import { fetchGraph, subscribeToGraph, unsubscribeFromGraph } from '../sync/cloud.js';
import { state, resetState } from '../canvas/state.js';
import { render } from '../canvas/render.js';
import { showToast } from '../utils/toast.js';
import { hasPending, flush } from '../sync/queue.js';
import { mergeFetch } from '../sync/merge.js';
import { addNode } from '../canvas/operations.js';
import { btnUser } from '../dom.js';
import { setSyncStatus } from '../utils/sync-status.js';

const WELCOME_NOTE =
  'Welcome to Nodebook.\n\n' +
  '• Double-click anywhere to create a node\n' +
  '• Click a node to open its note\n' +
  '• Drag to move, scroll to zoom\n' +
  '• Hold Shift + drag from a node to connect it to another\n' +
  '• Click a connection line to delete it\n' +
  '• Press N to add a node, Delete to remove the selected one\n' +
  '• Your notes sync automatically across all your devices\n\n' +
  "You can delete this node when you're ready.";

export function initAuth() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      hideAuthForm();
      const label = session.user.email?.split('@')[0] || 'Account';
      btnUser.textContent = label;
      btnUser.style.display = '';
      btnUser.onclick = async () => {
        if (confirm('Sign out?')) await signOut();
      };
      await onLoggedIn(session.user);
    } else {
      unsubscribeFromGraph();
      setSyncStatus('idle');
      resetState({ nodes: {}, edges: [], view: { tx: 0, ty: 0, scale: 1 } });
      render();
      showAuthForm();
      btnUser.style.display = 'none';
    }
  });
}

async function onLoggedIn(user) {
  // Render cached local data immediately for instant startup
  const local = loadLocal();
  if (local) {
    resetState(local);
    render();
  }

  // Fetch cloud and merge
  try {
    const remote = await fetchGraph(user.id);
    if (remote) {
      const updated = mergeFetch(remote);
      if (updated) {
        render();
        showToast('Synced');
      }
      setSyncStatus('synced');
    } else if (Object.keys(state.nodes).length === 0) {
      // New user — create welcome node
      const id = addNode(280, 200, 'Start here');
      if (state.nodes[id]) {
        state.nodes[id].note = WELCOME_NOTE;
        save();
        render();
      }
    }
  } catch {
    showToast('Offline — using local copy');
    setSyncStatus('offline');
    if (Object.keys(state.nodes).length === 0) render();
  }

  // Flush any writes that happened before login
  if (hasPending()) await flush();

  // Subscribe to real-time updates from other devices
  subscribeToGraph(user.id, (remoteData) => {
    const updated = mergeFetch(remoteData);
    if (updated) {
      render();
      showToast('Graph updated from another device');
    }
  });
}
