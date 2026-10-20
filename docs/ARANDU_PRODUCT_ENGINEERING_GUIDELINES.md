# Arandu — Diretrizes Mestras de Produto, Engenharia e Evolução

**Versão 3.7 — 20 de outubro de 2026**
**Baseline técnica de referência desta revisão:** `main` @ `dd8c6a7af7c3622441825aa1bda2e7013e25f51e` (antes da PR documental v3.7; commits posteriores exigem reconciliação)
**Status:** constituição normativa de produto e engenharia
**Escopo:** tese de produto, boundaries, arquitetura funcional, maturidade, UX, engenharia, dados, segurança, IA, integrações, operação enterprise e critérios de evolução

> **Propósito.** Esta guideline define o que o Arandu é, o que não é, como deve evoluir e quais garantias não podem ser sacrificadas. Ela governa pessoas e agentes de IA que alterem o produto.
>
> **Adição da v3.7.** §§39–44 tornam CORE a plataforma única com ofertas Essencial/Gestão/Enterprise, buyer-first, utilidade institucional independente, Central de Relacionamentos Financeiros, UX/qualidade detalhada, validação comercial, monetização neutra e governança de evidências. Não afirma entrega dos novos planos e não altera os P0 de 29/10. Planos de apoio: `docs/ARANDU_SEGMENTED_PRODUCT_OPERATING_MODEL_V37.md` e `docs/ARANDU_V37_EVIDENCE_AND_DECISION_GATES.md`.
>
> **Adição da v3.6.** Novo §38: benchmark competitivo, adoção bilateral, sequência P0→P1-A/P1-B→piloto→integrações, contrato de performance com metas não reivindicadas, critérios de pesquisa com clientes e gates por funcionalidade. **Mantém integralmente a urgência dos P0 de 29/10 e todas as exigências de maturidade, segurança e recovery.** Plano: `docs/FINANCIAL_COMPETITIVE_EXECUTION_PLAN_2026-10-20.md`.
>
> **Mudança de prioridades da v3.5.** Duas entregas P0 para 29/10: Demo pública compartilhável e fiel à main aprovada; estação local canônica comprovada. Hospedagem canônica M3 permanece objetivo separado e subordinado a recovery/cutover. Regras §37 e execução em docs/PUBLIC_DEMO_2026-10-29_PRIORITY.md.
>
> **Mudança de garantias da v3.4.** Novo capítulo 36: revogação de sessões delimitada por superfície, integridade de decisões versionadas sob concorrência, recovery completo (banco, Auth, Storage e configuração) e critérios executáveis para a passagem de M2 para M3/M4/M5. Preserva os limites da v3.3; estados e evidências continuam na Implementation Matrix.
>
> **Mudança de produto da v3.3.** Novo capítulo 35: posicionamento competitivo, personas, diferenciação, estratégia de design, Design Constitution normativa (`docs/ARANDU_DESIGN_CONSTITUTION.md`), anti-vibecode como critério objetivo, arquitetura de informação em cinco áreas, workspace orientado a tarefas, primeiro valor, experiência bilateral, claims comerciais, validação com usuários, métricas de experiência, QA visual, benchmark contínuo, supervisão humana da IA, prontidão comercial e integração marketing/produto/engenharia. Nenhuma garantia da v3.2 foi relaxada.
>
> **Mudança operacional preservada da v3.2.** Apenas Demo e Production são ambientes hospedados permanentes. Pilot é a etapa de validação de release, por CI, Demo canônica, previews temporários e ensaios descartáveis; não exige terceiro projeto, banco ou branch. A conversão dos dois slots existentes é condicionada a inventário, ausência de cliente/PII necessária, export e recovery verificados.
>
> **Mudança estratégica preservada da v3.1.** A tese é refinada para deixar explícito que RFQ/RFP e comparação são capabilities do core, não o moat isolado. O diferencial defensável do Arandu é o lifecycle de procurement financeiro de ponta a ponta, sustentado pelo Financial Graph, memória institucional, governança, workflow recorrente, dados com proveniência e integrações. Market data, pricing e execution venues especializados devem ser integrados quando fizer sentido, não reconstruídos como um terminal/OMS/EMS paralelo.
>
> **Mudança estrutural preservada da v3.0.** A guideline não funciona simultaneamente como constituição, inventário de implementação e backlog. A direção estratégica permanece aqui; o estado vivo de cada capacidade, blockers e evidências pertencem a `docs/IMPLEMENTATION_MATRIX.md` e aos documentos operacionais especializados.
>
> **Regra de interpretação.** "Existe em código", "passa no CI", "está validado em ambiente hospedado", "está pronto para produção" e "foi validado por cliente" são estados diferentes e NÃO DEVEM ser tratados como sinônimos.

---

# 1. Hierarquia normativa e documental

## 1.1 Níveis normativos

- **DEVE**: requisito obrigatório. Mudança incompatível não deve ser mergeada.
- **NÃO DEVE**: proibição explícita. Exceção exige decisão humana, justificativa e atualização normativa.
- **DEVERIA**: padrão recomendado. Desvio exige motivo técnico ou de produto documentado.
- **PODE**: possibilidade legítima, sem prioridade automática.

## 1.2 Ordem de prevalência

Quando regras entrarem em tensão, prevalece a ordem:

1. segurança, isolamento, privacidade, integridade de dados e limites regulatórios;
2. decisão humana, proveniência, explicabilidade e rastreabilidade;
3. coerência B2B/enterprise;
4. recuperabilidade e operação segura;
5. workflow ponta a ponta;
6. utilidade recorrente e redução de trabalho manual;
7. qualidade dos dados estruturados e memória institucional;
8. interoperabilidade com o stack corporativo;
9. inteligência, automação e IA;
10. expansão de categorias e network effects.

## 1.3 Separação obrigatória de documentos

Esta guideline é a **constituição estável** do produto.

`docs/IMPLEMENTATION_MATRIX.md` é o **estado vivo** e DEVE registrar, por capability:

- escopo;
- maturity state;
- evidência;
- blockers;
- dependências;
- última validação;
- ambiente em que foi validada;
- próximo gate.

Documentos especializados continuam autoridade técnica para implementação concreta, especialmente:

- `FINANCIAL_PRODUCT_BOUNDARIES.md`;
- data model e migrations;
- autorização e segurança;
- deployment e ambientes;
- operações e recovery;
- UI/UX;
- runbooks;
- releases.

A guideline NÃO DEVE ser atualizada apenas para marcar uma feature como concluída. Status de execução pertence à matriz.

---

# 2. Tese central do produto

## 2.1 Posicionamento

O norte do produto é:

**Arandu Financial Procurement Lifecycle OS**  
*Financial Sourcing, Relationship, Contract, Governance and Lifecycle Infrastructure for Companies*

O Arandu é a camada especializada em que uma empresa administra continuamente:

- necessidades financeiras;
- processos de sourcing;
- provedores financeiros;
- propostas e versões;
- políticas e aprovações;
- decisões;
- contratos;
- implantação pós-award;
- produtos, facilities e limites;
- tarifas e custos financeiros;
- obrigações e covenants;
- renovações e repricing;
- savings e value realization;
- oportunidades;
- memória institucional do relacionamento com cada instituição.

## 2.2 Problema

O trabalho financeiro corporativo é fragmentado entre e-mail, planilhas, PDFs, portais de bancos, ERP, TMS, documentos, chats e conhecimento informal.

O Arandu DEVE transformar esse trabalho em:

- objetos;
- estados;
- relações;
- workflows;
- evidências;
- histórico estruturado;
- ações auditáveis.

## 2.3 Espaço estratégico

O Arandu ocupa a interseção entre:

1. procurement suites;
2. treasury/finance systems;
3. bancos e provedores financeiros;
4. market data, pricing e execution venues especializados.

Ele NÃO DEVE reconstruir integralmente nenhum desses mundos. Deve ser a camada especializada de **procurement, relacionamento, decisão e lifecycle de fornecedores e produtos financeiros**, conectada aos systems of record e execution venues adequados.

RFQ, RFP, comparação de propostas e negociação são capacidades essenciais, mas **NÃO constituem sozinhas a tese nem o moat**. Em categorias nas quais plataformas especializadas já oferecem descoberta de preço ou execução eletrônica — por exemplo FX, renda fixa e derivativos — o Arandu DEVERIA integrar, referenciar ou orquestrar essas plataformas, preservando contexto, política, aprovação, decisão, contrato, exposição, evidência e lifecycle no Arandu.

O Arandu NÃO DEVE competir por replicação de terminal de mercado, feed proprietário, OMS/EMS, matching engine ou venue de execução sem revisão estratégica formal.

## 2.4 Três funções inseparáveis

O Arandu deve operar simultaneamente como:

- **system of record**: fatos, versões, documentos, contratos, decisões, políticas e histórico;
- **system of action**: intake, sourcing, tarefas, follow-ups, approvals, implementation, renewal e workflows;
- **system of intelligence**: cálculos reproduzíveis, diferenças, custos, oportunidades e IA factual autorizada.

Nenhuma das três dimensões deve ser construída isoladamente.

## 2.5 Moat e defensabilidade

A defensabilidade do Arandu DEVE ser construída como um **Financial Procurement Graph operacional**, não como uma coleção de telas de RFQ.

Esse moat combina progressivamente:

- histórico estruturado de necessidades, propostas, versões, decisões e contratos;
- relacionamento entre grupos, entidades legais, provedores, produtos, facilities, fees, obrigações e owners;
- memória institucional de negociação, implantação, performance, exceções, renovações e resultados;
- políticas, aprovações, segregação de funções e trilha de auditoria;
- dados com source, vintage, confirmação e metodologia;
- workflow recorrente antes e depois do award;
- integrações com ERP/TMS/Open Finance, provedores, market data e execution venues;
- benchmarks internos e, somente após gates, inteligência de rede agregada.

A vantagem acumulada deve aumentar com o uso legítimo do produto: mais contexto confiável, menos retrabalho, melhores processos e mais memória institucional. **Volume de RFQs, por si só, não é moat.**

## 2.6 Relação com plataformas de mercado e execução

Plataformas especializadas de informação e execução — incluindo, como exemplos, Bloomberg, 360T e venues bancários — podem resolver partes do fluxo financeiro, especialmente market data, pricing e execução de instrumentos padronizados.

O Arandu DEVE tratar essas plataformas como possíveis **fontes, adapters ou execution endpoints** quando isso for melhor para o cliente.

O papel do Arandu é manter e orquestrar o ciclo empresarial ao redor dessas etapas:

**need → sourcing → competition → analysis → governance → decision → contract → implementation → obligations/performance → renewal → institutional memory**.

Uma execução feita fora do Arandu pode ser referenciada como fato/proveniência do processo. Isso NÃO autoriza o Arandu a executar transações automaticamente nem a duplicar infraestrutura de mercado como core.

---

# 3. Boundaries permanentes

## 3.1 B2B e enterprise first

O Arandu DEVE permanecer focado em empresas médias, grandes grupos e operações enterprise.

Pessoa física NÃO DEVE ser prioridade sem decisão estratégica formal e revisão desta guideline.

## 3.2 Atividades que o Arandu NÃO DEVE exercer sem revisão jurídica e estratégica

- conceder ou aprovar crédito;
- emprestar recursos próprios;
- realizar underwriting;
- receber, custodiar ou movimentar recursos;
- executar pagamentos ou transferências;
- assinar contratos financeiros automaticamente;
- executar investimentos;
- realizar gestão discricionária;
- executar hedge ou derivativos;
- prometer aprovação de crédito;
- escolher autonomamente instituição financeira;
- gerar aconselhamento jurídico definitivo;
- representar certificação, compliance ou adequação regulatória sem evidência válida.

## 3.3 Decisão pertence ao cliente

O Arandu pode:

- estruturar;
- extrair;
- comparar;
- calcular;
- resumir;
- alertar;
- simular;
- explicar;
- preparar;
- sugerir ações possíveis.

O Arandu NÃO DEVE decidir materialmente em nome da empresa.

Pesos, critérios eliminatórios, políticas, alçadas, estratégia de alocação e decisão final pertencem ao cliente.

---

# 4. Princípios de produto não negociáveis

## 4.1 Fato antes de opinião

O produto DEVE preferir fatos verificáveis e cálculos reproduzíveis.

Sem metodologia, fonte e decisão humana adequada, NÃO usar claims como:

- "melhor banco";
- "melhor proposta";
- "recomendado";
- "vale a pena";
- "risco baixo/alto";
- "economia" sem baseline e fórmula.

## 4.2 Proveniência por padrão

Todo dado crítico ou número calculado deve permitir responder, conforme aplicável:

- origem;
- documento/integração fonte;
- owner;
- data/vintage;
- nível de confirmação;
- insumos;
- fórmula;
- premissas;
- versão da metodologia;
- se é informado, importado, extraído, confirmado, derivado ou estimado.

## 4.3 Completo antes de amplo

É preferível ter poucos Product Packs profundos sobre um core robusto do que dezenas de categorias rasas.

## 4.4 Workflow antes de dashboard

Dashboards devem emergir de trabalho e dados reais. Uma visualização sem source of truth, ação ou consequência operacional possui prioridade baixa.

## 4.5 Recorrência é requisito

O produto deve gerar utilidade contínua por meio de contratos, tarifas, obrigações, limites, políticas, tarefas, oportunidades, performance, implantação e renovações.

## 4.6 Segurança é feature

RLS, RBAC, MFA, segregação de funções, storage privado, fail-closed, auditabilidade e separação de ambientes são parte do produto.

## 4.7 Integração é feature enterprise

APIs, webhooks, identidade e conectores não são conveniências tardias. São infraestrutura de adoção para grandes empresas.

## 4.8 Recuperabilidade é feature

Backup, restore, rollback/forward-fix, runbooks, observabilidade, incident response e disaster recovery fazem parte da prontidão do produto.

## 4.9 Progressão de maturidade antes de expansão

Uma capability não deve ser expandida porque "já existe no código". Expansão relevante deve considerar seu maturity state e o risco operacional residual.

---

# 5. Modelo formal de maturidade

Toda capability material DEVE possuir um estado explícito na `IMPLEMENTATION_MATRIX`.

## 5.1 Estados canônicos

### M0 — DESIGNED

- problema, persona, boundaries e source of truth definidos;
- modelo/fluxo alvo documentado;
- sem claim de implementação.

### M1 — CODE_COMPLETE

- implementação existe;
- testes locais relevantes existem;
- documentação técnica acompanha a mudança;
- NÃO implica CI verde, deploy ou ambiente real.

### M2 — CI_VALIDATED

- gates obrigatórios passam no HEAD exato;
- testes de domínio, banco, segurança, navegador e build aplicáveis estão verdes;
- NÃO implica ambiente hospedado saudável.

### M3 — HOSTED_VALIDATED

- capability está aplicada no ambiente hospedado alvo;
- schema/configuração/deploy observados correspondem ao release;
- doctor/canary/probes relevantes passam;
- evidência é vinculada a ambiente e release.

### M4 — RELEASE_VALIDATED (PILOT_VALIDATED histórico)

- jornada real ou representativa ponta a ponta foi executada na etapa de validação de release, na Demo canônica ou preview temporário;
- runbook, observabilidade, recuperação e suporte foram exercitados;
- blockers críticos para uso limitado estão fechados ou explicitamente aceitos por responsável.

### M5 — PRODUCTION_READY

- produção possui configuração própria e verificável;
- recovery aplicável foi provado;
- security/operational gates estão satisfeitos;
- suporte, rollback/forward-fix, owner e resposta a incidente estão definidos;
- não há claim baseado apenas em mock, CI ou Pilot.

### M6 — CUSTOMER_VALIDATED

- capability foi usada por usuário/cliente real ou design partner no problema alvo;
- existe evidência de adoção, utilidade ou aprendizado;
- gaps de workflow são registrados;
- não significa que a capability deixa de evoluir.

## 5.2 Regras

- "Implementado" sem qualificador de maturidade DEVERIA ser evitado em documentação de release.
- Um incidente ou regressão pode **rebaixar** maturity state.
- Um estado superior exige evidência dos anteriores ou justificativa explícita de não aplicabilidade.
- Validação local nunca substitui validação hospedada.
- CI nunca substitui restore, migration ou journey do ambiente real.
- Mock nunca deve ser citado como prova de integração externa.
- O maturity state DEVE ser separado por ambiente quando necessário.
- Blocker externo não autoriza elevar artificialmente o status.

---

# 6. Arquitetura funcional de longo prazo

## 6.1 Enterprise Core

- organizações, grupos e entidades legais;
- usuários, papéis, grupos e delegated admin;
- RLS/RBAC/MFA;
- SSO/SCIM/JIT quando apropriado;
- comentários, menções e tarefas;
- notificações;
- documentos;
- eventos e auditoria;
- policies e approvals;
- search/saved views;
- templates;
- API/webhooks;
- preferências e acessibilidade.

## 6.2 Procurement Core

- intake;
- RFI/RFP/RFQ;
- convites;
- questionnaires;
- lotes;
- propostas e versões;
- normalização;
- comparação;
- clarification rounds;
- negotiation rounds;
- BAFO;
- cenários;
- split award;
- decisão;
- contrato;
- renewal/repricing.

## 6.3 Financial Graph

- Passport;
- entidades;
- provedores;
- facilities/limites;
- dívidas;
- garantias;
- produtos financeiros;
- contratos;
- fees e custos;
- exposições declaradas;
- documentação reutilizável;
- sources, owners e vintages.

## 6.4 Relationship & Lifecycle

- provider/bank relationship management;
- provider qualification;
- contract lifecycle;
- post-award implementation;
- obligations/covenants;
- performance;
- concentration;
- financial spend;
- bank fees;
- savings;
- opportunities;
- executive portfolio.

## 6.5 Intelligence

- document/proposal ingestion;
- Proposal Intelligence;
- semantic diff;
- deterministic analytics;
- Opportunity Engine;
- AI Analyst factual;
- internal benchmarks;
- external benchmarks somente após gates.

## 6.6 Integration Platform

- connector registry;
- credentials lifecycle;
- mapping/versioning;
- sync jobs;
- cursor/checkpoints;
- reconciliation;
- dead-letter/replay;
- connector health;
- field-level provenance;
- observabilidade.

## 6.7 Product Packs

Cada categoria financeira deve ser schema + regras sobre o mesmo core, não um produto paralelo.

## 6.8 Ecosystem & Network

- ERP/TMS/Open Finance;
- provider APIs;
- identity providers;
- BI/DWH;
- assinatura externa;
- provider discovery;
- network intelligence com privacy by design.

---

# 7. Objetos canônicos

O Arandu deve ser orientado por objetos, estados, relações e ações, não por páginas.

Objetos canônicos incluem progressivamente:

- grupo econômico;
- organização;
- entidade legal;
- unidade;
- membro;
- grupo de acesso;
- provedor/contraparte;
- relacionamento financeiro;
- qualification record;
- due-diligence requirement;
- Financial Passport/Graph;
- produto financeiro;
- facility/limite;
- dívida/obrigação financeira;
- garantia;
- exposição declarada;
- necessidade;
- intake;
- RFI/RFP/RFQ;
- lote;
- convite;
- questionário;
- proposta;
- versão da proposta;
- critério;
- comparação;
- cenário;
- allocation/split award;
- política;
- aprovação;
- decisão;
- contrato;
- aditivo;
- obligation/covenant;
- marco contratual;
- implementation plan;
- implementation milestone;
- go-live acceptance;
- fee schedule;
- fee observado;
- renovação/repricing;
- opportunity;
- savings/value record;
- performance record;
- tarefa;
- comentário;
- documento;
- extraction fact;
- evento;
- notificação;
- integration connection;
- sync run;
- consentimento;
- audit event.

Todo objeto importante DEVE ter, conforme aplicável:

- ID estável;
- tenant e entity ownership;
- origem/autor;
- timestamps confiáveis;
- estado explícito;
- histórico/versionamento;
- autorização server-side;
- representação auditável;
- próxima ação quando houver trabalho pendente.

---

# 8. Financial Graph e multi-entity

## 8.1 Financial Graph

O Graph deve representar contexto financeiro suficiente para detectar e executar trabalho, não funcionar como data lake indiscriminado.

Por entidade legal, deve suportar progressivamente:

- dados cadastrais;
- indicadores declarados/importados;
- bancos/provedores;
- facilities/limites;
- utilização;
- dívida/vencimentos;
- garantias;
- produtos contratados;
- contratos;
- fee schedules;
- exposições;
- documentos;
- responsáveis;
- policies;
- sources e vintages.

Regras:

- dado crítico nunca é inferido silenciosamente;
- manual, integração, documento, provider, IA confirmada e cálculo devem ser distinguíveis;
- snapshots históricos são imutáveis;
- provedores só acessam o explicitamente compartilhado;
- Graph não substitui source of truth externo quando ele existe.

## 8.2 Multi-entity

Multi-entity é requisito enterprise estrutural.

Deve suportar:

- grupo controlador;
- entidades legais;
- unidades;
- relações entre entidades;
- acesso por entidade;
- group treasury;
- policies globais e locais;
- contratos/facilities por entidade;
- consolidação executiva;
- approvals cruzados;
- ownership local/global;
- moedas base/locais;
- auditoria do escopo.

Consulta consolidada NÃO DEVE conceder detalhe de entidade que o usuário não possa ler individualmente.

---

# 9. Strategic Financial Sourcing

Strategic Financial Sourcing é uma etapa do lifecycle, não o produto inteiro. O Arandu NÃO DEVE ser reduzido a um "comparador de bancos" ou "RFQ multi-bank".

O procurement core deve suportar:

- RFI;
- RFP;
- RFQ;
- sealed bid quando aplicável;
- clarification rounds;
- negotiation rounds;
- BAFO;
- renewal/repricing process.

Capacidades:

- templates;
- questionnaires;
- documentos obrigatórios;
- deadlines;
- lotes;
- eligibility;
- critérios eliminatórios definidos pelo cliente;
- múltiplas rodadas;
- versionamento de demanda;
- Q&A;
- propostas versionadas;
- cenários;
- split award;
- decisão com snapshot;
- trilha completa.

Fornecedor nunca deve ver concorrente, preço concorrente, documento concorrente ou ranking privado do comprador.

---

# 10. Provider & Bank Relationship Management

O Arandu deve construir memória institucional por provedor e entidade.

Pode conter:

- categorias atendidas;
- contatos;
- status cadastral;
- qualification;
- processos convidados;
- response rate e response time factuais;
- propostas;
- contratos;
- facilities;
- fees;
- implementation records;
- renewals;
- documentos;
- issues;
- performance;
- histórico.

Qualquer score deve ser definido pela empresa ou derivado de critérios transparentes. O Arandu NÃO DEVE criar reputação subjetiva universal de instituição.

---

# 11. Provider Qualification & Due Diligence

Provider Qualification é capability própria e NÃO DEVE ser confundida com um motor de KYC/KYB proprietário.

## 11.1 Objetivo

Responder, de forma factual:

- o provedor está cadastrado?
- quais requisitos a empresa exige?
- quais documentos/evidências existem?
- quais venceram?
- quais revisões estão pendentes?
- quem aprovou a habilitação?
- para quais entidades/categorias ela vale?

## 11.2 Capacidades

- qualification status versionado;
- requirements por entidade/categoria;
- questionnaires;
- documentos obrigatórios;
- validade e review dates;
- owner/reviewer;
- evidências;
- exceções;
- renewal de qualification;
- eventos de mudança;
- integração com provedores externos de KYC/KYB/compliance/risco quando necessário.

## 11.3 Boundary

O Arandu:

- pode registrar facts e decisões humanas;
- pode importar resultados autorizados;
- pode bloquear workflow por policy configurada;
- NÃO DEVE inventar sanções, reputação ou risco;
- NÃO DEVE substituir provider especializado de screening quando a empresa exigir esse serviço.

---

# 12. Contract, Renewal e Post-Award Lifecycle

## 12.1 Contract Center

Contrato financeiro deve ser objeto operacional, não PDF arquivado.

Pode conter:

- partes;
- entidade;
- produto;
- valores/limites;
- pricing;
- indexador;
- fees;
- garantias;
- covenants;
- SLAs;
- obligations;
- notice periods;
- renewal terms;
- auto-renewal;
- repricing windows;
- termination rights;
- documentos;
- aditivos;
- parent/child;
- sourcing process de origem;
- owner.

Mudança material NÃO DEVE apagar histórico.

## 12.2 Renewal

Deve suportar:

- D-120/90/60/30 configurável;
- marcos;
- repricing;
- renegociação;
- encerramento;
- nova RFQ/RFP a partir do contrato.

## 12.3 Post-Award Implementation & Transition

Award não significa valor realizado nem serviço implantado.

O produto DEVE poder modelar:

- implementation plan;
- kickoff;
- responsáveis comprador/provedor;
- condições precedentes;
- documentos pendentes;
- configuração/homologação;
- milestones;
- target dates;
- blockers;
- implementation SLA;
- evidência de conclusão;
- aceite de go-live;
- handoff para operação;
- relação entre atraso de implantação e value realization.

A decisão continua humana. O Arandu não deve declarar serviço ativo sem evidência ou confirmação autorizada.

---

# 13. Debt, Facilities, Limits, Guarantees e Obligations

O Arandu pode registrar/importar:

- principal;
- saldo declarado/importado;
- moeda;
- indexador;
- spread;
- prazo;
- maturity;
- amortização resumida;
- instituição;
- entidade;
- garantias;
- covenants;
- contrato;
- owner;
- status;
- source/vintage.

Visões podem incluir:

- maturity wall;
- indexer mix;
- currency mix;
- provider concentration;
- approved/utilized/available facilities;
- vencimentos;
- refinancing windows;
- garantias comprometidas.

O Arandu NÃO DEVE virar ledger contábil ou TMS.

Obligations/covenants devem ter source, fórmula/condição, periodicidade, owner, evidência e revisão humana. O sistema NÃO DEVE declarar breach sem dados e regra confiáveis.

---

# 14. Financial Spend, Fees, Savings e Opportunity Engine

## 14.1 Financial Spend

Pode cobrir juros, spreads, bank fees, cash management, MDR, antecipação, garantias, seguros e outros custos de fornecedor quando metodologicamente definidos.

Serve sourcing e relacionamento; NÃO é contabilidade paralela.

## 14.2 Bank Fee Intelligence

Deve preservar:

- serviço;
- unidade;
- fee contratado;
- fee observado;
- volume/base;
- período;
- entidade;
- banco;
- contrato/fee schedule;
- source;
- comparabilidade;
- diferença;
- review state.

Divergência NÃO é automaticamente erro do banco nem savings.

## 14.3 Savings & Value Realization

Tipos devem permanecer distintos:

- negotiated savings;
- realized savings;
- cost avoidance;
- outros apenas com definição explícita.

Cada registro deve conter baseline, fonte, fórmula, período, moeda/unidade, owner, entidade, evidência e versão metodológica.

## 14.4 Opportunity Engine

Opportunity deve ser:

**fato + regra explícita + fonte + data + ação possível + revisor**.

Opportunity NÃO é recomendação.

Abertura de processo ou ação material exige decisão humana ou automação explicitamente autorizada, reversível e auditável.

---

# 15. Proposal & Document Intelligence

Proposal & Document Intelligence é extração e organização de fatos, nunca autoridade decisória.

## 15.1 Capacidades permitidas

- ingestão de documentos autorizados;
- extração de campos;
- localização de fonte;
- table extraction quando aplicável;
- detecção de campos ausentes;
- divergência formulário-documento;
- semantic diff;
- inconsistências numéricas;
- perguntas de follow-up;
- cláusulas para revisão humana;
- resumo factual.

## 15.2 Proveniência obrigatória por campo

Campo extraído deveria registrar:

- documento e versão;
- página/localização;
- referência ao trecho;
- método/modelo/versão quando aplicável;
- confidence;
- status de confirmação;
- confirmador;
- timestamp;
- reprocessamento/versionamento.

Campo crítico NÃO DEVE ser promovido silenciosamente para dado confirmado.

## 15.3 Segurança contra documentos adversariais

Documentos são entrada não confiável.

O pipeline DEVE considerar:

- prompt injection e instruções embutidas;
- conteúdo malicioso;
- MIME/type validation;
- arquivos corrompidos;
- tamanho e quotas;
- isolamento de parser;
- links externos;
- exfiltração;
- conteúdo oculto;
- limites de recursos.

Texto do documento NÃO DEVE alterar policy, tools, autorização ou instruções de sistema do agente.

## 15.4 Data handling de IA

Antes de enviar documento ou dado sensível a provedor externo de IA, deve existir decisão explícita sobre:

- base contratual;
- data retention;
- uso ou não para treinamento;
- data residency quando aplicável;
- subprocessors;
- encryption;
- minimização;
- logging;
- deleção;
- incident handling.

Por padrão, a implementação DEVE preferir configuração que não permita treinamento do modelo com dados do cliente.

## 15.5 Evals e qualidade

Extração relevante deve possuir:

- dataset de avaliação sem PII real desnecessária;
- métricas por tipo de campo;
- casos negativos;
- versionamento de modelo/prompt/parser;
- regression tests;
- thresholds definidos por criticidade;
- fallback para revisão manual.

Alta confiança NÃO substitui confirmação humana quando o campo for material para decisão, contrato ou cálculo crítico.

---

# 16. AI Financial Procurement Analyst

IA é camada assistiva sobre objetos, permissões e regras existentes.

Usos prioritários:

- resumir processos;
- explicar diferenças;
- responder "o que precisa da minha atenção?";
- montar briefing;
- estruturar intake;
- preparar follow-ups;
- resumir contrato;
- explicar versões;
- organizar tarefas;
- produzir executive summary factual;
- localizar dados/documentos autorizados;
- explicar cálculos e proveniência;
- preparar drafts de comunicação.

IA NÃO DEVE:

- aprovar;
- rejeitar;
- contratar;
- assinar;
- executar transação;
- recomendar autonomamente instituição;
- inventar benchmark;
- preencher dado crítico por suposição;
- contornar autorização;
- acessar outro tenant/entity;
- compartilhar conteúdo com provider sem autorização.

RAG, embeddings, cache e índices devem respeitar o mesmo RBAC/RLS das fontes.

---

# 17. Integration Platform

Integrações enterprise devem usar uma plataforma comum, não conectores artesanais independentes.

## 17.1 Componentes

- connector registry;
- connection record;
- secret/credential lifecycle;
- scopes;
- field mappings;
- schema/version mappings;
- sync direction;
- sync cursor/checkpoint;
- idempotency;
- conflict policy;
- reconciliation report;
- retry/backoff;
- dead-letter;
- replay seguro;
- health/status;
- observabilidade;
- audit;
- source provenance.

## 17.2 Adapter principle

ERP, TMS, Open Finance, provider APIs, e-mail, Teams/Slack, signature, BI/DWH e market data devem ser adapters sobre contratos comuns quando possível.

## 17.3 Source of truth

Toda integração deve declarar:

- source of truth;
- direção;
- frequência;
- ownership;
- conflito;
- fallback;
- dados persistidos;
- dados minimizados;
- revogação;
- comportamento em outage.

## 17.4 Fail closed e degradação

Falha de integração não deve transformar dado stale em fato atual.

Quando apropriado, a UI deve mostrar:

- última sincronização;
- source;
- erro/degradação;
- ação de recuperação.

---

# 18. Enterprise Identity, Administration e Security

Capacidades alvo:

- SAML/OIDC SSO;
- SCIM;
- JIT provisioning;
- corporate groups;
- delegated admin;
- role mapping;
- access reviews;
- MFA policies;
- session policies;
- fine-grained permissions;
- enterprise audit export;
- retention;
- security events.

SSO/SCIM é blocker de adoção para muitos clientes enterprise e deve ser tratado como **readiness**, não como feature cosmética tardia.

Certificações/atestados só podem ser declarados quando realmente existirem.

---

# 19. Audit, Search e Data Governance

## 19.1 Audit

Audit trail de negócio deve ser separado de logs operacionais.

Deve permitir responder:

- quem;
- fez o quê;
- em qual objeto;
- por qual entidade;
- quando;
- origem;
- before/after quando apropriado;
- policy;
- request/correlation ID.

## 19.2 Enterprise Search

Busca deve cobrir, respeitando autorização:

- sourcing processes;
- proposals;
- contracts;
- documents;
- providers;
- entities;
- comments;
- obligations;
- opportunities;
- policies;
- tasks.

Busca semântica NÃO PODE contornar RLS/RBAC.

## 19.3 Data Governance

Toda nova tabela/objeto relevante deve possuir classificação e tratamento definidos:

- source of truth;
- sensibilidade;
- PII;
- financeiro;
- credencial;
- retention;
- export;
- legal hold;
- deletion/offboarding;
- owner.

---

# 20. Product Packs

Core inicial inclui crédito empresarial e adquirência/meios de pagamento.

Próximas adjacências legítimas podem incluir:

- FX sourcing, preferencialmente integrável a market data/execution venues quando execução eletrônica especializada já existir;
- guarantees/surety;
- cash management RFP;
- working capital/receivables sourcing;
- deeper acquiring intelligence;
- seguros selecionados;
- cartões/expense providers;
- outros após validação.

Novo pack só entra quando houver:

- problema real;
- persona;
- hipótese comercial;
- need schema;
- proposal schema;
- comparison model;
- documents;
- cálculos permitidos;
- regulatory boundary;
- lifecycle pós-award;
- integração com Provider/Graph/Contract/Policy;
- testes;
- E2E.

Não duplicar RFQ/proposal/decision/contract por pack.

---

# 21. Provider Discovery, Benchmarking e Network Effects

Provider Network é posterior ao fortalecimento do buyer side.

Discovery pode usar critérios objetivos como produto, ticket, moeda, região, porte e capacidade cadastrada.

A empresa escolhe quem recebe a oportunidade.

Benchmarking deve seguir a ordem:

1. histórico próprio;
2. grupo/entidades;
3. externo agregado somente após gates jurídicos, estatísticos e de privacy.

Benchmark externo exige:

- volume suficiente;
- anonimização;
- proteção contra reidentificação;
- base contratual/consentimento;
- segmentação;
- outliers;
- vintage;
- sample size quando adequado;
- legal review;
- access governance.

---

# 22. UX e arquitetura de navegação

O Arandu deve parecer um workspace corporativo de alta confiança.

Gramática universal:

**estado → próxima ação → por quê → prazo → responsável**

Navegação deve refletir trabalho e objetos, não a história técnica do sistema.

Áreas alvo (implementadas no menu desde a v3.3, fonte única `lib/finance/navigation.mjs`; ver §35.7):

- Meu trabalho;
- Contratações (procurement);
- Portfólio financeiro;
- Relacionamentos;
- Governança.

Aparência, tokens, componentes e QA visual seguem `docs/ARANDU_DESIGN_CONSTITUTION.md` (§35.5).

Comparison workspace deve priorizar:

- diferenças;
- missing data;
- versões;
- proveniência;
- filtros;
- critérios do cliente;
- cenários;
- ausência de recomendação default.

Progressive disclosure é obrigatório: complexidade enterprise deve existir sem destruir a legibilidade para organizações menores.

Acessibilidade deve preservar teclado, foco, labels, contraste, reduced motion, touch targets e ausência de overflow não intencional.

Mobile deve adaptar densidade, não copiar desktop cegamente.

---

# 23. Arquitetura de software, ambientes e dados

## 23.1 Uma base de código

Demo e Production devem usar a mesma aplicação e domínio. Pilot designa a etapa de validação, não um terceiro produto hospedado. Diferenças vêm de configuração, dados e infraestrutura, nunca de forks funcionais.

## 23.2 Modularidade

Novas features devem preferir módulos por domínio, contratos claros e reuso do core.

## 23.3 Regra crítica no servidor

Permissão, transição, aprovação, decisão, cálculo crítico, acesso a documento e mutação sensível devem ser validados server-side/banco.

## 23.4 Ambientes

Revisão de 07/10/2026, decidida pelo owner: **Permanent hosted environments: Demo e Production**.

- Demo: `main`, `ARANDU_ENV=demo`, runtime `demo`, Supabase exclusivo, Vitta Foods e personas 100% sintéticas, API/Auth/RLS reais; sem side effects externos reais.
- Production: mesma `main`, `ARANDU_ENV=production`, runtime `official`, Supabase/Auth/Storage/segredos próprios; somente release aprovada.
- Pilot: **release validation stage**. Usa CI, Demo canônica, previews temporários, doctor, canary, recovery, E2E e release checks. Não requer terceiro domínio, Supabase ou branch permanentes.

Destino planejado dos dois slots: `offgpyysgdhfemjlchod` de Pilot para Demo;
`igacnfjeuqhxcmfyepgj` de legado para Production. **Planejamento não é atribuição ativa.**
Nenhuma renomeação, reset ou reutilização libera o banco sem identidade, inventário,
prova de ausência de dados necessários de clientes/PII, backup/export e recovery.
Dados reais nunca entram na Demo. Legado com PII suspende apenas a operação destrutiva.

`ARANDU_ENV=pilot`, projeto `arandu-pilot` e a branch histórica continuam aceitos
**somente por compatibilidade transitória**, com estado `TO_BE_DECOMMISSIONED`.
Não apagar antes de Demo funcional, dependências/automação inventariadas e cutover seguro.
A política única de runtime continua em `lib/runtime-mode.mjs`; atribuições ativas e
destinos de conversão ficam em `lib/deployment-topology.mjs`. Não criar seletor paralelo.

## 23.5 Branches e promoção

Fluxo normativo: `feature/* ou fix/* → PR → CI → main → Demo → validação de release → Production`.

- `main` é a única branch longa de produto; feature/fix nasce de sua ponta atual;
- PR entra em main somente com database, deploy-boundaries, validate e presentation success no HEAD exato e base atual contida;
- Demo canônica executa o mesmo código e comprova o candidato com backend real;
- `release:candidate:check` exige provas de CI, schema, seed/reset, doctor, canário, jornada, recovery, observabilidade e exercício operacional;
- Preview temporário serve a ensaio isolado, não é terceiro ambiente permanente nem prova automática de M4;
- branch `pilot` é histórica/congelada e só pode ser removida quando não houver infraestrutura dependente;
- merge em outra branch não integra o produto; o SHA precisa ser ancestral de main.

Merge é proibido se qualquer dos quatro gates não for success, estiver stale ou
atestar SHA diferente. READY na Vercel, evidência local ou pressão por progresso
não autorizam bypass. Incidentes #140/#141 estão em FINANCIAL_REPO_GOVERNANCE.md.

## 23.6 Migrations

Toda migration relevante DEVE:

- ser aditiva quando possível;
- estar no manifesto;
- ter ordem determinística;
- preservar RLS/grants;
- ter clean-install;
- ter upgrade test;
- ter rollback/reapply quando seguro;
- usar expand/migrate/contract em destrutivas;
- distinguir rollback técnico de recovery por backup.

---

# 24. Performance, escala e capacity headroom

## 24.1 Hard limit não é operating envelope

Passar por poucos bytes abaixo de um budget NÃO DEVE ser tratado como condição saudável.

Para recursos críticos, devem existir dois conceitos:

- **hard limit**: limite que falha CI/build;
- **healthy operating envelope**: margem desejada para evolução segura.

O valor exato pertence ao documento técnico/performance gate, mas a organização DEVE reagir antes de encostar no hard limit.

## 24.2 Quando abaixo do envelope saudável

Nova capability de peso material deve incluir ao menos uma das opções:

- modularização;
- lazy loading;
- server composition;
- remoção de duplicação;
- split de superfície;
- budget plan aprovado.

Aumentar o hard limit apenas para fazer CI passar NÃO é solução default.

## 24.3 Escala

Novos módulos devem considerar milhares de:

- RFQs;
- proposals;
- contracts;
- documents;
- events;
- providers;
- entities.

Evitar:

- N+1;
- carregar tenant inteiro no browser;
- filtros client-side sobre datasets grandes;
- recomputar analytics históricos a cada request.

---

# 25. Delivery lifecycle e Definition of Done

## 25.1 Discovery

Antes de implementar:

- persona;
- problema;
- comportamento atual;
- objeto;
- source of truth;
- estados;
- permissions;
- tenant/entity;
- risco;
- métrica;
- fora de escopo;
- target maturity para a rodada.

## 25.2 Design

Cobrir:

- happy path;
- empty/loading/error;
- denied;
- stale/conflict;
- audit;
- notifications;
- mobile;
- accessibility;
- integration;
- provenance;
- migration/recovery.

## 25.3 Ordem de implementação preferida

1. modelo e contratos;
2. autorização;
3. domínio;
4. API;
5. UI;
6. instrumentation;
7. negative tests;
8. E2E;
9. docs;
10. evidence.

## 25.4 Definition of Done técnico

Conforme aplicável:

- boundaries preservados;
- RLS/RBAC testados;
- API valida permission;
- migration no manifesto;
- rollback/forward-fix/recovery definido;
- `check:all`;
- build/budgets;
- DB tests;
- E2E;
- cross-browser;
- mobile;
- console limpo;
- sem overflow;
- audit;
- provenance;
- docs;
- evidence;
- claims revisadas.

## 25.5 Customer Validation Gate

Capability material NÃO DEVE ser chamada de plenamente validada apenas por testes técnicos.

Para atingir `CUSTOMER_VALIDATED`, registrar:

- usuário/persona;
- cenário real;
- objetivo;
- journey observada;
- tempo/configuração relevantes;
- passos manuais/fricções;
- resultado;
- feedback;
- gaps;
- decisão de produto resultante.

Isso não exige que todo experimento seja GA. Exige apenas que claim de validação por cliente tenha evidência.

---

# 26. QA, Security e operação

## 26.1 Pirâmide prática

- unit/domain;
- API/contracts;
- DB/RLS/migrations;
- integration;
- E2E;
- visual/presentation;
- hosted journey.

## 26.2 Casos negativos mínimos

- sem sessão;
- outro tenant;
- outra entity;
- provider concorrente;
- role insuficiente;
- state inválido;
- stale version;
- malformed data;
- replay;
- wrong environment;
- forged webhook;
- integration conflict;
- AI retrieval sem permissão.

## 26.3 Multi-tenancy

RLS no banco continua primeira linha de isolamento. Filtro apenas em frontend/API não substitui RLS.

## 26.4 Storage

Documentos financeiros permanecem privados; acesso via autorização server-side e signed URL curta quando aplicável.

## 26.5 Logs

Não registrar tokens, senhas, documentos completos, segredos, dados financeiros sensíveis desnecessários ou PII além do mínimo.

## 26.6 Fail closed

Ambiguidade de auth, environment, integration, config ou permission deve falhar fechada.

## 26.7 Recovery

M5/PRODUCTION_READY exige recovery proporcional ao que a capability armazena.

Se backup não cobre, por exemplo, binários, MFA ou configuração essencial, isso DEVE aparecer como gap explícito e bloquear claims incompatíveis.

---

# 27. Métricas e North Star

## 27.1 North Star conceitual

> **Quantos relacionamentos e processos financeiros corporativos relevantes uma empresa consegue administrar no Arandu, de ponta a ponta e continuamente, com dados confiáveis, competição, governança, decisão humana, implantação, contrato, obrigações, renovação, custos, savings e memória institucional — sem voltar para planilhas, e-mails e decisões sem trilha.**

## 27.2 Indicadores associados

A North Star deve ser acompanhada por métricas como:

- % de processos end-to-end conduzidos no Arandu;
- % de contratos relevantes monitorados;
- % de renewals iniciadas antes da janela crítica;
- % de fees com cobertura verificável;
- % de opportunities com ação humana registrada;
- realized savings verificado;
- time-to-RFQ;
- time-to-first-response;
- proposal coverage;
- negotiation/approval/decision cycle;
- implementation cycle;
- redução de follow-ups manuais;
- WAU/MAU por persona;
- retention por organização;
- time-to-value;
- integração/API usage.

Quantidade de telas e features é métrica de vaidade isoladamente.

---

# 28. Produto comercial e packaging

O Arandu deve ser vendido como software e infraestrutura de trabalho, não como promessa de "melhor taxa".

Eixos naturais:

- users;
- legal entities;
- Product Packs;
- process volume;
- monitored contracts;
- integrations;
- API/webhooks;
- SSO/SCIM;
- analytics;
- retention/audit;
- AI/document intelligence;
- support/SLA.

Receita ligada a fornecedor ou contratação deve ser transparente e não contaminar comparison logic.

---

# 29. Sequência de maturidade do produto

Esta seção descreve **ordem estratégica**, não estado atual. O estado real pertence à `IMPLEMENTATION_MATRIX`.

## Stage 0 — Operational & Enterprise Readiness

Antes de acelerar expansão:

- baseline/CI limpa;
- branch/ruleset governance;
- etapa de validação de release reconciliada, sem terceiro ambiente permanente;
- migrations aplicadas com evidência;
- backup/restore proporcional ao estado;
- doctor/canary/journey;
- ambientes realmente separados;
- production configuration própria;
- operational owners;
- incident/recovery runbooks;
- enterprise identity readiness quando necessário ao cliente.

## Stage 1 — Intelligence e Enterprise Adoption

Priorizar:

- Proposal & Document Intelligence;
- SSO/SCIM/enterprise admin;
- Provider Qualification;
- Enterprise Search;
- Executive Portfolio sobre dados reais.

## Stage 2 — Lifecycle Depth

Priorizar:

- Post-Award Implementation;
- Covenant/Obligation Monitor;
- Provider Performance;
- deeper Contract/Renewal workflows;
- Enterprise Intake;
- Scenario Builder/split award.

## Stage 3 — Integration & Financial Intelligence

Priorizar:

- Integration Platform;
- Financial Spend;
- ERP/TMS connectors;
- Open Finance;
- provider APIs;
- Teams/Slack;
- BI/DWH;
- richer automation grounded in source-of-truth data.

## Stage 4 — Product Pack Expansion

Somente após core/lifecycle maduros:

- FX;
- guarantees/surety;
- cash management;
- working capital/receivables;
- deeper acquiring;
- outras categorias aprovadas.

## Stage 5 — Network Effects

Depois de buyer-side maturity e governança:

- Provider Discovery Network;
- internal benchmark avançado;
- external benchmark com gates;
- network intelligence.

Pular estágios é aceitável apenas quando dependências, risco e hipótese comercial justificarem formalmente.

---

# 30. Framework de priorização

Toda iniciativa deve ser avaliada por:

| Dimensão | Pergunta |
| --- | --- |
| Dor | Resolve trabalho financeiro real? |
| Recorrência | Aumenta uso semanal/diário? |
| Lifecycle | Fecha um buraco ponta a ponta? |
| Maturidade | A base dependente está pronta no ambiente necessário? |
| Dados | Gera histórico estruturado reutilizável? |
| Governança | Melhora decisão/controle? |
| Diferenciação | É melhor que e-mail + planilha + portal sem tentar replicar infraestrutura especializada já existente? |
| Memória/compounding | Acumula contexto, relações e histórico estruturado que tornam o workflow futuro melhor? |
| Enterprise | Remove blocker de adoção? |
| Reuso | Serve múltiplas categorias/personas? |
| Integração | Respeita source of truth? |
| Segurança | Preserva isolation/least privilege? |
| Neutralidade | Mantém decisão no cliente? |
| Operação | É observável e recuperável? |
| Comercial | Melhora activation, retention, expansion ou WTP? |
| Distribuição | Prospect acessa URL pública e entende a versão aprovada sem login de plataforma? |
| Fidelidade demonstrativa | Telas, fluxos e limites anunciados correspondem ao produto efetivamente implementado? |
| Complexidade | Valor compensa custo técnico/cognitivo? |

Features com "wow" alto e workflow, maturidade, dados ou recorrência baixos devem ser adiadas.

---

# 31. Anti-patterns proibidos

NÃO FAZER:

- transformar o produto em um RFQ-only / "comparador de bancos";
- tratar volume de RFQs como moat suficiente;
- reconstruir terminal de mercado, feed proprietário, OMS/EMS ou execution venue quando uma integração especializada resolver melhor;
- iniciar feature war contra plataformas de mercado em vez de aprofundar lifecycle, Graph, memória e integrações;
- segunda implementação de comparison;
- demo engine paralelo ao produto real;
- duplicar objetos por Product Pack;
- lógica crítica apenas no browser;
- service role no cliente;
- ranking default de providers;
- recommendation default;
- savings sem metodologia;
- benchmark sem governança;
- Graph como data lake indiscriminado;
- integração one-off sem contratos comuns quando a Integration Platform puder atender;
- API sem scopes/audit/rate limit;
- multi-entity como simples `entity_id` espalhado;
- dashboard sem workflow;
- IA sem provenance/permission grounding;
- documento controlar instrução de agente;
- Opportunity Engine executar contratação sozinho;
- migration fora do manifesto;
- banco compartilhado entre ambientes;
- dado real em demo;
- pack sem lifecycle;
- big-bang refactor sem necessidade;
- reabrir vertical de arte;
- expandir consumidor antes do B2B enterprise;
- chamar CI de validação hospedada;
- chamar deploy de production-ready sem recovery;
- chamar feature de customer-validated sem cliente/usuário observado;
- aumentar budget apenas para silenciar regressão de capacity.

---

# 32. Mudanças que exigem revisão formal da guideline

Revisar antes de:

- oferecer B2C;
- executar pagamentos;
- custodiar fundos;
- conceder crédito;
- executar hedge/investimento;
- underwriting;
- success fee que afete neutralidade;
- recomendação automatizada;
- decisão autônoma por IA;
- marketplace aberto com compartilhamento automático de dados;
- compartilhar dados agregados com provedores;
- benchmark externo;
- mudar topologia de ambientes;
- abandonar RLS;
- criar segunda codebase de demo;
- mudar modelo de branches;
- permitir armazenamento persistente de dados sensíveis em provedor de IA sem revisão;
- usar dados de cliente para treinamento de modelo externo;
- permitir ação material autônoma e irreversível.

---

# 33. Instruções normativas para agentes de IA

Antes de implementação relevante, agente DEVE:

1. ler esta guideline;
2. ler `FINANCIAL_PRODUCT_BOUNDARIES.md`;
3. ler a `IMPLEMENTATION_MATRIX`;
4. identificar maturity state e target state;
5. verificar módulos existentes;
6. estender antes de duplicar;
7. declarar fora de escopo;
8. preservar decisão humana;
9. preservar RLS/RBAC/MFA;
10. preservar ambientes;
11. validar source of truth;
12. identificar recovery impact;
13. provar mudança com testes/evidência;
14. nunca declarar ambiente externo sem observação real.

Durante implementação:

- não remover guardas para facilitar testes;
- não criar auth bypass;
- não inventar claims/dados;
- não confundir mock com provider real;
- não confundir local com hosted;
- manter PR coesa;
- atualizar docs quando arquitetura, boundaries ou maturity mudarem;
- se a base avançar, atualizar a branch antes do merge;
- tratar regressão como motivo válido para rebaixar maturity.

---

# 34. Regra final de evolução

Na dúvida, priorizar:

**estabilizar → provar recovery → validar ambiente real → aprofundar entidades e relacionamentos → fechar lifecycle → estruturar dados → integrar sources of truth → detectar oportunidades → automatizar trabalho reversível → gerar inteligência → expandir categorias → ativar network effects.**

Nunca inverter essa ordem apenas para produzir demo mais impressionante.

---

# 35. Produto, design e prontidão comercial (v3.3)

Este capítulo consolida a direção de produto, experiência e posicionamento resultante da revisão de 11/10/2026. Ele **acrescenta** obrigações; nenhuma regra dos capítulos 1–34 é relaxada. Em conflito, prevalecem segurança, proveniência, neutralidade e decisão humana (§1.2).

## 35.1 Posicionamento competitivo

O Arandu é a plataforma operacional de **procurement financeiro, relacionamento institucional e ciclo de vida dos produtos financeiros corporativos**. Não é marketplace de crédito, comparador de bancos, suite S2P genérica, TMS nem ferramenta de spend de SaaS. O panorama observado e as fontes estão em `docs/ARANDU_COMPETITIVE_LANDSCAPE.md`; nenhum dado de concorrente é apresentado como fato no produto ou no site.

## 35.2 Segmento e personas

Público inicial: empresas médias e grandes (incluindo grupos econômicos com várias entidades legais) com relacionamento ativo com várias instituições. Personas canônicas: CFO/diretor financeiro (aprova, decide), gerente financeiro/tesouraria (conduz processos e portfólio), analista (avalia propostas, mantém dados), aprovador (decide etapa com SoD), administrador (governança) e usuário da instituição financeira (responde convites). Testes automatizados de persona **não** são pesquisa com usuários (§35.13).

## 35.3 Diferenciação central

Os eixos defensáveis são: objeto financeiro tipado (CET, indexador, spread, MDR, garantias, covenants); neutralidade comprovável (sem ranking default, sem remuneração por sucesso); continuidade pós-contratação (renovação, aditivos, covenants, tarifas contratadas × observadas, valor realizado); relacionamento bancário auditável pelo Financial Graph; experiência bilateral com isolamento entre instituições. Benchmark de mercado agregado **não** é diferencial atual e NÃO DEVE ser simulado (§21).

## 35.4 Estratégia de design

O Arandu DEVE parecer projetado por uma equipe de produto profissional: identidade própria, densidade adequada a decisões financeiras, consistência entre superfícies e linguagem de gente. Mudança visual existe para clareza, legibilidade e identidade — não para demonstrar atividade.

## 35.5 Design Constitution

`docs/ARANDU_DESIGN_CONSTITUTION.md` é normativa para tokens, tipografia, cor, espaço, componentes, navegação, acessibilidade, microcopy, dados fictícios e QA visual. Mudança de identidade (tokens de marca, monograma, escala tipográfica) exige atualização da constitution e do checador `scripts/check-design-tokens.mjs` na mesma PR.

## 35.6 Anti-vibecode como qualidade objetiva

"Aparência de template" é defeito de produto, não preferência estética. Os padrões listados na constitution §2 (KPIs genéricos, cards iguais sem hierarquia, decoração, copy vaga, múltiplos primários, vazamento técnico na tela) DEVEM ser evitados ou justificados por escrito. Vazamento de UUID, enum interno, nome de função/tabela ou timestamp ISO na interface é **bug**.

## 35.7 Arquitetura de informação

O menu DEVE refletir objetivos (Meu trabalho, Contratações, Portfólio financeiro, Relacionamentos, Governança — §22), com fonte única em `lib/finance/navigation.mjs`. Reorganização de menu NÃO DEVE remover rota, quebrar deep link, contornar autorização nem expor rota da empresa ao provedor.

## 35.8 Workspace orientado a tarefas

A página inicial responde, nesta ordem: o que exige atenção, por quê, prazo, responsável, próxima ação e o que mudou. Indicadores executivos só aparecem com dado válido, metodologia e cobertura; cada um leva a uma ação ou contexto verificável. Ações inacessíveis ao papel não aparecem como executáveis.

## 35.9 Progressive disclosure

Complexidade enterprise (multi-entity, policies, governança, integrações) DEVE ficar disponível sem ocupar a primeira leitura de quem não precisa dela: grupos recolhíveis, detalhes sob demanda, filtros avançados recolhidos. A área da página atual nunca é escondida.

## 35.10 Primeiro valor e ativação

O Arandu DEVE gerar valor antes da primeira proposta bancária: registrar instituição, contrato existente, facility, tarifa ou vencimento são caminhos de primeiro valor. Onboarding é progressivo (dados mínimos → objetivo → primeira ação útil) e reutiliza cadastro existente; nunca duplica objeto.

## 35.11 Experiência bilateral com instituições financeiras

O portal do provedor DEVE permitir responder a um convite sem orientação externa: contexto da solicitação, prazo, perguntas, documentos, versão e status claros, inclusive no celular. Baixo atrito NUNCA justifica permissão excessiva, bypass de autenticação ou visibilidade entre concorrentes.

## 35.12 Demonstração comercial e claims

Site e materiais usam capturas reais da Demo canônica, rotuladas como demonstração. São proibidos: depoimentos fictícios, logos não autorizados, estatísticas e economias inventadas, certificações inexistentes, promessas de segurança/SLA/RPO/RTO sem evidência e declaração de prontidão de produção sem maturidade M5 registrada na matriz.

## 35.13 Validação com usuários reais

Hipóteses de UX (inclusive as cinco áreas) só são consideradas validadas com sessões registradas com pessoas do público-alvo (data, papel, tarefa, resultado), sem PII no repositório. Até lá, permanecem "hipótese implementada" na matriz.

## 35.14 Métricas de experiência

Eventos mínimos de ativação: início/conclusão de onboarding, primeira instituição, primeiro contrato, primeira solicitação, primeira comparação válida, primeiro convite, primeira resposta, primeira decisão, primeiro retorno e abandono por etapa. Telemetria segue minimização (§19.3): sem PII, sem valor financeiro, sem conteúdo de proposta; ferramenta externa só com base e contrato apropriados.

## 35.15 Design QA e regressão visual

Mudança visual relevante DEVE ter captura renderizada antes/depois em desktop e celular (`npm run design:capture`), checagem de overflow e checklist da constitution §15. Revisão visual não pode ser declarada sem renderização efetiva.

## 35.16 Benchmark competitivo contínuo

`docs/ARANDU_COMPETITIVE_LANDSCAPE.md` DEVE ser revisado trimestralmente, com fonte, data e grau de confiança por observação. O benchmark orienta prioridade; não autoriza copiar identidade, texto ou layout.

## 35.17 AI assistance e supervisão humana

A IA PODE estruturar demandas, resumir e extrair documentos, explicar diferenças e metodologias, apontar campos ausentes, preparar follow-ups e sugerir a próxima ação de processo — sempre ligada a objetos reais, com proveniência e confirmação humana (§15–§16). A IA NÃO PODE aprovar, assinar, escolher banco, contratar, enviar dado reservado sem autorização, fabricar benchmark, alterar dado crítico silenciosamente, contornar policy ou cruzar tenants. Fornecedor de IA, envio externo de dados ou dependência paga exigem autorização explícita. Sem infraestrutura segura, entregam-se apenas contratos de interface — nunca respostas simuladas apresentadas como inteligência.

## 35.18 Critérios de prontidão comercial

Uma capability só é anunciada como disponível quando está em M3+ no ambiente anunciado; em M2 pode ser demonstrada **como demonstração**. Venda para cliente com dados reais exige os gates jurídicos (§3) e de recuperabilidade (§26.7) aplicáveis.

## 35.19 Priorização baseada em resultado

Cada melhoria é avaliada por clareza, valor financeiro operacional, recorrência, diferenciação, redução de trabalho manual, integração ao lifecycle, reaproveitamento do Graph, segurança, maturidade, custo, performance, capacidade de validação e impacto comercial (§30). Impressionar em apresentação não é critério.

## 35.20 Integração entre marketing, produto e engenharia

Site, produto e documentação contam a mesma história: o site só promete o que a matriz registra, as capturas vêm do produto real e a terminologia é a mesma do menu. Mudança de posicionamento atualiza esta guideline, a matriz e o site na mesma rodada.

---

# 36. Garantias operacionais, sessões, decisões e passagem de M2 para M3 (v3.4)

Este capítulo complementa os capítulos 1–35 com critérios normativos derivados da validação integrada e das revisões de segurança de outubro de 2026. Não altera a tese B2B, os limites regulatórios, o direito de decisão do cliente, os estados de maturidade ou a topologia de dois ambientes permanentes. A Implementation Matrix continua sendo o registro vivo dos estados e das evidências; nenhuma PR ou incidente específico equivale a validação hospedada.

## 36.1 Contratos de segurança por superfície

- A promessa de revogação de sessão DEVE declarar exatamente em quais superfícies é efetiva: API própria, PostgREST/Data API, Auth, Storage, Realtime, URLs assinadas e integrações. Um controle de pré-requisição do PostgREST NÃO DEVE ser descrito como proteção automática dos demais serviços.
- Rotas autenticadas que leem ou escrevem dados financeiros DEVEM verificar permissões no servidor e isolamento por organização/entidade; RLS permanece defesa independente quando houver acesso ao banco. Roles privilegiadas, anonymous access, múltiplas sessões e logout local/global DEVEM ter comportamentos expressos e testes negativos.
- Mudança de revogação de sessão baseada em sessão armazenada DEVE provar, em ambiente descartável, token vigente, token encerrado, outra sessão ainda ativa, tentativa de escrita revogada, acesso direto à Data API e regressões no service role. Claims de JWT e configurações do PostgREST não podem ser tomadas como prova de instalação: exigir probe pós-migration e teste HTTP direto.
- Mudanças em auth.sessions, hooks e políticas gerenciadas do Supabase DEVEM considerar permissões, owner, search_path, compatibilidade e configurações de projetos gerenciados. A configuração real do ambiente hospedado continua não comprovada até doctor, probe e jornada no release implantado. Custos de autorização DEVEM ser medidos com consultas representativas, incluindo latência de cauda; não basta citar mediana.
- Storage DEVE ser validado de forma autônoma: políticas de bucket, binários, caminhos, URLs assinadas e acesso do provedor. A proteção de uma API não comprova revogação de links já emitidos ou de outras superfícies.

## 36.2 Integridade de decisão e concorrência no ciclo financeiro

- Toda decisão material sobre proposta DEVE registrar a identidade e versão imutável das condições efetivamente apresentadas à pessoa que decide; a versão informada pelo cliente DEVE ser conferida no servidor e no banco, não aceita como verdade por si só.
- Se a proposta mudou, a decisão DEVE falhar sem persistência parcial e informar o conflito de modo recuperável. A UI DEVE exibir as condições atualizadas antes de permitir nova confirmação, sem automatizar uma escolha diferente.
- Operações concorrentes de proposta, aprovação, decisão, contrato e renovação DEVEM possuir política explícita de locks/versionamento, idempotência e ordem estável de aquisição. Se houver disputa, erro transacional não deve vazar stack ou ser anunciado como sucesso.
- Correções de concorrência DEVEM ser sustentadas por interleavings determinísticos em sessões independentes do PostgreSQL, não somente por clique duplo, espera arbitrária ou retry. Invariantes testadas incluem versão, estado, decisão humana, eventos, histórico, RLS e ausência de escritas parciais.
- Mudanças de RPC ou contrato de API DEVEM definir ordem de rollout de schema e aplicação, compatibilidade transitória e rollback/forward-fix. Reverter código não reverte dados, nem uma migration de forma automática.

## 36.3 Recovery completo e demonstrável

- Um backup PostgreSQL, ainda que criptografado e restaurado, NÃO DEVE ser declarado backup completo do ambiente quando faltarem binários de Storage, configuração externa de Auth/OAuth, chaves relevantes, roles, extensões ou demais dependências identificadas no inventário. Metadados de Storage e conteúdo binário são itens distintos.
- Antes de converter Pilot ou Legacy, DEVE existir inventário de public/Auth/Storage e configuração, classificação/minimização de dados, dono responsável, decisão sobre dados de cliente e PII, destino privado durável e prova do mesmo conjunto preservado. Dados reais NÃO DEVEM ser reutilizados na Demo.
- Toda preservação real DEVE produzir manifesto, hashes, criptografia, retenção e cadeia de custódia, com identidade da origem e SHA do executor. O restore DEVE usar o MESMO export, em destino isolado, com reconciliação de schema, conteúdo autorizado, ACL/RLS, Auth, referências de Storage e binários quando aplicável. Teste sintético e verificação de arquivo por hash não substituem restore de um backup real.
- O executor de recovery NÃO PRECISA ser um runner próprio por definição: GitHub-hosted com destino privado durável aprovado, ou executor confiável com armazenamento persistente, são alternativas que DEVEM ser comparadas em custo, autorização, durabilidade, transferência e operação. Runner efêmero nunca é armazenamento único. Escolha de fornecedor pago exige aprovação.
- Se o exportador não suportar arquivos de Storage, tamanho dos objetos, configuração essencial ou restore compatível com Supabase gerenciado, a limitação DEVE bloquear qualquer claim de preservação completa e o cutover que dependa dela. Não resolver esse problema apagando objetos, resetando o banco ou desativando checagens.
- Operação real de export, restore, descarte, mudança de configuração hospedada e cutover exige autorização explícita, identidade do alvo e credenciais fora do repositório/chat. Preparação sintética e probes read-only podem avançar sem essas permissões.

## 36.4 Passagem progressiva de M2 para M3, M4 e M5

- M2 comprovado em runner efêmero autoriza afirmar integração em CI no SHA verificado; NÃO autoriza M3, mesmo com Auth, RLS, Storage, seed e E2E reais no runner.
- O primeiro destino operacional é a Demo canônica hospedada, no projeto permanente de Demo, com banco/Auth/Storage próprios, exclusivamente dados sintéticos e workspaces de visitantes isolados. O sandbox público legado só deve ser substituído quando houver cutover e validação real seguros. Pilot continua etapa de validação, não terceiro ambiente permanente.
- Antes de liberar M3, exigir recovery e classificação da origem quando aplicável, migrations e ajustes de configuração autorizados, identidade de ambiente/SHA/schema, verificação das funções e hooks efetivamente instalados, readiness/doctor/canário, jornadas do comprador e provedor, isolamento entre visitantes e observabilidade. Estado READY da Vercel, HTTP 200, CI verde ou build local são provas insuficientes.
- M4 exige ensaio real de release com runbook, resposta a falhas, fluxos críticos e, quando aplicável, restore/rollback ou forward-fix verificáveis; M5 exige configuração Production independente, operação e suporte responsáveis, disaster recovery proporcional, release aprovado e evidências hospedadas. Não promover por contornar guardas ou alterar artificialmente ACTIVE_SUPABASE_ASSIGNMENTS.
- A sequência de entrega DEVERIA ser: estabilizar CI → fechar lacunas de recovery e Auth/Storage → realizar preservação e restore autorizados → converter e validar a Demo canônica hospedada → ensaiar M4 → preparar e aprovar Production. Expansão de categorias permanece subordinada a esses gates.

## 36.5 Evidência, eficiência de CI e comunicação

- Testes pesados de banco/Auth/Storage/E2E DEVERIAM rodar em Linux efêmero com dados sintéticos e teardown fail-closed, sem depender do computador pessoal nem consumir serviços hospedados. Reutilizar suites existentes e ampliar somente riscos não cobertos; não usar retries para esconder defeitos, nem contar skipped como PASS.
- Repetições independentes em SHA imutável comprovam estabilidade daquele commit, não do código futuro; mudanças no harness ou no produto demandam nova evidência proporcional. A entrada de um job custoso como gate obrigatório requer avaliação de frequência, duração, confiabilidade, custo e impacto na fila, sem afrouxar checks existentes.
- Evidências DEVEM distinguir IMPLEMENTED, LOCAL_VALIDATED, CI_VALIDATED, HOSTED_VALIDATED, BLOCKED e NOT_RUN, e vincular SHA, ambiente, datasource, schema, run ID e hora. A Implementation Matrix, o relatório operacional e os claims comerciais devem permanecer coerentes.
- Agentes de IA DEVEM avançar autonomamente em código, testes sintéticos, PRs e preparação, mas interromper antes de alterações hospedadas sensíveis ou operações destrutivas sem aprovação. Ao relatar bloqueio, indicar a menor intervenção indispensável e continuar frentes independentes.
- A guideline é normativa, não backlog nem inventário de PRs: números de testes, status de projetos e impedimentos transitórios DEVEM ficar nos documentos operacionais e na Implementation Matrix.

---


# 37. Distribuição da Demo pública e apresentação local (v3.5)

Decisão do owner em 19/10/2026: para 29/10, o Arandu tem dois entregáveis P0 independentes. **P0-A: link público compartilhável e atualizado** no projeto arandu-demo, acessível a um prospect sem autenticação de plataforma, instalação ou dependência da máquina do apresentador. **P0-B: estação local definitiva** com a Demo canônica (API, Auth, RLS, Storage e dados sintéticos), validada e congelada na máquina que será usada na apresentação. Os marcos operacionais, owners e evidências pertencem a docs/PUBLIC_DEMO_2026-10-29_PRIORITY.md e à Implementation Matrix, não a esta constituição.

## 37.1 Reordenação de trabalho

- **P0-A — Demo pública compartilhável:** abrir https://arandu-demo.vercel.app/ sem conta GitHub/Vercel; apresentar a interface *atual da main aprovada*, fluxo comprador/provedor, identidade e dados fictícios claros, navegação em desktop/mobile, recursos e rotas corretos. Vercel SUCCESS sozinho NÃO comprova esse requisito.
- **P0-B — Estação local:** software canônico e jornada com operações reais sobre dados fictícios, testes adversariais e recuperação, mais preflight READY na própria máquina definitiva, no SHA congelado. Executor efêmero só permite PREPARED.
- **P1 — Demo canônica hospedada M3:** a mesma aplicação main com Supabase Demo exclusivo, Auth/RLS/Storage, visitantes isolados e jornada real; condicionada integralmente a classificação, preservação, restore, migrations, cutover e provas hospedadas (§23.4 e §36). A visita pública não substitui M3.
- **P2 — Production e expansão:** após estabilizar os P0, salvo incidente crítico de segurança ou bloqueio direto desses marcos. M4/M5, dados reais e gates seguem intactos.

## 37.2 Vitrine transitória sem criar produto paralelo

Enquanto M3 estiver BLOCKED, P0-A PODE oferecer visita pública navegável baseada em **telas realmente renderizadas do produto canônico no SHA aprovado** ou reuso seguro de suas superfícies e assets, com limites honestos. Um sandbox histórico eventualmente acessível deve ser separado e rotulado **simulação no navegador, sem persistência no servidor**.

- NÃO adicionar novas capacidades ao sandbox legado finance/demo; não duplicar regras de domínio, permissões ou cálculos para fabricar paridade. Fonte de telas, áreas, terminologia e design: produto canônico, navigation.mjs e Design Constitution.
- NÃO anunciar que RFQs, propostas, aprovações, contratos ou arquivos foram gravados em backend se a experiência estiver só exibindo visita ou simulação. Não criar login fictício que pareça Auth real, recomendação financeira inventada ou ações externas reais.
- NÃO expor secrets, dados pessoais, credenciais de cliente, links privados ou identidade de outras organizações. Preservar zero side effects externos e os limites de claims da seção 35.
- A publicação pública M2 é aceitável como *demonstração do produto* com rótulo explícito e fidelidade visual comprovada. Status de backend M3 permanece próprio e independente.

## 37.3 Prova do link e atualização

- Smoke externo independente DEVE abrir raiz, início da exploração, telas de RFQ/propostas/comparação/contratos/tarefas e portal do provedor; verificar deep links, assets JS/CSS, responsividade, teclado, acessibilidade básica, ausência de loops/404 e ausência de Deployment Protection para visitantes anônimos.
- A versão pública atualizada DEVE ser ligada a SHA aprovado da main, ambiente, modalidade (visita, sandbox ou canônica), data e evidência do que o visitante realmente visualizou. SHA da main sem deploy comprovado não equivale a conteúdo servido; freeze aprovado pode ser preferível a deploy automático inseguro.
- Diferenciar explicitamente três provas: PUBLIC_SHAREABLE (acesso e paridade de visita), LOCAL_STATION_READY (estação real) e CANONICAL_HOSTED_M3 (backend hospedado). Nenhuma confere as outras. Sem evidência, NOT_PROVEN ou BLOCKED.
- Código e UX da experiência pública ficam preferencialmente com Claude Code; deploy/roteamento/identidade/smoke externo e preparação M3 com Codex. PRs separadas, quatro gates no HEAD exato, sem alterações simultâneas em arquivos compartilhados.

## 37.4 Fronteiras preservadas

Esta prioridade NÃO autoriza trocar ARANDU_DEPLOYMENT_KIND por ARANDU_ENV, mudar ACTIVE_SUPABASE_ASSIGNMENTS, resetar Pilot/Legacy, criar terceiro ambiente permanente ou contornar recovery, LGPD, RLS, Vercel, branch protection e checks. O sandbox antigo não é arquitetura-alvo, mas não deve ser retirado antes de uma substituição acessível, honesta e verificada.

---


# 38. Benchmark competitivo, adoção bilateral e performance baseada em evidência (v3.6)

Este capítulo acrescenta critérios normativos a partir da revisão estratégica de 20/10/2026. **Não revoga, rebaixa nem posterga §37/P0-A/P0-B**, nem relaxa os gates de segurança, preservação, recovery, maturidade e autorização das seções anteriores. Sua sequência é progressiva: os preparativos que não competem por recursos com os P0 podem começar, mas funcionalidades secundárias não podem atrasar 29/10. O plano executável e o registro das hipóteses estão em \`docs/FINANCIAL_COMPETITIVE_EXECUTION_PLAN_2026-10-20.md\`; evidência de entrega/maturidade continua na Implementation Matrix.

## 38.1 Tese e referência de mercado

O Arandu é um **Financial Procurement Lifecycle OS B2B**, de compra e gestão do relacionamento financeiro: **necessidade → RFQ/convite → proposta comparável → aprovação e decisão humanas → contratação → acompanhamento de termos, tarifas, obrigações e performance → renovação/renegociação**. O cliente comprador controla critérios e acesso aos seus dados; a instituição convidada recebe somente os objetos autorizados. Comparar propostas é capability, **não** o moat isolado. O diferencial pretendido combina Financial Graph, memória institucional, dados tipados e rastreáveis, continuidade pós-contratação e governança.

O benchmark DEVE separar quatro conjuntos: **concorrência direta** (ex.: Treasury Delta; Finpass no recorte de crédito), **procurement/intake** (Zip, ORO Labs, Ivalua), **CLM/relacionamento** (Gatekeeper), **tesouraria/fee intelligence** (Kyriba, Redbridge/HawkeyeBSB, Pagos) e **infraestrutura/banking workflows** (Nexxera, nCino). Uma capacidade anunciada em marketing externo **não equivale** a demo verificada, paridade de implantação, preço público ou desempenho medido. Novas comparações exigem fonte oficial identificável, data, jurisdição/segmento, confiança e diferença entre observado e inferido; não declarar unicidade, market share, ROI ou vantagem de performance sem evidência comparável.

Arandu NÃO DEVE reconstruir TMS completo, core banking, rede transacional, pagamentos, assinatura jurídica, sistema de crédito decisório, marketplace de "melhor banco" ou benchmark de preços inventado. Construir workflows e Graph; **integrar** fontes especializadas quando autorizadas e economicamente justificadas; evitar feature war.

## 38.2 Segmento inicial e jobs-to-be-done

Buyer inicial: tesouraria e gestão financeira de empresas médias/grandes e grupos multi-entity com mais de uma instituição e processos recorrentes; a hipótese de nicho/porte permanece a validar. Papéis: CFO, gerente financeiro/tesouraria, analista, aprovador, administrador. Jobs mínimos: (a) estruturar demanda sem planilha informal, (b) comparar propostas com cobertura e premissas, (c) decidir com trilha defensável, (d) preservar contratos/condições, (e) não perder vencimentos/obrigações, (f) verificar tarifas e valor financeiro documentado.

Provider inicial: banco, adquirente ou instituição autorizada convidada. Jobs mínimos: (a) compreender a oportunidade e prazo, (b) aceitar/recusar com pouco atrito, (c) elaborar e revisar proposta de modo seguro, (d) esclarecer dúvidas, (e) ver andamento e resultado **somente quando o comprador compartilhar**, (f) manter histórico da própria atuação. **Não presumir** que o fornecedor entrará espontaneamente nem que criará conta para cada comprador: importar proposta recebida fora da plataforma, com proveniência e confirmação humana, é capacidade importante de adoção.

## 38.3 Priorização normativa e dependências

Ordem estratégica **após** estabilização dos P0, sem alterar a classificação vigente da Demo canônica hospedada como P1 e Production/M5 como P2 operacional:

1. **P0-A (até 29/10): distribuição pública comprovada** — SHA servido, visitante anônimo, interface atual, buyer/provider, desktop/mobile, capturas reais da Demo canônica ou reuso seguro, rótulo honesto de simulação. Cumprir §37.
2. **P0-B (até 29/10): estação local real** — Auth/API/RLS/Storage e dados sintéticos, freeze e station READY **na máquina do owner**. Cumprir §37.
3. **P1-A: adoção e experiência bilateral** — completar portal do provedor (D33-12), entrada por objetivo/primeiro valor (D33-09/14), jornada de contrato existente, acompanhamento por instituição, entrada/importação manual controlada de propostas externas, pesquisas com compradores e bancos (D33-16). Preparação e QA que caibam antes de 29/10 não tomam precedência sobre P0.
4. **P1-B: Demo canônica hospedada M3** — mesmo produto \`main\`, Supabase Demo exclusivo, identidade, dados isolados, classificação/preservação, restore, migration, cutover autorizado, doctor e jornada hospedada. Pode progredir **em paralelo** a P1-A somente com owner e recursos separados; jamais alegar que P1-A ou a visita pública substituem M3.
5. **P2-A: piloto comercial controlado** — somente com ambiente efetivamente apto, revisão jurídica, segurança, compliance, custódia/recovery, escopo de dados e autorizações aplicáveis. Avaliar ativação bilateral, recorrência, resultados e willingness to pay; não disponibilizar dados reais antecipadamente.
6. **P2-B: integração priorizada por evidência** — começar por importação verificada de CSV/XLSX/PDF, quando juridicamente e tecnicamente admissível; avançar para ERP/TMS, extratos/fees, APIs bancárias e assinatura sob source of truth e contratos comuns. Integração real e qualidade da fonte precedem geração de inteligência; não alegar conectores que ainda não operam.
7. **P3: novos financial product packs, benchmarking agregado e rede** — FX, garantias, cash management e network effects exigem core, validação de cliente, dados elegíveis e nova revisão legal/produto. Nenhuma expansão orientada apenas a efeito de demonstração.

Os rótulos acima descrevem **decisões e propostas de produto**, não promoções automáticas M1→M6. Em conflito temporal, §37 prevalece até os dois P0 serem verificados ou declarados BLOCKED honestamente. Incidente de segurança crítico tem precedência sempre.

## 38.4 Escopo funcional buyer e regras de comparação

A jornada buyer DEVE permitir **primeiro valor sem proposta bancária** (cadastrar instituição, contrato existente, facilidade, tarifa ou vencimento) e mostrar ação próxima, responsável, prazo e fonte. Intake progressivo pergunta primeiro objetivo, tipo de produto e dados estritamente necessários, reaproveitando Passport e informações existentes; não bloquear o primeiro uso por campos enterprise irrelevantes.

RFQ DEVE usar schema tipado por crédito/adquirência, perguntas e documentos associados, convite rastreado, versões imutáveis de propostas submetidas e decisões com snapshot. Crédito: principal, prazo, indexador, spread, amortização, CET **somente informado**, carência, garantias/covenants/tarifas quando aplicáveis. Adquirência: MDR por modalidade, PIX, mix, prazo de liquidação, antecipação, custos e suas premissas. Estimativas só com fórmula, cobertura, unidade, fonte e premissas completas (§§9–11); nunca fabricar CET, taxa de mercado ou cenário pós-fixado.

Comparação preserva neutralidade, pesos **definidos pelo cliente** e cobertura de dados; comparações incompletas NÃO geram vencedor tácito. Explicar diferenças e não apenas ordenar taxas: garantias, riscos contratuais, prazo, serviço e implantação podem importar. Contratos originados de decisões e contratos importados coexistem sem criar objetos duplicados; revisões e renegociação preservam histórico. Fee/Spend/Value são ledgers distintos: diferença detectada ≠ erro confirmado ≠ economia realizada.

## 38.5 Portal da instituição como workspace real

O portal do provedor DEVE evoluir além do formulário de resposta e cobrir, de maneira progressiva e proporcional ao piloto: inbox de oportunidades com prazo e estado; aceite/recusa; documentos e perguntas autorizados; rascunho e revisão da própria proposta; autoria/colaboração interna autorizada; estado/resultado compartilhável; histórico da própria organização; notificações opt-in e follow-ups verificáveis. Modelos reutilizáveis de dados públicos/institucionais são aceitáveis quando não expõem outras RFQs.

Em nenhum momento a instituição recebe notas internas, critérios reservados, concorrentes, propostas alheias ou dados extraídos do Passport inteiro por inferência. Compartilhamento de motivo de decisão é controle explícito do comprador. **Não construir CRM bancário integral**: prever exportações e integrações futuras com CRM do provedor. Medir aceitação, resposta, tempo de elaboração, conclusão e participação recorrente sem acesso cruzado.

## 38.6 Integração, documentação e redução de trabalho manual

O Arandu DEVE permitir participação de instituições que respondem por e-mail/documento, mediante importação estruturada de proposta por usuário autorizado, identificação de emissor, data, origem, documento/hash, campo, unidade, moeda, revisão e confirmação humana. Importação manual validada é distinta de envio do provedor; exibir isso claramente no histórico. PDF/XLSX/ZIP hostis e arquivos externos preservam hardening, limites e scanning existente; IA de extração não pode persistir fatos não revisados.

Integrar somente quando existir fonte legalmente autorizada, contrato de esquema, sincronização idempotente, reconciliação e degraded mode. Open Finance não garante acesso a dados bancários por mera existência de API; source of truth e consentimento/legitimidade exigidos. Não importar dado externo como "atual" sem marca de frescor. Integração é priorizada pela evidência de horas manuais poupadas, cobertura e confiabilidade, não por número de conectores.

## 38.7 Contrato de performance e capacidade — metas, não claims

O produto DEVE **instrumentar e medir** orçamento técnico com distinção clara entre padrão externo, alvo proposto, baseline observada e SLA contratual aprovado. **Core Web Vitals (Google, referência externa)**: LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 no p75 de visitas reais, segmentado por mobile/desktop. Sem tráfego suficiente, executar laboratório e declarar limitação de representatividade.

**Alvos iniciais de engenharia, NÃO SLAs atuais**: API de leitura comum p95 ≤ 500 ms; escrita comum p95 ≤ 1 s; comparação de dez propostas com campos representativos p95 ≤ 2 s; erros de servidor elegíveis < 0,5%; objetivo de disponibilidade pós-operação 99,9% **apenas como hipótese**, sujeito a infraestrutura/monitoramento/custo e aprovação de compromisso. Fixar carga, endpoint, percentis, warm/cold, região, dados e concorrência no protocolo; nunca divulgar números derivados de mocks, CI efêmera ou ambiente local como desempenho de produção.

Ensaios progressivos mínimos sugeridos: 10 organizações/30 usuários simultâneos, 50 organizações/100 usuários simultâneos, 10 mil contratos e 100 mil observações sintéticas, múltiplos provedores submetendo a mesma RFQ, atualização concorrente de decisão e falhas parciais de API/DB/Storage/e-mail. Esses números são **perfis propostos de teste**, não promessa de escalabilidade demonstrada. Paginação, índices, limites explícitos, tarefas assíncronas e uso cauteloso de cache devem ser preferidos a aumentar cegamente recursos ou budgets.

Manter \`check:build-size\` e o envelope saudável de bundle (§24 e \`docs/FINANCIAL_BUNDLE_HEADROOM.md\`); a demo próxima ao teto NÃO autoriza aumentar limite, pular testes, copiar motor do sandbox ou remover verificações. Modularizar/lazy-load por rota antes de novas telas pesadas. Medir HTML/JS/CSS/rotas/deep links também no **domínio realmente publicado**.

## 38.8 Integridade, autorização e operação são condições de aceite

Nenhuma entrega de performance, integração ou experiência pode afrouxar: RBAC/RLS e entidade legal, isolamento buyer/provider, SoD, token/session/revocation, limites de documents/storage, idempotência e concorrência de decisões, trilha imutável de evidências, validação de dados externos, LGPD e fail closed. Confirmar escrita apenas depois de persistência; operações repetidas não geram contrato/proposta/decisão duplicada. Cenário de falha parcial deve expor estado honesto e permitir recuperação, sem reprocessamento perigoso.

Release de cliente exige observabilidade com correlação e logs sem PII/valores de propostas, alertas significativos, versionamento reversível, backup e **restore validado** incluindo Auth/Storage/config necessários, runbooks, legal review, suporte definido e resultados M3/M4/M5 correspondentes. OWASP ASVS e WCAG 2.2 AA são referências para verificação proporcional ao produto; citar conformidade/certificação somente após auditoria apropriada.

## 38.9 Validação de mercado obrigatória: comprador e instituição

Testes automatizados validam comportamento, não Product-Market Fit. Antes de ampliar escopo, registrar sessões com pessoas reais de ambos os lados, sem inserir PII no repositório, conforme §35.13. **Hipóteses iniciais**, a revisar após entrevistas: cadastrar contrato e identificar próxima ação em até 10 min; RFQ simples em até 10 min com dados disponíveis; resposta do provedor em até 15 min com proposta preparada; identificar prazo/responsável sem assistência. Medir conclusão, abandono, erros, tempo e recorrência por papel. Esses tempos não são estatísticas de concorrentes nem claims comerciais.

Indicadores de resultado: tempo para primeira ação útil; RFQs criadas/concluídas; taxa de instituições convidadas que respondem; tempo de resposta; propostas completas; dias até decisão; contratos/vencimentos com responsável; fee differences analisadas e resolvidas; economia **negociada separada de realizada** com evidência; retorno de comprador/provedor; intenção de renovação e disposição para pagar. Proibir registro de conteúdo sensível e dados financeiros em telemetria externa sem base jurídica e contrato.

## 38.10 Gate de decisão build / integrate / defer

Toda nova iniciativa ou nova capability relevante DEVE declarar: problema e persona; evidência de pesquisa vs hipótese; categoria e referência competitiva datada; contribuição para buyer/provider; job-to-be-done; capacidade já existente (e estado M); build/integrate/defer com justificativa; dados e permissões; fonte e proveniência; custo e performance; riscos e gates operacionais; teste e métrica de sucesso. Rejeitar trabalho orientado apenas a aparência, métricas sem fonte, features sem dono operacional ou sem caminho de adoção.

**Critérios mínimos por iniciativa:** (1) funcional — fluxo completo buyer/provider com testes negativos; (2) qualidade — latência, acessibilidade, mobile, erro e bundle medidos; (3) operação — prova do ambiente correto; (4) mercado — hipótese testada com papel real antes de alegar adoção. Uma etapa pode ser M2 e continuar **hipótese comercial não validada**.

## 38.11 Entregáveis e ownership sem conflito

Atualizar \`docs/IMPLEMENTATION_MATRIX.md\` separando PRIORIDADE, IMPLEMENTAÇÃO, EVIDÊNCIA e ADOÇÃO. Preservar históricos e IDs D33; não reescrever estados legados retroativamente. O plano operacional v3.6 contém backlog por dependência e aceitação.

**Claude Code**, por padrão: experiência buyer/provider, site/visita, primeiro valor, cópia e jornadas, QA visual e teste de compreensão. **Codex**, por padrão: deployment/distribuição/identidade da versão, testes externos, instrumentação, orçamento de performance, ensaios de carga, integridade e desenho de contratos para integração. Fronteiras são exemplos, não autorização de mutações: definir ownership explícito antes de cada rodada, não editar os mesmos arquivos ou worktrees, não trocar secrets nem executar cutover/reset/export/migrations hospedados sem autorização. Commits em branches próprias, PRs pequenos o suficiente para revisar, quatro gates verdes no SHA exato, sem auto-merge cego. Compatibilidade com \`AGENTS.md\`, \`CLAUDE.md\` e §37 é obrigatória.

---


# 39. Tese obrigatória de produto segmentado e adoção bilateral (v3.7)

**Decisão estratégica do owner, 20/10/2026:** o Arandu é UMA plataforma B2B para gerir relações, contratações, condições e o ciclo de vida de produtos financeiros empresariais, apresentada em TRÊS ofertas configuráveis — Essencial, Gestão e Enterprise — e com uma experiência própria para instituições financeiras convidadas. Esta é decisão de direção de produto e arquitetura; **não** é lançamento dos planos, preço aprovado, evidência de adesão, certificação nem autorização de conectividade bancária. A aplicação das regras de target-state ocorre por dependência e maturidade, jamais por inferência de que tudo deve ser desenvolvido agora.

**Prevalência:** estes capítulos refinam §§2–4, 22, 27–30, 35 e 38 em temas de posicionamento, segmentação e descoberta. Não alteram §§3, 5, 23, 26, 36–37; preservam os P0 independentes de 29/10 (§37), M0–M6, a decisão humana, o modelo de tenant, recovery, legal review, os quatro gates e os ambientes. A antiga expressão "enterprise first" descreve o rigor de segurança e a direção arquitetural, **não proíbe empresas menores B2B**; para aquisição comercial inicial, Gestão é a hipótese preferida, a validar.

## 39.1 Promessa e jobs-to-be-done

A promessa de categoria é: **organizar e acompanhar relacionamentos, condições, negociações e contratos financeiros empresariais, com trabalho acionável, origem explícita e decisões humanas rastreáveis**. O Arandu não é ERP, TMS completo, banco, marketplace obrigatório ou motor de crédito. O usuário não compra "Financial Graph", "sistema operacional" ou quantidade de telas; compra menor retrabalho, controle de prazos, visibilidade de obrigações e melhor rastreabilidade das decisões — benefícios a comprovar.

Três mensagens comerciais por contexto, sem garantias presumidas:
- **Essencial:** conhecer o que a empresa contratou com bancos/adquirentes, suas condições e o próximo prazo ou ação;
- **Gestão:** coordenar instituições, demandas, propostas, contratos e renegociações em uma operação financeira;
- **Enterprise:** governar relações financeiras em múltiplas entidades, políticas, responsáveis e sistemas, com integração e evidências.

No onboarding o produto DEVE começar pelo job do usuário (registrar contrato, monitorar vencimento, revisar condição, organizar proposta ou iniciar demanda), não por uma visita a todos os módulos. O destino deve conter uma ação concreta e retorno verificável. Quando não há dados, exibir passo útil e opcional de importação/entrada manual; nenhum gráfico fictício.

## 39.2 Segmentação não equivale a faturamento

Porte econômico pode ser atributo descritivo; a escolha da oferta depende principalmente de complexidade: número de relações bancárias, CNPJs/entidades, produtos e contratos ativos, frequência de revisão/renegociação, tamanho da equipe, segregação de funções, sistemas existentes, exigência de auditoria e custo de implantação. Rótulos "pequena/média/grande" **não** são enquadramento legal nem limite rígido de acesso. O cliente pode ter necessidade Enterprise com faturamento menor. Enquadramentos do BNDES/Sebrae são referenciais datados, não regras de entitlement.

A segmentação comercial fica:
| Oferta-alvo | Trabalho principal | Entrada de valor | Experiência | Hipótese de compra |
| --- | --- | --- | --- | --- |
| **Arandu Essencial** | organização e controle de contratos, condições e próximos prazos | primeiro contrato ou relacionamento; um próximo passo visível | guiada, baixa densidade, termos claros, configuração mínima | assinatura de baixo atrito; ainda sem preço/WTP validados |
| **Arandu Gestão** | procurement e relacionamento recorrente com múltiplas instituições | contrato existente ou negociação organizada, depois acompanhamento | workspace completo, times, histórico, propostas e comparações | CFO/tesouraria; implantação limitada e ROI demonstrável a verificar |
| **Arandu Enterprise** | governança de ciclo financeiro de várias entidades e fontes | perímetro aprovado, entidades, políticas e caso piloto escolhido | gestão multi-entity, políticas, integração, auditoria e suporte | compra corporativa, segurança e implantação sob contrato |

**Não são três aplicações, bancos ou versões de regras financeiras.** DEVEM compartilhar identificação, entidades, instituições, contratos, RFQs, versões, comparação, decisões, Passport, Graph, trilha, schemas, APIs e infraestrutura. Diferenciação permitida: onboarding, presets de navegação e densidade, funcionalidades opcionais, cotas proporcionais, serviços e suporte, sempre com explicação, mudanças reversíveis e autorização testada no servidor. Não copiar o motor financeiro em três pacotes, criar fork/branch por cliente ou criar esquema de permissões diferente por preço.

## 39.3 Invariantes dos planos

RLS/RBAC, criptografia e isolamento, privacidade, acesso a dados próprios, histórico de alterações financeiras materiais, integridade, revogação, exportação aplicável, requisitos legais e resposta segura a falhas são **proteções básicas de todas as ofertas**. Nenhum tier pode reduzir segurança, rastreabilidade ou obrigações jurídicas. Políticas enterprise adicionais (SSO, alçadas customizadas, integrações e suporte) podem ter packaging próprio; permissões operacionais não se confundem com autorização de dados.

Feature flags/entitlements DEVEM ser server-authoritative, por organização e quando aplicável entidade/contrato; UI é projeção, nunca enforcement. Testar downgrade, trial expirado, upgrade, inadimplência/pausa, limites e race conditions com preservação de dados e acesso/export sob política. Exceder cota não apaga contrato, não impede recuperar evidência nem faz downgrade silencioso; fornecer saída e comunicação claras. Billing, preço, tributos, política de cancelamento e monetização são DECISÕES FUTURAS, sujeitos a avaliação comercial e jurídica.

## 39.4 Hipóteses concorrentes de porta de entrada

Há três candidatas, sem vencedor decretado: (A) carteira de contratos, prazos e relações; (B) renegociação de adquirência e tarifas; (C) sourcing de crédito. Para cada uma testar frequência, custo de trabalho atual, valor percebido, necessidade de dados, participação de terceiros, recorrência, risco jurídico, onboarding, tempo para primeiro valor e disposição de contratar. **Gestão** é primeira hipótese de público para pesquisa, não exclusão de Essencial/Enterprise. A decisão de foco comercial deve resultar de sessões e comparação de evidências, não de estética da demo.

## 39.5 Buyer-first e independência de rede

Uma empresa DEVE obter primeiro valor sem provedor cadastrado no portal, sem conta bancária conectada, sem API externa ou proposta enviada pelo banco. O registro de relacionamento, contrato existente, condição, obrigação, responsável e vencimento pode gerar trabalho útil. **Nenhuma RFQ pode exigir que todos os bancos aceitem criar conta** para a empresa concluir a gestão do seu processo. O Arandu deve tolerar resposta externa registrada por comprador autorizado, rotulada de forma distinta e com prova de origem. Adoção de ambas as pontas é objetivo progressivo, não pré-condição escondida.

---

# 40. Instituições financeiras: utilidade própria, cooperação e neutralidade (v3.7)

## 40.1 Produto institucional com custo de participação explícito

A instituição é contraparte convidada e usuária de uma experiência própria, não inventário comercial revendido. Sua proposta de valor inicial é receber uma demanda compreensível, prazo e requisitos, recusar sem atrito, responder por canal seguro e preservar o contexto **da própria atuação**. Sem prova de recorrência, não chamar o portal de CRM bancário ou rede de oportunidades qualificadas. Instituição não é obrigada a aderir, pagar, instalar app, conectar sistemas ou aceitar analytics de outras organizações.

Por oportunidade, medir tempo de compreensão, aceite/recusa, trabalho para responder, pedidos de esclarecimento, desistências, canal escolhido, necessidade de reentrada, resposta até prazo e intenção de reutilização. Custos adicionais de autenticação, portal, preenchimento e suporte entram na conta. **Adoção só gera valor se reduzir atrito líquido para os dois lados**.

## 40.2 Escada de adesão, sem coerção

1. **Participação leve:** convite vinculado à identidade e escopo, página legível, aceitar/recusar, documentação autorizada, possibilidade de resposta por canal externo; nenhum cadastro institucional completo como exigência universal.
2. **Workspace opcional:** oportunidades próprias, autoria, rascunhos, modelos e versões, perguntas autorizadas, colaboração interna, pendências/estado, avisos opt-in e histórico da própria organização. Controle estrito de papéis e vínculo com convite.
3. **Integração após prova:** exportação e contratos de dados para CRM/ERP/tesouraria da instituição; APIs sob consentimento/contratos, scopes, auditoria, idempotência e volume medido; não replicar seu core de crédito ou CRM.

Não implementar automaticamente links anônimos de edição; a experiência de "sem conta" pode ser registro externo realizado pelo comprador ou convite seguro com autenticação proporcional, nunca bypass de identidade.

## 40.3 Incentivos bilaterais e resposta fora do portal

Reuso de dados de instituição deve distinguir informação institucional publicável e preço/proposta **específico de um comprador**; dados negociais não transitam entre buyers. Resposta registrada fora do portal DEVE preservar: emissor alegado, canal, data de recebimento, documento e versão/hash disponíveis, ator registrador, campos transcritos/extraídos, unidade/moeda/prazo, revisão humana, estado de confirmação e eventuais divergências. Exibir **"registrada pela empresa a partir de resposta externa"**, jamais **"enviada pelo banco"** sem evidência de envio autenticado. Evitar duplicação ao vincular documentos, contratos, propostas e eventos; permitir reconciliação e correção auditável sem reescrever versão submetida.

Instituição pode não querer revelar precificação padronizada ou razões de recusa. O desenho DEVE permitir "não informado", "não aplicável", justificativa autorizada, anexos e contato, sem inventar nota negativa ou taxa. Comparação exibe cobertura e diferenças, não vencedor automático. Cada banco recebe apenas suas oportunidades e seus próprios arquivos/estados; nunca vê preços de concorrentes, notas internas, orçamento reservado, Passport integral, analytics cruzados ou decisão sem compartilhamento granular explícito do comprador.

## 40.4 Governança comercial e conflitos

**Hipótese inicial de monetização:** comprador paga pelo software; participação básica da instituição, sobretudo em pilotos, sem tarifa. A proposta não é licença comercial prometida. Monetização da instituição por serviços internos, integrações ou recursos opcionais exige evidência de utilidade, consentimento, parecer jurídico e separação de interesse.

São VEDADOS, até revisão formal e autorização, leilão de posição, lead vendido sem autorização, resultado patrocinado, favorecimento de quem paga, inferência de "banco ideal" ou cessão de dados/propostas entre concorrentes. Qualquer receita vinculada a transação, contratação ou lead exige revisão de enquadramento regulatório, conflitos de interesse, transparência e critérios neutros. O comprador define pesos; a instituição não conhece critérios internos não compartilhados.

## 40.5 Relacionamento pós-negociação

Não limitar a instituição à RFQ. Explorar somente com permissão e benefício validado: esclarecimentos de implantação, troca de responsável, calendário de renovação compartilhado, estado de pendências atribuídas ao provedor, evidência de condição acordada e confirmação bilateral de fatos quando exigida. **Confirmação do banco não equivale a verdade geral**: preservar escopo, autor, data, versão e eventual divergência com o contrato. Nenhuma atualização do provedor substitui unilateralmente a decisão do comprador.

---

# 41. Núcleo funcional transversal e expansão disciplinada (v3.7)

## 41.1 Um único ciclo de vida, independentemente da modalidade

**Relacionamento → produtos/contratos existentes → condições e evidências → obrigações/prazos → necessidade/renegociação → solicitação → resposta externa ou provedor → comparação → aprovação e decisão humanas → contrato/implantação → acompanhamento e renovação → memória institucional.**

Trabalho pode começar em qualquer ponto legítimo. Uma empresa nova NÃO precisa fazer RFQ para registrar um contrato; um contrato importado NÃO exige decisão fabricada; uma proposta externa NÃO implica conta de provedor; aditivo e renovação NÃO podem sobrescrever silenciosamente termos anteriores. A fonte canônica dos objetos e a timeline devem preservar essas relações sem duplicar tabelas por tier ou por pack.

## 41.2 Central de Relacionamentos Financeiros como principal superfície integradora

Desenho alvo: visão por instituição **e** por entidade legal, conectando contatos, produtos contratados, contas bancárias **quando autorizadas** (inventário e metadados, nunca credenciais ou execução de pagamentos), facilities/limites, propostas e revisões, contratos/aditivos, tarifas, obrigações/covenants, pendências, disputas e decisões. Possuir navegação contextual de "o que preciso fazer", sem replicar todos os dados em um novo armazenamento. Registrar fonte/vintage e diferenciar desconhecido, não aplicável, vencido, divergente, em revisão e confirmado.

A Central É uma composição de capacidades existentes do Graph, portfólio, relacionamento, contratos, tarefas e sourcing; NÃO autoriza criar CRM genérico, TMS, contabilidade, ledger de dinheiro, bank account mandates, assinatura jurídica ou data lake. Contas e signatários, se um dia entrarem, exigem classificação sensível, acesso mínimo por papel/entidade, ocultação de identificadores, autorização para export, temporalidade e revisão jurídica. Referência ao banco NÃO equivale a conexão bancária ativa.

## 41.3 Matriz de capacidade por complexidade e comportamento

- **Essencial:** primeiro relacionamento/contrato em poucos passos, próximos prazos, termos claros, ofertas comparáveis em modo guiado, documentos e export; ações de alto risco sempre confirmadas e auditadas.
- **Gestão:** múltiplas instituições, RFQs de crédito/adquirência, versões/convites, responsáveis, processos de aprovação, documentação e análise factual, renovações e diferença tarifária com evidência.
- **Enterprise:** entidades/grupos, papéis/alçadas, políticas e auditoria ampliadas, SSO/SCIM quando maduro, integrações, governança de dados/consentimento, revisão de grandes portfólios e suporte de implantação.

Essa matriz define **intenção de packaging**, não presença/funcionamento da feature. Um recurso só entra no plano quando seu nível M, autorização, UX, documentação, limites de carga, suporte e preço forem comprovados. Não promover capacidade por aparecer em captura ou no roadmap. UX simplificada não pode suprimir termos críticos; UX Enterprise não precisa exibir todos os comandos simultaneamente.

## 41.4 Ordem de expansão por valor líquido

**Preferir aprofundar:** contratos/condições existentes, relacionamento por instituição, propostas externas com origem, dossiê por finalidade, tarefas/prazos, renegociação, portal de baixa fricção e fee variance sustentada por fonte. **Integrar após evidência:** CSV/XLSX/PDF seguros, ERP, TMS, conectividade bancária via provedores autorizados e CRMs institucionais, com contrato versionado e reconciliação. **Adiar:** mais product packs (FX, seguro, garantia, leasing), benchmarking de rede, AI autônoma, extrato transacional massivo ou execução financeira sem uso demonstrado. **Evitar como core:** ERP/contabilidade genérica, conciliação bancária universal, pagamentos/PIX, underwriting, core banking, marketplace de recomendação, licenciamento de dados confidenciais.

Para cada novo módulo perguntar: reduz esforço líquido de tarefa frequente? Aumenta qualidade de uma decisão verificável? Fecha lacuna no ciclo real? Cria manutenção, telas ou consentimentos desproporcionais? Se não houver ganho demonstrável, registrar DEFER.

## 41.5 Passport/dossiê sem falsa certificação

Passport é reuso contextual autorizado, não cadastro universal, score ou documento certificador. Separar dimensões independentes: dado declarado; documento associado e versão conhecida; revisão interna; confirmação de atualidade; validação por fonte específica; aceite por instituição em contexto e data. Nunca inferir uma dimensão de outra. Dossiê por finalidade e destinatário deve ter manifestação explícita de compartilhamento, minimização por campo/documento/entidade, vínculo de versão e escopo, trilha de destinatário, revogação quando tecnicamente possível e distinção entre revogação de acesso futuro e cópia já recebida. A instituição conserva sua diligência própria. Não introduzir saída externa de documentos sensíveis para IA sem gates do §15.

---

# 42. Qualidade de produto: diferenças entre uma boa e uma má plataforma (v3.7)

## 42.1 Orientação, carga cognitiva e conteúdo

Em qualquer tela, o usuário DEVE conseguir identificar: (a) onde está/qual entidade; (b) o que sabe e não sabe; (c) o que precisa fazer e por quê; (d) quem é responsável; (e) qual prazo e consequência; (f) se sua ação foi realmente salva. Primária contextual única por região, secundárias discretas, avançadas sob demanda; nunca sacrificar descoberta de ações críticas para obedecer literalmente à regra de um botão. Tarefas são ordenadas por urgência/escopo verificáveis, jamais por patrocinador ou rótulos inventados. Empty, loading, partial, offline e denied states são experiências deliberadas, não becos sem saída.

Não exigir cadastro de tudo antes da primeira tarefa. Campo obrigatório deve ter justificativa e validação próxima; máscaras de moeda, porcentagem, prazo, datas e fusos devem preservar valor sem arredondamento silencioso; mostrar unidade, moeda, indexador, periodicidade, regime, fonte e intervalo de validade no contexto de decisão. Regras de elegibilidade e termos contratuais não devem ficar ocultos por padrão em comparação financeira.

## 42.2 Jornadas e microinterações

Cada fluxo material (contrato importado, RFQ, convite, proposta interna/externa, decisão, aprovação, renovação, confirmação de evidência) DEVE ter: entrada, pré-requisitos, rascunho, validação, revisão humana, confirmação da escrita, estado posterior, erro recuperável, interrupção/reentrada, permissão negada e trilha/versão. Ações irreversíveis exigem resumo de consequências e confirmação proporcional; retry idempotente nunca produz duplicidade ou promessa de sucesso antes de persistir. Erros explicam **o que ocorreu e próximo passo**, sem revelar arquitetura interna ou dados de outra organização.

Mudança de papel/entidade deve conservar orientação, revalidar autorização e impedir cache de dados cruzado; não reutilizar contexto privado ao alternar tenant. Deep links devem sobreviver a refresh quando autorizado, e expiração de sessão deve oferecer recuperação segura sem perder rascunho autorizado. Teclado, leitor de tela, zoom, touch targets, motion reduzido, estados de foco, tabelas móveis e WCAG 2.2 AA são referências verificáveis, sem claim de conformidade não auditada.

## 42.3 Linguagem, evidência e integridade financeira

Diferenciar em todas as superfícies: **informado**, **extraído**, **revisado**, **confirmado como atual**, **validado por fonte externa**, **aceito pela instituição**, **derivado**, **estimado**, **não informado** e **não comparável**. Valores ausentes nunca equivalem a zero; datas de extração nunca equivalem automaticamente ao período econômico. Medidas de savings: negociado, observado e realizado são diferentes e não se agregam sem comparabilidade, metodologia e fonte. Uma divergência tarifária não é cobrança indevida confirmada; taxa menor isolada não prova melhor oferta.

Usar linguagem humana e adaptada a Essencial/Gestão/Enterprise, com termos técnicos explicados quando necessário; não mostrar UUID, enum, query ou stack. Números financeiros exigem precisão e representação explícita, limites de arredondamento e datas coerentes com timezone do evento. Veda-se manipulação visual de rankings para favorecimento ou simulação de negócio real com fixtures sem rótulo.

## 42.4 Privacidade, segurança e confiança percebida

A interface deve comunicar permissões e compartilhamento antes da exposição de dados, com prévia de destinatários/campos, confirmação e histórico. URLs de convite, download e sessão não podem vazar por analytics, logs ou referer. Upload hostil, parser, anexos, integrações e IA são fronteiras de conteúdo não confiável. Identidade de membro e instituição não pode ser inferida de nome/branding; convite, organização e vínculo exigem regras de autenticação e autorização. Dados do banco concorrente não podem vazar por comparação, busca, Graph, logs, export, cache ou webhook.

Degradação de dados externos DEVE ser visível e não pode marcar informação obsoleta como atual. Exclusão/retenção/consentimento e revogação seguem §19 e parecer jurídico, sem prometer apagar cópias de terceiros. Recursos opcionais pagos não removem isolamento ou proteção mínima do cliente.

## 42.5 Desempenho e simplicidade operacional

Velocidade não é só benchmark: medir tarefas completas, erros, chamadas redundantes, latência p95, jornada no mobile, tempo de resposta de provedor e custo de alimentação. Lazy-load de seções secundárias sem esconder falha; paginação/limites com continuidade e totalling honesto; offline/read-only explícito em queda de backend; sinais de sucesso somente após gravação. Metas de §38.7 continuam ALVOS não SLAs.

Documentação/ajuda devem explicar objetivo, não implementar SOP interno do fornecedor. Alertas/notificações devem respeitar relevância, opt-in/quiet hours, dedup, unsubscribe quando aplicável e não incluir conteúdo confidencial no assunto ou push. Suporte, incidentes, export, retenção, acessibilidade, disponibilidade e cancelamento são parte da experiência — não apêndice de TI.

---

# 43. Evidência de mercado, monetização e seleção do foco (v3.7)

## 43.1 Mercado e ICP não são fatos validados

A pesquisa inicial deve incluir comprador econômico, operador diário, aprovador e contraparte institucional; identificar rotina, orçamento, decisão de compra, restrições e volume, sem PII no repositório. **Meta de descoberta**, não amostra representativa: cerca de 4 compradores por segmento (12) e 5–6 representantes de instituições, ajustada por saturação/variação do perfil. Registrar episódios reais anteriores e observar tarefas com fixtures; não considerar elogio, download, PR verde ou clique em demo como disposição real de pagar.

Para cada segmento, documentar: trigger de compra, alternativa (planilha/ERP/TMS/banco), tempo manual, custo de manutenção da informação, magnitude do risco, implantação, segurança/compra, frequência, orçamento e quem aprova. Medir quatro eixos distintos por capability: **código/teste**, **operação ambiente**, **usabilidade observada**, **valor/adoção comercial**. M0–M6 permanecem canon; o eixo comercial evita falso avanço por features.

## 43.2 Hipótese de preço e conflito de interesses

Estratégia inicial a testar: SaaS buyer-paid; Essencial com autosserviço e custo controlado, Gestão com implantação limitada e Enterprise com serviço/integrações contratados. Não fixar preço por "porte" sem custo de servir e disposição de pagar. Avaliar receita por organização, entidades, contratos, módulos, uso e serviço; não penalizar práticas seguras nem cobrar pelo direito do cliente de recuperar seus dados. Não anunciar planos/pacotes como vendidos ou operacionais até suporte, billing, direito de uso e contratos aprovados.

Portal básico gratuito para instituição é **hipótese de aquisição**, não subsídio perpétuo prometido. Serviços institucionais opcionais podem ser avaliados sem comprometer ranking, exposição, confidencialidade e neutralidade. Decisão de receita vinculada a leads/transações requer parecer jurídico humano.

## 43.3 Custo operacional líquido e comportamento

Para cada fluxo medir pelo menos: tempo para primeira ação útil, conclusão sem assistência, erros, reentrada, documentos/campos recolhidos, proporção de trabalho repetido, frequência/retorno, esforço de implantação, tempo do provedor e trabalho transferido de uma ponta para a outra. Benefício líquido é **tempo/risco/trabalho comprovadamente reduzido menos coleta, revisão, manutenção e mudança de processo adicionadas**. Não alegar ROI, savings ou NPS sem baseline verificável.

Critérios de investigação: usuário pode entender próximo passo; consegue registrar contrato útil sem banco presente; instituição responde/recusa sem recriar seu CRM; ambos identificam fonte e validade dos dados; existe responsável operacional e uma próxima ação. Feedback negativo pode CANCELAR feature e alterar escopo. A pesquisa não precisa esperar M3 se usar fixtures consentidas; dados reais exigem todos os gates aplicáveis.

## 43.4 Decisão build/integrate/defer/remove

Uma proposta nova DEVE trazer: ICP/persona; episódio/problema observado; job; alternativa atual; evidence confidence; métricas de sucesso e base de comparação; dependência entre comprador e instituição; reuso de objetos; custo de implantação/suporte; segurança/privacidade/legal; autorização de dados e fonte; maturidade do requisito; concorrente/categoria e fonte datada; decisão de construir, integrar, simplificar, adiar ou remover; owner; experimento barato/reversível e condição de descarte.

Não usar volume de telas, linhas de código ou número de PRs como crescimento do produto. Avanço comercial decorre de conclusão, repetição, retenção e contratação. Não expandir packs por cobertura artificial e não reconstruir módulos existentes sem evidência de falha.

---

# 44. Governança de execução e fronteiras da atualização v3.7

## 44.1 Constituição versus planos e evidência

Esta guideline fixa invariantes; `docs/ARANDU_SEGMENTED_PRODUCT_OPERATING_MODEL_V37.md` detalha as modalidades, arquitetura de experiência, mapa de capabilities, jornadas, testes e decisões propostas, marcadas como hipóteses até validação; `docs/ARANDU_V37_EVIDENCE_AND_DECISION_GATES.md` registra rubricas, pesquisas, metas e protocolo para escolhas sem inventar resultados. A `docs/IMPLEMENTATION_MATRIX.md` mantém o estado de cada capability e prova no SHA/ambiente; documentos anteriores não devem ter status históricos reescritos retroativamente.

A nova visão É CORE estratégico, mas **não desloca as entregas P0-A/P0-B de 29/10**. Até a apresentação: apenas documentação, entrevistas seguras sem dados reais, correções de segurança e UX que comprovadamente fortaleçam os P0. Após os P0: validar o ICP e porta de entrada, aprofundar gestão de relacionamentos/propostas externas e adoção institucional; M3 corre em trilha isolada mediante recovery e cutover autorizado. Não fundir PR documental com migrations, deployments ou código de produção.

## 44.2 Responsabilidade e gates

Toda iniciativa v3.7 precisa de ID, hipótese/estado, segmento, buyer/provider, owner, reversibilidade, arquivos exclusivos, dependências, métrica, baseline, privacy review, CI/M-state, evidência de usabilidade e próximo gate. Claude Code prioriza UX e superfícies; Codex prioriza domínio, contratos de dados, isolamento, testes, performance e hospedagem, com coordenação explícita de arquivos compartilhados. Nenhum agente deve interpretar este capítulo como ordem de implementação integral. Não tocar segredo, pagamento, corte de ambiente, migration hospedada, dados reais ou alteração de acesso remoto sem autorização específica.

Mudanças passam pelos quatro gates obrigatórios no HEAD exato; melhoria visual exige QA com capturas renderizadas e testes de compreensão; dado/integridade exige testes negativos, concorrência, RLS, backup/recovery proporcional. M3, M4, M5 e M6 NÃO são deduzidos da nova estratégia. A aprovação de uma PR só valida o escopo e evidências reais da própria PR.

## 44.3 Condições que justificam mudar a estratégia

Reavaliar foco de Gestão, modelo buyer-paid ou três ofertas se entrevistas revelarem: baixa recorrência, custo de alimentação superior ao benefício, adesão bancária inviável, dificuldade de aquisição, exigência de integração não viável, ausência de willingness-to-pay, evidência de preferência por produto mais estreito ou concentração inesperada de valor em Essencial/Enterprise. Mudança estratégica significativa exige registro de decisão e comparação de hipóteses, sem seguir a visão atual por inércia.

---

# Apêndice A — Capability Map

| Domínio | Papel |
| --- | --- |
| Enterprise Core | identity, tenancy, policy, collaboration, governance |
| Financial Graph | contexto financeiro com provenance |
| Procurement Core | intake, sourcing, proposal, comparison, decision |
| Provider RM | memória e relacionamento institucional |
| Provider Qualification | habilitação e evidências |
| Contract & Renewal | lifecycle contratual |
| Post-Award Implementation | implantação e go-live |
| Debt/Facilities/Limits | contexto de dívida/capacidade |
| Fees/Spend | custos observados e contratados |
| Savings | valor negociado/realizado |
| Opportunity Engine | fatos acionáveis sob regras |
| Document Intelligence | extração/diff com provenance |
| AI Analyst | assistência factual autorizada |
| Integration Platform | adapters e sync confiável |
| Search/Audit/Governance | retrieval, evidence e compliance |
| Product Packs | extensões de domínio sobre o core |
| Network | discovery e intelligence agregada |

---

# Apêndice B — Build vs Integrate vs Avoid

| Construir | Integrar | Não construir como core |
| --- | --- | --- |
| Financial Graph | ERP | contabilidade |
| financial sourcing | TMS | ledger |
| provider RM | bancos | pagamentos |
| provider qualification workflow | KYC/KYB/sanctions providers | sanctions engine próprio |
| contract lifecycle | assinatura | custódia |
| post-award workflow | implementation APIs externas | core banking |
| fee intelligence | Open Finance | underwriting |
| debt/limit view | market data / execution venues (ex.: Bloomberg, 360T, venues bancários) | concessão de crédito |
| Opportunity Engine | e-mail/Teams | execução de hedge |
| savings | BI/DWH | gestão discricionária |
| policy/approval | IdP | ERP genérico |
| document intelligence orchestration | modelos/parsers externos aprovados | treinar modelo com dado de cliente por default |
| Integration Platform | provider APIs | TMS completo |
| benchmark interno | fontes externas autorizadas | benchmark inventado |
| network | legal/compliance tools | marketplace consumidor de melhor taxa |
| lifecycle orchestration | execution venues especializadas | terminal/OMS/EMS próprio como core |

---

# Apêndice C — Gate rápido antes de iniciar uma iniciativa

Responder:

- É B2B/enterprise?
- Resolve problema financeiro real?
- Aumenta recorrência ou lifecycle depth?
- A dependência está no maturity state necessário?
- Reutiliza o core?
- Cria dado estruturado útil?
- Possui source of truth?
- Mantém decisão humana?
- Possui provenance?
- Funciona em multi-entity?
- É autorizável por tenant/entity/role?
- Possui recovery story?
- Possui lifecycle pós-decisão?
- É integrável por contratos comuns?
- É testável e observável?
- Evita atividade regulada nova?
- Melhora retention, ROI ou willingness to pay?
- É melhor que aprofundar capability existente?

Se várias respostas forem "não", a iniciativa não deve entrar agora.

---

# Apêndice D — Referências canônicas

Esta guideline complementa documentos especializados como:

- `README.md`;
- `CLAUDE.md`;
- `CONTRIBUTING.md`;
- `docs/IMPLEMENTATION_MATRIX.md`;
- `docs/FINANCIAL_PRODUCT_BOUNDARIES.md`;
- `docs/FINANCIAL_PROCUREMENT_PRODUCT.md`;
- `docs/FINANCIAL_DATA_MODEL.md`;
- `docs/FINANCIAL_SECURITY_MODEL.md`;
- `docs/FINANCIAL_THREAT_MODEL.md`;
- `docs/FINANCIAL_AUTHORIZATION_MAP.md`;
- `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`;
- `docs/FINANCIAL_REPO_GOVERNANCE.md`;
- `docs/FINANCIAL_DATA_GOVERNANCE.md`;
- `docs/FINANCIAL_OPERATIONAL_RESILIENCE.md`;
- `docs/ARANDU_DESIGN_CONSTITUTION.md`;
- `docs/ARANDU_COMPETITIVE_LANDSCAPE.md`;
- `docs/FINANCIAL_COMPETITIVE_EXECUTION_PLAN_2026-10-20.md`;
- `docs/ARANDU_SEGMENTED_PRODUCT_OPERATING_MODEL_V37.md`;
- `docs/ARANDU_V37_EVIDENCE_AND_DECISION_GATES.md`;
- `docs/demo/README.md`;
- `docs/demo/RUNBOOK.md`;
- `docs/supabase-migrations.json`.

Em conflito técnico, o documento especializado rege a implementação concreta. Em conflito de direção de produto, esta guideline rege até revisão explícita e versionada.
