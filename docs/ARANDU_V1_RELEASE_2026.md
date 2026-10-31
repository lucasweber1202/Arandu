# Arandu V1 — release funcional para 31/12/2026

Objetivo comercial: primeiro produto comercial até **31/12/2026**. Constituição v3.7; buyer-first, uma plataforma, Essencial/Gestão/Enterprise como hipóteses de packaging. Não há claim de cliente, preço, PMF, operação hospedada ou prontidão de produção nesta entrega.

Baseline reconciliada em 30/10: `main@53e02da90b44b328aae156360b1b16429ab8634f`; PR #285 integrada, sem reimplementar seu `context`. Pacotes desta missão em branches `codex/financial-economics-2`, `codex/negotiation-continuity-2`, `codex/institutional-decline-2`, para revisão progressiva nessa ordem. Nenhum merge automático.

## Rebaseline de 30/10/2026 — Platform Intelligence 1.0

Main observada: `f25a207c103a35ea46e4da700c077aa47ef9656e`; #287/#288 e #290–#294 presentes na história ancestral da main. Nenhuma PR aberta na consulta inicial desta missão. #293 incorporou recusa institucional à main: não há nova missão de recuperação de #289.

| Frente | Escopo solicitado pelo proprietário | Evidência na baseline | Próximo aceite |
| --- | --- | --- | --- |
| CRM financeiro/bancário | contatos, atividades, responsáveis, pipeline, vínculos e histórico buyer/provider persistentes | provider contacts e Relationship 360 existentes; CRM completo não comprovado | operações e isolamento reais de banco, histórico e concorrência; contratos para UI |
| Copilot generativo | modelo configurável, ferramentas autorizadas, citações, ações preparadas e confirmação | consultas guiadas existentes são determinísticas; não são LLM | orquestração testada, execução legítima quando configurada, configuração ausente explícita; sem credenciais, chamada real bloqueada |
| Product Intelligence 2.0 | schemas especializados e modalidades com integração financeira real | #294: registry canônico de 30 modalidades/10 famílias; crédito/adquirência mais profundos | especializar família nova, unidade/fonte/versão e integração ao contrato ou negociação; não duplicar registry |
| ERP Hub | conexão, preview, sync, dedupe, reconciliação, histórico e adapter concreto | API pública, service accounts e webhooks não equivalem a conector nativo ativo | protocolo de API oficial, persistência e falhas; leitura externa somente com autorização/credencial |
| Economics 3.0 | propostas externas revisadas e cenários com autoria/premissas | Economics v2 + UI #290; limites do modelo de adquirência permanecem | comparação adicional com fontes, versão, moeda e incomparabilidade; sem savings automáticos |
| Ingestão estruturada | arquivo → prévia → confirmação → system of record financeiro | cadastro de contrato/proposta externa existentes; lote de tarifas não comprovado | parsing, erros por linha, confirmação, dedupe/replay, persistência e recuperação |

Estas frentes são **escopo aprovado para desenvolvimento pelo mandato**, não capacidades operacionais concluídas nesta PR documental. Código em branches de trabalho deve trazer seu próprio SHA, testes e dependências; CI da baseline não valida código novo. A revisão normativa do §45 permanece pendente do proprietário. Sem alteração hospedada autorizada por este plano.

Integrações já reconciliadas: #290 conectou economics e resultado à interface; #291 evoluiu a Central 360°; #292 acrescentou catálogo visual, consultas guiadas e seção ERP; #293 incorporou a recusa institucional; #294 criou o registry backend. Presença em main não prova teste hospedado, execução de modelo ou conexão ERP. A interface de catálogo ainda deve usar a API canônica conforme contrato da #294.

As seções seguintes registram a rodada anterior e suas evidências/pendências naquele momento. Não reinterpretar pendência histórica como blocker atual nem elevar evidência antiga à nova missão.

## Oito capacidades — registro histórico da rodada anterior


| Capacidade | V1 prevista e estado nesta missão | Dependência / aceite |
| --- | --- | --- |
| 1. Economics | Análise de adquirência por versão, mix, período e componentes implementada; testes determinísticos/API e perdas/zero/ausência aprovados localmente | Backend aditivo pronto para revisão; Studio do Claude pendente; mostrar limitações junto ao total |
| 2. Negociação | Origem contratual versionada e consulta do processo até decisão/contrato; jornada SQL real aprovada | Frontend consome contexto e snapshot; schema antes do app; nunca criar contrato automaticamente |
| 3. Radar to Action | Comando humano para concluir revisão com decisão já vinculada, evento imutável e consulta do resultado | Reutiliza RFQ confirmada existente; completar em acknowledged/under_review; repetição não duplica |
| 4. Instituições | Recusa direta de convite, identidade/destinatário, estado, histórico e replay; negativos SQL aprovados | Botão/confirmador no portal pelo Claude; sem acesso à RFQ recusada/concorrentes |
| 5. Relacionamento | Composição sobre objetos existentes; contexto de processos e retorno ao contrato/instituição | Relationship Workspace permanece do Claude; não há novo CRM ou cadastro paralelo |
| 6. Contract Intelligence | Versão de origem preservada; versões/aditivos/fontes e documentos referenciados na consulta; extração confirmada já existente reaproveitada | Melhorar navegação documental no frontend; sem interpretação jurídica automática |
| 7. Ingestão | Registro estruturado/idempotente de contrato e propostas externas já existentes auditados; novo lote CSV **adiado** | Próximo pacote com prévia, fonte, duplicidade, confirmação e replay; não anunciar conector bancário |
| 8. Copilot factual | Consultas determinísticas de contexto entregues como contratos de API; assistente conversacional **não implementado** | Adiar modelo externo/vetores; usar fontes, links e permissões existentes |

## Jornadas e critérios

1. Contrato/versão → perfil declarado → versão de proposta → comparação: mesmo mês-calendário, BRL, mix 100%, custos explícitos; incomparável explica motivo e mantém null. Diferença estimada não vira valor negociado/realizado. Antecipação/liquidação não são MDR.
2. Contrato existente → oportunidade de renovação → confirmação do rascunho → convite → proposta versionada → decisão humana → conclusão da revisão com vínculo → registro separado do contrato → consulta de resultado e monitoramento. Origem aponta à versão anterior mesmo após novos termos. Ausência de etapa é declarada, sem fabricação.
3. Convite institucional → confirmação de recusa → estado declined + ator/data/evento para comprador; retry reconcilia. Expirado/revogado/aceito e destinatário errado recusados sem vazamento. Recusa não cria proposta nem concede RFQ.

## Contratos para Claude

- [Economics](FINANCIAL_ACQUIRING_ECONOMICS_V2.md): POST `acquiring-economics`, entradas e fórmulas/exemplo completos.
- [Negociação/Radar](FINANCIAL_NEGOTIATION_CONTINUITY_V2.md): GET `contract-negotiations`, GET `opportunities/outcome`, POST `opportunities/complete-negotiation`.
- [Instituições](FINANCIAL_INSTITUTIONAL_DECLINE_V2.md): POST `invites/decline`, motivo opcional e rejeição neutra.

UI pendente de integração pelo Claude **após main aprovada**; nenhum arquivo `finance/src/**` alterado. APIs existentes permanecem compatíveis. Campos técnicos são contratos para o frontend, não textos para exibir ao usuário.

## Evidência e gates

Testes específicos locais: três suites de domínio/API (mocks HTTP explicitamente identificados); duas suites SQL com RPCs reais; quatro interleavings determinísticos em sessões independentes para conclusão/repetição/aceite versus recusa e expiração durante espera por lock. PostgreSQL oficial **15.15 descartável**, dados sintéticos. Não é prova de Supabase hospedado.

Comandos de validação do pacote: `npm run check:all`, `npm run build`, `npm run test:database`; checks obrigatórios remotos **database, deploy-boundaries, presentation, validate** no HEAD de cada PR. M2 somente após os quatro SUCCESS; até lá implementação e validação local, sem herdar CI da baseline. Banco: `npm run test:database` **PASS**, incluindo clean/upgrade/reapply/rollback, canário final 11.779 verificações/zero vazamentos e quatro interleavings. `npm run check:all` e `npm run build`: **PASS na execução serial final**. Uma execução concorrente de check:all falhou com ETIMEDOUT no autoteste de teardown; a suite staging passou separadamente, sem alterar timeout ou ocultar esse resultado. CI remoto ainda pendente.

Laboratório canônico Auth/PostgREST/Storage: **BLOCKED / jornada NOT_RUN**. Preparação pelo script do repositório interrompida durante a extração da imagem oficial PostgreSQL Supabase após esgotar o disco de 32 GiB do executor (vfs). ECR/Docker Hub tentados pelo fallback existente. Camadas sem referência descartadas; espaço recuperado. Não houve Auth/Storage/seed canônico nesta rodada. A suíte completa SQL PASS em PostgreSQL 15.15 descartável é prova distinta.

## Implantação, operação e recuperação

Duas migrations aditivas, manifestadas, clean/upgrade/reapply/rollback no runner; sem novas tabelas. Reutilizam classificação, export, hold e retenção dos eventos/objetos existentes. Rollback preserva história e restaura o marker anterior; pode retirar o comando sem apagar seus efeitos. Schema → app → integração UI. Sem alterações hospedadas, secrets, cutover, deploy ou produção.

M3/M5 continuam bloqueados pelos gates operacionais/recovery já documentados na Implementation Matrix. Esta missão não os reabre nem os promove. Estação do owner e pesquisa com pessoas reais continuam provas separadas. Para operação comercial: revisão jurídica/dados, recuperação do mesmo conjunto Auth/Storage/configuração, ambiente correto, observabilidade, suporte e release aprovado.

Hipóteses não validadas: ICP Gestão, prioridade comercial de adquirência, disposição de pagar, custo de alimentação, esforço líquido poupado, adesão/retorno institucional e três ofertas. Fixtures e PRs não validam essas hipóteses.

Próximo pacote de alto impacto: integrar as três jornadas ao Studio/Workspace e validar com compradores/instituições; depois ingestão estruturada de tarifas/observações com prévia e confirmação. Aprofundar antecipação apenas com volumes antecipados, prazo, regime e fonte suficientes.
