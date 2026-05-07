import { syncDot } from '../dom.js';

const CLASSES = ['sync-dot--idle', 'sync-dot--synced', 'sync-dot--pending', 'sync-dot--offline'];
const TITLES  = {
  idle:    'Not connected',
  synced:  'Synced',
  pending: 'Saving…',
  offline: 'Offline'
};

export function setSyncStatus(status) {
  CLASSES.forEach(c => syncDot.classList.remove(c));
  syncDot.classList.add(`sync-dot--${status}`);
  syncDot.title = TITLES[status] || '';
}
