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
