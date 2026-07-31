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

/**
 * The flush callback returns:
 *   true    — saved; clear the dirty flag
 *   'fatal' — refused for a reason retrying cannot fix (expired session, payload
 *             too large, malformed graph). Keep the local copy, stop retrying,
 *             and leave the UI showing an error. Hammering the server every 30 s
 *             forever helped nobody and hid the problem behind "Saving…".
 *   false   — transient (offline, 5xx); retry on a timer
 */
export async function flush() {
  clearTimeout(_retryTimer);
  if (!_flushFn) return;
  try {
    const result = await _flushFn();
    if (result === true) {
      localStorage.removeItem(PENDING_KEY);
    } else if (result !== 'fatal' && hasPending()) {
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
