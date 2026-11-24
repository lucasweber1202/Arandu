\set ON_ERROR_STOP on
-- Arandu 12: idempotent provider invites and minimised preview. Rolled back.
begin;
create function pg_temp.ii(n integer) returns uuid language sql immutable as $$select ('00000000-0000-4000-8000-0000001b'||lpad(n::text,4,'0'))::uuid$$;
create function pg_temp.fail(q text,expected text) returns void language plpgsql as $$begin
 begin execute q; exception when others then if sqlerrm not like '%'||expected||'%' then raise exception 'unexpected % expected %',sqlerrm,expected; end if; return; end;
 raise exception 'expected rejection: %',q;
end$$;
insert into public.fin_settings(key,value) values('email_enabled','true') on conflict(key) do update set value='true';
insert into auth.users(id,email) select pg_temp.ii(n),'ii-'||n||'@example.invalid' from generate_series(1,6)n;
update auth.users set email='contact@bank.example' where id=pg_temp.ii(4);
update auth.users set email='other@bank.example' where id=pg_temp.ii(6);
update auth.users set email='new@bank.example' where id=pg_temp.ii(5);
insert into public.fin_organizations(id,legal_name,kind,created_by) values
(pg_temp.ii(100),'II buyer','BUYER',pg_temp.ii(1)),(pg_temp.ii(101),'II other buyer','BUYER',pg_temp.ii(3)),
(pg_temp.ii(102),'II bank','PROVIDER',pg_temp.ii(4)),(pg_temp.ii(103),'II intruder bank','PROVIDER',pg_temp.ii(6));
insert into public.fin_members(organization_id,user_id,role) values
(pg_temp.ii(100),pg_temp.ii(1),'admin'),(pg_temp.ii(100),pg_temp.ii(2),'viewer'),(pg_temp.ii(101),pg_temp.ii(3),'admin'),
(pg_temp.ii(102),pg_temp.ii(4),'provider_user'),(pg_temp.ii(102),pg_temp.ii(5),'provider_user'),(pg_temp.ii(103),pg_temp.ii(6),'provider_user');
insert into public.fin_providers(id,organization_id,name,kind,created_by,contact_email) values
(pg_temp.ii(200),pg_temp.ii(100),'II bank','bank',pg_temp.ii(1),'Contact@Bank.example'),
(pg_temp.ii(201),pg_temp.ii(100),'II open bank','bank',pg_temp.ii(1),null),
(pg_temp.ii(202),pg_temp.ii(100),'II closed bank','bank',pg_temp.ii(1),null);
insert into public.fin_rfqs(id,organization_id,product,title,status,owner_id,demand) values
(pg_temp.ii(400),pg_temp.ii(100),'acquiring','II RFQ','open',pg_temp.ii(1),'{}');
create temporary table ii_tok(k text primary key,v jsonb); grant all on ii_tok to authenticated;

do $$begin
 if has_function_privilege('anon','public.fin_send_provider_invite(uuid,uuid)','EXECUTE')
 or has_function_privilege('anon','public.fin_invite_preview(text,uuid)','EXECUTE')
 or has_function_privilege('service_role','public.fin_send_provider_invite(uuid,uuid)','EXECUTE')
 or not has_function_privilege('authenticated','public.fin_invite_preview(text,uuid)','EXECUTE') then raise exception 'invite privileges'; end if;
end$$;

set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.ii(1)::text,true);
insert into ii_tok values('first',public.fin_send_provider_invite(pg_temp.ii(400),pg_temp.ii(200)));
-- Retry after an uncertain response: same token, no duplicate row, event or e-mail.
insert into ii_tok values('retry',public.fin_send_provider_invite(pg_temp.ii(400),pg_temp.ii(200)));
insert into ii_tok values('legacy',to_jsonb(public.fin_invite_provider(pg_temp.ii(400),pg_temp.ii(200))));
do $$begin
 if (select v->>'outcome' from ii_tok where k='first')<>'created' or (select v->>'outcome' from ii_tok where k='retry')<>'replayed'
 or (select v->>'token' from ii_tok where k='first') is distinct from (select v->>'token' from ii_tok where k='retry')
 or (select v->>'token' from ii_tok where k='first') is distinct from (select v#>>'{}' from ii_tok where k='legacy')
 or (select v->>'recipient_mode' from ii_tok where k='first')<>'exact_email' then raise exception 'replay contract'; end if;
end$$;
-- Viewer and another buyer cannot send or replay (no token disclosure).
select set_config('request.jwt.claim.sub',pg_temp.ii(2)::text,true);
select pg_temp.fail(format('select public.fin_send_provider_invite(%L,%L)',pg_temp.ii(400),pg_temp.ii(200)),'forbidden');
select set_config('request.jwt.claim.sub',pg_temp.ii(3)::text,true);
select pg_temp.fail(format('select public.fin_send_provider_invite(%L,%L)',pg_temp.ii(400),pg_temp.ii(200)),'forbidden');

-- Preview: recipient sees only e-mail-level facts; others get the generic error.
select set_config('request.jwt.claim.sub',pg_temp.ii(4)::text,true);
insert into ii_tok values('preview',public.fin_invite_preview((select v->>'token' from ii_tok where k='first'),pg_temp.ii(102)));
do $$declare p jsonb:=(select v from ii_tok where k='preview');begin
 if p->>'buyer'<>'II buyer' or p->>'product'<>'acquiring' or p->>'state'<>'open'
 or (select array_agg(k order by k) from jsonb_object_keys(p) k)<>array['buyer','expires_at','product','response_deadline','state'] then raise exception 'preview shape %',p; end if;
end$$;
select pg_temp.fail(format('select public.fin_invite_preview(%L,%L)',(select v->>'token' from ii_tok where k='first'),pg_temp.ii(103)),'invalid invitation');
select set_config('request.jwt.claim.sub',pg_temp.ii(6)::text,true);
select pg_temp.fail(format('select public.fin_invite_preview(%L,%L)',(select v->>'token' from ii_tok where k='first'),pg_temp.ii(103)),'invalid invitation');
select pg_temp.fail(format('select public.fin_invite_preview(%L,%L)',repeat('a',64),pg_temp.ii(103)),'invalid invitation');
select set_config('request.jwt.claim.sub',pg_temp.ii(5)::text,true);
select pg_temp.fail(format('select public.fin_invite_preview(%L,%L)',(select v->>'token' from ii_tok where k='first'),pg_temp.ii(102)),'invalid invitation');

-- Open invite without contact; buyer then registers the contact: retarget in place.
select set_config('request.jwt.claim.sub',pg_temp.ii(1)::text,true);
insert into ii_tok values('open',public.fin_send_provider_invite(pg_temp.ii(400),pg_temp.ii(201)));
reset role;
update public.fin_providers set contact_email='new@bank.example' where id=pg_temp.ii(201);
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.ii(1)::text,true);
insert into ii_tok values('retarget',public.fin_send_provider_invite(pg_temp.ii(400),pg_temp.ii(201)));
insert into ii_tok values('retarget2',public.fin_send_provider_invite(pg_temp.ii(400),pg_temp.ii(201)));
do $$begin
 if (select v->>'outcome' from ii_tok where k='open')<>'created' or (select v->>'recipient_mode' from ii_tok where k='open')<>'organization_open'
 or (select v->>'outcome' from ii_tok where k='retarget')<>'retargeted' or (select v->>'recipient_mode' from ii_tok where k='retarget')<>'exact_email'
 or (select v->>'outcome' from ii_tok where k='retarget2')<>'replayed'
 or (select v->>'token' from ii_tok where k='retarget') is distinct from (select v->>'token' from ii_tok where k='open') then raise exception 'retarget contract'; end if;
end$$;
-- The narrowed invite is no longer open to an arbitrary provider account.
select set_config('request.jwt.claim.sub',pg_temp.ii(6)::text,true);
select pg_temp.fail(format('select public.fin_invite_preview(%L,%L)',(select v->>'token' from ii_tok where k='open'),pg_temp.ii(103)),'invalid invitation');

-- Closed invites are reported explicitly, never silently re-issued.
reset role;
insert into public.fin_rfq_invites(buyer_organization_id,rfq_id,provider_id,token_hash,created_by,status,recipient_mode)
values(pg_temp.ii(100),pg_temp.ii(400),pg_temp.ii(202),encode(sha256(convert_to('arandu-12-closed-invite','UTF8')),'hex'),pg_temp.ii(1),'expired','organization_open');
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.ii(1)::text,true);
select pg_temp.fail(format('select public.fin_send_provider_invite(%L,%L)',pg_temp.ii(400),pg_temp.ii(202)),'invite closed');
reset role;
update public.fin_rfq_invites set status='declined' where provider_id=pg_temp.ii(202);
set role authenticated;
select pg_temp.fail(format('select public.fin_send_provider_invite(%L,%L)',pg_temp.ii(400),pg_temp.ii(202)),'invite already declined');
reset role;

do $$begin
 if (select count(*) from public.fin_rfq_invites where rfq_id=pg_temp.ii(400))<>3 then raise exception 'invite rows'; end if;
 if (select count(*) from public.fin_events where entity_id=pg_temp.ii(400) and event_type='provider_invited')<>2 then raise exception 'invite events'; end if;
 if (select count(*) from public.fin_events where entity_id=pg_temp.ii(400) and event_type='provider_invite_retargeted')<>1 then raise exception 'retarget events'; end if;
 if (select count(*) from public.transactional_email_outbox where entity_id=pg_temp.ii(400)::text and template='finance_provider_invite')<>2 then raise exception 'invite e-mails'; end if;
end$$;
rollback;
