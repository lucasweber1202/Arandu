#!/usr/bin/env node
// Gera as páginas-casca do espaço financeiro a partir de uma única
// especificação: portal real (`/finance`, `/provider`) e o espelho da
// demonstração (`/demo/...`). Com `--check`, falha se algum arquivo publicado
// divergir do que seria gerado — assim navegação e rótulos não se desalinham.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const COMPANY_NAV = [
  ['Painel', '/finance/dashboard.html'], ['Solicitações', '/finance/rfqs.html'], ['Aprovações', '/finance/approvals.html'],
  ['Propostas', '/finance/proposals.html'], ['Implantação', '/finance/implementations.html', 'production'], ['Covenants', '/finance/covenants.html', 'production'], ['Documentos', '/finance/extractions.html', 'production'], ['Contratos', '/finance/contracts.html'], ['Portfólio', '/finance/portfolio.html'], ['Valor', '/finance/value.html'], ['Tarifas', '/finance/fees.html'], ['Oportunidades', '/finance/opportunities.html'], ['Provedores', '/finance/providers.html'], ['Qualificação', '/finance/qualifications.html', 'production'],
  ['Passport', '/finance/passport.html'], ['Tarefas', '/finance/tasks.html'], ['Configurações', '/finance/settings.html']
];
const PROVIDER_NAV = [['Início', '/provider/index.html'], ['Oportunidades', '/provider/rfqs.html'], ['Código de convite', '/provider/invite.html']];

export const PAGES = [
  { path: 'finance/covenants.html', view: 'covenants', audience: 'company', title: 'Covenants e obrigações', h1: 'Covenants e obrigações', description: 'Medições, prazos e evidência com revisão humana independente.', productionOnly: true },
  { path: 'finance/implementations.html', view: 'implementations', audience: 'company', title: 'Implantação pós-award', h1: 'Implantação pós-award', description: 'Marcos, responsáveis, prazos e aceite humano de go-live.', productionOnly: true },
  { path: 'finance/index.html', view: 'dashboard', audience: 'company', title: 'Painel', h1: 'Painel', description: 'O que precisa da sua atenção no procurement financeiro da empresa.' },
  { path: 'finance/dashboard.html', view: 'dashboard', audience: 'company', title: 'Painel', h1: 'Painel', description: 'Aprovações, prazos, renovações e concorrências em andamento.' },
  { path: 'finance/rfqs.html', view: 'rfqs', audience: 'company', title: 'Solicitações', h1: 'Solicitações', description: 'Solicitações de crédito empresarial e adquirência com status, prazo e respostas.' },
  { path: 'finance/new-rfq.html', view: 'newRfq', audience: 'company', title: 'Nova solicitação', h1: 'Nova solicitação', description: 'Estruture uma necessidade financeira em quatro etapas com salvamento automático.' },
  { path: 'finance/rfq.html', view: 'rfq', audience: 'company', title: 'Solicitação', h1: 'Detalhe da solicitação', description: 'Demanda, propostas, comparação factual, aprovações e decisão.' },
  { path: 'finance/approvals.html', view: 'approvals', audience: 'company', title: 'Aprovações', h1: 'Aprovações', description: 'Caixa de aprovação com o contexto completo de cada pedido.' },
  { path: 'finance/proposals.html', view: 'proposals', audience: 'company', title: 'Propostas', h1: 'Propostas recebidas', description: 'Propostas recebidas de provedores, com versão e revisão respondida.' },
  { path: 'finance/contracts.html', view: 'contracts', audience: 'company', title: 'Contratos', h1: 'Contratos e renovações', description: 'Ciclo de vida dos contratos: vigência, marcos de renovação e aviso prévio.' },
  // productionOnly: capability sem emulação no sandbox — nunca espelhada em /demo.
  { path: 'finance/extractions.html', view: 'extractions', audience: 'company', title: 'Documentos e fatos extraídos', h1: 'Documentos e fatos extraídos', description: 'Fatos lidos de propostas, contratos e tabelas de tarifas, com a origem de cada campo e confirmação humana.', productionOnly: true },
  { path: 'finance/qualifications.html', view: 'qualifications', audience: 'company', title: 'Qualificação de provedores', h1: 'Qualificação de provedores', description: 'Exigências da empresa, evidências com origem e validade, exceções e a decisão humana sobre cada provedor.', productionOnly: true },
  { path: 'finance/opportunities.html', view: 'opportunities', audience: 'company', title: 'Oportunidades', h1: 'Oportunidades', description: 'Fatos que pedem atenção, com a regra da empresa que disparou, a fonte e uma ação possível para uma pessoa avaliar.' },
  { path: 'finance/fees.html', view: 'fees', audience: 'company', title: 'Tarifas bancárias', h1: 'Tarifas bancárias', description: 'Tarifa contratada versus cobrança observada, com fonte, comparabilidade e revisão humana.' },
  { path: 'finance/value.html', view: 'value', audience: 'company', title: 'Valor de procurement', h1: 'Valor de procurement', description: 'Economia negociada, realizada e custo evitado com baseline, metodologia e evidência.' },
  { path: 'finance/portfolio.html', view: 'portfolio', audience: 'company', title: 'Portfólio financeiro', h1: 'Dívida, limites e garantias', description: 'Facilities, limites aprovados e usados, vencimentos, indexadores, concentração por provedor e garantias, por moeda e com a origem de cada dado.' },
  { path: 'finance/providers.html', view: 'providers', audience: 'company', title: 'Provedores', h1: 'Provedores', description: 'Bancos, fintechs e adquirentes cadastrados pela empresa.' },
  { path: 'finance/passport.html', view: 'passport', audience: 'company', title: 'Financial Passport', h1: 'Financial Passport', description: 'Perfil financeiro reutilizável da empresa, com origem, responsável, data e revisão de cada dado.' },
  { path: 'finance/tasks.html', view: 'tasks', audience: 'company', title: 'Tarefas', h1: 'Tarefas', description: 'Pendências da equipe financeira.' },
  { path: 'finance/notifications.html', view: 'notifications', audience: 'company', title: 'Notificações', h1: 'Notificações', description: 'Central de avisos: aprovações, propostas, menções, prazos e renovações.' },
  { path: 'finance/settings.html', view: 'settings', audience: 'company', title: 'Configurações', h1: 'Configurações', description: 'Empresa, perfil financeiro, política de aprovação, notificações e equipe.' },
  { path: 'finance/boundaries.html', view: 'boundaries', audience: 'company', title: 'Limites do produto', h1: 'Limites do produto', description: 'O que o Arandu faz e o que deliberadamente não faz.', lede: 'Esta página descreve, em linguagem direta, o que o Arandu faz e o que ele deliberadamente não faz na vertical de procurement financeiro B2B.', staticBody: 'boundaries' },
  { path: 'finance/ops.html', view: 'ops', audience: 'company', title: 'Console operacional', h1: 'Console operacional', description: 'Saúde de jobs, outbox de e-mail e envios de documentos, sem dados de clientes.', lede: 'Saúde da plataforma para operadores com segundo fator. Mostra estados, contagens e identificadores; nunca valores, termos, documentos ou conteúdo de clientes.' },
  { path: 'provider/index.html', view: 'providerHome', audience: 'provider', title: 'Portal do provedor', h1: 'Portal do provedor', description: 'Oportunidades, convites e propostas da sua instituição.' },
  { path: 'provider/rfqs.html', view: 'providerRfqs', audience: 'provider', title: 'Oportunidades', h1: 'Oportunidades', description: 'Solicitações para as quais a sua instituição foi convidada.' },
  { path: 'provider/proposal.html', view: 'providerProposal', audience: 'provider', title: 'Responder proposta', h1: 'Responder proposta', description: 'Responda à solicitação com as condições da sua instituição.' },
  { path: 'provider/invite.html', view: 'providerInvite', audience: 'provider', title: 'Aceitar convite', h1: 'Aceitar convite', description: 'Aceite o convite recebido para responder a uma solicitação.', referrer: true }
];

// Telas que existem SÓ na demonstração (Work OS): nunca geradas em /finance.
export const DEMO_ONLY_PAGES = [
  { path: 'finance/intake.html', view: 'workIntake', audience: 'company', title: 'O que você precisa fazer?', h1: 'O que você precisa fazer?', description: 'Comece pelo trabalho: crédito, adquirência, renovação ou comparação — com modelos e perguntas relevantes.' },
  { path: 'finance/policies.html', view: 'workPolicies', audience: 'company', title: 'Políticas de aprovação', h1: 'Políticas de aprovação', description: 'Regras versionadas de quem aprova o quê, com condições, etapas e pré-visualização.' },
  { path: 'finance/integrations.html', view: 'workIntegrations', audience: 'company', title: 'Integrações', h1: 'Integrações', description: 'Comunicação, ERP, identidade, arquivos, Open Finance e analytics — conectores simulados na demonstração.' },
  { path: 'finance/usage.html', view: 'workUsage', audience: 'company', title: 'Uso da demonstração', h1: 'Uso da demonstração', description: 'Funil, linha do tempo da sessão, auditoria, feature flags e desempenho — tudo local.' }
];

const BOUNDARIES = `
<section class="card"><div class="card-body prose-block">
  <h2>O que o Arandu faz</h2>
  <ul>
    <li>ajuda a empresa a estruturar uma necessidade financeira em campos padronizados;</li>
    <li>organiza a solicitação de propostas a múltiplos provedores;</li>
    <li>normaliza as condições recebidas para que sejam comparáveis;</li>
    <li>apresenta diferenças factuais entre as propostas;</li>
    <li>aplica os pesos que a própria empresa definir, identificando o resultado como dela;</li>
    <li>registra a decisão humana com autor, data, critérios e fotografia das propostas existentes;</li>
    <li>guarda o contrato decorrente e avisa sobre a janela de renovação.</li>
  </ul>
</div></section>
<section class="card"><div class="card-body prose-block">
  <h2>O que o Arandu não faz nesta fase</h2>
  <ul>
    <li>não concede crédito e não empresta recursos próprios;</li>
    <li>não decide crédito e não faz underwriting;</li>
    <li>não garante nem promete aprovação de crédito;</li>
    <li>não recebe recursos, não mantém saldo e não faz custódia;</li>
    <li>não executa pagamentos nem transferências;</li>
    <li>não distribui valores mobiliários e não executa investimentos;</li>
    <li>não faz gestão discricionária de recursos;</li>
    <li>não atua como banco, corretora, gestora ou plataforma de crowdfunding;</li>
    <li>não é fundo de venture capital e não intermedeia participação societária;</li>
    <li>não dá recomendação financeira individualizada nem automática;</li>
    <li>não classifica instituições como "melhores" de forma subjetiva;</li>
    <li>não executa nem assina contratos financeiros automaticamente.</li>
  </ul>
</div></section>
<section class="card"><div class="card-body prose-block">
  <h2>Comparação e neutralidade</h2>
  <p>O Arandu nunca afirma que uma instituição é a melhor. Ele afirma apenas o que é verificável na proposta recebida: menor taxa informada, menor CET informado, maior prazo, maior carência, menor MDR, menor custo fixo, menor prazo de liquidação, proposta mais recente, maior validade.</p>
  <p>Quando a empresa define critérios e pesos, o resultado aparece rotulado como <b>"Resultado conforme os pesos definidos por você"</b>, nunca como recomendação do Arandu.</p>
  <p>Valores calculados pelo Arandu — como uma estimativa de custo total — só aparecem quando todos os insumos existem, e sempre acompanhados de fórmula, insumos e premissas. O CET é exibido apenas quando informado pelo provedor; o Arandu não o infere.</p>
</div></section>
<section class="card"><div class="card-body prose-block">
  <h2>Revisão jurídica obrigatória</h2>
  <p><b>LEGAL_REVIEW_REQUIRED.</b> Esta página descreve a intenção de produto e o comportamento do software. Ela não é parecer jurídico e não afirma que a atividade descrita seja ou deixe de ser regulada em qualquer jurisdição. O enquadramento regulatório do Arandu, os contratos com empresas e provedores, a política de dados e qualquer modelo de remuneração ligado a sucesso na contratação precisam de análise jurídica humana antes de operação real.</p>
  <p>O detalhamento está em <code>docs/FINANCIAL_PRODUCT_BOUNDARIES.md</code> e <code>docs/FINANCIAL_LEGAL_REVIEW_REQUIRED.md</code> no repositório.</p>
</div></section>
<section class="card"><div class="card-body prose-block">
  <h2>Provedores e afirmações regulatórias</h2>
  <p>Um provedor cadastrado aparece como <b>não verificado</b> até que autoridade, número de registro, evidência e data de consulta sejam informados. O Arandu não afirma que um provedor é regulado apenas porque ele foi cadastrado.</p>
</div></section>`;

// Só as cascas /demo carregam a camada de experiência (tema, densidade,
// quick view, painel personalizável…). As páginas reais não mudam.
const DEMO_HEAD = '<link rel="stylesheet" href="/finance/demo/experience.css">\n<script type="module" src="/finance/demo/workspace/boot.js"></script>\n';

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderPage(page, { demo = false } = {}) {
  const prefix = demo ? '/demo' : '';
  const link = (href) => (demo && /^\/(finance|provider)\//.test(href) ? prefix + href : href);
  const nav = (page.audience === 'provider' ? PROVIDER_NAV : COMPANY_NAV)
    .filter(([, , scope]) => !(demo && scope === 'production'))
    .map(([label, href]) => `<li><a class="side-link" href="${link(href)}"${`/${page.path}` === href || (page.path === 'finance/index.html' && href === '/finance/dashboard.html') ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  const home = page.audience === 'provider' ? '/provider/index.html' : '/finance/dashboard.html';
  const banner = demo ? `<div class="demo-banner" role="region" aria-label="Ambiente demonstrativo"><p class="demo-text"><strong>Ambiente demonstrativo</strong> <span class="demo-sub">Dados fictícios. Nenhuma operação financeira real será executada.</span></p></div>\n` : '';
  const body = page.staticBody === 'boundaries' ? BOUNDARIES : '<noscript><p class="empty">Este painel depende de JavaScript para carregar dados da sua organização. A navegação entre as páginas continua funcionando sem ele.</p></noscript>';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${page.referrer ? '<meta name="referrer" content="no-referrer">\n' : ''}<meta name="robots" content="noindex,nofollow">
<title>${escape(page.title)}${demo ? ' — Demonstração' : ''} | Arandu Financial Procurement</title>
<meta name="description" content="${escape(page.description)}">
<meta name="theme-color" content="#f6f7f9">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/finance/style.css">
${demo ? DEMO_HEAD : ''}</head>
<body data-view="${page.view}" data-audience="${page.audience}"${demo ? ' data-mode="demo"' : ''}>
<a class="skip-link" href="#main">Pular para o conteúdo</a>
${banner}<div class="app-shell">
  <aside class="sidebar">
    <a class="brand" href="${link(home)}"><span class="brand-mark" aria-hidden="true">A</span><span class="brand-text"><span class="brand-name">Arandu</span><span class="brand-sub">Financial Procurement</span></span></a>
    <nav class="side-nav" aria-label="Navegacao do portal"><ul role="list">${nav}</ul></nav>
  </aside>
  <div class="workspace">
    <header class="topbar"></header>
    <main id="main" tabindex="-1">
      <header class="page-head">
        <div class="page-head-main"><h1>${escape(page.h1)}</h1><p class="lede"${page.lede ? '' : ' hidden'}>${escape(page.lede || '')}</p><div class="page-meta"></div></div>
        <div class="page-actions"></div>
      </header>
      <p id="message" class="sr-only" role="status" aria-live="polite"></p>
      <div id="view">${body}</div>
    </main>
    <footer class="app-footer"><p>Arandu — procurement financeiro B2B. <a href="${link(page.audience === 'provider' ? '/finance/dashboard.html' : '/provider/index.html')}">${page.audience === 'provider' ? 'Portal da empresa' : 'Portal do provedor'}</a> · <a href="${demo ? '/demo/index.html' : '/'}">${demo ? 'Início da demonstração' : 'Site institucional'}</a> · <a href="${link('/finance/boundaries.html')}">Limites do produto</a></p></footer>
  </div>
</div>
<script type="module" src="/finance/app.js"></script>
</body>
</html>
`;
}

export function expectedFiles() {
  const files = new Map();
  for (const page of PAGES) {
    files.set(page.path, renderPage(page));
    if (!page.productionOnly) files.set(`demo/${page.path}`, renderPage(page, { demo: true }));
  }
  for (const page of DEMO_ONLY_PAGES) files.set(`demo/${page.path}`, renderPage(page, { demo: true }));
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const drift = [];
  for (const [path, content] of expectedFiles()) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === content) continue;
    if (check) { drift.push(path); continue; }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  if (drift.length) {
    console.error(`Páginas financeiras fora da especificação (rode node scripts/generate-finance-pages.mjs):\n  ${drift.join('\n  ')}`);
    process.exit(1);
  }
  console.log(check ? `Páginas financeiras: ${expectedFiles().size} cascas conferidas com a especificação.` : `Páginas financeiras: ${expectedFiles().size} cascas geradas.`);
}
