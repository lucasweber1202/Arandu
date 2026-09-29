# Transações, RLS, RBAC e auditoria

> **Legado — vertical de arte (aposentada).** Documento histórico: não descreve o produto atual (Arandu Financial Procurement). Ver [`LEGACY_ART_RETIREMENT.md`](LEGACY_ART_RETIREMENT.md) e [`OPERATIONS_INDEX.md`](OPERATIONS_INDEX.md).

Esta camada é introduzida por `docs/supabase-transactions-rbac-audit.sql`.
Ela deve ser aplicada somente depois de `docs/supabase-commercial.sql` e
`docs/supabase-sprint6-12-platform.sql`.

## Garantias

- uma obra não pode possuir duas reservas `requested`/`confirmed`;
- reserva, mudança da obra, auditoria e conclusão da idempotência ocorrem na
  mesma transação;
- proposta e itens são criados na mesma transação;
- preços vêm de `artworks.price`, nunca do navegador;
- comissão, moeda, prazo e versão da política vêm do servidor;
- a idempotência é vinculada a escopo, chave, identidade e payload canônico;
- escritas anônimas/autenticadas diretas são revogadas para os fluxos que
  precisam passar pela API;
- leituras de conta usam o JWT do usuário e RLS;
- mutações privilegiadas recebem operador, papel e request ID e são auditadas
  sem copiar os principais campos de PII para `audit_logs`.

## RBAC

| Recurso | `admin` | `operator` | `curator` |
| --- | --- | --- | --- |
| Diagnóstico e configuração | completo | — | — |
| Leads e briefings | completo | ler/criar/atualizar | — |
| Reservas e propostas | completo | ler/criar/atualizar/expirar | — |
| Operação comercial | completo | ler/criar/atualizar | — |
| Tarefas e notas | completo | operar | — |
| Artistas, obras e coleções | completo | — | criar/revisar/publicar |
| Submissões curatoriais | completo | — | ler/revisar |
| Certificados e mídia | completo | — | operar |
| Piloto | completo | ler/operar | — |

A matriz executável está em `lib/admin-rbac.mjs`. O papel continua vindo
exclusivamente de `app_metadata`, com MFA `aal2`.

## Clientes Supabase

`lib/supabase.mjs` separa três contextos:

1. `publicSupabaseRequest`: anon key, somente views/policies públicas;
2. `userSupabaseRequest`: anon key + JWT da sessão, sujeito a RLS;
3. `adminSupabaseRequest`/`adminSupabaseRpc`: service role no servidor.

Usos restantes e justificados de service role:

- formulários públicos validados e limitados pela API;
- reservas, propostas e registros comerciais via RPC transacional;
- idempotência e rate limit distribuídos;
- mutações administrativas após sessão, papel e MFA;
- tarefas internas, telemetria consentida e probes protegidos;
- compartilhamento público por token, que devolve representação minimizada.

A service role não deve aparecer no navegador, em logs ou em respostas.

## Rate limit administrativo

Login e refresh, desafio MFA, verificação TOTP, APIs administrativas,
readiness, registros comerciais, certificados e upload possuem escopos
separados. Os limites sensíveis combinam IP e identidade da conta; assim uma
rede compartilhada não concentra todas as contas em uma única chave.

Em Vercel, a proteção falha fechada e usa `consume_rate_limit` no PostgreSQL.
O contador em memória existe apenas para desenvolvimento e testes locais.

## Configuração comercial

Não há valores padrão deliberados. Antes de ativar
`ARANDU_COMMERCIAL_READY=true`, registre uma decisão real e configure:

```bash
ARANDU_COMMERCIAL_POLICY_VERSION=
ARANDU_COMMERCIAL_CURRENCY=
ARANDU_PLATFORM_FEE_RATE=
ARANDU_RESERVATION_HOURS=
```

`ARANDU_PLATFORM_FEE_RATE` usa fração decimal (`0.20` para 20%), mas o valor
deve vir da política aprovada. `ARANDU_RESERVATION_HOURS` aceita de 1 a 720.

## Aplicação

Antes da migration, procure reservas ativas duplicadas:

```sql
select artwork_id, count(*)
from public.reservations
where status in ('requested', 'confirmed')
group by artwork_id
having count(*) > 1;
```

Se houver resultados, decida operacionalmente quais registros expirar ou
cancelar. A migration falha de forma explícita; ela não altera reservas reais
silenciosamente.

Depois:

```bash
npm run check:migrations
npm run migrations:bundle -- --flow=existingDatabase
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f docs/supabase-commercial.sql \
  -f docs/supabase-transactions-rbac-audit.sql
```

Valide em ambiente protegido:

- reserva de uma obra disponível;
- duas reservas concorrentes para a mesma obra;
- replay com a mesma `Idempotency-Key`;
- conflito com payload ou identidade diferente;
- proposta com preço adulterado no request;
- conta A não lendo dados da conta B;
- `anon` sem privilégios de escrita direta;
- cada papel negado nos recursos fora da matriz.

## Expiração

A função abaixo é idempotente e pode ser chamada por cron autenticado:

```sql
select public.expire_reservations(true, 'cron-preview', 'request-id');
select public.expire_reservations(false, 'cron-production', 'request-id');
```

Execute primeiro com `p_dry_run=true`. Apenas `service_role` possui `EXECUTE`.

## Rollback

O rollback de emergência está em
`docs/rollback/supabase-transactions-rbac-audit.rollback.sql`.

Ele remove RPCs, triggers e índices novos, preservando dados e colunas. Ele não
reabre escritas públicas automaticamente. Faça backup, interrompa escritas e
registre a justificativa antes de usá-lo.

## CI

`npm run test:database` usa PostgreSQL 16 descartável e testa:

- instalação desde zero;
- upgrade sobre o conjunto anterior;
- reaplicação;
- rollback e reaplicação;
- grants e RLS;
- propostas e reservas;
- expiração;
- concorrência com exatamente uma reserva vencedora.

Esse teste não comprova que a migration foi aplicada no Supabase real. A
evidência externa continua pendente até execução e canário no projeto correto.
