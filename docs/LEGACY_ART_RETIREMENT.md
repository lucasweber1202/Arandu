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
| Remoção do runtime, assets, scripts, testes e documentos de arte | merge da #114 (`0738693`) |
| Aposentadoria dos objetos de banco de arte (migration nova) | merge da #115 (`051f10f`) |
| Remoção das rotas de arte do roteador, módulos, variáveis e testes restantes | PR "final legacy runtime cleanup" para `pilot` |

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
tratados por migration de aposentadoria), `SHARED_INFRASTRUCTURE` (nasceu na arte,
usado pelo financeiro: mantido), `UNKNOWN_REQUIRES_INVESTIGATION`.

### Runtime e repositório

| Item | Categoria | Destino |
| --- | --- | --- |
| ~150 páginas HTML de arte na raiz (catálogo, obra, artistas, coleções, certificados, curadoria, reservas, propostas, narrativas, painéis e editores administrativos, `admin-login`, `demo.html`) | `LEGACY_DEAD_CODE` | removidas; nunca estavam no build (lista explícita no `vite.config.js`); as administrativas eram servidas por `api/internal-page.js` em previews |
| `js/` (103), `css/` (19), `assets/` (fotos, placeholders, logos de arte), `data/` (catálogo, artistas, certificados, coleções, política comercial, CRM, rotas), `content/`, `types/`, `templates/`, `planning/` | `LEGACY_DEAD_CODE` | removidos |
| `src/*.ts|css` e `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `tailwind.config.ts`, `lib/recommend.ts` (stack Next/TS antiga) | `LEGACY_DEAD_CODE` | removidos; `src/vercel-speed-insights.js` fica (usado pelo build) |
| `supabase/` (schemas/seed manuais antigos, fora do manifesto) | `LEGACY_DEAD_CODE` | removido |
| `sitemap.xml`, `sitemap-interno.xml`, `robots.txt` da raiz | `LEGACY_DEAD_CODE` | removidos; o build gera os do produto financeiro |
| `api/internal-page.js`, `admin-auth.js`, `readiness.js`, `collections.js`, `commercial.js`, `mvp-dashboard.js`, `upload.js`, `orders.js`, `account-orders.js` | `LEGACY_DEAD_CODE` | removidas (9 funções serverless); `check-backend` e `test-deployment-surface` falham se voltarem |
| `lib/internal-pages.mjs`, `owner-console.mjs`, `owner-docs.mjs`, `public-shell.mjs` | `LEGACY_DEAD_CODE` | removidos |
| Gatilho manual (admin de arte) do despacho de e-mail | `LEGACY_DEAD_CODE` | removido; `api/email-dispatch.js` é só cron |
| Rotas de arte dentro de `api/[...path].js` (forms, reservations, proposals, certificates, certificate-document, catalog, artists, public-config, events, conversion-events, pilot/*, privacy/*, catalog-review, admin, admin-update, operational, media, selections, account, portal/*, artist-accounts, dashboard, admin/quality) | `LEGACY_DEAD_CODE` | removidas; o roteador só atende `finance/*`, `auth/*`, `v1/*`, os crons e o security.txt; qualquer outra rota é 404 `route_not_found` em todos os ambientes. `check-legacy-art` falha se surgir `route === '…'` fora dessa lista |
| `lib/api/domains/{accounts,admin-operations,dashboard,intake,pilot,privacy,public-content,selections}.mjs`, `lib/{admin-rbac,api-dtos,commercial-policy,operational-status,profile-access,rate-limit}.mjs` | `LEGACY_DEAD_CODE` | removidos (só as rotas de arte os importavam) |
| `lib/admin-auth.mjs` | `SHARED_INFRASTRUCTURE` → `LEGACY_DEAD_CODE` | só `authSessionCookie` era usado pelo console `finance_ops`: foi para `lib/finance/ops-access.mjs`; o resto (papéis admin/operator/curator) saiu |
| `security.txt` e `publicSiteUrl` (em `public-content.mjs`) | `SHARED_INFRASTRUCTURE` | movidos para `lib/api/domains/security-contact.mjs` |
| `lib/legacy-surface.mjs` | `SHARED_INFRASTRUCTURE` | virou `lib/deployment-surface.mjs` (allowlist de rotas por deployment e fechamento da API no projeto demonstrativo), código `route_not_found` |
| Modelos de e-mail de reserva, pedido, pagamento, envio, proposta curatorial, contato e alerta admin em `lib/email.mjs` | `LEGACY_DEAD_CODE` | removidos; só os modelos financeiros renderizam |
| Testes `test-api-domains`, `test-admin-url-security`, `test-admin-rbac`, `test-api-dtos`, `test-operational-status`, `test-profile-access`, `test-platform-api`, `test-transaction-api`, `test-helpers/commercial-policy-env` | `LEGACY_TEST` | removidos; os cenários de auth que viviam neles (recuperação de senha, rate limit distribuído) foram para `test-auth-api`, que também prova 404 nas 23 rotas antigas; `test-legacy-art-gate` prova que o gate reprova as regressões |
| Variáveis `ARANDU_WHATSAPP_NUMBER`, `ARANDU_CONTACT_EMAIL`, `ARANDU_BRAND_READY`, `ARANDU_CONSENT_VERSION`, `ARANDU_COMMERCIAL_*`, `ARANDU_*_POLICY_REFERENCE`, `ARANDU_FISCAL_MODEL_REFERENCE`, `ARANDU_PLATFORM_FEE_RATE`, `ARANDU_RESERVATION_HOURS`, `ARANDU_PILOT_{ENABLED,APPROVED,ACCESS_CODE,SECRET}`, `ARANDU_PRIVACY_CONTACT_EMAIL` | `LEGACY_DEAD_CODE` | removidas do `.env.example`, dos validadores (`check-production-env`, `check-domain-config`, `check-finance-env`, `check-platform-release`, `demo-mode`) e dos testes; `check-legacy-art` falha se voltarem. `ARANDU_PILOT_ALLOWLIST_CONFIRMED` é do piloto financeiro e fica. Em projetos Vercel antigos podem continuar definidas: não são lidas por nada (limpeza opcional no painel) |
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
`/acervo.html`) seguem com 301 para `/` em `vercel.json`. As antigas rotas de API
de arte não têm handler: respondem 404 `route_not_found` em qualquer ambiente
(deploys anteriores a esta remoção respondiam `legacy_surface_closed`; o doctor
aceita os dois).

## Estado final (clean-room de 04/10/2026)

Medido num clone limpo de `pilot` @ `63dddd5` (merge da #116), sem artefato do
checkout de trabalho: `npm ci --include=optional`, `audit:ci`, `sbom:ci`,
`check:all`, `build`, `check:dist-assets`, `check:build-size`, `check:seo:dist`,
`check:financial-surface`, `check:legacy-art` (com a prova negativa),
`test:e2e:list`, `test:database`, `test:e2e`, `test:e2e:presentation` e
`git diff --check` (evidência e contagens na matriz, seção "Clean-room final").

| Item | Estado |
| --- | --- |
| runtime de arte | nenhum (o roteador só atende `finance/*`, `auth/*`, `v1/*`, crons e security.txt; o resto é 404 `route_not_found`) |
| páginas públicas de arte | nenhuma (gate `--dist` e sitemap) |
| assets de arte | nenhum |
| handlers de API de arte | nenhum (gate falha com `route === '…'` fora da lista) |
| dependências npm de arte | nenhuma |
| variáveis de ambiente de arte | nenhuma no `.env.example`, validadores ou runtime (gate) |
| testes de arte | só ausência e aposentadoria: `test-auth-api` (23 rotas em 404), `test-deployment-surface`, `test-legacy-art-gate`, `check-legacy-art`, `check-admin-surface`, `legacy-art-decommission*.sql` e a fixture fictícia `legacy-art-fixture.sql` (prova da recusa sem export reconhecido). Os testes de comportamento de reserva, pedido, perfil, status operacional e retenção de arte saíram do `test:database` |
| migrations históricas | preservadas e imutáveis na cadeia canônica |
| limpeza do banco hospedado | **bloqueada/pronta**: migration e procedimento prontos; depende de backup + restore verificado, export e decisão do owner (Procedimento hospedado) |
| limpeza do storage hospedado | **bloqueada**: inventário do bucket de mídia de arte depende do owner no projeto hospedado; `fin-documents` não é tocado |

### Ocorrências restantes de termos de arte (classificação)

Busca: `git grep -iP '\b(arte|art|artist|artista|artwork|obra|gallery|galeria|collection|coleção|catalog|catálogo|curadoria|curator|certificate|certificado|reservation|reserva|marketplace|commission|comissão|acervo)s?\b'`.

| Onde | Classe | Motivo |
| --- | --- | --- |
| `docs/supabase-*.sql`, `docs/arandu-mvp-*.sql`, `docs/rollback/*` | migration histórica | imutáveis; a migration de decommission remove os objetos |
| `tests/database/legacy-art-*.sql`, `scripts/test-database.sh` | teste de aposentadoria | prova recusa sem export, estado final sem arte e reaplicação |
| `scripts/check-legacy-art.mjs`, `test-legacy-art-gate.mjs`, `check-admin-surface.mjs`, `check-financial-surface.mjs`, `check-http-security.mjs`, `check-live-production.mjs`, `check-migrations.mjs`, `check-backend.mjs`, `test-auth-api.mjs`, `test-deployment-surface.mjs`, `tests/e2e/*` (`not.toContainText`), `scripts/pilot-local/journey.mjs` (ataques) | teste/gate de ausência | os termos são o que se proíbe |
| `lib/finance/pilot-doctor.mjs` (recusa o projeto Supabase legado, aceita os dois códigos de 404) | guarda operacional | impede apontar piloto/produção para o banco antigo |
| `vercel.json` (`/obras.html`, `/acervo.html` → `/`) | redirecionamento intencional | links antigos não caem em 404 |
| comentários em `api/[...path].js`, `api/email-dispatch.js`, `lib/email.mjs`, `lib/api/domains/auth.mjs` | comentário necessário | explicam a aposentadoria e o metadado fixo do cadastro |
| "catálogo" (de campos, termos, produtos, escopos, conjuntos de export), "reserva" (lock de rascunho do provedor), "obras" (finalidade de financiamento) em `lib/finance/*`, `finance/src/*`, `lib/api/domains/finance*.mjs` | vocabulário financeiro | não é a vertical de arte |
| `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `docs/FINANCIAL_*` (evidências e auditorias datadas), `docs/IMPLEMENTATION_MATRIX.md`, `docs/OPERATIONS_INDEX.md`, `docs/REPOSITORY_HYGIENE.md`, este documento | histórico/aviso | registro da aposentadoria; não descrevem capacidade atual |

## Blockers

Os únicos blockers restantes são hospedados: a aplicação da migration de
decommission e o bucket de mídia de arte (seção "Procedimento hospedado"). O
blocker de leitura do roteador foi resolvido: o arquivo foi lido por inteiro e
as rotas de arte, removidas.
