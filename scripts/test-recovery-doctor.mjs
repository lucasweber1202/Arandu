// Preflight e store privado sem banco nem rede: ferramentas simuladas, diretórios
// descartáveis sob HOME (tmp é recusado de propósito como não durável).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diagnoseRecovery, formatDiagnosis, assertPrivateStore, assertIdentityFile, STORE_MARKER } from '../lib/recovery-doctor.mjs';
import { initStore, prepareKey } from './recovery.mjs';

const REF = 'offgpyysgdhfemjlchod';
const SECRET = 'S3cr3t-Value-Never-Printed';
const URL_OK = `postgresql://postgres:${SECRET}@db.${REF}.supabase.co:5432/postgres?sslmode=require`;
const RECIPIENT = `age1${'q'.repeat(58)}`;
const tools = (overrides = {}) => (binary, args) => {
  const v = { psql: 'psql (PostgreSQL) 17.11', pg_dump: 'pg_dump (PostgreSQL) 17.11', pg_dumpall: 'pg_dumpall (PostgreSQL) 17.11', pg_restore: 'pg_restore (PostgreSQL) 17.11', age: 'v1.3.2', ...overrides };
  if (binary === 'age' && args[0] === '--encrypt') return { status: args[2] === RECIPIENT ? 0 : 1, stdout: '' };
  return v[binary] === null ? { status: 127, stdout: '' } : { status: 0, stdout: v[binary] };
};
const base = fs.mkdtempSync(path.join(os.homedir(), '.arandu-recovery-doctor-'));
fs.chmodSync(base, 0o700);
const env = (extra = {}) => ({ PATH: process.env.PATH, ...extra });

try {
  // 1. Reprodução da execução #38179837512: só o ref; conexão, destinatário e destino vazios.
  const original = diagnoseRecovery({ strategy: 's3', requireConfirmation: true, run: tools(),
    env: env({ ARANDU_RECOVERY_PROJECT_REF: REF, ARANDU_RECOVERY_DATABASE_URL: '', ARANDU_RECOVERY_RECIPIENT: '', ARANDU_RECOVERY_DESTINATION: '', ARANDU_RECOVERY_CONFIRM: 'ARANDU-ENCRYPTED-EXPORT' }) });
  assert.equal(original.result, 'BLOCKED');
  assert.equal(original.code, 'RECOVERY_DATABASE_URL_MISSING');
  assert.deepEqual(original.codes, ['RECOVERY_DATABASE_URL_MISSING', 'RECOVERY_RECIPIENT_MISSING', 'RECOVERY_DESTINATION_MISSING']);
  assert.equal(original.database_accessed, 'NO');
  assert.match(formatDiagnosis(original), /Database credentials:\s+NOT CONFIGURED/);

  // 2. Nada sensível aparece no relatório, mesmo com valores inválidos.
  const leaky = diagnoseRecovery({ strategy: 's3', run: tools(), env: env({ ARANDU_RECOVERY_PROJECT_REF: REF,
    ARANDU_RECOVERY_DATABASE_URL: `postgresql://postgres:${SECRET}@db.otherprojectxxxxxxxx.supabase.co:5432/postgres`,
    ARANDU_RECOVERY_RECIPIENT: `age1${SECRET}`, ARANDU_RECOVERY_DESTINATION: `{"x":"${SECRET}"}` }) });
  const printed = JSON.stringify(leaky) + formatDiagnosis(leaky);
  assert(!printed.includes(SECRET), 'preflight vazou valor sensível');
  assert.deepEqual(leaky.codes, ['RECOVERY_SOURCE_IDENTITY_INVALID', 'RECOVERY_RECIPIENT_INVALID', 'RECOVERY_DESTINATION_INVALID']);

  // 3. Ferramentas: PG errado e age ausente têm códigos próprios.
  const wrongTools = diagnoseRecovery({ strategy: 's3', run: tools({ pg_dump: 'pg_dump (PostgreSQL) 16.4', age: null }), env: env({ ARANDU_RECOVERY_PROJECT_REF: REF }) });
  assert(wrongTools.codes.includes('RECOVERY_PG_VERSION_INVALID'));
  assert(wrongTools.codes.includes('RECOVERY_AGE_UNAVAILABLE'));
  assert.equal(diagnoseRecovery({ strategy: 'ftp', run: tools(), env: env() }).codes[0], 'RECOVERY_STRATEGY_INVALID');

  // 4. Store privado: ausente, efêmero, no repo, permissões, symlink, sem marcador, runner hospedado.
  const storeDir = path.join(base, 'store');
  const code = (fn, expected) => assert.throws(fn, (e) => e.code === expected, expected);
  code(() => assertPrivateStore('', { env: env() }), 'RECOVERY_DESTINATION_MISSING');
  code(() => assertPrivateStore(storeDir, { env: env() }), 'RECOVERY_DESTINATION_MISSING');
  code(() => assertPrivateStore('relative/store', { env: env() }), 'RECOVERY_DESTINATION_INVALID');
  code(() => initStore({ env: env({ ARANDU_RECOVERY_DIRECTORY: storeDir }), args: [] }), 'RECOVERY_STORAGE_NOT_DURABLE');
  const tmpStore = fs.mkdtempSync(path.join(os.tmpdir(), 'arandu-ephemeral-'));
  code(() => initStore({ env: env({ ARANDU_RECOVERY_DIRECTORY: path.join(tmpStore, 's') }), args: ['--attest-persistent'] }), 'RECOVERY_STORAGE_NOT_DURABLE');
  fs.rmSync(tmpStore, { recursive: true, force: true });
  code(() => initStore({ env: env({ ARANDU_RECOVERY_DIRECTORY: path.join(process.cwd(), 'recovery-store') }), args: ['--attest-persistent'] }), 'RECOVERY_DESTINATION_INVALID');
  assert(!fs.existsSync(path.join(process.cwd(), 'recovery-store')));
  code(() => initStore({ env: env({ ARANDU_RECOVERY_DIRECTORY: storeDir, RUNNER_ENVIRONMENT: 'github-hosted' }), args: ['--attest-persistent'] }), 'RECOVERY_STORAGE_NOT_DURABLE');
  code(() => initStore({ env: env({ ARANDU_RECOVERY_DIRECTORY: storeDir }), args: ['--attest-persistent', '--retention-days=7'] }), 'RECOVERY_DESTINATION_INVALID');
  fs.mkdirSync(storeDir, { mode: 0o700 });
  code(() => assertPrivateStore(storeDir, { env: env() }), 'RECOVERY_STORE_NOT_INITIALIZED');
  const store = initStore({ env: env({ ARANDU_RECOVERY_DIRECTORY: storeDir }), args: ['--attest-persistent', '--retention-days=400'] });
  assert.equal(store.retention_days, 400);
  assert.equal(fs.statSync(path.join(storeDir, STORE_MARKER)).mode & 0o777, 0o600);
  code(() => initStore({ env: env({ ARANDU_RECOVERY_DIRECTORY: storeDir }), args: ['--attest-persistent'] }), 'RECOVERY_DESTINATION_INVALID');
  assert.equal(assertPrivateStore(storeDir, { env: env() }).marker.store_id, store.store_id, 'marcador sobrescrito');
  code(() => assertPrivateStore(storeDir, { env: env({ RUNNER_ENVIRONMENT: 'github-hosted' }) }), 'RECOVERY_STORAGE_NOT_DURABLE');
  fs.chmodSync(storeDir, 0o755);
  code(() => assertPrivateStore(storeDir, { env: env() }), 'RECOVERY_DESTINATION_PERMISSIONS');
  fs.chmodSync(storeDir, 0o700);
  const link = path.join(base, 'link');
  fs.symlinkSync(storeDir, link);
  code(() => assertPrivateStore(link, { env: env() }), 'RECOVERY_DESTINATION_INVALID');
  const marker = JSON.parse(fs.readFileSync(path.join(storeDir, STORE_MARKER), 'utf8'));
  fs.writeFileSync(path.join(storeDir, STORE_MARKER), JSON.stringify({ ...marker, retention_days: 1 }));
  code(() => assertPrivateStore(storeDir, { env: env() }), 'RECOVERY_STORE_NOT_INITIALIZED');
  fs.writeFileSync(path.join(storeDir, STORE_MARKER), JSON.stringify(marker));

  // 5. Preflight private-store READY com store válido e ferramentas certas.
  const ready = diagnoseRecovery({ strategy: 'private-store', requireConfirmation: true, run: tools(), env: env({
    ARANDU_RECOVERY_PROJECT_REF: REF, ARANDU_RECOVERY_DATABASE_URL: URL_OK, ARANDU_RECOVERY_RECIPIENT: RECIPIENT,
    ARANDU_RECOVERY_DIRECTORY: storeDir, ARANDU_RECOVERY_CONFIRM: 'ARANDU-ENCRYPTED-EXPORT' }) });
  assert.equal(ready.result, 'READY', JSON.stringify(ready.codes));
  assert.equal(ready.store.id, store.store_id);
  assert(!JSON.stringify(ready).includes(SECRET) && !JSON.stringify(ready).includes(storeDir), 'relatório com valor ou caminho privado');

  // 6. Identidade: fora do repo, fora do store, 0600; nunca preparada em CI.
  const keyDir = path.join(base, 'keys');
  fs.mkdirSync(keyDir, { mode: 0o700 });
  const identity = path.join(keyDir, 'arandu-recovery.agekey');
  code(() => assertIdentityFile(identity), 'RECOVERY_IDENTITY_MISSING');
  code(() => prepareKey({ env: env({ CI: 'true', ARANDU_RECOVERY_IDENTITY_FILE: identity }), args: ['--generate'] }), 'RECOVERY_IDENTITY_INVALID');
  code(() => prepareKey({ env: env({ GITHUB_ACTIONS: 'true', ARANDU_RECOVERY_IDENTITY_FILE: identity }), args: ['--generate'] }), 'RECOVERY_IDENTITY_INVALID');
  code(() => prepareKey({ env: env({ ARANDU_RECOVERY_IDENTITY_FILE: identity }), args: [] }), 'RECOVERY_IDENTITY_MISSING');
  code(() => prepareKey({ env: env({ ARANDU_RECOVERY_IDENTITY_FILE: path.join(storeDir, 'key'), ARANDU_RECOVERY_DIRECTORY: storeDir }), args: ['--generate'] }), 'RECOVERY_IDENTITY_INVALID');
  assert(!fs.existsSync(path.join(storeDir, 'key')), 'identidade criada dentro do store');
  fs.writeFileSync(identity, 'AGE-SECRET-KEY-PLACEHOLDER\n', { mode: 0o644 });
  code(() => assertIdentityFile(identity), 'RECOVERY_IDENTITY_INVALID');
  fs.chmodSync(identity, 0o600);
  assert.equal(assertIdentityFile(identity), fs.realpathSync(identity));
  code(() => assertIdentityFile(path.join(storeDir, STORE_MARKER), { store: storeDir }), 'RECOVERY_IDENTITY_INVALID');
  // 7. Workflow: preflight de configuração antes de cada export, sem segredo em argv.
  const workflow = fs.readFileSync('.github/workflows/consolidation-export.yml', 'utf8');
  for (const [preflight, exporter] of [['recovery.mjs doctor --strategy=private-store --export', 'recovery.mjs export'], ['recovery.mjs doctor --strategy=s3 --export', 'consolidation-hosted-export.mjs']]) {
    assert(workflow.includes(preflight) && workflow.indexOf(preflight) < workflow.indexOf(exporter), `preflight antes de ${exporter}`);
  }
  assert(!/set -x|echo .*secrets\.|run:.*secrets\./.test(workflow), 'segredo exposto no workflow');
  console.log('Recovery doctor: original #38179837512 classification, sanitized codes, private store durability/permissions/symlink/marker and age identity custody validated.');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
