\set ON_ERROR_STOP on
-- verify-backup-restore, alvo DESCARTÁVEL apenas. :refs = JSON com as FKs
-- public.<tabela>(<coluna>) -> auth.users(id) lidas da seção post-data do
-- próprio backup. Cria auth.users só com o id de cada usuário referenciado:
-- nenhum e-mail, senha ou metadado (o Auth está fora do escopo public_schema).
-- Imprime a quantidade criada na última linha.
select set_config('arandu.auth_refs', :'refs', false);
create temporary table _auth_refs(id uuid primary key);
do $$
declare r record;
begin
  for r in select x->>'table' tbl, x->>'column' col from jsonb_array_elements(current_setting('arandu.auth_refs')::jsonb) x loop
    if r.tbl !~ '^[a-z0-9_]+$' or r.col !~ '^[a-z0-9_]+$' then raise exception 'referência inválida'; end if;
    execute format('insert into _auth_refs select distinct %I from public.%I where %I is not null on conflict do nothing', r.col, r.tbl, r.col);
  end loop;
end $$;
with created as (
  insert into auth.users(id) select id from _auth_refs where not exists (select 1 from auth.users u where u.id = _auth_refs.id) returning 1
) select count(*) from created;
