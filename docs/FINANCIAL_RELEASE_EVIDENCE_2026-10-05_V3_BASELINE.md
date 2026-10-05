# Reconciliação pós-merge e baseline v3 — 05/10/2026

**Objetivo da rodada: `CODE/CI BASELINE CLEAN`, não `PILOT GO`.**
**Pilot hosted remains NO-GO.** Nenhum deploy, migration, backup, restore, doctor,
canário ou jornada foi executado em ambiente hospedado nesta rodada: o executor não tem
credencial de Supabase, Vercel nem administração do GitHub. Tudo marcado "local" foi
executado neste executor e não atesta Pilot nem produção.

Fonte viva desde esta rodada (substitui `FINANCIAL_RELEASE_EVIDENCE_2026-10-05.md` como
estado atual; aquele documento continua válido como histórico da #125 e pela lista de
ações externas).

## Estado vivo confirmado no início (GitHub, 05/10 13:39Z)

| Item | Observado |
| --- | --- |
| `pilot` | `d828a44027506a9d4a4eddd807914f85dd8dde4c` — merge #127 (Guideline v3) sobre `399b7ac` (merge #125) |
| `main` | `ed5da41c5244040d9e3b1ddb501053280d692622` — merge #126 (Dependabot, Vite 8.3.1 → 8.3.2) |
| `main...pilot` | diverged: `pilot` ahead 87, behind 2 (`cba84af`, `ed5da41`) |
| #125 | mergeada 13:28:11Z; HEAD `e2212af` com quatro gates success (run `37258668278`); `merge-audit` run `37317037072` **success** |
| #126 | mergeada em `main` 13:28:22Z; quatro gates success no HEAD `cba84af` (run `37308022347`); `main` não tem `merge-audit` |
| #127 | mergeada 13:28:36Z com `validate`/`presentation` **in_progress** (run `37316477732`, HEAD `c16ae66` criado sobre `556258c`); `validate` terminou success às 13:39:46Z, depois do merge; `merge-audit` run `37317090124` **failure** ("validate: in_progress", "presentation: in_progress", "PR desatualizada") |
| PRs/commits adicionais depois disso | nenhum |
| proteção | `pilot` e `main` `protected=false` (API de branches, 05/10) |

`pilot@d828a44` **não** é baseline limpa: a árvore #125 + #127 nunca rodou CI.
Incidente registrado como MGI-2026-10-05-01 em `FINANCIAL_REPO_GOVERNANCE.md`.

## O que esta PR faz (sem feature nova)

1. **Reconciliação `main → pilot`.** Merge-base `201adb4`; `main` tem uma única mudança
   exclusiva: `cba84af` (Vite 8.3.1 → 8.3.2, #126). Merge consciente de `main@ed5da41`
   mantendo `package.json`/`package-lock.json` da `pilot` + o bump do Vite (lock
   regenerado com `npm install --package-lock-only`, 73+/73− linhas, igual em forma ao diff
   do Dependabot). A dependência `typescript` que só `main` ainda carrega é legado da arte
   removido deliberadamente na `pilot` (LEG-02) e **não** foi reintroduzida. Nenhum outro
   arquivo de `main` difere do merge-base. Depois do merge desta PR, `main...pilot` fica
   `behind_by=0`.
2. **Prevenção da divergência.** `.github/dependabot.yml` passa a usar
   `target-branch: "pilot"` nos dois ecossistemas, verificado em `check:governance` (prova
   negativa: removido em um bloco, o check falha). O Dependabot lê a configuração da branch
   padrão; vale depois da próxima promoção `pilot → main`.
3. **Autoridade v3.** `CLAUDE.md`, `CONTRIBUTING.md` e `OPERATIONS_INDEX.md` deixam de dizer
   que o addendum v2.1 prevalece; o addendum ganha cabeçalho histórico/superseded (mantido
   pelos IDs `Add. X.Y` citados em migrations e na matriz).
4. **`IMPLEMENTATION_MATRIX` em M0–M6.** Critérios objetivos de promoção, níveis de
   evidência, baselines de validação (`BL-125`, `BL-V3`) e registro de maturidade por
   capability (Maturity, Evidence level, ambiente, SHA, última validação, blockers, próximo
   gate). Nenhuma capability acima de M2; nenhuma M6.
5. **Baselines documentais.** `556258c`/`201adb4` passam a "histórico" onde eram
   apresentados como estado atual (`FINANCIAL_PILOT_GO_LIVE.md`, matriz, índices).
6. **Incidente da #127** registrado; histórico não reescrito.
7. **Capacity headroom** registrado em `FINANCIAL_BUNDLE_HEADROOM.md`.

## Validação local (árvore desta PR)

| Comando | Resultado |
| --- | --- |
| `npm ci --include=optional` | ok, 0 vulnerabilidades |
| `npm run audit:ci` | 0 vulnerabilidades |
| `npm run sbom:ci` | ok |
| `npm run check:all` | exit 0 (inclui `check:governance` com a nova regra do Dependabot) |
| `npm run build` + `check:build-size` + `check:dist-assets` + `check:seo:dist` + `check:financial-surface` + `check:financial-navigation` | ok (`ARANDU_SITE_URL=https://arandu.example.com`, como no CI) |
| `npm run build:demo` + `check:build-size` | ok; JS 799.005 / 800.000 |
| `npm run test:e2e:list` | ok |
| `npm run test:database` (PostgreSQL 16 local) | exit 0 |
| `npm run test:e2e` (Chromium desktop + mobile Chrome) | 167 passed, 7 skipped, 0 failed |
| `npm run test:e2e:presentation` (Chromium desktop + mobile Chrome) | 123 passed, 19 skipped, 0 failed |
| `git diff --check` | ok |

Firefox, WebKit e Safari móvel não existem neste executor (download proibido); rodam nos
jobs `validate` e `presentation` do CI. O Chromium local é o binário pré-instalado no
executor (rev. 1194) apontado para o caminho que o Playwright 1.63 espera; não altera
config, browsers nem retries do projeto. Skips são os condicionais documentados nos specs.

## CI no HEAD exato e merge (#128)

| Item | Resultado |
| --- | --- |
| HEAD | `4a93fa60b51ae4c094e95d25cee8be4748363cfb` |
| `database` | success (13:55:12Z) |
| `deploy-boundaries` | success (13:54:34Z) |
| `validate` | success (14:09:41Z) |
| `presentation` | success (14:15:20Z) |
| Run | `37320266260` |
| `merge:gates` | **não executado antes do merge**: a #128 foi mergeada às 13:56:23Z por ação manual, com `validate`/`presentation` ainda `in_progress` (teria bloqueado) |
| Merge | `pilot@d4d6c22`, árvore idêntica a `4a93fa6` |
| `merge-audit` | run `37320702496` **failure** (gates em execução no momento do merge) |
| `main...pilot` | `pilot` ahead 90, behind **0** |

Leitura: a **árvore** de `pilot` está CI-validada (quatro gates verdes no HEAD exato); a
**governança** do merge falhou de novo (MGI-2026-10-05-02 em `FINANCIAL_REPO_GOVERNANCE.md`).
A baseline só é declarada limpa quando a PR documental de seguimento for mergeada com os
quatro gates verdes, `merge:gates` verde e `merge-audit` pós-merge verde.

## Capacity headroom (v3 §24)

| Build | JS total / hard limit | Margem | Maior chunk / limite |
| --- | --- | --- | --- |
| Financeiro (Pilot/Produção) | 426.174 / 800.000 | 373.826 (46,7%) | 82.324 / 100.000 (17,7% de margem) |
| Demo independente | 799.005 / 800.000 | **995 (0,12%)** | 89.125 / 100.000 (10,9%) |

Demo: **technical capacity risk** (fora do envelope saudável de 10%). Limites inalterados.

## Maturidade resultante

| Dimensão | Estado |
| --- | --- |
| Código/CI | M2 em `BL-V3` (`4a93fa6`, quatro gates success); governança de merge pendente do seguimento (MGI-02) |
| Pilot hospedado | **NO-GO** — nenhuma capability M3/M4; último marker observado `financial-surface-hardening-1` (04/10) |
| Produção | não pronta — nenhuma capability M5 (`ARANDU_ENV=production` e Supabase próprio ausentes; API legada ainda roteada em 05/10) |
| Cliente | M6 = false para todas as capabilities |
| Rulesets | **OWNER_ACTION_REQUIRED** (`protected=false`) |
| P1.4 | NOT_STARTED (fora desta rodada) |

## Blockers externos (inalterados; ordem em `FINANCIAL_RELEASE_EVIDENCE_2026-10-05.md`)

1. Rulesets `pilot`/`main` — importar `.github/rulesets/{pilot,main}.json`; verificar
   `protected=true` (`BRANCH_PROTECTION.md`).
2. Recuperabilidade do Pilot — `PILOT_SOURCE_DATABASE_URL` por canal seguro; backup
   preflight + `pilot:restore:drill` hospedado **antes** de O3 e de qualquer upload.
3. Schema do Pilot — bundle em etapas a partir do marker observado, depois doctor.
4. Doctor, canário e jornada autenticada hospedados no SHA exato; `pilot:release:check` GO.
5. Produção — Supabase PROD dedicado, `ARANDU_ENV=production`, migrations próprias,
   restore, security/admin readiness.
6. Jurídico, contas, operador, e-mail, domínio e comercial (`FINANCIAL_PILOT_GO_LIVE.md`).

## Próxima ação correta (Guideline v3 §29, Stage 0)

Merge desta PR com gates limpos → owner aplica rulesets → Stage 0 hosted closure do Pilot
(restore drill, schema, doctor/canário/jornada, release gate). P1.4 só depois de Stage 0.
