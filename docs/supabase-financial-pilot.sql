-- Arandu — Financial Procurement, controles de piloto.
--
-- Migration ADITIVA sobre a base e o endurecimento. Ela não muda nenhuma
-- tabela existente: acrescenta o que um primeiro piloto controlado exige e que
-- ainda não existia — registro de aceite de termos, allowlist de acesso e
-- eventos de produto emitidos pelo cliente.

create extension if not exists pgcrypto;

-- ------------------------------------------------------ aceite de termos
--
-- Guarda QUE alguém aceitou, QUAL versão e QUANDO. O CONTEÚDO dos termos não
-- vive aqui e continua `LEGAL_REVIEW_REQUIRED`: o software não deve fingir que
-- existe aceite legal válido de um texto que ninguém revisou.
create table if not exists public.fin_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.fin_organizations(id),
  user_id uuid not null references auth.users(id),
  terms_version text not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-[a-z0-9-]{1,40})?$'),
  context text not null default 'pilot' check (context in ('pilot','production','test')),
  accepted_at timestamptz not null default now(),
  unique (organization_id, user_id, terms_version)
);

-- --------------------------------------------------------- allowlist do piloto
--
-- Enquanto a tabela está VAZIA, não há restrição — é o estado de
-- desenvolvimento e de demonstração. Assim que a primeira linha entra, a
-- criação de organização passa a exigir correspondência: ligar a allowlist é o
-- próprio ato de cadastrar quem pode entrar, então não existe estado
-- "configurado pela metade" que deixe o piloto aberto sem querer.
create table if not exists public.fin_pilot_allowlist (
  id uuid primary key default gen_random_uuid(),
  -- Um e-mail completo, ou um domínio começando com '@'.
  pattern text not null unique check (pattern ~* '^(@[a-z0-9.-]+\.[a-z]{2,}|[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+)$'),
  note text check (note is null or length(note) <= 200),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.fin_pilot_access_allowed(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.fin_pilot_allowlist)
    or exists (
      select 1 from public.fin_pilot_allowlist a
      where lower(a.pattern) = lower(trim(p_email))
         or (a.pattern like '@%' and lower(trim(p_email)) like '%' || lower(a.pattern))
    );
$$;

-- Criar organização passa a respeitar a allowlist. Substitui a função da
-- migration base; o restante do comportamento é idêntico.
create or replace function public.fin_create_organization(p_name text, p_kind text, p_country text default 'BR')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if not public.fin_pilot_access_allowed(coalesce(v_email, '')) then
    raise exception 'pilot access not allowed';
  end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 200
     or p_kind not in ('BUYER','PROVIDER')
     or coalesce(p_country,'') !~ '^[A-Z]{2}$' then
    raise exception 'invalid organization';
  end if;
  insert into public.fin_organizations (legal_name, kind, country, created_by)
    values (trim(p_name), p_kind, p_country, auth.uid()) returning id into v_id;
  insert into public.fin_members (organization_id, user_id, role) values (v_id, auth.uid(), 'admin');
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_id, 'organization', v_id, 'organization_created', auth.uid(), jsonb_build_object('kind', p_kind));
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (v_id, 'organization', v_id,
            case when p_kind = 'BUYER' then 'buyer_onboarded' else 'provider_onboarded' end, auth.uid());
  return v_id;
end $$;

create or replace function public.fin_accept_terms(p_org uuid, p_version text, p_context text default 'pilot')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fin_has_role(p_org) then raise exception 'forbidden'; end if;
  if coalesce(p_version,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-[a-z0-9-]{1,40})?$' then raise exception 'invalid terms version'; end if;
  if p_context not in ('pilot','production','test') then raise exception 'invalid context'; end if;
  insert into public.fin_terms_acceptances (organization_id, user_id, terms_version, context)
    values (p_org, auth.uid(), p_version, p_context)
    on conflict (organization_id, user_id, terms_version) do nothing;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (p_org, 'organization', p_org, 'terms_accepted', auth.uid(),
            jsonb_build_object('terms_version', p_version, 'context', p_context));
end $$;

-- ----------------------------------------------- eventos vindos do cliente
--
-- Alguns sinais só existem no navegador: o convite foi aberto, a comparação foi
-- vista, os pesos foram aplicados. O vocabulário é FECHADO e a metadata é
-- descartada — o cliente não escolhe o que fica registrado, e termo financeiro
-- nunca entra na trilha por esta porta.
create or replace function public.fin_record_client_event(p_org uuid, p_entity_type text, p_entity_id uuid, p_event text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.fin_has_role(p_org) then raise exception 'forbidden'; end if;
  if p_event not in (
    'invite_opened','proposal_started','comparison_viewed','weights_applied',
    'onboarding_step_completed','export_generated'
  ) then raise exception 'unknown event'; end if;
  if p_entity_type not in ('rfq','proposal','contract','organization','invite') then raise exception 'unknown entity'; end if;
  insert into public.fin_events (organization_id, entity_type, entity_id, event_type, actor_id)
    values (p_org, p_entity_type, p_entity_id, p_event, auth.uid());
end $$;

-- ----------------------------------------------------------------- RLS

alter table public.fin_terms_acceptances enable row level security;
alter table public.fin_terms_acceptances force row level security;
alter table public.fin_pilot_allowlist enable row level security;
alter table public.fin_pilot_allowlist force row level security;
revoke all on public.fin_terms_acceptances, public.fin_pilot_allowlist from anon, authenticated;
grant select on public.fin_terms_acceptances to authenticated;

drop policy if exists fin_terms_read on public.fin_terms_acceptances;
create policy fin_terms_read on public.fin_terms_acceptances for select to authenticated
  using (public.fin_has_role(organization_id));

-- A allowlist não é legível por conta nenhuma: a lista de quem foi convidado
-- para o piloto é, ela mesma, informação. Ela é administrada fora do cliente.

revoke all on function
  public.fin_pilot_access_allowed(text),
  public.fin_accept_terms(uuid, text, text),
  public.fin_record_client_event(uuid, text, uuid, text)
  from public, anon;
grant execute on function
  public.fin_accept_terms(uuid, text, text),
  public.fin_record_client_event(uuid, text, uuid, text)
  to authenticated, service_role;
grant execute on function public.fin_pilot_access_allowed(text) to service_role;

-- ============================================================================
-- Enfileiramento de e-mail na outbox transacional existente
-- ============================================================================
--
-- O envio continua desligado por padrão. A chave está no banco, e não em
-- variável de ambiente, porque quem liga o envio é quem opera o piloto e não
-- quem faz deploy — e porque enfileirar sem despachante produz uma fila que só
-- cresce enquanto a empresa acha que o convite foi enviado.
--
-- Com a chave desligada, `fin_enqueue_email` não faz nada e devolve false; o
-- convite continua sendo entregue manualmente, que é o comportamento
-- documentado em docs/FINANCIAL_EMAIL_TEMPLATES.md.
create table if not exists public.fin_settings (
  key text primary key,
  value text not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.fin_settings enable row level security;
alter table public.fin_settings force row level security;
revoke all on public.fin_settings from anon, authenticated;

insert into public.fin_settings (key, value) values ('email_enabled', 'false')
  on conflict (key) do nothing;

create or replace function public.fin_setting(p_key text, p_default text default '')
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.fin_settings where key = p_key), p_default);
$$;

-- O corpo do e-mail é renderizado pelo despachante a partir de
-- lib/finance/email-templates.mjs. O que entra no payload aqui é o mínimo para
-- renderizar e endereçar: nenhum termo financeiro, nenhuma condição, nenhum
-- valor. Um e-mail encaminhado não pode virar vazamento de taxa ou de MDR.
create or replace function public.fin_enqueue_email(
  p_template text, p_recipient text, p_entity_type text, p_entity_id uuid,
  p_payload jsonb, p_idempotency_key text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  if public.fin_setting('email_enabled', 'false') <> 'true' then return false; end if;
  if coalesce(p_recipient,'') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return false; end if;
  if p_template not in (
    'member_invite','provider_invite','rfq_opened','deadline_near',
    'proposal_received','proposal_revised','decision_recorded','renewal_due'
  ) then raise exception 'unknown template'; end if;
  v_hash := encode(sha256(convert_to(lower(trim(p_recipient)), 'UTF8')), 'hex');
  insert into public.transactional_email_outbox (
    event_type, entity_type, entity_id, template, recipient_hash, recipient_address,
    payload, request_id, idempotency_key
  ) values (
    'finance_' || p_template, p_entity_type, p_entity_id::text, p_template, v_hash, lower(trim(p_recipient)),
    coalesce(p_payload, '{}'::jsonb), 'finance-' || p_entity_id::text, p_idempotency_key
  ) on conflict (idempotency_key) do nothing;
  return true;
end $$;

-- O convite de provedor é o ponto mais crítico do piloto: é por ele que uma
-- instituição externa entra. Quando o envio está ligado, o e-mail nasce na
-- mesma transação que o convite — não existe convite criado cujo e-mail se
-- perdeu, nem e-mail enviado de um convite que não foi gravado.
--
-- O TOKEN não entra no payload da outbox. Ele vai apenas no link, montado pelo
-- despachante a partir de `invite_ref`, e a outbox guarda a referência, não o
-- segredo.
create or replace function public.fin_invite_provider(p_rfq uuid, p_provider uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_status text; v_token text; v_invite uuid; v_contact text; v_buyer text; v_deadline date; v_product text;
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
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.fin_rfq_invites (buyer_organization_id, rfq_id, provider_id, token_hash, created_by)
    values (v_org, p_rfq, p_provider, encode(sha256(convert_to(v_token,'UTF8')),'hex'), auth.uid())
    returning id into v_invite;
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

revoke all on function
  public.fin_setting(text, text),
  public.fin_enqueue_email(text, text, text, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function
  public.fin_setting(text, text),
  public.fin_enqueue_email(text, text, text, uuid, jsonb, text)
  to service_role;
