#!/usr/bin/env node
import fs from 'node:fs';

const strict = process.argv.includes('--require-ready');
const evidence = JSON.parse(fs.readFileSync('ops/pilot-evidence.json', 'utf8'));
const config = JSON.parse(fs.readFileSync('data/pilot-tasks.json', 'utf8'));
const reference = (value) => String(value || '').trim().length >= 8
  && !/^(?:feito|ok|sim|yes|done|true|pronto)$/i.test(String(value || '').trim());
const date = (value) => {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) && timestamp <= Date.now();
};
const checks = {
  state: evidence.state === 'completed',
  cohortReference: reference(evidence.cohortReference),
  cohortSize: Number(evidence.cohortSize) >= config.minimumCohort,
  dates: date(evidence.startedAt)
    && date(evidence.completedAt)
    && Date.parse(evidence.completedAt) >= Date.parse(evidence.startedAt),
  metricsReference: reference(evidence.metricsReference),
  participants: Number(evidence.uniqueParticipants) >= config.minimumCohort,
  feedback: Number(evidence.feedbackResponses) >= config.approvalRules.minimumFeedbackResponses,
  rating: Number(evidence.averageRating) >= config.approvalRules.minimumAverageRating,
  tasks: Number(evidence.tasksCompleted) >= config.minimumCohort * config.tasks.length,
  criticalBlockers: evidence.criticalBlockersOpen === config.approvalRules.criticalBlockersOpen,
  approval: evidence.approved === true
    && reference(evidence.approvedBy)
    && date(evidence.approvedAt)
    && reference(evidence.approvalReference)
};
const pending = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const ready = pending.length === 0;
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/pilot-report.md', [
  '# Relatório consolidado do piloto fechado',
  '',
  `Resultado: **${ready ? 'APROVADO' : 'NÃO REALIZADO OU BLOQUEADO'}**`,
  '',
  `Coorte registrada: ${evidence.cohortSize}/${config.minimumCohort}`,
  `Participantes únicos: ${evidence.uniqueParticipants}/${config.minimumCohort}`,
  `Feedbacks: ${evidence.feedbackResponses}/${config.approvalRules.minimumFeedbackResponses}`,
  `Nota média: ${evidence.averageRating ?? 'não registrada'}`,
  `Tarefas concluídas: ${evidence.tasksCompleted}/${config.minimumCohort * config.tasks.length}`,
  `Bloqueadores críticos abertos: ${evidence.criticalBlockersOpen ?? 'não registrado'}`,
  `Bloqueadores altos abertos: ${evidence.highBlockersOpen ?? 'não registrado'}`,
  '',
  '## Tarefas',
  '',
  ...config.tasks.map((task) => `- ${task.id}: ${task.label}`),
  '',
  '## Pendências',
  '',
  ...(pending.length ? pending.map((item) => `- ${item}`) : ['- Nenhuma.']),
  ''
].join('\n'));
console.log('Arandu Pilot Evidence Check');
console.log(`Critérios: ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length}`);
console.log(`Piloto aprovado: ${ready}`);
if (pending.length) console.warn(`Pendências: ${pending.join(', ')}.`);
console.log('Relatório: reports/pilot-report.md');
if (strict && !ready) process.exit(1);
