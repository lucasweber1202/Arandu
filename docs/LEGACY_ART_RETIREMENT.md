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
| Tabelas de arte (`artists`, `artworks`, `certificates`, `curated_collections`, `collection_artworks`, `reservations`, `proposals`, `proposal_items`, `orders`, `order_status_history`, `commercial_*`, `consignments`, `logistics_records`, `leads`, `company_briefs`, `artist_*`, `saved_selections`, `crm_notes`, `tasks`, `media_assets`, `newsletter_subscriptions`, `catalog_*`, `pilot_*`, `artwork_events`, `operational_status_history`, `privacy_requests`, `conversion_events`, `idempotency_keys`, `audit_logs`, `data_retention_policies`, `data_legal_holds`, `profiles`), 18 views `v_*`, 29 funções/gatilhos de arte (inclui `handle_new_user_profile` em `auth.users` e `set_updated_at`) | `LEGACY_DATABASE_OBJECT` / `LEGACY_DATA` | removidos por `docs/supabase-financial-legacy-art-decommission.sql` (marker `financial-legacy-art-decommission-1`), sem cascade; testado em clean install de uma passada, upgrade com dados fictícios, reaplicação e canário. **Aplicação hospedada bloqueada** (ver procedimento) |
| `fin_member_default_name` (financeiro) lia `profiles.full_name` | `SHARED_INFRASTRUCTURE` | passou a ler `auth.users.raw_user_meta_data.full_name` na mesma migration; comportamento preservado |
| `api_rate_limits` + `consume_rate_limit`, `transactional_email_outbox` + funções de claim/complete/fail | `SHARED_INFRASTRUCTURE` | mantidos |
| Bucket de mídia de arte no Storage hospedado (nome configurável, não versionado; o bucket `fin-documents` é financeiro) | `UNKNOWN_REQUIRES_INVESTIGATION` | inventariar no projeto hospedado: contagem, políticas, referências; export se exigido; remoção em lotes só com backup e decisão do owner |

## Aposentadoria do banco: o que a migration faz

1. Recusa rodar fora de um schema com Data Governance (`financial-data-governance-1`).
2. Conta as linhas de todas as tabelas de arte (exceto as semeadas pelas
   próprias migrations históricas: a linha `catalog_releases/production` e as 4
   coleções editoriais de exemplo). Havendo qualquer linha, **recusa** se a
   sessão não trouxer `arandu.legacy_art_decommission_ack =
   'export-verified:<referência>'`. Valores como `sim`/`ok` são recusados.
3. Grava em `fin_settings.legacy_art_decommission` só contagens por tabela, a
   data e a referência do reconhecimento — nunca o dado.
4. Troca a leitura de `profiles` do produto financeiro pelos metadados da conta.
5. Remove gatilho em `auth.users`, views, tabelas e funções de arte, sem cascade.

`public.profiles` também guardava nome/telefone de contas do produto financeiro
(o gatilho de cadastro criava uma linha para toda conta). A remoção é
minimização (o dado continua nos metadados da conta no Supabase Auth), mas é
dado pessoal: por isso entra na contagem e exige o reconhecimento.

### Procedimento hospedado (piloto; produção só depois)

```
BLOCKER: aplicação hospedada da aposentadoria do banco de arte
WHY: é destrutiva; exige ambiente confirmado, backup e restore verificados, export dos dados de arte que o owner decidir preservar e decisão do owner sobre dados pessoais em public.profiles
WHO MUST ACT: owner do repositório / responsável pelo projeto Supabase do piloto
EXACT ACTION:
  1. confirmar o projeto (ARANDU_ENV=pilot npm run finance:pilot:doctor) e o marker atual (deve ser financial-data-governance-1; antes disso, aplicar as migrations pendentes pelo bundle);
  2. npm run pilot:backup:preflight e backup lógico; npm run pilot:restore:drill num destino descartável, conferindo as contagens;
  3. exportar (fora do repositório, em local controlado) as tabelas de arte com linhas, se a decisão for preservar; registrar a referência;
  4. dry-run: rodar a migration num restore descartável com o reconhecimento e conferir tests/database/legacy-art-decommission.sql;
  5. aplicar com: PGOPTIONS="-c arandu.legacy_art_decommission_ack=export-verified:<referência>" psql "$PILOT_DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/supabase-financial-legacy-art-decommission.sql;
  6. doctor, canário (npm run pilot:canary), ops/sql/post-migration-probes.sql e jornada autenticada (login, cadastro de membro, RFQ).
WHAT IS READY: migration, teste de estado final, recusa sem reconhecimento, bundle por marker (npm run migrations:bundle -- --after-schema=financial-data-governance-1), probes e canário atualizados
HOW TO VERIFY: fin_settings.schema_version = financial-legacy-art-decommission-1; fin_settings.legacy_art_decommission com contagens e referência; canário e doctor GO
```

```
BLOCKER: inventário e remoção do bucket de mídia de arte no Storage hospedado
WHY: o bucket foi criado fora das migrations versionadas (nome configurável, padrão histórico arandu-media); o repositório não sabe se ele existe, quantos objetos tem nem se há referência externa
WHO MUST ACT: owner / responsável pelo projeto Supabase de cada ambiente
EXACT ACTION: no painel ou via API de Storage com service role: listar buckets; para o bucket de arte, contar objetos, conferir políticas e se é público; exportar se decidido; apagar objetos em lotes; conferir zero objetos; remover políticas; remover o bucket. Nunca tocar fin-documents
WHAT IS READY: nenhum código do produto financeiro referencia o bucket de arte (api/upload.js foi removida); fin-documents segue privado e testado
HOW TO VERIFY: lista de buckets do projeto sem o bucket de arte; doctor GO; upload/download de documento financeiro funcionando
```

Rollback: não existe rollback de schema que restaure dados
(`docs/rollback/supabase-financial-legacy-art-decommission.rollback.sql` só
recusa). Código: reverter o merge basta (o runtime financeiro não depende dos
objetos removidos). Dados: restore do backup verificado em banco descartável e
cópia seletiva por forward-fix, com decisão do owner.

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
