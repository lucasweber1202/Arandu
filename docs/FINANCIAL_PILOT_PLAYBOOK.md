# Playbook de piloto — Financial Procurement

O objetivo do piloto é responder uma pergunta: **uma empresa real consegue
levar uma cotação do começo ao fim aqui, sem improviso no fluxo principal?**

Não é validar PMF, não é medir receita e não é operação financeira.

## Documentos desta família

| Preciso de… | Documento |
| --- | --- |
| a ficha do primeiro piloto, para preencher | [`FIRST_FINANCIAL_PILOT.md`](FIRST_FINANCIAL_PILOT.md) |
| configurar o ambiente | [`FINANCIAL_PILOT_ENVIRONMENT.md`](FINANCIAL_PILOT_ENVIRONMENT.md) |
| decidir se o piloto começa | [`FINANCIAL_PILOT_GO_NOGO.md`](FINANCIAL_PILOT_GO_NOGO.md) |
| resolver um problema durante o piloto | [`FINANCIAL_PILOT_SUPPORT.md`](FINANCIAL_PILOT_SUPPORT.md) |

## Antes de convidar alguém

- [ ] as **três** migrations aplicadas (base, endurecimento, controles de piloto), conferidas por `npm run test:database`;
- [ ] `ARANDU_ENV=pilot npm run finance:env:check` sem erros;
- [ ] `npm run test:pilot` aprovado;
- [ ] allowlist (`fin_pilot_allowlist`) preenchida — com a tabela vazia o acesso fica aberto;
- [ ] `ARANDU_PRESENTATION_MODE` **desligado** (dado demo não convive com dado real; o checker recusa);
- [ ] nenhum dado de `finance:seed:demo` no banco do piloto;
- [ ] CI verde na `main`;
- [ ] backup conferido e restore testado em banco vazio — ver [`FINANCIAL_PILOT_ENVIRONMENT.md`](FINANCIAL_PILOT_ENVIRONMENT.md);
- [ ] `docs/FINANCIAL_PRODUCT_BOUNDARIES.md` lido por quem vai falar com a empresa;
- [ ] itens de `FINANCIAL_LEGAL_REVIEW_REQUIRED.md` revisados por pessoa com autoridade — **o piloto não começa sem isto**.

## Empresa piloto

| Passo | Como confirmar que funcionou |
| --- | --- |
| Conta criada | login entra em `/finance/dashboard.html` |
| Organização criada | aparece no seletor; o criador é `admin` |
| Dados cadastrais preenchidos | CNPJ aceito em `/finance/settings.html`, com o aviso de que não há consulta oficial |
| Perfil financeiro mínimo | ao menos faturamento, setor e garantias, cada um com origem |
| Aceite dos termos | registrado em `/finance/settings.html` com versão, autor e data. O **texto** continua `LEGAL_REVIEW_REQUIRED`, e a tela diz isso |
| RFQ criada | assistente em 4 etapas conclui e a RFQ nasce em `draft` |
| Provedores cadastrados | ao menos 3, para a comparação fazer sentido |
| Convites enviados | um token por provedor. O link leva o token no fragmento, que não vai para log nem analytics. Entrega manual enquanto `fin_settings.email_enabled` for `false` |
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
| uso da comparação | `comparison_viewed` e `weights_applied`, emitidos pelo navegador |
| decisão | `decision_recorded` |
| satisfação | fora do produto, no roteiro acima |

**Nenhuma meta de PMF é definida aqui.** Com um piloto, qualquer número é
anedota; o que se busca é o fluxo funcionar sem improviso.

## Limitações que o piloto vai encontrar

* **Convite é entregue manualmente** enquanto o envio estiver desligado. O
  caminho de enfileiramento existe e é testado; falta credencial de provedor de
  e-mail (ver `FINANCIAL_EMAIL_TEMPLATES.md`).
* **Não há upload de documento**, só referência `https://`.
* **Não há assinatura eletrônica.**
* **Alertas de renovação são visuais**, não enviados.
* **CNPJ não é consultado em base oficial.**
* **Não há console administrativo cruzando organizações.** O diagnóstico do
  piloto é feito pelo painel da própria organização, pela trilha de eventos
  (`GET /api/finance/events`) e pelas métricas
  (`GET /api/finance/pilot-metrics`).

## Se algo der errado

* Dado de piloto é dado real: **não** rodar o rollback sem exportar antes.
* `docs/rollback/supabase-financial-procurement.rollback.sql` remove as tabelas
  `fin_*` e os dados nelas. É manual, e deve continuar sendo.
* Nenhuma vertical de Arte é afetada por nada disso.
