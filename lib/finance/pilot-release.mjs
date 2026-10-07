// Evidence assessment only: never executes migrations or creates hosted proof.
import { EXPECTED_SCHEMA_VERSION, PILOT_SUPABASE_REFS } from './pilot-doctor.mjs';
import { CANONICAL_BRANCH } from '../runtime-mode.mjs';
import { CONSOLIDATION_TARGETS } from '../deployment-topology.mjs';

export const PILOT_CI_GATES = Object.freeze(['database', 'deploy-boundaries', 'validate', 'presentation']);

export const PILOT_JOURNEY_STEPS = Object.freeze(['login', 'workspace', 'entity', 'rfq', 'proposal_compare', 'decision_approval', 'contract', 'provider', 'portfolio', 'value', 'fees', 'opportunities', 'governance', 'documents', 'qualification', 'implementation', 'covenants', 'performance', 'spend', 'renewal', 'executive', 'jobs', 'notifications', 'search', 'audit', 'logout']);
export const PILOT_CANARY_PROBES = Object.freeze(['tenant_isolation', 'entity_isolation', 'graph', 'rfq', 'contract', 'governance', 'value', 'fees', 'opportunities', 'document_intelligence', 'qualification', 'implementation', 'covenants', 'performance', 'spend']);
const sha = value => /^[a-f0-9]{40}$/.test(String(value || ''));
const digest = value => /^[a-f0-9]{64}$/.test(String(value || ''));
// References are opaque evidence IDs. URLs, connection strings and credentials
// do not belong in release evidence. The operator resolves IDs in secure storage.
const reference = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{2,159}$/.test(value) && !value.includes('://') && !/sb_secret|service_role|password|token/i.test(value);

export function assessPilotRelease(evidence, { commit, now = new Date(), maxAgeHours = 24, canonicalDemo = false } = {}) {
  const e = evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : {};
  const environment = canonicalDemo ? 'demo' : 'pilot';
  const project = canonicalDemo ? CONSOLIDATION_TARGETS.demo.vercelProject : 'arandu-pilot';
  const refs = canonicalDemo ? [CONSOLIDATION_TARGETS.demo.sourceRef] : PILOT_SUPABASE_REFS;
  const checks = [];
  const add = (name, ok, reason) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { reason }) });
  const time = now.getTime();
  const window = maxAgeHours * 3600000;
  const fresh = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= time && time - Date.parse(value) <= window;
  const observation = record => record?.environment === environment && record?.project_ref === e.project_ref && record?.commit === commit && record?.evidence_level === 'hosted' && reference(record?.reference) && fresh(record?.observed_at);
  add('assessment_context', sha(commit) && Number.isFinite(time) && Number.isFinite(window) && window > 0 && maxAgeHours <= 24, 'Commit ou janela de avaliação inválidos (máximo 24 h).');
  add('environment_identity', e.format_version === (canonicalDemo ? 3 : 2) && e.environment === environment && refs.includes(e.project_ref) && e.database_hostname === `db.${e.project_ref}.supabase.co` && e.vercel_project === project, 'Identidade do ambiente de validação ausente ou divergente.');
  add('commit', sha(commit) && e.commit === commit, 'Evidência não pertence ao commit avaliado.');
  const ci = e.ci;
  add('ci_exact_commit', ci?.commit === commit && ci?.evidence_level === 'ci' && reference(ci?.reference) && fresh(ci?.observed_at) && PILOT_CI_GATES.every(name => ci?.gates?.[name] === 'success'), 'Quatro gates CI no SHA exato não foram comprovados; evidência local não substitui M2.');
  add('schema', e.schema_after === EXPECTED_SCHEMA_VERSION && typeof e.schema_before === 'string' && e.schema_before.startsWith('financial-'), 'Marker final divergente ou marker anterior ausente.');
  const deploy = e.deployment;
  add('deployment', observation(deploy) && deploy?.state === 'READY' && deploy?.target === 'production' && deploy?.branch === CANONICAL_BRANCH && deploy?.project === project && deploy?.schema_version === e.schema_after, 'Deploy de validação não foi comprovado no SHA e schema esperados.');
  if (canonicalDemo) {
    add('validation_stage', e.stage === 'release_candidate' && e.deployment_environment === 'demo', 'Etapa release_candidate e marcador demo não comprovados.');
    add('demo_runtime', deploy?.runtime === 'demo' && deploy?.datasource === 'supabase', 'Sandbox ou runtime diferente não valida o candidato.');
    add('seed_and_reset', observation(e.demo_seed) && e.demo_seed?.result === 'PASS' && e.demo_seed?.verification === 'PASS' && e.demo_seed?.reset === 'PASS' && e.demo_seed?.synthetic_only === true && e.demo_seed?.schema_version === e.schema_after, 'Seed sintético, verificação e reset reproduzível não comprovados.');
  }
  const backup = e.backup;
  add('backup', observation(backup) && backup?.result === 'PASS' && digest(backup?.sha256) && backup?.schema_version === e.schema_before, 'Backup real recente do marker anterior não foi comprovado.');
  const restore = e.restore;
  add('restore', observation(restore) && restore?.result === 'PASS' && restore?.target_kind === 'disposable' && restore?.schema_version === e.schema_before && digest(restore?.backup_sha256) && restore?.backup_sha256 === backup?.sha256 && restore?.post_restore_probes === 'PASS' && restore?.row_comparison === 'PASS' && Number.isFinite(restore?.duration_ms) && restore?.duration_ms > 0 && Date.parse(restore?.observed_at) >= Date.parse(backup?.observed_at), 'Restore descartável do mesmo backup, comparação e probes não foram comprovados.');
  const doctor = e.doctor;
  const migration = e.migration;
  add('migration_after_restore', observation(migration) && migration?.result === 'PASS' && migration?.schema_before === e.schema_before && migration?.schema_after === e.schema_after && digest(migration?.bundle_sha256) && fresh(migration?.started_at) && Date.parse(migration?.started_at) >= Date.parse(restore?.observed_at) && Date.parse(migration?.observed_at) >= Date.parse(migration?.started_at), 'Aplicação do bundle exato após restore verificado não foi comprovada.');
  const art = e.legacy_art_decommission;
  add('legacy_art_owner_decision', art?.environment === environment && art?.project_ref === e.project_ref && art?.export_verified === true && Number.isSafeInteger(art?.inventory_rows) && art.inventory_rows >= 0 && reference(art?.export_reference) && art?.ack === `export-verified:${art?.export_reference}` && reference(art?.owner_decision_reference) && fresh(art?.acknowledged_at) && Date.parse(art?.acknowledged_at) <= Date.parse(migration?.started_at), 'Inventário, export verificado e decisão específica do owner antes da etapa destrutiva não foram comprovados.');
  add('doctor', observation(doctor) && doctor?.result === 'GO' && doctor?.schema_version === e.schema_after && doctor?.errors === 0 && doctor?.unsafe === 0, 'Doctor hospedado não está GO no schema final.');
  const canary = e.canary;
  add('canary', observation(canary) && canary?.result === 'PASS' && canary?.schema_version === e.schema_after && PILOT_CANARY_PROBES.every(name => canary?.probes?.[name] === 'PASS'), 'Canário hospedado incompleto, ausente ou falho.');
  const journey = e.authenticated_journey;
  add('authenticated_journey', observation(journey) && journey?.result === 'PASS' && journey?.transport === 'real' && journey?.schema_version === e.schema_after && PILOT_JOURNEY_STEPS.every(name => journey?.steps?.[name] === 'PASS'), 'Jornada autenticada com backend real incompleta ou não comprovada.');
  // M4 requires exercised operations, not merely a healthy application.
  const observability = e.observability;
  add('observability', observation(observability) && observability?.result === 'PASS' && observability?.schema_version === e.schema_after && observability?.request_correlation === 'PASS' && observability?.job_failure_detection === 'PASS' && observability?.queue_backlog_detection === 'PASS', 'Correlação, detecção de falha de job e backlog hospedados não foram comprovados.');
  const exercise = e.operational_exercise;
  add('operational_exercise', observation(exercise) && exercise?.result === 'PASS' && exercise?.schema_version === e.schema_after && reference(exercise?.owner_role) && reference(exercise?.runbook_reference) && exercise?.incident_triage === 'PASS' && exercise?.support_handoff === 'PASS' && exercise?.rollback_forward_fix === 'PASS', 'Exercício de runbook, triagem, suporte e rollback/forward-fix com responsável não foi comprovado.');
  add('verification_after_restore', [deploy, doctor, canary, journey, observability, exercise, ...(canonicalDemo ? [e.demo_seed] : [])].every(record => fresh(record?.observed_at) && Date.parse(record.observed_at) >= Date.parse(restore?.observed_at)), 'Deploy/doctor/canário/jornada/operação precisam de observação posterior ao restore.');
  add('verification_after_migration', [deploy, doctor, canary, journey, observability, exercise, ...(canonicalDemo ? [e.demo_seed] : [])].every(record => fresh(record?.observed_at) && Date.parse(record.observed_at) >= Date.parse(migration?.observed_at)), 'Deploy/doctor/canário/jornada/operação precisam de observação posterior à atualização do schema.');
  add('p0_blockers', Array.isArray(e.p0_blockers) && e.p0_blockers.length === 0, 'Blockers P0 da validação não foram encerrados.');
  return { tool: 'arandu-pilot-release', generated_at: Number.isFinite(time) ? now.toISOString() : null, commit: sha(commit) ? commit : null, result: checks.every(check => check.ok) ? 'PILOT GO' : 'PILOT NO-GO', checks };
}

/** M4 sem terceiro projeto. Mantém todas as provas exigidas pelo contrato v2. */
export function assessReleaseCandidate(evidence, options = {}) {
  const report = assessPilotRelease(evidence, { ...options, canonicalDemo: true });
  return { ...report, tool: 'arandu-release-candidate',
    result: report.checks.every(check => check.ok) ? 'RELEASE CANDIDATE GO' : 'RELEASE CANDIDATE NO-GO' };
}
