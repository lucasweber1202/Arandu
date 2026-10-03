-- Derived read layer only: no canonical records are changed or deleted.
begin;
drop function if exists public.fin_query_graph(uuid,text,uuid,text,uuid,text,text,date,integer,integer);
drop view if exists public.fin_financial_graph;
drop view if exists public.fin_graph_objects;
insert into public.fin_settings(key,value) values ('schema_version','financial-passport-entities-1') on conflict(key) do update set value=excluded.value,updated_at=now();
commit;
