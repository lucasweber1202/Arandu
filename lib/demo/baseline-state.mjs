// Classificação SOMENTE LEITURA do estado da baseline Vitta Foods num Supabase
// Demo, e plano de recuperação com impressão digital (plan_sha256).
//
// Por que existe: o seed hospedado (run 44441567622) falhou depois de criar as
// contas e as organizações e antes de terminar a história. `fin_demo_workspaces`
// vazio NÃO prova banco vazio, e o preflight `before-seed` responde
// DATA_PRESENT. Este módulo diz exatamente em que estado o banco está e qual a
// menor sequência de operações para chegar a "baseline completa + 2 workspaces",
// sem jamais executar nada.
//
// Garantias:
//  - coleta só com GET (readOnlyFetch do preflight; outro método lança);
//  - recusa produção/legado e qualquer alvo fora do guard da Demo;
//  - relatório sem e-mails, tokens ou chaves: só contagens, chaves de persona e
//    slugs de workspace (identificadores sintéticos);
//  - qualquer dado que não seja comprovadamente da Demo (marcador diferente,
//    conta fora dos domínios .example, organização criada por quem não é
//    persona) => estado `foreign` e plano vazio: recuperação manual;
//  - ambiguidade (identidade fictícia desconhecida, organização duplicada,
//    leitura incompleta) => `inconsistent`/`indeterminate`, plano vazio;
//  - o plano só lista escritas ESCOPADAS que já existem e são testadas
//    (seed.mjs --reset apaga só o que as personas da baseline criaram; o
//    --cleanup de workspace apaga só o escopo +ws-<slug>). Nada de DELETE,
//    TRUNCATE ou reset genérico.
import crypto from 'node:crypto';
import { assertDemoTarget, isDemoEmail, DEMO_MARKER_VALUE } from '../finance/demo-guard.mjs';
import { ACTIVE_SUPABASE_ASSIGNMENTS } from '../deployment-topology.mjs';
import { supabaseApiKeyHeaders } from '../supabase-api-headers.mjs';
import { BUYERS, PROVIDERS } from '../finance/demo-personas.mjs';
import { workspaceSlugFromEmail } from '../finance/demo-workspaces.mjs';
import { readOnlyFetch } from './hosted-preflight.mjs';

export const BASELINE_PERSONAS = Object.freeze(Object.fromEntries([
  ...Object.entries(BUYERS).map(([key, person]) => [person.email.toLowerCase(), `buyer:${key}`]),
  ...Object.entries(PROVIDERS).map(([key, provider]) => [provider.person.email.toLowerCase(), `provider:${key}`])
]));
export const BASELINE_ORGS = Object.freeze({ BUYER: 1, PROVIDER: Object.keys(PROVIDERS).length });
export const TARGET_WORKSPACES = 2;
const STUCK = new Set(['provisioning', 'cleaning', 'failed']);

export const STATES = Object.freeze({
  empty: 'Banco sem marcador, contas ou organizações da Demo.',
  marker_only: 'Banco marcado como Demo, sem contas nem organizações da baseline.',
  baseline_partial: 'Baseline iniciada e interrompida: só dados das personas fictícias, história incompleta.',
  baseline_complete: 'Baseline estruturalmente completa (confirmar com demo:check).',
  inconsistent: 'Dados da Demo em estado ambíguo: revisão manual antes de qualquer escrita.',
  foreign: 'Há dados que não pertencem à Demo: nenhuma escrita automática.',
  schema_blocked: 'Schema incompatível com o manifesto: migrations exigem autorização separada.',
  indeterminate: 'Leitura incompleta: não é possível classificar com segurança.'
});

/**
 * Classifica fatos já coletados. Pura e determinística (exportada para teste).
 * facts: { ref, readErrors[], schemaState, marker, users[{id,email}], orgs[{id,kind,legal_name,created_by}],
 *          workspaces[{slug,status}], baselineRfqTitles[], expectedRfqTitles[], baselineContracts }
 */
export function classifyBaseline(facts) {
  const reasons = [];
  if (facts.readErrors?.length) return result('indeterminate', facts.readErrors.map((e) => `READ_FAILED:${e}`));
  if (facts.schemaState && facts.schemaState !== 'compatible') return result('schema_blocked', [`SCHEMA_${String(facts.schemaState).toUpperCase()}`]);
  if (facts.marker && facts.marker !== DEMO_MARKER_VALUE) return result('foreign', ['MARKER_MISMATCH']);

  const kindOf = new Map();
  const users = { baseline: [], workspace: [], unknownDemo: 0, foreign: 0 };
  for (const user of facts.users || []) {
    const email = String(user.email || '').toLowerCase();
    if (BASELINE_PERSONAS[email]) { users.baseline.push(BASELINE_PERSONAS[email]); kindOf.set(user.id, 'baseline'); }
    else if (isDemoEmail(email) && workspaceSlugFromEmail(email)) { users.workspace.push(workspaceSlugFromEmail(email)); kindOf.set(user.id, `ws:${workspaceSlugFromEmail(email)}`); }
    else if (isDemoEmail(email)) { users.unknownDemo += 1; kindOf.set(user.id, 'unknown-demo'); }
    else { users.foreign += 1; kindOf.set(user.id, 'foreign'); }
  }
  const orgs = { baseline: [], workspace: [], foreign: 0 };
  for (const org of facts.orgs || []) {
    const owner = kindOf.get(org.created_by);
    if (owner === 'baseline') orgs.baseline.push(org);
    else if (owner?.startsWith('ws:')) orgs.workspace.push(owner.slice(3));
    else orgs.foreign += 1;
  }
  const counts = {
    baseline_personas: new Set(users.baseline).size, baseline_personas_expected: Object.keys(BASELINE_PERSONAS).length,
    baseline_orgs: orgs.baseline.length, baseline_orgs_expected: BASELINE_ORGS.BUYER + BASELINE_ORGS.PROVIDER,
    workspace_accounts: users.workspace.length, workspace_orgs: orgs.workspace.length,
    foreign_accounts: users.foreign, foreign_orgs: orgs.foreign, unknown_demo_accounts: users.unknownDemo,
    workspace_rows: (facts.workspaces || []).length,
    workspaces_ready: (facts.workspaces || []).filter((row) => row.status === 'ready').length,
    baseline_rfqs_found: (facts.expectedRfqTitles || []).filter((title) => (facts.baselineRfqTitles || []).includes(title)).length,
    baseline_rfqs_expected: (facts.expectedRfqTitles || []).length,
    baseline_contracts: facts.baselineContracts ?? 0
  };

  if (users.foreign || orgs.foreign) return result('foreign', [users.foreign && 'FOREIGN_ACCOUNTS', orgs.foreign && 'FOREIGN_ORGANIZATIONS'].filter(Boolean), counts);
  if (users.unknownDemo) reasons.push('UNKNOWN_DEMO_IDENTITY');
  const names = orgs.baseline.map((org) => `${org.kind}:${org.legal_name}`);
  if (new Set(names).size !== names.length) reasons.push('DUPLICATE_BASELINE_ORGANIZATION');
  const byKind = (kind) => orgs.baseline.filter((org) => org.kind === kind).length;
  if (byKind('BUYER') > BASELINE_ORGS.BUYER || byKind('PROVIDER') > BASELINE_ORGS.PROVIDER) reasons.push('EXCESS_BASELINE_ORGANIZATIONS');
  const titles = facts.baselineRfqTitles || [];
  if (new Set(titles).size !== titles.length) reasons.push('DUPLICATE_BASELINE_RFQ');
  if (reasons.length) return result('inconsistent', reasons, counts);

  // Workspaces: contas sem linha ou status preso (provisioning/cleaning/failed) => limpar por slug.
  // claimed/expired seguem o ciclo normal do pool (workspaces.mjs maintain), não são entulho.
  const rows = new Map((facts.workspaces || []).map((row) => [row.slug, row.status]));
  // Contas sem linha = provisionamento interrompido antes do registro; linhas presas = idem depois.
  const debris = new Set([...users.workspace, ...orgs.workspace].filter((slug) => !rows.has(slug)));
  for (const [slug, status] of rows) if (STUCK.has(status)) debris.add(slug);
  const workspaceDebris = [...debris].sort();

  const baselineEmpty = !counts.baseline_personas && !counts.baseline_orgs;
  const baselineComplete = counts.baseline_personas === counts.baseline_personas_expected
    && byKind('BUYER') === BASELINE_ORGS.BUYER && byKind('PROVIDER') === BASELINE_ORGS.PROVIDER
    && counts.baseline_rfqs_found === counts.baseline_rfqs_expected && counts.baseline_contracts >= 2;
  if (baselineEmpty && (counts.workspace_accounts || counts.workspace_rows)) return result('inconsistent', ['WORKSPACES_WITHOUT_BASELINE'], counts, workspaceDebris);
  if (baselineEmpty) return result(facts.marker === DEMO_MARKER_VALUE ? 'marker_only' : 'empty', [], counts, workspaceDebris);
  if (!facts.marker) return result('inconsistent', ['BASELINE_WITHOUT_MARKER'], counts, workspaceDebris);
  return result(baselineComplete ? 'baseline_complete' : 'baseline_partial', baselineComplete ? [] : ['BASELINE_INCOMPLETE'], counts, workspaceDebris);

  function result(state, why, countsOut = null, debrisOut = []) {
    return { state, description: STATES[state], reasons: why, counts: countsOut, workspace_debris: debrisOut };
  }
}

/**
 * Plano mínimo e ordenado. Cada operação diz se escreve e o escopo exato.
 * O comando é um identificador fechado (o executor só aceita esta lista).
 */
export const OPERATIONS = Object.freeze({
  'cleanup-workspace': { write: true, scope: 'contas +ws-<slug>, organizações criadas por elas e a linha do workspace', command: 'workspace-cleanup' },
  'reset-baseline': { write: true, scope: 'remove somente as 9 personas da baseline e o que elas criaram, depois semeia a história de novo (seed.mjs --reset)', command: 'seed-reset' },
  'seed-baseline': { write: true, scope: 'marcador Demo, allowlist .example, 9 personas e história Vitta Foods pela API', command: 'seed' },
  'check-baseline': { write: false, scope: 'checagens de sanidade da baseline (login das personas, só leitura de dados)', command: 'seed-check' },
  'provision-workspaces': { write: true, scope: 'novos workspaces +ws-<slug> até 2 prontos', command: 'workspaces-provision' }
});

export function recoveryPlan(classification, { ref = null, schemaVersion = null } = {}) {
  const steps = [];
  const add = (id, extra = {}) => steps.push({ id, ...OPERATIONS[id], ...extra });
  const { state, counts } = classification;
  const manual = ['foreign', 'inconsistent', 'indeterminate', 'schema_blocked'].includes(state);
  if (!manual) {
    for (const slug of classification.workspace_debris || []) add('cleanup-workspace', { slug });
    if (state === 'baseline_partial') add('reset-baseline', { affects: { personas: counts.baseline_personas, organizations: counts.baseline_orgs } });
    // seed.mjs --reset já semeia depois de remover o escopo; seed simples só para banco sem baseline.
    if (state === 'empty' || state === 'marker_only') add('seed-baseline');
    add('check-baseline');
    const ready = state === 'baseline_complete' ? counts.workspaces_ready : 0;
    if (ready < TARGET_WORKSPACES) add('provision-workspaces', { count: TARGET_WORKSPACES - ready });
  }
  const body = { ref, schema_version: schemaVersion, state, reasons: classification.reasons, counts, operations: steps.map(({ id, slug, count, affects }) => ({ id, slug, count, affects })) };
  return {
    state, manual, operations: steps,
    requires_authorization: steps.some((step) => step.write),
    plan_sha256: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    next: manual ? manualNext(state) : steps.length ? 'Revisar o plano e, só com autorização específica, executar o modo recover-and-provision com este plan_sha256.' : 'Nada a fazer.'
  };
}

function manualNext(state) {
  return {
    foreign: 'Parar. Há dados fora da Demo: identificar origem e dono antes de qualquer escrita. Não usar reset.',
    inconsistent: 'Parar. Revisar os motivos listados com consultas somente leitura e decidir manualmente; o plano automático não se aplica.',
    indeterminate: 'Repetir a inspeção; se persistir, investigar permissão/rede. Nenhuma escrita com leitura incompleta.',
    schema_blocked: 'Reconciliar o schema (migrations hospedadas exigem autorização separada) e repetir a inspeção.'
  }[state];
}

/** Coleta os fatos com GET apenas. Nunca lança por falha de leitura: vira readErrors. */
export async function collectBaselineFacts({ env = process.env, fetchImpl = globalThis.fetch, expectedRfqTitles = [], schemaState = null } = {}) {
  const cfg = assertDemoTarget(env);
  const local = cfg.target?.kind === 'local';
  const ref = local ? null : cfg.target?.ref || null;
  if (!local && !ref) throw Object.assign(new Error('identidade do projeto Supabase não verificável'), { code: 'TARGET_INVALID' });
  const forbidden = [...(ACTIVE_SUPABASE_ASSIGNMENTS.production || []), ...(ACTIVE_SUPABASE_ASSIGNMENTS.legacy || [])];
  if (ref && forbidden.includes(ref)) throw Object.assign(new Error('alvo de produção/legado recusado'), { code: 'TARGET_PRODUCTION' });
  if (ref && !(ACTIVE_SUPABASE_ASSIGNMENTS.demo || []).includes(ref)) throw Object.assign(new Error('ref fora da atribuição Demo'), { code: 'TARGET_INVALID' });
  const requests = [];
  const get = readOnlyFetch(fetchImpl, requests);
  const headers = supabaseApiKeyHeaders(cfg.serviceKey);
  const facts = { ref: ref || 'local', readErrors: [], schemaState, marker: null, users: [], orgs: [], workspaces: [], baselineRfqTitles: [], expectedRfqTitles, baselineContracts: 0, requests };
  const read = async (id, url) => {
    try {
      const response = await get(url, { headers });
      if (!response.ok) { facts.readErrors.push(`${id}:HTTP_${response.status}`); return null; }
      return await response.json();
    } catch (error) {
      if (error?.code === 'WRITE_ATTEMPT') throw error;
      facts.readErrors.push(`${id}:NETWORK`);
      return null;
    }
  };
  const marker = await read('marker', `${cfg.supabaseUrl}/rest/v1/fin_settings?select=value&key=eq.deployment_environment`);
  facts.marker = marker?.[0]?.value ?? null;
  for (let page = 1; page <= 20; page += 1) {
    const payload = await read('auth-users', `${cfg.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=500`);
    const batch = payload?.users || [];
    facts.users.push(...batch.map((user) => ({ id: user.id, email: user.email })));
    if (!payload || batch.length < 500) break;
  }
  facts.orgs = (await read('organizations', `${cfg.supabaseUrl}/rest/v1/fin_organizations?select=id,kind,legal_name,created_by&limit=1000`)) || [];
  facts.workspaces = (await read('workspaces', `${cfg.supabaseUrl}/rest/v1/fin_demo_workspaces?select=slug,status&limit=1000`)) || [];
  const baselineIds = new Set(facts.users.filter((user) => BASELINE_PERSONAS[String(user.email || '').toLowerCase()]).map((user) => user.id));
  const buyer = facts.orgs.find((org) => org.kind === 'BUYER' && baselineIds.has(org.created_by));
  if (buyer) {
    const rfqs = await read('rfqs', `${cfg.supabaseUrl}/rest/v1/fin_rfqs?select=title&organization_id=eq.${encodeURIComponent(buyer.id)}&limit=1000`);
    facts.baselineRfqTitles = (rfqs || []).map((row) => row.title).filter((title) => expectedRfqTitles.includes(title));
    const contracts = await read('contracts', `${cfg.supabaseUrl}/rest/v1/fin_contracts?select=id&organization_id=eq.${encodeURIComponent(buyer.id)}&limit=1000`);
    facts.baselineContracts = (contracts || []).length;
  }
  return facts;
}
