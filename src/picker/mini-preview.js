const NS  = 'http://www.w3.org/2000/svg';
const NW  = 120;  // approx node width matching the canvas
const NH  = 36;
const PAD = 24;

const COLOR_MAP = {
  amber: '#3d2d14',
  rose:  '#2d1414',
  sage:  '#142d1c',
  sky:   '#141e2d',
  plum:  '#221427',
  teal:  '#142d2a',
};

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function buildMiniPreview(graphData) {
  const { nodes = {}, edges = [] } = graphData || {};
  const nodeList = Object.values(nodes);

  const svg = el('svg', { width: '100%', height: '100%' });

  if (nodeList.length === 0) {
    svg.setAttribute('viewBox', '0 0 240 130');
    const t = el('text', {
      x: 120, y: 65,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: '#26262d',
      'font-size': '11',
      'font-family': 'JetBrains Mono, monospace',
    });
    t.textContent = 'empty';
    svg.appendChild(t);
    return svg;
  }

  // Bounding box across all nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodeList) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NW);
    maxY = Math.max(maxY, n.y + NH);
  }

  const vw = maxX - minX + PAD * 2;
  const vh = maxY - minY + PAD * 2;
  svg.setAttribute('viewBox', `${minX - PAD} ${minY - PAD} ${vw} ${vh}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Edges (drawn first so they appear behind nodes)
  for (const edge of edges) {
    const a = nodes[edge.from];
    const b = nodes[edge.to];
    if (!a || !b) continue;
    const x1 = a.x + NW / 2, y1 = a.y + NH / 2;
    const x2 = b.x + NW / 2, y2 = b.y + NH / 2;
    const dx = Math.abs(x2 - x1) * 0.5;
    svg.appendChild(el('path', {
      d:              `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`,
      fill:           'none',
      stroke:         '#34343d',
      'stroke-width': '1.5',
    }));
  }

  // Nodes
  for (const n of nodeList) {
    const g = el('g');

    g.appendChild(el('rect', {
      x:      n.x,  y:      n.y,
      width:  NW,   height: NH,
      rx:     5,
      fill:   COLOR_MAP[n.color] || '#1a1a1f',
      stroke: '#2d2d3a',
      'stroke-width': '1',
    }));

    // Accent dot
    g.appendChild(el('circle', {
      cx: n.x + NW - 8, cy: n.y + 8,
      r: 2,
      fill: '#d4a574',
    }));

    svg.appendChild(g);
  }

  return svg;
}
