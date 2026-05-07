import { toPng } from 'html-to-image';
import { state, resetState, getCleanData } from '../canvas/state.js';
import { setSelectedId } from '../canvas/state.js';
import { render, applyTransform } from '../canvas/render.js';
import { fitAll } from '../canvas/operations.js';
import { save } from '../sync/storage.js';
import { panel, wrap } from '../dom.js';
import { showToast } from './toast.js';

function dateStamp() { return new Date().toISOString().slice(0, 10); }

async function captureGraph() {
  const savedView = { ...state.view };
  fitAll();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    return await toPng(wrap, { pixelRatio: 2 });
  } finally {
    Object.assign(state.view, savedView);
    applyTransform();
  }
}

export function setupExport() {
  const fileInput = document.getElementById('file-input');

  document.getElementById('btn-export').addEventListener('click', () => {
    const clean = getCleanData();
    const blob  = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url;
    a.download = `nodebook-${dateStamp()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported JSON');
  });

  document.getElementById('btn-export-png').addEventListener('click', async () => {
    if (Object.keys(state.nodes).length === 0) { showToast('Nothing to export'); return; }
    showToast('Rendering…');
    try {
      const dataUrl = await captureGraph();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `nodebook-${dateStamp()}.png`;
      a.click();
      showToast('Exported PNG');
    } catch { showToast('PNG export failed'); }
  });

  document.getElementById('btn-export-pdf').addEventListener('click', async () => {
    if (Object.keys(state.nodes).length === 0) { showToast('Nothing to export'); return; }
    showToast('Rendering…');
    try {
      const dataUrl = await captureGraph();
      const img = new Image();
      img.src = dataUrl;
      await new Promise(r => { img.onload = r; });
      const { jsPDF } = await import('jspdf');
      const orientation = img.width > img.height ? 'l' : 'p';
      const pdf = new jsPDF({ orientation, unit: 'px', format: [img.width, img.height], hotfixes: ['px_scaling'] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);
      pdf.save(`nodebook-${dateStamp()}.pdf`);
      showToast('Exported PDF');
    } catch { showToast('PDF export failed'); }
  });

  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.nodes) throw new Error('Invalid file');
        if (Object.keys(state.nodes).length > 0) {
          if (!confirm('This will replace your current notes. Continue?')) return;
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
