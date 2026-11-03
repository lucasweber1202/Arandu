-- Stabilize PostgreSQL view deparsing across pg_dump/restore.
-- Explicit UNION branch aliases preserve the same projection and caller RLS.
-- No business data changes; the marker identifies the repaired definition.
begin;
insert into public.fin_settings(key,value) select 'crm_view_roundtrip_previous_marker',value from public.fin_settings where key='schema_version' on conflict(key) do nothing;
create or replace view public.fin_crm_institution_records with (security_invoker=true) as
with records as (
 select 'activity'::text as record_type,a.id,a.organization_id,a.legal_entity_id,a.subject as title,a.kind,null::text as stage,a.status,a.owner_id,a.due_on,null::text as next_action,a.version,a.source_reference,a.contact_id,a.process_id,a.related_type,a.related_id
 from public.fin_crm_activities a
 union all
 select 'process'::text as record_type,p.id,p.organization_id,p.legal_entity_id,p.title,null::text as kind,p.stage,p.status,p.owner_id,p.due_on,p.next_action,p.version,p.source_reference,p.contact_id,null::uuid as process_id,p.related_type,p.related_id
 from public.fin_crm_processes p
)
select r.record_type,r.id,r.organization_id,r.legal_entity_id,r.title,r.kind,r.stage,r.status,r.owner_id,r.due_on,r.next_action,r.version,r.source_reference,
 array_remove(array[direct.id,ct.provider_id,c.provider_id,pdirect.id,pct.provider_id,pc.provider_id],null) as provider_ids
from records r
left join public.fin_providers direct on r.related_type='provider' and direct.id=r.related_id and direct.organization_id=r.organization_id
left join public.fin_provider_contacts ct on ct.id=r.contact_id and ct.organization_id=r.organization_id and (ct.legal_entity_id is null or ct.legal_entity_id is not distinct from r.legal_entity_id)
left join public.fin_contracts c on r.related_type='contract' and c.id=r.related_id and c.organization_id=r.organization_id and c.legal_entity_id is not distinct from r.legal_entity_id
left join public.fin_crm_processes p on p.id=r.process_id and p.organization_id=r.organization_id and p.legal_entity_id is not distinct from r.legal_entity_id
left join public.fin_providers pdirect on p.related_type='provider' and pdirect.id=p.related_id and pdirect.organization_id=r.organization_id
left join public.fin_provider_contacts pct on pct.id=p.contact_id and pct.organization_id=r.organization_id and (pct.legal_entity_id is null or pct.legal_entity_id is not distinct from r.legal_entity_id)
left join public.fin_contracts pc on p.related_type='contract' and pc.id=p.related_id and pc.organization_id=r.organization_id and pc.legal_entity_id is not distinct from r.legal_entity_id;
revoke all on public.fin_crm_institution_records from public,anon,authenticated;
grant select on public.fin_crm_institution_records to authenticated;
insert into public.fin_settings(key,value) values ('schema_version', 'financial-crm-view-roundtrip-1') on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst,'reload schema';
commit;
