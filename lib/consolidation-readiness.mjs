import { createHash } from 'node:crypto';
// Preparação somente leitura. Não executa reset, DDL ou decommission.
import { CONSOLIDATION_TARGETS } from './deployment-topology.mjs';
import { assessReleaseCandidate } from './finance/pilot-release.mjs';
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,159}$/.test(value) && !/password|token|secret/i.test(value);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function inventoryDigest(projectRef, inventory) {
  const { sha256, ...content } = inventory || {};
  return createHash('sha256').update(JSON.stringify(canonical({ project_ref: projectRef, inventory: content }))).digest('hex');
}
export function assessConversion(evidence, { environment, now = new Date() } = {}) {
  const e = evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : {};
  const target = Object.hasOwn(CONSOLIDATION_TARGETS, environment) ? CONSOLIDATION_TARGETS[environment] : null;
  const checks = [];
  const add = (name, ok) => checks.push({ name, ok: Boolean(ok) });
  const fresh = date => typeof date === 'string' && Number.isFinite(Date.parse(date)) && Date.parse(date) <= now.getTime() && now.getTime() - Date.parse(date) <= 86400000;
  add('source_identity', target && e.project_ref === target.sourceRef && e.database_hostname === `db.${target.sourceRef}.supabase.co` && e.destination === environment);
  const i = e.inventory;
  const rows = i?.table_counts;
  const rowsValid = Array.isArray(rows) && rows.length > 0 && new Set(rows.map(row => row?.table_name)).size === rows.length
    && rows.every(row => /^[a-z][a-z0-9_]*$/.test(row?.table_name || '') && Number.isSafeInteger(row?.rows) && row.rows >= 0);
  add('exact_inventory', rowsValid && rows.reduce((sum, row) => sum + row.rows, 0) === i?.public_rows && i?.sha256 === inventoryDigest(e.project_ref, i) && fresh(i?.observed_at) && i?.complete === true && i?.count_method === 'exact' && hex(i?.sha256) && Number.isSafeInteger(i?.public_rows) && i.public_rows >= 0);
  // Ausência de Auth não prova ausência de PII: leads/certificados contam também.
  add('no_customer_or_personal_data', i?.customer_rows === 0 && i?.personal_data_rows === 0 && i?.auth_users === 0 && i?.mfa_factors === 0 && i?.storage_objects === 0);
  const b = e.backup;
  add('verified_export', b?.project_ref === e.project_ref && b?.result === 'PASS' && fresh(b?.observed_at) && hex(b?.sha256) && b?.inventory_sha256 === i?.sha256 && ref(b?.reference) && b?.auth_storage_included === true);
  const r = e.restore;
  add('real_restore', r?.project_ref === e.project_ref && r?.result === 'PASS' && r?.target_kind === 'disposable' && fresh(r?.observed_at) && r?.backup_sha256 === b?.sha256 && r?.row_comparison === 'PASS' && r?.post_restore_probes === 'PASS' && Date.parse(r?.observed_at) >= Date.parse(b?.observed_at));
  add('controlled_reconstruction', e.plan?.clean_install === true && hex(e.plan?.bundle_sha256) && e.plan?.legacy_preserved === true && ref(e.plan?.rollback_reference));
  return { tool: 'arandu-consolidation', destination: target ? environment : null,
    result: checks.every(check => check.ok) ? 'PREPARED' : 'BLOCKED',
    executes_mutation: false, checks };
}

export function assessDecommission(evidence, { commit, now = new Date() } = {}) {
  const e = evidence && typeof evidence === 'object' ? evidence : {};
  const validation = assessReleaseCandidate(e.release_candidate, { commit, now });
  const dependencies = ['automations', 'official_aliases', 'scripts', 'deployments'];
  const observed = Date.parse(e.dependencies?.observed_at);
  const checks = [
    { name: 'canonical_demo_validated', ok: validation.result === 'RELEASE CANDIDATE GO' },
    { name: 'fresh_dependency_inventory', ok: e.dependencies?.complete === true && Number.isFinite(observed) && observed <= now.getTime() && now.getTime() - observed <= 86400000 },
    ...dependencies.map(name => ({ name: `no_${name}_depend_on_pilot`, ok: Array.isArray(e.dependencies?.[name]) && e.dependencies[name].length === 0 })),
    { name: 'preserved_rollback', ok: e.rollback?.verified === true && ref(e.rollback?.reference) },
    { name: 'targets_identified', ok: e.vercel_project === 'arandu-pilot' && e.branch === 'pilot' }
  ];
  return { tool: 'arandu-decommission', result: checks.every(check => check.ok) ? 'PREPARED' : 'BLOCKED', executes_mutation: false, checks };
}
