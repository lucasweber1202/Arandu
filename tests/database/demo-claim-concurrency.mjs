// Independent SQL sessions wait behind an observed advisory lock barrier.
// No sleep/retry is accepted as evidence of overlap; no HTTP quota is changed.
import assert from 'node:assert/strict';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

const db = process.argv[2];
if (!db) throw new Error('Disposable database URL required');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(db).hostname)) throw new Error('Loopback disposable database required');
const tag = `codex-claim-${randomUUID().slice(0, 8)}`;
const prefix = randomUUID().replaceAll('-', '').slice(0, 8);
const sql = query => execFileSync('psql', [db, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8', timeout: 15000 }).trim();
const children = new Set();
function controller() {
  const child = spawn('psql', [db, '-XAtq', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child);
  let pending, lines = [], errorText = '';
  const reject = error => { if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; } };
  child.stderr.on('data', chunk => { errorText += chunk; });
  createInterface({ input: child.stdout }).on('line', line => {
    if (pending && line === pending.marker) { const p = pending; pending = null; clearTimeout(p.timer); p.resolve(lines); lines = []; }
    else lines.push(line);
  });
  child.on('error', reject); child.stdin.on('error', reject);
  const closed = new Promise(resolve => child.on('exit', code => { children.delete(child); reject(new Error(`controller failed ${code}: ${errorText}`)); resolve(code); }));
  return { query(query) { return new Promise((resolve, reject) => {
    assert.equal(pending == null, true);
    const marker = randomUUID();
    const timer = setTimeout(() => { pending?.reject(new Error('controller deadline')); pending = null; child.kill(); }, 15000);
    pending = { marker, timer, resolve, reject }; child.stdin.write(`${query}\nselect '${marker}';\n`);
  }); }, async close() { child.stdin.end('rollback;\n'); assert.equal(await closed, 0, 'controller teardown'); } };
}
async function race(total, ceiling) {
  const barrier = controller();
  const runs = [];
  try {
    await barrier.query("begin; select pg_advisory_xact_lock(hashtext('fin_demo_workspace_claim'));");
    for (let i = 0; i < total; i++) {
      const token = (i + 1).toString(16).padStart(64, '0');
      const operation = promisify(execFile)('psql', [db, '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c',
        `select coalesce(json_agg(json_build_object('id',id,'hash',claim_token_hash)),'[]') from public.fin_demo_workspace_claim('${token}',240,1440,${ceiling})`],
      { env: { ...process.env, PGAPPNAME: `${tag}-${i}` }, timeout: 20000 });
      children.add(operation.child);
      // Attach immediately so a failed worker cannot become an unhandled rejection.
      runs.push(operation.then(result => ({ result }), error => ({ error })).finally(() => children.delete(operation.child)));
    }
    const until = Date.now() + 12000;
    let waiting = 0;
    while (Date.now() < until) {
      waiting = Number(sql(`select count(*) from pg_stat_activity where application_name like '${tag}-%' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0`));
      if (waiting === total) break;
    }
    assert.equal(waiting, total, 'all independent sessions must be observed waiting before releasing the barrier');
    await barrier.query('commit;');
    const outcomes = await Promise.all(runs);
    for (const outcome of outcomes) if (outcome.error) throw outcome.error;
    const assigned = outcomes.flatMap(outcome => JSON.parse(outcome.result.stdout.trim()));
    assert.equal(assigned.length, Math.min(total, ceiling));
    assert.equal(new Set(assigned.map(row => row.id)).size, assigned.length, 'workspace delivered twice');
    assert.equal(new Set(assigned.map(row => row.hash)).size, assigned.length, 'claim token overwritten');
    assert.equal(Number(sql(`select count(*) from public.fin_demo_workspaces where slug like '${prefix}%' and status='claimed'`)), assigned.length);
    return { sessions: total, ceiling, delivered: assigned.length, blocked_observed: waiting };
  } finally {
    await barrier.close();
    const finished = await Promise.all(runs);
    for (const outcome of finished) if (outcome.error) throw outcome.error;
  }
}

const oldMarker = sql("select coalesce((select value from public.fin_settings where key='deployment_environment'),'')");
try {
  assert.equal(sql("select count(*) from public.fin_demo_workspaces where status in ('ready','claimed')"), '0', 'requires a disposable idle pool');
  sql("insert into public.fin_settings(key,value) values('deployment_environment','demo') on conflict(key) do update set value='demo'");
  const results = [];
  for (const [sessions, ceiling] of [[2, 25], [10, 25], [10, 4]]) {
    sql(`insert into public.fin_demo_workspaces(slug,baseline_version,status,ready_at) select '${prefix}'||lpad(to_hex(n),2,'0'),'vitta-2026-10','ready',now() from generate_series(1,12) n`);
    results.push(await race(sessions, ceiling));
    sql(`delete from public.fin_demo_workspaces where slug like '${prefix}%'`);
  }
  console.log(JSON.stringify({ check: 'demo_claim_concurrency', outcome: 'LOCAL_VALIDATED', results, hosted: 'NOT_RUN' }));
} finally {
  for (const child of children) child.kill('SIGTERM');
  sql(`delete from public.fin_demo_workspaces where slug like '${prefix}%'`);
  if (oldMarker) sql(`update public.fin_settings set value='${oldMarker.replaceAll("'", "''")}' where key='deployment_environment'`);
  else sql("delete from public.fin_settings where key='deployment_environment'");
  assert.equal(sql(`select count(*) from public.fin_demo_workspaces where slug like '${prefix}%'`), '0', 'fixture teardown');
}
