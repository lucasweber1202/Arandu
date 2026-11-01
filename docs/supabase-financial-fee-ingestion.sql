-- Structured fee ingestion and authorized ERP configuration. Events are the
-- immutable source for configuration versions and command receipts. No raw file,
-- credential, parallel fee ledger or duplicate contract table is persisted.
begin;
insert into public.fin_settings(key,value) select 'fee_ingestion_previous_marker',value from public.fin_settings where key='schema_version' on conflict(key) do nothing;
create index if not exists fin_fee_import_receipts on public.fin_events(organization_id,actor_id,(metadata->>'request_key')) where event_type in ('fee_import_completed','fee_integration_configured');
create index if not exists fin_fee_integration_versions on public.fin_events(organization_id,entity_id,((metadata->>'version')::integer)) where event_type='fee_integration_configured';
create or replace function public.fin_fee_integration(p_org uuid,p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select e.metadata from public.fin_events e where e.organization_id=p_org and e.entity_type='fee_integration' and e.entity_id=p_id and e.event_type='fee_integration_configured'
 order by (e.metadata->>'version')::integer desc limit 1;
$$;
revoke all on function public.fin_fee_integration(uuid,uuid) from public,anon;
grant execute on function public.fin_fee_integration(uuid,uuid) to authenticated;

create or replace function public.fin_list_fee_integrations(p_org uuid,p_after uuid default null,p_limit integer default 25)
returns setof jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_org is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid fee integration';end if;
 return query select x.metadata from (
  select distinct on(e.entity_id) e.entity_id,e.metadata from public.fin_events e
  where e.organization_id=p_org and e.entity_type='fee_integration' and e.event_type='fee_integration_configured' and (p_after is null or e.entity_id>p_after)
  order by e.entity_id,(e.metadata->>'version')::integer desc
 ) x order by x.entity_id limit p_limit+1;
end $$;
revoke all on function public.fin_list_fee_integrations(uuid,uuid,integer) from public,anon;
grant execute on function public.fin_list_fee_integrations(uuid,uuid,integer) to authenticated;

create or replace function public.fin_configure_fee_integration(p_org uuid,p_id uuid,p_contract uuid,p_expected integer,p_request uuid,p_settings jsonb,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.fin_contracts%rowtype; previous jsonb; receipt jsonb; result jsonb; request_hash text; k text;
begin
 if p_org is null or p_id is null or p_contract is null or p_request is null or p_expected is null or p_expected<0 or p_status is null or p_status not in ('configured','suspended','revoked') then raise exception 'invalid fee integration';end if;
 select * into c from public.fin_contracts where organization_id=p_org and id=p_contract for share;
 if c.id is null or not public.fin_has_role(p_org,array['admin']) then raise exception 'forbidden';end if;
 perform public.fin_crm_actor(p_org,c.legal_entity_id,auth.uid());
 if not exists(select 1 from public.fin_organizations where id=p_org and kind='BUYER') then raise exception 'forbidden';end if;
 perform pg_advisory_xact_lock(hashtextextended('fee-ingestion:'||p_org::text,0));
 if not public.fin_has_role(p_org,array['admin']) then raise exception 'forbidden';end if;
 if jsonb_typeof(p_settings) is distinct from 'object' or length(p_settings::text)>2000 or p_settings::text ~ '[<>]' or exists(select 1 from jsonb_object_keys(p_settings) x where x not in ('tenant_id','environment','company_id','account_id','currency','service','charging_unit')) then raise exception 'invalid fee integration';end if;
 if exists(select 1 from jsonb_each(p_settings) x where jsonb_typeof(x.value) is distinct from 'string') or (p_settings->>'service') ~ '[[:cntrl:]]' then raise exception 'invalid fee integration';end if;
 foreach k in array array['tenant_id','company_id','account_id'] loop
  if jsonb_typeof(p_settings->k) is distinct from 'string' or (p_settings->>k) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'invalid fee integration';end if;
 end loop;
 if coalesce(p_settings->>'environment','') !~ '^[A-Za-z0-9_-]{1,60}$' or coalesce(p_settings->>'currency','') not in ('BRL','USD','EUR','GBP','CHF','JPY','CAD','AUD','CNY','MXN','ARS','CLP','COP','PEN') or length(trim(coalesce(p_settings->>'service',''))) not between 2 and 120
 or coalesce(p_settings->>'charging_unit','') not in ('per_transaction','per_item','per_month','per_year','percent_of_volume','percent_of_amount','one_off') then raise exception 'invalid fee integration';end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_id,p_contract,p_expected,p_settings,p_status)::text,'UTF8')),'hex');
 select e.metadata into receipt from public.fin_events e where e.organization_id=p_org and e.actor_id=auth.uid() and e.event_type='fee_integration_configured' and e.metadata->>'request_key'=p_request::text limit 1;
 if receipt is not null then
  if receipt->>'input_hash' is distinct from request_hash then raise exception 'fee import request conflict';end if;
  return receipt||jsonb_build_object('replayed',true);
 end if;
 previous:=public.fin_fee_integration(p_org,p_id);
 if previous is null and (p_expected<>0 or p_status<>'configured') or previous is not null and ((previous->>'version')::integer<>p_expected or previous->>'contract_id'<>p_contract::text or previous->>'status'='revoked') then raise exception 'fee integration version conflict';end if;
 result:=jsonb_build_object('id',p_id,'contract_id',p_contract,'version',p_expected+1,'status',p_status,'settings',p_settings,'request_key',p_request,'input_hash',request_hash,'adapter','dynamics-business-central-v2','connection_state','not_tested');
 insert into public.fin_events(organization_id,legal_entity_id,entity_type,entity_id,event_type,actor_id,metadata,happened_at) values(p_org,c.legal_entity_id,'fee_integration',p_id,'fee_integration_configured',auth.uid(),result,clock_timestamp());
 return result||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.fin_configure_fee_integration(uuid,uuid,uuid,integer,uuid,jsonb,text) from public,anon;
grant execute on function public.fin_configure_fee_integration(uuid,uuid,uuid,integer,uuid,jsonb,text) to authenticated;

-- Preserve the immutable capture channel without relabeling old observations.
alter table public.fin_fee_observations drop constraint if exists fin_fee_observations_ingestion_channel_check;
alter table public.fin_fee_observations drop constraint if exists fin_fee_ingestion_channel_check;
alter table public.fin_fee_observations add constraint fin_fee_ingestion_channel_check check(ingestion_channel in ('manual_entry','structured_file','erp_adapter'));
create or replace function public.fin_record_fee_observation_internal(p_org uuid, p_contract uuid, p_input jsonb, p_channel text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.fin_contracts%rowtype; x public.fin_fee_observations%rowtype; e public.fin_fee_observations%rowtype; r public.fin_fee_variances%rowtype; v_key text;
begin
  if p_channel is null or p_channel not in ('manual_entry','structured_file','erp_adapter') or p_channel='structured_file' and p_input->>'source_type' is distinct from 'other_import' or p_channel='erp_adapter' and p_input->>'source_type' is distinct from 'erp' then raise exception 'invalid fee observation source';end if;
  select * into c from public.fin_contracts where organization_id = p_org and id = p_contract for share;
  if c.id is null or auth.uid() is null or not public.fin_entity_allows(p_org, c.legal_entity_id, array['admin','finance_manager'])
     or not exists (select 1 from public.fin_organizations where id = p_org and kind = 'BUYER') then raise exception 'forbidden'; end if;
  if public.fin_governance_org_locked(p_org) then raise exception 'organization offboarding'; end if;
  -- Existing declared sources remain valid; the capture channel is supplied only by canonical wrappers.
  if p_input->>'source_type' is null or p_input->>'source_type' not in ('manual','bank_statement','erp','tms','bank_file','other_import') then raise exception 'invalid fee observation source'; end if;
  begin
    if p_input is null or jsonb_typeof(p_input) <> 'object' or length(p_input::text) > 4000
       or exists (select 1 from jsonb_object_keys(p_input) k where k not in ('service','charging_unit','currency','period_start','period_end','volume','base_amount','observed_amount','source_type','source_reference','source_object_id','evidence_reference'))
       or jsonb_typeof(p_input->'observed_amount') is distinct from 'number'
       or (p_input ? 'volume' and jsonb_typeof(p_input->'volume') not in ('number','null'))
       or (p_input ? 'base_amount' and jsonb_typeof(p_input->'base_amount') not in ('number','null')) then raise exception 'invalid fee observation'; end if;
    if (p_input->>'observed_amount')::numeric <> round((p_input->>'observed_amount')::numeric, 2)
       or (p_input->>'base_amount')::numeric <> round((p_input->>'base_amount')::numeric, 2)
       or (p_input->>'period_start')::date is null or (p_input->>'period_end')::date is null
       or (p_input->>'period_end')::date >= current_date + 1 then raise exception 'invalid fee observation'; end if;
  exception when others then raise exception 'invalid fee observation';
  end;
  v_key := md5(concat_ws('|', p_input->>'source_type', lower(btrim(p_input->>'source_reference')), c.id::text, lower(btrim(p_input->>'service')), p_input->>'charging_unit', p_input->>'period_start', p_input->>'period_end'));
  select * into e from public.fin_fee_observations where organization_id = p_org and dedupe_key = v_key;
  if e.id is not null then
    -- Replay of the same fact is idempotent; a different fact under the same key is a conflict.
    if e.observed_amount = (p_input->>'observed_amount')::numeric and e.currency = p_input->>'currency'
       and e.volume is not distinct from (p_input->>'volume')::numeric and e.base_amount is not distinct from (p_input->>'base_amount')::numeric then return e.id; end if;
    raise exception 'fee observation conflict';
  end if;
  begin
    insert into public.fin_fee_observations(organization_id, contract_id, legal_entity_id, provider_id, service, charging_unit, currency, period_start, period_end,
      volume, base_amount, observed_amount, source_type, source_reference, source_object_id, evidence_reference, owner_id, dedupe_key, ingestion_channel)
    values (p_org, c.id, c.legal_entity_id, c.provider_id, trim(p_input->>'service'), p_input->>'charging_unit', p_input->>'currency',
      (p_input->>'period_start')::date, (p_input->>'period_end')::date, (p_input->>'volume')::numeric, (p_input->>'base_amount')::numeric,
      (p_input->>'observed_amount')::numeric, p_input->>'source_type', trim(p_input->>'source_reference'), nullif(trim(coalesce(p_input->>'source_object_id', '')), ''),
      trim(p_input->>'evidence_reference'), auth.uid(), v_key, p_channel)
    returning * into x;
  exception when check_violation or not_null_violation or invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'invalid fee observation';
  end;
  r := public.fin_compare_fee(x);
  insert into public.fin_fee_variances select r.*;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'contract', c.id, 'fee_observation_recorded', auth.uid(), jsonb_build_object('observation_id', x.id, 'source_type', x.source_type, 'comparison_status', r.comparison_status));
  if r.comparison_status = 'comparable' and r.direction <> 'equal' then
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (p_org, 'contract', c.id, 'fee_variance_detected', auth.uid(), jsonb_build_object('variance_id', r.id, 'direction', r.direction, 'schedule_version', r.schedule_version));
  end if;
  return x.id;
end $$;

revoke all on function public.fin_record_fee_observation_internal(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
create or replace function public.fin_record_fee_observation(p_org uuid,p_contract uuid,p_input jsonb)
returns uuid language sql security definer set search_path='' as $$
 select public.fin_record_fee_observation_internal(p_org,p_contract,p_input,'manual_entry');
$$;
revoke all on function public.fin_record_fee_observation(uuid,uuid,jsonb) from public,anon;
grant execute on function public.fin_record_fee_observation(uuid,uuid,jsonb) to authenticated;

create or replace function public.fin_import_fee_batch(p_org uuid,p_contract uuid,p_request uuid,p_fingerprint text,p_file_name text,p_rows jsonb,p_confirmation boolean,p_origin jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.fin_contracts%rowtype; receipt jsonb; request_hash text; result jsonb; row jsonb; entry jsonb; observation uuid; existing public.fin_fee_observations%rowtype; results jsonb:='[]'; integration jsonb; imported integer:=0; ignored integer:=0;
begin
 if p_org is null or p_contract is null or p_request is null or p_confirmation is distinct from true then raise exception 'fee import confirmation required';end if;
 select * into c from public.fin_contracts where organization_id=p_org and id=p_contract for share;
 if c.id is null or not public.fin_has_role(p_org,array['admin','finance_manager']) then raise exception 'forbidden';end if;
 perform public.fin_crm_actor(p_org,c.legal_entity_id,auth.uid());
 perform pg_advisory_xact_lock(hashtextextended('fee-ingestion:'||p_org::text,0));
 if coalesce(p_fingerprint,'') !~ '^[0-9a-f]{64}$' or coalesce(p_file_name,'') !~ '^[^<>[:cntrl:]]{1,120}$' or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 100 or length(p_rows::text)>100000 or jsonb_typeof(p_origin) is distinct from 'object' or length(p_origin::text)>1000 then raise exception 'invalid fee import';end if;
 if exists(select 1 from jsonb_object_keys(p_origin) x where x not in ('integration_id','expected_version','watermark')) then raise exception 'invalid fee import';end if;
 if p_origin ? 'integration_id' then
  integration:=public.fin_fee_integration(p_org,(p_origin->>'integration_id')::uuid);
  if integration is null or integration->>'contract_id'<>p_contract::text or integration->>'status'<>'configured' or integration->>'version' is distinct from p_origin->>'expected_version' then raise exception 'fee integration version conflict';end if;
 end if;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_contract,p_fingerprint,p_file_name,p_rows,p_origin)::text,'UTF8')),'hex');
 select e.metadata into receipt from public.fin_events e where e.organization_id=p_org and e.actor_id=auth.uid() and e.event_type='fee_import_completed' and e.metadata->>'request_key'=p_request::text limit 1;
 if receipt is not null then
  if receipt->>'input_hash' is distinct from request_hash then raise exception 'fee import request conflict';end if;
  return receipt->'result'||jsonb_build_object('replayed',true);
 end if;
 for row in select * from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(row) is distinct from 'object' or exists(select 1 from jsonb_object_keys(row) x where x not in ('line','values')) or jsonb_typeof(row->'line') is distinct from 'number' or (row->>'line')::integer<1 or (row->>'line')::numeric<>(row->>'line')::integer or jsonb_typeof(row->'values') is distinct from 'object' then raise exception 'invalid fee import';end if;
  entry:=row->'values';
  if coalesce(entry->>'source_type','') not in ('other_import','erp') then raise exception 'invalid fee import';end if;
  if (entry->>'source_type'='erp') is distinct from (integration is not null) then raise exception 'invalid fee import';end if;
  select * into existing from public.fin_fee_observations where organization_id=p_org and contract_id=p_contract and source_type=entry->>'source_type' and lower(btrim(source_reference))=lower(btrim(entry->>'source_reference')) limit 1;
  if existing.id is not null and (lower(btrim(existing.service)) is distinct from lower(btrim(entry->>'service')) or existing.charging_unit is distinct from entry->>'charging_unit' or existing.currency is distinct from entry->>'currency' or existing.period_start is distinct from (entry->>'period_start')::date or existing.period_end is distinct from (entry->>'period_end')::date or existing.observed_amount is distinct from (entry->>'observed_amount')::numeric or existing.volume is distinct from (entry->>'volume')::numeric or existing.base_amount is distinct from (entry->>'base_amount')::numeric) then raise exception 'fee import source conflict';end if;
  observation:=public.fin_record_fee_observation_internal(p_org,p_contract,entry,case when integration is null then 'structured_file' else 'erp_adapter' end);
  if existing.id is null then imported:=imported+1;else ignored:=ignored+1;end if;
  results:=results||jsonb_build_array(jsonb_build_object('line',(row->>'line')::integer,'id',observation,'state',case when existing.id is null then 'imported' else 'ignored' end));
 end loop;
 result:=jsonb_build_object('rows',results,'imported',imported,'ignored',ignored,'fingerprint',p_fingerprint);
 insert into public.fin_events(organization_id,legal_entity_id,entity_type,entity_id,event_type,actor_id,metadata,happened_at) values(p_org,c.legal_entity_id,'contract',p_contract,'fee_import_completed',auth.uid(),jsonb_build_object('request_key',p_request,'input_hash',request_hash,'fingerprint',p_fingerprint,'file_name',p_file_name,'origin',p_origin,'result',result),clock_timestamp());
 return result||jsonb_build_object('replayed',false);
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then raise exception 'invalid fee import';
end $$;
revoke all on function public.fin_import_fee_batch(uuid,uuid,uuid,text,text,jsonb,boolean,jsonb) from public,anon;
grant execute on function public.fin_import_fee_batch(uuid,uuid,uuid,text,text,jsonb,boolean,jsonb) to authenticated;
insert into public.fin_settings(key,value) values ('schema_version', 'financial-fee-ingestion-1') on conflict(key) do update set value=excluded.value,updated_at=now();
notify pgrst,'reload schema';
commit;
