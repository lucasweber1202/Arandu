async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Não foi possível concluir a solicitação.');
  return data;
}

function setStatus(form, text, isError = false) {
  let status = form.querySelector('[data-auth-status]');
  if (!status) {
    status = document.createElement('p');
    status.dataset.authStatus = 'true';
    status.style.fontWeight = '800';
    form.appendChild(status);
  }
  status.style.color = isError ? '#7b1f17' : '#c93f2d';
  status.textContent = text;
}

function injectAuthForms() {
  const signupMount = document.querySelector('[data-signup-mount]');
  if (signupMount && !signupMount.innerHTML.trim()) {
    signupMount.innerHTML = `
      <form class="form-card" data-signup-form>
        <h3>Começar</h3>
        <input name="fullName" placeholder="Nome completo" required />
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Senha" required />
        <select name="profileType" required>
          <option value="comprador">Quero comprar arte</option>
          <option value="artista">Sou artista</option>
          <option value="empresa">Sou empresa</option>
          <option value="arquiteto">Sou arquiteto ou designer</option>
        </select>
        <button type="submit">Criar conta</button>
        <p>Já tem conta? <a href="login.html">Entrar</a></p>
      </form>`;
  }

  const loginMount = document.querySelector('[data-login-mount]');
  if (loginMount && !loginMount.innerHTML.trim()) {
    loginMount.innerHTML = `
      <form class="form-card" data-login-form>
        <h3>Entrar</h3>
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Senha" required />
        <button type="submit">Entrar</button>
        <p>Ainda não tem conta? <a href="cadastro.html">Criar conta</a></p>
      </form>`;
  }
}

async function getSession() {
  return requestJson('/api/auth/session', { method: 'GET' });
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

async function renderAccount() {
  const target = document.querySelector('[data-account-panel]');
  if (!target) return;

  try {
    const session = await getSession();
    if (!session.authenticated) {
      target.innerHTML = '<div class="card"><h3>Você ainda não entrou.</h3><p>Entre ou crie uma conta para acompanhar seleções, briefings e futuras compras.</p><div class="page-actions"><a class="cta" href="login.html">Entrar</a><a class="cta secondary" href="cadastro.html">Criar conta</a></div></div>';
      return;
    }

    const dashboard = await requestJson('/api/dashboard', { method: 'GET' });
    const metrics = dashboard.metrics || {};
    target.innerHTML = `
      <div class="card"><p class="eyebrow">Sessão ativa</p><h3>${session.user.full_name || session.user.email}</h3><p>${session.user.email}</p><span class="tag">${session.user.profile_type || 'comprador'}</span></div>
      <div class="grid grid-4">
        <article class="card"><h3>${metrics.artworks ?? 0}</h3><p>Obras cadastradas</p></article>
        <article class="card"><h3>${metrics.artists ?? 0}</h3><p>Artistas</p></article>
        <article class="card"><h3>${metrics.leads ?? 0}</h3><p>Leads recebidos</p></article>
        <article class="card"><h3>${metrics.certificates ?? 0}</h3><p>Certificados</p></article>
      </div>
      <div class="page-actions"><a class="cta" href="minha-selecao.html">Minha seleção</a><a class="cta secondary" href="painel.html">Abrir painel</a><button class="button secondary" type="button" data-auth-logout>Sair</button></div>
    `;
  } catch (error) {
    target.innerHTML = `<div class="card"><h3>Erro ao carregar conta</h3><p>${error.message}</p></div>`;
  }
}

async function renderDashboard() {
  const target = document.querySelector('[data-dashboard-panel]');
  if (!target) return;

  try {
    const dashboard = await requestJson('/api/dashboard', { method: 'GET' });
    const metrics = dashboard.metrics || {};
    target.innerHTML = `
      <div class="grid grid-4">
        <article class="card"><h3>${metrics.artworks ?? 0}</h3><p>Obras</p></article>
        <article class="card"><h3>${metrics.artists ?? 0}</h3><p>Artistas</p></article>
        <article class="card"><h3>${metrics.leads ?? 0}</h3><p>Leads</p></article>
        <article class="card"><h3>${metrics.certificates ?? 0}</h3><p>Certificados</p></article>
      </div>
      <p class="selection-summary">Modo atual: ${dashboard.mode === 'supabase' ? 'Supabase conectado' : 'Demonstração'}</p>
    `;
  } catch (error) {
    target.innerHTML = `<div class="card"><h3>Erro no painel</h3><p>${error.message}</p></div>`;
  }
}

document.addEventListener('submit', async (event) => {
  const signup = event.target.closest('[data-signup-form]');
  const login = event.target.closest('[data-login-form]');
  if (!signup && !login) return;
  event.preventDefault();

  const form = signup || login;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const endpoint = signup ? '/api/auth/signup' : '/api/auth/login';

  try {
    setStatus(form, signup ? 'Criando cadastro...' : 'Entrando...');
    const result = await requestJson(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    setStatus(form, result.needsEmailConfirmation ? 'Cadastro criado. Confira seu e-mail para confirmar a conta.' : 'Tudo certo. Redirecionando...');
    setTimeout(() => { window.location.href = 'minha-conta.html'; }, 900);
  } catch (error) {
    setStatus(form, error.message, true);
  }
});

document.addEventListener('click', async (event) => {
  const logout = event.target.closest('[data-auth-logout]');
  if (!logout) return;
  event.preventDefault();
  await requestJson('/api/auth/logout', { method: 'POST' });
  window.location.href = 'index.html';
});

document.addEventListener('DOMContentLoaded', () => {
  injectAuthForms();
  renderAuthNav();
  renderAccount();
  renderDashboard();
});
