// Medições, feature flags e analytics — tudo local, nada sai do navegador.
//
// perf        tempos de troca de tela, render, inspector, busca, filtro e
//             comparação, para o painel "Uso da demonstração".
// flags       liga/desliga peças da demo (para demonstração e testes).
// analytics   eventos de produto (demo_started, rfq_opened…) e a linha do
//             tempo da sessão — sem PostHog nem qualquer serviço externo.

import { readOS, updateOS } from './os-store.js';
import { on } from './bus.js';

// ------------------------------------------------------------ performance
export function mark(name, ms, meta = null) {
  const value = Math.max(0, Math.round(ms * 10) / 10);
  updateOS((draft) => { draft.perf.push({ name, ms: value, at: new Date().toISOString(), meta }); });
  if (typeof document !== 'undefined') document.documentElement.dataset.lastPerf = `${name}:${value}`;
  return value;
}
/** Mede uma função síncrona ou assíncrona. */
export async function measure(name, run, meta = null) {
  const start = performance.now();
  try { return await run(); } finally { mark(name, performance.now() - start, meta); }
}
export function perfSummary() {
  const groups = new Map();
  for (const entry of readOS().perf) {
    const list = groups.get(entry.name) || [];
    list.push(entry.ms);
    groups.set(entry.name, list);
  }
  return [...groups].map(([name, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    return { name, count: values.length, median: p(0.5), p95: p(0.95), last: values[values.length - 1] };
  });
}
/** Orçamentos (ms) usados no painel e nos testes. */
export const PERF_BUDGETS = Object.freeze({ route: 1500, render: 800, inspector: 120, search: 50, filter: 80, comparison: 400, optimistic: 50 });

// ----------------------------------------------------------------- flags
export const FLAGS = Object.freeze({
  inspectorV2: { label: 'Inspector adaptativo', text: 'Lista | resumo quando a largura útil permite (medido, não por breakpoint).', default: true },
  decisionInbox: { label: 'Caixa de decisão', text: 'Aprovações como caixa | contexto, com ação otimista.', default: true },
  presence: { label: 'Presença', text: 'Quem mais está olhando o mesmo objeto (simulado, determinístico).', default: true },
  openFinance: { label: 'Open Finance', text: 'Consentimento e preenchimento do perfil financeiro (dados simulados).', default: true },
  integrations: { label: 'Integrações', text: 'Central de integrações com conectores simulados.', default: true },
  workflowBuilder: { label: 'Políticas de aprovação', text: 'Construtor de políticas versionadas.', default: true },
  offlineSim: { label: 'Simulação offline', text: 'Indicador de sincronização, fila offline e conflito.', default: true }
});
export function flag(name) {
  const value = readOS().flags[name];
  return typeof value === 'boolean' ? value : Boolean(FLAGS[name]?.default);
}
export function setFlag(name, value) {
  if (!FLAGS[name]) return;
  updateOS((draft) => { draft.flags[name] = Boolean(value); });
}

// ------------------------------------------------------------- analytics
export const ANALYTICS_EVENTS = Object.freeze(['demo_started', 'page_viewed', 'rfq_opened', 'comparison_opened', 'approval_reviewed', 'approval_decided', 'proposal_submitted',
  'integration_connected', 'workflow_created', 'contract_opened', 'search_performed', 'intake_started', 'persona_switched', 'comment_created']);
export function track(name, props = {}) {
  const entry = { name, at: new Date().toISOString(), props };
  updateOS((draft) => { draft.analytics.push(entry); });
  return entry;
}
/** Linha do tempo da sessão: o que a pessoa fez, em linguagem humana. */
export function sessionNote(text, { persona = null } = {}) {
  updateOS((draft) => { draft.session.push({ at: new Date().toISOString(), text, persona }); });
}
export const FUNNEL = Object.freeze([
  ['Início', ['demo_started', 'page_viewed']],
  ['Solicitação', ['rfq_opened', 'intake_started']],
  ['Comparação', ['comparison_opened']],
  ['Aprovação', ['approval_reviewed', 'approval_decided']],
  ['Contrato', ['contract_opened']]
]);
/** Funil da própria sessão/navegador: quantos passos distintos foram alcançados. */
export function funnel() {
  const events = readOS().analytics;
  return FUNNEL.map(([label, names]) => ({ label, count: events.filter((event) => names.includes(event.name)).length }));
}

// Eventos do barramento viram analytics sem cada tela precisar lembrar disso.
let wired = false;
export function wireAnalytics() {
  if (wired) return;
  wired = true;
  const map = { 'approval.approved': 'approval_decided', 'approval.rejected': 'approval_decided', 'approval.changes_requested': 'approval_decided', 'approval.opened': 'approval_reviewed',
    'integration.connected': 'integration_connected', 'policy.published': 'workflow_created', 'comment.created': 'comment_created', 'proposal.submitted': 'proposal_submitted' };
  on('*', (event) => { if (map[event.type] && !event.remote) track(map[event.type], { object: event.object?.id || null }); });
}
