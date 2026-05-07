import { toastEl } from '../dom.js';

let timer = null;

export function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}
