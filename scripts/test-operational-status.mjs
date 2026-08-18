import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  OPERATIONAL_FLOWS,
  OperationalStatusError,
  allowedTransitions,
  assertTransition,
  describeFlow,
  elevatedActionFor,
  entityForPanel,
  isKnownStatus,
  statusFieldFor
} from '../lib/operational-status.mjs';
import { hasAdminPermission } from '../lib/admin-rbac.mjs';

const root = process.cwd();

// --- Vocabulário e rotas ---------------------------------------------------

assert.equal(entityForPanel('obras'), 'artwork');
assert.equal(entityForPanel('artistas'), 'artist');
assert.equal(entityForPanel('inexistente'), '');
assert.equal(statusFieldFor('certificados'), 'verification_status');
assert.equal(statusFieldFor('obras'), 'status');
assert.ok(isKnownStatus('obras', 'reserved'));
assert.ok(!isKnownStatus('obras', 'teleported'));

// Toda transição precisa apontar para um status declarado do mesmo fluxo.
for (const [entity, flow] of Object.entries(OPERATIONAL_FLOWS)) {
  const statuses = Object.keys(flow.transitions);
  for (const [from, targets] of Object.entries(flow.transitions)) {
    for (const to of targets) {
      assert.ok(statuses.includes(to), `${entity}: ${from} → ${to} aponta para status inexistente.`);
      assert.notEqual(from, to, `${entity}: ${from} não pode transitar para si mesmo.`);
    }
  }
  for (const guarded of Object.keys(flow.guards)) {
    assert.ok(statuses.includes(guarded), `${entity}: guarda declarada para status inexistente ${guarded}.`);
  }
}

// --- Fluxo de aprovação de artista ----------------------------------------

assert.throws(
  () => assertTransition('artistas', 'prospected', 'published', { identity_verified: true }),
  (error) => error instanceof OperationalStatusError
    && error.status === 409
    && error.code === 'operational_transition_invalid',
  'Artista não pode pular de prospectado para publicado.'
);

assert.throws(
  () => assertTransition('artistas', 'in_review', 'approved', { identity_verified: false }),
  (error) => error.code === 'operational_guard_failed',
  'Aprovar exige identidade verificada.'
);

assert.deepEqual(
  assertTransition('artistas', 'in_review', 'approved', { identity_verified: true }),
  { entity: 'artist', field: 'status', from: 'in_review', to: 'approved' }
);

assert.throws(
  () => assertTransition('artistas', 'approved', 'published', { identity_verified: true }),
  (error) => error.code === 'operational_guard_failed',
  'Publicar exige consentimento registrado.'
);

assert.deepEqual(
  assertTransition('artistas', 'approved', 'published', {
    identity_verified: true,
    publishing_consent_at: '2026-08-10T12:00:00Z'
  }),
  { entity: 'artist', field: 'status', from: 'approved', to: 'published' }
);

// --- Status de obra --------------------------------------------------------

assert.throws(
  () => assertTransition('obras', 'sold', 'available', { image_authorized_at: '2026-08-01' }),
  (error) => error.code === 'operational_transition_invalid',
  'Obra vendida não volta para disponível.'
);

assert.throws(
  () => assertTransition('obras', 'reserved', 'sold', { price: 0 }),
  (error) => error.code === 'operational_guard_failed',
  'Venda exige preço registrado.'
);

assert.deepEqual(
  assertTransition('obras', 'reserved', 'sold', { price: 4200 }),
  { entity: 'artwork', field: 'status', from: 'reserved', to: 'sold' }
);

assert.throws(
  () => assertTransition('obras', 'not_published', 'available', {}),
  (error) => error.code === 'operational_guard_failed',
  'Disponibilizar exige autorização de imagem.'
);

assert.throws(
  () => assertTransition('obras', 'available', 'available', { image_authorized_at: '2026-08-01' }),
  (error) => error.code === 'operational_status_unchanged'
);

assert.throws(
  () => assertTransition('obras', 'available', 'inventado', {}),
  (error) => error.status === 400 && error.code === 'operational_status_invalid'
);

assert.throws(
  () => assertTransition('obras', 'status_legado', 'available', { image_authorized_at: '2026-08-01' }),
  (error) => error.code === 'operational_status_unknown_origin'
);

// Registro novo, sem status de origem, aceita entrada direta com guarda cumprida.
assert.deepEqual(
  assertTransition('obras', '', 'available', { image_authorized_at: '2026-08-01' }),
  { entity: 'artwork', field: 'status', from: null, to: 'available' }
);

// --- Ligação com o RBAC ----------------------------------------------------

assert.equal(elevatedActionFor('artistas', 'published'), 'publish');
assert.equal(elevatedActionFor('artistas', 'approved'), 'review');
assert.equal(elevatedActionFor('leads', 'won'), '');
assert.ok(hasAdminPermission({ role: 'curator' }, 'artists', 'publish'));
assert.ok(!hasAdminPermission({ role: 'operator' }, 'artists', 'publish'));
assert.ok(hasAdminPermission({ role: 'operator' }, 'status-history', 'read'));
assert.ok(hasAdminPermission({ role: 'curator' }, 'status-history', 'read'));

// --- Paridade entre JS e SQL ----------------------------------------------

const sql = fs.readFileSync(path.join(root, 'docs/supabase-operational-status.sql'), 'utf8');
const block = sql.slice(sql.indexOf('from (values'), sql.indexOf('as t(entity, from_status, to_status)'));
const sqlPairs = new Set(
  [...block.matchAll(/\('([a-z_]+)','([a-z_]+)','([a-z_]+)'\)/g)].map((match) => `${match[1]}:${match[2]}:${match[3]}`)
);
assert.ok(sqlPairs.size > 0, 'Nenhuma transição encontrada na migration.');

const jsPairs = new Set();
for (const [entity, flow] of Object.entries(OPERATIONAL_FLOWS)) {
  for (const [from, targets] of Object.entries(flow.transitions)) {
    for (const to of targets) jsPairs.add(`${entity}:${from}:${to}`);
  }
}

const missingInSql = [...jsPairs].filter((pair) => !sqlPairs.has(pair));
const missingInJs = [...sqlPairs].filter((pair) => !jsPairs.has(pair));
assert.deepEqual(missingInSql, [], 'Transições ausentes na migration SQL.');
assert.deepEqual(missingInJs, [], 'Transições ausentes em lib/operational-status.mjs.');

assert.ok(
  sql.includes('create table if not exists public.operational_status_history'),
  'A migration precisa criar a trilha operacional.'
);
assert.ok(
  sql.includes('revoke all on public.operational_status_history from anon, authenticated'),
  'A trilha operacional não pode ficar exposta a anon/authenticated.'
);
assert.ok(sql.includes('for update'), 'A transição precisa ocorrer sob lock.');

// A trilha precisa cobrir também as transições internas do banco.
const trailSql = fs.readFileSync(path.join(root, 'docs/supabase-operational-trail-completeness.sql'), 'utf8');
assert.ok(
  trailSql.includes('trg_arandu_operational_status'),
  'A trilha completa precisa instalar o gatilho de status.'
);
assert.ok(
  trailSql.includes('log_operational_status_change'),
  'A trilha completa precisa da função de registro.'
);
for (const table of ['artworks', 'artists', 'reservations', 'certificates']) {
  assert.ok(trailSql.includes(`'${table}'`), `O gatilho precisa cobrir ${table}.`);
}
// A RPC não pode continuar inserindo direto, senão o gatilho duplica a linha.
const rpcBody = trailSql.slice(trailSql.indexOf('create or replace function public.apply_operational_status_atomic'));
assert.ok(
  !/insert into public\.operational_status_history[\s\S]*?values \(\s*p_entity_type/.test(rpcBody),
  'A RPC deve delegar o registro da trilha ao gatilho.'
);

// --- Superfície de API -----------------------------------------------------

process.env.SUPABASE_URL = 'https://arandu-operational-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-operational-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-operational-test';
delete process.env.VERCEL_ENV;
delete process.env.ARANDU_DISTRIBUTED_RATE_LIMIT;

const apiSource = [
  path.join(root, 'api/[...path].js'),
  ...fs.readdirSync(path.join(root, 'lib/api/domains')).filter((name) => name.endsWith('.mjs')).map((name) => path.join(root, 'lib/api/domains', name))
].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
assert.ok(
  apiSource.includes('apply_operational_status_atomic'),
  'A API precisa aplicar status pela RPC atômica.'
);
assert.ok(
  apiSource.includes("resource === 'status-history'"),
  'A API precisa expor a trilha operacional.'
);
assert.match(
  apiSource,
  /A trilha de status é somente leitura\./,
  'A trilha operacional precisa recusar escrita direta.'
);

const { default: handler } = await import(`../api/[...path].js?operational-test=${Date.now()}`);

function req(method, url, body, headers = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = Readable.from(chunks);
  request.method = method;
  request.url = url;
  request.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  request.socket = { remoteAddress: '127.0.0.11' };
  return request;
}

function res() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = '') { this.body = String(value); }
  };
}

async function call(method, url, body, headers) {
  const response = res();
  await handler(req(method, url, body, headers), response);
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

// Sem sessão administrativa a superfície continua fechada.
const unauthenticated = await call('PATCH', '/api/admin-update', { panel: 'obras', id: 'obra-1', fields: { status: 'sold' } });
assert.ok([401, 403].includes(unauthenticated.status), 'Transição operacional exige sessão administrativa.');

const historyUnauthenticated = await call('GET', '/api/operational?resource=status-history&entity_type=artwork&entity_id=obra-1');
assert.ok([401, 403].includes(historyUnauthenticated.status), 'Trilha operacional exige sessão administrativa.');

// --- Descrição do fluxo ----------------------------------------------------

const artworkFlow = describeFlow('obras');
assert.equal(artworkFlow.entity, 'artwork');
assert.equal(artworkFlow.panel, 'obras');
assert.deepEqual(artworkFlow.transitions.sold, ['archived']);
assert.deepEqual(allowedTransitions('obras', 'sold'), ['archived']);
assert.ok(artworkFlow.guarded.includes('sold'));
assert.equal(describeFlow('inexistente'), null);

console.log('Operational status machine tests approved.');
console.log(`Fluxos: ${Object.keys(OPERATIONAL_FLOWS).length} · Transições: ${jsPairs.size}`);
