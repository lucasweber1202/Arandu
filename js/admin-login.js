(() => {
  const loginForm = document.querySelector('[data-admin-login-form]');
  const mfaForm = document.querySelector('[data-admin-mfa-form]');
  const status = document.querySelector('[data-admin-auth-status]');
  let challenge = null;

  function nextPath() {
    const value = new URLSearchParams(location.search).get('next') || '/admin.html';
    return /^\/[A-Za-z0-9/_-]+\.html$/.test(value) ? value : '/admin.html';
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || 'Não foi possível concluir a autenticação.');
      error.code = data.code;
      throw error;
    }
    return data;
  }

  async function startMfa() {
    const session = await request('/api/admin-auth?action=session');
    if (session.mfaVerified) {
      location.replace(nextPath());
      return;
    }
    challenge = await request('/api/admin-auth?action=challenge', { method: 'POST', body: '{}' });
    loginForm.hidden = true;
    mfaForm.hidden = false;
    mfaForm.code.focus();
    setStatus('Identidade confirmada. Digite o código TOTP.');
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Validando identidade...');
    try {
      const body = Object.fromEntries(new FormData(loginForm).entries());
      await request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
      await startMfa();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  mfaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Confirmando segundo fator...');
    try {
      await request('/api/admin-auth?action=verify', {
        method: 'POST',
        body: JSON.stringify({
          factorId: challenge.factorId,
          challengeId: challenge.challengeId,
          code: new FormData(mfaForm).get('code')
        })
      });
      location.replace(nextPath());
    } catch (error) {
      setStatus(error.message, true);
      mfaForm.code.select();
    }
  });

  request('/api/admin-auth?action=session')
    .then((session) => session.mfaVerified ? location.replace(nextPath()) : startMfa())
    .catch(() => {});
})();
