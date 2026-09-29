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

## Adendo — reconciliação pós-#82 (mesmo dia)

Base: `pilot` `be37c7e` (merge da #82), `main` `fd796e6`; `main...pilot` = `0 8`.

**Achado:** com `ARANDU_ENV=pilot` (ou `production`) válido, `vercel-build`
passava o `finance:env:check` e reprovava no `check:all`: os testes de contrato
herdavam o ambiente de deploy e viam a API legada fechada
(`test-operational-status.mjs`). Todo deploy real de `arandu-pilot` e `arandu`
teria falhado. Correção: `scripts/run-hermetic.mjs` roda o `check:all` do deploy
sem `ARANDU_*` (exceto `ARANDU_SITE_URL`), `SUPABASE_*`, `VERCEL*`, `RESEND_*`,
`PILOT_*` e `CRON_SECRET`, como no CI. Regressão em
`test-deploy-release-separation.mjs`.

Matriz do `vercel-build` (chaves sintéticas, nenhum segredo real):

| Cenário | Resultado |
| --- | --- |
| demo + `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `CRON_SECRET` | FAIL (esperado) |
| demo + `ARANDU_ENV=pilot` / `production` | FAIL (esperado) |
| `VERCEL_ENV=production` sem `ARANDU_ENV` | FAIL (esperado) |
| produção no banco do piloto / no legado | FAIL (esperado) |
| piloto válido (branch `pilot`, banco do piloto, service role, cron) | PASS (antes: FAIL no `check:all`) |
| produção válida (branch `main`, banco próprio) | PASS (antes: FAIL no `check:all`) |

Ensaio local com Supabase real em contêineres (Docker):
`pilot:local:up` (35 migrations, bucket privado 10 MB/5 tipos),
`pilot:local:journey` 24 passos / 60 ataques / 0 falhas,
`pilot:local:doctor` GO / NO-GO / UNSAFE / UNSAFE nos quatro cenários,
`pilot:canary` 144 verificações / 0 vazamentos,
`pilot:restore:drill` passed (backup 566 ms, restore 1765 ms).
`test:database` (clean install, upgrade, reaplicação, rollback) verde.

## Adendo — ambientes publicados medidos de fora (29/09, tarde)

Base: `main` `075ee28` e `pilot` `bd3399e`, mesma árvore `8ddde00`. Sessão sem
token Vercel, sem chave Supabase e sem string de conexão: só requisições HTTP
públicas, sem escrita. Nenhum segredo foi lido ou registrado.

| Ambiente | Verificação | Resultado |
| --- | --- | --- |
| `arandu-demo.vercel.app` | `/`, `/demo/index.html` sem login nem Vercel Authentication | 200 |
| | `/api/finance/products`, `/api/finance/me`, `/api/auth/login`, `/api/jobs/renewals` | 404 `legacy_surface_closed` |
| | Bundle (HTML + JS de `/` e `/demo/`): host `*.supabase.co`, `service_role`, JWT | nenhum |
| `arandu-pilot.vercel.app` | Checks "app publicada" do doctor: health, API financeira + `X-Request-ID`, cron, rota legada | 5/5 OK |
| | Login com conta inexistente (`@example.invalid`) | 401 `invalid_credentials` (Supabase e rate limit respondendo) |
| | `/api/email-dispatch` | 503 `email_dispatch_disabled` (e-mail desligado, como esperado) |
| | 17 páginas da era de arte (`/artistas.html`, `/obra.html`, `/admin.html`, …) e `/docs/*.md` | 404 |
| | Cabeçalhos HSTS, CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | presentes |
| | `/.well-known/security.txt` | 404 — falha fechada sem `ARANDU_SECURITY_CONTACT`/`ARANDU_SECURITY_EXPIRES` (opcional) |
| `arandu-bice.vercel.app` (produção) | `/api/forms` | 405: API legada ainda roteada (E2b) |
| | Login | 503 `rate_limit_unavailable`: banco da produção sem as migrations (E3b) |

Não verificável de fora e portanto **não afirmado**: qual projeto Supabase o
piloto usa, o commit publicado, o escopo das variáveis, a migration 35 e o
bucket. Isso é o doctor completo (`ARANDU_ENV=pilot npm run
finance:pilot:doctor`, com as variáveis do projeto) e o console `finance_ops`
(`/api/finance/ops/overview` devolve `commit` e as flags de configuração).

Matriz local refeita no mesmo SHA: `npm ci --include=optional`, `audit:ci`,
`sbom:ci`, `check:all`, `build`, `check:dist-assets`, `check:build-size`,
`check:financial-surface`, `check:financial-navigation`, `test:e2e:list` e
`git diff --check` verdes. `check:seo:dist` reprova sem URL de deploy (exige
`ARANDU_SITE_URL` ou `VERCEL_URL`) e passa com build e check sob
`VERCEL_URL=arandu-pilot.vercel.app`: 6 rotas indexáveis, 0 erros.

GitHub Actions: as runs de `main` `075ee28` terminam em 3 s nos quatro jobs
(`validate`, `database`, `deploy-boundaries`, `presentation`), ainda sem
runner — quota até 01/10.
