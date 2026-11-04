import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {projectDocumentVersions} from '../lib/api/domains/finance-documents.mjs';
const documents=Array.from({length:100},(_,id)=>({id,title:`Synthetic ${id}`}));
const versions=Array.from({length:500},(_,i)=>({document_id:i%100,version:500-i}));
const previous=(docs,rows)=>(docs||[]).map(doc=>({...doc,versions:(rows||[]).filter(row=>row.document_id===doc.id)}));
for(const [docs,rows] of [[documents,versions],[[],[]],[null,null],[documents,[...versions,{document_id:999,version:1}]]])assert.deepEqual(projectDocumentVersions(docs,rows),previous(docs,rows));
function sample(fn){for(let i=0;i<50;i++)fn(documents,versions);const times=[];for(let i=0;i<500;i++){const start=performance.now();fn(documents,versions);times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {median_ms:times[250],p95_ms:times[475]};}
console.log(JSON.stringify({scope:'Synthetic in-process projection only; not API or hosted latency',documents:100,versions:500,samples:500,before:sample(previous),after:sample(projectDocumentVersions),before_version_checks:50000,after_version_visits:500,equivalent:true},null,2));
