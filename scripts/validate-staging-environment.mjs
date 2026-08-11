#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { inspectStagingEnvironment } from '../lib/staging-safety.mjs';

const result = inspectStagingEnvironment();
const report = { classification: 'staging_preflight', generatedAt: new Date().toISOString(), result: result.ok ? 'passed' : 'failed', ...result.summary, problems: result.problems };
fs.mkdirSync(path.join(process.cwd(), 'reports'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'reports/staging-environment.json'), JSON.stringify(report, null, 2));
console.log(`Arandu Staging Environment: ${result.ok ? 'APROVADO' : 'BLOQUEADO'}`);
result.problems.forEach((problem) => console.error(`- ${problem}`));
if (!result.ok) process.exit(1);
