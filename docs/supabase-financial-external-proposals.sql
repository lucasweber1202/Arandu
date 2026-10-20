-- Buyer-owned external ingestion. No fake invitation, provider identity or bank submission.
begin;
create table if not exists public.fin_external_proposals (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 legal_entity_id uuid, rfq_id uuid not null, provider_id uuid not null,
 product text not null check(product in ('credit','acquiring')),
 state text not null check(state in ('preparing','pending_review','reviewed','withdrawn')),
 current_version integer not null check(current_version>0),
 request_key text not null check(request_key ~ '^[A-Za-z0-9._:-]{8,80}$'), request_hash text not null,
 recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,request_key),
 foreign key(organization_id,rfq_id,product) references public.fin_rfqs(organization_id,id,product),
 foreign key(organization_id,provider_id) references public.fin_providers(organization_id,id),
 foreign key(organization_id,legal_entity_id) references public.fin_legal_entities(organization_id,id)
);
create table if not exists public.fin_external_proposal_versions (
 proposal_id uuid not null, version integer not null check(version>0), organization_id uuid not null,
 terms jsonb not null check(jsonb_typeof(terms)='object' and octet_length(terms::text)<=32768),
 preparation_state text not null check(preparation_state in ('preparing','pending_review')),
 channel text not null check(channel in ('email','document','spreadsheet','formal_communication','manual')),
 received_at timestamptz not null, source_reference text not null check(length(trim(source_reference)) between 3 and 500 and source_reference !~ '[<>]'),
 currency text check(currency ~ '^[A-Z]{3}$'), rfq_revision integer not null,
 document_id uuid, document_version integer, document_sha256 text,
 document_mime text, document_size bigint,
 correction_reason text check(correction_reason is null or (length(trim(correction_reason)) between 10 and 1000 and correction_reason !~ '[<>]')),
 request_key text not null check(request_key ~ '^[A-Za-z0-9._:-]{8,80}$'), request_hash text not null,
 recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 primary key(proposal_id,version), unique(proposal_id,request_key),
 foreign key(organization_id,proposal_id) references public.fin_external_proposals(organization_id,id),
 foreign key(document_id,document_version) references public.fin_document_versions(document_id,version),
 check((document_id is null) = (document_version is null))
);
create table if not exists public.fin_external_proposal_reviews (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, proposal_id uuid not null, version integer not null,
 action text not null check(action in ('confirm','withdraw')),
 reason text not null check(length(trim(reason)) between 10 and 1000 and reason !~ '[<>]'),
 document_read boolean not null,
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default now(),
 unique(proposal_id,version,action),
 foreign key(organization_id,proposal_id) references public.fin_external_proposals(organization_id,id),
 foreign key(proposal_id,version) references public.fin_external_proposal_versions(proposal_id,version)
);
create index if not exists fin_external_proposals_rfq on public.fin_external_proposals(rfq_id,id);
create index if not exists fin_external_proposals_scope on public.fin_external_proposals(organization_id,rfq_id,legal_entity_id,id);
create index if not exists fin_external_proposal_versions_org on public.fin_external_proposal_versions(organization_id,proposal_id,version desc);
create index if not exists fin_external_proposal_reviews_org on public.fin_external_proposal_reviews(organization_id,proposal_id,version);

do $$ declare t text; begin
 foreach t in array array['fin_external_proposals','fin_external_proposal_versions','fin_external_proposal_reviews'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('drop policy if exists external_read on public.%I',t);
  if t='fin_external_proposals' then
   execute 'create policy external_read on public.fin_external_proposals for select to authenticated using(public.fin_entity_allows(organization_id,legal_entity_id,array[''admin'',''finance_manager'',''analyst'',''viewer'']) and exists(select 1 from public.fin_organizations o where o.id=organization_id and o.kind=''BUYER''))';
  else
   execute format('create policy external_read on public.%I for select to authenticated using(exists(select 1 from public.fin_external_proposals p where p.organization_id=%I.organization_id and p.id=proposal_id))',t,t);
   execute format('drop trigger if exists external_immutable on public.%I',t);
   execute format('create trigger external_immutable before update or delete on public.%I for each row execute function public.fin_immutable_row()',t);
  end if;
 end loop;
end $$;
create or replace function public.fin_external_identity_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if (new.id,new.organization_id,new.legal_entity_id,new.rfq_id,new.provider_id,new.product,new.request_key,new.request_hash,new.recorded_by,new.recorded_at)
 is distinct from (old.id,old.organization_id,old.legal_entity_id,old.rfq_id,old.provider_id,old.product,old.request_key,old.request_hash,old.recorded_by,old.recorded_at) then raise exception 'external proposal identity immutable'; end if;
 return new;
end $$;
revoke all on function public.fin_external_identity_guard() from public,anon,authenticated,service_role;
drop trigger if exists external_identity on public.fin_external_proposals;
create trigger external_identity before update on public.fin_external_proposals for each row execute function public.fin_external_identity_guard();
drop trigger if exists external_no_delete on public.fin_external_proposals;
create trigger external_no_delete before delete on public.fin_external_proposals for each row execute function public.fin_immutable_row();

-- Internal only. Revalidate membership after the RFQ lock and hold it through commit.
create or replace function public.fin_external_require_actor(p_org uuid,p_entity uuid,p_roles text[])
returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'forbidden'; end if;
 perform 1 from public.fin_members where organization_id=p_org and user_id=auth.uid() for share;
 perform 1 from public.fin_member_entity_grants where organization_id=p_org and user_id=auth.uid() for share;
 if not public.fin_entity_allows(p_org,p_entity,p_roles) or not exists(select 1 from public.fin_organizations where id=p_org and kind='BUYER') then raise exception 'forbidden'; end if;
 if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
end $$;
revoke all on function public.fin_external_require_actor(uuid,uuid,text[]) from public,anon,authenticated,service_role;

create or replace function public.fin_external_proposal_schema() returns jsonb language sql immutable set search_path='' as $$
 select '{"credit":[{"key":"offered_amount","type":"money","min":0,"max":1000000000000},{"key":"interest_rate_month","type":"percent","min":0,"max":1000},{"key":"index","type":"enum","options":["pre","cdi","ipca","selic","tr","outro"]},{"key":"index_spread","type":"percent","min":0,"max":1000},{"key":"cet_year","type":"percent","min":0,"max":1000},{"key":"term_months","type":"int","min":1,"max":600},{"key":"grace_months","type":"int","min":0,"max":120},{"key":"amortization","type":"enum","options":["price","sac","bullet","customizada"]},{"key":"collateral_required","type":"text","max":1000},{"key":"fees_amount","type":"money","min":0,"max":1000000000000},{"key":"declared_total_cost","type":"money","min":0,"max":1000000000000},{"key":"institution","type":"text","max":200},{"key":"product_name","type":"text","max":200},{"key":"valid_until","type":"date"},{"key":"contracting_days","type":"int","min":0,"max":3650},{"key":"conditions_precedent","type":"text","max":2000},{"key":"notes","type":"text","max":2000}],"acquiring":[{"key":"mdr_debit","type":"percent","min":0,"max":100},{"key":"mdr_credit_cash","type":"percent","min":0,"max":100},{"key":"mdr_credit_installment","type":"percent","min":0,"max":100},{"key":"pix_fee","type":"percent","min":0,"max":100},{"key":"anticipation_rate","type":"percent","min":0,"max":1000},{"key":"terminal_rent","type":"money","min":0,"max":1000000},{"key":"gateway_cost","type":"money","min":0,"max":1000000},{"key":"settlement_days","type":"int","min":0,"max":365},{"key":"chargeback_terms","type":"text","max":1000},{"key":"contract_months","type":"int","min":0,"max":600},{"key":"early_exit_penalty","type":"money","min":0,"max":1000000000},{"key":"extra_services","type":"text","max":1000},{"key":"institution","type":"text","max":200},{"key":"product_name","type":"text","max":200},{"key":"valid_until","type":"date"},{"key":"contracting_days","type":"int","min":0,"max":3650},{"key":"conditions_precedent","type":"text","max":2000},{"key":"notes","type":"text","max":2000}]}'::jsonb;
$$;
revoke all on function public.fin_external_proposal_schema() from public,anon,authenticated,service_role;
create or replace function public.fin_external_terms_valid(p_product text,p_terms jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; x jsonb; f jsonb; n numeric; begin
 if jsonb_typeof(p_terms) is distinct from 'object' or octet_length(p_terms::text)>32768 or not (public.fin_external_proposal_schema() ? p_product) then return false; end if;
 for k,x in select * from jsonb_each(p_terms) loop
  select value into f from jsonb_array_elements(public.fin_external_proposal_schema()->p_product) where value->>'key'=k;
  if f is null or x='null'::jsonb then return false; end if;
  if f->>'type' in ('money','percent','number','int') then
   if jsonb_typeof(x)<>'number' then return false; end if;
   n:=(x#>>'{}')::numeric;
   if (f ? 'min' and n<(f->>'min')::numeric) or (f ? 'max' and n>(f->>'max')::numeric) or (f->>'type'='int' and n<>trunc(n)) then return false; end if;
  elsif f->>'type'='text' then
   if jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and coalesce((f->>'max')::integer,2000) or (x#>>'{}') ~ '[<>]' then return false; end if;
  elsif f->>'type'='enum' then
   if jsonb_typeof(x)<>'string' or not ((f->'options') ? (x#>>'{}')) then return false; end if;
  elsif f->>'type'='date' then
   if jsonb_typeof(x)<>'string' or (x#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
   perform (x#>>'{}')::date;
  elsif f->>'type'='bool' then
   if jsonb_typeof(x)<>'boolean' then return false; end if;
  else return false; end if;
 end loop;
 return true;
 exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then return false;
end $$;
revoke all on function public.fin_external_terms_valid(text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.fin_external_proposal_save(p_rfq uuid,p_provider uuid,p_key text,p_expected integer,p_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fin_rfqs%rowtype; p public.fin_external_proposals%rowtype; v public.fin_external_proposal_versions%rowtype;
 d public.fin_private_documents%rowtype; f public.fin_document_versions%rowtype; h text; n integer; result_id uuid;
begin
 select * into r from public.fin_rfqs where id=p_rfq for no key update;
 if r.id is null then raise exception 'forbidden'; end if;
 perform public.fin_external_require_actor(r.organization_id,r.legal_entity_id,array['admin','finance_manager','analyst']);
 if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,80}$' then raise exception 'invalid external request'; end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>40000
 or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('terms','state','channel','received_at','source_reference','currency','rfq_revision','document_id','document_version','correction_reason')) then raise exception 'invalid external input'; end if;
 h:=encode(sha256(convert_to(jsonb_build_object('rfq',p_rfq,'provider',p_provider,'expected',p_expected,'input',p_input)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('external:'||r.organization_id||':'||coalesce(p_id::text,p_key),0));
 if p_id is null then
  select * into p from public.fin_external_proposals where organization_id=r.organization_id and request_key=p_key;
  if found then
   if p.request_hash<>h then raise exception 'external proposal conflict'; end if;
   return jsonb_build_object('id',p.id,'version',1,'replayed',true);
  end if;
  if p_expected is distinct from 0 then raise exception 'external proposal conflict'; end if;
 else
  select * into p from public.fin_external_proposals where id=p_id and organization_id=r.organization_id for update;
  if not found or p.rfq_id<>p_rfq or p.provider_id<>p_provider then raise exception 'forbidden'; end if;
  select * into v from public.fin_external_proposal_versions where proposal_id=p.id and request_key=p_key;
  if found then
   if v.request_hash<>h then raise exception 'external proposal conflict'; end if;
   return jsonb_build_object('id',p.id,'version',v.version,'replayed',true);
  end if;
  if p_expected is distinct from p.current_version or p.state='withdrawn' then raise exception 'external proposal conflict'; end if;
  if length(trim(coalesce(p_input->>'correction_reason',''))) not between 10 and 1000 or p_input->>'correction_reason' ~ '[<>]' then raise exception 'invalid external correction'; end if;
 end if;
 if r.status in ('closed','cancelled') then raise exception 'external proposal closed'; end if;
 if not exists(select 1 from public.fin_providers where id=p_provider and organization_id=r.organization_id) then raise exception 'invalid external provider'; end if;
 if (p_input->>'rfq_revision')::integer is distinct from r.revision then raise exception 'external rfq revision conflict'; end if;
 if length(trim(coalesce(p_input->>'source_reference',''))) not between 3 and 500 or p_input->>'source_reference' ~ '[<>]'
 or (nullif(p_input->>'currency','') is not null and p_input->>'currency' !~ '^[A-Z]{3}$') then raise exception 'invalid external input'; end if;
 if p_input->>'state' is null or p_input->>'state' not in ('preparing','pending_review')
 or p_input->>'channel' is null or p_input->>'channel' not in ('email','document','spreadsheet','formal_communication','manual')
 or jsonb_typeof(p_input->'source_reference') is distinct from 'string'
 or p_input->>'received_at' is null or not isfinite((p_input->>'received_at')::timestamptz) or (p_input->>'received_at')::timestamptz > now()
 or not public.fin_external_terms_valid(r.product,p_input->'terms') then raise exception 'invalid external input'; end if;
 if nullif(p_input->>'document_id','') is not null then
  select * into d from public.fin_private_documents where id=(p_input->>'document_id')::uuid for share;
  select * into f from public.fin_document_versions where document_id=d.id and version=(p_input->>'document_version')::integer for share;
  if d.id is null or d.organization_id<>r.organization_id or d.entity_type<>'rfq' or d.entity_id<>r.id or d.visibility<>'internal' or d.removed_at is not null
   or f.version is null or f.status<>'available' or not public.fin_can_read_document(d.id) then raise exception 'invalid external document'; end if;
 elsif nullif(p_input->>'document_version','') is not null then raise exception 'invalid external document'; end if;
 result_id:=coalesce(p.id,gen_random_uuid()); n:=coalesce(p.current_version,0)+1;
 if p.id is null then
  insert into public.fin_external_proposals(id,organization_id,legal_entity_id,rfq_id,provider_id,product,state,current_version,request_key,request_hash,recorded_by)
  values(result_id,r.organization_id,r.legal_entity_id,r.id,p_provider,r.product,p_input->>'state',1,p_key,h,auth.uid());
 end if;
 insert into public.fin_external_proposal_versions(proposal_id,version,organization_id,terms,preparation_state,channel,received_at,source_reference,currency,rfq_revision,
 document_id,document_version,document_sha256,document_mime,document_size,correction_reason,request_key,request_hash,recorded_by)
 values(result_id,n,r.organization_id,p_input->'terms',p_input->>'state',p_input->>'channel',(p_input->>'received_at')::timestamptz,p_input->>'source_reference',
 nullif(p_input->>'currency',''),r.revision,d.id,f.version,f.sha256,f.mime_type,f.size_bytes,p_input->>'correction_reason',p_key,h,auth.uid());
 if p.id is not null then update public.fin_external_proposals set current_version=n,state=p_input->>'state' where id=result_id; end if;
 insert into public.fin_events(organization_id,legal_entity_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(r.organization_id,r.legal_entity_id,'rfq',r.id,'external_proposal_recorded',auth.uid(),jsonb_build_object('proposal_id',result_id,'version',n));
 return jsonb_build_object('id',result_id,'version',n,'replayed',false);
end $$;
revoke all on function public.fin_external_proposal_save(uuid,uuid,text,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fin_external_proposal_save(uuid,uuid,text,integer,uuid,jsonb) to authenticated;

create or replace function public.fin_external_proposal_review(p_id uuid,p_expected integer,p_action text,p_reason text,p_material_reviewed boolean,p_document_read boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.fin_rfqs%rowtype; p public.fin_external_proposals%rowtype; v public.fin_external_proposal_versions%rowtype;
 old_review public.fin_external_proposal_reviews%rowtype; d public.fin_private_documents%rowtype; result_id uuid;
begin
 select r0.* into r from public.fin_external_proposals p0 join public.fin_rfqs r0 on r0.id=p0.rfq_id where p0.id=p_id for no key update of r0;
 if r.id is null then raise exception 'forbidden'; end if;
 perform public.fin_external_require_actor(r.organization_id,r.legal_entity_id,array['admin','finance_manager']);
 select * into p from public.fin_external_proposals where id=p_id for update;
 if p.current_version is distinct from p_expected then raise exception 'external proposal conflict'; end if;
 if p_action is null or p_action not in ('confirm','withdraw') or p_material_reviewed is distinct from true
 or length(trim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'invalid external review'; end if;
 select * into old_review from public.fin_external_proposal_reviews where proposal_id=p.id and version=p_expected and action=p_action;
 if found then
  if old_review.reason<>p_reason or old_review.document_read is distinct from coalesce(p_document_read,false) or (p_action='confirm' and p.state<>'reviewed') then raise exception 'external proposal conflict'; end if;
  return old_review.id;
 end if;
 select * into v from public.fin_external_proposal_versions where proposal_id=p.id and version=p_expected;
 if p_action='confirm' then
  if p.state<>'pending_review' or v.terms='{}'::jsonb then raise exception 'external review required'; end if;
  if v.rfq_revision<>r.revision then raise exception 'external rfq revision conflict'; end if;
  if v.document_id is not null then
   select * into d from public.fin_private_documents where id=v.document_id for share;
   if d.removed_at is not null or not public.fin_can_read_document(d.id) or p_document_read is distinct from true then raise exception 'invalid external document'; end if;
  end if;
 elsif p.state='withdrawn' then raise exception 'external proposal conflict'; end if;
 insert into public.fin_external_proposal_reviews(organization_id,proposal_id,version,action,reason,document_read,reviewed_by)
 values(p.organization_id,p.id,p_expected,p_action,p_reason,coalesce(p_document_read,false),auth.uid()) returning id into result_id;
 update public.fin_external_proposals set state=case when p_action='confirm' then 'reviewed' else 'withdrawn' end where id=p.id;
 insert into public.fin_events(organization_id,legal_entity_id,entity_type,entity_id,event_type,actor_id,metadata)
 values(r.organization_id,r.legal_entity_id,'rfq',r.id,'external_proposal_'||p_action,auth.uid(),jsonb_build_object('proposal_id',p.id,'version',p_expected));
 return result_id;
end $$;
revoke all on function public.fin_external_proposal_review(uuid,integer,text,text,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function public.fin_external_proposal_review(uuid,integer,text,text,boolean,boolean) to authenticated;

create or replace view public.fin_external_proposal_current with(security_invoker=true) as
 select p.id,p.organization_id,p.legal_entity_id,p.rfq_id,p.provider_id,p.product,p.state,p.current_version,
 v.terms,v.channel,v.received_at,v.source_reference,v.currency,v.rfq_revision,v.recorded_by,v.recorded_at,
 v.document_id,v.document_version,v.document_sha256,v.document_mime,v.document_size,
 q.reviewed_by,q.reviewed_at,q.document_read,
 (v.document_id is null or (d.id is not null and d.removed_at is null and f.status='available')) as document_available,
 (v.rfq_revision=r.revision) as rfq_revision_matches,
 b.name as provider_name,
 'buyer_recorded_external'::text as origin,'buyer_attribution'::text as issuer_identity,
 'transcription_correspondence_only'::text as review_scope,
 'not_recorded'::text as external_validation,'not_recorded'::text as institution_acceptance,
 false as decision_allowed,'version_metadata_unverified'::text as document_hash_source
 from public.fin_external_proposals p
 join public.fin_external_proposal_versions v on v.proposal_id=p.id and v.version=p.current_version
 join public.fin_rfqs r on r.id=p.rfq_id
 join public.fin_providers b on b.id=p.provider_id and b.organization_id=p.organization_id
 left join public.fin_external_proposal_reviews q on q.proposal_id=p.id and q.version=p.current_version and q.action='confirm'
 left join public.fin_private_documents d on d.id=v.document_id
 left join public.fin_document_versions f on f.document_id=v.document_id and f.version=v.document_version;
revoke all on public.fin_external_proposal_current from public,anon,authenticated,service_role;
grant select on public.fin_external_proposal_current to authenticated;

-- Scope changes need a formal migration of the evidence, not silent reassignment.
create or replace function public.fin_external_rfq_scope_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.legal_entity_id is distinct from old.legal_entity_id and exists(select 1 from public.fin_external_proposals where rfq_id=old.id) then raise exception 'external proposal identity immutable'; end if;
 return new;
end $$;
revoke all on function public.fin_external_rfq_scope_guard() from public,anon,authenticated,service_role;
drop trigger if exists external_rfq_scope on public.fin_rfqs;
create trigger external_rfq_scope before update on public.fin_rfqs for each row execute function public.fin_external_rfq_scope_guard();
create or replace function public.fin_external_document_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from public.fin_external_proposal_versions where document_id=old.id) and
  ((new.organization_id,new.buyer_organization_id,new.entity_type,new.entity_id,new.rfq_id) is distinct from
   (old.organization_id,old.buyer_organization_id,old.entity_type,old.entity_id,old.rfq_id) or new.visibility<>'internal') then raise exception 'invalid external document'; end if;
 return new;
end $$;
revoke all on function public.fin_external_document_guard() from public,anon,authenticated,service_role;
drop trigger if exists external_document_scope on public.fin_private_documents;
create trigger external_document_scope before update on public.fin_private_documents for each row execute function public.fin_external_document_guard();

-- Include external alternatives in a canonical decision's immutable audit context.
-- The chosen proposal remains governed by the canonical FK and approval engine.
create or replace function public.fin_decision_external_context() returns trigger language plpgsql security definer set search_path='' as $$ begin
 new.snapshot:=new.snapshot||jsonb_build_object('external_alternatives',coalesce((select jsonb_agg(jsonb_build_object(
 'id',p.id,'provider_id',p.provider_id,'origin','buyer_recorded_external','version',v.version,'terms',v.terms,'rfq_revision',v.rfq_revision,
 'currency',v.currency,'source_reference',v.source_reference,'channel',v.channel,'received_at',v.received_at,
 'document_id',v.document_id,'document_version',v.document_version,'document_sha256',v.document_sha256,
 'recorded_by',v.recorded_by,'recorded_at',v.recorded_at,'reviewed_by',q.reviewed_by,'reviewed_at',q.reviewed_at,
 'document_available_at_capture',case when v.document_id is null then null else exists(select 1 from public.fin_private_documents d where d.id=v.document_id and d.removed_at is null) end,
 'review_scope','transcription_correspondence_only','external_validation','not_recorded','institution_acceptance','not_recorded') order by p.id)
 from public.fin_external_proposals p join public.fin_external_proposal_versions v on v.proposal_id=p.id and v.version=p.current_version
 join public.fin_external_proposal_reviews q on q.proposal_id=p.id and q.version=v.version and q.action='confirm'
 where p.rfq_id=new.rfq_id and p.organization_id=new.organization_id and p.state='reviewed'),'[]'::jsonb));
 return new;
end $$;
revoke all on function public.fin_decision_external_context() from public,anon,authenticated,service_role;
drop trigger if exists fin_decisions_external_context on public.fin_decisions;
create trigger fin_decisions_external_context before insert on public.fin_decisions for each row execute function public.fin_decision_external_context();

create or replace function public.fin_governance_export_datasets()
returns table(dataset text, query text) language sql immutable set search_path = '' as $$
  values
    ('external_proposals', 'select * from public.fin_external_proposals where organization_id = $1'),
    ('external_proposal_versions', 'select * from public.fin_external_proposal_versions where organization_id = $1'),
    ('external_proposal_reviews', 'select * from public.fin_external_proposal_reviews where organization_id = $1'),
    ('organization', 'select * from public.fin_organizations where id = $1'),
    ('legal_entities', 'select * from public.fin_legal_entities where organization_id = $1'),
    ('members', 'select organization_id, user_id, role, entity_scope, display_name, job_title, created_at from public.fin_members where organization_id = $1'),
    ('member_entity_grants', 'select * from public.fin_member_entity_grants where organization_id = $1'),
    ('company_profiles', 'select * from public.fin_company_profiles where organization_id = $1'),
    ('company_profile_history', 'select * from public.fin_company_profile_history where organization_id = $1'),
    ('rfqs', 'select * from public.fin_rfqs where organization_id = $1'),
    ('rfq_revisions', 'select * from public.fin_rfq_revisions where organization_id = $1'),
    ('rfq_profile_snapshots', 'select * from public.fin_rfq_profile_snapshots where organization_id = $1'),
    ('rfq_invites', 'select * from public.fin_rfq_invites where buyer_organization_id = $1'),
    ('proposals', 'select * from public.fin_proposals where buyer_organization_id = $1'),
    ('proposal_versions', 'select v.* from public.fin_proposal_versions v join public.fin_proposals p on p.id = v.proposal_id where p.buyer_organization_id = $1 and p.current_version > 0'),
    ('decisions', 'select * from public.fin_decisions where organization_id = $1'),
    ('contracts', 'select * from public.fin_contracts where organization_id = $1'),
    ('contract_versions', 'select * from public.fin_contract_versions where organization_id = $1'),
    ('contract_amendments', 'select * from public.fin_contract_amendments where organization_id = $1'),
    ('contract_milestones', 'select * from public.fin_contract_milestones where organization_id = $1'),
    ('renewal_milestones', 'select * from public.fin_renewal_milestones where organization_id = $1'),
    ('providers', 'select * from public.fin_providers where organization_id = $1'),
    ('provider_contacts', 'select * from public.fin_provider_contacts where organization_id = $1'),
    ('provider_relationships', 'select * from public.fin_provider_relationships where organization_id = $1'),
    ('provider_issues', 'select * from public.fin_provider_issues where organization_id = $1'),
    ('provider_reviews', 'select * from public.fin_provider_reviews where organization_id = $1'),
    ('scorecard_templates', 'select * from public.fin_scorecard_templates where organization_id = $1'),
    ('facilities', 'select * from public.fin_facilities where organization_id = $1'),
    ('facility_balances', 'select * from public.fin_facility_balances where organization_id = $1'),
    ('facility_repayments', 'select * from public.fin_facility_repayments where organization_id = $1'),
    ('facility_history', 'select * from public.fin_facility_history where organization_id = $1'),
    ('guarantees', 'select * from public.fin_guarantees where organization_id = $1'),
    ('policies', 'select * from public.fin_policies where organization_id = $1'),
    ('policy_versions', 'select * from public.fin_policy_versions where organization_id = $1'),
    ('policy_flags', 'select * from public.fin_policy_flags where organization_id = $1'),
    ('approval_policies', 'select * from public.fin_approval_policies where organization_id = $1'),
    ('approval_requests', 'select * from public.fin_approval_requests where organization_id = $1'),
    ('approval_stages', 'select * from public.fin_approval_stages where organization_id = $1'),
    ('approval_steps', 'select s.* from public.fin_approval_steps s join public.fin_approval_requests a on a.id = s.request_id where a.organization_id = $1'),
    ('policy_exceptions', 'select * from public.fin_policy_exceptions where organization_id = $1'),
    ('approval_delegations', 'select * from public.fin_approval_delegations where organization_id = $1'),
    ('tasks', 'select * from public.fin_tasks where organization_id = $1'),
    ('comments', 'select * from public.fin_comments where organization_id = $1'),
    ('events', 'select * from public.fin_events where organization_id = $1'),
    ('documents', 'select * from public.fin_documents where organization_id = $1'),
    ('private_documents', 'select * from public.fin_private_documents where buyer_organization_id = $1'),
    ('document_versions', 'select v.document_id, v.version, v.mime_type, v.size_bytes, v.sha256, v.status, v.uploaded_by, v.created_at, v.completed_at from public.fin_document_versions v join public.fin_private_documents d on d.id = v.document_id where d.buyer_organization_id = $1'),
    ('service_accounts', 'select * from public.fin_service_accounts where organization_id = $1'),
    ('webhook_endpoints', 'select * from public.fin_webhook_endpoints where organization_id = $1'),
    ('sso_connections', 'select * from public.fin_sso_connections where organization_id = $1'),
    ('sso_domains', 'select * from public.fin_sso_domains where organization_id = $1'),
    ('retention_policies', 'select * from public.fin_retention_policies where organization_id = $1'),
    ('legal_holds', 'select * from public.fin_legal_holds where organization_id = $1'),
    ('value_methodologies', 'select * from public.fin_value_methodologies where organization_id = $1'),
    ('value_records', 'select * from public.fin_value_records where organization_id = $1'),
    ('value_observations', 'select * from public.fin_value_observations where organization_id = $1'),
    ('fee_schedules', 'select * from public.fin_fee_schedules where organization_id = $1'),
    ('fee_schedule_versions', 'select * from public.fin_fee_schedule_versions where organization_id = $1'),
    ('fee_observations', 'select * from public.fin_fee_observations where organization_id = $1'),
    ('fee_variances', 'select * from public.fin_fee_variances where organization_id = $1'),
    ('fee_reviews', 'select * from public.fin_fee_reviews where organization_id = $1'),
    ('opportunity_rules', 'select * from public.fin_opportunity_rules where organization_id = $1'),
    ('opportunities', 'select * from public.fin_opportunities where organization_id = $1'),
    ('opportunity_events', 'select * from public.fin_opportunity_events where organization_id = $1'),
    ('document_extractions', 'select * from public.fin_document_extractions where organization_id = $1'),
    ('extraction_facts', 'select * from public.fin_extraction_facts where organization_id = $1'),
    ('extraction_reviews', 'select * from public.fin_extraction_reviews where organization_id = $1'),
    ('qualification_requirements', 'select * from public.fin_qualification_requirements where organization_id = $1'),
    ('provider_qualifications', 'select * from public.fin_provider_qualifications where organization_id = $1'),
    ('qualification_evidence', 'select * from public.fin_qualification_evidence where organization_id = $1'),
    ('qualification_exceptions', 'select * from public.fin_qualification_exceptions where organization_id = $1'),
    ('qualification_events', 'select * from public.fin_qualification_events where organization_id = $1'),
    ('implementation_plans', 'select * from public.fin_implementation_plans where organization_id = $1'),
    ('implementation_milestones', 'select * from public.fin_implementation_milestones where organization_id = $1'),
    ('implementation_dependencies', 'select * from public.fin_implementation_dependencies where organization_id = $1'),
    ('implementation_issues', 'select * from public.fin_implementation_issues where organization_id = $1'),
    ('implementation_acceptances', 'select * from public.fin_implementation_acceptances where organization_id = $1'),
    ('obligations', 'select * from public.fin_obligations where organization_id = $1'),
    ('covenants', 'select * from public.fin_covenants where organization_id = $1'),
    ('obligation_periods', 'select * from public.fin_obligation_periods where organization_id = $1'),
    ('covenant_measurements', 'select * from public.fin_covenant_measurements where organization_id = $1'),
    ('obligation_evidence', 'select * from public.fin_obligation_evidence where organization_id = $1'),
    ('obligation_reviews', 'select * from public.fin_obligation_reviews where organization_id = $1'),
    ('covenant_waivers', 'select * from public.fin_covenant_waivers where organization_id = $1'),
    ('performance_dimensions', 'select * from public.fin_provider_performance_dimensions where organization_id = $1'),
    ('performance_periods', 'select * from public.fin_provider_performance_periods where organization_id = $1'),
    ('performance_targets', 'select * from public.fin_provider_performance_targets where organization_id = $1'),
    ('performance_observations', 'select * from public.fin_provider_performance_observations where organization_id = $1'),
    ('performance_reviews', 'select * from public.fin_provider_performance_reviews where organization_id = $1'),
    ('spend_records', 'select * from public.fin_spend_records where organization_id = $1'),
    ('spend_reconciliations', 'select * from public.fin_spend_reconciliations where organization_id = $1');
$$;
revoke all on function public.fin_governance_export_datasets() from public,anon,authenticated;
grant execute on function public.fin_governance_export_datasets() to service_role;

insert into public.fin_settings(key,value) values ('schema_version', 'financial-external-proposals-1') on conflict(key) do update set value=excluded.value,updated_at=now();
commit;
