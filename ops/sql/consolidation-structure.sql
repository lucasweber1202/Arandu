-- Read-only catalog summary; no contact values, secrets or function bodies.
select jsonb_build_object(
'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'tables',(select count(*) from pg_class c where c.relnamespace=n.oid and c.relkind in ('r','p')),'functions',(select count(*) from pg_proc p where p.pronamespace=n.oid)) order by n.nspname) from pg_namespace n where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'),
'constraints',(select count(*) from pg_constraint where connamespace='public'::regnamespace),
'triggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),
'extensions',(select jsonb_agg(jsonb_build_object('name',extname,'version',extversion) order by extname) from pg_extension),
'definer_functions',(select count(*) from pg_proc where pronamespace='public'::regnamespace and prosecdef),
'public_views_without_invoker',(select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='v' and not coalesce(reloptions @> array['security_invoker=true'],false)),
'public_grant_count',(select count(*) from information_schema.table_privileges where table_schema='public' and grantee in ('anon','authenticated','PUBLIC')),
'foreign_keys',(select count(*) from pg_constraint where connamespace='public'::regnamespace and contype='f')) as structure;
