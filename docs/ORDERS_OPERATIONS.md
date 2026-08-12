# Operação de pedidos

O domínio de pedidos representa a venda assistida depois de uma reserva confirmada. Ele não substitui a política comercial, não integra um gateway por conta própria e não autoriza operação pública sem os gates de release.

## Fonte de verdade

- `reservations`: exclusividade temporária da obra e snapshot comercial inicial;
- `proposals`: proposta curatorial/comercial quando houver;
- `orders`: registro da venda assistida e seus estados operacionais;
- `order_status_history`: trilha append-only das transições privilegiadas;
- `commercial_records`: registros comerciais auxiliares já existentes.

Um pedido nasce somente a partir de uma reserva `confirmed` ou já `converted`. A criação usa `public.create_order_atomic`, bloqueia a reserva e mantém no máximo um pedido por reserva.

## Imutabilidade financeira

Depois da criação, comprador, vínculos de origem, obra, artista, preço, moeda, taxas, valores do artista, versão da política e snapshot integral da política não podem ser alterados. Mudanças futuras na política comercial não reescrevem pedidos existentes.

## State machine consolidada

A migration `docs/supabase-order-state-machine.sql` da PR #38 instala as invariantes-base. A migration aditiva `docs/supabase-orders-hardening.sql` cria a assinatura enriquecida, exige justificativa, acrescenta tracking/transportadora e histórico, preservando as mesmas invariantes cruzadas.

Enquanto o hardening está ativo, a assinatura antiga da RPC permanece instalada apenas para rollback e não possui `EXECUTE` para `service_role`.

### Pedido

- `created -> confirmed | cancelled`
- `confirmed -> completed | cancelled`

### Pagamento

- `pending -> awaiting_confirmation | paid | failed | cancelled`
- `awaiting_confirmation -> paid | failed | cancelled`
- `failed -> awaiting_confirmation | cancelled`
- `paid -> refunded`

### Logística

- `pending -> packing | cancelled`
- `packing -> shipped | cancelled`
- `shipped -> delivered | returned`
- `delivered -> returned`

Pagamento, estado do pedido, logística e certificado são validados em conjunto. `completed` exige pagamento `paid`, entrega `delivered` e certificado `issued | not_applicable`. Conclusão marca a obra como `sold`; cancelamento só pode devolver a obra para `available` quando não houver outra reserva ativa.

## Auditoria

Toda transição exige ator, papel, request ID e justificativa operacional. O histórico registra estados anterior/posterior e dados logísticos mínimos; e-mail, telefone, endereço, token, cookie e payload bruto não entram nessa trilha.

`order_status_history` permite somente `SELECT` e `INSERT` ao `service_role` e possui trigger que rejeita `UPDATE`/`DELETE`.

## APIs

- `POST /api/orders`: cria pedido idempotente a partir de reserva, sem aceitar valores financeiros do navegador.
- `PATCH /api/orders`: solicita transição pela RPC atômica; aceita estados, `tracking_code`, `shipping_provider` e `justification`.
- `GET /api/account-orders`: usa JWT/RLS do comprador e devolve somente o subconjunto necessário para acompanhamento.

O painel `painel-pedidos.html` usa a mesma API administrativa, protegida por sessão, RBAC e MFA.

## Migrations

Ordem relevante:

1. `docs/supabase-transactions-rbac-audit.sql`
2. `docs/supabase-orders.sql`
3. `docs/supabase-order-state-machine.sql`
4. `docs/supabase-orders-hardening.sql`
5. `docs/supabase-transactional-email-outbox.sql`
6. `docs/supabase-retention-controls.sql`

O rollback do hardening remove somente a camada enriquecida e restaura `EXECUTE` da assinatura da PR #38. Nunca execute rollback em ambiente real sem procedimento de incidente, backup e avaliação do histórico que seria removido.

## Testes

A suíte PostgreSQL cobre instalação limpa, upgrade, reaplicação, rollback, RLS entre compradores, imutabilidade financeira, state machine, invariantes da PR #38, timestamps, tracking, histórico, concorrência, outbox e retenção.

```bash
ARANDU_DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  npm run test:database
```

A existência dessas capacidades não libera vendas públicas. Política comercial, staging, catálogo real, observabilidade/LGPD/domínio e piloto continuam dependentes de evidência real em `ops/release-evidence.json`.
