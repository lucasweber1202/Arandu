// Scoped catalog fingerprint, evaluated inside the export snapshot and after
// restore. Never returns row contents or SQL definitions to the operator.
// Fixed search_path makes deparsed type/object names independent of the caller.
import { RECONCILED_SCHEMAS } from './recovery-reconciliation.mjs';

export const SCHEMA_FINGERPRINT_VERSION = 1;
const schemas = RECONCILED_SCHEMAS.map(s => `'${s}'`).join(',');
export const SCHEMA_SQL = `
set local search_path = pg_catalog;
with relations as (
 select c.*, n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in (${schemas}) and c.relkind in ('r','p','v','m','S','f')
), items as (
 select 'relation' kind, nspname||'.'||relname name,
 jsonb_build_array(relkind,pg_get_userbyid(relowner),relrowsecurity,relforcerowsecurity,
   relacl::text,reloptions,case when relkind in ('v','m') then pg_get_viewdef(oid) end) value from relations
 union all
 select 'column',r.nspname||'.'||r.relname||'.'||a.attname,
 jsonb_build_array(a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
   pg_get_expr(d.adbin,d.adrelid),a.attacl::text)
 from relations r join pg_attribute a on a.attrelid=r.oid
 left join pg_attrdef d on d.adrelid=r.oid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped
 union all
 select 'constraint',r.nspname||'.'||r.relname||'.'||c.conname,to_jsonb(pg_get_constraintdef(c.oid))
 from relations r join pg_constraint c on c.conrelid=r.oid
 union all
 select 'index',schemaname||'.'||indexname,to_jsonb(indexdef) from pg_indexes where schemaname in (${schemas})
 union all
 select 'trigger',r.nspname||'.'||r.relname||'.'||t.tgname,jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled)
 from relations r join pg_trigger t on t.tgrelid=r.oid where not t.tgisinternal
 union all
 select 'policy',schemaname||'.'||tablename||'.'||policyname,jsonb_build_array(permissive,roles,cmd,qual,with_check)
 from pg_policies where schemaname in (${schemas})
 union all
 select 'routine',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 jsonb_build_array(pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl::text)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in (${schemas}) and p.prokind in ('f','p')
 union all
 select 'namespace',nspname,jsonb_build_array(pg_get_userbyid(nspowner),nspacl::text)
 from pg_namespace where nspname in (${schemas})
 union all
 select 'default_acl',pg_get_userbyid(d.defaclrole)||'.'||coalesce(n.nspname,'')||'.'||d.defaclobjtype::text,
 to_jsonb(d.defaclacl::text) from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 where n.nspname in (${schemas}) or d.defaclnamespace=0
 union all
 select 'marker','public.fin_settings',to_jsonb(case when to_regclass('public.fin_settings') is not null then
   query_to_xml('select key,value from public.fin_settings where key in (''schema_version'',''deployment_environment'') order by key',false,true,'')::text end)
)
select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(kind,name,value) order by kind collate "C",name collate "C")::text,'[]'),'UTF8')),'hex') from items;`;

export const validSchemaDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
