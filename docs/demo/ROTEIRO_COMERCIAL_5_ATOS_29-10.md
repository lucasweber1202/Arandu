# Roteiro comercial em 5 atos — 29/10/2026 (12–15 min, só leitura)

Complementa, sem substituir, o roteiro operacional em
[PRESENTATION_2026-10-29.md](PRESENTATION_2026-10-29.md) e o
[cartão do operador](OPERATOR_29-10.md) (Codex). Aqui: o que dizer, o que
responder e onde parar. Nada neste roteiro grava dados; o seed não muda.

**Modos.** B = Demo local com backend real (só com `station` READY na máquina
do owner). C = visita pública `https://arandu-demo.vercel.app/demo/visita.html`
(informativa, capturas reais da Demo canônica, nada é gravado). Cada ato tem a
âncora da visita como plano alternativo. Nunca apresente C como operação real.

**Mensagem central:** o Arandu organiza a contratação financeira da empresa e
preserva as decisões e obrigações que nascem depois dela — o RFQ é uma parte do
ciclo, não o produto inteiro.

## Ato 1 — Primeiro valor e relacionamento (3 min)

| Campo | Conteúdo |
| --- | --- |
| Persona | Juliana Ramos, tesouraria da Vitta Foods (fictícia) |
| Rota | `/finance/dashboard.html` → Relacionamentos › Instituições (`/finance/providers.html`) → filtro Atlas Bank |
| Objeto | "Precisa de você"; fila "O que pede ação" por instituição |
| Dado esperado | Crédito Atlas vence em 85 dias, aviso prévio de 60 dias (decidir até a data mostrada); fiança Atlas como carteira existente; tarefa de covenant sem responsável |
| Informação principal | Cada pendência tem motivo, prazo, instituição e responsável — ou "sem responsável" explícito |
| Mensagem | "Antes de pedir qualquer proposta, a empresa já ganha: vê o que vence, com quem, e quem cuida." |
| Transição | "A renovação do Atlas puxa uma nova necessidade de capital de giro." |
| Pergunta provável | "O banco precisa estar no Arandu?" — Não. A empresa registra o que já contratou; nenhuma conta é criada para a instituição e nada é enviado a ela. |
| Limite | Não citar economia, ROI ou ganho de tempo; não dizer que o aviso prévio foi conferido no documento (a tela pede para conferir). |
| Plano C | `#painel` e `#relacionamentos` da visita |

## Ato 2 — Demanda e contratação financeira (3–4 min)

| Campo | Conteúdo |
| --- | --- |
| Persona | Juliana |
| Rota | Solicitações → "Capital de giro — nova linha de R$ 12 milhões / 36 meses" → Visão geral e "Instituições convidadas" |
| Objeto | Solicitação estruturada (Processo A) |
| Dado esperado | 3 convidadas, 2 responderam: Atlas v2, Orbe v1 sem CET, Meridian sem proposta; aprovação na etapa da CFO |
| Informação principal | Valor, prazo, carência e garantias definidos pela empresa; cada proposta pertence a quem a enviou, com versões |
| Mensagem | "A necessidade vira um pedido comparável, não um e-mail para cinco gerentes." |
| Transição | "Agora uma concorrência que já foi comparada e decidida." |
| Pergunta provável | "E proposta que chega por e-mail?" — Pode ser transcrita com canal e conferência, marcada como fonte externa; nunca vira proposta enviada pela instituição. |
| Limite | Não criar RFQ ao vivo no modo leitura. Não dizer que a Orbe "não tem CET": ela não informou. |
| Plano C | `#solicitacao`, `#convites`, `#propostas` |

## Ato 3 — Comparação, decisão e governança (3 min)

| Campo | Conteúdo |
| --- | --- |
| Persona | Juliana (opcional: Helena, CFO, só leitura) |
| Rota | "Adquirência — revisão de MDR e antecipação" → Comparação → Aprovações → Decisão |
| Objeto | Processo C: Nexo v1, Lumina v2, Atlas v1; decisão "Lumina Pay · proposta v2" |
| Dado esperado | 11 condições comparáveis; "8 condições mudaram desde a v1" na Lumina; Controller → CFO |
| Informação principal | Informado × pendente por célula; pesos são da empresa; decisão humana com justificativa e versão fotografada |
| Mensagem | "O Arandu organiza os fatos; quem escolhe é a empresa, e a escolha fica registrada." |
| Transição | "A decisão vira contrato — e o trabalho começa." |
| Pergunta provável | "O sistema diz qual é a melhor?" — Não. A tela diz "O Arandu não recomenda instituições"; não há vencedor automático. |
| Limite | Não chamar proposta de "melhor" nem "vencedora". Helena não aprova no modo leitura (aprovar grava). |
| Plano C | `#comparacao`, `#aprovacao` |

## Ato 4 — Contrato, obrigações e trabalho (3 min)

| Campo | Conteúdo |
| --- | --- |
| Persona | Juliana |
| Rota | Contratos → cartão Lumina Pay → "Abrir contrato: termos, aditivos e marcos"; depois cartão Atlas (Crédito) → "Covenants e obrigações deste contrato" |
| Objeto | Contrato Lumina (Processo C) e cédula Atlas (Processo D) |
| Dado esperado | Painel "Trabalho deste contrato": Solicitação de origem, Relacionamento com Lumina Pay, tarefas de implantação, conferência do 1º mês e revisão da renovação; Atlas: covenant conforme, período aguardando dados, waiver |
| Informação principal | O contrato sabe de onde veio, quem faz o quê e quando renova; ausência de dado não é conformidade |
| Mensagem | "A decisão não encerra o relacionamento: implantação, obrigações e renovação ficam no mesmo lugar." |
| Transição | "E do lado do banco, o que aparece?" |
| Pergunta provável | "Por que o menu diz 18 tarefas e a tela diz 19?" — O número do menu conta o que depende de quem está logado (atribuídas a você ou sem responsável); a tela mostra todas as abertas da equipe, inclusive as do Rafael. |
| Pergunta provável | "Concluir a tarefa muda o contrato?" — Não; a tela diz que concluir registra o trabalho, não aprova obrigação nem altera contrato. |
| Limite | Não marcar "Concluir tarefa" (grava). Não ligar a linha de R$ 12 mi (A) ao contrato Lumina (C): são processos distintos. |
| Plano C | `#contrato`, `#continuidade` |

## Ato 5 — Instituição e memória do relacionamento (2 min + 30 s)

| Campo | Conteúdo |
| --- | --- |
| Persona | "Trocar persona" → Eduardo Lima (Atlas Bank); depois volta a Juliana |
| Rota | `/provider/index.html` → Oportunidades → **Ver** em "Capital de giro — nova linha de R$ 12 milhões / 36 meses" (o histórico v1 → v2 fica no detalhe, não na lista); retorno a `/finance/dashboard.html` |
| Objeto | Portal da instituição |
| Dado esperado | Só as oportunidades do Atlas; histórico v1 → v2 da própria proposta |
| Informação principal | A instituição vê o próprio convite, as próprias versões e o que a empresa compartilhou — nunca concorrentes, comparação ou notas internas |
| Mensagem | "Cada lado opera sobre o que é seu; a empresa guarda a memória inteira." |
| Fechamento | Volta ao Painel da Juliana e repete o fio: relação → necessidade → propostas → decisão → contrato → próximo trabalho. |
| Pergunta provável | "Vocês integram com os bancos?" — Não há integração bancária nem Open Finance hoje; a instituição usa um portal de baixo atrito. |
| Limite | Cada troca de persona consome entrada (limite por janela); não abrir janelas extras para contornar 429. |
| Plano C | `#instituicao`, `#instituicao-proposta`, `#instituicao-valor` |

## Contingência

- 429 / sessão: espere o tempo exibido na mesma janela; se o ato não couber, siga para o Plano C desse ato dizendo "esta é a visita com capturas reais do mesmo produto".
- Station não READY: apresente tudo pela visita (Modo C), declarando que é informativa.
- Pergunta sem evidência (SLA, clientes, economia, certificação): "não temos esse dado validado; não vou estimar".
