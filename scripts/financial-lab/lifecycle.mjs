import crypto from 'node:crypto';
// All material operations use real Arandu HTTP APIs with the actor's session.
// SQL below is observation only. Auth/Storage are supplied by the real local lab.
export async function financialLifecycle({step,attack,api,ok,must,sql,people,ctx,today,addDays,upload}) {
 const state={};
 const post=async(who,resource,body)=>{
  for(let attempt=0;attempt<2;attempt++){
   const result=await api(who,'POST',`/api/finance/${resource}`,body);
   if(result.status!==429||attempt===1)return result;
   const seconds=result.retryAfterSeconds;
   if(!Number.isSafeInteger(seconds)||seconds<1||seconds>600)return result;
   // Respect the server's actual window. Never reset counters, switch persona,
   // reduce limits or replay an uncertain material write under another key.
   console.log(`Local journey backpressure: respecting Retry-After ${seconds}s`);
   let remaining=seconds*1000+250;
   while(remaining>0){const delay=Math.min(30000,remaining);await new Promise(r=>setTimeout(r,delay));remaining-=delay;}
  }
 };

 const buyer=people.buyer;
 await step('Contrato existente real: intenção, resposta descartada, recibo, retry, responsável e próxima ação',async()=>{
  state.provider=ok(await post(buyer,'providers',{organization_id:ctx.buyerOrg,name:'Contraparte externa sintética',kind:'bank'}),'counterparty').row.id;
  state.contractInput={organization_id:ctx.buyerOrg,provider_id:state.provider,product:'credit',title:'Contrato externo existente sintético',starts_on:today,ends_on:addDays(365),renewal_notice_days:60,currency:'BRL',terms:{},owner_id:people.buyer.id,request_key:crypto.randomUUID()};
  // Intentionally discard the successful body, as a client with response loss would.
  ok(await post(buyer,'contract-import',state.contractInput),'import');
  const receipt=ok(await api(buyer,'GET',`/api/finance/contract-import-result?organization_id=${ctx.buyerOrg}&request_key=${state.contractInput.request_key}`),'receipt');
  must(receipt.state==='confirmed'&&receipt.id&&receipt.owner_id===people.buyer.id,'receipt/owner');state.contract=receipt.id;
  const retry=ok(await post(buyer,'contract-import',state.contractInput),'retry');must(retry.id===state.contract&&retry.replayed,'retry identity');
  const detail=ok(await api(buyer,'GET',`/api/finance/contract-detail?id=${state.contract}`),'reread');must(detail.contract.id===state.contract,'exact reread');
  must(Number(sql(`select count(*) from public.fin_tasks where related_id='${state.contract}' and status='open'`))===1,'one renewal task');
  return 'real API + Auth + PostgreSQL/RLS; one contract, one task; response body discarded deliberately';
 });
 await attack('Contrato existente: outra instituição não lê recibo nem contrato', '403 receipt / 404 detail',async()=>{
  const r=await api(people.providerB,'GET',`/api/finance/contract-import-result?organization_id=${ctx.buyerOrg}&request_key=${state.contractInput.request_key}`);
  const d=await api(people.providerB,'GET',`/api/finance/contract-detail?id=${state.contract}`);
  return {ok:r.status===403&&d.status===404,observed:`${r.status}/${d.status}`};
 });
 await step('Proposta externa real: documento Storage, revisão e comparação sem autoria institucional presumida',async()=>{
  state.rfq=ok(await post(buyer,'rfqs',{organization_id:ctx.buyerOrg,product:'credit',title:'Negociação externa sintética',description:'Condições recebidas e transcritas pela empresa.',demand:{amount:100000,purpose:'capital_de_giro',term_months:12},response_deadline:addDays(14)}),'external RFQ').id;
  ok(await post(buyer,'transition',{kind:'rfq',id:state.rfq,from:'draft',status:'open'}),'open');
  const doc=await upload(buyer,ctx.buyerOrg,'rfq',state.rfq,'internal','Fonte externa sintética');
  state.input={rfq_id:state.rfq,provider_id:state.provider,rfq_revision:1,request_key:`external-${crypto.randomUUID()}`,state:'pending_review',channel:'document',source_reference:'Documento sintético recebido fora do portal',document_id:doc.document_id,document_version:doc.version||1,currency:'BRL',terms:{offered_amount:100000,interest_rate_month:1,term_months:12}};
  state.external=ok(await post(buyer,'external-proposals',state.input),'external').id;
  const retry=ok(await post(buyer,'external-proposals',state.input),'external replay');must(retry.id===state.external&&retry.replayed,'external retry');
  ok(await post(buyer,'external-proposals/confirm',{id:state.external,expected_version:1,reason:'Condições e documento sintético conferidos pela empresa.',material_reviewed:true,document_read:true}),'review');
  const comp=ok(await post(buyer,'comparison',{rfq_id:state.rfq}),'comparison');
  must(JSON.stringify(comp).includes(state.external),'external comparison missing');
  return 'real document upload, reviewed external version 1, comparison and replay';
 });
 await step('Proposta externa real: aprovação segregada, decisão, vínculo contratual e snapshot preservado',async()=>{
  const base={id:state.external,expected_version:1,rfq_revision:1};
  const approval=ok(await post(buyer,'external-proposals/approval',{...base,request_key:`approval-${crypto.randomUUID()}`,approver_ids:[people.approver.id],rationale:'Conferência independente do documento e das condições.'}),'approval');
  state.approval=approval.id;
  const own=await post(buyer,'approvals/act',{request_id:state.approval,action:'approved'});must(own.status===403,'SoD');
  ok(await post(people.approver,'approvals/act',{request_id:state.approval,action:'approved',comment:'Fonte e termos conferidos.'}),'approve');
  const decisionInput={...base,request_key:`decision-${crypto.randomUUID()}`,rationale:'Decisão humana após revisão independente.',weights:{}};
  state.decision=ok(await post(buyer,'external-proposals/decision',decisionInput),'decision').id;
  must(ok(await post(buyer,'external-proposals/decision',decisionInput),'decision replay').id===state.decision,'decision identity');
  const snapshot=sql(`select snapshot::text from public.fin_decisions where id='${state.decision}'`);
  const linked=ok(await post(buyer,'external-proposals/contract',{...base,request_key:`link-${crypto.randomUUID()}`,decision_id:state.decision,contract_id:state.contract,expected_contract_version:1,confirmed_contract_record:true}),'contract continuity');
  must(linked.id===state.contract,'linked a different contract');
  must(sql(`select snapshot::text from public.fin_decisions where id='${state.decision}'`)===snapshot,'snapshot mutated');
  must(sql(`select (origin='imported' and proposal_id is null and external_proposal_version=1)::text from public.fin_contracts where id='${state.contract}'`)==='true','false authenticated provenance');
  return 'independent approval; one human decision; explicit link to existing imported contract; unchanged snapshot';
 });
 await attack('Proposta externa real: escrita com versão obsoleta e leitura por instituição concorrente', '409 / empty authorized view',async()=>{
  const stale=await post(buyer,'external-proposals/confirm',{id:state.external,expected_version:99,reason:'Revisão obsoleta sintética',material_reviewed:true,document_read:true});
  const other=await api(people.providerB,'GET',`/api/finance/external-proposals?organization_id=${ctx.buyerOrg}&rfq_id=${state.rfq}`);
  return {ok:stale.status===409&&other.status===403,observed:`${stale.status}/${other.status}`};
 });
}
