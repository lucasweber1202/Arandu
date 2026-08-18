# Staging rehearsal — Arandu

O workflow `Arandu Staging Rehearsal` prepara e testa o pacote que será usado em staging sem conectar ao banco Supabase real e sem aplicar migrations.

Ele existe para reduzir erros antes da execução operacional da issue #25. Não substitui staging real, backup, restore, canário autenticado ou aprovação humana.

## Como executar

No GitHub:

1. Abra **Actions**.
2. Selecione **Arandu Staging Rehearsal**.
3. Escolha **Run workflow**.
4. Selecione o fluxo:
   - `existingDatabase` para atualizar um projeto existente;
   - `cleanInstall` para ensaiar uma instalação nova.
5. Informe `target_url` somente quando existir uma origem HTTPS de staging pronta para smoke remoto.
6. Mantenha `run_browser=true` para executar as jornadas desktop e mobile.

O workflow é exclusivamente manual por `workflow_dispatch`. Ele não roda em `push` ou `pull_request` e não recebe segredos do repositório.

## O que a execução valida

- instalação determinística das dependências;
- auditoria de vulnerabilidades altas;
- `npm run check:all`;
- build e SEO do artefato;
- bundle determinístico das migrations;
- dry-run de release sem conexão;
- instalação, upgrade, rollback, RLS, concorrência e transações em PostgreSQL 16 descartável;
- jornadas Playwright, quando habilitadas;
- smoke HTTP opcional em uma origem HTTPS de staging.

## O que a execução não faz

- não aplica migrations;
- não conecta ao banco Supabase real;
- não cria nem restaura backup;
- não executa canário autenticado de escrita;
- não valida credenciais, RLS ou dados no projeto real;
- não promove estados em `ops/release-evidence.json`;
- não substitui decisão comercial, jurídica, curatorial ou do piloto.

## Relatórios gerados

A execução publica um artefato com retenção de 14 dias contendo apenas relatórios sem credenciais:

- `reports/staging-rehearsal.json`;
- `reports/staging-rehearsal.md`;
- `reports/migration-release-report.json`;
- `reports/supabase-migrations-<flow>.json`.

O relatório usa a classificação `ci_rehearsal_only` e declara `promotesReleaseGates: false`.

Uma execução verde pode ser referenciada como preparação técnica ou evidência de CI. Ela não pode ser registrada como `staging_validated`.

## Passagem para staging real

Depois de um rehearsal verde:

1. identificar o projeto Supabase correto;
2. registrar responsável operacional sem PII;
3. configurar o environment protegido `staging`, inclusive as origens distintas de staging e produção;
4. executar manualmente **Arandu Protected Staging Release**;
5. o workflow gera um backup do schema `public` fora do checkout e não o publica como artefato;
6. o mesmo backup é restaurado por `pg_restore` em PostgreSQL 16 descartável;
7. o fingerprint do schema restaurado precisa coincidir com o schema de origem;
8. somente depois dessa prova o workflow aplica a migration, executa probes e canário;
9. revisar os relatórios sem PII antes de registrar referências em `ops/release-evidence.json`.

Uma referência textual de backup ou restore não é suficiente para liberar DDL. O script de migration exige o hash do próprio arquivo restaurado e um relatório `restore_verification` recente, com os checks obrigatórios aprovados. O backup pode conter dados pessoais e, por isso, nunca entra no repositório nem nos artifacts do GitHub. Restore integral gerenciado/PITR continua externo e mantém o gate `backup_restore` sem promoção automática.

Somente essas ações externas podem promover os gates de staging.

## Validação estática do workflow

```bash
npm run check:staging
```

Esse gate impede que o rehearsal passe a aplicar migrations, leia credenciais privilegiadas ou modifique evidências de release automaticamente.
