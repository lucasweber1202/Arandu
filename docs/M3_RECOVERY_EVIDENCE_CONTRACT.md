# Conversão M3: reconciliação de schema do mesmo export

Este contrato complementa `SUPABASE_ENCRYPTED_PRESERVATION.md` e
`TWO_ENVIRONMENT_CONSOLIDATION.md`. Avalia evidência; não executa preservação,
restore, migration, alteração de atribuições ou cutover.

## Falha corrigida

O export/restore já calcula fingerprint de schema v1, incluindo RLS, grants,
constraints, funções e markers. Os avaliadores de conversão e release exigiam
contagens/probes PASS, mas não exigiam esse resultado. Assim, a ausência da
reconciliação de schema ainda podia produzir PREPARED ou GO em fixtures.

Agora `restore_schema_reconciliation` exige simultaneamente:

| Origem do campo | Campo da evidência de avaliação | Condição |
| --- | --- | --- |
| Manifest do export | backup.schema_fingerprint_version | versão numérica compatível com SCHEMA_FINGERPRINT_VERSION |
| Manifest do export | backup.snapshot_schema_sha256 | digest SHA-256 válido |
| Recibo do restore isolado | restore.schema_fingerprint_version | mesma versão compatível |
| Recibo do restore isolado | restore.schema_reconciliation | MATCH |
| Recibo do restore isolado | restore.source_schema_sha256 | igual ao snapshot do export |
| Recibo do restore isolado | restore.target_schema_sha256 | igual ao snapshot do export |

Preservam-se identidade do projeto, digest do backup, cronologia, frescor,
contagens, probes, bundle corrente, classificação e todos os demais requisitos.
Os três hashes iguais não substituem os requisitos existentes. MATCH declarado
com hash divergente falha. Dois hashes iguais de outro export também falham.
Ausência, versão futura/desconhecida ou string "1" não equivalem à versão 1.

## Procedimento do operador autorizado

1. Conservar manifest e recibo íntegros na custódia privada aprovada.
2. Conferir projeto, export, ciphertexts, timestamps e referências do mesmo ensaio.
3. Transcrever somente os campos sanitizados acima para a evidência de avaliação;
   não copiar dumps, caminhos privados, tokens, nomes de usuários ou documentos.
4. Executar `consolidation:check`, `release:candidate:check` ou `pilot:release:check`
   conforme a etapa. O doctor composto apresenta owner e próxima ação próprios
   para `restore_schema_reconciliation`.
5. Se a evidência histórica não contém fingerprint, preservá-la como histórica.
   Não calcular retrospectivamente um hash do banco atual nem trocar MISMATCH
   por MATCH. Um novo export/restore exige autorização específica.

Não há migração de dados ou configuração associada a este incremento. Evidências
antigas incompletas passam a ser recusadas pelos avaliadores; isso é intencional.
Não há fallback para promover prontidão só porque o deployment ficou READY.

## Limites

A avaliação não autentica a origem dos documentos importados. O operador deve
resolver referências na custódia protegida. Fingerprint v1 é escopado conforme
`lib/recovery-schema.mjs`: não prova conteúdo campo a campo, roles globais,
serviços gerenciados Auth/Storage, segredos ou integrações. Esses itens mantêm
seus gates separados. PREPARED não autoriza executar conversão; teste hermético
não constitui M3 hospedado. Reverter a correção removeria uma proteção, sem
reverter banco; preferir forward-fix se houver problema no avaliador.
