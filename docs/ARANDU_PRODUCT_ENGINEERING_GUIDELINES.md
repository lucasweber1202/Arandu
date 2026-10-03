# Arandu — Diretrizes Mestras de Produto, Engenharia e Evolução

**Versão 2.0 — 3 de outubro de 2026**  
**Baseline técnica de referência:** `pilot` @ `a7708025ed4d51d0fe9d9df746552bc10a776955`  
**Status:** documento normativo de direção futura  
**Escopo:** produto, arquitetura funcional, UX, engenharia, dados, segurança, IA, integrações, operação, enterprise readiness, roadmap e critérios de aceite

> **Propósito deste documento.** Esta é a referência estratégica principal para a evolução do Arandu. Ela governa pessoas e agentes de IA que alterem o produto. Documentos técnicos especializados continuam regendo detalhes concretos de implementação, mas nenhuma implementação futura deve contradizer esta direção sem decisão humana explícita, documentada e versionada.

> **Mudança principal da v2.0.** O Arandu deixa de ser definido apenas como um sistema de Financial Procurement e passa a ser definido como um **Financial Procurement & Vendor Management OS**: a camada de registro, ação e inteligência usada por empresas para administrar necessidades, provedores, produtos financeiros, concorrências, propostas, políticas, decisões, contratos, custos financeiros, obrigações, renovações e oportunidades de renegociação ao longo de todo o ciclo de relacionamento financeiro.

---

# 1. Como usar estas diretrizes

Estas diretrizes usam quatro níveis normativos:

- **DEVE**: requisito obrigatório. Uma mudança incompatível não deve ser mergeada.
- **NÃO DEVE**: proibição explícita. Exceção exige decisão humana, justificativa e atualização desta guideline.
- **DEVERIA**: padrão recomendado. Desvio exige motivo técnico ou de produto documentado.
- **PODE**: possibilidade legítima, sem prioridade automática.

A hierarquia de decisão é:

1. segurança, isolamento, privacidade, integridade dos dados e limites regulatórios;
2. decisão humana, proveniência e rastreabilidade;
3. coerência com a tese B2B e enterprise;
4. qualidade do workflow ponta a ponta;
5. utilidade recorrente e redução de trabalho manual;
6. qualidade dos dados estruturados e memória institucional;
7. interoperabilidade com o stack corporativo;
8. inteligência, automação e IA;
9. expansão de categorias e efeitos de rede.

Quando duas regras entrarem em tensão, a regra mais alta nessa hierarquia prevalece.

---

# 2. Tese central do produto

## 2.1 Posicionamento

O norte do produto é:

**Arandu Financial Procurement & Vendor Management OS**  
*Financial Sourcing, Relationship, Contract and Decision Infrastructure for Companies*

O Arandu deve ser a camada em que uma empresa responde continuamente:

- quais necessidades financeiras existem ou estão surgindo;
- quais provedores atendem cada necessidade;
- quais produtos e limites estão contratados;
- quais custos financeiros são pagos;
- quais contratos, obrigações, covenants e janelas de repricing existem;
- quais concorrências estão abertas;
- o que cada provedor ofereceu e em qual versão;
- onde propostas e contratos realmente diferem;
- quais políticas e aprovações se aplicam;
- qual decisão foi tomada, por quem e com qual justificativa;
- qual contrato resultou da decisão;
- qual valor negociado foi efetivamente realizado;
- quais relacionamentos estão concentrados;
- quais vencimentos, tarifas, limites ou eventos merecem uma nova concorrência;
- qual é a memória histórica da relação com cada instituição financeira.

## 2.2 O problema que o Arandu resolve

O trabalho financeiro corporativo é fragmentado entre:

- e-mail;
- planilhas;
- PDFs;
- portais de bancos e provedores;
- ERP;
- TMS;
- sistemas de procurement genérico;
- contratos;
- arquivos locais;
- conversas em Teams/Slack/WhatsApp;
- conhecimento informal de tesouraria e procurement.

O Arandu DEVE transformar esse trabalho em objetos, estados, workflows e histórico estruturado sem tentar substituir sistemas que possuem outras responsabilidades.

## 2.3 O espaço estratégico

O Arandu deve ocupar a interseção entre três mundos:

1. **procurement suites**, fortes em intake, sourcing, fornecedores, contratos e governança genérica;
2. **treasury management systems**, fortes em caixa, liquidez, dívida, bancos, risco, hedge e operação de tesouraria;
3. **instituições financeiras e provedores**, que originam propostas, contratos, preços e serviços.

O Arandu NÃO DEVE tentar reconstruir integralmente nenhum desses mundos. Deve funcionar como a **camada especializada de procurement, relacionamento, decisão e lifecycle de produtos e fornecedores financeiros**, conectada a eles.

## 2.4 System of record + system of action + system of intelligence

O Arandu deve ser simultaneamente:

- **system of record**: fatos, versões, documentos, contratos, decisões, políticas, relacionamentos e histórico;
- **system of action**: intake, tarefas, RFQs/RFPs, follow-ups, aprovações, renovações e workflows;
- **system of intelligence**: alertas, análises determinísticas, diferenças, custos, oportunidades e IA factual baseada em dados autorizados.

Nenhuma dessas três dimensões deve existir isoladamente.

---

# 3. O que o Arandu deve construir, integrar e evitar

## 3.1 Construir como core proprietário

O Arandu DEVE priorizar capacidades em que a especialização financeira e a memória institucional criem diferenciação:

- Financial Passport / Financial Graph;
- multi-entity financial model;
- financial intake;
- RFQ/RFP e strategic sourcing financeiro;
- propostas e versões;
- normalização e comparação;
- provider/bank relationship management;
- debt, facilities, limits e guarantees view;
- contract lifecycle financeiro;
- covenant/obligation monitoring;
- bank-fee intelligence;
- financial-spend analytics;
- opportunity engine;
- savings/value-realization ledger;
- políticas e aprovações;
- scenario builder e split award;
- performance de provedores;
- executive financial procurement portfolio;
- benchmarking interno e, futuramente, agregado;
- financial provider discovery network;
- Proposal Intelligence e AI Analyst factual.

## 3.2 Integrar, não reconstruir

O Arandu DEVE preferir integração quando outro sistema já é o source of truth ou executa uma atividade especializada:

- ERP e contabilidade;
- TMS;
- bancos;
- Open Finance;
- assinatura eletrônica;
- market data;
- data warehouse / BI;
- sistemas de identidade corporativa;
- e-mail, Teams e Slack;
- provedores de KYC/compliance/risco;
- APIs dos próprios provedores financeiros.

## 3.3 O que o Arandu NÃO DEVE se tornar

O Arandu NÃO DEVE virar:

- ERP contábil;
- ledger financeiro corporativo;
- sistema de contas a pagar;
- TMS completo;
- banco;
- fintech que movimenta dinheiro;
- motor de pagamentos;
- core banking;
- custodiante;
- corretora ou gestora;
- motor de underwriting;
- sistema de concessão de crédito;
- plataforma de execução de hedge;
- plataforma de investimento discricionário;
- sistema de reconciliação bancária completo;
- marketplace consumidor de “melhor taxa”;
- robô que escolhe banco ou instituição;
- coleção de features desconectadas.

---

# 4. Princípios não negociáveis de produto

## 4.1 B2B e enterprise first

O Arandu DEVE permanecer focado em empresas. O produto deve funcionar para empresas médias e escalar arquiteturalmente para grandes grupos e companhias globais.

Pessoa física NÃO DEVE ser prioridade enquanto não houver decisão estratégica extraordinária e explícita.

## 4.2 A decisão pertence à empresa

O Arandu pode estruturar, calcular, resumir, alertar, comparar, simular e explicar. Ele NÃO DEVE decidir em nome do cliente.

Pesos, critérios eliminatórios, políticas, alçadas, estratégia de alocação e decisão final pertencem à empresa.

## 4.3 Fato antes de opinião

O produto DEVE preferir fatos verificáveis e cálculos reproduzíveis.

Exemplos legítimos:

- taxa informada;
- spread;
- CET informado;
- prazo;
- limite;
- utilização;
- garantia;
- fee contratado;
- fee efetivamente observado;
- vencimento;
- janela de repricing;
- concentração factual;
- diferença entre versões;
- savings calculado por metodologia explícita.

Sem metodologia e decisão humana, NÃO usar linguagem como:

- melhor banco;
- melhor proposta;
- recomendado;
- vale a pena;
- risco baixo/alto sem modelo autorizado;
- economia estimada sem baseline e fórmula.

## 4.4 Proveniência sempre visível

Todo dado crítico ou número calculado deve permitir responder:

- origem;
- data/vintage;
- owner;
- nível de confirmação;
- insumos;
- fórmula;
- premissas;
- documento ou integração fonte;
- se é informado, importado, extraído, derivado ou estimado.

## 4.5 Completo antes de amplo

É preferível ter poucos Product Packs profundos sobre um core robusto do que dezenas de categorias rasas.

## 4.6 Workflow antes de dashboard

Dashboards devem emergir de trabalho real executado no produto. Uma nova visualização sem workflow, ação, source of truth ou consequência operacional possui prioridade baixa.

## 4.7 Recorrência como critério de produto

O Arandu deve deixar de ser usado somente quando alguém decide abrir uma RFQ. Contratos, fees, obrigações, limites, vencimentos, políticas, tarefas e oportunidades devem criar utilidade semanal ou diária.

## 4.8 Segurança e isolamento são features

RLS, RBAC, MFA, segregação de funções, auditabilidade, storage privado, fail-closed e separação de ambientes são características do produto.

## 4.9 Integração é parte do produto enterprise

Para clientes grandes, integração não é conveniência. É requisito de adoção. APIs, webhooks, identidade e conectores devem ser tratados como infraestrutura estratégica.

---

# 5. Limites regulatórios e funcionais permanentes

Salvo revisão jurídica explícita, o Arandu NÃO DEVE:

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
- recomendar instituição de forma autônoma ou individualizada;
- classificar instituição como “melhor” sem critérios definidos pela empresa;
- representar conformidade jurídica/regulatória como fato sem evidência e revisão adequada;
- gerar aconselhamento jurídico definitivo.

Novos Product Packs devem preservar a separação entre **software de procurement/decision support** e **atividade regulada**.

---

# 6. Personas e responsabilidades

## 6.1 Tesouraria / comprador financeiro

Deve estruturar necessidades, administrar relações bancárias, convidar instituições, negociar, comparar, acompanhar contratos, fees, limites, obrigações e renovações.

## 6.2 CFO / diretoria financeira

Deve governar decisões, exceções, concentração, vencimentos, políticas, savings, exposição de relacionamento, portfolio financeiro e oportunidades.

## 6.3 Controller / aprovador

Deve receber contexto suficiente para revisar aderência à política sem reconstruir manualmente o processo.

## 6.4 Analista financeiro

É persona central de recorrência. O produto deve reduzir planilhas, preenchimento repetitivo, follow-up manual, consolidação de propostas, conferência de contratos e busca por documentos.

## 6.5 Procurement corporativo

Deve colaborar na concorrência, fornecedores, política, documentação e negociação sem apagar o ownership financeiro da tesouraria.

## 6.6 Group Treasury

Em clientes multi-entity, deve conseguir visualizar e governar entidades, políticas globais, concentrações e processos consolidados sem quebrar isolamento local.

## 6.7 Administrador da organização

Responsável por usuários, grupos, entidades, policies, integrações, identidade, segurança, auditoria e configuração.

## 6.8 Provedor financeiro

Deve receber apenas oportunidades autorizadas, responder propostas, enviar versões, documentos e esclarecimentos e acompanhar processos próprios. Nunca vê concorrentes.

## 6.9 Finance Ops do Arandu

Deve operar a plataforma com mínimo acesso possível a conteúdo de clientes e separação explícita entre observabilidade e dados sensíveis.

---

# 7. Modelo mental e objetos canônicos

O Arandu deve ser orientado por **objetos, estados, relações e ações**, não por páginas.

Objetos canônicos devem incluir progressivamente:

- grupo econômico;
- organização;
- entidade legal;
- unidade;
- membro;
- grupo de acesso;
- provedor / contraparte;
- relacionamento financeiro;
- Financial Passport / Financial Graph;
- conta ou relacionamento bancário referencial;
- produto financeiro contratado;
- facility / limite;
- dívida / obrigação financeira;
- garantia;
- exposição declarada;
- necessidade;
- intake;
- RFI/RFP/RFQ/processo;
- lote;
- convite;
- revisão de demanda;
- questionário;
- proposta;
- versão da proposta;
- critério;
- comparação;
- cenário;
- allocation / split award;
- política;
- aprovação;
- decisão;
- contrato;
- aditivo;
- obrigação;
- covenant;
- marco contratual;
- fee schedule;
- charge/fee observado;
- renovação / repricing;
- opportunity;
- savings record;
- performance record;
- tarefa;
- comentário;
- documento;
- evento;
- notificação;
- integração;
- consentimento;
- audit event.

Todo objeto importante DEVE ter, conforme aplicável:

- ID estável;
- tenant e entidade proprietária;
- origem/autor;
- timestamps confiáveis;
- estado explícito;
- point-in-time ou histórico;
- autorização server-side;
- representação auditável;
- próxima ação quando houver trabalho pendente.

---

# 8. Arquitetura funcional de longo prazo

O produto deve evoluir por camadas reutilizáveis.

## 8.1 Camada A — Enterprise Core

- organizações, grupos e entidades legais;
- usuários, papéis e grupos;
- RLS/RBAC/MFA;
- SSO/SCIM;
- documentos;
- comentários/menções;
- tarefas;
- notificações;
- eventos e auditoria;
- policies e approvals;
- busca;
- saved views;
- templates;
- APIs/webhooks;
- integrações;
- preferências e acessibilidade.

## 8.2 Camada B — Procurement Core

- intake;
- RFI/RFP/RFQ;
- convites;
- questionnaires;
- lotes;
- propostas e versões;
- normalização;
- comparação;
- negociação;
- clarification rounds;
- BAFO;
- decisão;
- split award;
- contrato;
- renewal/repricing.

## 8.3 Camada C — Financial Graph

- Passport;
- entidades;
- bancos/provedores atuais;
- facilities e limites;
- dívidas;
- garantias;
- produtos financeiros;
- contratos;
- custos financeiros;
- recebíveis declarados;
- exposições;
- documentação reutilizável;
- owners, fontes e vintages.

## 8.4 Camada D — Financial Relationship & Portfolio

- provider/bank relationship management;
- contract lifecycle;
- performance;
- concentration;
- obligations/covenants;
- financial spend;
- bank fees;
- savings;
- opportunities;
- executive portfolio.

## 8.5 Camada E — Intelligence

- document/proposal ingestion;
- Proposal Intelligence;
- semantic diff;
- deterministic analytics;
- Opportunity Engine;
- AI Analyst;
- internal benchmarks;
- external benchmarks quando permitido.

## 8.6 Camada F — Product Packs

Cada categoria financeira deve ser uma extensão do mesmo core, contendo:

- schema de necessidade;
- schema de proposta;
- campos de comparação;
- documentos típicos;
- cálculos permitidos;
- regras de proveniência;
- lifecycle pós-decisão;
- regras de domínio;
- testes.

## 8.7 Camada G — Ecosystem & Network

- ERP/TMS/Open Finance;
- provider APIs;
- identity providers;
- BI/data warehouse;
- assinatura externa;
- provider discovery;
- network intelligence com privacy by design.

---

# 9. Fundação atual que deve ser preservada

A base existente é fundacional e NÃO DEVE ser substituída por implementações paralelas sem necessidade:

- organizações e membros;
- RFQs;
- convites;
- propostas versionadas;
- comparação factual;
- pesos definidos pelo cliente;
- aprovação sequencial;
- decisão com snapshot;
- contratos;
- renovação;
- tarefas;
- comentários;
- notificações;
- documentos privados;
- portal do provedor;
- RLS/RBAC/MFA;
- trilha de auditoria;
- outbox;
- CI e testes de banco/E2E;
- Financial Passport v2 com proveniência, frescor, histórico e snapshot de RFQ.

Nova funcionalidade DEVERIA estender esses objetos e workflows.

---

# 10. Financial Passport → Financial Graph

O Passport deve evoluir de perfil reutilizável para representação estruturada do contexto financeiro corporativo.

## 10.1 Capacidades alvo

Por entidade legal, suportar progressivamente:

- dados cadastrais;
- setor, porte e receita;
- indicadores declarados;
- perfil de recebimentos;
- bancos e provedores atuais;
- facilities e limites;
- utilização declarada/importada;
- dívida e vencimentos;
- garantias;
- produtos contratados;
- contratos;
- fee schedules;
- exposições declaradas;
- documentos reutilizáveis;
- responsáveis;
- políticas relevantes;
- fontes e vintages.

## 10.2 Regras permanentes

- dado crítico nunca deve ser inferido silenciosamente;
- manual, provider, integração, documento, IA confirmada e cálculo devem ser distinguíveis;
- cada campo relevante deve poder ter owner, fonte, verified_at e review_after;
- reutilização em RFQs deve ser seletiva;
- snapshots históricos devem ser imutáveis;
- provedores não devem ter acesso ao Graph fora do explicitamente compartilhado.

## 10.3 Objetivo de longo prazo

O Financial Graph deve permitir que o Arandu entenda **contexto suficiente para detectar trabalho financeiro**, não apenas preencher formulários.

---

# 11. Multi-entity / Group Management — requisito enterprise prioritário

Multi-entity deixa de ser uma melhoria tardia. É fundação para grandes clientes.

O modelo DEVE ser projetado antes de espalhar `entity_id` sem semântica coerente.

Capacidades alvo:

- grupo controlador;
- entidades legais;
- unidades;
- relações entre entidades;
- usuários com escopo por entidade;
- group treasury;
- políticas globais e locais;
- contratos por entidade;
- facilities por entidade;
- consolidação executiva;
- isolation modes;
- aprovações cruzadas;
- ownership local vs global;
- moeda base e moedas locais;
- auditoria do escopo em que a ação ocorreu.

Uma consulta consolidada NÃO DEVE permitir acesso a detalhe de entidade que o usuário não possa ler individualmente.

---

# 12. Provider & Bank Relationship Management

O Arandu deve construir memória institucional de cada provedor financeiro.

## 12.1 Perfil de relacionamento

Pode conter:

- categorias atendidas;
- contatos;
- entidades relacionadas;
- status cadastral;
- processos convidados;
- taxa de resposta factual;
- tempos de resposta;
- propostas e versões;
- contratos ativos;
- facilities/limites;
- garantias;
- fees;
- renovações;
- documentos;
- issues/follow-ups;
- performance records;
- histórico de relacionamento;
- scorecards definidos pelo cliente.

## 12.2 Relationship map

O produto DEVERIA permitir visualizar, por provedor e entidade:

- produtos contratados;
- volume/exposição declarada;
- limites aprovados e utilizados;
- contratos ativos;
- participação no wallet quando metodologicamente definida;
- dependências críticas;
- vencimentos e processos em curso.

## 12.3 Neutralidade

Qualquer score deve ser criado pela empresa ou derivado de critérios transparentes. O Arandu NÃO DEVE criar reputação subjetiva própria de instituições.

---

# 13. Debt, Credit Facilities, Limits & Guarantees

O Arandu deve manter uma visão de procurement e relacionamento sobre dívida e capacidade financeira sem se tornar ledger contábil.

## 13.1 Debt & Facilities Manager

Deve suportar progressivamente:

- principal contratado;
- saldo quando importado/declarado;
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
- contrato fonte;
- owner;
- status;
- origem/vintage.

## 13.2 Visões necessárias

- maturity wall;
- indexer mix;
- currency mix quando aplicável;
- provider concentration;
- facilities aprovadas;
- facilities utilizadas;
- disponibilidade;
- vencimentos por período;
- janelas de refinanciamento;
- garantias comprometidas.

## 13.3 Boundary

O Arandu pode importar ou registrar fatos. NÃO DEVE substituir o sistema contábil/TMS como source of truth quando estes existirem.

---

# 14. Contract & Renewal Center v2

Contratos financeiros devem se tornar objetos operacionais, não PDFs arquivados.

## 14.1 Estrutura alvo

Um contrato pode conter:

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
- obrigações;
- notice periods;
- renewal terms;
- auto-renewal;
- repricing windows;
- termination rights;
- documentos;
- aditivos;
- contrato pai/filho;
- processo de sourcing de origem;
- owner.

## 14.2 Lifecycle

Deve suportar:

- D-120/90/60/30 configurável;
- marcos próprios;
- obrigações recorrentes;
- repricing;
- renovação;
- renegociação;
- encerramento;
- geração de nova RFQ a partir do contrato anterior.

## 14.3 Imutabilidade e aditivos

Mudanças contratuais materiais NÃO DEVEM apagar o histórico. Aditivos devem preservar a relação temporal com versões anteriores.

---

# 15. Covenant & Obligation Monitor

O Arandu deve permitir registrar e acompanhar obrigações financeiras e operacionais contidas em contratos.

Cada item deveria conter:

- tipo;
- descrição;
- fórmula ou condição quando aplicável;
- limite/threshold;
- periodicidade;
- próxima data;
- owner;
- entidade;
- contrato fonte;
- evidência;
- status;
- confirmação humana.

O produto PODE futuramente comparar métricas importadas a thresholds, mas não deve declarar breach sem dados e regras confiáveis.

---

# 16. Financial Spend Analytics

O Arandu deve permitir entender o **custo de fornecedores e produtos financeiros**.

Categorias podem incluir:

- juros;
- spreads;
- tarifas bancárias;
- fees de cash management;
- MDR;
- antecipação;
- garantias/fianças;
- seguros;
- custos de FX/hedge quando metodologicamente comparáveis;
- fees contratuais;
- outros custos financeiros de fornecedor.

Dimensões:

- entidade;
- provedor;
- produto;
- contrato;
- período;
- centro/unidade quando importado;
- moeda.

Financial Spend Analytics deve servir de insumo para sourcing e oportunidades, não virar contabilidade paralela.

---

# 17. Bank Fee Intelligence

Bank-fee intelligence é um módulo prioritário porque conecta contrato, consumo, divergência, renegociação e savings.

## 17.1 Modelo mínimo

- serviço;
- unidade de cobrança;
- fee contratado;
- fee observado;
- volume;
- período;
- entidade;
- banco;
- contrato/fee schedule fonte;
- origem do observado;
- diferença calculada;
- status de revisão.

## 17.2 Casos de uso

O produto pode apontar factual e auditavelmente:

- cobrança acima do contrato;
- serviço contratado sem uso;
- aumento de fee;
- divergência entre entidades;
- contrato próximo de repricing;
- oportunidade de revisão.

## 17.3 Regra

Uma divergência observada não deve ser automaticamente classificada como erro do banco sem revisão e contexto contratual.

---

# 18. Opportunity Engine

O Opportunity Engine é uma das principais teses de diferenciação do Arandu.

O objetivo é transformar procurement financeiro de **reativo** em **contínuo**.

## 18.1 Fontes permitidas

O engine pode avaliar eventos e fatos provenientes de:

- contratos;
- renewals;
- repricing windows;
- debt/facilities;
- maturity schedule;
- limits;
- guarantees;
- bank fees;
- financial spend;
- performance;
- Passport/Graph;
- histórico da própria empresa;
- integrações autorizadas;
- tarefas e políticas.

## 18.2 Tipos de opportunity

- refinanciar;
- renovar;
- repricing;
- renegociar fee;
- revisar fornecedor;
- abrir concorrência;
- regularizar obrigação;
- diversificar relacionamento quando política do cliente exigir;
- revisar facility próxima de vencimento;
- contestar divergência factual;
- consolidar ou dividir processo quando configurado pelo cliente.

## 18.3 Regra central

Opportunity NÃO é recomendação. Deve explicar:

- fato observado;
- regra/gatilho;
- fonte;
- data;
- possível ação;
- quem deve revisar.

A abertura de RFQ/RFP ou qualquer ação material exige decisão humana ou automação explicitamente autorizada e reversível.

---

# 19. Savings & Value Realization Ledger

O Savings Ledger deve provar valor sem “savings de marketing”.

## 19.1 Tipos distintos

- **negotiated savings**;
- **realized savings**;
- **cost avoidance**;
- outros tipos somente com definição explícita.

Esses tipos NÃO DEVEM ser misturados silenciosamente.

## 19.2 Cada registro DEVE conter

- baseline;
- fonte do baseline;
- contrato/proposta de destino;
- fórmula;
- período;
- unidade/moeda;
- owner;
- entidade;
- data;
- estimado vs realizado;
- ajustes;
- justificativa;
- evidência;
- versão da metodologia.

## 19.3 Exemplos

- redução de MDR;
- redução de tarifa fixa;
- redução de spread quando economicamente comparável;
- redução de CET informado;
- fee evitado;
- ganho de repricing com metodologia explícita.

Métricas economicamente incomparáveis não devem ser somadas sem metodologia declarada.

---

# 20. Strategic Financial Sourcing

O procurement core deve evoluir além de RFQ simples para suportar empresas de maior porte.

## 20.1 Tipos de processo

- RFI;
- RFP;
- RFQ;
- sealed bid quando aplicável;
- clarification round;
- negotiation round;
- BAFO;
- renewal/repricing process.

## 20.2 Capacidades

- templates;
- questionnaires;
- documentos obrigatórios;
- deadlines;
- lotes;
- eligibility rules;
- critérios eliminatórios definidos pelo cliente;
- múltiplas rodadas;
- versão de demanda;
- Q&A;
- propostas versionadas;
- cenários;
- split award;
- decisão com snapshot;
- trilha completa.

## 20.3 Confidencialidade

Fornecedor nunca deve ver concorrente, preço concorrente, documentos concorrentes ou ranking privado do comprador.

---

# 21. Scenario Builder & Allocation

A plataforma deve permitir comparar **estruturas de decisão**, não apenas propostas individuais.

Exemplos:

- 100% com um provedor;
- 60/40 entre dois provedores;
- três bancos com limites distintos;
- lotes separados;
- solução A vs solução B para a mesma necessidade.

O cenário pode calcular fatos autorizados como custo, quantidade de provedores, alocação, cobertura, garantias e limites.

O Arandu NÃO DEVE escolher o cenário pela empresa.

---

# 22. Enterprise Intake

O intake deve permitir que o usuário expresse a necessidade antes de conhecer o produto financeiro ou o workflow exato.

Exemplo legítimo:

> “Preciso financiar R$ 80 milhões por 24 meses.”

O sistema pode estruturar campos, identificar dados faltantes, aplicar template e sugerir o tipo de processo.

O intake DEVE:

- preservar texto original;
- mostrar campos derivados;
- exigir confirmação para informação crítica;
- respeitar policies;
- encaminhar para owner adequado;
- suportar templates por entidade/categoria;
- evitar criação duplicada.

---

# 23. Proposal & Document Intelligence

Proposal Intelligence deve ser **extração e organização de fatos**, nunca autoridade decisória.

## 23.1 Capacidades permitidas

- ler documentos;
- extrair campos;
- sugerir mapeamento;
- localizar trecho fonte;
- detectar campos ausentes;
- identificar divergência entre documento e formulário;
- comparar versões;
- destacar mudanças materiais;
- detectar inconsistências numéricas;
- gerar perguntas de follow-up;
- identificar cláusulas para revisão humana;
- gerar resumo factual.

## 23.2 Proveniência de IA

Campo extraído por IA deveria armazenar:

- documento;
- página/localização;
- trecho ou referência;
- modelo/versão quando aplicável;
- confiança;
- status de confirmação;
- usuário confirmador;
- timestamp.

Campo crítico NÃO DEVE ser promovido silenciosamente a “informado pelo provedor”.

## 23.3 Semantic diff

O produto deveria responder de forma auditável:

- o que mudou;
- de qual versão para qual versão;
- campo anterior;
- campo novo;
- documento fonte;
- impacto factual, sem recomendação.

---

# 24. AI Financial Procurement Analyst

A IA deve operar como camada assistiva sobre dados, regras e permissões existentes.

## 24.1 Usos prioritários

- resumir processo;
- responder “o que precisa da minha atenção?”;
- explicar diferenças;
- montar briefing;
- transformar texto em intake/RFQ estruturado;
- preparar follow-ups;
- resumir contrato;
- explicar mudança de versão;
- organizar tarefas;
- gerar executive summary factual;
- responder perguntas sobre dados autorizados da organização;
- localizar contratos/processos/documentos;
- explicar cálculos e proveniência;
- preparar rascunhos de comunicação.

## 24.2 IA não é autoridade

A IA NÃO DEVE:

- aprovar;
- rejeitar;
- decidir;
- assinar;
- contratar;
- executar transação;
- recomendar instituição de forma autônoma;
- inventar benchmark;
- preencher dado crítico por suposição;
- contornar autorização;
- acessar outro tenant;
- compartilhar informação com provedor sem autorização.

## 24.3 Grounding e autorização

Toda resposta sobre dados corporativos deve respeitar o mesmo RBAC/RLS dos objetos de origem. RAG, embeddings ou índices NÃO PODEM virar caminho alternativo para leitura indevida.

---

# 25. Provider Performance & Service-Level Management

A contratação não encerra o lifecycle do provedor.

O produto deve permitir performance factual e scorecards configurados pela empresa.

Métricas possíveis:

- response rate;
- response time;
- implementation SLA;
- issue count;
- resolution time;
- contract obligations;
- service incidents importados;
- settlement/service metrics por categoria quando disponíveis;
- review completion;
- performance definida pelo cliente.

Nenhum score default do Arandu deve pretender medir “qualidade” universal de instituição.

---

# 26. Executive Financial Procurement Portfolio

A visão executiva deve ser consequência do sistema de registro.

Deve poder mostrar, com escopo adequado:

- pipeline de sourcing;
- valor/volume sob processos quando disponível;
- contratos monitorados;
- vencimentos;
- debt maturity;
- facilities;
- concentração de provedores;
- financial spend;
- fees;
- savings realizados;
- opportunities abertas;
- obrigações próximas;
- decisões pendentes;
- tempos de ciclo;
- gargalos;
- policy exceptions;
- coverage de propostas.

Toda métrica deve ter definição e source of truth claros.

---

# 27. Policy & Approval Engine v2

O engine deve evoluir para policies configuráveis, versionadas e aplicáveis por entidade/categoria.

Exemplos:

- aprovação por valor;
- aprovação por categoria;
- aprovação por exceção;
- exigência de N propostas ou justificativa;
- segregação de funções;
- critérios obrigatórios;
- alçada por entidade;
- group treasury approval;
- fornecedor novo exige etapa adicional;
- prazo, garantia ou covenant excepcional exige revisão;
- fallback/escalonamento;
- prazo de aprovação;
- policies globais vs locais.

A policy vigente no momento do processo deve ser preservada como snapshot. Atualização de policy NÃO DEVE mudar processo em andamento silenciosamente.

---

# 28. Provider Discovery Network

A rede de provedores é uma etapa posterior ao fortalecimento do lado comprador.

## 28.1 Princípio

O sistema pode identificar provedores potencialmente compatíveis por:

- produto;
- ticket;
- moeda;
- região;
- porte;
- perfil declarado;
- capacidade cadastrada;
- critérios objetivos.

A empresa escolhe quem recebe a oportunidade.

## 28.2 Privacy by design

Uma opportunity não deve expor identidade, dados financeiros ou documentos além do consentido pelo comprador.

## 28.3 Efeito de rede

A rede deve aumentar valor para compradores e provedores sem comprometer neutralidade ou transformar o produto em marketplace promocional.

---

# 29. Benchmarking e Network Intelligence

Benchmarking possui alto valor e alto risco de governança.

## 29.1 Ordem obrigatória

1. benchmark contra histórico próprio;
2. benchmark por entidade/grupo;
3. benchmarks externos agregados somente após gates de dados.

## 29.2 Benchmark interno

Exemplos:

- faixa histórica de spread;
- fees históricos;
- response rate;
- ciclo médio;
- número de propostas;
- dispersão das condições;
- performance histórica.

## 29.3 Benchmark externo

Nenhum benchmark externo deve ser exibido antes de existir:

- volume estatisticamente razoável;
- consentimento/base contratual adequada;
- política de anonimização;
- proteção contra reidentificação;
- segmentação coerente;
- tratamento de outliers;
- vintage;
- tamanho de amostra quando apropriado;
- revisão jurídica;
- governança de acesso.

---

# 30. Product Packs e expansão de categorias

A expansão deve usar o mesmo procurement core, Graph, Relationship model, Contract lifecycle e Policy Engine.

## 30.1 Core atual

- crédito empresarial;
- adquirência/meios de pagamento.

Esses packs devem ser aprofundados antes de expansão indiscriminada.

## 30.2 Próximas adjacências prioritárias

### FX / câmbio corporativo

Inicialmente como sourcing, comparação e governança. Sem execução.

### Garantias / fianças / seguro-garantia quando juridicamente adequado

Comparar instrumentos e provedores diferentes para a mesma necessidade.

### Cash management / transactional banking RFP

Pode abranger pricing e serviço de contas, pagamentos, cobrança, PIX, conectividade, APIs, implantação e SLAs, sem executar os fluxos monetários.

### Working capital & receivables sourcing

A necessidade pode anteceder o produto. O sistema pode comparar estruturas como capital de giro, antecipação, receivables finance, FIDC ou instrumentos equivalentes, sem recomendar.

### Acquiring Intelligence

Aprofundar MDR, antecipação, settlement, bandeira, parcelamento, volume, chargeback e fee efetivo, sempre com metodologia e fontes.

## 30.3 Categorias posteriores

- seguros corporativos selecionados;
- cartões corporativos/expense providers;
- cobrança e gateways;
- serviços de folha apenas como procurement;
- investimentos de caixa corporativo somente após revisão jurídica e boundary específico;
- derivativos e crédito estruturado apenas em estágio posterior.

## 30.4 Gate para novo pack

Nova categoria só entra quando houver:

- usuário/problema real;
- schema de necessidade;
- schema de proposta;
- comparação factual;
- lifecycle pós-decisão;
- documentos típicos;
- cálculos autorizados;
- limits regulatórios;
- testes de domínio;
- jornada E2E;
- integração com Graph/Provider/Contract/Policy;
- hipótese comercial.

---

# 31. Integrações, APIs e interoperabilidade — requisito enterprise

Integração deixa de ser horizonte tardio. É parte da fundação de enterprise readiness.

## 31.1 Public API e webhooks

O Arandu DEVE caminhar para uma API pública/versionada e webhooks idempotentes para objetos autorizados.

Requisitos:

- auth forte;
- scopes;
- rate limiting;
- idempotency keys quando aplicável;
- versionamento;
- retries seguros;
- assinatura de webhook;
- replay protection;
- audit trail;
- tenant isolation;
- documentação;
- deprecation policy.

## 31.2 Prioridades de integração

1. SSO/SCIM;
2. e-mail transacional;
3. API/webhooks;
4. ERP/TMS/accounting para contexto e cadastro;
5. Open Finance;
6. Teams/Slack para notificação/deep link;
7. provider APIs;
8. assinatura externa;
9. BI/data warehouse;
10. market/reference data quando necessário.

## 31.3 Source of truth

Toda integração deve declarar:

- quem é source of truth;
- direção do sync;
- frequência;
- idempotência;
- conflito;
- ownership;
- fallback;
- observabilidade;
- dados armazenados.

## 31.4 Ações externas

Notificação externa pode direcionar ao Arandu. Aprovar, decidir ou compartilhar informação sensível deveria ocorrer no contexto autenticado do produto salvo design explícito e seguro.

---

# 32. Open Finance

Open Finance pode funcionar como fonte autorizada para o Financial Graph, nunca como justificativa para o Arandu virar banco.

Usos legítimos futuros:

- preencher Passport/Graph;
- validar dados declarados;
- reduzir envio manual de documentos;
- contextualizar recebimentos e caixa;
- informar produtos/relacionamentos quando permitido;
- medir resultados pós-contrato;
- suportar oportunidades e cenários.

Toda importação deve registrar:

- consentimento;
- escopo;
- instituição origem;
- timestamp;
- validade;
- minimização;
- revogação quando aplicável.

---

# 33. Enterprise Identity, Administration & Security

Para empresas grandes, identidade e administração são critérios de compra.

Capacidades alvo:

- SAML/OIDC SSO;
- SCIM;
- JIT provisioning quando apropriado;
- grupos corporativos;
- delegated admin;
- role mapping;
- access reviews;
- MFA policies;
- session policies;
- IP/network restrictions quando necessário;
- fine-grained permissions;
- enterprise audit export;
- retention settings;
- security-event visibility.

Certificações e atestados de segurança NÃO DEVEM ser declarados antes de existirem de fato.

---

# 34. Audit & Compliance Center

A auditabilidade existente deve evoluir para superfície de produto.

O centro de auditoria deve permitir, conforme autorização:

- quem;
- fez o quê;
- em qual objeto;
- em nome de qual entidade;
- quando;
- origem;
- estado anterior/novo quando relevante;
- policy aplicada;
- request/correlation ID;
- filtros;
- export;
- retention;
- exception events;
- security events relevantes.

Logs operacionais e audit trail de negócio devem ser conceitualmente separados.

---

# 35. Enterprise Search & Knowledge Retrieval

Com histórico crescente, busca passa a ser feature central.

Busca deve cobrir, respeitando autorização:

- RFQs/RFPs;
- propostas;
- contratos;
- documentos;
- provedores;
- entities;
- comments;
- obligations;
- opportunities;
- policies;
- tasks.

A busca deve suportar filtros, entidades, datas, categoria, provider e estado.

Busca semântica/IA NÃO PODE contornar RLS/RBAC.

---

# 36. Dados, versionamento e proveniência

## 36.1 Imutabilidade lógica

Fatos históricos críticos não devem ser sobrescritos sem histórico:

- proposal versions;
- decisões;
- approvals;
- policy snapshots;
- contracts/aditivos;
- savings;
- obligations;
- fee observations;
- documentos relevantes;
- opportunities encerradas quando usadas em decisão.

## 36.2 Point-in-time

Decisões devem preservar a fotografia de:

- propostas elegíveis;
- versões;
- critérios;
- pesos;
- cenários;
- approvals;
- policy;
- justificativa;
- documentação relevante.

## 36.3 Tipos de origem

Campos estruturados devem caminhar para metadata consistente:

- manual;
- provider;
- import;
- integration;
- document;
- AI-confirmed;
- deterministic calculation.

## 36.4 Datas

Distinguir, quando relevante:

- effective_at;
- occurred_at;
- received_at;
- recorded_at;
- updated_at;
- observed_at;
- source_checked_at.

## 36.5 Idempotência

Imports, webhooks, jobs, seeds e syncs devem ser idempotentes sempre que possível.

---

# 37. Arquitetura de software

## 37.1 Uma base de código

Demo, pilot e production devem usar a mesma aplicação e domínio. Divergência vem de configuração, dados e infraestrutura, nunca de forks funcionais.

## 37.2 Modularidade por domínio

Novas features devem preferir módulos coesos, contratos claros e limites explícitos.

## 37.3 Regra crítica no servidor

Permissão, transição de estado, aprovação, decisão, cálculo crítico e acesso a documento devem ser validados server-side/banco.

## 37.4 Product Packs

Não duplicar RFQ/proposal/decision/contract por categoria. Product Packs devem ser schemas e regras sobre o core.

## 37.5 Graph e analytics

Não usar o Graph como justificativa para copiar indiscriminadamente dados de sistemas externos. Guardar o mínimo necessário com source of truth explícito.

## 37.6 Dependências

Nova dependência só entra se resolver problema real, reduzir complexidade total, possuir manutenção adequada e caber em risco/performance.

---

# 38. Ambientes, branches, migrations e promoção

## 38.1 Código canônico

`main` permanece a versão canônica publicada. `pilot` é gate de staging/promoção.

## 38.2 Fluxo recomendado

`feature/* -> pilot -> main`

- feature parte de base alinhada com pilot;
- PR entra em pilot após validação;
- ambiente pilot valida integração real;
- promoção `pilot -> main` libera a mesma árvore para demo/prod;
- hotfix nasce de main e é reconciliado em pilot.

PR direta `feature -> main` é exceção documentada.

## 38.3 Ambientes

- demo: `main` + `ARANDU_ENV=demo` + banco DEMO;
- pilot: `pilot` + `ARANDU_ENV=pilot` + banco PILOT;
- production: `main` + `ARANDU_ENV=production` + banco PROD.

Nenhum banco deve ser compartilhado entre ambientes.

## 38.4 Migrations

Toda migration relevante DEVE:

- ser aditiva quando possível;
- entrar no manifesto;
- possuir ordem determinística;
- preservar RLS/grants;
- ter clean-install test;
- upgrade test;
- rollback/reapply quando aplicável;
- seguir expand/migrate/contract em mudanças destrutivas.

---

# 39. UX e arquitetura de navegação

## 39.1 Princípio

O Arandu deve parecer um **workspace corporativo de alta confiança**, não um site institucional ou fintech promocional.

## 39.2 Gramática universal

Sempre que houver trabalho, mostrar:

**estado -> próxima ação -> por quê -> prazo -> responsável**

## 39.3 Navegação alvo

### Meu trabalho

- precisa de você;
- tasks;
- approvals;
- follow-ups.

### Procurement

- requests/intake;
- RFQs/RFPs;
- proposals;
- negotiations;
- decisions.

### Financial Portfolio

- Passport/Graph;
- debt/facilities;
- limits;
- guarantees;
- financial spend;
- banking costs;
- opportunities.

### Relationships

- banks/providers;
- contracts;
- performance;
- renewals.

### Governance

- policies;
- entities;
- users/groups;
- integrations;
- savings;
- audit.

## 39.4 Comparison workspace

- diferenças primeiro;
- missing data visível;
- versões;
- proveniência;
- filtros;
- pesos do cliente;
- cenários;
- sem recomendação do Arandu.

## 39.5 Progressive disclosure

Mostrar primeiro o necessário para agir. Complexidade enterprise deve existir sem destruir legibilidade para clientes menores.

## 39.6 Acessibilidade e mobile

Preservar navegação por teclado, foco, targets, labels, contraste, reduced motion e ausência de overflow não intencional. Mobile deve adaptar densidade, não copiar desktop cegamente.

---

# 40. Analytics e métricas

## 40.1 Valor para cliente

- time-to-RFQ;
- time-to-first-response;
- response rate;
- proposal coverage;
- negotiation cycle;
- approval cycle;
- time-to-decision;
- monitored-contract coverage;
- renewals iniciadas antes do prazo crítico;
- fees revisados;
- opportunities convertidas em processo;
- realized savings;
- policy adherence;
- reduction de follow-ups manuais;
- provider response/performance.

## 40.2 Saúde do SaaS

- organizações ativas;
- WAU/MAU por persona;
- processos completos;
- contratos ativos;
- retention por organização;
- módulos usados;
- activation time;
- time-to-value;
- expansão de seats/entities/packs;
- provider portal usage;
- API/integration usage;
- errors/latency.

## 40.3 Métricas de vaidade

Quantidade de telas, integrações ou features não representa sucesso isoladamente.

---

# 41. Produto comercial e packaging

O Arandu deve ser vendido como software e infraestrutura de trabalho, não como promessa de “melhor taxa”.

Eixos naturais de packaging:

- usuários;
- entidades legais;
- Product Packs;
- volume de processos;
- contratos monitorados;
- integrations;
- API/webhooks;
- SSO/SCIM;
- analytics;
- retention/audit;
- AI/document intelligence;
- support/SLA.

O modelo comercial NÃO DEVERIA depender exclusivamente de comissão por transação. Qualquer remuneração ligada a fornecedor/contratação deve ser transparente e separada da lógica de comparação.

---

# 42. Roadmap por prioridades

O roadmap é uma **sequência de maturidade**, não calendário.

## P0 — Fundação comercial e enterprise blockers

Objetivo: tornar a plataforma segura, operável e arquiteturalmente apta a clientes reais de maior porte.

Prioridades:

1. concluir e manter Demo/Pilot/Production separados e verificáveis;
2. fechar migrations e runbooks pendentes;
3. multi-entity foundation;
4. Contract & Renewal Center v2;
5. Provider/Bank Relationship Management v1;
6. Debt / Facilities / Limits / Guarantees model v1;
7. Policy & Approval Engine v2;
8. public API/webhook foundation;
9. manter Passport/Graph evoluindo sobre v2;
10. branch/environment governance e observabilidade.

## P1 — Recorrência, ROI e diferenciação

Objetivo: tornar Arandu uma ferramenta semanal/diária e provar valor econômico.

Prioridades:

1. Savings Ledger v1;
2. Bank Fee Intelligence v1;
3. Opportunity Engine v1;
4. Proposal/Document Intelligence v1;
5. SSO/SCIM + enterprise admin;
6. Executive Portfolio v1;
7. Financial Spend Analytics v1;
8. Covenant/Obligation Monitor;
9. Provider Performance;
10. Enterprise Search;
11. Enterprise Intake;
12. Scenario Builder / split award.

## P2 — Wallet share e ecosystem integration

Objetivo: usar o mesmo core em novas necessidades e automatizar contexto.

Prioridades:

1. FX pack;
2. Guarantees/Surety pack;
3. Cash Management RFP pack;
4. Working Capital/Receivables sourcing;
5. deeper Acquiring Intelligence;
6. ERP/TMS connectors;
7. Open Finance;
8. Teams/Slack;
9. provider APIs;
10. BI/data warehouse.

## P3 — Network effects e data moat

Objetivo: ampliar valor acumulado da rede preservando privacy e neutralidade.

Prioridades:

1. Provider Discovery Network;
2. internal benchmark avançado;
3. external benchmark após gates jurídicos/estatísticos;
4. network intelligence;
5. seguros e outros packs após validação;
6. advanced hedging/structured products somente com boundary específico.

---

# 43. Gates antes de expandir

## 43.1 Antes de novo Product Pack

Responder “sim” a:

- o core suporta o processo sem fork?
- há lifecycle pós-decisão?
- Provider model atende?
- Contract Center atende?
- Policy Engine atende?
- Graph fornece contexto?
- existe hipótese comercial e usuário real?
- existem limites regulatórios claros?
- há testes de domínio e E2E?

## 43.2 Antes de benchmarking externo

- volume suficiente;
- anonimização;
- contrato/consentimento;
- reidentification controls;
- metodologia;
- vintage;
- legal review.

## 43.3 Antes de IA autônoma

O Arandu não deve introduzir decisão autônoma. Automação de tarefas pode avançar apenas quando reversível, autorizada e auditável.

---

# 44. Framework de priorização

Toda iniciativa deve ser avaliada por:

| Dimensão | Pergunta |
| --- | --- |
| Dor | Resolve trabalho financeiro real e recorrente? |
| Recorrência | Aumenta uso frequente? |
| Profundidade | Completa um lifecycle existente? |
| Dados | Gera histórico estruturado reutilizável? |
| Governança | Melhora política, decisão ou controle? |
| Diferenciação | É melhor que e-mail + planilha + portal? |
| Enterprise | Remove blocker de médio/grande porte? |
| Reuso | Serve a múltiplas categorias/personas? |
| Integração | Conecta adequadamente sources of truth? |
| Segurança | Preserva isolamento e least privilege? |
| Neutralidade | Mantém decisão com o cliente? |
| Operação | É testável/observável/suportável? |
| Comercial | Melhora ativação, retenção, expansão ou disposição a pagar? |
| Complexidade | O valor compensa custo técnico/cognitivo? |

Features com “wow” alto e workflow/dados/recorrência baixos devem ser adiadas.

---

# 45. Lifecycle de uma feature e Definition of Done

## 45.1 Descoberta

Antes de implementar:

- usuário;
- problema;
- comportamento atual;
- objeto afetado;
- source of truth;
- estados/transições;
- permissões;
- entidade/tenant;
- risco;
- métrica;
- fora de escopo.

## 45.2 Design

Cobrir:

- fluxo principal;
- empty/loading/error;
- denied;
- audit;
- notifications;
- mobile;
- accessibility;
- integrações;
- source metadata;
- migration/rollback.

## 45.3 Implementação preferida

1. modelo e contratos;
2. autorização;
3. domínio;
4. API;
5. UI;
6. instrumentation;
7. testes negativos;
8. E2E;
9. docs;
10. visual evidence.

## 45.4 Definition of Done

Conforme aplicável:

- requisito documentado;
- boundaries preservados;
- RLS/RBAC testados;
- API valida permissão;
- migrations no manifesto;
- rollback ou justificativa;
- `check:all`;
- build/budgets;
- E2E;
- database tests;
- cross-browser;
- mobile;
- console limpo;
- sem overflow;
- audit trail;
- provenance;
- docs;
- evidência;
- claims revisadas;
- nenhum estado externo declarado sem prova.

---

# 46. QA, performance e escala

## 46.1 Pirâmide prática

- unit/domain tests;
- API/contract tests;
- DB/RLS/migration tests;
- integration tests;
- E2E;
- visual evidence.

## 46.2 Casos negativos

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
- webhook forged;
- integration conflict;
- AI retrieval sem permissão.

## 46.3 Performance

- evitar N+1;
- server-side pagination/filter;
- índices por query real;
- bundle budgets;
- lazy loading;
- anexos fora do bundle;
- observabilidade de queries;
- analytics incrementais quando necessário;
- não carregar tenant inteiro para filtrar no browser.

## 46.4 Enterprise scale

Novos módulos devem considerar milhares de RFQs, propostas, contratos, documentos e eventos, não apenas datasets de demo.

---

# 47. Segurança, privacidade e autorização

## 47.1 Multi-tenancy

RLS no banco continua primeira linha de isolamento e NÃO DEVE ser substituída por filtro apenas em API/front-end.

## 47.2 Least privilege

- service role somente server-side e minimizada;
- anon + session no cliente;
- privileged ops separadas;
- MFA onde exigido;
- provider nunca vê concorrente;
- cross-entity permissions explícitas.

## 47.3 Storage

Documentos financeiros permanecem privados; acesso por autorização server-side e signed URL curta quando aplicável.

## 47.4 Logs

Não registrar tokens, senhas, documentos completos, dados financeiros sensíveis desnecessários ou PII além do mínimo.

## 47.5 Fail closed

Configuração, integração, autorização ou environment ambíguos devem falhar fechados.

---

# 48. Documentação e instruções para agentes de IA

## 48.1 Hierarquia documental

Esta guideline é autoridade estratégica. Documentos especializados continuam autoridade técnica para limites, segurança, dados, UI, deploy, migrations e operações.

## 48.2 Regra para agentes

Antes de qualquer implementação relevante, agente DEVE:

1. ler esta guideline;
2. ler `docs/FINANCIAL_PRODUCT_BOUNDARIES.md`;
3. identificar módulos existentes;
4. verificar se está estendendo ou duplicando;
5. declarar fora de escopo;
6. preservar decisão humana;
7. preservar RLS/RBAC/MFA;
8. preservar ambientes;
9. validar integration source of truth;
10. provar mudança com testes/evidência.

## 48.3 Durante implementação

- preferir extensão a reconstrução;
- não remover guardas para facilitar testes;
- não criar auth bypass;
- não inventar claims/dados;
- não confundir mock com produção;
- não declarar deploy externo sem prova;
- manter PR coesa;
- atualizar docs no mesmo PR quando arquitetura ou tese mudar.

---

# 49. Anti-patterns proibidos

NÃO FAZER:

- segunda implementação de comparação;
- novo demo engine paralelo ao produto real;
- duplicar entidades por Product Pack;
- lógica crítica somente no browser;
- service role no cliente;
- ranking default de provedores;
- recommendation default;
- savings sem metodologia;
- benchmark sem governança;
- Graph como data lake indiscriminado;
- integração sem source of truth/idempotência;
- API sem scopes/audit/rate limit;
- multi-entity implementado apenas adicionando IDs sem modelo;
- dashboard sem workflow;
- IA sem provenance/permission grounding;
- Opportunity Engine que execute contratação sozinho;
- migration fora do manifesto;
- banco compartilhado entre ambientes;
- dados reais em demo;
- pack sem lifecycle;
- big-bang refactor sem necessidade;
- reabrir vertical de arte;
- expandir consumidor antes do B2B enterprise.

---

# 50. Decisões que exigem revisão formal desta guideline

Revisar antes de:

- oferecer B2C;
- executar pagamentos;
- custodiar fundos;
- conceder crédito;
- executar hedge/investimento;
- assumir underwriting;
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
- permitir armazenamento persistente de dados sensíveis em provedor de IA sem revisão.

---

# 51. North Star

A North Star não é quantidade de produtos suportados.

É:

> **Quantos relacionamentos e processos financeiros corporativos relevantes uma empresa consegue administrar no Arandu, de ponta a ponta e continuamente, com dados confiáveis, competição, governança, decisão humana, contrato, obrigações, renovação, custos, savings e memória institucional — sem voltar para planilhas, e-mails e decisões sem trilha.**

O produto vence quando remover Arandu significaria voltar a uma operação financeira fragmentada e opaca.

---

# 52. Regra final

Na dúvida sobre evolução, priorizar:

**estabilizar -> modelar entidades e relacionamentos -> aprofundar lifecycle -> estruturar dados -> integrar sources of truth -> detectar oportunidades -> automatizar trabalho -> gerar inteligência -> expandir categorias -> ativar network effects.**

Nunca inverter essa ordem apenas para produzir uma demo mais impressionante.

---

# Apêndice A — Matriz de prioridades

| Módulo | Prioridade | Valor primário | Dependência principal | Risco principal |
| --- | --- | --- | --- | --- |
| Financial Passport / Graph | P0 contínuo | contexto reutilizável | provenance/entities | dado desatualizado |
| Multi-entity foundation | P0 | enterprise readiness | auth/data model | vazamento cross-entity |
| Contract Center v2 | P0 | recorrência | contracts | lifecycle incompleto |
| Provider/Bank RM | P0 | memória institucional | provider model | score subjetivo |
| Debt/Facilities/Limits | P0 | contexto financeiro | Graph/contracts | virar ledger paralelo |
| Policy Engine v2 | P0 | governança | approvals/entities | policy mutar processo antigo |
| API/Webhooks | P0 | integração enterprise | auth/idempotency | abuso/vazamento |
| Savings Ledger | P1 | prova de ROI | baseline | savings inventado |
| Bank Fee Intelligence | P1 | ROI e oportunidade | contract/usage data | falso positivo |
| Opportunity Engine | P1 | recorrência/diferenciação | contracts/Graph | virar recomendação |
| Proposal Intelligence | P1 | produtividade | docs/provenance | extração errada |
| SSO/SCIM | P1 | enterprise adoption | IAM | misconfiguration |
| Executive Portfolio | P1 | gestão CFO | structured data | dashboard sem ação |
| Financial Spend | P1 | oportunidade | integrations | dupla contagem |
| Covenant Monitor | P1 | controle | contract data | falsa conclusão |
| Enterprise Search | P1 | produtividade | indexing/auth | leakage |
| Scenario Builder | P1 | decisão | comparison | parecer recomendação |
| FX Pack | P2 | wallet share | sourcing core | boundary regulatório |
| Guarantees Pack | P2 | wallet share | contract/provider | instrumento heterogêneo |
| Cash Mgmt RFP | P2 | strategic sourcing | fee/provider model | escopo virar TMS |
| Working Capital | P2 | sourcing | need schemas | comparação inadequada |
| ERP/TMS Connectors | P2 | automation | API framework | source conflict |
| Open Finance | P2 | authorized data | consent | privacy |
| Provider Network | P3 | network effect | buyer-side maturity | privacy/neutrality |
| External Benchmark | P3 | data moat | scale/legal | reidentificação |

---

# Apêndice B — Build vs Integrate vs Avoid

| Construir | Integrar | Não construir como core |
| --- | --- | --- |
| Financial Graph | ERP | contabilidade |
| financial sourcing | TMS | ledger |
| provider RM | bancos | pagamentos |
| contract lifecycle | Open Finance | core banking |
| fee intelligence | assinatura | custódia |
| debt/limit view | market data | underwriting |
| Opportunity Engine | e-mail/Teams | concessão de crédito |
| savings | BI/DWH | execução de hedge |
| policy/approval | KYC/compliance | gestão discricionária |
| financial analytics | IdP | reconciliação bancária completa |
| benchmarking | provider APIs | ERP genérico |
| network | legal tools | TMS completo |

---

# Apêndice C — Dependency map recomendado

```text
Enterprise Core
   |
   +--> Multi-entity + Identity + Policy
   |
Financial Graph
   |
   +--> Provider/Bank RM
   +--> Debt/Facilities/Limits
   +--> Contract Lifecycle
          |
          +--> Obligations/Covenants
          +--> Bank Fee Intelligence
          +--> Financial Spend
                 |
                 +--> Opportunity Engine
                        |
                        +--> Sourcing / RFQ / RFP
                               |
                               +--> Proposal Intelligence
                               +--> Scenario Builder
                               +--> Decision / Approval
                                      |
                                      +--> Contract
                                      +--> Savings Ledger

API / Integrations feed all layers with explicit source-of-truth rules.
```

---

# Apêndice D — Checklist rápido antes de dizer “sim” a uma ideia

- É B2B/enterprise?
- Resolve trabalho financeiro real?
- Aumenta recorrência ou profundidade?
- Reutiliza o core?
- Cria dados estruturados úteis?
- Tem source of truth?
- Mantém decisão humana?
- Tem provenance?
- Funciona em multi-entity?
- É autorizável por tenant/entity/role?
- Tem lifecycle pós-decisão?
- É integrável via API?
- É testável e observável?
- Tem rollback quando aplicável?
- Evita nova atividade regulada?
- Melhora retenção, ROI ou disposição a pagar?
- É melhor que aprofundar módulo existente?

Se várias respostas forem “não”, a iniciativa não deve entrar no roadmap agora.

---

# Apêndice E — Referências canônicas do repositório

Esta guideline complementa, e não substitui, documentos especializados como:

- `README.md`;
- `CLAUDE.md`;
- `CONTRIBUTING.md`;
- `docs/FINANCIAL_PRODUCT_BOUNDARIES.md`;
- `docs/FINANCIAL_PROCUREMENT_PRODUCT.md`;
- `docs/FINANCIAL_DATA_MODEL.md`;
- `docs/FINANCIAL_UI_ARCHITECTURE.md`;
- `docs/FINANCIAL_SECURITY_MODEL.md`;
- `docs/FINANCIAL_THREAT_MODEL.md`;
- `docs/FINANCIAL_AUTHORIZATION_MAP.md`;
- `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`;
- `docs/FINANCIAL_REPO_GOVERNANCE.md`;
- `docs/demo/README.md`;
- `docs/demo/RUNBOOK.md`;
- `docs/supabase-migrations.json`.

Em conflito técnico, o documento especializado rege a implementação concreta. Em conflito de direção de produto, esta guideline rege até ser alterada por decisão explícita e versionada.
