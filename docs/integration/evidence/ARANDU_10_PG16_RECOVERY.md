# Roundtrip PG16 — diagnóstico do handoff da issue #345

Falha reportada: job `132616764569`, run `43650139754`, PR frontend #346,
assert `Repaired canonical schema roundtrips`. Nenhum rerun pago foi solicitado.

## Reprodução equivalente

Os logs do job foram lidos pelo conector GitHub, sem publicar credenciais ou URLs
temporárias de download. Confirmaram:

- servidor `postgres:16`, PostgreSQL **16.16**;
- imagem digest `sha256:63e83b5a3dc36a917dccb76fe1bd2ac51f1ec9c1deb47ff20d4f04233bf6eae9`;
- cliente **16.15 (Ubuntu 16.15-1.pgdg24.04+2)**, antes da instalação de tools 17.

No executor, cliente/servidor 16.16 passaram tanto na main quanto na candidata.
Isso não reproduzia o CI. O pacote público do cliente Ubuntu 16.15 foi extraído
em diretório temporário, sem alterar host/workflow. Com esse cliente e a mesma
imagem 16.16, a main `cd608cb4` reproduziu a falha no mesmo assert.
A candidata usa o mesmo prefixo de migrations e o mesmo teste nessa fronteira.

Instrumentação **temporária**, fora da branch: gravar dump normalizado e resultado
`CHECK_CONSTRAINTS_SQL` em cada chamada de fingerprint; comparar a última dupla
source/target anterior ao assert. Só schema sintético, arquivos privados temporários.

## Diff redigida e causa observada

Os arrays de CHECKs foram byte a byte idênticos. A diff do dump normalizado teve
3100 linhas alteradas: 1550 pares da opção `pg_attver`, incluindo identificadores
com aspas. Não houve outra diferença após remover apenas essas opções.

```diff
-ALTER TABLE ONLY public.fin_fee_observations ALTER COLUMN id SET (pg_attver=<origem>);
+ALTER TABLE ONLY public.fin_fee_observations ALTER COLUMN id SET (pg_attver=<restore>);
-ALTER TABLE ONLY public.fin_approval_steps ALTER COLUMN "position" SET (pg_attver=<origem>);
+ALTER TABLE ONLY public.fin_approval_steps ALTER COLUMN "position" SET (pg_attver=<restore>);
```

Prova mínima independente: criar `t(id integer not null, title text)`. O catálogo
mostra `pg_attver` em `attoptions`. O dump 16.15 emite a opção; o dump 16.16 a
omite. Após restore, o valor interno muda. Adicionar `n_distinct=0.25` produz no
cliente antigo uma lista mista `(pg_attver=<interno>, n_distinct=0.25)`.
A diferença não é dado financeiro, regra de acesso nem definição lógica de coluna.
Não foi atribuída genericamente ao runner a partir de hashes diferentes.

## Correção e proteção

`restoreSchemaFingerprint` remove somente a opção interna **numérica** `pg_attver`
em comandos de opções de coluna do dump. Preserva opções semânticas na mesma
lista, identificadores, literais com vírgulas/aspas e o restante do schema.
Não muda banco, migrations históricas, hashes esperados, baseline ou workflow.

Regressão unitária dedicada: `scripts/test-restore-schema-fingerprint.mjs`, incluída
no gate backend. Confere normalização do token interno e **diferença obrigatória**
para n_distinct, nomes semelhantes, valores textuais, tipos, nullability, defaults,
CHECKs/validação/agrupamento e views. O teste real de roundtrip ganhou coluna com
n_distinct e default; adulterações nesses dois campos também precisam falhar.
Os asserts originais de view removida/adulterada e agrupamento booleano permanecem.

Validação isolada após correção: PASS com 16.15→16.16 (combinação CI),
16.16→16.16 e 17.12→17.12, incluindo clean/reapply, rollback/upgrade e o manifesto
atual com as migrations Arandu 10. A suíte integral PG17 já passou; a execução
integral na combinação CI e o prepublish por SHA ficam registrados na PR backend.

```bash
# Servidor local descartável em localhost:5433; não usar banco hospedado.
PATH=<cliente-Ubuntu-16.15>/bin:$PATH node tests/database/recovery-schema-roundtrip.mjs \
  postgresql://postgres:postgres@localhost:5433/postgres
PATH=<cliente-Ubuntu-16.15>/bin:$PATH \
  ARANDU_DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5433/postgres \
  npm run test:database
```
