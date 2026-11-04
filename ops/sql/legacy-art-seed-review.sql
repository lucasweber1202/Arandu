-- Generated from unchanged historical seed literals by scripts/review-retirement-seeds.mjs.
-- Exact seed content matching is a technical signal, NOT provenance/retention approval.
-- Historical decommission exempts IDs alone; modified content at those IDs
-- must be classified and preserved before any destructive acknowledgement.
begin isolation level repeatable read read only;
set local row_security=off;
select jsonb_build_object(
 'curated_collections_matching_seed_rows',case when to_regclass('public.curated_collections') is null then 0 else (xpath('/row/n/text()',query_to_xml($seed_query$select count(*) n from public.curated_collections x join (values ('brasil','a8b446ac8eef81c590e5d6e5a2686e6f'),('casa','f88dd11036aaa946d11e67ac45d4df6c'),('empresa','e2a33e2005709f6d2675e5f645e4ef71'),('primeira','8b88cb62884cb007af31c20ce86c0cb4')) e(id,hash) on x.id=e.id where md5((to_jsonb(x)-'created_at'-'updated_at')::text) = e.hash$seed_query$,false,true,'')))[1]::text::bigint end,
 'curated_collections_modified_exempt_rows',case when to_regclass('public.curated_collections') is null then 0 else (xpath('/row/n/text()',query_to_xml($seed_query$select count(*) n from public.curated_collections x join (values ('brasil','a8b446ac8eef81c590e5d6e5a2686e6f'),('casa','f88dd11036aaa946d11e67ac45d4df6c'),('empresa','e2a33e2005709f6d2675e5f645e4ef71'),('primeira','8b88cb62884cb007af31c20ce86c0cb4')) e(id,hash) on x.id=e.id where md5((to_jsonb(x)-'created_at'-'updated_at')::text) <> e.hash$seed_query$,false,true,'')))[1]::text::bigint end,
 'catalog_releases_matching_seed_rows',case when to_regclass('public.catalog_releases') is null then 0 else (xpath('/row/n/text()',query_to_xml($seed_query$select count(*) n from public.catalog_releases x join (values ('production','4df5e2fe34f9178f93b306beeb1bc4a9')) e(id,hash) on x.id=e.id where md5((to_jsonb(x)-'created_at'-'updated_at')::text) = e.hash$seed_query$,false,true,'')))[1]::text::bigint end,
 'catalog_releases_modified_exempt_rows',case when to_regclass('public.catalog_releases') is null then 0 else (xpath('/row/n/text()',query_to_xml($seed_query$select count(*) n from public.catalog_releases x join (values ('production','4df5e2fe34f9178f93b306beeb1bc4a9')) e(id,hash) on x.id=e.id where md5((to_jsonb(x)-'created_at'-'updated_at')::text) <> e.hash$seed_query$,false,true,'')))[1]::text::bigint end,
 'classification','REQUIRES_OWNER_DECISION', 'conversion','BLOCKED') as seed_review;
rollback;
