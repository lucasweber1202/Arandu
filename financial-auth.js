// Reuse the existing first-party authentication API; no second auth system.
const endpoints = { login: '/api/auth/login', signup: '/api/auth/signup', reset: '/api/auth/reset-password' };
document.querySelector('[data-reset-toggle]')?.addEventListener('click', () => {
  const form = document.querySelector('[data-finance-auth="reset"]');
  form.hidden = false;
  form.querySelector('input')?.focus();
});
document.querySelectorAll('[data-finance-auth]').forEach(form => form.addEventListener('submit', async event => {
  event.preventDefault();
  const kind = form.dataset.financeAuth;
  const status = form.querySelector('[data-auth-status]');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  status.textContent = 'Processando…';
  const payload = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch(endpoints[kind], {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || 'Não foi possível concluir a solicitação.');
    if (kind === 'reset') { status.textContent = result.message || 'Se a conta existir, você receberá instruções.'; return; }
    if (result.needsEmailConfirmation) {
      status.textContent = 'Confira seu e-mail e confirme a conta antes de entrar.';
      return;
    }
    status.textContent = 'Conta ativa. Abrindo o workspace…';
    const next = new URLSearchParams(location.search).get('next') || '';
    // Only fixed first-party workspaces are valid return destinations.
    location.assign(/^\/(?:provider|finance)\/[a-z-]+\.html$/.test(next) ? next : '/finance/index.html');
  } catch (error) {
    status.textContent = error.message;
    form.querySelectorAll('input').forEach(input => input.setAttribute('aria-invalid', 'true'));
  } finally { button.disabled = false; }
}));
