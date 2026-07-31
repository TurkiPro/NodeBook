import { showAuthForm, hideAuthForm } from './ui.js';
import { signOut, onAuthChange, getSessionUser } from './session.js';
import { showConfirm } from '../utils/dialog.js';
import { cancelPendingSave } from '../sync/storage.js';
import { fetchGraphById, unsubscribeFromGraph, subscribeToGraph } from '../sync/cloud.js';
import { state, resetState } from '../canvas/state.js';
import { render } from '../canvas/render.js';
import { showToast } from '../utils/toast.js';
import { hasPending, flush } from '../sync/queue.js';
import { mergeFetch } from '../sync/merge.js';
import { btnUser, btnBack, topbarGraphTitle } from '../dom.js';
import { setSyncStatus } from '../utils/sync-status.js';
import { showPicker, hidePicker } from '../picker/index.js';

let currentUser  = null;
let initialized  = false;

// ── Canvas visibility ───────────────────────────────────────────────────────
const topbarEl = document.getElementById('topbar');
const mainEl   = document.getElementById('main');

function showCanvas() {
  topbarEl.style.display = '';
  mainEl.style.display   = '';
  btnBack.style.display  = '';
  topbarGraphTitle.textContent = state.graphTitle || 'Untitled';
}

function hideCanvas() {
  topbarEl.style.display = 'none';
  mainEl.style.display   = 'none';
  btnBack.style.display  = 'none';
  topbarGraphTitle.textContent = '';
}

// ── Auth state helpers ──────────────────────────────────────────────────────
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

// ── Open a specific graph from picker ───────────────────────────────────────
async function openGraph(graphId, isNew = false) {
  hidePicker();
  showCanvas();
  setSyncStatus('synced');

  const graphData = await fetchGraphById(graphId);
  if (graphData) {
    resetState(graphData);
    render();
    topbarGraphTitle.textContent = state.graphTitle || 'Untitled';
  } else {
    // Freshly created graph — show empty canvas
    resetState({ nodes: {}, edges: [], view: { tx: 0, ty: 0, scale: 1 }, graphId, graphTitle: 'Untitled', version: 1 });
    render();
  }

  if (hasPending()) await flush();

  subscribeToGraph(graphId, (remoteData) => {
    const updated = mergeFetch(remoteData);
    if (updated) { render(); showToast('Graph updated from another device'); }
  });
}

// ── Back to picker ──────────────────────────────────────────────────────────
export async function backToPicker() {
  if (hasPending()) await flush();
  unsubscribeFromGraph();
  cancelPendingSave();
  resetState({ nodes: {}, edges: [], view: { tx: 0, ty: 0, scale: 1 } });
  render();
  hideCanvas();
  if (currentUser) await showPicker(currentUser, openGraph);
}

// ── Post-login: go to picker ────────────────────────────────────────────────
async function onLoggedIn(user) {
  currentUser = user;
  setSyncStatus('synced');
  hideCanvas();
  await showPicker(user, openGraph);
}

// ── initAuth ────────────────────────────────────────────────────────────────
export async function initAuth() {
  // Immediately hide canvas until we know the user is logged in AND has chosen a graph
  hideCanvas();

  // Fired by session.js after a successful sign-in / sign-up.
  onAuthChange(async (user) => {
    if (user) {
      if (initialized) return;
      initialized = true;
      applyUserUI(user);
      await onLoggedIn(user);
    } else {
      initialized = false;
      currentUser = null;
      cancelPendingSave();
      unsubscribeFromGraph();
      setSyncStatus('idle');
      hidePicker();
      hideCanvas();
      resetState({ nodes: {}, edges: [], view: { tx: 0, ty: 0, scale: 1 } });
      render();
      showAuthForm();
      btnUser.style.display = 'none';
    }
  });

  const user = await getSessionUser();
  if (user) {
    initialized = true;
    applyUserUI(user);
    await onLoggedIn(user);
  } else {
    showAuthForm();
  }
}
