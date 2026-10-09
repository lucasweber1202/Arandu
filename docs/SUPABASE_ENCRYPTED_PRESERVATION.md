# Preservação criptografada dos dois slots

Estado: preparado, não executado contra Supabase; não comprova recovery.
Continua a preparação de `TWO_ENVIRONMENT_CONSOLIDATION.md`, sem substituir
o drill `scripts/pilot-restore-drill.sh` e sem mudar atribuições ativas.

## Executor e autorização

Antes de habilitar o workflow manual `consolidation-export.yml`, o administrador
deve configurar o Environment `database-recovery` com reviewers obrigatórios,
prevent self-review e deployment branches **somente main**. Esses controles
não podem ser impostos pelo YAML; não há comprovação de que já existam.
Não executar antes dessa verificação e aprovação do destino e da retenção.

Usar runner privado dedicado e previamente autorizado, rotulado
`self-hosted, linux, arandu-recovery`, Node 24, clientes psql/pg_dump/pg_dumpall/
pg_restore 17, age e mount privado durável fora do checkout (0700, usuário do
runner). Não cadastrar runner compartilhado com código não confiável.
Não criar recurso pago para executar este workflow.

Secrets no Environment, sem valores no chat:

- `ARANDU_PILOT_RECOVERY_DATABASE_URL`: origem offgpyysgdhfemjlchod.
- `ARANDU_LEGACY_RECOVERY_DATABASE_URL`: origem igacnfjeuqhxcmfyepgj.
- `ARANDU_RECOVERY_RECIPIENT`: destinatário público age X25519; validar posse da chave privada fora do runner.
- `ARANDU_RECOVERY_DIRECTORY`: mount privado durável aprovado, não artifacts do Actions.

O SHA informado deve ser exatamente github.sha da main revisada; código de PR
não recebe secrets. O helper confere ref/host/usuário/db/porta/TLS, não aceita
transaction pooler, parâmetros libpq arbitrários nem PGHOSTADDR herdado.
TLS require cifra a conexão; para verificar certificado usar verify-full e CA
do Supabase no executor. Confirmar host do session pooler em Connect; não adivinhar.

Execução local equivalente com os nomes seguros injetados pelo executor:
`node scripts/consolidation-export.mjs`. Exige `ARANDU_RECOVERY_DATABASE_URL`,
`ARANDU_RECOVERY_PROJECT_REF`, recipient/directory acima e confirmação
`ARANDU_RECOVERY_CONFIRM=ARANDU-ENCRYPTED-EXPORT`.

## Artefatos e limites

pg_dump custom inclui todos os schemas acessíveis, dados, owners e ACLs,
Auth, metadados de Storage e histórico de migrations existente, num snapshot
consistente do banco. Roles são exportadas separadamente por pg_dumpall
--roles-only --no-role-passwords. Grants/default privileges não são descartados.
Falha de leitura ou criptografia aborta; não usar flags para ignorar erros.

Cada stdout flui diretamente para age; só ciphertext é escrito. Diretórios
únicos 0700, arquivos 0600, checksums SHA-256 por arquivo criptografado.
Manifest de falha nunca vira PASS; export completo é `exported_unverified`,
restore `NOT RUN`, conversão `BLOCKED`. Retenção e cópia durável são do destino
aprovado; o script não transfere dados a terceiros nem sobrescreve exports.

Não cobre arquivos de Storage (aborta quando há objetos), configuração externa
Auth/e-mail/OAuth/cron/Vercel, secrets de plataforma ou chave raiz de criptografia
Vault. Roles são outro snapshot; inventário anterior não é o snapshot do dump.
Não vincular automaticamente o hash do inventário anterior à prova de backup.
Exigir manutenção sem escritores e reconciliação no restore antes de conversão.

## Restore e rollback

Não restaurar estes arquivos sobre Pilot/legado/Production nem usar o verificador
public-only: o dump completo contém schemas gerenciados. Primeiro validar hashes,
descriptografar com a chave privada num executor isolado aprovado, inspecionar
pg_restore --list e confrontar schemas/extensões/roles/owners com Supabase PG17.
Roles de plataforma e superuser devem ser reconciliadas antes de aplicação;
o arquivo de roles não deve ser aplicado cegamente.

O drill existente permanece Pilot-only, com destino contêiner novo; ele gera
seus próprios dumps e não comprova restauração deste export. Para estes arquivos,
ainda é necessário o restore isolado do **mesmo backup**, preservando owners,
ACL/default privileges, RLS/policies, constraints, Auth e Storage, contagens e
conteúdo (comparação protegida), migrations e extensões. Não publicar detalhes
dos dados. Depois testar isolamento/canário e registrar tempos reais.

Rollback da preparação: revert da PR, sem mudança em banco. Rollback do futuro
cutover requer backup retido e restore aprovado; revert de código não recupera
dados. Permanecem obrigatórios classificação/retention/owner approval, advisors,
doctor, seed sintético e release gates antes de ativar Demo ou Production.

Referências: [backup/restore oficial](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[backups e limite de Storage](https://supabase.com/docs/guides/platform/backups).
