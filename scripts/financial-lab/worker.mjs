// Runs INSIDE the exclusive Docker network. No published ports or hosted URLs.
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
const state=process.env.PILOT_LOCAL_CERT_DIR,children=[];
const sql=(text,user='postgres')=>{
 const r=spawnSync('psql',['-h','db','-U',user,'-d','postgres','-X','-q','-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',env:process.env,maxBuffer:16*1024*1024});
 if(r.error||r.status!==0){fs.appendFileSync(path.join(state,'sql-error.log'),r.stderr||String(r.error),{mode:0o644});throw Error('Local SQL failed; inspect private SQL log');}
};
async function ready(test,label){for(let n=0;n<60;n++){try{if(await test())return;}catch{}await new Promise(r=>setTimeout(r,1000));}throw Error(`${label} not ready`);}
function server(file){const log=fs.openSync(path.join(state,path.basename(file)+'.log'),'a');const c=spawn(process.execPath,[file],{stdio:['ignore',log,log],env:process.env});children.push(c);}
try{
 await ready(async()=>{const a=await fetch('http://auth:9999/health'),s=await fetch('http://storage:5000/status');return a.ok&&s.ok;},'Auth/Storage');
 sql('grant usage on schema storage to anon, authenticated, service_role;grant all on all tables in schema storage to anon, authenticated, service_role;grant all on all sequences in schema storage to anon, authenticated, service_role;grant all on all functions in schema storage to anon, authenticated, service_role;alter default privileges in schema storage grant all on tables to anon, authenticated, service_role;','supabase_storage_admin');
 for(const f of JSON.parse(fs.readFileSync('docs/supabase-migrations.json','utf8')).cleanInstall){sql(fs.readFileSync(f,'utf8'));console.log(`Local migration: ${f}`);}
 fs.writeFileSync(path.join(state,'postgresql.pass'),'PASS');
 const probe=await fetch('http://storage:5000/object/upload/sign/fin-documents/local-signing-probe.pdf',{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60})});
 if(!probe.ok){const detail=await probe.json();fs.writeFileSync(path.join(state,'storage-error.json'),JSON.stringify({status:probe.status,message:detail.message,error:detail.error}),{mode:0o644});throw Error('Real Storage signing failed; inspect private storage error');}

 server('scripts/financial-lab/gateway.mjs');server('scripts/pilot-local/app-server.mjs');
 await ready(async()=>{const r=await fetch('https://localhost:4459/api/health');return r.ok;},'Arandu');
 const c=spawn(process.execPath,[process.env.ARANDU_FINANCIAL_LAB_SCOPE==='provider'?'scripts/financial-lab/provider-journey.mjs':'scripts/pilot-local/journey.mjs'],{env:process.env,stdio:['ignore',fs.openSync(path.join(state,'journey.log'),'w'),fs.openSync(path.join(state,'journey-error.log'),'w')]});children.push(c);
 const code=await new Promise((resolve,reject)=>{c.on('error',reject);c.on('exit',resolve);});
 if(code!==0)throw Error('Real journey failed; inspect private journey log');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{for(const c of children)c.kill('SIGTERM');for(const f of ['sql-error.log','journey.md','postgresql.pass']){const p=path.join(state,f);if(fs.existsSync(p))fs.chmodSync(p,0o644);}}
