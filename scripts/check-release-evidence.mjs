#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--require-ready');
const sourcePath = path.join(root, 'ops/release-evidence.json');
const reportPath = path.join(root, 'reports/release-evidence.md');
const evidence = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

const STATES = new Set([
  'not_started',
  'implemented',
  'ci_validated',
  'staging_validated',
  'production_validated',
  'human_approved'
]);
const STATE_RANK = {
  not_started: 0,
  implemented: 1,
  ci_validated: 2,
  staging_validated: 3,
  production_validated: 4,
  human_approved: 5
};
const REQUIRED_GATES = {
  migration_preflight: 'implemented',
  migration_ci: 'ci_validated',
  migration_staging: 'staging_validated',
  backup_restore: 'staging_validated',
  write_canary: 'staging_validated',
  rls_isolation: 'staging_validated',
  reservation_concurrency: 'staging_validated',
  catalog_real: 'human_approved',
  commercial_policy: 'human_approved',
  monitoring: 'staging_validated',
  privacy_contact: 'production_validated',
  domain_https: 'production_validated',
  pilot_closed: 'human_approved'
};
const VAGUE = /^(?:feito|ok|sim|yes|done|true|pronto|conclu[ií]do|n\/?a)$/i;
const SECRET = /(?:eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^/\s]+:[^@\s]+@|service[_-]?role|api[_-]?key|bearer\s+[A-Za-z0-9._-]{12,})/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function validPastDate(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function validReference(value) {
  const reference = String(value || '').trim();
  return reference.length >= 8 && !VAGUE.test(reference) && !SECRET.test(reference) && !EMAIL.test(reference);
}

function validOwner(value) {
  const owner = String(value || '').trim();
  return owner.length >= 3 && owner.length <= 80 && !VAGUE.test(owner) && !EMAIL.test(owner);
}

const problems = [];
if (evidence.version !== 2) problems.push('version: use o formato 2.');
if (!evidence.gates || typeof evidence.gates !== 'object' || Array.isArray(evidence.gates)) {
  problems.push('gates: objeto obrigatório.');
}

const gates = evidence.gates || {};
const rows = Object.entries(REQUIRED_GATES).map(([id, requiredState]) => {
  const gate = gates[id] || {};
  const state = String(gate.state || 'not_started');
  const knownState = STATES.has(state);
  const completed = knownState && state !== 'not_started';
  const fieldsValid = !completed || (
    validOwner(gate.owner)
    && validPastDate(gate.observedAt)
    && validReference(gate.reference)
  );
  const meetsRelease = knownState
    && fieldsValid
    && STATE_RANK[state] >= STATE_RANK[requiredState];

  if (!knownState) problems.push(`${id}: estado inválido "${state}".`);
  if (completed && !validOwner(gate.owner)) problems.push(`${id}: responsável não identificável ou contém PII.`);
  if (completed && !validPastDate(gate.observedAt)) problems.push(`${id}: data ausente, futura ou inválida.`);
  if (completed && !validReference(gate.reference)) problems.push(`${id}: referência ausente, vaga, sensível ou com PII.`);
  if (gate.notes && (SECRET.test(String(gate.notes)) || EMAIL.test(String(gate.notes)))) {
    problems.push(`${id}: notas contêm possível segredo ou PII.`);
  }

  return { id, state, requiredState, fieldsValid, meetsRelease, gate };
});

for (const id of Object.keys(gates)) {
  if (!(id in REQUIRED_GATES)) problems.push(`${id}: gate desconhecido; atualize o verificador antes de adicionar evidência.`);
}

const releaseReady = rows.every((row) => row.meetsRelease) && problems.length === 0;
const markdown = [
  '# Evidências de liberação — Arandu',
  '',
  `Gerado em: ${new Date().toISOString()}`,
  '',
  `Resultado: **${releaseReady ? 'LIBERADO' : 'BLOQUEADO'}**`,
  '',
  '| Gate | Estado registrado | Mínimo para liberação | Campos válidos | Resultado |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map((row) => `| ${row.id} | ${row.state} | ${row.requiredState} | ${row.fieldsValid ? 'sim' : 'não'} | ${row.meetsRelease ? 'aprovado' : 'pendente'} |`),
  '',
  '## Regras',
  '',
  '- `implemented`: existe no código, mas não comprova CI, staging ou produção.',
  '- `ci_validated`: foi validado por uma execução referenciada da CI.',
  '- `staging_validated`: foi executado no ambiente de staging identificado pela referência.',
  '- `production_validated`: foi executado no ambiente de produção identificado pela referência.',
  '- `human_approved`: exige decisão humana registrada; não pode ser inferida por teste automatizado.',
  '- CI local ou em GitHub Actions não comprova aplicação no Supabase real.',
  '',
  '## Problemas de formato',
  '',
  ...(problems.length ? problems.map((problem) => `- ${problem}`) : ['- Nenhum.']),
  ''
].join('\n');

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, markdown);

console.log('Arandu Release Evidence Check');
console.log(`Gates liberados: ${rows.filter((row) => row.meetsRelease).length}/${rows.length}`);
console.log(`Erros de formato: ${problems.length}`);
for (const row of rows) {
  console.log(`${row.meetsRelease ? 'OK' : 'PENDENTE'} ${row.id}: ${row.state} (mínimo ${row.requiredState})`);
}
problems.forEach((problem) => console.error(`- ${problem}`));
console.log('Relatório: reports/release-evidence.md');
if (problems.length || (strict && !releaseReady)) process.exit(1);
