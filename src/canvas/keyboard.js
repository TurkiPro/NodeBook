import { state, selectedId } from './state.js';
import { deselect, deleteNode, addNode } from './operations.js';
import { screenToWorld } from './render.js';
import { wrap, titleInput, noteInput } from '../dom.js';

export function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === titleInput || document.activeElement === noteInput) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    if (e.key === 'Escape') {
      deselect();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      const n = state.nodes[selectedId];
      if (confirm(`Delete "${n.title || 'Untitled'}"?`)) {
        deleteNode(selectedId);
      }
    } else if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
      const rect = wrap.getBoundingClientRect();
      const w    = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
      addNode(w.x - 60, w.y - 18);
    }
  });
}
