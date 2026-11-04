#!/usr/bin/env node
// Explicit installation selection before starting any local containers.
import fs from 'node:fs';
import { financialBaselineFiles } from '../lib/migration-baseline.mjs';
const flow=process.env.PILOT_LOCAL_INSTALL_FLOW||'cleanInstall';
const manifest=JSON.parse(fs.readFileSync('docs/supabase-migrations.json','utf8'));
if(!['cleanInstall','financialBaseline'].includes(flow)) throw new Error('Local install flow must be cleanInstall or financialBaseline; existing databases require the reviewed upgrade path.');
const files=flow==='financialBaseline'?financialBaselineFiles(process.cwd(),manifest):manifest.cleanInstall;
if(!Array.isArray(files)||!files.length) throw new Error('Empty local installation plan');
for(const file of files) if(!fs.existsSync(file)) throw new Error('Local installation file missing');
process.stdout.write(files.join('\n')+'\n');
