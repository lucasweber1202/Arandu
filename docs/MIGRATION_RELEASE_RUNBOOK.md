# Runbook de migrations

Este fluxo não pressupõe que CI, staging ou produção já foram validados. Ele
gera somente um relatório técnico sem credenciais ou PII em
`reports/migration-release-report.json`.

## 1. Dry-run sem conexão

```bash
npm run migrations:release -- \
  --dry-run \
  --flow=existingDatabase \
  --environment=staging
```

## 2. Preflight

Configure `ARANDU_DATABASE_URL` fora do Git e informe um responsável por papel,
além de uma referência externa de backup:

```bash
npm run migrations:release -- \
  --flow=existingDatabase \
  --environment=staging \
  --operator=release-manager \
  --backup-reference=CHANGE-000123
```

O preflight consulta apenas a quantidade de grupos com reservas ativas
duplicadas. Nenhum ID, nome, contato ou outro dado pessoal entra no relatório.
Qualquer duplicidade bloqueia a aplicação.

Se o processo também deve criar um backup, defina `ARANDU_BACKUP_PATH` com um
caminho absoluto fora do repositório. O relatório guarda apenas o SHA-256 e a
referência informada.

## 3. Aplicação e probes

Repita o comando com `--apply`. O processo:

1. refaz o preflight;
2. confirma a evidência ou cria o backup;
3. aplica o bundle canônico em uma transação;
4. verifica grants, RLS, constraint e dry-runs de expiração/limpeza;
5. executa `check:supabase:write`.

Produção exige adicionalmente
`--confirm-production=ARANDU-PRODUCTION`.

## 4. Rollback descartável

O rollback nunca é disparado automaticamente contra staging ou produção.
Ele é testado pelo job PostgreSQL 16 com `npm run test:database`, que instala,
reaplica, reverte e reaplica a migration em bancos descartáveis.

Registre a URL ou o identificador da execução aprovada no gate `migration_ci`
de `ops/release-evidence.json`. Não copie logs contendo URLs de banco.
