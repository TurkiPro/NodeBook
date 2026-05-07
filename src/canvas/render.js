import { state, elMap, selectedId } from './state.js';
import { canvas, edgesSvg, status, wrap } from '../dom.js';

export function screenToWorld(sx, sy) {
  const rect = wrap.getBoundingClientRect();
  return {
    x: (sx - rect.left - state.view.tx) / state.view.scale,
    y: (sy - rect.top  - state.view.ty) / state.view.scale
  };
}

export function applyTransform() {
  const { tx, ty, scale } = state.view;
  canvas.style.transform   = `translate(${tx}px,${ty}px) scale(${scale})`;
  edgesSvg.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
}

export function curvePath(x1, y1, x2, y2) {
  const dx = (x2 - x1) * 0.4;
  return `M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
}

export function render() {
  canvas.innerHTML  = '';
  edgesSvg.innerHTML = '';
  elMap.clear();

  for (const id in state.nodes) {
    const n = state.nodes[id];
    const el = document.createElement('div');
    el.className = 'node';
    if (id === selectedId) el.classList.add('selected');
    if (n.note && n.note.trim()) el.classList.add('has-note');
    el.dataset.id = id;
    el.style.left = n.x + 'px';
    el.style.top  = n.y + 'px';

    const title = document.createElement('div');
    title.className = 'node-title';
    title.textContent = n.title || 'Untitled';
    el.appendChild(title);

    canvas.appendChild(el);
    elMap.set(id, el);
  }

  for (const e of state.edges) {
    const a   = state.nodes[e.from];
    const b   = state.nodes[e.to];
    const aEl = elMap.get(e.from);
    const bEl = elMap.get(e.to);
    if (!a || !b || !aEl || !bEl) continue;

    const ax = a.x + aEl.offsetWidth  / 2;
    const ay = a.y + aEl.offsetHeight / 2;
    const bx = b.x + bEl.offsetWidth  / 2;
    const by = b.y + bEl.offsetHeight / 2;
    const d  = curvePath(ax, ay, bx, by);

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('class', 'edge-hit');
    hit.setAttribute('d', d);
    hit.dataset.from = e.from;
    hit.dataset.to   = e.to;
    edgesSvg.appendChild(hit);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'edge');
    path.setAttribute('d', d);
    edgesSvg.appendChild(path);
  }

  const nc = Object.keys(state.nodes).length;
  const ec = state.edges.length;
  status.textContent = `${nc} node${nc !== 1 ? 's' : ''} · ${ec} link${ec !== 1 ? 's' : ''}`;

  applyTransform();
}
