import { syncDot, syncLabel, syncChip } from '../dom.js';

const CLASSES = ['sync-dot--synced', 'sync-dot--pending', 'sync-dot--offline', 'sync-dot--error'];

const LABELS = {
  synced:  'Connected',
  pending: 'Saving…',
  offline: 'Offline',
  // Distinct from 'offline': the network is fine, the save was refused. Without
  // this the chip sat on "Saving…" forever, so a permanently failing sync looked
  // exactly like a slow one — the most misleading state the app could show.
  error:   'Not saved',
};

export function setSyncStatus(status, detail) {
  if (status === 'idle') {
    syncChip.style.display = 'none';
    return;
  }
  syncChip.style.display = '';
  syncChip.classList.toggle('sync-chip--error', status === 'error');
  syncChip.title = detail || '';
  CLASSES.forEach(c => syncDot.classList.remove(c));
  syncDot.classList.add(`sync-dot--${status}`);
  syncLabel.textContent = LABELS[status] || '';
}
