#!/usr/bin/env node
// Reproducible metadata-only evidence. No connection or row content is read.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { financialBaselineFiles } from '../lib/migration-baseline.mjs';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync('docs/supabase-migrations.json','utf8'));
financialBaselineFiles(root, manifest);
const refs = ['igacnfjeuqhxcmfyepgj','offgpyysgdhfemjlchod'];
const snapshots = refs.map(ref => JSON.parse(fs.readFileSync(`ops/consolidation/hosted-audit-2026-11-04-${ref}.json`,'utf8')));
const baseline = fs.readFileSync('docs/baselines/financial-v1.sql','utf8');
const retirement = fs.readFileSync('docs/supabase-financial-legacy-art-decommission.sql','utf8');
const shared = new Set(['api_rate_limits','transactional_email_outbox','consume_rate_limit',
  'claim_transactional_email_batch','claim_transactional_email_batch_v2','complete_transactional_email',
  'complete_transactional_email_v2','fail_transactional_email','fail_transactional_email_v2']);
const retired = new Set([...retirement.matchAll(/'([a-z_]+)'/g)].map(m=>m[1]));
for (const m of retirement.matchAll(/public\.([a-z_]+)/g)) retired.add(m[1]);
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
const runtime = ['api','lib'].flatMap(walk).filter(f=>/\.m?js$/.test(f)).map(file=>({file,lines:fs.readFileSync(file,'utf8').split('\n')}));
const historical = manifest.cleanInstall.map(file=>({file,lines:fs.readFileSync(file,'utf8').split('\n')}));
const occurrences = (files,name) => {
  const pattern=new RegExp(`\\b${name}\\b`);
  return files.flatMap(({file,lines})=>lines.flatMap((line,index)=>pattern.test(line)?[`${file}:${index+1}`]:[]));
};
const expected = [...baseline.matchAll(/^CREATE (TABLE|FUNCTION|VIEW) public\.([a-z_0-9]+)/gm)].map(m=>({kind:m[1].toLowerCase(),name:m[2]}));
const all = new Map(expected.map(o=>[`${o.kind}:${o.name}`,o]));
for(const {inventory} of snapshots) for(const [kind,key] of [['table','tables'],['function','routines'],['view','views']])
  for(const o of inventory[key]||[]) all.set(`${kind}:${o.name}`,{kind,name:o.name});
const matrix = [...all.values()].sort((a,b)=>(a.kind+':'+a.name).localeCompare(b.kind+':'+b.name)).map(({kind,name})=>{
  const locations=occurrences(runtime,name);
  const origin=occurrences(historical,name);
  const hosted=Object.fromEntries(snapshots.map(({ref,inventory})=>[ref,(inventory[kind==='table'?'tables':kind==='function'?'routines':'views']||[]).filter(o=>o.name===name)]));
  const classification = shared.has(name) ? 'SHARED_REQUIRED' : name==='profiles'||name==='fin_member_default_name' ? 'LEGACY_TRANSFORMED'
    : name.startsWith('fin_') ? 'FINANCIAL_IMPLEMENTED_NOT_HOSTED' : retired.has(name) ? 'LEGACY_UNUSED' : 'UNKNOWN';
  return {kind,name,classification,origin:origin.slice(0,8),current_consumers:locations,
    evidence: classification==='LEGACY_UNUSED' ? 'Explicit retirement list and financial runtime absence gate; not inferred from row counts. External consumers/retention remain UNKNOWN.'
      : classification==='FINANCIAL_IMPLEMENTED_NOT_HOSTED' ? 'Financial code exists; observed Pilot marker predates current contract. Catalog presence alone does not establish operational use.'
      : classification==='LEGACY_TRANSFORMED' ? 'Pilot member-name trigger dynamically reads profiles; final canonical function reads auth.users display metadata only.'
      : classification==='SHARED_REQUIRED' ? 'Financial API rate limiting, notification delivery or operational doctor uses shared infrastructure.' : 'Insufficient proof; preserve.',
    dependencies:snapshots.flatMap(({ref,inventory})=>[
      ...(inventory.foreign_keys||[]).filter(k=>k.table===name||k.target.replace(/^public\./,'')===name).map(k=>({ref,...k})),
      ...(inventory.triggers||[]).filter(t=>t.function===name||t.table===`public.${name}`).map(t=>({ref,...t}))]),
    dynamic_dependencies:'PL/pgSQL and external consumers are not completely represented by pg_depend; absence is not proof.',
    hosted,removal_impact:classification==='SHARED_REQUIRED'?'Breaks rate limiting or notification delivery':classification==='LEGACY_UNUSED'?'Destroys retained historical data; retention and external consumers not resolved':'Financial behavior or unresolved dependencies may break',
    destination:classification==='LEGACY_UNUSED'?'Preserve until classification, same-backup restore and specific approval; then explicit retirement without CASCADE':'Retain canonical implementation; upgrade only after recovery and authorization',
    acceptance:classification==='LEGACY_UNUSED'?'Verified same-backup restore, owner retention decision, specific deletion approval, dependency refusal and financial canary':'Catalog/ACL equivalence and negative tenant/role tests; real Auth/Storage and hosted journey remain separate gates'};
});
const securityDefiners = snapshots[1].inventory.routines.filter(r=>r.security_definer&&r.authenticated_execute).map(r=>({
  ...r,intent:['fin_has_role','fin_is_operator','fin_can_read_document','fin_provider_can_comment','fin_provider_reads_comment'].includes(r.name)?'authorization_helper':'authenticated_financial_rpc',
  source_evidence:occurrences(historical,r.name),runtime_evidence:occurrences(runtime,r.name),
  negative_test_locations:occurrences(walk('tests/database').filter(f=>/\.sql$/.test(f)).map(file=>({file,lines:fs.readFileSync(file,'utf8').split('\n')})),r.name),
  verdict:'Intentional definer pattern requires internal authorization; advisor is not proof of vulnerability or safety. Current-code SQL attacks do not validate old hosted function bodies.'
}));
const report={version:1,code_sha:process.env.ARANDU_AUDIT_CODE_SHA||'see evidence document',input_snapshots:snapshots.map(s=>({ref:s.ref,observed_at:s.observed_at,sha256:createHash('sha256').update(JSON.stringify(s)).digest('hex')})),
  hosted_changes:'NONE',classification_scope:'financial runtime and canonical schema; data retention and external consumers remain unresolved',
  summary:{components:matrix.length,by_class:matrix.reduce((a,x)=>(a[x.classification]=(a[x.classification]||0)+1,a),{}),authenticated_definers:securityDefiners.length},
  matrix,security_definers:securityDefiners,
  historical_required:manifest.cleanInstall.map(file=>({file,classification:'HISTORICAL_REQUIRED',purpose:'Upgrade, baseline provenance, recovery and rollback; retained in manifest'}))};
fs.writeFileSync('ops/consolidation/dependency-matrix-2026-11-04.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));
