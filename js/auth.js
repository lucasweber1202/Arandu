const ARANDU_ADMIN_TOKEN_KEY = 'arandu.adminToken.v1';

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
    form.appendChild(status);
  }
  status.style.color = isError ? '#7b1f17' : '#173f31';
  status.textContent = text;
}

function injectAuthForms() {
  const signupMount = document.querySelector('[data-signup-mount]');
  if (signupMount && !signupMount.innerHTML.trim()) {
    signupMount.innerHTML = `
      <form class="form-card" data-signup-form>
        <h3>Criar conta de comprador</h3>
        <p>Salve sua seleção e acompanhe as reservas em qualquer dispositivo.</p>
        <input name="fullName" placeholder="Nome completo" autocomplete="name" maxlength="160" required />
        <input name="email" type="email" placeholder="E-mail" autocomplete="email" maxlength="254" required />
        <input name="password" type="password" placeholder="Senha com pelo menos 8 caracteres" autocomplete="new-password" minlength="8" required />
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
        <h3>Entrar na conta</h3>
        <p>Acesse suas seleções e solicitações de reserva.</p>
        <input name="email" type="email" placeholder="E-mail" autocomplete="email" maxlength="254" required />
        <input name="password" type="password" placeholder="Senha" autocomplete="current-password" required />
        <input name="profileType" type="hidden" value="comprador" />
        <button type="submit">Entrar</button>
        <p>Ainda não tem conta? <a href="cadastro.html">Criar conta</a></p>
      </form>`;
  }
}

async function getSession() {
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
  } catch (error) {
    if (error.status === 401) {
      target.innerHTML = '<div class="card"><h3>Você ainda não entrou.</h3><p>Entre ou crie uma conta para sincronizar seleções e acompanhar reservas.</p><div class="page-actions"><a class="cta" href="login.html">Entrar</a><a class="cta secondary" href="cadastro.html">Criar conta</a></div></div>';
      return;
    }
    target.innerHTML = `<div class="card"><h3>Não foi possível carregar sua conta</h3><p>${escapeAuthHtml(error.message)}</p><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div>`;
  }
}

function pipelineCards(items) {
  if (!Array.isArray(items) || !items.length) return '<article class="card"><h3>Nenhum movimento recente</h3><p>Os registros operacionais aparecerão aqui.</p></article>';
  return items.map((item) => `<article class="card"><span class="tag">${escapeAuthHtml(item.source || 'pipeline')}</span><h3>${escapeAuthHtml(item.name || item.id || 'Registro')}</h3><p>Status: ${escapeAuthHtml(item.status || 'sem status')}</p><small>${escapeAuthHtml(formatDateTime(item.created_at))}</small></article>`).join('');
}

async function renderDashboard() {
  const target = document.querySelector('[data-dashboard-panel]');
  if (!target) return;
  const token = localStorage.getItem(ARANDU_ADMIN_TOKEN_KEY) || '';
  if (!token) {
    target.innerHTML = '<div class="card"><h3>Acesso administrativo necessário</h3><p>Informe o token no painel administrativo para carregar estes dados.</p></div>';
    return;
  }
  try {
    const dashboard = await requestJson('/api/dashboard', { method: 'GET', headers: { 'x-arandu-admin-token': token } });
    const metrics = dashboard.metrics || {};
    target.innerHTML = `<div class="grid grid-4"><article class="card"><h3>${metrics.artworks ?? 0}</h3><p>Obras</p></article><article class="card"><h3>${metrics.artists ?? 0}</h3><p>Artistas</p></article><article class="card"><h3>${metrics.leads ?? 0}</h3><p>Leads</p></article><article class="card"><h3>${metrics.reservations ?? 0}</h3><p>Reservas</p></article></div><div class="card"><h3>Pipeline recente</h3><div class="grid grid-4">${pipelineCards(dashboard.pipeline)}</div></div>`;
  } catch (error) {
    target.innerHTML = `<div class="card"><h3>Erro no painel</h3><p>${escapeAuthHtml(error.message)}</p></div>`;
  }
}

document.addEventListener('submit', async (event) => {
  const signup = event.target.closest('[data-signup-form]');
  const login = event.target.closest('[data-login-form]');
  if (!signup && !login) return;
  event.preventDefault();
  const form = signup || login;
  const payload = Object.fromEntries(new FormData(form).entries());
  const endpoint = signup ? '/api/auth/signup' : '/api/auth/login';
  try {
    setStatus(form, signup ? 'Criando cadastro...' : 'Entrando...');
    const result = await requestJson(endpoint, { method: 'POST', body: JSON.stringify(payload) });
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
