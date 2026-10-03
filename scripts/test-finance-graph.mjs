import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { graphFilters, graphHref } from '../lib/finance/graph.mjs';
process.env.SUPABASE_URL='https://example.invalid';
process.env.SUPABASE_ANON_KEY='anon';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG='00000000-0000-4000-8000-000000000101', ACTOR='00000000-0000-4000-8000-000000000102', OTHER='00000000-0000-4000-8000-000000000103', ROOT='00000000-0000-4000-8000-000000000104';
// -------------------------------------------------------------------- API
let sent = [];
let responder = () => [];
globalThis.fetch = async (url, options = {}) => {
  const entry = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, authorization: options.headers?.Authorization, apikey: options.headers?.apikey };
  sent.push(entry);
  const result = responder(entry);
  if (result instanceof Error) {
    return new Response(JSON.stringify({ message: result.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const reset = (handler = () => []) => { sent = []; responder = handler; };
const deps = { requireUser: async () => ({ user: { id: ACTOR }, accessToken: 'user-jwt', headers: {} }), enforceRateLimit: async () => {} };
function request(method, url, body) {
  const stream = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  return Object.assign(stream, { method, url, headers: {} });
}
async function call(method, path, { body = null, url = null } = {}) {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.payload = JSON.parse(value); } };
  await handleFinance(request(method, url || `/api/finance/${path}`, body), res, path, deps);
  return res;
}
async function rejects(method, path, options, status, code = null) {
  await assert.rejects(() => call(method, path, options), (error) => {
    assert.equal(error.status, status, `${path}: esperado ${status}, recebido ${error.status} (${error.message})`);
    if (code) assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /fin_|postgres|supabase|select |relation/i, 'mensagem crua do banco vazou');
    return true;
  });
}
const buyer = (entry) => (entry.url.includes('fin_organizations?select=id') ? [{ id: ORG, legal_name: 'Grupo', kind: 'BUYER' }] : null);
const provider = (entry) => (entry.url.includes('fin_organizations?select=id') ? [{ id: ORG, legal_name: 'Banco', kind: 'PROVIDER' }] : null);


assert.deepEqual(graphFilters(new URLSearchParams()).p_limit,20);
for(const query of ['limit=0','limit=51','offset=-1','offset=5001','kind=secret','legal_entity_id=x','q=a','due_before=2026-02-30','status=x%26select=*','limit=NaN']) assert.equal(graphFilters(new URLSearchParams(query)),null,query);
assert.equal(graphHref({object_type:'passport_snapshot',rfq_id:ROOT}),`/finance/rfq.html?id=${ROOT}`);
assert.equal(graphHref({object_type:'rfq',object_id:'javascript:alert(1)'}),null);
const url = `/api/finance/graph/provider?organization_id=${ORG}&id=${ROOT}`;
const path='graph/provider';
reset(()=>[]);await rejects('GET',path,{url},403);assert(!sent.some(e=>e.url.includes('rpc/')));
reset(provider);await rejects('GET',path,{url},400,'organization_kind');
reset(e=>buyer(e)??[]);await rejects('GET',path,{url},403,'forbidden');
reset(e=>buyer(e)??(e.url.includes('fin_members')?[{role:'admin'}]:new Error('graph root unavailable')));
await rejects('GET',path,{url},404,'not_found');
await rejects('GET',path,{url:url+'&limit=51'},400,'invalid_graph_query');
assert.equal(sent.filter(e=>e.url.includes('rpc/')).length,1,'invalid filter never queries graph');
reset(e=>buyer(e)??(e.url.includes('fin_members')?[{role:'viewer'}]:Array.from({length:3},(_,i)=>({object_type:'contract',object_id:String(i)}))));
const res=await call('GET',path,{url:url+'&kind=contract&limit=2&offset=4&legal_entity_id='+OTHER+'&due_before=2027-01-01'});
assert.equal(res.payload.rows.length,2);assert.equal(res.payload.has_more,true);assert.equal(res.payload.next_offset,6);
const graph=sent.find(e=>e.url.includes('rpc/fin_query_graph'));
assert.deepEqual(graph.body,{p_org:ORG,p_root_type:'provider',p_root:ROOT,p_kind:'contract',p_entity:OTHER,p_status:null,p_query:null,p_due_before:'2027-01-01',p_limit:2,p_offset:4});
assert(sent.every(e=>e.authorization==='Bearer user-jwt'&&e.apikey==='anon'),'only user JWT, never service role');
console.log('Financial Graph: filters, pagination, root/tenant/role rejection, redaction and user JWT passed.');
