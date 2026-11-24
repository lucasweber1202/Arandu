// Política de recuperação proporcional da Demo (issue #366, docs/ops/DEMO_REMOTE_RELEASE.md).
//
// Dois caminhos, decididos só por fatos verificados, nunca por flag:
//   FULL_RECOVERY   Production, staging, Pilot legado, dados reais ou desconhecidos.
//                   Exige o recovery integral (#365: export criptografado, custódia,
//                   restore isolado, drill). Nada aqui o relaxa.
//   DEMO_PROPORTIONAL  Somente a Demo canônica (ref, ARANDU_ENV e banco conferidos),
//                   com TODOS os dados classificados como fictícios. Evidência exigida:
//                   snapshot remoto restaurado em PostgreSQL 17 descartável (mesmo
//                   hash), migrations ensaiadas na cópia (apply, probes, rollback,
//                   reaplicação) e, se houver estado de visitante que o seed não
//                   regenera, preservação em ciphertext num destino privado aprovado.
//
// Puro: sem I/O. Toda incerteza vira NO-GO com código específico.
import { DEMO_REF } from './release-migration-guard.mjs';

export const POLICY_VERSION = 1;
export const PATHS = Object.freeze({ full: 'FULL_RECOVERY', demo: 'DEMO_PROPORTIONAL' });
export const MAX_EVIDENCE_AGE_HOURS = 6;

const int = (v) => Number.isSafeInteger(v) && v >= 0;

/**
 * Caminho de recuperação. Só retorna DEMO_PROPORTIONAL quando ambiente
 * declarado, ref da conexão e marcador do banco concordam em Demo. Qualquer
 * outro ambiente — inclusive "demo" com ref de outro projeto — é FULL_RECOVERY.
 */
export function recoveryPath({ declaredEnvironment, connectionRef, databaseEnvironment } = {}) {
  const demo = declaredEnvironment === 'demo' && connectionRef === DEMO_REF && databaseEnvironment === 'demo';
  return demo ? PATHS.demo : PATHS.full;
}

/** Classificação dos dados a partir do inventário (ops/sql/demo-recovery-inventory.sql). */
export function classifyData(inventory) {
  const problems = [];
  const u = inventory?.users, o = inventory?.organizations, a = inventory?.auth, s = inventory?.storage, w = inventory?.workspaces;
  if (!u || !int(u.total) || !int(u.fictitious) || !int(u.unclassified)) problems.push(['DATA_INVENTORY_INVALID', 'Inventário de usuários ausente ou inválido.']);
  else if (u.unclassified > 0 || u.fictitious !== u.total) problems.push(['DATA_UNCLASSIFIED_USERS', `${u.unclassified} conta(s) fora dos domínios fictícios: dados reais ou desconhecidos.`]);
  if (!o || !int(o.total) || !int(o.unclassified)) problems.push(['DATA_INVENTORY_INVALID', 'Inventário de organizações ausente ou inválido.']);
  else if (o.unclassified > 0) problems.push(['DATA_UNCLASSIFIED_ORGANIZATIONS', `${o.unclassified} organização(ões) com membro ou criador não fictício.`]);
  if (!a || !int(a.non_email_identities) || !int(a.mfa_factors) || !int(a.sso_providers)) problems.push(['DATA_INVENTORY_INVALID', 'Inventário de Auth ausente ou inválido.']);
  else if (a.non_email_identities + a.mfa_factors + a.sso_providers > 0) problems.push(['AUTH_STATE_NOT_REGENERABLE', 'Identidades externas, MFA ou SSO não são recriados pelo seed.']);
  if (!s || !int(s.objects) || !int(s.objects_outside_fictitious_orgs) || !int(s.public_buckets)) problems.push(['DATA_INVENTORY_INVALID', 'Inventário de Storage ausente ou inválido.']);
  else {
    if (s.objects_outside_fictitious_orgs > 0) problems.push(['STORAGE_UNCLASSIFIED', `${s.objects_outside_fictitious_orgs} objeto(s) fora de organizações fictícias.`]);
    if (s.public_buckets > 0) problems.push(['STORAGE_PUBLIC_BUCKET', 'Bucket público na Demo.']);
  }
  if (!w || !int(w.claimed_valid) || !int(w.provisioning)) problems.push(['DATA_INVENTORY_INVALID', 'Inventário de workspaces ausente ou inválido.']);
  return { fictitious: problems.length === 0, problems };
}

/**
 * Estado que a reconstrução canônica NÃO recria: workspaces reivindicados
 * válidos (sessões de visitantes e o que criaram). Conteúdo de visitante não é
 * "fictício descartável" só por estar na Demo.
 */
export function nonRegenerableState(inventory) {
  const claimed = inventory?.workspaces?.claimed_valid ?? null;
  const orgs = inventory?.visitor_state?.organizations ?? null;
  if (!int(claimed) || !int(orgs)) return { known: false, present: true };
  return { known: true, present: claimed > 0 || orgs > 0, claimed_valid: claimed, next_expiry: inventory.workspaces.claimed_valid_next_expiry || null };
}

/**
 * Decisão para APLICAR migrations na Demo pelo caminho proporcional.
 * `evidence` vem do ensaio remoto (scripts/demo/remote-release.mjs rehearse);
 * `preservation` do passo de ciphertext (destino aprovado e transferência verificada).
 */
export function decideDemoRelease({ declaredEnvironment, connectionRef, inventory, evidence, preservation, lock, authorization, now = Date.now() } = {}) {
  const nogo = [];
  const add = (code, message) => nogo.push({ code, message });
  const path = recoveryPath({ declaredEnvironment, connectionRef, databaseEnvironment: inventory?.deployment_environment });
  if (path !== PATHS.demo) {
    add('FULL_RECOVERY_REQUIRED', 'Ambiente não comprovadamente Demo: use o recovery integral (scripts/recovery/orchestrate.mjs).');
    return { path, go: false, nogo };
  }
  if (inventory.postgres_major !== 17) add('SOURCE_MAJOR_MISMATCH', 'Origem não é PostgreSQL 17.');
  if (!/^financial-[a-z0-9-]+$/.test(String(inventory.schema_version || ''))) add('SOURCE_SCHEMA_UNKNOWN', 'Marcador de schema ausente.');
  for (const [code, message] of classifyData(inventory).problems) add(code, message);
  if (inventory.workspaces?.provisioning > 0) add('POOL_PROVISIONING_ACTIVE', 'Há workspace em provisionamento: aguarde ou reconcilie antes.');

  // Evidência do ensaio: mesmo artefato, recente, completa.
  const age = (now - Date.parse(evidence?.generated_at || '')) / 3600000;
  if (!evidence || evidence.result !== 'passed') add('REHEARSAL_MISSING', 'Ensaio remoto ausente ou reprovado.');
  else {
    if (!(age >= 0 && age <= MAX_EVIDENCE_AGE_HOURS)) add('EVIDENCE_STALE', `Evidência fora da janela de ${MAX_EVIDENCE_AGE_HOURS} h.`);
    if (evidence.source_ref !== DEMO_REF || evidence.source_schema !== inventory.schema_version) add('EVIDENCE_SOURCE_MISMATCH', 'Evidência é de outra origem ou outro marcador de schema.');
    if (!/^[a-f0-9]{64}$/.test(evidence.snapshot_sha256 || '') || evidence.restore?.backup_sha256 !== evidence.snapshot_sha256) add('EVIDENCE_HASH_MISMATCH', 'Restore não é do mesmo snapshot.');
    for (const check of ['restore', 'migrations_applied', 'post_migration_probes', 'rollback', 'reapply', 'isolation_canary']) {
      if (evidence.checks?.[check] !== 'PASS') add('REHEARSAL_INCOMPLETE', `Ensaio sem ${check} aprovado.`);
    }
  }
  // Estado não regenerável: preservado em ciphertext verificado, ou ausente.
  const state = nonRegenerableState(inventory);
  if (!state.known) add('STATE_UNKNOWN', 'Não foi possível determinar sessões de visitante válidas.');
  else if (state.present) {
    const p = preservation || {};
    if (!p.destination_approved) add('PRESERVATION_DESTINATION_MISSING', `${state.claimed_valid} sessão(ões) de visitante válida(s) e nenhum destino privado aprovado para o ciphertext.`);
    else if (p.ciphertext_sha256 !== p.uploaded_sha256 || !/^[a-f0-9]{64}$/.test(p.ciphertext_sha256 || '')) add('PRESERVATION_TRANSFER_UNVERIFIED', 'Integridade da transferência do ciphertext não comprovada.');
    else if (p.plaintext_sha256 !== evidence?.snapshot_sha256) add('PRESERVATION_SNAPSHOT_MISMATCH', 'Ciphertext não é do snapshot ensaiado.');
  }
  if (!lock?.held || lock.holder_matches !== true) add('LOCK_NOT_HELD', 'Lease do pool não está com este release: manutenção concorrente possível.');
  if (!authorization || !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{7,119}$/.test(authorization) || /eyJ|postgres|@/.test(authorization)) add('AUTHORIZATION_MISSING', 'Referência de autorização específica ausente ou inválida.');
  return { path, go: nogo.length === 0, nogo, non_regenerable: state };
}

/**
 * Reconstrução canônica (seed/manifesto) como recuperação: alternativa de
 * política, NUNCA equivalente ao restore do snapshot. Só elegível se o estado
 * não regenerável estiver ausente (ou preservado) e o owner aprovar janela e risco.
 */
export function reconstructionEligibility({ inventory, preservationVerified = false, ownerApproval } = {}) {
  const reasons = [];
  if (inventory?.deployment_environment !== 'demo') reasons.push('Somente na Demo canônica.');
  if (!classifyData(inventory).fictitious) reasons.push('Dados não comprovadamente fictícios.');
  const state = nonRegenerableState(inventory);
  if (!state.known || (state.present && !preservationVerified)) reasons.push('Há sessões de visitante válidas sem preservação verificada.');
  if (!ownerApproval || !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{7,119}$/.test(ownerApproval)) reasons.push('Aprovação do owner (janela e risco residual) ausente.');
  return { eligible: reasons.length === 0, reasons, equivalence: 'NOT_EQUIVALENT_TO_SNAPSHOT_RESTORE' };
}
