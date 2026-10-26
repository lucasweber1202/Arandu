// Exclusive disposable real Supabase lab. No hosted URL, credential or data is used.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
process.chdir(root);
const state=fs.mkdtempSync(path.join(os.tmpdir(),'arandu-codex-financial-'));
const project=`arandu-codex-financial-${crypto.randomBytes(4).toString('hex')}`;
const output=path.resolve(process.env.ARANDU_FINANCIAL_LAB_REPORT||'reports/financial-lab.json');
const children=[];
const scope=process.env.ARANDU_FINANCIAL_LAB_SCOPE||'financial';
if(!['financial','provider'].includes(scope))throw Error('Unknown local lab scope');
if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Node 24 is required');
const env={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const docker=['--host=unix:///var/run/docker.sock'];
const exec=(command,args,options={})=>{
 const r=spawnSync(command,args,{cwd:root,env,encoding:'utf8',maxBuffer:32*1024*1024,...options});
 if(r.error||r.status!==0){fs.appendFileSync(path.join(state,'commands.log'),String(r.stderr||r.error)+'\n',{mode:0o600});throw Error(`${command} failed (${r.status ?? 'spawn'}); inspect private lab log`);}
 return r.stdout;
};
// Fail before creating credentials or containers when a prerequisite is absent.
for(const [name,command,args] of [
 ['DOCKER_UNAVAILABLE','docker',[...docker,'info','--format','{{.ServerVersion}}']],
 ['COMPOSE_UNAVAILABLE','docker',[...docker,'compose','version']],
 ['TLS_TOOL_UNAVAILABLE','openssl',['version']]
]){
 const probe=spawnSync(command,args,{cwd:root,env,encoding:'utf8',timeout:15000});
 if(probe.error||probe.status!==0){
  const result={schema:1,scope,status:'NOT_RUN',reason:name,coverage:{postgresql:'NOT_RUN',auth_rls:'NOT_RUN',storage:'NOT_RUN',browser:'NOT_RUN',hosted:'NOT_RUN'},teardown:'NOT_NEEDED'};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));process.exit(2);
 }
}
const secret=crypto.randomBytes(32).toString('hex');
const jwt=role=>{const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400})).toString('base64url');return `${head}.${body}.${crypto.createHmac('sha256',secret).update(`${head}.${body}`).digest('base64url')}`;};
Object.assign(env,{JWT_SECRET:secret,PGPW:crypto.randomBytes(18).toString('hex'),ANON_KEY:jwt('anon'),SERVICE_KEY:jwt('service_role'),CRON_SECRET:crypto.randomBytes(32).toString('hex'),PILOT_LOCAL_DB_IMAGE:'postgres:16.15-bookworm',PILOT_LOCAL_AUTH_IMAGE:'supabase/gotrue:v2.181.0',PILOT_LOCAL_REST_IMAGE:'postgrest/postgrest:v12.2.9',PILOT_LOCAL_STORAGE_IMAGE:'supabase/storage-api:v1.25.3'});
const original=['compose','-p',project,'-f','scripts/pilot-local/docker-compose.yml'];
const config=JSON.parse(exec('docker',[...docker,...original,'config','--format','json']));
for(const [name,service] of Object.entries(config.services)){
 delete service.ports;
 if(name==='auth')Object.assign(service.environment,{API_EXTERNAL_URL:'https://localhost:8459/auth/v1',GOTRUE_SITE_URL:'https://localhost:4459'});
}
delete config.services.db.command;
config.networks={default:{internal:true}};
const runtime=path.dirname(path.dirname(process.execPath));
config.services.lab={image:'postgres:16.15-bookworm',entrypoint:process.execPath,working_dir:root,command:['scripts/financial-lab/worker.mjs'],volumes:[`${root}:${root}:ro`,`${state}:${state}`,`${runtime}:${runtime}:ro`],environment:{PGPASSWORD:env.PGPW,SUPABASE_URL:'https://localhost:8459',SUPABASE_ANON_KEY:env.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:env.SERVICE_KEY,ARANDU_SITE_URL:'https://localhost:4459',ARANDU_ENV:'pilot',CRON_SECRET:env.CRON_SECRET,PILOT_LOCAL_CERT_DIR:state,PILOT_LOCAL_APP_PORT:'4459',NODE_EXTRA_CA_CERTS:path.join(state,'cert.pem'),PILOT_APP_URL:'https://localhost:4459',PILOT_DB_URL:`postgresql://postgres:${env.PGPW}@db:5432/postgres`,ARANDU_FINANCIAL_LAB:'1',ARANDU_FINANCIAL_LAB_SCOPE:scope,PILOT_REPORT:path.join(state,'journey.md')}};
const configPath=path.join(state,'compose.json');fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
const compose=[...docker,'compose','-p',project,'-f',configPath];
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{for(const child of children)child.kill('SIGTERM');});
const report={schema:1,scope,sha:exec('git',['rev-parse','HEAD']).trim(),coverage:{postgresql:'NOT_RUN',auth_rls:'NOT_RUN',storage:'NOT_RUN',browser:'NOT_RUN',hosted:'NOT_RUN'},status:'NOT_RUN',project};
const db=(sql,user='postgres')=>exec('docker',[...compose,'exec','-T','-e',`PGPASSWORD=${env.PGPW}`,'db','psql','-h','localhost','-U',user,'-d','postgres','-X','-q','-v','ON_ERROR_STOP=1','-c',sql]);
async function ready(test,label){for(let n=0;n<60;n++){try{if(await test())return;}catch{} await new Promise(r=>setTimeout(r,1000));}throw Error(`${label} not ready`);}
try{
 exec('docker',[...compose,'up','-d','db']);
 await ready(()=>{db('select 1');return true;},'PostgreSQL');
 db(fs.readFileSync('scripts/financial-lab/bootstrap.sql','utf8'));
 db(`alter user authenticator with password '${env.PGPW}';alter user supabase_auth_admin with password '${env.PGPW}';alter user supabase_storage_admin with password '${env.PGPW}';alter user postgres with password '${env.PGPW}';`);
 exec('docker',[...compose,'up','-d','auth','rest','storage']);
 exec('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(state,'key.pem'),'-out',path.join(state,'cert.pem'),'-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1']);
 const log=fs.openSync(path.join(state,'worker.log'),'w');
 const journey=spawn('docker',[...compose,'run','--rm','--no-deps','lab'],{cwd:root,env,stdio:['ignore',log,log]});
 children.push(journey);
 const code=await new Promise((resolve,reject)=>{journey.on('error',reject);journey.on('exit',resolve);});
 if(fs.existsSync(path.join(state,'postgresql.pass')))report.coverage.postgresql='PASS';
 if(code!==0){fs.writeFileSync(path.join(state,'services.log'),exec('docker',[...compose,'logs','--no-color','--tail','100']),{mode:0o600});throw Error('Real journey failed; inspect private worker/journey logs');}
 report.coverage.auth_rls='PASS';report.coverage.storage=scope==='financial'?'PASS':'NOT_RUN';report.status='PASS';
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(path.join(state,'journey.md'),output.replace(/\.json$/,'.md'));
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;}
finally{
 for(const child of children)child.kill('SIGTERM');
 try{
  exec('docker',[...compose,'down','--volumes','--remove-orphans']);
  for(const command of [['ps','-a','-q'],['volume','ls','-q'],['network','ls','-q']]){
   if(exec('docker',[...docker,...command,'--filter',`label=com.docker.compose.project=${project}`]).trim())throw Error('Residual lab resources');
  }
  report.teardown='PASS';
 }catch{report.teardown='FAIL';report.status='FAIL';process.exitCode=1;}
 report.privateLogs=state;
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,coverage:report.coverage,teardown:report.teardown,report:output}));
}
