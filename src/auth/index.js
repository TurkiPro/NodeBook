import { supabase } from '../sync/client.js';
import { showAuthForm, hideAuthForm } from './ui.js';
import { signOut } from './session.js';
import { showConfirm } from '../utils/dialog.js';
import { loadLocal, save, cancelPendingSave } from '../sync/storage.js';
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
  let initialized = false;

  // getSession() reads from localStorage instantly when the token is valid.
  // When the token is expired it makes a network refresh — which hangs if the
  // Supabase project is paused. Race it against 1.5 s so the UI never freezes.
  let initialSession = null;
  try {
    const timeout = new Promise(resolve =>
      setTimeout(() => resolve({ data: { session: null } }), 1500)
    );
    const result = await Promise.race([supabase.auth.getSession(), timeout]);
    initialSession = result.data?.session ?? null;
  } catch {
    initialSession = null;
  }

  if (initialSession) {
    initialized = true;
    applyUserUI(initialSession.user);
    await onLoggedIn(initialSession.user);
  } else {
    showAuthForm();
  }

  // Handle future auth changes (sign-in, sign-out, token refresh after a slow wake-up).
  supabase.auth.onAuthStateChange(async (event, session) => {
    // Skip INITIAL_SESSION — already handled by getSession() above.
    // For TOKEN_REFRESHED / SIGNED_IN after we're already logged in, also skip.
    if (event === 'INITIAL_SESSION') return;

    if (session) {
      if (initialized) return;
      initialized = true;
      applyUserUI(session.user);
      await onLoggedIn(session.user);
    } else {
      initialized = false;
      cancelPendingSave(); // prevent a queued save from writing empty state to localStorage
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
  // Mark this browser as having seen the app — prevents welcome node from appearing on re-login
  localStorage.setItem('nodebook.seen', '1');

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
    } else if (Object.keys(state.nodes).length === 0 && !localStorage.getItem('nodebook.seen')) {
      // Genuinely new user — create welcome node once, then never again
      localStorage.setItem('nodebook.seen', '1');
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
