import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// A floor, not a prediction: the pinned Postgres pull already exhausted >20 GiB
// under vfs. Copying parent layers needs more headroom than overlay snapshots.
export function assessResources({driver,memoryMb,workspaceGiB,dockerGiB,minMemory=6000,minDisk=12}) {
 const issues=[];
 for(const value of [memoryMb,workspaceGiB,dockerGiB,minMemory,minDisk])if(!Number.isFinite(value)||value<0)issues.push('Leitura de recursos inválida; não iniciar download.');
 const requiredDisk=Math.max(driver==='vfs'?32:12,minDisk),requiredMemory=Math.max(6000,minMemory);
 if(!['overlay2','overlayfs','fuse-overlayfs','btrfs','zfs','vfs'].includes(driver))issues.push('Driver Docker não identificado ou sem política de capacidade validada.');
 if(memoryMb<requiredMemory)issues.push(`Memória insuficiente: ${memoryMb} MiB; mínimo ${requiredMemory}.`);
 if(workspaceGiB<Math.max(12,minDisk))issues.push(`Workspace sem espaço: ${workspaceGiB} GiB.`);
 if(dockerGiB<requiredDisk)issues.push(`Docker ${driver}: ${dockerGiB} GiB livres; mínimo ${requiredDisk}.`);
 return {ok:issues.length===0,driver,requiredDisk,requiredMemory,memoryMb,workspaceGiB,dockerGiB,issues};
}
export function inspectResources({root=process.cwd(),env=process.env,run=(file,args)=>execFileSync(file,args,{encoding:'utf8',env:{...env,LC_ALL:'C'},timeout:15000})}={}) {
 const endpoint=env.DOCKER_HOST||run('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}']).trim();
 if(!endpoint.startsWith('unix://'))throw new Error('Filesystem do daemon remoto não pode ser medido localmente; use um runner Docker local.');
 const info=JSON.parse(run('docker',['info','--format','{{json .}}']));
 if(!info.DockerRootDir?.startsWith('/'))throw new Error('DockerRootDir indisponível.');
 const free=directory=>{
  const line=run('df',['-Pk',directory]).trim().split('\n').at(-1);
  const fields=line.trim().split(/\s+/);const available=Number(fields[3]);
  if(fields.length<6||!Number.isFinite(available))throw new Error('Não foi possível medir o filesystem; não iniciar download.');
  return Math.floor(available/1048576);
 };
 const memory=readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)\s+kB$/m);
 const result=assessResources({driver:info.Driver,memoryMb:memory?Math.floor(Number(memory[1])/1024):NaN,workspaceGiB:free(root),dockerGiB:free(info.DockerRootDir),minMemory:Number(env.CI_DEMO_MIN_MEM_MB||6000),minDisk:Number(env.CI_DEMO_MIN_DISK_GB||12)});
 return {...result,dockerRoot:info.DockerRootDir};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try {
  const result=inspectResources();
  console.log(JSON.stringify(result,null,2));
  if(!result.ok){console.error('Laboratório bloqueado antes do pull. Não limpar imagens alheias, trocar driver ou repetir download; use capacidade suficiente.');process.exitCode=1;}
 }catch(error){console.error(`Preflight de recursos: ${error.message}`);process.exitCode=1;}
}
