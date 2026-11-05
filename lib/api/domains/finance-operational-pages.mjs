import { createHash } from 'node:crypto';
import { HttpError } from '../../api-core.mjs';
import { UUID } from './finance-core.mjs';

const invalid = () => new HttpError(400,'Atualize a consulta e confira sua paginação.','invalid_operational_page');
export const validDay = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const validStamp = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && validDay(value.slice(0,10)) && Number.isFinite(Date.parse(value));
const validKey = (value,key) => value===null ? key.nullable===true
  : key.type==='uuid' ? typeof value==='string'&&UUID.test(value)
    : key.type==='date' ? validDay(value) : key.type==='timestamp' ? validStamp(value)
      : key.type==='integer' ? Number.isSafeInteger(value)&&value>=1&&value<=2147483647 : false;

// Scope is authorization context plus every effective filter, never a cache or
// a permission grant. Each page still reads under the caller JWT and live RLS.
export function operationalPage(params,scope,order,{defaultLimit=25,maxLimit=100}={}) {
  for(const key of ['limit','cursor'])if(params.getAll(key).length>1)throw invalid();
  const raw=params.get('limit');
  const limit=raw===null?defaultLimit:Number(raw);
  if(raw!==null&&(!/^[1-9]\d{0,2}$/.test(raw)||limit>maxLimit))throw invalid();
  const scopeHash=createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  let cursor=null;
  if(params.has('cursor')) {
    const raw=params.get('cursor');
    if(!raw||raw.length>4096||!/^[A-Za-z0-9_-]+$/.test(raw))throw invalid();
    try {
      cursor=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));
      if(cursor.version!==1||cursor.scope!==scopeHash||!Array.isArray(cursor.keys)||cursor.keys.length!==order.length
        ||!cursor.keys.every((v,i)=>validKey(v,order[i])))throw invalid();
    } catch {throw invalid();}
  }
  return {limit,scopeHash,cursor,order};
}

export function orderedPageFilters(controls) {
  const {limit,order,cursor}=controls;
  const filters=new URLSearchParams({order:order.map(k=>`${k.name}.${k.direction}${k.nullable?'.nullslast':''}`).join(','),limit:String(limit+1)});
  if(cursor) {
    const branches=[];
    const equal=(key,value)=>`${key.name}.${value===null?'is.null':`eq.${value}`}`;
    for(let i=0;i<order.length;i++) {
      const key=order[i],value=cursor.keys[i];
      if(value===null)continue;
      const prefix=order.slice(0,i).map((k,j)=>equal(k,cursor.keys[j]));
      for(const term of [`${key.name}.${key.direction==='desc'?'lt':'gt'}.${value}`,...(key.nullable?[`${key.name}.is.null`]:[])]) {
        const terms=[...prefix,term];branches.push(terms.length===1?terms[0]:`and(${terms.join(',')})`);
      }
    }
    if(!branches.length)throw invalid();
    filters.set('or',`(${branches.join(',')})`);
  }
  return filters;
}

export function operationalPageResult(fetched,controls) {
  if(!Array.isArray(fetched))throw new HttpError(502,'A fonte não retornou uma página válida. Tente novamente.','invalid_operational_response');
  const rows=fetched.slice(0,controls.limit),hasMore=fetched.length>controls.limit,last=rows.at(-1);
  let cursor=null;
  if(hasMore&&last) {
    const keys=controls.order.map(k=>last[k.name]);
    if(!keys.every((v,i)=>validKey(v,controls.order[i])))throw new HttpError(502,'A fonte não retornou uma ordem válida. Tente novamente.','invalid_operational_response');
    cursor=Buffer.from(JSON.stringify({version:1,scope:controls.scopeHash,keys})).toString('base64url');
  }
  return {rows,page:{limit:controls.limit,has_more:hasMore,next_cursor:cursor},consistency:'live_reads_not_transaction_snapshot'};
}

export const CREATED_DESC=Object.freeze([{name:'created_at',direction:'desc',type:'timestamp'},{name:'id',direction:'desc',type:'uuid'}]);
export const DUE_ASC=Object.freeze([{name:'due_on',direction:'asc',type:'date',nullable:true},{name:'id',direction:'asc',type:'uuid'}]);
