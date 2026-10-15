# Preservação criptografada dos dois slots

Estado: preparado, não executado contra Supabase; não comprova recovery hospedado.
Continua a preparação de `TWO_ENVIRONMENT_CONSOLIDATION.md`, sem substituir
o drill `scripts/pilot-restore-drill.sh` e sem mudar atribuições ativas.
Desde 15/10/2026 a cadeia cobre os **binários do Storage** (seção abaixo), com
prova sintética completa no laboratório efêmero; nada foi exportado de banco
ou Storage hospedado.

## Binários do Storage e estratégia recomendada (15/10/2026)

O `pg_dump` leva só os metadados de `storage.objects`; os arquivos ficam no
backend do Storage. `scripts/storage-recovery.mjs` fecha essa lacuna:

- **Inventário** (`INVENTORY_SQL`, read only, `row_security=off`): buckets,
  objetos e as versões de documento que o produto dá como disponíveis
  (`fin_document_versions` + `fin_private_documents`). Recusa o export se uma
  versão disponível não tem objeto, se o tamanho diverge ou se o caminho
  (`<organização>/<documento>/v<n>-<uuid>`) não começa pela organização dona
  (atribuição cruzada). Objeto sem referência (envio pendente) é preservado e contado.
- **Bytes pela API oficial**: download autenticado com service role
  (`/object/authenticated/<bucket>/<nome>`); tamanho igual ao metadado e
  SHA-256 igual ao registrado pelo produto, quando houver.
- **Criptografia e manifesto**: cada objeto vira `storage/obj-NNNNNN.age`; nomes,
  tamanhos, tipos e hashes do conteúdo ficam só no índice cifrado
  (`storage-index.json.age`). O `storage-manifest.json` em claro tem contagens,
  visibilidade dos buckets, digest do inventário e do índice e hash/bytes de
  cada ciphertext — nenhum nome de objeto. Nasce `failed`; só vira
  `exported_unverified` no fim.
- **Restore isolado** (`restore`): banco e Storage de destino **só loopback**;
  confere manifesto e hashes de todos os ciphertexts antes de decifrar
  (`STORAGE_ARTIFACT_MISSING`, `STORAGE_HASH_MISMATCH`), decifra em memória,
  confere o hash de cada objeto contra o índice, envia pela API oficial
  (upload com `x-upsert`) e relê tudo.
- **Reconciliação** (`reconcileStorage`): mesmo conjunto bucket/nome, mesmo
  tamanho, binário presente e com o mesmo SHA-256, visibilidade dos buckets e
  referências do produto satisfeitas no destino. Metadado sem arquivo é
  `missing_binary`: **um restore só do banco nunca passa** (`verify`).
- **Permissões**: no destino, URL pública, token anônimo e um membro
  restaurado lendo direto do Storage o objeto da própria organização e o de
  outra são recusados (documento só sai pela API do Arandu com RPC de autorização).
- **Registro**: `storage-restore-verification-*.json` (0600) preso ao export
  (digest do índice e dos ciphertexts), com diferenças só por número de sequência.

Na cadeia canônica, com arquivos na origem o export do banco exige
`ARANDU_RECOVERY_STORAGE_BINARIES=separate-export` (manifesto registra
`storage_binaries: SEPARATE_EXPORT_REQUIRED`), e `recovery:verify` só chega a
`RECOVERY_VERIFIED` (nível 5) quando, além do restore do banco, há dentro do
mesmo export um `arandu-storage-*` íntegro, com a mesma quantidade de objetos do
snapshot e registro de restore `MATCH` com permissões negadas. Sem isso o
resultado é `RECOVERY_DATABASE_ONLY` (nível 4). O ensaio
`scripts/pilot-restore-drill.sh` aplica a mesma regra (`recovery_complete`).

### Cobertura da cadeia

| Item | Coberto por | Prova |
| --- | --- | --- |
| Banco (`public`, dados, constraints, funções) | `pg_dump` custom em snapshot | `test-recovery-real.mjs` (PG17, CI `database`); ensaio Supabase |
| Auth (usuários, identidades, gatilhos) | dump completo / `auth.users`+`identities` no ensaio | contagens + probes do ensaio |
| Roles e grants | `pg_dumpall --roles-only --no-role-passwords` (nunca aplicado às cegas); ACLs no dump | probes `table_grants`, `storage_grants`, `anon_functions` |
| RLS e policies | dump; policies do Storage no ensaio | `fin_tables_all_rls_enabled`, `policies`, `storage_policies`, canário |
| Migrations | `supabase_migrations` + `fin_settings.schema_version` | `schema_version`, `schema_fingerprint` |
| Metadados do Storage | `storage.buckets`/`objects` no dump | `storage_objects`, `bucket_private` |
| **Binários do Storage** | `scripts/storage-recovery.mjs` | ensaio: export, negativos, restore só do banco recusado, MATCH, permissões |
| Configuração essencial | `fin_settings` (digest) | `settings_sha256` |
| Chaves de recuperação | identidade age do operador (`recovery:key:prepare`), fora do store e do CI | ida e volta comprovada; cópia offline é responsabilidade do operador |
| Dependências externas (Auth/e-mail/OAuth/SMTP, cron, Vercel, secrets da plataforma, chave raiz do Vault) | **não cobertas** | inventário manual antes do cutover (`TWO_ENVIRONMENT_CONSOLIDATION.md`) |

MFA (`auth.mfa_factors`) e policies em `auth` continuam fora: o preflight recusa
origem que os tenha.

### Estratégia com menos intervenção humana

| Estratégia | Preparação única | Intervenção por execução | Durabilidade | Risco |
| --- | --- | --- | --- | --- |
| **A — máquina do operador** (`recovery:*` local) | PG17 + age; `recovery:key:prepare` e `recovery:store:init` | rodar os comandos abaixo com as variáveis no shell | disco do operador atestado + cópia offline | depende de máquina confiável; sem custo novo |
| B — `github-hosted` + S3 | bucket S3 privado **existente** (não contratar), policy com `If-None-Match`, secrets no Environment | gerar 6 URLs SigV4 novas por execução (PUT/GET de 3 objetos) e aprovar o run | bucket aprovado | mais trabalho por execução; binários do Storage ainda não têm transporte S3 |
| C — `private-runner` | registrar runner dedicado `arandu-recovery`, mount durável, secrets | aprovar o run | mount do runner | infraestrutura própria; **não é requisito** |

Recomendação: **A**, que exige menos intervenção sem perder segurança — nenhum
recurso pago, nenhum runner próprio, nenhuma URL por execução, identidade
privada nunca no CI, store durável atestado e verificação de integridade e de
restore pelo mesmo código testado no CI. B continua válida para quem já tem
bucket; C só se houver runner dedicado já aprovado.

### Runbook da estratégia A com binários (execução autorizada futura)

Variáveis no shell local, nunca em arquivo do repositório nem em chat. Ordem:

```
# 0. uma vez: identidade e store (ver runbook da estratégia A, abaixo)
# 1. preflight, sem acessar banco nem Storage
ARANDU_RECOVERY_PROJECT_REF=<ref> ARANDU_RECOVERY_DATABASE_URL=… ARANDU_RECOVERY_RECIPIENT=… \
ARANDU_RECOVERY_DIRECTORY=… ARANDU_RECOVERY_CONFIRM=ARANDU-ENCRYPTED-EXPORT \
ARANDU_RECOVERY_STORAGE_BINARIES=separate-export \
ARANDU_STORAGE_SOURCE_URL=https://<ref>.supabase.co/storage/v1 ARANDU_STORAGE_SOURCE_SERVICE_KEY=… \
  npm run recovery:doctor -- --export
# 2. banco (janela sem escritores), depois os binários DENTRO do export do banco
npm run recovery:export:private
ARANDU_STORAGE_CONFIRM=ARANDU-STORAGE-EXPORT ARANDU_STORAGE_SOURCE_KIND=hosted ARANDU_STORAGE_PROJECT_REF=<ref> \
ARANDU_STORAGE_DATABASE_URL="$ARANDU_RECOVERY_DATABASE_URL" ARANDU_STORAGE_RECIPIENT="$ARANDU_RECOVERY_RECIPIENT" \
ARANDU_STORAGE_DIRECTORY=<diretório do export do banco> npm run recovery:storage:export
# 3. restore isolado do banco (PG17 loopback) e, num Supabase descartável
#    loopback (o próprio ensaio), dos binários
npm run recovery:restore:verify
ARANDU_STORAGE_RESTORE_CONFIRM=ARANDU-ISOLATED-STORAGE-RESTORE ARANDU_STORAGE_BACKUP=<arandu-storage-…> \
ARANDU_STORAGE_IDENTITY=… ARANDU_STORAGE_TARGET_DATABASE_URL=postgresql://…@127.0.0.1:<porta>/postgres \
ARANDU_STORAGE_TARGET_URL=http://127.0.0.1:<porta-storage> ARANDU_STORAGE_TARGET_JWT_SECRET=… \
  npm run recovery:storage:restore
# 4. nível final: 5 só com banco e binários restaurados
ARANDU_RECOVERY_BACKUP=<export do banco> npm run recovery:verify
```

O ensaio completo sobre Supabase descartável (banco + binários) também roda em
`PILOT_SOURCE_DATABASE_URL=… PILOT_DRILL_STORAGE_BINARIES=1
PILOT_DRILL_STORAGE_SOURCE_URL=https://<ref>.supabase.co/storage/v1
PILOT_DRILL_STORAGE_SOURCE_KEY=… npm run pilot:restore:drill`. Nada disso foi
executado contra o Pilot ou o legado: exige a autorização explícita da missão.

Achado do ensaio: as migrations do Storage não concedem acesso às tabelas a
`anon`/`authenticated`/`service_role` (o projeto Supabase concede à parte). Um
restore sem os ACLs do schema `storage` deixa o Storage inutilizável até para o
`service_role` (`42501`). O ensaio restaura esses ACLs do próprio backup e
compara `storage_grants` com a origem.

## Estratégias de destino e operação sem AWS (11/10/2026)

A primeira execução real (run 38179837512, job `preserve-hosted`, `main@a321888`)
falhou em `approvedDestination()` — antes de qualquer conexão com o Supabase —
porque o Environment `database-recovery` não tinha
`ARANDU_PILOT_RECOVERY_DATABASE_URL`, `ARANDU_RECOVERY_RECIPIENT` nem
`ARANDU_RECOVERY_DESTINATION`. Não foi falha de autenticação, conexão nem backup.
O workflow agora roda um preflight de configuração antes do export e nomeia a
primeira falha por código (`RECOVERY_DATABASE_URL_MISSING`,
`RECOVERY_RECIPIENT_MISSING`, `RECOVERY_DESTINATION_MISSING`, …), sem valores.

| Estratégia | Onde roda | Destino do ciphertext | Dependência paga |
| --- | --- | --- | --- |
| `private-store` (A) | máquina confiável do operador ou runner dedicado `arandu-recovery` | diretório privado durável, fora do repo e de áreas temporárias, 0700, marcado por `store-init` | nenhuma |
| `s3` (B) | `ubuntu-24.04` efêmero | URLs SigV4 aprovadas com PUT condicional e readback | bucket S3 |

O runner hospedado do GitHub nunca vale como store (`RECOVERY_STORAGE_NOT_DURABLE`).

Códigos (`lib/recovery-doctor.mjs`, `scripts/recovery.mjs`): configuração
(`*_MISSING`, `*_INVALID`, `RECOVERY_STORE_NOT_INITIALIZED`,
`RECOVERY_DESTINATION_PERMISSIONS`, `RECOVERY_STORAGE_NOT_DURABLE`), ferramentas
(`RECOVERY_PG_VERSION_INVALID`, `RECOVERY_AGE_UNAVAILABLE`), conexão
(`RECOVERY_CONNECTION_FAILED`, `RECOVERY_STORAGE_OBJECTS_PRESENT`), export
(`RECOVERY_EXPORT_FAILED`), criptografia (`RECOVERY_ENCRYPTION_FAILED`),
persistência (`RECOVERY_PERSISTENCE_FAILED`, `RECOVERY_TRANSFER_FAILED`),
integridade (`RECOVERY_READBACK_FAILED`, `RECOVERY_MANIFEST_INVALID`) e
recuperação (`RECOVERY_RESTORE_NOT_VERIFIED` até existir restore com `MATCH`).

### Runbook da estratégia A (máquina do operador, Linux, PG17 + age 1.3.2)

Variáveis só no shell local (nunca em arquivo do repositório nem em chat):

1. Identidade, uma vez, em diretório 0700 fora do repo e do store:
   `ARANDU_RECOVERY_IDENTITY_FILE=/caminho/seguro/arandu-recovery.agekey npm run recovery:key:prepare -- --generate`.
   Imprime só o destinatário público e o fingerprint, após provar
   criptografia/decriptação de um fixture. Recusa CI. Guarde uma cópia offline
   da identidade separada do store; sem ela o ciphertext é irrecuperável.
2. Store durável, uma vez: `ARANDU_RECOVERY_DIRECTORY=/disco/persistente/arandu-recovery npm run recovery:store:init -- --attest-persistent --retention-days=365`.
3. Diagnóstico: `npm run recovery:doctor -- --export` com
   `ARANDU_RECOVERY_PROJECT_REF`, `ARANDU_RECOVERY_DATABASE_URL` (conexão
   PostgreSQL direct ou session pooler do próprio projeto; service role e anon
   key não servem para `pg_dump`), `ARANDU_RECOVERY_RECIPIENT`,
   `ARANDU_RECOVERY_DIRECTORY` e `ARANDU_RECOVERY_CONFIRM=ARANDU-ENCRYPTED-EXPORT`.
   Não acessa o banco.
4. Export: `npm run recovery:export:private` — preflight, snapshot read-only,
   `pg_dump`/`pg_dumpall --roles-only --no-role-passwords` cifrados em streaming,
   manifest com hashes e verificação imediata no store (nível 4).
5. Restore isolado do mesmo export num PG17 loopback novo:
   `npm run recovery:restore:verify` (inalterado). Depois
   `ARANDU_RECOVERY_BACKUP=<export> npm run recovery:verify` só reporta
   `RECOVERY_VERIFIED` (nível 5) se houver registro de restore `MATCH` dos mesmos
   hashes. Conversão continua BLOCKED até aprovação explícita.

No runner dedicado, `consolidation-export.yml` com `executor=private-runner`
faz os passos 3–4 com os secrets do Environment; a identidade nunca vai ao runner.

### Estados de recuperação e durabilidade (12/10/2026)

`recovery:doctor`, `recovery:export:private` e `recovery:verify` emitem `state`
(`RECOVERY_STATES` em `lib/recovery-doctor.mjs`), separado do nível numérico:

| Estado | Prova exigida | Emitido por |
| --- | --- | --- |
| `RECOVERY_BLOCKED` | preflight com qualquer código de falha | doctor |
| `RECOVERY_CODE_READY` | testes sintéticos verdes no CI (`test-recovery-*`); não depende do ambiente | CI |
| `RECOVERY_CONFIGURATION_READY` | preflight READY; banco não acessado | doctor |
| `RECOVERY_EXPORT_VERIFIED` | export persistido com fsync e hashes relidos do store (nível 4) | export / verify |
| `RECOVERY_RESTORE_VERIFIED` | restore isolado do MESMO export com reconciliação `MATCH` (nível 5) | verify |

Nenhum estado libera conversão (`conversion: BLOCKED` sempre). O exportador
agora faz `fsync` de cada ciphertext, do manifest e das entradas de diretório
(export e store); falha de gravação durável é `RECOVERY_PERSISTENCE_FAILED`, e
qualquer falha depois de o manifest ter sido marcado concluído o volta para
`failed` com o código do estágio. `recovery:verify` só considera um registro
`restore-verification-*.json` que seja arquivo regular 0600 do mesmo operador
(nunca symlink), grave a mesma origem e o mesmo `started_at` do export, alvo
loopback descartável, roles não aplicadas, `MATCH` sem diferenças, contagens
de origem e destino iguais às do snapshot e verificação posterior ao export.

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

Arquivos de Storage: export separado e cifrado (`scripts/storage-recovery.mjs`,
seção do topo); sem a declaração `separate-export`, o export do banco aborta
quando há objetos. Não cobre configuração externa
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

## Reconciliação e restore isolado executáveis (10/10/2026)

O export abre uma sessão read-only (`repeatable read`), exporta o snapshot com
`pg_export_snapshot()`, conta as linhas de cada tabela de `public`, `auth`,
`storage` e `supabase_migrations` **dentro desse snapshot** (`row_security=off`:
conta tudo ou falha) e roda `pg_dump --snapshot=<id>`. O manifest passa a ter
`snapshot_counts` (só nomes de tabela e contagens) e `snapshot_counts_sha256`.
Sessão perdida antes do dump (ex.: timeout de transação ociosa) aborta o export.

`npm run recovery:restore:verify`, num executor isolado com PG17 e age:

```
ARANDU_RESTORE_CONFIRM=ARANDU-ISOLATED-RESTORE \
ARANDU_RESTORE_BACKUP=/caminho/privado/arandu-<ref>-<uuid> \
ARANDU_RESTORE_IDENTITY=/caminho/privado/identity.txt   # 0600, fora do repo
ARANDU_RESTORE_TARGET_URL=postgresql://postgres@127.0.0.1:<porta>/postgres?sslmode=disable \
npm run recovery:restore:verify
```

Ordem fail-closed: confirmação; caminhos fora do repositório; identidade 0600;
destino **somente loopback** (projeto hospedado, pooler e IP de rede recusados);
manifest concluído com contagens do snapshot e digest íntegro; bytes e SHA-256
dos dois ciphertexts; clientes e servidor PG17; destino **sem nenhuma linha**
nos schemas reconciliados; `pg_restore --list`; restore
`--exit-on-error --single-transaction --clean --if-exists` (role ausente aborta e
reverte tudo); contagem no destino e comparação tabela a tabela. Grava
`restore-verification-<data>.json` (0600, `wx`) ao lado do manifest, sem tocar o
manifest: `reconciliation` MATCH/MISMATCH, diferenças, digests, tempo do
restore, `roles_file: NOT APPLIED`, `conversion: BLOCKED`. MISMATCH sai com
código 1. As roles de plataforma/negócio precisam existir no destino antes
(revisadas; o arquivo de roles nunca é aplicado). Contagem igual não prova
serviços Auth/Storage do Supabase nem conteúdo campo a campo; isso continua
exigindo imagem Supabase compatível, canário e jornada. O ensaio sintético
`scripts/test-recovery-real.mjs` exercita o fluxo e os negativos (hash e
contagens adulterados, identidade errada, destino com dados, destino não
loopback, role ausente com rollback total).

Fontes de instalação e transporte:
[PGDG Ubuntu](https://www.postgresql.org/download/linux/ubuntu/),
[age 1.3.2](https://github.com/FiloSottile/age/releases/tag/v1.3.2),
[S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html),
[S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).
