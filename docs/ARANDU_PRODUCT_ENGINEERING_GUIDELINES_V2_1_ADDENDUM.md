# Arandu — Guideline v2.1 Enterprise Hardening Addendum

> **HISTÓRICO / SUPERSEDED (05/10/2026).** A Guideline v3.0
> (`docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md`, PR #127) consolidou a direção
> estratégica e é a única autoridade estratégica vigente. Este addendum **não prevalece**
> mais sobre a guideline mestra; a regra de precedência abaixo é registro histórico.
> O arquivo permanece porque migrations, documentos técnicos e a
> `IMPLEMENTATION_MATRIX` citam seus IDs (`Add. X.Y`) como rastreabilidade. Estado vivo e
> maturidade: `docs/IMPLEMENTATION_MATRIX.md`.

**Versão:** 2.1 — 3 de outubro de 2026  
**Status:** histórico — superseded pela Guideline v3.0 (05/10/2026)\
**Escopo:** enterprise operational readiness, data governance, execution scope, branch governance e clarificações da estratégia v2  
**Base estratégica:** Financial Procurement & Vendor Management OS definida na v2.0 da `pilot`  

> **Regra de precedência.** Este addendum complementa `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` e PREVALECE quando houver conflito entre os dois documentos. Enquanto a v2.1 não for consolidada integralmente no arquivo mestre, agentes e contribuidores DEVEM ler ambos. `docs/FINANCIAL_PRODUCT_BOUNDARIES.md` continua prevalecendo para limites funcionais/regulatórios concretos da fase atual.

> **Motivo desta forma de publicação.** A `pilot` já incorporou a tese v2.0, enquanto a `main` ainda contém a guideline v1.0. Este addendum é um backport estratégico docs-only para impedir que trabalho novo iniciado da branch canônica siga uma direção obsoleta. Depois do merge em `main`, `main` DEVE ser reconciliada em `pilot` antes da próxima rodada funcional relevante. A consolidação futura da v2.1 no arquivo mestre deve remover este addendum no mesmo PR para voltar a uma única fonte estratégica.

---

# A. Regra de target-state vs. escopo de execução

A guideline descreve o **estado-alvo** do Arandu e os invariantes que toda implementação futura deve respeitar. Ela NÃO autoriza, por si só, implementar todas as capacidades descritas.

## A.1 Regra obrigatória

Um requisito `DEVE` de target-state significa:

- quando aquela capacidade for implementada, ela deve obedecer à regra;
- a arquitetura atual não pode bloquear deliberadamente o futuro sem decisão documentada;
- o requisito não substitui roadmap, missão da rodada, dependências ou gates.

Portanto, um agente NÃO DEVE interpretar a leitura integral da guideline como autorização para:

- implementar módulos fora da prioridade atual;
- antecipar Product Packs;
- criar network/benchmark antes dos gates;
- reconstruir módulos existentes apenas para “cumprir tudo”;
- ampliar o escopo além do pedido e da fase corrente.

## A.2 Hierarquia operacional de execução

Para escolher o que implementar numa rodada:

1. limites de segurança/regulatório;
2. missão explícita da rodada;
3. blockers e dependências do roadmap;
4. estado real do código/ambientes;
5. esta guideline + addendum;
6. oportunidades de conveniência.

Em conflito entre “feature interessante” e dependência não resolvida, resolver a dependência primeiro.

---

# B. Clarificação: Financial Graph é modelo conceitual, não tecnologia obrigatória

`Financial Graph` significa a representação estruturada das relações entre:

- grupo econômico;
- entidades legais;
- provedores;
- produtos;
- facilities;
- dívidas;
- garantias;
- contratos;
- fees;
- obrigações;
- processos;
- documentos;
- owners;
- fontes/vintages.

O termo **NÃO implica**:

- graph database;
- Neo4j;
- GraphQL;
- knowledge graph externo;
- vector database;
- duplicação do modelo relacional existente.

A implementação deve preferir a arquitetura mais simples que preserve relações, autorização, point-in-time, proveniência, performance e evolução. Uma nova tecnologia de grafo só entra após prova de necessidade e comparação explícita com o modelo existente.

---

# C. Core proprietário atual/próximo vs. capacidades proprietárias futuras

A expressão “construir como core proprietário” deve ser lida em dois horizontes.

## C.1 Core proprietário atual e próximo

Prioridade arquitetural e de produto:

- Financial Passport / Graph;
- multi-entity foundation;
- financial intake;
- RFQ/RFP e strategic sourcing financeiro;
- propostas/versionamento/normalização/comparação;
- Provider/Bank Relationship Management;
- Debt / Facilities / Limits / Guarantees view;
- Contract & Renewal lifecycle;
- Covenant/Obligation monitoring;
- Policy & Approval Engine;
- Public API/Webhooks foundation;
- Bank Fee Intelligence;
- Financial Spend Analytics;
- Savings & Value Realization;
- Opportunity Engine;
- Proposal/Document Intelligence;
- Executive Portfolio;
- enterprise audit/search quando suas dependências estiverem prontas.

## C.2 Capacidades proprietárias futuras

São estratégicas, mas NÃO autorizam antecipação:

- Provider Discovery Network;
- external benchmark;
- network intelligence;
- data moat agregado;
- advanced cross-company insights.

Essas capacidades dependem de maturidade buyer-side, escala de dados, contratos adequados, anonimização, reidentification controls, revisão jurídica e governança de acesso.

---

# D. Enterprise Data Governance & Privacy Operations

Para clientes médios/grandes, segurança de acesso não basta. O Arandu DEVE possuir governança operacional do ciclo de vida dos dados.

## D.1 Data classification

Dados devem poder ser classificados conforme sensibilidade, por exemplo:

- público;
- interno;
- confidencial corporativo;
- financeiro sensível;
- dado pessoal;
- segredo/credencial — que não deve ser persistido em superfícies inadequadas.

A classificação deve orientar storage, logs, export, retenção, suporte, IA e compartilhamento com provedores.

## D.2 Data minimization e purpose limitation

O Arandu DEVE armazenar apenas dados necessários ao workflow, governança, analytics autorizados e obrigações contratuais.

Integração com ERP, TMS, Open Finance ou provedores NÃO autoriza copiar datasets inteiros “por conveniência”.

Cada integração relevante deveria declarar:

- finalidade;
- categorias de dados;
- source of truth;
- retenção;
- quem pode acessar;
- se os dados alimentam IA/analytics;
- como revogação ou desconexão é tratada.

## D.3 Data residency e localização

Antes de vender para clientes com requisitos de localização, o produto deve conseguir declarar factual e documentadamente:

- região de processamento;
- região de storage principal;
- região de backups quando conhecida/contratável;
- subprocessadores relevantes;
- transferências internacionais aplicáveis.

O Arandu NÃO DEVE prometer residência regional, soberania ou isolamento físico sem prova operacional/contratual.

## D.4 Retention, deletion e legal hold

O modelo enterprise deve prever:

- retention policies configuráveis quando comercialmente necessário;
- retenção mínima técnica claramente documentada;
- exclusão lógica/física conforme arquitetura e obrigação legal;
- export antes de offboarding quando autorizado;
- legal hold quando exigido por cliente/lei e juridicamente validado;
- exceções documentadas para audit trail imutável;
- política específica para cópias em backup após exclusão.

Excluir um registro na UI NÃO DEVE ser descrito como eliminação total de todas as cópias sem que isso seja verdadeiro.

## D.5 Tenant offboarding e portability

O produto enterprise DEVE possuir desenho para:

- export autorizado dos dados do cliente;
- encerramento de integrações/tokens/webhooks;
- revogação de usuários e service accounts;
- tratamento de documentos;
- janela de retenção pós-contrato;
- destruição programada conforme política;
- evidência/auditabilidade do processo.

## D.6 Privacy/legal readiness

Antes de claims comerciais formais, devem existir evidências e revisão adequadas para temas como:

- LGPD;
- DPA/contratos de tratamento;
- subprocessadores;
- direitos aplicáveis dos titulares;
- bases legais/consentimentos quando relevantes;
- política de incidentes de dados;
- compartilhamento com provedores e modelos de IA.

A guideline NÃO substitui assessoria jurídica.

---

# E. Enterprise Operational Resilience

Resiliência operacional passa a ser requisito permanente de enterprise readiness.

## E.1 Backup não é restore

A existência de backup NÃO comprova recuperação.

Ambientes com dados relevantes devem ter, conforme criticidade:

- escopo de backup documentado;
- frequência conhecida;
- retenção conhecida;
- criptografia e acesso controlado;
- restore procedure;
- restore target seguro/descartável;
- restore drill periódico;
- comparação pós-restore;
- evidência datada do último exercício.

Um gate só pode ser chamado de restore validado quando a recuperação foi realmente exercitada.

## E.2 RPO e RTO

Antes de oferecer SLA enterprise, o Arandu deve definir e provar objetivos compatíveis com a arquitetura:

- **RPO**: perda máxima de dados tolerada;
- **RTO**: tempo-alvo de recuperação.

RPO/RTO devem ser:

- específicos por ambiente/plano quando necessário;
- coerentes com backups e dependências;
- testados quando aplicável;
- documentados comercialmente sem exagero.

Não prometer RPO/RTO que a infraestrutura atual não consegue demonstrar.

## E.3 Disaster recovery e business continuity

O desenho deve considerar:

- indisponibilidade do app;
- indisponibilidade do banco;
- indisponibilidade de storage;
- falha de IdP;
- falha de e-mail/webhook;
- integração externa indisponível;
- degradação parcial;
- perda ou corrupção de dados;
- erro de migration/deploy.

O produto deve preferir degradação segura e fail-closed a comportamento silenciosamente incorreto.

## E.4 Incident response

Deve existir processo operacional para:

- classificação/severidade;
- owner do incidente;
- contenção;
- investigação;
- comunicação interna;
- comunicação a clientes quando aplicável;
- preservação de evidências;
- rollback/recovery;
- postmortem;
- ações preventivas.

Claims de tempo de resposta, suporte ou comunicação devem corresponder à capacidade real.

## E.5 Dependency resilience

Dependências externas críticas devem possuir:

- ownership;
- health/observability;
- timeout/retry apropriado;
- circuit/failure behavior quando necessário;
- idempotência;
- backlog/replay seguro para eventos;
- procedimento quando indisponíveis.

Nenhuma integração deve transformar uma falha externa em corrupção silenciosa do estado interno.

## E.6 Change and rollback readiness

Mudança relevante de produção deve considerar:

- preflight;
- backup/restore quando aplicável;
- migration compatibility;
- expand/migrate/contract;
- rollback de código;
- rollback de dados ou forward-fix quando rollback não for seguro;
- canary/smoke;
- observabilidade pós-release.

---

# F. Enterprise Identity & Integration priority — regra sem ambiguidade

Para eliminar conflito entre roadmap e lista de integrações:

## F.1 P0

- Public API/Webhooks **foundation**;
- enterprise IAM/SSO architecture e SSO foundation;
- branch/environment governance;
- auditability básica das integrações;
- transactional e-mail confiável quando necessário ao workflow.

## F.2 P1

- SCIM;
- JIT provisioning;
- delegated admin avançado;
- access reviews;
- enterprise search;
- integrações de produtividade e intelligence dependentes do core.

## F.3 P2

- ERP/TMS connectors mais profundos;
- Open Finance;
- provider APIs;
- BI/DWH;
- Teams/Slack além de notificações simples.

Quando uma oportunidade comercial real exigir uma capacidade anterior, ela pode subir de prioridade mediante decisão explícita sem relaxar segurança ou dependências.

---

# G. Branch, guideline e canonicality governance

## G.1 Regra de branch canônica

`main` continua sendo código canônico publicado. `pilot` continua sendo gate de staging/promoção.

## G.2 Guideline não pode divergir silenciosamente

Não pode existir trabalho relevante iniciado em `main` com guideline estratégica mais antiga que a guideline já aprovada em `pilot`.

Se isso ocorrer, antes da próxima feature deve acontecer uma das opções:

1. promoção normal `pilot -> main`; ou
2. backport docs-only explícito da guideline para `main`, seguido de reconciliação `main -> pilot`.

Este addendum usa deliberadamente a opção 2 porque `pilot` contém mudanças funcionais/migrations que não devem ser promovidas apenas para atualizar documentação estratégica.

## G.3 Branch protection/rulesets

`main` e `pilot` DEVERIAM possuir proteção/rulesets que, conforme capacidade do plano/repositório:

- impeçam push direto não autorizado;
- exijam PR;
- exijam checks obrigatórios;
- evitem force-push/delete acidental;
- preservem review quando aplicável.

Enquanto proteção administrativa não estiver efetivamente configurada, documentação NÃO DEVE dizer que ela está ativa. O estado real deve permanecer visível como blocker operacional.

## G.4 Exceção docs-only

PR direta de documentação estratégica para `main` é permitida apenas quando:

- resolve divergência de governança/canonicality;
- não carrega código funcional, schema ou migration;
- a exceção está explicada na PR;
- `main -> pilot` será reconciliado antes da próxima feature relevante.

---

# H. Ajustes no roadmap efetivo

Enquanto este addendum estiver vigente, interpretar prioridades assim:

## P0 — Fundação comercial e enterprise blockers

1. Demo/Pilot/Production separados, verificáveis e operáveis;
2. migrations/runbooks pendentes;
3. branch protection/rulesets e governance real;
4. multi-entity foundation;
5. Contract & Renewal Center v2;
6. Provider/Bank Relationship Management v1;
7. Debt / Facilities / Limits / Guarantees v1;
8. Policy & Approval Engine v2;
9. Public API/Webhooks foundation;
10. enterprise IAM/SSO foundation;
11. Financial Passport/Graph contínuo;
12. operational resilience baseline;
13. data-governance baseline.

## P1 — Recorrência, ROI e diferenciação

1. Savings Ledger;
2. Bank Fee Intelligence;
3. Opportunity Engine;
4. Proposal/Document Intelligence;
5. SCIM/JIT/access reviews/enterprise admin;
6. Executive Portfolio;
7. Financial Spend Analytics;
8. Covenant/Obligation Monitor;
9. Provider Performance;
10. Enterprise Search;
11. Enterprise Intake;
12. Scenario Builder/split award.

P2 e P3 permanecem como definidos na estratégia v2: Product Packs/integration depth antes de network effects e external benchmark.

---

# I. Definition of Done adicional para enterprise foundations

Quando aplicável, uma mudança enterprise NÃO está concluída sem avaliar:

- tenant/entity isolation;
- data classification/minimization;
- retention/deletion impact;
- integration source of truth;
- retry/idempotency/replay;
- failure/degraded mode;
- auditability;
- migration/rollback;
- backup/restore impact;
- operational runbook;
- metrics/alerts;
- access lifecycle;
- documentation de limites;
- claims comerciais compatíveis com evidência real.

Nem toda PR precisa executar restore drill, DR ou security review completa. O requisito é avaliar aplicabilidade e executar o gate quando a mudança tocar aquela superfície.

---

# J. Regra para consolidação futura

Quando `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` for atualizado integralmente para v2.1 ou superior:

1. incorporar todas as regras deste addendum;
2. preservar a tese v2 de Financial Procurement & Vendor Management OS;
3. remover referências a este addendum de `CLAUDE.md`, `CONTRIBUTING.md` e `docs/OPERATIONS_INDEX.md`;
4. excluir este arquivo no mesmo PR;
5. evitar duas fontes estratégicas permanentes.

Até esse momento, **guideline mestre + este addendum = guideline normativa efetiva do Arandu**.
