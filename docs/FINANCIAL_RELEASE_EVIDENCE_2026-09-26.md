# Evidência de release local — 26/09/2026

Base: `main` em `4c2a9330557cb4aa695fc4cd4699b473d3e99bc0` (merge da #72; sem
commits nem PRs posteriores). O GitHub Actions está sem minutos até 01/10/2026
([`GITHUB_ACTIONS_MINUTES.md`](GITHUB_ACTIONS_MINUTES.md)); tudo abaixo foi
executado neste ambiente, com Node 24.21.0 e npm 11.19.0.

Checklist de go-live: [`FINANCIAL_PILOT_GO_LIVE.md`](FINANCIAL_PILOT_GO_LIVE.md).

## 1. Suíte equivalente ao CI

Mesmos comandos de `.github/workflows/ci.yml`, com `ARANDU_SITE_URL=https://arandu.example.com`.

| Job do CI | Passo | Resultado |
| --- | --- | --- |
| validate | `npm ci --include=optional` | OK |
| validate | `npm run audit:ci` | OK — 0 vulnerabilidades |
| validate | `npm run sbom:ci` | OK — CycloneDX, 21 componentes |
| validate | `npm run check:all` | OK (inclui o novo `check:vercel-routing`) |
| validate | `npm run build` | OK |
| validate | `npm run check:build-size` | OK |
| validate | `npm run check:dist-assets` | OK |
| validate | `npm run check:seo:dist` | OK |
| validate | `check:financial-surface` + `check:financial-navigation` | OK |
| validate | E2E `finance-procurement.spec.js` | **40/40** em Chromium desktop + mobile-chrome; 100 casos listados nos 5 motores (`test:e2e:list`) |
| presentation | build de apresentação + `presentation`/`demo` journeys | **27 passaram, 1 pulado** (teste só-móvel no projeto desktop) em Chromium desktop + mobile-chrome |
| database | `npm run test:database` (PostgreSQL 16) | OK — instalação limpa, upgrade, reaplicação, rollback, RLS e a migration nova |
| deploy-boundaries | `VERCEL_ENV=preview npm run vercel-build` + demo presente | OK |
| deploy-boundaries | `VERCEL_ENV=production npm run vercel-build` + sem demo | OK |
| deploy-boundaries | demo forçado em produção | recusado: "ARANDU_DEMO_MODE não pode ser ativado na produção financeira" |
| deploy-boundaries | `npm run build:demo` | OK |
| deploy-boundaries | `build:demo` com `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` | recusado: "Build demonstrativo independente com credenciais reais no ambiente" |
| deploy-boundaries | `npm run predeploy` fail-closed | OK — "BLOQUEADO" (produção, evidências externas, catálogo real) |
| — | `git diff --check` | OK |

**Motores:** só o Chromium pré-instalado (build 1194) existe neste ambiente, e
baixar navegadores é proibido aqui. Firefox, WebKit desktop e Safari móvel
**não foram executados** — rodam no CI quando a quota voltar. Nenhum sucesso foi
declarado para eles.

### `dist` da demo (`npm run build:demo`)

- 19 páginas em `dist/demo/` (entrada, 14 telas do comprador, 4 do provedor), 900 KB no total;
- nenhum token com formato JWT, nenhuma URL `*.supabase.co`; a única ocorrência de
  `CRON_SECRET` é o rótulo "CRON_SECRET ausente ou curto" do console demonstrativo;
- motor da demo (`engine-*.js`) e `arandu_demo_state_v1` só no bundle da demo;
  o build de produção não contém `/demo` (`test-demo-mode.mjs --dist`).

## 2. Ambiente real: produção e Vercel

| Verificação | Resultado |
| --- | --- |
| `GET https://arandu-bice.vercel.app/` | 200, "Arandu \| Procurement financeiro B2B" |
| `/api/health` | 200 `{"status":"alive"}` |
| `/demo/index.html` em produção | 404 (correto: produção não inclui a demo) |
| `/finance/ops.html` | 200 (casca; dados exigem operador + MFA) |
| `/api/finance/me`, `/api/auth/login`, `/api/jobs/renewals` | **`NOT_FOUND` da própria Vercel** — corrigido nesta PR (ver 4.1) |
| Previews `arandu-*-lucas-projects467.vercel.app` | 302 → `vercel.com/sso-api` (Deployment Protection) |
| Acesso à API da Vercel / Supabase desta sessão | 403 / 401 — sem credenciais |

## 3. Ensaio com componentes reais da Supabase

Sem projeto Supabase acessível, o piloto foi ensaiado com as imagens oficiais
(`public.ecr.aws/supabase`): **Postgres 15.14 da Supabase, GoTrue v2.181, PostgREST
v12.2, Storage API v1.25**, atrás de um gateway HTTPS, e o Arandu real
(`dist/` + funções de `api/`, com o mesmo roteamento do `vercel.json`).

```bash
npm run pilot:local:up        # sobe a stack, aplica as 33 migrations
npm run pilot:local:journey   # jornada real + ataques
npm run pilot:local:down
```

- 33/33 migrations aplicam em ordem; as 13 financeiras reaplicam sem erro; a
  migration nova aplica, reverte e reaplica.
- `fin-documents`: `public=false`, `10485760` bytes, 5 tipos MIME; nenhuma
  política em `storage.objects` (o navegador nunca acessa o bucket).
- 32/32 tabelas `fin_*` com RLS.
- Reproduzido do zero (derrubar, `up`, `journey`) nesta rodada.


App: https://localhost:4443 · Supabase: https://localhost:8443 · execução 75b3b4

### Jornada

| Step | Status | Evidence |
| --- | --- | --- |
| Contas de piloto criadas no Supabase Auth (buyer, approver, provider A/B, externo, operador) | PASS | 6 contas (senha aleatória por execução, e-mails *.example) |
| Login real pela API (/api/auth/login → cookie HttpOnly) | PASS | seis sessões aal1 emitidas pelo GoTrue |
| Comprador: organização, perfil e nome | PASS | org 81900ab3… |
| Aprovador entra por convite de membro (papel viewer) | PASS | 2 membros, sem e-mail na resposta |
| Provedores A e B criam suas organizações | PASS | duas organizações PROVIDER |
| Preferências de e-mail (comprador e aprovador) com email_enabled=false | PASS | opt-in por tipo de aviso |
| RFQ de crédito criada, provedores cadastrados e convidados | PASS | rfq 6d75a7b2…, dois convites de uso único |
| Provedor B aceita o próprio convite | PASS | vaga B ocupada pela conta B |
| Provedor A aceita o próprio convite; reuso recusado; RFQ em coleta | PASS | reuso recusado (409) |
| Provedor A: rascunho com autosave, retomada e envio (email_enabled=false) | PASS | autosave rev 1, conflito 409, 0 e-mails na fila |
| Provedor B envia proposta (email_enabled=true → proposal_received na fila) | PASS | 1 aviso(s) na fila; proposta A agora na versão 2 |
| Comentários: interno, visível ao provedor, resposta e menção | PASS | menção entregue ao aprovador; A vê 3 mensagens da própria proposta; nota interna só no comprador |
| Documentos: upload interno e compartilhado (bucket privado, prazo real da URL, reserva de 10 min) | PASS | URL de upload: 60s (definido pelo Storage, informado corretamente pela API); reserva: 600s |
| Documentos: download do comprador (URL de 60 s, conteúdo íntegro) | PASS | download TTL 60s; comprador também lê a minuta enviada por A (true) |
| Documentos: versão 2, histórico e remoção | PASS | v1 e v2 baixáveis, documento removido |
| Comparação factual e pesos definidos pelo comprador | PASS | 9 critérios comparáveis; pesos {"offered_amount":70,"interest_rate_month":30} |
| Pedido de aprovação (política exige aprovação) | PASS | decisão antes da aprovação recusada (409) |
| Aprovador revisa e aprova | PASS | status approved |
| Decisão, contrato, documento do contrato e renovação | PASS | RFQ em contracted; contrato 76e38cac… termina em 2027-01-24 |
| Cron com segredo: marcos 90/60/30/aviso pela rota HTTP, duas execuções cada, sem duplicar | PASS | d90:0+0 d60:0+0 d30:0+0 notice:0+0 (tarefas criadas por execução); final {"milestones":4,"tasks":1,"notifications":4,"events":6}; 1 tarefa aberta, 0 marco/aviso/evento duplicado; 8 execuções registradas |
| E-mail: mention, approval_requested, proposal_received, renewal_due na fila, sem conteúdo do processo | PASS | 7 e-mails: approval_requested, mention, proposal_received, renewal_due; payload só {event, kind, path}; nenhum valor, taxa, concorrente, comentário ou documento |
| E-mail: preferência desligada e limite de 20/h por destinatário | PASS | preferência respeitada; 30 avisos → 20 e-mails na última hora |
| Operador: cadastra TOTP (scripts/finance-operator-mfa.mjs), MFA pelo login administrativo, console abre | PASS | health={"database_configured":true,"server_key_configured":true,"cron_secret_configured":true,"email_provider_configured":false,"deployment":"local","commit":null}; sem e-mail/valor/título/comentário; 2 acessos auditados |

### Ataques

| Attack | Expected | Observed | Status |
| --- | --- | --- | --- |
| Allowlist vazia: comprador cria organização | recusado (fail-closed) | 403 pilot_access_not_allowed | PASS |
| Allowlist parcial (só o comprador): provedor cria organização | recusado | 403 pilot_access_not_allowed | PASS |
| Conta fora da allowlist cria organização | recusado | 403 pilot_access_not_allowed | PASS |
| Provedor B (já na RFQ) aceita o link encaminhado do provedor A | recusado | 409 invite_invalid | PASS |
| Nova RFQ: B usa o link de "Banco A" (cadastro já vinculado à conta A) | recusado | B 409 invite_invalid; A 200 | PASS |
| Comprador aprova o próprio pedido (buyer ≠ approver) | recusado | 403 not_your_step | PASS |
| B lê a RFQ inteira (/rfq/:id) e vê a proposta de A | só a própria proposta | 200; proposta de A ausente | PASS |
| B lista propostas da RFQ (?rfq_id) | só a própria | 200; ids=1, A ausente | PASS |
| B abre a comparação | recusado | 403 organization_forbidden | PASS |
| B lê o rascunho da proposta de A | recusado | 404 proposal_not_found | PASS |
| B grava no rascunho de A | recusado | 404 proposal_not_found | PASS |
| B envia versão da proposta de A | recusado | 404 proposal_not_found | PASS |
| B lê comentários da proposta de A | nenhum | 200 rows=0 | PASS |
| B lê comentários internos da RFQ | nenhum interno | 200 rows=0; interno ausente | PASS |
| B responde ao comentário de A | recusado | 403 forbidden | PASS |
| B menciona o comprador em objeto de A | recusado | 403 forbidden | PASS |
| Concluir envio com reserva de mais de 10 minutos | recusado | PUT 200; concluir 404 upload_not_pending; download 409 document_not_available | PASS |
| B baixa documento enviado por A | recusado | 403 forbidden | PASS |
| B baixa documento interno do comprador | recusado | 403 forbidden | PASS |
| A baixa documento interno do comprador | recusado | 403 forbidden | PASS |
| A baixa documento compartilhado da RFQ | permitido | 200 | PASS |
| B lista documentos da proposta de A | nenhum | 200 rows=0 | PASS |
| Download de documento removido | recusado | 403 forbidden | PASS |
| Externo baixa documento compartilhado | recusado | 403 forbidden | PASS |
| Externo lê a RFQ | recusado | 404 rfq_not_found | PASS |
| B usa a busca global | recusado (só comprador) | 400 organization_kind | PASS |
| B lê revisões da RFQ com org do comprador | recusado | 403 organization_forbidden | PASS |
| B lê avisos do comprador | recusado | 403 organization_forbidden | PASS |
| Avisos de B citam proposta/comentário de A | nenhum | 200 rows=0; sem referência a A | PASS |
| B exporta o processo | recusado | 403 organization_forbidden | PASS |
| PostgREST direto com JWT de B: fin_proposals | 0 linhas | 200 rows=0 | PASS |
| PostgREST direto com JWT de B: fin_proposal_versions | 0 linhas | 200 rows=0 | PASS |
| PostgREST direto com JWT de B: fin_proposal_drafts | 0 linhas | 200 rows=0 | PASS |
| PostgREST direto com JWT de B: fin_comments | 0 linhas | 200 rows=0 | PASS |
| PostgREST direto com JWT de B: fin_private_documents | 0 linhas | 200 rows=0 | PASS |
| PostgREST direto com JWT de B: fin_decisions | 0 linhas | 200 rows=0 | PASS |
| PostgREST direto com JWT de B: fin_approval_requests | 0 linhas | 200 rows=0 | PASS |
| PostgREST direto com JWT de B: fin_notifications | 0 linhas | 200 rows=0 | PASS |
| PostgREST direto com JWT de B: fin_events | 0 linhas | 200 rows=0 | PASS |
| PostgREST direto com JWT externo: fin_rfqs / fin_proposal_versions | 0 linhas | rfqs=0, versions=0 | PASS |
| Storage direto com JWT de A (objeto do bucket privado) | recusado | autenticado 400, público 400 | PASS |
| Cron sem segredo | 401 | 401 cron_unauthorized | PASS |
| Cron com segredo errado | 401 | 401 cron_unauthorized | PASS |
| Admin de empresa (aal1, não operador) abre o console | 403 | 403 mfa_required | PASS |
| Operador sem MFA (aal1) abre o console | 403 mfa_required | 403 mfa_required | PASS |
| Admin de empresa com MFA (aal2), sem registro de operador | recusado | aal=aal2; 403 forbidden | PASS |


Contas criadas por execução com e-mails `*.example` e senha aleatória; nenhuma
é pessoa real.

## 4. Achados e correções desta rodada

### 4.1 P0 — API de vários segmentos inalcançável na Vercel
Fora do Next.js, `api/[...path].js` só recebe caminhos de um segmento. Em
produção, `/api/finance/*` (portal real inteiro), `/api/auth/*` (login,
cadastro, sessão) e `/api/jobs/renewals` (cron) respondiam a página `NOT_FOUND`
da plataforma. O mesmo afetava `/.well-known/security.txt` (o rewrite chegava à
função, mas com o caminho original). Correção: rewrite
`/api/:aranduScope/:aranduRest+ → /api/dispatch` (arquivos próprios de `api/`
continuam com precedência e não casam com o padrão) e roteador reconhece
security.txt pelo caminho original. Guarda: `npm run check:vercel-routing`,
dentro de `check:all` — falha na `main` anterior.
**Verificação em produção só é possível depois do merge** (checklist E3).

### 4.2 P1 — Concorrente ocupava a vaga de outro provedor com o link encaminhado
`fin_accept_provider_invite` aceitava o token de qualquer conta provedora. Agora
recusa quando o cadastro do comprador já está vinculado a outra conta e quando a
conta já ocupa outra vaga na mesma RFQ. Residual (decisão do proprietário, C4):
o primeiro aceite de um provedor nunca vinculado depende só do token.

### 4.3 P1 — Aviso e e-mail de renovação nunca saíam
`fin_register_contract` abre a tarefa de revisão junto com o contrato; a agenda
só avisava quando criava tarefa nova. Resultado: nenhum `renewal_due` para
contratos registrados pelo produto. O teste de banco anterior inseria contratos
sem essa tarefa e não pegava. Agora: um aviso por marco novo, chaveado pelo
marco; o teste de `financial-delivery.sql` foi ajustado para a regra correta.

### 4.4 P2 — Prazo da URL de envio não era o anunciado
O Storage ignora `expiresIn` na assinatura de upload (60 s self-hosted, 2 h
hospedado); a API respondia `expires_in: 120` fixo. Agora informa o prazo lido
do token e o banco limita a reserva a 10 minutos (`complete_within: 600`);
reserva vencida vira `failed` e nunca fica disponível.

### 4.5 P2 — Operador sem caminho para MFA
O console exige `aal2`, e o login administrativo só emite `aal2` para quem já
tem TOTP verificado — que o Arandu não tinha como cadastrar.
`npm run finance:operator:mfa` faz o cadastro com a chave pública, no terminal
do próprio operador.

### 4.6 Documentação e checker desatualizados
`finance:env:check` e três documentos diziam que allowlist vazia deixa o acesso
aberto — o banco faz o oposto (ninguém entra). O checker também dizia que o
procurement não usa o service role; documentos e o cron usam, só no servidor.

## 5. QA visual

Build da demo, Chromium, larguras 1440, 768, 430 e 390 px: painel, lista de
RFQs, detalhe (visão geral, propostas, comparação, atividade), aprovações,
contratos, provedores, console operacional, nova RFQ, configurações, portal e
proposta do provedor — 56 capturas.

- rolagem horizontal da página: nenhuma;
- elemento fora da largura da tela fora de contêiner rolável: nenhum;
- controle preso sob a barra fixa inferior ou superior depois de rolar: nenhum
  (os alertas iniciais eram campos dentro de seções `<details>` fechadas);
- erros de console: nenhum.

Nenhuma regressão visual concreta encontrada; nada alterado na interface.

## 6. CODE_PENDING

- **Papel administrativo mínimo para o operador financeiro.** Hoje o operador
  usa `arandu_role = 'operator'`, que também dá escrita no admin legado de arte.
  Criar `finance_ops` exige auditar cada rota administrativa antiga (algumas
  checam permissão só dentro do handler) — não foi feito às cegas.
