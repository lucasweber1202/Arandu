# Arandu — Diretrizes Mestras de Produto, Engenharia e Evolução

**Versão 1.0 — 1º de outubro de 2026**  
**Baseline técnica:** `main` @ `8adbc429` (merge da PR #90)  
**Status:** documento normativo de direção futura  
**Escopo:** produto, UX, engenharia, dados, segurança, IA, integrações, operação, roadmap e critérios de aceite

> **Propósito deste documento.** Este é o documento-mestre para orientar toda evolução futura do Arandu. Ele deve funcionar como referência de produto e engenharia para pessoas e agentes de IA. Mudanças futuras podem ampliar o produto, mas não devem contradizer estes princípios sem uma decisão explícita, documentada e versionada.

---

# 1. Como usar estas diretrizes

Estas diretrizes usam quatro níveis normativos:

- **DEVE**: requisito obrigatório. Uma mudança que viola um item “DEVE” não deve ser mergeada.
- **NÃO DEVE**: proibição explícita. Exceções exigem decisão humana, justificativa e atualização deste documento.
- **DEVERIA**: padrão recomendado. Pode ser desviado quando houver motivo técnico ou de produto documentado.
- **PODE**: possibilidade legítima, mas não prioridade automática.

A hierarquia de decisão é:

1. segurança, isolamento, privacidade, integridade dos dados e limites regulatórios;
2. decisão humana e rastreabilidade;
3. coerência com a tese B2B do produto;
4. qualidade do fluxo ponta a ponta;
5. clareza e eficiência operacional;
6. inteligência, automação e conveniência;
7. expansão de categorias e integrações.

Quando duas diretrizes entrarem em tensão, a regra mais alta nessa hierarquia prevalece.

---

# 2. Resumo executivo

## 2.1 Tese central

O Arandu deve evoluir de uma plataforma de **Financial Procurement** para um **Financial Procurement OS**: a infraestrutura de trabalho usada por empresas para estruturar necessidades financeiras, conduzir concorrências, receber e normalizar propostas, governar decisões, administrar fornecedores financeiros, acompanhar contratos e renovações e gerar inteligência sobre todo esse ciclo.

A expansão do Arandu não deve ser orientada por “adicionar o maior número possível de produtos financeiros”. Ela deve ser orientada por quatro efeitos:

1. **profundidade**: fazer melhor e de forma mais completa o trabalho que uma tesouraria, financeiro, procurement e CFO já executam;
2. **recorrência**: tornar o Arandu útil semanal ou diariamente, não apenas no momento de uma nova RFQ;
3. **dados estruturados**: transformar processos fragmentados em histórico comparável, auditável e reutilizável;
4. **rede operacional**: conectar comprador, aprovadores, provedores, documentos, contratos, políticas e integrações sem perder neutralidade.

## 2.2 O que o Arandu deve se tornar

O norte do produto é:

**Arandu Financial Procurement OS**  
*Financial Vendor Management & Decision Infrastructure for Companies*

Na prática, o Arandu deve ser o local onde a empresa responde:

- O que precisamos contratar ou renegociar?
- Quem está envolvido?
- Quais provedores foram convidados?
- O que cada um ofereceu e em qual versão?
- Quais dados estão faltando?
- Onde as propostas realmente diferem?
- Quais critérios e pesos a empresa decidiu usar?
- Quem precisa revisar ou aprovar?
- Qual decisão foi tomada, por quem e com qual justificativa?
- Qual contrato resultou dessa decisão?
- Quanto foi contratado, em quais condições e com quais obrigações?
- Quando precisamos renegociar ou renovar?
- Qual ganho foi efetivamente realizado e como ele foi calculado?
- Qual é o histórico da relação com cada provedor?
- Quais processos estão parados, vencendo ou dependem de alguém?

## 2.3 O que o Arandu não deve se tornar

O Arandu NÃO DEVE virar:

- um banco;
- uma fintech que movimenta dinheiro;
- uma corretora ou gestora;
- um motor de underwriting;
- um robô que escolhe instituição financeira;
- um marketplace consumidor de “melhor taxa”;
- um ERP financeiro genérico;
- um CRM genérico;
- um sistema de contas a pagar;
- uma plataforma de recomendação automatizada;
- uma coleção de features desconectadas;
- uma interface bonita sem profundidade operacional;
- um produto que inventa economia, CET, benchmarks ou conclusões sem proveniência verificável.

---

# 3. Missão, visão e posição de mercado

## 3.1 Missão

Dar às empresas uma infraestrutura confiável para **comprar, negociar, decidir e administrar produtos e fornecedores financeiros com organização, competição, governança e memória institucional**.

## 3.2 Visão

Ser a camada de sistema de registro e sistema de trabalho da contratação financeira corporativa: da necessidade inicial ao histórico de renovação, com dados estruturados, decisões humanas e integração ao ecossistema financeiro da empresa.

## 3.3 Posicionamento

O Arandu é software B2B para empresas. Seu comprador econômico tende a ser CFO, diretor financeiro, tesouraria, procurement, controladoria ou liderança financeira. Seus usuários cotidianos incluem analistas, gerentes financeiros, tesoureiros, controllers, aprovadores, administradores, procurement e, do lado externo, provedores financeiros.

O produto deve comunicar cinco atributos:

- **organização**;
- **rastreabilidade**;
- **clareza**;
- **confiança**;
- **rigor**.

A estética pode ser moderna e premium, mas nunca deve substituir esses atributos por aparência de “fintech promocional”.

---

# 4. Princípios não negociáveis de produto

## 4.1 B2B primeiro

O Arandu DEVE permanecer focado em empresas. Funcionalidades para pessoa física NÃO DEVEM ser priorizadas enquanto não houver uma razão estratégica extraordinária e explicitamente aprovada.

Toda nova feature deve responder a uma pergunta: **isso melhora o trabalho financeiro de uma organização?**

## 4.2 A decisão pertence à empresa

O Arandu pode organizar, calcular, resumir, alertar, normalizar, comparar e explicar. Ele NÃO DEVE decidir em nome da empresa.

Pesos, preferências, critérios eliminatórios, aprovações e decisão final pertencem ao cliente. Sempre que houver uma ordenação derivada de critérios, ela deve ser identificada como resultado das regras definidas pelo próprio cliente.

## 4.3 Fato antes de opinião

O produto DEVE preferir fatos verificáveis a conclusões subjetivas. Exemplos legítimos:

- taxa informada;
- prazo;
- CET informado;
- validade;
- garantia exigida;
- prazo de liquidação;
- cobertura dos campos;
- data da proposta;
- diferença em relação à versão anterior;
- economia calculada por metodologia explícita.

Exemplos proibidos sem critério humano explícito:

- “melhor banco”;
- “melhor proposta”;
- “instituição recomendada”;
- “vale a pena”;
- “baixo risco” sem metodologia e dados adequados;
- “economia” sem baseline, fórmula e evidência.

## 4.4 Proveniência sempre visível

Todo número calculado pelo Arandu DEVE permitir responder:

- qual é a fonte;
- quais insumos foram usados;
- quando foram obtidos;
- qual fórmula foi aplicada;
- quais premissas existem;
- se o valor é informado, derivado ou estimado.

## 4.5 Completo antes de amplo

É preferível ter dois produtos financeiros excelentes do que dez fluxos incompletos. A expansão de categorias só deve ocorrer quando o core estiver suficientemente genérico e os módulos existentes estiverem operacionais do intake à renovação.

## 4.6 Workflow antes de dashboard

O principal valor do Arandu vem da execução e governança do trabalho. Dashboards devem emergir de dados gerados pelo workflow real, e não substituir o workflow.

## 4.7 Sistema de registro + sistema de ação

Cada objeto relevante deve ter um estado confiável e uma próxima ação clara. O Arandu deve ser simultaneamente:

- **system of record**: histórico, versões, documentos, decisões, contratos e auditoria;
- **system of action**: tarefas, aprovações, follow-ups, renovações, notificações e automações.

## 4.8 Segurança e isolamento são features

RLS, RBAC, MFA, auditabilidade, storage privado, fail-closed e separação de ambientes não são infraestrutura invisível descartável. São características do produto e condições de existência do SaaS.

---

# 5. Limites regulatórios e funcionais permanentes

Estas regras permanecem válidas salvo revisão jurídica e alteração explícita do produto.

O Arandu NÃO DEVE:

- conceder ou aprovar crédito;
- emprestar recursos próprios;
- realizar underwriting;
- receber, custodiar ou movimentar recursos;
- executar pagamentos ou transferências;
- assinar contratos financeiros automaticamente;
- executar investimentos;
- gerenciar carteira de forma discricionária;
- prometer aprovação de crédito;
- recomendar instituição de forma automática ou individualizada;
- classificar uma instituição como “melhor” sem critérios definidos pela empresa;
- apresentar conformidade regulatória como fato sem evidência e revisão apropriadas;
- gerar aconselhamento jurídico ou regulatório como conclusão definitiva.

A expansão para novas categorias — câmbio, hedge, seguros, garantias, caixa, investimentos corporativos ou outros — deve manter exatamente a mesma separação entre **software de procurement/decision support** e **execução regulada**.

---

# 6. Usuários e personas

## 6.1 Comprador / tesouraria

Objetivo: estruturar a necessidade, convidar instituições, acompanhar respostas, comparar propostas, negociar e encaminhar decisão.

Deve ter:

- work queue;
- RFQs próprias e compartilhadas;
- templates;
- saved views;
- follow-ups;
- comparação;
- negociação/versionamento;
- contratos e renovações;
- relacionamento com provedores.

## 6.2 CFO / diretor financeiro

Objetivo: governar decisões, aprovar exceções, visualizar exposição, contratos, renovações e resultados.

Deve ter:

- approval inbox;
- visão executiva;
- políticas e alçadas;
- decisões com contexto;
- portfólio de contratos;
- savings realizados e metodologia;
- riscos de renovação e concentração.

## 6.3 Controller / aprovador

Objetivo: revisar aderência à política e aprovar dentro da alçada.

Deve receber contexto suficiente para decidir sem reconstruir o processo manualmente.

## 6.4 Analista financeiro

Objetivo: operar grande parte do fluxo, organizar dados, solicitar informações, preparar comparação e acompanhar tarefas.

É uma persona fundamental para recorrência. O produto deve reduzir trabalho de planilha, e-mail e follow-up manual.

## 6.5 Procurement corporativo

Objetivo: governar fornecedores, concorrência, documentos, termos, negociação e políticas de contratação.

O Arandu deve permitir colaboração entre procurement e financeiro sem confundir ownership.

## 6.6 Administrador da organização

Objetivo: usuários, papéis, políticas, integrações, segurança, unidades, configurações e governança.

## 6.7 Provedor financeiro

Objetivo: receber apenas oportunidades autorizadas, esclarecer dúvidas, responder propostas, versionar ofertas, anexar documentos e acompanhar processos próprios.

O provedor NÃO DEVE ver qualquer informação de concorrentes.

## 6.8 Finance Ops do Arandu

Objetivo: operar a plataforma sem acessar dados de clientes além do estritamente necessário e permitido. Deve existir separação entre observabilidade operacional e conteúdo de cliente.

---

# 7. Modelo mental do produto

O Arandu deve ser orientado por **objetos, estados, relações e ações**, não por páginas isoladas.

Objetos canônicos:

- organização;
- unidade / entidade legal;
- membro;
- contraparte / provedor;
- perfil financeiro;
- necessidade;
- RFQ / processo;
- convite;
- revisão da demanda;
- proposta;
- versão da proposta;
- critério;
- comparação;
- política;
- aprovação;
- decisão;
- contrato;
- marco contratual;
- renovação / repricing;
- tarefa;
- comentário;
- documento;
- evento;
- notificação;
- integração;
- métrica / registro de valor realizado.

Todo objeto importante DEVE ter:

- identificador estável;
- organização proprietária;
- autor ou origem;
- timestamps confiáveis;
- estado explícito;
- histórico ou versionamento quando aplicável;
- autorização no servidor;
- representação auditável;
- próxima ação quando houver trabalho pendente.

---

# 8. Arquitetura funcional de longo prazo

A arquitetura de produto deve ser composta por camadas, não por verticais completamente separadas.

## 8.1 Camada A — Enterprise Core

Capacidades comuns a todo o produto:

- organizações e entidades legais;
- usuários, papéis e grupos;
- RLS/RBAC/MFA;
- documentos e anexos;
- comentários e menções;
- tarefas;
- notificações;
- eventos e auditoria;
- políticas e aprovações;
- busca e command center;
- saved views;
- templates;
- integrações;
- APIs e webhooks;
- preferências e acessibilidade.

## 8.2 Camada B — Procurement Core

- intake de necessidade;
- RFQ;
- fornecedores convidados;
- revisões;
- propostas e versões;
- normalização;
- comparação;
- negociação;
- decisão;
- award;
- contrato;
- renovação.

## 8.3 Camada C — Financial Intelligence

- perfil financeiro reutilizável;
- dados históricos;
- analytics;
- savings ledger;
- proposta intelligence;
- benchmark anonimizado quando permitido;
- alertas;
- assistente de IA;
- cenários e explicações.

## 8.4 Camada D — Product Packs

Cada categoria financeira deve ser um “pack” sobre o mesmo core, contendo:

- schema de necessidade;
- schema de proposta;
- estados específicos, se necessários;
- regras de validação;
- campos de comparação;
- cálculos permitidos;
- regras de proveniência;
- documentos típicos;
- templates;
- testes de domínio.

Essa arquitetura permite adicionar categorias sem reconstruir organizações, convites, propostas, decisões, contratos ou auditoria.

---

# 9. Módulos atuais que devem permanecer como fundação

Os seguintes módulos são fundacionais e NÃO DEVEM ser substituídos por implementações paralelas sem necessidade:

- organizações e membros;
- RFQs;
- convites;
- propostas versionadas;
- comparação factual;
- pesos definidos pelo usuário;
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
- CI e testes de banco/E2E.

Nova funcionalidade DEVERIA estender estes objetos e workflows, não duplicá-los.

---

# 10. Próxima geração de funcionalidades

## 10.1 Financial Profile / Financial Passport

### Objetivo

Transformar o perfil financeiro em um ativo reutilizável da empresa, reduzindo preenchimento repetitivo e melhorando a qualidade das RFQs.

### Deve conter, progressivamente

- dados cadastrais e entidades legais;
- setor, porte e receita;
- perfil de recebimentos;
- endividamento declarado;
- bancos e provedores atuais;
- limites e produtos contratados;
- calendário de vencimentos;
- políticas e preferências internas;
- documentos reutilizáveis;
- fontes e data de atualização;
- campos com owner e validade.

### Regras

- nunca inferir informação crítica sem rotular;
- separar dado informado, importado e derivado;
- permitir reuso seletivo por RFQ;
- manter controle de quem pode ver cada classe de dado;
- suportar múltiplas entidades legais no futuro.

## 10.2 Contract & Renewal Center

Deve evoluir de uma lista de contratos para o sistema de lifecycle dos relacionamentos financeiros.

Capacidades alvo:

- timeline contratual;
- D-120/90/60/30 configurável;
- avisos prévios;
- obrigações e covenants;
- anexos e versões;
- owner;
- auto-renewal flag;
- repricing window;
- renegociação vinculada ao contrato anterior;
- contrato pai/filho quando houver aditivos;
- visão de concentração por fornecedor e categoria;
- vencimentos por entidade/unidade;
- geração de nova RFQ a partir de contrato.

## 10.3 Savings Ledger

O Savings Ledger deve registrar valor gerado de forma auditável, evitando “savings de marketing”.

Cada registro DEVE ter:

- baseline explícito;
- fonte do baseline;
- proposta/contrato escolhido;
- fórmula;
- período;
- unidade;
- owner;
- data;
- distinção entre estimado e realizado;
- ajustes e justificativas;
- link para evidência.

Tipos possíveis:

- redução de MDR;
- redução de tarifa fixa;
- redução de spread;
- redução de CET informado;
- redução de custo contratual comparável;
- fee evitado;
- ganho por prazo/condição apenas se houver metodologia econômica documentada.

O produto NÃO DEVE somar métricas economicamente incomparáveis em um único número sem metodologia declarada.

## 10.4 Provider Relationship Management

O Arandu deve construir memória institucional sobre cada provedor.

Perfil do provedor pode conter:

- categorias atendidas;
- contatos;
- status cadastral;
- processos convidados;
- taxa de resposta factual;
- tempo médio de resposta;
- propostas enviadas;
- contratos ativos;
- renovações;
- documentos;
- issues e follow-ups;
- histórico de relacionamento;
- evidências regulatórias quando aplicável;
- scorecards definidos pela empresa.

Qualquer “score” DEVE ser definido pela empresa ou baseado em critérios objetivos transparentes. O Arandu não deve criar reputação subjetiva própria sem política, dados e governança.

## 10.5 Policy & Approval Engine

Deve evoluir para políticas configuráveis e versionadas.

Exemplos:

- aprovação por valor;
- aprovação por categoria;
- aprovação por exceção;
- exigência de três propostas ou justificativa;
- segregação de funções;
- critérios obrigatórios;
- alçada por entidade;
- fallback e escalonamento;
- política vigente no momento da decisão preservada como snapshot.

Processos em andamento NÃO DEVEM mudar silenciosamente quando uma política é atualizada.

## 10.6 Executive Portfolio

Visão executiva deve ser uma consequência do sistema de registro, com:

- pipeline de RFQs;
- decisões pendentes;
- contratos por categoria;
- vencimentos;
- concentração de provedores;
- savings realizados;
- coverage de propostas;
- tempos de ciclo;
- gargalos de aprovação;
- aderência a políticas;
- riscos operacionais de renovação.

## 10.7 Multi-entity / Group Management

Para clientes maiores, o Arandu deve suportar grupo econômico sem misturar permissões.

Necessidades futuras:

- organização controladora;
- entidades legais;
- unidades;
- políticas globais vs. locais;
- usuários multi-entidade;
- contratos por entidade;
- consolidação executiva;
- isolamento de dados configurável;
- aprovações cruzadas.

Essa evolução deve ser desenhada antes de simplesmente adicionar `entity_id` em várias tabelas sem modelo coerente.

---

# 11. Proposal Intelligence

Proposal Intelligence é uma das maiores oportunidades de diferenciação do Arandu, desde que seja tratada como **extração e organização de fatos**, e não recomendação.

## 11.1 Capacidades permitidas

O sistema pode:

- ler documentos de proposta;
- extrair campos estruturados;
- sugerir mapeamento para o schema;
- detectar campos ausentes;
- mostrar divergências entre documento e formulário;
- comparar versões;
- destacar alterações materiais;
- identificar cláusulas para revisão humana;
- gerar perguntas de follow-up;
- apontar inconsistências numéricas;
- apresentar confiança de extração;
- solicitar confirmação humana antes de persistir campos sensíveis.

## 11.2 Regras de confiança

Campos extraídos por IA DEVERIAM armazenar:

- origem documental;
- trecho ou localização;
- modelo/versão quando relevante;
- confiança;
- usuário que confirmou;
- timestamp.

Campos críticos NÃO DEVEM ser silenciosamente gravados como “informados pelo provedor” sem confirmação ou proveniência.

## 11.3 Diferença entre inteligência e recomendação

Permitido:

> “A proposta B informa CET de 18,4% a.a.; a proposta A não informa CET.”

Permitido:

> “O prazo mudou de 24 para 36 meses entre v1 e v2.”

Permitido:

> “Com os pesos definidos pela sua empresa, a proposta X obtém maior pontuação, com cobertura de 92%.”

Proibido:

> “Escolha a proposta X.”

Proibido:

> “O Banco X é a melhor instituição para sua empresa.”

---

# 12. AI Analyst — diretrizes

A IA deve ser uma **camada assistiva** sobre dados e permissões existentes.

## 12.1 Usos prioritários

- resumir processo;
- explicar diferenças;
- montar briefing;
- transformar texto em RFQ estruturada;
- sugerir campos faltantes;
- preparar follow-ups;
- resumir contrato;
- explicar mudanças de versão;
- organizar tarefas;
- gerar executive summary factual;
- responder perguntas sobre dados da própria organização;
- identificar processos sem owner, vencimentos ou gaps;
- explicar cálculos e proveniência;
- gerar drafts de comunicação, nunca enviá-los sem autorização quando houver impacto externo.

## 12.2 IA não é autoridade

A IA NÃO DEVE:

- aprovar;
- rejeitar;
- decidir;
- executar contratação;
- assinar;
- recomendar instituição de forma autônoma;
- inventar benchmark;
- preencher dado ausente com suposição não explicitada;
- contornar RBAC/RLS;
- acessar dados de outro tenant;
- enviar informação confidencial a um provedor sem ação autorizada.

## 12.3 UX da IA

A interface DEVE diferenciar:

- dado original;
- cálculo determinístico;
- resumo gerado;
- sugestão;
- informação que requer confirmação.

A IA deve citar/ligar para os objetos que fundamentam sua resposta dentro do produto sempre que possível.

---

# 13. Expansão de categorias financeiras

A expansão deve seguir **reutilização do core + profundidade de domínio**.

## 13.1 Ordem recomendada

### Onda A — consolidar o existente

- crédito empresarial;
- adquirência e meios de pagamento.

### Onda B — adjacências com forte fit de procurement

- câmbio corporativo;
- hedge cambial simples / cotações estruturadas para comparação;
- garantias e fianças;
- seguros corporativos selecionados;
- serviços bancários / cash management.

### Onda C — gestão de fornecedores financeiros recorrentes

- cartões corporativos e despesas como contratação de fornecedor;
- bancos transacionais;
- cobrança e recebimento;
- gateways e antifraude como fornecedor;
- serviços de folha/pagamentos apenas no aspecto de procurement, sem execução de recursos pelo Arandu.

### Onda D — categorias de maior sensibilidade

- investimentos de caixa corporativo;
- operações estruturadas;
- derivativos mais complexos;
- crédito estruturado.

Essas categorias só devem avançar após revisão jurídica, desenho de limites e clareza sobre onde termina o software de procurement e começa atividade regulada.

## 13.2 Gate para um novo Product Pack

Uma nova categoria só deve entrar quando houver:

- usuário real e problema recorrente;
- schema da necessidade;
- schema da proposta;
- comparação factual possível;
- lifecycle pós-decisão;
- documentos típicos;
- regras de cálculo definidas;
- limites regulatórios documentados;
- testes de domínio;
- jornada E2E;
- design coerente com o core;
- hipótese de valor comercial.

---

# 14. Benchmarking e inteligência de mercado

Benchmarking é valioso, mas é um estágio posterior.

## 14.1 Requisitos mínimos

Nenhum benchmark agregado deve ser exibido antes de existir:

- volume estatisticamente razoável;
- política de anonimização;
- política de uso de dados contratualmente clara;
- revisão jurídica;
- proteção contra reidentificação;
- segmentação coerente;
- tratamento de outliers;
- data/vintage do benchmark;
- tamanho da amostra visível quando apropriado.

## 14.2 Formas preferíveis

- percentis de taxa por categoria e recorte;
- dispersão de propostas;
- tempo de resposta;
- taxas de cobertura;
- prazo de contratação;
- faixa histórica da própria empresa;
- benchmark contra o próprio histórico antes de benchmark externo.

O primeiro benchmark do Arandu deve ser **a própria memória da empresa**: “como este processo se compara às suas últimas contratações?”.

---

# 15. Dados, versionamento e proveniência

## 15.1 Imutabilidade lógica

Objetos que representam fatos históricos críticos não devem ser sobrescritos sem histórico:

- versões de proposta;
- decisões;
- aprovações;
- políticas aplicadas;
- contratos/aditivos;
- registros de savings;
- documentos relevantes.

## 15.2 Point-in-time

Decisões devem preservar a fotografia do que existia no momento:

- propostas elegíveis;
- versões;
- critérios;
- pesos;
- cobertura;
- aprovadores;
- política;
- justificativa.

## 15.3 Fonte do dado

Campos estruturados futuros deveriam suportar metadata de fonte:

- manual;
- provedor;
- importação;
- integração;
- documento;
- IA confirmada;
- cálculo determinístico.

## 15.4 Idempotência

Imports, webhooks, jobs e seeds devem ser idempotentes sempre que possível.

## 15.5 Datas e vintages

O sistema deve distinguir:

- quando o fato ocorreu;
- quando foi recebido;
- quando foi registrado;
- quando foi alterado;
- quando a fonte foi consultada.

---

# 16. Segurança, privacidade e autorização

## 16.1 Multi-tenancy

RLS no banco é a primeira linha de isolamento e NÃO DEVE ser substituída por filtragem apenas no front-end ou API.

## 16.2 Least privilege

- service role apenas em funções de servidor estritamente necessárias;
- cliente usa anon key + sessão;
- operações privilegiadas explicitamente separadas;
- finance_ops com MFA;
- provider nunca recebe dados de concorrente.

## 16.3 Storage

Documentos financeiros devem permanecer privados. Download deve ocorrer por autorização server-side e URL assinada curta.

## 16.4 Logs

Logs NÃO DEVEM conter:

- tokens;
- senhas;
- documentos completos;
- dados financeiros sensíveis desnecessários;
- PII além do mínimo operacional.

## 16.5 Segurança por teste

Cada nova superfície deve adicionar testes negativos para:

- outsider;
- membro de outra organização;
- provedor concorrente;
- papel insuficiente;
- sessão inválida;
- objeto inexistente;
- replay quando relevante.

## 16.6 Fail closed

Na dúvida de configuração, autorização ou ambiente, o sistema deve falhar fechado.

---

# 17. Arquitetura de software

## 17.1 Uma base de código

Demo, pilot e production devem continuar sendo a mesma aplicação e o mesmo código de domínio. Divergência de ambiente deve vir de configuração, dados e infraestrutura, nunca de forks funcionais.

## 17.2 Modularidade por domínio

Novas features devem preferir módulos coesos e APIs claras. Evitar um novo “mega app.js” ou lógica de domínio misturada a renderização.

## 17.3 Domínio no servidor

Regras críticas devem ser validadas no servidor/banco. Front-end pode melhorar UX, mas não deve ser a única barreira para:

- permissão;
- transição de estado;
- aprovação;
- decisão;
- cálculo crítico;
- acesso a documento.

## 17.4 Product Packs

Campos e regras específicas de categoria devem viver em estruturas extensíveis. Não duplicar RFQ/proposal/decision/contract por produto.

## 17.5 Dependências

Adicionar dependência nova apenas quando:

- resolve problema real;
- reduz complexidade total;
- tem manutenção adequada;
- não aumenta superfície de risco de forma desproporcional;
- cabe no budget de bundle/runtime.

---

# 18. Ambientes, branches e promoção

## 18.1 Código canônico

A `main` é a versão canônica do produto. Demo e production usam `main` com ambientes diferentes.

## 18.2 Fluxo de mudança recomendado

Para preservar um gate de staging/piloto, o padrão futuro DEVERIA ser:

`feature/* -> pilot -> main`

Interpretação:

- features nascem de uma base alinhada com `pilot`;
- PR entra em `pilot` após testes;
- `arandu-pilot` valida ambiente real de staging/piloto;
- promoção `pilot -> main` libera a mesma base para demo e production;
- `main` permanece a verdade do produto publicado;
- hotfix nasce de `main`, volta a `main` e depois é reconciliado em `pilot`.

Isso resolve a aparente tensão entre “main é a demo/prod canônica” e “pilot é gate de promoção”.

## 18.3 Exceções

PR direta `feature -> main` deve ser exceção documentada, não padrão silencioso.

## 18.4 Ambientes

- **demo**: `main` + `ARANDU_ENV=demo` + Supabase DEMO;
- **pilot**: `pilot` + `ARANDU_ENV=pilot` + Supabase PILOT;
- **production**: `main` + `ARANDU_ENV=production` + Supabase PROD.

Nenhum banco deve ser compartilhado entre ambientes.

---

# 19. Migrations e banco

Toda migration nova DEVE:

- ser aditiva sempre que possível;
- ter rollback quando tecnicamente plausível;
- entrar no manifesto;
- ter ordem determinística;
- ter teste de clean install;
- ter teste de upgrade;
- ter teste de rollback/reapply quando relevante;
- preservar RLS e grants;
- evitar defaults ou triggers que vazem entre tenants;
- evitar alterações destrutivas sem migração em fases.

Mudanças destrutivas devem seguir padrão expand/migrate/contract, nunca “ALTER e torcer”.

---

# 20. UX e design system

## 20.1 Princípio de interface

O Arandu deve parecer um **workspace corporativo moderno**, não um site institucional depois do login.

Referências conceituais úteis incluem produtos que valorizam hierarquia, densidade controlada, command palette, objetos, estados e ações — mas o design não deve copiar uma marca específica.

## 20.2 Gramática universal

Sempre que possível, o usuário deve entender:

**estado -> próxima ação -> por quê -> prazo -> responsável**

Essa gramática deve aparecer em:

- home;
- listas;
- quick views;
- objeto detalhado;
- aprovações;
- notificações;
- busca.

## 20.3 Arquitetura de navegação

Direção recomendada:

- **Meu trabalho**: precisa de você, tarefas, aprovações, follow-ups;
- **Processos**: RFQs, propostas, contratos, renovações;
- **Rede**: provedores e relacionamentos;
- **Gestão**: perfil financeiro, políticas, integrações, usuários, auditoria.

## 20.4 Progressive disclosure

A tela deve mostrar primeiro o necessário para agir e deixar detalhes avançados acessíveis sem sobrecarregar.

## 20.5 Quick view / inspector

Listas operacionais devem permitir inspeção sem perder contexto quando isso reduzir navegação e tempo de trabalho.

## 20.6 Aprovações

Aprovar é uma decisão, não um botão de tabela. O usuário deve ver contexto suficiente antes da ação.

## 20.7 Comparação

A comparação deve ser um workspace de decisão:

- diferenças primeiro;
- campos ausentes visíveis;
- cobertura;
- proveniência;
- versões;
- filtros de critérios;
- pesos do usuário;
- sem recomendação do Arandu.

## 20.8 Mobile

Mobile deve suportar ações relevantes e leitura, mas não precisa reproduzir densidade desktop. Bottom sheets, stack vertical e seleção 2-a-2 são preferíveis a tabelas impossíveis de ler.

## 20.9 Acessibilidade

DEVE haver:

- navegação por teclado;
- foco visível;
- targets adequados;
- labels;
- contraste;
- reduced motion;
- sem dependência exclusiva de cor;
- sem horizontal overflow não intencional.

---

# 21. Integrações

Integrações devem reduzir duplicidade de trabalho e aumentar qualidade do dado.

## 21.1 Prioridades

1. SSO / SCIM para empresas maiores;
2. e-mail transacional confiável;
3. Slack / Microsoft Teams para notificação e deep link;
4. ERP / contabilidade / TMS para contexto e cadastro;
5. Open Finance para dados autorizados da própria empresa;
6. APIs de provedores quando trouxerem propostas/estados de forma segura;
7. assinatura eletrônica como integração externa, sem o Arandu se tornar signatário;
8. data warehouse / BI exports;
9. API pública e webhooks.

## 21.2 Regra de ação externa

Notificações externas podem levar o usuário ao Arandu. Ações materiais — aprovar, decidir, compartilhar informação confidencial — deveriam ocorrer dentro de um contexto autenticado do produto, salvo desenho explícito e seguro.

---

# 22. Open Finance

Open Finance pode ser útil como fonte autorizada, não como justificativa para transformar Arandu em banco.

Usos legítimos futuros:

- preencher perfil financeiro;
- validar dados declarados;
- construir histórico de recebimentos;
- reduzir documentos manuais;
- contextualizar necessidade de caixa;
- medir resultado pós-contrato;
- suportar cenários.

Toda informação importada deve guardar consentimento/escopo/origem/data e respeitar minimização de dados.

---

# 23. Analytics e métricas de produto

## 23.1 Métricas de valor para o cliente

- tempo da necessidade à RFQ publicada;
- tempo para primeira resposta;
- response rate por processo;
- cobertura média de propostas;
- tempo de negociação;
- tempo de aprovação;
- tempo até decisão;
- contratos com renovação monitorada;
- renovações iniciadas antes do prazo crítico;
- savings realizados com metodologia;
- taxa de processos com trilha completa;
- redução de follow-ups manuais quando mensurável.

## 23.2 Métricas de saúde do SaaS

- organizações ativas;
- usuários ativos por função;
- RFQs criadas e concluídas;
- contratos ativos;
- retenção por organização;
- profundidade de uso por módulos;
- ativação: organização -> primeiro processo completo;
- tempo para valor;
- expansão de seats/entidades/categorias;
- uso do portal do provedor;
- erros e latência.

## 23.3 Métricas que não devem virar vaidade

Número bruto de telas, quantidade de integrações ou total de features não representam sucesso se não aumentarem processos completos, recorrência, retenção e confiança.

---

# 24. Produto comercial e packaging

O Arandu deve ser vendido como software, não como promessa de obter “a melhor taxa”.

Eixos naturais de packaging futuros:

- número de entidades;
- número de usuários;
- módulos/categorias habilitadas;
- volume de processos;
- integrações;
- SSO/SCIM;
- analytics avançado;
- API;
- retenção/auditoria avançada;
- suporte e SLA.

O modelo comercial NÃO DEVERIA depender exclusivamente de comissão por transação, pois isso pode criar conflito com a neutralidade do produto. Qualquer remuneração ligada a provedor ou contratação deve ser transparente, juridicamente revisada e claramente separada de lógica de comparação.

---

# 25. Roadmap por ondas

O roadmap abaixo é uma **sequência de maturidade**, não uma promessa de calendário.

## Onda 0 — Fechar a fundação atual

Objetivo: tornar a baseline da PR #90 verdade operacional.

Entregas:

- CI completamente verde no head da `main`;
- Supabase DEMO dedicado;
- migration `financial-approval-handoff-1` aplicada em pilot e production;
- `arandu-demo` com `ARANDU_ENV=demo` e banco correto;
- seed real da Vitta Foods;
- doctor/canary/restore onde aplicável;
- ref DEMO registrado nos guards;
- sandbox legado removido depois da migração;
- branch governance reconciliada;
- este documento versionado no repositório e referenciado por `CLAUDE.md`.

## Onda 1 — Financial Procurement Management

Objetivo: aumentar recorrência e profundidade sem expandir muitas categorias.

Prioridades:

1. Financial Profile / Passport;
2. Contract & Renewal Center;
3. Savings Ledger;
4. Provider Relationship Management;
5. Policy & Approval Engine versionado;
6. Executive Portfolio;
7. multi-entity foundation;
8. templates e intake configuráveis;
9. tarefas/follow-ups e notificações mais inteligentes.

## Onda 2 — Intelligence

Objetivo: reduzir trabalho manual e transformar o histórico em vantagem.

Prioridades:

1. document/proposal ingestion;
2. Proposal Intelligence;
3. diff semântico de versões;
4. AI Analyst factual;
5. insights baseados no histórico da própria empresa;
6. analytics de ciclo e fornecedor;
7. benchmark externo somente quando os gates de dados permitirem.

## Onda 3 — Novas categorias

Objetivo: ampliar wallet share usando o mesmo core.

Ordem preferencial:

1. FX/câmbio;
2. garantias/fianças;
3. cash management e serviços bancários;
4. seguros corporativos selecionados;
5. cartões/expense providers;
6. outras categorias após validação.

## Onda 4 — Ecosystem OS

Objetivo: integrar o Arandu ao stack corporativo e criar switching costs positivos.

- SSO/SCIM;
- ERP/TMS/accounting;
- Open Finance;
- Slack/Teams;
- API/webhooks;
- assinatura externa;
- provider APIs;
- data warehouse;
- network intelligence com privacy by design.

---

# 26. Framework de priorização

Toda iniciativa relevante deve ser avaliada pelas perguntas abaixo.

| Dimensão | Pergunta |
| --- | --- |
| Dor | Resolve um problema real e recorrente de uma equipe financeira? |
| Recorrência | Aumenta uso semanal/mensal ou só adiciona uma tela rara? |
| Profundidade | Completa melhor um workflow existente? |
| Dados | Cria histórico estruturado reutilizável? |
| Governança | Melhora decisão, trilha, política ou controle? |
| Diferenciação | Faz algo difícil de reproduzir com e-mail + planilha? |
| Reuso | Serve a mais de uma categoria ou persona? |
| Segurança | Preserva isolamento, mínimo privilégio e auditabilidade? |
| Neutralidade | Mantém a decisão com o cliente? |
| Operação | É testável, observável e suportável? |
| Complexidade | O valor compensa dívida técnica e cognitiva? |
| Comercial | Melhora ativação, retenção, expansão ou disposição a pagar? |

Features que pontuam alto em “wow” e baixo em workflow, dados e recorrência deveriam ser adiadas.

---

# 27. Lifecycle de uma feature

## 27.1 Descoberta

Antes de implementar:

- definir usuário;
- problema;
- comportamento atual;
- dado necessário;
- objeto afetado;
- estado inicial/final;
- permissões;
- risco;
- métrica de sucesso;
- o que explicitamente fica fora.

## 27.2 Design

Deve incluir:

- fluxo principal;
- empty state;
- loading;
- erro;
- permissão negada;
- mobile;
- teclado;
- audit trail;
- notificações;
- impacto em documentos/dados;
- rollback/migration se houver.

## 27.3 Implementação

Ordem preferida:

1. modelo e contratos;
2. autorização;
3. domínio;
4. API;
5. UI;
6. instrumentação;
7. testes negativos;
8. E2E;
9. documentação;
10. evidência visual.

## 27.4 Validação

Nunca considerar “pronto” apenas porque a UI parece funcionar.

---

# 28. Definition of Done

Uma mudança relevante só está pronta quando, conforme aplicável:

- requisito de produto está documentado;
- limites foram respeitados;
- RLS/RBAC testados;
- API valida permissão;
- migrations estão no manifesto;
- rollback existe ou a ausência está justificada;
- `check:all` passa;
- build passa;
- budgets passam;
- E2E da jornada passa;
- banco passa;
- navegadores suportados passam no CI;
- mobile foi verificado;
- console não tem erro novo;
- não há overflow horizontal;
- textos não fazem alegação proibida;
- audit trail registra o necessário;
- docs canônicas foram atualizadas;
- evidência foi anexada ao PR;
- mudanças externas não são declaradas feitas sem prova.

---

# 29. QA e testes

## 29.1 Pirâmide prática

- testes puros para domínio e cálculos;
- testes de contrato/API;
- testes de banco para RLS, funções e migrations;
- E2E para jornadas reais;
- visual/regression evidence para superfícies críticas.

## 29.2 Casos negativos obrigatórios

- sem sessão;
- outro tenant;
- provedor concorrente;
- papel incorreto;
- estado inválido;
- versão antiga;
- campo ausente;
- dado malformado;
- replay/idempotência quando aplicável;
- ambiente incorreto.

## 29.3 Cross-browser

CI deve continuar cobrindo Chromium, Firefox e WebKit quando a matriz suportada assim exigir. Não reduzir browsers para “ficar verde”.

---

# 30. Performance

O Arandu deve permanecer rápido mesmo com histórico crescente.

Diretrizes:

- evitar N+1;
- paginação e filtros server-side onde necessário;
- índices baseados em queries reais;
- budgets de bundle;
- lazy load de módulos pesados;
- anexos fora do bundle;
- observabilidade de queries e funções críticas;
- não trazer dados de toda a organização para filtrar no navegador.

Dashboards devem ter limites previsíveis de consultas e não crescer linearmente de forma invisível com o número de RFQs.

---

# 31. Documentação como parte do produto

A documentação deve ter uma hierarquia canônica e evitar documentos concorrentes.

## 31.1 Documentos normativos

Este documento deve ser a referência estratégica principal. Documentos técnicos existentes continuam especializados em:

- limites do produto;
- segurança;
- threat model;
- data model;
- UI architecture;
- deployment;
- pilot operations;
- migrations.

## 31.2 Regra para agentes de IA

`CLAUDE.md` (e arquivos equivalentes para outros agentes) DEVE apontar para este guideline e dizer explicitamente que qualquer feature nova precisa respeitá-lo.

## 31.3 Atualização

Mudança de tese, limite, arquitetura de ambientes ou papel da IA exige atualização deste documento no mesmo PR ou em PR imediatamente anterior.

---

# 32. Anti-patterns proibidos

NÃO FAZER:

- criar uma segunda implementação de comparação;
- criar um “demo engine” separado do produto real;
- esconder feature incompleta atrás de UI convincente e chamar de pronta;
- duplicar entidades por categoria financeira;
- colocar lógica crítica apenas no browser;
- inserir service role no cliente;
- criar ranking default de provedores;
- inventar savings;
- mostrar “recommended” sem decisão humana;
- aplicar migration manual fora do manifesto e esquecer o código;
- compartilhar Supabase entre ambientes;
- usar dados reais na demo;
- adicionar product pack sem lifecycle pós-decisão;
- construir uma integração sem source-of-truth e idempotência;
- transformar notificações em spam;
- criar dashboard sem ações;
- criar IA sem proveniência;
- fazer “big bang refactor” sem necessidade;
- reabrir a vertical de arte no produto financeiro;
- expandir para consumidor antes de consolidar B2B.

---

# 33. Próximos passos concretos a partir de 1º de outubro de 2026

## Passo 1 — concluir a PR #90 operacionalmente

- confirmar todos os jobs do CI verdes;
- confirmar estados finais dos três projetos Vercel;
- não tratar pending como sucesso.

## Passo 2 — criar/configurar o Supabase DEMO dedicado

- projeto separado;
- clean install pelo manifesto;
- marcador `deployment_environment=demo`;
- storage privado;
- sem dados reais.

## Passo 3 — atualizar pilot e production

Aplicar `docs/supabase-financial-approval-handoff.sql`, validar `schema_version=financial-approval-handoff-1` e rodar doctor.

## Passo 4 — migrar `arandu-demo` para a demo real

Definir:

- `ARANDU_ENV=demo`;
- `SUPABASE_URL` DEMO;
- `SUPABASE_ANON_KEY` DEMO;
- `SUPABASE_SERVICE_ROLE_KEY` DEMO;
- `CRON_SECRET` adequado;
- `ARANDU_SITE_URL` correto;
- remover `ARANDU_DEPLOYMENT_KIND` legado.

## Passo 5 — executar e validar o seed canônico

Rodar `demo:seed`, `demo:check` e jornada E2E com as personas fictícias.

## Passo 6 — registrar o ref DEMO nos guards

Adicionar o ref em `DEMO_SUPABASE_REFS` por PR e testar fronteiras negativas.

## Passo 7 — retirar o sandbox legado

Somente depois de a demo real estar estável. Remover engine, build legado, testes e docs que não tenham mais função. Fazer em PR própria para rollback simples.

## Passo 8 — resolver governança de branches

Atualizar `CLAUDE.md`, `CONTRIBUTING.md` e `FINANCIAL_DEPLOYMENT_WORKFLOW.md` para o modelo canônico: `feature/* -> pilot -> main`, com main sendo código canônico de demo/prod.

## Passo 9 — versionar este guideline no repositório

Caminho recomendado:

`docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md`

E referenciá-lo em:

- `README.md`;
- `CLAUDE.md`;
- `CONTRIBUTING.md`;
- `docs/OPERATIONS_INDEX.md`.

## Passo 10 — iniciar a Onda 1

Primeiro grande lote recomendado:

1. Financial Profile / Passport v2;
2. Contract & Renewal Center v2;
3. Savings Ledger v1;
4. Provider Relationship Management v1;
5. Policy/Approval Engine v2;
6. Executive Portfolio v1.

A Onda 1 deve aumentar o uso recorrente antes de adicionar FX, seguros ou outras categorias.

---

# 34. Sequência recomendada da Onda 1

## 34.1 Primeiro: Financial Profile v2

Motivo: alimenta intake, comparação, integrações futuras e reduz retrabalho.

Entregas mínimas:

- entidades;
- perfil reutilizável;
- documentos reutilizáveis;
- metadata de fonte/validade;
- permissões;
- preenchimento seletivo de RFQ;
- coverage do perfil.

## 34.2 Segundo: Contract & Renewal Center v2

Motivo: gera recorrência natural e transforma Arandu em sistema contínuo, não episódico.

## 34.3 Terceiro: Savings Ledger

Motivo: cria prova de ROI, desde que rigorosamente metodológico.

## 34.4 Quarto: Provider Relationship Management

Motivo: cria memória institucional e valor acumulado por uso.

## 34.5 Quinto: Policy Engine

Motivo: aumenta fit com empresas maiores e reduz processos paralelos.

## 34.6 Sexto: Executive Portfolio

Motivo: só deve consolidar depois de contratos, savings e provider data estarem estruturados.

---

# 35. Critério para iniciar Intelligence / IA

A camada de Intelligence deve começar quando:

- o core de documentos estiver sólido;
- proposta versionada for confiável;
- proveniência de campos existir;
- autorização de documentos estiver madura;
- houver dados suficientes para validar extração;
- o produto já conseguir funcionar sem IA.

IA deve acelerar um bom workflow, nunca mascarar um workflow ruim.

---

# 36. Critério para expansão de categoria

Antes de adicionar FX, garantias ou seguros, responder “sim” a:

- O usuário volta ao Arandu regularmente com crédito/adquirência e lifecycle?
- O core suporta template/schema sem fork de produto?
- Contratos e renovações estão maduros?
- Policy engine suporta a nova categoria?
- O provider model é reutilizável?
- Existe clareza jurídica?
- Existe comprador potencial real?
- O novo pack aumenta receita/retention sem dispersar a equipe?

Se a maioria for “não”, aprofundar o core primeiro.

---

# 37. Instruções permanentes para agentes de IA que alterem o Arandu

Antes de implementar qualquer pedido:

1. ler este documento;
2. ler `FINANCIAL_PRODUCT_BOUNDARIES.md`;
3. identificar objetos e módulos já existentes;
4. evitar duplicação;
5. listar explicitamente o que não será alterado;
6. preservar RLS/RBAC/MFA;
7. preservar decisão humana;
8. preservar separação demo/pilot/prod;
9. usar migration aditiva e testes se houver banco;
10. provar a mudança com testes e evidência.

Durante a implementação:

- preferir extensão a reconstrução;
- não remover guardas para facilitar teste;
- não criar bypass de autenticação;
- não inventar dados ou claims;
- não confundir mock com produção;
- não declarar deploy externo realizado sem evidência;
- não fazer vários pushes pequenos sem necessidade;
- manter escopo da PR coeso.

Antes de abrir/mergear PR:

- `npm run audit:ci`;
- `npm run check:all`;
- `npm run build`;
- checks de assets/size/SEO/surface/navigation;
- testes da área;
- `test:database` para SQL;
- E2E para UI/fluxo;
- `git diff --check`;
- revisar claims e textos;
- atualizar docs;
- anexar before/after quando visual;
- registrar riscos, rollback e dependências humanas.

---

# 38. Template de avaliação de uma nova feature

Toda proposta de feature relevante deveria responder:

**Problema**  
Que trabalho corporativo real está fragmentado, manual, lento ou sem governança?

**Usuário**  
Quem sente esse problema?

**Objeto**  
Qual objeto canônico será criado ou alterado?

**Workflow**  
Qual é o estado inicial, transições e estado final?

**Dado**  
Quais campos entram, de onde vêm e como são versionados?

**Permissão**  
Quem pode ler, criar, alterar, aprovar e compartilhar?

**Decisão**  
A empresa continua controlando decisão e critérios?

**Integração**  
Existe source-of-truth externo? Como idempotência será garantida?

**Métrica**  
Como saberemos se gerou valor?

**Risco**  
Segurança, privacidade, regulatório, dívida técnica e UX.

**Fora de escopo**  
O que deliberadamente não será feito nesta rodada?

---

# 39. Template de PR de produto

Toda PR relevante deveria conter:

- problema;
- solução;
- objetos afetados;
- impacto ao usuário;
- impacto operacional;
- segurança e privacidade;
- banco/migrations;
- validação executada;
- evidência visual quando aplicável;
- evidências externas separadas de validação local;
- risco;
- rollback;
- ações humanas restantes;
- docs atualizadas;
- declaração explícita sobre limites do produto quando a feature tocar cálculos, comparações, IA, dados financeiros ou integrações.

---

# 40. Decisões estratégicas que exigem revisão deste documento

Revisar formalmente esta guideline antes de:

- oferecer produto para pessoa física;
- executar pagamentos;
- custodiar fundos;
- conceder crédito;
- cobrar success fee que possa afetar neutralidade;
- criar marketplace aberto de produtos financeiros;
- gerar recomendação automatizada;
- introduzir decisão por IA;
- compartilhar dados agregados com provedores;
- criar benchmark externo;
- entrar em investimentos/derivativos complexos;
- mudar topologia de ambientes;
- abandonar RLS como isolamento principal;
- criar uma segunda base de código para demo;
- mudar o modelo de branches;
- armazenar dados em provedores de IA de forma persistente.

---

# 41. North Star do Arandu

A North Star não é “quantos produtos financeiros o Arandu suporta”.

É:

> **Quantos processos financeiros corporativos relevantes uma empresa consegue executar e administrar no Arandu, de ponta a ponta, com dados confiáveis, concorrência, governança, decisão humana, contrato, renovação e memória institucional — sem voltar para planilhas, e-mails e decisões sem trilha.**

O produto vence quando o cliente sente que remover o Arandu faria sua operação financeira voltar a ser fragmentada e opaca.

---

# 42. Regra final

Em qualquer dúvida sobre uma evolução, priorizar esta sequência:

**fortalecer o core -> aumentar recorrência -> estruturar dados -> automatizar trabalho -> gerar inteligência -> integrar ecossistema -> expandir categorias.**

Nunca inverter essa ordem apenas para produzir uma demo mais impressionante.

---

# Apêndice A — Matriz de módulos futuros

| Módulo | Horizonte | Valor primário | Dependência principal | Risco principal |
| --- | --- | --- | --- | --- |
| Financial Profile v2 | Onda 1 | reuso de dados | entidades/permissões | dado desatualizado |
| Contract Center v2 | Onda 1 | recorrência | contratos | lifecycle incompleto |
| Savings Ledger | Onda 1 | prova de ROI | baseline/metodologia | savings inventado |
| Provider RM | Onda 1 | memória institucional | provider model | score subjetivo |
| Policy Engine v2 | Onda 1 | governança | approvals | política mudar processo antigo |
| Executive Portfolio | Onda 1 | gestão | dados estruturados | dashboard sem ação |
| Proposal Intelligence | Onda 2 | automação | documentos/proveniência | extração errada |
| AI Analyst | Onda 2 | produtividade | dados + RBAC | recomendação indevida |
| Benchmark interno | Onda 2 | inteligência | histórico | amostra pequena |
| Benchmark externo | Onda 2+ | inteligência de mercado | volume + anonimização | reidentificação |
| FX Product Pack | Onda 3 | expansão | procurement core | complexidade regulatória |
| Guarantees Pack | Onda 3 | expansão | provider/contract | documentação específica |
| Cash Management Pack | Onda 3 | expansão | profile/integrations | escopo virar banking |
| Insurance Pack | Onda 3 | expansão | lifecycle | intermediação/regulação |
| SSO/SCIM | Onda 4 | enterprise readiness | IAM | configuração |
| ERP/TMS | Onda 4 | redução de retrabalho | integrations | source-of-truth |
| Open Finance | Onda 4 | dados autorizados | consent/data model | privacidade |
| Public API/Webhooks | Onda 4 | ecossistema | auth/idempotency | abuso/vazamento |

---

# Apêndice B — Checklist rápido antes de dizer “sim” a uma ideia

- É B2B?
- Resolve trabalho financeiro real?
- Reutiliza o core?
- Aumenta recorrência ou profundidade?
- Cria dados estruturados úteis?
- Mantém decisão humana?
- Tem proveniência?
- É autorizável por tenant/papel?
- Tem lifecycle completo?
- É testável?
- Tem rollback?
- Evita nova superfície regulada?
- Melhora retenção ou valor comercial?
- É melhor do que aprofundar um módulo já existente?

Se várias respostas forem “não”, a ideia não deve entrar no roadmap agora.

---

# Apêndice C — Referências canônicas existentes no repositório

Este documento foi elaborado para complementar, e não substituir, os documentos especializados existentes na `main`:

- `README.md`;
- `CLAUDE.md`;
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

Em caso de conflito técnico, o documento mais específico rege a implementação concreta; em caso de conflito de direção de produto, esta guideline rege até que seja atualizada por decisão explícita.
