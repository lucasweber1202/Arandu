# Pilot hospedado — rollout recuperável do Financial Passport

Escopo: projeto `offgpyysgdhfemjlchod`, branch `pilot`. Não autoriza promoção,
participantes reais, e-mail ou provisionamento pago. Evidência atual:
[ARANDU_CURRENT_STATE_2026-10-02.md](ARANDU_CURRENT_STATE_2026-10-02.md).

## Gate de recuperação

O MCP Supabase está autenticado e permite consultas e migrations. Isso não
fornece um arquivo de backup nem acesso libpq. SQL retornado pelo conector e
backup public-only do verificador genérico não substituem o drill Supabase.

| Opção investigada | Resultado nesta sessão |
| --- | --- |
| Backup gerenciado | Dashboard redirecionou para sign-in; nenhum backup listado/baixado ou restaurado |
| pg_dump | sem conexão administrativa injetada e sem clientes instalados |
| Supabase CLI | ausente; fluxo de dump também depende de Docker/conexão |
| Branch Supabase | lista vazia; não criar recurso com custo sem aprovação |
| Container descartável | Docker/daemon ausentes |
| PostgreSQL nativo | runtime tem somente UID 0 mapeado; initdb não roda como root; não contornar essa restrição |
| Restore genérico | somente public não comprova Auth, Storage, grants e políticas Supabase |

A documentação oficial recomenda export manual no Free; backup de banco não
inclui os arquivos de Storage. Backup físico não é download lógico. Não inferir
PITR ou recuperabilidade a partir do status saudável do projeto.

Fontes: [backups](https://supabase.com/docs/guides/platform/backups),
[conexões](https://supabase.com/docs/guides/database/connecting-to-postgres),
[backup/restore CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Preparar executor seguro

Usar máquina/worker autorizado com Node, psql, pg_dump e pg_restore **17**,
Docker com daemon, openssl e acesso de rede ao Pilot e ao registry público ECR.
A origem usa TLS; obter host exato no Connect do projeto. Conexão direta pode
exigir IPv6; session pooler em 5432 é a alternativa IPv4. Não deduzir o índice
`aws-N` pela região. Transaction pooler em 6543 é recusado pelo preflight.

Injetar `PILOT_SOURCE_DATABASE_URL` pelo mecanismo seguro do executor, sem colar
no chat, gravar no Git ou usar argumentos de processo. O helper transforma a
conexão em variáveis libpq e omite stderr sensível. O relatório não contém senha
nem URI. Não recuperar credenciais de conversas antigas.

A imagem candidata é `public.ecr.aws/supabase/postgres:17.6.1.166`, correspondente
à release observada do Pilot; pull e execução ainda não foram comprovados aqui.
O preflight confere a major declarada, e o drill consulta a major **real** do
contêiner antes de restaurar. Divergência falha fechado. Auth e Storage usam as
migrations das imagens versionadas no script; divergência de integridade bloqueia
PASS e exige análise, sem editar comparações para aceitar diferença.

```bash
npm run pilot:backup:preflight
npm run pilot:restore:drill
```

`ready` no preflight significa apenas pré-condições satisfeitas: backup e restore
continuam NOT RUN. O drill só passa com integridade e canary aprovados.
O destino é sempre contêiner novo em loopback; nunca Pilot, Legacy ou Production.

## Escopo da recuperação

- `public`: schema, dados e ACLs, restaurados como postgres sem superuser;
- Auth: users/identities e gatilhos da aplicação, antes/depois de public;
- Storage: buckets e policies da aplicação;
- comparação: fingerprint public, tabelas/contagens, settings, funções/donos,
  gatilhos, constraints, grants, RLS/FORCE RLS, policies Storage e RLS Storage;
- canary no destino restaurado, com código de saída obrigatório e zero leaks.

Objetos Storage, fatores MFA e policies Auth precisam estar vazios na origem:
esses componentes não são exportados por este drill e o preflight os bloqueia
quando presentes. Não se trata de recuperação de todas as configurações externas,
sessões Auth, provedor de e-mail, secrets ou arquivos Storage. No Pilot observado
users/objetos/MFA/policies Auth são 0; reconsultar a cada execução. Preservar o
fail-closed e manter a origem sem escritores durante os dumps e comparações.

O backup fica em diretório 0700, arquivos privados, fora do repo. No hosted o
script mantém o diretório mesmo depois de remover o destino; não descartar o
backup que sustenta o rollback. Copiar para armazenamento privado durável pelo
mecanismo autorizado do executor e registrar hash/retenção sem expor dados.
`PILOT_DRILL_KEEP_BACKUP=1` mantém backup local; `PILOT_DRILL_KEEP=1` mantém também
o destino local. `reports/pilot-restore-drill.json` contém evidência sanitizada.
Uma nova tentativa remove o PASS anterior; falha/ausência de relatório não é PASS.

## Bundle e aplicação

```bash
node scripts/build-supabase-migration-bundle.mjs \
  --flow=existingDatabase --after-schema=financial-surface-hardening-1
node scripts/test-pending-migration-bundle.mjs
```

Exigir exatamente dois arquivos no relatório, nesta ordem:
`docs/supabase-financial-approval-handoff.sql` e
`docs/supabase-financial-passport.sql`. O tooling deriva o recorte do manifesto,
não aplica SQL. Marker desconhecido/ambíguo deve abortar. SHA observado do bundle:
`9b75f1949aad6c740ca2423255a3a9d3f9e394ed5118457413d43236d2d63747`.

Antes de aplicar, reconfirmar schema, contagens, identidade, CI do código e hash.
Exigir backup obtido **e retido**, restore PASS e integridade validada. Usar
`apply_migration` do MCP no projeto conhecido, um arquivo integral por migration,
na ordem canônica e em transação pelo mecanismo de migration. Não usar execute_sql
para DDL remoto, fragmentos ou UPDATE manual de schema_version.

CI #722 já comprovou instalação, upgrade, idempotência, rollback, grants, RLS,
autorização e testes negativos do Passport. Não substituir isso por grep do SQL.
O rollback Passport descarta history/snapshots: exige análise de perda de dados,
backup retido e ordem inversa dos rollbacks canônicos. Sem prova de recuperação:
**MIGRATION BLOCKED**.

## Pós-migration e gates hospedados

1. Consultar `financial-passport-1`, history/snapshots e RPCs; email false.
2. Repetir advisors sem revogação automática de RPCs autorizadas.
3. Executar env check e doctor no executor com configuração real do servidor;
   envs ausentes neste Work não comprovam falha das envs da Vercel.
4. Executar `npm run pilot:canary` com conexão injetada segura em
   `PILOT_DATABASE_URL`; não reutilizar um resultado do restore como canary hosted.
5. Repetir backup/restore e exigir `financial-passport-1` no relatório.
6. Executar jornada Passport com conta fictícia previamente autorizada: alterar
   campo permitido, provenance/freshness/history e snapshot RFQ imutável.
7. Repetir os oito GETs do smoke e examinar logs sem PII.

O canary aceita somente surface-hardening, approval-handoff e Passport. Nos dois
primeiros, as tabelas Passport devem estar ausentes; no último, devem existir e
ambas são verificadas. Marker inconsistente é erro, não check ignorado. Um Pilot
vazio testa o outsider; não comprova jornadas buyer/provider sem fixtures seguras.

Sem conta apropriada, registrar **HOSTED AUTHENTICATED JOURNEY = BLOCKED BY HUMAN
SETUP**. Não criar pessoa real, abrir allowlist ou burlar autenticação para obter
VERIFIED. HTML 200 é somente disponibilidade da página.

## Ações externas mínimas

1. Disponibilizar executor autorizado com conexão administrativa segura e
   destino descartável, e configuração real para doctor; sem secrets no chat.
2. Preparar conta/organização fictícias autorizadas após recuperação e migration,
   com fluxo normal de allowlist/Auth, para jornada hospedada.
3. Administrador GitHub: Settings → Rules → Rulesets, proteger main/pilot com PR,
   validate/database/deploy-boundaries/presentation, sem force push/delete;
   main também exige branch atualizada. A integração retornou 403 administrativo.
4. Responsável Vercel confirmar ARANDU_ENV=pilot/ref conhecida e disponibilizar
   leitura de runtime logs: a consulta agregada retornou 403.

Não abrir promoção pilot → main enquanto DB, backup, restore, doctor, canary,
Passport autenticado, CI e configuração Vercel não estiverem comprovados.
