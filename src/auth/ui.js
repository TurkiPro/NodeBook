import { signIn, signUp, signInWithGoogle } from './session.js';
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
          <div class="auth-divider"><span>or</span></div>
          <button class="auth-google" id="auth-google">Continue with Google</button>
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
        showToast('Check your email to confirm your account');
        btn.textContent = 'Create account';
        btn.disabled = false;
      }
    } catch (e) {
      showToast(e.message || 'Auth failed');
      btn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
      btn.disabled = false;
    }
  });

  authRoot.querySelector('#auth-google').addEventListener('click', signInWithGoogle);
}

export function hideAuthForm() {
  authRoot.innerHTML = '';
}
