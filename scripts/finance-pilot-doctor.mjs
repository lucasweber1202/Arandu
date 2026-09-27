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
const report = await runDoctor({ vercelConfig });
console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) : formatDoctor(report));
process.exit(report.exit_code);
