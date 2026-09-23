// Cliente dos portais do Arandu Financial Procurement.
//
// Duas fontes de dados, nunca misturadas:
//   * sessão real -> /api/finance/*, com RLS e RBAC do lado do servidor;
//   * modo demonstração -> data/finance/demo.json, disponível apenas em builds
//     com ARANDU_PRESENTATION_MODE (o build de produção falha se a variável
//     estiver ligada), e sempre rotulado como DEMONSTRATION DATA.
//
// A página nunca apresenta "a melhor proposta". Ela destaca diferenças
// factuais e, quando a empresa define pesos, rotula o resultado como sendo
// dela.

import {
  PRODUCTS, PRODUCT_IDS, estimateCreditTotalCost, estimateAcquiringMonthlyCost, checkAcquiringShares
} from '../lib/finance/products.mjs';
import { applyUserWeights } from '../lib/finance/comparison.mjs';

const view = document.body.dataset.view || 'home';
const audience = document.body.dataset.audience || 'company';
const message = document.querySelector('#message');
const root = document.querySelector('#view');

const demoMode = document.querySelector('meta[name="arandu-presentation-mode"]')?.content === 'true';
const state = { organizations: [], organizationId: '', demo: null };
const EMPTY_DATA = Object.freeze({ rfqs: [], providers: [], contracts: [], profile: [], assignments: [], tasks: [] });

function say(text, tone = 'error') {
  if (!message) return;
  message.textContent = text;
  message.className = tone === 'error' ? '' : tone;
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
}

function show(value, type) {
  if (value === null || value === undefined || value === '') return 'não informado';
  if (type === 'money') return money(value);
  if (type === 'percent') return `${Number(value).toLocaleString('pt-BR')}%`;
  if (type === 'bool') return value ? 'sim' : 'não';
  return String(value);
}

async function api(path, options = {}) {
  const response = await fetch(`/api/finance/${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (response.status === 401) { const error = new Error('Sessão expirada ou ausente.'); error.status = 401; throw error; }
  if (response.status === 403) { const error = new Error(payload.error || 'Acesso negado para esta organização.'); error.status = 403; throw error; }
  if (!response.ok) { const error = new Error(payload.error || `Falha ${response.status}.`); error.status = response.status; throw error; }
  return payload;
}

async function demo() {
  if (!demoMode) return null;
  if (state.demo) return state.demo;
  const response = await fetch('/data/finance/demo.json', { credentials: 'same-origin' });
  if (!response.ok) return null;
  state.demo = await response.json();
  return state.demo;
}

// ---------------------------------------------------------------- componentes

function emptyState(text, action) {
  return el('div', { class: 'empty' }, [el('p', { text }), action || null]);
}

function statTile(label, value, note) {
  return el('div', { class: 'stat' }, [
    el('b', { text: String(value) }),
    el('span', { text: label }),
    note ? el('small', { class: 'muted', text: note }) : null
  ]);
}

function fieldRows(fields, values) {
  const list = el('dl', { class: 'rows' });
  for (const field of fields) {
    if (!(field.key in (values || {}))) continue;
    const row = el('div', { class: 'row' });
    row.append(el('b', { text: field.label }), el('small', { text: show(values[field.key], field.type) }));
    list.append(row);
  }
  return list.children.length ? list : emptyState('Nenhum campo desta demanda foi preenchido ainda.');
}

/**
 * Comparação factual.
 *
 * Duas apresentações do MESMO conteúdo: tabela em telas largas e um cartão por
 * proposta no celular. Uma tabela de doze colunas com rolagem lateral no
 * telefone é tecnicamente "responsiva" e praticamente ilegível — quem rola
 * perde o cabeçalho da linha e deixa de saber que número está lendo.
 *
 * Destaques citam sempre o critério verificável ("menor valor informado"),
 * nunca uma opinião sobre a instituição.
 */
function comparisonRows(product, proposals) {
  const rows = [];
  for (const field of PRODUCTS[product].proposalFields) {
    const values = proposals.map((proposal) => proposal.terms?.[field.key] ?? null);
    if (values.every((value) => value === null || value === undefined || value === '')) continue;
    let target = null;
    let numeric = [];
    if (field.comparable && field.direction) {
      numeric = values
        .map((value) => (field.type === 'date' ? Date.parse(`${value}T00:00:00Z`) : Number(value)))
        .map((value) => (Number.isFinite(value) ? value : null));
      const present = numeric.filter((value) => value !== null);
      if (present.length > 1 && new Set(present).size > 1) {
        target = field.direction === 'lower_is_better' ? Math.min(...present) : Math.max(...present);
      }
    }
    rows.push({
      field,
      values,
      best: values.map((_, index) => target !== null && numeric[index] === target),
      reason: field.direction === 'lower_is_better' ? 'menor valor informado' : 'maior valor informado'
    });
  }
  return rows;
}

function comparisonTable(product, proposals) {
  const table = el('table');
  const head = el('tr', {}, [el('th', { scope: 'col', text: 'Condição' })]);
  for (const proposal of proposals) head.append(el('th', { scope: 'col', text: proposal.provider_name }));
  table.append(el('thead', {}, head));
  const body = el('tbody');
  for (const row of comparisonRows(product, proposals)) {
    const tr = el('tr', {}, [el('th', { scope: 'row', text: row.field.label })]);
    row.values.forEach((value, index) => {
      const cell = el('td', { text: show(value, row.field.type) });
      if (row.best[index]) {
        cell.className = 'best';
        cell.append(el('span', { class: 'why', text: row.reason }));
      }
      tr.append(cell);
    });
    body.append(tr);
  }
  table.append(body);
  return el('div', { class: 'table-scroll comparison-wide' }, table);
}

function comparisonCards(product, proposals) {
  const host = el('div', { class: 'comparison-cards' });
  proposals.forEach((proposal, index) => {
    const card = el('article', { class: 'compare-card' });
    card.append(el('h3', { text: proposal.provider_name }));
    card.append(el('p', { class: 'muted', text: `Versão ${proposal.version ?? 1} · enviada em ${proposal.submitted_at ? String(proposal.submitted_at).slice(0, 10) : 'data não informada'}` }));
    const list = el('dl', { class: 'compare-list' });
    for (const row of comparisonRows(product, proposals)) {
      list.append(el('dt', { text: row.field.label }));
      const value = el('dd', { text: show(row.values[index], row.field.type) });
      if (row.best[index]) {
        value.className = 'best';
        value.append(el('span', { class: 'why', text: row.reason }));
      }
      list.append(value);
    }
    card.append(list);
    host.append(card);
  });
  return host;
}

function comparisonView(product, proposals) {
  const box = el('div');
  box.append(comparisonTable(product, proposals));
  box.append(comparisonCards(product, proposals));
  return box;
}

/** Painel de pesos: a ordenação só existe porque a empresa a pediu. */
function weightsPanel(product, proposals) {
  const spec = PRODUCTS[product].proposalFields.filter((field) => field.comparable && field.direction);
  const panel = el('section', { class: 'panel' });
  panel.append(el('h2', { text: 'Seus critérios e pesos' }));
  panel.append(el('p', {
    class: 'muted',
    text: 'Defina os pesos que fazem sentido para a sua empresa. O Arandu aplica a aritmética e identifica o resultado como seu — não como uma recomendação.'
  }));
  const form = el('form', { id: 'weights-form' });
  const fieldset = el('fieldset', {}, el('legend', { text: 'Pesos por critério (0 a 100)' }));
  for (const field of spec.slice(0, 6)) {
    const label = el('label', { text: field.label });
    label.append(el('input', {
      type: 'number', name: field.key, min: '0', max: '100', step: '5', value: '0',
      'aria-label': `Peso de ${field.label}`
    }));
    fieldset.append(label);
  }
  form.append(fieldset, el('button', { type: 'submit', text: 'Aplicar meus pesos' }));
  const output = el('div', { id: 'weights-output', role: 'status', 'aria-live': 'polite' });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const weights = {};
    for (const [key, value] of new FormData(form)) {
      const weight = Number(value);
      if (Number.isFinite(weight) && weight > 0) weights[key] = weight;
    }
    output.replaceChildren();
    // Exatamente a mesma função que a API usa, para que a tela não possa
    // discordar do servidor sobre a própria pontuação da empresa.
    const scored = applyUserWeights(product, proposals, weights);
    if (!scored.applied) {
      output.append(el('p', { class: 'muted', text: scored.notice }));
      return;
    }
    output.append(el('p', { id: 'weights-notice', text: scored.notice }));
    output.append(el('p', {
      class: 'muted',
      text: `Pesos aplicados: ${scored.criteria.map((item) => `${item.label} ${(item.share * 100).toFixed(0)}%`).join(' · ')}.`
    }));
    if (!scored.ranking_meaningful) {
      output.append(el('p', { class: 'muted', text: 'Com menos de duas propostas comparáveis, a ordenação não diz nada — ela aparece apenas para conferência.' }));
    }
    if (scored.non_discriminating_criteria.length) {
      output.append(el('p', {
        class: 'muted',
        text: `Critérios em que todas as propostas informaram o mesmo valor (não separam ninguém): ${scored.non_discriminating_criteria.join(', ')}.`
      }));
    }
    if (scored.has_low_coverage) {
      output.append(el('p', {
        id: 'coverage-warning',
        class: 'boundary',
        text: `Atenção: há proposta pontuada sobre menos de ${(scored.coverage_threshold * 100).toFixed(0)}% do peso que você definiu. A nota dela responde só pelo que foi informado, então não é comparável com a de uma proposta completa. Essas propostas aparecem por último.`
      }));
    }
    const list = el('ol', { class: 'rows' });
    for (const item of scored.results) {
      const row = el('li', { class: 'row' });
      row.append(el('b', { text: item.provider_name }));
      row.append(el('small', {
        text: `Pontuação com os seus pesos: ${item.score === null ? 'sem dados suficientes' : item.score.toFixed(3)}`
      }));
      row.append(el('small', { class: 'coverage', text: `Cobertura da pontuação: ${(item.coverage * 100).toFixed(0)}%` }));
      if (item.missing_criteria.length) {
        row.append(el('small', { text: `Não informado: ${item.missing_criteria.join(', ')}.` }));
      }
      if (item.low_coverage) row.append(el('span', { class: 'tag', text: 'cobertura baixa' }));
      list.append(row);
    }
    output.append(list);
  });
  panel.append(form, output);
  return panel;
}

/**
 * Campos que o produto espera reaproveitar entre RFQs. A lista existe para
 * dizer o que falta, não para obrigar: o perfil não é um depósito de PII, e
 * nada aqui é exigido para usar a plataforma.
 */
export const RECOMMENDED_PROFILE_FIELDS = Object.freeze([
  { key: 'faturamento_anual', label: 'faturamento anual' },
  { key: 'faturamento_mensal_cartoes', label: 'faturamento mensal em cartões' },
  { key: 'setor', label: 'setor' },
  { key: 'funcionarios', label: 'número de funcionários' },
  { key: 'fundacao', label: 'ano de fundação' },
  { key: 'bancos_atuais', label: 'bancos atuais' },
  { key: 'adquirente_atual', label: 'adquirente atual' },
  { key: 'garantias_disponiveis', label: 'garantias disponíveis' }
]);

/** Estados que o provedor vê, com o que cada um significa para ele. */
export const PROPOSAL_STATUS = Object.freeze({
  draft: { label: 'convite aceito', hint: 'Você ainda não enviou uma proposta para esta solicitação.' },
  submitted: { label: 'enviada', hint: 'Sua proposta foi enviada e está visível para a empresa compradora.' },
  revised: { label: 'revisada', hint: 'Você enviou uma versão nova. As anteriores continuam no histórico.' },
  withdrawn: { label: 'retirada', hint: 'Você retirou esta proposta. Ela permanece registrada no histórico.' }
});

const PROFILE_STALE_DAYS = 180;
const PROFILE_DUE_DAYS = 150;

/**
 * Situação de um campo do perfil. Um faturamento informado há dois anos não é
 * "preenchido": ele é um número que ninguém confere há dois anos, e quem monta
 * uma RFQ com ele precisa saber disso.
 */
export function freshness(field, today = new Date()) {
  if (!field || !field.field_value) return { level: 'missing', label: 'ausente' };
  if (field.valid_until) {
    const validUntil = Date.parse(`${field.valid_until}T00:00:00Z`);
    if (Number.isFinite(validUntil) && validUntil < today.getTime()) return { level: 'stale', label: 'vencido' };
  }
  const updated = Date.parse(field.updated_at);
  if (!Number.isFinite(updated)) return { level: 'missing', label: 'sem data' };
  const days = Math.floor((today.getTime() - updated) / 86400000);
  if (days >= PROFILE_STALE_DAYS) return { level: 'stale', label: `desatualizado (${days} dias)` };
  if (days >= PROFILE_DUE_DAYS) return { level: 'due', label: `revisar (${days} dias)` };
  return { level: 'ok', label: 'atualizado' };
}

function organizationForm(organization) {
  const panel = el('section', { class: 'panel' });
  panel.append(el('h2', { text: 'Dados da empresa' }));
  if (!organization) {
    panel.append(emptyState('Crie a organização da sua empresa para preencher os dados cadastrais.'));
    return panel;
  }
  panel.append(el('p', { class: 'muted', text: `Razão social: ${organization.legal_name}` }));
  const form = el('form', { id: 'organization-form' });
  const trade = el('label', { text: 'Nome fantasia' });
  trade.append(el('input', { name: 'trade_name', value: organization.trade_name || '', 'aria-label': 'Nome fantasia' }));
  const cnpj = el('label', { text: 'CNPJ' });
  cnpj.append(el('input', {
    name: 'tax_identifier', value: organization.tax_identifier || '', inputmode: 'numeric',
    placeholder: '00.000.000/0000-00', 'aria-label': 'CNPJ'
  }));
  const sector = el('label', { text: 'Setor' });
  sector.append(el('input', { name: 'sector', value: organization.sector || '', 'aria-label': 'Setor' }));
  const band = el('label', { text: 'Faixa de faturamento' });
  const select = el('select', { name: 'revenue_band', 'aria-label': 'Faixa de faturamento' });
  select.add(new Option('Selecione…', ''));
  for (const [value, text] of REVENUE_BANDS) select.add(new Option(text, value));
  if (organization.revenue_band) select.value = organization.revenue_band;
  band.append(select);
  form.append(trade, cnpj, sector, band, el('button', { type: 'submit', text: 'Salvar dados da empresa' }));
  // O CNPJ é conferido em formato e dígitos. Isso não é o mesmo que dizer que
  // a empresa existe ou está regular, e a tela não confunde as duas coisas.
  form.append(el('p', {
    class: 'muted',
    text: 'O CNPJ é conferido localmente (formato e dígitos verificadores). O Arandu não consulta base oficial nesta fase, então não afirma que a inscrição existe ou está ativa.'
  }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    for (const [key, value] of Object.entries(body)) if (value === '') delete body[key];
    try {
      await api('organizations', { method: 'PATCH', body: JSON.stringify({ organization_id: state.organizationId, ...body }) });
      say('Dados da empresa atualizados.', 'success');
    } catch (error) {
      say(error.status === 401 ? 'Entre na sua conta para atualizar os dados da empresa.' : error.message);
    }
  });
  panel.append(form);
  return panel;
}

const REVENUE_BANDS = Object.freeze([
  ['ate_360k', 'Até R$ 360 mil'],
  ['360k_4_8m', 'R$ 360 mil a R$ 4,8 milhões'],
  ['4_8m_30m', 'R$ 4,8 milhões a R$ 30 milhões'],
  ['30m_300m', 'R$ 30 milhões a R$ 300 milhões'],
  ['acima_300m', 'Acima de R$ 300 milhões']
]);

function signedOut(error) {
  const box = el('section', { class: 'panel' });
  const denied = error?.status === 403;
  box.append(el('h2', { text: denied ? 'Acesso negado' : 'Entre para usar o portal' }));
  box.append(el('p', {
    class: 'muted',
    text: denied
      ? 'Esta conta não é membro da organização solicitada. Peça um convite ao administrador da empresa.'
      : 'Os dados do procurement financeiro exigem sessão autenticada. Entre na sua conta para carregar organizações, RFQs e propostas.'
  }));
  box.append(el('a', { class: 'button', href: '/login.html', text: 'Entrar na conta' }));
  if (demoMode) box.append(el('p', { class: 'muted', text: 'Este ambiente também exibe um conjunto de dados de demonstração abaixo.' }));
  return box;
}

// -------------------------------------------------------------------- views

const views = {
  dashboard: async (data) => {
    const frag = document.createDocumentFragment();
    const rfqs = data.rfqs || [];
    const contracts = data.contracts || [];
    const today = new Date().toISOString().slice(0, 10);
    const reviewFrom = (contract) => {
      const ends = Date.parse(`${contract.ends_on}T00:00:00Z`);
      if (!Number.isFinite(ends)) return null;
      return new Date(ends - Number(contract.renewal_notice_days || 0) * 86400000).toISOString().slice(0, 10);
    };
    const active = contracts.filter((contract) => ['active', 'renewing'].includes(contract.status));
    const expiring = active.filter((contract) => { const date = reviewFrom(contract); return date && date <= today; });
    const awaiting = rfqs.filter((rfq) => ['open', 'collecting'].includes(rfq.status) && !(rfq.proposals || []).length);
    const toDecide = rfqs.filter((rfq) => rfq.status === 'comparing');
    const proposals = rfqs.reduce((total, rfq) => total + (rfq.proposals || []).length, 0);
    const credit = rfqs.filter((rfq) => rfq.product === 'credit')
      .reduce((sum, rfq) => sum + (Number(rfq.demand?.amount) || 0), 0);

    // Tempo até a primeira proposta só aparece quando existe alguma; sem
    // tráfego, a média correta é "ainda não há dados", não um número.
    const firstResponses = rfqs
      .map((rfq) => {
        const first = (rfq.proposals || [])
          .map((proposal) => Date.parse(proposal.submitted_at))
          .filter(Number.isFinite)
          .sort((a, b) => a - b)[0];
        const created = Date.parse(rfq.created_at);
        return Number.isFinite(first) && Number.isFinite(created) ? (first - created) / 86400000 : null;
      })
      .filter((value) => value !== null && value >= 0);
    const averageFirst = firstResponses.length
      ? (firstResponses.reduce((sum, value) => sum + value, 0) / firstResponses.length).toFixed(1)
      : null;
    const invited = rfqs.reduce((total, rfq) => total + (rfq.invites_count || 0), 0);

    frag.append(el('div', { class: 'grid three' }, [
      statTile('Aguardando primeira proposta', awaiting.length, awaiting.length ? 'Solicitações abertas sem nenhuma resposta ainda.' : null),
      statTile('Prontas para decidir', toDecide.length, 'Solicitações em comparação, aguardando a decisão da empresa.'),
      statTile('Propostas recebidas', proposals),
      statTile('Contratos ativos', active.length),
      statTile('Em janela de renovação', expiring.length, expiring.length ? 'Revise as condições ou peça novas propostas.' : null),
      statTile('Provedores cadastrados', (data.providers || []).length),
      statTile('Crédito solicitado', money(credit), 'Soma dos valores declarados nas solicitações de crédito.'),
      statTile(
        'Tempo até a primeira proposta',
        averageFirst === null ? 'sem dados' : `${averageFirst} dias`,
        averageFirst === null ? 'Aparece quando houver ao menos uma proposta recebida.' : 'Média das solicitações que já receberam resposta.'
      ),
      statTile(
        'Taxa de resposta',
        invited ? `${Math.round((proposals / invited) * 100)}%` : 'sem dados',
        invited ? 'Propostas recebidas sobre provedores convidados.' : 'Aparece quando houver provedores convidados.'
      )
    ]));

    if (expiring.length) {
      const alert = el('section', { class: 'panel' });
      alert.append(el('h2', { text: 'Contratos que pedem atenção agora' }));
      const list = el('div', { class: 'rows' });
      for (const contract of expiring) {
        list.append(el('div', { class: 'row' }, [
          el('b', { text: `${PRODUCTS[contract.product]?.label || contract.product} — vence em ${contract.ends_on}` }),
          el('small', { text: `Janela de revisão aberta desde ${reviewFrom(contract)}. Aviso prévio: ${contract.renewal_notice_days} dias.` })
        ]));
      }
      alert.append(list, el('a', { class: 'button', href: '/finance/contracts.html', text: 'Ver contratos' }));
      frag.append(alert);
    }

    const tasks = (data.tasks || []).filter((task) => task.status === 'open');
    if (tasks.length) {
      const panel = el('section', { class: 'panel' });
      panel.append(el('h2', { text: 'Tarefas abertas' }));
      const list = el('div', { class: 'rows' });
      for (const task of tasks.slice(0, 8)) {
        list.append(el('div', { class: 'row' }, [
          el('b', { text: task.title }),
          el('small', { text: task.due_on ? `Prazo: ${task.due_on}` : 'Sem prazo definido.' })
        ]));
      }
      panel.append(list);
      frag.append(panel);
    }

    const note = el('section', { class: 'panel' });
    note.append(el('h2', { text: 'Economia registrada' }));
    note.append(el('p', {
      class: 'muted',
      text: 'Não exibida nesta fase. O Arandu só apresenta economia quando houver metodologia explícita, linha de base verificável e dados comparáveis — números estimados sem isso seriam invenção.'
    }));
    frag.append(note);

    if (!rfqs.length) {
      frag.append(emptyState('Nenhuma solicitação ainda. Comece estruturando uma necessidade de crédito ou de adquirência.',
        el('a', { class: 'button', href: '/finance/rfqs.html', text: 'Criar solicitação' })));
    }
    return frag;
  },

  rfqs: async (data) => {
    const frag = document.createDocumentFragment();
    const rfqs = data.rfqs || [];
    if (!rfqs.length) {
      frag.append(emptyState('Nenhuma RFQ registrada para esta organização.'));
    } else {
      const list = el('div', { class: 'rows' });
      for (const rfq of rfqs) {
        const row = el('div', { class: 'row' });
        row.append(
          el('span', { class: 'tag', text: PRODUCTS[rfq.product]?.label || rfq.product }),
          el('span', { class: 'tag', text: rfq.status }),
          el('b', {}, el('a', { href: `/finance/rfq.html?id=${encodeURIComponent(rfq.id)}`, text: rfq.title })),
          el('small', { text: `Prazo de resposta: ${rfq.response_deadline || 'não definido'} · Propostas: ${rfq.proposals?.length ?? 0}` })
        );
        list.append(row);
      }
      frag.append(list);
    }
    frag.append(newRfqForm(data.profile || []));
    return frag;
  },

  rfq: async (data) => {
    const frag = document.createDocumentFragment();
    const id = new URLSearchParams(location.search).get('id');
    const rfq = (data.rfqs || []).find((item) => item.id === id) || (data.rfqs || [])[0];
    if (!rfq) return emptyState('Nenhuma RFQ disponível para exibir.');
    document.title = `${rfq.title} | Arandu Financial Procurement`;
    const header = el('section', { class: 'panel' });
    header.append(
      el('h2', { text: rfq.title }),
      el('p', { class: 'muted', text: `${PRODUCTS[rfq.product]?.label || rfq.product} · estado: ${rfq.status} · prazo de resposta: ${rfq.response_deadline || 'não definido'}` }),
      rfq.description ? el('p', { text: rfq.description }) : null
    );
    frag.append(header);

    const demand = el('section', { class: 'panel' });
    demand.append(el('h2', { text: 'Demanda declarada pela empresa' }), fieldRows(PRODUCTS[rfq.product].demandFields, rfq.demand));
    frag.append(demand);

    const proposals = rfq.proposals || [];
    const comparison = el('section', { class: 'panel' });
    comparison.append(el('h2', { text: 'Comparação factual' }));
    comparison.append(el('p', { class: 'muted', id: 'comparison-notice', text: 'Comparação factual das condições informadas. O Arandu não recomenda instituições.' }));
    if (proposals.length < 1) {
      comparison.append(emptyState('Ainda não há propostas recebidas para comparar.'));
    } else {
      comparison.append(comparisonView(rfq.product, proposals));
      comparison.append(estimatesBlock(rfq, proposals));
    }
    frag.append(comparison);
    if (proposals.length > 1) frag.append(weightsPanel(rfq.product, proposals));

    const decision = el('section', { class: 'panel' });
    decision.append(el('h2', { text: 'Decisão' }));
    decision.append(el('p', {
      class: 'muted',
      text: 'A decisão é da empresa. O Arandu registra quem decidiu, quando, qual proposta, quais critérios e guarda uma fotografia de todas as propostas existentes naquele momento.'
    }));
    if (proposals.length) {
      const form = el('form');
      const label = el('label', { text: 'Proposta escolhida' });
      const select = el('select', { name: 'proposal_id', 'aria-label': 'Proposta escolhida' });
      for (const proposal of proposals) select.add(new Option(proposal.provider_name, proposal.id));
      label.append(select);
      const why = el('label', { text: 'Justificativa (opcional)' });
      why.append(el('textarea', { name: 'rationale', 'aria-label': 'Justificativa da decisão' }));
      form.append(label, why, el('button', { type: 'submit', text: 'Registrar decisão' }));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const body = Object.fromEntries(new FormData(form));
        try {
          await api('decisions', { method: 'POST', body: JSON.stringify({ rfq_id: rfq.id, ...body }) });
          say('Decisão registrada.', 'success');
        } catch (error) {
          say(error.status === 401 ? 'Entre na sua conta para registrar a decisão.' : error.message);
        }
      });
      decision.append(form);
    } else {
      decision.append(emptyState('A decisão fica disponível quando houver ao menos uma proposta.'));
    }
    frag.append(decision);
    return frag;
  },

  providers: async (data) => {
    const frag = document.createDocumentFragment();
    const providers = data.providers || [];
    if (!providers.length) frag.append(emptyState('Nenhum provedor cadastrado ainda.'));
    else {
      const list = el('div', { class: 'rows' });
      for (const provider of providers) {
        const row = el('div', { class: 'row' });
        row.append(
          el('span', { class: 'tag', text: provider.kind }),
          el('b', { text: provider.name }),
          el('small', { text: `Região: ${provider.region || 'não informada'} · estado: ${provider.status}` }),
          el('small', {
            text: provider.verification_state === 'EVIDENCIA_REGISTRADA'
              ? `Evidência regulatória registrada em ${provider.regulator_checked_at || 'data não informada'} (${provider.regulator_authority || 'autoridade não informada'}).`
              : 'Sem verificação regulatória registrada pelo Arandu. O cadastro é uma referência da empresa, não uma atestação de regularidade.'
          })
        );
        list.append(row);
      }
      frag.append(list);
    }
    frag.append(newProviderForm());
    return frag;
  },

  proposals: async (data) => {
    const frag = document.createDocumentFragment();
    const rows = [];
    for (const rfq of data.rfqs || []) {
      for (const proposal of rfq.proposals || []) rows.push({ rfq, proposal });
    }
    if (!rows.length) return emptyState('Nenhuma proposta recebida ainda.');
    const list = el('div', { class: 'rows' });
    for (const { rfq, proposal } of rows) {
      const row = el('div', { class: 'row' });
      row.append(
        el('span', { class: 'tag', text: proposal.status }),
        el('b', { text: `${proposal.provider_name} · ${rfq.title}` }),
        el('small', { text: `Versão ${proposal.version} · enviada em ${proposal.submitted_at || 'data não informada'}` }),
        el('small', { text: `Validade: ${proposal.terms?.valid_until || 'não informada'}` }),
        el('a', { href: `/finance/rfq.html?id=${encodeURIComponent(rfq.id)}`, text: 'Abrir comparação da RFQ' })
      );
      list.append(row);
    }
    frag.append(list);
    return frag;
  },

  contracts: async (data) => {
    const frag = document.createDocumentFragment();
    const contracts = data.contracts || [];
    if (!contracts.length) return emptyState('Nenhum contrato registrado ainda.');
    const list = el('div', { class: 'rows' });
    const today = new Date().toISOString().slice(0, 10);
    for (const contract of contracts) {
      const ends = Date.parse(`${contract.ends_on}T00:00:00Z`);
      const reviewFrom = Number.isFinite(ends)
        ? new Date(ends - Number(contract.renewal_notice_days || 0) * 86400000).toISOString().slice(0, 10)
        : null;
      const row = el('div', { class: 'row' });
      row.append(
        el('span', { class: 'tag', text: PRODUCTS[contract.product]?.label || contract.product }),
        el('span', { class: 'tag', text: contract.status }),
        el('b', { text: contract.provider_name || 'Provedor' }),
        el('small', { text: `Vigência: ${contract.starts_on} → ${contract.ends_on} · aviso prévio: ${contract.renewal_notice_days} dias` }),
        el('small', {
          text: reviewFrom
            ? (reviewFrom <= today
              ? `Janela de renovação aberta desde ${reviewFrom}: revise condições ou peça novas propostas.`
              : `Iniciar revisão de renovação em ${reviewFrom}.`)
            : 'Data de término inválida.'
        }),
        contract.cost_summary ? el('small', { text: `Custo registrado: ${contract.cost_summary}` }) : null
      );
      list.append(row);
    }
    frag.append(list);
    return frag;
  },

  settings: async (data) => {
    const frag = document.createDocumentFragment();
    frag.append(organizationForm(data.organization));
    const profile = data.profile || [];
    const panel = el('section', { class: 'panel' });
    panel.append(el('h2', { text: 'Perfil financeiro reutilizável' }));
    panel.append(el('p', {
      class: 'muted',
      text: 'Estes campos são reaproveitados entre solicitações para que a empresa não precise repetir informações. Cada campo guarda origem, responsável, estado e data de atualização.'
    }));
    const expected = RECOMMENDED_PROFILE_FIELDS.filter((field) => !profile.some((row) => row.field_key === field.key));
    if (!profile.length) panel.append(emptyState('Nenhum campo de perfil preenchido ainda.'));
    else {
      const table = el('table');
      table.append(el('thead', {}, el('tr', {}, [
        el('th', { scope: 'col', text: 'Campo' }), el('th', { scope: 'col', text: 'Valor' }),
        el('th', { scope: 'col', text: 'Origem' }), el('th', { scope: 'col', text: 'Atualizado em' }),
        el('th', { scope: 'col', text: 'Situação' })
      ])));
      const body = el('tbody');
      for (const field of profile) {
        const state = freshness(field);
        body.append(el('tr', {}, [
          el('th', { scope: 'row', text: field.field_key }),
          el('td', { text: field.field_value }),
          el('td', { text: field.source }),
          el('td', { text: String(field.updated_at || '').slice(0, 10) }),
          el('td', {}, el('span', { class: `freshness ${state.level}`, text: state.label }))
        ]));
      }
      table.append(body);
      panel.append(el('div', { class: 'table-scroll' }, table));
    }
    if (expected.length) {
      panel.append(el('p', {
        class: 'muted',
        text: `Ainda não informados: ${expected.map((field) => field.label).join(', ')}. Preenchê-los evita repetir os mesmos dados a cada solicitação.`
      }));
    }
    frag.append(panel);
    frag.append(profileForm());
    return frag;
  },

  providerRfqs: async (data) => {
    const frag = document.createDocumentFragment();
    if (data.no_provider_org) {
      frag.append(emptyState('Esta conta ainda não pertence a nenhuma organização provedora. Crie a organização da sua instituição para aceitar convites.'));
    }
    const rows = data.assignments || [];
    if (!rows.length) {
      frag.append(emptyState('Nenhuma RFQ atribuída a esta organização provedora. Aceite um convite para começar.'));
    } else {
      const list = el('div', { class: 'rows' });
      for (const row of rows) {
        const item = el('div', { class: 'row' });
        const state = PROPOSAL_STATUS[row.status] || { label: row.status, hint: '' };
        item.append(
          el('span', { class: 'tag', text: PRODUCTS[row.product]?.label || row.product }),
          el('span', { class: 'tag', text: state.label }),
          el('b', { text: row.title || 'Solicitação' }),
          el('small', { text: state.hint }),
          el('small', { text: `Prazo de resposta: ${row.response_deadline || 'não definido'}` })
        );
        if (row.rfq_status && !['open', 'collecting'].includes(row.rfq_status)) {
          item.append(el('small', { text: 'Esta solicitação não está mais recebendo propostas.' }));
        }
        // O provedor precisa entender a necessidade para responder. O que ele
        // nunca recebe é proposta de concorrente, nota interna ou comparação.
        if (Object.keys(row.demand || {}).length) {
          const details = el('details');
          details.append(el('summary', { text: 'Ver a necessidade declarada pela empresa' }));
          details.append(fieldRows(PRODUCTS[row.product].demandFields, row.demand));
          item.append(details);
        }
        if (row.history?.length > 1) {
          item.append(el('small', { text: `Suas versões: ${row.history.map((entry) => `v${entry.version}`).join(', ')}.` }));
        }
        item.append(el('a', {
          href: `/provider/proposal.html?proposal=${encodeURIComponent(row.proposal_id || '')}`,
          text: row.version ? 'Revisar minha proposta' : 'Responder proposta'
        }));
        list.append(item);
      }
      frag.append(list);
    }
    frag.append(acceptInviteForm());
    return frag;
  },

  /**
   * Página de aceite do convite.
   *
   * O provedor chega aqui por um link com o token. Cada desfecho tem um estado
   * próprio e visível — válido, expirado, já usado, revogado, organização
   * errada — em vez de uma mensagem genérica de erro.
   *
   * O token só é verificado quando o provedor confirma, e a resposta é sempre a
   * mesma para convite inexistente, expirado, usado e revogado: enumerar
   * tokens não pode render informação.
   */
  providerInvite: async (data) => {
    const frag = document.createDocumentFragment();
    const token = (new URLSearchParams(location.search).get('token') || '').trim();
    const panel = el('section', { class: 'panel' });
    panel.append(el('h2', { text: 'Aceitar convite para responder a uma solicitação' }));

    if (!token) {
      panel.append(el('p', { id: 'invite-state', class: 'muted', text: 'Nenhum token no endereço. Cole abaixo o token que você recebeu.' }));
    } else if (!/^[0-9a-f]{64}$/.test(token)) {
      panel.append(el('p', { id: 'invite-state', class: 'boundary', text: 'Este link não tem o formato de um convite do Arandu. Confira se ele foi copiado por inteiro.' }));
    } else {
      panel.append(el('p', { id: 'invite-state', class: 'muted', text: 'Confirme a organização que vai responder e aceite o convite.' }));
    }

    if (data.no_provider_org) {
      panel.append(el('p', {
        class: 'boundary',
        text: 'Esta conta ainda não pertence a nenhuma organização provedora. Crie a organização da sua instituição antes de aceitar: o convite é vinculado a ela, e não é possível responder em nome de outra.'
      }));
      frag.append(panel);
      return frag;
    }

    const form = el('form', { id: 'invite-form' });
    const tokenLabel = el('label', { text: 'Token do convite' });
    tokenLabel.append(el('input', {
      name: 'token', value: token, required: 'required', minlength: '64', maxlength: '64',
      'aria-label': 'Token do convite'
    }));
    const orgLabel = el('label', { text: 'Organização que vai responder' });
    const orgSelect = el('select', { name: 'provider_organization_id', 'aria-label': 'Organização que vai responder' });
    for (const organization of state.organizations) orgSelect.add(new Option(organization.legal_name, organization.id));
    orgLabel.append(orgSelect);
    form.append(tokenLabel, orgLabel, el('button', { type: 'submit', text: 'Aceitar convite' }));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      const target = panel.querySelector('#invite-state');
      try {
        await api('invites/accept', { method: 'POST', body: JSON.stringify(body) });
        target.className = '';
        target.textContent = 'Convite aceito. A solicitação já aparece na sua lista de RFQs atribuídas.';
        say('Convite aceito.', 'success');
        form.replaceChildren(el('a', { class: 'button', href: '/provider/rfqs.html', text: 'Ver RFQs atribuídas' }));
      } catch (error) {
        target.className = 'boundary';
        target.textContent = error.status === 401
          ? 'Entre na sua conta de provedor para aceitar o convite.'
          : error.message;
      }
    });
    panel.append(form);
    panel.append(el('p', {
      class: 'muted',
      text: 'O convite vale uma vez e expira. Ele vincula a solicitação à organização provedora da qual você é membro — não é possível responder em nome de outra instituição.'
    }));
    frag.append(panel);
    return frag;
  },

  providerProposal: async (data) => {
    const frag = document.createDocumentFragment();
    const wanted = new URLSearchParams(location.search).get('proposal');
    const assignment = (data.assignments || []).find((row) => row.proposal_id === wanted)
      || (data.assignments || [])[0];
    const product = assignment?.product || new URLSearchParams(location.search).get('product') || 'credit';
    const spec = PRODUCTS[PRODUCT_IDS.includes(product) ? product : 'credit'];
    const panel = el('section', { class: 'panel' });
    panel.append(el('h2', { text: `Proposta — ${spec.label}` }));
    panel.append(el('p', {
      class: 'muted',
      text: 'Você responde apenas às RFQs atribuídas à sua organização. Propostas de outros provedores, notas internas da empresa e a decisão antes de publicada não são acessíveis por este portal.'
    }));
    if (assignment) {
      panel.append(el('p', { text: `Solicitação: ${assignment.title}` }));
      const status = PROPOSAL_STATUS[assignment.status];
      if (status) panel.append(el('p', { class: 'muted', text: `${status.label} — ${status.hint}` }));
      if (Object.keys(assignment.demand || {}).length) {
        const details = el('details');
        details.append(el('summary', { text: 'Necessidade declarada pela empresa' }));
        details.append(fieldRows(PRODUCTS[assignment.product].demandFields, assignment.demand));
        panel.append(details);
      }
      if (assignment.history?.length) {
        panel.append(el('p', {
          class: 'muted',
          text: `Histórico da sua proposta: ${assignment.history.map((entry) => `v${entry.version} em ${String(entry.submitted_at || '').slice(0, 10)}`).join(' · ')}.`
        }));
      }
    } else {
      panel.append(emptyState('Aceite um convite para responder a uma solicitação.'));
    }
    const form = el('form', { id: 'proposal-form' });
    const fieldset = el('fieldset', {}, el('legend', { text: 'Condições ofertadas' }));
    for (const field of spec.proposalFields) {
      const label = el('label', { text: field.label + (field.required ? ' *' : '') });
      let input;
      if (field.type === 'enum') {
        input = el('select', { name: field.key, 'aria-label': field.label });
        input.add(new Option('Selecione…', ''));
        for (const option of field.options) input.add(new Option(option, option));
      } else if (field.type === 'text' && (field.max ?? 0) > 400) {
        input = el('textarea', { name: field.key, 'aria-label': field.label });
      } else {
        input = el('input', {
          name: field.key, 'aria-label': field.label,
          type: field.type === 'date' ? 'date' : ['money', 'percent', 'number', 'int'].includes(field.type) ? 'number' : 'text',
          step: field.type === 'int' ? '1' : field.type === 'text' ? null : '0.01',
          ...(field.required ? { required: 'required' } : {})
        });
      }
      label.append(input);
      fieldset.append(label);
    }
    form.append(fieldset);
    const note = el('label', { text: 'Nota da revisão (opcional)' });
    note.append(el('input', { name: '__note', 'aria-label': 'Nota da revisão' }));
    form.append(note);
    form.append(el('div', {}, [
      el('button', { type: 'submit', text: 'Enviar proposta' }),
      el('button', { type: 'button', class: 'secondary', id: 'save-draft', text: 'Salvar rascunho local' })
    ]));
    form.append(el('p', {
      class: 'muted',
      text: 'Alterações após o envio criam uma nova versão. A versão anterior permanece registrada e visível para a empresa compradora.'
    }));
    const draftKey = `arandu-finance-draft-${assignment?.proposal_id || product}`;
    form.querySelector('#save-draft').addEventListener('click', () => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(Object.fromEntries(new FormData(form))));
        say('Rascunho salvo neste navegador.', 'success');
      } catch { say('Não foi possível salvar o rascunho neste navegador.'); }
    });
    // A versão já enviada é o ponto de partida de uma revisão.
    for (const [key, value] of Object.entries(assignment?.terms || {})) {
      const input = form.elements.namedItem(key);
      if (input && value !== null && value !== undefined) input.value = String(value);
    }
    try {
      const stored = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (stored) for (const [key, value] of Object.entries(stored)) {
        const input = form.elements.namedItem(key);
        if (input && value) input.value = value;
      }
    } catch { /* rascunho ilegível é simplesmente ignorado */ }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const entries = Object.fromEntries(new FormData(form));
      const noteValue = entries.__note;
      delete entries.__note;
      for (const [key, value] of Object.entries(entries)) if (value === '') delete entries[key];
      if (!assignment?.proposal_id) { say('Aceite um convite antes de enviar a proposta.'); return; }
      try {
        const result = await api('proposals', {
          method: 'POST',
          body: JSON.stringify({ proposal_id: assignment.proposal_id, terms: entries, note: noteValue || null })
        });
        say(`Proposta enviada como versão ${result.version}.`, 'success');
      } catch (error) {
        say(error.status === 401 ? 'Entre na sua conta de provedor para enviar a proposta.' : error.message);
      }
    });
    panel.append(form);
    frag.append(panel);
    return frag;
  }
};

function estimatesBlock(rfq, proposals) {
  const box = el('div');
  box.append(el('h3', { text: 'Estimativas de custo' }));
  box.append(el('p', {
    class: 'muted',
    text: rfq.product === 'credit'
      ? 'O CET só é exibido quando o provedor o informa. Quando todos os insumos existem, o Arandu mostra separadamente uma estimativa própria, com fórmula e premissas declaradas.'
      : 'O custo mensal estimado usa o perfil de recebimentos declarado pela empresa e as taxas informadas pelo provedor, sem antecipação e sem tributos.'
  }));
  const list = el('div', { class: 'rows' });
  for (const proposal of proposals) {
    const row = el('div', { class: 'row' });
    row.append(el('b', { text: proposal.provider_name }));
    if (rfq.product === 'credit') {
      const declared = proposal.terms?.cet_year;
      row.append(el('small', { text: `CET informado pelo provedor: ${declared ? `${declared}% a.a.` : 'não informado'}` }));
      // Mesma função do servidor: se as duas implementações divergirem, a tela
      // mostra um número que a API não confirma.
      const estimate = estimateCreditTotalCost(proposal.terms || {});
      row.append(el('small', {
        text: estimate.estimate
          ? `Estimativa do Arandu: ${money(estimate.total_cost)} no total (parcela ${money(estimate.installment)}).`
          : estimate.reason
      }));
      if (estimate.estimate) {
        row.append(el('small', { text: `Fórmula: ${estimate.formula}. Premissas: ${estimate.assumptions.join('; ')}.` }));
      }
    } else {
      const estimate = estimateAcquiringMonthlyCost(rfq.demand || {}, proposal.terms || {});
      row.append(el('small', {
        text: estimate.estimate
          ? `Custo mensal estimado: ${money(estimate.total_cost)} (variável ${money(estimate.variable_cost)} + fixo ${money(estimate.fixed_cost)}).`
          : estimate.reason
      }));
      if (estimate.estimate) {
        row.append(el('small', { text: `Fórmula: ${estimate.formula}. Premissas: ${estimate.assumptions.join('; ')}.` }));
        if (!estimate.covers_full_volume) {
          row.append(el('small', {
            text: `Atenção: o perfil declarado soma ${estimate.declared_share}% do faturamento, então a estimativa cobre apenas essa parte.`
          }));
        }
      }
    }
    list.append(row);
  }
  box.append(list);
  return box;
}

// ------------------------------------------------------------------ formulários

/**
 * Criação de RFQ em etapas.
 *
 * Um formulário único com vinte campos não diz a ninguém o que é obrigatório
 * nem por onde começar. As etapas separam o produto, a necessidade, as
 * condições e a revisão — e a revisão mostra o que será enviado antes de
 * enviar, inclusive os avisos de coerência.
 */
function newRfqForm(profile = []) {
  const panel = el('section', { class: 'panel' });
  panel.append(el('h2', { text: 'Nova solicitação' }));
  const steps = el('ol', { class: 'steps' });
  const STEP_LABELS = ['Produto', 'Necessidade', 'Condições', 'Revisão'];
  for (const [index, label] of STEP_LABELS.entries()) {
    steps.append(el('li', { text: `${index + 1}. ${label}`, 'data-step': String(index) }));
  }
  panel.append(steps);

  const form = el('form', { id: 'rfq-form' });
  let current = 0;

  const productStep = el('fieldset', { 'data-step': '0' }, el('legend', { text: 'Produto financeiro' }));
  const product = el('select', { name: 'product', 'aria-label': 'Produto financeiro' });
  for (const id of PRODUCT_IDS) product.add(new Option(PRODUCTS[id].label, id));
  const productLabel = el('label', { text: 'O que a empresa precisa contratar' });
  productLabel.append(product);
  const productHint = el('p', { class: 'muted', text: PRODUCTS[PRODUCT_IDS[0]].summary });
  const title = el('label', { text: 'Título da solicitação' });
  title.append(el('input', { name: 'title', required: 'required', 'aria-label': 'Título da solicitação' }));
  productStep.append(productLabel, productHint, title);

  const needStep = el('fieldset', { 'data-step': '1' }, el('legend', { text: 'Necessidade' }));
  const conditionStep = el('fieldset', { 'data-step': '2' }, el('legend', { text: 'Condições e prazo' }));
  const deadline = el('label', { text: 'Prazo de resposta dos provedores' });
  deadline.append(el('input', { name: 'response_deadline', type: 'date', 'aria-label': 'Prazo de resposta' }));

  const reviewStep = el('fieldset', { 'data-step': '3' }, el('legend', { text: 'Revisão' }));
  const review = el('div', { id: 'rfq-review', role: 'status', 'aria-live': 'polite' });
  reviewStep.append(review);

  // Campos obrigatórios e de valor vão para "necessidade"; o resto, para
  // "condições". A separação é do produto, não do tipo do campo.
  const NEED_KEYS = {
    credit: ['amount', 'purpose', 'term_months', 'grace_months'],
    acquiring: ['monthly_volume', 'average_ticket', 'share_debit', 'share_credit_cash', 'share_credit_installment', 'share_pix']
  };

  function inputFor(field) {
    if (field.type === 'enum') {
      const select = el('select', { name: field.key, 'aria-label': field.label });
      select.add(new Option('Selecione…', ''));
      for (const option of field.options) select.add(new Option(option, option));
      return select;
    }
    if (field.type === 'bool') {
      const select = el('select', { name: field.key, 'aria-label': field.label });
      for (const [value, text] of [['', 'Selecione…'], ['true', 'sim'], ['false', 'não']]) select.add(new Option(text, value));
      return select;
    }
    if (field.type === 'text' && (field.max ?? 0) > 400) return el('textarea', { name: field.key, 'aria-label': field.label });
    return el('input', {
      name: field.key, 'aria-label': field.label,
      type: ['money', 'percent', 'number', 'int'].includes(field.type) ? 'number' : field.type === 'date' ? 'date' : 'text',
      step: field.type === 'int' ? '1' : field.type === 'text' ? null : '0.01',
      ...(field.required ? { required: 'required' } : {})
    });
  }

  function renderFields() {
    const spec = PRODUCTS[product.value];
    productHint.textContent = spec.summary;
    needStep.replaceChildren(el('legend', { text: 'Necessidade' }));
    conditionStep.replaceChildren(el('legend', { text: 'Condições e prazo' }));
    const needKeys = new Set(NEED_KEYS[product.value] || []);
    for (const field of spec.demandFields) {
      const label = el('label', { text: field.label + (field.required ? ' *' : '') });
      // O perfil financeiro já respondeu isso antes: a etiqueta diz de onde
      // veio e o valor entra preenchido, em vez de ser pedido de novo.
      const reused = profile.find((row) => row.field_key === PROFILE_TO_DEMAND[field.key]);
      const input = inputFor(field);
      if (reused && !['money', 'percent', 'number', 'int'].includes(field.type)) input.value = reused.field_value;
      label.append(input);
      if (reused) label.append(el('small', { class: 'muted', text: `Do perfil da empresa, atualizado em ${String(reused.updated_at).slice(0, 10)}.` }));
      (needKeys.has(field.key) ? needStep : conditionStep).append(label);
    }
    conditionStep.append(deadline);
  }
  renderFields();
  product.addEventListener('change', renderFields);

  const nav = el('div', { class: 'wizard-nav' });
  const back = el('button', { type: 'button', class: 'secondary', id: 'rfq-back', text: 'Voltar' });
  const next = el('button', { type: 'button', id: 'rfq-next', text: 'Continuar' });
  const submit = el('button', { type: 'submit', id: 'rfq-submit', text: 'Criar solicitação' });
  nav.append(back, next, submit);

  function renderReview() {
    review.replaceChildren();
    const spec = PRODUCTS[product.value];
    const entries = Object.fromEntries(new FormData(form));
    const demand = {};
    for (const field of spec.demandFields) {
      if (entries[field.key] !== undefined && entries[field.key] !== '') demand[field.key] = entries[field.key];
    }
    review.append(el('p', { text: `${spec.label} · ${entries.title || 'sem título'}` }));
    review.append(fieldRows(spec.demandFields, demand));
    if (product.value === 'acquiring') {
      const shares = checkAcquiringShares(
        Object.fromEntries(Object.entries(demand).map(([key, value]) => [key, Number(value)]))
      );
      for (const message of [...shares.errors, ...shares.warnings]) {
        review.append(el('p', { class: 'boundary', text: message }));
      }
      submit.disabled = !shares.ok;
    } else {
      submit.disabled = false;
    }
    review.append(el('p', {
      class: 'muted',
      text: 'A solicitação nasce como rascunho. Nada é enviado a nenhum provedor até você abri-la e convidar.'
    }));
  }

  function show(index) {
    current = Math.max(0, Math.min(3, index));
    for (const node of [productStep, needStep, conditionStep, reviewStep]) {
      node.hidden = Number(node.dataset.step) !== current;
    }
    for (const item of steps.children) {
      if (Number(item.dataset.step) === current) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    }
    back.hidden = current === 0;
    next.hidden = current === 3;
    submit.hidden = current !== 3;
    if (current === 3) renderReview();
  }

  next.addEventListener('click', () => {
    // Sem isto o passo seguinte esconderia um campo obrigatório vazio e a
    // validação só apareceria no envio, três telas adiante.
    const active = [productStep, needStep, conditionStep][current];
    const invalid = active?.querySelector(':invalid');
    if (invalid) { invalid.reportValidity(); return; }
    show(current + 1);
  });
  back.addEventListener('click', () => show(current - 1));

  form.append(productStep, needStep, conditionStep, reviewStep, nav);
  show(0);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const entries = Object.fromEntries(new FormData(form));
    const body = {
      organization_id: state.organizationId,
      product: entries.product,
      title: entries.title,
      response_deadline: entries.response_deadline || null,
      demand: {}
    };
    for (const field of PRODUCTS[entries.product].demandFields) {
      if (entries[field.key] !== undefined && entries[field.key] !== '') body.demand[field.key] = entries[field.key];
    }
    try {
      const result = await api('rfqs', { method: 'POST', body: JSON.stringify(body) });
      const warnings = (result.warnings || []).join(' ');
      say(`Solicitação criada em rascunho. Abra-a para convidar provedores. ${warnings}`.trim(), 'success');
      form.reset();
      renderFields();
      show(0);
    } catch (error) {
      say(error.status === 401 ? 'Entre na sua conta para criar uma solicitação.' : error.message);
    }
  });
  panel.append(form);
  return panel;
}

/** Campos do perfil que respondem diretamente a um campo da demanda. */
const PROFILE_TO_DEMAND = Object.freeze({
  sector: 'setor',
  collateral: 'garantias_disponiveis',
  current_acquirer: 'adquirente_atual'
});

function newProviderForm() {
  const panel = el('section', { class: 'panel' });
  panel.append(el('h2', { text: 'Cadastrar provedor' }));
  panel.append(el('p', {
    class: 'muted',
    text: 'O cadastro é uma referência da própria empresa. O Arandu não afirma que um provedor é regulado sem autoridade, registro, evidência e data de consulta.'
  }));
  const form = el('form');
  const name = el('label', { text: 'Nome' });
  name.append(el('input', { name: 'name', required: 'required', 'aria-label': 'Nome do provedor' }));
  const kind = el('label', { text: 'Tipo' });
  const select = el('select', { name: 'kind', 'aria-label': 'Tipo de provedor' });
  for (const option of ['bank', 'fintech', 'acquirer', 'subacquirer', 'credit_provider', 'payment_provider', 'other']) select.add(new Option(option, option));
  kind.append(select);
  const website = el('label', { text: 'Site (https)' });
  website.append(el('input', { name: 'website', type: 'url', 'aria-label': 'Site do provedor' }));
  const region = el('label', { text: 'Região' });
  region.append(el('input', { name: 'region', 'aria-label': 'Região de atuação' }));
  const notes = el('label', { text: 'Notas internas' });
  notes.append(el('textarea', { name: 'notes', 'aria-label': 'Notas internas sobre o provedor' }));
  form.append(name, kind, website, region, notes, el('button', { type: 'submit', text: 'Cadastrar provedor' }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = { organization_id: state.organizationId, ...Object.fromEntries(new FormData(form)) };
    try {
      await api('providers', { method: 'POST', body: JSON.stringify(body) });
      say('Provedor cadastrado.', 'success');
      form.reset();
    } catch (error) {
      say(error.status === 401 ? 'Entre na sua conta para cadastrar provedores.' : error.message);
    }
  });
  panel.append(form);
  return panel;
}

function profileForm() {
  const panel = el('section', { class: 'panel' });
  panel.append(el('h2', { text: 'Atualizar campo do perfil' }));
  const form = el('form');
  const key = el('label', { text: 'Identificador do campo (ex.: faturamento_anual)' });
  key.append(el('input', { name: 'field_key', required: 'required', pattern: '[a-z][a-z0-9_]{1,48}', 'aria-label': 'Identificador do campo' }));
  const value = el('label', { text: 'Valor' });
  value.append(el('input', { name: 'field_value', required: 'required', 'aria-label': 'Valor do campo' }));
  const source = el('label', { text: 'Origem do dado' });
  const select = el('select', { name: 'source', 'aria-label': 'Origem do dado' });
  for (const option of ['declarado_pela_empresa', 'documento_interno', 'extrato', 'contrato_vigente', 'outro']) select.add(new Option(option, option));
  source.append(select);
  form.append(key, value, source, el('button', { type: 'submit', text: 'Salvar campo' }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('profile', { method: 'POST', body: JSON.stringify({ organization_id: state.organizationId, ...Object.fromEntries(new FormData(form)) }) });
      say('Campo do perfil atualizado.', 'success');
      form.reset();
    } catch (error) {
      say(error.status === 401 ? 'Entre na sua conta para atualizar o perfil.' : error.message);
    }
  });
  panel.append(form);
  return panel;
}

function acceptInviteForm() {
  const panel = el('section', { class: 'panel' });
  panel.append(el('h2', { text: 'Aceitar convite' }));
  panel.append(el('p', {
    class: 'muted',
    text: 'O convite é de uso único e expira. Ele vincula a RFQ à organização provedora da qual você é membro — não é possível responder em nome de outra instituição.'
  }));
  const form = el('form');
  const token = el('label', { text: 'Token do convite' });
  token.append(el('input', { name: 'token', required: 'required', minlength: '64', maxlength: '64', 'aria-label': 'Token do convite' }));
  form.append(token, el('button', { type: 'submit', text: 'Aceitar convite' }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token: new FormData(form).get('token'), provider_organization_id: state.organizationId })
      });
      say('Convite aceito. A RFQ aparecerá na sua lista.', 'success');
      form.reset();
    } catch (error) {
      say(error.status === 401 ? 'Entre na sua conta de provedor para aceitar o convite.' : error.message);
    }
  });
  panel.append(form);
  return panel;
}

// ----------------------------------------------------------- carregamento

function organizationPicker() {
  const wrap = el('section', { class: 'panel' });
  wrap.append(el('h2', { text: 'Organização' }));
  const label = el('label', { text: 'Organização ativa' });
  const select = el('select', { id: 'organization', 'aria-label': 'Organização ativa' });
  for (const organization of state.organizations) select.add(new Option(`${organization.legal_name} · ${organization.kind}`, organization.id));
  if (state.organizationId) select.value = state.organizationId;
  select.addEventListener('change', () => {
    state.organizationId = select.value;
    try { sessionStorage.setItem('arandu-finance-org', select.value); } catch { /* sem sessionStorage seguimos sem memória */ }
    load();
  });
  label.append(select);
  wrap.append(label);
  return wrap;
}

async function collectCompanyData() {
  const organizations = (await api('organizations')).rows || [];
  state.organizations = organizations.filter((organization) => organization.kind === 'BUYER');
  if (!state.organizations.length) return { empty: true };
  let remembered = '';
  try { remembered = sessionStorage.getItem('arandu-finance-org') || ''; } catch { remembered = ''; }
  state.organizationId = state.organizationId
    || (state.organizations.some((organization) => organization.id === remembered) ? remembered : state.organizations[0].id);
  // Uma chamada em vez de uma por RFQ: abrir o painel com 40 solicitações não
  // pode custar 44 requisições em série.
  return api(`overview?organization_id=${encodeURIComponent(state.organizationId)}`);
}

async function collectProviderData() {
  const organizations = (await api('organizations')).rows || [];
  state.organizations = organizations.filter((organization) => organization.kind === 'PROVIDER');
  if (!state.organizations.length) return { assignments: [], no_provider_org: true };
  state.organizationId = state.organizationId || state.organizations[0].id;
  const result = await api(`assignments?organization_id=${encodeURIComponent(state.organizationId)}`);
  return { assignments: result.rows || [] };
}

function demoShape(data) {
  if (!data) return null;
  return {
    rfqs: data.rfqs || [],
    providers: data.providers || [],
    contracts: data.contracts || [],
    profile: data.profile || [],
    tasks: data.tasks || [],
    assignments: (data.rfqs || []).map((rfq) => ({
      proposal_id: rfq.proposals?.[0]?.id || '',
      rfq_id: rfq.id,
      product: rfq.product,
      status: rfq.proposals?.[0]?.status || 'draft',
      rfq_status: rfq.status,
      title: rfq.title,
      response_deadline: rfq.response_deadline,
      demand: rfq.demand || {},
      terms: rfq.proposals?.[0]?.terms || {},
      history: []
    })),
    demonstration: true,
    notice: data.notice
  };
}

async function load() {
  if (!root) return;
  root.replaceChildren(el('p', { class: 'loading', text: 'Carregando…' }));
  let data = null;
  let failure = null;
  try {
    data = audience === 'provider' ? await collectProviderData() : await collectCompanyData();
    say('', 'info');
  } catch (error) {
    failure = error;
    data = null;
  }
  const demoData = demoShape(await demo());
  const nodes = document.createDocumentFragment();
  if (failure) {
    nodes.append(signedOut(failure));
  } else if (data?.empty) {
    nodes.append(emptyState('Nenhuma organização vinculada a esta conta. Crie a organização da sua empresa para começar.'));
  } else if (state.organizations.length > 1) {
    nodes.append(organizationPicker());
  }
  // Sem sessão a página continua útil: mostra a estrutura, os campos do
  // produto e os estados vazios. O que ela nunca faz é inventar conteúdo —
  // dado de demonstração só entra em build de demonstração, sempre rotulado.
  const source = failure || data?.empty ? (demoData || EMPTY_DATA) : data;
  if (source.demonstration) {
    nodes.append(el('p', { class: 'demo-flag', text: 'DEMONSTRATION DATA' }));
    nodes.append(el('p', { class: 'muted', id: 'demo-notice', text: source.notice }));
  }
  nodes.append(await views[view](source));
  root.replaceChildren(nodes);
}

if (root && views[view]) {
  load().catch((error) => {
    say(`Não foi possível carregar o portal: ${error.message}`);
    root.replaceChildren(emptyState('Conteúdo indisponível no momento. Recarregue a página ou entre novamente na sua conta.'));
  });
}
