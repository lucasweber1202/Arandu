# Arandu — evidência operacional de 02/10/2026

Evidência datada; não altera a guideline nem autoriza go-live. Consultas feitas
em 02/10, por GitHub, Supabase, Vercel e GETs dos aliases publicados. Nenhum
segredo, usuário real ou dado de cliente consta deste documento.

## CODE

- `main`: `fe5f5f47e6fdec2c1cedaf9d55fffea63c5549e8` (#93, Onda 0).
- `pilot`: `187c032c084857eb4ddf42ab3d7117ee366e495a` (#96, closure CI).
  Baseline anterior: `8a5861442e7f2efd1999a668acb607ec81a7e92d` (#95, Passport v2).
- Compare `main...pilot`: 13 à frente, 0 atrás; nenhuma PR aberta na consulta inicial.
- Passport, aprovação sequencial, APIs, UI, dataset, RLS e rollback já existem.
  Não foram reimplementados. Nenhum pack novo, cálculo de savings, recomendação,
  política de autorização ou regra de domínio foi alterado.
- Correções desta rodada: instalação de browsers separada de apt, limites de
  rede, runner Ubuntu fixo, cache salvo antes da suíte, orçamento de 50 minutos
  nos dois jobs; matriz de cinco projetos preservada. Checks de governança
  mantêm instalação incondicional; checker de supply chain aceita subactions
  fixadas por SHA, com testes negativos.
- Bundle existente ganhou `--after-schema`, exclusivo de `existingDatabase`:
  deriva a sequência do manifesto/SQL e recusa marcador desconhecido ou ambíguo.
  Não executa SQL. Para o Pilot atual gera apenas handoff → Passport.

## CI

| Evidência | Resultado observado |
| --- | --- |
| `main`, run #720 / `36894377448` | success |
| Passport, run #721 / `36899775117` — deploy-boundaries | success |
| #721 — database | success |
| #721 — validate | success |
| #721 — presentation | cancelled; não equivale a verde |
| #722 / `37068711721` — deploy-boundaries | SUCCESS |
| #722 — database | SUCCESS |
| #722 — validate | SUCCESS |
| #722 — presentation | SUCCESS |

O job presentation de #721 gastou **19min40s** em `Install browsers`, passou no
Safari smoke e foi cancelado após 35 minutos, durante a matriz completa, perto
do caso 336/340. O cache era salvo no post-job, pulado no cancelamento. A PR #96 comprovou a correção no run #722 e foi integrada. Instalação em
47s; financial E2E 159 passed / 21 skipped; presentation 295 passed / 44 skipped
e 1 flaky que passou no retry, com limiar inalterado. Safari smoke: 2 passed.
O merge `187c032c` tem a mesma árvore `509d4ecb34ae697d760a88cb3bc6c02b04373009`
do commit validado `2c17d740`; não existe run completo disparado no merge de
`pilot`, pois o workflow roda em PR e push de `main`.

Validação local desta rodada: `npm ci --include=optional`, audit (0
vulnerabilidades), SBOM (21 componentes), `check:all`, testes do bundle pendente
e de pinning de actions, build, assets (216 referências), budgets, SEO,
superfície/navegação (28 páginas), listagem E2E (180 casos financeiros) e
`git diff --check`. Download Playwright retornou arquivo vazio/truncado;
as tentativas E2E normal e presentation pararam por executável ausente, sem
validar jornadas. `test:database` parou por ausência de `psql`; Docker também
não está instalado. Isso é limite desta sessão, não teste aprovado.

## DEMO

- Alias: `https://arandu-demo.vercel.app`.
- Deploy oficial `dpl_2kUfbyDmcuZF6JBWw11RikudNo3G`: READY, target production,
  branch `main`, SHA `fe5f5f47`.
- `/` e `/demo/index.html`: 200. API financeira: 404 `legacy_surface_closed`.
  `/finance/passport.html`: 404. É **sandbox**, ainda sem banco dedicado.
- Supabase: não existe DEMO. Tentativa de criar **Arandu Demo**, sa-east-1,
  custo consultado US$ 0/mês, recusada por limite de **2 projetos ativos Free**.
  Nenhum projeto existente foi pausado, removido ou convertido.
- Seed/reset/check e E2E canônicos não executados remotamente. A retirada do
  sandbox permanece bloqueada até deploy, seed, reset e verificação completos.

## PILOT

- Supabase `offgpyysgdhfemjlchod`, Arandu Pilot, sa-east-1, ACTIVE_HEALTHY.
- `schema_version=financial-surface-hardening-1`, `email_enabled=false`.
- Organizações: 0; allowlist: 0; finance_ops: 0. Acesso segue fail-closed.
- `fin_company_profile_history` e `fin_rfq_profile_snapshots`: ausentes.
- Migrations pendentes, segundo manifesto: approval-handoff e Passport.
- DDL remoto **não aplicado**: backup/restore verificável é pré-condição do
  procedimento; sem conexão administrativa disponível no runtime e sem destino
  descartável, o drill não pôde ser feito. A integração SQL não substitui dump.
- Storage `fin-documents`: privado, 10 MB, 5 MIME types.
- Alias `https://arandu-pilot.vercel.app`: deploy
  `dpl_FnbgaWfULcqh1j1vYBPkPDhuYJAK`, READY, target production, `pilot`,
  SHA `187c032c`. GETs repetidos após #96: os mesmos oito resultados esperados.
- Smoke público: home/health/products/Passport HTML 200; me 401; cron sem segredo
  401 `cron_unauthorized`; forms 404 `legacy_surface_closed`; sandbox 404.
  Todas as respostas API conferidas trazem request ID.
- HTML do Passport publicado não comprova funcionamento autenticado no banco.
  Cron 401 comprova guarda, não execução de renovação.
- `finance:env:check` e doctor foram executados sem variáveis de servidor:
  **NO-GO**, por credenciais/URL/cron ausentes. Canary e restore pararam por
  conexão ausente. Nenhum GO, PASS de isolamento ou restore hospedado foi obtido.

## PRODUCTION

- Não existe Supabase Production dedicado; não apontar para Pilot/legado/Demo.
- Alias `https://arandu-bice.vercel.app`: deploy
  `dpl_4Dd6HusgFXDMiPeFRvF72J8Mo6mD`, READY, target production, `main`,
  SHA **`fd796e6b`**, anterior à baseline atual.
- Health 200; products **503 `rate_limit_unavailable`**; me/cron 401;
  GET forms **405**, não o fechamento 404 esperado; sandbox e Passport 404.
  Produção **não está pronta**. Não foi acionado POST no endpoint legado.
- O deploy mais recente listado nos projetos `arandu` e `arandu-demo` é preview
  de `pilot`; seu READY não significa publicação do alias oficial.

## SECURITY

- Advisors security/performance executados. Nenhum finding de RLS desligado,
  security-definer view ou search_path mutável.
- SQL: 0 tabelas públicas sem RLS; 33/33 `fin_*` com RLS forçado.
- Security: 30 INFO de RLS sem policy (fechamento deliberado) e 43 WARN de RPCs
  SECURITY DEFINER autenticadas. Comparar autorização interna/inventário;
  não revogar RPCs legítimas cegamente. Não houve alteração de permissões.
- Performance: 66 INFO de FKs sem índice, 21 WARN de initplan de Auth/RLS,
  74 INFO de índices ainda sem uso; sem evidência de carga para mudança cega.
- Funções definer têm search_path fixo: 62 vazio, 30 public, 1 public/extensions.
  A presença de public fixo no legado não foi classificada como path mutável.
- Branches `main` e `pilot`: `protected=false`. Endpoint administrativo retorna
  403 `Resource not accessible by integration`; integração não oferece escrita
  de proteção/ruleset. Configuração segue ação administrativa.

## OPERATIONS

Metadados Vercel foram lidos usando o escopo pessoal; o team ID descoberto
retornou 403. Ferramentas não expõem leitura/edição de variáveis e Production
Branch. Bypass protegido também retornou 403. Os GETs públicos acima passaram
diretamente; presença, valores e escopos de envs **não foram atestados**.
E-mail segue desligado, MFA de operador requer enrolamento humano, e nenhum
participante real foi inventado/cadastrado. Nenhuma promoção para main foi aberta:
DB Passport, doctor GO, canary, restore e jornada hospedada faltam. CI #722
está GREEN; não é um blocker pendente da baseline.

## OWNER_ACTION_REQUIRED

1. Liberar capacidade Supabase conscientemente ou aprovar custo/plano para Demo
   e Production dedicados. O limite Free foi confirmado por tentativa real.
2. Disponibilizar acesso seguro ao banco/restore e configuração Vercel; concluir
   as duas migrations na ordem depois de backup, com doctor/canary/restore.
3. Ativar proteção de branches e checks obrigatórios com acesso administrativo.
4. Rever termos, LGPD e compartilhamento com assessoria jurídica; escolher
   empresa, aprovadores, operador e 2–3 provedores, acordos/pricing e domínio.
5. Configurar provedor, domínio/SPF/DKIM/FROM/HMAC e revisão aplicável antes de
   ligar e-mail. Não ligar para contornar infraestrutura ausente.

Próxima Onda 1 após convergência: Contract & Renewal Center v2 → Savings Ledger
v1 → Provider Relationship Management v1 → Policy/Approval Engine v2 → Executive
Portfolio v1, conforme guideline; nenhum desses módulos foi antecipado aqui.

## HOSTED PILOT CLOSURE — reconfirmação às 20h33 BRT

| Gate | Estado | Evidência/limite |
| --- | --- | --- |
| SUPABASE AUTH | OK | MCP lista projetos e lê fin_settings; não houve falha OAuth |
| PILOT SCHEMA | financial-surface-hardening-1 | consulta direta; tabelas Passport ausentes |
| BACKUP | BLOCKED | conector não exporta pg_dump; runtime sem conexão administrativa segura |
| RESTORE | BLOCKED | psql/pg_dump/pg_restore/Docker ausentes; nenhum destino descartável disponível |
| CI baseline | GREEN | quatro gates #722; árvore igual ao merge #96 |
| DOCTOR | BLOCKED | tentativa no runtime retorna NO-GO por envs ausentes; não é execução no servidor Vercel |
| CANARY | BLOCKED | conexão ausente; nenhum PASS hospedado atribuído ao smoke |
| PASSPORT HOSTED | PARTIAL | HTML 200; jornada autenticada BLOCKED BY HUMAN SETUP e schema antigo |
| PROMOTION | BLOCKED | DB, backup/restore, doctor, canary e jornada ainda não comprovados |

MCP autenticado oferece consulta e migration; não oferece export lógico completo,
conexão libpq nem execução do doctor no runtime Vercel. Dashboard de backups foi
retestado e redireciona para sign-in; sessão do navegador e OAuth MCP são distintas.
Não foram solicitados secrets no chat, feito novo loop de login ou aplicado DDL.
Branches Supabase: nenhuma. Restore para projeto novo poderia exigir capacidade/
custo; nenhum recurso pago foi provisionado. Backup do serviço não foi listado ou
baixado, portanto sua existência não é uma prova de recuperação nesta rodada.

Postgres hospedado: 17.6 / release 17.6.1.166. Auth users/MFA, objetos Storage,
policies Auth e policies Storage: todos 0. RLS: 33/33 fin_* forçadas; 0 tabelas
públicas sem RLS, 0 definers sem search_path fixo; postgres não é superuser.
Advisors repetidos: 30 INFO RLS sem policy, 43 WARN definer; performance 66/21/74,
sem novo finding de RLS desligado, view definer ou search_path mutável. Nenhum
RPC foi revogado sem revisão do modelo de autorização.

Logs Supabase, janela desta rodada: edge_logs 1 e pgbouncer_logs 62, sem mensagem
contendo error. Isso cobre só fontes retornadas e não comprova ausência geral de
incidentes. Vercel runtime logs agregados do deploy atual: 403 Forbidden; leitura
da proteção main: 403 Resource not accessible by integration. Não houve workaround.
Branch do deploy comprovada; ARANDU_ENV e ref do backend Vercel permanecem sem
atestação direta, pois o conector não expõe as variáveis do servidor.

Bundle pendente canônico: somente approval-handoff → Passport. SHA-256:
`9b75f1949aad6c740ca2423255a3a9d3f9e394ed5118457413d43236d2d63747`.
Nenhum arquivo SQL de migration, grant, RLS ou schema_version foi alterado.

Tooling do restore corrigido: major PostgreSQL alinhado e conferido no destino
real, políticas de Storage exportadas/restauradas/comparadas, RLS Storage e donos
das funções definer comparados, gatilhos Auth incluídos no hash, backup hospedado
mantido privado para rollback, credencial da origem fora de argv/erros. Preflight
bloqueia outro projeto, pooler transacional, TLS desativado, major incompatível,
MFA/objetos Storage/policies Auth fora do escopo. Ready não significa backup PASS.
Canary reconhece explicitamente os três schemas suportados: antes do Passport
exige ausência das duas tabelas; depois exige presença e executa todos os ataques.
Um marcador desconhecido ou schema parcial falha fechado; testes negativos no CI.

Procedimento e mínimo de infraestrutura restante:
[FINANCIAL_PILOT_PASSPORT_ROLLOUT.md](FINANCIAL_PILOT_PASSPORT_ROLLOUT.md).

Validação deste lote: npm ci, audit (0 vulnerabilidades), SBOM (21 componentes),
check:all, testes negativos do preflight e bundle, build, assets, budgets,
superfície/navegação e diff check aprovados. SEO exige VERCEL_URL no contexto do
build de preview; rodada repetida com o alias do Pilot. test:database bloqueado
por psql ausente; E2E e presentation tentados com max-failures=1, interrompidos
por Chromium headless ausente, sem atribuir PASS local. CI da nova PR precisa
validar especialmente os casos SQL adicionados. O checkout local foi reconstruído
para validação e não possui origin; baseline/histórico vieram da API GitHub e o
commit remoto parte do pai real pilot, preservando o histórico original.

No navegador, Passport carregou e mostrou “Entre para usar o portal”. Nenhum dado
foi carregado sem sessão. Não houve edição, provenance, freshness, history ou
snapshot RFQ autenticados nesta sessão. A disponibilidade e a guarda estão
comprovadas; a jornada completa continua BLOCKED BY HUMAN SETUP.
