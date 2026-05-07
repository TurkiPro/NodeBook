import { state, selectedId, multiSelect } from './state.js';
import { deselect, deleteNode, deleteMultiple, addNode, fitAll } from './operations.js';
import { screenToWorld } from './render.js';
import { wrap, titleInput, noteInput } from '../dom.js';
import { showConfirm } from '../utils/dialog.js';

export function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === titleInput || document.activeElement === noteInput) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    if (e.key === 'Escape') {
      deselect();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedId || multiSelect.size > 0)) {
      if (multiSelect.size > 0) {
        const count = multiSelect.size;
        showConfirm({ message: `Delete ${count} node${count !== 1 ? 's' : ''} and their connections?`, confirmText: 'Delete' })
          .then(ok => { if (ok) deleteMultiple(new Set(multiSelect)); });
      } else {
        const n = state.nodes[selectedId];
        showConfirm({ message: `Delete "${n.title || 'Untitled'}"?`, confirmText: 'Delete' })
          .then(ok => { if (ok) deleteNode(selectedId); });
      }
    } else if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
      const rect = wrap.getBoundingClientRect();
      const w    = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      addNode(w.x - 60, w.y - 18);
    } else if (e.key === 'f' && !e.metaKey && !e.ctrlKey) {
      fitAll();
    }
  });
}
