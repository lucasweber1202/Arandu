# Métricas de produto — Financial Procurement

## Princípio

Nenhuma métrica é inventada. Todas saem de registros que existem no banco. Sem
tráfego real, o valor correto de uma métrica é **zero ou ausente**, nunca uma
estimativa.

## Eventos registrados

Gravados em `fin_events` pelas funções `SECURITY DEFINER` (nunca pelo cliente):

| Evento | Origem |
| --- | --- |
| `organization_created` | `fin_create_organization` |
| `rfq_created` | `fin_create_rfq` |
| `provider_invited` | `fin_invite_provider` |
| `invite_accepted` | `fin_accept_provider_invite` |
| `proposal_submitted` | `fin_submit_proposal` (versão 1) |
| `proposal_revised` | `fin_submit_proposal` (versão n>1) |
| `proposal_withdrawn` | `fin_withdraw_proposal` |
| `rfq_<estado>` | `fin_transition` |
| `contract_<estado>` | `fin_transition` |
| `decision_recorded` | `fin_record_decision` |
| `contract_registered` | `fin_register_contract` |

Falhas de API e tentativas de acesso indevido seguem a observabilidade já
existente (`reportError`, com `service: 'arandu-finance-api'`), sem termos
financeiros no log.

## Métricas calculáveis a partir desses eventos

| Métrica | Como |
| --- | --- |
| Organizações criadas | contagem de `organization_created` |
| RFQs criadas | contagem de `rfq_created`, por produto |
| Provedores por RFQ | `provider_invited` agrupado por `entity_id` |
| Taxa de resposta | `proposal_submitted` distintos ÷ `invite_accepted` |
| Tempo até a primeira proposta | primeiro `proposal_submitted` − `rfq_created` |
| Propostas por RFQ | contagem de propostas com `current_version > 0` |
| Comparação aberta | evento de produto a instrumentar no front (ainda não emitido) |
| Decisão | contagem de `decision_recorded` |
| Contratação | contagem de `contract_registered` |
| Renovação | contratos que entraram em `renewing` |
| Uso recorrente | organizações com mais de uma RFQ em janelas distintas |

## O que o painel exibe hoje

RFQs abertas, RFQs em comparação, propostas recebidas, contratos ativos,
contratos em janela de renovação, oportunidades de repricing, provedores
cadastrados e volume de crédito solicitado (soma dos valores **declarados** nas
RFQs de crédito).

## O que o painel deliberadamente não exibe

* **Economia gerada.** O campo existe na resposta como `savings: null`, com nota
  explicando que economia só aparece com metodologia explícita, linha de base
  verificável e dados comparáveis.
* **Benchmark de mercado.** A estrutura sustenta o cálculo futuro; o número não
  é exibido antes de haver amostra suficiente e política de anonimização
  validada.
* **Conversão, NPS ou qualquer métrica sem tráfego.**
