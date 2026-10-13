#!/usr/bin/env bash
# Teto de e-mails por organização sob rajada (docs/supabase-financial-followup-hardening.sql):
# dez convites simultâneos com teto de 5/h gravam no máximo 5 e-mails, e cada
# convite recusado é desfeito inteiro (sem convite sem e-mail).
set -euo pipefail
url="$1"
org=00000000-0000-4000-8000-00000000da11
user=00000000-0000-4000-8000-00000000da01
rfq=00000000-0000-4000-8000-00000000da21
psql "$url" -X -q -v ON_ERROR_STOP=1 <<SQL
insert into auth.users(id,email) values('$user','fu-burst@example.invalid') on conflict do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values('$org','Rajada DEMO','BUYER','$user');
insert into public.fin_members(organization_id,user_id,role) values('$org','$user','admin');
insert into public.fin_rfqs(id,organization_id,product,title,owner_id,status,demand) values('$rfq','$org','credit','Rajada DEMO','$user','collecting','{}');
insert into public.fin_providers(id,organization_id,name,kind,contact_email,created_by)
select ('00000000-0000-4000-8000-00000000db' || lpad(g::text,2,'0'))::uuid, '$org', 'Rajada ' || g || ' DEMO', 'bank', 'fu-burst-' || g || '@example.invalid', '$user' from generate_series(1,10) g;
insert into public.fin_settings(key,value) values ('email_enabled','true') on conflict(key) do update set value='true';
insert into public.fin_settings(key,value) values ('invite_secret',repeat('f',64)) on conflict(key) do nothing;
insert into public.fin_settings(key,value) values ('email_org_hourly_limit','5') on conflict(key) do update set value='5';
SQL
pids=()
for g in 01 02 03 04 05 06 07 08 09 10; do
  psql "$url" -X -q -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','$user',true); select public.fin_invite_provider('$rfq','00000000-0000-4000-8000-00000000db$g'); select pg_sleep(0.3); commit;" >/dev/null 2>&1 & pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid" || true; done
emails=$(psql "$url" -X -A -t -c "select count(*) from public.transactional_email_outbox where organization_id='$org'")
invites=$(psql "$url" -X -A -t -c "select count(*) from public.fin_rfq_invites where rfq_id='$rfq'")
psql "$url" -X -q -c "delete from public.fin_settings where key='email_org_hourly_limit'" -c "update public.fin_settings set value='false' where key='email_enabled'" -c "delete from public.transactional_email_outbox where organization_id='$org'"
[ "$emails" = "5" ] || { echo "rajada ultrapassou o teto: $emails e-mails com teto 5" >&2; exit 1; }
[ "$invites" = "$emails" ] || { echo "convite sem e-mail após recusa: $invites convites, $emails e-mails" >&2; exit 1; }
printf 'Email org cap under concurrency (10 convites simultâneos, teto 5 → 5, sem convite órfão) passed.\n'
