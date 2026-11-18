// Guard transacional do executor de migrations contra PostgreSQL real e
// descartável: concorrência, falha no meio, marcador divergente e histórico.
// Uso: node tests/database/release-migration-guard.mjs <url-do-servidor-descartável>
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { guardPrefix, selectPendingSections, assertSingleTransaction, finalMarker } from '../../lib/release-migration-guard.mjs';
import { readFileSync } from 'node:fs';

const base = process.argv[2];
if (!base) throw new Error('Informe a URL do PostgreSQL descartável.');
const host = new URL(base).hostname;
if (!['localhost', '127.0.0.1', 'postgres', '::1'].includes(host)) throw new Error('Somente PostgreSQL local/descartável.');
const dbName = 'arandu_release_guard_test';
const admin = (sql) => psql(base, ['-c', sql]);
const url = Object.assign(new URL(base), { pathname: '/' + dbName }).toString();

function psql(target, args, input) {
  const result = spawnSync('psql', [target, '-XAt', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', input });
  return { ok: result.status === 0, out: String(result.stdout).trim(), err: String(result.stderr) };
}
function apply(expectedBefore, body) {
  return psql(url, ['-1'], `${guardPrefix(expectedBefore)}\n${body}\n`);
}
const marker = () => psql(url, ['-c', "select value from public.fin_settings where key='schema_version'"]).out;
const tableExists = (name) => psql(url, ['-c', `select to_regclass('public.${name}') is not null`]).out === 't';
const migration = (target, extra = '') => `begin;\ncreate table public.guard_probe_${target.replace(/-/g, '_')}(id int);\n${extra}\n`
  + `insert into public.fin_settings(key,value) values('schema_version','${target}') on conflict(key) do update set value=excluded.value;\ncommit;`;

admin(`drop database if exists ${dbName}`);
assert.ok(admin(`create database ${dbName}`).ok);
try {
  assert.ok(psql(url, ['-c', "create table public.fin_settings(key text primary key, value text not null); insert into public.fin_settings values('schema_version','financial-a-1');"]).ok);

  // Divergência: marcador real diferente do esperado => nada aplicado.
  let result = apply('financial-other-1', migration('financial-b-1'));
  assert.equal(result.ok, false);
  assert.match(result.err, /arandu-release-guard/);
  assert.equal(marker(), 'financial-a-1');
  assert.equal(tableExists('guard_probe_financial_b_1'), false);

  // Falha SQL no meio do arquivo (BEGIN/COMMIT próprios dentro de psql -1) => rollback integral.
  result = apply('financial-a-1', migration('financial-b-1', 'select 1/0;'));
  assert.equal(result.ok, false);
  assert.equal(marker(), 'financial-a-1');
  assert.equal(tableExists('guard_probe_financial_b_1'), false, 'aplicação parcial após falha intermediária');

  // Concorrência: duas execuções simultâneas a partir do mesmo marcador;
  // exatamente uma aplica, a outra espera o lock e falha no guard.
  const body = migration('financial-b-1', 'select pg_sleep(1.5);');
  const runOne = () => new Promise((resolve) => {
    const child = spawn('psql', [url, '-XAt', '-v', 'ON_ERROR_STOP=1', '-1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => resolve({ code, err }));
    child.stdin.end(`${guardPrefix('financial-a-1')}\n${body}\n`);
  });
  const outcomes = await Promise.all([runOne(), runOne()]);
  assert.equal(outcomes.filter((o) => o.code === 0).length, 1, JSON.stringify(outcomes));
  assert.match(outcomes.find((o) => o.code !== 0).err, /arandu-release-guard|already exists/);
  assert.equal(marker(), 'financial-b-1');

  // Reexecução após sucesso é bloqueada pelo guard (marcador já atualizado).
  result = apply('financial-a-1', migration('financial-b-1'));
  assert.equal(result.ok, false);
  assert.match(result.err, /arandu-release-guard/);

  // Seleção real do manifesto: somente o sufixo após o marcador observado da Demo.
  const manifest = JSON.parse(readFileSync('docs/supabase-migrations.json', 'utf8')).existingDatabase;
  const sections = manifest.map((file) => ({ file, content: readFileSync(file, 'utf8') }));
  const pending = selectPendingSections(sections, 'financial-contract-email-links-1');
  assert.deepEqual(pending.map((s) => s.file), ['docs/supabase-financial-arandu-10.sql']);
  assert.equal(pending[0].expectedAfter, 'financial-arandu-10-1');
  assert.equal(finalMarker(pending[0].content), 'financial-arandu-10-1');
  assert.doesNotThrow(() => assertSingleTransaction(pending[0].content, pending[0].file));
  assert.throws(() => assertSingleTransaction('begin;\nselect 1;\ncommit;\ndrop table x;', 'x'), /após COMMIT/);
  assert.throws(() => assertSingleTransaction('begin;\ncommit;\nbegin;\ncommit;', 'x'), /ambíguo/);
  assert.throws(() => assertSingleTransaction('create index concurrently i on t(a);', 'x'), /não transacional/);
  assert.throws(() => selectPendingSections(sections, 'financial-arandu-10-1'), /Nenhuma migration pendente/);
  assert.throws(() => selectPendingSections(sections, 'financial-unknown-9'), /desconhecido/);
  console.log('Release migration guard: lock, marcador real, rollback integral e seleção pendente aprovados em PostgreSQL real.');
} finally {
  admin(`drop database if exists ${dbName} with (force)`);
}
