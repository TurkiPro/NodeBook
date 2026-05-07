import { getCleanData } from '../canvas/state.js';
import { showToast } from '../utils/toast.js';

const STORAGE_KEY = 'nodebook.v1';

let _onSave = null;
let _saveTimer = null;

export function onSave(fn) { _onSave = fn; }

export function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getCleanData()));
  } catch (e) {
    showToast('Save failed: ' + e.message);
  }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.nodes) return parsed;
  } catch (e) {
    console.warn('Load failed', e);
  }
  return null;
}

export function save() {
  saveLocal();
  _onSave?.();
}

export function debouncedSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(save, 300);
}
