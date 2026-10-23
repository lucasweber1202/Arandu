# Continuidade de procurement e registro do contrato — 23/10/2026

Base: `main@0ea9e6cf74d10e44ce5dc21f09e0c9d61a789716`, com #263 integrada.
Branch isolada `feature/procurement-lifecycle-continuity`; outras worktrees,
serviços e branches preservados. Rodada funcional autorizada para 23–27/10;
release de 28–29/10 protegido. Sem migration nova ou hospedada, alteração de
produção, deploy manual, dependência, workflow ou merge automático.

## Auditoria e incremento

| Trecho da jornada | Estado anterior / ruptura | Comportamento implementado | Evidência |
| --- | --- | --- | --- |
| Necessidade → RFQ | Intake, Passport e editor já existem; não recriados | Preservados | Regressão financeira e contratos existentes |
| RFQ → convites → propostas | Link de RFQ fora do resumo inicial era tratado como inexistente | Busca autorizada pelo ID quando ausente do resumo; convites com nomes resolvidos por IDs autorizados, sem depender do índice global | E2E `lifecycle: RFQ fora do resumo…`; quatro falhas reproduzidas na main nos dois portais |
| Aprovações / decisão | Tela filtrava listas globais limitadas de 100 registros | Leitura específica por RFQ; etapa exibida acompanha decisão/contrato já registrados após o resumo; falha bloqueia ações e tem recuperação; mensagens com ordem determinística | API e E2E de governança |
| Decisão → contrato | Contrato era procurado no resumo global; decisão não trazia a fotografia escolhida para o formulário | Consulta pelo vínculo da decisão; mostra e reutiliza a versão preservada no snapshot, nunca condições atuais como substituto de fotografia indisponível | API: organização, RFQ, seleção congelada e contrato; E2E fotografia ausente e versão preservada |
| Registro → estado posterior | Resposta de escrita incerta reabilitava novo envio; resposta sem ID podia ser tratada como sucesso | Conserva campos, bloqueia novo POST e permite conferir o contrato no servidor. Encontrado: link para o ciclo de vida. Ausente/erro: mantém os dados e a conferência, sem declarar sucesso | E2E resposta 503 após persistência, recibo sem ID e conferência indisponível |
| Portal → responder / revisar | Link fora das 200 oportunidades iniciais não abria; histórico global limitado podia omitir a versão atual | Leitura específica por proposta em todo link explícito, vinculada à instituição. Histórico limitado de forma explícita; versão enviada ausente bloqueia formulário parcial | API JWT, escopo, invisível, versão ausente; E2E retorno fora da lista, rascunho e acesso revogado |
| Contrato → Central → obrigações / tarefas | #263 já implementou trabalho contextual e navegação autorizada | Reutilizados sem cópia de domínio ou Graph | Regressão das suítes contratos, relacionamento e covenants; harness canônico ampliado |
| Propostas externas | Transcrição, revisão humana, comparação e proveniência já existem | Nenhuma decisão, aprovação ou contratação de proposta externa foi liberada | Regressão da suíte externa e das fronteiras da API |

O endpoint existente `decisions` aceita `rfq_id` opcional. Somente nesse recorte
retorna `selected_proposal` e `contract`, após conferir comprador, organização e
RFQ visível. Não retorna os snapshots de concorrentes nesse handoff; a consulta
global continua com seu contrato anterior. Duas decisões/contratos inconsistentes
bloqueiam o contexto. Todas as leituras usam JWT do usuário e RLS existente.
`assignments` aceita `proposal_id` opcional e mantém o vínculo à organização
provedora. Não há service role como fallback de leitura.

O teste concorrente representa outra pessoa registrando decisão v2 após o resumo v1; não permite revisar proposta depois da decisão. A fotografia v2 prevalece para o custo e a etapa da tela acompanha o fato registrado.

O formulário de contrato é carregado sob demanda em módulo próprio, preservando
a rota e o domínio existentes. A data sugerida continua sujeita a revisão humana;
registro não assina contrato. Conferência após resposta incerta não é retry de
escrita nem confirmação automática. Dados preenchidos são conservados nesta tela,
não se afirma novo armazenamento durável de rascunhos de contrato.

## Comparação renderizada

Origem: aplicação real em `127.0.0.1:4173`, sessão/API interceptadas com dados
fictícios pelos testes Playwright. **Não é prova de backend canônico.** Antes:
fontes originais de `origin/main@0ea9e6c`; depois: fontes desta entrega. Mesmos
cenários e projetos Chromium desktop / mobile Chrome; ver hashes no manifesto.

| Superfície | Antes | Depois |
| --- | --- | --- |
| Processo desktop | [antes](procurement-continuity-2026-10-23/procurement-before-chromium-desktop.png) | [depois](procurement-continuity-2026-10-23/procurement-after-chromium-desktop.png) |
| Processo mobile | [antes](procurement-continuity-2026-10-23/procurement-before-mobile-chrome.png) | [depois](procurement-continuity-2026-10-23/procurement-after-mobile-chrome.png) |
| Instituição desktop | [antes](procurement-continuity-2026-10-23/provider-context-before-chromium-desktop.png) | [depois](procurement-continuity-2026-10-23/provider-context-after-chromium-desktop.png) |
| Instituição mobile | [antes](procurement-continuity-2026-10-23/provider-context-before-mobile-chrome.png) | [depois](procurement-continuity-2026-10-23/provider-context-after-mobile-chrome.png) |

Revisão visual: tokens/componentes existentes, rótulos associados, conteúdo em
português, links contextuais e ausência de overflow nos cenários novos. Não se
altera arquitetura de navegação, cores, CSS compartilhado ou sandbox legado.

## Validação e limites

Resultados finais e hashes de fontes, capturas e logs em
[validation.json](procurement-continuity-2026-10-23/validation.json).
Os quatro gates obrigatórios precisam passar no HEAD exato; a PR registra os
resultados posteriores ao commit. Nenhum gate da base substitui esses resultados.

A tentativa de laboratório completo obteve Auth, PostgREST e Storage nas versões
fixadas. A extração PostgreSQL Supabase `15.14.1.064` consumiu o espaço do executor
(driver vfs), de 20 GB livres para menos de 2 GB antes da conclusão. Só o download
desta tarefa foi interrompido, sem reiniciar o daemon ou remover imagens alheias;
camadas temporárias foram liberadas. Stack canônica completa **NOT_RUN**.
Os dois novos passos do harness `scripts/pilot-local/journey.mjs` estão preparados,
mas não são contados como PASS. PostgreSQL 15.19 isolado, sem rede e portas, é
prova SQL distinta de Auth/PostgREST/Storage e não atesta a estação física.

Falhas locais preservadas: primeira conexão SQL antecipou prontidão do container;
a rodada seguinte detectou caminho relativo no wrapper Docker de clientes durante
o dump/restore. O wrapper local foi corrigido, sem reduzir testes. A primeira
regressão ampla detectou ordem variável no aviso de governança; a ordem foi
fixada. Somente rodadas finais concluídas contam como PASS.

## Continuidade até 29/10

- Executar o harness ampliado e a UI com sessão real na stack canônica disponível,
  ensaiar a estação definitiva e confirmar o SHA aprovado antes de 28/10.
- A listagem geral de RFQs/oportunidades e indicadores continua limitada ao
  recorte existente; esta entrega resolve links e handoffs, não promete paginação
  universal ou escala ilimitada. Históricos acima do limite exigem continuidade
  futura; não são usados como formulário parcial.
- A jornada de propostas externas mantém os limites atuais de decisão/contrato.
  Evolução dessa fronteira exige contrato de domínio e autorização próprios.
- Rollback: reverter app/API juntos; nenhum dado ou schema novo exige remoção.
  CI verde não equivale a M3, publicação, produção ou validação por cliente.

Validação local encerrada: check:all, build, links, orçamento e API PASS; SQL completo PostgreSQL 15.19 PASS. Financeiro amplo: 586 PASS / 10 SKIPPED; após a projeção final da etapa, dois portais: 175 PASS / 3 SKIPPED. Apresentação: 136 PASS / 20 SKIPPED. RFQ 245.034/250.000 bytes, warning mantido. CI cross-browser no HEAD da PR continua requisito separado.
