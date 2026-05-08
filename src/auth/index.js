import { supabase } from '../sync/client.js';
import { showAuthForm, hideAuthForm } from './ui.js';
import { signOut } from './session.js';
import { showConfirm } from '../utils/dialog.js';
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

function applyUserUI(user) {
  hideAuthForm();
  const label = user.email?.split('@')[0] || 'Account';
  btnUser.textContent = label;
  btnUser.style.display = '';
  btnUser.onclick = async () => {
    const ok = await showConfirm({ message: 'Sign out of your account?', confirmText: 'Sign out' });
    if (ok) await signOut();
  };
}

export async function initAuth() {
  // Eagerly read the session from localStorage — resolves immediately without a network call,
  // so new tabs see the correct state before any async auth events fire.
  const { data: { session: initialSession } } = await supabase.auth.getSession();

  if (initialSession) {
    applyUserUI(initialSession.user);
    await onLoggedIn(initialSession.user);
  } else {
    showAuthForm();
  }

  // Handle future auth changes (sign-in, sign-out, token refresh).
  // Skip INITIAL_SESSION — already handled by getSession() above.
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION') return;

    if (session) {
      applyUserUI(session.user);
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
  // User is authenticated — show Connected immediately; pushGraph owns status from here
  setSyncStatus('synced');

  // Render cached local data immediately for instant startup
  const local = loadLocal();
  if (local) {
    resetState(local);
    render();
  }

  // Fetch cloud and merge — retry up to 3 times to handle projects waking from pause
  const trySync = async () => {
    const remote = await fetchGraph(user.id);
    if (remote) {
      const updated = mergeFetch(remote);
      if (updated) {
        render();
        showToast('Synced');
      }
    } else if (Object.keys(state.nodes).length === 0) {
      // New user — create welcome node
      const id = addNode(280, 200, 'Start here');
      if (state.nodes[id]) {
        state.nodes[id].note = WELCOME_NOTE;
        save();
        render();
      }
    }
  };

  const runWithRetry = async (delays = [5000, 15000]) => {
    try {
      await trySync();
    } catch {
      if (delays.length === 0) return;
      setTimeout(() => runWithRetry(delays.slice(1)), delays[0]);
    }
  };
  runWithRetry();

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
