\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba01',false);
do $$
begin
 if not exists(select 1 from public.fin_search('00000000-0000-4000-8000-00000000bb01','Aprovação',null,12,0)
   where kind='rfq' and id='00000000-0000-4000-8000-00000000bb11') then
  raise exception 'owned RFQ absent from search'; end if;
 if exists(select 1 from public.fin_search('00000000-0000-4000-8000-00000000bb01','Aprovação','contract',12,0)
   where kind<>'contract') then raise exception 'search type filter failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba07',false);
do $$
begin
 begin
  perform public.fin_search('00000000-0000-4000-8000-00000000bb01','Aprovação',null,12,0);
  raise exception 'provider searched buyer tenant';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ba06',false);
do $$
begin
 begin
  perform public.fin_search('00000000-0000-4000-8000-00000000bb01','Aprovação',null,12,0);
  raise exception 'outsider searched buyer tenant';
 exception when others then if sqlerrm not like '%forbidden%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
\echo 'Tenant-scoped paginated operational search validated.'
