export const state = {
  nodes: {},
  edges: [],
  view: { tx: 0, ty: 0, scale: 1 },
  graphId: null,
  version: 0
};

// DOM element refs live here — not in state — so JSON.stringify(state) is always clean
export const elMap = new Map();

export let selectedId = null;
export function setSelectedId(id) { selectedId = id; }

export let multiSelect = new Set();
export function setMultiSelect(ids) { multiSelect = new Set(ids); }

export let drag = null;
export function setDrag(d) { drag = d; }

export let pan = null;
export function setPan(p) { pan = p; }

export let connect = null;
export function setConnect(c) { connect = c; }

export function resetState(data) {
  state.nodes = data.nodes || {};
  state.edges = data.edges || [];
  state.view = data.view || { tx: 0, ty: 0, scale: 1 };
  if (data.graphId) state.graphId = data.graphId;
  state.version = data.version || 0;
  elMap.clear();
}

export function getCleanData() {
  return {
    nodes: Object.fromEntries(
      Object.entries(state.nodes).map(([id, n]) => [id, {
        id: n.id,
        x: n.x,
        y: n.y,
        title: n.title,
        note: n.note,
        color: n.color || ''
      }])
    ),
    edges: state.edges,
    view: state.view
  };
}
