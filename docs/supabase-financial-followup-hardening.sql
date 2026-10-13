-- Pendências da PR #178 (13/10/2026): fila de e-mail e evidência de exceção.
--
-- 1. Fila de e-mail sem teto por organização nem justiça entre organizações.
--    Qualquer conta podia criar uma compradora, cadastrar provedores com
--    qualquer contato e repetir convites: cada um enfileirava um e-mail do
--    remetente do Arandu com o nome da empresa (texto livre) no assunto. O
--    despachante reivindicava em ordem global de criação (20 por execução), então
--    algumas centenas de convites atrasavam por dias todos os avisos legítimos.
--    Agora:
--      - a outbox guarda a organização de origem;
--      - convite por e-mail tem teto por organização (60/h, 300/dia) e de
--        pendentes por organização (200): acima disso o convite é recusado com
--        motivo claro (o link manual continua disponível para os anteriores);
--      - o mesmo destinatário recebe no máximo 3 convites/dia da mesma
--        organização e 5/dia somando todas: acima disso o e-mail é suprimido
--        (o convite existe e o link manual continua valendo) e a supressão fica
--        na trilha da compradora;
--      - a contagem é serializada por organização (advisory lock da transação):
--        rajadas concorrentes não ultrapassam o teto;
--      - o claim alterna entre organizações (rodízio pela posição de cada item
--        na fila da sua organização): uma organização não esgota a capacidade
--        das outras.
--    Limites ajustáveis em fin_settings (email_org_hourly_limit,
--    email_org_daily_limit, email_org_pending_limit, email_org_recipient_daily_limit,
--    email_recipient_daily_limit), sempre com piso e teto técnicos.
-- 2. fin_request_policy_exception recusava toda evidência com documento: buscava
--    o id em fin_documents (referências externas) e conferia com
--    fin_can_read_document, que só conhece fin_private_documents. Um id nunca
--    está nas duas. Agora aceita documento privado da compradora que a pessoa
--    lê (fin_can_read_document) ou referência externa no escopo de entidade
--    dela (fin_object_visible); documento de outra organização, removido ou
--    fora do escopo continua recusado.
--
-- Aditiva e idempotente; não apaga dado. Rollback em
-- docs/rollback/supabase-financial-followup-hardening.rollback.sql.
begin;

-- ------------------------------------------------------- 1a. origem na outbox
alter table public.transactional_email_outbox add column if not exists organization_id uuid;
create index if not exists idx_transactional_email_outbox_org_recent
  on public.transactional_email_outbox(organization_id, created_at);
create index if not exists idx_transactional_email_outbox_recipient_recent
  on public.transactional_email_outbox(recipient_hash, template, created_at);
update public.transactional_email_outbox o set organization_id = r.organization_id
  from public.fin_rfqs r
 where o.organization_id is null and o.entity_type = 'rfq' and o.template like 'finance_%'
   and o.entity_id ~ '^[0-9a-f-]{36}$' and r.id = o.entity_id::uuid;

-- Limite configurável com piso e teto: um valor absurdo em fin_settings não
-- desliga a proteção nem trava a operação.
create or replace function public.fin_email_limit(p_key text, p_default integer, p_min integer, p_max integer)
returns integer language sql stable security definer set search_path = '' as $$
  select least(p_max, greatest(p_min, coalesce(
    case when public.fin_setting(p_key, '') ~ '^[0-9]{1,6}$' then public.fin_setting(p_key, '')::integer end, p_default)));
$$;
revoke all on function public.fin_email_limit(text, integer, integer, integer) from public, anon, authenticated;

-- ------------------------------------------------------- 1b. enfileiramento
create or replace function public.fin_enqueue_email(
  p_template text, p_recipient text, p_entity_type text, p_entity_id uuid,
  p_payload jsonb, p_idempotency_key text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_org uuid; v_recipient text := lower(trim(coalesce(p_recipient, '')));
begin
  if public.fin_setting('email_enabled', 'false') <> 'true' then return false; end if;
  if v_recipient !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_recipient) > 254 then return false; end if;
  if p_template not in (
    'member_invite','provider_invite','rfq_opened','deadline_near',
    'proposal_received','proposal_revised','decision_recorded','renewal_due'
  ) then raise exception 'unknown template'; end if;
  v_org := case p_entity_type
    when 'rfq' then (select r.organization_id from public.fin_rfqs r where r.id = p_entity_id)
    when 'contract' then (select c.organization_id from public.fin_contracts c where c.id = p_entity_id)
    when 'organization' then (select o.id from public.fin_organizations o where o.id = p_entity_id)
    else null end;
  -- Sem origem conhecida não há como aplicar teto: não enfileira.
  if v_org is null then return false; end if;
  v_hash := encode(sha256(convert_to(v_recipient, 'UTF8')), 'hex');
  -- Repetição da mesma chave não conta de novo nem duplica.
  if exists (select 1 from public.transactional_email_outbox o where o.idempotency_key = p_idempotency_key) then return true; end if;
  -- Serializa as contagens da organização: rajadas concorrentes não passam do teto.
  perform pg_advisory_xact_lock(hashtextextended('fin_email_org:' || v_org::text, 0));
  if (select count(*) from public.transactional_email_outbox o
       where o.organization_id = v_org and o.status in ('pending','retry','processing'))
       >= public.fin_email_limit('email_org_pending_limit', 200, 20, 2000)
     or (select count(*) from public.transactional_email_outbox o
       where o.organization_id = v_org and o.created_at > now() - interval '1 hour')
       >= public.fin_email_limit('email_org_hourly_limit', 60, 5, 1000)
     or (select count(*) from public.transactional_email_outbox o
       where o.organization_id = v_org and o.created_at > now() - interval '24 hours')
       >= public.fin_email_limit('email_org_daily_limit', 300, 20, 5000) then
    raise exception 'email volume limit';
  end if;
  -- Destinatário protegido de repetição (mesma organização e todas somadas):
  -- o e-mail é suprimido, o convite segue valendo pelo link manual.
  if (select count(*) from public.transactional_email_outbox o
       where o.recipient_hash = v_hash and o.template = 'finance_' || p_template
         and o.organization_id = v_org and o.created_at > now() - interval '24 hours')
       >= public.fin_email_limit('email_org_recipient_daily_limit', 3, 1, 20)
     or (select count(*) from public.transactional_email_outbox o
       where o.recipient_hash = v_hash and o.template = 'finance_' || p_template
         and o.created_at > now() - interval '24 hours')
       >= public.fin_email_limit('email_recipient_daily_limit', 5, 1, 50) then
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
      values (v_org, coalesce(p_entity_type, 'organization'), p_entity_id, 'email_suppressed', auth.uid(),
              jsonb_build_object('template', p_template, 'reason', 'recipient_limit'));
    return false;
  end if;
  insert into public.transactional_email_outbox (
    event_type, entity_type, entity_id, template, recipient_hash, recipient_address,
    payload, request_id, idempotency_key, organization_id
  ) values (
    'finance_' || p_template, p_entity_type, p_entity_id::text, 'finance_' || p_template, v_hash, v_recipient,
    coalesce(p_payload, '{}'::jsonb), 'finance-' || p_entity_id::text, p_idempotency_key, v_org
  ) on conflict (idempotency_key) do nothing;
  return true;
end $$;
revoke all on function public.fin_enqueue_email(text, text, text, uuid, jsonb, text) from public, anon, authenticated;

-- Avisos de notificação: mesma origem na outbox e o mesmo teto de pendentes
-- por organização (o aviso no aplicativo continua existindo).
create or replace function public.fin_enqueue_notification_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_email text; v_path text; v_kind text; v_hash text;
begin
  if new.event_type not in ('mention','approval_requested','approval_approved','approval_rejected',
      'approval_changes_requested','proposal_received','proposal_revised','renewal_due') then return new; end if;
  if not exists (select 1 from public.fin_notification_preferences p where p.organization_id = new.organization_id
      and p.user_id = new.user_id and p.event_type = new.event_type and p.email) then return new; end if;
  if public.fin_setting('email_enabled', 'false') <> 'true' then return new; end if;
  select email into v_email from auth.users where id = new.user_id;
  if v_email is null then return new; end if;
  v_hash := encode(sha256(convert_to(lower(trim(v_email)), 'UTF8')), 'hex');
  if (select count(*) from public.transactional_email_outbox o where o.recipient_hash = v_hash
      and o.template = 'finance_notification' and o.created_at > now() - interval '1 hour') >= 20 then return new; end if;
  if (select count(*) from public.transactional_email_outbox o where o.organization_id = new.organization_id
      and o.status in ('pending','retry','processing')) >= public.fin_email_limit('email_org_pending_limit', 200, 20, 2000) then return new; end if;
  v_path := case new.object_type
    when 'rfq' then '/finance/rfq.html?id=' || new.object_id::text
    when 'contract' then '/finance/contracts.html#contract-' || new.object_id::text
    else '/finance/notifications.html' end;
  v_kind := case when new.event_type like 'approval_%' then 'approval' when new.event_type like 'proposal_%' then 'proposal' else new.event_type end;
  insert into public.transactional_email_outbox (
    event_type, entity_type, entity_id, template, recipient_hash, recipient_address, payload, request_id, idempotency_key, organization_id
  ) values (
    'finance_notification', new.object_type, new.object_id::text, 'finance_notification', v_hash, lower(trim(v_email)),
    jsonb_build_object('kind', v_kind, 'event', new.event_type, 'path', v_path), 'finance-notification-' || new.id::text,
    'notification:' || new.id::text, new.organization_id
  ) on conflict (idempotency_key) do nothing;
  return new;
end $$;
revoke all on function public.fin_enqueue_notification_email() from public, anon, authenticated;

-- --------------------------------------------------------- 1c. claim justo
-- Rodízio: cada item recebe sua posição na fila da própria organização; o lote
-- leva primeiro o 1º de cada organização, depois o 2º, e assim por diante.
-- Itens sem organização (legado) formam a fila de cada destinatário.
create or replace function public.claim_transactional_email_batch_v2(
  p_worker_ref text,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_items jsonb; v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if coalesce(length(trim(p_worker_ref)), 0) < 8 then
    raise exception using message = 'Worker inválido.', errcode = '22023';
  end if;
  with ready as (
    select o.id, o.created_at,
           row_number() over (partition by coalesce(o.organization_id::text, o.recipient_hash) order by o.created_at, o.id) as turn
      from public.transactional_email_outbox o
     where (o.status in ('pending','retry') and o.next_attempt_at <= now())
        or (o.status = 'processing' and o.lease_expires_at <= now())
  ), candidates as (
    select o.id from public.transactional_email_outbox o join ready r on r.id = o.id
     where (o.status in ('pending','retry') and o.next_attempt_at <= now())
        or (o.status = 'processing' and o.lease_expires_at <= now())
     order by r.turn, r.created_at, r.id
     for update of o skip locked
     limit v_limit
  ), claimed as (
    update public.transactional_email_outbox o
    set status = 'processing', attempts = attempts + 1, claimed_at = now(),
        worker_ref = left(trim(p_worker_ref), 120), claim_token = gen_random_uuid(),
        lease_expires_at = now() + interval '10 minutes', updated_at = now(),
        last_error_code = null
    from candidates c where o.id = c.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'eventType', event_type, 'entityType', entity_type,
    'entityId', entity_id, 'template', template,
    'recipientAddress', recipient_address, 'recipientRef', left(recipient_hash, 16),
    'payload', payload, 'attempts', attempts, 'maxAttempts', max_attempts,
    'requestId', request_id, 'idempotencyKey', idempotency_key,
    'workerRef', worker_ref, 'claimToken', claim_token
  ) order by created_at), '[]'::jsonb) into v_items from claimed;
  return v_items;
end;
$$;
revoke all on function public.claim_transactional_email_batch_v2(text,integer) from public, anon, authenticated;
grant execute on function public.claim_transactional_email_batch_v2(text,integer) to service_role;

-- ------------------------------------------------ 2. evidência de exceção
create or replace function public.fin_policy_evidence_document_allowed(p_org uuid, p_document text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_document ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and (
    exists (select 1 from public.fin_private_documents d
             where d.id = p_document::uuid and d.buyer_organization_id = p_org and public.fin_can_read_document(d.id))
    or exists (select 1 from public.fin_documents d
             where d.id = p_document::uuid and d.organization_id = p_org
               and public.fin_has_role(p_org) and public.fin_object_visible(p_org, d.entity_type, d.entity_id)));
$$;
revoke all on function public.fin_policy_evidence_document_allowed(uuid, text) from public, anon, authenticated;

create or replace function public.fin_request_policy_exception(
  p_request uuid, p_policy_version uuid, p_rule text, p_reason_code text, p_reason text, p_evidence jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_request public.fin_approval_requests%rowtype; v_id uuid; x jsonb;
begin
  select * into v_request from public.fin_approval_requests where id = p_request;
  if not found then raise exception 'approval not found'; end if;
  perform 1 from public.fin_rfqs where id = v_request.rfq_id for update;
  select * into v_request from public.fin_approval_requests where id = p_request for update;
  if not public.fin_has_role(v_request.organization_id, array['admin','finance_manager']) or not public.fin_rfq_visible(v_request.rfq_id) then raise exception 'forbidden'; end if;
  if v_request.status <> 'pending' or v_request.policy_snapshot is null then raise exception 'approval not pending'; end if;
  if not exists (select 1 from jsonb_array_elements(v_request.policy_snapshot->'matched') m
                  where m->>'policy_version_id' = p_policy_version::text and m->>'rule_id' = p_rule) then
    raise exception 'invalid policy exception';
  end if;
  if jsonb_typeof(coalesce(p_evidence, '[]'::jsonb)) <> 'array' then raise exception 'invalid policy exception'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) loop
    if jsonb_typeof(x) <> 'object' or exists (select 1 from jsonb_object_keys(x) k where k not in ('label','document_id','reference'))
       or length(trim(coalesce(x->>'label',''))) not between 2 and 160
       or (x ? 'reference' and length(coalesce(x->>'reference','')) not between 3 and 300)
       or (x ? 'document_id' and not public.fin_policy_evidence_document_allowed(v_request.organization_id, x->>'document_id')) then
      raise exception 'invalid policy exception';
    end if;
  end loop;
  insert into public.fin_policy_exceptions(organization_id, request_id, policy_version_id, rule_id, requested_by, reason_code, reason, evidence)
    values (v_request.organization_id, p_request, p_policy_version, p_rule, auth.uid(), p_reason_code, trim(p_reason), coalesce(p_evidence, '[]'::jsonb))
    returning id into v_id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (v_request.organization_id, 'rfq', v_request.rfq_id, 'policy_exception_requested', auth.uid(),
            jsonb_build_object('request_id', p_request, 'exception_id', v_id, 'rule_id', p_rule, 'reason_code', p_reason_code));
  return v_id;
exception
  when unique_violation then raise exception 'policy exception already open';
  when check_violation then raise exception 'invalid policy exception';
end $$;

insert into public.fin_settings(key, value) values ('schema_version', 'financial-followup-hardening-1')
  on conflict (key) do update set value = excluded.value, updated_at = now();
commit;
