-- Authorized projections, never copies of contracts, portfolio or documents.
-- Historical migrations and the financial baseline prefix remain unchanged.
begin;

create or replace view public.fin_portfolio_facility_context
with (security_invoker=true,security_barrier=true) as
select f.*,c.product as contract_product,c.status as contract_status,
       p.name as provider_name
from public.fin_facilities f
left join public.fin_contracts c on c.id=f.contract_id and c.organization_id=f.organization_id
left join public.fin_providers p on p.id=f.provider_id and p.organization_id=f.organization_id;

create or replace view public.fin_portfolio_guarantee_context
with (security_invoker=true,security_barrier=true) as
select g.*,c.product as contract_product,c.provider_id as contract_provider_id,
       f.contract_id as facility_contract_id,f.provider_id as facility_provider_id,
       fc.product as facility_contract_product,p.name as provider_name,f.kind as facility_kind
from public.fin_guarantees g
left join public.fin_contracts c on c.id=g.contract_id and c.organization_id=g.organization_id
left join public.fin_facilities f on f.id=g.facility_id and f.organization_id=g.organization_id
left join public.fin_contracts fc on fc.id=f.contract_id and fc.organization_id=f.organization_id
left join public.fin_providers p on p.id=g.provider_id and p.organization_id=g.organization_id;

create or replace view public.fin_facility_latest_balance
with (security_invoker=true,security_barrier=true) as
select distinct on (b.facility_id) b.id,b.organization_id,b.facility_id,b.as_of,b.recorded_at,
       b.outstanding_amount,b.used_limit_amount,b.source,b.source_reference,b.recorded_by
from public.fin_facility_balances b
order by b.facility_id,b.as_of desc,b.recorded_at desc,b.id desc;

create or replace view public.fin_facility_current_repayment
with (security_invoker=true,security_barrier=true) as
select r.* from public.fin_facility_repayments r
join public.fin_facilities f on f.id=r.facility_id and f.organization_id=r.organization_id
 and f.schedule_version=r.schedule_version;

-- A document keeps its original ID, owner, visibility and object of origin.
-- Only the available current version is projected. No bucket/path/signed URL.
-- Sourcing-proposal evidence is included only through an authorized contract.
create or replace view public.fin_contract_document_evidence
with (security_invoker=true,security_barrier=true) as
select d.id,d.organization_id,d.buyer_organization_id,
       c.organization_id as contract_organization_id,c.id as contract_id,
       d.entity_type,d.entity_id,d.title,d.visibility,d.current_version,
       d.created_by,d.created_at,
       case when d.entity_type='contract' then 'direct_contract'::text
            else 'sourcing_proposal'::text end as source_relation,
       v.version as available_version,v.mime_type,v.size_bytes,v.sha256,
       v.uploaded_by,v.completed_at,c.provider_id,c.legal_entity_id
from public.fin_contracts c
join public.fin_private_documents d
  on d.buyer_organization_id=c.organization_id
 and ((d.entity_type='contract' and d.entity_id=c.id)
   or (d.entity_type='proposal' and d.entity_id=c.proposal_id))
left join public.fin_document_versions v
  on v.document_id=d.id and v.version=d.current_version and v.status='available'
where d.removed_at is null;

revoke all on public.fin_portfolio_facility_context,public.fin_portfolio_guarantee_context,public.fin_contract_document_evidence,public.fin_facility_latest_balance,public.fin_facility_current_repayment from public,anon,authenticated,service_role;
grant select on public.fin_portfolio_facility_context,public.fin_portfolio_guarantee_context,public.fin_contract_document_evidence,public.fin_facility_latest_balance,public.fin_facility_current_repayment to authenticated;
comment on view public.fin_portfolio_facility_context is 'Live caller-RLS projection; facility, contract and institution remain canonical.';
comment on view public.fin_portfolio_guarantee_context is 'Associated references, not financial allocation; one row per guarantee and live caller RLS on every source.';
comment on view public.fin_contract_document_evidence is 'Caller-RLS contract/proposal document evidence; available current metadata only, never Storage locators.';

insert into public.fin_settings(key,value) values ('schema_version', 'financial-operating-context-1')
on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst,'reload schema';
commit;
