# E-mails do procurement financeiro

## Estado atual: preparado, não enviando

Os oito modelos existem em [`lib/finance/email-templates.mjs`](../lib/finance/email-templates.mjs)
e já produzem a linha exata da outbox transacional que o Arandu usa
(`transactional_email_outbox`). **Nada é enviado**, e nenhum SMTP falso foi
configurado.

| Modelo | Quando dispararia | Para quem |
| --- | --- | --- |
| `member_invite` | membro convidado para a organização | pessoa convidada |
| `provider_invite` | provedor convidado para uma RFQ | contato do provedor |
| `rfq_opened` | RFQ passa de `draft` para `open` | responsáveis da empresa |
| `deadline_near` | prazo de resposta se aproxima | responsáveis da empresa |
| `proposal_received` | primeira versão de uma proposta | responsáveis da empresa |
| `proposal_revised` | versão n>1 | responsáveis da empresa |
| `decision_recorded` | decisão registrada | responsáveis da empresa |
| `renewal_due` | janela de revisão do contrato abre | responsável pelo contrato |

## O que falta para enviar — `OWNER_ACTION_REQUIRED`

1. **Credencial do provedor de e-mail** no ambiente que roda a outbox. A
   variável e o provedor são os mesmos já usados pelo restante do Arandu
   (`lib/email.mjs`); nenhuma variável nova é introduzida por esta vertical.
2. **Domínio de envio verificado** (SPF/DKIM), para que o convite a um banco
   não caia em spam.
3. **`ARANDU_SITE_URL`** apontando para o domínio do piloto, porque o link do
   convite é montado a partir dele.
4. Decidir **quem recebe** os avisos da empresa: hoje não há campo de
   preferência de notificação por membro.

Enquanto isso não existir, o fluxo de convite continua **manual e declarado**:
quem convida vê o token na tela e o repassa pelo canal que já usa com o
provedor. O produto não finge que enviou.

## Decisões de conteúdo

* **Nenhuma condição financeira vai no corpo do e-mail.** O aviso diz que algo
  mudou e leva ao portal, onde a autorização é verificada. Um e-mail
  encaminhado não pode virar vazamento de taxa ou de MDR.
* **O token do convite vai no link**, não solto no texto, e o corpo explica que
  ele vale uma vez, expira e é vinculado à organização provedora.
* **Sem urgência fabricada e sem linguagem de venda.** Nenhum modelo promete
  aprovação, sugere que o Arandu recomenda alguém ou trata a cotação como oferta.
* **`idempotency_key` determinística** (`modelo:entidade:versão`): reprocessar o
  mesmo evento não gera um segundo e-mail.

## Ponto de integração

A função `buildOutboxRow(nome, contexto)` devolve a linha pronta. O ponto
natural de enfileiramento é dentro das funções `SECURITY DEFINER` que já
registram o evento correspondente em `fin_events` — assim o e-mail e a trilha
nascem da mesma transação. Isso **não foi implementado** porque enfileirar sem
credencial produz uma fila que só cresce, e porque o destinatário de cada aviso
depende da preferência de notificação que ainda não existe.

> **LEGAL_REVIEW_REQUIRED** — comunicação dirigida a instituições financeiras e
> a base legal para contatar o provedor cadastrado por um comprador.
