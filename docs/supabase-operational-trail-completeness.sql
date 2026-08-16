-- Arandu — trilha operacional completa por gatilho
-- Aplicar depois de docs/supabase-profile-access.sql.
--
-- A máquina de estados da rodada anterior só registrava as transições feitas
-- pelo painel. Reserva criada, reserva expirada, pedido concluído e pedido
-- cancelado também mudam o status da obra, por dentro do banco, e não
-- apareciam na trilha nem em historico-obra.html.
--
-- A partir daqui o registro é responsabilidade de um gatilho, não de quem
-- escreve. Qualquer caminho que altere o status — presente ou futuro — entra na
-- trilha. `apply_operational_status_atomic` continua validando a transição, mas
-- deixa de inserir a linha para não duplicar.
--
-- O responsável vem de `request.headers`, o mesmo mecanismo já usado por
-- public.audit_privileged_mutation. Sem cabeçalho, a transição é do sistema.

create or replace function public.log_operational_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_entity_type text := tg_argv[0];
  v_field text := tg_argv[1];
  v_from text;
  v_to text;
  v_actor_ref text;
  v_actor_role text;
  v_request_id text;
begin
  v_from := to_jsonb(old) ->> v_field;
  v_to := to_jsonb(new) ->> v_field;

  if v_to is not distinct from v_from then
    return new;
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_actor_ref := nullif(left(coalesce(v_headers->>'arandu-actor-id', ''), 160), '');
  v_actor_role := nullif(left(coalesce(v_headers->>'arandu-actor-role', ''), 40), '');
  v_request_id := nullif(left(coalesce(v_headers->>'arandu-request-id', ''), 80), '');

  insert into public.operational_status_history (
    entity_type, entity_id, from_status, to_status, note, actor_ref, actor_role, request_id
  ) values (
    v_entity_type,
    left(new.id::text, 160),
    v_from,
    v_to,
    null,
    coalesce(v_actor_ref, 'system'),
    coalesce(v_actor_role, 'system'),
    v_request_id
  );

  return new;
end;
$$;

comment on function public.log_operational_status_change() is
  'Registra na trilha operacional qualquer mudança de status, venha do painel ou de rotina interna.';

do $$
declare
  v_target record;
begin
  for v_target in
    select *
    from (values
      ('artworks', 'artwork', 'status'),
      ('artists', 'artist', 'status'),
      ('artist_submissions', 'submission', 'status'),
      ('leads', 'lead', 'status'),
      ('company_briefs', 'brief', 'status'),
      ('proposals', 'proposal', 'status'),
      ('reservations', 'reservation', 'status'),
      ('certificates', 'certificate', 'verification_status'),
      ('tasks', 'task', 'status')
    ) as t(table_name, entity_type, status_field)
  loop
    if to_regclass('public.' || v_target.table_name) is null then
      continue;
    end if;
    execute format('drop trigger if exists trg_arandu_operational_status on public.%I', v_target.table_name);
    execute format(
      'create trigger trg_arandu_operational_status after update of %I on public.%I '
      || 'for each row execute function public.log_operational_status_change(%L, %L)',
      v_target.status_field, v_target.table_name, v_target.entity_type, v_target.status_field
    );
  end loop;
end;
$$;

-- A RPC segue como porta de entrada validada do painel: mantém lock, rotas e
-- pré-condições, e passa a delegar o registro ao gatilho.
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

  -- O gatilho lê estes cabeçalhos para atribuir a transição a quem a fez.
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

  -- A linha da trilha é gravada por trg_arandu_operational_status.
  if p_note is not null and length(trim(p_note)) > 0 then
    update public.operational_status_history
    set note = left(trim(p_note), 1000)
    where id = (
      select id from public.operational_status_history
      where entity_type = p_entity_type and entity_id = left(p_entity_id, 160)
      order by created_at desc
      limit 1
    );
  end if;

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
