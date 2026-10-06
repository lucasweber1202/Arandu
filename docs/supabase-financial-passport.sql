-- Financial Passport v2: o perfil financeiro reutilizável da empresa compradora.
-- Aditivo e idempotente. Rollback: docs/rollback/supabase-financial-passport.rollback.sql
--
-- O que muda:
--   1. fin_company_profiles ganha proveniência completa por campo: confirmação
--      (verified_at/verified_by), período de revisão declarado, vínculo com
--      documento privado do perfil e origens reservadas a caminhos automáticos.
--   2. Toda gravação e confirmação vira histórico append-only
--      (fin_company_profile_history), por gatilho — nenhum caminho escapa.
--   3. A escrita passa a ser só por RPC (fin_passport_set_field,
--      fin_passport_confirm_field), que validam papel, organização, origem e
--      documento no banco. O INSERT/UPDATE direto do cliente é revogado.
--   4. A RFQ criada a partir do Passport guarda um snapshot imutável dos
--      campos usados (fin_rfq_profile_snapshots), legível só pela compradora.
--      Mudança posterior no Passport não altera o processo histórico.
--
-- O provedor nunca lê o Passport: todas as leituras exigem ser membro da
-- organização compradora (fin_has_role), inclusive para quem tem convite aceito.

-- ---------------------------------------------------------------- 1. perfil
alter table public.fin_company_profiles add column if not exists verified_at timestamptz;
alter table public.fin_company_profiles add column if not exists verified_by uuid references auth.users(id);
alter table public.fin_company_profiles add column if not exists review_after_days integer not null default 180;
alter table public.fin_company_profiles add column if not exists document_id uuid references public.fin_private_documents(id);

alter table public.fin_company_profiles drop constraint if exists fin_company_profiles_review_after_days_check;
alter table public.fin_company_profiles add constraint fin_company_profiles_review_after_days_check
  check (review_after_days between 7 and 1825);

-- Superconjunto das origens originais. As cinco novas são reservadas a
-- importação, integração e extração confirmada; a RPC de formulário as recusa.
alter table public.fin_company_profiles drop constraint if exists fin_company_profiles_source_check;
alter table public.fin_company_profiles add constraint fin_company_profiles_source_check
  check (source in ('declarado_pela_empresa','documento_interno','extrato','contrato_vigente','outro',
                    'importacao','integracao','informado_pelo_provedor','calculado','ia_confirmado'));

create index if not exists fin_company_profiles_document_idx on public.fin_company_profiles(document_id) where document_id is not null;

-- ------------------------------------------------------------- 2. histórico
create table if not exists public.fin_company_profile_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  field_key text not null,
  change_type text not null check (change_type in ('created','updated','confirmed')),
  previous_value text,
  new_value text,
  previous_source text,
  new_source text,
  document_id uuid,
  valid_until date,
  review_after_days integer,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
create index if not exists fin_company_profile_history_key_idx
  on public.fin_company_profile_history(organization_id, field_key, changed_at desc);

alter table public.fin_company_profile_history enable row level security;
alter table public.fin_company_profile_history force row level security;
revoke all on public.fin_company_profile_history from anon, authenticated;
grant select on public.fin_company_profile_history to authenticated;
drop policy if exists fin_profile_history_read on public.fin_company_profile_history;
create policy fin_profile_history_read on public.fin_company_profile_history for select to authenticated
  using (public.fin_has_role(organization_id));

create or replace function public.fin_profile_history_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.fin_company_profile_history(organization_id, field_key, change_type, new_value, new_source,
      document_id, valid_until, review_after_days, changed_by)
    values (new.organization_id, new.field_key, 'created', new.field_value, new.source,
      new.document_id, new.valid_until, new.review_after_days, coalesce(auth.uid(), new.updated_by));
  elsif new.field_value is distinct from old.field_value or new.source is distinct from old.source
     or new.document_id is distinct from old.document_id or new.valid_until is distinct from old.valid_until
     or new.review_after_days is distinct from old.review_after_days then
    insert into public.fin_company_profile_history(organization_id, field_key, change_type, previous_value, new_value,
      previous_source, new_source, document_id, valid_until, review_after_days, changed_by)
    values (new.organization_id, new.field_key, 'updated', old.field_value, new.field_value,
      old.source, new.source, new.document_id, new.valid_until, new.review_after_days, coalesce(auth.uid(), new.updated_by));
  elsif new.verified_at is distinct from old.verified_at and new.verified_at is not null then
    insert into public.fin_company_profile_history(organization_id, field_key, change_type, previous_value, new_value,
      previous_source, new_source, document_id, valid_until, review_after_days, changed_by)
    values (new.organization_id, new.field_key, 'confirmed', old.field_value, new.field_value,
      old.source, new.source, new.document_id, new.valid_until, new.review_after_days, coalesce(auth.uid(), new.verified_by));
  end if;
  return new;
end $$;
revoke all on function public.fin_profile_history_trigger() from public, anon, authenticated;

drop trigger if exists fin_company_profiles_history on public.fin_company_profiles;
create trigger fin_company_profiles_history after insert or update on public.fin_company_profiles
  for each row execute function public.fin_profile_history_trigger();

-- O histórico não é reescrito por ninguém. Única exceção: o reset da
-- demonstração (scripts/demo/seed.mjs --reset), que apaga com a chave de
-- serviço e só num banco marcado deployment_environment=demo — onde todo dado
-- é fictício. Em piloto e produção nem a chave de serviço apaga.
create or replace function public.fin_immutable_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_user = 'service_role'
     and exists (select 1 from public.fin_settings where key = 'deployment_environment' and value = 'demo') then
    return old;
  end if;
  raise exception 'immutable record';
end $$;
revoke all on function public.fin_immutable_row() from public, anon, authenticated;

drop trigger if exists fin_company_profile_history_immutable on public.fin_company_profile_history;
create trigger fin_company_profile_history_immutable before update or delete on public.fin_company_profile_history
  for each row execute function public.fin_immutable_row();

-- ----------------------------------------------------------- 3. frescor (SQL)
-- Mesma regra de lib/finance/passport.mjs (freshness): referência = maior data
-- entre gravação e confirmação; vencimento = referência + período, antecipado
-- para valid_until; 30 dias antes do vencimento o campo fica review_due.
create or replace function public.fin_passport_review_due(p_updated timestamptz, p_verified timestamptz, p_days integer, p_valid_until date)
returns date language sql immutable set search_path = '' as $$
  select least((greatest(p_updated, coalesce(p_verified, p_updated)) at time zone 'UTC')::date + p_days, coalesce(p_valid_until, 'infinity'::date));
$$;
revoke all on function public.fin_passport_review_due(timestamptz, timestamptz, integer, date) from public, anon, authenticated;

create or replace function public.fin_passport_freshness(p_due date, p_on date)
returns text language sql immutable set search_path = '' as $$
  select case when p_due is null then 'untracked' when p_on > p_due then 'stale' when p_due - p_on <= 30 then 'review_due' else 'current' end;
$$;
revoke all on function public.fin_passport_freshness(date, date) from public, anon, authenticated;

-- ------------------------------------------------------------- 4. escrita
revoke insert, update on public.fin_company_profiles from authenticated;

create or replace function public.fin_passport_set_field(
  p_org uuid, p_key text, p_value text, p_source text,
  p_document_id uuid default null, p_valid_until date default null, p_review_after_days integer default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_days integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.fin_has_role(p_org, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_org and o.kind = 'BUYER') then
    raise exception 'buyer organization required';
  end if;
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{1,48}$' then raise exception 'invalid profile field'; end if;
  if p_value is null or length(trim(p_value)) not between 1 and 500 or p_value ~ '[<>]' then raise exception 'invalid profile value'; end if;
  -- Origens reservadas exigem caminho próprio (importação, integração, extração).
  if p_source is null or p_source not in ('declarado_pela_empresa','documento_interno','extrato','contrato_vigente','outro') then
    raise exception 'invalid profile source';
  end if;
  v_days := coalesce(p_review_after_days, 180);
  if v_days not between 7 and 1825 then raise exception 'invalid review period'; end if;
  -- Documento: só um documento privado do PERFIL desta organização, não removido.
  if p_document_id is not null and not exists (
      select 1 from public.fin_private_documents d
       where d.id = p_document_id and d.organization_id = p_org and d.entity_type = 'profile'
         and d.entity_id = p_org and d.removed_at is null) then
    raise exception 'invalid profile document';
  end if;

  insert into public.fin_company_profiles as cp (organization_id, field_key, field_value, source, status, valid_until,
    review_after_days, document_id, updated_by, updated_at, verified_at, verified_by)
  values (p_org, p_key, trim(p_value), p_source, 'informado', p_valid_until, v_days, p_document_id, auth.uid(), now(), null, null)
  on conflict (organization_id, field_key) do update set
    field_value = excluded.field_value, source = excluded.source, status = 'informado',
    valid_until = excluded.valid_until, review_after_days = excluded.review_after_days,
    document_id = excluded.document_id, updated_by = excluded.updated_by, updated_at = now(),
    -- A confirmação valia para o valor anterior.
    verified_at = case when cp.field_value = excluded.field_value and cp.source = excluded.source
                        and cp.document_id is not distinct from excluded.document_id then cp.verified_at end,
    verified_by = case when cp.field_value = excluded.field_value and cp.source = excluded.source
                        and cp.document_id is not distinct from excluded.document_id then cp.verified_by end
  returning id into v_id;

  -- A trilha guarda o campo, nunca o valor.
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (p_org, 'profile', p_org, 'profile_field_saved', auth.uid(), jsonb_build_object('field_key', p_key, 'source', p_source));
  return v_id;
end $$;
revoke all on function public.fin_passport_set_field(uuid, text, text, text, uuid, date, integer) from public, anon;
grant execute on function public.fin_passport_set_field(uuid, text, text, text, uuid, date, integer) to authenticated;

create or replace function public.fin_passport_confirm_field(p_org uuid, p_key text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.fin_has_role(p_org, array['admin','finance_manager','analyst']) then raise exception 'forbidden'; end if;
  update public.fin_company_profiles set verified_at = v_at, verified_by = auth.uid(), status = 'revisado'
   where organization_id = p_org and field_key = p_key;
  if not found then raise exception 'invalid profile field'; end if;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
  values (p_org, 'profile', p_org, 'profile_field_confirmed', auth.uid(), jsonb_build_object('field_key', p_key));
  return v_at;
end $$;
revoke all on function public.fin_passport_confirm_field(uuid, text) from public, anon;
grant execute on function public.fin_passport_confirm_field(uuid, text) to authenticated;

-- ----------------------------------------------- 5. snapshot na criação da RFQ
create table if not exists public.fin_rfq_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rfq_id uuid not null,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,48}$'),
  demand_key text not null check (demand_key ~ '^[a-z][a-z0-9_]{1,48}$'),
  field_value text not null,
  source text not null,
  profile_updated_at timestamptz,
  profile_updated_by uuid,
  verified_at timestamptz,
  document_id uuid,
  review_due_on date,
  freshness text not null check (freshness in ('current','review_due','stale','untracked')),
  used_as_is boolean not null,
  captured_by uuid not null references auth.users(id),
  captured_at timestamptz not null default now(),
  foreign key (organization_id, rfq_id) references public.fin_rfqs(organization_id, id),
  unique (rfq_id, demand_key)
);
alter table public.fin_rfq_profile_snapshots enable row level security;
alter table public.fin_rfq_profile_snapshots force row level security;
revoke all on public.fin_rfq_profile_snapshots from anon, authenticated;
grant select on public.fin_rfq_profile_snapshots to authenticated;
drop policy if exists fin_rfq_profile_snapshot_read on public.fin_rfq_profile_snapshots;
-- Só a compradora. O provedor convidado lê a demanda da RFQ, nunca o Passport.
create policy fin_rfq_profile_snapshot_read on public.fin_rfq_profile_snapshots for select to authenticated
  using (public.fin_has_role(organization_id));

drop trigger if exists fin_rfq_profile_snapshots_immutable on public.fin_rfq_profile_snapshots;
create trigger fin_rfq_profile_snapshots_immutable before update or delete on public.fin_rfq_profile_snapshots
  for each row execute function public.fin_immutable_row();

create or replace function public.fin_try_numeric(p_value text)
returns numeric language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null or p_value !~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then return null; end if;
  return p_value::numeric;
end $$;
revoke all on function public.fin_try_numeric(text) from public, anon, authenticated;

-- Cria a RFQ e, na mesma transação, fotografa os campos do Passport usados.
-- p_usage: [{"demand_key": "...", "field_key": "..."}]. A API valida o
-- mapeamento do produto; aqui só se exige que o campo exista na própria
-- organização. `used_as_is` diz se a pessoa manteve o valor do Passport.
create or replace function public.fin_create_rfq_from_passport(
  p_org uuid, p_product text, p_title text, p_description text, p_demand jsonb, p_deadline date, p_usage jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_rfq uuid; v_item jsonb; v_key text; v_demand_key text; v_row public.fin_company_profiles%rowtype;
  v_org public.fin_organizations%rowtype; v_value text; v_source text; v_due date; v_given text;
begin
  if jsonb_typeof(coalesce(p_usage, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_usage, '[]'::jsonb)) > 10 then
    raise exception 'invalid passport usage';
  end if;
  -- Papel, produto, demanda e tipo de organização: as mesmas regras de fin_create_rfq.
  v_rfq := public.fin_create_rfq(p_org, p_product, p_title, p_description, p_demand, p_deadline);
  select * into v_org from public.fin_organizations where id = p_org;
  for v_item in select * from jsonb_array_elements(coalesce(p_usage, '[]'::jsonb)) loop
    v_key := v_item->>'field_key';
    v_demand_key := v_item->>'demand_key';
    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{1,48}$' or v_demand_key is null or v_demand_key !~ '^[a-z][a-z0-9_]{1,48}$' then
      raise exception 'invalid passport usage';
    end if;
    if v_key = 'sector' then
      -- Campo do cadastro da organização: sem período de revisão.
      if v_org.sector is null then raise exception 'invalid passport usage'; end if;
      v_value := v_org.sector; v_source := 'cadastro_organizacao'; v_due := null;
      v_row := null;
    else
      select * into v_row from public.fin_company_profiles where organization_id = p_org and field_key = v_key;
      if not found then raise exception 'invalid passport usage'; end if;
      v_value := v_row.field_value; v_source := v_row.source;
      v_due := public.fin_passport_review_due(v_row.updated_at, v_row.verified_at, v_row.review_after_days, v_row.valid_until);
    end if;
    v_given := p_demand->>v_demand_key;
    insert into public.fin_rfq_profile_snapshots(organization_id, rfq_id, field_key, demand_key, field_value, source,
      profile_updated_at, profile_updated_by, verified_at, document_id, review_due_on, freshness, used_as_is, captured_by)
    values (p_org, v_rfq, v_key, v_demand_key, v_value, v_source,
      v_row.updated_at, v_row.updated_by, v_row.verified_at, v_row.document_id, v_due,
      public.fin_passport_freshness(v_due, (now() at time zone 'UTC')::date),
      coalesce(v_given = v_value or public.fin_try_numeric(v_given) = public.fin_try_numeric(v_value), false),
      auth.uid());
  end loop;
  if jsonb_array_length(coalesce(p_usage, '[]'::jsonb)) > 0 then
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'rfq', v_rfq, 'rfq_passport_snapshot', auth.uid(), jsonb_build_object('fields', jsonb_array_length(p_usage)));
  end if;
  return v_rfq;
end $$;
revoke all on function public.fin_create_rfq_from_passport(uuid, text, text, text, jsonb, date, jsonb) from public, anon;
grant execute on function public.fin_create_rfq_from_passport(uuid, text, text, text, jsonb, date, jsonb) to authenticated;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-passport-1')
on conflict (key) do update set value = excluded.value, updated_at = now();
