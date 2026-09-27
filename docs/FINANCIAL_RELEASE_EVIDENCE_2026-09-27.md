# Evidência de release local — 27/09/2026 (hardening técnico final)

Base: `main` em `a0f85df01bed29673849600f1f239a620ac73707` (merge da #73; sem
commits nem PRs posteriores). Node 24.21.0, npm 11.19.0.
Formal GitHub Actions validation remains blocked by exhausted monthly minutes
until 01/10/2026 ([`GITHUB_ACTIONS_MINUTES.md`](GITHUB_ACTIONS_MINUTES.md)).

## 1. finance_ops isolado do legado

Auditoria completa em [`FINANCIAL_AUTHORIZATION_MAP.md`](FINANCIAL_AUTHORIZATION_MAP.md).

| Ator | Console financeiro | Admin legado | Esperado | Observado (ensaio real) |
| --- | --- | --- | --- | --- |
| `finance_ops` + aal1 | negado | negado | 403 `mfa_required` | 403 `mfa_required` |
| `finance_ops` + aal2 | permitido | negado | console 200; 17 rotas legadas 403 | 200; 17/17 `admin_role_required` |
| `finance_ops` no MFA legado | — | negado | 403 | 403 `admin_role_required` |
| operador legado (`operator`) + aal2 + registro antigo | negado | permitido | 403 no console; admin legado 200 | 403 `finance_ops_required`; admin legado 200 |
| admin de empresa + aal1 | negado | — | 403 | 403 `finance_ops_required` |
| admin de empresa + aal2 | negado | — | 403 | 403 `finance_ops_required` (console e MFA do console) |
| admin de provedor | negado | — | 403 | 403 `finance_ops_required` |
| externo | negado | — | 403 | 403 `finance_ops_required` |
| `finance_ops` sem registro em `fin_platform_operators` | negado | — | forbidden | forbidden (teste de banco) |

## 2. Convite vinculado ao destinatário

| Ataque | Esperado | Observado |
| --- | --- | --- |
| token certo + e-mail certo | aceita | 200 (ensaio) / uuid (banco) |
| token certo + colega do mesmo banco, outro e-mail | recusa genérica | 409 `invite_invalid`, mesma mensagem de token inexistente |
| token certo + concorrente (outro provedor) | recusa | 409 `invite_invalid` |
| token certo + conta sem e-mail | recusa | null → 409 (banco: motivo `no_email`) |
| token certo + e-mail não confirmado | recusa | null → 409 (banco: motivo `email_unconfirmed`) |
| token expirado (e-mail certo) | recusa | 409 `invite_invalid` |
| token revogado (e-mail certo) | recusa | 409 `invite_invalid` |
| token já usado | recusa | 409 |
| provedor B com link de A (cadastro já vinculado) | recusa | 409 |
| convite sem contato (`organization_open`) | aceita, avisando o comprador | 200; API devolve `recipient_mode: organization_open` |

Motivos internos em `fin_invite_acceptance_denials` (sem e-mail), visíveis só no
console `finance_ops` (contagem 24 h e rastreio por RFQ).

## 3. Governança

`check:governance` e `check:staging` voltaram para `check:all` (tinham saído no
pivô financeiro, `d4a8208`). O checker de governança rejeita recursão em
`check:all` (provado com um ciclo artificial) e protege a cobertura de navegador.

## 4. Pilot doctor

Ambiente local completo (após a jornada, do zero):

```
ARANDU FINANCIAL PILOT DOCTOR

ENVIRONMENT
[OK]     ARANDU_ENV — pilot
[OK]     ARANDU_SITE_URL — https
[OK]     SUPABASE_URL — https
[OK]     SUPABASE_ANON_KEY — presente (169 caracteres)
[OK]     SUPABASE_SERVICE_ROLE_KEY — presente só no servidor (180 caracteres)
[OK]     CRON_SECRET — 64 caracteres

SECURITY
[OK]     modo demonstração desligado — desligado
[OK]     chave pública é anon — papel anon
[OK]     chave de servidor é service_role — papel service_role
[OK]     CRON_SECRET próprio — distinto das chaves
[OK]     segredo fora de variável pública — nenhum segredo em VITE_/NEXT_PUBLIC_/PUBLIC_

DATABASE
[OK]     conexão (PostgREST) — respondendo
[OK]     tabelas obrigatórias — 21 presentes
[OK]     funções obrigatórias — 15 presentes
[OK]     versão das migrations — financial-final-hardening-1
[OK]     RLS/grants contra a chave pública — 6 tabelas sensíveis sem leitura anônima

STORAGE
[OK]     fin-documents existe — presente
[OK]     bucket privado — public=false
[OK]     limite de tamanho — 10485760 bytes (esperado 10485760)
[OK]     tipos permitidos — 5 tipos

AUTH
[OK]     Supabase Auth acessível — respondendo
[OK]     login por e-mail — habilitado
[OK]     confirmação de e-mail — exigida (convite por e-mail exato depende disso)

PILOT
[OK]     allowlist — 3 entradas
[OK]     empresas compradoras — 1
[OK]     organizações provedoras — 2
[OK]     política de aprovação — 1 empresa(s) exigem aprovação
[OK]     operadores finance_ops — 1 com papel e registro; 1 registro(s) sem papel finance_ops (não abrem o console)

EMAIL
[WARN]   provedor — não configurado (disabled) — convites entregues manualmente
[OK]     email_enabled — false
[OK]     falhas definitivas na fila — 0

CRON
[OK]     agenda de renovação — /api/jobs/renewals em vercel.json
[OK]     segredo do cron — configurado
[OK]     última execução — succeeded há 0 h

OPERATIONS
[OK]     finance_ops com MFA — 1 pronto(s) para o console
[WARN]   operador legado — 1 conta(s) com arandu_role=operator: admin de arte, sem acesso ao console financeiro
[OK]     envios presos (> 1 h) — 0
[OK]     envios com falha (24 h) — 0
[OK]     API publicada — /api/health respondendo
[OK]     API financeira — /api/finance/products respondendo
[OK]     rota do cron — chega ao código e exige segredo

RESULT
GO (exit 0) — 39 OK, 2 WARN, 0 ERROR, 0 UNSAFE
```

Cenários (`bash scripts/pilot-local/doctor.sh`):

```
== ambiente completo: exit 0 (esperado 0)
GO (exit 0) — 39 OK, 2 WARN, 0 ERROR, 0 UNSAFE
JSON (ambiente completo): /home/user/Arandu/scripts/pilot-local/.state/doctor.json
== sem service role e sem CRON_SECRET: exit 1 (esperado 1)
[ERROR]  SUPABASE_SERVICE_ROLE_KEY — ausente — documentos e cron não funcionam
[ERROR]  CRON_SECRET — ausente
[ERROR]  conexão — sem SUPABASE_URL, chave anon e service role não há como diagnosticar
[ERROR]  conexão — sem SUPABASE_URL, chave anon e service role não há como diagnosticar
[ERROR]  conexão — sem SUPABASE_URL, chave anon e service role não há como diagnosticar
[ERROR]  conexão — sem SUPABASE_URL, chave anon e service role não há como diagnosticar
[ERROR]  segredo do cron — ausente ou curto
NO-GO (exit 1) — 12 OK, 2 WARN, 7 ERROR, 0 UNSAFE
== chave de serviço no lugar da anon: exit 2 (esperado 2)
[UNSAFE] chave pública é anon — SUPABASE_ANON_KEY é uma chave de serviço (atravessa o RLS no navegador)
[UNSAFE] RLS/grants contra a chave pública — anon lê: fin_rfqs, fin_proposal_versions, fin_private_documents, fin_pilot_allowlist, fin_platform_operators, fin_invite_acceptance_denials
UNSAFE (exit 2) — 37 OK, 2 WARN, 0 ERROR, 2 UNSAFE
== bucket de documentos público: exit 2 (esperado 2)
[UNSAFE] bucket privado — bucket PÚBLICO: documentos acessíveis sem autorização
UNSAFE (exit 2) — 38 OK, 2 WARN, 0 ERROR, 1 UNSAFE
cenários com código inesperado: 0
```

Produção atual (`ARANDU_SITE_URL=https://arandu-bice.vercel.app`, sem chaves):

```
ARANDU FINANCIAL PILOT DOCTOR

ENVIRONMENT
[OK]     ARANDU_ENV — pilot
[OK]     ARANDU_SITE_URL — https
[ERROR]  SUPABASE_URL — ausente
[ERROR]  SUPABASE_ANON_KEY — ausente
[ERROR]  SUPABASE_SERVICE_ROLE_KEY — ausente — documentos e cron não funcionam
[ERROR]  CRON_SECRET — ausente

SECURITY
[OK]     modo demonstração desligado — desligado
[OK]     CRON_SECRET próprio — distinto das chaves
[OK]     segredo fora de variável pública — nenhum segredo em VITE_/NEXT_PUBLIC_/PUBLIC_

DATABASE
[ERROR]  conexão — sem SUPABASE_URL, chave anon e service role não há como diagnosticar

STORAGE
[ERROR]  conexão — sem SUPABASE_URL, chave anon e service role não há como diagnosticar

AUTH
[ERROR]  conexão — sem SUPABASE_URL, chave anon e service role não há como diagnosticar

PILOT
[ERROR]  conexão — sem SUPABASE_URL, chave anon e service role não há como diagnosticar

EMAIL
[WARN]   provedor — não configurado (disabled) — convites entregues manualmente
[WARN]   email_enabled — não lido

CRON
[OK]     agenda de renovação — /api/jobs/renewals em vercel.json
[ERROR]  segredo do cron — ausente ou curto

OPERATIONS
[OK]     API publicada — /api/health respondendo
[ERROR]  API financeira — HTTP 503 rate_limit_unavailable — consume_rate_limit ausente no banco
[OK]     rota do cron — chega ao código e exige segredo

RESULT
NO-GO (exit 1) — 8 OK, 2 WARN, 10 ERROR, 0 UNSAFE
```

Nenhuma chave, segredo, senha ou e-mail apareceu nas saídas humana e JSON
(conferido por busca literal dos valores).

## 5. Jornada real (Supabase local, do zero)

`bash scripts/pilot-local/down.sh && bash scripts/pilot-local/up.sh && bash scripts/pilot-local/journey.sh`:
34 migrations aplicadas; bucket `fin-documents` privado, 10 MB, 5 tipos.


App: https://localhost:4443 · Supabase: https://localhost:8443 · execução 089e52

### Jornada

| Step | Status | Evidence |
| --- | --- | --- |
| Contas de piloto criadas no Supabase Auth (buyer, approver, provider A/B, colega de A, externo, finance_ops, operador legado) | PASS | 8 contas (senha aleatória por execução, e-mails *.example) |
| Login real pela API (/api/auth/login → cookie HttpOnly) | PASS | seis sessões aal1 emitidas pelo GoTrue |
| Comprador: organização, perfil e nome | PASS | org 18bd5fd5… |
| Aprovador entra por convite de membro (papel viewer) | PASS | 2 membros, sem e-mail na resposta |
| Provedores A e B criam suas organizações | PASS | duas organizações PROVIDER; colega de A é membro do Banco A |
| Preferências de e-mail (comprador e aprovador) com email_enabled=false | PASS | opt-in por tipo de aviso |
| RFQ de crédito criada, provedores cadastrados e convidados | PASS | rfq 1558a0e4…, dois convites de uso único vinculados ao e-mail do contato |
| Provedor B aceita o próprio convite | PASS | vaga B ocupada pela conta B |
| Provedor A aceita o próprio convite; reuso recusado; RFQ em coleta | PASS | reuso recusado (409) |
| Convite sem contato cadastrado é explicitamente organization_open | PASS | API avisa "organization_open"; conta provedora com o link aceitou; recusas auditadas internamente: recipient_mismatch,recipient_mismatch,recipient_mismatch |
| Provedor A: rascunho com autosave, retomada e envio (email_enabled=false) | PASS | autosave rev 1, conflito 409, 0 e-mails na fila |
| Provedor B envia proposta (email_enabled=true → proposal_received na fila) | PASS | 1 aviso(s) na fila; proposta A agora na versão 2 |
| Comentários: interno, visível ao provedor, resposta e menção | PASS | menção entregue ao aprovador; A vê 3 mensagens da própria proposta; nota interna só no comprador |
| Documentos: upload interno e compartilhado (bucket privado, prazo real da URL, reserva de 10 min) | PASS | URL de upload: 60s (definido pelo Storage, informado corretamente pela API); reserva: 600s |
| Documentos: download do comprador (URL de 60 s, conteúdo íntegro) | PASS | download TTL 60s; comprador também lê a minuta enviada por A (true) |
| Documentos: versão 2, histórico e remoção | PASS | v1 e v2 baixáveis, documento removido |
| Comparação factual e pesos definidos pelo comprador | PASS | 9 critérios comparáveis; pesos {"offered_amount":70,"interest_rate_month":30} |
| Pedido de aprovação (política exige aprovação) | PASS | decisão antes da aprovação recusada (409) |
| Aprovador revisa e aprova | PASS | status approved |
| Decisão, contrato, documento do contrato e renovação | PASS | RFQ em contracted; contrato c12122de… termina em 2027-01-25 |
| Cron com segredo: marcos 90/60/30/aviso pela rota HTTP, duas execuções cada, sem duplicar | PASS | d90:0+0 d60:0+0 d30:0+0 notice:0+0 (tarefas criadas por execução); final {"milestones":4,"tasks":1,"notifications":4,"events":6}; 1 tarefa aberta, 0 marco/aviso/evento duplicado; 8 execuções registradas |
| E-mail: mention, approval_requested, proposal_received, renewal_due na fila, sem conteúdo do processo | PASS | 8 e-mails: approval_requested, mention, proposal_received, renewal_due; payload só {event, kind, path}; nenhum valor, taxa, concorrente, comentário ou documento |
| E-mail: preferência desligada e limite de 20/h por destinatário | PASS | preferência respeitada; 30 avisos → 20 e-mails na última hora |
| finance_ops: cadastra TOTP (npm run finance:operator:mfa), confirma no próprio console e abre o console | PASS | código errado recusado (401); overview sem e-mail/valor/título; recusas de convite no rastreio (recipient_mismatch, recipient_mismatch); 2 acessos auditados |

### Ataques

| Attack | Expected | Observed | Status |
| --- | --- | --- | --- |
| Allowlist vazia: comprador cria organização | recusado (fail-closed) | 403 pilot_access_not_allowed | PASS |
| Allowlist parcial (só o comprador): provedor cria organização | recusado | 403 pilot_access_not_allowed | PASS |
| Conta fora da allowlist cria organização | recusado | 403 pilot_access_not_allowed | PASS |
| Colega do Banco A (mesmo domínio, outro e-mail) aceita o convite de A | recusado, erro genérico | 409 invite_invalid; mesma mensagem de token inexistente=true | PASS |
| Provedor B (já na RFQ) aceita o link encaminhado do provedor A | recusado | 409 invite_invalid | PASS |
| Nova RFQ: B usa o link de "Banco A" (cadastro já vinculado à conta A) | recusado | B 409 invite_invalid; A 200 | PASS |
| Convite expirado (e-mail certo) | recusado | 409 invite_invalid | PASS |
| Convite revogado (e-mail certo, dentro do prazo) | recusado | 409 invite_invalid | PASS |
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
| Duas execuções simultâneas do cron no mesmo dia | 1 marco, 1 aviso | 200/200; marcos expired=1, avisos=1 | PASS |
| Sessão expirada sem refresh token | 401 | 401 | PASS |
| Admin de empresa (aal1) abre o console | 403 finance_ops_required | 403 finance_ops_required | PASS |
| Admin de provedor abre o console | 403 finance_ops_required | 403 finance_ops_required | PASS |
| Externo abre o console | 403 | 403 finance_ops_required | PASS |
| finance_ops sem MFA (aal1) abre o console | 403 mfa_required | 403 mfa_required | PASS |
| Admin de empresa com MFA (aal2), sem papel finance_ops | 403 finance_ops_required | aal=aal2; console 403 finance_ops_required; MFA do console 403 finance_ops_required | PASS |
| Operador legado (arandu_role=operator) com MFA e registro antigo abre o console | 403 finance_ops_required; admin legado intacto | admin legado 200 (role operator); console 403 finance_ops_required | PASS |
| finance_ops tenta o MFA do admin legado | 403 admin_role_required | 403 admin_role_required | PASS |
| finance_ops com MFA nas 17 rotas do admin legado de arte | 403 admin_role_required em todas | 17/17 recusadas com admin_role_required | PASS |


## 6. Suíte local equivalente ao CI

| Passo | Resultado |
| --- | --- |
| `npm ci --include=optional` | OK |
| `npm run audit:ci` | OK — 0 vulnerabilidades |
| `npm run sbom:ci` | OK — 21 componentes |
| `npm run check:governance` | OK — 0 problemas |
| `npm run check:all` | OK (inclui governance, staging, doctor offline) |
| `npm run build` / `check:dist-assets` / `check:build-size` / `check:seo:dist` | OK |
| `check:financial-surface` + `check:financial-navigation` | OK |
| `npm run test:database` (PostgreSQL 16) | OK — limpo, upgrade, rollback e reaplicação da nova migration |
| E2E `finance-procurement.spec.js` | 40/40 — Chromium desktop + mobile Chrome |
| `test:e2e:presentation` | 27 passaram, 1 pulado (só-móvel no projeto desktop) — Chromium desktop + mobile Chrome |
| `deploy-boundaries` (preview com demo, produção sem demo, demo forçado recusado, `build:demo`, `predeploy` BLOQUEADO) | OK |
| `git diff --check` | OK |

| Motor | Estado |
| --- | --- |
| Chromium desktop | executado |
| mobile Chrome | executado |
| Firefox | NOT RUN (não instalado; download proibido neste ambiente) |
| WebKit | NOT RUN |
| mobile Safari | NOT RUN |

## 7. CODE_PENDING

Nenhum item de código pendente nos cinco pontos desta rodada.
