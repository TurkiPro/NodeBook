import { state, selectedId, setSelectedId, elMap, multiSelect, setMultiSelect } from './state.js';
import { render, screenToWorld, applyTransform } from './render.js';
import { panel, titleInput, noteInput, wrap } from '../dom.js';
import { generateId } from '../utils/id.js';
import { save, debouncedSave } from '../sync/storage.js';
import { showConfirm } from '../utils/dialog.js';

export function addNode(x, y, title) {
  const id = generateId();
  state.nodes[id] = { id, x: x ?? 100, y: y ?? 100, title: title ?? '', note: '', color: '' };
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

export function deleteMultiple(ids) {
  for (const id of ids) {
    delete state.nodes[id];
    state.edges = state.edges.filter(e => e.from !== id && e.to !== id);
  }
  setMultiSelect(new Set());
  setSelectedId(null);
  panel.classList.add('hidden');
  save();
  render();
}

export function selectNode(id) {
  setSelectedId(id);
  setMultiSelect(new Set());

  const n = state.nodes[id];
  if (!n) {
    panel.classList.add('hidden');
    render();
    return;
  }

  // Switch panel to single mode
  document.getElementById('panel-single').classList.remove('hidden');
  document.getElementById('panel-multi').classList.add('hidden');

  titleInput.value = n.title || '';
  noteInput.value  = n.note  || '';
  panel.classList.remove('hidden');

  // Sync color picker
  const color = n.color || '';
  document.querySelectorAll('.color-swatch').forEach(s =>
    s.classList.toggle('active', s.dataset.color === color)
  );

  // Sync connections section
  updateConnectionsSection(id);

  render();
}

export function showMultiPanel(count) {
  document.getElementById('panel-single').classList.add('hidden');
  document.getElementById('panel-multi').classList.remove('hidden');
  document.getElementById('panel-multi-count').textContent =
    `${count} node${count !== 1 ? 's' : ''} selected`;
  panel.classList.remove('hidden');
}

function updateConnectionsSection(id) {
  const edges = state.edges.filter(e => e.from === id || e.to === id);
  const connSection = document.getElementById('connections-section');
  const connList    = document.getElementById('connections-list');

  if (edges.length === 0) {
    connSection.classList.add('hidden');
    return;
  }

  connSection.classList.remove('hidden');
  connList.innerHTML = edges.map(e => {
    const otherId = e.from === id ? e.to : e.from;
    const other   = state.nodes[otherId];
    if (!other) return '';
    const label = other.title || 'Untitled';
    return `<button class="conn-item" data-id="${otherId}">${label}</button>`;
  }).filter(Boolean).join('');
}

export function deselect() {
  setSelectedId(null);
  setMultiSelect(new Set());
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

  document.getElementById('btn-delete-multi').addEventListener('click', async () => {
    if (multiSelect.size === 0) return;
    const count = multiSelect.size;
    const ok = await showConfirm({
      message: `Delete ${count} node${count !== 1 ? 's' : ''} and their connections?`,
      confirmText: 'Delete'
    });
    if (ok) deleteMultiple(new Set(multiSelect));
  });

  document.getElementById('btn-add').addEventListener('click', () => {
    const rect = wrap.getBoundingClientRect();
    const w = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    addNode(w.x - 60, w.y - 18);
  });

  titleInput.addEventListener('input', () => {
    if (!selectedId) return;
    state.nodes[selectedId].title = titleInput.value;
    // Update connections list in other panels if open
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

  document.getElementById('color-picker').addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch || !selectedId) return;
    const color = swatch.dataset.color;
    state.nodes[selectedId].color = color;
    document.querySelectorAll('.color-swatch').forEach(s =>
      s.classList.toggle('active', s.dataset.color === color)
    );
    render();
    debouncedSave();
  });

  document.getElementById('connections-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.conn-item');
    if (!btn) return;
    selectNode(btn.dataset.id);
  });
}
