# Playbook de piloto — Financial Procurement

O objetivo do piloto é responder uma pergunta: **uma empresa real consegue
levar uma cotação do começo ao fim aqui, sem improviso no fluxo principal?**

Não é validar PMF, não é medir receita e não é operação financeira.

## Antes de convidar alguém

- [ ] migrations aplicadas (base + endurecimento), conferidas por `npm run test:database`;
- [ ] `SUPABASE_URL` e `SUPABASE_ANON_KEY` configurados no ambiente do piloto;
- [ ] `ARANDU_PRESENTATION_MODE` **desligado** no ambiente do piloto (dado demo não convive com dado real);
- [ ] CI verde na `main`;
- [ ] `docs/FINANCIAL_PRODUCT_BOUNDARIES.md` lido por quem vai falar com a empresa;
- [ ] itens de `FINANCIAL_LEGAL_REVIEW_REQUIRED.md` revisados por pessoa com autoridade — **o piloto não começa sem isto**.

## Empresa piloto

| Passo | Como confirmar que funcionou |
| --- | --- |
| Conta criada | login entra em `/finance/dashboard.html` |
| Organização criada | aparece no seletor; o criador é `admin` |
| Dados cadastrais preenchidos | CNPJ aceito em `/finance/settings.html`, com o aviso de que não há consulta oficial |
| Perfil financeiro mínimo | ao menos faturamento, setor e garantias, cada um com origem |
| Aceite dos termos | **pendente**: não existe registro de aceite no schema. Fazer fora do produto e anotar quem aceitou e quando |
| RFQ criada | assistente em 4 etapas conclui e a RFQ nasce em `draft` |
| Provedores cadastrados | ao menos 3, para a comparação fazer sentido |
| Convites enviados | um token por provedor; hoje a entrega é manual (ver "E-mails") |
| Propostas recebidas | aparecem em `/finance/proposals.html` com versão e validade |
| Comparação aberta | tabela no desktop, cartões no celular, sem ranking padrão |
| Pesos aplicados | resultado rotulado como da empresa, com cobertura por proposta |
| Decisão registrada | RFQ vai para `decided`; snapshot guarda todas as propostas |
| Contrato registrado | RFQ vai para `contracted`; tarefa de renovação criada |
| Feedback colhido | roteiro abaixo |

## Provedor piloto

| Passo | Como confirmar |
| --- | --- |
| Conta criada | login entra em `/provider/index.html` |
| Organização provedora criada | `kind='PROVIDER'` |
| Convite aceito | `/provider/invite.html?token=…` mostra o estado e confirma a organização |
| Necessidade compreendida | a demanda declarada aparece em "Ver a necessidade declarada pela empresa" |
| Rascunho salvo | botão de rascunho local preserva o preenchimento ao recarregar |
| Proposta enviada | versão 1; a RFQ passa de `open` para `collecting` sozinha |
| Revisão enviada | versão 2; a versão 1 continua no histórico |
| Isolamento confirmado | o provedor não vê proposta de concorrente em nenhuma tela |

## Roteiro de feedback (qualitativo)

Empresa: o que faltou para você confiar na comparação? Que campo você teria
preenchido diferente? O que você fez fora do Arandu que esperava fazer dentro?

Provedor: faltou alguma informação para cotar? Algum campo não cabe no seu
produto? Quanto tempo levou para responder?

## Métricas do piloto

Todas saem de `fin_events` e são **contagens**, não projeções:

| Métrica | Fonte |
| --- | --- |
| tempo de onboarding | `organization_created` → primeiro `rfq_created` |
| tempo para criar RFQ | início da sessão → `rfq_created` |
| tempo até a primeira proposta | `rfq_created` → primeiro `proposal_submitted` |
| taxa de resposta | `proposal_submitted` distintos ÷ `provider_invited` |
| propostas por RFQ | contagem por `rfq_id` |
| uso da comparação | **não instrumentado**: não há evento de abertura de comparação |
| decisão | `decision_recorded` |
| satisfação | fora do produto, no roteiro acima |

**Nenhuma meta de PMF é definida aqui.** Com um piloto, qualquer número é
anedota; o que se busca é o fluxo funcionar sem improviso.

## Limitações que o piloto vai encontrar

* **Convite é entregue manualmente.** O token aparece na tela para quem
  convidou; não há envio automático (ver `FINANCIAL_EMAIL_TEMPLATES.md`).
* **Não há upload de documento**, só referência `https://`.
* **Não há assinatura eletrônica.**
* **Não há aceite de termos no produto.**
* **Alertas de renovação são visuais**, não enviados.
* **CNPJ não é consultado em base oficial.**
* **Não há admin operacional completo** — só a visão de leitura descrita em
  `FINANCIAL_MVP_RUNBOOK.md`.

## Se algo der errado

* Dado de piloto é dado real: **não** rodar o rollback sem exportar antes.
* `docs/rollback/supabase-financial-procurement.rollback.sql` remove as tabelas
  `fin_*` e os dados nelas. É manual, e deve continuar sendo.
* Nenhuma vertical de Arte é afetada por nada disso.
