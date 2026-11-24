// Orquestrador de recovery (scripts/recovery/orchestrate.mjs): cada falha
// para com segurança na etapa certa, nada posterior roda, nenhum segredo
// aparece em argv nem na evidência. Execução simulada (exec/prompt/docker
// injetados); o encadeamento real é coberto por test-recovery-real e pelo drill.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { STAGES, runProcedure, checkRequirements, validateSourceUrl, validateServiceKey, releaseReferences, sanitize, pgEnv, OrchestratorStop } from './recovery/orchestrate.mjs';
import { inspectRestoreEvidence } from '../lib/backup-evidence.mjs';

const REF = 'offgpyysgdhfemjlchod';
const PASSWORD = 'S3cret-' + randomBytes(6).toString('hex');
const URL_OK = `postgresql://postgres.${REF}:${PASSWORD}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const KEY_OK = 'eyJ' + jwt({ role: 'service_role', ref: REF }).slice(3);
const RECIPIENT = 'age1' + 'q'.repeat(58);
const FP = 'abcdef0123456789';
const goodProbe = { nodeVersion: 'v24.1.0', docker: true, pgMajor: { pg_dump: 17, pg_restore: 17, psql: 17 }, tools: { age: true, 'age-keygen': true, openssl: true }, memoryBytes: 8 * 1024 ** 3, freeBytes: 100 * 1024 ** 3 };

// Diretórios de teste no HOME (não em /tmp: o orquestrador recusa área temporária).
const base = fs.mkdtempSync(path.join(os.homedir(), '.arandu-orch-test-'));
process.on('exit', () => fs.rmSync(base, { recursive: true, force: true }));
let n = 0;
function world({ fail = {}, sourceEnv = 'demo', objects = 25, verifyIntegrity = 'VERIFIED', restoreSha = null } = {}) {
  const dir = path.join(base, `w${n += 1}`); fs.mkdirSync(path.join(dir, 'keys'), { recursive: true, mode: 0o700 });
  const root = path.join(dir, 'repo'); fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  const store = path.join(dir, 'store'); const identity = path.join(dir, 'keys', 'identity.age');
  const calls = []; const closed = [];
  const execFactory = () => (stage, command, args, { env = {} } = {}) => {
    calls.push({ stage, command, args, envKeys: Object.keys(env) });
    if (fail[stage]) throw new OrchestratorStop(stage, fail[stage], `Etapa ${stage} falhou`);
    if (stage === 'source') return { status: 0, stdout: JSON.stringify({ schema: 'financial-arandu-10-1', env: sourceEnv, pg: 17, objects }) };
    if (stage === 'store') { fs.mkdirSync(store, { mode: 0o700 }); return { status: 0, stdout: '' }; }
    if (stage === 'key') return { status: 0, stdout: `Destinatário público: ${RECIPIENT}\nFingerprint: ${FP}\n` };
    if (stage === 'export') { fs.mkdirSync(path.join(store, 'arandu-recovery-x'), { mode: 0o700 }); return { status: 0, stdout: '{}' }; }
    if (stage === 'verify') return { status: 0, stdout: JSON.stringify({ integrity: verifyIntegrity, level: 4, files: [{ name: 'database.dump.age', sha256: 'a'.repeat(64) }] }) };
    if (stage === 'restore-drill') { fs.writeFileSync(path.join(root, 'reports/pilot-restore-drill.json'), JSON.stringify({ result: 'PASS', completeness: 'COMPLETE' })); return { status: 0, stdout: '' }; }
    if (stage === 'release-backup' && args.includes('--file')) { fs.writeFileSync(args[args.indexOf('--file') + 1], randomBytes(4096)); return { status: 0, stdout: '' }; }
    if (stage === 'release-backup') return { status: 0, stdout: 'create table public.x();' };
    if (stage === 'release-restore') {
      const file = args.find((a) => a.startsWith('--backup-file=')).split('=')[1];
      const sha = restoreSha ?? createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      fs.writeFileSync(path.join(root, 'reports/backup-restore-verification.json'), JSON.stringify({ result: 'passed', backupSha256: sha, generatedAt: new Date().toISOString() }));
      return { status: 0, stdout: '' };
    }
    if (stage === 'release-dry-run') { fs.writeFileSync(path.join(root, 'reports/migration-release-report.json'), JSON.stringify({ bundleSha256: 'b'.repeat(64), steps: [{ name: 'canonical-order', detail: [{ file: 'docs/supabase-financial-invite-integrity.sql' }, { file: 'docs/supabase-financial-demo-pool-integrity.sql' }] }] })); }
    return { status: 0, stdout: '' };
  };
  const postgres = (_exec, { label }) => ({ url: `postgresql://supabase_admin:x@127.0.0.1:55001/postgres`, close: () => closed.push(label) });
  const answers = { url: URL_OK, key: KEY_OK };
  return { dir, root, store, identity, calls, closed, execFactory, postgres, answers,
    env: { PATH: process.env.PATH, HOME: os.homedir(), ARANDU_RECOVERY_DIRECTORY: store, ARANDU_RECOVERY_IDENTITY_FILE: identity } };
}
async function run(w, { probe = goodProbe, confirmAnswers = {}, until = 'release-gate' } = {}) {
  const asked = [];
  const ask = async (q) => { asked.push(q); return /Chave/.test(q) ? w.answers.key : w.answers.url; };
  const confirm = async (q) => {
    if (/PERSISTENTE/.test(q)) return confirmAnswers.store ?? 'PERSISTENTE';
    if (/Gerar/.test(q)) return 'SIM';
    if (/Custódia/.test(q)) return confirmAnswers.custody ?? FP.slice(-6);
    if (/EXPORTAR/.test(q)) return confirmAnswers.export ?? 'EXPORTAR';
    return '';
  };
  const result = await runProcedure({ env: w.env, root: w.root, until, probe, ask, confirm, execFactory: w.execFactory, postgres: w.postgres, log: () => {} });
  return { result, asked };
}
const stages = (w) => [...new Set(w.calls.map((c) => c.stage))];

// ------------------------------------------------------------ caminho feliz
let w = world();
let { result } = await run(w);
assert.equal(result.result, 'passed', JSON.stringify(result.blocked));
assert.deepEqual(result.stages.map((s) => s.stage), ['requirements', 'credentials', 'source', 'store', 'key', 'custody', 'doctor', 'export', 'storage-export', 'verify',
  'restore-encrypted', 'restore-drill', 'release-backup', 'release-restore', 'release-dry-run', 'evidence']);
assert.deepEqual(w.closed, ['encrypted', 'schema', 'release'], 'alvos descartáveis sempre removidos');
const allArgs = JSON.stringify(w.calls.map((c) => c.args));
assert(!allArgs.includes(PASSWORD) && !allArgs.includes(KEY_OK) && !allArgs.includes('postgresql://postgres.'), 'credencial nunca em argv');
const evidenceText = fs.readFileSync(path.join(w.root, 'reports/recovery-orchestration.json'), 'utf8');
assert(!evidenceText.includes(PASSWORD) && !evidenceText.includes(KEY_OK) && !evidenceText.includes(REF + ':'), 'evidência sanitizada');
assert.equal((fs.statSync(path.join(w.root, 'reports/recovery-orchestration.json')).mode & 0o777), 0o600);
assert(result.release_gate.apply_command.includes('ARANDU_DATABASE_URL=<entrada oculta>') && !result.release_gate.apply_command.includes(PASSWORD));
assert(result.release_gate.apply_command.includes('--after-schema=financial-arandu-10-1'));
assert.deepEqual(result.release_gate.pending, ['docs/supabase-financial-invite-integrity.sql', 'docs/supabase-financial-demo-pool-integrity.sql']);
assert(!w.calls.some((c) => c.args.includes('--apply')), 'nunca aplica migration');
assert(fs.readdirSync(w.store).some((f) => f.startsWith('orchestration-')), 'evidência também no store');
// --until=backup para depois da verificação, sem restore.
w = world(); ({ result } = await run(w, { until: 'backup' }));
assert.equal(result.result, 'passed'); assert(!stages(w).includes('restore-encrypted'));

// ------------------------------------------------------------ falhas seguras
const blocked = async (label, w, opts, stage, code) => {
  const { result } = await run(w, opts);
  assert.equal(result.result, 'blocked', label);
  assert.equal(result.blocked.stage, stage, `${label}: etapa ${result.blocked.stage}`);
  if (code) assert.equal(result.blocked.code, code, label);
  // Nenhuma etapa posterior à bloqueada chegou a executar.
  const after = [...new Set(w.calls.map((c) => c.stage))].filter((s) => STAGES.indexOf(s) > STAGES.indexOf(stage));
  return { result, after };
};
// Dependência ausente: nada é perguntado nem executado.
w = world(); let r = await blocked('dependências', w, { probe: { ...goodProbe, pgMajor: { pg_dump: 16, pg_restore: 16, psql: 16 }, tools: { age: false, 'age-keygen': false, openssl: true } } }, 'requirements', 'REQUIREMENTS_MISSING');
assert.equal(w.calls.length, 0);
// Armazenamento não persistente (/tmp e repositório).
w = world(); w.env.ARANDU_RECOVERY_DIRECTORY = '/tmp/arandu-store'; await blocked('store em /tmp', w, {}, 'requirements', 'REQUIREMENTS_MISSING');
w = world(); w.env.ARANDU_RECOVERY_DIRECTORY = path.join(w.root, 'store'); await blocked('store no repositório', w, {}, 'requirements', 'REQUIREMENTS_MISSING');
w = world(); w.env.ARANDU_RECOVERY_DIRECTORY = '/mnt/c/Users/x/store'; await blocked('store em /mnt/c', w, {}, 'requirements', 'REQUIREMENTS_MISSING');
// Credencial inválida / projeto incorreto.
w = world(); w.answers.url = URL_OK.replace(REF, 'igacnfjeuqhxcmfyepgj'); await blocked('projeto legado', w, {}, 'credentials', 'SOURCE_NOT_DEMO');
w = world(); w.answers.url = URL_OK.replace(':5432/', ':6543/'); await blocked('transaction pooler', w, {}, 'credentials', 'SOURCE_NOT_DEMO');
w = world(); w.answers.key = jwt({ role: 'anon', ref: REF }); await blocked('chave anon', w, {}, 'credentials', 'SERVICE_KEY_INVALID');
w = world(); w.answers.key = jwt({ role: 'service_role', ref: 'igacnfjeuqhxcmfyepgj' }); await blocked('chave de outro projeto', w, {}, 'credentials', 'SERVICE_KEY_INVALID');
w = world({ sourceEnv: 'production' }); await blocked('origem não Demo', w, {}, 'source', 'SOURCE_NOT_DEMO');
w = world({ fail: { source: 'STEP_FAILED' } }); await blocked('senha errada (psql falha)', w, {}, 'source');
// Store sem atestado; criptografia; custódia; autorização.
w = world(); await blocked('store sem atestado', w, { confirmAnswers: { store: 'sim' } }, 'store', 'STORE_NOT_ATTESTED');
w = world({ fail: { key: 'RECOVERY_AGE_UNAVAILABLE' } }); await blocked('falha de criptografia', w, {}, 'key', 'RECOVERY_AGE_UNAVAILABLE');
w = world(); r = await blocked('custódia não confirmada', w, { confirmAnswers: { custody: '000000' } }, 'custody', 'CUSTODY_NOT_CONFIRMED');
assert(!w.calls.some((c) => c.stage === 'export'));
w = world(); await blocked('export não autorizado', w, { confirmAnswers: { export: 'ok' } }, 'export', 'NOT_AUTHORIZED');
w = world({ fail: { doctor: 'RECOVERY_DESTINATION_PERMISSIONS' } }); await blocked('doctor bloqueia', w, {}, 'doctor');
// Falhas de export, Storage, hash, restore e evidência.
w = world({ fail: { export: 'RECOVERY_EXPORT_FAILED' } }); r = await blocked('falha de exportação', w, {}, 'export'); assert.deepEqual(r.after, []);
w = world({ fail: { 'storage-export': 'STORAGE_REFERENCES_INCONSISTENT' } }); r = await blocked('falha do Storage', w, {}, 'storage-export', 'STORAGE_REFERENCES_INCONSISTENT'); assert(!w.calls.some((c) => c.stage === 'restore-encrypted'));
w = world({ fail: { verify: 'RECOVERY_READBACK_FAILED' } }); await blocked('hash divergente no store', w, {}, 'verify', 'RECOVERY_READBACK_FAILED');
w = world({ verifyIntegrity: 'NOT_VERIFIED' }); await blocked('integridade não verificada', w, {}, 'verify', 'RECOVERY_READBACK_FAILED');
w = world({ fail: { 'restore-encrypted': 'STEP_FAILED' } }); r = await blocked('falha de restauração', w, {}, 'restore-encrypted');
assert.deepEqual(w.closed, ['encrypted'], 'contêiner removido mesmo na falha'); assert.deepEqual(r.after, []);
w = world({ fail: { 'restore-drill': 'STEP_FAILED' } }); await blocked('falha do drill (DB+Storage)', w, {}, 'restore-drill');
w = world({ restoreSha: 'f'.repeat(64) }); r = await blocked('hash divergente na evidência de restore', w, {}, 'release-restore', 'RESTORE_EVIDENCE_MISMATCH');
assert(!w.calls.some((c) => c.stage === 'release-dry-run'));
// Sem objetos no Storage: etapa de Storage registrada como pulada, não falsamente executada.
w = world({ objects: 0 }); ({ result } = await run(w)); assert.equal(result.stages.find((s) => s.stage === 'storage-export').skipped, 'no_objects');

// ------------------------------------------------------------ peças puras
assert(validateSourceUrl(URL_OK).ok);
assert(!validateSourceUrl(`postgresql://postgres:${PASSWORD}@db.${REF}.supabase.co:5432/postgres?options=-c`).ok);
assert(validateServiceKey(KEY_OK) && !validateServiceKey('x.y.z') && !validateServiceKey(''));
assert.deepEqual(Object.keys(pgEnv(URL_OK)).sort(), ['PGCONNECT_TIMEOUT', 'PGDATABASE', 'PGHOST', 'PGPASSWORD', 'PGPORT', 'PGSSLMODE', 'PGUSER']);
assert.equal(sanitize(`x ${URL_OK} y ${KEY_OK} AGE-SECRET-KEY-1ABC`, [PASSWORD]).includes(PASSWORD), false);
const refs = releaseReferences({ sha256: 'c'.repeat(64), at: new Date('2026-11-24T19:00:00Z') });
assert.match(refs.backupReference, /^demo-public-backup-20261124T190000Z-sha256-c{16}$/);
assert.throws(() => releaseReferences({ sha256: 'nope' }));
assert(!checkRequirements({ env: { ARANDU_RECOVERY_DIRECTORY: '/home/x/s', ARANDU_RECOVERY_IDENTITY_FILE: '/home/x/s/id.age', CI: 'true' }, probe: goodProbe }).ok, 'identidade dentro do store e CI recusados');
// Evidência vencida: o gate canônico recusa (o orquestrador não ajusta tempos).
const evidence = { classification: 'restore_verification', environment: 'disposable_restore', backupScope: 'public_schema', result: 'passed',
  generatedAt: new Date(Date.now() - 7 * 3600000).toISOString(), backupReference: refs.backupReference, restoreReference: refs.restoreReference, backupSha256: 'c'.repeat(64),
  checks: ['backup-artifact', 'backup-readable', 'restore-executed', 'schema-fingerprint', 'post-restore-probes'].map((name) => ({ name, ok: true })) };
assert.equal(inspectRestoreEvidence({ report: evidence, backupReference: refs.backupReference, restoreReference: refs.restoreReference, backupSha256: 'c'.repeat(64), maxAgeHours: 6 }).ok, false);
assert.equal(inspectRestoreEvidence({ report: { ...evidence, generatedAt: new Date().toISOString() }, backupReference: refs.backupReference, restoreReference: refs.restoreReference, backupSha256: 'c'.repeat(64), maxAgeHours: 6 }).ok, true,
  'referências derivadas do hash são aceitas pelo gate de release');
// Credencial por argumento é recusada antes de qualquer coisa.
const cli = spawnSync(process.execPath, ['scripts/recovery/orchestrate.mjs', 'run', URL_OK], { encoding: 'utf8' });
assert.equal(cli.status, 2); assert(!cli.stderr.includes(PASSWORD));
console.log('Recovery orchestrator: caminho feliz, 24 falhas seguras (dependência, store não persistente, credencial, projeto, cripto, custódia, export, Storage, hash, restore, evidência vencida), sanitização e compatibilidade com o gate de release aprovados (simulado).');
