#!/usr/bin/env node
// Classifica o schema de um PostgreSQL acessível por psql contra o manifesto
// (somente leitura: um SELECT no catálogo). Uso: node scripts/demo/schema-state.mjs <url> [--json]
// Imprime "estado [pending=a,b] [reason=x]". Nunca imprime a URL.
import { execFileSync } from 'node:child_process';
import { classifySchema, migrationRelations, loadManifest, CATALOG_SQL } from '../../lib/demo/schema-reconcile.mjs';

const [url, flag] = process.argv.slice(2);
if (!url) { console.error('Uso: schema-state.mjs <postgres-url> [--json]'); process.exit(1); }
let inventory = null;
try {
  inventory = execFileSync('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', `begin read only; ${CATALOG_SQL}; commit;`], { encoding: 'utf8' })
    .split('\n').map((line) => line.trim()).filter((line) => /^[a-z_][a-z0-9_]*$/.test(line));
} catch { inventory = null; }
let schemaVersion = null;
if (inventory?.includes('fin_settings')) {
  try { schemaVersion = execFileSync('psql', [url, '-X', '-qAt', '-c', "select value from public.fin_settings where key='schema_version'"], { encoding: 'utf8' }).trim() || null; }
  catch { schemaVersion = null; }
}
const result = classifySchema(migrationRelations(loadManifest()), inventory, { schemaVersion });
if (flag === '--json') console.log(JSON.stringify({ state: result.state, reason: result.reason || null, pending: result.pending, missing: result.missing, unexpected: result.unexpected, partial: result.partial }, null, 2));
else console.log([result.state, result.pending.length ? `pending=${result.pending.join(',')}` : '', result.reason ? `reason=${result.reason}` : ''].filter(Boolean).join(' '));
process.exit(result.state === 'compatible' ? 0 : result.state === 'indeterminate' ? 1 : 3);
