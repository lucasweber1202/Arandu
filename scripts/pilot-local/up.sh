#!/usr/bin/env bash
# Ensaio local do piloto financeiro com componentes reais do Supabase
# (Postgres 15 da Supabase, GoTrue, PostgREST, Storage) — sem conta, sem nuvem.
#
#   bash scripts/pilot-local/up.sh          # sobe tudo e aplica as migrations
#   bash scripts/pilot-local/journey.sh     # jornada real + ataques
#   bash scripts/pilot-local/down.sh        # derruba e apaga o estado
#
# Chaves, senhas e certificados são gerados aqui, a cada ambiente, em
# scripts/pilot-local/.state/ (fora do git). Nada disto serve para produção.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
state="$here/.state"
project="arandu-pilot-local"
mkdir -p "$state"

if [ ! -f "$state/.env" ]; then
  node -e '
    const c = require("node:crypto");
    const secret = c.randomBytes(32).toString("hex");
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const sign = (p) => { const h = b64({ alg: "HS256", typ: "JWT" }), b = b64(p); return `${h}.${b}.${c.createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url")}`; };
    const iat = Math.floor(Date.now() / 1000), exp = iat + 30 * 86400;
    console.log(`JWT_SECRET=${secret}`);
    console.log(`ANON_KEY=${sign({ role: "anon", iss: "supabase", iat, exp })}`);
    console.log(`SERVICE_KEY=${sign({ role: "service_role", iss: "supabase", iat, exp })}`);
    console.log(`PGPW=${c.randomBytes(18).toString("hex")}`);
    console.log(`CRON_SECRET=${c.randomBytes(32).toString("hex")}`);
  ' > "$state/.env"
  chmod 600 "$state/.env"
fi
if [ ! -f "$state/cert.pem" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$state/key.pem" -out "$state/cert.pem" -days 30 \
    -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
fi
set -a; . "$state/.env"; set +a

compose() { docker compose -p "$project" --env-file "$state/.env" -f "$here/docker-compose.yml" "$@"; }
# O ECR público às vezes recusa (cota); as mesmas imagens oficiais estão no Docker Hub.
if [ -z "${PILOT_LOCAL_DB_IMAGE:-}" ] && ! compose pull -q >/dev/null 2>&1; then
  echo "ECR público indisponível; usando as imagens oficiais do Docker Hub."
  export PILOT_LOCAL_DB_IMAGE=supabase/postgres:15.14.1.064 PILOT_LOCAL_AUTH_IMAGE=supabase/gotrue:v2.181.0 \
    PILOT_LOCAL_REST_IMAGE=postgrest/postgrest:v12.2.9 PILOT_LOCAL_STORAGE_IMAGE=supabase/storage-api:v1.25.3
fi
compose up -d db
for _ in $(seq 1 60); do
  [ "$(compose ps db --format '{{.Health}}')" = "healthy" ] && break
  sleep 2
done
sleep 5
admin_url="postgresql://supabase_admin:${PGPW}@localhost:54322/postgres"
db_url="postgresql://postgres:${PGPW}@localhost:54322/postgres"
# Mesmo que o docker-compose oficial da Supabase faz em volumes/db/roles.sql.
psql "$admin_url" -q -v ON_ERROR_STOP=1 -c "alter user authenticator with password '${PGPW}'; alter user supabase_auth_admin with password '${PGPW}'; alter user supabase_storage_admin with password '${PGPW}'; alter user postgres with password '${PGPW}';"
compose up -d auth rest storage
for _ in $(seq 1 60); do
  curl -fsS http://localhost:9999/health >/dev/null 2>&1 && curl -fsS http://localhost:5000/status >/dev/null 2>&1 && break
  sleep 2
done
# O Storage cria o schema com o próprio papel; o Supabase hospedado concede
# estes privilégios aos papéis da API. Sem eles, até o service role recebe 42501.
psql "postgresql://supabase_storage_admin:${PGPW}@localhost:54322/postgres" -q -v ON_ERROR_STOP=1 -c "grant usage on schema storage to anon, authenticated, service_role; grant all on all tables in schema storage to anon, authenticated, service_role; grant all on all sequences in schema storage to anon, authenticated, service_role; grant all on all functions in schema storage to anon, authenticated, service_role; alter default privileges in schema storage grant all on tables to anon, authenticated, service_role;"

cd "$root"
while IFS= read -r file; do
  psql "$db_url" -q -v ON_ERROR_STOP=1 -f "$file" > /dev/null
  echo "migration aplicada: $file"
done < <(node -e "for (const f of require('./docs/supabase-migrations.json').cleanInstall) console.log(f)")
psql "$db_url" -Atc "select 'bucket '||id||' public='||public||' limite='||file_size_limit||' tipos='||array_length(allowed_mime_types,1) from storage.buckets where id='fin-documents'"

[ -d dist ] || npm run build
( node "$here/gateway.mjs" > "$state/gateway.log" 2>&1 & echo $! > "$state/gateway.pid" )
# ARANDU_ENV=demo (npm run demo:setup) sobe o MESMO app como ambiente de demonstração.
( SUPABASE_URL=https://localhost:8443 SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
  ARANDU_SITE_URL=https://localhost:4443 ARANDU_ENV="${PILOT_LOCAL_ARANDU_ENV:-pilot}" CRON_SECRET="$CRON_SECRET" \
  NODE_EXTRA_CA_CERTS="$state/cert.pem" node "$here/app-server.mjs" > "$state/app.log" 2>&1 & echo $! > "$state/app.pid" )
sleep 2
echo
echo "Supabase local (HTTPS): https://localhost:8443  — Postgres: localhost:54322"
echo "Arandu real:            https://localhost:4443/finance/  (certificado autoassinado)"
echo "Próximo passo:          bash scripts/pilot-local/journey.sh"
