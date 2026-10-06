# Consolidação `main` canônica — evidência de 06/10/2026

**Escopo:** tornar `main` a única linha de produto; recuperar a #135; unificar
Demo/Staging/Oficial por runtime; levar o pós-contrato à demo canônica;
corrigir code splitting/budgets; diagnosticar o CI. **Nada foi executado em
ambiente hospedado** (o executor não tem credencial de Supabase, Vercel nem
administração do GitHub). Tudo abaixo é **local** e não atesta piloto nem
produção. Nenhuma maturidade foi elevada.

## Estado inicial (git, observado)

| Ref | SHA | Observação |
| --- | --- | --- |
| `main` | `ed5da41c5244040d9e3b1ddb501053280d692622` | 0 commits à frente de `pilot` |
| `pilot` | `2241d3b94568acfdb99c8b7b31b53810e356846e` | 105 à frente de `main`; contém #131–#134; árvore idêntica a `621d97c` |
| `codex/financial-spend` (#135 HEAD) | `e7449477f32b1153125cfd03c2445df99556b0fe` | 1 commit sobre `621d97c`; **ausente** de `pilot` |
| merge da #135 | `99c6f85ed81bb5b7db07b12638e2591f1e59f0ad` | em `codex/provider-performance`, não em `pilot`/`main` |

DAG reconciliado: `main (ed5da41) ⊂ pilot (2241d3b = 621d97c + merge #134)`;
`e7449477` = `621d97c` + Financial Spend. Consolidação = `pilot` + merge de
`e7449477` (mesmo SHA preservado, sem conflito, sem migration duplicada).
Branches recentes (#102–#107, contracts v2, policy engine, graph) já estavam
integradas por conteúdo; inventário em `REPOSITORY_HYGIENE.md`.

## Testes executados (local, árvore consolidada)

| Comando / suíte | Resultado |
| --- | --- |
| `npm ci --include=optional` | OK |
| `npm run audit:ci` | falhava em `pilot` por advisory novo (`source-map-js` GHSA-68fv-2mgg-jv7q, high); lockfile atualizado para 1.2.2 → **0 vulnerabilities** |
| `npm run sbom:ci` | OK (21 componentes) |
| `npm run check:all` | **EXIT 0** (inclui `test-runtime-mode`, `test-build-size`, finance, migrations, security, governance, staging) |
| `npm run test:database` (PostgreSQL 16.15 local) | **EXIT 0**: instalação limpa, upgrade, reaplicação, rollback/reapply da OD-01, RLS, cross-tenant/entity, SoD, export/governança, fresh |
| Antes da correção do teste de covenants | `pilot` puro falhava em `financial-covenants.sql:129` (dependente do dia do mês) — reproduzido e corrigido |
| OD-01 regressão | falha no schema antigo (`fin_opportunities_discriminator_check`), passa após a migration; rollback → reapply → reapply OK |
| `npm run build`, `npm run build:demo`, `check:build-size`, `check:dist-assets` | OK (números em `FINANCIAL_BUNDLE_HEADROOM.md`) |
| Passos do job `deploy-boundaries` reproduzidos localmente (7) | todos com o resultado esperado (casos fail-closed falham com a mensagem esperada) |
| `test:e2e:finance` — Chromium desktop + Chromium mobile (Pixel 7) | **205 passed, 7 skipped (por desenho), 0 failed** |
| Suíte de apresentação (sandbox) — Chromium desktop + mobile | **123 passed, 19 skipped, 0 failed** |
| Demo canônica local (`ARANDU_ENV=demo`, Supabase local em Docker: Postgres, GoTrue, PostgREST, Storage) — `demo:setup` + 3× `demo:local:reset` | **29/29 checagens** nas duas últimas execuções (lifecycle completo pela API real) |
| `test:e2e:demo` (canônica, inclui a nova jornada pós-contrato) — desktop | **5/5 passed** |
| `test:e2e:demo` — mobile (Pixel 7) | **5/5 passed** (uma execução anterior, logo após o reset, recebeu 429 do rate limit real da API — esperado; repetida depois da janela) |
| `npm run test:e2e:list` | 510 testes em 18 arquivos (listagem; não é execução) |

**Navegadores:** só Chromium está instalado neste executor (rev. 1194, usado
com o Playwright 1.63 por alias de revisão; o ambiente proíbe
`playwright install`). **Firefox, WebKit e Mobile Safari não foram
executados** — ficam para o CI hospedado. Não há claim de E2E cross-browser.

## CI hospedado

Sem runner desde o run #771 (`runner_id: 0`, zero passos, sem log) —
quota/billing de Actions (`GITHUB_ACTIONS_MINUTES.md`). Os quatro gates não
foram enfraquecidos. A PR de consolidação precisa dos quatro verdes no HEAD
exato depois que o owner restabelecer o Actions.

## Hospedado (não alterado nesta rodada)

- Supabase PILOT: último marcador conhecido `financial-surface-hardening-1`; migrations pendentes até `financial-opportunity-discriminator-1`. Nada aplicado.
- Vercel: `arandu-pilot` ainda com Production Branch `pilot` (precisa virar `main`); `arandu-demo` ainda no sandbox; `arandu` sem release aprovada. Nada alterado.
