import { state, drag, setDrag, pan, setPan, connect, setConnect, elMap } from './state.js';
import { render, screenToWorld, applyTransform, curvePath } from './render.js';
import { wrap, edgesSvg } from '../dom.js';
import { addNode, selectNode } from './operations.js';
import { save } from '../sync/storage.js';

export function setupInteractions() {
  wrap.addEventListener('dblclick', onDblClick);
  wrap.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  wrap.addEventListener('wheel', onWheel, { passive: false });
}

function onDblClick(e) {
  if (e.target.closest('.node') || e.target.closest('.edge-hit')) return;
  const w = screenToWorld(e.clientX, e.clientY);
  addNode(w.x - 60, w.y - 18);
}

function onMouseDown(e) {
  if (e.button !== 0) return;

  const nodeEl = e.target.closest('.node');
  if (nodeEl) {
    const id = nodeEl.dataset.id;
    const n  = state.nodes[id];
    const w  = screenToWorld(e.clientX, e.clientY);

    if (e.shiftKey || e.altKey) {
      setConnect({ fromId: id, x: e.clientX, y: e.clientY });
      nodeEl.classList.add('connect-source');
      wrap.classList.add('connecting');
    } else {
      setDrag({ id, offsetX: w.x - n.x, offsetY: w.y - n.y, moved: false });
      nodeEl.classList.add('dragging');
    }
    e.preventDefault();
    return;
  }

  const edgeHit = e.target.closest('.edge-hit');
  if (edgeHit) {
    const { from, to } = edgeHit.dataset;
    if (confirm('Delete this connection?')) {
      state.edges = state.edges.filter(ed => !(ed.from === from && ed.to === to));
      save();
      render();
    }
    return;
  }

  setPan({ sx: e.clientX, sy: e.clientY, tx: state.view.tx, ty: state.view.ty });
  wrap.classList.add('panning');
}

function onMouseMove(e) {
  if (drag) {
    const w = screenToWorld(e.clientX, e.clientY);
    const n = state.nodes[drag.id];
    n.x = w.x - drag.offsetX;
    n.y = w.y - drag.offsetY;
    drag.moved = true;
    render();
  } else if (pan) {
    state.view.tx = pan.tx + (e.clientX - pan.sx);
    state.view.ty = pan.ty + (e.clientY - pan.sy);
    applyTransform();
  } else if (connect) {
    connect.x = e.clientX;
    connect.y = e.clientY;
    drawTempEdge();
  }
}

function onMouseUp(e) {
  if (drag) {
    const el = elMap.get(drag.id);
    if (el) el.classList.remove('dragging');
    if (!drag.moved) {
      selectNode(drag.id);
    } else {
      save();
    }
    setDrag(null);
  }

  if (pan) {
    setPan(null);
    wrap.classList.remove('panning');
    save();
  }

  if (connect) {
    const target     = document.elementFromPoint(e.clientX, e.clientY);
    const targetNode = target?.closest('.node');
    const sourceEl   = elMap.get(connect.fromId);
    if (sourceEl) sourceEl.classList.remove('connect-source');

    if (targetNode && targetNode.dataset.id !== connect.fromId) {
      const toId   = targetNode.dataset.id;
      const exists = state.edges.some(ed =>
        (ed.from === connect.fromId && ed.to === toId) ||
        (ed.from === toId && ed.to === connect.fromId)
      );
      if (!exists) {
        state.edges.push({ from: connect.fromId, to: toId });
        save();
      }
    }

    setConnect(null);
    wrap.classList.remove('connecting');
    clearTempEdge();
    render();
  }
}

function drawTempEdge() {
  clearTempEdge();
  const from   = state.nodes[connect.fromId];
  const fromEl = elMap.get(connect.fromId);
  if (!from || !fromEl) return;

  const fr = fromEl.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  const s  = state.view.scale;

  const x1 = (fr.left + fr.width  / 2 - wr.left - state.view.tx) / s;
  const y1 = (fr.top  + fr.height / 2 - wr.top  - state.view.ty) / s;
  const x2 = (connect.x - wr.left - state.view.tx) / s;
  const y2 = (connect.y - wr.top  - state.view.ty) / s;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('id', 'temp-edge');
  path.setAttribute('d', curvePath(x1, y1, x2, y2));
  edgesSvg.appendChild(path);
}

function clearTempEdge() {
  document.getElementById('temp-edge')?.remove();
}

function onWheel(e) {
  e.preventDefault();
  const delta    = -e.deltaY * 0.0015;
  const newScale = Math.min(2.5, Math.max(0.3, state.view.scale * (1 + delta)));
  const ratio    = newScale / state.view.scale;
  const rect     = wrap.getBoundingClientRect();
  const mx       = e.clientX - rect.left;
  const my       = e.clientY - rect.top;

  state.view.tx    = mx - (mx - state.view.tx) * ratio;
  state.view.ty    = my - (my - state.view.ty) * ratio;
  state.view.scale = newScale;

  applyTransform();
}
