# Arandu — Diretrizes Mestras de Produto, Engenharia e Evolução

**Versão 3.1 — 7 de outubro de 2026**  
**Baseline técnica de referência desta revisão:** `main` @ `84110305ae3fc86bc81a11cc901007ce8111fb46`  
**Status:** constituição normativa de produto e engenharia  
**Escopo:** tese de produto, boundaries, arquitetura funcional, maturidade, UX, engenharia, dados, segurança, IA, integrações, operação enterprise e critérios de evolução

> **Propósito.** Esta guideline define o que o Arandu é, o que não é, como deve evoluir e quais garantias não podem ser sacrificadas. Ela governa pessoas e agentes de IA que alterem o produto.
>
> **Mudança principal da v3.1.** A tese é refinada para deixar explícito que RFQ/RFP e comparação são capabilities do core, não o moat isolado. O diferencial defensável do Arandu é o lifecycle de procurement financeiro de ponta a ponta, sustentado pelo Financial Graph, memória institucional, governança, workflow recorrente, dados com proveniência e integrações. Market data, pricing e execution venues especializados devem ser integrados quando fizer sentido, não reconstruídos como um terminal/OMS/EMS paralelo.
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

### M4 — PILOT_VALIDATED

- jornada real ou representativa ponta a ponta foi executada no Pilot;
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

Áreas alvo:

- Meu trabalho;
- Procurement;
- Financial Portfolio;
- Relationships;
- Governance.

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

Demo, Pilot e Production devem usar a mesma aplicação e domínio. Diferenças vêm de configuração, dados e infraestrutura, nunca de forks funcionais.

## 23.2 Modularidade

Novas features devem preferir módulos por domínio, contratos claros e reuso do core.

## 23.3 Regra crítica no servidor

Permissão, transição, aprovação, decisão, cálculo crítico, acesso a documento e mutação sensível devem ser validados server-side/banco.

## 23.4 Ambientes

Revisão de 06/10/2026, decidida pelo owner (consolidação `main` canônica):

- demo: `main` + configuração DEMO (`ARANDU_ENV=demo`, runtime `demo`) + banco/estado DEMO com dados sintéticos;
- staging/pilot: `main` + configuração PILOT (`ARANDU_ENV=pilot`, runtime `staging`) + banco PILOT — validação de migrations, E2E, smoke, recovery e release candidate;
- official/production: `main` + configuração PRODUCTION (`ARANDU_ENV=production`, runtime `official`) + banco PROD — só release aprovada.

Nenhum banco deve ser compartilhado entre ambientes. A diferença de comportamento entre ambientes (datasource, autenticação de teste, fixtures, e-mail, webhooks, provedores externos, documentos reais) DEVE ser decidida por uma política única e testada (`lib/runtime-mode.mjs`), nunca por condicionais espalhadas ou código de produto divergente.

## 23.5 Branches e promoção

Fluxo normativo:

`feature/* -> PR -> main -> ambientes`

- `main` é a única branch longa de produto;
- feature nasce da ponta atual de `main` e é temporária;
- PR entra em `main` após os gates;
- staging/pilot prova a integração hospedada do mesmo SHA antes do oficial;
- a branch `pilot` é histórica (congelada) desde a consolidação de 06/10/2026;
- "merged" em outra branch não é integração: o SHA precisa ser ancestral de `main`.

Merge NÃO DEVE ocorrer com gate obrigatório pending, failed, cancelled, skipped ou atestando SHA diferente do HEAD.

A branch da PR DEVE conter a ponta atual da base antes do merge.

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
- Pilot hospedado reconciliado;
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
- `docs/demo/README.md`;
- `docs/demo/RUNBOOK.md`;
- `docs/supabase-migrations.json`.

Em conflito técnico, o documento especializado rege a implementação concreta. Em conflito de direção de produto, esta guideline rege até revisão explícita e versionada.
