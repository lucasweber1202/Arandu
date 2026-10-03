// Source credentials go through libpq environment, never process arguments.
import { spawnSync } from 'node:child_process';
import { sourceConnection } from '../lib/pilot-backup-preflight.mjs';

const [binary, ...args] = process.argv.slice(2);
if (!['psql', 'pg_dump'].includes(binary)) { console.error('Cliente de origem inválido.'); process.exit(1); }
let connection;
try { connection = sourceConnection(process.env.PILOT_SOURCE_DATABASE_URL,
  { local: process.env.PILOT_DRILL_SOURCE_KIND === 'pilot-local' }); }
catch { console.error('Conexão de origem inválida.'); process.exit(1); }
const result = spawnSync(binary, args, { env: { ...process.env, ...connection.env }, stdio: ['inherit', 'inherit', 'pipe'] });
if (result.status !== 0) console.error('Cliente PostgreSQL da origem falhou; detalhes sensíveis omitidos.');
process.exit(result.status === 0 ? 0 : 1);
