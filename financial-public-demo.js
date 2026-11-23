// Site institucional servido pela Demo canônica (ARANDU_ENV=demo): o visitante
// precisa saber que está numa demonstração e por onde entrar. Só o servidor diz
// o ambiente (GET /api/health, sem cota de entrada); em Produção nada muda.
// Não autentica, não cria workspace e não promete jornada: só leva à escolha de
// persona da página de login, que é a entrada real (financial-demo-entry.js).

export const DEMO_ENTRY = '/login.html#demonstracao';

/** Ajusta a página já carregada para a Demo. Exportada para teste; idempotente. */
export function applyDemoEntry(doc = document) {
  if (doc.getElementById('demo-site-banner')) return false;
  const banner = doc.createElement('div');
  banner.id = 'demo-site-banner';
  banner.className = 'demo-site-banner';
  banner.setAttribute('role', 'note');
  const wrap = doc.createElement('div');
  wrap.className = 'wrap';
  const text = doc.createElement('p');
  text.textContent = 'Você está na demonstração do Arandu: produto real, com empresa e instituições fictícias. Nenhum dado sai deste ambiente.';
  const link = doc.createElement('a');
  link.className = 'button';
  link.href = DEMO_ENTRY;
  link.textContent = 'Escolher persona e entrar';
  wrap.append(text, link);
  banner.append(wrap);
  doc.querySelector('.public-header')?.after(banner);
  // Entradas que levariam ao login corporativo ou ao portal sem sessão passam pela escolha de persona.
  for (const anchor of doc.querySelectorAll('a[href="/login.html"], a[href="/provider/index.html"]')) {
    const provider = anchor.getAttribute('href') === '/provider/index.html';
    anchor.setAttribute('href', DEMO_ENTRY);
    if (provider) anchor.textContent = 'Entrar como instituição (demonstração)';
    else if (anchor.classList.contains('nav-cta') || anchor.classList.contains('button')) anchor.textContent = 'Entrar na demonstração';
  }
  // Na Demo não há "acesso ao piloto": o convite é para explorar.
  const access = doc.getElementById('acesso');
  if (access) {
    const title = access.querySelector('h2');
    const lead = access.querySelector('h2 + p');
    if (title) title.textContent = 'Explore o ciclo completo como empresa ou instituição.';
    if (lead) lead.textContent = 'Cada visitante entra num espaço só seu, com permissões reais da persona escolhida. O espaço expira sozinho.';
    const eyebrow = access.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'DEMONSTRAÇÃO';
    const scope = access.querySelector('a[href="/limites.html"]');
    if (scope) scope.textContent = 'O que o Arandu não faz';
  }
  return true;
}

if (typeof document !== 'undefined' && !/^\/(login|cadastro)\.html$/.test(location.pathname)) {
  fetch('/api/health', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((health) => { if (health?.release?.environment === 'demo' && health.release.datasource === 'supabase') applyDemoEntry(); })
    .catch(() => {});
}
