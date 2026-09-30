#!/usr/bin/env node
// Work OS da demonstração (finance/demo/workspace): regras puras e fronteiras.
//   * privacidade dos comentários (provedor só lê o escopo dele);
//   * política versionada (regra, etapas, validação, diferença entre versões);
//   * linha do tempo universal sem duplicar evento;
//   * intake determinístico com procedência do perfil;
//   * registro local validado, barramento com auditoria, conflito e fila;
//   * cache local-first (stale-while-revalidate) sem rede;
//   * conectores simulados: conectar/desconectar sem nenhuma chamada externa;
//   * nenhuma linguagem de recomendação nos textos da camada.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function memory() { const map = new Map(); return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), clear: () => map.clear() }; }
globalThis.localStorage = memory();
globalThis.sessionStorage = memory();
globalThis.fetch = () => { throw new Error('O Work OS da demonstração tentou usar a rede.'); };

const { sanitize, initialState, readOS, updateOS, resetOS, OS_VERSION } = await import('../finance/demo/workspace/platform/os-store.js');
const { emit, on, auditLog } = await import('../finance/demo/workspace/platform/bus.js');
const { evaluatePolicy, currentPolicy, policyVersion, rfqPolicyVersion, validatePolicy, diffPolicies, conditionText } = await import('../finance/demo/workspace/workflows/policy.js');
const { visibleComments } = await import('../finance/demo/workspace/collaboration/comments.js');
const { mergeActivity } = await import('../finance/demo/workspace/collaboration/activity.js');
const { mergeNotifications } = await import('../finance/demo/workspace/collaboration/center.js');
const { buildDemand, TEMPLATES } = await import('../finance/demo/workspace/workflows/intake.js');
const { resolveConflict, CONFLICT_EXAMPLE } = await import('../finance/demo/workspace/platform/conflict.js');
const { withLocalFirst, cacheStats } = await import('../finance/demo/workspace/platform/local-first.js');
const { ADAPTERS, CONNECTORS } = await import('../finance/demo/workspace/integrations/registry.js');
const { track, funnel, flag, setFlag, mark, perfSummary, PERF_BUDGETS } = await import('../finance/demo/workspace/platform/telemetry.js');
const { optimistic, registerExecutor, setNetwork, flush, status } = await import('../finance/demo/workspace/platform/sync.js');
const { createDemoEngine } = await import('../finance/demo/engine.js');
const { O, R } = await import('../finance/demo/seed.js');

// ------------------------------------------------------------ registro local
assert.equal(sanitize(null).version, OS_VERSION);
assert.deepEqual(sanitize({ version: 999, comments: [{ id: 'x' }] }).comments, initialState().comments, 'versão desconhecida volta ao conjunto inicial');
assert.equal(sanitize({ version: OS_VERSION, network: 'hacked' }).network, 'online');
assert.equal(sanitize({ version: OS_VERSION, recentSearches: ['ok', { evil: 1 }] }).recentSearches.length, 1);
localStorage.setItem('arandu-demo-os', '{not json');
resetOS();
assert.equal(readOS().policies.current, 3);

// ------------------------------------------------------------ política
const policies = readOS().policies;
const v3 = currentPolicy(policies);
const credit = (amount) => ({ product: 'credit', demand: { amount } });
assert.deepEqual(evaluatePolicy(v3, credit(6000000)).stages.map((stage) => stage.key), ['controller', 'cfo', 'ceo']);
assert.deepEqual(evaluatePolicy(v3, credit(3000000)).stages.map((stage) => stage.key), ['controller', 'cfo']);
assert.deepEqual(evaluatePolicy(v3, credit(800000)).stages.map((stage) => stage.key), ['cfo']);
assert.deepEqual(evaluatePolicy(v3, { product: 'acquiring', demand: {} }).stages.map((stage) => stage.key), ['treasury', 'controller']);
assert.deepEqual(evaluatePolicy(policyVersion(policies, 2), credit(6000000)).stages.map((stage) => stage.key), ['controller', 'cfo'], 'v2 não tinha a etapa do CEO');
assert.equal(rfqPolicyVersion(policies, R.capital), 2, 'processo em andamento continua na v2');
assert.equal(rfqPolicyVersion(policies, 'novo'), 3, 'processo novo usa a atual');
assert.match(evaluatePolicy({ rules: [] }, credit(1)).reason, /Nenhuma regra/);
assert.ok(validatePolicy([{ name: '', active: true, stages: [] }]).length >= 2);
assert.ok(validatePolicy([{ name: 'x', active: true, stages: ['cfo', 'cfo'] }]).some((text) => /duas vezes/.test(text)));
assert.deepEqual(validatePolicy(v3.rules), []);
assert.deepEqual(diffPolicies(v3, { rules: [...v3.rules.slice(1), { id: 'n', name: 'Nova' }] }), ['Nova regra: Nova', 'Removida: Crédito acima de R$ 5 milhões']);
assert.match(conditionText({ field: 'amount', op: 'gt', value: 1000000 }), /^Valor maior que R\$\s1\.000\.000$/);

// ------------------------------------------------------------ comentários
const comments = [
  { object_type: 'proposal', object_id: 'p1', scope: 'internal', body: 'interno' },
  { object_type: 'proposal', object_id: 'p1', scope: 'provider', provider_org: 'atlas', body: 'para atlas' },
  { object_type: 'proposal', object_id: 'p1', scope: 'provider', provider_org: 'horizonte', body: 'para horizonte' },
  { object_type: 'proposal', object_id: 'p2', scope: 'provider', provider_org: 'atlas', body: 'outra proposta' }
];
assert.deepEqual(visibleComments(comments, { objectType: 'proposal', objectId: 'p1', viewerOrgKind: 'provider', providerOrg: 'atlas' }).map((row) => row.body), ['para atlas']);
assert.deepEqual(visibleComments(comments, { objectType: 'proposal', objectId: 'p1', viewerOrgKind: 'provider', providerOrg: null }), [], 'provedor sem organização não lê nada');
assert.equal(visibleComments(comments, { objectType: 'proposal', objectId: 'p1', viewerOrgKind: 'company' }).length, 3);
assert.deepEqual(visibleComments(readOS().comments, { objectType: 'approval', objectId: readOS().comments[0].object_id, viewerOrgKind: 'provider', providerOrg: 'atlas' }), [], 'comentário interno de aprovação nunca chega ao provedor');

// ------------------------------------------------------------ atividade e notificações
const at = '2026-09-29T10:00:00.000Z';
const merged = mergeActivity({ engineRows: [{ happened_at: at, actor_name: 'Ricardo Alves', event_type: 'approval_approved', metadata: {} }],
  busRows: [{ type: 'approval.approved', at: '2026-09-29T10:00:20.000Z', actor: { name: 'Ricardo Alves' }, origin: 'web' }, { type: 'integration.connected', at, actor: { name: 'Helena' }, origin: 'slack' }, { type: 'sync.queued', at }] });
assert.equal(merged.filter((item) => item.category === 'approvals').length, 1, 'aprovar não aparece duas vezes (motor + camada)');
assert.ok(merged.some((item) => item.origin === 'slack'));
assert.ok(!merged.some((item) => /sync/.test(item.action)), 'eventos efêmeros não viram atividade');
const notes = mergeNotifications([{ id: 'e1', event_type: 'mention', title: 'm', created_at: at, read_at: null }], [{ id: 'l1', category: 'integrations', title: 'i', at: '2026-09-29T11:00:00Z', read: true }]);
assert.deepEqual(notes.map((row) => [row.id, row.category, row.read]), [['local:l1', 'integrations', true], ['engine:e1', 'mentions', false]]);

// ------------------------------------------------------------ intake
const capital = TEMPLATES.find((row) => row.id === 'capital');
const profile = [{ field_key: 'faturamento_anual', field_value: 'R$ 186 milhões', updated_at: at }, { field_key: 'setor', field_value: 'Embalagens', updated_at: at }];
const built = buildDemand(capital, { amount: '6000000', urgency: 'alta' }, profile);
assert.deepEqual(built.demand, { purpose: 'capital_de_giro', term_months: 24, grace_months: 3, urgency: 'alta', annual_revenue: 186000000, sector: 'Embalagens', amount: 6000000 });
assert.deepEqual(Object.keys(built.provenance).sort(), ['annual_revenue', 'sector']);
assert.deepEqual(buildDemand(capital, { amount: '1' }, profile), buildDemand(capital, { amount: '1' }, profile), 'determinístico');
assert.equal(buildDemand(TEMPLATES.find((row) => row.id === 'acquiring'), { monthly_volume: '100' }, profile).demand.annual_revenue, undefined, 'adquirência não recebe dado de crédito');
assert.deepEqual(evaluatePolicy(v3, { product: 'credit', demand: built.demand }).stages.map((stage) => stage.key), ['controller', 'cfo', 'ceo']);

// ------------------------------------------------------------ barramento, auditoria, conflito
let seen = 0;
const off = on('*', () => { seen += 1; });
emit('integration.connected', { object: { type: 'integration', id: 'slack', title: 'Slack' }, origin: 'slack' });
emit('sync.queued', {});
emit('sync.conflict_resolved', { object: CONFLICT_EXAMPLE.object });
off();
emit('rfq.updated', {});
assert.equal(seen, 3, 'desinscrever para de ouvir');
const types = auditLog({ limit: 10 }).map((row) => row.type);
assert.ok(types.includes('integration.connected') && types.includes('sync.conflict_resolved') && !types.includes('sync.queued'));
assert.equal(auditLog({ limit: 10 }).find((row) => row.type === 'integration.connected').origin, 'slack');
assert.match(resolveConflict(CONFLICT_EXAMPLE, 'mine').text, /48 meses/);
assert.equal(resolveConflict(CONFLICT_EXAMPLE, 'theirs').value, 36);

// ------------------------------------------------------------ fila offline e otimista
let sent = 0;
registerExecutor('test.op', async () => { sent += 1; });
await setNetwork('offline');
const queued = await optimistic({ kind: 'test.op', payload: {}, label: 'teste', apply: () => {} });
assert.equal(queued.queued, true);
assert.match(status().label, /1 alteração aguardando sincronização/);
assert.equal(sent, 0);
await setNetwork('online');
assert.equal(sent, 1, 'reconectar envia a fila');
assert.equal(readOS().outbox.length, 0);
registerExecutor('test.fail', async () => { throw new Error('recusado'); });
let rolledBack = false;
await assert.rejects(optimistic({ kind: 'test.fail', payload: {}, label: 'x', apply: () => {}, rollback: () => { rolledBack = true; } }));
assert.ok(rolledBack, 'falha desfaz a mudança otimista');
await flush();

// ------------------------------------------------------------ local-first
const engine = createDemoEngine({ storage: memory(), latency: 0 });
const transport = withLocalFirst(engine);
const first = await transport.request(`overview?organization_id=${O.acme}`);
const second = await transport.request(`overview?organization_id=${O.acme}`);
assert.deepEqual(first, second);
second.rfqs.length = 0;
assert.ok((await transport.request(`overview?organization_id=${O.acme}`)).rfqs.length > 0, 'o cache devolve cópia, nunca a referência');
assert.ok(cacheStats().hits >= 2);
await setNetwork('offline');
await assert.rejects(transport.request('profile', { method: 'POST', body: '{}' }), (error) => error.code === 'demo_offline');
await setNetwork('online');

// ------------------------------------------------------------ conectores simulados
assert.equal(CONNECTORS.length, 13);
for (const name of ['Slack', 'Microsoft Teams', 'Google Drive', 'OneDrive', 'Omie', 'TOTVS', 'SAP', 'NetSuite', 'Dynamics 365', 'WorkOS', 'Pluggy', 'Belvo', 'PostHog']) assert.ok(CONNECTORS.some((row) => row.name === name), name);
for (const adapter of Object.values(ADAPTERS)) for (const method of ['connect', 'disconnect', 'status', 'sync', 'lastSync']) assert.equal(typeof adapter[method], 'function', `${adapter.id}.${method}`);
await ADAPTERS.slack.connect({ viewer: { id: 'u', name: 'Helena' } }, { latency: 0 });
assert.equal(ADAPTERS.slack.status(), 'connected');
assert.equal(readOS().integrations.slack.simulated, true);
await ADAPTERS.slack.sync({});
await ADAPTERS.slack.disconnect({});
assert.equal(ADAPTERS.slack.status(), 'disconnected');
await assert.rejects(ADAPTERS.omie.sync({}), /não está conectado/);

// ------------------------------------------------------------ telemetria e flags
track('demo_started');
track('comparison_opened');
assert.deepEqual(funnel().map((step) => step.count > 0), [true, false, true, false, false]);
assert.equal(flag('presence'), true);
setFlag('presence', false);
assert.equal(flag('presence'), false);
setFlag('nao-existe', true);
assert.equal(readOS().flags['nao-existe'], undefined);
mark('search', 12);
assert.equal(perfSummary().find((row) => row.name === 'search').median, 12);
assert.ok(PERF_BUDGETS.search <= 50 && PERF_BUDGETS.optimistic <= 50);

// ------------------------------------------------------------ texto da camada
const FORBIDDEN = /vencedor|melhor (proposta|banco|opção)|recomendad|ranking|ganhador|ideal para/i;
const FAKE_AI = /\bIA\b.*(resum|suger|recomend)|assistente inteligente|chatbot|gerado por IA/i;
const root = 'finance/demo/workspace';
const walk = (dir) => readdirSync(dir).flatMap((name) => { const full = path.join(dir, name); return statSync(full).isDirectory() ? walk(full) : [full]; });
for (const file of walk(root).filter((name) => name.endsWith('.js'))) {
  // Comentários de código e avisos negativos ("não recomenda… nem aponta vencedor") não contam.
  const text = readFileSync(file, 'utf8').split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && !/\bnão (recomenda|aponta|tem IA)/i.test(line)).join('\n');
  assert.ok(!FORBIDDEN.test(text), `${file}: linguagem de recomendação (${text.match(FORBIDDEN)?.[0]})`);
  assert.ok(!FAKE_AI.test(text), `${file}: IA fingida (${text.match(FAKE_AI)?.[0]})`);
  const external = text.match(/https?:\/\/(?!127\.0\.0\.1|localhost)[a-z0-9.-]+\.(com|io|net|br)\b/i);
  assert.ok(!external, `${file}: endereço externo (${external?.[0]})`);
}
console.log('Work OS da demonstração: privacidade, política versionada, atividade, intake, fila offline, local-first, conectores simulados e telemetria locais validados.');
