import { state, resetState, getCleanData, elMap } from '../canvas/state.js';
import { setSelectedId } from '../canvas/state.js';
import { render } from '../canvas/render.js';
import { save } from '../sync/storage.js';
import { panel } from '../dom.js';
import { showToast } from './toast.js';
import { showConfirm } from './dialog.js';

function dateStamp() { return new Date().toISOString().slice(0, 10); }

function buildExportCanvas() {
  if (elMap.size === 0) return null;

  const PADDING = 80;
  const SCALE   = 2;  // retina

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [id, el] of elMap) {
    const n = state.nodes[id];
    if (!n) continue;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + el.offsetWidth);
    maxY = Math.max(maxY, n.y + el.offsetHeight);
  }
  if (!isFinite(minX)) return null;

  const ox = minX - PADDING;
  const oy = minY - PADDING;
  const gw = maxX - minX + PADDING * 2;
  const gh = maxY - minY + PADDING * 2;

  const cv = document.createElement('canvas');
  cv.width  = Math.round(gw * SCALE);
  cv.height = Math.round(gh * SCALE);
  cv.logicalWidth  = gw;
  cv.logicalHeight = gh;

  const ctx = cv.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = '#0e0e10';
  ctx.fillRect(0, 0, gw, gh);

  // Dot grid (matches the app's 24px spacing)
  ctx.fillStyle = '#26262d';
  const dot = 24;
  const sx = (((-ox) % dot) + dot) % dot;
  const sy = (((-oy) % dot) + dot) % dot;
  for (let x = sx; x < gw; x += dot) {
    for (let y = sy; y < gh; y += dot) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Edges
  ctx.strokeStyle = '#34343d';
  ctx.lineWidth = 1.5;
  for (const e of state.edges) {
    const a   = state.nodes[e.from];
    const b   = state.nodes[e.to];
    const aEl = elMap.get(e.from);
    const bEl = elMap.get(e.to);
    if (!a || !b || !aEl || !bEl) continue;
    const ax = a.x + aEl.offsetWidth  / 2 - ox;
    const ay = a.y + aEl.offsetHeight / 2 - oy;
    const bx = b.x + bEl.offsetWidth  / 2 - ox;
    const by = b.y + bEl.offsetHeight / 2 - oy;
    const dx = (bx - ax) * 0.4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.bezierCurveTo(ax + dx, ay, bx - dx, by, bx, by);
    ctx.stroke();
  }

  // Nodes
  for (const [id, el] of elMap) {
    const n = state.nodes[id];
    if (!n) continue;
    const x = n.x - ox, y = n.y - oy;
    const w = el.offsetWidth,  h = el.offsetHeight;
    const r = 6;

    // Rounded rectangle
    ctx.fillStyle   = '#1a1a1f';
    ctx.strokeStyle = '#34343d';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Title text (clipped to node bounds)
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, w - 2, h - 2);
    ctx.clip();
    ctx.fillStyle = '#e8e6e1';
    ctx.font      = '500 14px Fraunces, Georgia, serif';
    ctx.fillText(n.title || 'Untitled', x + 14, y + 23);
    ctx.restore();

    // Amber dot = has note
    if (n.note && n.note.trim()) {
      ctx.fillStyle = '#d4a574';
      ctx.beginPath();
      ctx.arc(x + w - 8, y + 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return cv;
}

export function setupExport() {
  const fileInput = document.getElementById('file-input');
  const dropdown  = document.getElementById('export-dropdown');
  const btnExport = document.getElementById('btn-export');

  btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown.classList.remove('open'));

  // JSON
  document.getElementById('btn-export-json').addEventListener('click', () => {
    dropdown.classList.remove('open');
    const blob = new Blob([JSON.stringify(getCleanData(), null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `nodebook-${dateStamp()}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('Exported JSON');
  });

  // PNG
  document.getElementById('btn-export-png').addEventListener('click', () => {
    dropdown.classList.remove('open');
    const cv = buildExportCanvas();
    if (!cv) { showToast('Nothing to export'); return; }
    cv.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = `nodebook-${dateStamp()}.png`; a.click();
      URL.revokeObjectURL(url);
      showToast('Exported PNG');
    }, 'image/png');
  });

  // PDF
  document.getElementById('btn-export-pdf').addEventListener('click', async () => {
    dropdown.classList.remove('open');
    const cv = buildExportCanvas();
    if (!cv) { showToast('Nothing to export'); return; }
    try {
      const dataUrl = cv.toDataURL('image/png');
      const w = cv.logicalWidth, h = cv.logicalHeight;
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: w > h ? 'l' : 'p',
        unit: 'px',
        format: [w, h],
        hotfixes: ['px_scaling']
      });
      pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
      pdf.save(`nodebook-${dateStamp()}.pdf`);
      showToast('Exported PDF');
    } catch { showToast('PDF export failed'); }
  });

  // Import
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.nodes) throw new Error('Invalid file');
        if (Object.keys(state.nodes).length > 0) {
          const ok = await showConfirm({ message: 'This will replace your current notes. Continue?', confirmText: 'Replace' });
          if (!ok) return;
        }
        resetState(parsed);
        setSelectedId(null);
        panel.classList.add('hidden');
        save();
        render();
        showToast('Imported');
      } catch (err) {
        showToast('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });
}
