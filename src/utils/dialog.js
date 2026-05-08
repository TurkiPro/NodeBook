export function showPrompt({ message, placeholder = '', confirmText = 'Create' } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-card">
        <p class="dialog-message">${message}</p>
        <input class="dialog-input" type="text" placeholder="${placeholder}" autocomplete="off" spellcheck="false">
        <div class="dialog-actions">
          <button class="btn" id="dlg-cancel">Cancel</button>
          <button class="btn btn-destructive" id="dlg-confirm">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('.dialog-input');
    input.focus();
    const done = (val) => { document.body.removeChild(overlay); resolve(val); };
    overlay.querySelector('#dlg-cancel').onclick  = () => done(null);
    overlay.querySelector('#dlg-confirm').onclick = () => done(input.value.trim() || null);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  done(input.value.trim() || null);
      if (e.key === 'Escape') done(null);
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) done(null); });
  });
}

export function showConfirm({ message, confirmText = 'Confirm', cancelText = 'Cancel' } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog-card">
        <p class="dialog-message">${message}</p>
        <div class="dialog-actions">
          <button class="btn" id="dlg-cancel">${cancelText}</button>
          <button class="btn btn-destructive" id="dlg-confirm">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const done = (result) => { document.body.removeChild(overlay); resolve(result); };
    overlay.querySelector('#dlg-cancel').onclick  = () => done(false);
    overlay.querySelector('#dlg-confirm').onclick = () => done(true);
    overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
  });
}
