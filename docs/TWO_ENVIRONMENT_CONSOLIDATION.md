# Consolidação operacional — Demo + Production

Decisão autoritativa de 07/10/2026, Guideline v3.2. Há somente dois ambientes
hospedados permanentes: Demo e Production. Pilot significa estágio de validação
de release. `main` é a única linha de produto; não desenvolver na branch `pilot`.
Previews e bancos locais descartáveis não criam outro ambiente permanente.

## Seguimento após #142 (07/10/2026)

Snapshot atual em `FINANCIAL_DEPLOYMENT_FAILURE_2026-10-07.md`: main477ad8be,
run #794 com os quatro gates success, **M2/E2 comprovado**. merge-audit failure
registra MGI-2026-10-07-08 (merge antes do fim dos gates), sem rollback automático.
Demo no SHA novo continua synthetic-fixtures, arandu-pilot tem status Vercel
success para esse SHA, arandu failure. Leitura de logs/configuração segue 403.
Não atribuir a causa do build a CI, código ou variável sem os logs.

As observações restantes deste documento são o **snapshot histórico anterior
ao merge #142**. Preservam inventários, hashes e condições de conversão;
nenhuma configuração ou banco foi convertido nesta investigação. Destinos
planejados ainda não são atribuições ativas. M3/M4/M5 não comprovados.

## Estado observado e trabalho executado

Baseline remoto: `59806334e038f2b3a01f363a63e4ca577949b26b`, árvore
`c212d5c823c5b1dc04ae200b3c7f87e3a94498cb`; #140 e #141 já merged pelo owner.
O incidente MG-I-07 em `FINANCIAL_REPO_GOVERNANCE.md` registra os merges com
gates sem sucesso. Nenhum merge, promoção, reset ou migration nesta rodada.

| Componente | Estado vivo | Destino / condição |
|---|---|---|
| Demo Vercel | `arandu-demo.vercel.app`, READY, main@59806334, deployment `dpl_H4LBZaRfr1p2hMADgoYSDe3QzbcQ`; sandbox sem backend canônico | Mesmo projeto, `ARANDU_ENV=demo`, após recuperação e seed verificados |
| Pilot Vercel | `arandu-pilot.vercel.app`, READY, pilot@2241d3b94568acfdb99c8b7b31b53810e356846e | `TO_BE_DECOMMISSIONED`, preservado até Demo validada e dependências zero |
| Production Vercel | `arandu-bice.vercel.app`, READY no SHA antigo fd796e6be3e7f9b994552f1866f7ec4632b9e7fa | `arandu`, `ARANDU_ENV=production`; build atual 59806334 em ERROR |
| Supabase offgpyysgdhfemjlchod | Arandu Pilot, ACTIVE_HEALTHY, PostgreSQL 17.6; marker financial-surface-hardening-1; deployment_environment ausente | Converter em Demo após inventário classificado, export e restore |
| Supabase igacnfjeuqhxcmfyepgj | Legado, ACTIVE_HEALTHY, PostgreSQL 17.6; sem fin_settings/marker financeiro | Converter em Production após classificação dos dados e recuperação |
| Branch pilot | Ainda sustenta o alias Pilot | Congelamento normativo; proteção técnica não comprovada; remover apenas no final |

Foi criada a variável **de metadados** `ARANDU_INFRASTRUCTURE_STATUS=
TO_BE_DECOMMISSIONED` em Production do projeto Vercel `arandu-pilot`, id
`70u0xL0FF2p3TAtB`. A criação retornou sucesso; releitura posterior retornou 403
no escopo lucas-projects467. Isso não constitui cutover ou redeploy.
Nenhum terceiro Supabase foi solicitado.

## Inventários exatos e preservação

Os manifests em `ops/consolidation/` contêm somente contagens agregadas,
identidade e SHA-256 do inventário; não contêm registros, PII ou secrets.
A contagem é exata, diferente das estimativas inicialmente zeradas do catálogo.
Ela não equivale a backup e expira para decisão operacional após 24 horas.

| Origem | Public tables/views/functions/policies | Linhas public | Auth / MFA | Storage |
|---|---|---|---|---|
| offgpyysgdhfemjlchod | 71 / 18 / 101 / 51 | 13 | 0 / 0 | 1 bucket privado fin-documents, 0 objetos |
| igacnfjeuqhxcmfyepgj | 16 / 5 / 2 / 12 | 42 | 0 / 0 | 0 buckets, 0 objetos |

Pilot: api_rate_limits 1, catalog_releases 1, curated_collections 4,
fin_job_runs 4, fin_settings 3. Tabelas de negócio financeiro vazias. Os campos
operacionais ainda não tiveram classificação completa de PII;
`personal_data_rows=null`, portanto a conversão permanece BLOCKED.

Legado: artists 12, artworks 22, certificates 5, leads 2, reservations 1.
Há 2 leads com contato (1 e-mail fora dos domínios reservados), 1 reserva com
contato e 5 certificados com destinatário. São 8 registros com campos de
contato/destinatário, sem prova de serem fictícios. Ausência de usuários Auth
não prova ausência de dados pessoais. `customer_rows=null`. Nenhum dado foi
apagado, copiado para Demo ou publicado.

O vínculo Supabase do Official permanece **não comprovado**: valores sensíveis
foram redigidos pelas ferramentas. Não assumir que aponta para o legado.
Pilot depende de offgpyysgdhfemjlchod e da branch pilot. Demo atual é sandbox.
A inventariação de automações, aliases e scripts deve ser completa antes da
retirada; não há evidência de dependências zero hoje.

## Preparação executável e travas

`lib/deployment-topology.mjs` separa destino planejado de atribuição ativa.
As allowlists Demo/Production continuam vazias enquanto os refs ainda forem
Pilot/legado. Escolher um ref para conversão não autoriza seed/reset.
`ARANDU_ENV=pilot` é compatibilidade transitória e o doctor emite aviso de ciclo
de vida. Os aliases antigos de tooling são preservados para não romper o
runtime anterior ao cutover.

```bash
npm run consolidation:check -- --environment=demo --evidence=ops/consolidation/demo-inventory-2026-10-07.json
npm run consolidation:check -- --environment=production --evidence=ops/consolidation/production-inventory-2026-10-07.json
npm run release:candidate:check -- --commit=<SHA_COMPLETO> --evidence=<PROVA_HOSTED_V3.json>
npm run consolidation:check -- --environment=decommission --commit=<SHA_COMPLETO> --evidence=<PROVA_DEPENDENCIAS.json>
```

Os dois primeiros comandos foram executados: BLOCKED. O manifest atual não
inventa export/restore PASS. O assessor de conversão exige identidade exata,
inventário com contagens/hashes consistentes e classificação zero PII/cliente,
export vinculado ao mesmo inventário incluindo Auth/Storage, restore real em
alvo descartável, comparação de linhas e probes, e reconstrução com rollback.
Todos esses comandos apenas avaliam provas; nenhum executa ação destrutiva.
Relatórios anteriores são invalidados antes de ler uma nova prova.

`release:candidate:check` usa contrato v3, `stage=release_candidate`,
`deployment_environment=demo`, ref offgpyysgdhfemjlchod, projeto arandu-demo,
branch main, runtime demo e datasource supabase. Conserva **todos** os gates,
identidade/SHA, schema, export/restore, atualização, decommission de arte,
doctor, canary, jornada autenticada real, observabilidade e exercício operacional
exigidos pelo contrato Pilot v2. Exige adicionalmente seed sintético, verificação
e reset no schema atual, posteriores ao restore/migration. Não aceita sandbox,
fixtures ou v2 como release validado. Exemplos de formato são fixtures de testes
em `scripts/test-release-candidate.mjs`, nunca evidência operacional.

O assessor de retirada requer essa validação completa da Demo, inventário de
24h com listas explicitamente vazias de automações, aliases oficiais, scripts e
deployments dependentes de Pilot, rollback verificado e identificação exata do
projeto/branch. Não remove projeto, banco ou branch automaticamente.

## Recuperação e sequência de cutover

O cleanInstall foi recalculado da árvore atual: **59 migrations**, SHA-256
`bed3fa64c83a69c509c02ebda6381c7d9d2cc27c2996997c9b0ae269a5267555`.
O upgrade desde financial-surface-hardening-1 até antes da retirada de arte gera
12 migrations, SHA-256
`8e15a95bd1a95a5ef9dbdebd6107bc0f3bbf520e64ed9a8580fc23820f0084a0`,
com 12 posteriores adiadas. São bundles preparados, não aplicados.

```bash
npm run migrations:bundle -- --flow=cleanInstall
npm run migrations:bundle -- --flow=existingDatabase --after-schema=financial-surface-hardening-1 --stop-before=docs/supabase-financial-legacy-art-decommission.sql
npm run pilot:backup:preflight
npm run release:candidate:restore:drill
```

Usar o nome de arquivo canônico de decommission do manifesto ao gerar prefixo;
nunca aplicar decommission com dados legados por conveniência. A execução
hosted necessita conexão administrativa já autorizada em transporte seguro,
cliente PostgreSQL 17 compatível e destino descartável compatível com Supabase.
Credenciais não devem entrar em comandos compartilhados, reports ou Git.

Foi recuperado psql/pg_dump 16.15 por extração de pacotes em scratch. Não é
cliente suficiente para dump do servidor 17. O hostname administrativo
`db.offgpyysgdhfemjlchod.supabase.co` falhou em resolução DNS neste executor.
Não há Docker/destino descartável; o teste database tentou localhost:5432 e
recebeu connection refused. Não se obteve backup nem restore. Uma consulta SQL
bem-sucedida não os substitui. Não atribuir o bloqueio à ausência de credenciais.

Depois de recuperação comprovada e classificação dos dados:

1. Preservar o export de cada origem com hash, Auth/Storage e rollback; verificar
   restore e probes em destino descartável. Atualizar manifest real, sem PASS manual.
2. Reconstruir offgpyysgdhfemjlchod com cleanInstall; remover arte somente após
   export/decisão registrada; aplicar deployment_environment=demo. Liberar a
   allowlist Demo num PR de cutover com quatro gates verdes no SHA exato.
3. Configurar arandu-demo com ARANDU_ENV=demo, SUPABASE_URL/ANON/SERVICE_ROLE
   próprios, CRON_SECRET próprio, ARANDU_SITE_URL=https://arandu-demo.vercel.app,
   ARANDU_DEMO_PASSWORD. Remover ARANDU_DEPLOYMENT_KIND=demo somente com runtime
   canônico operacional. Configurar Auth, Storage, buckets e políticas reais.
4. Executar seed oficial e reset pelo runbook `docs/demo/`, demo:check, doctor com
   SHA esperado, canary e jornadas hosted desktop/mobile com personas reais.
   Verificar tenant/provider isolation, console/network, 404/500 e overflow.
5. Preservar/classificar os registros legados; reconstruir o segundo slot vazio
   com cleanInstall e marker production, secrets/Auth/Storage/cron separados.
   Liberar sua allowlist por PR verde somente após identidade comprovada.
6. Corrigir o build Official com logs reais, validar preview e release candidate.
   Promover somente com CI, recovery e release checks GO. Depois inventariar todas
   as dependências Pilot e passar consolidation:check decommission antes da retirada.

Não há ferramenta de rename Supabase disponível na sessão. Não renomear e
chamar pronto; identidade funcional exige as provas acima.

## Validação desta rodada e bloqueios externos

npm ci, audit:ci (0 vulnerabilidades), sbom:ci, check:all, build, check:build-size
e check:dist-assets passaram localmente. Budgets/assertions/gates preservados.
O E2E local Chrome desktop/mobile executou 216 casos: **209 passed, 7 skipped**.
Config temporária aponta para Chromium 153 recuperado no executor; config do
repositório mantém cinco projetos. Firefox/WebKit não disponíveis. As jornadas
locais usam mocks/fixtures; não provam API/Auth/RLS da Demo hospedada.
A suíte presentation Chrome desktop/mobile passou: 123 passed, 19 skipped.
As outras três combinações de navegador não foram executadas nesta rodada.
Também foram tentados os comandos padrão com --max-failures=1 --workers=1:
ambos falharam no lançamento, pois chromium_headless_shell-1243 não existe no
cache do executor. Isso não é falha de assertion nem PASS da matriz completa.

CI do main598: run `37635735477`, quatro jobs failure antes de qualquer step,
runner_id=0; merge-audit `37635735484` também failure. YAML, filtros, permissions,
paths e checks locais não demonstraram uma causa de código corrigível. Registrar
**CI_EXTERNAL_BLOCKER**, causa administrativa exata ainda não comprovada; não
atribuir billing/quota sem evidência. `merge:gates` continua fail-closed nos quatro
checks exatos do SHA; rulesets retornou 403 pedindo GitHub Pro/repositório público,
proteção retornou 403 sem acesso de administração. Não existe proteção imposta.

Official atual: deployment `dpl_4ewW1Hm8wWxVaAcur8zCQD99dfMw`, ERROR
BUILD_UTILS_SPAWN_1, npm run vercel-build exit 1. Node 24.x/framework Vite
confirmados; build local passa. CRON_SECRET presente não prova causa resolvida.
Root directory/build override e vínculo Supabase não foram expostos pelo endpoint
normalizado. Logs e releitura de variável retornaram 403 no escopo
lucas-projects467. CLI autenticado indisponível. Fallback browser rejeitado por
revisão automática por faltar aprovação explícita para o fallback condicionado.
Não houve tentativa alternativa para contornar essa rejeição.

**M1/E1 permanece; M2, M3 Demo, M4 release validation e M5 Production não atingidos.**
