# Fechamento operacional — 07/10/2026

Base: `main@8be66cab705c8bdf41707a34848c0cf4afb3c65a` (PR #140 já merged).
Nenhuma migration aplicada, alias promovido ou merge executado nesta rodada.

## Alterações executadas

- Doctor exige inventário service-role válido, todas as 120 relações do registro
  de governança e 183 RPCs. Probes anon cobrem as mesmas relações, incluindo
  entidades, contratos, portfólio, credenciais e governança.
- Falha/malformação do marcador, Auth settings, lista administrativa ou contagens
  bloqueia GO; demo sem marcador do seed bloqueia GO. Marcador de outro ambiente
  é UNSAFE. Paginação administrativa truncada é inconclusiva.
- `/api/health` identifica environment, mode, datasource, misconfigured, branch
  canônica e SHA válido usando a política única de runtime. Não expõe banco,
  credenciais, variáveis arbitrárias ou cliente. Continua liveness, sem alegar
  readiness. GET/HEAD e X-Request-ID preservados.
- Doctor verifica essa identidade e aceita `--expected-commit=<40 hex>` para
  vincular a evidência ao SHA exato publicado. Deploy anterior sem identidade
  fica NO-GO até atualização validada. Preview de feature não satisfaz main.
  Ensaio em localhost/loopback confere runtime, mas declara explicitamente que
  não atesta branch/SHA hospedado; fornecer SHA esperado exige prova exata.
- Official: `CRON_SECRET` criado via API, Sensitive, apenas Production, valor
  aleatório próprio (64 caracteres), sem imprimir ou persistir em código.
  Presença confirmada por nova listagem. Não ocorreu redeploy nem promoção.

## Estado hospedado comprovado

| Ambiente | Alias | Deployment / SHA público | Estado |
|---|---|---|---|
| Demo | arandu-demo.vercel.app | dpl_BUK2G6WsecsukAayp1iiwyu1V2sf / 8be66cab705c8bdf41707a34848c0cf4afb3c65a | READY production; sandbox legado |
| Pilot | arandu-pilot.vercel.app | dpl_E8iHaoFCrjHiNDbnh2RrcNxtC4Cm / 2241d3b94568acfdb99c8b7b31b53810e356846e | READY production; branch histórica pilot |
| Official | arandu-bice.vercel.app | dpl_4Dd6HusgFXDMiPeFRvF72J8Mo6mD / fd796e6be3e7f9b994552f1866f7ec4632b9e7fa | READY antigo |

Pilot preview de main: `dpl_936U3wJfpv5Z4A22tX1U8KLdingE` (8be66cab).
Official de main: `dpl_2fw7icdobrWxKJMF9Ww9UjNzRALu`, ERROR,
`BUILD_UTILS_SPAWN_1`, `npm run vercel-build` exit 1. Logs detalhados retornam
403; não atribuir a causa completa ao CRON_SECRET ausente. Build local técnico
aprovado não prova configuração ou build hospedado de Production.

GitHub CI main: run #788 (`37628077116`), quatro gates failure, steps vazios,
runner_id 0. Causa administrativa específica não confirmada nesta leitura;
não contornar nem alterar os gates. M2 depende dos quatro jobs no HEAD exato.

## Supabase e recovery

A organização escolhida foi `whvfafmjxdlwfohdseuk`. Custo consultado: US$ 0/mês
para projeto Free; criação de AranduDemo em sa-east-1 recusada pelo limite de
**dois projetos Free ativos** do owner. Projetos acessíveis: Pilot
`offgpyysgdhfemjlchod` e legado `igacnfjeuqhxcmfyepgj`. Nenhum foi pausado,
reutilizado, excluído ou misturado. Demo e PROD dedicados ainda ausentes.

Pilot: marker `financial-surface-hardening-1`; `deployment_environment` ausente.
Histórico gerenciado: arandu_pilot_clean_install_main_64a9bdc,
pilot_advisor_hardening_9470493, financial_pilot_surface_hardening.
Backup preflight: blocked, source_identity inválida/ausente; backup e restore
NOT RUN. Não há conexão PostgreSQL administrativa autorizada nesta sessão.
Connector SQL não substitui pg_dump, restore Auth/Storage/MFA e ensaio de recovery.

Bundles gerados deterministicamente, sem execução:

```bash
npm run migrations:bundle -- --flow=cleanInstall
npm run migrations:bundle -- --flow=existingDatabase --after-schema=financial-surface-hardening-1 --stop-before=docs/supabase-financial-legacy-art-decommission.sql
```

- cleanInstall: SHA-256 `bed3fa64c83a69c509c02ebda6381c7d9d2cc27c2996997c9b0ae269a5267555`.
- Prefixo seguro de upgrade: 12 migrations, marker final financial-data-governance-1,
  SHA-256 `8e15a95bd1a95a5ef9dbdebd6107bc0f3bbf520e64ed9a8580fc23820f0084a0`.
- 12 arquivos adiados, começando pelo decommission destrutivo. Executar o prefixo
  somente após recovery real; atravessar boundary somente com export verificado
  e acknowledgment definido no runbook. Não saltar arquivos para atingir marker final.

Consulta SQL read-only no Pilot antigo: zero tabelas financeiras sem RLS e zero
SECURITY DEFINER financeiras executáveis por anon fora da allowlist. Não é
canário cross-tenant ou validação do schema novo.

Security advisors atuais: 30 INFO rls_enabled_no_policy e 43 WARN
 authenticated_security_definer_function_executable. Não são prova de exploit:
 tabelas operacionais podem intencionalmente aceitar somente service-role;
 RPCs autenticadas precisam validar tenant/role. Não revogar RPCs do produto
 indiscriminadamente para zerar avisos. Remediações oficiais:
 [RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
 [SECURITY DEFINER autenticada](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Validação da mudança

Aprovados: npm ci; audit:ci (zero vulnerabilidades); sbom:ci (21 componentes);
check:all; build; check:build-size; check:dist-assets; testes negativos específicos
pilot-doctor e observability; financial-surface; financial-navigation.
Build: 775339 bytes, JS 435225; 38 páginas/258 referências locais existentes.

test:database tentou executar, bloqueado por psql ausente. Tentativa de prover
PostgreSQL 17 via pacote temporário forneceu apenas servidor, sem psql; apt não
localizou postgresql-client-17. Nenhuma evidência de banco local atribuída.
Playwright tentou instalar Chromium/Firefox/WebKit; downloads truncados de Chrome
impediram instalação. test:e2e executado: 540 falhas de lançamento por browser ausente; nenhuma jornada aprovada. test:e2e:list aprovado (520 testes em 19 arquivos).
check:seo:dist requer domínio/configuração do deploy e não foi considerado aprovado.
Sem aumento de budget, redução de assertions ou promoção de maturidade.

## Próxima execução, após os gates

Após provisionar DEMO próprio: cleanInstall, configurar ARANDU_ENV=demo e chaves
server-side, remover seletor sandbox, seguir docs/demo/RUNBOOK.md para seed Vitta
Foods via API, demo:check, personas e E2E. Não usar banco Pilot ou legado.
Após recovery e upgrade Pilot: canary real, doctor, journey e gates exatos antes
 de promover main ao alias público. Official depende de Pilot validado e PROD próprio.
Para cada ambiente hospedado, usar variáveis seguras do ambiente e SHA aprovado:

```bash
npm run finance:pilot:doctor -- --json --expected-commit=<SHA_COMPLETO_APROVADO>
```

GO do doctor isolado não substitui pilot:release:check, recovery ou CI.
