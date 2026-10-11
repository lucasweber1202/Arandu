# Matriz de paridade Demo × Oficial

> Gerado por `node scripts/check-demo-parity.mjs --write` a partir de `lib/finance/parity-manifest.mjs`. Não edite à mão: `npm run check:demo-parity` falha se este arquivo divergir.

A Demo canônica (`ARANDU_ENV=demo`) é o mesmo build da `main` ligado a um Supabase DEMO dedicado: as rotas abaixo são as mesmas nos dois ambientes. O estado **local** é calculado (rota canônica + recurso real da API + check de sanidade do seed). Ele **não** prova publicação: o eixo hospedado é separado.

**Estado hospedado da Demo canônica:** `BLOCKED` — Supabase DEMO sem atribuição ativa aprovada em `lib/deployment-topology.mjs`; depende de recuperação comprovada e cutover (docs/TWO_ENVIRONMENT_CONSOLIDATION.md).

**Denominador:** 31 capacidades. Verificadas localmente: 31. Parciais: 0. Limitadas pelo ambiente: 0. Não representadas: 0. Bloqueadas: 0.

| ID | Capacidade | Rotas (Oficial = Demo) | Recursos da API | Cobertura do dataset | Estado local | Lacuna / limitação |
| --- | --- | --- | --- | --- | --- | --- |
| PLT-ENV | Ambiente identificado (selo e marcador do banco) | — | `organizations` | “Aplicação em ARANDU_ENV=demo”; “Banco marcado como demonstração” | `PARITY_VERIFIED` | — |
| PLT-ORG | Organização, membros e papéis | `/finance/settings.html` | `organizations`, `members`, `approval-policy` | “Organização Vitta Foods visível para a tesouraria” | `PARITY_VERIFIED` | — |
| PLT-PERSONA | Entrada por persona (sessão real do Supabase DEMO) | — | `auth/demo-personas`, `auth/demo-login` | Sem dado próprio: autentica contas sintéticas criadas pelo seed; coberto por scripts/test-demo-personas.mjs | `PARITY_VERIFIED` | — |
| WRK-DASH | Início: pendências, prazos e atividade | `/finance/index.html`<br>`/finance/dashboard.html` | `overview`, `dashboard` | “Aprovação pendente na etapa da CFO”; “Contrato de crédito em janela de renovação” | `PARITY_VERIFIED` | — |
| WRK-TASKS | Tarefas | `/finance/tasks.html` | `tasks` | “Tarefas abertas” | `PARITY_VERIFIED` | — |
| WRK-APPROVALS | Aprovações sequenciais | `/finance/approvals.html` | `approvals`, `approvals/request` | “Aprovação pendente na etapa da CFO”; “Aprovações concluídas” | `PARITY_VERIFIED` | — |
| WRK-NOTIFY | Notificações | `/finance/notifications.html` | `notifications` | “CFO com aprovação pendente nos avisos”; “Tesouraria com avisos não lidos” | `PARITY_VERIFIED` | — |
| SRC-RFQS | Solicitações (lista e estados) | `/finance/rfqs.html` | `rfqs` | “RFQ ” | `PARITY_VERIFIED` | — |
| SRC-NEW | Nova solicitação por objetivo, com Passport | `/finance/new-rfq.html` | `rfqs`, `rfq-passport` | “RFQ de crédito com fotografia do Passport” | `PARITY_VERIFIED` | — |
| SRC-RFQ | Detalhe da solicitação: convites, propostas, comentários | `/finance/rfq.html` | `rfqs`, `invites/send`, `comments` | “RFQ ”; “Comentários na negociação de crédito” | `PARITY_VERIFIED` | — |
| SRC-COMPARE | Comparação financeira com pesos do comprador | `/finance/rfq.html` | `comparison` | “Comparação ponderada da adquirência”; “Comparação de crédito com CET ausente, premissas distintas e estimativa recusada” | `PARITY_VERIFIED` | — |
| SRC-DECISION | Decisão registrada com justificativa | `/finance/rfq.html` | `decisions` | “Decisões com justificativa” | `PARITY_VERIFIED` | — |
| SRC-PROPOSALS | Propostas recebidas e versões | `/finance/proposals.html` | `proposals` | “RFQ ”; “Portal do provedor (Lumina Pay) com histórico” | `PARITY_VERIFIED` | — |
| SRC-EXTRACT | Documentos e fatos extraídos com proveniência | `/finance/extractions.html` | `extractions/start`, `extractions/review` | “Documento lido com fatos e proveniência” | `PARITY_VERIFIED` | — |
| SRC-IMPL | Implantação pós-award | `/finance/implementations.html` | `implementations/open`, `implementations/milestone` | “Implantação pós-award em andamento com bloqueio” | `PARITY_VERIFIED` | — |
| PRT-CONTRACTS | Contratos e renovações | `/finance/contracts.html` | `contracts`, `contract-terms` | “Contrato de adquirência vigente”; “Contrato de crédito em janela de renovação”; “Marco de renovação D-90 registrado pelo cron” | `PARITY_VERIFIED` | — |
| PRT-DEBT | Dívida, limites, garantias e saldos | `/finance/portfolio.html` | `facilities`, `facility-balances`, `portfolio` | “Portfolio com limite, uso e saldo documentados” | `PARITY_VERIFIED` | — |
| PRT-COVENANTS | Covenants e obrigações | `/finance/covenants.html` | `covenants/open` | “Covenants: conforme, aguardando dados e waiver” | `PARITY_VERIFIED` | — |
| PRT-FEES | Tarifas bancárias contratadas × observadas | `/finance/fees.html` | `fees/schedules`, `fees/observe`, `fees/verify` | “Fee Intelligence com observação e referência contratada” | `PARITY_VERIFIED` | — |
| PRT-SPEND | Spend por moeda e tipo | `/finance/spend.html` | `spend` | “Spend por moeda/tipo, com e sem reconciliação”; “Spend preserva USD estimado sem conversão” | `PARITY_VERIFIED` | — |
| PRT-VALUE | Valor e savings com metodologia | `/finance/value.html` | `value` | “Valor de procurement com metodologia e registro sem cálculo” | `PARITY_VERIFIED` | — |
| PRT-OPPS | Oportunidades por regra da empresa | `/finance/opportunities.html` | `opportunities/rules`, `signals` | “Oportunidades detectadas pelas regras da empresa” | `PARITY_VERIFIED` | — |
| REL-INSTITUTIONS | Instituições e relacionamento contextual (#161, #164) | `/finance/providers.html` | `providers`, `provider-relationship` | “Relacionamento do Atlas com contrato, facility e saldo”; “Instituição sem contrato com histórico de convites” | `PARITY_VERIFIED` | — |
| REL-QUALIFY | Qualificação de provedores | `/finance/qualifications.html` | `qualifications/open`, `qualifications/requirement`, `qualifications/transition` | “Qualificação do Atlas aguardando decisão humana” | `PARITY_VERIFIED` | — |
| REL-PERF | Performance do provedor | `/finance/performance.html` | `performance/open`, `performance/dimension` | “Performance do provedor com período aberto” | `PARITY_VERIFIED` | — |
| GOV-PASSPORT | Financial Passport | `/finance/passport.html` | `profile`, `profile/confirm` | “Passport com cobertura e campo a revisar” | `PARITY_VERIFIED` | — |
| GOV-OPS | Console operacional | `/finance/ops.html` | `ops` | Mostra a saúde real de jobs e outbox do próprio ambiente; não há dado de negócio a semear | `PARITY_VERIFIED` | — |
| GOV-BOUNDS | Limites do produto | `/finance/boundaries.html` | — | Página estática e idêntica nos dois ambientes | `PARITY_VERIFIED` | — |
| PRV-HOME | Portal do provedor: início e oportunidades | `/provider/index.html`<br>`/provider/rfqs.html` | `assignments` | “Portal do provedor (Lumina Pay) com histórico”; “Provedor não vê concorrentes” | `PARITY_VERIFIED` | — |
| PRV-PROPOSAL | Rascunho, envio e versões da proposta | `/provider/proposal.html` | `proposal-draft` | “Portal do provedor (Lumina Pay) com histórico” | `PARITY_VERIFIED` | — |
| PRV-INVITE | Aceite de convite | `/provider/invite.html` | `invites/send`, `members/accept` | “Provedor não vê concorrentes” | `PARITY_VERIFIED` | — |

## Telas exclusivas do sandbox legado (`/demo`)

Não fazem parte da Demo canônica. Cada uma tem decisão registrada; saem junto com o sandbox, depois da Demo canônica hospedada e validada.

| View | Decisão |
| --- | --- |
| `workIntake` | Promovida ao produto: botão "Começar" do Início (lib/finance/intents.mjs, #160). A tela do sandbox é retirada com o sandbox. |
| `workPolicies` | Equivalente canônico: política de aprovação em Configurações (approval-policy). Retirar com o sandbox. |
| `workIntegrations` | Conectores simulados: não promover. O produto mostra integrações reais (finance-integrations) e estado honesto quando não há fornecedor. |
| `workUsage` | Telemetria local da sessão de demonstração: não é capacidade do produto. Retirar com o sandbox. |

## Itens abertos fora do gate local

- **OPS-CONCURRENCY** — Visitantes da Demo pública compartilham as mesmas personas e o mesmo dataset; falta isolamento por sessão/visitante (desenho em docs/demo/VISITOR_ISOLATION.md, não implementado).
- **OPS-PERSONA-RATE** — O login por persona herda o limite por conta (20/h): uma Demo pública com vários visitantes esgota a persona. Redesenhar junto do isolamento.
- **OPS-HOSTED** — Supabase DEMO sem atribuição ativa aprovada (lib/deployment-topology.mjs): a Demo canônica não pode ser publicada até o cutover com recuperação comprovada.
- **OPS-SANDBOX** — arandu-demo ainda publica o sandbox legado (ARANDU_DEPLOYMENT_KIND=demo); retirar só depois da Demo canônica hospedada e validada.

## O que o gate verifica

`npm run check:demo-parity` (parte de `check:all`) falha quando: uma tela ou item de menu não pertence a nenhuma capacidade; uma capacidade aponta para view, recurso de API ou check do seed inexistente; falta cobertura de dataset sem lacuna declarada; a casca canônica carrega o sandbox ou o sandbox ganha acoplamento; o frontend ou o servidor ramificam pelo ambiente demo fora do selo e do login por persona; uma persona usa papel fora do modelo canônico (ou um papel fica sem persona); `vercel.json` desvia rota financeira para `/demo`; segredo ou leitura de `process.env` aparece no código do navegador; ou esta matriz diverge do manifesto.
