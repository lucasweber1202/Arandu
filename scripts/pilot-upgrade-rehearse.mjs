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
function sql(args,url=local.href,{expectFailure=false,expectedError='legacy art data present',input}={}) {
 const r=spawnSync('psql',[url,'-X','-v','ON_ERROR_STOP=1',...args],{encoding:'utf8',input,maxBuffer:32*1024*1024});
 if(expectFailure){if(r.status===0||!r.stderr?.includes(expectedError))throw new Error('Destructive gate did not refuse the fixture as expected.');return;}
 if(r.error||r.status!==0)throw new Error(`Local rehearsal failed (${r.error?.code||'SQL'}); no hosted database was touched.`);
 return r.stdout.trim();
}
function file(f){sql(['-f',f]);}
function bundle(after,stop) {
 const args=['scripts/build-supabase-migration-bundle.mjs','--flow=existingDatabase',`--after-schema=${after}`,...(stop?[`--stop-before=${stop}`]:[]),'--stdout'];
 const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:8*1024*1024});
 if(r.error||r.status!==0||!r.stdout)throw new Error('Reviewed upgrade bundle unavailable.');
 return r.stdout;
}
let created=false;
try {
 sql(['-c',`create database ${db}`],base);created=true;
 file('tests/database/bootstrap.sql');
 for(const f of manifest.cleanInstall.slice(0,index+1))file(f);
 if(sql(['-Atc',"select value from public.fin_settings where key='schema_version'"])!==marker)throw new Error('Baseline marker mismatch.');
 // Existing financial records plus the old Auth trigger must survive.
 sql(['-c',`insert into auth.users(id,email) values('78000000-0000-4000-8000-000000000001','upgrade-owner@example.invalid');
 insert into public.fin_organizations(id,legal_name,kind,created_by) values('78000000-0000-4000-8000-000000000010','Synthetic preserved upgrade org','BUYER','78000000-0000-4000-8000-000000000001');
 insert into public.fin_members(organization_id,user_id,role) values('78000000-0000-4000-8000-000000000010','78000000-0000-4000-8000-000000000001','admin');
 insert into public.fin_tasks(id,organization_id,title,created_by) values('78000000-0000-4000-8000-000000000020','78000000-0000-4000-8000-000000000010','Synthetic preserved upgrade task','78000000-0000-4000-8000-000000000001');`]);
 // Inject an actual SQL failure inside the compiler's first atomic migration.
 // Neither its DDL nor marker may survive; resume uses the observed old marker.
 // Compile to stdout only: no persistent generated bundle in the worktree.
 const atomic=bundle(marker,manifest.cleanInstall[index+2]);
 if(!/^commit;$/mi.test(atomic))throw new Error('Atomic first stage unavailable.');
 const failedSql=atomic.replace(/^commit;$/mi,'select 1/0;\ncommit;');
 sql(['-c',failedSql],local.href,{expectFailure:true,expectedError:'division by zero'});
 if(sql(['-Atc',"select value from public.fin_settings where key='schema_version'"])!==marker)throw new Error('Failed migration changed resume marker.');
 sql(['-f','-'],local.href,{input:bundle(marker,boundary)});
 file('tests/database/legacy-art-fixture.sql');
 file('tests/database/legacy-art-decommission-before.sql');
 const beforeRefusal=sql(['-Atc',"select value from public.fin_settings where key='schema_version'"]);
 sql(['-f',boundary],local.href,{expectFailure:true});
 if(sql(['-Atc',"select value from public.fin_settings where key='schema_version'"])!==beforeRefusal)throw new Error('Refused retirement changed marker.');
 // ONLY synthetic local fixtures: this acknowledgement is never sent to Pilot.
 sql(['-c',"set arandu.legacy_art_decommission_ack='export-verified:local-synthetic-fixture'",'-f',boundary]);
 file('tests/database/legacy-art-decommission.sql');
 const retiredMarker=sql(['-Atc',"select value from public.fin_settings where key='schema_version'"]);
 sql(['-f','-'],local.href,{input:bundle(retiredMarker)});
 for(const f of ['financial-value-realization','financial-fee-intelligence','financial-opportunity-engine','financial-document-intelligence','financial-provider-qualification','financial-implementation','financial-covenants','financial-provider-performance','financial-spend-intelligence','financial-opportunity-discriminator'])file(`tests/database/${f}.sql`);
 file('tests/database/financial-privilege-revalidation.sql');
 sql(['-c',`do $$begin
 if not exists(select 1 from public.fin_tasks where id='78000000-0000-4000-8000-000000000020' and title='Synthetic preserved upgrade task') then raise exception 'Existing financial task lost';end if;
 if not exists(select 1 from public.fin_members where organization_id='78000000-0000-4000-8000-000000000010' and user_id='78000000-0000-4000-8000-000000000001' and role='admin') then raise exception 'Existing membership lost';end if;
 if to_regclass('public.profiles') is not null then raise exception 'Legacy Auth dependency remains';end if;
 end $$;
 insert into auth.users(id,email) values('78000000-0000-4000-8000-000000000002','upgrade-new-user@example.invalid');`]);
 file('ops/sql/pilot-isolation-canary.sql');
 const final=sql(['-Atc',"select value from public.fin_settings where key='schema_version'"]);
 const expected=markers(manifest.cleanInstall.at(-1)).at(-1);
 if(final!==expected)throw new Error('Final schema marker mismatch.');
 const pending=manifest.existingDatabase.slice(manifest.existingDatabase.findIndex(f=>markers(f).includes(final))+1);
 if(pending.length)throw new Error('Migrations remain pending.');
 console.log(`Local upgrade rehearsal passed: ${marker} → ${final}; atomic failure/resume, destructive refusal with stable marker, financial data/membership preservation, old/new Auth trigger, privilege revocation, synthetic-fixture decommission, capability SQL suites and canary; zero pending migrations.`);
} finally {if(created)sql(['-c',`drop database ${db}`],base);}
