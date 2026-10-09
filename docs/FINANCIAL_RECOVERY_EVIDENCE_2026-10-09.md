# Recovery — execução de 09/10/2026, ARA-8

Base: main db5cff1f40fa7b273d9331ab2bf8940e6b98bd2f (PR #150).
Objetivo: preservação antes de conversão. Não houve DDL/DML, seed/reset,
mudança de Vercel, atribuição ativa, criação paga ou decommission.

## Executado e validado

Integrações GitHub/Supabase/Linear/Vercel disponíveis. Supabase list_projects,
list_migrations, execute_sql read-only, list_branches e advisors security/
performance funcionaram. Queries reproduzíveis: consolidation-inventory.sql
e consolidation-structure.sql. Observações datadas e manifests em
ops/consolidation/*-2026-10-09.json; hashes de inventário não são backups.

| Origem | Public | Auth / Storage | Migrations / classificação |
|---|---|---|---|
| offgpyysgdhfemjlchod | 71 tabelas, 13 linhas, 101 funções, 51 policies | 0 usuários/MFA/objetos, 1 bucket privado | 3 migrations; classificação completa de texto operacional pendente |
| igacnfjeuqhxcmfyepgj | 16 tabelas, 42 linhas, 2 funções, 12 policies | 0 usuários/MFA/objetos/buckets | 0 migrations; oito registros com campos de contato/destinatário, não descartáveis |

Todos os public tables observados têm RLS enabled; não equivale a isolamento
validado. customer_rows e personal_data_rows permanecem null nos dois manifests.
Risco legado: duas security-definer views no advisor, search_path mutável e
handle_new_user_profile executável por anon/authenticated. Não corrigidos no
hosted; nenhuma revogação automática. Canonical SQL continua sujeito aos testes
de segurança existentes antes de instalação. RPC financeira autorizada não é
vulnerabilidade apenas por constar do advisor. Índices não usados não removidos.
Ver URLs de remediação nos manifests sanitizados de advisors.

Vercel via get_project: arandu dpl_6jYDwtjEPmh9iWLJAhzntZ6qQRwm ERROR;
arandu-demo dpl_9ScMLT6GJYbAEMoyF5KRHb9Z49vu READY;
arandu-pilot dpl_7obhQpFvjg8wg8ZKCknnVGWMCYdm READY (target preview/null).
Não reler logs já negados nem iniciar browser. A primeira falha efetiva do
build de Production ainda não foi observada. Static preflight é BLOCKED nos
dois ambientes por ausência de banco aprovado; não atribuir log não lido a isso.

## Implementado; execução hospedada pendente

scripts/consolidation-export.mjs reutiliza o guard de conexão com ref explícito,
sem ampliar o drill Pilot-only. Export completo custom + roles sem senhas,
criptografia age em streaming, caminhos privados reais, arquivos exclusivos,
checagem PG17/TLS/Storage vazio, limpeza de ciphertext parcial, timeout e hashes.
Sem URI/senha em argv, stderr sensível ou arquivo plaintext. Manifests dizem
exported_unverified / restore NOT RUN / conversion BLOCKED.

Workflow manual main/SHA exato, token contents:read, actions pinadas,
Environment database-recovery e runner privado preexistente. Sem artifact
upload, SQL arbitrário, restore ou endpoint de transferência informado por input.
Não executado: proteção do Environment, runner, credenciais libpq, age e mount
privado aprovado não foram comprovados. Este executor não tem credenciais DB
configuradas nem psql/Docker. Conector SQL não fornece libpq/export/restore.
Detalhes/nomes dos secrets e aprovação do destino: SUPABASE_ENCRYPTED_PRESERVATION.md.

## Validação local

check:all, build, audit:ci (zero vulnerabilidades), check:build-size,
check:dist-assets, check:staging e git diff --check passaram. Testes do export
usam subprocessos mock: identidade errada, PG16, Storage não vazio, destinatário
inválido, symlink para repo, permissões abertas, falha pg_dumpall/age, remoção de
parcial, ausência de secrets em argv/logs e nenhuma falsa prova de recovery.
Não são teste de criptografia real nem backup remoto.

consolidation:check aceita source_identity/exact_inventory para ambos e bloqueia
PII/export/restore. finance:env:check passa apenas em development sem datasource;
não valida configuração hosted. release:candidate:check NO-GO, sem prova M4.
pilot:backup:preflight BLOCKED, conexão administrativa ausente neste executor.
test:database tentou execução e bloqueou: psql not found; obrigatório no CI.
Sem alterações de UI/schema, não executadas novas jornadas de navegador.

Bundles preparados, não aplicados: cleanInstall SHA-256
bed3fa64c83a69c509c02ebda6381c7d9d2cc27c2996997c9b0ae269a5267555;
existingDatabase desde surface-hardening até antes de decommission SHA-256
8e15a95bd1a95a5ef9dbdebd6107bc0f3bbf520e64ed9a8580fc23820f0084a0.

## Próxima operação

Revisão/PR verde no HEAD exato; configurar e comprovar Environment protegido,
executor privado autorizado/destino/recipient e conexões por secrets; export
criptografado real. Depois restore do mesmo backup em alvo descartável Supabase
PG17, reconciliação de owners/roles/ACL/RLS/Auth/Storage/migrations/contagens e
classificação/retention aprovada. Somente então propor cutover/allowlists e
Demo autenticada/M4; Production continua bloqueada. Nenhum backup/restore PASS
ou aprovação humana foi produzido nesta rodada.
