-- Read-only exact counts from historical sources before conversion.
-- Returns no record contents, credentials, contacts or document paths.
-- Zero contact counts do not classify free text as synthetic.
-- Not a backup or migration; use an authorized SQL session.
with tables as (select c.relname as table_name,
c.relrowsecurity as rls_enabled,
c.relforcerowsecurity as rls_forced,
(xpath('/row/n/text()',query_to_xml(format('select count(*) as n from public.%I',c.relname),false,true,'')))[1]::text::bigint as rows from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')),
counts as (select table_name,
rows from tables order by table_name) select now() as observed_at,
current_setting('server_version') as server_version,
(select jsonb_agg(to_jsonb(counts)) from counts) as table_counts,
(select sum(rows) from tables) as public_rows,
(select count(*) from auth.users) as auth_users,
(select count(*) from auth.mfa_factors) as mfa_factors,
(select count(*) from storage.objects) as storage_objects,
(select count(*) from storage.buckets) as storage_buckets,
(select count(*) from storage.buckets where public) as public_storage_buckets,
(select jsonb_agg(jsonb_build_object('table_name',table_name,'rls_enabled',rls_enabled,'rls_forced',rls_forced) order by table_name) from tables) as rls,
(select count(*) from pg_policies where schemaname='public') as policies,
(select count(*) from information_schema.views where table_schema='public') as views,
(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') as functions,
(select count(*) from public.leads where nullif(trim(name),'') is not null or nullif(trim(email),'') is not null or nullif(trim(whatsapp),'') is not null) as leads_with_contact,
(select count(*) from public.reservations where nullif(trim(name),'') is not null or nullif(trim(whatsapp),'') is not null) as reservations_with_contact,
(select count(*) from public.certificates where nullif(trim(issued_to),'') is not null or nullif(trim(issued_email),'') is not null) as certificates_with_recipient;
