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
# 0700; no hosted é mantido para rollback, no local é apagado ao final.
# PILOT_DRILL_KEEP_BACKUP=1 mantém apenas o backup; PILOT_DRILL_KEEP=1 também o destino. O relatório em
# reports/pilot-restore-drill.json tem só tempos, hashes e contagens.
#
# PILOT_DRILL_STORAGE_BINARIES=1 inclui os binários do Storage (scripts/storage-recovery.mjs):
# export cifrado pela API oficial, prova de que o restore só do banco falha
# (metadado sem arquivo), negativos (artefato ausente, adulterado, identidade
# errada), restore no Storage descartável, releitura com hash e permissões.
# Sem isso, origem com arquivos é recusada no preflight. Origem local usa
# http://127.0.0.1:5000 e a chave de serviço do ensaio local; hospedada exige
# PILOT_DRILL_STORAGE_SOURCE_URL e PILOT_DRILL_STORAGE_SOURCE_KEY.
# PILOT_DRILL_PG_FROM_IMAGE=1 usa psql/pg_dump/pg_restore da própria imagem
# Postgres fixada (mesmo major da origem) quando o cliente do host é outro.
# Nunca aponte o destino para o piloto: o destino é sempre um contêiner novo.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
image="${PILOT_DRILL_DB_IMAGE:-${PILOT_LOCAL_DB_IMAGE:-}}"
auth_image="${PILOT_LOCAL_AUTH_IMAGE:-public.ecr.aws/supabase/gotrue:v2.181.0}"
storage_image="${PILOT_LOCAL_STORAGE_IMAGE:-public.ecr.aws/supabase/storage-api:v1.25.3}"
storage_port="${PILOT_DRILL_STORAGE_PORT:-54330}"
port="${PILOT_DRILL_PORT:-54329}"
container="arandu-restore-drill-$$"
report="$root/reports/pilot-restore-drill.json"
mkdir -p "$root/reports"
# A previous PASS must never survive a blocked or failed new attempt.
rm -f "$report"

# Register cleanup before provisioning tool wrappers or running the preflight.
tools=""
work=""
keep_backup="${PILOT_DRILL_KEEP_BACKUP:-0}"
run_id="$(node -e 'console.log(require("node:crypto").randomUUID())')"
created_containers=()
cleanup() {
  local original_status=$? cleanup_failed=0 remaining target_name cleanup_state=removed
  trap - EXIT
  if [ "${PILOT_DRILL_KEEP:-0}" = "1" ]; then
    cleanup_state=retained
  else
    for target_name in "${created_containers[@]}"; do
      if ! remaining="$(docker ps -aq --filter "name=^/${target_name}$" --filter "label=arandu.restore-drill=$run_id")"; then cleanup_failed=1; continue; fi
      if [ -n "$remaining" ]; then
        if ! docker rm -f "$remaining" >/dev/null; then cleanup_failed=1; continue; fi
      fi
      if ! remaining="$(docker ps -aq --filter "name=^/${target_name}$" --filter "label=arandu.restore-drill=$run_id")"; then cleanup_failed=1; continue; fi
      if [ -n "$remaining" ]; then cleanup_failed=1; fi
    done
  fi
  if [ "$cleanup_failed" = 1 ]; then
    rm -f "$report"
    echo "Cleanup falhou; relatório invalidado e estado do ensaio preservado." >&2
    [ "$original_status" -ne 0 ] || original_status=1
    exit "$original_status"
  fi
  if [ "$original_status" -ne 0 ]; then rm -f "$report"; fi
  if [ -n "$tools" ] && ! rm -rf "$tools"; then
    rm -f "$report"
    [ "$original_status" -ne 0 ] || original_status=1
    exit "$original_status"
  fi
  if [ "${PILOT_DRILL_KEEP:-0}" != "1" ] && [ "$keep_backup" != "1" ]; then
    if [ -n "$work" ] && ! rm -rf "$work"; then
      rm -f "$report"
      [ "$original_status" -ne 0 ] || original_status=1
      exit "$original_status"
    fi
  elif [ -n "$work" ]; then echo "backup mantido em $work"; fi
  if [ -f "$report" ]; then
    if ! node --input-type=module - "$report" "$cleanup_state" <<'CLEANUP_REPORT'
import fs from 'node:fs';
const [file, cleanup] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
report.cleanup = cleanup;
if (report.result === 'pending_cleanup') report.result = 'passed';
fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
CLEANUP_REPORT
    then
      rm -f "$report"
      echo "Falha ao registrar cleanup; relatório invalidado." >&2
      [ "$original_status" -ne 0 ] || original_status=1
      exit "$original_status"
    fi
  fi
  exit "$original_status"
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
if [ -z "$image" ]; then
  if [ "$source_kind" = pilot ]; then
    image="$(node --input-type=module -e "import { HOSTED_DRILL_IMAGE } from './lib/pilot-backup-preflight.mjs'; console.log(HOSTED_DRILL_IMAGE)")"
  else image="public.ecr.aws/supabase/postgres:15.14.1.064"; fi
fi
keep_backup="${PILOT_DRILL_KEEP_BACKUP:-0}"
if [ "$source_kind" = pilot ]; then keep_backup=1; fi
storage_binaries="${PILOT_DRILL_STORAGE_BINARIES:-0}"
if [ "${PILOT_DRILL_PG_FROM_IMAGE:-0}" = "1" ]; then
  # Clientes do mesmo major da origem, da imagem já fixada: nenhum download novo.
  tools="$(mktemp -d "${TMPDIR:-/tmp}/arandu-drill-tools.XXXXXX")"
  for bin in psql pg_dump pg_restore; do
    cat > "$tools/$bin" <<WRAP
#!/usr/bin/env bash
exec docker run --rm -i --network host --user "\$(id -u):\$(id -g)" -e HOME=/tmp -v "${TMPDIR:-/tmp}:${TMPDIR:-/tmp}" -v "$root:$root" -w "\$PWD" \\
  -e PGHOST -e PGPORT -e PGDATABASE -e PGUSER -e PGPASSWORD -e PGSSLMODE -e PGOPTIONS -e PGCONNECT_TIMEOUT \\
  --entrypoint $bin "$image" "\$@"
WRAP
    chmod 700 "$tools/$bin"
  done
  export PATH="$tools:$PATH"
fi
export PILOT_SOURCE_DATABASE_URL="$source_url" PILOT_DRILL_SOURCE_KIND="$source_kind" PILOT_DRILL_DB_IMAGE="$image" PILOT_DRILL_STORAGE_BINARIES="$storage_binaries"
# Fail before generating sensitive dumps or provisioning a destination.
node "$root/scripts/pilot-backup-preflight.mjs"
umask 077
work="$(mktemp -d "${TMPDIR:-/tmp}/arandu-restore-drill.XXXXXX")"
chmod 700 "$work"
redact() { sed -E 's#postgres(ql)?://[^[:space:]]+#[DATABASE_URL]#g'; }
now_ms() { date +%s%3N; }
source_psql() { node "$root/scripts/pilot-db-client.mjs" psql "$@"; }
source_dump() { node "$root/scripts/pilot-db-client.mjs" pg_dump "$@"; }
q() {
  if [ "$1" = "$source_url" ]; then source_psql -X -A -t -v ON_ERROR_STOP=1 -c "$2";
  else psql "$1" -X -A -t -v ON_ERROR_STOP=1 -c "$2"; fi
}

# Somente leitura na origem: nada abaixo escreve nela.
[ "$(q "$source_url" "select count(*) from pg_namespace where nspname in ('auth','storage')" 2>&1 | redact)" = "2" ] \
  || { echo "Origem não parece um projeto Supabase (auth/storage ausentes)." >&2; exit 1; }

# ------------------------------------------------------------------ backup
t0=$(now_ms)
source_dump --format=custom --schema=public --no-owner --file="$work/public.dump"
source_dump --format=custom --data-only --table=auth.users --table=auth.identities --no-owner --file="$work/auth.dump"
storage_tables=(--table=storage.buckets)
[ "$storage_binaries" = "1" ] && storage_tables+=(--table=storage.objects)
source_dump --format=custom --data-only "${storage_tables[@]}" --no-owner --file="$work/storage.dump"
source_dump --format=custom --schema-only --schema=storage --no-owner --file="$work/storage-schema.dump"
# Application triggers in Auth are outside the public dump, but part of backup.
q "$source_url" "select pg_get_triggerdef(t.oid) || ';' from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where c.relnamespace='auth'::regnamespace and p.pronamespace='public'::regnamespace and not t.tgisinternal order by t.tgname" > "$work/auth-triggers.sql"
storage_export=""
if [ "$storage_binaries" = "1" ]; then
  # Identidade age efêmera do ensaio, fora do diretório do ciphertext.
  age-keygen -o "$work/storage.agekey" 2>/dev/null; chmod 600 "$work/storage.agekey"
  mkdir -m 700 "$work/storage-export"
  if [ "$source_kind" = pilot-local ]; then
    storage_source_url="${PILOT_DRILL_STORAGE_SOURCE_URL:-http://127.0.0.1:5000}"; storage_source_key="${PILOT_DRILL_STORAGE_SOURCE_KEY:-$SERVICE_KEY}"; storage_kind=local-synthetic
  else
    storage_source_url="${PILOT_DRILL_STORAGE_SOURCE_URL:?}"; storage_source_key="${PILOT_DRILL_STORAGE_SOURCE_KEY:?}"; storage_kind=hosted
  fi
  storage_ref=""
  [ "$storage_kind" = hosted ] && storage_ref="$(node --input-type=module -e "import { PILOT_REF } from '$root/lib/pilot-backup-preflight.mjs'; console.log(PILOT_REF)")"
  ARANDU_STORAGE_CONFIRM=ARANDU-STORAGE-EXPORT ARANDU_STORAGE_SOURCE_KIND="$storage_kind" ARANDU_STORAGE_PROJECT_REF="$storage_ref" \
  ARANDU_STORAGE_DATABASE_URL="$source_url" ARANDU_STORAGE_SOURCE_URL="$storage_source_url" ARANDU_STORAGE_SOURCE_SERVICE_KEY="$storage_source_key" \
  ARANDU_STORAGE_RECIPIENT="$(age-keygen -y "$work/storage.agekey")" ARANDU_STORAGE_DIRECTORY="$work/storage-export" \
    node "$root/scripts/storage-recovery.mjs" export > "$work/storage-export.json"
  storage_export="$(ls -d "$work/storage-export"/arandu-storage-* | head -n 1)"
fi
t1=$(now_ms)
backup_sha=$(cat "$work/public.dump" "$work/auth.dump" "$work/storage.dump" "$work/storage-schema.dump" "$work/auth-triggers.sql" | sha256sum | cut -d' ' -f1)
backup_bytes=$(cat "$work/public.dump" "$work/auth.dump" "$work/storage.dump" "$work/storage-schema.dump" "$work/auth-triggers.sql" | wc -c)

# ------------------------------------------------------- destino descartável
pw="$(openssl rand -hex 18)"
created_containers+=("$container")
docker run -d --name "$container" --label "arandu.restore-drill=$run_id" -e POSTGRES_PASSWORD="$pw" -e JWT_SECRET="$(openssl rand -hex 32)" -e JWT_EXP=3600 \
  -p "127.0.0.1:${port}:5432" "$image" postgres -c config_file=/etc/postgresql/postgresql.conf -c log_min_messages=fatal >/dev/null
target="postgresql://supabase_admin:${pw}@127.0.0.1:${port}/postgres"
for _ in $(seq 1 90); do
  docker exec "$container" pg_isready -U postgres -h localhost >/dev/null 2>&1 && q "$target" "select 1" >/dev/null 2>&1 && break
  sleep 2
done
sleep 3
[ "$(q "$source_url" "select current_setting('server_version_num')::int/10000")" = "$(q "$target" "select current_setting('server_version_num')::int/10000")" ] \
  || { echo "Major PostgreSQL real do destino diverge da origem; restore recusado." >&2; exit 1; }
t2=$(now_ms)
# Um projeto Supabase novo já nasce com Auth e Storage migrados: o destino passa
# pelas mesmas migrations (GoTrue migrate; Storage aplica as suas ao subir).
psql "$target" -q -X -v ON_ERROR_STOP=1 -c "alter user supabase_auth_admin with password '${pw}'; alter user supabase_storage_admin with password '${pw}'; alter user authenticator with password '${pw}'; alter user postgres with password '${pw}';"
docker run --rm --network host -e GOTRUE_DB_DRIVER=postgres \
  -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:${pw}@127.0.0.1:${port}/postgres" \
  -e GOTRUE_SITE_URL=http://localhost -e GOTRUE_JWT_SECRET="$(openssl rand -hex 32)" -e API_EXTERNAL_URL=http://localhost \
  "$auth_image" auth migrate >/dev/null 2>&1
# Segredo próprio do Storage descartável: só este ensaio assina tokens para ele.
storage_jwt="$(openssl rand -hex 32)"
mint() { node --input-type=module -e "import { signJwt } from '$root/scripts/storage-recovery.mjs'; console.log(signJwt(process.argv[1], { role: process.argv[2], iss: 'supabase' }))" "$storage_jwt" "$1"; }
storage_anon="$(mint anon)"; storage_service="$(mint service_role)"
created_containers+=("$container-storage")
docker run -d --name "$container-storage" --label "arandu.restore-drill=$run_id" --network host -e SERVER_PORT="$storage_port" -e PORT="$storage_port" \
  -e ANON_KEY="$storage_anon" -e SERVICE_KEY="$storage_service" -e PGRST_JWT_SECRET="$storage_jwt" -e AUTH_JWT_SECRET="$storage_jwt" \
  -e DATABASE_URL="postgres://supabase_storage_admin:${pw}@127.0.0.1:${port}/postgres" -e POSTGREST_URL=http://127.0.0.1:1 \
  -e FILE_SIZE_LIMIT=52428800 -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/tmp/storage \
  -e TENANT_ID=stub -e REGION=stub -e GLOBAL_S3_BUCKET=stub -e ENABLE_IMAGE_TRANSFORMATION=false "$storage_image" >/dev/null
for _ in $(seq 1 60); do
  [ "$(q "$target" "select count(*) from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='allowed_mime_types'" 2>/dev/null)" = "1" ] && break
  sleep 2
done
sleep 3
# Sem binários, o Storage só serviu para migrar o schema. Com binários, fica de
# pé para receber os arquivos pela API oficial depois do restore do banco.
[ "$storage_binaries" = "1" ] || docker rm -f "$container-storage" >/dev/null
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
psql "$target" -q -X -v ON_ERROR_STOP=1 -f "$work/auth-triggers.sql"
pg_restore --dbname="$target" --data-only --no-owner --exit-on-error "$work/storage.dump"
# Storage service migrations do not recreate the application's policies. The
# destination is the fresh container above; no existing project is modified.
pg_restore --list "$work/storage-schema.dump" | awk '/^[0-9]+; [0-9]+ [0-9]+ POLICY storage /' > "$work/storage-policies.list"
psql "$target" -q -X -v ON_ERROR_STOP=1 -c "do \$\$ declare p record; begin for p in select tablename,policyname from pg_policies where schemaname='storage' loop execute format('drop policy %I on storage.%I',p.policyname,p.tablename); end loop; end \$\$;"
if [ -s "$work/storage-policies.list" ]; then
  pg_restore --dbname="$target" --no-owner --exit-on-error --use-list="$work/storage-policies.list" "$work/storage-schema.dump"
fi
# Achado deste ensaio: as migrations do Storage não concedem acesso às tabelas a
# anon/authenticated/service_role (o projeto Supabase concede à parte). Sem os
# ACLs da origem, o Storage restaurado recusa até o service_role (42501). Os
# GRANTs vêm do backup, não de uma lista fixa; probe storage_grants compara.
pg_restore --list "$work/storage-schema.dump" | awk '/^[0-9]+; [0-9]+ [0-9]+ ACL (- SCHEMA storage|storage (TABLE|SEQUENCE)) /' > "$work/storage-acl.list"
if [ -s "$work/storage-acl.list" ]; then
  pg_restore --dbname="$target" --no-owner --exit-on-error --use-list="$work/storage-acl.list" "$work/storage-schema.dump"
fi
t3=$(now_ms)

# ----------------------------------------------------------------- probes
probe_sql="
select json_build_object(
  'settings_sha256', (select encode(sha256(convert_to(coalesce(string_agg(key || ':' || length(value)::text || ':' || value, E'\\n' order by key),''),'UTF8')),'hex') from public.fin_settings),
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
  'storage_rls', (select coalesce(json_agg(json_build_object('table',relname,'rls',relrowsecurity,'forced',relforcerowsecurity) order by relname),'[]'::json) from pg_class where relnamespace='storage'::regnamespace and relname in ('buckets','objects')),
  'definer_owners', (select coalesce(string_agg(p.oid::regprocedure::text || ':' || r.rolname || ':' || r.rolsuper::text, ',' order by p.oid::regprocedure::text), '') from pg_proc p join pg_roles r on r.oid=p.proowner where p.pronamespace='public'::regnamespace and p.prosecdef),
  'storage_policies', (select coalesce(json_agg(json_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'qual',qual,'check',with_check) order by tablename,policyname), '[]'::json) from pg_policies where schemaname='storage'),
  'constraints', (select count(*) from pg_constraint where connamespace = 'public'::regnamespace),
  'anon_functions', (select coalesce(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), '') from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'authenticated_functions', (select coalesce(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), '') from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'table_grants', (select coalesce(string_agg(grantee || ':' || table_name || ':' || privilege_type, ',' order by grantee, table_name, privilege_type), '') from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated','service_role')),
  'bucket', (select json_build_object('public', public, 'limit', file_size_limit, 'mime', array_length(allowed_mime_types, 1)) from storage.buckets where id = 'fin-documents'),
  'allowlist_rows', (select count(*) from public.fin_pilot_allowlist),
  'operators', (select count(*) from public.fin_platform_operators),
  'auth_users', (select count(*) from auth.users),
  'storage_objects', (select count(*) from storage.objects),
  'storage_grants', (select coalesce(string_agg(grantee || ':' || table_name || ':' || privilege_type, ',' order by grantee, table_name, privilege_type), '') from information_schema.role_table_grants where table_schema = 'storage' and grantee in ('anon','authenticated','service_role')),
  'rows', (select json_object_agg(relname, n) from (
     select c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint n
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'fin\_%' order by 1) r)
)::text"
source_probe="$(q "$source_url" "$probe_sql" 2> >(redact >&2))"
target_probe="$(q "$target" "$probe_sql")"
# Canonização: o restore reescreve CHECKs com AND aninhado sem os parênteses
# redundantes ((a AND b) AND c) -> (a AND b AND c); mesma árvore lógica.
schema_fp() { if [ "$1" = "$source_url" ]; then source_dump --schema=public --schema-only --no-owner --no-acl; else pg_dump "$1" --schema=public --schema-only --no-owner --no-acl; fi | grep -v -E '^(--|\\(un)?restrict|SET |SELECT pg_catalog.set_config)' | sed -E 's/[[:space:]]+$//' | sed -E '/CONSTRAINT .* CHECK /s/[()]//g' | sha256sum | cut -d' ' -f1; }
source_fp="$(schema_fp "$source_url" 2> >(redact >&2))"
target_fp="$(schema_fp "$target")"
t4=$(now_ms)
if canary_output="$(psql "$target" -X -v ON_ERROR_STOP=1 -f "$root/ops/sql/pilot-isolation-canary.sql" 2>&1)"; then canary_status=0; else canary_status=$?; fi
canary="$(printf '%s\n' "$canary_output" | grep -o 'CANÁRIO[^\"]*' || true)"
t5=$(now_ms)

# ------------------------------------------------- binários do Storage
storage_checks='[]'
if [ "$storage_binaries" = "1" ]; then
  sr_env=(ARANDU_STORAGE_IDENTITY="$work/storage.agekey" ARANDU_STORAGE_TARGET_DATABASE_URL="$target"
    ARANDU_STORAGE_TARGET_URL="http://127.0.0.1:${storage_port}" ARANDU_STORAGE_TARGET_JWT_SECRET="$storage_jwt" ARANDU_STORAGE_TARGET_SERVICE_KEY="$storage_service"
    ARANDU_STORAGE_RESTORE_CONFIRM=ARANDU-ISOLATED-STORAGE-RESTORE)
  storage_run() { env "${sr_env[@]}" ARANDU_STORAGE_BACKUP="$1" "${@:3}" node "$root/scripts/storage-recovery.mjs" "$2" 2>&1; }
  # Recusa esperada com o código certo; passar ou falhar por outro motivo reprova.
  refused() {
    local out; if out="$(storage_run "$@")"; then echo unexpected_pass; elif printf '%s' "$out" | grep -q "(${expected_code})"; then echo refused; else echo wrong_failure; fi
  }
  objects="$(node -p "require('$storage_export/storage-manifest.json').object_count")"
  # Negativos antes de qualquer envio: o destino não é tocado.
  cp -a "$storage_export" "$work/neg-missing"; rm -f "$work/neg-missing/storage/obj-000001.age"
  expected_code=STORAGE_ARTIFACT_MISSING; neg_missing="$(refused "$work/neg-missing" restore)"
  cp -a "$storage_export" "$work/neg-corrupt"
  node -e "const f=process.argv[1];const b=require('fs').readFileSync(f);b[b.length-1]^=1;require('fs').writeFileSync(f,b)" "$work/neg-corrupt/storage/obj-000001.age"
  expected_code=STORAGE_HASH_MISMATCH; neg_corrupt="$(refused "$work/neg-corrupt" restore)"
  age-keygen -o "$work/wrong.agekey" 2>/dev/null; chmod 600 "$work/wrong.agekey"
  expected_code=STORAGE_DECRYPT_FAILED; neg_identity="$(refused "$storage_export" restore ARANDU_STORAGE_IDENTITY="$work/wrong.agekey")"
  # Banco restaurado com os metadados de storage.objects, sem os arquivos: falha.
  expected_code=STORAGE_RECONCILIATION_MISMATCH; db_only="$(refused "$storage_export" verify)"
  db_only_missing="$(node -e "const fs=require('fs'),d=process.argv[1];const r=fs.readdirSync(d).filter(n=>n.startsWith('storage-restore-verification-')).sort().map(n=>JSON.parse(fs.readFileSync(d+'/'+n)));const last=r.at(-1);console.log(last&&last.differences.filter(x=>x.kind==='missing_binary').length||0)" "$storage_export")"
  if restore_out="$(storage_run "$storage_export" restore)"; then restore_status=0; else restore_status=1; fi
  # Saída da CLI já sanitizada: códigos, contagens e números de sequência.
  printf 'storage restore: %s\n' "$(printf '%s' "$restore_out" | tail -n 1)"
  storage_checks="$(node -e "
    const [objects, miss, corrupt, identity, dbOnly, dbMissing, status, out] = process.argv.slice(1);
    let r = {}; try { r = JSON.parse(out.trim().split('\\n').at(-1)); } catch {}
    const n = Number(objects);
    console.log(JSON.stringify([
      { name: 'storage_objects_exported', ok: n > 0, restored: n },
      { name: 'storage_artifact_missing_rejected', ok: miss === 'refused', restored: miss },
      { name: 'storage_artifact_corrupted_rejected', ok: corrupt === 'refused', restored: corrupt },
      { name: 'storage_wrong_identity_rejected', ok: identity === 'refused', restored: identity },
      { name: 'storage_database_only_rejected', ok: dbOnly === 'refused' && Number(dbMissing) === n, restored: dbOnly + ', missing_binary=' + dbMissing },
      { name: 'storage_binaries_restored', ok: status === '0' && r.reconciliation === 'MATCH' && r.objects === n, restored: r.reconciliation || 'failed' },
      { name: 'storage_permissions', ok: r.permissions === 'DENIED_AS_EXPECTED', restored: r.permissions || 'not run' }
    ]));" "$objects" "$neg_missing" "$neg_corrupt" "$neg_identity" "$db_only" "$db_only_missing" "$restore_status" "$restore_out")"
  rm -rf "$work/neg-missing" "$work/neg-corrupt"
fi
t6=$(now_ms)

node --input-type=module - "$source_probe" "$target_probe" "$source_fp" "$target_fp" "$canary" "$report" "$storage_checks" <<NODE
const [src, dst, sfp, tfp, canary, out, storageChecks] = process.argv.slice(2);
const s = JSON.parse(src), d = JSON.parse(dst);
const checks = [];
const eq = (name, a, b) => checks.push({ name, ok: JSON.stringify(a) === JSON.stringify(b), source: a, restored: b });
eq('schema_fingerprint', sfp, tfp);
for (const key of Object.keys(s)) eq(key, s[key], d[key]);
checks.push({ name: 'schema_version_set', ok: typeof d.schema_version === 'string' && d.schema_version.length > 0, restored: d.schema_version });
// RLS ligado em toda tabela de public. FORCE vale para as tabelas de dados; as
// de controle da Demo (fin_demo_workspaces, fin_demo_pool_leases) só têm grant
// para service_role e são lidas por funções security definer do dono, que o
// FORCE bloquearia. A contagem forçada precisa ser igual à da origem (acima).
checks.push({ name: 'fin_tables_all_rls_enabled', ok: d.fin_tables > 0 && d.tables_without_rls === 0, restored: \`\${d.fin_tables} tabelas fin_*, \${d.tables_without_rls} sem RLS, \${d.fin_tables_rls_forced} com FORCE\` });
checks.push({ name: 'bucket_private', ok: d.bucket?.public === false, restored: d.bucket });
checks.push({ name: 'isolation_canary', ok: ${canary_status} === 0 && /CANÁRIO OK/.test(canary), restored: canary });
const storage = JSON.parse(storageChecks);
checks.push(...storage);
const storageVerified = storage.length > 0 && storage.every((c) => c.ok);
const { recoveryCompleteness } = await import('$root/lib/storage-recovery.mjs');
const binaryNames = new Set(storage.map((c) => c.name));
const databaseVerified = checks.filter((c) => !binaryNames.has(c.name)).every((c) => c.ok);
const recovery = recoveryCompleteness({ databaseVerified, storageObjects: s.storage_objects, storageVerified });
checks.push({ name: 'recovery_complete', ok: recovery === 'COMPLETE', restored: recovery });
const report = {
  classification: 'pilot_restore_drill', generatedAt: new Date().toISOString(), source: '${source_kind}',
  target: 'disposable Supabase Postgres (${image##*/}) + Auth and Storage migrations',
  backup: { method: 'pg_dump custom: public (schema+data+grants), auth.users/identities, storage.buckets' + ('${storage_binaries}' === '1' ? ' and storage.objects metadata' : '') + ', storage policies, Auth application triggers' + ('${storage_binaries}' === '1' ? '; Storage binaries via scripts/storage-recovery.mjs (age per object, encrypted index)' : ''),
    scope: '${storage_binaries}' === '1' ? 'application including Storage binaries; MFA absent by verified preflight' : 'application; Storage binaries and MFA absent by verified preflight', sha256: '${backup_sha}', bytes: ${backup_bytes}, retained: '${keep_backup}' === '1' },
  recovery,
  durations_ms: { backup: ${t1} - ${t0}, provision_target: ${t2b} - ${t2}, restore: ${t3} - ${t2b}, probes: ${t4} - ${t3}, canary: ${t5} - ${t4}, storage_binaries: ${t6} - ${t5}, backup_to_verified: ${t6} - ${t0} - (${t2b} - ${t1}) },
  result: checks.every((c) => c.ok) ? 'pending_cleanup' : 'failed',
  checks: checks.map((c) => (c.name === 'rows' ? { ...c, source: undefined, restored: undefined, tables: Object.keys(d.rows || {}).length, total_rows: Object.values(d.rows || {}).reduce((a, b) => a + b, 0) } : c))
};
(await import('node:fs')).writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
for (const c of report.checks) console.log(\`\${c.ok ? 'OK  ' : 'FAIL'} \${c.name}\`);
console.log(\`backup \${report.durations_ms.backup} ms · restore \${report.durations_ms.restore} ms · probes \${report.durations_ms.probes} ms · canário \${report.durations_ms.canary} ms · binários \${report.durations_ms.storage_binaries} ms · recovery \${recovery}\`);
console.log(\`resultado: \${report.result} — relatório: reports/pilot-restore-drill.json\`);
process.exit(report.result === 'pending_cleanup' ? 0 : 1);
NODE
