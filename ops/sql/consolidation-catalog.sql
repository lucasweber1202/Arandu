-- Read-only catalog inventory; no row values, function bodies, policy expressions,
-- credentials, object names or Auth identities. Counts complement consolidation-inventory.sql.
-- Missing Auth tables return null, never a misleading zero (e.g. SQL-only bootstrap).
-- Absence of a financial marker is valid inventory of a legacy database, not readiness.
begin transaction isolation level repeatable read read only;
set local row_security = off;
with auth_counts as (
  select c.relname,
    (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from auth.%I', c.relname), false, true, '')))[1]::text::bigint as rows
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'auth' and c.relname in ('sessions','identities') and c.relkind in ('r','p')
)
select jsonb_build_object(
  'observed_at', now(),
  'database', current_database(),
  'server_version', current_setting('server_version'),
  'schemas', (select jsonb_agg(nspname order by nspname) from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema'),
  'extensions', (select jsonb_agg(jsonb_build_object('name', extname, 'version', extversion) order by extname) from pg_extension),
  'views', (select jsonb_agg(jsonb_build_object('schema', schemaname, 'name', viewname) order by schemaname, viewname) from pg_views where schemaname in ('public','auth','storage')),
  'triggers', (select jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname, 'name', t.tgname, 'enabled', t.tgenabled) order by n.nspname,c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','auth','storage')),
  'policies', (select jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename, 'name', policyname, 'roles', roles, 'command', cmd) order by schemaname,tablename,policyname) from pg_policies where schemaname in ('public','auth','storage')),
  'functions', (select jsonb_agg(jsonb_build_object('name', p.proname, 'security_definer', p.prosecdef, 'arguments', pg_get_function_identity_arguments(p.oid)) order by p.proname,p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'financial_marker_table', to_regclass('public.fin_settings'),
  'financial_tables', (select count(*) from pg_tables where schemaname='public' and left(tablename,4)='fin_'),
  'pii_columns', (select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name) order by table_name,column_name) from information_schema.columns where table_schema='public' and column_name ~* '(email|phone|whatsapp|issued_to|address|name)'),
  'auth_sessions', (select rows from auth_counts where relname = 'sessions'),
  'auth_identities', (select rows from auth_counts where relname = 'identities'),
  'auth_policies', (select count(*) from pg_policies where schemaname='auth'),
  'storage_policies', (select count(*) from pg_policies where schemaname='storage')
) as inventory;
commit;
