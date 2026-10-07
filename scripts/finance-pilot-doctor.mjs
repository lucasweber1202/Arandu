#!/usr/bin/env node
// Diagnóstico somente leitura da prontidão do piloto financeiro.
//
//   ARANDU_ENV=pilot npm run finance:pilot:doctor            → relatório legível
//   ARANDU_ENV=pilot npm run finance:pilot:doctor -- --json  → JSON estruturado
//
// Saída: 0 = GO · 1 = NO-GO (falta configuração) · 2 = UNSAFE (configuração perigosa).
// Detalhes: lib/finance/pilot-doctor.mjs.
import fs from 'node:fs';
import { runDoctor, formatDoctor } from '../lib/finance/pilot-doctor.mjs';

const vercelConfig = (() => { try { return JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')); } catch { return null; } })();
const args = process.argv.slice(2);
const shaArgs = args.filter((arg) => arg.startsWith('--expected-commit='));
if (args.some((arg) => arg !== '--json' && !arg.startsWith('--expected-commit=')) || shaArgs.length > 1
  || (shaArgs.length && !/^--expected-commit=[a-f0-9]{40}$/.test(shaArgs[0]))) {
  console.error('Uso: finance:pilot:doctor -- [--json] [--expected-commit=<SHA completo>]');
  process.exit(1);
}
const report = await runDoctor({ vercelConfig, expectedCommit: shaArgs.length ? shaArgs[0].split('=')[1] : null });
console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) : formatDoctor(report));
process.exit(report.exit_code);
