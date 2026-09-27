# Financial Procurement — checklist única de go-live do piloto

Estado em **27/09/2026**, base `a0f85df` (merge da #73) + a PR do hardening final.
Primeiro comando no ambiente real: `ARANDU_ENV=pilot npm run finance:pilot:doctor`
(somente leitura; 0 = GO, 1 = NO-GO, 2 = UNSAFE).
Cada linha tem um único estado:

- **DONE** — feito e verificado; a evidência está na coluna ao lado.
- **BLOCKED** — não depende de decisão, mas não pode ser concluído agora; o
  motivo e o desbloqueio estão escritos.
- **OWNER_ACTION_REQUIRED** — só o proprietário pode fazer (pagamento,
  credencial privada, decisão jurídica ou comercial, domínio, DNS, confirmação
  humana). O passo exato está escrito.

Evidências: [`FINANCIAL_RELEASE_EVIDENCE_2026-09-26.md`](FINANCIAL_RELEASE_EVIDENCE_2026-09-26.md) e
[`FINANCIAL_RELEASE_EVIDENCE_2026-09-27.md`](FINANCIAL_RELEASE_EVIDENCE_2026-09-27.md). Autorização: [`FINANCIAL_AUTHORIZATION_MAP.md`](FINANCIAL_AUTHORIZATION_MAP.md).

## SOFTWARE

| # | Item | Estado | Evidência / próximo passo |
| --- | --- | --- | --- |
| S1 | Procurement financeiro completo (RFQ, revisões, convites, propostas versionadas, comparação factual, pesos do usuário, aprovações, decisão, contrato, renovação, tarefas, comentários, menções, avisos, busca, autosave, documentos privados, identidade de membros, console operacional) | DONE | PRs #68–#72; jornada real desta rodada: 23 passos, 0 falhas |
| S2 | Rotas `/api/finance/*`, `/api/auth/*` e `/api/jobs/renewals` alcançáveis na Vercel | DONE | Em produção respondiam `NOT_FOUND` da plataforma: fora do Next.js, `api/[...path].js` só recebe um segmento. Rewrite `/api/:aranduScope/:aranduRest+` em `vercel.json` + `npm run check:vercel-routing` (em `check:all`) |
| S3 | Convite de provedor não pode ser usado por concorrente já vinculado | DONE | `docs/supabase-financial-pilot-operations.sql` (1); teste de banco + ataque real "B usa link de A" → 409 |
| S4 | Prazo de URL de envio honesto e reserva de envio limitada | DONE | O Storage ignora o prazo pedido para upload (60 s self-hosted, 2 h hospedado). API informa o prazo real (`expires_in`) e o banco recusa concluir reserva com mais de 10 min (`complete_within: 600`) |
| S5 | Aviso (e e-mail) de renovação para contratos registrados pelo produto | DONE | Antes: nenhum aviso — a tarefa de revisão aberta no registro impedia o aviso da agenda. Agora: um aviso por marco (90/60/30/aviso/vencido), idempotente |
| S6 | Cadastro de TOTP do operador | DONE | Não existia caminho para o operador obter `aal2`. `npm run finance:operator:mfa` |
| S7 | `finance:env:check` coerente com o produto | DONE | Exige `SUPABASE_SERVICE_ROLE_KEY` (só servidor) e `CRON_SECRET` ≥ 32 no piloto; texto da allowlist corrigido (vazia = ninguém entra) |
| S8 | Suíte local equivalente ao CI | DONE | audit, SBOM, `check:all`, build, dist, tamanho, SEO, banco (PG16), E2E e apresentação em Chromium desktop + mobile, fronteiras de deploy, `build:demo`, `git diff --check` |
| S9 | E2E e apresentação em Firefox, WebKit e Safari móvel | BLOCKED | Motores não instalados neste ambiente (proibido baixar navegador). Rodam no job `validate`/`presentation` do CI quando a quota voltar |
| S10 | CI formal do GitHub nesta PR | BLOCKED | Quota de minutos do GitHub Actions esgotada até 01/10/2026 (jobs com `runner_id: 0`, sem passos). Reexecutar `validate`, `database`, `deploy-boundaries`, `presentation` sem alterações — ver [`GITHUB_ACTIONS_MINUTES.md`](GITHUB_ACTIONS_MINUTES.md) |
| S11 | Papel de plataforma `finance_ops`, isolado do admin legado | DONE | `finance_ops` + registro + `aal2` na API e no banco; fora de `ADMIN_ROLES`; 17/17 rotas legadas recusam; MFA no próprio console (`/api/finance/ops/mfa`). O papel `operator` legado não abre mais o console |
| S12 | Convite vinculado ao e-mail do contato | DONE | `recipient_mode = exact_email` quando o provedor tem contato: só aceita a conta com esse e-mail confirmado; recusa com erro genérico e motivo interno em `fin_invite_acceptance_denials` |
| S13 | `check:all` inclui governança e staging, sem recursão | DONE | `check:governance` e `check:staging` passam e fazem parte de `check:all`; guarda de recursão no checker |
| S14 | `npm run finance:pilot:doctor` | DONE | Somente leitura, saída humana e `--json`, 9 categorias; ensaio: completo GO, incompleto NO-GO, chave trocada e bucket público UNSAFE |
| S15 | CI mais barato sem reduzir cobertura | DONE | Jobs com navegador esperam o `deploy-boundaries` (cancelamento antes de gastar), cache dos navegadores, `psql` condicional, política de push em lote. Medição só a partir de 01/10 |

## ENVIRONMENT

| # | Item | Estado | Evidência / próximo passo |
| --- | --- | --- | --- |
| E1 | Demo pública sem login (projeto Vercel `arandu-demo`) | OWNER_ACTION_REQUIRED | Sem acesso à Vercel nesta sessão (`api.vercel.com` 403). Passo a passo em [Demo pública](#demo-pública). `npm run build:demo` gera o `dist` correto (verificado) |
| E2 | Produção atual (`arandu-bice.vercel.app`) no ar, sem demo | DONE | `GET /` 200, `/api/health` 200, `/demo/index.html` 404, `/finance/ops.html` 200 |
| E3 | Rotas de vários segmentos respondendo em produção | DONE | Após o merge da #73: `/api/jobs/renewals` → 401 `cron_unauthorized`, `/api/finance/me` → 401, `/api/auth/session` → 200 |
| E3b | Banco do deployment de produção sem as migrations | OWNER_ACTION_REQUIRED | Em produção, `/api/auth/login` e `/api/finance/*` respondem 503 `rate_limit_unavailable` (`consume_rate_limit` ausente) e o catálogo diz `catalog_migration_pending`. Aplicar `docs/supabase-migrations.json` no banco que esse deployment usa, ou apontá-lo para o Supabase do piloto; conferir com o doctor |
| E4 | Projeto Supabase dedicado ao piloto | OWNER_ACTION_REQUIRED | Criar projeto (região São Paulo), sem dados de produção. Nenhuma credencial Supabase existe nesta sessão (`api.supabase.com` 401) |
| E5 | Migrations aplicadas no piloto | OWNER_ACTION_REQUIRED | Aplicar os 34 arquivos de `docs/supabase-migrations.json` → `cleanInstall`, em ordem (o último grava `schema_version = financial-final-hardening-1`, conferido pelo doctor). Ensaiado no Postgres 15 da Supabase |
| E6 | Bucket `fin-documents` privado, 10 MB, 5 tipos | OWNER_ACTION_REQUIRED | A migration cria. Conferir no painel: Storage → `fin-documents` → *Public* desligado. Ensaiado: `public=false`, `10485760`, 5 MIME |
| E7 | Variáveis do deployment do piloto | OWNER_ACTION_REQUIRED | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Server-only), `CRON_SECRET` (`openssl rand -hex 32`), `ARANDU_SITE_URL`, `ARANDU_ENV=pilot`. Depois: `ARANDU_ENV=pilot npm run finance:env:check` |
| E8 | Domínio / subdomínio do piloto | OWNER_ACTION_REQUIRED | Nenhum domínio foi comprado. Escolher, registrar e apontar DNS |
| E9 | Provedor de e-mail (Resend) | OWNER_ACTION_REQUIRED | Conta Resend, domínio verificado (SPF/DKIM), `ARANDU_EMAIL_PROVIDER=resend`, `ARANDU_EMAIL_FROM`, `RESEND_API_KEY`, `ARANDU_RECIPIENT_HMAC_SECRET` (32+), `ARANDU_TRANSACTIONAL_EMAIL_READY=true`, `ARANDU_EMAIL_DISPATCH_ENABLED=true` |
| E10 | Backup e teste de restore | OWNER_ACTION_REQUIRED | Procedimento em `FINANCIAL_PILOT_ENVIRONMENT.md`. Nenhum restore foi testado; sem teste não há RTO |
| E11 | Ensaio completo com componentes reais da Supabase | DONE | `bash scripts/pilot-local/up.sh && bash scripts/pilot-local/journey.sh` (Postgres 15, GoTrue, PostgREST, Storage). Reproduzido do zero nesta rodada |

## SECURITY

| # | Item | Estado | Evidência / próximo passo |
| --- | --- | --- | --- |
| C1 | RLS em todas as tabelas `fin_*` | DONE | 32/32 com RLS no Postgres da Supabase; ataques diretos ao PostgREST com JWT de concorrente e de externo → 0 linhas |
| C2 | Isolamento entre provedores (propostas, versões, rascunhos, comentários, respostas, menções, documentos, comparação, avisos, busca, exportação, revisões) | DONE | 46 ataques na jornada real, todos recusados ou vazios; 0 falhas |
| C3 | Sequestro de convite por concorrente já vinculado | DONE | S3 |
| C4 | Convite sem contato cadastrado (`organization_open`) | OWNER_ACTION_REQUIRED | Com contato, o convite exige o e-mail exato (S12). Sem contato, a API avisa o comprador de que qualquer conta provedora com o link aceita. Decidir: permitir no piloto ou exigir contato em todo provedor convidado |
| C5 | Service role nunca no navegador; demo recusa segredos reais | DONE | `check:security`, `test-demo-mode.mjs`; build demo com `SUPABASE_SERVICE_ROLE_KEY`/`RESEND_API_KEY`/`CRON_SECRET` falha |
| C6 | Console operacional: `finance_ops` + MFA, sem dados de cliente | DONE | Ensaio: admin de empresa (aal1 e aal2), admin de provedor, externo e operador legado com MFA → 403 `finance_ops_required`; `finance_ops` sem MFA → 403 `mfa_required`; com MFA → 200, sem e-mail, valor, título ou comentário |
| C7 | Cron só com segredo | DONE | Sem segredo 401, segredo errado 401, correto 200 (duas vezes, sem duplicar) |
| C8 | Allowlist fail-closed | DONE | Vazia → comprador 403; parcial → provedor fora dela 403; externo 403 |
| C9 | Proteção da branch `main` (status checks obrigatórios) | OWNER_ACTION_REQUIRED | API recusa pela integração (403). Settings → Branches → `main` → exigir `validate`, `database`, `deploy-boundaries`, `presentation` |

## OPERATIONS

| # | Item | Estado | Evidência / próximo passo |
| --- | --- | --- | --- |
| O1 | Contas reais do piloto (comprador, aprovador, provedor, operador) | OWNER_ACTION_REQUIRED | Precisa do Supabase do piloto e dos e-mails autorizados. Procedimento em [Usuários do piloto](#usuários-do-piloto); ensaiado com contas `*.example` |
| O2 | Allowlist preenchida | OWNER_ACTION_REQUIRED | SQL em [Usuários do piloto](#usuários-do-piloto) |
| O3 | Primeiro operador `finance_ops` (papel + registro + TOTP) | OWNER_ACTION_REQUIRED | Passos em [Operador](#operador); o TOTP é cadastrado pelo próprio operador com `npm run finance:operator:mfa` e confirmado no console |
| O4 | Cron de renovação agendado | DONE | `vercel.json`: `/api/jobs/renewals` diário às 09:15 UTC. Só executa com `CRON_SECRET` (E7) |
| O5 | E-mail de aviso ligado | OWNER_ACTION_REQUIRED | Depois de E9: `update public.fin_settings set value = 'true' where key = 'email_enabled';` (nasce `false`; ensaiado nos dois estados) |
| O6 | Runbooks de suporte, incidentes e operação | DONE | `FINANCIAL_PILOT_OPERATIONS.md`, `FINANCIAL_PILOT_SUPPORT.md`, `FINANCIAL_PILOT_PLAYBOOK.md` |

## LEGAL

| # | Item | Estado | Evidência / próximo passo |
| --- | --- | --- | --- |
| L1 | Parecer sobre os 14 pontos de `FINANCIAL_LEGAL_REVIEW_REQUIRED.md` | OWNER_ACTION_REQUIRED | Advogado. Bloqueia o piloto com dados reais |
| L2 | Texto dos termos de uso do piloto | OWNER_ACTION_REQUIRED | Hoje só existe o registro da versão aceita; o produto diz que o texto não foi revisado |
| L3 | Comunicação por e-mail com instituições financeiras | OWNER_ACTION_REQUIRED | Parte de L1; os e-mails não carregam valor, taxa, concorrente, comentário nem documento (verificado) |

## COMMERCIAL

| # | Item | Estado | Evidência / próximo passo |
| --- | --- | --- | --- |
| M1 | Empresa compradora do piloto | OWNER_ACTION_REQUIRED | Preencher `FIRST_FINANCIAL_PILOT.md` |
| M2 | Dois ou três provedores dispostos a responder | OWNER_ACTION_REQUIRED | Idem |
| M3 | Modelo comercial (se e quanto o Arandu cobra) | OWNER_ACTION_REQUIRED | Qualquer modelo ligado a sucesso volta para L1 |

---

## Demo pública

A demonstração roda só no navegador, com dados fictícios, sem Supabase. Em
produção ela não existe (`/demo/index.html` → 404, verificado). Para uma URL
pública, sem conta Vercel e sem conta Arandu:

1. Vercel → **Add New… → Project** → importar `lucasweber1202/Arandu`, nome
   **`arandu-demo`**.
2. **Build & Development Settings**: Build Command `npm run build:demo`;
   Output Directory `dist`; Install Command padrão do `vercel.json`.
3. **Environment Variables**: nenhuma. O build falha se encontrar
   `SUPABASE_*`, `RESEND_API_KEY` ou `CRON_SECRET`.
4. **Settings → Deployment Protection → Vercel Authentication: Disabled**
   (só neste projeto; o projeto `arandu` continua como está).
5. **Settings → Cron Jobs**: desativar (a demo não tem banco; sem `CRON_SECRET`
   a rota responderia 401 de qualquer forma).
6. Deploy. Conferir de uma janela anônima:

```bash
curl -sI https://arandu-demo.vercel.app/ | head -1              # HTTP/2 200 (sem 302 para vercel.com/sso-api)
curl -sI https://arandu-demo.vercel.app/demo | grep -i location  # /demo/index.html
curl -s  https://arandu-demo.vercel.app/demo/index.html | grep -c "Explorar demonstração"
```

## Usuários do piloto

Com o projeto Supabase do piloto criado e as migrations aplicadas (E4, E5):

1. **Allowlist** (SQL Editor; a primeira linha liga a restrição — com a tabela
   vazia ninguém cria organização):

```sql
insert into public.fin_pilot_allowlist (pattern, created_by, note) values
  ('cfo@empresa-piloto.com.br', '<uuid de quem autoriza>', 'comprador'),
  ('aprovador@empresa-piloto.com.br', '<uuid de quem autoriza>', 'aprovador'),
  ('@banco-parceiro.com.br', '<uuid de quem autoriza>', 'provedor');
```

2. **Comprador**: cria a conta em `/cadastro.html` (ou Authentication → Add user
   com e-mail confirmado), entra em `/finance/` e cria a organização compradora.
3. **Aprovador**: o comprador convida em Configurações → Equipe com o papel
   `viewer` (aprova quando é a vez dele); o aprovador cria a conta com o mesmo
   e-mail e aceita o convite. Comprador e aprovador são pessoas diferentes — o
   banco recusa que quem pediu aprove (ensaiado: 403 `not_your_step`).
4. **Provedor**: cria a conta, cria a organização provedora e aceita o convite
   da RFQ pelo link recebido do comprador.
5. **Operador**: ver abaixo. Não precisa de organização.

## Operador

1. Conta no Supabase Auth (Authentication → Add user, e-mail confirmado).
2. Papel de plataforma e registro — SQL Editor:

```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"arandu_role":"finance_ops"}'
 where email = 'operador@seu-dominio';
insert into public.fin_platform_operators (user_id, granted_by)
select id, 'aprovado por <nome>, <data>' from auth.users where email = 'operador@seu-dominio';
```

   `finance_ops` não abre nenhuma tela do admin legado de arte. Um operador
   antigo com `arandu_role = 'operator'` mantém o admin de arte e **não** abre o
   console financeiro até receber `finance_ops`.
3. O **próprio operador**, no terminal dele:
   `SUPABASE_URL=… SUPABASE_ANON_KEY=… npm run finance:operator:mfa` — pede
   e-mail e senha, mostra o segredo TOTP para o aplicativo autenticador e
   confirma o primeiro código.
4. Entrar no Arandu, abrir `/finance/ops.html` e digitar o código do aplicativo
   (o console pede o segundo fator na primeira abertura de cada sessão).
5. Conferir: `ARANDU_ENV=pilot npm run finance:pilot:doctor` → `finance_ops com MFA` = 1.
