# Runbook de migrations

> Topologia vigente (07/10/2026): Demo e Production permanentes; Pilot é etapa
> de validação. Nomes pilot:*/pilot-local são compatibilidade de ferramentas.
> Conversão dos slots somente após os gates de TWO_ENVIRONMENT_CONSOLIDATION.md;
> não reinterpretar referências históricas como autorização de reset ou terceiro banco.


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
além de uma referência auditável de backup:

```bash
npm run migrations:release -- \
  --flow=existingDatabase \
  --environment=staging \
  --operator=release-manager \
  --backup-reference=CHANGE-000123
```

O preflight lê apenas o marker `fin_settings.schema_version` e recusa banco sem marker financeiro; não lê dado de cliente.

Se o processo também deve criar um backup, defina `ARANDU_BACKUP_PATH` com um
caminho absoluto fora do repositório. O relatório guarda apenas o SHA-256 e a
referência informada. Esse preflight não libera `--apply`: antes da aplicação,
o mesmo arquivo precisa ser restaurado e verificado.

## 3. Restore obrigatório em banco descartável

Defina `ARANDU_RESTORE_DATABASE_URL` para um banco descartável distinto de
staging e produção. O comando abaixo executa `pg_restore`, compara o fingerprint
do schema restaurado com o schema de origem e roda probes somente de leitura:

```bash
npm run backup:restore:verify -- \
  --backup-file=/caminho/fora/do/repo/arandu.dump \
  --backup-reference=CHANGE-000123 \
  --restore-reference=RESTORE-000123 \
  --operator=release-manager \
  --scope=public_schema \
  --compare-source-schema \
  --restore-backup \
  --confirm=ARANDU-RESTORE-VERIFY
```

O backup técnico deste workflow contém somente o schema `public`, que é a
superfície alterada pelas migrations do Arandu e pode ser restaurada no
PostgreSQL 16 descartável depois do bootstrap de papéis Supabase. Backups
gerenciados completos, PITR e restore integral da plataforma continuam sendo
evidência externa separada e não são automaticamente promovidos por este fluxo.

O banco descartável é limpo durante o restore. A confirmação explícita não
autoriza staging nem produção: o script bloqueia identidades de banco iguais.

## 4. Aplicação e probes

Repita o comando com `--apply`, mantendo `ARANDU_BACKUP_PATH` apontado para o
arquivo que acabou de ser restaurado e passando as duas referências e o relatório:

```bash
npm run migrations:release -- \
  --apply \
  --flow=existingDatabase \
  --environment=staging \
  --operator=release-manager \
  --backup-reference=CHANGE-000123 \
  --restore-reference=RESTORE-000123 \
  --restore-evidence=reports/backup-restore-verification.json
```

O processo:

1. refaz o preflight;
2. recalcula o SHA-256 do backup e valida a evidência recente de restore;
3. bloqueia referência textual sem arquivo restaurado correspondente;
4. aplica o bundle canônico em uma transação;
5. verifica grants, RLS, constraint e dry-runs de expiração/limpeza;
6. executa `check:supabase:write`.

Produção exige adicionalmente
`--confirm-production=ARANDU-PRODUCTION`.

## 5. Rollback descartável

O rollback nunca é disparado automaticamente contra staging ou produção.
Ele é testado pelo job PostgreSQL 16 com `npm run test:database`, que instala,
reaplica, reverte e reaplica a migration em bancos descartáveis.

Registre a URL ou o identificador da execução aprovada no gate `migration_ci`
de `ops/release-evidence.json`. Não copie logs contendo URLs de banco.
