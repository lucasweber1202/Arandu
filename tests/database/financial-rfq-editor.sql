\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
do $$
declare v_org uuid:='00000000-0000-4000-8000-00000000bb01';v_revision integer;
begin
 select revision into v_revision from public.fin_save_rfq_editor(v_org,'{"product":"credit","title":"Primeira versão","demand":{"amount":100000}}'::jsonb,0);
 if v_revision<>1 then raise exception 'first draft revision failed'; end if;
 begin
  perform public.fin_save_rfq_editor(v_org,'{"product":"credit","title":"Aba antiga"}'::jsonb,0);
  raise exception 'stale tab overwrote RFQ';
 exception when others then if sqlerrm not like '%rfq draft conflict%' then raise; end if; end;
 select revision into v_revision from public.fin_save_rfq_editor(v_org,'{"product":"credit","title":"Segunda versão"}'::jsonb,1);
 if v_revision<>2 then raise exception 'next draft revision failed'; end if;
 if (select payload->>'title' from public.fin_rfq_editor_drafts where organization_id=v_org)<>'Segunda versão' then raise exception 'stale overwrite'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba04',false);
do $$
begin
 if exists(select 1 from public.fin_rfq_editor_drafts where organization_id='00000000-0000-4000-8000-00000000bb01')
 then raise exception 'draft leaked to another member'; end if;
 begin
  perform public.fin_save_rfq_editor('00000000-0000-4000-8000-00000000bb01','{}'::jsonb,0);
  raise exception 'viewer saved draft';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
select public.fin_clear_rfq_editor('00000000-0000-4000-8000-00000000bb01',2);
reset role;
select set_config('request.jwt.claim.sub','',false);
\echo 'RFQ autosave revision, stale overwrite and private draft isolation validated.'
