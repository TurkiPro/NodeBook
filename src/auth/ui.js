import { signIn, signUp } from './session.js';
import { showToast } from '../utils/toast.js';
import { authRoot } from '../dom.js';
import { startPong } from './pong.js';

let stopPong = null;

export function showAuthForm() {
  authRoot.innerHTML = `
    <div class="auth-overlay">
      <canvas id="pong-canvas" class="pong-canvas"></canvas>
      <div class="auth-card">
        <div class="auth-brand">node<span>·</span>book</div>
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Sign in</button>
          <button class="auth-tab" data-tab="signup">Create account</button>
        </div>
        <p class="auth-message" id="auth-message"></p>
        <div class="auth-form">
          <input type="email"    id="auth-email"    placeholder="Email"    autocomplete="email">
          <input type="password" id="auth-password" placeholder="Password" autocomplete="current-password">
          <div class="auth-confirm-row" id="auth-confirm-row">
            <input type="password" id="auth-confirm" placeholder="Confirm password" autocomplete="new-password">
            <p class="pw-match" id="pw-match"></p>
          </div>
          <button class="auth-submit" id="auth-submit">Sign in</button>
        </div>
      </div>
    </div>
  `;

  if (stopPong) { stopPong(); stopPong = null; }
  stopPong = startPong(authRoot.querySelector('#pong-canvas'));

  let mode = 'login';

  const emailEl    = authRoot.querySelector('#auth-email');
  const passEl     = authRoot.querySelector('#auth-password');
  const confirmEl  = authRoot.querySelector('#auth-confirm');
  const matchEl    = authRoot.querySelector('#pw-match');
  const confirmRow = authRoot.querySelector('#auth-confirm-row');
  const submitBtn  = authRoot.querySelector('#auth-submit');
  const msgEl      = authRoot.querySelector('#auth-message');

  function showAuthMessage(text, type = 'info') {
    msgEl.textContent = text;
    msgEl.className = `auth-message auth-message--${type}`;
  }

  function clearAuthMessage() {
    msgEl.textContent = '';
    msgEl.className = 'auth-message';
  }

  function switchTab(tabName) {
    mode = tabName;
    authRoot.querySelectorAll('.auth-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tabName)
    );
    submitBtn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
    passEl.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';

    if (mode === 'signup') {
      confirmRow.classList.add('visible');
    } else {
      confirmRow.classList.remove('visible');
      confirmEl.value = '';
      matchEl.textContent = '';
      matchEl.className = 'pw-match';
      passEl.classList.remove('pw-ok');
      confirmEl.classList.remove('pw-ok');
    }
  }

  authRoot.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => { clearAuthMessage(); switchTab(tab.dataset.tab); });
  });

  function checkMatch() {
    if (mode !== 'signup' || !confirmEl.value) {
      matchEl.textContent = '';
      matchEl.className = 'pw-match';
      passEl.classList.remove('pw-ok');
      confirmEl.classList.remove('pw-ok');
      return;
    }

    if (passEl.value === confirmEl.value) {
      passEl.classList.add('pw-ok');
      confirmEl.classList.add('pw-ok');
      // Force re-animation by removing then re-adding the class
      matchEl.className = 'pw-match';
      matchEl.textContent = '';
      void matchEl.offsetWidth;
      matchEl.textContent = '✦  you\'re all set';
      matchEl.className = 'pw-match ok';
    } else {
      passEl.classList.remove('pw-ok');
      confirmEl.classList.remove('pw-ok');
      matchEl.textContent = confirmEl.value ? 'doesn\'t match yet' : '';
      matchEl.className = 'pw-match' + (confirmEl.value ? ' err' : '');
    }
  }

  passEl.addEventListener('input', checkMatch);
  confirmEl.addEventListener('input', checkMatch);

  submitBtn.addEventListener('click', async () => {
    const email    = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) return showToast('Enter email and password');

    if (mode === 'signup' && password !== confirmEl.value) {
      return showToast('Passwords don\'t match');
    }

    submitBtn.textContent = '…';
    submitBtn.disabled = true;
    clearAuthMessage();
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        // No confirmation step — signUp signs you in and auth/index.js swaps the view.
        await signUp(email, password);
      }
    } catch (e) {
      submitBtn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
      submitBtn.disabled = false;

      if (mode === 'login' && e._tag === 'invalid_credentials') {
        showAuthMessage('Incorrect email or password.', 'err');
      } else if (mode === 'signup' && (e._tag === 'weak_password' || e._tag === 'invalid_email')) {
        showAuthMessage(e.message, 'err');
      } else if (mode === 'signup' && e._tag === 'email_exists') {
        switchTab('login');
        passEl.value = '';
        showAuthMessage('This email is already registered — sign in below.', 'info');
      } else {
        showToast(e.message || 'Auth failed');
      }
    }
  });
}

export function hideAuthForm() {
  if (stopPong) { stopPong(); stopPong = null; }
  authRoot.innerHTML = '';
}
