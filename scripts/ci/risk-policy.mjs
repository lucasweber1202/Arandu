// Closed policy: unknown paths and policy changes require critical validation.
const rank={A:0,B:1,C:2,D:3};
export function classifyChanges(changes){
 if(!Array.isArray(changes)||changes.length===0)throw new Error('Changes unavailable');
 let risk='A';const reasons=[];
 for(const change of changes){
  if(!['added','modified','removed','renamed'].includes(change.status))throw new Error('Unknown change status');
  const paths=change.status==='renamed'?[change.filename,change.previous_filename]:[change.filename];
  for(const path of paths){
   if(typeof path!=='string'||!path||path.startsWith('/')||path.split('/').includes('..'))throw new Error('Invalid change path');
   let level='D';
   if(/^docs\/(?:guides|help)\/.+\.md$/.test(path))level='A';
   else if(/^finance\/(?:styles|assets)\//.test(path)&&/\.(?:css|svg|png|jpg|webp)$/.test(path))level='A';
   else if(/^finance\/src\/.+\.js$/.test(path)||/^tests\/e2e\/.+\.spec\.js$/.test(path))level='B';
   else if(/^lib\/api\/domains\/finance-(?:fee-imports|crm-institution)\.mjs$/.test(path))level='C';
   reasons.push({path,risk:level});if(rank[level]>rank[risk])risk=level;
  }
 }
 return {risk,reasons,required:risk==='A'?['static-build']:risk==='B'?['static-build','targeted-browser']:['static-build','database','deploy-boundaries','validate','presentation','demo-integration']};
}
export function evaluateGate({plan,results,expectedSha,actualSha}){
 if(!/^[a-f0-9]{40}$/.test(expectedSha||'')||expectedSha!==actualSha)throw new Error('Candidate SHA mismatch');
 if(!plan||!Array.isArray(plan.required)||!plan.required.length)throw new Error('Risk plan unavailable');
 const failed=plan.required.filter(name=>results?.[name]!=='success');
 if(failed.length)throw new Error(`Required checks incomplete: ${failed.join(', ')}`);
 return true;
}
