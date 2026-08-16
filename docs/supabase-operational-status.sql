-- Arandu — máquina de estados operacional e trilha de histórico
-- Aplicar depois de docs/supabase-retention-controls.sql.
--
-- Cobre o eixo operacional/comercial (obra disponível, artista aprovado, lead
-- ganho). O eixo editorial continua em public.catalog_review_history.
--
-- As transições declaradas aqui espelham lib/operational-status.mjs.
-- scripts/test-operational-status.mjs falha se os dois lados divergirem.

create table if not exists public.operational_status_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'artwork','artist','submission','lead','brief','proposal','reservation','certificate','task'
  )),
  entity_id text not null,
  from_status text,
  to_status text not null,
  note text,
  actor_ref text not null,
  actor_role text not null,
  request_id text,
  created_at timestamptz not null default now()
);

alter table public.operational_status_history enable row level security;
revoke all on public.operational_status_history from anon, authenticated;
grant select, insert on public.operational_status_history to service_role;

create index if not exists idx_operational_status_entity
  on public.operational_status_history(entity_type, entity_id, created_at desc);

comment on table public.operational_status_history is
  'Trilha imutável das transições operacionais de obras, artistas, submissões e registros comerciais.';

create or replace function public.operational_transition_allowed(
  p_entity text,
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from (values
      ('artwork','available','in_conversation'),
      ('artwork','available','reserved'),
      ('artwork','available','not_published'),
      ('artwork','available','archived'),
      ('artwork','in_conversation','available'),
      ('artwork','in_conversation','reserved'),
      ('artwork','in_conversation','not_published'),
      ('artwork','reserved','available'),
      ('artwork','reserved','in_conversation'),
      ('artwork','reserved','sold'),
      ('artwork','reserved','archived'),
      ('artwork','sold','archived'),
      ('artwork','not_published','available'),
      ('artwork','not_published','archived'),
      ('artwork','archived','not_published'),
      ('artist','prospected','in_review'),
      ('artist','prospected','archived'),
      ('artist','in_review','approved'),
      ('artist','in_review','paused'),
      ('artist','in_review','archived'),
      ('artist','approved','published'),
      ('artist','approved','in_review'),
      ('artist','approved','paused'),
      ('artist','approved','archived'),
      ('artist','published','paused'),
      ('artist','published','archived'),
      ('artist','paused','approved'),
      ('artist','paused','published'),
      ('artist','paused','archived'),
      ('artist','archived','in_review'),
      ('submission','received','screening'),
      ('submission','received','declined'),
      ('submission','received','archived'),
      ('submission','screening','curatorial_review'),
      ('submission','screening','declined'),
      ('submission','screening','archived'),
      ('submission','curatorial_review','approved'),
      ('submission','curatorial_review','declined'),
      ('submission','curatorial_review','archived'),
      ('submission','approved','archived'),
      ('submission','declined','archived'),
      ('lead','new','contacted'),
      ('lead','new','lost'),
      ('lead','new','archived'),
      ('lead','contacted','qualified'),
      ('lead','contacted','lost'),
      ('lead','contacted','archived'),
      ('lead','qualified','proposal'),
      ('lead','qualified','won'),
      ('lead','qualified','lost'),
      ('lead','qualified','archived'),
      ('lead','proposal','won'),
      ('lead','proposal','lost'),
      ('lead','proposal','archived'),
      ('lead','won','archived'),
      ('lead','lost','archived'),
      ('brief','received','qualified'),
      ('brief','received','lost'),
      ('brief','received','archived'),
      ('brief','qualified','proposal'),
      ('brief','qualified','lost'),
      ('brief','qualified','archived'),
      ('brief','proposal','negotiation'),
      ('brief','proposal','lost'),
      ('brief','proposal','archived'),
      ('brief','negotiation','won'),
      ('brief','negotiation','lost'),
      ('brief','negotiation','archived'),
      ('brief','won','archived'),
      ('brief','lost','archived'),
      ('proposal','draft','sent'),
      ('proposal','draft','archived'),
      ('proposal','sent','approved'),
      ('proposal','sent','declined'),
      ('proposal','sent','expired'),
      ('proposal','sent','archived'),
      ('proposal','approved','archived'),
      ('proposal','declined','archived'),
      ('proposal','expired','sent'),
      ('proposal','expired','archived'),
      ('reservation','requested','confirmed'),
      ('reservation','requested','expired'),
      ('reservation','requested','cancelled'),
      ('reservation','confirmed','converted'),
      ('reservation','confirmed','expired'),
      ('reservation','confirmed','cancelled'),
      ('reservation','expired','cancelled'),
      ('certificate','draft','under_review'),
      ('certificate','draft','valid'),
      ('certificate','under_review','valid'),
      ('certificate','under_review','draft'),
      ('certificate','under_review','revoked'),
      ('certificate','valid','under_review'),
      ('certificate','valid','revoked'),
      ('task','open','doing'),
      ('task','open','cancelled'),
      ('task','doing','done'),
      ('task','doing','cancelled'),
      ('task','cancelled','open')
    ) as t(entity, from_status, to_status)
    where t.entity = p_entity and t.from_status = p_from and t.to_status = p_to
  );
$$;

comment on function public.operational_transition_allowed(text, text, text) is
  'Rotas válidas da máquina de estados operacional, espelhadas em lib/operational-status.mjs.';

create or replace function public.apply_operational_status_atomic(
  p_entity_type text,
  p_entity_id text,
  p_next_status text,
  p_note text,
  p_actor_ref text,
  p_actor_role text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_field text;
  v_current text;
  v_record jsonb;
begin
  if coalesce(length(trim(p_actor_ref)), 0) < 8
    or coalesce(length(trim(p_actor_role)), 0) < 3
    or coalesce(length(trim(p_request_id)), 0) < 8 then
    raise exception using message = 'Contexto operacional inválido.', errcode = '22023';
  end if;

  v_table := case p_entity_type
    when 'artwork' then 'artworks'
    when 'artist' then 'artists'
    when 'submission' then 'artist_submissions'
    when 'lead' then 'leads'
    when 'brief' then 'company_briefs'
    when 'proposal' then 'proposals'
    when 'reservation' then 'reservations'
    when 'certificate' then 'certificates'
    when 'task' then 'tasks'
    else null
  end;
  if v_table is null then
    raise exception using message = 'Entidade operacional inválida.', errcode = '22023';
  end if;

  v_field := case when p_entity_type = 'certificate' then 'verification_status' else 'status' end;

  execute format(
    'select to_jsonb(t) from public.%I t where t.id::text = $1 for update',
    v_table
  ) into v_record using p_entity_id;

  if v_record is null then
    raise exception using message = 'Registro operacional não encontrado.', errcode = 'P0002';
  end if;

  v_current := v_record ->> v_field;

  if v_current is not distinct from p_next_status then
    raise exception using message = 'O registro já está neste status.', errcode = '22023';
  end if;

  if v_current is not null
    and not public.operational_transition_allowed(p_entity_type, v_current, p_next_status) then
    raise exception using
      message = format('Transição operacional inválida: %s → %s.', v_current, p_next_status),
      errcode = '22023';
  end if;

  -- Pré-condições de negócio replicadas do lado do banco (defesa em profundidade).
  if p_entity_type = 'artist' and p_next_status in ('approved', 'published')
    and coalesce((v_record ->> 'identity_verified')::boolean, false) is not true then
    raise exception using message = 'Artista sem identidade verificada.', errcode = '23514';
  end if;
  if p_entity_type = 'artist' and p_next_status = 'published'
    and coalesce(length(trim(v_record ->> 'publishing_consent_at')), 0) = 0 then
    raise exception using message = 'Artista sem consentimento de publicação.', errcode = '23514';
  end if;
  if p_entity_type = 'artwork' and p_next_status = 'available'
    and coalesce(length(trim(v_record ->> 'image_authorized_at')), 0) = 0 then
    raise exception using message = 'Obra sem autorização de imagem.', errcode = '23514';
  end if;
  if p_entity_type = 'artwork' and p_next_status = 'sold'
    and coalesce((v_record ->> 'price')::numeric, 0) <= 0 then
    raise exception using message = 'Obra sem preço registrado.', errcode = '23514';
  end if;
  if p_entity_type = 'certificate' and p_next_status = 'valid'
    and coalesce(length(trim(v_record ->> 'artwork_id')), 0) = 0 then
    raise exception using message = 'Certificado sem obra vinculada.', errcode = '23514';
  end if;

  perform set_config('request.headers', jsonb_build_object(
    'arandu-actor-type', 'admin',
    'arandu-actor-id', left(p_actor_ref, 160),
    'arandu-actor-role', left(p_actor_role, 40),
    'arandu-request-id', left(p_request_id, 80)
  )::text, true);

  execute format(
    'update public.%I set %I = $1, updated_at = now() where id::text = $2 returning to_jsonb(public.%I.*)',
    v_table, v_field, v_table
  ) into v_record using p_next_status, p_entity_id;

  insert into public.operational_status_history (
    entity_type, entity_id, from_status, to_status, note, actor_ref, actor_role, request_id
  ) values (
    p_entity_type,
    left(p_entity_id, 160),
    v_current,
    p_next_status,
    nullif(left(coalesce(p_note, ''), 1000), ''),
    left(p_actor_ref, 160),
    left(p_actor_role, 40),
    left(p_request_id, 80)
  );

  return jsonb_build_object(
    'ok', true,
    'stored', true,
    'entity_type', p_entity_type,
    'from_status', v_current,
    'to_status', p_next_status,
    'record', v_record
  );
end;
$$;

revoke all on function public.apply_operational_status_atomic(text, text, text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.apply_operational_status_atomic(text, text, text, text, text, text, text)
to service_role;

comment on function public.apply_operational_status_atomic(text, text, text, text, text, text, text) is
  'Aplica transições operacionais sob lock e registra a trilha em operational_status_history.';
