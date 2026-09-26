# Ambiente do piloto

## Os quatro ambientes

| Ambiente | `ARANDU_ENV` | Dados | Supabase | Demo |
| --- | --- | --- | --- | --- |
| Desenvolvimento | `development` | descartáveis | local ou nenhum | permitido |
| Preview | `preview` | descartáveis | preview | permitido |
| **Piloto** | `pilot` | **reais, de uma empresa real** | **dedicado** | **proibido** |
| Produção | `production` | reais | produção | proibido pelo build |

O checker (`npm run finance:env:check`) infere o ambiente de `ARANDU_ENV`, ou de
`VERCEL_ENV` quando o primeiro não existe, e **recusa** duas combinações:
modo de demonstração em produção e modo de demonstração no piloto. A segunda é a
que mais importa aqui: dado DEMO misturado com dado real de empresa destrói a
confiança em tudo que o piloto medir.

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
na ordem (33 arquivos; o último é `docs/supabase-financial-pilot-operations.sql`).
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

**Não executei nenhum teste de restore, e não há RPO/RTO medido.** O que segue é
procedimento, não evidência.

O Supabase oferece backup automático conforme o plano do projeto. Para o piloto:

1. confirmar, no painel do projeto, que o backup automático está ativo e qual é
   a frequência real do plano contratado;
2. antes de qualquer migration ou rollback, exportar as tabelas financeiras:

```bash
pg_dump "$PILOT_DATABASE_URL" \
  --table='public.fin_*' --data-only --column-inserts \
  > backup-finance-$(date +%Y%m%d-%H%M).sql
```

3. testar o restore **em um banco vazio**, não no do piloto, e registrar o
   tempo que levou. Só depois desse teste existe RTO; antes dele, qualquer
   número seria invenção.

Tabelas que importam: `fin_organizations`, `fin_members`,
`fin_company_profiles`, `fin_providers`, `fin_rfqs`, `fin_rfq_invites`,
`fin_proposals`, `fin_proposal_versions`, `fin_decisions`, `fin_contracts`,
`fin_documents`, `fin_tasks`, `fin_events`, `fin_terms_acceptances`.

As três últimas linhas de defesa são independentes: backup do Supabase, export
manual antes de operação de risco, e o fato de que decisões e versões de
proposta são append-only.

## Logs e monitoramento de erro

O domínio financeiro reporta por `reportError` com `service`,
`requestId`, `route`, `status`, `code` e método. Contextos usados:
`arandu-finance-api`. **Não** vão para o log: token de convite, corpo da
requisição, termos financeiros, e-mail e mensagem crua do Postgres.

Retenção de log é a do provedor de hospedagem. Como o token de convite nunca
entra em URL de servidor (ele viaja no fragmento), o log de acesso não o
contém.
