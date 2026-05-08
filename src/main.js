import './styles/tokens.css';
import './styles/topbar.css';
import './styles/canvas.css';
import './styles/panel.css';
import './styles/auth.css';
import './styles/dialog.css';
import './styles/picker.css';

import { state, resetState } from './canvas/state.js';
import { render } from './canvas/render.js';
import { loadLocal, save, onSave } from './sync/storage.js';
import { markDirty, onFlush, flush, cancelRetry } from './sync/queue.js';
import { pushGraph } from './sync/cloud.js';
import { supabase } from './sync/client.js';
import { setupInteractions } from './canvas/interactions.js';
import { setupKeyboard } from './canvas/keyboard.js';
import { setupPanelButtons, addNode } from './canvas/operations.js';
import { setupExport } from './utils/export.js';
import { initAuth, backToPicker } from './auth/index.js';
import { setSyncStatus } from './utils/sync-status.js';
import { btnBack } from './dom.js';

// Wire save → debounced cloud push
onSave(markDirty);
onFlush(pushGraph);
window.addEventListener('online', flush);
window.addEventListener('offline', () => { cancelRetry(); setSyncStatus('offline'); });

// Register all event listeners once
setupInteractions();
setupKeyboard();
setupPanelButtons();
setupExport();
btnBack.addEventListener('click', backToPicker);

if (supabase) {
  // Full mode: auth required, cloud sync enabled
  initAuth().catch(console.error);
} else {
  // Local-only mode — works like the original prototype (no account needed)
  initLocal();
}

function initLocal() {
  const data = loadLocal();
  if (data) resetState(data);

  if (Object.keys(state.nodes).length === 0) {
    const id = addNode(280, 200, 'Start here');
    const n  = state.nodes[id];
    if (n) {
      n.note =
        'Welcome to Nodebook.\n\n' +
        '• Double-click anywhere to create a node\n' +
        '• Click a node to open its note\n' +
        '• Drag to move, scroll to zoom\n' +
        '• Hold Shift + drag from a node to connect it to another\n' +
        '• Click a connection line to delete it\n' +
        '• Press N to add a node, Delete to remove the selected one\n' +
        '• Everything saves to your browser automatically\n' +
        '• Use Export to back up your notes as JSON\n\n' +
        "You can delete this node when you're ready.";
      save();
      render();
    }
  } else {
    render();
  }
}
