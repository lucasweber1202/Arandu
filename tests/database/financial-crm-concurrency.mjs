import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
const run = promisify(execFile), url = process.argv[2];
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname), 'disposable loopback only');
const id = n => `00000000-0000-4000-8000-000000c1${String(n).padStart(4, '0')}`;
const query = async (sql, name = 'crm_probe') => (await run('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env: { ...process.env, PGAPPNAME: name }, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
const user = (actor, sql) => `begin;set local statement_timeout='15s';set local role authenticated;select set_config('request.jwt.claim.sub','${actor}',true);${sql};commit;`;
const fixture = (await readFile('tests/database/financial-crm.sql', 'utf8')).replace(/^\\.*$/gm, '').replace(/rollback;\s*$/, 'commit;');
await query(fixture);
const contact = await query(`select id from public.fin_provider_contacts where organization_id='${id(100)}' and name='Nome atualizado'`);
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const command = (actor, request, values, target = null, version = null) => user(actor, `select public.fin_crm_command('${id(100)}','contact',${target ? `'${target}'` : 'null'},${version ?? 'null'},'${request}',${target ? "'{}'::jsonb" : literal({ legal_entity_id: id(300), provider_id: id(200) })},${literal(values)})`);
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error('expected lock interleaving absent');
}
async function contend(name, lockSql, commands, beforeCommit = '') {
  const holder = spawn('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGAPPNAME: `${name}_holder` } });
  holder.stdout.resume(); let error = '';
  holder.stderr.on('data', value => { error += value; });
  const done = new Promise((resolve, reject) => { holder.on('error', reject); holder.on('close', code => code === 0 ? resolve() : reject(new Error(error))); });
  holder.stdin.write(`begin;set local statement_timeout='15s';${lockSql};\n`);
  try {
    await waitFor(async () => Number(await query(`select count(*) from pg_stat_activity where application_name='${name}_holder' and state='idle in transaction'`)) === 1);
    const pending = commands.map((sql, index) => query(sql, `${name}_writer_${index}`).then(stdout => ({ ok: true, stdout }), failure => ({ ok: false, error: failure.stderr || failure.message })));
    await waitFor(async () => Number(await query(`select count(*) from pg_stat_activity where application_name like '${name}_writer_%' and wait_event_type='Lock'`)) === commands.length);
    holder.stdin.end(`${beforeCommit};commit;\n`); await done;
    return await Promise.all(pending);
  } catch (failure) { holder.stdin.end('rollback;\n'); await done.catch(() => {}); throw failure; }
}

const edits = await contend('crm_edits', `select 1 from public.fin_provider_contacts where id='${contact}' for update`, ['A', 'B'].map((name, index) => command(id(1), id(900 + index), { name: `Concurrent ${name}`, owner_id: id(1) }, contact, 3)));
assert.equal(edits.filter(result => result.ok).length, 1);
assert.match(edits.find(result => !result.ok).error, /crm version conflict/);
assert.equal(await query(`select version from public.fin_provider_contacts where id='${contact}'`), '4');

const intent = id(910), values = { name: 'Concurrent CRM creation', source_reference: 'Synthetic concurrent fixture' };
const creates = await contend('crm_creates', `select pg_advisory_xact_lock(hashtextextended('${id(100)}${id(1)}${intent}',0))`, Array.from({ length: 8 }, () => command(id(1), intent, values)));
assert(creates.every(result => result.ok));
assert.equal(await query(`select count(*) from public.fin_provider_contacts where organization_id='${id(100)}' and name='Concurrent CRM creation'`), '1');
assert.equal(await query(`select count(*) from public.fin_events where organization_id='${id(100)}' and metadata->>'request_key'='${intent}'`), '1');

const revokedIntent = id(920);
const revocation = await contend('crm_revocation', `select 1 from public.fin_members where organization_id='${id(100)}' and user_id='${id(2)}' for update`, [command(id(2), revokedIntent, { name: 'Revoked concurrent write', source_reference: 'Synthetic fixture' })], `delete from public.fin_members where organization_id='${id(100)}' and user_id='${id(2)}'`);
assert.equal(revocation[0].ok, false); assert.match(revocation[0].error, /forbidden/);
assert.equal(await query(`select count(*) from public.fin_events where metadata->>'request_key'='${revokedIntent}'`), '0');
console.log('CRM concurrency: expected-version race, eight identical creates and membership revocation during lock wait PASS (independent PostgreSQL sessions).');
