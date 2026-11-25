// Política de recuperação proporcional da Demo (lib/demo-recovery-policy.mjs) e
// guardas do release remoto: puro + CLI sem rede + workflow estático.
// A prova com banco real é scripts/test-demo-remote-release-real.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PATHS, recoveryPath, classifyData, nonRegenerableState, decideDemoRelease, reconstructionEligibility } from '../lib/demo-recovery-policy.mjs';
import { DEMO_REF, LEGACY_REF } from '../lib/release-migration-guard.mjs';

// ------------------------------------------------ Production nunca cai no caminho proporcional
for (const declaredEnvironment of ['production', 'staging', 'pilot', '', undefined, 'DEMO', 'demo ']) {
  for (const connectionRef of [DEMO_REF, LEGACY_REF, null]) {
    for (const databaseEnvironment of ['demo', 'production', null]) {
      const p = recoveryPath({ declaredEnvironment, connectionRef, databaseEnvironment });
      assert.equal(p, PATHS.full, `${declaredEnvironment}/${connectionRef}/${databaseEnvironment}`);
    }
  }
}
assert.equal(recoveryPath({ declaredEnvironment: 'demo', connectionRef: LEGACY_REF, databaseEnvironment: 'demo' }), PATHS.full, 'ref de Production com rótulo demo');
assert.equal(recoveryPath({ declaredEnvironment: 'demo', connectionRef: DEMO_REF, databaseEnvironment: 'production' }), PATHS.full, 'banco que se diz production');
assert.equal(recoveryPath({ declaredEnvironment: 'demo', connectionRef: DEMO_REF, databaseEnvironment: 'demo' }), PATHS.demo);
// Nenhum parâmetro extra força o caminho (não existe flag de bypass).
assert.equal(recoveryPath({ declaredEnvironment: 'production', connectionRef: LEGACY_REF, databaseEnvironment: 'production', force: true, skipBackup: true }), PATHS.full);

// ------------------------------------------------ classificação
const inv = (over = {}) => ({ deployment_environment: 'demo', schema_version: 'financial-arandu-10-1', postgres_major: 17,
  users: { total: 30, fictitious: 30, workspace_accounts: 20, unclassified: 0 }, auth: { non_email_identities: 0, mfa_factors: 0, sso_providers: 0 },
  organizations: { total: 12, fictitious: 12, unclassified: 0 }, workspaces: { by_status: {}, claimed_valid: 0, claimed_valid_next_expiry: null, provisioning: 0 },
  visitor_state: { organizations: 0, events_after_claim: 0 }, storage: { objects: 25, buckets: 1, public_buckets: 0, objects_outside_fictitious_orgs: 0 }, ...over });
assert.equal(classifyData(inv()).fictitious, true);
const code = (i) => classifyData(i).problems.map(([c]) => c);
assert(code(inv({ users: { total: 31, fictitious: 30, workspace_accounts: 20, unclassified: 1 } })).includes('DATA_UNCLASSIFIED_USERS'));
assert(code(inv({ organizations: { total: 12, fictitious: 11, unclassified: 1 } })).includes('DATA_UNCLASSIFIED_ORGANIZATIONS'));
assert(code(inv({ auth: { non_email_identities: 1, mfa_factors: 0, sso_providers: 0 } })).includes('AUTH_STATE_NOT_REGENERABLE'));
assert(code(inv({ auth: { non_email_identities: 0, mfa_factors: 2, sso_providers: 0 } })).includes('AUTH_STATE_NOT_REGENERABLE'));
assert(code(inv({ storage: { objects: 25, buckets: 1, public_buckets: 0, objects_outside_fictitious_orgs: 3 } })).includes('STORAGE_UNCLASSIFIED'));
assert(code(inv({ storage: { objects: 25, buckets: 1, public_buckets: 1, objects_outside_fictitious_orgs: 0 } })).includes('STORAGE_PUBLIC_BUCKET'));
assert(code(inv({ users: undefined })).includes('DATA_INVENTORY_INVALID'), 'inventário incompleto bloqueia');
assert(code(inv({ users: { total: -1, fictitious: 0, unclassified: 0 } })).includes('DATA_INVENTORY_INVALID'));
assert.deepEqual(nonRegenerableState(inv()), { known: true, present: false, claimed_valid: 0, next_expiry: null });
assert.equal(nonRegenerableState(inv({ workspaces: { claimed_valid: 2, provisioning: 0, claimed_valid_next_expiry: '2026-11-25T00:00:00Z' } })).present, true);
assert.equal(nonRegenerableState(inv({ visitor_state: undefined })).known, false);

// ------------------------------------------------ decisão
const now = Date.parse('2026-11-24T20:00:00Z');
const evidence = { result: 'passed', generated_at: '2026-11-24T19:00:00Z', source_ref: DEMO_REF, source_schema: 'financial-arandu-10-1', snapshot_sha256: 'a'.repeat(64),
  restore: { backup_sha256: 'a'.repeat(64) }, checks: { restore: 'PASS', migrations_applied: 'PASS', post_migration_probes: 'PASS', rollback: 'PASS', reapply: 'PASS', isolation_canary: 'PASS' } };
const ok = { declaredEnvironment: 'demo', connectionRef: DEMO_REF, inventory: inv(), evidence, lock: { held: true, holder_matches: true }, authorization: 'issue-366-comment-0001', now };
assert.deepEqual(decideDemoRelease(ok).nogo, []);
assert.equal(decideDemoRelease(ok).go, true);
const codes = (over) => decideDemoRelease({ ...ok, ...over }).nogo.map((n) => n.code);
assert.deepEqual(codes({ declaredEnvironment: 'production' }), ['FULL_RECOVERY_REQUIRED']);
assert.deepEqual(codes({ connectionRef: LEGACY_REF }), ['FULL_RECOVERY_REQUIRED']);
assert.deepEqual(codes({ inventory: inv({ deployment_environment: 'production' }) }), ['FULL_RECOVERY_REQUIRED']);
assert(codes({ inventory: inv({ postgres_major: 15 }) }).includes('SOURCE_MAJOR_MISMATCH'));
assert(codes({ inventory: inv({ workspaces: { claimed_valid: 0, provisioning: 1 } }) }).includes('POOL_PROVISIONING_ACTIVE'));
assert(codes({ evidence: undefined }).includes('REHEARSAL_MISSING'));
assert(codes({ evidence: { ...evidence, generated_at: '2026-11-24T13:00:00Z' } }).includes('EVIDENCE_STALE'));
assert(codes({ evidence: { ...evidence, generated_at: '2026-11-24T21:00:00Z' } }).includes('EVIDENCE_STALE'), 'evidência do futuro');
assert(codes({ evidence: { ...evidence, source_ref: LEGACY_REF } }).includes('EVIDENCE_SOURCE_MISMATCH'));
assert(codes({ evidence: { ...evidence, restore: { backup_sha256: 'b'.repeat(64) } } }).includes('EVIDENCE_HASH_MISMATCH'));
assert(codes({ evidence: { ...evidence, checks: { ...evidence.checks, isolation_canary: undefined } } }).includes('REHEARSAL_INCOMPLETE'));
assert(codes({ lock: { held: true, holder_matches: false } }).includes('LOCK_NOT_HELD'));
assert(codes({ lock: undefined }).includes('LOCK_NOT_HELD'));
for (const authorization of [undefined, '', 'ok', 'sim', 'postgres://x', 'eyJabc.def.ghi', 'owner@example.com']) assert(codes({ authorization }).includes('AUTHORIZATION_MISSING'), String(authorization));
const live = inv({ workspaces: { claimed_valid: 1, provisioning: 0, claimed_valid_next_expiry: '2026-11-25T00:00:00Z' }, visitor_state: { organizations: 1, events_after_claim: 3 } });
assert.deepEqual(codes({ inventory: live }), ['PRESERVATION_DESTINATION_MISSING']);
const pres = { destination_approved: true, plaintext_sha256: 'a'.repeat(64), ciphertext_sha256: 'c'.repeat(64), uploaded_sha256: 'c'.repeat(64) };
assert.deepEqual(codes({ inventory: live, preservation: pres }), []);
assert(codes({ inventory: live, preservation: { ...pres, uploaded_sha256: 'd'.repeat(64) } }).includes('PRESERVATION_TRANSFER_UNVERIFIED'));
assert(codes({ inventory: live, preservation: { ...pres, plaintext_sha256: 'e'.repeat(64) } }).includes('PRESERVATION_SNAPSHOT_MISMATCH'));
assert(codes({ inventory: inv({ visitor_state: undefined }) }).includes('STATE_UNKNOWN'));

// ------------------------------------------------ reconstrução: alternativa, não equivalência
assert.equal(reconstructionEligibility({ inventory: inv(), ownerApproval: 'issue-366-window-0001' }).eligible, true);
assert.equal(reconstructionEligibility({ inventory: inv(), ownerApproval: 'issue-366-window-0001' }).equivalence, 'NOT_EQUIVALENT_TO_SNAPSHOT_RESTORE');
assert.equal(reconstructionEligibility({ inventory: live, ownerApproval: 'issue-366-window-0001' }).eligible, false, 'sessão válida');
assert.equal(reconstructionEligibility({ inventory: inv() }).eligible, false, 'sem aprovação do owner');
assert.equal(reconstructionEligibility({ inventory: inv({ deployment_environment: 'production' }), ownerApproval: 'issue-366-window-0001' }).eligible, false);

// ------------------------------------------------ CLI: recusa antes de conectar
const run = (env, args = ['plan']) => spawnSync(process.execPath, ['scripts/demo/remote-release.mjs', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
const demoUrl = `postgresql://postgres.${DEMO_REF}:pw@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
let r = run({ ARANDU_ENV: 'production', ARANDU_DEMO_DATABASE_URL: demoUrl });
assert.equal(r.status, 1); assert.match(r.stderr, /FULL_RECOVERY_REQUIRED/);
r = run({ ARANDU_ENV: 'demo', ARANDU_DEMO_DATABASE_URL: demoUrl.replaceAll(DEMO_REF, LEGACY_REF) }); assert.match(r.stderr, /SOURCE_NOT_DEMO/);
r = run({ ARANDU_ENV: 'demo', ARANDU_DEMO_DATABASE_URL: demoUrl.replace(':5432/', ':6543/') }); assert.match(r.stderr, /SOURCE_NOT_DEMO/);
r = run({ ARANDU_ENV: 'demo', ARANDU_DEMO_DATABASE_URL: demoUrl, ARANDU_PRODUCTION_DATABASE_URL: 'postgresql://x' }); assert.match(r.stderr, /PRODUCTION_CREDENTIAL_PRESENT/);
r = run({ ARANDU_ENV: 'demo' }, ['plan', 'postgresql://inline']); assert.equal(r.status, 2);
assert(!r.stderr.includes('pw@') && !run({ ARANDU_ENV: 'production', ARANDU_DEMO_DATABASE_URL: demoUrl }).stderr.includes('pw'), 'senha nunca no erro');

// ------------------------------------------------ workflow
const yml = fs.readFileSync('.github/workflows/demo-release.yml', 'utf8');
const triggers = yml.slice(yml.indexOf('\non:'), yml.indexOf('\npermissions:'));
assert(/workflow_dispatch:/.test(triggers) && !/\b(schedule|push|pull_request|workflow_run):/.test(triggers), 'somente manual');
assert(/default: plan/.test(yml) && /options: \[plan, rehearse, apply\]/.test(yml), 'começa em plan');
assert(/group: arandu-demo-pool/.test(yml) && /cancel-in-progress: false/.test(yml), 'concorrência compartilhada com o pool');
assert(/environment: demo/.test(yml) && /github\.ref == 'refs\/heads\/main'/.test(yml));
for (const ctx of ['database', 'deploy-boundaries', 'validate', 'presentation']) assert(yml.includes(`"${ctx}"`));
assert(!/PRODUCTION|STAGING|LEGACY/i.test(yml.replace(/Production\/staging/g, '')), 'nenhuma credencial de outro ambiente');
assert(!/upload-artifact/.test(yml), 'nenhum artifact (repositório público)');
assert(!/AGE-SECRET|IDENTITY_FILE|RECOVERY_IDENTITY/.test(yml), 'nenhuma identidade privada em CI');
assert(yml.indexOf('Apply requires authorization') < yml.indexOf('Remote release'));
// Transição (auditoria pós-#367): lease antes do snapshot no apply; cleanup
// legado sob o mesmo lease e com leitura compatível com o schema anterior.
const release = fs.readFileSync('scripts/demo/remote-release.mjs', 'utf8');
assert(release.indexOf("fin_demo_pool_lease('${holder}'") < release.indexOf('const evidence = rehearse('), 'lease antes do snapshot');
assert(/LOCK_NOT_HELD', 'Lease do pool está com outro/.test(release));
const controller = fs.readFileSync('scripts/demo/workspaces.mjs', 'utf8');
const cleanupBlock = controller.slice(controller.indexOf("command === 'cleanup'"), controller.indexOf("command === 'maintain'"));
assert(/fin_demo_pool_lease/.test(cleanupBlock) && /fin_demo_pool_release/.test(cleanupBlock) && /planPool\(await rows\(\)\)\.cleanup/.test(cleanupBlock), 'cleanup sob lease e replanejado');
assert(/hasPoolColumns\(\)\) \? 'heartbeat_at,failed_at,' : ''/.test(controller), 'leitura compatível com o schema anterior');
console.log('Demo recovery policy: Production/staging sempre FULL_RECOVERY, classificação fail-closed, 25 NO-GOs específicos, reconstrução só como alternativa aprovada, CLI recusa antes de conectar e workflow manual em plan sem artifact nem credencial alheia.');
