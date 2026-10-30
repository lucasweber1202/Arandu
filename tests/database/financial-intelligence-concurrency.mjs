import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
const run = promisify(execFile), url = process.argv[2];
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname), 'disposable loopback only');
const query = async (sql, app = 'intelligence_probe') => (await run('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env: { ...process.env, PGAPPNAME: app }, maxBuffer: 2097152 })).stdout.trim();
const user = (actor, sql) => `begin;set local statement_timeout='15s';set local role authenticated;select set_config('request.jwt.claim.sub','${actor}',true);${sql};commit;`;
for (const name of ['negotiation-continuity', 'institutional-decline']) {
  const sql = (await readFile(`tests/database/financial-${name}.sql`, 'utf8')).replace(/^\\.*$/gm, '').replace(/rollback;\s*$/, 'commit;');
  await query(sql);
}
async function waitFor(predicate) {
  for (let n = 0; n < 200; n++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 25)); }
  throw Error('expected deterministic lock interleaving absent');
}
async function contend(lockSql, commands, name, beforeRelease = async () => {}) {
  const holder = spawn('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let error = ''; holder.stdout.resume(); holder.stderr.on('data', s => error += s);
  const done = new Promise((resolve, reject) => { holder.on('error', reject); holder.on('close', c => c === 0 ? resolve() : reject(Error(error))); });
  holder.stdin.write(`begin;set application_name='${name}_holder';${lockSql};\n`);
  try {
    await waitFor(async () => await query(`select exists(select 1 from pg_stat_activity where application_name='${name}_holder' and state='idle in transaction')`) === 't');
    const pending = commands.map((c, i) => query(c, `${name}_waiter_${i}`).then(output => ({ ok: true, output }), error => ({ ok: false, error })));
    await waitFor(async () => Number(await query(`select count(*) from pg_stat_activity where application_name like '${name}_waiter_%' and wait_event_type='Lock'`)) === commands.length);
    await beforeRelease();
    holder.stdin.end('commit;\n'); await done;
    return await Promise.all(pending);
  } finally { if (!holder.stdin.writableEnded) holder.stdin.end('rollback;\n'); }
}
const bOrg = '00000000-0000-4000-8000-0000000cc201', bActor = '00000000-0000-4000-8000-0000000cc101';
const opp = await query(`select id from public.fin_opportunities where organization_id='${bOrg}' and linked_rfq_id is not null`);
const dec = await query(`select d.id from public.fin_decisions d join public.fin_opportunities o on o.linked_rfq_id=d.rfq_id where o.id='${opp}'`);
await query(`update public.fin_opportunities set status='acknowledged' where id='${opp}'`);
const complete = user(bActor, `select public.fin_complete_opportunity_negotiation('${opp}','acknowledged','${dec}',true,'Concurrent human review')`);
const completed = await contend(`select id from public.fin_opportunities where id='${opp}' for update`, [complete, complete], 'complete');
assert.ok(completed.every(r => r.ok));
const payloads = completed.map(r => JSON.parse(r.output.split('\n').find(s => s.startsWith('{'))));
assert.equal(payloads.filter(r => r.replayed).length, 1);
assert.equal(await query(`select count(*) from public.fin_events where entity_id='${opp}' and event_type='opportunity_negotiation_completed'`), '2', 'one prior completion and exactly one concurrent completion');

const pOrg = '00000000-0000-4000-8000-0000000dd202', pActor = '00000000-0000-4000-8000-0000000dd102';
const invite = await query("select id from public.fin_rfq_invites where buyer_organization_id='00000000-0000-4000-8000-0000000dd201' and status='revoked'");
const token = 'c'.repeat(64);
await query(`update public.fin_rfq_invites set status='invited',token_hash=encode(sha256(convert_to('${token}','UTF8')),'hex'),expires_at=now()+interval '1 day' where id='${invite}'`);
const decline = user(pActor, `select public.fin_decline_provider_invite('${token}','${pOrg}','invited',true,null)`);
const declined = await contend(`select id from public.fin_rfq_invites where id='${invite}' for update`, [decline, decline], 'decline');
assert.ok(declined.every(r => r.ok));
assert.equal(declined.map(r => JSON.parse(r.output.split('\n').find(s => s.startsWith('{')))).filter(r => r.replayed).length, 1);
assert.equal(await query(`select count(*) from public.fin_events where event_type='invite_declined' and metadata->>'invite_id'='${invite}'`), '1');

const raceInvite = await query("select id from public.fin_rfq_invites where buyer_organization_id='00000000-0000-4000-8000-0000000dd201' and expires_at<now()");
const raceToken = 'b'.repeat(64);
await query(`update public.fin_rfq_invites set status='invited',token_hash=encode(sha256(convert_to('${raceToken}','UTF8')),'hex'),expires_at=now()+interval '1 day' where id='${raceInvite}'`);
const raced = await contend(`select id from public.fin_rfq_invites where id='${raceInvite}' for update`, [user(pActor, `select public.fin_accept_provider_invite('${raceToken}','${pOrg}')`), user(pActor, `select public.fin_decline_provider_invite('${raceToken}','${pOrg}','invited',true,null)`)], 'accept_decline');
assert.equal(raced.filter(r => r.ok).length, 1);
assert.ok(raced.filter(r => !r.ok).every(r => /invalid invitation/.test(r.error.stderr)));
const status = await query(`select status from public.fin_rfq_invites where id='${raceInvite}'`);
assert.equal(await query(`select count(*) from public.fin_proposals where invite_id='${raceInvite}'`), status === 'accepted' ? '1' : '0');
await query(`update public.fin_rfq_invites set status='invited',expires_at=clock_timestamp()+interval '5 seconds' where id='${raceInvite}'`);
const expiresWhileWaiting = await contend(`select id from public.fin_rfq_invites where id='${raceInvite}' for update`, [user(pActor, `select public.fin_decline_provider_invite('${raceToken}','${pOrg}','invited',true,null)`)], 'expires', async () => {
  assert.equal(await query(`select exists(select 1 from pg_stat_activity a join public.fin_rfq_invites i on i.id='${raceInvite}' where a.application_name='expires_waiter_0' and a.xact_start<i.expires_at and a.wait_event_type='Lock')`), 't', 'the command transaction must start before expiry');
  await waitFor(async () => await query(`select clock_timestamp()>expires_at from public.fin_rfq_invites where id='${raceInvite}'`) === 't');
});
assert.equal(expiresWhileWaiting[0].ok, false, 'expiry is checked after lock acquisition, not at transaction start');
assert.match(expiresWhileWaiting[0].error.stderr, /invalid invitation/);
console.log('Deterministic PostgreSQL interleavings PASS: complete/complete, decline/decline, accept/decline, expiry during lock wait; no duplicate or partial writes.');
