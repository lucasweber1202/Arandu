# Arandu 10.2 — Demo canônica: auditoria, reconciliação, preflight e readiness

Estado em 16/11/2026, `main` em `dbeb5a3` (merge da #349). Maturidade: este lote
é **M1/M2** (código + validação local). Nada aqui é M3: nenhuma operação
hospedada com escrita foi feita.

## 1. Auditoria (somente leitura)

| Componente | Esperado | Observado (16/11) | Bloqueio | Próxima ação |
|---|---|---|---|---|
| `main` / CI | CI verde no HEAD | #348: WebKit vermelho (`escala: 230 solicitações` timeout + `plano de renovações 320 px` flaky); #349 em execução | Lentidão real de render em lista paginada | Corrigido nesta PR (ver §5) |
| Vercel `arandu-demo` (`https://arandu-demo.vercel.app`) | App canônico `ARANDU_ENV=demo`, datasource Supabase, commit da `main` | `/api/health`: `environment=null`, `mode=demo`, `datasource=synthetic-fixtures`, commit `8219c64` (#339, **44 commits atrás**); `?probe=ready` → `not_ready` | Projeto ainda publica o **sandbox** (`ARANDU_DEPLOYMENT_KIND=demo`), não a Demo canônica | Autorização: deployment canônico (`ARANDU_ENV=demo` + variáveis Supabase Demo) do commit revisado |
| Vercel `arandu-pilot` | Estágio de validação | `/api/health` → `alive` (sem identidade de release) | — | Nenhuma nesta missão |
| Vercel `arandu` (produção) | Bloqueado até cutover | `arandu.vercel.app` → 404 da Vercel; build barrado por `finance:env:check` (ref legado sem atribuição de produção) | **Intencional** | Manter; cutover é decisão separada |
| Supabase Demo `offgpyysgdhfemjlchod` | Schema completo, marcador `demo`, Vitta Foods, 2 workspaces | Auth público responde 401 sem chave (projeto ativo). Leitura do schema exige a chave de serviço, **indisponível nesta sessão**; a fotografia de 16/11 (0 usuários/organizações, sem `fin_decision_scenarios`) não pôde ser revalidada | Credencial | Rodar `preflight-only` no GitHub (Environment `demo`): o resumo traz schema, pendências, dados e camadas |
| Supabase legado `igacnfjeuqhxcmfyepgj` | Intocado | Não acessado | — | — |
| Workflow `demo-hosted-seed.yml` | Preflight read-only separado da escrita; código e app coerentes | Checkout de SHA fixo antigo (`89b1f0f`, #342, sem Arandu 10.1), URL de preview fixa, preflight sem schema, escrita no mesmo job | Seed antigo contra app antigo; schema não verificado | Reescrito nesta PR (ver §3) |

Código × configuração × autorização:
- **Código (resolvido aqui):** preflight sem schema; workflow com SHA/URL fixos; seed sem histórico de cenários; WebKit lento na lista; config de Playwright executando specs de outra suíte.
- **Configuração externa:** projeto `arandu-demo` publicando o sandbox; Environment secret `ARANDU_DEMO_APP_URL` precisa apontar para o deployment canônico do commit revisado.
- **Autorização:** migrations no Supabase Demo; seed/provisionamento; promoção de domínio.

## 2. Reconciliação de migrations (somente leitura)

`lib/demo/schema-reconcile.mjs` compara um inventário de relações com o
manifesto (`docs/supabase-migrations.json`, fluxo `existingDatabase`) e com o
marcador `fin_settings.schema_version`:

| Estado | Significado | Ação permitida |
|---|---|---|
| `compatible` | Todas as relações esperadas existem e o marcador é o último | Nenhuma migration |
| `incremental` | Prefixo completo; restante ausente | Aplicar `pending`, na ordem, com o procedimento de release (backup + `scripts/release-migrations.mjs`) — **autorização separada** |
| `partial` | Uma migration pela metade | Parar; investigar a aplicação interrompida |
| `divergent` | Fora de ordem, relação de domínio desconhecida, marcador desconhecido ou à frente das relações | Parar; análise humana |
| `indeterminate` | Inventário ilegível | Parar |

Detalhes: relações criadas e depois removidas (legado de arte) não são
esperadas; `DROP` em lista é entendido. Migrations sem relação própria são
provadas pelo `schema_version`; sem ele voltam ao plano (conservador) e precisam
ser idempotentes. No hospedado, o inventário vem do OpenAPI do PostgREST (GET) e
cada relação ausente dele é sondada com `GET …?limit=0`: `42501` (revogada do
`service_role`, ex.: `fin_renewal_operations`) prova existência; `42P01` prova
ausência. Achado real: sem essa sonda, a Demo local completa era classificada
como `partial`.

Plano de aplicação (quando autorizado):
1. `preflight-only` no commit revisado → resumo lista `pending` e o `schema_version`.
2. Backup verificável do Supabase Demo (procedimento de recovery existente).
3. Plano estrito das migrations pendentes (sem rede/SQL): `npm run migrations:release -- --flow=existingDatabase --environment=demo --after-schema=<schema_version_observado> --dry-run`. O relatório `canonical-order` deve conter somente os arquivos pendentes. Exemplo verificado em 18/11/2026: `financial-contract-email-links-1` → apenas `docs/supabase-financial-arandu-10.sql`.
4. Aplicação hospedada **somente com autorização distinta**, via executor aprovado contendo `psql`/backup/restore: `--flow=existingDatabase --environment=demo --after-schema=<schema_version_observado> --apply --operator=<papel> --backup-reference=<protocolo> --restore-reference=<protocolo> --restore-evidence=<arquivo> --confirm-demo=ARANDU-DEMO`. A execução exige `ARANDU_DATABASE_URL` idêntica a `ARANDU_DEMO_DATABASE_URL`, `ARANDU_DEMO_CONFIRM=offgpyysgdhfemjlchod` e conexão PostgreSQL identificando o ref Demo; nunca colocar senha em logs, chat, PR ou artefato. O script verifica o marker real antes da escrita e o marker final depois. Salvaguardas implementadas em `lib/release-migration-guard.mjs` e testadas em `scripts/test-demo-migration-release.mjs` (mocks) e `tests/database/release-migration-guard.mjs` (PostgreSQL real descartável): URL Demo estrita (host/usuário/porta/banco exatos; `?host=`, `hostaddr`, `service` e qualquer parâmetro além de `sslmode` recusados; ref legado recusado); variáveis `PG*` removidas do ambiente do `psql`/`pg_dump`; URL igual à de staging/production bloqueada; cada migration pendente roda em transação própria (`psql -1`) precedida de `pg_advisory_xact_lock` e de conferência do marker real no mesmo BEGIN — execução concorrente ou marker divergente falha sem aplicar nada, falha intermediária reverte o arquivo inteiro e o relatório nunca registra `apply` aprovado nesse caso; arquivos com statements após `COMMIT`, múltiplos BEGIN/COMMIT ou comandos não transacionais são recusados. Não há prova de identidade do projeto *dentro* do banco além do marker: o vínculo depende da URL validada.
5. Repetir `preflight-only`: esperado `schema=compatible`. Só depois executar `seed-and-provision` com autorização própria.
6. Em falha, `partial` ou `divergent`: parar, investigar e usar rollback documentado ou restore verificado; nunca reaplicar todo o histórico.

Testes: `scripts/test-demo-schema-reconcile.sh` (PostgreSQL real, agora parte do
`npm run test:database`): banco vazio → incremental; estado pré-Arandu 10 →
`pending=[arandu-10]`; marcador anterior → a migration sem relação volta ao
plano; aplicar → compatible; reaplicar → compatible; meia migration → partial;
relação desconhecida → divergent; marcador desconhecido → divergent.

## 3. Preflight e workflow

`node scripts/demo/hosted-preflight.mjs --expected-sha=<sha> [--phase=before-seed|status]`
- Só GET/HEAD (`readOnlyFetch` lança antes da rede para qualquer outro método ou corpo).
- Códigos estáveis: `SECRET_MISSING`, `SECRET_WEAK`, `SECRET_INVALID`, `TARGET_INVALID`, `TARGET_PRODUCTION`, `APP_UNAVAILABLE`, `APP_NOT_CANONICAL`, `APP_COMMIT_MISMATCH`, `AUTH_UNAVAILABLE`, `STORAGE_UNAVAILABLE`, `SCHEMA_PENDING|PARTIAL|DIVERGENT|INDETERMINATE`, `MARKER_MISMATCH`, `DATA_PRESENT`, `DATA_MISSING`, `WORKSPACES_MISSING`, `PERMISSION`, `QUOTA`, `NETWORK`, `UNEXPECTED`.
- Camadas separadas: `app_compiled`, `api`, `canonical_runtime`, `auth`, `schema`, `demo_data`, `workspaces`, `journeys` (sempre `not_verified_by_preflight`: jornadas só por E2E). HTTP 200 nunca vira readiness.
- `before-seed`: GO exige banco vazio. `status`: READY exige dados marcados e ≥ 2 workspaces.

Workflow `demo-hosted-seed.yml` (manual, só `main`):
- `preflight` (job próprio): confere `confirm_ref`, `expected_sha` = HEAD da `main` = commit publicado no app; roda o preflight; publica artefato e resumo; NO-GO encerra.
- `provision` (só `seed-and-provision`): `needs: preflight`, exige veredito GO e `authorization_reference`; repete o preflight imediatamente antes de escrever; seed → check → 2 workspaces → list.
- Mesma `concurrency` do pool (`arandu-demo-pool`, sem cancelamento). Nenhum passo aplica migration. Aprovar/mergear PR não dispara nada.

## 4. Seed Vitta Foods e workspaces (stack local descartável)

Executado nesta sessão (`demo:down` + `demo:setup`, depois `demo:local:reset`):
seed pela API real com **45/45** checagens, incluindo as novas do 10.1 —
duas análises humanas salvas na RFQ de crédito (a segunda por duplicação +
edição, histórico com autoria e versão 2, comparação pelo motor do servidor),
caixa de trabalho sem total inventado e plano de renovações com o contrato de
capital de giro e ação canônica (`automatic_negotiation=false`). A renovação em
si **não** é iniciada pelo seed: é ação do visitante na demonstração.
Dois workspaces provisionados (≈ 615 s cada); `--phase=status` → **READY**
(schema compatible, dados `seeded`, 2 workspaces).

## 5. E2E — classificação

| Grupo | Causa | Tratamento |
|---|---|---|
| `demo-work-os-v3`, `demo-workspace-v2`, `public-tour` (62 falhas locais na #349) | Specs da suíte de apresentação rodando na config padrão sobre o build errado | `playwright.config.js` passa a ignorar exatamente os `testMatch` das configs de apresentação e da Demo; `npx playwright test` agora lista o mesmo conjunto de `npm run test:e2e` |
| `finance-ingestion:50` (1 falha local) | Intermitente só sob carga (6 workers + suíte completa); 36/36 em repetição | Sem mudança; acompanhar no CI |
| WebKit `escala: 230 solicitações` (vermelho na `main`) | Cada "Carregar mais" reconstruía todas as linhas e recalculava o próximo passo de todas as RFQs (~1.150 linhas para 230) | Linhas e próximo passo memorizados por objeto carregado; CPU 6× mais lenta: 14,9 s → 11,5 s. Sem mudança de timeout |
| Demo mobile (`demo-baseline` em `demo-mobile` após o desktop) | Pool esgotado: `auth/demo-login` → 503 `demo_capacity` | Pré-condição documentada no spec (repor o pool); reexecutado com pool reabastecido |

## 6. Pendências que exigem autorização

1. **Deployment canônico da Demo** (Vercel `arandu-demo`, `ARANDU_ENV=demo`, variáveis do Supabase Demo) no commit revisado, e `ARANDU_DEMO_APP_URL` no Environment `demo` apontando para ele. Resultado esperado: preflight `app=OK`.
2. **Migrations no Supabase Demo**, se o preflight indicar `SCHEMA_PENDING` (§2). Resultado esperado: `schema=compatible`.
3. **`seed-and-provision`** com `authorization_reference`. Resultado esperado: `--phase=status` READY.
4. **E2E hospedado** (`npm run test:e2e:demo` com `ARANDU_DEMO_APP_URL` público e pool ≥ 3) — só então a Demo hospedada pode ser declarada validada.
5. Produção continua bloqueada pelo gate de ambiente até recovery/cutover.
