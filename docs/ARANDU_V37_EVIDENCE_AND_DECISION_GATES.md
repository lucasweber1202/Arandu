# Arandu v3.7 — Evidências, experimentos, padrões de qualidade e gates de decisão

**20/10/2026 · Instrumento de avaliação subordinado à guideline §§39–44.** **Sem observações comerciais inventadas.** Todos os números nesta página são metas de pesquisa/aceite sugeridas, nunca estatística do mercado, SLA ou promessa a prospects. Documentos de prova por rodada devem ser versionados e registrar SHA, data, ambiente, método e limitações; não inserir dados pessoais, credenciais ou arquivos financeiros de terceiros no Git.

## 1. Quatro provas independentes

1. **Código:** requisito implementado, teste positivo/negativo, CI HEAD exata; M1/M2 segundo §5.
2. **Ambiente/operação:** serviço real em ambiente especificado, Auth/RLS/Storage, disponibilidade, recovery/restore, autoria e identidade; M3–M5 conforme gates próprios. URL pública M2 NÃO atesta Demo canônica hospedada.
3. **Usabilidade:** pessoa da persona alvo conclui tarefa com dados fictícios, sem ajuda excessiva; registrar erros, tempo e linguagem utilizada. Não é M6 por mera presença do usuário.
4. **Mercado:** episódio e dor real, workaround atual, repetição, processo de compra, dono de budget e evidência de interesse/retorno/WTP. Não declarar customer-validated por elogio, opinião de um avaliador, PR aprovada ou hipótese de segmentos.

Rubrica de status separada: `HYPOTHESIS`, `RESEARCHED`, `TESTED_SYNTHETIC`, `TESTED_USER`, `PILOT_EVIDENCED`, `CUSTOMER_VALIDATED`, `REJECTED`, `DEFERRED`. Estados comerciais NÃO substituem M0–M6. Qualquer publicação de evidência deve explicar denominador, seleção de participantes, tarefa, ambiente, limitações e data.

## 2. Hipóteses estratégicas registradas (não fatos)

| ID | Hipótese falsificável | Experimento mais barato | Sinal de continuação | Sinal de reversão/pivô |
| --- | --- | --- | --- | --- |
| H37-ICP | Gestão de empresas médias é porta comercial mais viável | 4 entrevistas por porte e tarefas com compradores | dor frequente + primeiro valor + processo de compra identificável | pequeno ou grande demonstra caso de uso mais forte, ou médios não veem ganho |
| H37-BUYER | Contrato/relacionamento cria utilidade sem adesão bancária | cadastro e revisão de contrato fictício | próximo trabalho e dados recuperáveis sem bancar onboarding | custo de preenchimento supera benefício percebido |
| H37-ACQ | Adquirência pode ser caso de negociação prioritário | demonstrar contrato, mix, comparação e renovação | tarefas comparáveis e recorrentes | dados insuficientes, não comparabilidade ou pouca relevância |
| H37-CREDIT | Crédito justifica sourcing estruturado | observar negociação anterior e demo controlada | menos coordenação e versões perdidas | comparação frágil e instituição recusa canal |
| H37-PROVIDER | Banco aceita responder quando esforço é menor | 5–6 entrevistas banco/fintech/adquirente e teste guiado | instituição entende e responde/recusa sem depender de full signup | fricção/segurança/processo impedem resposta |
| H37-EXTERNAL | Proposta recebida fora do portal desbloqueia adoção | revisão manual de resposta fictícia e teste de reconciliação | canal externo vira registro com proveniência sem retrabalho injustificável | transcrição introduz erros ou custo alto |
| H37-PASSPORT | Dossiê reutilizável reduz pedido repetido | perguntar campos/documentos realmente aceitos em 3 fluxos fictícios | parte das evidências efetivamente reaproveitada pela contraparte | banco refaz tudo ou risco regulatório inviabiliza |
| H37-CENTER | Central de relações fecha ciclo e aumenta retorno | testar dashboard por instituição usando dados existentes | tarefas de contrato/fee/RFQ acessíveis com menos passos | apenas mais uma tela duplicada |
| H37-TIERS | Três ofertas configuráveis melhoram encaixe sem fragmentar core | card-sorting/landing test sem cobrança | mensagens distintas compreendidas e sem necessidade de forks | confusão de preços ou custo de suporte inviável |
| H37-MONEY | Buyer-paid preserva alinhamento e é monetizável | entrevistas de budget, proposta não vinculante e intenção de piloto | buyer identifica aprovador, verba e valor de trabalho | buyer não paga ou custos superam retenção |

Todas exigem revisitar tamanho de mercado, aquisição, margem e custo de servir antes de estimar investimento/receita. Não extrapolar entrevistas pequenas para população. Não usar dados de concorrentes como evidência dos indicadores do Arandu.

## 3. Protocolo de pesquisa com compradores

**Amostra inicial sugerida (não representativa):** 12 conversas, quatro por segmento, diversificando bancos utilizados, volume de contratos, setor e maturidade de tesouraria. Além de entrevista, ao menos uma tarefa observada com fixtures por participante quando viável.

**Sequência de 30–45 min (ajustável):**
1. Pedir um episódio real recente: último contrato renovado, comparação de taxas ou negociação com banco; ferramentas, pessoas, calendário e bloqueios.
2. Quantificar sem recolher documentos: tempo aproximado, retrabalho, perda de versão, autorizações e consequência observada.
3. Mostrar duas rotas do Arandu, sem explicar o caminho correto: contrato→próxima ação; RFQ→comparação/decisão.
4. Registrar a fala espontânea, hesitação, erros, passos extras, termos incompreensíveis e se ainda usaria Excel/e-mail ao lado.
5. Perguntar quais dados de terceiros aceitaria confiar e o que exigiria verificar novamente.
6. Identificar quem contrata, quem paga, como passa segurança/jurídico, se aceitaria piloto limitado e próximos passos concretos.
7. Comparar com alternativa efetivamente utilizada; deixar opção "não pagaria" legítima.

Não perguntar só "gostou?", "qual feature gostaria?" ou "pagaria R$ X?" como prova suficiente. Registrar comportamento e compromisso concreto; hipótese rejeitada não vira feature cosmética.

## 4. Protocolo com instituições financeiras

**Amostra inicial sugerida:** 5–6 participantes de banco comercial/corporate, financeira/fintech e adquirência; funções comercial, operações e, quando permitido, crédito/compliance. Nenhuma oportunidade real sensível deve ser enviada sem contrato e base jurídica.

**Roteiro:**
- Como recebe hoje demandas de empresas? Quais as etapas até preço/proposta? O que pode ou não ficar fora do CRM?
- Que campos são indispensáveis para saber se uma demanda vale analisar? E quais só após NDA/onboarding?
- O que pode ser declarado pela empresa e o que exige verificação interna? Quais documentos/versões são reutilizáveis?
- O banco aceitaria link seguro? Preferiria e-mail/PDF? O que faria abandonar o fluxo ou bloquear por segurança?
- Quem dentro do banco poderia ver a RFQ e responder? Como funcionam revisão, alçadas e histórico?
- Em que ponto retornaria ao Arandu? Como um CRM export, modelos ou notificação ajudariam?
- Quais dados do resultado nunca deveriam ser compartilhados? Que estados de processo são aceitáveis ao comprador?
- Algum incentivo econômico, organização ou processo torna a participação recorrente sem subsídio?
- Teste guiado com RFQ fictícia: abrir, recusar ou responder, revisar informação e explicar confiança da origem.

**Nunca confundir:** resposta de comercial é aprovação de integração por TI/compliance; aceitação de documento é aceitação de risco de crédito; interesse verbal é contrato assinado.

## 5. Métricas de experiência e operação

| Indicador | Definição e cautela |
| --- | --- |
| Time to first value | início da sessão → primeira ação útil persistida, declarando se sintético ou real; se só tour, "primeira compreensão", não valor persistido |
| Conclusão sem ajuda | usuários que finalizam tarefa predeterminada ÷ usuários que tentaram, com denominador e contexto |
| Esforço líquido | minutos/etapas eliminados menos preenchimento, conferência, suporte e duplicação com sistemas atuais; não inferir economia monetária |
| Tempo por fluxo | RFQ preparada, proposta preenchida e contrato registrado, com insumos disponíveis e sem insumos como casos distintos |
| Qualidade de dados | proporção de campos com fonte, documento disponível quando requerido, data econômica e revisão pendente |
| Resposta institucional | instituições únicas que enviaram resposta em prazo ÷ convites elegíveis entregues; distinguir aceite, recusa e externo |
| Adoção bilateral | empresas que retornam + instituições que retornam em novos processos; separar convites de participação repetida |
| Reconciliação externa | propostas transcritas e confirmadas sem divergência material ÷ propostas externas registradas e revisadas |
| Retenção | organizações com trabalho recorrente em janelas definidas; não contar mero login em Demo |
| Qualidade de decisões | versão preservada, aprovador autorizado, documento e cobertura visíveis; não inferir melhor resultado financeiro |
| Incidentes e falhas | taxa de erros elegíveis, time-to-detect, recuperação real e impacto por persona, sem PII em log |
| Custo de serviço | onboarding, revisão manual, armazenamento, processamento de documento, conectores, suporte por segmento |

**Metas de teste de compreensão, a revisar:** contrato+ação em até 10 min, RFQ simples com dados disponíveis em até 10 min, resposta com proposta preparada em até 15 min; não divulgar como benchmark ou sucesso já alcançado. As metas de Web Vitals e API (§38.7) são somente alvos de engenharia.

## 6. Definição de pronto por nível e segmento

**Entrega de UX:** screenshot antes/depois no produto canônico, estados vazio/completo/erro, mobile 390px, desktop 1440px, teclado, foco, contraste, zoom, sem overflow e sem ação falsa. **Entrega de domínio:** invariantes financeiras, source, unidade, versão, RLS/roles, estados negativos, persistência/idempotência, concorrência e rollback. **Entrega de integração:** direito de acesso, escopo, consentimento quando aplicável, rotação/revogação, retries, reconciliação, auditoria, modo degradado, custo e suporte. **Entrega hospedada:** SHA, ambiente, identidade, bancos corretos, smoke externo, Auth/RLS/Storage, recovery e gates da maturidade. **Entrega comercial:** usuário observado, caso de uso identificado, registro de alternativa e resultado, plano de suporte/billing/legal aprovado se efetivamente vendido.

**Essencial:** nenhum fluxo exige configurar entidade múltipla, SSO ou portal bancário. **Gestão:** contrato existente, proposta externa e RFQ não criam duas fontes de verdade. **Enterprise:** multi-entity, SSO e policy não são mera configuração de UI; teste negativo por entidade e suporte humano são obrigatórios. **Instituição:** zero acesso concorrente e custo de resposta medido.

## 7. Quality engineering: matriz de falhas adversariais

| Risco | Simulação/validação exigida |
| --- | --- |
| Dois usuários aprovam versões diferentes | conflito detectado; sem decisão duplicada ou retroativa |
| Retry após timeout no envio de proposta | reconciliação e idempotência; autoria e versão consistentes |
| Banco tenta consultar proposta de concorrente | 403/404 apropriado, zero vazamento em corpo, Graph, busca, metadados e logs |
| Comprador muda entidade durante carregamento | cache/queries invalidadas, autorização revalidada, sem flash de dado cruzado |
| Documento contém injeção, zip bomb, macros ou CSV formula | parsing fail-closed, nada executado/injetado e sem alteração de policy |
| Documento desatualizado ou removido | invalidar cobertura e não continuar mostrando informação como conferida |
| External proposal alega identidade de banco | rótulo de transcrição e prova de origem; não atribuir assinatura ao banco |
| Vencimento calculado com dado incerto ou timezone distinto | mostrar premissa/ausência, revisão humana e data correta |
| Alteração de contrato após decisão | preservar snapshot e versão originária; aditivo é objeto próprio |
| Tier reduzido, trial expira, cobrança falha | estado e export autorizados preservados; sem perda destrutiva |
| Login revogado, convite reaproveitado, URL vazada | sessão inválida fail-closed; convite não permite reutilização/tenant spoof |
| Queda de DB/Auth/Storage/e-mail/integration | resultado honesto, fila/retry seguro, recuperação reproduzida |
| Dados incomparáveis ou moeda distinta | nenhum savings/ranking ou soma implícita; informar lacuna |
| Usuário não entende próximo passo | teste humano e correção de UX, não só teste de clique |
| Navegador móvel com rede lenta ou acessibilidade | focus/zoom/reduced motion e recuperação de rascunho |

**Relatório de evidência mínimo:** caso, ambiente, SHA, papel, fixtures, comando, antes/depois, resposta observada, limite e owner. Para privacidade usar identificadores sintéticos; não salvar PII, segredos, documentos de clientes ou prints sensíveis em issues/PRs.

## 8. Critério de prioridade e custo de oportunidade

**Primeiro gate absoluto:** incidente crítico de segurança ou obrigação legal, depois P0-A/P0-B até 29/10, depois M3/limites de piloto conforme suas dependências. Para propostas que não bloqueiam esses gates, usar avaliação qualitativa explícita (alto/médio/baixo): dor observada; frequência; custo de trabalho atual; valor para buyer; efeito sobre adoção da instituição; risco de dispersão; esforço total de engenharia+manutenção+suporte; segurança/legal; complexidade da interface; reversibilidade; dependência de fonte/consentimento; maturidade. **Não somar notas arbitrárias para esconder veto de segurança ou ausência de problema.**

Preferência provisória de candidatos após P0: pesquisa ICP/casos de entrada; Central de Relacionamentos como composição de módulos atuais; proposta externa autêntica; UX do provedor e dossiê contextual; comparação/contratos melhorados; conectores somente com fonte demonstrada. M3 é trilha técnica separada, nunca shortcut. Não adicionar packs financeiros sem caso, comprador, direito de uso de dados e plano operacional.

## 9. Template de registro de iniciativa

Copiar para issue/PR **sem preencher PASS antecipado**:

| Campo | Preencher com evidência |
| --- | --- |
| ID, data, owner, branch e SHA | |
| Segmento(s), persona(s) e cenário | |
| Episódio real ou hipótese | |
| Alternativa atual e esforço | |
| Resultado que muda | |
| Source/data/provenance e escopo | |
| Objeto canônico reutilizado | |
| Motivo build/integrate/defer/remove | |
| Dependência buyer/provider e canal externo | |
| Evidência de teste positivo/negativo | |
| Acessibilidade/mobile/erro/latência | |
| Estado M e prova ambiente | |
| Evidência usabilidade/mercado | |
| Custos, privacidade, jurídico e conflito | |
| Rollback, owner operacional e suporte | |
| Limite da conclusão e próximo gate | |

## 10. Stop rules

Parar/reevaluar se (a) adoção bancária requer onboarding mais caro que o ganho percebido; (b) a empresa passa mais tempo inserindo dados que usando; (c) sem integração ativa o primeiro valor é inexistente; (d) suporte ou personalização exige fork; (e) a maioria dos usuários não entende ações sem explicação externa; (f) uma fonte crítica é inalcançável juridicamente ou tecnicamente; (g) custo de serviço supera capacidade de precificação plausível; (h) riscos de segurança/regulação impedem o fluxo; (i) o candidato de 29/10 deixa de ser demonstrável. Não contornar stop rule com marketing; reduzir escopo, alterar sequência ou abandonar hipótese.

## 11. Coordenação do trabalho

**Owner:** entrevistas, parceiros, avaliação jurídica, preço/piloto/termos, acesso Vercel/Supabase, estação física, decisões de orçamento; nenhum agente pode inferir aprovação. **Claude Code:** UX, jornadas, copy, testes de compreensão e artefatos visuais. **Codex:** domínio, proveniência, contrato da proposta externa, segurança, instrumentação, CI/release e performance. Compartilhados (guideline, matriz, navigation, packages, configs, migrations) têm um integrador e ordem definida. Antes de PR: fetch main, ler normas, atribuir ownership; quatro gates exatos; PR não é release.

## 12. Fontes públicas utilizadas como contexto (não como prova comercial)

- Treasury Delta — modelo de RFP corporativa bilateral: https://treasurydelta.com/
- Kyriba — gestão de contas, relacionamentos e tarifas como escopo adjacente de TMS: https://www.kyriba.com/es/resources/fact-sheets/bank-relationship-management/
- Banco Central — funções de instituições participantes e consentimento em Open Finance: https://www.bcb.gov.br/meubc/faqs/s/open-finance e https://www.bcb.gov.br/meubc/faqs/p/funcoes-das-instituicoes-participantes-do-open-finance
- BNDES — porte por receita operacional (referência econômica, não de tier): https://bndes.gov.br/wps/portal/site/home/financiamento/guia/porte-de-empresa/

Visitar, datar e revalidar fontes antes de afirmação comercial; material público de fornecedor não comprova preço, capacidade operacional em clientes ou superioridade.
