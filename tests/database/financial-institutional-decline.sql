\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000dd101','decline-buyer@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000dd102','decline-provider@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000dd103','decline-wrong@example.invalid',now());
insert into public.fin_organizations(id,legal_name,kind,created_by) values
 ('00000000-0000-4000-8000-0000000dd201','Decline buyer','BUYER','00000000-0000-4000-8000-0000000dd101'),
 ('00000000-0000-4000-8000-0000000dd202','Decline provider','PROVIDER','00000000-0000-4000-8000-0000000dd102');
insert into public.fin_members(organization_id,user_id,role) values
 ('00000000-0000-4000-8000-0000000dd201','00000000-0000-4000-8000-0000000dd101','admin'),
 ('00000000-0000-4000-8000-0000000dd202','00000000-0000-4000-8000-0000000dd102','provider_user'),
 ('00000000-0000-4000-8000-0000000dd202','00000000-0000-4000-8000-0000000dd103','provider_user');
insert into public.fin_providers(id,organization_id,name,kind,contact_email,created_by) values
 ('00000000-0000-4000-8000-0000000dd301','00000000-0000-4000-8000-0000000dd201','Decline bank','bank','decline-provider@example.invalid','00000000-0000-4000-8000-0000000dd101');
create temporary table di(k text primary key,rfq uuid,token text); grant all on di to authenticated;
create function pg_temp.di_error(q text,expected text) returns void language plpgsql as $$begin
 begin execute q; exception when others then if sqlerrm not like expected||'%' then raise exception 'unexpected: % expected %',sqlerrm,expected; end if; return; end;
 raise exception 'expected failure: %',q;
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000dd101',true);
do $$declare k text; r uuid; begin
 foreach k in array array['decline','expired','revoked','accepted'] loop
  r:=public.fin_create_rfq('00000000-0000-4000-8000-0000000dd201','credit','Institutional decline '||k,null,'{"amount":1000,"purpose":"capital_de_giro","term_months":12}',null);
  perform public.fin_transition('rfq',r,'open');
  insert into di values(k,r,public.fin_invite_provider(r,'00000000-0000-4000-8000-0000000dd301'));
 end loop;
end$$;
reset role;
update public.fin_rfq_invites set expires_at=now()-interval '1 hour' where rfq_id=(select rfq from di where k='expired');
update public.fin_rfq_invites set status='revoked' where rfq_id=(select rfq from di where k='revoked');
set role authenticated;
-- Buyer identity cannot claim a provider role.
select pg_temp.di_error(format('select public.fin_decline_provider_invite(%L,%L,%L,true,null)',(select token from di where k='decline'),'00000000-0000-4000-8000-0000000dd202','invited'),'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000dd103',true);
select pg_temp.di_error(format('select public.fin_decline_provider_invite(%L,%L,%L,true,null)',(select token from di where k='decline'),'00000000-0000-4000-8000-0000000dd202','invited'),'invalid invitation');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000dd102',true);
select pg_temp.di_error(format('select public.fin_decline_provider_invite(%L,%L,%L,false,null)',(select token from di where k='decline'),'00000000-0000-4000-8000-0000000dd202','invited'),'invalid invitation');
select pg_temp.di_error(format('select public.fin_decline_provider_invite(%L,%L,%L,true,null)',(select token from di where k='expired'),'00000000-0000-4000-8000-0000000dd202','invited'),'invalid invitation');
select pg_temp.di_error(format('select public.fin_decline_provider_invite(%L,%L,%L,true,null)',(select token from di where k='revoked'),'00000000-0000-4000-8000-0000000dd202','invited'),'invalid invitation');
reset role;
update auth.users set email_confirmed_at=null where id='00000000-0000-4000-8000-0000000dd102';
set role authenticated;
select pg_temp.di_error(format('select public.fin_decline_provider_invite(%L,%L,%L,true,null)',(select token from di where k='decline'),'00000000-0000-4000-8000-0000000dd202','invited'),'invalid invitation');
reset role;
update auth.users set email_confirmed_at=now() where id='00000000-0000-4000-8000-0000000dd102';
set role authenticated;
select public.fin_decline_provider_invite((select token from di where k='decline'),'00000000-0000-4000-8000-0000000dd202','invited',true,'capacity');
do $$declare x jsonb;begin
 x:=public.fin_decline_provider_invite((select token from di where k='decline'),'00000000-0000-4000-8000-0000000dd202','invited',true,'capacity');
 if not (x->>'replayed')::boolean then raise exception 'retry not idempotent'; end if;
 if exists(select 1 from public.fin_proposals where rfq_id=(select rfq from di where k='decline')) then raise exception 'decline created proposal'; end if;
 if exists(select 1 from public.fin_rfqs where id=(select rfq from di where k='decline')) then raise exception 'decline granted buyer data'; end if;
end$$;
select pg_temp.di_error(format('select public.fin_accept_provider_invite(%L,%L)',(select token from di where k='decline'),'00000000-0000-4000-8000-0000000dd202'),'invalid invitation');
select public.fin_accept_provider_invite((select token from di where k='accepted'),'00000000-0000-4000-8000-0000000dd202');
select pg_temp.di_error(format('select public.fin_decline_provider_invite(%L,%L,%L,true,null)',(select token from di where k='accepted'),'00000000-0000-4000-8000-0000000dd202','invited'),'invalid invitation');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000dd101',true);
do $$begin
 if (select status from public.fin_rfq_invites where rfq_id=(select rfq from di where k='decline'))<>'declined' then raise exception 'buyer cannot see refusal'; end if;
 if (select count(*) from public.fin_events where event_type='invite_declined' and entity_id=(select rfq from di where k='decline'))<>1 then raise exception 'history missing or duplicated'; end if;
end$$;
reset role;
rollback;
\echo 'Institutional decline: identity, state, replay, buyer history and no competitor access PASS'
