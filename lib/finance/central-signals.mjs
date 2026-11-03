// Central Financeira 360°: sinais de outros módulos que entram em
// "Precisa de você" no Painel. Puro (testado em Node): recebe linhas já
// autorizadas pela API de quem lê e devolve itens com origem navegável.
//
// Fontes canônicas (nada é calculado aqui além de contagem e prazo):
// - financial-crm-v1: GET crm-activities (status=planned) e crm-processes
//   (status=active) — declarações da organização, não estado financeiro;
// - Bank Fee Intelligence: GET fees/summary — contagens congeladas pelo banco.
// Diferença de tarifa não é erro nem economia: o item só diz que há revisão
// pendente e leva à lista filtrada que a sustenta.

export const SIGNAL_SOURCES = Object.freeze({
  negotiation: 'Negociações', contract: 'Contratos', relationship: 'Relacionamentos', fees: 'Tarifas', task: 'Tarefas'
});

// Itens já produzidos pelo Painel são classificados pelo tipo exibido.
const KIND_SOURCE = Object.freeze({
  'Aprovação': 'negotiation', 'Decisão': 'negotiation', 'Prazo': 'negotiation', 'Convites': 'negotiation', 'Avaliação': 'negotiation',
  'Rascunho': 'negotiation', 'Rascunho em edição': 'negotiation', 'Contrato': 'contract', 'Renovação': 'contract', 'Tarefa': 'task'
});
export const sourceOf = (item) => item.source || KIND_SOURCE[item.kind] || 'negotiation';

const ACTIVITY_LABEL = Object.freeze({
  meeting: 'Reunião', call: 'Ligação', commercial_interaction: 'Interação comercial', note: 'Nota interna',
  follow_up: 'Follow-up', commitment: 'Compromisso', email_record: 'E-mail (anotação)'
});
const STAGE_LABEL = Object.freeze({ prospect: 'Prospecção', qualification: 'Qualificação', engagement: 'Relacionamento ativo', negotiation: 'Em negociação' });

const DAY = 86400000;
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const shiftDay = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const diffDays = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const brDate = (iso) => iso.split('-').reverse().join('/');
const when = (today, due) => {
  const d = diffDays(today, due);
  return d < 0 ? `venceu há ${-d} ${-d === 1 ? 'dia' : 'dias'}` : d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d} dias (${brDate(due)})`;
};
const money = (n, currency) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(n) || 0);
const enc = encodeURIComponent;

/** Instituição de um registro CRM: vínculo direto ou pelo contrato vinculado. */
export function crmProviderOf(row, contractProvider) {
  if (row.related_type === 'provider') return row.related_id || null;
  if (row.related_type === 'contract') return contractProvider.get(row.related_id) || null;
  return row.provider_id || null;
}

/** Destino do registro: o relacionamento da instituição; sem instituição, a agenda geral. */
function crmHref(row, providerId) {
  return providerId ? `/finance/providers.html?provider_id=${enc(providerId)}` : '/finance/providers.html#crm-agenda';
}

/**
 * Compromissos e processos comerciais que pedem ação de quem lê.
 * - compromisso planejado com prazo até `horizon` dias (vencido primeiro);
 * - processo ativo com próximo passo vencido;
 * - processo ativo do próprio leitor sem data para o próximo passo.
 * Sem responsável só aparece para quem pode editar (mesma regra das tarefas).
 */
export function relationshipSignals({ activities = [], processes = [], providers = [], contracts = [], viewerId = null, editor = false, today, horizon = 2 }) {
  if (!isDay(today)) throw new Error('today inválido');
  const names = new Map(providers.map((p) => [p.id, p.name]));
  const contractProvider = new Map(contracts.map((c) => [c.id, c.provider_id]));
  const mine = (row) => (row.owner_id ? row.owner_id === viewerId : editor);
  const owner = (row) => (row.owner_id === viewerId ? 'Com você' : 'Sem responsável');
  const items = [];
  for (const a of activities) {
    if (a.status !== 'planned' || !isDay(a.due_on) || !mine(a)) continue;
    const days = diffDays(today, a.due_on);
    if (days > horizon) continue;
    const pid = crmProviderOf(a, contractProvider);
    const institution = pid && names.get(pid);
    items.push({ source: 'relationship', rank: days < 0 ? 1 : 3, due: days, tone: days < 0 ? 'danger' : 'warning', icon: 'calendar',
      kind: ACTIVITY_LABEL[a.kind] || 'Compromisso', title: institution ? `${a.subject} · ${institution}` : a.subject,
      detail: `${owner(a)} · ${when(today, a.due_on)} · registro comercial declarado pela equipe`, cta: 'Abrir', href: crmHref(a, pid), record: { type: 'crm_activity', id: a.id } });
  }
  for (const p of processes) {
    if (p.status !== 'active' || ['won', 'lost'].includes(p.stage) || !mine(p)) continue;
    const pid = crmProviderOf(p, contractProvider);
    const institution = pid && names.get(pid);
    const base = { source: 'relationship', icon: 'flag', kind: `Processo · ${STAGE_LABEL[p.stage] || 'Ativo'}`, cta: 'Abrir', href: crmHref(p, pid), record: { type: 'crm_process', id: p.id } };
    const title = institution ? `${p.title} · ${institution}` : p.title;
    if (isDay(p.due_on)) {
      const days = diffDays(today, p.due_on);
      if (days > horizon) continue;
      items.push({ ...base, rank: days < 0 ? 1 : 3, due: days, tone: days < 0 ? 'danger' : 'warning', title, detail: `Próximo passo: ${p.next_action} · ${owner(p)} · ${when(today, p.due_on)}` });
    } else if (p.owner_id && p.owner_id === viewerId) {
      items.push({ ...base, rank: 3, tone: 'neutral', title, detail: `Próximo passo sem data: ${p.next_action}. Defina quando acontece para entrar na agenda.` });
    }
  }
  return items;
}

/** Janela padrão das tarifas no Painel: últimos 12 meses até hoje. */
export function feeWindow(today) {
  if (!isDay(today)) throw new Error('today inválido');
  return { start: shiftDay(today, -365), end: today };
}

/**
 * Revisões de tarifa pendentes (estado "Revisão necessária"), uma linha por
 * moeda — moedas nunca são somadas entre si.
 */
export function feeSignals(summary = [], { start, end }) {
  const items = [];
  for (const s of summary) {
    const open = Number(s.open_review) || 0;
    if (!open || !s.currency) continue;
    const above = Number(s.above) || 0;
    const q = new URLSearchParams({ review_status: 'new', currency: s.currency, start, end });
    items.push({ source: 'fees', rank: 2, tone: 'warning', icon: 'scale', kind: 'Tarifas',
      title: `Revisar ${open} ${open === 1 ? 'cobrança de tarifa' : 'cobranças de tarifa'} em ${s.currency}`,
      detail: `${above} acima da referência contratada${above ? ` (${money(s.above_total, s.currency)} de diferença declarada)` : ''} · ${brDate(start)} a ${brDate(end)}. Diferença não é erro nem economia até uma pessoa revisar.`,
      cta: 'Revisar', href: `/finance/fees.html?${q}`, record: { type: 'fee_summary', id: s.currency } });
  }
  return items;
}

/** Contagem por origem, na ordem fixa dos filtros. Só origens com itens. */
export function sourceCounts(items) {
  const counts = new Map();
  for (const item of items) counts.set(sourceOf(item), (counts.get(sourceOf(item)) || 0) + 1);
  return Object.keys(SIGNAL_SOURCES).filter((key) => counts.has(key)).map((key) => ({ key, label: SIGNAL_SOURCES[key], count: counts.get(key) }));
}

/** Mesma ordenação do Painel: prioridade e, no mesmo nível, o que vence antes. */
export function sortSignals(items) {
  const due = (item) => (Number.isFinite(item.due) ? item.due : 9999);
  return items.sort((a, b) => a.rank - b.rank || due(a) - due(b));
}
