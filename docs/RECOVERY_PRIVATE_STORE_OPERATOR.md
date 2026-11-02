# Recuperação gratuita na máquina do proprietário (private-store)

Esta é a estratégia recomendada: executar as ferramentas existentes em Linux/WSL2
confiável, com disco **já existente e persistente**. Não exige S3, runner privado,
plano pago ou instalação do Arandu em terceiro Supabase. GitHub Actions não acessa
automaticamente o disco da sua máquina e não pode ser usado como backup definitivo.

## 1. Preparação única

- Node 24, clientes **e servidor** PostgreSQL 17 (psql, pg_dump, pg_dumpall,
  pg_restore, initdb e pg_ctl), age/age-keygen 1.3.2. Usar os fornecedores oficiais;
  não executar scripts de instalação remota não revisados. O instalador do repo
  `install-recovery-tools.sh` é específico de Ubuntu 24.04/CI, não Debian/Windows.
- Checkout revisado, fora da pasta dos backups, sem jobs ou escritores simultâneos
  nos projetos durante cada snapshot. Não executar seed, reset ou migration para
  produzir o backup. A janela sem escritores preserva a coerência entre banco,
  roles, configuração e arquivos Storage.
- Escolher um diretório no disco persistente local (Linux/WSL2 ext4, não /tmp,
  /run, pasta de runner, repo ou mount sem permissões POSIX). Verificar espaço
  livre, persistência após reinício e cópia do ciphertext em outro disco privado
  já existente. Nenhum caminho nesta instrução é um destino já aprovado.
- Escolher **outra pasta**, privada, para a identidade age e manter uma cópia
  offline segura separada do ciphertext. Sem essa identidade não há restauração.
- No painel Connect do Supabase, obter a conexão administrativa de cada projeto.
  Direct: postgres, db.REF.supabase.co:5432, banco postgres (IPv6 no Free).
  Se a rede só tem IPv4, usar **Session pooler** oficial do painel, porta 5432,
  usuário postgres.REF. Não contratar IPv4 add-on; não usar porta 6543, anon ou
  service_role como substituto de acesso PostgreSQL. Não adivinhar host do pooler.
- Usar TLS: preferir `sslmode=verify-full`, certificado raiz obtido do próprio
  painel em `~/.postgresql/root.crt` (0644). Ferramentas isolam parâmetros libpq;
  `sslrootcert` não é uma opção aceita no URL pelo gate atual. O arquivo padrão
  sob o HOME do operador é compatível também com o inventário de Storage.
  Não desabilitar validação TLS para contornar conexão falha. Caracteres especiais
  da senha no URI precisam do encoding correto, conforme painel/cliente oficial.

Em um terminal local privado, sem gravação de sessão nem `set -x`:

```bash
set +x
umask 077
read -r -p 'Pasta absoluta do store persistente escolhido: ' ARANDU_RECOVERY_DIRECTORY
read -r -p 'Arquivo absoluto da identidade age, em outra pasta: ' ARANDU_RECOVERY_IDENTITY_FILE
export ARANDU_RECOVERY_DIRECTORY ARANDU_RECOVERY_IDENTITY_FILE
# Criar somente as pastas escolhidas; conferir o destino antes destes comandos.
install -d -m 0700 "$ARANDU_RECOVERY_DIRECTORY" "$(dirname "$ARANDU_RECOVERY_IDENTITY_FILE")"
npm run recovery:key:prepare -- --generate
npm run recovery:store:init -- --attest-persistent --retention-days=365
```

O primeiro comando imprime só destinatário **público** e fingerprint após provar
ida/volta. Guardar a identidade privada offline; não enviar a GitHub, Vercel ou chat.
`store-init` recusa reinicializar um store existente: não apagar o marcador para
contornar essa proteção. Se já preparado, usar doctor/verify diretamente.

## 2. Configuração por projeto, sem segredo no histórico do shell

O exemplo começa pelo Pilot. Repetir depois para o legado com a **conexão dele**.

```bash
export ARANDU_RECOVERY_PROJECT_REF=offgpyysgdhfemjlchod
read -r -s -p 'Conexão PostgreSQL administrativa do Pilot (TLS): ' ARANDU_RECOVERY_DATABASE_URL
printf '\n'
read -r -p 'Destinatário público age1...: ' ARANDU_RECOVERY_RECIPIENT
export ARANDU_RECOVERY_DATABASE_URL ARANDU_RECOVERY_RECIPIENT
export ARANDU_RECOVERY_CONFIRM=ARANDU-ENCRYPTED-EXPORT
npm run recovery:doctor -- --export
```

Doctor é apenas configuração/ferramentas, sem conexão ao banco. READY não prova
acesso PostgreSQL, persistência real do disco, backup ou restore. Após sucesso:

```bash
npm run recovery:export:private
```

O export faz conexão read-only, snapshot compartilhado com pg_dump, roles sem
passwords, criptografia em streaming, fsync e hashes relidos. Nível 4 é integridade
do ciphertext, **não restore**. Anotar o subdiretório novo retornado; não sobrescrever.
Se `RECOVERY_STORAGE_OBJECTS_PRESENT`, não ignorar: usar a etapa Storage abaixo.

Para o legado: `ARANDU_RECOVERY_PROJECT_REF=igacnfjeuqhxcmfyepgj`, nova conexão
oculta correspondente, mesmo destinatário de recuperação e store privado se
aprovado pelo proprietário. Não confundir credencial de recuperação com credencial
de runtime: Demo/Production continuam com Auth/Storage/segredos próprios.

## 3. Restore isolado do MESMO export

Não restaurar sobre nenhum Supabase hospedado. Criar um cluster PostgreSQL 17
loopback **novo, descartável e privado** na máquina confiável, usuário não root;
sem objetos/dados de outro agente. Local/porta/pasta escolhidos explicitamente.
Inspecionar o dump com pg_restore --list via decriptação em pipe (sem arquivo
plaintext). Reconciliar roles de plataforma/extensões conforme o inventário e a
versão de origem; o verificador não aplica roles.sql automaticamente. Falta de
role/extension deve abortar, não gerar restore parcial aceito.

```bash
read -r -p 'Diretório absoluto do export recém-gerado: ' ARANDU_RECOVERY_BACKUP
read -r -p 'URL do banco PG17 NOVO em loopback: ' ARANDU_RESTORE_TARGET_URL
export ARANDU_RECOVERY_BACKUP ARANDU_RESTORE_TARGET_URL
export ARANDU_RESTORE_BACKUP="$ARANDU_RECOVERY_BACKUP"
export ARANDU_RESTORE_IDENTITY="$ARANDU_RECOVERY_IDENTITY_FILE"
export ARANDU_RESTORE_CONFIRM=ARANDU-ISOLATED-RESTORE
npm run recovery:restore:verify
npm run recovery:verify
```

O verificador só aceita loopback e destino sem linhas em public/Auth/Storage/
migrations; usa transação única e registra hashes do mesmo export, schema e
contagens reconciliados. Só MATCH é aceitável; não editar manifests/records.
Nível 5 cobre artefatos PostgreSQL/Storage, não recompõe configuração externa de
Auth/OAuth/MFA/SMTP/Vercel/Vault/cron. Validar esses componentes separadamente.

## 4. Storage se houver arquivos

Antes do export do banco, definir `ARANDU_RECOVERY_STORAGE_BINARIES=separate-export`,
`ARANDU_STORAGE_SOURCE_URL=https://REF.supabase.co/storage/v1` e obter a chave
service role **somente para baixar os arquivos** pelo prompt oculto local em
ARANDU_STORAGE_SOURCE_SERVICE_KEY. O dump continua usando a conexão administrativa.
Exportar os binários **dentro do diretório do export do banco** usando:

```bash
export ARANDU_STORAGE_CONFIRM=ARANDU-STORAGE-EXPORT
export ARANDU_STORAGE_SOURCE_KIND=hosted
export ARANDU_STORAGE_PROJECT_REF="$ARANDU_RECOVERY_PROJECT_REF"
export ARANDU_STORAGE_DATABASE_URL="$ARANDU_RECOVERY_DATABASE_URL"
export ARANDU_STORAGE_RECIPIENT="$ARANDU_RECOVERY_RECIPIENT"
export ARANDU_STORAGE_DIRECTORY="$ARANDU_RECOVERY_BACKUP"
npm run recovery:storage:export
```

Para restaurar bytes é necessária a stack Supabase **local descartável** compatível
(Storage real, não apenas PG). Definir ARANDU_STORAGE_BACKUP para o arandu-storage-*
gerado, ARANDU_STORAGE_IDENTITY para a identidade separada,
ARANDU_STORAGE_TARGET_DATABASE_URL/URL/JWT_SECRET do destino local e
ARANDU_STORAGE_RESTORE_CONFIRM=ARANDU-ISOLATED-STORAGE-RESTORE. Então executar
`recovery:storage:restore`, `recovery:storage:verify` e `recovery:verify` do banco.
Sem bytes/permissões reconciliados, recovery é DATABASE_ONLY e não libera conversão.
Runbook completo: `SUPABASE_ENCRYPTED_PRESERVATION.md`.

## 5. Environment database-recovery — preparo, não disparo

Verificação somente leitura: `npm run recovery:github:check`. O relatório separa
ACCESS_BLOCKED de segredo ausente; nomes existentes não provam valores válidos.
Antes de usar Actions, owner deve verificar nomes de secrets, required reviewers,
prevent_self_review, bypass administrativo e main-only. A configuração esperada
exige review independente, bypass desligado e executor/destino comprovados.
Um 403 na leitura de secrets significa acesso bloqueado, não segredo ausente.

| Secret previsto | Conteúdo a cadastrar pelo owner, fora do chat |
| --- | --- |
| ARANDU_PILOT_RECOVERY_DATABASE_URL | conexão PostgreSQL administrativa/TLS do Pilot |
| ARANDU_LEGACY_RECOVERY_DATABASE_URL | conexão administrativa/TLS do legado |
| ARANDU_RECOVERY_RECIPIENT | destinatário age público, nunca identidade privada |
| ARANDU_RECOVERY_DIRECTORY | caminho do mount durável **no executor privado existente**, somente se tal executor for aprovado |

No painel Settings → Environments → database-recovery → Environment secrets,
cadastrar os três primeiros valores diretamente. Alternativa no **terminal do
proprietário**, autenticado no gh, com variáveis obtidas por prompt oculto:

```bash
read -r -s -p 'Conexão TLS do Pilot para o secret: ' ARANDU_PILOT_RECOVERY_DATABASE_URL
printf '\n'
read -r -s -p 'Conexão TLS do legado para o secret: ' ARANDU_LEGACY_RECOVERY_DATABASE_URL
printf '\n'
test -n "${ARANDU_PILOT_RECOVERY_DATABASE_URL:-}" && printf '%s' "$ARANDU_PILOT_RECOVERY_DATABASE_URL" | gh secret set ARANDU_PILOT_RECOVERY_DATABASE_URL --env database-recovery --repo lucasweber1202/Arandu
test -n "${ARANDU_LEGACY_RECOVERY_DATABASE_URL:-}" && printf '%s' "$ARANDU_LEGACY_RECOVERY_DATABASE_URL" | gh secret set ARANDU_LEGACY_RECOVERY_DATABASE_URL --env database-recovery --repo lucasweber1202/Arandu
test -n "${ARANDU_RECOVERY_RECIPIENT:-}" && printf '%s' "$ARANDU_RECOVERY_RECIPIENT" | gh secret set ARANDU_RECOVERY_RECIPIENT --env database-recovery --repo lucasweber1202/Arandu
gh secret list --env database-recovery --repo lucasweber1202/Arandu
```

Não executar printf com variável vazia; a listagem só confirma nomes/datas.
Não cadastrar PRIVATE age key. Não criar ARANDU_RECOVERY_DESTINATION/S3 sem
destino aprovado. Não cadastrar o caminho do seu notebook como se já fosse mount
do GitHub. **Não disparar consolidation-export.yml**: github-hosted requer S3;
private-runner exige runner/mount já existentes, ainda não comprovados.
Para a estratégia A, executar localmente os passos 1–4; secrets do GitHub não
podem ser recuperados em claro para alimentar seu terminal depois.

Ao terminar: unset das variáveis de conexão/service-role/segredos do destino;
reter apenas ciphertext+manifest no store, identidade separada e evidência sem PII.
Nada deste procedimento autoriza apagar os 42 registros ou fazer cutover.

Fontes: [conexões oficiais](https://supabase.com/docs/guides/database/connecting-to-postgres),
[psql e certificado TLS](https://supabase.com/docs/guides/database/psql),
[restore Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
