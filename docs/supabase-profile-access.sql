-- Arandu — vínculo verificado entre conta e artista
-- Aplicar depois de docs/supabase-operational-status.sql.
--
-- `profile_type` vive em user_metadata e é declarado pela própria pessoa.
-- Ele não concede acesso. O portal do artista exige um vínculo criado por
-- curadoria nesta tabela, sempre apontando para um artista já aprovado.

create table if not exists public.artist_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artist_id text not null references public.artists(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  linked_by text not null,
  linked_at timestamptz not null default now(),
  revoked_by text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma conta ativa por artista e um artista ativo por conta.
create unique index if not exists uq_artist_accounts_active_user
  on public.artist_accounts(user_id) where status = 'active';
create unique index if not exists uq_artist_accounts_active_artist
  on public.artist_accounts(artist_id) where status = 'active';

alter table public.artist_accounts enable row level security;
revoke all on public.artist_accounts from anon, authenticated;
grant select, insert, update on public.artist_accounts to service_role;

-- O artista enxerga o próprio vínculo; a escrita continua exclusiva da API.
drop policy if exists artist_accounts_select_own on public.artist_accounts;
create policy artist_accounts_select_own on public.artist_accounts
  for select to authenticated
  using (auth.uid() = user_id);
grant select on public.artist_accounts to authenticated;

create index if not exists idx_artist_accounts_user on public.artist_accounts(user_id, status);

comment on table public.artist_accounts is
  'Vínculo verificado entre conta autenticada e artista aprovado, criado apenas por curadoria.';

create or replace function public.link_artist_account_atomic(
  p_user_id uuid,
  p_artist_id text,
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
  v_artist public.artists%rowtype;
  v_link public.artist_accounts%rowtype;
begin
  if coalesce(length(trim(p_actor_ref)), 0) < 8
    or coalesce(length(trim(p_actor_role)), 0) < 3
    or coalesce(length(trim(p_request_id)), 0) < 8 then
    raise exception using message = 'Contexto operacional inválido.', errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using message = 'Conta não encontrada.', errcode = 'P0002';
  end if;

  select * into v_artist from public.artists where id = p_artist_id for update;
  if not found then
    raise exception using message = 'Artista não encontrado.', errcode = 'P0002';
  end if;

  -- Só artista já aprovado recebe portal: o vínculo não antecipa curadoria.
  if v_artist.status not in ('approved', 'published') then
    raise exception using
      message = 'Artista precisa estar aprovado antes de receber acesso ao portal.',
      errcode = '23514';
  end if;

  if exists (
    select 1 from public.artist_accounts
    where status = 'active' and artist_id = p_artist_id and user_id <> p_user_id
  ) then
    raise exception using message = 'Este artista já está vinculado a outra conta.', errcode = '23505';
  end if;

  update public.artist_accounts
  set status = 'revoked',
      revoked_by = left(p_actor_ref, 160),
      revoked_at = now(),
      updated_at = now()
  where user_id = p_user_id and status = 'active' and artist_id <> p_artist_id;

  insert into public.artist_accounts (user_id, artist_id, status, linked_by)
  values (p_user_id, p_artist_id, 'active', left(p_actor_ref, 160))
  on conflict (user_id) where status = 'active'
  do update set artist_id = excluded.artist_id, linked_by = excluded.linked_by, updated_at = now()
  returning * into v_link;

  return jsonb_build_object('ok', true, 'stored', true, 'link', to_jsonb(v_link));
end;
$$;

create or replace function public.revoke_artist_account_atomic(
  p_user_id uuid,
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
  v_link public.artist_accounts%rowtype;
begin
  if coalesce(length(trim(p_actor_ref)), 0) < 8
    or coalesce(length(trim(p_actor_role)), 0) < 3
    or coalesce(length(trim(p_request_id)), 0) < 8 then
    raise exception using message = 'Contexto operacional inválido.', errcode = '22023';
  end if;

  update public.artist_accounts
  set status = 'revoked',
      revoked_by = left(p_actor_ref, 160),
      revoked_at = now(),
      updated_at = now()
  where user_id = p_user_id and status = 'active'
  returning * into v_link;

  if not found then
    raise exception using message = 'Vínculo ativo não encontrado.', errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'stored', true, 'link', to_jsonb(v_link));
end;
$$;

revoke all on function public.link_artist_account_atomic(uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.link_artist_account_atomic(uuid, text, text, text, text) to service_role;

revoke all on function public.revoke_artist_account_atomic(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.revoke_artist_account_atomic(uuid, text, text, text) to service_role;

comment on function public.link_artist_account_atomic(uuid, text, text, text, text) is
  'Vincula conta autenticada a artista aprovado, garantindo unicidade do vínculo ativo.';
comment on function public.revoke_artist_account_atomic(uuid, text, text, text) is
  'Revoga o vínculo ativo de uma conta com artista, encerrando o acesso ao portal.';
