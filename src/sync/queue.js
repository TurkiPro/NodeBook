import { setSyncStatus } from '../utils/sync-status.js';

const PENDING_KEY = 'nodebook.pending';

let _flushFn = null;
let _timer = null;

export function onFlush(fn) {
  _flushFn = fn;
  // When the browser regains connectivity, flush any queued writes
  window.addEventListener('online', () => {
    if (hasPending()) flush();
  });
  window.addEventListener('offline', () => {
    setSyncStatus('offline');
  });
}

export function markDirty() {
  localStorage.setItem(PENDING_KEY, '1');
  clearTimeout(_timer);
  _timer = setTimeout(flush, 1500);
}

export async function flush() {
  if (!_flushFn) return;
  try {
    const pushed = await _flushFn();
    // Only clear pending if the push actually succeeded (returned true)
    if (pushed !== false) {
      localStorage.removeItem(PENDING_KEY);
    }
  } catch {
    // silent — offline or not logged in; pending flag stays for next attempt
  }
}

export function hasPending() {
  return !!localStorage.getItem(PENDING_KEY);
}
