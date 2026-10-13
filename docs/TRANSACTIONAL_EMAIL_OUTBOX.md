# Outbox de e-mail transacional

O e-mail transacional do Arandu é provider-agnostic e fica **desativado por padrão**. A fila existe para desacoplar uma operação comercial crítica do envio externo: falha de e-mail não pode desfazer uma reserva, pedido ou transição já confirmada no banco.

## Componentes

- `lib/email.mjs`: templates, validação de configuração e adaptador de provider;
- `lib/email-outbox.mjs`: dispatcher, retry e correlação operacional;
- `docs/supabase-transactional-email-outbox.sql`: fila, claim concorrente e triggers;
- `api/email-dispatch.js`: disparo manual protegido por sessão administrativa, RBAC, MFA e rate limit;
- `tests/database/email-outbox.sql`: idempotência, retry, dead-letter e minimização.

## Eventos de pedido

A migration enfileira automaticamente:

- `order.created` → `order_created`;
- `order.payment_confirmed` → `payment_confirmed`;
- `order.shipped` → `order_shipped`.

Os eventos são gerados no banco a partir da fonte de verdade, não a partir de valores enviados pelo navegador.

## Concorrência

`claim_transactional_email_batch` usa `FOR UPDATE SKIP LOCKED`, permitindo mais de um worker sem entregar a mesma linha simultaneamente.

Claims abandonados por mais de 10 minutos podem ser recuperados por outro worker.

## Retry e dead-letter

Cada tentativa incrementa `attempts`. Falhas temporárias voltam para `retry`; o dispatcher calcula backoff exponencial com limite de 24 horas. Ao atingir `max_attempts`, o item vai para `dead`.

O estado `dead` exige intervenção operacional antes de uma nova tentativa manual.

## Minimização de dados

A fila precisa do endereço somente enquanto houver possibilidade real de entrega. Por isso:

- `recipient_hash` guarda uma referência SHA-256 para correlação sem expor o e-mail;
- `recipient_address` é usado somente por `pending`, `processing` e `retry`;
- ao chegar a `delivered` ou `dead`, `recipient_address` é apagado;
- logs e respostas operacionais usam `recipientRef`, nunca o endereço;
- payloads devem conter somente variáveis necessárias ao template, sem endereço, telefone, cookies, tokens ou dados comerciais internos.

## Providers

Valores suportados por `ARANDU_EMAIL_PROVIDER`:

- `disabled`: padrão e comportamento obrigatório até configuração real;
- `mock`: testes controlados sem entrega;
- `resend`: entrega real somente quando todas as variáveis e o gate humano estiverem configurados.

O provider real exige `ARANDU_TRANSACTIONAL_EMAIL_READY=true`; essa flag não promove nenhum gate de release sozinha.

## Operação

O endpoint `POST /api/email-dispatch` processa um lote pequeno e é protegido pela mesma identidade administrativa do restante da operação comercial.

Não use esse endpoint como prova de monitoramento, domínio, staging ou lançamento. O estado oficial continua em `ops/release-evidence.json`.

## Rollback

A migration é aditiva e possui rollback próprio em:

`docs/rollback/supabase-transactional-email-outbox.rollback.sql`

Nunca execute o rollback em ambiente real sem avaliar eventos pendentes e preservar apenas as referências operacionais necessárias.

## Tetos e justiça entre organizações (13/10/2026)

`docs/supabase-financial-followup-hardening.sql` (`financial-followup-hardening-1`):

| Controle | Padrão | Ao exceder | Chave em `fin_settings` (piso–teto) |
| --- | --- | --- | --- |
| E-mails por organização por hora | 60 | convite recusado (`email_volume_limit`, 429); nada criado | `email_org_hourly_limit` (5–1000) |
| E-mails por organização por dia | 300 | idem | `email_org_daily_limit` (20–5000) |
| Pendentes por organização | 200 | idem; aviso de notificação suprimido | `email_org_pending_limit` (20–2000) |
| Mesmo destinatário, mesma organização, por dia | 3 | e-mail suprimido, convite e link manual seguem; evento `email_suppressed` na trilha | `email_org_recipient_daily_limit` (1–20) |
| Mesmo destinatário, todas as organizações, por dia | 5 | idem | `email_recipient_daily_limit` (1–50) |

- A outbox guarda `organization_id`; e-mail sem RFQ/contrato/organização de origem não entra.
- As contagens são serializadas por organização (`pg_advisory_xact_lock`): rajada de 10 convites simultâneos com teto 5 grava 5 (sem o lock, 10 — `tests/database/email-fairness-concurrency.sh`).
- O claim faz rodízio entre organizações (posição de cada item na fila da sua organização): uma organização com fila grande não ocupa o lote.
- Nome livre da empresa com link/endereço vira "Uma empresa compradora" no assunto e no corpo (`displayName` em `lib/finance/email-templates.mjs`).
- Já existiam e continuam: idempotência por `idempotency_key`, backoff exponencial com jitter (30 s → 24 h), `max_attempts` com dead-letter, lease com fencing e reivindicação após lease vencida.

