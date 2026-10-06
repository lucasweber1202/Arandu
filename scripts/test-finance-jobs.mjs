#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleFinanceJobs, authorizedCron } from '../lib/api/domains/finance-jobs.mjs';
const secret = 's'.repeat(40);
const req = { method: 'GET', headers: { authorization: `Bearer ${secret}`, 'x-vercel-id': 'gru1::abc<script>' } };
const response = () => ({ setHeader() {}, end(text) { this.payload = JSON.parse(text); } });
const clock = () => new Date('2026-10-04T09:15:00Z');
let calls;
const fixture = (failure = '', result = undefined) => ({ env: { CRON_SECRET: secret }, now: clock, timeoutMs: 20, databaseReady: () => true,
  rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === failure) throw Object.assign(new Error('password=secret token=secret'), { code: 'password_secret' });
    if (name === 'fin_job_begin') return { run_id: args.p_job, lease_token: 'fixture-lease' };
    if (name === 'fin_job_finish') return true;
    return result === undefined ? name === 'fin_run_renewal_schedule' ? 2 : name === 'fin_run_contract_milestones' ? 3 : 4 : result;
  } });
async function run(deps, request = req, job = 'renewals') { calls = []; const out = response(); await handleFinanceJobs(request, out, job, deps); return out; }
assert.equal(authorizedCron(req, { CRON_SECRET: secret }), true);
assert.equal(authorizedCron({ headers: { authorization: `Bearer ${'é'.repeat(40)}` } }, { CRON_SECRET: secret }), false, 'UTF-8 não causa timingSafeEqual com buffers de tamanho diferente');
assert.equal(authorizedCron(req, { CRON_SECRET: 'curto' }), false);
for (const [request, status] of [[{ method: 'GET', headers: {} }, 401], [{ ...req, method: 'POST' }, 405]]) {
  const out = await run(fixture(), request); assert.equal(out.statusCode, status); assert.equal(calls.length, 0);
}
assert.equal((await run({ ...fixture(), databaseReady: () => false })).statusCode, 503);
let out = await run(fixture());
assert.equal(out.statusCode, 200); assert.equal(out.payload.ok, true);
assert.equal(out.payload.tasks_created, 2); assert.equal(out.payload.milestone_tasks_created, 3); assert.equal(out.payload.approval_deadline_actions, 4); assert.equal(out.payload.opportunities_touched, 4);
assert.deepEqual(calls.find(([name]) => name === 'fin_run_opportunity_engine')[1], { p_day: '2026-10-04', p_org_limit: 50 }, 'motor em lote limitado, nunca varredura sem limite');
assert.equal(calls.filter(([name]) => name === 'fin_job_begin').length, 4);
assert.equal(calls.filter(([name]) => name === 'fin_job_finish').length, 4);
assert.deepEqual(calls.filter(([name]) => name === 'fin_job_begin').map(([, args]) => args.p_job), ['renewals', 'contract_milestones', 'approval_deadlines', 'opportunities']);
assert.equal(calls[0][1].p_request_id, 'gru1--abc-script-');
for (const name of ['fin_run_renewal_schedule', 'fin_run_contract_milestones', 'fin_run_approval_deadlines', 'fin_run_opportunity_engine']) {
  out = await run(fixture(name)); assert.equal(out.statusCode, 502); assert.equal(out.payload.ok, false);
  assert.equal(Object.values(out.payload.jobs).filter(row => row.status === 'succeeded').length, 3, 'falha parcial não impede jobs independentes');
  assert.equal(calls.filter(([rpc]) => rpc === name).length, 1, 'escrita não sofre retry cego');
  assert.doesNotMatch(JSON.stringify(out.payload)+JSON.stringify(calls), /password_secret|password=|token=/, 'código arbitrário e mensagem não entram na trilha');
}
for (const bad of [null, -1, '3', {}, 2.5, Infinity]) { out = await run(fixture('', bad)); assert.equal(out.statusCode, 502); assert.equal(out.payload.jobs.renewals.error_code, 'invalid_response'); }
out = await run(fixture('fin_job_finish')); assert.equal(out.statusCode, 502); assert.equal(out.payload.jobs.renewals.error_code, 'job_record_failed');
out = await run(fixture('fin_job_begin')); assert.equal(out.statusCode, 502); assert.equal(calls.some(([name]) => name === 'fin_run_renewal_schedule'), false);
const busy = fixture(); busy.rpc = async name => { calls.push([name]); return null; };
out = await run(busy); assert.equal(out.statusCode, 202); assert.equal(out.payload.ok, false); assert.equal(calls.length, 4);
const hanging = fixture(); const original = hanging.rpc; hanging.rpc = (name, args) => name === 'fin_run_renewal_schedule' ? new Promise(() => {}) : original(name,args);
out = await run(hanging); assert.equal(out.statusCode, 502); assert.equal(out.payload.jobs.renewals.error_code, 'timeout');
const webhook = fixture(); webhook.dispatch = async () => ({ claimed: 4, succeeded: 1, failed: 1, dead: 0, completion_failed: 1, deferred: 1 });
out = await run(webhook, req, 'webhooks'); assert.equal(out.statusCode, 502); assert.equal(out.payload.processed, 1); assert.equal(out.payload.failed, 3); assert.equal(out.payload.delivery_failed, 1);
assert.equal(calls.at(-1)[1].p_failed, 3, 'run registra falhas + conclusões indisponíveis + itens adiados');
assert.equal((await run(fixture(), req, 'unknown')).statusCode, 404);
const config=JSON.parse(readFileSync('vercel.json','utf8')); assert.ok(config.crons.some(row => row.path === '/api/jobs/renewals'));
console.log('Finance jobs: auth, UTF-8, leases, início/fim, falha parcial, respostas inválidas, timeout e observabilidade fail-closed aprovados.');
