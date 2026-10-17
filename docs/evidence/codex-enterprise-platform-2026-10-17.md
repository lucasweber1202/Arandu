# Plataforma enterprise — execução de 17/10/2026

## Identidade e escopo

Branch `codex/enterprise-platform-release-20261017`, worktree exclusiva
`/workspace/arandu-platform`, base remota confirmada
`0fb48d3e202cb71942a608fb427b0e7e2bec44e9` (#212). Node 24.19.0.
Quatro gates da base e merge-audit consultados no GitHub: SUCCESS no SHA exato.
Única PR aberta observada antes da publicação: #177 (Dependabot).
Revisadas as evidências versionadas das frentes #204/#206/#208/#209/#211;
seus resultados históricos não contam como testes desta execução.

Missão executada de forma direcionada: documentos adversariais, integridade
da extração, logs de ambiente, gates e recovery sintético. Não se declara
auditoria exaustiva de todos os módulos, validação com cliente ou M3–M6.

## Defeitos demonstrados e corrigidos

| Prioridade | Baseline reproduzida | Correção e prova |
| --- | --- | --- |
| P1 | Leitura de Storage usa `arrayBuffer()` antes de conferir o tamanho real; um stream sem header confiável pode ser alocado integralmente | Leitura incremental, orçamento máximo 10 MiB, interrupção no primeiro chunk excedente e cancelamento; teste baseline falhou em `whole response buffering is forbidden`, agora passa |
| P1 | ZIP declara 1 byte e descompacta 1.024 bytes sem recusa; limite agregado de 24 MiB confia na declaração | Inflate limitado ao tamanho declarado, tamanho real e CRC conferidos; entradas duplicadas e truncadas recusadas. Teste baseline falhou com `Missing expected exception`, agora passa; DOCX/XLSX e evals existentes passam |
| P1 | `ARANDU_SITE_URL` com `operator:synthetic-log-sentinel@...` é aceita e impressa em log | Relatório não imprime URLs e checker recusa credenciais/query/fragmento. Regressão falhou por exposição do sentinel na baseline e passa após a correção |

Não houve alteração de autenticação, autorização, permissões, dados, grants,
RLS, topologia ou versões financeiras. Não houve dependência nova. Campos
ausentes continuam ausentes, sem vencedor automático ou confirmação falsa.
Contrato e handoff: `codex-api-handoff-2026-10-17.md` nesta pasta.

## Production: matriz de diagnóstico reproduzível

Inspecionados `vercel-build`, checker, runtime/topologia, scripts npm,
`vercel.json` e workflow dos quatro gates. O build técnico é separado do
`predeploy/release:check`; não executa seed/reset nem libera release.

| Causa possível do exit 1 | Prova desta sessão | Classificação |
| --- | --- | --- |
| Compilação/dependência | `npm ci --include=optional` e `npm run build` passam com Node 24 e lockfile intacto | LOCAL_VALIDATED; não prova build hospedado |
| Variável ausente | Negativos de `test-finance-env` e `test-deploy-release-separation` recusam configuração incompleta | LOCAL_VALIDATED |
| Identidade/ref errado ou banco não atribuído | Production no ref Pilot/legado/estranho e domínio sem identidade verificável recusados; Demo/Production continuam sem assignment ativo | LOCAL_VALIDATED |
| Datasource sandbox junto de ambiente real | Negativos existentes recusam `ARANDU_DEPLOYMENT_KIND=demo` com ambiente/credenciais reais | LOCAL_VALIDATED |
| Release intencionalmente bloqueada | `predeploy` conserva `release:check`; gates não foram enfraquecidos | VERIFIED no código; release hospedada NOT_RUN |
| Node incompatível | Execução local v24.19.0 e engines 24.x | LOCAL_VALIDATED; runtime hospedado desta sessão INCONCLUSIVE |
| Serviço externo/Auth ou override/config Vercel | Sem leitura autorizada dos detalhes | ACCESS_BLOCKED / INCONCLUSIVE |
| Causa efetiva do deployment oficial | HTTP 403 impede vincular stderr real a qualquer hipótese acima | INCONCLUSIVE |

O diagnóstico local não justifica alterar `ACTIVE_SUPABASE_ASSIGNMENTS`.
O teste positivo aceita Pilot válido; simulação pura de assignments futuros
avança sem modificar a política ativa. Os negativos não usam credenciais reais.

## Acessos e ambientes observados

Em 17/10, GitHub status da base: `arandu` FAILURE,
`arandu-demo` SUCCESS e `arandu-pilot` SUCCESS. São metadados, não readiness.
URLs de status: Official `A5tdnm98KRyCg6rgBn3uS24fiKfv`, Demo
`ADU4z96HpirQ8KbDCZnKVZoHMSYR`, Pilot `4gEasBWsBF5vtMT4s99HHHrUNPUf`.

`GET /v13/deployments/dpl_4ewW1Hm8wWxVaAcur8zCQD99dfMw`, scope
`lucas-projects467`, team `team_BBpDcLVx5izJjXz5qBEq2cRy`: **ACCESS_BLOCKED,
403**. Não repetido nem consultado em escopo alternativo. Vercel CLI não
instalada; nenhum login interativo ou fallback browser. Causa hospedada não
deduzida do erro local. Acesso mínimo necessário: leitura do deployment
oficial atual, build logs e configuração no mesmo scope autorizado.

Supabase `list_projects` read-only: Pilot `offgpyysgdhfemjlchod` e legado
`igacnfjeuqhxcmfyepgj`, ambos ACTIVE_HEALTHY/PG17.6. Não há projeto dedicado
Demo nessa listagem. Isso não verifica schema, Auth, revogação ou Storage.
Conversão, datasource canônico e prontidão hospedada continuam **INCONCLUSIVE**;
export, restore, migrations e cutover hospedados **NOT_RUN**.

## Validação e limitações

- `npm ci --include=optional`: PASS usando cache em `/tmp`; primeira tentativa
  falhou porque o cache padrão no home era inacessível. Lockfile preservado.
- `check:all`: PASS com umask 022 e permissão de escrita no home para as fixtures
  privadas de recovery. Primeira execução falhou por EROFS nessa fixture; a
  permissão corrigiu o ambiente, sem mudar testes ou declarar a falha PASS.
- `build`, `audit:ci` (0 vulnerabilidades), `check:financial-surface`,
  `check:financial-navigation` e `git diff --check`: PASS.
- Testes direcionados de documentos/extração e ambiente: PASS, incluindo
  autorização antes da leitura, JWT do chamador, resposta negativa `too_large`
  e ausência de fatos registrados no overflow.
- `test:database`: PASS em PostgreSQL 17.6 descartável, sem porta publicada,
  container exclusivo com rede desabilitada; clean install, upgrade,
  reaplicação, rollback, RLS e corridas reais. Adapter de `psql` somente no
  laboratório encaminhou stdin/arquivos e variáveis PG às sessões independentes.
  Container removido após os testes de banco/recovery.
- `deploy:check`: PASS, inclusive build/budgets, check:all hermético, assets,
  superfície, navegação, SEO e listagem de 935 testes E2E. URL `.example.com`
  sintética usada somente para metadados SEO, sem datasource/credenciais reais.
  Nenhum navegador foi executado por essa listagem. A primeira
  tentativa atingiu uma fixture negativa de permissão com umask 0077 (0644
  solicitado virou 0600); repetição com umask 022 conserva a assertion original.
- Browser E2E desta sessão: NOT_RUN; nenhum frontend/E2E alterado. Listagem de
  casos não é execução de navegador. CI final deve validar os quatro gates.

## Recovery executado

`scripts/test-recovery-real.mjs`: **LOCAL_VALIDATED**, PostgreSQL 17.6 e
age 1.3.2, executado como usuário postgres em container isolado, sem rede
externa do container. Export criptografado → restore do MESMO backup →
reconciliação de conteúdo sintético/catálogos/RLS/roles → negativos de hash,
permissão, symlink e evidência de outro export passaram. O próprio teste
remove chaves/dumps/clusters; nenhum artefato privado entrou no repositório.

Resultado emitido: `synthetic_postgresql17_age_same_backup_restore`, VALIDATED;
reconciliation SHA-256
`bfd58e418bbe53404210387432017f5ba95624666abbe2f91af04aec57d22b54`.
Tentativas nativas iniciais falharam por caminhos de instalação incompletos
do PostgreSQL; a execução completa usou a instalação íntegra do container.

Não comprova backup hospedado, compatibilidade de restore Supabase gerenciado,
binários reais de Storage, configuração OAuth/SSO externa, MFA ou RPO/RTO.
Os testes de Storage de `check:all` usam transportes simulados; não são um
novo restore end-to-end de Storage. Preservação real continua dependente de
classificação, custódia durável aprovada e restore isolado do mesmo export.

## Operador, rollout e rollback

Não há migration nem rollout de schema. Aplicação é compatível com o frontend
atual. Para configuração de site, remover usuário/senha/query/fragmento da URL;
segredos pertencem às variáveis server-only. Não reutilizar chave de outro
projeto nem liberar refs para tornar o build verde.

Após leitura autorizada, operador deve reconciliar deployment/SHA/configuração
real e planejar preservação/conversão com aprovação específica. Nenhuma ação
hospedada é autorizada apenas por estes testes. Rollback de código: revert da
PR; não desfaz dados nem exige rollback SQL. Não fazer merge desta PR sem os
quatro gates no HEAD exato e base atual contida. Esta missão não faz merge.
