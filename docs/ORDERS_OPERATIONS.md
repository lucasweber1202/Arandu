# Operação de pedidos

O domínio de pedidos representa a venda assistida depois de uma reserva confirmada. Ele não substitui a política comercial, não integra um gateway por conta própria e não autoriza operação pública sem os gates de release.

## Fonte de verdade

- `reservations`: exclusividade temporária da obra e snapshot comercial inicial;
- `proposals`: proposta curatorial/comercial quando houver;
- `orders`: registro da venda assistida e seus estados operacionais;
- `order_status_history`: trilha imutável das transições privilegiadas;
- `commercial_records`: registros comerciais auxiliares já existentes.

Um pedido nasce somente a partir de uma reserva `confirmed` ou já `converted`. A criação usa `public.create_order_atomic`, bloqueia a reserva e mantém no máximo um pedido por reserva.

## Imutabilidade financeira

Depois da criação, estes campos não podem ser alterados por update:

- comprador e vínculos de origem;
- obra e artista;
- `price_snapshot`;
- moeda;
- taxa da plataforma;
- comissão da plataforma;
- valor do artista;
- versão da política;
- snapshot integral da política.

Mudanças na política comercial futura não alteram pedidos existentes.

## State machine

As transições operacionais passam exclusivamente por `public.transition_order_atomic`.

### Pedido

- `created -> confirmed | cancelled`
- `confirmed -> completed | cancelled`
- `completed` e `cancelled` são finais no fluxo normal.

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

Envio ou entrega exige pagamento confirmado.

### Certificado

- `pending -> ready | not_applicable`
- `ready -> issued`

### Conclusão

`completed` somente é permitido quando:

- `payment_status = paid`;
- `fulfillment_status = delivered`;
- `certificate_status = issued | not_applicable`.

## Auditoria

Toda transição exige:

- ator;
- papel;
- request ID;
- justificativa operacional com conteúdo significativo.

O histórico registra os estados anterior e posterior e dados logísticos mínimos. E-mail, telefone, endereço, token, cookie e payload bruto não devem ser copiados para essa trilha.

## API

`POST /api/orders`

Cria um pedido de forma idempotente a partir de uma reserva. Valores financeiros enviados pelo navegador não fazem parte do contrato aceito.

`PATCH /api/orders`

Solicita uma transição operacional. A API valida os enums e encaminha a mudança à RPC atômica; não faz `PATCH` direto na tabela `orders`.

Campos aceitos conforme a ação:

- `id`;
- `status`;
- `payment_status`;
- `fulfillment_status`;
- `certificate_status`;
- `tracking_code`;
- `shipping_provider`;
- `justification`.

Operações administrativas continuam protegidas por sessão, RBAC e MFA.

## RLS

- `anon`: sem leitura ou escrita de pedidos;
- `authenticated`: leitura apenas dos próprios pedidos, sem escrita direta;
- `service_role`: usado exclusivamente pelo backend/RPCs privilegiadas.

`order_status_history` não é exposto diretamente a compradores.

## Migrations

Ordem relevante:

1. `docs/supabase-transactions-rbac-audit.sql`
2. `docs/supabase-orders.sql`
3. `docs/supabase-orders-hardening.sql`

Rollback do hardening:

`docs/rollback/supabase-orders-hardening.rollback.sql`

Nunca execute rollback em produção sem procedimento de incidente, backup e avaliação do histórico que seria removido.

## Testes

A suíte PostgreSQL cobre:

- instalação limpa;
- upgrade;
- reaplicação do hardening;
- rollback e reaplicação;
- RLS entre dois usuários;
- imutabilidade financeira;
- state machine;
- timestamps;
- tracking;
- regressão inválida de estado;
- concorrência de criação do mesmo pedido.

Execute em banco descartável:

```bash
ARANDU_DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  npm run test:database
```

## Gate de produto

A existência de pedidos no código não significa que o Arandu está liberado para vendas públicas. Política comercial, staging, catálogo real, observabilidade/LGPD/domínio e piloto continuam dependentes das evidências oficiais de `ops/release-evidence.json`.
