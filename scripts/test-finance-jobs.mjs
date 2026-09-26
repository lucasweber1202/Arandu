#!/usr/bin/env node
// Agenda de renovação: só o cron com segredo chega ao service role.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleFinanceJobs, authorizedCron } from '../lib/api/domains/finance-jobs.mjs';

const secret = 's'.repeat(40);
const res = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.payload = JSON.parse(value); } });
const req = (method, authorization) => ({ method, headers: authorization ? { authorization } : {} });
let calls = [];
const deps = { env: { CRON_SECRET: secret }, rpc: async (name, body) => { calls.push([name, body]); return 2; }, databaseReady: () => true, now: () => new Date('2026-09-26T09:15:00Z') };

assert.equal(authorizedCron(req('GET', `Bearer ${secret}`), { CRON_SECRET: secret }), true);
assert.equal(authorizedCron(req('GET', `Bearer ${secret}`), { CRON_SECRET: 'curto' }), false, 'segredo curto não autoriza');
assert.equal(authorizedCron(req('GET', 'Bearer errado'), { CRON_SECRET: secret }), false);
assert.equal(authorizedCron(req('GET'), {}), false, 'sem segredo configurado nada passa');

for (const [request, status] of [[req('GET'), 401], [req('GET', 'Bearer x'.padEnd(47, 'x')), 401], [req('POST', `Bearer ${secret}`), 405]]) {
  const out = res();
  await handleFinanceJobs(request, out, 'renewals', deps);
  assert.equal(out.statusCode, status);
}
assert.deepEqual(calls, [], 'requisição não autorizada chegou ao banco');
{
  const out = res();
  await handleFinanceJobs(req('GET', `Bearer ${secret}`), out, 'renewals', { ...deps, databaseReady: () => false });
  assert.equal(out.statusCode, 503);
}
{
  const out = res();
  await handleFinanceJobs(req('GET', `Bearer ${secret}`), out, 'renewals', deps);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(out.payload, { ok: true, job: 'renewals', day: '2026-09-26', tasks_created: 2 });
  assert.deepEqual(calls, [['fin_run_renewal_schedule', { p_day: '2026-09-26' }]]);
  assert.equal(out.headers['Cache-Control'], 'no-store');
}
{
  const out = res();
  await handleFinanceJobs(req('GET', `Bearer ${secret}`), out, 'outra', deps);
  assert.equal(out.statusCode, 404);
}
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
assert.ok(vercel.crons.some((cron) => cron.path === '/api/jobs/renewals'), 'cron de renovação não agendado');
assert.match(readFileSync('api/[...path].js', 'utf8'), /route === 'jobs\/renewals'/);
console.log('Finance jobs: cron de renovação exige segredo, usa service role só depois da autorização e está agendado.');
