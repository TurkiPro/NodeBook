import { setSyncStatus } from '../utils/sync-status.js';

const PENDING_KEY = 'nodebook.pending';

let _flushFn    = null;
let _timer      = null;
let _retryTimer = null;

export function onFlush(fn) { _flushFn = fn; }

export function markDirty() {
  localStorage.setItem(PENDING_KEY, '1');
  setSyncStatus('pending');
  clearTimeout(_timer);
  _timer = setTimeout(flush, 1500);
}

export async function flush() {
  clearTimeout(_retryTimer);
  if (!_flushFn) return;
  try {
    const pushed = await _flushFn();
    if (pushed !== false) {
      localStorage.removeItem(PENDING_KEY);
    } else if (hasPending()) {
      // Push failed (e.g. Supabase project paused) — retry in 30 s automatically
      _retryTimer = setTimeout(flush, 30_000);
    }
  } catch {
    if (hasPending()) _retryTimer = setTimeout(flush, 30_000);
  }
}

export function cancelRetry() {
  clearTimeout(_retryTimer);
}

export function hasPending() {
  return !!localStorage.getItem(PENDING_KEY);
}
