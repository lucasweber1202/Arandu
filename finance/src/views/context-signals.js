// Próximas ações e conciliação de tarifas no recorte de um contrato ou de uma
// instituição. Mesmas fontes canônicas e mesma lógica pura da Central
// (lib/finance/central-signals.mjs): o que aparece aqui é o que a Central
// mostra, filtrado pelo objeto aberto — nenhuma agenda ou cálculo paralelo.
import { el, icon, todayIso, renewalStage, formatDate, relativeDays, textSpan, textStrong } from '../core.js';
import { tag, loading, mutedText } from '../ui.js';
import { TASK_EDITORS } from './shared/tasks.js';
import { relationshipSignals, feeSignals, feeWindow, feeReconciliationLines } from '../../../lib/finance/central-signals.mjs';

const enc = encodeURIComponent;
const HORIZON = 30;

/** Renovação do contrato como sinal (mesma regra do Painel). */
export function renewalSignal(contract) {
  const stage = renewalStage(contract);
  if (stage.stage === 'past_notice') return { source: 'contract', rank: 1, due: stage.daysToDeadline, tone: 'danger', kind: 'Renovação', title: `Aviso prévio vencido: ${contract.provider_name || contract.title || 'contrato'}`, detail: `Contrato vence ${relativeDays(contract.ends_on)} (${formatDate(contract.ends_on)}).`, href: `/finance/contracts.html?abrir=contrato#contract-${contract.id}`, cta: 'Abrir contrato' };
  if (stage.stage === 'window') return { source: 'contract', rank: 2, due: stage.daysToDeadline, tone: 'warning', kind: 'Renovação', title: `Decidir renovação: ${contract.provider_name || contract.title || 'contrato'}`, detail: `Aviso prévio ${relativeDays(stage.deadline)} (${formatDate(stage.deadline)}) · vence ${formatDate(contract.ends_on)}.`, href: `/finance/contracts.html?abrir=contrato#contract-${contract.id}`, cta: 'Abrir contrato' };
  return null;
}

/**
 * Carrega CRM e tarifas no recorte. Cada fonte falha sozinha; 503 é
 * "indisponível neste ambiente", nunca lista vazia silenciosa.
 */
export async function loadScopedSignals(ctx, { providerId = null, contractId = null, today = todayIso() } = {}) {
  const out = { items: [], summary: [], failed: [], unavailable: [], span: feeWindow(today) };
  const org = ctx.organization.id;
  const crm = (resource, params) => ctx.api(`${resource}?${new URLSearchParams({ organization_id: org, limit: '100', ...params })}`);
  const scopeParams = contractId ? { related_id: contractId } : {};
  const feeScope = contractId ? { contract_id: contractId } : { provider_id: providerId };
  const [activities, processes, fees] = await Promise.allSettled([
    crm('crm-activities', { status: 'planned', ...scopeParams }),
    crm('crm-processes', { status: 'active', ...scopeParams }),
    ctx.api(`fees/summary?${new URLSearchParams({ organization_id: org, start: out.span.start, end: out.span.end, ...feeScope })}`)
  ]);
  const note = (label, outcome) => (outcome.reason?.status === 503 ? out.unavailable : out.failed).push(label);
  if (activities.status === 'rejected' || processes.status === 'rejected') note('Relacionamentos', activities.status === 'rejected' ? activities : processes);
  else {
    const names = new Map((ctx.members || []).map((m) => [m.user_id, m.display_name || m.email]));
    out.items.push(...relationshipSignals({ activities: activities.value.rows || [], processes: processes.value.rows || [], providers: ctx.data?.providers || [], contracts: ctx.data?.contracts || [],
      viewerId: ctx.viewer?.id, editor: TASK_EDITORS.includes(ctx.viewer?.role), today, horizon: HORIZON, everyone: true, providerId, contractId, ownerName: (id) => names.get(id) }));
  }
  if (fees.status === 'rejected') note('Tarifas', fees);
  else {
    out.summary = fees.value?.summary || [];
    if (ctx.can('create_rfq')) out.items.push(...feeSignals(out.summary, out.span, feeScope));
  }
  return out;
}

const TONE = { danger: ['Vencido', 'danger'], warning: ['Próximo', 'warning'], neutral: ['Sem data', 'neutral'] };

function signalRow(ctx, item, { local = false } = {}) {
  // No recorte do próprio objeto, o destino do CRM é o relacionamento — o mesmo da Central.
  return el('li', { class: 'milestone-row', dataset: { source: item.source } }, [
    tag(...(item.source === 'fees' ? ['Revisão', 'warning'] : TONE[item.tone] || TONE.neutral)),
    el('div', { class: 'milestone-main' }, [textStrong(item.title), mutedText(`${item.kind} · ${item.detail}`, 'span')]),
    // Dentro da própria instituição o registro comercial já está aberto: rola até ele.
    local && item.source === 'relationship'
      ? el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => document.querySelector('.crm-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, el('span', { class: 'btn-label', text: 'Ver no registro comercial' }))
      : el('a', { class: 'btn btn-sm btn-secondary', href: ctx.href(item.href), text: item.cta === 'Revisar' ? 'Revisar tarifas' : item.cta || 'Abrir' })
  ]);
}

function sourceNotes(result) {
  return [
    result.failed.length ? el('p', { class: 'callout callout-warning compact', role: 'alert' }, [icon('alert', { size: 14 }), textSpan(`Não conseguimos carregar ${result.failed.join(' e ')}; pode haver pendência fora desta lista.`)]) : null,
    result.unavailable.length ? mutedText(`${result.unavailable.join(' e ')}: ainda não disponível neste ambiente.`) : null
  ].filter(Boolean);
}

function reconciliationBlock(ctx, result, { contractId = null, providerId = null }) {
  const scope = contractId ? { contract_id: contractId } : { provider_id: providerId };
  const all = `/finance/fees.html?${new URLSearchParams({ ...scope, start: result.span.start, end: result.span.end })}`;
  const lines = feeReconciliationLines(result.summary);
  const body = lines.length ? lines.map((line) => el('div', { class: 'fee-reconciliation', dataset: { currency: line.currency } }, [
    el('p', {}, [textStrong(`${line.currency}: `), line.headline]),
    el('ul', { class: 'plain-list small' }, line.facts.map((text) => el('li', { text }))),
    line.openReview ? el('a', { class: 'btn btn-sm btn-secondary', href: ctx.href(`/finance/fees.html?${new URLSearchParams({ ...scope, review_status: 'new', currency: line.currency, start: result.span.start, end: result.span.end })}`), text: `Revisar ${line.openReview} pendente${line.openReview === 1 ? '' : 's'} em ${line.currency}` }) : null
  ])) : [mutedText('Sem tarifa contratada ou cobrança observada neste recorte nos últimos 12 meses. Sem dado não é zero.')];
  return el('section', { class: 'cc-section', 'aria-labelledby': `fee-rec-${contractId || providerId}` }, [
    el('div', { class: 'cc-head' }, [el('h3', { id: `fee-rec-${contractId || providerId}`, text: 'Tarifas: contratado × cobrado' }), el('a', { class: 'btn btn-sm btn-ghost', href: ctx.href(all), text: 'Ver cobranças' })]),
    mutedText('Últimos 12 meses. A comparação é calculada e congelada pelo servidor; diferença não é erro nem economia até uma pessoa revisar.'),
    ...body
  ]);
}

/** Seção do contrato: próximas ações (renovação, CRM, revisão) + conciliação. */
export function contractContextSection(ctx, contract) {
  const box = el('div', { class: 'context-signals', dataset: { scope: 'contract' } }, [el('section', { class: 'cc-section' }, [el('h3', { text: 'Próximas ações deste contrato' }), loading('Carregando próximas ações…')])]);
  loadScopedSignals(ctx, { contractId: contract.id }).then((result) => {
    const renewal = renewalSignal(contract);
    const items = [...(renewal ? [renewal] : []), ...result.items].sort((a, b) => a.rank - b.rank || (a.due ?? 9999) - (b.due ?? 9999));
    box.replaceChildren(
      el('section', { class: 'cc-section', 'aria-labelledby': `next-${contract.id}` }, [
        el('h3', { id: `next-${contract.id}`, text: 'Próximas ações deste contrato' }), ...sourceNotes(result),
        items.length ? el('ul', { class: 'milestone-list', role: 'list' }, items.map((item) => signalRow(ctx, item)))
          : mutedText(result.failed.length ? 'As demais fontes não indicam ação agora.' : `Nenhuma renovação, compromisso comercial nos próximos ${HORIZON} dias ou revisão de tarifa pendente.`)
      ]),
      result.failed.includes('Tarifas') || result.unavailable.includes('Tarifas') ? null : reconciliationBlock(ctx, result, { contractId: contract.id })
    );
  });
  return box;
}

/** Itens a acrescentar em "O que pede atenção" da instituição (CRM e tarifas). */
export function providerContextSection(ctx, provider) {
  const box = el('section', { class: 'cc-section context-signals', dataset: { scope: 'provider' }, 'aria-labelledby': 'rel-signals-title' }, [
    el('h3', { id: 'rel-signals-title', text: 'Agenda comercial e tarifas desta instituição' }), loading('Carregando…')]);
  loadScopedSignals(ctx, { providerId: provider.id }).then((result) => {
    const ask = (question) => import('./copilot.js').then((m) => m.openCopilot(ctx, { context: { type: 'provider', id: provider.id, label: provider.name }, question }));
    const copilot = el('div', { class: 'crm-actions', role: 'group', 'aria-label': `Perguntar ao Copilot sobre ${provider.name}` }, [
      el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => ask('Resuma o relacionamento com esta instituição: contratos, negociações e atividades registradas, com as fontes.') }, el('span', { class: 'btn-label', text: 'Resumir relacionamento' })),
      el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => ask('Quais contratos com esta instituição vencem ou entram em aviso prévio nos próximos meses?') }, el('span', { class: 'btn-label', text: 'Vencimentos' })),
      el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => ask('Quais cobranças de tarifa desta instituição estão acima da referência contratada e qual o estado da revisão?') }, el('span', { class: 'btn-label', text: 'Tarifas em revisão' }))]);
    // Obrigações em aberto da instituição (Relationship 360°), carregadas à parte.
    const obligations = el('div');
    import('./contract-center/obligations.js').then((m) => { if (obligations.isConnected) obligations.replaceWith(m.providerObligationsSection(ctx, provider)); }).catch(() => obligations.remove());
    box.after(obligations);
    box.replaceChildren(el('h3', { id: 'rel-signals-title', text: 'Agenda comercial e tarifas desta instituição' }), copilot, ...sourceNotes(result),
      result.items.length ? el('ul', { class: 'milestone-list', role: 'list' }, result.items.map((item) => signalRow(ctx, item, { local: true })))
        : mutedText(`Nenhum compromisso ou processo comercial nos próximos ${HORIZON} dias e nenhuma revisão de tarifa pendente.`),
      result.failed.includes('Tarifas') || result.unavailable.includes('Tarifas') ? null : reconciliationBlock(ctx, result, { providerId: provider.id }));
  });
  return box;
}
