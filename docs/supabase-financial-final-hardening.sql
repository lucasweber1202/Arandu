-- Arandu Financial Procurement — hardening técnico final antes do piloto.
-- Aditiva e idempotente. Rollback: docs/rollback/supabase-financial-final-hardening.rollback.sql
--
-- 1. Papel de plataforma `finance_ops`, separado do admin legado.
--    O console operacional exigia só a linha em fin_platform_operators + aal2;
--    na prática o operador precisava de app_metadata.arandu_role = 'operator'
--    para obter aal2 pelo login administrativo, e esse papel também dá escrita
--    no admin legado de arte. Agora o banco exige, no JWT verificado pelo
--    PostgREST, app_metadata.arandu_role = 'finance_ops' + registro em
--    fin_platform_operators + aal2. 'finance_ops' não é papel administrativo
--    legado (lib/admin-auth.mjs não o aceita), então não abre nenhuma rota de arte.
--    Compatibilidade: 'operator' continua sendo o papel legado de arte, sem
--    mudança; ele deixa de abrir o console financeiro (docs/FINANCIAL_PILOT_OPERATIONS.md).
--
-- 2. Convite de provedor vinculado ao destinatário.
--    Com contato cadastrado no provedor, o convite passa a ser do e-mail exato
--    (recipient_mode = 'exact_email'): só aceita a conta cujo e-mail, confirmado,
--    é igual ao do contato. Sem contato, o convite é explicitamente
--    'organization_open' e a API diz isso ao comprador. Recusas devolvem o
--    mesmo erro genérico ao cliente e ficam em fin_invite_acceptance_denials
--    (motivo interno, visível só ao console operacional).

-- --------------------------------------------------------- 1. finance_ops
create or replace function public.fin_platform_role()
returns text language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'arandu_role',
    nullif(current_setting('request.jwt.claim.app_metadata', true), '')::jsonb ->> 'arandu_role',
    '');
$$;
revoke all on function public.fin_platform_role() from public, anon;
grant execute on function public.fin_platform_role() to authenticated, service_role;

create or replace function public.fin_require_operator()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.fin_platform_role() <> 'finance_ops'
     or not exists (select 1 from public.fin_platform_operators o where o.user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if public.fin_jwt_aal() <> 'aal2' then raise exception 'mfa required'; end if;
end $$;
revoke all on function public.fin_require_operator() from public, anon, authenticated;

create or replace function public.fin_is_operator()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.fin_platform_role() = 'finance_ops'
     and exists (select 1 from public.fin_platform_operators o where o.user_id = auth.uid());
$$;
revoke all on function public.fin_is_operator() from public, anon;
grant execute on function public.fin_is_operator() to authenticated;

-- ------------------------------------------ 2. destinatário do convite
alter table public.fin_rfq_invites add column if not exists recipient_mode text;
alter table public.fin_rfq_invites add column if not exists recipient_email text;
-- Convites já emitidos: vinculados ao contato cadastrado quando ele existe.
update public.fin_rfq_invites i
   set recipient_email = nullif(lower(trim(coalesce(p.contact_email, ''))), ''),
       recipient_mode = case when nullif(trim(coalesce(p.contact_email, '')), '') is null then 'organization_open' else 'exact_email' end
  from public.fin_providers p
 where p.id = i.provider_id and i.recipient_mode is null;
update public.fin_rfq_invites set recipient_mode = 'organization_open', recipient_email = null where recipient_mode is null;
alter table public.fin_rfq_invites alter column recipient_mode set not null;
alter table public.fin_rfq_invites drop constraint if exists fin_rfq_invites_recipient_check;
alter table public.fin_rfq_invites add constraint fin_rfq_invites_recipient_check check (
  (recipient_mode = 'exact_email' and recipient_email is not null and recipient_email = lower(trim(recipient_email)))
  or (recipient_mode = 'organization_open' and recipient_email is null));

create table if not exists public.fin_invite_acceptance_denials (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.fin_rfq_invites(id) on delete cascade,
  rfq_id uuid not null,
  user_id uuid not null references auth.users(id),
  reason text not null check (reason in ('recipient_mismatch','no_email','email_unconfirmed','provider_bound_elsewhere','organization_already_in_rfq')),
  happened_at timestamptz not null default now()
);
create index if not exists fin_invite_denials_recent on public.fin_invite_acceptance_denials (happened_at desc);
alter table public.fin_invite_acceptance_denials enable row level security;
alter table public.fin_invite_acceptance_denials force row level security;
revoke all on public.fin_invite_acceptance_denials from anon, authenticated;

create or replace function public.fin_invite_provider(p_rfq uuid, p_provider uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_token text; v_invite uuid; v_contact text; v_buyer text; v_deadline date; v_product text; v_recipient text;
begin
  select organization_id, status, response_deadline, product into v_org, v_status, v_deadline, v_product
    from public.fin_rfqs where id = p_rfq;
  if v_org is null then raise exception 'rfq not found'; end if;
  if not public.fin_has_role(v_org, array['admin','finance_manager']) then raise exception 'forbidden'; end if;
  if v_status not in ('draft','open','collecting') then raise exception 'invalid state'; end if;
  select contact_email into v_contact from public.fin_providers p
    where p.id = p_provider and p.organization_id = v_org and p.status = 'active';
  if not found then raise exception 'provider not found'; end if;
  select legal_name into v_buyer from public.fin_organizations where id = v_org;
  v_invite := gen_random_uuid();
  v_token := encode(sha256(convert_to(public.fin_setting('invite_secret') || ':' || v_invite::text, 'UTF8')), 'hex');
  -- Com contato cadastrado, o convite é daquele e-mail (exact_email); sem
  -- contato, é explicitamente aberto à organização que receber o link.
  v_recipient := nullif(lower(trim(coalesce(v_contact, ''))), '');
  insert into public.fin_rfq_invites (id, buyer_organization_id, rfq_id, provider_id, token_hash, created_by, recipient_mode, recipient_email)
    values (v_invite, v_org, p_rfq, p_provider, encode(sha256(convert_to(v_token,'UTF8')),'hex'), auth.uid(),
            case when v_recipient is null then 'organization_open' else 'exact_email' end, v_recipient);
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_org, 'rfq', p_rfq, 'provider_invited', auth.uid());
  if v_contact is not null then
    perform public.fin_enqueue_email(
      'provider_invite', v_contact, 'rfq', p_rfq,
      jsonb_build_object('buyer', v_buyer, 'product', v_product, 'deadline', v_deadline, 'invite_ref', v_invite),
      'provider_invite:' || v_invite::text);
  end if;
  return v_token;
end $$;
revoke all on function public.fin_invite_provider(uuid, uuid) from public, anon;
grant execute on function public.fin_invite_provider(uuid, uuid) to authenticated;

create or replace function public.fin_accept_provider_invite(p_token text, p_provider_org uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.fin_rfq_invites%rowtype; v_email text; v_confirmed timestamptz; v_reason text;
begin
  if auth.uid() is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid invitation'; end if;
  if not public.fin_has_role(p_provider_org, array['admin','provider_user']) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.fin_organizations o where o.id = p_provider_org and o.kind = 'PROVIDER') then
    raise exception 'provider organization required';
  end if;
  select * into v_inv from public.fin_rfq_invites
    where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and status = 'invited' and accepted_at is null and expires_at > now()
    for update;
  if not found then raise exception 'invalid invitation'; end if;
  if v_inv.buyer_organization_id = p_provider_org then raise exception 'invalid invitation'; end if;
  -- Recusas daqui em diante ficam registradas (motivo interno) e devolvem null:
  -- a API responde o mesmo erro genérico de convite inválido, sem dizer qual
  -- e-mail era esperado nem qual organização deveria aceitar.
  if v_inv.recipient_mode = 'exact_email' then
    select nullif(lower(trim(coalesce(u.email, ''))), ''), u.email_confirmed_at into v_email, v_confirmed
      from auth.users u where u.id = auth.uid();
    v_reason := case when v_email is null then 'no_email'
                     when v_confirmed is null then 'email_unconfirmed'
                     when v_email <> v_inv.recipient_email then 'recipient_mismatch' end;
  end if;
  -- Cadastro do comprador já vinculado a outra conta provedora (#73).
  if v_reason is null and exists (
    select 1 from public.fin_providers p
    where p.id = v_inv.provider_id and p.organization_id = v_inv.buyer_organization_id
      and p.provider_organization_id is not null and p.provider_organization_id <> p_provider_org
  ) then v_reason := 'provider_bound_elsewhere'; end if;
  -- A mesma conta já ocupa outra vaga aceita nesta RFQ (#73).
  if v_reason is null and exists (
    select 1 from public.fin_rfq_invites i
    where i.rfq_id = v_inv.rfq_id and i.id <> v_inv.id
      and i.status = 'accepted' and i.provider_organization_id = p_provider_org
  ) then v_reason := 'organization_already_in_rfq'; end if;
  if v_reason is not null then
    insert into public.fin_invite_acceptance_denials (invite_id, rfq_id, user_id, reason)
      values (v_inv.id, v_inv.rfq_id, auth.uid(), v_reason);
    return null;
  end if;
  update public.fin_rfq_invites
    set status = 'accepted', accepted_at = now(), provider_organization_id = p_provider_org
    where id = v_inv.id;
  -- O cadastro do comprador passa a apontar para a conta canônica do provedor.
  update public.fin_providers
    set provider_organization_id = p_provider_org, updated_at = now()
    where id = v_inv.provider_id and organization_id = v_inv.buyer_organization_id
      and provider_organization_id is null;
  insert into public.fin_proposals (invite_id, rfq_id, buyer_organization_id, provider_id, provider_organization_id, product)
    select v_inv.id, v_inv.rfq_id, v_inv.buyer_organization_id, v_inv.provider_id, p_provider_org, r.product
    from public.fin_rfqs r where r.id = v_inv.rfq_id
    on conflict (invite_id) do nothing;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_inv.buyer_organization_id, 'rfq', v_inv.rfq_id, 'invite_accepted', auth.uid());
  return v_inv.id;
end $$;
revoke all on function public.fin_accept_provider_invite(text, uuid) from public, anon;
grant execute on function public.fin_accept_provider_invite(text, uuid) to authenticated;

-- ------------------------------------------ 3. console: recusas e versão
create or replace function public.fin_ops_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.fin_require_operator();
  insert into public.fin_ops_access_log (user_id, action) values (auth.uid(), 'overview');
  select jsonb_build_object(
    'schema_version', public.fin_setting('schema_version', 'financial-pilot-grade-1'),
    'generated_at', now(),
    'email_enabled', public.fin_setting('email_enabled', 'false') = 'true',
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job', j.job, 'status', j.status, 'processed', j.processed, 'request_id', j.request_id,
        'error_code', j.error_code, 'started_at', j.started_at, 'finished_at', j.finished_at) order by j.finished_at desc)
      from (select * from public.fin_job_runs order by finished_at desc limit 10) j), '[]'::jsonb),
    'last_renewal_success', (select max(finished_at) from public.fin_job_runs where job = 'renewals' and status = 'succeeded'),
    'renewal_milestones_24h', (select count(*) from public.fin_renewal_milestones where triggered_at > now() - interval '24 hours'),
    'outbox', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(status, total) from (select status, count(*) total from public.transactional_email_outbox
          where template = 'finance_notification' group by status) s), '{}'::jsonb),
      'oldest_pending_minutes', (select floor(extract(epoch from now() - min(created_at)) / 60) from public.transactional_email_outbox
          where template = 'finance_notification' and status in ('pending','retry')),
      'recent_failures', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'attempts', o.attempts,
          'error_code', o.last_error_code, 'created_at', o.created_at) order by o.created_at desc)
        from (select * from public.transactional_email_outbox where template = 'finance_notification' and status in ('retry','dead')
              order by created_at desc limit 10) o), '[]'::jsonb)),
    'documents', jsonb_build_object(
      'pending_over_1h', (select count(*) from public.fin_document_versions where status = 'pending' and created_at < now() - interval '1 hour'),
      'failed_24h', (select count(*) from public.fin_document_versions where status = 'failed' and completed_at > now() - interval '24 hours'),
      'available_total', (select count(*) from public.fin_document_versions where status = 'available')),
    'notifications_24h', (select count(*) from public.fin_notifications where created_at > now() - interval '24 hours'),
    'invite_denials_24h', coalesce((select jsonb_object_agg(reason, total) from (select reason, count(*) total
      from public.fin_invite_acceptance_denials where happened_at > now() - interval '24 hours' group by reason) d), '{}'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.fin_ops_overview() from public, anon;
grant execute on function public.fin_ops_overview() to authenticated;

create or replace function public.fin_ops_trace(p_request_id text default null, p_entity_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.fin_require_operator();
  if p_request_id is null and p_entity_id is null then raise exception 'lookup required'; end if;
  if p_request_id is not null and p_request_id !~ '^[A-Za-z0-9-]{1,80}$' then raise exception 'invalid lookup'; end if;
  insert into public.fin_ops_access_log (user_id, action, lookup) values (auth.uid(), 'trace', coalesce(p_request_id, p_entity_id::text));
  return jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job', job, 'status', status, 'processed', processed, 'error_code', error_code, 'finished_at', finished_at))
      from public.fin_job_runs where p_request_id is not null and request_id = p_request_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('organization_id', e.organization_id, 'entity_type', e.entity_type, 'entity_id', e.entity_id,
        'event_type', e.event_type, 'happened_at', e.happened_at) order by e.happened_at desc)
      from (select * from public.fin_events where p_entity_id is not null and (entity_id = p_entity_id or organization_id = p_entity_id)
            order by happened_at desc limit 50) e), '[]'::jsonb),
    'invite_denials', coalesce((select jsonb_agg(jsonb_build_object('invite_id', d.invite_id, 'reason', d.reason, 'happened_at', d.happened_at)
        order by d.happened_at desc)
      from (select * from public.fin_invite_acceptance_denials where p_entity_id is not null and (rfq_id = p_entity_id or invite_id = p_entity_id)
            order by happened_at desc limit 50) d), '[]'::jsonb));
end $$;
revoke all on function public.fin_ops_trace(text, uuid) from public, anon;
grant execute on function public.fin_ops_trace(text, uuid) to authenticated;

-- Marcador lido pelo console e por `npm run finance:pilot:doctor`.
insert into public.fin_settings (key, value) values ('schema_version', 'financial-final-hardening-1')
  on conflict (key) do update set value = excluded.value, updated_at = now();
