#!/usr/bin/env bash
# Ensaio de backup e restore do banco do piloto financeiro, com prova.
#
# Faz backup lógico do banco de origem (schema public com dados e grants,
# auth.users e a configuração do Storage), restaura num Postgres da Supabase
# descartável criado aqui (mesma imagem da stack self-hosted, com os papéis
# anon/authenticated/service_role), mede os tempos e compara origem e destino:
# fingerprint do schema, contagem de linhas de cada fin_*, funções, gatilhos,
# políticas, constraints, grants a anon/authenticated, RLS, bucket privado,
# versão do schema. Por fim roda o canário de isolamento no banco restaurado.
#
#   PILOT_SOURCE_DATABASE_URL=postgresql://...  bash scripts/pilot-restore-drill.sh
#
# Sem PILOT_SOURCE_DATABASE_URL, usa o ensaio local (scripts/pilot-local).
# O backup contém dados reais e e-mails: fica fora do repositório, em diretório
# 0700 que é apagado ao final (PILOT_DRILL_KEEP=1 mantém). O relatório em
# reports/pilot-restore-drill.json tem só tempos, hashes e contagens.
# Nunca aponte o destino para o piloto: o destino é sempre um contêiner novo.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="${PILOT_LOCAL_DB_IMAGE:-public.ecr.aws/supabase/postgres:15.14.1.064}"
auth_image="${PILOT_LOCAL_AUTH_IMAGE:-public.ecr.aws/supabase/gotrue:v2.181.0}"
storage_image="${PILOT_LOCAL_STORAGE_IMAGE:-public.ecr.aws/supabase/storage-api:v1.25.3}"
storage_port="${PILOT_DRILL_STORAGE_PORT:-54330}"
port="${PILOT_DRILL_PORT:-54329}"
container="arandu-restore-drill-$$"
work="$(mktemp -d "${TMPDIR:-/tmp}/arandu-restore-drill.XXXXXX")"
chmod 700 "$work"
report="$root/reports/pilot-restore-drill.json"
mkdir -p "$root/reports"

cleanup() {
  docker rm -f "$container-storage" >/dev/null 2>&1 || true
  if [ "${PILOT_DRILL_KEEP:-0}" != "1" ]; then docker rm -f "$container" >/dev/null 2>&1 || true; else echo "destino mantido: contêiner $container, porta $port"; fi
  if [ "${PILOT_DRILL_KEEP:-0}" != "1" ]; then rm -rf "$work"; else echo "backup mantido em $work"; fi
}
trap cleanup EXIT

source_url="${PILOT_SOURCE_DATABASE_URL:-}"
source_kind="pilot"
if [ -z "$source_url" ]; then
  state="$root/scripts/pilot-local/.state/.env"
  [ -f "$state" ] || { echo "Sem PILOT_SOURCE_DATABASE_URL e sem ensaio local (rode npm run pilot:local:up)." >&2; exit 1; }
  set -a; . "$state"; set +a
  source_url="postgresql://supabase_admin:${PGPW}@localhost:54322/postgres"
  source_kind="pilot-local"
fi
redact() { sed -E 's#postgres(ql)?://[^[:space:]]+#[DATABASE_URL]#g'; }
now_ms() { date +%s%3N; }
q() { psql "$1" -X -A -t -v ON_ERROR_STOP=1 -c "$2"; }

# Somente leitura na origem: nada abaixo escreve nela.
[ "$(q "$source_url" "select count(*) from pg_namespace where nspname in ('auth','storage')" 2>&1 | redact)" = "2" ] \
  || { echo "Origem não parece um projeto Supabase (auth/storage ausentes)." >&2; exit 1; }

# ------------------------------------------------------------------ backup
t0=$(now_ms)
pg_dump "$source_url" --format=custom --schema=public --no-owner --file="$work/public.dump" 2> >(redact >&2)
pg_dump "$source_url" --format=custom --data-only --table=auth.users --table=auth.identities --no-owner --file="$work/auth.dump" 2> >(redact >&2)
pg_dump "$source_url" --format=custom --data-only --table=storage.buckets --no-owner --file="$work/storage.dump" 2> >(redact >&2)
t1=$(now_ms)
backup_sha=$(cat "$work/public.dump" "$work/auth.dump" "$work/storage.dump" | sha256sum | cut -d' ' -f1)
backup_bytes=$(cat "$work/public.dump" "$work/auth.dump" "$work/storage.dump" | wc -c)

# ------------------------------------------------------- destino descartável
pw="$(openssl rand -hex 18)"
docker run -d --name "$container" -e POSTGRES_PASSWORD="$pw" -e JWT_SECRET="$(openssl rand -hex 32)" -e JWT_EXP=3600 \
  -p "127.0.0.1:${port}:5432" "$image" postgres -c config_file=/etc/postgresql/postgresql.conf -c log_min_messages=fatal >/dev/null
target="postgresql://supabase_admin:${pw}@127.0.0.1:${port}/postgres"
for _ in $(seq 1 90); do
  docker exec "$container" pg_isready -U postgres -h localhost >/dev/null 2>&1 && q "$target" "select 1" >/dev/null 2>&1 && break
  sleep 2
done
sleep 3
t2=$(now_ms)
# Um projeto Supabase novo já nasce com Auth e Storage migrados: o destino passa
# pelas mesmas migrations (GoTrue migrate; Storage aplica as suas ao subir).
psql "$target" -q -X -v ON_ERROR_STOP=1 -c "alter user supabase_auth_admin with password '${pw}'; alter user supabase_storage_admin with password '${pw}'; alter user authenticator with password '${pw}'; alter user postgres with password '${pw}';"
docker run --rm --network host -e GOTRUE_DB_DRIVER=postgres \
  -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:${pw}@127.0.0.1:${port}/postgres" \
  -e GOTRUE_SITE_URL=http://localhost -e GOTRUE_JWT_SECRET="$(openssl rand -hex 32)" -e API_EXTERNAL_URL=http://localhost \
  "$auth_image" auth migrate >/dev/null 2>&1
docker run -d --name "$container-storage" --network host -e SERVER_PORT="$storage_port" -e PORT="$storage_port" \
  -e ANON_KEY=drill -e SERVICE_KEY=drill -e PGRST_JWT_SECRET=drill-drill-drill-drill-drill-drill -e AUTH_JWT_SECRET=drill-drill-drill-drill-drill-drill \
  -e DATABASE_URL="postgres://supabase_storage_admin:${pw}@127.0.0.1:${port}/postgres" -e POSTGREST_URL=http://127.0.0.1:1 \
  -e FILE_SIZE_LIMIT=52428800 -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/tmp/storage \
  -e TENANT_ID=stub -e REGION=stub -e GLOBAL_S3_BUCKET=stub -e ENABLE_IMAGE_TRANSFORMATION=false "$storage_image" >/dev/null
for _ in $(seq 1 60); do
  [ "$(q "$target" "select count(*) from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='allowed_mime_types'" 2>/dev/null)" = "1" ] && break
  sleep 2
done
sleep 3
docker rm -f "$container-storage" >/dev/null
[ "$(q "$target" "select count(*) from information_schema.columns where table_schema='auth' and table_name='users' and column_name='email_confirmed_at'")" = "1" ] \
  || { echo "Destino sem as migrations do Auth." >&2; exit 1; }
t2b=$(now_ms)
# Ordem: contas (FK de fin_members etc.), schema public com dados e grants, Storage.
pg_restore --dbname="$target" --data-only --no-owner --disable-triggers --exit-on-error "$work/auth.dump"
# Armadilha real (achada por este ensaio): o projeto novo concede ALL a anon,
# authenticated e service_role em todo objeto criado em public (default
# privileges), e o pg_dump só grava os GRANTs que diferem do padrão do
# Postgres — não grava "anon sem EXECUTE". Restaurar direto reabre todas as
# funções SECURITY DEFINER internas a anon. Por isso os default privileges são
# suspensos durante o restore (os ACLs do backup passam a valer exatamente) e
# devolvidos ao padrão do Supabase no fim.
default_privileges() {
  local action="$1" preposition="$2" sql=""
  for role in postgres supabase_admin; do
    for kind in tables functions sequences; do
      sql+="alter default privileges for role ${role} in schema public ${action} all on ${kind} ${preposition} anon, authenticated, service_role; "
    done
  done
  psql "$target" -q -X -v ON_ERROR_STOP=1 -c "$sql"
}
default_privileges revoke from
# O schema public já existe num projeto novo; o resto vem do backup. Restaurado
# como postgres, o mesmo dono da origem (funções SECURITY DEFINER não passam a
# rodar como superusuário).
target_postgres="postgresql://postgres:${pw}@127.0.0.1:${port}/postgres"
pg_restore --list "$work/public.dump" | grep -v -E '^[0-9]+; [0-9]+ [0-9]+ (SCHEMA - public |DEFAULT ACL )' > "$work/public.list"
pg_restore --dbname="$target_postgres" --no-owner --exit-on-error --use-list="$work/public.list" "$work/public.dump"
default_privileges grant to
# Gatilhos em auth.* que chamam funções de public não estão no dump de public.
q "$source_url" "select pg_get_triggerdef(t.oid) || ';' from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid where c.relnamespace = 'auth'::regnamespace and p.pronamespace = 'public'::regnamespace and not t.tgisinternal" 2> >(redact >&2) > "$work/auth-triggers.sql"
psql "$target" -q -X -v ON_ERROR_STOP=1 -f "$work/auth-triggers.sql"
pg_restore --dbname="$target" --data-only --no-owner --exit-on-error "$work/storage.dump"
t3=$(now_ms)

# ----------------------------------------------------------------- probes
probe_sql="
select json_build_object(
  'schema_version', (select value from public.fin_settings where key = 'schema_version'),
  'invite_secret_ok', (select length(value) >= 64 from public.fin_settings where key = 'invite_secret'),
  'fin_tables', (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'fin\_%'),
  'fin_tables_rls_forced', (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'fin\_%' and relrowsecurity and relforcerowsecurity),
  'tables_without_rls', (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity),
  'functions', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace),
  'definer_functions', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prosecdef),
  'triggers', (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal),
  'auth_triggers', (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'auth'::regnamespace and not t.tgisinternal),
  'policies', (select count(*) from pg_policies where schemaname = 'public'),
  'constraints', (select count(*) from pg_constraint where connamespace = 'public'::regnamespace),
  'anon_functions', (select coalesce(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), '') from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'authenticated_functions', (select coalesce(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), '') from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'table_grants', (select coalesce(string_agg(grantee || ':' || table_name || ':' || privilege_type, ',' order by grantee, table_name, privilege_type), '') from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated','service_role')),
  'bucket', (select json_build_object('public', public, 'limit', file_size_limit, 'mime', array_length(allowed_mime_types, 1)) from storage.buckets where id = 'fin-documents'),
  'allowlist_rows', (select count(*) from public.fin_pilot_allowlist),
  'operators', (select count(*) from public.fin_platform_operators),
  'auth_users', (select count(*) from auth.users),
  'rows', (select json_object_agg(relname, n) from (
     select c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint n
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'fin\_%' order by 1) r)
)::text"
source_probe="$(q "$source_url" "$probe_sql" 2> >(redact >&2))"
target_probe="$(q "$target" "$probe_sql")"
# Canonização: o restore reescreve CHECKs com AND aninhado sem os parênteses
# redundantes ((a AND b) AND c) -> (a AND b AND c); mesma árvore lógica.
schema_fp() { pg_dump "$1" --schema=public --schema-only --no-owner --no-acl | grep -v -E '^(--|\\(un)?restrict|SET |SELECT pg_catalog.set_config)' | sed -E 's/[[:space:]]+$//' | sed -E '/CONSTRAINT .* CHECK /s/[()]//g' | sha256sum | cut -d' ' -f1; }
source_fp="$(schema_fp "$source_url" 2> >(redact >&2))"
target_fp="$(schema_fp "$target")"
t4=$(now_ms)
canary="$(psql "$target" -X -v ON_ERROR_STOP=1 -f "$root/ops/sql/pilot-isolation-canary.sql" 2>&1 | grep -o 'CANÁRIO[^\"]*' || true)"
t5=$(now_ms)

node - "$source_probe" "$target_probe" "$source_fp" "$target_fp" "$canary" "$report" <<NODE
const [src, dst, sfp, tfp, canary, out] = process.argv.slice(2);
const s = JSON.parse(src), d = JSON.parse(dst);
const checks = [];
const eq = (name, a, b) => checks.push({ name, ok: JSON.stringify(a) === JSON.stringify(b), source: a, restored: b });
eq('schema_fingerprint', sfp, tfp);
for (const key of Object.keys(s)) eq(key, s[key], d[key]);
checks.push({ name: 'schema_version_set', ok: typeof d.schema_version === 'string' && d.schema_version.length > 0, restored: d.schema_version });
checks.push({ name: 'fin_tables_all_rls_forced', ok: d.fin_tables > 0 && d.fin_tables === d.fin_tables_rls_forced, restored: \`\${d.fin_tables_rls_forced}/\${d.fin_tables}\` });
checks.push({ name: 'bucket_private', ok: d.bucket?.public === false, restored: d.bucket });
checks.push({ name: 'isolation_canary', ok: /CANÁRIO OK/.test(canary), restored: canary });
const report = {
  classification: 'pilot_restore_drill', generatedAt: new Date().toISOString(), source: '${source_kind}',
  target: 'disposable Supabase Postgres (${image##*/}) + Auth and Storage migrations',
  backup: { method: 'pg_dump custom: public (schema+data+grants), auth.users/identities (data), storage.buckets (data)', sha256: '${backup_sha}', bytes: ${backup_bytes} },
  durations_ms: { backup: ${t1} - ${t0}, provision_target: ${t2b} - ${t2}, restore: ${t3} - ${t2b}, probes: ${t4} - ${t3}, canary: ${t5} - ${t4}, backup_to_verified: ${t5} - ${t0} - (${t2b} - ${t1}) },
  result: checks.every((c) => c.ok) ? 'passed' : 'failed',
  checks: checks.map((c) => (c.name === 'rows' ? { ...c, source: undefined, restored: undefined, tables: Object.keys(d.rows || {}).length, total_rows: Object.values(d.rows || {}).reduce((a, b) => a + b, 0) } : c))
};
require('node:fs').writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
for (const c of report.checks) console.log(\`\${c.ok ? 'OK  ' : 'FAIL'} \${c.name}\`);
console.log(\`backup \${report.durations_ms.backup} ms · restore \${report.durations_ms.restore} ms · probes \${report.durations_ms.probes} ms · canário \${report.durations_ms.canary} ms\`);
console.log(\`resultado: \${report.result} — relatório: reports/pilot-restore-drill.json\`);
process.exit(report.result === 'passed' ? 0 : 1);
NODE
