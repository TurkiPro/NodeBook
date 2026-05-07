import { signIn, signUp } from './session.js';
import { showToast } from '../utils/toast.js';
import { authRoot } from '../dom.js';

export function showAuthForm() {
  authRoot.innerHTML = `
    <div class="auth-overlay">
      <div class="auth-card">
        <div class="auth-brand">node<span>·</span>book</div>
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Sign in</button>
          <button class="auth-tab" data-tab="signup">Create account</button>
        </div>
        <div class="auth-form">
          <input type="email" id="auth-email" placeholder="Email" autocomplete="email">
          <input type="password" id="auth-password" placeholder="Password" autocomplete="current-password">
          <button class="auth-submit" id="auth-submit">Sign in</button>
        </div>
      </div>
    </div>
  `;

  let mode = 'login';

  authRoot.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.tab;
      authRoot.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t === tab));
      authRoot.querySelector('#auth-submit').textContent =
        mode === 'login' ? 'Sign in' : 'Create account';
    });
  });

  authRoot.querySelector('#auth-submit').addEventListener('click', async () => {
    const email    = authRoot.querySelector('#auth-email').value.trim();
    const password = authRoot.querySelector('#auth-password').value;
    if (!email || !password) return showToast('Enter email and password');

    const btn = authRoot.querySelector('#auth-submit');
    btn.textContent = '…';
    btn.disabled = true;
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
        showConfirmEmail(email);
      }
    } catch (e) {
      showToast(e.message || 'Auth failed');
      btn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
      btn.disabled = false;
    }
  });
}

function showConfirmEmail(email) {
  authRoot.innerHTML = `
    <div class="auth-overlay">
      <div class="auth-card auth-card--confirm">
        <div class="auth-brand">node<span>·</span>book</div>
        <div class="auth-confirm">
          <svg class="auth-confirm-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="10" width="40" height="28" rx="3" stroke="currentColor" stroke-width="1.5"/>
            <path d="M4 14l20 13 20-13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <p class="auth-confirm-title">Check your email</p>
          <p class="auth-confirm-body">We sent a confirmation link to<br><strong>${email}</strong></p>
          <p class="auth-confirm-hint">Open the email and click the link to activate your account — you'll be signed in here automatically.</p>
          <button class="auth-submit" id="auth-back">Back to sign in</button>
        </div>
      </div>
    </div>
  `;
  authRoot.querySelector('#auth-back').addEventListener('click', showAuthForm);
}

export function hideAuthForm() {
  authRoot.innerHTML = '';
}
