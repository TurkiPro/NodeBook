import { state, resetState } from '../canvas/state.js';
import { saveLocal } from './storage.js';

export function mergeFetch(remoteData) {
  const remoteVersion = remoteData.version || 0;
  const localVersion  = state.version   || 0;

  if (remoteVersion > localVersion) {
    resetState(remoteData);
    saveLocal();
    return true;
  }
  // Local is newer — nothing to do; queued push will sync local → cloud
  return false;
}
