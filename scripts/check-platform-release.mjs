const truthy = (value) => ['1', 'true', 'yes', 'sim'].includes(String(value || '').toLowerCase());
const failures = [];

if (!truthy(process.env.ARANDU_DISTRIBUTED_RATE_LIMIT)) failures.push('ARANDU_DISTRIBUTED_RATE_LIMIT=true');
if (!truthy(process.env.ARANDU_ERROR_MONITORING_READY)) failures.push('ARANDU_ERROR_MONITORING_READY=true');

const backupVerifiedAt = Date.parse(String(process.env.ARANDU_BACKUP_VERIFIED_AT || ''));
if (!Number.isFinite(backupVerifiedAt) || Date.now() - backupVerifiedAt > 30 * 24 * 60 * 60 * 1000) {
  failures.push('ARANDU_BACKUP_VERIFIED_AT com restauração comprovada nos últimos 30 dias');
}

if (failures.length) {
  console.error('Plataforma ainda não pode ser liberada:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Gates de plataforma aprovados para lançamento.');
