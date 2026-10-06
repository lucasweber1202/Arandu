# Fluxo de desenvolvimento, release e ambientes

> **Modelo vigente desde 06/10/2026 (consolidação `main` canônica).** Uma
> branch longa de produto (`main`), três ambientes que publicam a **mesma
> árvore** com configuração, dados e banco diferentes. A branch `pilot` deixou
> de ser linha de evolução: fica preservada, congelada e protegida até a
> transição ser confirmada (ver "Transição" abaixo). Documentos datados que
> descrevem `feature/* → pilot → main` são históricos.

```text
feature/*  ──PR (4 gates verdes no HEAD exato)──▶  main
                                                     │
                     ┌───────────────────────────────┼───────────────────────────────┐
                     ▼                               ▼                               ▼
              arandu-demo                     arandu-pilot                        arandu
         ARANDU_ENV=demo                  ARANDU_ENV=pilot                ARANDU_ENV=production
         runtime "demo"                   runtime "staging"               runtime "official"
         Supabase DEMO                    Supabase PILOT (validação)      Supabase PROD
         empresa fictícia                 migrations, E2E, smoke,         dados reais,
         (Vitta Foods)                    recovery, release candidate     só release aprovada
```

## Branching

| Branch | Papel | Vida |
| --- | --- | --- |
| `main` | **única** linha de produto; fonte da verdade de código, migrations e documentação normativa | permanente |
| `feature/*`, `fix/*`, `chore/*`, `docs/*`, `agent/*`, `claude/*`, `codex/*` | trabalho temporário; nasce da ponta atual de `main` e volta por PR para `main` | apagada depois do merge |
| `hotfix/*` | correção urgente; mesmo fluxo (PR para `main`), prioridade de revisão | apagada depois do merge |
| `pilot` | **histórica/congelada**: preservada até a confirmação da transição; não recebe PR | arquivar depois da confirmação |

Regras:

- PR só entra com `database`, `deploy-boundaries`, `validate` e `presentation`
  concluídos com sucesso **no SHA exato do HEAD** e com a ponta atual de `main`
  contida no HEAD (`npm run merge:gates -- <PR>`). Pending, failed, cancelled,
  skipped ou SHA anterior bloqueiam.
- Uma PR por capability; PR empilhada (base = outra feature) só com o merge na
  ordem e a base retornando a `main` antes do merge final. A #135 foi mergeada
  na branch da #134 (e não em `pilot`) e por isso nunca chegou ao produto
  canônico até a consolidação: **"merged" no GitHub não prova que o código está
  em `main`**. Confira com `git branch -r --contains <sha>` / `git merge-base --is-ancestor`.
- Push em lote, validação local antes (CLAUDE.md, `CONTRIBUTING.md`).

## Runtime: o que muda entre ambientes

A política fica em um único módulo, [`lib/runtime-mode.mjs`](../lib/runtime-mode.mjs),
testado em `scripts/test-runtime-mode.mjs`. `ARANDU_ENV` é o único seletor; não
existe segunda variável que possa discordar dele. Configuração ambígua falha
fechada (nunca vira `official` nem libera side effect).

| Capability (`resolveRuntime(env)`) | official (`production`) | staging (`pilot`) | demo (`demo`) | sandbox legado (`ARANDU_DEPLOYMENT_KIND=demo`) | development / preview |
| --- | --- | --- | --- | --- | --- |
| `datasource` | Supabase PROD | Supabase PILOT | Supabase DEMO | fixtures no navegador | nenhum banco real |
| `canSendEmail` | sim¹ | sim¹ | **não** | não | só mock |
| `canDispatchWebhooks` | sim¹ | sim¹ | **não** (nem reivindica a fila) | não | só mock |
| `canCallExternalProviders` (modelo de extração) | sim¹ | sim¹ | **não** | não | só mock |
| `canPersistRealDocuments` | sim | sim | **não** (documentos fictícios do seed) | não | — |
| `canUseSyntheticFixtures` | **não** | **não** | sim | sim | — |
| `canUseMockIdentity` (IdP de teste) | **não** | sim | sim | sim | sim (fora de deploy de produção) |
| `expectedBranch` | `main` | `main` | `main` | — | — |
| selo no shell | — | "Ambiente de validação" | "Ambiente de demonstração" | "Demo · dados fictícios" | — |

¹ Ainda sujeito à configuração própria de cada integração (provider, aprovação,
segredo, contrato de dados). O runtime só **remove** permissões; nunca liga uma
integração por conta própria.

O que **não** muda: telas, rotas, APIs, regras de domínio, cálculos, RLS,
RBAC, segregação de função, navegação, design system e capabilities. A demo é o
produto real com outro banco e outro conjunto de dados.

## Dados

| Ambiente | Dados | Quem escreve | Reset |
| --- | --- | --- | --- |
| Demo | empresa fictícia **Vitta Foods** e instituições fictícias (`*.example`), semeadas **pela API real** (`scripts/demo/seed.mjs`) | `npm run demo:seed` / `demo:reset`, só da máquina do operador, com as travas de `lib/finance/demo-guard.mjs` | determinístico: `npm run demo:reset` apaga só o escopo da demo e semeia de novo |
| Staging/Pilot | dados de validação e dos usuários do piloto | usuários reais autorizados | nunca resetado por script; recovery por backup/restore |
| Official | dados reais de clientes | usuários reais | nunca resetado; backup + restore comprovado antes de M5 |

Nenhum banco é compartilhado. A produção recusa o banco do piloto, da demo
(`DEMO_SUPABASE_REFS`) e o legado (`scripts/check-finance-env.mjs`,
`finance:pilot:doctor`).

## Release: da branch temporária à produção

1. `feature/*` a partir de `main` → validação local (`check:all`, `build`,
   `check:build-size`, `test:database`, E2E da área) → **um** push → PR para `main`.
2. Os quatro gates verdes no HEAD exato → merge em `main`.
3. Cada projeto Vercel publica `main` automaticamente. Migration nova não é
   aplicada pelo deploy: o operador aplica primeiro em **staging/pilot**
   (`npm run migrations:release`, `docs/MIGRATION_RELEASE_RUNBOOK.md`), roda
   `ARANDU_ENV=pilot npm run finance:pilot:doctor` e `npm run pilot:canary`.
4. Demo: aplicar a mesma migration no Supabase DEMO e `npm run demo:reset`
   quando o dataset mudar.
5. Official: só depois de staging verde **no mesmo SHA** — aplicar as mesmas
   migrations, na mesma ordem, e `ARANDU_ENV=production npm run finance:pilot:doctor`.
   Até M5 (guideline §5) o oficial continua bloqueado por `release:check`.

Código que depende de migration ainda não aplicada num ambiente precisa
degradar com segurança (o doctor acusa `schema_version` divergente).

## Rollback

| O quê | Como |
| --- | --- |
| Aplicação | Vercel → projeto afetado → Instant Rollback para o deploy anterior; depois PR de revert em `main` (os três ambientes recebem o revert) |
| Migration | `docs/rollback/<migration>.rollback.sql`, ensaiado em `npm run test:database`; rollbacks falham fechado quando há dado que seria perdido — aí vale forward-fix ou restore por backup (`npm run pilot:restore:drill`) |
| Release | revert do merge em `main` + rollback de migration na ordem inversa, staging antes de official |
| Capability por ambiente | política em `lib/runtime-mode.mjs` (side effects) ou feature flag de configuração; nunca branch |
| Deployment errado | `finance:env:check` recusa no build: ambiente sem `ARANDU_ENV`, banco de outro ambiente, branch diferente de `main`, sandbox em ambiente com banco |

## Vercel

| Projeto | Production Branch | Variáveis (escopo Production) |
| --- | --- | --- |
| `arandu` | `main` | `ARANDU_ENV=production`, Supabase PROD, `CRON_SECRET`, `ARANDU_SITE_URL` |
| `arandu-pilot` | **`main`** (antes `pilot`) | `ARANDU_ENV=pilot`, Supabase PILOT (`offgpyysgdhfemjlchod`), `CRON_SECRET`, `ARANDU_SITE_URL` |
| `arandu-demo` | `main` | alvo: `ARANDU_ENV=demo` + Supabase DEMO próprio. Enquanto o Supabase DEMO não existir, segue o sandbox legado (`ARANDU_DEPLOYMENT_KIND=demo`, sem credencial) |

`scripts/check-finance-env.mjs` falha o build de qualquer ambiente com banco
publicado a partir de outra branch que não `main`. **Ação do owner:** trocar a
Production Branch do `arandu-pilot` para `main` (Settings → Git). Sem isso o
próximo deploy do piloto a partir de `pilot` é recusado pelo build — falha
fechada, o deploy atual continua no ar.

Previews (PRs) não recebem variáveis de nenhum ambiente: são código sem banco.

## Demo canônica e sandbox legado

A demo canônica é `ARANDU_ENV=demo` ([`docs/demo/`](demo/README.md)): todas as
capabilities do produto, inclusive implantação pós-award, covenants e waiver,
performance, spend, qualificação, leitura de documento e oportunidades, com a
história da Vitta Foods semeada pela API real. Validada localmente com
`npm run demo:setup` (Supabase local em Docker).

O sandbox `/demo` (motor no navegador, `finance/demo/`) é **legado e
congelado**: reimplementa regras do servidor, por isso não recebe capability
nova, e seu tamanho de JS tem budget próprio congelado
([`FINANCIAL_BUNDLE_HEADROOM.md`](FINANCIAL_BUNDLE_HEADROOM.md)). Ele sai em PR
própria depois que `arandu-demo` migrar para `ARANDU_ENV=demo`.

## Transição (`pilot` → `main` canônica)

1. PR de consolidação para `main` com a árvore `pilot` + #135 (Financial Spend)
   + runtime + demo + docs. `main` estava 0 commits à frente de `pilot`; nada
   exclusivo de `main` se perde.
2. Depois do merge: `git diff origin/pilot origin/main -- . ':!docs' ':!scripts' …`
   deve mostrar só a consolidação; `git merge-base --is-ancestor origin/pilot origin/main` = verdadeiro.
3. Owner: Production Branch do `arandu-pilot` → `main`; Dependabot já aponta para `main`.
4. Confirmada a equivalência e um deploy de staging a partir de `main`, `pilot`
   pode ser arquivada (tag `archive/pilot-2026-10-06`) e removida.

## O que impede os erros de topologia

- `scripts/vercel-build.mjs` recusa deploy de produção da Vercel sem ambiente
  declarado.
- `scripts/check-finance-env.mjs` (no build de demo/pilot/production): banco
  de outro ambiente, chave de outro projeto, service key no lugar da anon,
  branch diferente de `main`, sandbox ligado em ambiente com banco.
- `lib/demo-mode.mjs`: o sandbox nunca é publicado em ambiente com banco nem na
  produção financeira; build do sandbox com credencial real falha.
- Nenhum script de build/deploy executa `demo:seed`/`demo:reset`
  (`scripts/test-deploy-release-separation.mjs`).
- `lib/deployment-surface.mjs`: só rotas financeiras em ambiente hospedado.
