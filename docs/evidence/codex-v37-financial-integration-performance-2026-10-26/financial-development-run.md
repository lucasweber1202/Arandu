# Jornada real do piloto — 2026-10-26T21:09:09.374Z

App: https://localhost:4459 · Supabase: https://localhost:8459 · execução e42d04

## Jornada

| Step | Status | Evidence |
| --- | --- | --- |
| Contas de piloto criadas no Supabase Auth (buyer, approver, provider A/B, colega de A, externo, finance_ops, operador legado) | PASS | 8 contas (senha aleatória por execução, e-mails *.example) |
| Login real pela API (/api/auth/login → cookie HttpOnly) | PASS | seis sessões aal1 emitidas pelo GoTrue |
| Comprador: organização, perfil e nome | PASS | org 57bddc89… |
| Aprovador entra por convite de membro (papel viewer) | PASS | 2 membros, sem e-mail na resposta |
| Provedores A e B criam suas organizações | PASS | duas organizações PROVIDER; colega de A é membro do Banco A |
| Preferências de e-mail (comprador e aprovador) com email_enabled=false | PASS | opt-in por tipo de aviso |
| RFQ de crédito criada, provedores cadastrados e convidados | PASS | rfq be216f1d…, dois convites de uso único vinculados ao e-mail do contato |
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
| Decisão, contrato, documento do contrato e renovação | PASS | RFQ em contracted; contrato 1715f021… termina em 2027-02-23 |
| Lifecycle contextual: decisão preservada, contrato, Central e tarefa concluída | PASS | RFQ → decisão/versionamento → contrato → instituição → tarefa concluída, com sessão e banco reais |
| Portal contextual: instituição lê somente sua proposta pelo link exato | PASS | própria proposta disponível; concorrente e decisão interna recusados |
| Cron com segredo: marcos 90/60/30/aviso pela rota HTTP, duas execuções cada, sem duplicar | PASS | d90:0+0 d60:0+0 d30:0+0 notice:0+0 (tarefas criadas por execução); final {"milestones":4,"tasks":2,"notifications":4,"events":6}; 1 tarefa aberta, 0 marco/aviso/evento duplicado; 8 execuções registradas |
| E-mail: mention, approval_requested, proposal_received, renewal_due na fila, sem conteúdo do processo | PASS | 8 e-mails: approval_requested, mention, proposal_received, renewal_due; payload só {event, kind, path}; nenhum valor, taxa, concorrente, comentário ou documento |
| E-mail: preferência desligada e limite de 20/h por destinatário | PASS | preferência respeitada; 30 avisos → 20 e-mails na última hora |
| finance_ops: cadastra TOTP (npm run finance:operator:mfa), confirma no próprio console e abre o console | PASS | código errado recusado (401); overview sem e-mail/valor/título; recusas de convite no rastreio (recipient_mismatch, recipient_mismatch); 2 acessos auditados |
| Contrato existente real: intenção, resposta descartada, recibo, retry, responsável e próxima ação | PASS | real API + Auth + PostgreSQL/RLS; one contract, one task; response body discarded deliberately |
| Proposta externa real: documento Storage, revisão e comparação sem autoria institucional presumida | PASS | real document upload, reviewed external version 1, comparison and replay |
| Proposta externa real: aprovação segregada, decisão, vínculo contratual e snapshot preservado | PASS | independent approval; one human decision; explicit link to existing imported contract; unchanged snapshot |

## Ataques

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
| B (convidado na RFQ) lê o Financial Passport da compradora | recusado | 403 organization_forbidden | PASS |
| B lê a fotografia do Passport na RFQ | recusado | 403 organization_forbidden | PASS |
| B grava no Passport da compradora | recusado | 403 organization_forbidden | PASS |
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
| Externo pergunta à allowlist se um domínio participa do piloto | recusado (42501) | 403 42501 | PASS |
| Externo descobre a organização dona da RFQ pelo UUID | recusado (42501) | 403 42501 | PASS |
| Anônimo chama RPC financeira e lê view legada de arte | recusado | rpc 401 42501; view 404 | PASS |
| Storage direto com JWT de A (objeto do bucket privado) | recusado | autenticado 400, público 400 | PASS |
| Cron sem segredo | 401 | 401 cron_unauthorized | PASS |
| Cron com segredo errado | 401 | 401 cron_unauthorized | PASS |
| Duas execuções simultâneas do cron no mesmo dia | 1 marco, 1 aviso; cada job concluído por uma das execuções, nenhum falho | 202/202; jobs renewals=succeeded/busy, contract_milestones=busy/succeeded, approval_deadlines=succeeded/busy, opportunities=busy/succeeded; marcos expired=1, avisos=1 | PASS |
| Sessão expirada sem refresh token | 401 | 401 | PASS |
| Admin de empresa (aal1) abre o console | 403 finance_ops_required | 403 finance_ops_required | PASS |
| Admin de provedor abre o console | 403 finance_ops_required | 403 finance_ops_required | PASS |
| Externo abre o console | 403 | 403 finance_ops_required | PASS |
| finance_ops sem MFA (aal1) abre o console | 403 mfa_required | 403 mfa_required | PASS |
| Admin de empresa com MFA (aal2), sem papel finance_ops | 403 finance_ops_required | aal=aal2; console 403 finance_ops_required; MFA do console 403 finance_ops_required | PASS |
| Operador legado (arandu_role=operator) com MFA e registro antigo abre o console | 403 finance_ops_required; admin legado fechado no piloto (404) | admin legado 404 route_not_found; console 403 finance_ops_required | PASS |
| finance_ops tenta o MFA do admin legado | 404 route_not_found | 404 route_not_found | PASS |
| finance_ops com MFA nas 17 rotas legadas de arte | 404 route_not_found em todas (ARANDU_ENV=pilot) | 17/17 fechadas | PASS |
| Anônimo grava lead pelo formulário legado de arte no banco do piloto | 404; tabela de leads inexistente (decommission) | 404 route_not_found; public.leads ausente | PASS |
| Contrato existente: outra instituição não lê recibo nem contrato | 403 receipt / 404 detail | 403/404 | PASS |
| Proposta externa real: escrita com versão obsoleta e leitura por instituição concorrente | 409 / empty authorized view | 409/403 | PASS |
