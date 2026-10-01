# Arquitetura da demonstração

## Princípio

> Um cliente fictício extremamente bem preparado **dentro do produto real** —
> não uma versão do produto feita para apresentação.

```text
feature/* ──PR──▶ main
                   ├── ARANDU_ENV=demo       + Supabase DEMO + seed Vitta Foods ──▶ demo
                   └── ARANDU_ENV=production + Supabase PROD (clientes reais)  ──▶ produção
```

A diferença entre demo e produção é só:

| Item | Demo | Produção |
| --- | --- | --- |
| Código | `main` | `main` |
| `ARANDU_ENV` | `demo` | `production` |
| Supabase | projeto DEMO dedicado | projeto PROD dedicado |
| Dados | Vitta Foods, semeada por `npm run demo:seed` | clientes reais |
| Contas | personas `*.example` (senha fora do Git) | usuários reais |
| Allowlist | domínios `*.example` da demo | domínios dos clientes |
| Marcador `fin_settings.deployment_environment` | `demo` | ausente |

## Onde o código sabe que é demo

Em um único ponto de configuração: o servidor lê `ARANDU_ENV` e devolve
`environment: 'demo'` em `GET /api/finance/organizations`; o shell mostra o
selo "Ambiente de demonstração" (`finance/src/shell.js`). Nenhuma tela,
regra de negócio, permissão ou rota muda. Fora isso, `ARANDU_ENV=demo` é
tratado como piloto e produção: superfície legada de arte fechada
(`lib/legacy-surface.mjs`), sandbox proibido (`lib/demo-mode.mjs`), topologia
verificada no build (`scripts/check-finance-env.mjs`, `scripts/vercel-build.mjs`)
e diagnóstico pelo `finance:pilot:doctor`.

## Como os dados entram

`scripts/demo/seed.mjs` conta a história da Vitta Foods **pela API do Arandu**
(`/api/finance/*`), com a sessão de cada persona, o RLS do Postgres e as mesmas
funções SQL de um cliente real: criar organização, convidar membros, cadastrar
provedores, abrir RFQs, convidar e aceitar, enviar propostas e versões,
comentar, anexar documentos no Storage privado, comparar com pesos, pedir e
votar aprovações, registrar decisão e contrato, criar tarefas; os marcos de
renovação vêm do cron real (`/api/jobs/renewals`). Não há INSERT que pule
regra de domínio.

A service role é usada só onde um operador agiria pelo painel do Supabase:
criar as contas das personas, liberar os domínios `*.example` na allowlist,
gravar o marcador do banco, apagar no reset e reposicionar datas.

**Linha do tempo:** tudo nasce "agora". Cada passo da história tem um horário
narrativo (dias atrás, em horário comercial de Brasília); ao final, os
carimbos de tempo criados pelo seed são remapeados por interpolação entre
esses marcos. A ordem real dos acontecimentos é preservada em todas as tabelas
(aprovações não ficam desatualizadas, versões continuam em sequência) e a
história ganha datas plausíveis — uma linha de crédito contratada há ~22
meses, uma adquirência concluída há um mês, uma negociação das últimas três
semanas.

## O que a montagem da demo corrigiu no produto real

Montar a demo em cima do produto real expôs lacunas que o sandbox escondia
(ele devolvia campos que a API real não devolvia):

- **Convites invisíveis:** a visão geral da RFQ dizia "Ninguém convidado
  ainda" com três provedores convidados, e o painel mostrava "2/2" respostas
  quando eram 2 de 3. A API (`overview`) passou a devolver convites, nome do
  responsável, aprovação pendente e decisão por RFQ, com número fixo de consultas.
- **"Decidir renovação: undefined":** contratos sem nome do provedor no painel
  e na API de contratos.
- **Aprovação sequencial muda:** quando o Controller aprovava, a CFO nunca era
  avisada de que era a vez dela. Migration
  `docs/supabase-financial-approval-handoff.sql` (com rollback e teste de banco).
- **Provedor caía no lugar errado:** quem entra por `/login.html` ia para o
  espaço da empresa e via "Crie a organização da sua empresa". Agora contas só
  de provedor vão ao portal do provedor (e vice-versa).
- **Portal do provedor sem nome de quem está logado** ("Sua conta").
- **Documentos na coluna lateral** com texto quebrado palavra a palavra e
  botões sobrepostos (container query).
- **Comparação de RFQ decidida** abria com pesos zerados; agora abre com os
  pesos registrados na decisão.

## Sandbox legado

`/demo` (motor fictício no navegador, `finance/demo/`, `ARANDU_DEPLOYMENT_KIND=demo`)
reimplementa as regras do servidor e por isso diverge do produto. Ele segue
publicado no projeto `arandu-demo` até a migração para `ARANDU_ENV=demo`
([FINANCIAL_DEPLOYMENT_WORKFLOW.md](../FINANCIAL_DEPLOYMENT_WORKFLOW.md#demo));
depois deve ser removido em uma PR própria (motor, camada Work OS, páginas
`/demo`, testes e `build:demo`).

## Limites conhecidos

- O provedor não vê o nome da empresa compradora nem se a proposta dele foi a
  escolhida: o RLS não lhe dá acesso à organização do comprador nem às
  decisões (decisão de segurança existente, mantida).
- Avisos (notificações) são genéricos por desenho: não carregam condição
  financeira nem nome de processo, só o tipo e o link.
- Localmente, o envio de documento **pelo navegador** é recusado porque o
  cliente só aceita URLs de upload `*.supabase.co`; os documentos da demo são
  enviados pelo seed e o download funciona. No Supabase hospedado não há essa
  diferença.
- O Supabase local usa certificado autoassinado (`https://localhost`).
- Não há métrica de economia: o produto deliberadamente não estima savings sem
  metodologia (próxima fase: Savings Ledger).
