// Reuse the existing first-party authentication API; no second auth system.
// Volta ao link que a pessoa abriu: só páginas do próprio produto, com query
// restrita (ids e filtros), nunca outro host nem caminho arbitrário.
const SAFE_NEXT = /^\/(?:provider|finance)\/[a-z-]+\.html(?:\?[A-Za-z0-9_.~%=&-]{1,300})?$/;
const returnTo = () => { const next = new URLSearchParams(location.search).get('next') || ''; return SAFE_NEXT.test(next) ? next : null; };
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
// Logout sem confirmação do serviço de contas: o navegador pode já ter saído,
// mas outras sessões talvez continuem ativas. Nunca apresentar como sucesso.
if (loginForm && new URLSearchParams(location.search).get('saida') === 'nao-confirmada') {
  const notice = document.createElement('p');
  notice.className = 'auth-notice';
  notice.setAttribute('role', 'alert');
  notice.id = 'logout-unconfirmed';
  notice.textContent = 'Não foi possível confirmar o encerramento da sua sessão em outros dispositivos. Entre de novo e use "Sair" outra vez; se o aviso continuar, peça ao administrador da organização para encerrar as sessões da sua conta.';
  loginForm.before(notice);
}
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
    // Only fixed first-party workspaces are valid return destinations.
    location.assign(returnTo() || '/finance/index.html');
  } catch (error) {
    status.textContent = error.message;
    form.querySelectorAll('input').forEach(input => input.setAttribute('aria-invalid', 'true'));
  } finally { button.disabled = false; }
}));

// Recuperação de senha: o link do e-mail volta com o token no fragmento
// (#access_token=…&type=recovery) ou com o erro do provedor (#error_code=…).
// O fragmento sai da barra de endereço e do histórico na hora; o token só vai
// ao servidor junto com a senha nova, uma vez, e nunca abre sessão sozinho.
const recoveryHash = new URLSearchParams(location.hash.slice(1));
if (loginForm && (recoveryHash.get('type') === 'recovery' || recoveryHash.has('error_code'))) {
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  const card = loginForm.closest('.auth-card');
  const token = recoveryHash.get('type') === 'recovery' ? recoveryHash.get('access_token') : null;
  const form = document.createElement('form');
  form.dataset.recovery = '';
  const title = document.createElement('h2');
  const status = document.createElement('p');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  if (!token) {
    title.textContent = 'Link de recuperação expirado';
    status.textContent = 'Este link expirou ou já foi usado. Use "Esqueci minha senha" para receber um novo.';
    form.append(title, status);
  } else {
    title.textContent = 'Definir nova senha';
    const field = (label, name) => {
      const wrap = document.createElement('label'); wrap.textContent = label;
      const input = document.createElement('input');
      Object.assign(input, { name, type: 'password', autocomplete: 'new-password', required: true, minLength: 8 });
      wrap.append(input); return wrap;
    };
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Salvar nova senha';
    form.append(title, field('Nova senha (mínimo de 8 caracteres)', 'password'), field('Repita a nova senha', 'confirm'), submit, status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const { password, confirm } = Object.fromEntries(new FormData(form));
      if (password !== confirm) { status.textContent = 'As duas senhas não são iguais.'; form.elements.confirm.setAttribute('aria-invalid', 'true'); form.elements.confirm.focus(); return; }
      submit.disabled = true; status.textContent = 'Salvando…';
      try {
        const response = await fetch('/api/auth/update-password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recovery_token: token, password }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok === false) throw Object.assign(new Error(result.error || 'Não foi possível salvar a nova senha. Tente de novo.'), { code: result.code });
        form.replaceChildren(title, status);
        title.textContent = 'Senha alterada';
        status.textContent = 'Senha alterada. Entre com o seu e-mail e a nova senha.';
        loginForm.hidden = false;
        loginForm.querySelector('input[name="email"]')?.focus();
      } catch (error) {
        status.textContent = error.message;
        // Link vencido não volta a valer: só um novo e-mail resolve.
        if (error.code === 'recovery_link_expired' || error.code === 'invalid_recovery_link') submit.remove();
        else submit.disabled = false;
      }
    });
    loginForm.hidden = true;
  }
  card?.prepend(form);
  form.querySelector('input')?.focus();
}

// The shared login only offers demo entry when the server exposes the capability
// (ARANDU_ENV=demo with a DEMO database). The entry logs into the real product.
if (loginForm) fetch('/api/auth/demo-personas',{credentials:'same-origin'}).then(async response=>{
  if(response.status===429){
    const {demoEntryWaiting}=await import('./financial-demo-entry.js');
    const main=document.querySelector('#main');
    main.classList.add('has-demo-entry');
    main.prepend(demoEntryWaiting(Number(response.headers.get('Retry-After'))||0));
    return;
  }
  if(!response.ok)return;
  const data=await response.json();
  if(!Array.isArray(data.personas)||!data.personas.length)return;
  const {demoEntry,enterAsPersona}=await import('./financial-demo-entry.js');
  const section=demoEntry(data.personas,{enter:enterAsPersona,next:returnTo()});
  const main=document.querySelector('#main');
  main.classList.add('has-demo-entry');
  main.prepend(section);
  // Ao fim do carregamento o Firefox rola até o #demonstracao e limpa o foco:
  // focar na tarefa seguinte ao load, depois de o navegador tratar o fragmento.
  const focusEntry=()=>section.querySelector('button')?.focus();
  if(location.hash==='#demonstracao'){if(document.readyState==='complete')focusEntry();else addEventListener('load',()=>setTimeout(focusEntry),{once:true});}
}).catch(()=>{});
