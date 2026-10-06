// Disposable LOCAL rehearsal only. This never accepts a hosted connection.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const base=process.env.ARANDU_DATABASE_TEST_URL||'postgresql://postgres:postgres@localhost:5432/postgres';
const target=new URL(base);
if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw new Error('Rehearsal accepts only a local disposable PostgreSQL server.');
const marker=process.argv.find(a=>a.startsWith('--after-schema='))?.slice(15)||'financial-surface-hardening-1';
const manifest=JSON.parse(fs.readFileSync('docs/supabase-migrations.json','utf8'));
const markers=file=>[...fs.readFileSync(file,'utf8').matchAll(/\(\s*'schema_version'\s*,\s*'([^']+)'\s*\)/g)].map(m=>m[1]);
const index=manifest.cleanInstall.findIndex(f=>markers(f).includes(marker));
if(index<0)throw new Error('Unknown rehearsal marker.');
const boundary='docs/supabase-financial-legacy-art-decommission.sql';
const boundaryIndex=manifest.cleanInstall.indexOf(boundary);
if(index>=boundaryIndex)throw new Error('Rehearse requires a marker before the destructive boundary.');
const db=`arandu_rehearsal_${randomBytes(6).toString('hex')}`;
const local=new URL(base);local.pathname=`/${db}`;
function sql(args,url=local.href,{expectFailure=false}={}) {
 const r=spawnSync('psql',[url,'-X','-v','ON_ERROR_STOP=1',...args],{encoding:'utf8',maxBuffer:32*1024*1024});
 if(expectFailure){if(r.status===0||!r.stderr?.includes('legacy art data present'))throw new Error('Destructive gate did not refuse the fixture as expected.');return;}
 if(r.error||r.status!==0)throw new Error(`Local rehearsal failed (${r.error?.code||'SQL'}); no hosted database was touched.`);
 return r.stdout.trim();
}
function file(f){sql(['-f',f]);}
let created=false;
try {
 sql(['-c',`create database ${db}`],base);created=true;
 file('tests/database/bootstrap.sql');
 for(const f of manifest.cleanInstall.slice(0,index+1))file(f);
 if(sql(['-Atc',"select value from public.fin_settings where key='schema_version'"])!==marker)throw new Error('Baseline marker mismatch.');
 for(const f of manifest.cleanInstall.slice(index+1,boundaryIndex))file(f);
 file('tests/database/legacy-art-fixture.sql');
 file('tests/database/legacy-art-decommission-before.sql');
 sql(['-f',boundary],local.href,{expectFailure:true});
 // ONLY synthetic local fixtures: this acknowledgement is never sent to Pilot.
 sql(['-c',"set arandu.legacy_art_decommission_ack='export-verified:local-synthetic-fixture'",'-f',boundary]);
 file('tests/database/legacy-art-decommission.sql');
 for(const f of manifest.cleanInstall.slice(boundaryIndex+1))file(f);
 for(const f of ['financial-value-realization','financial-fee-intelligence','financial-opportunity-engine','financial-document-intelligence','financial-provider-qualification','financial-implementation','financial-covenants','financial-provider-performance','financial-spend-intelligence','financial-opportunity-discriminator'])file(`tests/database/${f}.sql`);
 file('ops/sql/pilot-isolation-canary.sql');
 const final=sql(['-Atc',"select value from public.fin_settings where key='schema_version'"]);
 const expected=markers(manifest.cleanInstall.at(-1)).at(-1);
 if(final!==expected)throw new Error('Final schema marker mismatch.');
 const pending=manifest.existingDatabase.slice(manifest.existingDatabase.findIndex(f=>markers(f).includes(final))+1);
 if(pending.length)throw new Error('Migrations remain pending.');
 console.log(`Local upgrade rehearsal passed: ${marker} → ${final}; destructive refusal, synthetic-fixture decommission, capability SQL suites and canary; zero pending migrations.`);
} finally {if(created)sql(['-c',`drop database ${db}`],base);}
