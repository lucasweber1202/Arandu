# Roteiro da apresentação — 29/10/2026 (cinco atos)

Versão final do roteiro comercial. Aprofunda, sem substituir:
[ROTEIRO_COMERCIAL_5_ATOS_29-10.md](ROTEIRO_COMERCIAL_5_ATOS_29-10.md) (falas e
perguntas prováveis), [PRESENTATION_2026-10-29.md](PRESENTATION_2026-10-29.md)
(jornada em 16 etapas e Modo interativo) e o
[cartão do operador](OPERATOR_29-10.md). Prontidão comprovada em
[RELEASE_READINESS_2026-10-29.md](RELEASE_READINESS_2026-10-29.md).

**Modo padrão: leitura.** Nenhum clique grava. Ambiente: estação local
(`https://localhost:4443`, só com `station` READY) ou, na falta dela, a visita
pública `https://arandu-demo.vercel.app/demo/visita.html`, apresentada como
"visita com capturas reais do produto, dados fictícios".

**Fio condutor:** relacionamento → necessidade → propostas → decisão →
contrato → próximo trabalho. Valor para a tesouraria, não para engenharia.

Telas e dados abaixo foram ensaiados na stack real em `d5e1612` (28/10, noite).

## Ato 1 — O problema financeiro (2 min)

| | |
| --- | --- |
| Tela | Dívida e limites (`/finance/portfolio.html`), depois Início (`/finance/dashboard.html`) |
| Persona | Juliana Ramos, gerente de tesouraria da Vitta Foods (fictícia) |
| Ação | Rolar a carteira: contratos por instituição, saldos e vencimentos; no Início, o bloco "Precisa de você" |
| Explicar | Uma indústria média tem crédito, fiança e adquirência espalhados em bancos, planilhas e e-mails. Prazos de aviso prévio e covenants se perdem |
| Problema resolvido | Fragmentação: ninguém vê, num lugar, o que vence, com quem e quem cuida |
| Resultado na tela | Renovação do crédito Atlas com aviso prévio em data absoluta; tarefa sem responsável aparece como "sem responsável" |
| Se falhar | 429 → espere o tempo exibido na mesma aba; senão visita `#contexto` e `#painel` |

## Ato 2 — Centralização e organização (2–3 min)

| | |
| --- | --- |
| Tela | Instituições (`/finance/providers.html`) → Relacionamento do Atlas Bank; Tarefas (`/finance/tasks.html`) |
| Persona | Juliana |
| Ação | Filtrar por Atlas Bank; abrir o relacionamento; mostrar contratos, marcos e tarefas com responsável |
| Explicar | A empresa registra o que já contratou **sem o banco precisar aderir**. Nenhuma conta é criada para a instituição e nada é enviado a ela |
| Problema resolvido | Primeiro valor no dia 1, sem depender de rede de bancos |
| Resultado na tela | Fila "O que pede ação" por instituição, com motivo, prazo e responsável |
| Se falhar | visita `#relacionamentos` |

## Ato 3 — Solicitação de crédito (2–3 min)

| | |
| --- | --- |
| Tela | Solicitações → "Capital de giro — nova linha de R$ 12 milhões / 36 meses" |
| Persona | Juliana |
| Ação | Visão geral (demanda: valor, prazo, carência, garantias) → "Instituições convidadas" → aba Propostas |
| Explicar | A necessidade vira um pedido estruturado e comparável. Cada proposta pertence a quem a enviou e guarda versões |
| Problema resolvido | Fim do "mesmo pedido por e-mail para cinco gerentes, cinco formatos de resposta" |
| Resultado na tela | 3 convidadas: Atlas v2, Orbe v1 sem CET informado, Meridian sem proposta |
| Cuidado | Orbe "não informou" o CET — não dizer que "não tem". Proposta transcrita pelo comprador aparece como **fonte externa**, nunca como enviada pela instituição |
| Se falhar | visita `#solicitacao`, `#convites`, `#propostas` |

## Ato 4 — Comparação de propostas (2–3 min)

| | |
| --- | --- |
| Tela | Solicitações → "Adquirência — revisão de MDR e antecipação" → aba Comparação |
| Persona | Juliana |
| Ação | Comparação lado a lado de Nexo v1, Lumina v2, Atlas v1; apontar células "informado" × "pendente" e "condições que mudaram desde a v1" |
| Explicar | O Arandu organiza os fatos de cada proposta e a origem de cada número. Pesos e critérios são da empresa |
| Problema resolvido | Comparar condições heterogêneas sem planilha manual e sem perder versões |
| Resultado na tela | Comparação factual; a própria tela diz que o Arandu não recomenda instituições |
| Cuidado | Nunca "melhor proposta", "vencedora" ou "economia de X" |
| Se falhar | visita `#comparacao` |

## Ato 5 — Decisão e continuidade (3 min)

| | |
| --- | --- |
| Tela | Aprovações (Trocar persona → Helena Duarte, CFO) → de volta a Juliana: Contratos (`/finance/contracts.html`) → contrato Lumina → "Trabalho deste contrato"; por fim, Trocar persona → Eduardo Lima (Atlas) → Portal da instituição |
| Persona | Helena (CFO), Juliana, Eduardo |
| Ação | Mostrar a etapa 2 de 2 aguardando a CFO (**não clicar Aprovar**); contrato com origem, obrigações e renovação; portal do Atlas só com as próprias oportunidades |
| Explicar | Quem pede não aprova (segregação de funções). A decisão é humana, justificada e fotografa a versão escolhida. Depois da assinatura começam implantação, covenants e renovação. A instituição vê só o que é dela |
| Problema resolvido | Governança auditável e memória do relacionamento, não só a cotação |
| Resultado na tela | "Aguardando você" para a CFO; contrato com solicitação de origem e tarefas; portal sem concorrentes |
| Cuidado | O Arandu **não** concede crédito, assina contrato nem desembolsa. Não há integração bancária nem Open Finance hoje |
| Se falhar | visita `#aprovacao`, `#contrato`, `#continuidade`, `#instituicao`, `#instituicao-proposta` |

Fechamento (30 s): volta ao Início da Juliana e repete o fio condutor.

## Versão de 5 minutos

| Min | Tela | Mensagem |
| --- | --- | --- |
| 0–1 | Início (Juliana) | O que vence, com quem e quem cuida — sem o banco aderir |
| 1–2 | Solicitação "Capital de giro" | Necessidade estruturada; propostas com dono e versão |
| 2–3 | Comparação "Adquirência" | Fatos lado a lado; a empresa decide |
| 3–4 | Aprovações (Helena) | Quem pede não aprova; decisão humana registrada |
| 4–5 | Contrato Lumina → "Trabalho deste contrato" | A decisão vira trabalho e renovação |

Uma só troca de persona (Helena). Pular o portal da instituição.

## Contingência pela visita pública

Abrir `https://arandu-demo.vercel.app/demo/visita.html` (ou a cópia local da
contingência sem rede, ver OPERATOR_RUNBOOK). Dizer: "esta é a visita com
capturas reais do mesmo produto, com dados fictícios; nada é gravado". Mapa:

| Ato | Âncoras |
| --- | --- |
| 1 | `#contexto`, `#painel` |
| 2 | `#relacionamentos` |
| 3 | `#solicitacao`, `#convites`, `#propostas` |
| 4 | `#comparacao` |
| 5 | `#aprovacao`, `#contrato`, `#continuidade`, `#instituicao`, `#instituicao-proposta`, `#instituicao-valor` |

## Nunca afirmar

SLA, RPO/RTO, certificação, clientes, economia/ROI, "melhor proposta",
recomendação automática, produção pronta, ambiente hospedado operacional,
integração com bancos, assinatura ou desembolso. Pergunta sem evidência:
"não temos esse dado validado; não vou estimar".
