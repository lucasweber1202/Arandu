# Evidência de release — 29/09/2026 (fechamento operacional)

Base: `main` `fd796e6` (merge da #81), `pilot` `67b3404` (merge da #80).
Ambiente de execução: contêiner sem credencial Vercel nem Supabase (só GitHub).
Nenhum segredo, e-mail real ou PII foi usado ou registrado.

## Branches

| Medida | Resultado |
| --- | --- |
| `git merge-base origin/main origin/pilot` | `67b3404` |
| `git rev-list --left-right --count origin/main...origin/pilot` | `1 0` (só o commit de merge da #81) |
| `git diff origin/main origin/pilot` | vazio: árvores idênticas |

A #81 promoveu `pilot → main` antes do piloto existir na Vercel e com o CI
bloqueado. Conteúdo promovido: topologia e documentação, sem migration nem
dado. Nenhum deployment passou a apontar para o piloto (o projeto `arandu` não
tem `ARANDU_ENV`). Nada a reverter; regra registrada em
`FINANCIAL_DEPLOYMENT_WORKFLOW.md`.

## Ambientes observados de fora (curl, somente leitura)

| URL | Resultado |
| --- | --- |
| `https://arandu-demo.vercel.app/` | 404 `DEPLOYMENT_NOT_FOUND` — projeto não existe |
| `https://arandu-pilot.vercel.app/` | 404 `DEPLOYMENT_NOT_FOUND` — projeto não existe |
| `https://arandu.vercel.app/` | projeto Vite de terceiros, não é o Arandu |
| `https://arandu-bice.vercel.app/` (produção atual) | `/` 200, `/api/health` 200, `/api/finance/me` 401, `/api/auth/session` 200, `/demo/index.html` 404 |
| idem, API legada | `/api/forms` 405, `/api/catalog` 503 `catalog_migration_pending`, `/api/pilot/metrics` 503 `rate_limit_unavailable`: a API de arte estava roteada, porque falta `ARANDU_ENV` |

## Achados e correções desta rodada

1. **API legada aberta na produção** (acima). Corrigido: `legacyArtSurfaceClosed`
   fecha em qualquer `VERCEL_ENV=production`; `vercel-build` recusa deploy de
   produção sem ambiente declarado. Regressões em `test-legacy-surface.mjs` e
   `test-deploy-release-separation.mjs`.
2. **Setup documentado da demo não funcionaria.** `vercel.json` fixa
   `buildCommand`, que sobrepõe o Build Command do painel; `arandu-demo` teria
   publicado o site normal. Corrigido: `ARANDU_DEPLOYMENT_KIND=demo` seleciona
   `deploy:check:demo`; `/` do build demo é a entrada da demonstração.
3. **Demo sem backend ainda expunha a API** (finance, auth, crons, e-mail).
   Corrigido: na demo toda a API responde 404, exceto health e security.txt.
4. **Manifestos PWA descreviam arte.** Corrigido; o gate de superfície passou a
   ler manifestos, JSON, texto, XML e SVG publicados (falhava antes da correção).
5. **Landing da demo desalinhada** em 1440 px (`main#main` sobrepunha a largura
   de `.landing`) e marca espremida no topo móvel. Corrigido.
6. **Instrução contraditória**: o checklist sugeria apontar a produção para o
   banco do piloto. Removida.

## Validação local (Node 24.21.0, Chromium 141 do contêiner, PostgreSQL 16)

| Comando | Resultado |
| --- | --- |
| `npm ci --include=optional` | ok |
| `npm run audit:ci` | exit 0 |
| `npm run sbom:ci` | exit 0 |
| `npm run check:all` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:dist-assets` / `check:build-size` | exit 0 / exit 0 |
| `ARANDU_SITE_URL=https://arandu.example.com npm run check:seo:dist` | exit 0 (sem a variável o check se recusa, como no CI) |
| `npm run check:financial-surface` / `check:financial-navigation` | exit 0 / exit 0 |
| `npm run test:e2e:list` | 100 testes listados (5 projetos) |
| `test:e2e` (finance-procurement), Chromium desktop + mobile-chrome | 40 passed |
| `test:e2e:presentation`, Chromium desktop + mobile-chrome | 27 passed, 1 skipped (teste só-móvel no projeto desktop) |
| `npm run test:database` | exit 0 (instalação limpa, upgrade, rollback, RLS, 43 ataques) |
| `ARANDU_DEPLOYMENT_KIND=demo npm run deploy:check:demo` | exit 0 |
| `npm run finance:env:check` (local) | 0 erros |
| `git diff --check` | limpo |

**Não executado:** Firefox, WebKit e Safari móvel (motores não instalados no
contêiner) — cobertos pelo CI; CI do GitHub (quota esgotada até 01/10/2026);
`finance:pilot:doctor`, `pilot:canary` e `pilot:restore:drill` contra o piloto
real (sem credencial).

## QA da demo (build `ARANDU_DEPLOYMENT_KIND=demo`)

Varredura em 1440, 1024, 768, 430, 390 e 375 px, entrando pela raiz com cada
persona (comprador, aprovador, provedor, admin) e abrindo painel, solicitações,
nova solicitação, propostas, aprovações, contratos, tarefas, avisos,
provedores, limites, configurações, console, portal do provedor e cada aba do
detalhe da RFQ, com recarga: 0 erros de console, 0 respostas ≥ 400, 0
requisições fora da origem ou para `/api/`, 0 rolagem horizontal, `h1` único.
Bundle da demo sem JWT, `service_role`, host Supabase nem analytics.
Screenshots 1440×900 e 390×844 (home, painel, RFQ, comparação, aprovações,
contratos, ciclo de vida, portal do provedor) guardadas fora do Git.
