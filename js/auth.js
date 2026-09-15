async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || 'Não foi possível concluir a solicitação.');
    error.status = response.status;
    throw error;
  }
  return data;
}

// O modo de apresentação é decidido no build (meta injetada pelo Vite) e é
// impossível em produção — ver lib/presentation-mode.mjs. Aqui ele apenas troca
// a leitura por um cenário local; nenhuma sessão real é criada nem dispensada.
const presentationEnabled = () => window.AranduPresentation?.enabled === true
  || document.querySelector('meta[name="arandu-presentation-mode"]')?.content === 'true';

function escapeAuthHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function formatDateTime(value) {
  if (!value) return 'Sem data';
  try { return new Date(value).toLocaleString('pt-BR'); } catch { return 'Sem data'; }
}

function reservationStatus(value) {
  return ({
    requested: 'Solicitada',
    confirmed: 'Confirmada',
    expired: 'Expirada',
    cancelled: 'Cancelada',
    converted: 'Concluída'
  }[value] || value || 'Em análise');
}

function setStatus(form, text, isError = false) {
  let status = form.querySelector('[data-auth-status]');
  if (!status) {
    status = document.createElement('p');
    status.dataset.authStatus = 'true';
    status.style.fontWeight = '800';
    // Sem região viva o retorno do login — inclusive a recusa de credenciais —
    // aparece só visualmente e nunca é anunciado a quem usa leitor de tela.
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);
  }
  status.style.color = isError ? '#7b1f17' : '#173f31';
  status.textContent = text;
  // O erro vem do servidor e não é por campo; marcar os campos preenchíveis
  // permite que o leitor de tela relacione a mensagem ao formulário recusado.
  form.querySelectorAll('input:not([type="hidden"])').forEach((field) => {
    if (isError) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  });
}

function injectAuthForms() {
  const signupMount = document.querySelector('[data-signup-mount]');
  if (signupMount && !signupMount.innerHTML.trim()) {
    signupMount.innerHTML = `
      <form class="form-card" data-signup-form>
        <h2>Criar conta de comprador</h2>
        <p>Salve sua seleção e acompanhe as reservas em qualquer dispositivo.</p>
        <label for="arandu-signup-name">Nome completo</label>
        <input id="arandu-signup-name" name="fullName" placeholder="Nome completo" autocomplete="name" maxlength="160" required />
        <label for="arandu-signup-email">E-mail</label>
        <input id="arandu-signup-email" name="email" type="email" placeholder="voce@exemplo.com" autocomplete="email" maxlength="254" required />
        <label for="arandu-signup-password">Senha</label>
        <input id="arandu-signup-password" name="password" type="password" placeholder="Pelo menos 8 caracteres" autocomplete="new-password" minlength="8" required aria-describedby="arandu-signup-password-hint" />
        <small id="arandu-signup-password-hint">Use pelo menos 8 caracteres.</small>
        <input name="profileType" type="hidden" value="comprador" />
        <input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0;pointer-events:none" />
        <button type="submit">Criar conta</button>
        <p>Já tem conta? <a href="login.html">Entrar</a></p>
      </form>`;
  }

  const loginMount = document.querySelector('[data-login-mount]');
  if (loginMount && !loginMount.innerHTML.trim()) {
    loginMount.innerHTML = `
      <form class="form-card" data-login-form>
        <h2>Entrar na conta</h2>
        <p>Acesse suas seleções e solicitações de reserva.</p>
        <label for="arandu-login-email">E-mail</label>
        <input id="arandu-login-email" name="email" type="email" placeholder="voce@exemplo.com" autocomplete="email" maxlength="254" required />
        <label for="arandu-login-password">Senha</label>
        <input id="arandu-login-password" name="password" type="password" placeholder="Sua senha" autocomplete="current-password" required />
        <input name="profileType" type="hidden" value="comprador" />
        <button type="submit">Entrar</button>
        <button class="button secondary" type="button" data-show-password-reset>Esqueci minha senha</button>
        <p>Ainda não tem conta? <a href="cadastro.html">Criar conta</a></p>
      </form>
      <form class="form-card" data-password-reset-form hidden>
        <h2>Recuperar senha</h2><p>Enviaremos instruções caso exista uma conta para o e-mail informado.</p>
        <label for="arandu-reset-email">E-mail da conta</label>
        <input id="arandu-reset-email" name="email" type="email" placeholder="voce@exemplo.com" autocomplete="email" required />
        <button type="submit">Enviar instruções</button>
      </form>`;
    if (presentationEnabled()) loginMount.insertAdjacentHTML('afterbegin', '<div class="presentation-disclaimer"><strong>Apresentação:</strong> a autenticação real continua protegida. <a class="cta secondary" href="minha-conta.html">Explorar conta demonstrativa</a></div>');
  }
}

async function getSession() {
  if (window.AranduSession?.get) return window.AranduSession.get();
  return requestJson('/api/auth/session', { method: 'GET' });
}

async function syncLocalSelectionAfterAuth() {
  let items = [];
  let briefing = {};
  try { items = JSON.parse(localStorage.getItem('arandu.selection.v1') || '[]'); } catch {}
  try { briefing = JSON.parse(localStorage.getItem('arandu.selection.briefing.v1') || '{}'); } catch {}
  if (!Array.isArray(items) || !items.length) return false;
  await requestJson('/api/selections', {
    method: 'POST',
    body: JSON.stringify({ items, briefing, source: 'cadastro-conta' })
  });
  return true;
}

async function renderAuthNav() {
  if (presentationEnabled()) {
    document.querySelectorAll('[data-auth-nav]').forEach((target) => { target.innerHTML = '<a href="minha-conta.html">Conta demonstrativa</a>'; });
    return;
  }
  try {
    const session = await getSession();
    document.querySelectorAll('[data-auth-nav]').forEach((target) => {
      target.innerHTML = session.authenticated
        ? '<a href="minha-conta.html">Minha conta</a><button class="tag" type="button" data-auth-logout>Sair</button>'
        : '<a href="login.html">Entrar</a><a href="cadastro.html">Cadastrar</a>';
    });
  } catch {
    document.querySelectorAll('[data-auth-nav]').forEach((target) => {
      target.innerHTML = '<a href="login.html">Entrar</a><a href="cadastro.html">Cadastrar</a>';
    });
  }
}

function selectionCards(selections) {
  if (!Array.isArray(selections) || !selections.length) {
    return '<article class="card"><h3>Nenhuma seleção sincronizada</h3><p>Salve obras em Comprar arte para criar sua primeira seleção.</p><a class="cta secondary" href="comprar-arte.html">Explorar obras</a></article>';
  }
  return selections.slice(0, 5).map((selection) => {
    const items = Array.isArray(selection.items) ? selection.items : [];
    const titles = items.slice(0, 3).map((item) => item.title).filter(Boolean).join(' · ');
    const href = selection.public_token
      ? `minha-selecao.html?selection_token=${encodeURIComponent(selection.public_token)}`
      : 'minha-selecao.html';
    return `<article class="card">
      <span class="tag">${items.length} obra${items.length === 1 ? '' : 's'}</span>
      <h3>${escapeAuthHtml(titles || 'Seleção em formação')}</h3>
      <p>Atualizada em ${escapeAuthHtml(formatDateTime(selection.updated_at || selection.created_at))}</p>
      <a class="cta secondary" href="${escapeAuthHtml(href)}">Abrir seleção</a>
    </article>`;
  }).join('');
}

function reservationCards(reservations) {
  if (!Array.isArray(reservations) || !reservations.length) {
    return '<article class="card"><h3>Nenhuma reserva solicitada</h3><p>Quando você pedir uma reserva, o acompanhamento aparecerá aqui.</p></article>';
  }
  return reservations.slice(0, 6).map((reservation) => `<article class="card">
    <span class="tag">${escapeAuthHtml(reservationStatus(reservation.status))}</span>
    <h3>${escapeAuthHtml(reservation.artwork_id || 'Obra reservada')}</h3>
    <p>${escapeAuthHtml(reservation.deadline || 'Prazo confirmado pela curadoria')}</p>
    <small>${escapeAuthHtml(formatDateTime(reservation.created_at))}</small>
  </article>`).join('');
}

async function renderAccount() {
  const target = document.querySelector('[data-account-panel]');
  if (!target) return;
  if (presentationEnabled()) {
    let selections = [];
    try { selections = JSON.parse(localStorage.getItem('arandu.selection.v1') || '[]'); } catch {}
    const reservations = window.AranduPresentation?.reservations?.() || [];
    target.innerHTML = `<div class="card"><p class="eyebrow">Conta demonstrativa</p><h2>Visitante da apresentação</h2><p>Nenhuma sessão real foi criada. Estes dados existem somente neste navegador.</p></div><div class="grid grid-2"><article class="card"><h3>${Array.isArray(selections) ? selections.length : 0}</h3><p>Obras salvas localmente</p></article><article class="card"><h3>${reservations.length}</h3><p>Reservas simuladas nesta aba</p></article></div><section class="card"><p class="eyebrow">Privacidade</p><h3>Nenhum dado pessoal foi armazenado no servidor.</h3><p>Exportação, correção e exclusão reais permanecem disponíveis apenas para uma conta autenticada.</p></section>`;
    return;
  }
  try {
    const account = await requestJson('/api/account', { method: 'GET' });
    const metrics = account.metrics || {};
    const user = account.user || {};
    target.innerHTML = `
      <div class="card">
        <p class="eyebrow">Conta ativa</p>
        <h2>${escapeAuthHtml(user.full_name || user.email)}</h2>
        <p>${escapeAuthHtml(user.email)}</p>
        <div class="page-actions"><button class="button secondary" type="button" data-auth-logout>Sair</button></div>
      </div>
      <div class="grid grid-2">
        <article class="card"><h3>${Number(metrics.selections || 0)}</h3><p>Seleções sincronizadas</p></article>
        <article class="card"><h3>${Number(metrics.reservations || 0)}</h3><p>Reservas vinculadas à conta</p></article>
      </div>
      <section class="card"><p class="eyebrow">Suas seleções</p><div class="grid grid-2">${selectionCards(account.selections)}</div></section>
      <section class="card"><p class="eyebrow">Suas reservas</p><div class="grid grid-2">${reservationCards(account.reservations)}</div></section>`;
    target.insertAdjacentHTML('beforeend', `<section class="card"><p class="eyebrow">Privacidade e seus dados</p><h3>Você controla as informações da sua conta.</h3><p>Baixe uma cópia em JSON ou solicite acesso, correção, portabilidade ou exclusão. Solicitações ficam registradas com prazo de atendimento.</p><div class="page-actions"><a class="cta secondary" href="/api/privacy/export" download>Baixar meus dados</a></div><form data-privacy-request-form><label>Tipo de solicitação<select name="requestType" required><option value="access">Acesso</option><option value="correction">Correção</option><option value="portability">Portabilidade</option><option value="deletion">Exclusão</option></select></label><label>Detalhes<textarea name="message" maxlength="1000" placeholder="Descreva apenas o necessário"></textarea></label><button type="submit">Registrar solicitação</button></form></section>`);
  } catch (error) {
    if (error.status === 401) {
      target.innerHTML = '<div class="card"><h3>Você ainda não entrou.</h3><p>Entre ou crie uma conta para sincronizar seleções e acompanhar reservas.</p><div class="page-actions"><a class="cta" href="login.html">Entrar</a><a class="cta secondary" href="cadastro.html">Criar conta</a></div></div>';
      return;
    }
    // `error.message` aqui pode ser o texto de erro da API ou a mensagem do
    // próprio navegador em inglês. Nenhum dos dois diz a quem está logado o que
    // fazer com a própria conta.
    target.innerHTML = '<div class="card"><h3>Não foi possível carregar sua conta</h3><p>Seus dados continuam salvos. Recarregue a página em instantes; se o problema persistir, fale com a curadoria.</p><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div>';
  }
}

function pipelineCards(items) {
  if (!Array.isArray(items) || !items.length) return '<article class="card"><h3>Nenhum movimento recente</h3><p>Os registros operacionais aparecerão aqui.</p></article>';
  return items.map((item) => `<article class="card"><span class="tag">${escapeAuthHtml(item.source || 'pipeline')}</span><h3>${escapeAuthHtml(item.name || item.id || 'Registro')}</h3><p>Status: ${escapeAuthHtml(item.status || 'sem status')}</p><small>${escapeAuthHtml(formatDateTime(item.created_at))}</small></article>`).join('');
}

async function renderDashboard() {
  const target = document.querySelector('[data-dashboard-panel]');
  if (!target) return;
  try {
    const dashboard = await requestJson('/api/dashboard', { method: 'GET' });
    const metrics = dashboard.metrics || {};
    target.innerHTML = `<div class="grid grid-4"><article class="card"><h3>${metrics.artworks ?? 0}</h3><p>Obras</p></article><article class="card"><h3>${metrics.artists ?? 0}</h3><p>Artistas</p></article><article class="card"><h3>${metrics.leads ?? 0}</h3><p>Leads</p></article><article class="card"><h3>${metrics.reservations ?? 0}</h3><p>Reservas</p></article></div><div class="card"><h3>Pipeline recente</h3><div class="grid grid-4">${pipelineCards(dashboard.pipeline)}</div></div>`;
  } catch (error) {
    target.innerHTML = `<div class="card"><h3>Erro no painel</h3><p>${escapeAuthHtml(error.message)}</p></div>`;
  }
}

document.addEventListener('submit', async (event) => {
  const signup = event.target.closest('[data-signup-form]');
  const login = event.target.closest('[data-login-form]');
  const reset = event.target.closest('[data-password-reset-form]');
  const privacy = event.target.closest('[data-privacy-request-form]');
  if (!signup && !login && !reset && !privacy) return;
  event.preventDefault();
  const form = signup || login || reset || privacy;
  const payload = Object.fromEntries(new FormData(form).entries());
  const endpoint = signup ? '/api/auth/signup' : login ? '/api/auth/login' : reset ? '/api/auth/reset-password' : '/api/privacy/request';
  try {
    setStatus(form, signup ? 'Criando cadastro...' : login ? 'Entrando...' : reset ? 'Solicitando recuperação...' : 'Registrando solicitação...');
    const result = await requestJson(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    if (reset) { setStatus(form, result.message || 'Confira seu e-mail para continuar.'); return; }
    if (privacy) { setStatus(form, `Solicitação registrada. Prazo: ${formatDateTime(result.request?.dueAt)}.`); form.reset(); return; }
    if (result.needsEmailConfirmation) {
      setStatus(form, 'Cadastro criado. Confira seu e-mail e confirme a conta antes de entrar.');
      form.querySelector('button[type="submit"]')?.setAttribute('disabled', 'disabled');
      return;
    }
    setStatus(form, 'Conta ativa. Sincronizando suas escolhas...');
    await syncLocalSelectionAfterAuth().catch(() => false);
    setStatus(form, 'Tudo certo. Abrindo sua conta...');
    setTimeout(() => { window.location.href = 'minha-conta.html'; }, 600);
  } catch (error) {
    setStatus(form, error.message, true);
  }
});

document.addEventListener('click', async (event) => {
  const resetTrigger = event.target.closest('[data-show-password-reset]');
  if (resetTrigger) {
    const form = document.querySelector('[data-password-reset-form]');
    if (form) { form.hidden = false; form.querySelector('input')?.focus(); }
    return;
  }
  const logout = event.target.closest('[data-auth-logout]');
  if (!logout) return;
  event.preventDefault();
  try { await requestJson('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = 'index.html'; }
});

document.addEventListener('DOMContentLoaded', () => {
  injectAuthForms();
  renderAuthNav();
  renderAccount();
  renderDashboard();
});
