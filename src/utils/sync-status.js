import { syncDot, syncLabel, syncChip } from '../dom.js';

const CLASSES = ['sync-dot--synced', 'sync-dot--pending', 'sync-dot--offline'];
const LABELS  = { synced: 'Saved', pending: 'Saving…', offline: 'Offline' };

export function setSyncStatus(status) {
  if (status === 'idle') {
    syncChip.style.display = 'none';
    return;
  }
  syncChip.style.display = '';
  CLASSES.forEach(c => syncDot.classList.remove(c));
  syncDot.classList.add(`sync-dot--${status}`);
  syncLabel.textContent = LABELS[status] || '';
}
