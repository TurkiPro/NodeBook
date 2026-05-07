import { state, selectedId, setSelectedId, elMap } from './state.js';
import { render, screenToWorld, applyTransform } from './render.js';
import { panel, titleInput, noteInput, wrap } from '../dom.js';
import { generateId } from '../utils/id.js';
import { save, debouncedSave } from '../sync/storage.js';
import { showConfirm } from '../utils/dialog.js';

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

export function fitAll() {
  if (elMap.size === 0) return;
  const PADDING = 80;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [id, el] of elMap) {
    const n = state.nodes[id];
    if (!n) continue;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + el.offsetWidth);
    maxY = Math.max(maxY, n.y + el.offsetHeight);
  }
  if (!isFinite(minX)) return;
  const graphW = maxX - minX + PADDING * 2;
  const graphH = maxY - minY + PADDING * 2;
  const scale  = Math.max(0.15, Math.min(wrap.clientWidth / graphW, wrap.clientHeight / graphH, 1.0));
  state.view.scale = scale;
  state.view.tx = (wrap.clientWidth  - graphW * scale) / 2 - (minX - PADDING) * scale;
  state.view.ty = (wrap.clientHeight - graphH * scale) / 2 - (minY - PADDING) * scale;
  applyTransform();
  render();
}

export function setupPanelButtons() {
  document.getElementById('btn-close').addEventListener('click', deselect);

  document.getElementById('btn-delete').addEventListener('click', async () => {
    if (!selectedId) return;
    const n = state.nodes[selectedId];
    const ok = await showConfirm({ message: `Delete "${n.title || 'Untitled'}" and its connections?`, confirmText: 'Delete' });
    if (ok) deleteNode(selectedId);
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
