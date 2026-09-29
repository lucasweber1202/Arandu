# O que depende do proprietário

> Checklist única e atualizada, com estado por item: [`FINANCIAL_PILOT_GO_LIVE.md`](FINANCIAL_PILOT_GO_LIVE.md).

Lista curta e fechada. **Só entra aqui o que é impossível resolver por código.**
Tudo que era implementável foi implementado.

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

A integração não tem permissão administrativa: a API responde 403
("Resource not accessible by integration"). Em GitHub → Settings → Branches →
Add rule:

- **`main`**: Require a pull request; Require status checks (`validate`,
  `database`, `deploy-boundaries`, `presentation`); Require branches to be up to
  date; bloquear force push e deleção.
- **`pilot`**: Require a pull request; bloquear force push e deleção. Os mesmos
  status checks, quando a quota do Actions voltar.

Enquanto a quota estiver esgotada, os status checks obrigatórios travam todo
merge. Ligue-os depois de 01/10, com a primeira run verde. Os toggles estão em
[`FINANCIAL_REPO_GOVERNANCE.md`](FINANCIAL_REPO_GOVERNANCE.md).

## 3. Os três ambientes (Vercel e Supabase)

Topologia e fluxo em [`FINANCIAL_DEPLOYMENT_WORKFLOW.md`](FINANCIAL_DEPLOYMENT_WORKFLOW.md).
A branch `pilot` já existe. Nesta sessão não havia conector nem credencial de
Vercel ou Supabase (APIs 403/401), por isso os passos abaixo são seus.

**3.1 `arandu-demo` (Vercel)**: passo a passo único em
[`FINANCIAL_DEPLOYMENT_WORKFLOW.md#demo`](FINANCIAL_DEPLOYMENT_WORKFLOW.md#demo).
Resumo: projeto novo da branch `main`, **uma** variável
(`ARANDU_DEPLOYMENT_KIND=demo`), Build Command padrão, Vercel Authentication
desligada. Atenção: configurar só o Build Command `npm run build:demo` no painel
**não funciona** — o `vercel.json` sobrepõe esse campo.

**3.2 Supabase do piloto (`offgpyysgdhfemjlchod`)**: SQL Editor.
1. `select value from public.fin_settings where key = 'schema_version';` deve
   dar `financial-final-hardening-1` (34 aplicadas).
2. Cole e rode `docs/supabase-financial-pilot-surface-hardening.sql`
   (**só esse**; o antigo `…-advisor-hardening.sql` foi removido e não deve ser
   aplicado).
3. Repita a consulta do passo 1: esperado `financial-surface-hardening-1`.
4. Advisors → Security e Performance: esperado nenhum item de
   `rls_disabled_in_public`, `security_definer_view` ou
   `function_search_path_mutable`.
5. Storage → `fin-documents`: *Public* desligado, 10 MB, 5 tipos.
6. Allowlist: `insert into public.fin_pilot_allowlist (pattern, created_by, note) values (...)`
   só com quem foi autorizado (e-mail completo ou `@dominio`). Nada disso vai
   para o Git.

**3.3 `arandu-pilot` (Vercel)**: Add New → Project → este repositório.
- Nome `arandu-pilot`, Production Branch **`pilot`**, Build Command padrão
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
- Aplicar os 35 arquivos de `cleanInstall`, em ordem (`npm run migrations:bundle
  -- --flow=cleanInstall` gera um SQL único em `reports/`).
- Conferir `schema_version = financial-surface-hardening-1`, Advisors e bucket.
- Nenhum dado do piloto é copiado.

**3.5 `arandu` (Vercel, produção)**: no projeto existente
(`arandu-bice.vercel.app`), Production Branch `main`, variáveis no escopo
Production. Hoje ele está no ar **sem** `ARANDU_ENV`; o próximo deploy de `main`
falha até isso ser corrigido (o deploy atual continua no ar):
- `ARANDU_ENV=production`
- `SUPABASE_*` e `CRON_SECRET` **próprios da produção**; nenhum valor do piloto
- `ARANDU_SITE_URL` oficial

Depois: `ARANDU_ENV=production npm run finance:pilot:doctor` → exit 0, e smoke
de `/`, `/api/health`, `/api/finance/me` (401), `/api/forms` (404
`legacy_surface_closed`) e `/demo/index.html` (404).

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

[#60](https://github.com/lucasweber1202/Arandu/pull/60) (vite 8.2.2 → 8.3.0) e
[#61](https://github.com/lucasweber1202/Arandu/pull/61) (@playwright/test
1.62.1 → 1.63.0). As duas branches foram atualizadas contra a `main` atual nesta
rodada para que o CI delas rode contra o código de hoje. **Mesclar é decisão de
quem tem permissão**, e deve ser feito separado desta PR, para que uma eventual
regressão tenha causa identificável.

---

## O que NÃO está nesta lista

Porque foi implementado nesta rodada: checker de ambiente, smoke test de piloto,
seed removível, allowlist, registro de aceite, eventos de produto, métricas
operacionais, exportação do processo, criação de organização pela interface,
checklist de onboarding, estados do provedor, suporte documentado e a correção
do vazamento de token.
