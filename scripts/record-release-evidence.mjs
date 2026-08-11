#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { STATE_RANK, validateGateEvidence } from '../lib/release-evidence.mjs';
const args = new Map(process.argv.slice(2).map((item) => { const [key, ...rest] = item.split('='); return [key, rest.join('=') || true]; }));
const file = path.join(process.cwd(), 'ops/release-evidence.json');
const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
const id = String(args.get('--gate') || '');
const current = evidence.gates?.[id];
if (!current) throw new Error('Gate desconhecido.');
const next = {
  state: String(args.get('--state') || ''), owner: String(args.get('--owner') || ''),
  timestamp: String(args.get('--timestamp') || new Date().toISOString()), reference: String(args.get('--reference') || ''),
  environment: String(args.get('--environment') || ''), origin: String(args.get('--origin') || ''),
  result: String(args.get('--result') || 'passed'), notes: args.get('--notes') ? String(args.get('--notes')) : null
};
const checked = validateGateEvidence(id, next);
if (checked.problems.length) throw new Error(checked.problems.join('; '));
if (next.state !== 'failed' && current.state !== 'failed' && STATE_RANK[next.state] < STATE_RANK[current.state]) throw new Error('Regressão de estado exige correção manual revisada.');
evidence.gates[id] = next;
evidence.updatedAt = new Date().toISOString();
fs.writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Gate ${id} registrado como ${next.state}. Execute npm run check:evidence.`);
