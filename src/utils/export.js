import { state, resetState, getCleanData } from '../canvas/state.js';
import { setSelectedId } from '../canvas/state.js';
import { render } from '../canvas/render.js';
import { save } from '../sync/storage.js';
import { panel } from '../dom.js';
import { showToast } from './toast.js';

export function setupExport() {
  const fileInput = document.getElementById('file-input');

  document.getElementById('btn-export').addEventListener('click', () => {
    const clean = getCleanData();
    const blob  = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href = url;
    a.download = `nodebook-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported');
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
