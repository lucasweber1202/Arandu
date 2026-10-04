# Limites do produto financeiro

> **LEGAL_REVIEW_REQUIRED** — Este documento descreve intenção de produto e
> comportamento do software. Ele **não é parecer jurídico** e **não afirma** que
> a atividade descrita seja ou deixe de ser regulada em qualquer jurisdição.
> Nenhuma conclusão sobre enquadramento regulatório deve ser tirada daqui sem
> análise jurídica humana.

## O que o Arandu faz nesta fase

* estrutura uma necessidade financeira da empresa em campos padronizados;
* organiza a solicitação de propostas a múltiplos provedores;
* normaliza as condições recebidas para torná-las comparáveis;
* apresenta diferenças factuais entre propostas;
* aplica pesos definidos pela própria empresa, identificando o resultado como dela;
* registra a decisão humana com autor, data, critérios, justificativa e
  fotografia de todas as propostas existentes no momento;
* guarda o contrato decorrente e sinaliza a janela de renovação.

## O que o Arandu NÃO faz nesta fase

O Arandu **não**:

* concede crédito;
* empresta recursos próprios;
* decide crédito;
* faz underwriting;
* garante ou promete aprovação de crédito;
* recebe recursos;
* mantém saldo;
* faz custódia;
* movimenta recursos;
* executa pagamentos ou transferências;
* distribui valores mobiliários;
* executa investimentos;
* faz gestão discricionária;
* atua como banco, corretora ou gestora;
* opera crowdfunding;
* é fundo de venture capital nem intermedeia participação societária;
* dá recomendação financeira individualizada ou automatizada;
* decide em nome do cliente;
* classifica instituição como "melhor" de forma subjetiva;
* executa ou assina contratos financeiros automaticamente;
* afirma conformidade regulatória sem revisão jurídica humana.

## Onde cada limite está implementado

| Limite | Implementação verificável |
| --- | --- |
| Não movimenta recursos | Não existe tabela de saldo, ordem de pagamento ou liquidação no schema (`docs/supabase-financial-procurement.sql`). |
| Não decide pelo cliente | `fin_record_decision` exige papel `admin`/`finance_manager` da organização compradora e grava `decided_by = auth.uid()`; não há caminho automático de decisão. |
| Não recomenda | `buildComparison` não emite ranking; `applyUserWeights` exige pesos do usuário e rotula o resultado. Coberto por `scripts/test-finance-domain.mjs` e pela suíte E2E de apresentação. |
| Não inventa CET | `estimateCreditTotalCost` retorna `null` sem insumos completos e nunca escreve em `cet_year`. |
| Não inventa economia | O painel expõe `savings: null` com nota explícita sobre metodologia. |
| Não acusa provedor | Tarifas (P1.2) só dizem "acima/abaixo da referência contratada", "não comparável" ou "revisão necessária"; interpretação material é humana (`fin_review_fee_variance`) e diferença de tarifa nunca vira economia (`docs/FINANCIAL_FEE_INTELLIGENCE.md`). |
| Não atesta regulação | `fin_providers` nasce em `NAO_VERIFICADO`; a constraint `fin_provider_evidence_required` impede o estado verificado sem autoridade, registro, evidência e data de consulta. |
| Não assina contrato | `fin_contracts` guarda apenas referência documental (`https://`); não há integração de assinatura. |
| Não ordena sem pedido | `applyUserWeights` só produz ordenação com pesos explícitos do usuário, e empates valem igual para todos, para que a ordem não dependa da direção do campo. |
| Não esconde nota frágil | proposta pontuada sobre pouco peso respondido é marcada e vai depois das completas, com a cobertura visível. |
| Não projeta o que não dá | a estimativa recusa pós-fixado, SAC, bullet e carência, e diz o motivo no lugar do número. |
| Não normaliza dado do cliente | mix de recebimentos fora de 100% vira erro ou aviso; o valor informado nunca é alterado pelo servidor. |

## Pontos que exigem revisão jurídica humana

Listados em [`FINANCIAL_LEGAL_REVIEW_REQUIRED.md`](FINANCIAL_LEGAL_REVIEW_REQUIRED.md).

## O que este documento deliberadamente não afirma

Este documento **não afirma** que a atividade de procurement financeiro seja
"não regulada". Ele afirma apenas o que o software faz e o que não faz. O
enquadramento é uma questão jurídica, aberta, e precisa de análise humana antes
de qualquer operação real, comunicação comercial ou captação de clientes.
