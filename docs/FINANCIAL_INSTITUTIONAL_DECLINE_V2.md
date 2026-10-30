# Recusa institucional de convite

Antes, recusar não tinha comando de domínio próprio; aceitar criava proposta e concedia acesso. Agora a instituição pode recusar diretamente, com identidade e histórico, sem aceitar nem criar proposta.

## API aditiva

`POST /api/finance/invites/decline`, sessão obrigatória, organização PROVIDER do usuário e papel admin/provider_user. Mantém rate limits financeiros e `no-store`. Somente JWT do usuário; banco valida novamente identidade, destinatário, vínculo institucional, freeze e estado.

```json
{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","provider_organization_id":"00000000-0000-4000-8000-000000000021","expected_status":"invited","confirmed":true,"reason":"capacity"}
```

Obrigatórios: token hexadecimal de 64 caracteres, organização, estado esperado `invited`, confirmação booleana verdadeira. Opcional: `reason=null|not_offered|capacity|deadline|other`; não exige informação comercial ou justificativa confidencial. Campos extras recusados. Token vai no corpo, nunca em query/log.

`200 {ok:true,invite_id:UUID,status:"declined",declined_at:TIMESTAMP,replayed:false}`. Replay do mesmo convite/organização/motivo retorna os mesmos ID/data com `replayed:true`, mesmo após a expiração posterior. Motivo diferente em retry é conflito, sem reescrever história. Convites aceitos, revogados, expirados ou de destinatário/vínculo diferente falham com a mesma mensagem neutra, 409 `invite_invalid`. 400 `invalid_invite_decline` para formato/confirmação; 401 sessão; 403 organização/papel; 503 schema incompatível. Nenhuma resposta identifica concorrente ou e-mail esperado.

RPC `fin_decline_provider_invite(text,uuid,text,boolean,text)` trava membership e convite, verifica tipo da organização, destinatário `exact_email` com e-mail confirmado e cadastro já vinculado a outra instituição. `organization_open` mantém a mesma semântica de identidade do aceite existente: uma conta provedora autorizada com o token pode responder. Não publica RFQs nem oferece descoberta de oportunidades.

Transição única `invited → declined`; não altera aceite, proposta ou decisão. O vínculo institucional fica no convite e a trilha imutável existente `fin_events` recebe `invite_declined`, com convite/provedor/instituição/motivo, ator e data, sem preços/token. Comprador vê status pelo `GET invites`, `rfq-context` e histórico da RFQ; a consulta de renegociação também recupera esse evento. Instituição vê o estado do próprio convite, sem obter acesso ao conteúdo da RFQ recusada. O comando não envia e-mail nem inicia negociação.

## Persistência, implantação e limites

Migration `financial-institutional-decline-1`, após `financial-negotiation-continuity-1`; schema antes do app. Sem tabela nova: convite e eventos continuam SoR, classificação/export/hold existentes. Rollback remove só RPC, restaura marker e preserva convites recusados e eventos. Código anterior continua listando `declined`, estado já previsto no schema. Nenhum rollout hospedado autorizado/executado.

Reuso institucional auditado: cadastro/identidade da própria organização já é reutilizável. Não foi adicionado modelo de preços, cópia de propostas ou CRM: termos de compradores diferentes continuam privados. Templates de informação publicável exigem caso validado com instituições antes de desenvolvimento.

## Testes e handoff

`scripts/test-institutional-decline.mjs`: mocks HTTP, validação, JWT, confirmação e erro neutro. `tests/database/financial-institutional-decline.sql`: banco real, destinatário errado, buyer sem papel, expirado/revogado/aceito, retry, histórico comprador, nenhum acesso à RFQ recusada/proposta automática. `tests/database/financial-intelligence-concurrency.mjs`: sessões independentes bloqueadas antes da liberação, complete/complete, decline/decline e accept/decline e expiração durante espera por lock (checagem após adquirir lock), exatamente um efeito e sem escrita parcial. Runner aplica clean/upgrade/reapply/rollback; evidência executada no plano de release.

Claude: oferecer recusa no convite antes do aceite, com motivo opcional e resumo de confirmação. Na resposta, atualizar o estado após ACK; em falha de rede, repetir o mesmo payload para reconciliar. Não chamar aceite para viabilizar recusa. UI não implementada nesta trilha; `finance/src/**` preservado.
