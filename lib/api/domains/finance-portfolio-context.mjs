import { HttpError } from '../../api-core.mjs';
import { memberOrganization, requireUuid, rest, UUID } from './finance-core.mjs';
import { operationalPage, orderedPageFilters, operationalPageResult, validDay } from './finance-operational-pages.mjs';
import { FACILITY_KINDS, portfolioViews } from '../../finance/portfolio.mjs';
import { CONTRACT_CATEGORIES } from '../../finance/contract-terms.mjs';

const coverageError=()=>new HttpError(422,'O contexto excede a cobertura desta consulta. Filtre por instituição, entidade, contrato ou moeda.','portfolio_context_coverage_limit');
const invalid=()=>new HttpError(400,'Confira os filtros do contexto de portfólio.','invalid_portfolio_context');
const ALLOWED=new Set(['organization_id','provider_id','legal_entity_id','contract_id','facility_id','product','facility_kind','currency','status','guarantee_status','maturity_from','maturity_to','horizon_months','section','limit','cursor']);
const ORDER=[{name:'maturity_on',direction:'asc',type:'date',nullable:true},{name:'id',direction:'asc',type:'uuid'}];
const GUARANTEE_ORDER=[{name:'ends_on',direction:'asc',type:'date',nullable:true},ORDER[1]];
const FACILITY_SELECT='id,organization_id,legal_entity_id,provider_id,contract_id,kind,name,currency,approved_limit,principal_amount,indexer,spread_pct_year,rate_pct_year,amortization,starts_on,maturity_on,status,owner_id,source,source_reference,verified_at,review_after_days,schedule_version,created_at,updated_at,contract_product,contract_status,provider_name';
const GUARANTEE_SELECT='id,organization_id,legal_entity_id,facility_id,contract_id,provider_id,kind,description,currency,committed_amount,starts_on,ends_on,status,source,created_by,created_at,contract_product,contract_provider_id,facility_contract_id,facility_provider_id,facility_contract_product,provider_name,facility_kind';

function contextFilters(params) {
  if([...params.keys()].some(key=>!ALLOWED.has(key))||[...ALLOWED].some(key=>params.getAll(key).length>1))throw invalid();
  const filters={};
  for(const key of ['provider_id','legal_entity_id','contract_id','facility_id'])if(params.has(key))filters[key]=requireUuid(params.get(key),key);
  if(params.has('product')){const v=params.get('product');if(!Object.hasOwn(CONTRACT_CATEGORIES,v))throw invalid();filters.product=v;}
  if(params.has('facility_kind')){const v=params.get('facility_kind');if(!Object.hasOwn(FACILITY_KINDS,v))throw invalid();filters.facility_kind=v;}
  if(params.has('currency')){const v=params.get('currency').toUpperCase();if(!/^[A-Z]{3}$/.test(v))throw invalid();filters.currency=v;}
  for(const [key,values] of [['status',['prospective','active','matured','cancelled']],['guarantee_status',['active','released','expired']]])if(params.has(key)){const v=params.get(key);if(!values.includes(v))throw invalid();filters[key]=v;}
  for(const key of ['maturity_from','maturity_to'])if(params.has(key)){if(!validDay(params.get(key)))throw invalid();filters[key]=params.get(key);}
  if(filters.maturity_from&&filters.maturity_to&&filters.maturity_from>filters.maturity_to)throw invalid();
  const raw=params.get('horizon_months'),horizon=raw===null?12:Number(raw);
  if(raw!==null&&!/^(3|6|12|18|24|36)$/.test(raw))throw invalid();
  const section=params.get('section');
  if(section!==null&&!['facilities','guarantees'].includes(section))throw invalid();
  if(!section&&(params.has('limit')||params.has('cursor')))throw invalid();
  return {filters,horizon,section};
}

function queryFilters(org,filters,section) {
  const guarantees=section==='guarantees',q=new URLSearchParams({select:guarantees?GUARANTEE_SELECT:FACILITY_SELECT,organization_id:`eq.${org}`}),and=[];
  for(const key of ['legal_entity_id','currency'])if(filters[key])q.set(key,`eq.${filters[key]}`);
  if(filters.provider_id)guarantees?and.push(`or(provider_id.eq.${filters.provider_id},contract_provider_id.eq.${filters.provider_id},facility_provider_id.eq.${filters.provider_id})`):q.set('provider_id',`eq.${filters.provider_id}`);
  if(filters.contract_id)guarantees?and.push(`or(contract_id.eq.${filters.contract_id},facility_contract_id.eq.${filters.contract_id})`):q.set('contract_id',`eq.${filters.contract_id}`);
  if(filters.facility_id)q.set(guarantees?'facility_id':'id',`eq.${filters.facility_id}`);
  if(filters.product)guarantees?and.push(`or(contract_product.eq.${filters.product},facility_contract_product.eq.${filters.product})`):q.set('contract_product',`eq.${filters.product}`);
  if(filters.facility_kind)q.set(guarantees?'facility_kind':'kind',`eq.${filters.facility_kind}`);
  const status=filters[guarantees?'guarantee_status':'status'];if(status)q.set('status',`eq.${status}`);
  const date=guarantees?'ends_on':'maturity_on';
  if(filters.maturity_from)and.push(`${date}.gte.${filters.maturity_from}`);
  if(filters.maturity_to)and.push(`${date}.lte.${filters.maturity_to}`);
  if(and.length)q.set('and',`(${and.join(',')})`);
  return q;
}

// Batches are below the standard Data API row ceiling. A sentinel after the
// configured cap fails explicitly; a truncated collection never yields totals.
export async function readBoundedOperationalRows(token,table,filters,cap) {
  const all=[];let after=null;
  while(true) {
    const q=new URLSearchParams(filters),limit=Math.min(200,cap+1-all.length);
    q.set('order','id.asc');q.set('limit',String(limit));
    if(after)q.set('and',`(${filters.get('and')?.slice(1,-1)?filters.get('and').slice(1,-1)+',':''}id.gt.${after})`);
    const rows=await rest(token,`${table}?${q}`);
    if(!Array.isArray(rows))throw new HttpError(502,'Fonte operacional indisponível. Tente novamente.','invalid_operational_response');
    all.push(...rows);if(all.length>cap)throw coverageError();
    if(rows.length<limit)return all;
    const id=rows.at(-1)?.id;if(!UUID.test(id||'')||id===after)throw new HttpError(502,'A fonte não confirmou a continuação da consulta.','invalid_operational_response');
    after=id;
  }
}

async function byFacility(token,org,ids,table,select,cap) {
  const chunks=[];for(let i=0;i<ids.length;i+=80)chunks.push(ids.slice(i,i+80));
  const rows=[];
  for(let i=0;i<chunks.length;i+=4) {
    const group=await Promise.all(chunks.slice(i,i+4).map(chunk=>readBoundedOperationalRows(token,table,new URLSearchParams({select,organization_id:`eq.${org}`,facility_id:`in.(${chunk.join(',')})`}),cap)));
    rows.push(...group.flat());if(rows.length>cap)throw coverageError();
  }
  return rows;
}
const balancesFor=(token,org,ids)=>byFacility(token,org,ids,'fin_facility_latest_balance','id,facility_id,as_of,recorded_at,outstanding_amount,used_limit_amount,source,source_reference,recorded_by',2000);
const tableFor=section=>section==='facilities'?'fin_portfolio_facility_context':'fin_portfolio_guarantee_context';

export async function readPortfolioContext(token,params,viewerId) {
  const {filters,horizon,section}=contextFilters(params);
  const organization=await memberOrganization(token,params.get('organization_id'),['BUYER']),org=organization.id;
  for(const [key,table] of [['contract_id','fin_contracts'],['legal_entity_id','fin_legal_entities']])if(filters[key]) {
    const parent=await rest(token,`${table}?select=id&organization_id=eq.${org}&id=eq.${filters[key]}&limit=1`);
    if(!parent?.length)throw new HttpError(404,'Contexto indisponível para esta conta.','portfolio_context_not_found');
  }
  const scope={organization_id:org,...filters,horizon_months:horizon};
  if(section) {
    const controls=operationalPage(params,{kind:'portfolio-context-v1',scope,section,viewer:viewerId},section==='facilities'?ORDER:GUARANTEE_ORDER,{maxLimit:50});
    const q=queryFilters(org,filters,section);
    for(const [key,value] of orderedPageFilters(controls))q.set(key,value);
    // An outer ORDER/LIMIT on a security-barrier join can authorize/sort the
    // whole tenant before returning 50 rows. Page the canonical source first
    // when every filter is native, then enrich only those authorized IDs.
    // Product filtering still uses the joined projection before pagination.
    const nativePage=section==='facilities'&&!filters.product;
    if(nativePage)q.set('select','id,maturity_on');
    const page=operationalPageResult(await rest(token,`${nativePage?'fin_facilities':tableFor(section)}?${q}`),controls);
    let rows=page.rows;
    let changedDuringRead=false;
    if(nativePage&&rows.length) {
      if(rows.some(row=>!UUID.test(row?.id||'')))throw new HttpError(502,'Fonte operacional indisponível. Tente novamente.','invalid_operational_response');
      const enrichment=queryFilters(org,filters,section);
      enrichment.set('id',`in.(${rows.map(row=>row.id).join(',')})`);enrichment.set('limit',String(rows.length));
      const details=await rest(token,`${tableFor(section)}?${enrichment}`);
      const authorizedIds=new Set(rows.map(row=>row.id));
      if(!Array.isArray(details)||details.some(row=>!authorizedIds.has(row?.id))||new Set(details.map(row=>row.id)).size!==details.length)throw new HttpError(502,'Fonte operacional indisponível. Tente novamente.','invalid_operational_response');
      const byId=new Map(details.map(row=>[row.id,row]));
      changedDuringRead=details.length!==rows.length;
      rows=rows.map(row=>byId.get(row.id)).filter(Boolean);
    }
    if(section==='facilities') {
      const balances=await balancesFor(token,org,rows.map(row=>row.id)),map=new Map(balances.map(b=>[b.facility_id,b]));
      rows=rows.map(row=>({...row,latest_balance:map.get(row.id)||null,balance_state:map.has(row.id)?'recorded':'unknown'}));
    }
    return {ok:true,scope,section,rows,page:page.page,consistency:page.consistency,
      coverage:{complete:!controls.cursor&&!page.page.has_more&&!changedDuringRead,first_page:!controls.cursor,has_more:page.page.has_more,changed_during_read:changedDuringRead},
      provenance:{kind:'authorized_live_projection',guarantee_links:'associated_not_financial_allocation'}};
  }
  const [facilities,guarantees]=await Promise.all([
    readBoundedOperationalRows(token,tableFor('facilities'),queryFilters(org,filters,'facilities'),2000),
    readBoundedOperationalRows(token,tableFor('guarantees'),queryFilters(org,filters,'guarantees'),2000)
  ]);
  const ids=facilities.map(row=>row.id);
  const [balances,repayments]=await Promise.all([
    balancesFor(token,org,ids),
    byFacility(token,org,ids,'fin_facility_current_repayment','id,facility_id,schedule_version,due_on,principal_amount',20000)
  ]);
  const providers=[...new Map(facilities.filter(row=>row.provider_name).map(row=>[row.provider_id,{id:row.provider_id,name:row.provider_name}])).values()];
  const views=portfolioViews({facilities,guarantees,balances,repayments,providers,horizonMonths:horizon});
  // Reuse the canonical calculations, while making incomplete totals nullable
  // in this new DTO. A partial recorded sum is not an organization's balance.
  views.currencies=views.currencies.map(row=>({...row,recorded_outstanding:row.outstanding,recorded_used_limit:row.used_limit,recorded_available_limit:row.available_limit,
    outstanding:row.outstanding_unknown?null:row.outstanding,used_limit:row.limit_without_usage?null:row.used_limit,available_limit:row.limit_without_usage?null:row.available_limit}));
  views.guarantees=views.guarantees.map(row=>({...row,recorded_committed:row.committed,committed:row.unknown_amount?null:row.committed}));
  views.amounts_semantics='unknown_totals_are_null_recorded_sums_are_partial';
  const link=(currency,section)=>{
    const q=new URLSearchParams({organization_id:org,...Object.fromEntries(Object.entries(filters).filter(([k])=>k!=='status'&&k!=='guarantee_status')),currency,section,horizon_months:String(horizon)});
    if(section==='facilities')q.set('status','active');else q.set('guarantee_status','active');
    return 'portfolio/context?'+q;
  };
  return {ok:true,scope,views,
    drilldowns:{facilities:views.currencies.map(row=>({currency:row.currency,method:'GET',endpoint:link(row.currency,'facilities'),contributing_status:'active'})),guarantees:views.guarantees.map(row=>({currency:row.currency,method:'GET',endpoint:link(row.currency,'guarantees'),contributing_status:'active',basis:'associated_not_financial_allocation'}))},
    coverage:{complete:true,facilities:facilities.length,guarantees:guarantees.length,latest_balances:balances.length,current_repayments:repayments.length,
      limits:{facilities:2000,guarantees:2000,current_repayments:20000},overflow:'fails_before_totals',balances:'latest_authorized_per_facility',repayments:'current_schedule_only'},
    consistency:'live_reads_not_transaction_snapshot',boundary:'Valores registrados, separados por moeda. Ausência de saldo não é zero; relações de garantia não representam alocação financeira.'};
}
