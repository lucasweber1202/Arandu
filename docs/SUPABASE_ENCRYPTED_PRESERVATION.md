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

O caminho padrão implementado é `ubuntu-24.04`, efêmero, sem chave privada de
recuperação. `scripts/install-recovery-tools.sh` fixa PostgreSQL 17.11 (pacotes
PGDG 17.11-1.pgdg24.04+2, repositório assinado e fingerprint conferido) e age
1.3.2 (SHA-256 do release oficial conferido). Instalação não recebe secrets.
O check `database` executa `scripts/test-recovery-real.mjs`: duas instâncias
PG17 loopback novas, dados sintéticos, o export real, decriptação correta/
incorreta/corrompida e restore do mesmo dump. Isso não prova Supabase hospedado.
O runner guarda temporariamente apenas ciphertext; transferência privada exige
PUT condicional, GET e hash integral iguais. Nunca usa artifacts do GitHub.

Fallback: usar runner privado dedicado e previamente autorizado, rotulado
`self-hosted, linux, arandu-recovery`, Node 24, clientes psql/pg_dump/pg_dumpall/
pg_restore 17, age e mount privado durável fora do checkout (0700, usuário do
runner). Não cadastrar runner compartilhado com código não confiável.
Não criar recurso pago para executar este workflow.

Secrets no Environment, sem valores no chat:

- `ARANDU_PILOT_RECOVERY_DATABASE_URL`: origem offgpyysgdhfemjlchod.
- `ARANDU_LEGACY_RECOVERY_DATABASE_URL`: origem igacnfjeuqhxcmfyepgj.
- `ARANDU_RECOVERY_RECIPIENT`: destinatário público age X25519; validar posse da chave privada fora do runner.
- `ARANDU_RECOVERY_DIRECTORY`: somente fallback privado; mount durável aprovado.
- `ARANDU_RECOVERY_DESTINATION`: somente hosted; JSON de aprovação e capacidades S3 por operação (abaixo).

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
aprovado. O fallback grava no mount; o hosted transfere somente ao destino S3
explicitamente aprovado e recusa sobrescrita (`If-None-Match: *`).

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


## Destino hosted e configuração mínima pelo proprietário

Nenhum bucket foi descoberto, criado ou aprovado nesta rodada. Esta opção aceita
somente bucket AWS S3 privado existente, separado dos bancos, com HTTPS regional
virtual-hosted. Não há destino informado no dispatch. A aprovação fica no
Environment; nenhuma URL ou credencial deve ser enviada pela conversa.

Local exato: https://github.com/lucasweber1202/Arandu/settings/environments .
Criar/verificar `database-recovery`: main somente, required reviewers e prevent
self-review quando disponível. Confirmar esses controles na interface antes de
executar; `environment:` sozinho não configura proteção. A integração rejeita
os endpoints de runners/environments como não suportados; não houve 403 novo.

No mesmo Environment, cadastrar as duas URLs administrativas e o recipient
publico age nas secrets acima. A chave privada permanece no cofre do responsável
pela recuperação, com procedimento de restauração/rotação validado. Usar session
pooler 5432 do projeto, se o runner não alcançar IPv6 direct; nunca 6543.

Para cada projeto e SHA revisado, o proprietário aprova um prefixo **novo** no
bucket existente e prepara seis URLs SigV4 temporárias (PUT e GET para cada um
dos três objetos). PUT deve assinar `If-None-Match: *`; configurar também essa
condição na policy do bucket. A secret `ARANDU_RECOVERY_DESTINATION` tem formato:

```json
{
  "approved": true,
  "private": true,
  "key_recovery_verified": true,
  "id": "identificador-do-destino-aprovado",
  "project_ref": "offgpyysgdhfemjlchod",
  "reviewed_sha": "SHA_COMPLETO_DA_MAIN_REVISADA",
  "retention_days": 30,
  "approval_ref": "ARA-8",
  "jurisdiction": "BR",
  "hostname": "BUCKET.s3.sa-east-1.amazonaws.com",
  "prefix": "/recovery/PREFIXO_UNICO/",
  "objects": {
    "database.dump.age": {"put": "URL_SIGV4_PUT", "get": "URL_SIGV4_GET"},
    "roles.sql.age": {"put": "URL_SIGV4_PUT", "get": "URL_SIGV4_GET"},
    "manifest.json": {"put": "URL_SIGV4_PUT", "get": "URL_SIGV4_GET"}
  }
}
```

Os placeholders não passam no preflight. URLs devem permanecer válidas por no
mínimo 45 minutos a partir do início, com limite SigV4 de sete dias; recomendar
2h para execução e espera após aprovação. O runner não recebe credenciais AWS
permanentes, delete/list bucket nem chave age privada. Uma capability expirará
antes da retenção: preservar bucket/prefixo no registro privado e assegurar
acesso de leitura do operador após expiração/rotação, sem depender dessas URLs.

Os campos approved/private/retention/jurisdiction/key_recovery_verified são
**atestados do proprietário**, não consultas administrativas do serviço. Antes
de cadastrá-los, confirmar Block Public Access/IAM mínimo, lifecycle/retention,
jurisdição aprovada para PII, recuperação após rotação, tamanho disponível,
custo existente, auditoria e procedimento de remoção. Ciphertext não substitui
aprovação. O script limita cada objeto a 5 GB (PUT único); para bancos maiores,
manter fallback privado e planejar multipart revisado. Não contratar bucket.

Executar manualmente `Arandu Encrypted Preservation Export` na main, escolher
`github-hosted`, Pilot primeiro e informar o SHA completo revisado. O registro
sanitizado só sai após PUT/GET/hash dos dois ciphertexts e do manifest. Inclui
ref, datas, SHA executor, identidade/retention do destino, exits, bytes e hashes;
reconciliação continua NOT RUN. O manifest é publicado por último. Um run
interrompido/falho, mesmo com objetos remotos presentes, NÃO aprova backup.
Não há rollback remoto automático: objetos parciais/órfãos precisam de decisão
do operador. Retries usam novo prefixo e capacidades; nunca substituir objetos.

Local temporário removido em finally; cancelamento abrupto depende da destruição
do runner efêmero. O job não restaura nem recebe a chave de decriptação.

## Restore dos mesmos artefatos

O ensaio sintético usa exatamente os hashes e os dois ciphertexts produzidos
pelo export. O dump custom decriptado em memória é listado e restaurado com
`--exit-on-error --single-transaction`, preservando owners/ACL. A role sintética
é criada com definição explicitamente revisada, sem executar o dump de roles.
Compara dados e catálogo, constraints/índices/functions/views/triggers,
RLS/policies/grants/default privileges, Auth/Storage/migrations sintéticos e
extensões; testa leitura restrita e INSERT negado após restore.

Para os dumps hospedados, o procedimento acima continua obrigatório em executor
isolado aprovado, com imagem Supabase compatível e reconciliação das roles de
plataforma antes do pg_restore. Não há aplicação automática de pg_dumpall sobre
Supabase. Nenhum destino de restore hospedado foi provisionado/aprovado. Não
confundir schemas sintéticos chamados auth/storage com serviços Auth/Storage
funcionais do Supabase. Recovery GO continua bloqueado até esse ensaio real,
classificação LGPD, reconciliação protegida e aprovação de conversão.

Fontes de instalação e transporte:
[PGDG Ubuntu](https://www.postgresql.org/download/linux/ubuntu/),
[age 1.3.2](https://github.com/FiloSottile/age/releases/tag/v1.3.2),
[S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html),
[S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).
