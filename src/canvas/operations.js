import { state, selectedId, setSelectedId, elMap } from './state.js';
import { render, screenToWorld } from './render.js';
import { panel, titleInput, noteInput, wrap } from '../dom.js';
import { generateId } from '../utils/id.js';
import { save, debouncedSave } from '../sync/storage.js';

export function addNode(x, y, title) {
  const id = generateId();
  state.nodes[id] = { id, x: x ?? 100, y: y ?? 100, title: title ?? '', note: '' };
  save();
  render();
  selectNode(id);
  setTimeout(() => titleInput.focus(), 50);
  return id;
}

export function deleteNode(id) {
  delete state.nodes[id];
  state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
  if (selectedId === id) {
    setSelectedId(null);
    panel.classList.add('hidden');
  }
  save();
  render();
}

export function selectNode(id) {
  setSelectedId(id);
  const n = state.nodes[id];
  if (!n) {
    panel.classList.add('hidden');
    render();
    return;
  }
  titleInput.value = n.title || '';
  noteInput.value  = n.note  || '';
  panel.classList.remove('hidden');
  render();
}

export function deselect() {
  setSelectedId(null);
  panel.classList.add('hidden');
  render();
}

export function setupPanelButtons() {
  document.getElementById('btn-close').addEventListener('click', deselect);

  document.getElementById('btn-delete').addEventListener('click', () => {
    if (!selectedId) return;
    const n = state.nodes[selectedId];
    if (confirm(`Delete "${n.title || 'Untitled'}" and its connections?`)) {
      deleteNode(selectedId);
    }
  });

  document.getElementById('btn-add').addEventListener('click', () => {
    const rect = wrap.getBoundingClientRect();
    const w = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    addNode(w.x - 60, w.y - 18);
  });

  titleInput.addEventListener('input', () => {
    if (!selectedId) return;
    state.nodes[selectedId].title = titleInput.value;
    render();
    debouncedSave();
  });

  noteInput.addEventListener('input', () => {
    if (!selectedId) return;
    state.nodes[selectedId].note = noteInput.value;
    const el = elMap.get(selectedId);
    if (el) {
      el.classList.toggle('has-note', !!noteInput.value.trim());
    }
    debouncedSave();
  });
}
