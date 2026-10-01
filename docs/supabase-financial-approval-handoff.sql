-- Aprovação sequencial: o próximo aprovador é avisado quando chega a vez dele.
-- Aditivo, idempotente, sem DROP de dado. Rollback: docs/rollback/supabase-financial-approval-handoff.rollback.sql
--
-- Antes: fin_notify_event avisava só o PRIMEIRO aprovador (approval_requested)
-- e, a cada voto, o solicitante (approval_approved). Numa cadeia Controller →
-- CFO, a CFO nunca recebia aviso quando o Controller aprovava; o pedido ficava
-- parado até alguém lembrá-la por fora. Encontrado ao montar a demonstração
-- canônica (docs/demo/README.md) com aprovação em duas etapas.
--
-- Agora, quando um voto aprovado deixa o pedido ainda pendente, o aprovador da
-- próxima etapa recebe "Aprovação solicitada" (mesmo tipo e preferência do
-- primeiro aviso). A chave (user_id, event_type, event_id) continua impedindo
-- aviso duplicado; nada muda para rejeição, pedido de alteração ou conclusão.
create or replace function public.fin_notify_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid;v_type text;v_object text;v_target uuid;v_next uuid;
begin
 if new.event_type in ('proposal_submitted','proposal_revised') then
  select r.owner_id,r.id into v_user,v_target from public.fin_proposals p join public.fin_rfqs r on r.id=p.rfq_id where p.id=new.entity_id;
  v_type:=case when new.event_type='proposal_submitted' then 'proposal_received' else 'proposal_revised' end;
  v_object:='rfq';
 elsif new.event_type='approval_requested' then
  select s.approver_id,r.rfq_id into v_user,v_target from public.fin_approval_steps s join public.fin_approval_requests r on r.id=s.request_id where s.request_id=(new.metadata->>'request_id')::uuid order by s.position limit 1;
  v_type:='approval_requested';v_object:='rfq';
 elsif new.event_type in ('approval_approved','approval_rejected','approval_changes_requested') then
  select requested_by,rfq_id into v_user,v_target from public.fin_approval_requests where id=(new.metadata->>'request_id')::uuid;
  v_type:=new.event_type;v_object:='rfq';
  -- Etapa aprovada e pedido ainda pendente: a vez passou para o próximo aprovador.
  if new.event_type='approval_approved' then
   select s.approver_id into v_next from public.fin_approval_steps s join public.fin_approval_requests r on r.id=s.request_id
    where s.request_id=(new.metadata->>'request_id')::uuid and s.status='pending' and r.status='pending'
    order by s.position limit 1;
   if v_next is not null and v_next is distinct from new.actor_id then
    insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
    values(new.organization_id,v_next,'approval_requested','rfq',v_target,new.id,'Aprovação solicitada',
     'Chegou a sua vez de aprovar. Abra o processo para ver os detalhes.')
    on conflict(user_id,event_type,event_id) do nothing;
   end if;
  end if;
 else return new;
 end if;
 if v_user is not null and v_user is distinct from new.actor_id then
  insert into public.fin_notifications(organization_id,user_id,event_type,object_type,object_id,event_id,title,body)
  values(new.organization_id,v_user,v_type,v_object,v_target,new.id,
   case v_type when 'proposal_received' then 'Proposta recebida' when 'proposal_revised' then 'Proposta revisada'
    when 'approval_requested' then 'Aprovação solicitada' when 'approval_approved' then 'Aprovação registrada'
    when 'approval_rejected' then 'Aprovação rejeitada' else 'Alterações solicitadas' end,
   'Abra o processo para ver os detalhes.')
  on conflict(user_id,event_type,event_id) do nothing;
 end if;
 return new;
end $$;
-- Função de gatilho: nunca chamável pelo cliente (mesma regra do hardening da superfície).
revoke all on function public.fin_notify_event() from public, anon, authenticated;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-approval-handoff-1')
  on conflict (key) do update set value = excluded.value, updated_at = now();
