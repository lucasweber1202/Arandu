# Apresentação de 29/10/2026 — roteiro executável (12–15 min)

Produto real (`main`) em `ARANDU_ENV=demo` com o seed canônico da Vitta Foods
(`scripts/demo/seed.mjs`). Nada aqui é tela de apresentação: cada passo é uma rota
do produto. Dados 100% fictícios (`*.example`). Ensaio técnico registrado em
`docs/evidence/claude-financial-demo-2026-10-16.md` (Demo **local**; a Demo pública
só vale depois da validação hospedada do Codex — não afirme o contrário).

**Pergunta que a apresentação responde:** por que uma equipe financeira usaria o
Arandu em vez de e-mail, planilhas e portais bancários desconectados?
**Mensagem final:** *o Arandu organiza a contratação financeira e preserva as
decisões e obrigações que surgem depois dela.*

## Antes de começar (T-30 min)

1. `npm run demo:setup` (ou `npm run demo:local:reset` se já estiver de pé). Esperado: `38/38 checagens OK`.
2. Duas janelas: normal (**juliana.ramos@vittafoods.example**, gerente de tesouraria) e anônima (**eduardo.lima@atlasbank.example**, Atlas Bank). Opcional: **helena.duarte@vittafoods.example** (CFO) e **carlos.tavares@vittafoods.example** (Controller, leitor). Senha em `scripts/pilot-local/.state/demo.env`.
3. Faça login nas janelas **antes**: o login tem limite legítimo por IP (12/10 min) e a API, 120 requisições/10 min por pessoa. Não fique recarregando páginas no ensaio imediatamente antes.

## Público e cenário

CFO, tesouraria e controladoria de empresa média/grande; parceiros e investidores.
Vitta Foods S.A. (fictícia, ~R$ 180 mi de receita): linha de capital de giro com o
Atlas Bank perto da renovação, adquirência contratada com a Lumina Pay (em
implantação), covenants da cédula do Atlas e uma nova linha de R$ 12 mi em avaliação
com aprovação pendente na CFO. Instituições fictícias: Atlas Bank, Lumina Pay, Orbe
Capital, Nexo Payments, Meridian Financial — **nenhuma é parceira do Arandu**.

## Roteiro

| # | Tempo | Persona / rota | Faça | O que demonstra | Grava? |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 min | `/login.html` | Entre como Juliana; aponte o selo "Ambiente de demonstração" | É o produto, não maquete; quem usa | não |
| 2 | 1,5 min | Painel | "Precisa de você": obrigação vencida sem responsável, renovação do Atlas com aviso prévio em data absoluta, tarefa com Juliana, rascunho | Trabalho com motivo, prazo e responsável — por que voltar na semana seguinte | não |
| 3 | 1 min | Solicitações → "Capital de giro — nova linha de R$ 12 milhões / 36 meses" | Visão geral: demanda estruturada, revisão, prazo | Necessidade financeira tipada, não e-mail solto | não |
| 4 | 1 min | mesma RFQ, "Provedores convidados" | 3 convidados · 2 responderam; Atlas v2, Orbe v1, Meridian sem resposta | Quem recebe o quê e a situação de cada instituição | não |
| 5 | 1,5 min | janela anônima: Eduardo (Atlas) → Portal do provedor | Oportunidades e histórico de versões do Atlas | Lado bilateral; o provedor **não** vê concorrentes, notas nem comparação | não |
| 6 | 2 min | Juliana → "Adquirência — revisão de MDR…" → Comparação | Tabela por condição, versão selecionável, cobertura, "O Arandu não recomenda instituições" | Propostas comparáveis e versões preservadas, sem vencedor do sistema | não |
| 7 | 1 min | mesma RFQ → Aprovações / Decisão | Controller → CFO, justificativa, "Lumina Pay · proposta v2" | Decisão humana com versão analisada e trilha | não |
| 8 | 1 min | Contratos | Cartões com vigência, aviso prévio, responsável, termos versionados, "Ver processo e decisão de origem" | Contrato como objeto operacional | não |
| 9 | 1 min | cartão da Lumina → "Implantação com Lumina Pay" | Bloco "Vindo do contrato" + plano bloqueado (terminais) + Detalhe (origem: contrato, decisão registrada, marcos com evidência) | A decisão não encerra o trabalho; o recorte declarado é por instituição | não |
| 10 | 1 min | cartão do Atlas → "Covenants e obrigações com Atlas Bank" | Conforme após revisão; dados ausentes ≠ conformidade; waiver | Obrigações pós-contrato com proveniência | não |
| 11 | 1 min | Contratos → cartão do Atlas | "Janela de renovação aberta. Decida até … (prazo do aviso prévio)"; linha do tempo 90/60/30 | Ciclo recorrente: renovação ligada à nova concorrência | não |
| 12 | 1 min | Instituições → "Relacionamento com Atlas Bank" | Contratos, facility com fotografia de saldo, processos, links a covenants/tarifas/spend | Memória institucional reutilizável | não |
| 13 | 1 min | Tarefas | Filtros (Abertas, Atribuídas a mim, Sem responsável, Concluídas) consultam o servidor; "N tarefas carregadas · há mais neste filtro" + "Carregar mais tarefas" | Responsabilidade explícita sem números inventados | **sim**, se concluir/atribuir (rode `demo:local:reset` depois) |
| — | 30 s | Fechamento | Repita a mensagem final | | |

Transição buyer → provider no passo 5; volte à janela da Juliana no passo 6.

### Opcionais (se houver tempo)
- Janela anônima com **Helena (CFO)** → Aprovações: a vez dela, com contexto. *Aprovar grava* (reset depois).
- Janela anônima com **Carlos (leitor)** → Tarefas: sem caixas de conclusão; aviso de quem pode alterar (servidor recusa a escrita do leitor com 404).
- Passport, Performance, Spend, Qualificação, Documentos, Oportunidades: ver `RUNBOOK.md`, passos 10b e 13–19.

## Modo 2 — demonstração interativa (20–30 min, grava dados)

Mesmo roteiro, com quatro operações reais. Cada uma: mostre o **antes**, faça a
**ação**, leia a **confirmação**, **recarregue** a página e mostre o **depois**.
Ensaio automatizado das quatro: `node scripts/demo/interactive.mjs` (só roda contra
a Demo local; ver evidência). **Depois da apresentação: `npm run demo:local:reset`.**

| # | Quando | Persona / rota | Antes | Ação | Confirmação | Depois (após recarregar) |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | após o passo 9 | Juliana → Tarefas | lista "Abertas" | Nova tarefa "Pedir à Lumina o cronograma de remessa dos terminais", responsável **Rafael Menezes**, prazo | "Tarefa criada." | tarefa na lista com Rafael como responsável |
| I2 | em seguida | mesma tela | tarefa aberta | marcar a caixa | "Tarefa concluída." | aparece em "Concluídas" |
| I3 | passo 9 | Implantação → Detalhe → "Registrar impedimento" | 1 impedimento aberto | "Transportadora sem data para os 60 terminais", resolver até +7 dias | formulário fecha | 2 impedimentos no detalhe e botão "Resolver: …" |
| I4 | passo 7 | janela anônima: **Helena (CFO)** → Aprovações | "Aguardando você" com a nova linha | Aprovar → confirmar | "Aprovação registrada." | pedido em "Concluídas"; na janela da Juliana o Painel passa a sugerir "Registrar decisão" |

O provedor **não** grava nada no seed atual (a única concorrência com instituições
está com a coleta encerrada); mostre o portal em leitura (passo 5).

## O que NÃO dizer
- Não citar economia, ROI, ganho de tempo quantificado ou "melhor proposta".
- Não dizer que a Demo pública está atualizada/validada (M3 hospedado é trabalho do Codex).
- Não prometer integrações com bancos, ERP ou Open Finance (não existem).
- Implantação/covenants: "da mesma instituição", não "deste contrato".

## Limitações conhecidas e plano B

O que está comprovado: **produto funcional na Demo local** (ensaios desta pasta).
**Não** comprovado: Demo hospedada. Capturas e gravações de contingência são
material de apoio — nunca apresente como execução ao vivo.
| Situação | Plano B |
| --- | --- |
| "Muitas tentativas" (limite legítimo) | Aguarde ~1 min e use "Tentar novamente"; nada é perdido. Evite recarregar telas em sequência. |
| Filtro por contrato individual em implantação/covenants não existe | Diga "da mesma instituição"; a tela já declara isso. |
| Demo local fora do ar / Docker não sobe | `npm run demo:setup` (≈20 min — tenha a máquina pronta antes); se falhar, use as capturas de `docs/evidence/claude-financial-demo-2026-10-16/` e `claude-enterprise-demo-2026-10-17/`, **ditas como capturas**. |
| Sessão expirada no meio | Entre de novo na mesma janela; nada salvo se perde (tarefas e aprovações já confirmadas ficam no servidor). |
| Operação do Modo 2 falha | A tela diz o que aconteceu e que nada foi confirmado; siga em modo leitura e explique a regra (só conta o que o servidor confirmou). |
| Seed inconsistente após ensaio | `npm run demo:local:reset` (≈15 min; termina com `38/38 checagens OK`). Nunca rode reset em banco hospedado. |
| Sem rede externa | A Demo local não depende de serviços externos depois de montada. |
