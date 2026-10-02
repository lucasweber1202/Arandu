# Arandu — evidência operacional de 02/10/2026

Evidência datada; não altera a guideline nem autoriza go-live. Consultas feitas
em 02/10, por GitHub, Supabase, Vercel e GETs dos aliases publicados. Nenhum
segredo, usuário real ou dado de cliente consta deste documento.

## CODE

- `main`: `fe5f5f47e6fdec2c1cedaf9d55fffea63c5549e8` (#93, Onda 0).
- `pilot`: `8a5861442e7f2efd1999a668acb607ec81a7e92d` (#95, Passport v2).
- Compare `main...pilot`: 11 à frente, 0 atrás; nenhuma PR aberta na consulta inicial.
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

O job presentation de #721 gastou **19min40s** em `Install browsers`, passou no
Safari smoke e foi cancelado após 35 minutos, durante a matriz completa, perto
do caso 336/340. O cache era salvo no post-job, pulado no cancelamento. A PR
desta rodada precisa comprovar a nova configuração em CI antes de merge.

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
  `dpl_4tpsc1igDmuyfQX9BomQUbefUsY5`, READY, target production, `pilot`,
  SHA `8a586144`.
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
DB Passport, CI completo, doctor GO, canary, restore e jornada hospedada faltam.

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
