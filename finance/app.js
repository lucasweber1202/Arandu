// Cliente dos portais do Arandu Financial Procurement.
//
// Uma interface, dois transportes, nunca misturados:
//   * sessão real  -> `/api/finance/*`, com autenticação, RLS e RBAC no servidor;
//   * demonstração -> motor local com dados fictícios (`finance/demo/engine.js`),
//     carregado SOMENTE em páginas `/demo/*` de um build que habilita a
//     demonstração. Em build de produção a constante `__ARANDU_DEMO__` é `false`
//     e o código do motor nem entra no pacote.
//
// As telas recebem `ctx.api(path, options)` e não sabem qual transporte está
// por trás. Não há `if (demo)` espalhado: as diferenças de modo ficam aqui e
// no motor.

import { el, icon, ROLE_LABELS, needsRenewalAttention } from './src/core.js';
import { emptyState, linkButton, errorState, loading, toast } from './src/ui.js';
import { renderSidebar, renderTopbar, renderMobileNav, renderDemoBanner, installCommandCenter, installNotificationCenter } from './src/shell.js';
/* global __ARANDU_DEMO__ */
const DEMO_BUILD = typeof __ARANDU_DEMO__ !== 'undefined' && __ARANDU_DEMO__ === true;

document.documentElement.classList.add('js');
const view = document.body.dataset.view || 'dashboard';
const audience = document.body.dataset.audience || 'company';
const demoPage = document.body.dataset.mode === 'demo';
const root = document.querySelector('#view');

// Cada tela é carregada sob demanda: uma página baixa só o código que exibe.
const lazy = (load, name) => async (ctx) => (await load())[name](ctx);
const company = () => import('./src/views/company.js');
const providerViews = () => import('./src/views/provider.js');
const VIEWS = {
  home: lazy(() => import('./src/views/dashboard.js'), 'dashboard'),
  dashboard: lazy(() => import('./src/views/dashboard.js'), 'dashboard'),
  rfqs: lazy(() => import('./src/views/rfqs.js'), 'rfqList'),
  newRfq: lazy(() => import('./src/views/rfqs.js'), 'newRfq'),
  rfq: lazy(() => import('./src/views/rfq.js'), 'rfqDetail'),
  approvals: lazy(company, 'approvalsInbox'), proposals: lazy(company, 'proposalsList'), contracts: lazy(company, 'contracts'),
  providers: lazy(company, 'providers'), tasks: lazy(company, 'tasks'), notifications: lazy(company, 'notifications'), settings: lazy(company, 'settings'),
  providerHome: lazy(providerViews, 'providerHome'), providerRfqs: lazy(providerViews, 'providerRfqs'),
  providerProposal: lazy(providerViews, 'providerProposal'), providerInvite: lazy(providerViews, 'providerInvite'),
  // Página estática: o conteúdo já está no HTML; só o shell é montado.
  ops: lazy(() => import('./src/views/ops.js'), 'opsConsole'),
  boundaries: () => null
};
const PUBLIC_WHEN_SIGNED_OUT = new Set(['providerInvite', 'boundaries']);
// Operadores da plataforma não precisam pertencer a uma empresa.
const ORGANIZATION_OPTIONAL = new Set(['ops']);

// ------------------------------------------------------------- transporte
const httpTransport = {
  mode: 'real',
  async request(path, options = {}) {
    const response = await fetch(`/api/finance/${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (response.ok) return payload;
    const reference = payload.requestId || response.headers.get('X-Request-ID');
    const message = response.status === 401 ? 'Sessão expirada ou ausente.'
      : response.status === 403 ? (payload.error || 'Acesso negado para esta organização.')
        : `${payload.error || `Falha ${response.status}.`}${reference ? ` Código de referência: ${reference}` : ''}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload.code;
    throw error;
  },
  /** Envia o arquivo direto ao Storage pela URL assinada de curta duração. */
  async putFile(url, file) {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/upload\/sign\//.test(String(url))) throw new Error('Endereço de envio inválido.');
    const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
    if (!response.ok) { const error = new Error('O envio do arquivo falhou. Verifique a conexão e tente de novo.'); error.status = response.status; throw error; }
  }
};

async function createTransport() {
  if (!demoPage) return httpTransport;
  if (!DEMO_BUILD) return null;
  const { createDemoEngine } = await import('./demo/engine.js');
  // Work OS da demo: cache local-first (stale-while-revalidate) sobre o motor fictício.
  const { withLocalFirst } = await import('./demo/workspace/platform/local-first.js');
  return withLocalFirst(createDemoEngine({ latency: 140 }));
}

// Camada de experiência da demonstração (laboratório de UX): mesma trava do
// motor — só em página /demo de build demonstrativo. Em produção nem entra no
// pacote; as telas reais continuam exatamente como são.
let workspace = null;
async function loadWorkspace() {
  if (!demoPage || !DEMO_BUILD) return null;
  return import('./demo/workspace/index.js');
}

// ------------------------------------------------------------------ ctx
function createContext(transport) {
  const base = demoPage ? '/demo' : '';
  const ctx = {
    mode: transport?.mode || 'real', transport, audience, view, base,
    organization: null, organizations: [], viewer: null, members: [], data: {}, persona: null, weights: {},
    href(path) {
      const value = String(path || '');
      if (!base || !value.startsWith('/') || value.startsWith(base + '/')) return value;
      return /^\/(finance|provider)\//.test(value) ? base + value : value;
    },
    api(path, options) {
      if (!navigator.onLine && options?.method && options.method !== 'GET' && ctx.mode === 'real') {
        const error = new Error('Sem conexão. Nada foi enviado; tente de novo quando a rede voltar.');
        error.status = 0;
        return Promise.reject(error);
      }
      return transport.request(path, options);
    },
    putFile(url, file) { return transport.putFile(url, file); },
    can(permission) {
      const role = ctx.viewer?.role;
      if (!role) return ctx.audience === 'company';
      if (permission === 'admin') return role === 'admin';
      if (permission === 'upload_document') return ['admin', 'finance_manager', 'analyst', 'provider_user'].includes(role);
      return ['admin', 'finance_manager'].includes(role);
    },
    approvalsPromise: null,
    loadApprovals() {
      if (ctx.audience !== 'company' || !ctx.organization) return Promise.resolve([]);
      ctx.approvalsPromise ||= ctx.api(`approvals?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((result) => result.rows || []).catch(() => []);
      return ctx.approvalsPromise;
    },
    header: setHeader,
    reload: () => render({ refresh: true }),
    rerender: (options) => render(options),
    async switchPersona(key) {
      transport.setPersona(key);
      const persona = transport.persona();
      const stay = persona.audience === audience && audience === 'company' && view !== 'newRfq';
      // Na camada de experiência a troca é instantânea: mesma página, novo papel.
      if (stay && workspace) {
        await render({ refresh: true, rebuildShell: true });
        toast(`Visualizando como ${persona.name} (${persona.title}).`, 'info');
        return;
      }
      toast(`Visualizando como ${persona.name} (${persona.title}).`, 'info');
      const target = persona.audience === 'provider' ? '/provider/index.html' : '/finance/dashboard.html';
      // Mesma página: recarrega (mudar só a âncora não recarregaria o conteúdo).
      setTimeout(() => (stay ? location.reload() : location.assign(ctx.href(target))), 250);
    }
  };
  return ctx;
}

function setHeader({ title = null, subtitle = null, crumbs = null, meta = null, actions = null } = {}) {
  const head = document.querySelector('.page-head');
  if (!head) return;
  const h1 = head.querySelector('h1');
  if (title && h1) h1.textContent = title;
  const lede = head.querySelector('.lede');
  if (lede) { lede.textContent = subtitle || ''; lede.hidden = !subtitle; }
  head.querySelector('.page-meta')?.replaceChildren(...(meta || []).filter(Boolean));
  head.querySelector('.page-actions')?.replaceChildren(...(actions || []).filter(Boolean));
  const crumbsNode = document.querySelector('#breadcrumbs');
  if (crumbsNode) {
    crumbsNode.replaceChildren();
    if (crumbs?.length) {
      const list = el('ol', { class: 'crumbs', 'aria-label': 'Você está em' });
      crumbs.forEach((crumb, index) => {
        if (index) list.append(el('li', { class: 'crumb-sep', 'aria-hidden': 'true' }, icon('chevronRight', { size: 12 })));
        list.append(el('li', {}, crumb.href ? el('a', { href: crumb.href, text: crumb.label }) : el('span', { 'aria-current': 'page', text: crumb.label })));
      });
      crumbsNode.append(list);
    }
  }
}

// ---------------------------------------------------------- dados
async function loadSession(ctx) {
  const listing = await ctx.api('organizations');
  const organizations = listing.rows || [];
  // Ambiente declarado pelo servidor (ARANDU_ENV=demo): só muda o selo da barra.
  ctx.environment = listing.environment || null;
  const kind = audience === 'provider' ? 'PROVIDER' : 'BUYER';
  ctx.organizations = organizations.filter((organization) => organization.kind === kind);
  if (!ctx.organizations.length) {
    // Conta só do outro lado (ex.: provedor que entrou por /login.html): leva ao
    // espaço certo em vez de sugerir criar uma organização do tipo errado.
    const other = organizations.some((organization) => organization.kind === (kind === 'BUYER' ? 'PROVIDER' : 'BUYER'));
    if (other && !demoPage && !PUBLIC_WHEN_SIGNED_OUT.has(view)) return { empty: true, redirect: kind === 'BUYER' ? '/provider/index.html' : '/finance/dashboard.html' };
    return { empty: true };
  }
  let remembered = '';
  try { remembered = sessionStorage.getItem('arandu-finance-org') || ''; } catch { remembered = ''; }
  ctx.organization = ctx.organizations.find((organization) => organization.id === remembered) || ctx.organizations[0];
  if (demoPage) ctx.persona = ctx.transport.persona();
  if (audience === 'provider') {
    const result = await ctx.api(`assignments?organization_id=${encodeURIComponent(ctx.organization.id)}`);
    ctx.data = { assignments: result.rows || [], pending_invites: result.pending_invites || [] };
    if (ctx.persona) {
      ctx.viewer = { id: ctx.persona.user, name: ctx.persona.name, title: ctx.persona.title, role: ctx.persona.role };
    } else {
      // Nome e cargo de quem está no portal (sem e-mail), como no espaço da empresa.
      const members = await ctx.api(`members?organization_id=${encodeURIComponent(ctx.organization.id)}`).catch(() => ({ rows: [], viewer_id: null }));
      const me = (members.rows || []).find((member) => member.user_id === members.viewer_id);
      ctx.viewer = { id: members.viewer_id || null, role: me?.role || 'provider_user', name: me?.display_name || null, title: me?.title || null };
    }
    return {};
  }
  const [overview, members] = await Promise.all([
    ctx.api(`overview?organization_id=${encodeURIComponent(ctx.organization.id)}`),
    ctx.api(`members?organization_id=${encodeURIComponent(ctx.organization.id)}`).catch(() => ({ rows: [], viewer_id: null }))
  ]);
  ctx.data = overview;
  ctx.organization = { ...ctx.organization, ...(overview.organization || {}) };
  ctx.members = members.rows || [];
  const me = ctx.members.find((member) => member.user_id === members.viewer_id);
  ctx.viewer = { id: members.viewer_id, role: me?.role || null, name: me?.display_name || ctx.persona?.name || null, title: me?.title || ctx.persona?.title || null, roleLabel: ROLE_LABELS[me?.role] };
  return {};
}

function counts(ctx) {
  if (audience === 'provider') {
    const rows = ctx.data.assignments || [];
    return { providerRfqs: rows.filter((row) => ['open', 'collecting'].includes(row.rfq_status) && (!row.version || row.rfq_revision > (row.submitted_rfq_revision || 0))).length || null,
      providerHome: (ctx.data.pending_invites || []).length || null };
  }
  const rfqs = ctx.data.rfqs || [];
  const contractsInWindow = (ctx.data.contracts || []).filter((row) => row.status === 'active' && needsRenewalAttention(row)).length;
  return { rfqs: rfqs.filter((rfq) => ['open', 'collecting', 'comparing'].includes(rfq.status)).length || null, contracts: contractsInWindow || null,
    tasks: (ctx.data.tasks || []).filter((task) => !task.assignee_id || task.assignee_id === ctx.viewer?.id).length || null };
}

// ------------------------------------------------------------ estados
function signedOutView(ctx, error) {
  const denied = error?.status === 403;
  ctx.header({ subtitle: null });
  const destination = audience === 'provider' ? '/provider/index.html' : '/finance/dashboard.html';
  return el('div', { class: 'gate' }, [
    el('span', { class: 'gate-icon' }, icon(denied ? 'lock' : 'shield', { size: 22 })),
    el('h2', { class: 'gate-title', text: denied ? 'Acesso negado' : 'Entre para usar o portal' }),
    el('p', { class: 'gate-text', text: denied ? 'Esta conta não é membro da organização solicitada. Peça um convite ao administrador da empresa.'
      : 'Os dados do procurement financeiro exigem sessão autenticada. Entre na sua conta para carregar organizações, solicitações e propostas.' }),
    el('div', { class: 'gate-actions' }, [
      linkButton('Entrar na conta', `/login.html?next=${encodeURIComponent(destination)}`, { variant: 'primary', iconName: 'arrowRight' }),
      DEMO_BUILD ? linkButton('Explorar a demonstração', '/demo/index.html', { iconName: 'sparkles' }) : null
    ].filter(Boolean))
  ]);
}

function createOrganizationView(ctx) {
  const buyer = audience !== 'provider';
  ctx.header({ subtitle: null });
  const form = el('form', { id: 'create-organization-form', class: 'stack' });
  const name = el('input', { name: 'legal_name', required: true, minlength: '2', maxlength: '200', 'aria-label': 'Razão social' });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary' }, el('span', { class: 'btn-label', text: 'Criar organização' }));
  form.append(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: buyer ? 'Razão social da empresa' : 'Razão social da instituição' }), name]), submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const result = await ctx.api('organizations', { method: 'POST', body: JSON.stringify({ legal_name: name.value, country: 'BR', kind: buyer ? 'BUYER' : 'PROVIDER' }) });
      try { sessionStorage.setItem('arandu-finance-org', result.id); } catch { /* sem memória */ }
      toast('Organização criada. Você é o administrador dela.');
      render({ refresh: true });
    } catch (error) {
      toast(/pilot access/i.test(error.message) ? 'Esta conta ainda não está liberada para o piloto. Peça ao responsável do Arandu para incluir o seu e-mail.' : error.message, 'error');
      submit.disabled = false;
    }
  });
  return el('div', { class: 'gate', id: 'create-organization' }, [
    el('span', { class: 'gate-icon' }, icon('building', { size: 22 })),
    el('h2', { class: 'gate-title', text: buyer ? 'Crie a organização da sua empresa' : 'Comece criando a organização da sua instituição' }),
    el('p', { class: 'gate-text', text: buyer ? 'A organização agrupa pessoas, solicitações e contratos. Quem cria vira administrador.' : 'O convite é vinculado a uma organização provedora. Crie a sua para poder aceitar.' }),
    form
  ]);
}

// ---------------------------------------------------------- render
let shellReady = false;
let bellApi = null;
async function render({ refresh = false, rebuildShell = false } = {}) {
  const ctx = window.__aranduCtx;
  if (refresh) { ctx.approvalsPromise = null; }
  if (!refresh && view !== 'boundaries') root.replaceChildren(loading());
  let session = null;
  let failure = null;
  try { session = await loadSession(ctx); } catch (error) { failure = error; }
  if (session?.redirect) { location.replace(session.redirect); return; }

  if (!shellReady || rebuildShell) {
    if (!workspace) renderDemoBanner(ctx);
    const { searchButton, bell } = renderTopbar(ctx);
    if (!failure && !session?.empty) {
      if (!workspace) installCommandCenter(ctx, searchButton);
      bellApi = installNotificationCenter(ctx, bell);
      ctx.refreshBell = () => bellApi?.refresh();
    }
    workspace?.installShell(ctx);
    shellReady = true;
  } else bellApi?.refresh();
  const navCounts = failure || session?.empty ? {} : counts(ctx);
  renderSidebar(ctx, navCounts);
  workspace?.decorateSidebar(ctx, navCounts);
  if (!failure && !session?.empty) renderMobileNav(ctx, navCounts);
  document.body.classList.toggle('is-signed-out', Boolean(failure));

  let node;
  try {
    if (failure && failure.status !== 401 && failure.status !== 403) node = errorState({ title: 'Não foi possível carregar o portal', error: failure, onRetry: () => render() });
    else if (failure && PUBLIC_WHEN_SIGNED_OUT.has(view)) { ctx.signedOut = true; node = await VIEWS[view](ctx); }
    else if (failure) node = signedOutView(ctx, failure);
    else if (session?.empty) node = PUBLIC_WHEN_SIGNED_OUT.has(view) || ORGANIZATION_OPTIONAL.has(view) ? await VIEWS[view](ctx) : createOrganizationView(ctx);
    else node = await VIEWS[view](ctx);
  } catch (error) {
    node = errorState({ title: 'Esta tela não pôde ser exibida', error, onRetry: () => render({ refresh: true }) });
  }
  if (node) root.replaceChildren(node);
  root.setAttribute('aria-busy', 'false');
  workspace?.afterRender(ctx, { failure });
  focusDeepLink();
}

// Link direto para um item (busca, notificação, e-mail): leva o foco até ele,
// mesmo quando a lista chega depois da tela.
const DEEP_LINK = /^#(provider|task|contract|proposal|comment|document)-[0-9a-f-]{36}$/;
function focusDeepLink() {
  if (!DEEP_LINK.test(location.hash)) return;
  let tries = 0;
  const attempt = () => {
    const target = document.getElementById(location.hash.slice(1));
    if (!target) { if (++tries < 20) setTimeout(attempt, 100); return; }
    target.classList.add('highlighted');
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  };
  attempt();
}

async function boot() {
  // Telas exclusivas da demo (Work OS) só existem depois que a camada da demo carrega.
  if (!root || (!VIEWS[view] && !demoPage)) return;
  root.setAttribute('aria-busy', 'true');
  const transport = await createTransport();
  if (!transport) {
    // Página de demonstração servida por um build que não a habilita: falha
    // fechada, sem motor, sem dado fictício e sem acesso ao servidor.
    root.replaceChildren(emptyState({ title: 'Demonstração indisponível neste ambiente', text: 'Este ambiente não publica a demonstração interativa. Use o portal com a sua conta.', iconName: 'lock',
      action: linkButton('Entrar na conta', '/login.html', { variant: 'primary' }) }));
    return;
  }
  const ctx = createContext(transport);
  window.__aranduCtx = ctx;
  workspace = await loadWorkspace();
  if (workspace) {
    VIEWS.dashboard = VIEWS.home = workspace.dashboard;
    Object.assign(VIEWS, workspace.views || {});
    ctx.demoSettings = workspace.settingsSection(ctx);
  }
  if (!VIEWS[view]) return;
  await render();
  if (ctx.mode === 'demo' && transport.recovered?.()) toast('O estado salvo da demonstração era inválido ou de outra versão e foi restaurado para o conjunto inicial.', 'info');
  if (ctx.mode === 'demo' && !transport.persistent?.()) toast('Este navegador não permite guardar dados locais: a demonstração funciona, mas não sobrevive a recarregar a página.', 'info');
}

window.addEventListener('pageshow', (event) => { if (event.persisted && window.__aranduCtx) render({ refresh: true }); });
boot().catch((error) => {
  root?.replaceChildren(errorState({ title: 'Não foi possível carregar o portal', error, onRetry: () => location.reload() }));
});
