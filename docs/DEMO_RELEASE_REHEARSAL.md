# Ensaio operacional da Demo financeira

Este procedimento reutiliza o harness de integração existente; não cria outro
sandbox nem contata Supabase hospedado. A stack local contém PostgreSQL,
GoTrue, PostgREST, Storage e a API do Arandu, com o seed sintético canônico.

## Decisão do ensaio

- **B — laboratório Demo validado:** SHA completo do checkout e do evento/PR
  identificados; preflight,
  lockfile, build, serviços/migrations, smoke, seed e releitura, Chromium
  desktop/mobile, jornada, sondas adversariais, restore isolado com Storage,
  sanitização, teardown e arquivamento de evidência passam.
- **C — NO-GO:** qualquer fase falha, é pulada/cancelada, SHA não é identificado
  ou cleanup/arquivo falha. Corrigir a causa e repetir no SHA pretendido; não
  contar etapa SKIPPED como sucesso.
- **A — Demo hospedada validada:** nunca é emitido por este ensaio. Exige
  `release:candidate:doctor` e `release:candidate:check` no SHA/ambiente/schema
  reais, com identidade do datasource, canário e evidências hospedadas revisadas.

Um B prova a composição local/efêmera com serviços reais e dados sintéticos.
Ele não prova que a estação da apresentação tem o mesmo stack pronto, nem M3,
M4 ou Production. Use o workflow `Arandu Demo Integration (ephemeral)` na main
para uma prova CI independente; seu resumo final agora inclui SHA, fases,
cleanup e publicação do artifact. A avaliação de M3 permanece NOT_PROVEN nessa
execução.

## Execução local controlada

Requisitos: checkout limpo do SHA revisado, Node 24, npm dependencies, Docker
com daemon ativo, Docker Compose, `psql`, `age`, `age-keygen`, Chromium do
Playwright, memória e disco acima dos limites do preflight. O projeto Compose
local usa o nome fixo `arandu-pilot-local` e a pasta `scripts/pilot-local/.state`;
não iniciar outra Demo/Pilot local simultaneamente. Nunca fornecer credenciais
Supabase hospedadas. Todas as fases montam URLs locais e `assert-local.mjs`
recusa alvo remoto.

```bash
set -Eeuo pipefail
finish() {
  status=$?
  trap - EXIT
  bash scripts/ci-demo/run.sh evidence || status=1
  bash scripts/ci-demo/run.sh down || status=1
  exit "$status"
}
trap finish EXIT

bash scripts/ci-demo/run.sh preflight
npm ci --include=optional
npm run build
bash scripts/ci-demo/run.sh images
bash scripts/ci-demo/run.sh up
bash scripts/ci-demo/run.sh smoke
bash scripts/ci-demo/run.sh seed
bash scripts/ci-demo/run.sh check
bash scripts/ci-demo/run.sh recovery
bash scripts/ci-demo/run.sh e2e demo-desktop
bash scripts/ci-demo/run.sh e2e demo-mobile
bash scripts/ci-demo/run.sh journey
bash scripts/ci-demo/run.sh adversarial
```

O trap sempre tenta recolher logs sanitizados e remover o Compose; uma falha de
teardown altera o exit code para falha. Verifique `reports/ci-demo` e o
`reports/pilot-restore-drill.json` sanitizado. O estado local é descartável; não
preservar `.state`, chaves, volumes, dumps ou certificados como evidência.
Depois do ensaio, reconstrua a stack do zero antes de repetir o seed e a jornada.

Para validar o mesmo protocolo no runner independente, use Actions →
`Arandu Demo Integration (ephemeral)` → `Run workflow`. Não execute fases em
paralelo; seed/jornada/adversarial alteram a Demo efêmera.

## Critério de NO-GO para 29/10

Sem A ou B demonstrados no commit de apresentação, não apresentar como produto
operacional com backend validado. Se A continuar bloqueado, B só é opção quando
a equipe executar o procedimento na própria estação de demonstração, mantiver
o stack isolado ativo durante a sessão e repetir o smoke/seed check no mesmo
SHA; um artifact CI não deixa o serviço disponível após o runner ser destruído.
Qualquer falha de seed, auth, RLS, Storage, restore, E2E ou teardown significa
NO-GO. Não substituir a aplicação por mock, sandbox legado ou sequência de
telas.

## Dependências hospedadas que permanecem fora deste procedimento

O workflow não lê secrets, aplica migrations, altera Auth/Storage, exporta
dados reais ou muda assignments. Para A, ainda são necessários acesso read-only
ao Vercel no scope autorizado, identidade e schema do Supabase dedicado à Demo,
recovery real/classificação da origem e autorização separada para cutover.
Status de deployment, HTTP 200, Preview e workflow verde são insuficientes.
