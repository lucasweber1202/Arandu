-- Financial Procurement — entrega operacional (aditiva).
--
-- 1. Respostas em comentários: um nível de thread, herdando a visibilidade do
--    comentário pai. Quem não lê o pai não responde a ele.
-- 2. E-mail das notificações por preferência: menção, aprovação, proposta e
--    renovação. O e-mail não carrega título de RFQ, valor, taxa nem nome de
--    provedor — só o tipo de aviso e o caminho da tela, que exige login.
--    Continua desligado enquanto fin_settings.email_enabled <> 'true', e o
--    envio real ainda depende do despachante e do provedor de e-mail.
-- 3. Agenda de renovação: função só para o service role, chamada por cron,
--    idempotente por (contrato, marco) e sem duplicar tarefa aberta.

-- ------------------------------------------------------------- 1. threads
alter table public.fin_comments add column if not exists parent_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_comments_parent_fk') then
    alter table public.fin_comments add constraint fin_comments_parent_fk
      foreign key (organization_id, parent_id) references public.fin_comments(organization_id, id);
  end if;
end $$;
create index if not exists fin_comments_parent on public.fin_comments(parent_id) where parent_id is not null;

create or replace function public.fin_reply_comment(
  p_parent uuid, p_body text, p_mention_ids uuid[] default '{}'::uuid[], p_client_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_parent public.fin_comments%rowtype; v_id uuid; v_parent_now uuid;
begin
  select * into v_parent from public.fin_comments where id = p_parent;
  if not found or v_parent.parent_id is not null then raise exception 'invalid parent'; end if;
  -- Mesma regra de leitura da RLS: membro da empresa, ou provedor do processo
  -- quando o pai é visível ao provedor. Comentário interno nunca é respondível por provedor.
  if not (public.fin_has_role(v_parent.organization_id)
          or (v_parent.visibility = 'provider_visible' and public.fin_provider_can_comment(v_parent.object_type, v_parent.object_id))) then
    raise exception 'forbidden';
  end if;
  v_id := public.fin_add_comment(v_parent.object_type, v_parent.object_id, v_parent.visibility, p_body, p_mention_ids, p_client_id);
  update public.fin_comments set parent_id = p_parent where id = v_id and parent_id is null;
  select parent_id into v_parent_now from public.fin_comments where id = v_id;
  if v_parent_now is distinct from p_parent then raise exception 'comment conflict'; end if;
  if v_parent.author_id <> auth.uid()
     and exists (select 1 from public.fin_members m where m.organization_id = v_parent.organization_id and m.user_id = v_parent.author_id) then
    insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
    values (v_parent.organization_id, v_parent.author_id, 'comment', v_parent.object_type, v_parent.object_id, v_id,
      'Responderam ao seu comentário', 'Abra o processo para ler a resposta.')
    on conflict (user_id, event_type, event_id) do nothing;
  end if;
  return v_id;
end $$;
revoke all on function public.fin_reply_comment(uuid, text, uuid[], uuid) from public, anon;
grant execute on function public.fin_reply_comment(uuid, text, uuid[], uuid) to authenticated, service_role;

-- ------------------------------------------------------ 2. e-mail por aviso
-- Só entra na fila se a própria pessoa pediu e-mail para aquele tipo de aviso.
-- Controle de volume: no máximo 20 e-mails de aviso por destinatário por hora;
-- o aviso no aplicativo continua existindo mesmo quando o e-mail é suprimido.
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
  v_path := case new.object_type
    when 'rfq' then '/finance/rfq.html?id=' || new.object_id::text
    when 'contract' then '/finance/contracts.html#contract-' || new.object_id::text
    else '/finance/notifications.html' end;
  v_kind := case when new.event_type like 'approval_%' then 'approval' when new.event_type like 'proposal_%' then 'proposal' else new.event_type end;
  -- Inserção direta na outbox, sem depender da lista de modelos de
  -- fin_enqueue_email: reaplicar a migration do piloto não quebra este gatilho.
  insert into public.transactional_email_outbox (
    event_type, entity_type, entity_id, template, recipient_hash, recipient_address, payload, request_id, idempotency_key
  ) values (
    'finance_notification', new.object_type, new.object_id::text, 'finance_notification', v_hash, lower(trim(v_email)),
    jsonb_build_object('kind', v_kind, 'event', new.event_type, 'path', v_path), 'finance-notification-' || new.id::text,
    'notification:' || new.id::text
  ) on conflict (idempotency_key) do nothing;
  return new;
end $$;
drop trigger if exists fin_enqueue_notification_email on public.fin_notifications;
create trigger fin_enqueue_notification_email after insert on public.fin_notifications
for each row execute function public.fin_enqueue_notification_email();
revoke all on function public.fin_enqueue_notification_email() from public, anon, authenticated;

-- --------------------------------------------------- 3. agenda de renovação
alter table public.fin_renewal_milestones drop constraint if exists fin_renewal_milestones_milestone_check;
alter table public.fin_renewal_milestones add constraint fin_renewal_milestones_milestone_check
  check (milestone in ('d180','d120','d90','d60','d30','d7','notice','expired'));

-- Marco mais urgente já alcançado: 90, 60 e 30 dias antes do fim, a data do
-- aviso prévio e o vencimento. Como os marcos só avançam no tempo, basta
-- registrar o mais recente; se já existe, nada acontece. Se o contrato já tem
-- tarefa de renovação aberta, o marco reutiliza essa tarefa em vez de criar
-- outra, e ninguém recebe um segundo aviso.
create or replace function public.fin_run_renewal_schedule(p_day date default current_date)
returns integer language plpgsql security definer set search_path = '' as $$
declare c record; v_days integer; v_mark text; v_task uuid; v_created integer := 0; v_inserted integer; v_new boolean;
begin
  if p_day is null or abs(p_day - current_date) > 1 then raise exception 'invalid date'; end if;
  perform pg_advisory_xact_lock(hashtext('fin_run_renewal_schedule'));
  for c in select id, organization_id, owner_id, ends_on, renewal_notice_days, status from public.fin_contracts
    where status in ('active','renewing') and ends_on <= p_day + greatest(90, renewal_notice_days)
    order by ends_on, id for update
  loop
    v_days := c.ends_on - p_day;
    v_mark := null;
    if v_days <= 0 then v_mark := 'expired';
    else
      -- O menor limite já alcançado é o marco atual; empate favorece o aviso prévio.
      select m.mark into v_mark from (values ('notice', c.renewal_notice_days, 0), ('d30', 30, 1), ('d60', 60, 1), ('d90', 90, 1))
        as m(mark, threshold, tiebreak) where v_days <= m.threshold order by m.threshold, m.tiebreak limit 1;
    end if;
    if v_mark is null then continue; end if;
    if exists (select 1 from public.fin_renewal_milestones where contract_id = c.id and milestone = v_mark) then continue; end if;
    select id into v_task from public.fin_tasks where organization_id = c.organization_id and related_type = 'contract'
      and related_id = c.id and status = 'open' order by created_at limit 1;
    v_new := v_task is null;
    if v_new then
      insert into public.fin_tasks(organization_id, title, due_on, status, related_type, related_id, created_by)
      values (c.organization_id, case when v_days <= 0 then 'Revisar contrato vencido' else 'Revisar renovação de contrato' end,
        least(c.ends_on - c.renewal_notice_days, c.ends_on), 'open', 'contract', c.id, c.owner_id)
      returning id into v_task;
    end if;
    insert into public.fin_renewal_milestones(organization_id, contract_id, milestone, task_id)
    values (c.organization_id, c.id, v_mark, v_task) on conflict (contract_id, milestone) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      if v_new then delete from public.fin_tasks where id = v_task; end if;
      continue;
    end if;
    insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (c.organization_id, 'contract', c.id, 'renewal_milestone_reached', null,
      jsonb_build_object('milestone', v_mark, 'task_id', v_task, 'scheduled', true));
    if v_new then
      insert into public.fin_notifications(organization_id, user_id, event_type, object_type, object_id, event_id, title, body)
      values (c.organization_id, c.owner_id, 'renewal_due', 'contract', c.id, v_task, 'Contrato em revisão de renovação',
        'Há um marco de renovação para acompanhar.')
      on conflict (user_id, event_type, event_id) do nothing;
      v_created := v_created + 1;
    end if;
    if v_days <= c.renewal_notice_days and c.status = 'active' then
      update public.fin_contracts set status = 'renewing', updated_at = now() where id = c.id;
    end if;
  end loop;
  return v_created;
end $$;
revoke all on function public.fin_run_renewal_schedule(date) from public, anon, authenticated;
grant execute on function public.fin_run_renewal_schedule(date) to service_role;
