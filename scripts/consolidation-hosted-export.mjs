import fs from 'node:fs';
import path from 'node:path';
import { exportRecovery } from './consolidation-export.mjs';
import { approvedDestination, transferRecovery, digestFile } from '../lib/recovery-transfer.mjs';

let temporary;
try {
  const destination = approvedDestination(process.env.ARANDU_RECOVERY_DESTINATION, process.env.ARANDU_RECOVERY_PROJECT_REF, process.env.GITHUB_SHA);
  if (!path.isAbsolute(process.env.RUNNER_TEMP || '')) throw new Error('Runner temporário ausente.');
  temporary = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'arandu-ciphertext-'));
  fs.chmodSync(temporary, 0o700);
  const manifest = await exportRecovery({ env: { ...process.env, ARANDU_RECOVERY_DIRECTORY: temporary } });
  const directory = path.join(temporary, fs.readdirSync(temporary)[0]);
  await transferRecovery({ directory, manifest, destination });
  console.log(JSON.stringify({ ...manifest, manifest_integrity: await digestFile(path.join(directory,'manifest.json')) }));
} catch {
  console.error('BLOQUEADO: export/transferência não validado. Detalhes sensíveis omitidos.');
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
