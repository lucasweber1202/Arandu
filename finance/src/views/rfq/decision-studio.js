/* global __ARANDU_DEMO__ */
// Estúdio de decisão: cenários de análise sobre o mesmo motor de comparação.
//
// Um cenário é um conjunto de pesos escolhido pela empresa e calculado pelo
// motor canônico (POST comparison com pesos; applyUserWeights no sandbox).
// Não há segunda fórmula aqui: este módulo só organiza resultados que o motor
// já devolve — posição, pontuação, cobertura, critérios ausentes — e compara
// cenários entre si. Nenhum cenário é decisão, nenhum é recomendação do Arandu.
//
// Persistência: os cenários vivem nesta aba do navegador enquanto a página está
// aberta (memória do módulo). Não vão para storage nem para a URL. Para guardar,
// a pessoa baixa o dossiê.

import { el, icon, formatDate, formatDateTime, productLabel, RFQ_STATUS, APPROVAL_STATUS, textSpan, textStrong } from '../../core.js';
import { button, card, drawer, mutedText, tag, toast, definitionList } from '../../ui.js';
import { PRODUCTS } from '../../../../lib/finance/products.mjs';
import { USER_WEIGHTS_NOTICE } from '../../../../lib/finance/comparison.mjs';

const MAX_SCENARIOS = 3;
const NAMES = ['Cenário A', 'Cenário B', 'Cenário C'];
// Memória da sessão por solicitação: sobrevive à troca de aba e à ida até a
// proposta, não a recarregar a página.
const sessions = new Map();

/** Critérios que o motor aceita para pesos neste produto. */
function criteriaFor(product) {
  return PRODUCTS[product].proposalFields.filter((field) => field.comparable && field.direction);
}

/** Pesos > 0, como o motor espera. */
function cleanWeights(weights) {
  return Object.fromEntries(Object.entries(weights || {}).map(([key, value]) => [key, Number(value)]).filter(([, value]) => Number.isFinite(value) && value > 0 && value <= 100));
}

/**
 * Compara resultados de cenários já calculados pelo motor. Exportada para teste.
 * Para cada proposta: posição em cada cenário (só entre as de cobertura
 * suficiente, como o motor ordena), pontuação e se a posição muda.
 */
export function compareScenarioResults(scenarios) {
  const computed = scenarios.filter((scenario) => scenario.result?.applied);
  const ids = [];
  for (const scenario of computed) for (const row of scenario.result.results) if (!ids.includes(row.id)) ids.push(row.id);
  const rows = ids.map((id) => {
    const cells = computed.map((scenario) => {
      const list = scenario.result.results;
      const index = list.findIndex((row) => row.id === id);
      const row = list[index];
      return row ? { position: row.low_coverage ? null : index + 1, score: row.score, coverage: row.coverage, low: row.low_coverage, missing: row.missing_criteria } : null;
    });
    const name = computed.map((scenario) => scenario.result.results.find((row) => row.id === id)?.provider_name).find(Boolean) || 'Proposta';
    const positions = cells.map((cell) => cell?.position ?? null);
    const comparable = positions.filter((value) => value !== null);
    return { id, name, cells, changes: comparable.length > 1 && new Set(comparable).size > 1 };
  });
  const leaders = computed.map((scenario) => scenario.result.results.find((row) => !row.low_coverage)?.id || null);
  return { scenarios: computed, rows, leaderChanges: new Set(leaders.filter(Boolean)).size > 1 };
}

export function decisionStudio(ctx, rfq, { calculate, getModel = () => null, approvals = [], decision = null, contract = null, initialWeights = null }) {
  const specs = criteriaFor(rfq.product);
  if (!sessions.has(rfq.id)) sessions.set(rfq.id, [{ name: NAMES[0], weights: cleanWeights(initialWeights), result: null, sensitivity: null }]);
  const scenarios = sessions.get(rfq.id);

  const list = el('div', { class: 'studio-scenarios' });
  const comparison = el('div', { class: 'studio-comparison', role: 'region', 'aria-label': 'Comparação entre cenários', 'aria-live': 'polite' });
  const add = button('Novo cenário a partir do último', { size: 'sm', iconName: 'plus', onClick: () => {
    if (scenarios.length >= MAX_SCENARIOS) return;
    const last = scenarios.at(-1);
    scenarios.push({ name: NAMES[scenarios.length], weights: { ...last.weights }, result: null, sensitivity: null });
    draw();
    list.querySelectorAll('.studio-scenario').item(scenarios.length - 1)?.querySelector('input[type=range]')?.focus();
  } });
  const dossierButton = button('Abrir dossiê da análise', { size: 'sm', variant: 'secondary', iconName: 'file', onClick: () => openDossier(ctx, rfq, { model: getModel(), scenarios, approvals, decision, contract }) });

  async function compute(scenario, node) {
    const status = node.querySelector('.studio-status');
    status.textContent = 'Calculando com o motor de comparação…';
    try {
      scenario.result = await calculate(cleanWeights(scenario.weights));
      scenario.sensitivity = null;
      scenario.error = null;
    } catch (error) {
      // Falha não vira resultado: o cenário fica sem cálculo e diz o motivo.
      scenario.result = null;
      scenario.error = error?.message || 'Não foi possível calcular este cenário.';
    }
    draw();
  }

  // Sensibilidade por remoção: recalcula o cenário sem cada critério, pelo
  // mesmo motor, e diz se a ordem muda. Não atribui probabilidade nem risco.
  async function sensitivity(scenario) {
    const weights = cleanWeights(scenario.weights);
    const keys = Object.keys(weights);
    scenario.sensitivity = { running: true, rows: [] };
    draw();
    const base = (scenario.result?.results || []).filter((row) => !row.low_coverage).map((row) => row.id);
    const rows = [];
    for (const key of keys) {
      const label = specs.find((spec) => spec.key === key)?.label || key;
      const rest = { ...weights };
      delete rest[key];
      if (!Object.keys(rest).length) { rows.push({ key, label, state: 'only' }); continue; }
      try {
        const result = await calculate(rest);
        const order = result.applied ? result.results.filter((row) => !row.low_coverage).map((row) => row.id) : [];
        const same = order.length === base.length && order.every((id, index) => id === base[index]);
        const names = new Map(result.results?.map((row) => [row.id, row.provider_name]) || []);
        rows.push({ key, label, state: !result.applied ? 'not_applied' : same ? 'same' : 'changes', order: order.map((id) => names.get(id) || 'Proposta') });
      } catch (error) {
        rows.push({ key, label, state: 'error', message: error?.message || 'Falha ao recalcular.' });
      }
    }
    scenario.sensitivity = { running: false, rows };
    draw();
  }

  function scenarioNode(scenario, index) {
    const node = el('section', { class: 'studio-scenario card', 'aria-label': scenario.name });
    const name = el('input', { class: 'input', value: scenario.name, maxlength: '40', 'aria-label': `Nome do ${NAMES[index]}` });
    name.addEventListener('change', () => { scenario.name = name.value.trim() || NAMES[index]; drawComparison(); });
    const sliders = el('div', { class: 'weights-form' }, specs.map((spec) => {
      const value = String(scenario.weights[spec.key] || 0);
      const range = el('input', { type: 'range', min: '0', max: '100', step: '5', value, 'aria-label': `${scenario.name}: peso de ${spec.label}` });
      const output = el('output', { class: 'weight-value', text: value });
      range.addEventListener('input', () => {
        output.textContent = range.value;
        if (Number(range.value) > 0) scenario.weights[spec.key] = Number(range.value); else delete scenario.weights[spec.key];
        // Pesos mudaram: o resultado antigo não descreve mais este cenário.
        if (scenario.result || scenario.sensitivity) { scenario.result = null; scenario.sensitivity = null; node.querySelector('.studio-status').textContent = 'Pesos alterados: calcule de novo.'; drawComparison(); }
      });
      return el('div', { class: 'weight-row' }, [el('span', { class: 'weight-label', text: spec.label }), range, output]);
    }));
    const calc = button(`Calcular ${scenario.name}`, { size: 'sm', variant: 'primary', iconName: 'scale', onClick: () => compute(scenario, node) });
    const sens = scenario.result?.applied && Object.keys(cleanWeights(scenario.weights)).length > 1
      ? button('Analisar sensibilidade', { size: 'sm', onClick: () => sensitivity(scenario) }) : null;
    const remove = index > 0 ? button('Remover', { size: 'sm', variant: 'ghost', onClick: () => { scenarios.splice(index, 1); draw(); } }) : null;
    const status = el('p', { class: 'studio-status muted small', role: 'status' });
    if (scenario.error) status.textContent = scenario.error;
    else if (scenario.result && !scenario.result.applied) status.textContent = scenario.result.notice;
    else if (scenario.result) status.textContent = `Calculado. Pesos: ${scenario.result.criteria.map((item) => `${item.label} ${(item.share * 100).toFixed(0)}%`).join(' · ')}`;
    const excluded = (scenario.result?.excluded_criteria || []).map((item) => el('p', { class: 'callout callout-warning compact', text: `${item.label}: fora do cálculo. ${item.reasons.join(' ')}` }));
    node.append(el('div', { class: 'cc-head' }, [name, remove]), sliders, el('div', { class: 'form-actions' }, [calc, sens].filter(Boolean)), status, ...excluded);
    if (scenario.sensitivity) node.append(sensitivityNode(scenario));
    return node;
  }

  function sensitivityNode(scenario) {
    const { running, rows } = scenario.sensitivity;
    if (running) return el('p', { class: 'muted small', role: 'status', text: 'Recalculando sem cada critério…' });
    const text = { same: 'a ordem se mantém', only: 'é o único critério do cenário', not_applied: 'sem critério válido restante' };
    return el('div', { class: 'studio-sensitivity' }, [
      el('h4', { text: 'Sensibilidade: o que acontece sem cada critério' }),
      el('ul', {}, rows.map((row) => el('li', { dataset: { criterion: row.key } }, [textStrong(`Sem ${row.label}: `),
        textSpan(row.state === 'changes' ? `a ordem muda para ${row.order.join(' → ')}` : row.state === 'error' ? `não recalculado (${row.message})` : text[row.state])]))),
      mutedText('Recalculado pelo mesmo motor, removendo um critério por vez. Mostra quanto a ordem depende de cada peso; não estima risco nem probabilidade.')
    ]);
  }

  function drawComparison() {
    const data = compareScenarioResults(scenarios);
    if (data.scenarios.length < 2) {
      comparison.replaceChildren(mutedText(data.scenarios.length ? 'Calcule um segundo cenário para comparar as ordens lado a lado.' : 'Calcule ao menos um cenário.'));
      return;
    }
    const table = el('table', { class: 'data-table studio-table' }, [
      el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Proposta' }), ...data.scenarios.map((scenario) => el('th', { scope: 'col', text: scenario.name })), el('th', { scope: 'col', text: 'Muda entre cenários' })])),
      el('tbody', {}, data.rows.map((row) => el('tr', { dataset: { proposal: row.id } }, [
        el('th', { scope: 'row' }, el('a', { href: `#proposal-${row.id}`, text: row.name })),
        ...row.cells.map((cell) => el('td', {}, !cell ? 'sem cálculo' : cell.low
          ? [textSpan('fora da ordem'), el('span', { class: 'row-sub', text: `cobertura ${(cell.coverage * 100).toFixed(0)}%${cell.missing.length ? ` · falta ${cell.missing.join(', ')}` : ''}` })]
          : [textSpan(`${cell.position}º · ${cell.score === null ? 'sem dados' : cell.score.toFixed(2)}`), cell.missing.length ? el('span', { class: 'row-sub', text: `falta ${cell.missing.join(', ')}` }) : null])),
        el('td', {}, row.changes ? tag('Posição muda', 'warning') : el('span', { class: 'muted', text: 'não' }))
      ])))
    ]);
    comparison.replaceChildren(
      el('p', { class: data.leaderChanges ? 'callout callout-warning compact' : 'callout callout-info compact', role: 'note' }, [icon(data.leaderChanges ? 'alert' : 'info', { size: 14 }),
        textSpan(data.leaderChanges ? 'A primeira posição muda conforme os pesos: a ordem depende dos critérios escolhidos, não só das condições.' : 'A primeira posição é a mesma em todos os cenários calculados.')]),
      el('div', { class: 'matrix-scroll', tabindex: '0', role: 'region', 'aria-label': 'Tabela de cenários' }, table),
      mutedText(`${USER_WEIGHTS_NOTICE} "Fora da ordem": cobertura abaixo do mínimo do motor; não é a pior proposta.`));
  }

  function draw() {
    list.replaceChildren(...scenarios.map(scenarioNode));
    add.hidden = scenarios.length >= MAX_SCENARIOS;
    drawComparison();
  }
  draw();

  return card({ title: 'Estúdio de decisão', id: 'estudio-decisao', headingLevel: 3,
    subtitle: 'Compare cenários de pesos sobre o mesmo motor de comparação e veja o quanto a ordem depende de cada critério.',
    actions: [dossierButton],
    body: [
      el('p', { class: 'callout callout-info compact', role: 'note' }, [icon('info', { size: 14 }), textSpan('Cenários são análises desta aba: não são salvos na empresa, não registram decisão nem aprovação e se perdem ao recarregar. Para guardar, baixe o dossiê.')]),
      list, add, comparison
    ] });
}

// ---------------------------------------------------------------- dossiê
// Leitura factual montada com o que a tela já tem: solicitação, propostas e
// versões, comparação do motor, cenários desta sessão, aprovações, decisão e
// contrato. Sem recomendação e sem motivo de escolha que não esteja registrado.
export function buildDossier(rfq, { model, scenarios, approvals, decision, contract, generatedAt = new Date() }) {
  const columns = model?.columns || [];
  const rows = model?.rows || [];
  const differs = rows.filter((row) => row.differs).map((row) => row.label);
  const pending = rows.filter((row) => row.missing_count || row.invalid_count).map((row) => row.label);
  return {
    generatedAt,
    rfq: { title: rfq.title, product: productLabel(rfq.product), status: RFQ_STATUS[rfq.status]?.label || rfq.status, revision: rfq.revision || 1, deadline: rfq.response_deadline || null },
    demand: rfq.demand || {},
    proposals: columns.length ? columns.map((column) => ({ id: column.id, name: column.provider_name, version: column.version ?? null, currency: column.currency ?? null,
      external: column.provenance?.source === 'buyer_recorded_external', submittedAt: column.provenance?.submitted_at || column.provenance?.recorded_at || null,
      revisionMismatch: Boolean(column.revision_mismatch), respondedRevision: column.rfq_revision ?? null, expired: Boolean(column.expired), validityUnknown: Boolean(column.validity_unknown), changed: column.changed_keys?.length || 0 }))
      : (rfq.proposals || []).map((proposal) => ({ id: proposal.id, name: proposal.provider_name, version: proposal.version ?? null, currency: proposal.currency ?? null, external: false, submittedAt: proposal.submitted_at || null, revisionMismatch: false, respondedRevision: proposal.rfq_revision ?? null, expired: false, validityUnknown: false, changed: 0 })),
    differs, pending, notices: model?.context_notices || [],
    scenarios: (scenarios || []).filter((scenario) => scenario.result?.applied).map((scenario) => ({ name: scenario.name, criteria: scenario.result.criteria,
      results: scenario.result.results.map((row, index) => ({ name: row.provider_name, position: row.low_coverage ? null : index + 1, score: row.score, coverage: row.coverage, missing: row.missing_criteria })),
      sensitivity: scenario.sensitivity?.running === false ? scenario.sensitivity.rows : null })),
    approvals: (approvals || []).map((request) => ({ status: request.stale && request.status === 'pending' ? 'Desatualizada' : APPROVAL_STATUS[request.status]?.label || request.status, stale: Boolean(request.stale), requestedAt: request.requested_at || null, proposalVersion: request.proposal_version ?? null, rationale: request.rationale || null })),
    decision: decision ? { decidedAt: decision.decided_at || null, proposalVersion: decision.selected_proposal?.version ?? null, provider: (rfq.proposals || []).find((p) => p.id === decision.proposal_id)?.provider_name || null, rationale: decision.rationale || null } : null,
    contract: contract ? { id: contract.id, startsOn: contract.starts_on || null, endsOn: contract.ends_on || null } : null
  };
}

function dossierBody(rfq, dossier, ctx) {
  const section = (title, ...children) => el('section', { class: 'cc-section dossier-section' }, [el('h3', { text: title }), ...children]);
  const list = (items, empty) => items.length ? el('ul', {}, items.map((text) => el('li', { text }))) : mutedText(empty);
  const fields = PRODUCTS[rfq.product]?.demandFields || [];
  return [
    el('p', { class: 'callout callout-info compact', role: 'note' }, [icon('info', { size: 14 }), textSpan(`Dossiê factual gerado em ${formatDateTime(dossier.generatedAt)} a partir dos dados disponíveis nesta tela. Não é recomendação do Arandu, auditoria independente nem decisão registrada.`)]),
    section('Solicitação', el('p', { text: `${dossier.rfq.title} · ${dossier.rfq.product} · ${dossier.rfq.status} · revisão ${dossier.rfq.revision}${dossier.rfq.deadline ? ` · prazo ${formatDate(dossier.rfq.deadline)}` : ''}` }),
      fields.length ? definitionList(fields, dossier.demand, { showMissing: true }) : null),
    section('Propostas e versões consideradas', list(dossier.proposals.map((p) => [
      `${p.name}: versão ${p.version ?? 'não informada'}`, p.currency ? `moeda ${p.currency}` : 'moeda não identificada',
      p.external ? 'fonte externa transcrita pela empresa (não é envio da instituição)' : p.submittedAt ? `enviada ${formatDateTime(p.submittedAt)}` : 'data de envio não disponível',
      p.revisionMismatch ? `respondeu à revisão ${p.respondedRevision}` : null, p.expired ? 'proposta vencida' : p.validityUnknown ? 'validade não informada' : null,
      p.changed ? `${p.changed} condição(ões) alterada(s) em relação à versão anterior` : null].filter(Boolean).join(' · ')), 'Nenhuma proposta recebida.')),
    section('Comparação do motor', el('p', { text: `Condições com valores diferentes: ${dossier.differs.length ? dossier.differs.join(', ') : 'nenhuma'}.` }),
      el('p', { text: `Condições com informação pendente: ${dossier.pending.length ? dossier.pending.join(', ') : 'nenhuma'}.` }),
      dossier.notices.length ? el('div', {}, [textStrong('Ressalvas de comparabilidade:'), list(dossier.notices.map(String), '')]) : mutedText('Sem ressalvas de comparabilidade registradas pelo motor.')),
    section('Cenários analisados nesta sessão', ...(dossier.scenarios.length ? dossier.scenarios.map((scenario) => el('div', { class: 'dossier-scenario' }, [
      textStrong(`${scenario.name} — pesos: ${scenario.criteria.map((item) => `${item.label} ${(item.share * 100).toFixed(0)}%`).join(' · ')}`),
      list(scenario.results.map((row) => `${row.position ? `${row.position}º` : 'fora da ordem'} · ${row.name} · ${row.score === null ? 'sem dados' : row.score.toFixed(2)} · cobertura ${(row.coverage * 100).toFixed(0)}%${row.missing.length ? ` · falta ${row.missing.join(', ')}` : ''}`), ''),
      scenario.sensitivity ? list(scenario.sensitivity.map((row) => `Sem ${row.label}: ${row.state === 'changes' ? `ordem muda para ${row.order.join(' → ')}` : row.state === 'same' ? 'ordem se mantém' : row.state === 'error' ? 'não recalculado' : 'não aplicável'}`), '') : null
    ].filter(Boolean))) : [mutedText('Nenhum cenário calculado nesta sessão.')]), mutedText(USER_WEIGHTS_NOTICE)),
    section('Aprovações', list(dossier.approvals.map((a) => `${a.status}${a.requestedAt ? ` · pedida ${formatDateTime(a.requestedAt)}` : ''}${a.proposalVersion ? ` · proposta v${a.proposalVersion}` : ''}${a.rationale ? ` · justificativa: ${a.rationale}` : ''}`), 'Nenhuma aprovação registrada para esta solicitação.')),
    section('Decisão e contrato', dossier.decision ? el('p', { text: `Decisão registrada${dossier.decision.decidedAt ? ` em ${formatDateTime(dossier.decision.decidedAt)}` : ''}${dossier.decision.provider ? ` · ${dossier.decision.provider}` : ''}${dossier.decision.proposalVersion ? ` · versão ${dossier.decision.proposalVersion}` : ''}${dossier.decision.rationale ? ` · justificativa registrada: ${dossier.decision.rationale}` : ''}.` }) : mutedText('Nenhuma decisão registrada.'),
      dossier.contract ? el('p', {}, [textSpan(`Contrato vinculado${dossier.contract.startsOn ? `, vigência ${formatDate(dossier.contract.startsOn)} → ${formatDate(dossier.contract.endsOn)}` : ''}. `), el('a', { href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${dossier.contract.id}`), text: 'Abrir contrato' })]) : mutedText('Nenhum contrato vinculado.'))
  ];
}

function openDossier(ctx, rfq, input) {
  const dossier = buildDossier(rfq, input);
  const body = el('div', { class: 'stack dossier', id: 'dossie' }, dossierBody(rfq, dossier, ctx));
  const download = button('Baixar dossiê (HTML)', { size: 'sm', iconName: 'download', onClick: () => {
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Dossiê · ${escapeHtml(rfq.title)}</title><body style="font-family:system-ui,sans-serif;max-width:860px;margin:24px auto;line-height:1.5"><h1>Dossiê da análise · ${escapeHtml(rfq.title)}</h1>${body.innerHTML}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = el('a', { href: url, download: `arandu-${(__ARANDU_DEMO__ && ctx.mode === 'demo') ? 'demo-' : ''}dossie-${String(rfq.id).slice(0, 8)}.html` });
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    toast('Dossiê gerado neste navegador. Nada foi enviado ao servidor.');
  } });
  drawer({ title: 'Dossiê da análise', subtitle: rfq.title, body, footer: el('div', { class: 'form-actions' }, [download]), className: 'drawer-wide' });
}

function escapeHtml(text) { return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
