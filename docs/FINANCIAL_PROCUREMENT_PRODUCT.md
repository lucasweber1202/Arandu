# Arandu — Financial Procurement Platform

## Definição de produto

O Arandu é uma plataforma para empresas **estruturarem necessidades financeiras,
solicitarem propostas a múltiplos provedores, compararem condições de forma
padronizada, decidirem com mais informação e acompanharem contratos e
renovações**.

A função do produto é organizar o processo competitivo de contratação de
produtos financeiros B2B. Nada além disso. Os limites estão em
[`FINANCIAL_PRODUCT_BOUNDARIES.md`](FINANCIAL_PRODUCT_BOUNDARIES.md) e valem
como regra de engenharia, não apenas como texto de marketing.

## Cliente e usuários

Empresas brasileiras pequenas, médias e grupos empresariais menores, com
operação financeira minimamente estruturada. Os usuários são CFO, gerente
financeiro, tesoureiro, controller, fundador, analista financeiro, comprador
financeiro e o administrador da conta da empresa.

Do outro lado estão os provedores: bancos, fintechs, adquirentes,
subadquirentes, instituições de crédito, provedores de meios de pagamento e,
quando juridicamente apropriado, originadores de recebíveis.

## Produtos do MVP

Exatamente dois, e os dois funcionam ponta a ponta.

### 1. Crédito empresarial

```
necessidade → RFQ → convite a provedores → propostas → normalização
→ comparação factual → decisão humana → contrato → acompanhamento de renovação
```

Campos da demanda e da proposta estão declarados em
[`lib/finance/products.mjs`](../lib/finance/products.mjs) e detalhados em
[`FINANCIAL_DATA_MODEL.md`](FINANCIAL_DATA_MODEL.md).

### 2. Adquirência e meios de pagamento

```
perfil de recebimentos → RFQ → propostas → normalização
→ comparação factual (MDR, PIX, antecipação, liquidação, custo fixo)
→ decisão humana → contrato → repricing
```

## Princípio central de comparação

O Arandu **não diz** que uma instituição é a melhor.

Ele diz o que é verificável na proposta recebida: menor taxa informada, menor
CET informado, menor custo total declarado, maior prazo, maior carência, menor
exigência de garantia, menor MDR, menor taxa de antecipação, menor custo fixo,
menor prazo de liquidação, proposta mais recente, maior validade.

A empresa pode definir critérios e pesos próprios. Nesse caso — e só nesse caso
— existe uma ordenação, sempre rotulada **"Resultado conforme os pesos definidos
por você"**. A expressão "Recomendação do Arandu" não existe no produto.

Quando a empresa define pesos, o resultado vem com a **cobertura** de cada
proposta — a parcela do peso definido que ela efetivamente respondeu. Uma
proposta que responde 25% do peso pode ter nota alta sobre esse pouco; ela é
marcada e fica depois das completas, em vez de liderar em silêncio. Critérios
em que todas informaram o mesmo valor são nomeados como não discriminantes.

A proteção é dupla:

* **backend** — `lib/finance/comparison.mjs` só produz `applyUserWeights` quando
  recebe pesos explícitos; a resposta de comparação sem pesos não tem campo de
  ranking, e `scripts/test-finance-domain.mjs` verifica a ausência das chaves
  `ranking`, `recommended` e `best`;
* **frontend** — `finance/app.js` só renderiza ordenação depois do envio do
  formulário de pesos, e o texto do rótulo é verificado pela suíte E2E de
  apresentação.

## Cálculos e proveniência

O Arandu **nunca inventa CET**. O CET aparece apenas quando o provedor o
informa.

Quando todos os insumos existem, o produto pode mostrar uma estimativa própria
de custo, sempre acompanhada de:

* fórmula explícita;
* insumos utilizados;
* premissas assumidas;
* marcação de que é estimativa.

Faltando qualquer insumo, o resultado é **o motivo pelo qual não foi
calculado**, não um número aproximado nem um campo vazio. O Arandu recusa a
projeção quando:

* falta valor, taxa, prazo ou tarifa;
* a taxa é pós-fixada (exigiria arbitrar uma curva de CDI ou IPCA);
* a amortização é SAC, bullet ou customizada (a fórmula é PRICE);
* há carência (o tratamento dos juros no período varia por contrato);
* em adquirência, uma fatia foi declarada sem a taxa correspondente.

A **antecipação não entra** no custo mensal de adquirência: calculá-la exigiria
volume antecipado e prazo médio, que a empresa não declara nesta fase, e
embutir uma hipótese mudaria a ordem das propostas sem ninguém ver a hipótese.
Quando o mix declarado não soma 100%, a estimativa diz que cobre apenas a parte
declarada.

## Módulos

| Módulo | Onde vive |
| --- | --- |
| Organizações, membros e papéis | `fin_organizations`, `fin_members`, `fin_member_invitations` |
| Financial Passport (perfil reutilizável com proveniência, frescor, histórico e snapshot na RFQ) | `fin_company_profiles`, `fin_company_profile_history`, `fin_rfq_profile_snapshots`, `lib/finance/passport.mjs` |
| Provedores | `fin_providers` |
| RFQ e máquina de estados | `fin_rfqs`, `lib/finance/workflow.mjs` |
| Convite de provedor (uso único) | `fin_rfq_invites` |
| Propostas e versões | `fin_proposals`, `fin_proposal_versions` |
| Comparação | `lib/finance/comparison.mjs` |
| Decisão com snapshot | `fin_decisions` |
| Contratos e renovação | `fin_contracts` |
| Documentos por referência | `fin_documents` |
| Tarefas e trilha | `fin_tasks`, `fin_events` |
| Validação local de CNPJ | `lib/finance/cnpj.mjs` |
| Modelos de e-mail (preparados, envio desligado) | `lib/finance/email-templates.mjs`, `fin_enqueue_email` |
| Aceite de termos (versão, autor, data) | `fin_terms_acceptances` |
| Allowlist do piloto | `fin_pilot_allowlist` |
| Sinais de produto do navegador | `fin_record_client_event` |
| Métricas operacionais do piloto | `pilotMetrics` em `lib/api/domains/finance.mjs` |
| Exportação factual do processo | `GET /api/finance/export` |

## Interfaces

Portal da empresa (`/finance/`): início, painel, solicitações, detalhe da RFQ,
provedores, propostas, contratos, Financial Passport e limites do produto.

## Financial Passport

O perfil financeiro da empresa compradora é um ativo reutilizável, não um
cadastro: cada campo guarda valor, origem declarada, quem gravou, quando, se
foi confirmado como atual, até quando vale e, quando aplicável, o documento
privado que o sustenta. O catálogo (`lib/finance/passport.mjs`) organiza os
campos em quatro contextos — Empresa, Crédito, Adquirência e Documentação.

* **Frescor determinístico.** Cada campo tem um período de revisão declarado
  (padrão do catálogo ou escolhido pela empresa) e, se houver, a validade da
  fonte. A partir de 30 dias antes do vencimento o campo fica *revisar em
  breve*; depois, *desatualizado*. Confirmar como atual renova a referência sem
  mudar o valor. O Arandu não inventa validade.
* **Cobertura factual.** Campos preenchidos / campos do catálogo, por contexto.
  Não é nota de risco, de crédito nem de qualidade, e não ordena nada.
* **Origem.** O formulário aceita origens declaráveis por pessoa (declarado
  pela empresa, documento interno, extrato, contrato vigente, outra). Importação,
  integração, informado pelo provedor, cálculo e extração confirmada são
  reservadas a caminhos próprios e recusadas pelo formulário e pelo banco.
* **Documentos.** Um campo de documentação só conta com arquivo privado do
  perfil vinculado (bucket privado, link assinado curto). Arquivo removido
  deixa o campo descoberto e sinalizado.
* **Histórico.** Toda gravação e confirmação vira linha append-only, escrita por
  gatilho; ninguém a edita.
* **Reuso na RFQ.** O assistente preenche, de forma visível, os campos da
  demanda mapeados no catálogo, só quando vazios, com origem, data e frescor na
  dica. A pessoa revisa; valor em formato livre não preenche. Ao criar, a RFQ
  guarda uma fotografia imutável dos campos usados e se cada um foi mantido ou
  alterado. Mudanças futuras no Passport não alteram o processo.
* **Quem vê.** Só membros da empresa compradora. O provedor convidado lê a
  demanda que a empresa enviou, nunca o Passport nem a fotografia.

Fora desta versão, de propósito: importação/integração (Onda 4), extração por
IA com confirmação (Onda 2) e múltiplas entidades legais (fundação multi-entity).

Portal do provedor (`/provider/`): início, aceite de convite com estado
explícito, RFQs atribuídas com a necessidade declarada, e resposta de proposta
com rascunho local e histórico de versões.

## Preparação para benchmarking (não implementado)

A arquitetura já sustenta um benchmarking futuro — dados estruturados,
propostas versionadas, produto normalizado, datas confiáveis, setor e porte
disponíveis. **Nenhum benchmark agregado é exibido**, e não deve ser exibido
antes de haver volume suficiente e política de anonimização validada
juridicamente.

## Perguntas que a documentação responde

| Pergunta | Documento |
| --- | --- |
| O que o Arandu Finance faz hoje? | este documento |
| O que ele não faz? | [`FINANCIAL_PRODUCT_BOUNDARIES.md`](FINANCIAL_PRODUCT_BOUNDARIES.md) |
| Como subir um piloto? | [`FINANCIAL_PILOT_ENVIRONMENT.md`](FINANCIAL_PILOT_ENVIRONMENT.md) |
| Como criar empresa, provedor e a primeira RFQ? | [`FINANCIAL_MVP_RUNBOOK.md`](FINANCIAL_MVP_RUNBOOK.md) |
| Como operar o piloto? | [`FINANCIAL_PILOT_PLAYBOOK.md`](FINANCIAL_PILOT_PLAYBOOK.md) e [`FIRST_FINANCIAL_PILOT.md`](FIRST_FINANCIAL_PILOT.md) |
| Como diagnosticar um problema? | [`FINANCIAL_PILOT_SUPPORT.md`](FINANCIAL_PILOT_SUPPORT.md) |
| O piloto pode começar? | [`FINANCIAL_PILOT_GO_NOGO.md`](FINANCIAL_PILOT_GO_NOGO.md) |
| O que depende do fundador? | [`FINANCIAL_OWNER_ACTIONS.md`](FINANCIAL_OWNER_ACTIONS.md) |
| O que depende de advogado? | [`FINANCIAL_LEGAL_REVIEW_REQUIRED.md`](FINANCIAL_LEGAL_REVIEW_REQUIRED.md) |
| Como os dados são tratados? | [`FINANCIAL_DATA_CLASSIFICATION.md`](FINANCIAL_DATA_CLASSIFICATION.md) |
| Que ataques foram testados? | [`FINANCIAL_THREAT_MODEL.md`](FINANCIAL_THREAT_MODEL.md) |

## Fora de escopo nesta rodada

Seguros, câmbio, leasing, factoring avançado, marketplace de FIDC, conta
digital, PIX, transferências, open finance real, score de crédito,
underwriting, cobrança, emissão de crédito, KYC pago, assinatura eletrônica,
integração real com bancos, equity, crowdfunding, investimentos, gestão de
portfólio, recomendação automatizada e qualquer forma de IA escolhendo proposta.
