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

import { PRODUCTS, PRODUCT_IDS } from '../lib/finance/products.mjs';

const view = document.body.dataset.view || 'home';
const audience = document.body.dataset.audience || 'company';
const message = document.querySelector('#message');
const root = document.querySelector('#view');

const demoMode = document.querySelector('meta[name="arandu-presentation-mode"]')?.content === 'true';
const state = { organizations: [], organizationId: '', demo: null };
const EMPTY_DATA = Object.freeze({ rfqs: [], providers: [], contracts: [], profile: [], assignments: [] });

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

/** Tabela de comparação factual. Destaques citam o critério verificável. */
function comparisonTable(product, proposals) {
  const spec = PRODUCTS[product];
  const table = el('table');
  const head = el('tr', {}, [el('th', { scope: 'col', text: 'Condição' })]);
  for (const proposal of proposals) head.append(el('th', { scope: 'col', text: proposal.provider_name }));
  table.append(el('thead', {}, head));
  const body = el('tbody');
  for (const field of spec.proposalFields) {
    const values = proposals.map((proposal) => proposal.terms?.[field.key] ?? null);
    if (values.every((value) => value === null || value === undefined || value === '')) continue;
    const tr = el('tr', {}, [el('th', { scope: 'row', text: field.label })]);
    let target = null;
    if (field.comparable && field.direction) {
      const numeric = values.map((value) => (field.type === 'date' ? Date.parse(`${value}T00:00:00Z`) : Number(value)))
        .map((value) => (Number.isFinite(value) ? value : null));
      const present = numeric.filter((value) => value !== null);
      if (present.length > 1 && new Set(present).size > 1) {
        target = field.direction === 'lower_is_better' ? Math.min(...present) : Math.max(...present);
      }
      values.forEach((value, index) => {
        const cell = el('td', { text: show(value, field.type) });
        if (target !== null && numeric[index] === target) {
          cell.className = 'best';
          cell.append(el('span', {
            class: 'why',
            text: field.direction === 'lower_is_better' ? 'menor valor informado' : 'maior valor informado'
          }));
        }
        tr.append(cell);
      });
    } else {
      for (const value of values) tr.append(el('td', { text: show(value, field.type) }));
    }
    body.append(tr);
  }
  table.append(body);
  return el('div', { class: 'table-scroll' }, table);
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
    if (!Object.keys(weights).length) {
      output.append(el('p', { class: 'muted', text: 'Defina ao menos um critério com peso maior que zero.' }));
      return;
    }
    output.append(el('p', { text: 'Resultado conforme os pesos definidos por você.' }));
    const list = el('ol', { class: 'rows' });
    for (const item of scoreLocally(product, proposals, weights)) {
      const row = el('li', { class: 'row' });
      row.append(
        el('b', { text: item.provider_name }),
        el('small', { text: `Pontuação com os seus pesos: ${item.score === null ? 'sem dados' : item.score.toFixed(3)}` }),
        el('small', { text: `Critérios respondidos: ${(item.coverage * 100).toFixed(0)}%` })
      );
      list.append(row);
    }
    output.append(list);
  });
  panel.append(form, output);
  return panel;
}

/** Mesma normalização min-max do servidor, para a demonstração sem sessão. */
export function scoreLocally(product, proposals, weights) {
  const spec = new Map(PRODUCTS[product].proposalFields.map((field) => [field.key, field]));
  const criteria = Object.entries(weights)
    .filter(([key]) => spec.get(key)?.comparable && spec.get(key)?.direction)
    .map(([key, weight]) => ({ key, weight: Number(weight), direction: spec.get(key).direction, type: spec.get(key).type }));
  const total = criteria.reduce((sum, item) => sum + item.weight, 0) || 1;
  const numeric = (item, proposal) => {
    const raw = proposal.terms?.[item.key];
    if (raw === null || raw === undefined || raw === '') return null;
    const value = item.type === 'date' ? Date.parse(`${raw}T00:00:00Z`) : Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const ranges = new Map(criteria.map((item) => {
    const values = proposals.map((proposal) => numeric(item, proposal)).filter((value) => value !== null);
    return [item.key, values.length ? { min: Math.min(...values), max: Math.max(...values) } : null];
  }));
  return proposals.map((proposal) => {
    let weighted = 0;
    let answered = 0;
    for (const item of criteria) {
      const value = numeric(item, proposal);
      const range = ranges.get(item.key);
      if (value === null || !range) continue;
      const span = range.max - range.min;
      let normalized = span === 0 ? 1 : (value - range.min) / span;
      if (item.direction === 'lower_is_better') normalized = 1 - normalized;
      weighted += normalized * item.weight;
      answered += item.weight;
    }
    return {
      id: proposal.id,
      provider_name: proposal.provider_name || proposal.terms?.institution || 'Provedor',
      score: answered ? weighted / answered : null,
      coverage: answered / total
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

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
    const expiring = contracts.filter((contract) => {
      const ends = Date.parse(`${contract.ends_on}T00:00:00Z`);
      if (!Number.isFinite(ends)) return false;
      return new Date(ends - Number(contract.renewal_notice_days || 0) * 86400000).toISOString().slice(0, 10) <= today;
    });
    const credit = rfqs.filter((rfq) => rfq.product === 'credit')
      .reduce((sum, rfq) => sum + (Number(rfq.demand?.amount) || 0), 0);
    const grid = el('div', { class: 'grid three' }, [
      statTile('RFQs abertas ou coletando', rfqs.filter((rfq) => ['open', 'collecting'].includes(rfq.status)).length),
      statTile('RFQs em comparação', rfqs.filter((rfq) => rfq.status === 'comparing').length),
      statTile('Propostas recebidas', rfqs.reduce((sum, rfq) => sum + (rfq.proposals?.length || 0), 0)),
      statTile('Contratos ativos', contracts.filter((contract) => ['active', 'renewing'].includes(contract.status)).length),
      statTile('Contratos em janela de renovação', expiring.length),
      statTile('Provedores cadastrados', (data.providers || []).length),
      statTile('Crédito solicitado', money(credit), 'Soma dos valores declarados nas RFQs de crédito.')
    ]);
    frag.append(grid);
    const note = el('section', { class: 'panel' });
    note.append(el('h2', { text: 'Economia registrada' }));
    note.append(el('p', {
      class: 'muted',
      text: 'Não exibida nesta fase. O Arandu só apresenta economia quando houver metodologia explícita, linha de base verificável e dados comparáveis — números estimados sem isso seriam invenção.'
    }));
    frag.append(note);
    if (!rfqs.length) frag.append(emptyState('Nenhuma RFQ ainda. Comece criando uma solicitação de crédito ou de adquirência.',
      el('a', { class: 'button', href: '/finance/rfqs.html', text: 'Criar RFQ' })));
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
    frag.append(newRfqForm());
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
      comparison.append(comparisonTable(rfq.product, proposals));
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
    const profile = data.profile || [];
    const panel = el('section', { class: 'panel' });
    panel.append(el('h2', { text: 'Perfil financeiro reutilizável' }));
    panel.append(el('p', {
      class: 'muted',
      text: 'Estes campos são reaproveitados entre RFQs para que a empresa não precise repetir informações. Cada campo guarda origem, responsável, estado e data de atualização.'
    }));
    if (!profile.length) panel.append(emptyState('Nenhum campo de perfil preenchido ainda.'));
    else {
      const table = el('table');
      table.append(el('thead', {}, el('tr', {}, [
        el('th', { scope: 'col', text: 'Campo' }), el('th', { scope: 'col', text: 'Valor' }),
        el('th', { scope: 'col', text: 'Origem' }), el('th', { scope: 'col', text: 'Estado' }),
        el('th', { scope: 'col', text: 'Atualizado em' })
      ])));
      const body = el('tbody');
      for (const field of profile) {
        body.append(el('tr', {}, [
          el('th', { scope: 'row', text: field.field_key }),
          el('td', { text: field.field_value }),
          el('td', { text: field.source }),
          el('td', { text: field.status }),
          el('td', { text: String(field.updated_at || '').slice(0, 10) })
        ]));
      }
      table.append(body);
      panel.append(el('div', { class: 'table-scroll' }, table));
    }
    frag.append(panel);
    frag.append(profileForm());
    return frag;
  },

  providerRfqs: async (data) => {
    const frag = document.createDocumentFragment();
    const rows = data.assignments || [];
    if (!rows.length) {
      frag.append(emptyState('Nenhuma RFQ atribuída a esta organização provedora. Aceite um convite para começar.'));
    } else {
      const list = el('div', { class: 'rows' });
      for (const row of rows) {
        const item = el('div', { class: 'row' });
        item.append(
          el('span', { class: 'tag', text: PRODUCTS[row.product]?.label || row.product }),
          el('span', { class: 'tag', text: row.status }),
          el('b', { text: row.title || 'Solicitação' }),
          el('small', { text: `Prazo de resposta: ${row.response_deadline || 'não definido'}` }),
          el('a', { href: `/provider/proposal.html?proposal=${encodeURIComponent(row.proposal_id || '')}`, text: 'Responder proposta' })
        );
        list.append(item);
      }
      frag.append(list);
    }
    frag.append(acceptInviteForm());
    return frag;
  },

  providerProposal: async (data) => {
    const frag = document.createDocumentFragment();
    const assignment = (data.assignments || [])[0];
    const product = assignment?.product || new URLSearchParams(location.search).get('product') || 'credit';
    const spec = PRODUCTS[PRODUCT_IDS.includes(product) ? product : 'credit'];
    const panel = el('section', { class: 'panel' });
    panel.append(el('h2', { text: `Proposta — ${spec.label}` }));
    panel.append(el('p', {
      class: 'muted',
      text: 'Você responde apenas às RFQs atribuídas à sua organização. Propostas de outros provedores, notas internas da empresa e a decisão antes de publicada não são acessíveis por este portal.'
    }));
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
      const estimate = localCreditEstimate(proposal.terms || {});
      row.append(el('small', {
        text: estimate
          ? `Estimativa do Arandu: ${money(estimate.total)} no total (parcela ${money(estimate.installment)}). Fórmula: parcela = principal · i / (1 − (1 + i)^−n); premissas: pré-fixado, PRICE, sem carência.`
          : 'Estimativa não calculável com os insumos informados — nenhum valor é inventado.'
      }));
    } else {
      const estimate = localAcquiringEstimate(rfq.demand || {}, proposal.terms || {});
      row.append(el('small', {
        text: estimate
          ? `Custo mensal estimado: ${money(estimate.total)} (variável ${money(estimate.variable)} + fixo ${money(estimate.fixed)}). Fórmula: Σ(volume · fatia% · taxa%) + terminais · aluguel + gateway.`
          : 'Estimativa não calculável com os insumos informados — nenhum valor é inventado.'
      }));
    }
    list.append(row);
  }
  box.append(list);
  return box;
}

function localCreditEstimate(terms) {
  const amount = Number(terms.offered_amount);
  const rate = Number(terms.interest_rate_month);
  const term = Number(terms.term_months);
  const fees = Number(terms.fees_amount ?? 0);
  if (![amount, rate, term, fees].every(Number.isFinite) || amount <= 0 || term <= 0) return null;
  if (terms.index && terms.index !== 'pre') return null;
  if (terms.amortization && terms.amortization !== 'price') return null;
  const i = rate / 100;
  const installment = i === 0 ? amount / term : (amount * i) / (1 - (1 + i) ** -term);
  return { installment, total: installment * term + fees };
}

function localAcquiringEstimate(demand, terms) {
  const volume = Number(demand.monthly_volume);
  if (!Number.isFinite(volume) || volume <= 0) return null;
  const pairs = [
    [demand.share_debit, terms.mdr_debit],
    [demand.share_credit_cash, terms.mdr_credit_cash],
    [demand.share_credit_installment, terms.mdr_credit_installment],
    [demand.share_pix, terms.pix_fee]
  ];
  let variable = 0;
  for (const [share, rate] of pairs) {
    if (!Number.isFinite(Number(share))) continue;
    if (!Number.isFinite(Number(rate))) return null;
    variable += volume * (Number(share) / 100) * (Number(rate) / 100);
  }
  const fixed = Number(demand.terminals || 0) * Number(terms.terminal_rent || 0) + Number(terms.gateway_cost || 0);
  if (!Number.isFinite(fixed)) return null;
  return { variable, fixed, total: variable + fixed };
}

// ------------------------------------------------------------------ formulários

function newRfqForm() {
  const panel = el('section', { class: 'panel' });
  panel.append(el('h2', { text: 'Nova solicitação' }));
  const form = el('form');
  const product = el('select', { name: 'product', 'aria-label': 'Produto financeiro' });
  for (const id of PRODUCT_IDS) product.add(new Option(PRODUCTS[id].label, id));
  const productLabel = el('label', { text: 'Produto financeiro' });
  productLabel.append(product);
  const title = el('label', { text: 'Título da solicitação' });
  title.append(el('input', { name: 'title', required: 'required', 'aria-label': 'Título da solicitação' }));
  const deadline = el('label', { text: 'Prazo de resposta' });
  deadline.append(el('input', { name: 'response_deadline', type: 'date', 'aria-label': 'Prazo de resposta' }));
  const fields = el('fieldset', {}, el('legend', { text: 'Dados da necessidade' }));
  const renderFields = () => {
    fields.replaceChildren(el('legend', { text: 'Dados da necessidade' }));
    for (const field of PRODUCTS[product.value].demandFields) {
      const label = el('label', { text: field.label + (field.required ? ' *' : '') });
      let input;
      if (field.type === 'enum') {
        input = el('select', { name: field.key, 'aria-label': field.label });
        input.add(new Option('Selecione…', ''));
        for (const option of field.options) input.add(new Option(option, option));
      } else if (field.type === 'bool') {
        input = el('select', { name: field.key, 'aria-label': field.label });
        for (const [value, text] of [['', 'Selecione…'], ['true', 'sim'], ['false', 'não']]) input.add(new Option(text, value));
      } else {
        input = el('input', {
          name: field.key, 'aria-label': field.label,
          type: ['money', 'percent', 'number', 'int'].includes(field.type) ? 'number' : field.type === 'date' ? 'date' : 'text',
          step: field.type === 'int' ? '1' : field.type === 'text' ? null : '0.01',
          ...(field.required ? { required: 'required' } : {})
        });
      }
      label.append(input);
      fields.append(label);
    }
  };
  renderFields();
  product.addEventListener('change', renderFields);
  form.append(productLabel, title, deadline, fields, el('button', { type: 'submit', text: 'Criar RFQ' }));
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
      await api('rfqs', { method: 'POST', body: JSON.stringify(body) });
      say('RFQ criada em rascunho. Abra-a para convidar provedores.', 'success');
      form.reset();
      renderFields();
    } catch (error) {
      say(error.status === 401 ? 'Entre na sua conta para criar uma RFQ.' : error.message);
    }
  });
  panel.append(form);
  return panel;
}

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
  state.organizations = organizations;
  if (!organizations.length) return { empty: true };
  let remembered = '';
  try { remembered = sessionStorage.getItem('arandu-finance-org') || ''; } catch { remembered = ''; }
  state.organizationId = state.organizationId
    || (organizations.some((organization) => organization.id === remembered) ? remembered : organizations[0].id);
  const org = `organization_id=${encodeURIComponent(state.organizationId)}`;
  const [rfqList, providers, contracts, profile] = await Promise.all([
    api(`rfqs?${org}`), api(`providers?${org}`), api(`contracts?${org}`), api(`profile?${org}`)
  ]);
  const rfqs = [];
  for (const rfq of rfqList.rows || []) {
    const detail = await api(`rfq/${encodeURIComponent(rfq.id)}`).catch(() => ({ proposals: [] }));
    rfqs.push({ ...rfq, proposals: detail.proposals || [] });
  }
  return { rfqs, providers: providers.rows || [], contracts: contracts.rows || [], profile: profile.rows || [] };
}

async function collectProviderData() {
  const organizations = (await api('organizations')).rows || [];
  state.organizations = organizations.filter((organization) => organization.kind === 'PROVIDER');
  if (!state.organizations.length) return { assignments: [] };
  state.organizationId = state.organizationId || state.organizations[0].id;
  const proposals = await api(`proposals?organization_id=${encodeURIComponent(state.organizationId)}`);
  const assignments = [];
  for (const proposal of proposals.rows || []) {
    const detail = await api(`rfq/${encodeURIComponent(proposal.rfq_id)}`).catch(() => null);
    assignments.push({
      proposal_id: proposal.id,
      product: proposal.product,
      status: proposal.status,
      title: detail?.rfq?.title || 'Solicitação',
      response_deadline: detail?.rfq?.response_deadline || null
    });
  }
  return { assignments };
}

function demoShape(data) {
  if (!data) return null;
  return {
    rfqs: data.rfqs || [],
    providers: data.providers || [],
    contracts: data.contracts || [],
    profile: data.profile || [],
    assignments: (data.rfqs || []).map((rfq) => ({
      proposal_id: rfq.proposals?.[0]?.id || '',
      product: rfq.product,
      status: rfq.proposals?.[0]?.status || 'draft',
      title: rfq.title,
      response_deadline: rfq.response_deadline
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
