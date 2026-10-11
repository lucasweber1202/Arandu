// Plano do controlador do pool da Demo (lib/finance/demo-workspaces.mjs).
import assert from 'node:assert/strict';
import { planPool, POOL_POLICY } from '../lib/finance/demo-workspaces.mjs';
const now = Date.parse('2026-10-11T12:00:00Z');
const iso = (minutes) => new Date(now + minutes * 60_000).toISOString();
const row = (slug, status, extra = {}) => ({ slug, status, created_at: iso(-30), ...extra });

let plan = planPool([], { now });
assert.equal(plan.provision, POOL_POLICY.targetReady, 'pool vazio repõe até o alvo');
plan = planPool([row('a', 'ready'), row('b', 'provisioning')], { now });
assert.equal(plan.provision, 1, 'montagem em andamento conta para o alvo (sem duplicar)');
plan = planPool([row('a', 'ready'), row('b', 'ready'), row('c', 'ready')], { now });
assert.deepEqual([plan.provision, plan.reason], [0, 'pool no alvo']);
// Reivindicado vencido, falho, limpeza interrompida e montagem parada vão para limpeza.
plan = planPool([row('x', 'claimed', { expires_at: iso(-1), idle_expires_at: iso(-1) }), row('y', 'failed', { created_at: iso(-120) }), row('z', 'cleaning'),
  row('w', 'provisioning', { created_at: iso(-7 * 60) }), row('v', 'claimed', { expires_at: iso(60), idle_expires_at: iso(30) })], { now });
assert.deepEqual(plan.cleanup.sort(), ['w', 'x', 'y', 'z']);
assert.equal(plan.counts.claimed, 1, 'reivindicado válido nunca é limpo');
// Teto absoluto e limite por execução.
const many = Array.from({ length: POOL_POLICY.maxTotal }, (_, i) => row(`c${i}`, 'claimed', { expires_at: iso(60), idle_expires_at: iso(60) }));
assert.deepEqual([planPool(many, { now }).provision, planPool(many, { now }).reason], [0, 'teto de workspaces vivos']);
assert.equal(planPool([], { now, policy: { ...POOL_POLICY, targetReady: 20 } }).provision, POOL_POLICY.maxPerRun);
// Falhas recentes suspendem a reposição, mas não a limpeza.
plan = planPool([row('f1', 'failed'), row('f2', 'failed'), row('f3', 'failed')], { now });
assert.equal(plan.provision, 0); assert.match(plan.reason, /backoff/); assert.equal(plan.cleanup.length, 3);
console.log('Demo pool: alvo, montagem em andamento, limpeza só de vencidos/falhos/parados, teto, limite por execução e backoff aprovados.');
