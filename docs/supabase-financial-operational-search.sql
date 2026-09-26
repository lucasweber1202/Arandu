-- Bounded, tenant-authorized navigation search. No financial terms or notes in results.
create or replace function public.fin_search(p_org uuid,p_query text,p_kind text default null,p_limit integer default 12,p_offset integer default 0)
returns table(kind text,id uuid,title text,detail text,href text)
language plpgsql stable security definer set search_path = '' as $$
declare v_query text;
begin
 if not public.fin_has_role(p_org,array['admin','finance_manager','analyst','viewer']) then raise exception 'forbidden'; end if;
 v_query:=lower(trim(coalesce(p_query,'')));
 if length(v_query) not between 2 and 100 or p_limit not between 1 and 30 or p_offset not between 0 and 1000
 or (p_kind is not null and p_kind not in ('rfq','proposal','provider','contract','task')) then
  raise exception 'invalid search'; end if;
 return query
 select x.kind,x.id,x.title,x.detail,x.href from (
  select 'rfq'::text kind,r.id,r.title::text,coalesce(r.status,'')::text detail,
    ('/finance/rfq.html?id='||r.id)::text href, 1 priority,r.created_at sorted_at
  from public.fin_rfqs r where r.organization_id=p_org and (p_kind is null or p_kind='rfq')
    and (position(v_query in lower(r.title))>0 or position(v_query in lower(r.id::text))>0)
  union all
  select 'proposal'::text,p.id,coalesce(v.name,'Proposta')::text,r.title::text,
    ('/finance/rfq.html?id='||r.id)::text,2,p.updated_at
  from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id and r.organization_id=p_org
   left join public.fin_providers v on v.id=p.provider_id and v.organization_id=p_org
  where p.buyer_organization_id=p_org and (p_kind is null or p_kind='proposal')
   and (position(v_query in lower(coalesce(v.name,'')))>0 or position(v_query in lower(r.title))>0 or position(v_query in lower(p.id::text))>0)
  union all
  select 'provider'::text,v.id,v.name::text,coalesce(v.region,'')::text,
    '/finance/providers.html'::text,3,v.created_at
  from public.fin_providers v where v.organization_id=p_org and (p_kind is null or p_kind='provider')
   and (position(v_query in lower(v.name))>0 or position(v_query in lower(v.id::text))>0)
  union all
  select 'contract'::text,c.id,coalesce(v.name,'Contrato')::text,c.ends_on::text,
    '/finance/contracts.html'::text,4,c.created_at
  from public.fin_contracts c left join public.fin_providers v on v.id=c.provider_id and v.organization_id=p_org
  where c.organization_id=p_org and (p_kind is null or p_kind='contract')
   and (position(v_query in lower(coalesce(v.name,'')))>0 or position(v_query in lower(c.id::text))>0)
  union all
  select 'task'::text,t.id,t.title::text,coalesce(t.due_on::text,'')::text,
    '/finance/dashboard.html'::text,5,t.created_at
  from public.fin_tasks t where t.organization_id=p_org and (p_kind is null or p_kind='task')
   and (position(v_query in lower(t.title))>0 or position(v_query in lower(t.id::text))>0)
 ) x order by x.priority,x.sorted_at desc,x.id limit p_limit offset p_offset;
end $$;
revoke all on function public.fin_search(uuid,text,text,integer,integer) from public,anon;
grant execute on function public.fin_search(uuid,text,text,integer,integer) to authenticated,service_role;
