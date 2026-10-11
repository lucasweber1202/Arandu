// Estratégia s3: export no temporário do runner + transferência SigV4 com readback.
// O preflight roda antes de tudo e nomeia a PRIMEIRA configuração ausente por
// código, sem valores; nada toca o banco enquanto ele estiver BLOCKED.
import fs from 'node:fs';
import path from 'node:path';
import { exportRecovery } from './consolidation-export.mjs';
import { approvedDestination, transferRecovery, digestFile } from '../lib/recovery-transfer.mjs';
import { diagnoseRecovery, formatDiagnosis } from '../lib/recovery-doctor.mjs';

const report = diagnoseRecovery({ strategy: 's3', requireConfirmation: true });
console.log(formatDiagnosis(report));
if (report.result !== 'READY') {
  console.error(`BLOQUEADO (${report.code}): configuração incompleta; o banco não foi acessado.`);
  process.exit(1);
}

let temporary;
try {
  const destination = approvedDestination(process.env.ARANDU_RECOVERY_DESTINATION, process.env.ARANDU_RECOVERY_PROJECT_REF, process.env.GITHUB_SHA);
  if (!path.isAbsolute(process.env.RUNNER_TEMP || '')) throw Object.assign(new Error('Runner temporário ausente.'), { code: 'RECOVERY_DESTINATION_INVALID' });
  temporary = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'arandu-ciphertext-'));
  fs.chmodSync(temporary, 0o700);
  const manifest = await exportRecovery({ env: { ...process.env, ARANDU_RECOVERY_DIRECTORY: temporary } });
  const directory = path.join(temporary, fs.readdirSync(temporary)[0]);
  await transferRecovery({ directory, manifest, destination });
  console.log(JSON.stringify({ ...manifest, manifest_integrity: await digestFile(path.join(directory, 'manifest.json')) }));
  console.log('Ciphertext persistido e relido no destino aprovado. Restore: NOT RUN (RECOVERY_RESTORE_NOT_VERIFIED).');
} catch (error) {
  const code = /^RECOVERY_[A-Z_]+$/.test(error?.code || '') ? error.code : 'RECOVERY_EXPORT_FAILED';
  console.error(`BLOQUEADO (${code}): export/transferência não validado. Detalhes sensíveis omitidos.`);
  process.exitCode = 1;
} finally {
  // O temporário do runner nunca é o backup: só o destino aprovado conta.
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
