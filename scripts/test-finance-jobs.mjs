#!/usr/bin/env node
// Agenda de renovação: só o cron com segredo chega ao service role.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleFinanceJobs, authorizedCron } from '../lib/api/domains/finance-jobs.mjs';

const secret = 's'.repeat(40);
const res = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.payload = JSON.parse(value); } });
const req = (method, authorization, extra = {}) => ({ method, headers: { ...(authorization ? { authorization } : {}), ...extra } });
let calls = [];
const deps = { env: { CRON_SECRET: secret }, rpc: async (name, body) => { calls.push([name, body]); return name === 'fin_run_renewal_schedule' ? 2 : name === 'fin_run_contract_milestones' ? 3 : name === 'fin_run_approval_deadlines' ? 1 : null; }, databaseReady: () => true, now: () => new Date('2026-09-26T09:15:00Z') };

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
  await handleFinanceJobs(req('GET', `Bearer ${secret}`, { 'x-vercel-id': 'gru1::abc<script>' }), out, 'renewals', deps);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(out.payload, { ok: true, job: 'renewals', day: '2026-09-26', tasks_created: 2, milestone_tasks_created: 3, approvals_escalated: 1, request_id: 'gru1--abc-script-' });
  assert.deepEqual(calls[0], ['fin_run_renewal_schedule', { p_day: '2026-09-26' }]);
  assert.deepEqual(calls[1], ['fin_record_job_run', { p_job: 'renewals', p_status: 'succeeded', p_processed: 2, p_request_id: 'gru1--abc-script-', p_error_code: null, p_started_at: '2026-09-26T09:15:00.000Z' }]);
  assert.deepEqual(calls[2], ['fin_run_contract_milestones', { p_day: '2026-09-26' }]);
  assert.deepEqual(calls[3], ['fin_record_job_run', { p_job: 'contract_milestones', p_status: 'succeeded', p_processed: 3, p_request_id: 'gru1--abc-script-', p_error_code: null, p_started_at: '2026-09-26T09:15:00.000Z' }]);
  assert.deepEqual(calls[4], ['fin_run_approval_deadlines', {}]);
  assert.equal(calls[5][1].p_job, 'approval_deadlines');
  assert.equal(out.headers['Cache-Control'], 'no-store');
}
{
  // Falha nos marcos não desfaz a renovação concluída e fica registrada sem a mensagem do banco.
  calls = [];
  const out = res();
  const failing = { ...deps, rpc: async (name, body) => { calls.push([name, body]); if (name === 'fin_run_contract_milestones') { const error = new Error('relation fin_contract_milestones: token=abc'); error.code = 'Bad Gateway'; throw error; } return name === 'fin_run_renewal_schedule' ? 1 : null; } };
  await handleFinanceJobs(req('GET', `Bearer ${secret}`), out, 'renewals', failing);
  assert.equal(out.statusCode, 200);
  assert.equal(out.payload.tasks_created, 1);
  assert.equal(out.payload.milestone_tasks_created, null);
  assert.doesNotMatch(JSON.stringify(out.payload), /token|fin_contract/);
  const milestoneRun = calls.find(([name, body]) => name === 'fin_record_job_run' && body.p_job === 'contract_milestones')[1];
  assert.equal(`${milestoneRun.p_status}/${milestoneRun.p_error_code}`, 'failed/bad_gateway');
  assert.ok(calls.some(([name]) => name === 'fin_run_approval_deadlines'), 'falha nos marcos não impede a escalação');
}
{
  // Falha do banco: execução registrada como falha, com código curto e sem a mensagem original.
  calls = [];
  const out = res();
  const failing = { ...deps, rpc: async (name, body) => { calls.push([name, body]); if (name === 'fin_run_renewal_schedule') { const error = new Error('relation fin_contracts: senha=xyz'); error.code = 'Upstream Unavailable'; throw error; } return null; } };
  await handleFinanceJobs(req('GET', `Bearer ${secret}`), out, 'renewals', failing);
  assert.equal(out.statusCode, 502);
  assert.equal(out.payload.code, 'renewal_job_failed');
  assert.doesNotMatch(JSON.stringify(out.payload), /senha|fin_contracts/);
  assert.equal(calls[1][1].p_status, 'failed');
  assert.equal(calls[1][1].p_error_code, 'upstream_unavailable');
}
{
  // Duas execuções no mesmo dia chegam ao banco; a idempotência é da função SQL (provada em test:database).
  calls = [];
  for (let i = 0; i < 2; i += 1) await handleFinanceJobs(req('GET', `Bearer ${secret}`), res(), 'renewals', deps);
  assert.equal(calls.filter(([name]) => name === 'fin_run_renewal_schedule').length, 2);
  assert.equal(calls.filter(([name]) => name === 'fin_record_job_run').length, 6);
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
