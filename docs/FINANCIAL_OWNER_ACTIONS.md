# O que depende do proprietário

> Checklist única e atualizada, com estado por item: [`FINANCIAL_PILOT_GO_LIVE.md`](FINANCIAL_PILOT_GO_LIVE.md).

Lista curta e fechada. **Só entra aqui o que é impossível resolver por código.**
Esta lista separa ações externas de implementação. P1.4, Qualification,
Implementation, Covenants, Performance e Spend existem em M1/E1; não são
novas iniciativas a reconstruir. Estado vivo: `IMPLEMENTATION_MATRIX.md`,
`main@fcc68f91` (#136 + #137 + #138), observado em 06/10/2026.

---

## 1. Revisão jurídica — bloqueia o piloto

Os 14 itens de [`FINANCIAL_LEGAL_REVIEW_REQUIRED.md`](FINANCIAL_LEGAL_REVIEW_REQUIRED.md)
precisam de parecer humano. Os mais próximos do piloto:

* enquadramento da atividade de procurement financeiro;
* o que o provedor passa a ver da demanda ao aceitar um convite;
* comunicação por e-mail com instituições financeiras;
* texto dos termos de uso — **hoje não existe texto**, só o registro de qual
  versão foi aceita.

O software registra o aceite e diz na tela que o texto não foi revisado. Ele
não trata isso como aceite legal válido, e não deve passar a tratar sem parecer.

## 2. Proteção das branches `main` e `pilot`

API de rulesets em 06/10: 403 exige GitHub Pro ou repositório público.
**OWNER_ACTION_REQUIRED:** decidir plano adequado ao repositório privado;
nenhuma regra foi aplicada. Depois do upgrade:
Settings → Rules → Rulesets → New ruleset → Import a ruleset, com
`.github/rulesets/pilot.json` e `.github/rulesets/main.json` (versionados e
testados; detalhes e rollback em `BRANCH_PROTECTION.md`). Equivalente manual em
GitHub → Settings → Branches → Add rule:

- **`main`**: Require a pull request; Require status checks (`validate`,
  `database`, `deploy-boundaries`, `presentation`); Require branches to be up to
  date; bloquear force push e deleção.
- **`pilot`**: Require a pull request; bloquear force push e deleção. Histórica/congelada: não recebe novas features; arquivar só após transição comprovada.

Actions no HEAD atual: run #784 falharam nos quatro jobs
sem steps. Regularizar quota/billing ou acesso ao runner, reexecutar o run no
SHA exato e exigir os quatro gates. `main` continua `protected: false`.

## 3. Os três ambientes (Vercel e Supabase)

**Consolidação de 06/10/2026 — ações do owner, em ordem:**

1. GitHub → Billing → Actions: restabelecer minutos/limite de gasto (CI sem runner desde o run #771; `GITHUB_ACTIONS_MINUTES.md`) e reexecutar os quatro gates no HEAD atual; não usar run de outro SHA.
2. #136, #137 e #138 já estão em main. Novas PRs só entram com quatro gates verdes e merge:gates no HEAD exato.
3. Escolher organização Supabase para Demo dedicado; consultar/confirmar custo e criar sem pausar/apagar projetos existentes. Preparação pronta em `HOSTED_ALIGNMENT_2026-10-06.md`: cleanInstall 59, seed real, persona/QA e cutover do mesmo arandu-demo. Não reutilizar Pilot/legado.
4. Depois da Demo, Vercel arandu-pilot → Settings → Git → Production Branch main. Hoje o alias público serve pilot@2241d3b9; main@fcc68f91 é só preview. Reautorizar o scope para logs/acesso necessário.
5. Supabase Pilot: executor Docker e clientes PostgreSQL 17, conexão de dump resolvível; backup/restauração do mesmo arquivo, rehearsal e prefixo 12. Depois export/owner ack específico para decommission e 12 restantes. Doctor/canary/jornada e release check v2.
6. Official: só após Pilot válido no mesmo SHA. Alias arandu-bice.vercel.app serve main@fd796e6b (#81); deploy main@fcc68f91 falhou. Recuperar logs reais e configurar Supabase PROD próprio/CRON_SECRET; não recriar ARANDU_ENV=production.
7. Confirmada a transição de tráfego do Pilot para main, arquivar pilot (tag); não apagar enquanto o alias depende dela.

Topologia e fluxo em [`FINANCIAL_DEPLOYMENT_WORKFLOW.md`](FINANCIAL_DEPLOYMENT_WORKFLOW.md).
A branch `pilot` e os três projetos Vercel existem. Evidência atual por alias,
SHA e ambiente em [`HOSTED_ALIGNMENT_2026-10-06.md`](HOSTED_ALIGNMENT_2026-10-06.md).
O conector lê metadados e nomes de env vars e permite criar env vars, mas
logs/bypass retornam 403 de scope `lucas-projects467`. Reautorizar esse team
na conexão Vercel. Production Branch não está exposta pelo update_project
disponível: trocar no painel, sem alterar proteção para facilitar acesso.

**3.1 Demo canônica**: `arandu-demo` deve continuar usando `main`, com
`ARANDU_ENV=demo` e Supabase DEMO **dedicado**. Remover
`ARANDU_DEPLOYMENT_KIND` só depois de configurar banco/variáveis e validar seed,
reset e E2E. Procedimento único em
[`FINANCIAL_DEPLOYMENT_WORKFLOW.md#demo`](FINANCIAL_DEPLOYMENT_WORKFLOW.md#demo).
A tentativa de criar Arandu Demo em 02/10 retornou limite de dois projetos
ativos Free. É preciso liberar capacidade conscientemente ou aprovar mudança
de plano/custo; nenhum projeto foi pausado/apagado pelo agente. Não reutilizar
o Pilot nem o legado. A mesma dependência vale para Production.

**3.2 Supabase do piloto (`offgpyysgdhfemjlchod`)**:
1. Marker confirmado em 06/10: `financial-surface-hardening-1`. PostgreSQL 17.6;
   Storage objects = 0, MFA factors = 0, Auth policies = 0 por probes somente
   de leitura. Isso não é backup/restore comprovado.
2. Configurar `PILOT_SOURCE_DATABASE_URL` em ambiente seguro de operador com
   PostgreSQL 17 e Docker; executar `pilot:backup:preflight` e
   `pilot:restore:drill`. A conexão anteriormente fornecida teve identidade aceita, mas falhou em DNS
   neste executor; clientes locais são 16 e Docker não existe. Conector SQL
   não substitui o dump/restore. Nenhum backup foi gerado. Preservar hash e evidência do mesmo backup.
3. Repetir `npm run pilot:upgrade:rehearse` sobre executor local e testar upgrade
   da cópia restaurada. Gerar prefixo de 12 migrations (sem pular etapas):
   `npm run migrations:bundle -- --flow=existingDatabase --after-schema=financial-surface-hardening-1 --stop-before=docs/supabase-financial-legacy-art-decommission.sql`.
   Só aplicar depois dos gates de recovery; esperado `financial-data-governance-1`.
4. Para as 12 restantes, export verificado + decisão específica do owner +
   acknowledgement antes do legacy art decommission (`LEGACY_ART_RETIREMENT.md`).
   Não fabricar ack nem prosseguir saltando o decommission.
5. Marker final `financial-opportunity-discriminator-1`; doctor GO, canário,
   advisors, grants, bucket privado e jornada no mesmo release.
6. `pilot:release:check` exige evidência v2 (CI exato, jornada completa e operação).
   Ver `FINANCIAL_PILOT_RELEASE_GATE.md`; não preencher PASS sem exercício real.

**3.3 `arandu-pilot` (Vercel)**: Add New → Project → este repositório.
- Nome `arandu-pilot`, Production Branch **`main`**, Build Command padrão
  (`npm run vercel-build`, já em `vercel.json`).
- Environment Variables, **só no escopo Production**:
  - `ARANDU_ENV=pilot`
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Sensitive), todos do piloto
  - `CRON_SECRET` (`openssl rand -hex 32`)
  - `ARANDU_SITE_URL` (a URL do projeto, ex. `https://arandu-pilot.vercel.app`)
  - `ARANDU_PILOT_ALLOWLIST_CONFIRMED=true`
- Nunca definir `ARANDU_DEMO_MODE` nem `ARANDU_PRESENTATION_MODE`.
- O deploy falha sozinho se alguma variável estiver errada.
- Verificar, na sua máquina, com as mesmas variáveis:
  - `ARANDU_ENV=pilot npm run finance:env:check`
  - `ARANDU_ENV=pilot npm run finance:pilot:doctor` → exit 0
  - `PILOT_DATABASE_URL='…' npm run pilot:canary`
  - `PILOT_SOURCE_DATABASE_URL='…' npm run pilot:restore:drill`

**3.4 Supabase de produção**: criar um projeto **novo** (região São Paulo),
por exemplo "ARANDU PRODUCTION". Nunca reaproveitar o do piloto nem o legado.
- Aplicar todos os arquivos de `cleanInstall`, em ordem (`npm run migrations:bundle
  -- --flow=cleanInstall` gera um SQL único em `reports/`), com o código da
  `main` que será publicado.
- Conferir `schema_version` igual ao `EXPECTED_SCHEMA_VERSION` desse código,
  Advisors e bucket.
- Nenhum dado do piloto é copiado.

**3.5 `arandu` (Vercel, produção)**: no projeto existente
(`arandu-lucas-projects467.vercel.app`), Production Branch `main`, variáveis no escopo
Production. `ARANDU_ENV=production` já existe em Production. O deploy de `main@fcc68f91`
falhou no vercel-build; a causa requer os logs reais após reautorizar o scope.
Não recriar o runtime nem presumir a causa. `CRON_SECRET` não aparece no
inventário Production. Banco próprio e recovery seguem pendentes:
- `ARANDU_ENV=production`
- `SUPABASE_*` e `CRON_SECRET` **próprios da produção**; nenhum valor do piloto
- `ARANDU_SITE_URL` oficial

Depois: `ARANDU_ENV=production npm run finance:pilot:doctor` → exit 0, e smoke
de `/`, `/api/health`, `/api/finance/me` (401), `/api/forms` (404
`route_not_found`) e `/demo/index.html` (404).

**3.6 Domínios** (opcional): `demo.`, `pilot.` e `app.` no domínio escolhido.
Enquanto não houver domínio, os `.vercel.app` bastam, com `ARANDU_SITE_URL`
igual à URL usada.

## 4. Backup e restore

Restore **testado e automatizado** (`npm run pilot:restore:drill`): backup lógico,
restore num Postgres da Supabase novo, 24 comparações origem × restaurado e o
canário de isolamento. Ensaiado contra o piloto local em 28/09/2026. Falta só
rodar contra o piloto real, com `PILOT_SOURCE_DATABASE_URL` (string de conexão
do painel, nunca em arquivo versionado) — ver
[`FINANCIAL_PILOT_ENVIRONMENT.md`](FINANCIAL_PILOT_ENVIRONMENT.md#backups).

## 5. E-mail transacional

O caminho de enfileiramento existe, é testado e nasce desligado. Para ligar:

* contratar/configurar provedor de e-mail e colocar a credencial no ambiente;
* verificar o domínio de envio (SPF/DKIM) — sem isso, convite para banco cai em
  spam;
* ligar a chave: `update public.fin_settings set value = 'true' where key = 'email_enabled';`

Enquanto estiver desligado, o convite é entregue manualmente, e o produto diz
isso em vez de fingir que enviou.

## 6. Escolher quem entra no piloto

* uma empresa compradora, com responsável financeiro disposto a usar de verdade;
* dois ou três provedores dispostos a responder;
* preencher [`FIRST_FINANCIAL_PILOT.md`](FIRST_FINANCIAL_PILOT.md);
* cadastrar os e-mails em `fin_pilot_allowlist` — enquanto a tabela estiver
  vazia, **ninguém** consegue criar organização (falha fechada).

## 7. Acordos comerciais

Nenhum contrato com empresa ou provedor existe. O que o Arandu cobra, se cobra,
e em que condições o provedor participa são decisões de negócio — e qualquer
modelo ligado a sucesso na contratação volta para o item 1.

## 8. Dependabot

Nada pendente. As antigas #60 (vite 8.3.0) e #61 (@playwright/test 1.63.0)
estão fechadas e absorvidas: o `package-lock.json` atual tem vite 8.3.1 e
@playwright/test 1.63.0 (conferido em 29/09/2026).

---

## O que NÃO está nesta lista

Porque foi implementado nesta rodada: checker de ambiente, smoke test de piloto,
seed removível, allowlist, registro de aceite, eventos de produto, métricas
operacionais, exportação do processo, criação de organização pela interface,
checklist de onboarding, estados do provedor, suporte documentado e a correção
do vazamento de token.
