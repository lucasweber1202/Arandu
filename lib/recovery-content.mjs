// Private logical content reconciliation. No row or secret is logged/persisted.
// Keyed multiset hashing preserves duplicates and ignores physical row order.
// The per-export key is encrypted to the SAME age recipient in the manifest.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { parseCounts } from './recovery-reconciliation.mjs';

export const CONTENT_FINGERPRINT_VERSION = 1;
const MODULUS = 1n << 256n;
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = () => { throw new Error('Content reconciliation failed; private details omitted.'); };
export const contentKey = () => randomBytes(32);
export function encryptedContentKey(key, recipient, env) {
  const r=spawnSync('age',['--encrypt','--recipient',recipient],{env:{PATH:env.PATH},input:key,timeout:30000,maxBuffer:65536});
  if(r.error||r.status!==0||r.stdout.length<128)fail();
  return r.stdout.toString('base64');
}
export function decryptedContentKey(ciphertext, identity, env) {
  if(typeof ciphertext!=='string'||ciphertext.length>8192||!ciphertext.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext))fail();
  const r=spawnSync('age',['--decrypt','--identity',identity],{env:{PATH:env.PATH},input:Buffer.from(ciphertext,'base64'),timeout:30000,maxBuffer:65536});
  if(r.error||r.status!==0||r.stdout.length!==32)fail();
  return r.stdout;
}
export function parseContent(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))fail();
  const counts={};
  for(const [table,row] of Object.entries(value)) {
    if(!row||!Number.isSafeInteger(row.rows)||row.rows<0||!/^[a-f0-9]{64}$/.test(row.sha256||''))fail();
    counts[table]=row.rows;
  }
  const sorted=parseCounts(JSON.stringify(counts));
  return Object.fromEntries(Object.keys(sorted).map(table=>[table,{rows:sorted[table],sha256:value[table].sha256}]));
}
export const contentDigest = value => digest(JSON.stringify(parseContent(value)));
export function contentAccumulator(counts, key) {
  if(!Buffer.isBuffer(key)||key.length!==32)fail();
  const expected=parseCounts(JSON.stringify(counts));
  const state=new Map(Object.keys(expected).map(t=>[t,{rows:0,sum:0n}]));
  return {
    consume(line) {
      const split=line.indexOf('\t');
      const table=line.slice(0,split), text=line.slice(split+1), row=state.get(table);
      if(split<0||!row||Buffer.byteLength(text)>64*1024*1024)fail();
      // Validate without reserializing: JS would round large numeric values.
      let value;try{value=JSON.parse(text);}catch{fail();}
      if(!value||typeof value!=='object'||Array.isArray(value))fail();
      const hash=createHmac('sha256',key).update('arandu-row-v1\0').update(table).update('\0').update(text).digest('hex');
      row.sum=(row.sum+BigInt('0x'+hash))%MODULUS;row.rows++;
    },
    finish() {
      return Object.fromEntries([...state].map(([table,row])=>{
        if(row.rows!==expected[table])fail();
        const hash=createHmac('sha256',key).update(`arandu-table-v1\0${table}\0${row.rows}\0${row.sum.toString(16).padStart(64,'0')}`).digest('hex');
        return [table,{rows:row.rows,sha256:hash}];
      }));
    }
  };
}
export function contentQueries(counts) {
  const tables=Object.keys(parseCounts(JSON.stringify(counts)));
  return `set local timezone='UTC'; set local datestyle='ISO, YMD'; set local intervalstyle='postgres'; set local extra_float_digits=3; set local bytea_output='hex';\n`+
    tables.map(table=>`select '${table}'||chr(9)||to_jsonb(r)::text from ${table.split('.').map(p=>'"'+p.replaceAll('"','""')+'"').join('.')} r;`).join('\n');
}
export async function fingerprintContent(env, counts, key) {
  const acc=contentAccumulator(counts,key);
  const p=spawn('psql',['-XqAt','-v','ON_ERROR_STOP=1','-f','-'],{env,stdio:['pipe','pipe','ignore']});
  const done=new Promise((resolve,reject)=>{p.once('error',reject);p.once('close',code=>code===0?resolve():reject(new Error('content stream')));});
  p.stdin.on('error',()=>{});
  p.stdin.end(`begin isolation level repeatable read read only; set local row_security=off;\n${contentQueries(counts)}\ncommit;\n`);
  try {
    for await(const line of createInterface({input:p.stdout,crlfDelay:Infinity}))if(line)acc.consume(line);
    await done;return acc.finish();
  } catch {p.kill('SIGKILL');await done.catch(()=>{});fail();}
}
export function compareContent(source,target) {
  const a=parseContent(source),b=parseContent(target),differences=[];
  for(const table of new Set([...Object.keys(a),...Object.keys(b)])) {
    if(!a[table]||!b[table]||a[table].rows!==b[table].rows||a[table].sha256!==b[table].sha256)differences.push({table,kind:'content_mismatch'});
  }
  return {result:differences.length?'MISMATCH':'MATCH',differences};
}
