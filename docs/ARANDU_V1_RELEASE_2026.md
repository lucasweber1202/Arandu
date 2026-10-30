# Arandu V1 — release funcional para 31/12/2026

Objetivo comercial: primeiro produto comercial até **31/12/2026**. Constituição v3.7; buyer-first, uma plataforma, Essencial/Gestão/Enterprise como hipóteses de packaging. Não há claim de cliente, preço, PMF, operação hospedada ou prontidão de produção nesta entrega.

Baseline reconciliada em 30/10: `main@53e02da90b44b328aae156360b1b16429ab8634f`; PR #285 integrada, sem reimplementar seu `context`. Pacotes desta missão em branches `codex/financial-economics-2`, `codex/negotiation-continuity-2`, `codex/institutional-decline-2`, para revisão progressiva nessa ordem. Nenhum merge automático.

## Oito capacidades e estado real

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
