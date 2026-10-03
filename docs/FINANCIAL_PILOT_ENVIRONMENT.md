# Ambiente do piloto

## Ambientes

| Ambiente | Projeto Vercel | Branch | `ARANDU_ENV` | Supabase | Demo |
| --- | --- | --- | --- | --- | --- |
| Desenvolvimento | — | `feature/*` | `development` | local (`pilot:local`) ou nenhum | permitida |
| Preview | qualquer projeto, deploy de PR | `feature/*` | não definido | nenhum | permitida |
| Demo canônica | `arandu-demo` | `main` | `demo` | **dedicado** (Vitta Foods) | produto real com dados fictícios |
| **Piloto** | `arandu-pilot` | **`pilot`** | `pilot` | **dedicado** (`offgpyysgdhfemjlchod`) | **proibida** |
| Produção | `arandu` | `main` | `production` | **próprio**, nunca o do piloto | **proibida** |

Fluxo entre eles: [`FINANCIAL_DEPLOYMENT_WORKFLOW.md`](FINANCIAL_DEPLOYMENT_WORKFLOW.md).
Com `ARANDU_ENV` `demo`, `pilot` ou `production`, `npm run vercel-build` roda
`finance:env:check` antes do build. O deploy falha nestes casos:
- demonstração ou apresentação ligada;
- banco compartilhado (produção no piloto, qualquer um no legado);
- chave de outro projeto;
- branch errada;
- falta de segredo de servidor.

Dado DEMO misturado com dado real de empresa destruiria a confiança em tudo que
o piloto medir.

O sandbox público temporário continua separado da demo canônica. Estado
hospedado e bloqueios datados: [ARANDU_CURRENT_STATE_2026-10-02.md](ARANDU_CURRENT_STATE_2026-10-02.md).

## Variáveis

| Variável | Piloto | Observação |
| --- | --- | --- |
| `SUPABASE_URL` | obrigatória | projeto **dedicado** ao piloto |
| `SUPABASE_ANON_KEY` | obrigatória | o domínio financeiro usa só esta, com o JWT do usuário |
| `SUPABASE_SERVICE_ROLE_KEY` | obrigatória, **só no servidor** | atravessa o RLS; usada apenas depois de uma RPC com o token do usuário autorizar: assinar URLs curtas de documentos privados e rodar a agenda de renovação |
| `CRON_SECRET` | obrigatória | 32+ caracteres (`openssl rand -hex 32`), próprio, diferente do service role; protege `/api/jobs/renewals` |
| `ARANDU_SITE_URL` | obrigatória | monta o link do convite |
| `ARANDU_ENV` | `pilot` | declara o ambiente |
| `ARANDU_PRESENTATION_MODE` | **não definir** | o checker recusa se ligada |
| `ARANDU_FINANCE_ENABLED` | opcional | desliga a vertical sem remover código |
| `ARANDU_PILOT_ALLOWLIST_CONFIRMED` | recomendada | confirma que a allowlist foi conferida |
| credencial de e-mail | opcional | sem ela, convite é entregue manualmente |

O checker nunca imprime o valor de um segredo — apenas presença, formato e
comprimento.

## Supabase dedicado

O piloto **não** compartilha banco com produção nem com preview. Motivos
concretos: o rollback do procurement financeiro remove tabelas; a allowlist é
por instância; e dado de uma empresa real não pode conviver com dado de teste.

Aplicar **todos** os arquivos de `docs/supabase-migrations.json` → `cleanInstall`,
na ordem atual do manifesto. A baseline atual tem 40 arquivos; o último
é `docs/supabase-financial-policy-engine.sql` (`financial-policy-engine-1`).
Para um banco existente, consulte o marcador e gere só o trecho pendente:

```bash
npm run migrations:bundle -- --flow=existingDatabase --after-schema=financial-surface-hardening-1
```

O comando acima gera aprovação sequencial e Passport, nessa ordem, e não
aplica SQL. Recusa marcador desconhecido e instalação limpa com salto. Backup
e restore verificados continuam obrigatórios antes de DDL remota.
Depois, `ARANDU_ENV=pilot npm run finance:pilot:doctor` confere banco, Storage, Auth,
allowlist, operador, e-mail, cron e a API publicada, somente lendo.
A sequência foi ensaiada no Postgres 15 da Supabase com `npm run pilot:local:up`.

## Domínio

**Nenhum domínio foi comprado nem registrado.** A arquitetura suporta um
subdomínio próprio para o piloto, apontando para um deployment separado com as
variáveis acima. `ARANDU_SITE_URL` precisa ser exatamente esse endereço, porque
é ele que monta o link do convite que uma instituição externa vai abrir.

Escolher, registrar e apontar o DNS é `OWNER_ACTION_REQUIRED`.

## Allowlist

A allowlist **falha fechada**: com `fin_pilot_allowlist` vazia, **ninguém** cria
organização (`fin_pilot_access_allowed` só aceita quem casa com uma linha).
Cadastrar as linhas é o próprio ato de liberar quem entra; não existe estado
"configurado pela metade" que deixe o piloto aberto. Ensaiado: tabela vazia →
403; só o domínio do comprador → provedor 403; conta fora da lista → 403.

Aceita e-mail completo ou domínio começando com `@`:

```sql
insert into public.fin_pilot_allowlist (pattern, created_by, note)
values ('cfo@empresa-piloto.exemplo', '<uuid do admin>', 'empresa piloto'),
       ('@banco-parceiro.exemplo', '<uuid do admin>', 'provedor piloto');
```

A tabela **não é legível** por conta nenhuma pelo cliente: a lista de quem foi
convidado é, ela mesma, informação.

## E-mail

Desligado por padrão, por uma chave no banco:

```sql
update public.fin_settings set value = 'true' where key = 'email_enabled';
```

A chave está no banco e não em variável de ambiente porque quem liga o envio é
quem opera o piloto, não quem faz deploy. Com ela desligada, o convite é
entregue manualmente e nada entra na fila — enfileirar sem despachante faria a
empresa acreditar que o convite saiu.

## Backups

O Supabase faz backup automático conforme o plano; confirme no painel que está
ativo e qual é a frequência real. Isso restaura o projeto inteiro. Para provar
recuperação **fora** do projeto — e medir o tempo — existe o ensaio:

```bash
PILOT_SOURCE_DATABASE_URL='<string de conexão do painel, papel postgres>' npm run pilot:restore:drill
```

Somente leitura na origem. Faz backup lógico (schema `public` com dados e
grants, `auth.users`/`auth.identities` e `storage.buckets`), sobe um Postgres
da Supabase novo com as migrations de Auth e Storage, restaura e compara origem
e destino: fingerprint do schema, linhas de cada `fin_*`, funções, gatilhos
(inclusive os de `auth.users`), políticas, constraints, grants de
anon/authenticated, RLS, bucket e `schema_version`. Depois roda o canário de
isolamento (`npm run pilot:canary`) no banco restaurado. O backup, que contém
e-mails, fica num diretório temporário `0700` apagado no fim; o relatório
`reports/pilot-restore-drill.json` tem só tempos, hashes e contagens.

Ensaio de 28/09/2026 contra o piloto local (Postgres 15 da Supabase, jornada
completa executada, 8 contas, 35 migrations): **24/24 comparações iguais**,
backup 0,6 s, destino novo 6,2 s, restore 1,8 s, probes + canário < 1 s.

**Armadilha que o ensaio achou:** `pg_restore` direto num projeto Supabase novo
reabre a `anon` **todas** as funções de `public` — inclusive as internas
SECURITY DEFINER (retenção, fila de e-mail, idempotência). Os default privileges
do projeto concedem na criação e o `pg_dump` não grava "anon sem EXECUTE". O
ensaio suspende os default privileges durante o restore e os devolve no fim;
também recria o gatilho de `auth.users`, que não está no dump de `public`.
Qualquer restore manual precisa fazer o mesmo — use o script.

RTO medido só vale para o tamanho de banco ensaiado; repita contra o piloto real
e registre o tempo na #25.

## Logs e monitoramento de erro

O domínio financeiro reporta por `reportError` com `service`,
`requestId`, `route`, `status`, `code` e método. Contextos usados:
`arandu-finance-api`. **Não** vão para o log: token de convite, corpo da
requisição, termos financeiros, e-mail e mensagem crua do Postgres.

Retenção de log é a do provedor de hospedagem. Como o token de convite nunca
entra em URL de servidor (ele viaja no fragmento), o log de acesso não o
contém.
