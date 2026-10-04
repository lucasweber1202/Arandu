// Reuse the existing first-party authentication API; no second auth system.
const endpoints = { login: '/api/auth/login', signup: '/api/auth/signup', reset: '/api/auth/reset-password' };
document.querySelector('[data-reset-toggle]')?.addEventListener('click', () => {
  const form = document.querySelector('[data-finance-auth="reset"]');
  form.hidden = false;
  form.querySelector('input')?.focus();
});
// SSO corporativo (docs/FINANCIAL_SSO.md): o servidor descobre a conexão pelo
// domínio do e-mail e redireciona ao provedor; motivos de recusa voltam em
// ?sso_error=<código> (mesma lista de lib/finance/sso.mjs → SSO_REASONS).
const SSO_MESSAGES = {
  sso_unconfigured: 'O domínio deste e-mail não tem SSO configurado. Entre com e-mail e senha.',
  sso_required: 'Sua empresa exige login pelo provedor corporativo (SSO).',
  state_invalid: 'A tentativa de login expirou ou não é válida. Comece de novo.',
  broker_failed: 'O provedor de identidade não concluiu o login. Tente de novo.',
  malformed_token: 'Resposta do provedor de identidade inválida.',
  alg_not_allowed: 'Algoritmo de assinatura não aceito.',
  signature_invalid: 'Assinatura do provedor de identidade inválida.',
  issuer_mismatch: 'O emissor da identidade não corresponde ao configurado.',
  audience_mismatch: 'A identidade não foi emitida para o Arandu.',
  nonce_mismatch: 'A resposta não corresponde a esta tentativa de login.',
  token_expired: 'A identidade expirou. Entre de novo.',
  token_not_yet_valid: 'A identidade ainda não é válida (relógio fora de sincronia).',
  email_unverified: 'O provedor não confirmou o e-mail desta conta.',
  domain_mismatch: 'O e-mail não pertence a um domínio da conexão SSO.',
  provider_mismatch: 'A conta veio de outro provedor de identidade.',
  org_mismatch: 'A conexão SSO não pertence à organização deste domínio.',
  connection_inactive: 'A conexão SSO desta organização não está ativa.',
  member_not_found: 'Sua conta ainda não foi convidada para a organização. Peça acesso ao administrador.',
  member_disabled: 'Sua conta está bloqueada nesta organização.',
  session_expired: 'Sua sessão passou do limite definido pela organização. Entre de novo.',
  session_revoked: 'As sessões SSO desta organização foram revogadas. Entre de novo.',
  mock_disabled: 'O provedor de teste não está disponível neste ambiente.'
};
const loginForm = document.querySelector('[data-finance-auth="login"]');
const ssoHint = document.querySelector('[data-sso-hint]');
const showSso = (text) => { if (ssoHint) { ssoHint.hidden = false; ssoHint.textContent = text; } };
const ssoError = new URLSearchParams(location.search).get('sso_error');
if (ssoError) showSso(Object.hasOwn(SSO_MESSAGES, ssoError) ? SSO_MESSAGES[ssoError] : SSO_MESSAGES.broker_failed);
document.querySelector('[data-sso-start]')?.addEventListener('click', async () => {
  const email = loginForm?.querySelector('input[name="email"]');
  if (!email?.value || !email.checkValidity()) { showSso('Informe seu e-mail corporativo para entrar com SSO.'); email?.focus(); return; }
  try {
    const response = await fetch('/api/auth/sso/discover', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.value }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'SSO indisponível no momento. Tente de novo em instantes.');
    if (!result.sso) { showSso(SSO_MESSAGES.sso_unconfigured); return; }
    const next = new URLSearchParams(location.search).get('next') || '';
    const params = new URLSearchParams({ email: email.value });
    if (/^\/(?:provider|finance)\/[a-z-]+\.html$/.test(next)) params.set('next', next);
    location.assign(`/api/auth/sso/start?${params}`);
  } catch (error) { showSso(error.message); }
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
    if (response.status === 403 && result.code === 'sso_required') { showSso(SSO_MESSAGES.sso_required); throw new Error(result.error); }
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
