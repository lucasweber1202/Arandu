# Aposentadoria da vertical de arte

O Arandu começou como marketplace de arte brasileira (catálogo de obras,
artistas, coleções, curadoria, reservas, propostas, pedidos, certificados). A
vertical foi aposentada quando o produto passou a ser o **Arandu Financial
Procurement & Vendor Management OS**.

**Regra para pessoas e agentes:** a vertical de arte está aposentada. Não
reintroduza código, páginas, assets, dados, scripts, testes, rotas, variáveis
ou documentos de arte a partir do histórico do Git, a menos que uma tarefa
explícita de migração ou recuperação autorize. `npm run check:legacy-art` falha
se algo voltar ao tree; `check:financial-surface` (com `--dist`) falha se algo
voltar ao artefato publicado.

## Onde está a história

O Git preserva tudo; nada foi reescrito.

| Marco | Commit |
| --- | --- |
| Último estado só de arte antes do primeiro schema financeiro | `76c50bf` (merge da #62, 2026-09-15) |
| Primeiro schema financeiro (`fin_*`) | `644fa2b` (2026-09-23) |
| Último `pilot` com o runtime de arte inteiro no tree | `cfd51ea` (merge da #112, 2026-10-03) |
| Remoção do runtime, assets, scripts, testes e documentos de arte | PR "Legacy art runtime & repository cleanup" para `pilot` |

Para consultar um arquivo antigo: `git show cfd51ea:<caminho>` ou
`git log --all -- <caminho>`.

## Princípio

Preservar a história, limpar o presente. Migrations históricas são imutáveis e
continuam na cadeia canônica (`docs/supabase-migrations.json`), inclusive as que
criaram tabelas de arte; objetos de banco são aposentados por migration nova,
nunca editando o passado. Dado não é apagado sem classificação, política,
backup/export quando aplicável e verificação de referências.

## Matriz de aposentadoria

Categorias: `LEGACY_DEAD_CODE` (removido do tree), `LEGACY_DOC_ONLY` (removido;
fica no Git), `LEGACY_TEST` (removido ou trocado por teste de ausência),
`LEGACY_DEPENDENCY` (removida), `LEGACY_HISTORICAL_MIGRATION` (preservada),
`LEGACY_DATABASE_OBJECT` / `LEGACY_DATA` / `LEGACY_STORAGE` (banco/storage,
tratados por migration de aposentadoria), `LEGACY_RUNTIME_ACTIVE` (ainda no
código, fechado em ambiente real), `SHARED_INFRASTRUCTURE` (nasceu na arte,
usado pelo financeiro: mantido), `UNKNOWN_REQUIRES_INVESTIGATION`.

### Runtime e repositório

| Item | Categoria | Destino |
| --- | --- | --- |
| ~150 páginas HTML de arte na raiz (catálogo, obra, artistas, coleções, certificados, curadoria, reservas, propostas, narrativas, painéis e editores administrativos, `admin-login`, `demo.html`) | `LEGACY_DEAD_CODE` | removidas; nunca estavam no build (lista explícita no `vite.config.js`); as administrativas eram servidas por `api/internal-page.js` em previews |
| `js/` (103), `css/` (19), `assets/` (fotos, placeholders, logos de arte), `data/` (catálogo, artistas, certificados, coleções, política comercial, CRM, rotas), `content/`, `types/`, `templates/`, `planning/` | `LEGACY_DEAD_CODE` | removidos |
| `src/*.ts|css` e `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `tailwind.config.ts`, `lib/recommend.ts` (stack Next/TS antiga) | `LEGACY_DEAD_CODE` | removidos; `src/vercel-speed-insights.js` fica (usado pelo build) |
| `supabase/` (schemas/seed manuais antigos, fora do manifesto) | `LEGACY_DEAD_CODE` | removido |
| `sitemap.xml`, `sitemap-interno.xml`, `robots.txt` da raiz | `LEGACY_DEAD_CODE` | removidos; o build gera os do produto financeiro |
| `api/internal-page.js`, `admin-auth.js`, `readiness.js`, `collections.js`, `commercial.js`, `mvp-dashboard.js`, `upload.js`, `orders.js`, `account-orders.js` | `LEGACY_DEAD_CODE` | removidas (9 funções serverless); `check-backend` e `test-legacy-surface` falham se voltarem |
| `lib/internal-pages.mjs`, `owner-console.mjs`, `owner-docs.mjs`, `public-shell.mjs` | `LEGACY_DEAD_CODE` | removidos |
| Gatilho manual (admin de arte) do despacho de e-mail | `LEGACY_DEAD_CODE` | removido; `api/email-dispatch.js` é só cron |
| Rotas de arte dentro de `api/[...path].js` (forms, reservations, proposals, certificates, catalog, artists, events, pilot, privacy, admin, operational, media, selections, account, portal, dashboard) e os módulos que elas importam (`lib/api/domains/{accounts,admin-operations,dashboard,intake,pilot,privacy,public-content,selections}.mjs`, `lib/{admin-auth,admin-rbac,api-dtos,commercial-policy,operational-status,profile-access}.mjs`) | `LEGACY_RUNTIME_ACTIVE` | **ainda no código**, respondem 404 (`legacy_surface_closed`) em piloto, produção, demo e qualquer deploy de produção da Vercel. Remoção bloqueada nesta rodada (ver Blockers) |
| Variáveis `ARANDU_WHATSAPP_NUMBER`, `ARANDU_COMMERCIAL_*`, `ARANDU_*_POLICY_REFERENCE`, `ARANDU_PILOT_*`, `ARANDU_BRAND_READY`, `ARANDU_CONTACT_EMAIL`, `ARANDU_PLATFORM_FEE_RATE`, `ARANDU_RESERVATION_HOURS`, `ARANDU_CONSENT_VERSION` | `LEGACY_RUNTIME_ACTIVE` | continuam documentadas enquanto os módulos acima existirem; `ARANDU_AUTH_TIMEOUT_MS`, `ARANDU_STORAGE_BUCKET` e `PUBLIC_ANALYTICS_ID` (sem uso) saíram do `.env.example` |
| `typescript` (dependência) | `LEGACY_DEPENDENCY` | removida (só servia à stack Next/TS) |
| ~35 scripts de verificação de arte (`check-static`, catálogo, coleções, comercial, piloto fechado, UX/SEO de páginas de arte, navegação e CSS do site antigo, seed, intake de CSV…) e scripts npm correspondentes (`check:catalog*`, `check:commercial*`, `check:pilot*`, `check:ux`, `seed:supabase*`, `test:e2e:commerce`…) | `LEGACY_TEST` | removidos; frentes de arte saíram do `release:status` |
| Specs E2E `buyer-journeys`, `commerce-journeys`, `public-journeys`, `contrast`, `performance-budgets` (páginas de arte, fora do CI) e `playwright.commerce.config.js` | `LEGACY_TEST` | removidos; substituídos pelos gates de ausência |
| `check-backend`, `check-admin-surface`, `check-auth-security`, `check-http-security`, `check-p0-security`, `check-platform-hardening`, `check-transaction-migration`, `check-live-production` | `SHARED_INFRASTRUCTURE` | reescritos para a superfície financeira (sem exigir que o backend de arte exista) |
| ~115 documentos de arte em `docs/` e `PRODUCTION_README.md`, `ARANDU_MASTER_GUIDELINES_v1.0.docx`, `docs/pre_lancamento.txt`, `docs/visual-evidence/` | `LEGACY_DOC_ONLY` | removidos; este documento é a ponte para o Git |
| Login/cadastro, sessão Supabase (`lib/api/domains/auth.mjs`), rate limit distribuído (`consume_rate_limit`/`api_rate_limits`), núcleo HTTP/CSP/mesma origem, outbox transacional (`transactional_email_outbox`), observabilidade, build multipágina, tooling de migrations/staging/backup, `set_updated_at` | `SHARED_INFRASTRUCTURE` | mantidos |
| `artifacts/demo-*` (capturas da demo financeira) e `docs/evidence/` | `ACTIVE_REQUIRED` | mantidos (não são arte) |

### Banco e storage

| Item | Categoria | Destino |
| --- | --- | --- |
| Migrations `supabase-schema`, `production`, `sprint1…sprint6-12`, `arandu-mvp-*`, `commercial`, `transactions-rbac-audit`, `orders*`, `retention-controls`, `operational-*`, `profile-access`, `beta-conversion-events` | `LEGACY_HISTORICAL_MIGRATION` | preservadas e imutáveis; continuam no clean install |
| Tabelas de arte (`artists`, `artworks`, `certificates`, `curated_collections`, `collection_artworks`, `reservations`, `proposals`, `proposal_items`, `orders`, `order_status_history`, `commercial_*`, `consignments`, `logistics_records`, `leads`, `company_briefs`, `artist_*`, `saved_selections`, `crm_notes`, `tasks`, `media_assets`, `newsletter_subscriptions`, `catalog_*`, `pilot_*`, `artwork_events`, `operational_status_history`, `privacy_requests`, `conversion_events`, `idempotency_keys`, `audit_logs`, `data_retention_policies`, `data_legal_holds`, `profiles`), 18 views `v_*`, funções/gatilhos de arte (inclui `handle_new_user_profile` em `auth.users`) | `LEGACY_DATABASE_OBJECT` / `LEGACY_DATA` | aposentadoria por migration nova e testada (clean install, upgrade com dados fictícios, reaplicação, forward-fix); aplicação hospedada bloqueada por backup/restore/export (ver abaixo) |
| `api_rate_limits` + `consume_rate_limit`, `transactional_email_outbox` + funções de claim/complete/fail, `set_updated_at` | `SHARED_INFRASTRUCTURE` | mantidos |
| Bucket de mídia de arte no Storage hospedado (nome configurável, não versionado; o bucket `fin-documents` é financeiro) | `UNKNOWN_REQUIRES_INVESTIGATION` | inventariar no projeto hospedado: contagem, políticas, referências; export se exigido; remoção em lotes só com backup e decisão do owner |

## 404, 410 e redirecionamentos

Páginas de arte removidas respondem 404 (arquivo estático inexistente). Não há
410: a hospedagem estática não emite 410 sem função, as páginas nunca estiveram
no sitemap/robots do produto financeiro e já não eram publicadas desde a
aposentadoria inicial. Os dois aliases mais conhecidos (`/obras.html`,
`/acervo.html`) seguem com 301 para `/` em `vercel.json`. As rotas de API de arte
que ainda existem no roteador respondem 404 `legacy_surface_closed` em ambiente
real.

## Blockers

```
BLOCKER: remoção das rotas de arte do roteador api/[...path].js e dos módulos que só ele importa
WHY: a leitura completa do arquivo foi negada pela política de permissões da sessão de automação; reescrever o roteador sem lê-lo arriscaria o login e o domínio financeiro
WHO MUST ACT: owner do repositório (liberar a leitura/edição do arquivo para o agente, ou fazer a remoção)
EXACT ACTION: remover de api/[...path].js os handlers de forms, reservations, proposals, certificates, certificate-document, catalog, artists, public-config, events, conversion-events, pilot/*, privacy/*, catalog-review, admin, admin-update, operational, media, selections, account, portal/*, artist-accounts, dashboard, admin/quality; depois apagar os módulos listados como LEGACY_RUNTIME_ACTIVE, as variáveis de ambiente correspondentes e os testes que só cobrem essas rotas (test-api-domains, test-platform-api, test-transaction-api, test-operational-status, test-profile-access, test-api-dtos, test-admin-rbac)
WHAT IS READY: as rotas já respondem 404 em piloto/produção/demo (test-legacy-surface); check-backend, check-admin-surface e check-legacy-art já descrevem o estado-alvo
HOW TO VERIFY: npm run check:all, npm run check:legacy-art, npm run test:e2e (login, cadastro, portal) e test-legacy-surface com as rotas removidas devolvendo 404 de rota inexistente
```
