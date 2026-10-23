# Executar o trabalho no contexto do contrato — 23/10/2026

Base `main@7f2fb38f7a1cafd054efcc36ccee7236c73d6e1f`, com #262 integrada.
Branch nova `feature/buyer-lifecycle-actions`; nenhuma branch anterior foi
reutilizada. Esta é implementação da rodada intensiva de 23–27/10, conforme
nova decisão do proprietário; estabilização/operação ficam em 28–29/10.
Não há merge automático, deployment manual ou migration hospedada.

## Antes → agora → prova

| Fricção reproduzida na interface | Comportamento implementado | Prova |
| --- | --- | --- |
| O contrato tinha termos e marcos, mas o usuário saía para criar uma tarefa genérica, perdendo o vínculo | Painel de trabalho no contrato: próxima ação, prazo e responsável manual; criação já vinculada | Jornada de criar, concluir, consultar Concluídas e reabrir nos dois viewports |
| Voltar à instituição pelo link falhava se ela não estivesse no índice inicial | Consulta o relacionamento autorizado pelo endpoint existente, reaproveitando a resposta | Baseline falha nos dois viewports; objeto autorizado abre, objeto recusado não abre |
| A ligação do contrato à solicitação de origem dependia de outra navegação | Detalhe resolve a origem por proposta/RFQ sob o JWT e RLS; link só aparece com fonte autorizada | Teste de handler cobre fonte visível e oculta, com consultas limitadas à organização |
| Portal ignorava falha de leitura do histórico; revisão antiga ficava fora das últimas 20 | Busca exatamente as duas revisões, mostra erro/ausência e permite retry sem perder rascunho | Baseline falha nos dois viewports; teste compara revisão 1 com 25, mantém valor digitado e não chama ausência de snapshot de “nenhuma mudança” |

Os testes anteriores falharam contra o código original da main, antes das
correções correspondentes. Os logs são referenciados por hash no manifesto.

## Jornada beneficiada

Instituição existente → contrato existente → trabalho vinculado → prazo e
responsável → conclusão confirmada pelo servidor → registro em Concluídas →
reabertura quando necessária → retorno ao relacionamento. Um contrato vindo
de procurement também permite voltar à solicitação autorizada de origem.

O painel usa `fin_tasks`, sem outro store ou Financial Graph paralelo. O
registro de Concluídas/Canceladas mostra os estados atuais das mesmas tarefas;
não é uma nova trilha imutável de auditoria. Concluir tarefa não conclui marco,
aprova covenant ou renova contrato. Não há herança de owner como assignee.

A criação conserva uma chave de idempotência por intenção. Resposta incerta
mantém os campos bloqueados e oferece conferir a mesma tentativa. Alteração
de estado só é anunciada após releitura do ID e estado persistido; falha não
produz confirmação otimista. Cada leitura do contexto revalida o contrato.
Paginação de 25 linhas tem retry preservando linhas, filtro e cursor ligados
a organização/contrato/status; o refresh não exige um cursor diferente.

## Contratos de acesso

- `tasks?contract_id=…`: membership BUYER, contrato visível no mesmo tenant e
  RLS de tarefas; `task_id` e contexto não podem ser combinados. Lista global
  antiga permanece compatível.
- Cursor contextual é posição, não autorização. Contrato e RLS são reavaliados
  em toda página; cursor de outro filtro é recusado.
- `rfq-revisions` sem novos parâmetros mantém o limite histórico de 20. Com
  `from_revision`/`to_revision`, aceita dois inteiros válidos e busca no máximo
  duas versões sob a mesma RLS. Provedor não recebe termos concorrentes nem
  notas internas. Snapshots existentes só contêm título, descrição, demanda e prazo.
- Origem de procurement vem de FKs já existentes, com leituras de proposta e
  RFQ autorizadas; fonte oculta resulta em ausência de link, sem adivinhar IDs.

A tarefa contextual não foi adicionada ao sandbox histórico em navegador.
Ela usa o transporte real, incluindo Demo canônica `ARANDU_ENV=demo`.
Nenhum pacote, workflow, limite de bundle ou configuração Vercel foi alterado.

## Evidência e validação

Capturas da aplicação real renderizada, com **sessão e API interceptadas por
fixtures fictícias**; não comprovam Auth/RLS/Storage canônicos:

- Contrato: [antes desktop](lifecycle-actions-2026-10-23/lifecycle-before-chromium-desktop.png), [depois desktop](lifecycle-actions-2026-10-23/lifecycle-after-chromium-desktop.png), [antes mobile](lifecycle-actions-2026-10-23/lifecycle-before-mobile-chrome.png), [depois mobile](lifecycle-actions-2026-10-23/lifecycle-after-mobile-chrome.png).
- Instituição: [antes desktop](lifecycle-actions-2026-10-23/provider-revision-before-chromium-desktop.png), [depois desktop](lifecycle-actions-2026-10-23/provider-revision-after-chromium-desktop.png), [antes mobile](lifecycle-actions-2026-10-23/provider-revision-before-mobile-chrome.png), [depois mobile](lifecycle-actions-2026-10-23/provider-revision-after-mobile-chrome.png).

[Manifesto com resultados e hashes](lifecycle-actions-2026-10-23/validation.json).
Validação local: `npm ci`, `check:all`, build, budget e links PASS. Financeiro
desktop/mobile: **564 PASS e 10 SKIPPED**. Casos focados finais: **18 PASS**;
incluindo a leitura única do relacionamento fora do índice. Apresentação:
**136 PASS e 20 SKIPPED**. SKIPPED não é PASS.
RFQ mantém 245.884/250.000 bytes, sem elevar limites.
O HEAD é o commit que contém este relatório; a descrição da PR registra o SHA
completo e os quatro gates observados após o push.

PostgreSQL **15.19 real**, imagem oficial fixada pelo digest
`sha256:baa22e6286bf832cb147b8bb5aa9d8bc999846d69c21d11bf63f58fbeed1fa48`,
container próprio sem rede/portas e armazenamento tmpfs. Clientes nativos
psql/pg_dump/pg_restore, sem simulação de SQL. Suíte completa PASS em PG15:
instalação limpa, upgrade, reexecução, rollback, RLS, concorrência e dump/restore,
incluindo a view `security_invoker` da #262. Teste adicional de concluir/reabrir
e recusa na entidade restrita passou nas três bases.

A Demo fixa Supabase PostgreSQL **15.14.1.064**: a compatibilidade SQL foi
verificada na mesma major 15; não foi instalada nem atualizada essa stack.
Auth, PostgREST e Storage canônicos completos não estavam preparados neste
executor; não se declara jornada canônica nem estação física pronta.

Durante a primeira rodada SQL, o invólucro local descartava stdin de `psql -f -`;
o teste de lock detectou a ausência de espera. O transporte foi corrigido,
sem mudar o teste, e a suíte completa passou. A primeira tentativa de apresentação recusou a porta ocupada por um servidor
residual desta própria tarefa; só esse processo foi encerrado e a configuração
permaneceu intacta. Uma rodada financeira local foi
interrompida para consolidar a correção de retorno; só a rodada final concluída
conta como PASS. Não houve rerun ou push de CI para experimentar a Vercel.

## Limites e próximos passos até 29/10

- Não foi criada migration. Rollback da entrega é reverter o app; registros de
  tarefas continuam nas fontes existentes. A migration #262 segue requisito
  da main atual, sem reaplicação hospedada nesta rodada.
- Não há realtime: listas refletem a consulta ao servidor e têm atualização
  explícita. O estado de tarefa não substitui evidência de cumprimento da obrigação.
- Confirmar as jornadas na stack canônica de laboratório quando disponível e
  ensaiar a estação definitiva com o SHA aprovado antes de 28/10.
- Mudança futura da main exige reavaliar publicação e estação. Esta PR não é
  prova de publicação, M3 hospedado ou Production; quatro gates não autorizam merge.
