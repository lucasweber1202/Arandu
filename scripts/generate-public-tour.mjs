#!/usr/bin/env node
// Gera demo/visita.html — a visita guiada pública (P0-A, guideline v3.5 §37).
//
// Fontes (nenhum valor é escrito à mão aqui):
//   lib/public-tour.mjs            etapas, rotas canônicas e classificação
//   lib/finance/navigation.mjs     cinco áreas e rótulos do menu
//   lib/finance/demo-personas.mjs  pessoas e instituições fictícias
//   scripts/demo/dataset.mjs       valores do cenário (o mesmo do seed real)
//   demo/visita/captures.json      capturas da Demo canônica, com proveniência
//
//   node scripts/generate-public-tour.mjs           escreve a página
//   node scripts/generate-public-tour.mjs --check   falha se estiver desatualizada
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { TOUR_STEPS, TOUR_KINDS } from '../lib/public-tour.mjs';
import { COMPANY_AREAS, PROVIDER_AREAS } from '../lib/finance/navigation.mjs';
import { BUYERS, PROVIDERS } from '../lib/finance/demo-personas.mjs';
import * as DATASET from './demo/dataset.mjs';

const { COMPANY, RFQ_CREDIT, RFQ_OPEN, RFQ_ACQUIRING, RFQ_WORKING_CAPITAL_CURRENT, TASKS, LIFECYCLE, COMMENTS } = DATASET;

const OUTPUT = 'demo/visita.html';
const CAPTURES = 'demo/visita/captures.json';

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (value, digits = 2) => Number(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (value) => `${num(value)}%`;
const money = (value) => (value >= 1e6 && value % 1e5 === 0 ? `R$ ${num(value / 1e6, value % 1e6 ? 1 : 0)} milhões` : `R$ ${num(value, value % 1 ? 2 : 0)}`);
const provider = (key) => PROVIDERS[key].name;
const person = (key) => BUYERS[key] || PROVIDERS[key]?.person;
const days = (n) => `${n} dias`;

const allItems = [...COMPANY_AREAS, ...PROVIDER_AREAS].flatMap((area) => area.items.map((item) => ({ ...item, area })));
const where = (key) => {
  const item = allItems.find((entry) => entry.key === key);
  if (!item) throw new Error(`Item de menu inexistente em lib/finance/navigation.mjs: ${key}`);
  return item;
};

const table = (caption, head, rows) => `<div class="tour-table table-scroll" role="region" aria-label="${esc(caption)}" tabindex="0"><table class="data-table compact"><caption>${esc(caption)}</caption><thead><tr>${head.map((cell, index) => `<th scope="col"${index ? ' class="num"' : ''}>${esc(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => (index ? `<td class="num" data-label="${esc(head[index])}">${esc(cell)}</td>` : `<th scope="row">${esc(cell)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
const facts = (pairs) => `<dl class="tour-facts">${pairs.map(([term, value]) => `<div><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
const list = (items) => `<ul class="tour-list">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
const quote = ([who, text]) => `<blockquote class="tour-quote"><p>${esc(text)}</p><footer>${esc(person(who)?.name || provider(who))}${PROVIDERS[who] ? ` · ${esc(provider(who))}` : ` · ${esc(person(who).title)}`}</footer></blockquote>`;

const last = (versions) => versions[versions.length - 1].terms;
const atlasCredit = RFQ_CREDIT.proposals.atlas;
const openTasks = TASKS.filter((task) => !task.done);
const contract = RFQ_ACQUIRING.contract;
const renewal = RFQ_WORKING_CAPITAL_CURRENT.contract;
const covenantState = (covenant) => {
  if (covenant.waiver?.decision?.status === 'approved') return `${num(covenant.measured.value, 1)}x medido · não conforme, com dispensa aprovada até +${covenant.waiver.until} dias`;
  if (covenant.review?.status === 'compliant') return `${num(covenant.measured.value, 1)}x medido · conforme (revisado)`;
  return 'Aguardando dados — ausência não conta como conformidade';
};

// Processos (solicitações) citados na visita. Cada etapa com `case` mostra a
// qual deles pertence: são negociações distintas do mesmo cenário, e a página
// não pode sugerir continuidade entre propostas, decisões e contratos de RFQs
// diferentes. O estágio é texto de produto; nomes e valores vêm do dataset.
const CASES = {
  RFQ_CREDIT: { tag: 'Processo A', stage: `Em aprovação — etapa da ${BUYERS.helena.title}` },
  RFQ_OPEN: { tag: 'Processo B', stage: `Coleta de propostas aberta — prazo em ${days(RFQ_OPEN.deadline)}` },
  RFQ_ACQUIRING: { tag: 'Processo C', stage: `Decidido — contrato com a ${provider(RFQ_ACQUIRING.winner)} vigente` },
  RFQ_WORKING_CAPITAL_CURRENT: { tag: 'Processo D', stage: `Contrato com o ${provider(RFQ_WORKING_CAPITAL_CURRENT.winner)} vigente — vence em ${days(RFQ_WORKING_CAPITAL_CURRENT.contract.ends)}` }
};
const caseRef = (key) => {
  if (!CASES[key] || !DATASET[key]) throw new Error(`Processo desconhecido na visita: ${key}`);
  return `${CASES[key].tag} · ${DATASET[key].title}`;
};
const caseList = () => `<ol class="tour-cases">${Object.keys(CASES).map((key) => `<li><span class="tour-case-tag">${esc(CASES[key].tag)}</span><strong>${esc(DATASET[key].title)}</strong><span>${esc(CASES[key].stage)} · instituições: ${esc(DATASET[key].invited.map(provider).join(', '))}</span></li>`).join('')}</ol>`;
const profile = Object.fromEntries(COMPANY.profile.map(([field, value]) => [field, value]));

// Conteúdo de cada etapa: texto de produto + fatos tirados do dataset.
const BODY = {
  contexto: () => `<p>A ${esc(COMPANY.legal_name)} (${esc(COMPANY.sector.toLowerCase())}, ${esc(profile.colaboradores)} colaboradores) já tem relacionamento com várias instituições: ${esc(profile.bancos_relacionamento)}. Crédito, adquirência e tarifas foram negociados em momentos diferentes, cada um com seu contrato, prazo e responsável.</p>
<p>Sem um lugar comum, a tesouraria depende de e-mails, planilhas e da memória de quem negociou para saber o que vence, quanto custa e por que cada escolha foi feita. O Arandu organiza esse ciclo: pedir propostas comparáveis, decidir com responsáveis definidos e acompanhar o contrato até a próxima renegociação.</p>
<p>Esta visita passa por quatro processos diferentes do mesmo cenário — não é uma única negociação:</p>
${caseList()}
<p class="tour-note">Empresa, pessoas, instituições e valores fictícios. Não há métricas de economia, logos ou clientes reais nesta visita.</p>`,
  painel: () => `<p>${esc(BUYERS.juliana.name)}, ${esc(BUYERS.juliana.title.toLowerCase())} da ${esc(COMPANY.legal_name)}, começa pelo Início: o que depende dela, o que está parado esperando alguém e o que vence em breve. Nada de indicador decorativo — cada linha leva à solicitação, ao contrato ou à tarefa correspondente.</p>
${list([
    `Aprovação da nova linha de capital de giro na etapa da ${BUYERS.helena.title}`,
    `Coleta aberta: “${RFQ_OPEN.title}”, prazo em ${days(RFQ_OPEN.deadline)}`,
    `Contrato do ${provider('atlas')} vence em ${days(renewal.ends)}; aviso prévio de ${days(renewal.notice)}`,
    `${openTasks.length} tarefas abertas do time, além das revisões de renovação que o produto cria ao registrar contratos`
  ])}`,
  solicitacao: () => `<p>Uma solicitação descreve a necessidade num formato comparável para todas as instituições. Os dados da empresa vêm do Perfil financeiro e ficam fotografados na solicitação, com origem declarada.</p>
${facts([
    ['Objetivo', RFQ_CREDIT.description],
    ['Valor', money(RFQ_CREDIT.demand.amount)],
    ['Prazo e carência', `${RFQ_CREDIT.demand.term_months} meses, ${RFQ_CREDIT.demand.grace_months} de carência`],
    ['Garantias oferecidas', RFQ_CREDIT.demand.collateral],
    ['Condições pedidas', RFQ_CREDIT.demand.notes],
    ['Instituições convidadas', RFQ_CREDIT.invited.map(provider).join(', ')],
    ['Estado', `Em avaliação — aprovação na etapa da ${BUYERS.helena.title}`]
  ])}`,
  convites: () => `<p>Só instituições convidadas acessam a solicitação, e cada uma vê apenas o próprio convite, as próprias propostas e o que a empresa decidiu compartilhar com ela. Nenhuma instituição vê a proposta da outra.</p>
${table(`Convites — ${RFQ_OPEN.title}`, ['Instituição', 'Situação'], [
    [provider('orbe'), 'Proposta enviada'],
    [provider('meridian'), 'Convite aceito, proposta ainda não enviada']
  ])}
<p class="tour-note">Prazo da coleta: ${esc(days(RFQ_OPEN.deadline))}. Na apresentação ao vivo, a ${esc(provider('meridian'))} envia a proposta pelo portal com backend real; nesta visita pública nada é enviado.</p>`,
  propostas: () => `<p>Cada resposta entra no mesmo formato, com versões preservadas. O pedido de ajuste, a resposta da instituição e a nova versão ficam no processo — não em e-mails soltos e planilhas paralelas.</p>
${table(`${provider('atlas')} — versões da proposta`, ['Condição', 'Versão 1', 'Versão 2'], [
    ['Taxa', `${pct(atlasCredit[0].terms.interest_rate_month)} a.m.`, `${pct(atlasCredit[1].terms.interest_rate_month)} a.m.`],
    ['Spread sobre CDI', `${pct(atlasCredit[0].terms.index_spread)} a.a.`, `${pct(atlasCredit[1].terms.index_spread)} a.a.`],
    ['CET informado', `${pct(atlasCredit[0].terms.cet_year)} a.a.`, `${pct(atlasCredit[1].terms.cet_year)} a.a.`],
    ['Tarifas', money(atlasCredit[0].terms.fees_amount), money(atlasCredit[1].terms.fees_amount)]
  ])}
${quote(COMMENTS.creditToAtlas)}${quote(COMMENTS.creditFromAtlas)}
<p class="tour-note">Oferta recebida fora do portal, por e-mail ou documento: a equipe da empresa pode registrar a transcrição, com canal, referência e conferência por uma pessoa da gestão. Ela entra na comparação marcada como fonte externa, nunca como proposta enviada ou aceita pela instituição, e não pode ser escolhida nem contratada por esse caminho. Esse registro exige o ambiente com backend atualizado; nesta visita nada é gravado.</p>`,
  comparacao: () => {
    const rows = [['MDR débito', 'mdr_debit', pct], ['MDR crédito à vista', 'mdr_credit_cash', pct], ['MDR parcelado', 'mdr_credit_installment', pct], ['PIX', 'pix_fee', pct],
      ['Antecipação (a.m.)', 'anticipation_rate', pct], ['Liquidação', 'settlement_days', (d) => `D+${d}`], ['Aluguel por terminal', 'terminal_rent', money]];
    const order = ['nexo', 'lumina', 'atlas'];
    const terms = Object.fromEntries(order.map((key) => [key, last(RFQ_ACQUIRING.proposals[key])]));
    const labels = order.map((key) => `${provider(key)}${RFQ_ACQUIRING.proposals[key].length > 1 ? ` v${RFQ_ACQUIRING.proposals[key].length}` : ''}`);
    const weights = { mdr_credit_cash: 'crédito à vista', mdr_credit_installment: 'parcelado', anticipation_rate: 'antecipação', settlement_days: 'liquidação', terminal_rent: 'aluguel' };
    return `<p>As condições informadas pelas instituições aparecem lado a lado, campo a campo. Os pesos são da empresa; o Arandu não declara vencedor nem chama uma proposta de “melhor”.</p>
${table(`Comparação — ${RFQ_ACQUIRING.title}`, ['Condição', ...labels], rows.map(([label, field, format]) => [label, ...order.map((key) => format(terms[key][field]))]))}
<p class="tour-note">Pesos registrados pela tesouraria: ${esc(Object.entries(RFQ_ACQUIRING.weights).map(([field, weight]) => `${weights[field]} ${weight}`).join(', '))}. Na nova linha de crédito (Processo A), a ${esc(provider('orbe'))} não informou o CET: a comparação mostra “não informado”, sem estimar.</p>`;
  },
  aprovacao: () => `<p>Quem pede não aprova a própria solicitação. A política da empresa define as etapas; cada aprovador vê valores, condições, comentários e justificativa antes de decidir.</p>
${table(`Aprovação — ${RFQ_CREDIT.title}`, ['Etapa', 'Situação'], [
    [`1 · ${BUYERS.carlos.name} (${BUYERS.carlos.title})`, 'Aprovada'],
    [`2 · ${BUYERS.helena.name} (${BUYERS.helena.title})`, 'Pendente — é a vez dela']
  ])}
<p>Para comparar, uma decisão já concluída em outro processo (${esc(caseRef('RFQ_ACQUIRING'))}), aprovada pelo Controller e pela CFO:</p>
<blockquote class="tour-quote"><p>${esc(RFQ_ACQUIRING.decisionRationale)}</p><footer>Justificativa da decisão · ${esc(COMPANY.trade_name)}</footer></blockquote>`,
  contrato: () => `<p>Na concorrência de adquirência (${esc(CASES.RFQ_ACQUIRING.tag)}), a decisão virou contrato com vigência, aviso prévio e condições estruturadas. A partir daí o Arandu cria os marcos de renovação e as tarefas antes do vencimento.</p>
${facts([
    ['Contrato', `${provider('lumina')} — adquirência, ${RFQ_ACQUIRING.proposals.lumina.at(-1).terms.contract_months} meses`],
    ['Custo contratado', contract.cost],
    ['Condições', contract.conditions],
    ['Aviso prévio', days(contract.notice)],
    ['Outro contrato a renovar', `${esc(CASES.RFQ_WORKING_CAPITAL_CURRENT.tag)}: linha do ${provider('atlas')} vence em ${days(renewal.ends)}; aviso prévio de ${days(renewal.notice)}`]
  ])}`,
  continuidade: () => {
    const impl = LIFECYCLE.implementation;
    return `<p>O valor do Arandu continua depois da assinatura: implantação, obrigações contratuais, tarifas cobradas e o histórico com cada instituição ficam no mesmo lugar, com fonte. Os covenants abaixo são da linha vigente do ${esc(provider('atlas'))} (${esc(CASES.RFQ_WORKING_CAPITAL_CURRENT.tag)}); implantação e tarifas são do contrato da ${esc(provider('lumina'))} (${esc(CASES.RFQ_ACQUIRING.tag)}).</p>
${table('Covenants e obrigações — cédula do Atlas Bank', ['Obrigação', 'Situação'], LIFECYCLE.covenants.map((covenant) => [covenant.title, covenantState(covenant)]))}
${facts([
    ['Implantação (Processo C)', `${impl.title}: ${impl.completed.length} marcos concluídos com evidência, 1 bloqueado — ${impl.issue.title}; go-live previsto em +${impl.goLive} dias`],
    ['Tarifas contratadas (Processo C)', `${LIFECYCLE.fees.service}: ${LIFECYCLE.fees.observation.volume} terminais a ${money(LIFECYCLE.fees.rate)} no contrato, ${money(LIFECYCLE.fees.observation.observed_amount)} no extrato — diferença para análise humana, não acusação nem economia`],
    ['Relacionamento', `Qualificação do ${provider(LIFECYCLE.qualification.provider)} aguardando revisão interna; performance do “${LIFECYCLE.performance.title}” com liquidação medida e resposta a chamados indisponível`]
  ])}`;
  },
  instituicao: () => `<p>Do outro lado, ${esc(PROVIDERS.atlas.person.name)} (${esc(PROVIDERS.atlas.person.title)}, ${esc(provider('atlas'))}) acessa o portal da instituição. Ele vê somente as solicitações para as quais o ${esc(provider('atlas'))} foi convidado — não vê outras instituições, propostas concorrentes nem a comparação da empresa.</p>
${list([
    'Convite com prazo e contato da empresa',
    'Necessidade estruturada, condições pedidas e documentos compartilhados',
    'Perguntas e respostas no próprio processo'
  ])}`,
  'instituicao-proposta': () => `<p>A instituição preenche a proposta nos mesmos campos da solicitação, salva rascunho, anexa documentos e envia. Uma revisão gera nova versão; a anterior continua registrada.</p>
${list([
    `${provider('atlas')}: versão 2 enviada após o pedido de redução da TAC`,
    `${provider('meridian')}: rascunho salvo nesta solicitação, não enviado dentro do prazo`,
    'Status visível para a instituição: enviada, em avaliação, decidida'
  ])}`,
  'instituicao-valor': () => `<p>Para o gerente de relacionamento, uma solicitação no Arandu chega pronta para análise: o que a empresa precisa, em que prazo e com quais documentos. Isso reduz idas e vindas antes de levar o caso ao comitê.</p>
${table('O que a instituição recebe — e o que não recebe', ['No portal da instituição', 'Situação'], [
    ['Necessidade estruturada (valor, prazo, carência, garantias)', 'Disponível'],
    ['Documentos que a empresa decidiu compartilhar', 'Disponível'],
    ['Prazo da coleta e status da própria proposta', 'Disponível'],
    ['Perguntas e pedidos de ajuste no próprio processo', 'Disponível'],
    ['Versões anteriores da própria proposta', 'Disponível'],
    ['Propostas de outras instituições e comparação da empresa', 'Nunca visível']
  ])}
<p>Na prática do cenário: ${esc(PROVIDERS.atlas.person.name)} respondeu ao pedido de redução da TAC com uma versão 2 no mesmo processo, em vez de reabrir a negociação por e-mail. A ${esc(provider('meridian'))} tem convite aceito no ${esc(CASES.RFQ_OPEN.tag)} e pode enviar a proposta até o fim do prazo.</p>
<p class="tour-note">O Arandu não garante volume nem aprovação de crédito à instituição, e a escolha é sempre da empresa. Nesta visita pública nenhuma proposta é enviada.</p>`
};

function capture(step, captures) {
  const shot = captures?.shots?.[step.id];
  if (!shot?.desktop) return '';
  const meta = captures;
  const who = person(step.persona);
  const date = new Date(meta.capturedAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const src = (file) => `/demo/visita/${file}`;
  const mobile = shot.mobile ? `<source media="(max-width: 640px)" srcset="${src(shot.mobile.file)}" width="${shot.mobile.width}" height="${shot.mobile.height}">` : '';
  return `<figure class="tour-shot"><picture>${mobile}<img src="${src(shot.desktop.file)}" width="${shot.desktop.width}" height="${shot.desktop.height}" loading="lazy" decoding="async" alt="${esc(shot.alt)}"></picture>
<figcaption>Tela real do Arandu na Demo canônica com dados fictícios · ${esc(who.name)} · capturada em ${esc(date)} no commit ${esc(String(meta.sha).slice(0, 7))}</figcaption></figure>`;
}

function render() {
  const captures = existsSync(CAPTURES) ? JSON.parse(readFileSync(CAPTURES, 'utf8')) : null;
  const buyer = TOUR_STEPS.filter((step) => step.track === 'buyer');
  const providerSteps = TOUR_STEPS.filter((step) => step.track === 'provider');
  const stepNumber = (step) => TOUR_STEPS.indexOf(step) + 1;
  const navLink = (step) => `<li><a href="#${step.id}"><span class="tour-n" aria-hidden="true">${stepNumber(step)}</span>${esc(step.title)}</a></li>`;
  const section = (step) => {
    const item = where(step.nav);
    const index = TOUR_STEPS.indexOf(step);
    const prev = TOUR_STEPS[index - 1];
    const next = TOUR_STEPS[index + 1];
    const audience = step.track === 'provider' ? 'Instituição financeira' : 'Empresa';
    return `<section class="tour-step" id="${step.id}" aria-labelledby="${step.id}-title" data-step="${index}">
<p class="tour-where"><span class="tour-badge">${TOUR_KINDS[step.kind]}</span><span>${audience} · ${esc(item.area.label)} › ${esc(item.label)}</span></p>
${step.case ? `<p class="tour-case"><span class="tour-case-tag">${esc(CASES[step.case].tag)}</span> ${esc(DATASET[step.case].title)}</p>` : ''}
<h2 id="${step.id}-title"><span class="tour-step-n">Etapa ${stepNumber(step)} de ${TOUR_STEPS.length}</span> ${esc(step.title)}</h2>
<div class="tour-body"><div class="tour-text">${BODY[step.id]()}</div>${capture(step, captures)}</div>
<nav class="tour-pager" aria-label="Etapas vizinhas">${step.id === 'instituicao-proposta' ? '<a class="tour-skip" href="#areas">Pular para as cinco áreas</a>' : ''}${prev ? `<a class="btn" href="#${prev.id}" rel="prev">← ${esc(prev.title)}</a>` : '<a class="btn" href="#topo">← Início da visita</a>'}${next ? `<a class="btn btn-primary" href="#${next.id}" rel="next">${esc(next.title)} →</a>` : '<a class="btn btn-primary" href="#areas">Ver as cinco áreas →</a>'}</nav>
</section>`;
  };
  const areas = COMPANY_AREAS.map((area) => `<li class="tour-area"><h3>${esc(area.label)}</h3><p>${esc(area.hint)}</p><ul>${area.items.filter((item) => !item.mobileOnly).map((item) => {
    const step = TOUR_STEPS.find((entry) => entry.nav === item.key);
    return `<li>${step ? `<a href="#${step.id}">${esc(item.label)}</a>` : esc(item.label)}</li>`;
  }).join('')}</ul></li>`).join('');
  const missing = Object.keys(BODY).filter((id) => !TOUR_STEPS.some((step) => step.id === id));
  if (missing.length || TOUR_STEPS.some((step) => !BODY[step.id])) throw new Error('Etapas e conteúdo da visita divergem');

  return `<!doctype html>
<!-- Gerado por scripts/generate-public-tour.mjs a partir de lib/public-tour.mjs, lib/finance/navigation.mjs,
     scripts/demo/dataset.mjs e demo/visita/captures.json. Não edite à mão. -->
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Visita guiada | Arandu Financial Procurement</title>
<meta name="description" content="Visita guiada ao Arandu Financial Procurement com o cenário fictício da Vitta Foods: solicitação, propostas, comparação, aprovação, contrato e acompanhamento.">
<meta name="theme-color" content="#0e1c2b">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/finance/style.css">
<link rel="stylesheet" href="/demo/visita/tour.css">
<script type="module" blocking="render" src="/demo/visita/transitions.js"></script>
<script type="module" src="/demo/visita/tour.js"></script>
</head>
<body class="tour" data-mode="tour">
<a class="skip-link" href="#main">Pular para o conteúdo</a>
<div class="demo-banner" role="region" aria-label="Ambiente demonstrativo"><p class="demo-text"><strong>Ambiente demonstrativo</strong> <span class="demo-sub">Visita guiada com dados fictícios. Nada aqui é gravado, enviado a instituições ou executado.</span></p></div>
<header class="tour-header">
  <a class="tour-brand" href="/demo/index.html"><svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect class="brand-mark-bg" width="32" height="32" rx="7"/><path class="brand-mark-a" d="M9.5 23 16 9.5 22.5 23"/><path class="brand-mark-bar" d="M12.2 18.4h7.6"/></svg><span>Arandu <small>Financial Procurement</small></span></a>
  <a class="btn btn-ghost btn-sm" href="/demo/index.html">Início</a>
</header>
<div class="tour-layout">
<nav class="tour-steps" aria-label="Etapas da visita">
  <p class="tour-steps-title">Empresa</p><ol>${buyer.map(navLink).join('')}</ol>
  <p class="tour-steps-title">Instituição financeira</p><ol start="${buyer.length + 1}">${providerSteps.map(navLink).join('')}</ol>
  <p class="tour-steps-title"><a href="#areas">As cinco áreas</a></p>
</nav>
<main id="main" tabindex="-1" class="tour-main">
<section class="tour-intro" id="topo" aria-labelledby="tour-title">
  <p class="tour-kicker">Visita guiada · cenário fictício</p>
  <h1 id="tour-title">Uma contratação financeira, do pedido à renovação</h1>
  <p class="tour-lede">Acompanhe a ${esc(COMPANY.legal_name)} — indústria de alimentos fictícia — em processos distintos de crédito e de adquirência, cada um identificado na tela, e veja como a instituição financeira participa pelo próprio portal. Os dados são os do cenário que a demonstração canônica do Arandu grava pela API real.</p>
  <p class="tour-start"><a class="btn btn-primary btn-lg" href="#${TOUR_STEPS[0].id}">Começar pela etapa 1</a><a class="tour-skip" href="#painel">Ir direto ao trabalho de hoje</a></p>
  <details class="tour-honesty"><summary>O que é esta visita</summary>
    <ul class="tour-list">
      <li><strong>${TOUR_KINDS.informative}:</strong> leitura das telas e dos dados do cenário. Não há login, gravação, envio a instituições nem decisão real.</li>
      <li>Empresas, pessoas, instituições e valores são fictícios; e-mails usam domínios reservados “.example”.</li>
      <li>Cada etapa indica a qual processo pertence (A, B, C ou D). São solicitações diferentes: a comparação e o contrato de adquirência não decorrem da linha de crédito em aprovação.</li>
      <li>As imagens, quando presentes, são capturas de telas reais do produto na Demo canônica local, com commit e data na legenda.</li>
      <li>O Arandu não concede crédito, não movimenta dinheiro e não escolhe instituição: a decisão é sempre da empresa.</li>
    </ul>
  </details>
</section>
${TOUR_STEPS.map(section).join('\n')}
<section class="tour-areas" id="areas" aria-labelledby="areas-title">
  <h2 id="areas-title">As cinco áreas do produto</h2>
  <p>O menu do Arandu é organizado pelo trabalho do time financeiro. Os itens com link foram mostrados nesta visita.</p>
  <ul class="tour-area-list">${areas}</ul>
  <p class="tour-note">Instituições financeiras usam um portal próprio: ${esc(PROVIDER_AREAS[0].items.map((item) => item.label).join(', '))}.</p>
  <nav class="tour-pager" aria-label="Fim da visita"><a class="btn" href="#${TOUR_STEPS.at(-1).id}" rel="prev">← ${esc(TOUR_STEPS.at(-1).title)}</a><a class="btn btn-primary" href="/demo/index.html">Voltar ao início</a></nav>
</section>
</main>
</div>
</body>
</html>
`;
}

const html = render();
if (process.argv.includes('--check')) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
  if (current !== html) { console.error(`${OUTPUT} desatualizado: rode node scripts/generate-public-tour.mjs`); process.exit(1); }
  console.log(`Visita pública: ${OUTPUT} confere com as fontes (${TOUR_STEPS.length} etapas).`);
} else {
  writeFileSync(OUTPUT, html);
  console.log(`Visita pública: ${OUTPUT} gerado (${TOUR_STEPS.length} etapas).`);
}
