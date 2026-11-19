#!/usr/bin/env node
// Preflight SOMENTE LEITURA da Demo hospedada (ver lib/demo/hosted-preflight.mjs).
// Uso: ARANDU_ENV=demo SUPABASE_URL=… ARANDU_DEMO_CONFIRM=<ref> … \
//      node scripts/demo/hosted-preflight.mjs --expected-sha=<sha> [--out=reports/demo-preflight.json]
// Saída: 0 = GO, 2 = NO-GO, 1 = erro do próprio preflight. Nunca imprime segredos.
import fs from 'node:fs';
import path from 'node:path';
import { runHostedPreflight, CODES } from '../../lib/demo/hosted-preflight.mjs';

const arg = (name) => process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || null;
const expectedSha = arg('expected-sha');
if (expectedSha && !/^[0-9a-f]{40}$/.test(expectedSha)) { console.error('--expected-sha precisa ser um SHA completo.'); process.exit(1); }
const out = arg('out') || 'reports/demo-preflight.json';
const phase = arg('phase') || 'before-seed';
if (!['before-seed', 'recovery', 'status'].includes(phase)) { console.error('--phase precisa ser before-seed, recovery ou status.'); process.exit(1); }
try {
  const report = await runHostedPreflight({ env: process.env, expectedSha, phase });
  const document = { generated_at: new Date().toISOString(), expected_sha: expectedSha, target_ref: report.checks.find((c) => c.id === 'target')?.detail || null, ...report,
    notice: 'Preflight somente leitura: nenhuma escrita foi feita. GO não autoriza provisionamento; a escrita é outra etapa, aprovada à parte.' };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  for (const check of report.checks) console.log(`${check.ok ? 'OK   ' : 'FALHA'} ${check.id.padEnd(18)} ${check.code}${check.code !== 'OK' && CODES[check.code] ? ` — ${CODES[check.code]}` : ''}${check.detail ? ` (${check.detail})` : ''}`);
  if (report.schema?.pending?.length) console.log(`Migrations pendentes, na ordem:\n${report.schema.pending.map((file) => `  - ${file}`).join('\n')}`);
  console.log(`Requisições: ${report.requests.length}, todas ${[...new Set(report.requests.map((r) => r.method))].join('/') || 'nenhuma'}.`);
  console.log(`Camadas: ${Object.entries(report.layers).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  console.log(`DEMO_PREFLIGHT_VERDICT=${report.verdict}${report.codes.length ? ` (${report.codes.join(', ')})` : ''}`);
  process.exit(['GO', 'READY'].includes(report.verdict) ? 0 : 2);
} catch (error) {
  console.error(`Preflight interrompido: ${error?.code === 'WRITE_ATTEMPT' ? error.message : 'erro interno (detalhes omitidos).'}`);
  process.exit(1);
}
