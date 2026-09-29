# Production readiness final — execução técnica

> **Legado — vertical de arte (aposentada).** Documento histórico: não descreve o produto atual (Arandu Financial Procurement). Ver [`LEGACY_ART_RETIREMENT.md`](LEGACY_ART_RETIREMENT.md) e [`OPERATIONS_INDEX.md`](OPERATIONS_INDEX.md).

Este documento descreve somente capacidades implementadas. Os 13 gates permanecem
fail-closed até receberem evidências reais no formato v3 de
`ops/release-evidence.json`.

## Pedidos e integridade comercial

`docs/supabase-order-state-machine.sql` adiciona a RPC
`transition_order_atomic`. A API administrativa não faz mais `PATCH` direto na
tabela: toda transição bloqueia o pedido, valida pedido, pagamento, fulfillment e
certificado em conjunto, atualiza a obra e gera auditoria na mesma transação.

As migrations `supabase-orders.sql` e `supabase-order-state-machine.sql` são
testadas em instalação limpa e upgrade. `tests/database/orders.sql` cobre replay,
RLS entre compradores, snapshots, transições inválidas e conclusão consistente.

## Staging protegido

O GitHub Environment `staging` deve fornecer:

- `ARANDU_STAGING_SITE_URL`;
- `ARANDU_STAGING_PROJECT_REF`;
- `ARANDU_PRODUCTION_PROJECT_REF`;
- `ARANDU_STAGING_DATABASE_URL`;
- `ARANDU_STAGING_WRITE_TEST_URL`;
- as três credenciais Supabase já documentadas.

Antes de DDL, o runner executa `npm run staging:validate`. O check rejeita
placeholder, URL sem HTTPS, projeto divergente e qualquer coincidência declarada
entre staging e produção. A migration executa seu próprio preflight uma única vez,
aplica o bundle, roda probes, canário e smoke HTTP. Os relatórios continuam sendo
candidatos a evidência e nunca alteram gates automaticamente.

## Backup e restore

Depois de restaurar um backup em banco descartável, execute:

```bash
ARANDU_RESTORE_DATABASE_URL='postgresql://...' \
ARANDU_STAGING_DATABASE_URL='postgresql://...' \
npm run backup:restore:verify -- \
  --backup-file=/caminho/fora/do/repo/backup.dump \
  --backup-reference=CHANGE-000123 \
  --restore-reference=RESTORE-000123 \
  --operator=release-operator \
  --expected-schema-sha256=<sha256> \
  --confirm=ARANDU-RESTORE-VERIFY
```

O comando não cria nem finge um restore. Ele exige um artefato recente, valida o
formato com `pg_restore`, compara o fingerprint do schema restaurado e executa os
probes pós-migration. O resultado machine-readable fica em
`reports/backup-restore-verification.json`.

## Evidências

O formato v3 diferencia `not_started`, `prepared`, `ci_validated`,
`staging_validated`, `externally_verified` e `failed`. Toda promoção exige owner,
timestamp, reference, environment, origin e result. CI/local não pode promover
evidência externa.

```bash
npm run release:evidence:record -- \
  --gate=migration_ci \
  --state=ci_validated \
  --owner=release-operator \
  --reference=GHA-RUN-123456 \
  --environment=ci \
  --origin=github_actions \
  --result=passed
npm run check:evidence
```

## Bloqueadores externos preservados

Credenciais e execução real em staging, backup/restore reais, domínio e HTTPS,
monitoramento com canário, contato LGPD, política aprovada, catálogo autorizado,
provider de e-mail e resultados do piloto continuam pendentes até existir prova.
