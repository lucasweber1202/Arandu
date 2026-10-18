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

## Antes de começar (T-30 min) — prontidão verificável

1. Demo de pé: `npm run demo:setup` (primeira vez, ≈20 min) ou `npm run demo:local:reset` (≈15 min; **só quando você decidir** — nada reseta sozinho). Esperado: `39/39 checagens OK`.
2. **Prontidão:** `bash scripts/demo/local.sh readiness --smoke` (só lê; recusa alvo não local). O relatório `reports/demo-readiness/readiness.md` diz, separadamente:
   - **Modo leitura: PRONTO** exige commit e build identificados, Supabase local e app no ar, personas entrando, cenário semeado (39/39) e smoke das jornadas;
   - **Modo interativo: PRONTO** exige, além disso, o estado intocado: Meridian ainda sem proposta na concorrência sazonal, etapa da CFO pendente e nenhuma tarefa de ensaio anterior. Se o Modo 2 já foi ensaiado, ele aponta `npm run demo:local:reset`.
   "NÃO EXECUTADO" nunca é PASS. A sonda de prontidão hospedada aparece como aviso na Demo local (o banco local não faz parte da topologia hospedada) — isso não valida nem invalida a Demo pública.
3. Rode a prontidão **≥ 10 min antes** de abrir as janelas: o diagnóstico e o reset usam a cota legítima da gestora (120 requisições/10 min). O roteiro inteiro da Juliana consome ~77 requisições (medido por `node scripts/demo/requests.mjs`: nenhuma chamada repetida, sem polling).
4. Duas janelas: normal (**juliana.ramos@vittafoods.example**, gerente de tesouraria) e anônima (**eduardo.lima@atlasbank.example**, Atlas Bank; no Modo 2, **patricia.alves@meridianfinancial.example**, Meridian Financial). Opcional: **helena.duarte@vittafoods.example** (CFO) e **carlos.tavares@vittafoods.example** (Controller, leitor). Senha em `scripts/pilot-local/.state/demo.env`.
5. Faça login nas janelas **antes**: o login tem limite legítimo por IP (12/10 min).

## A jornada em 16 etapas (início, meio e fim)

Três cenários sintéticos **distintos** da mesma empresa; a tabela diz quando muda. Não ligue objetos de cenários diferentes ("esta proposta virou aquele contrato") — cada um tem sua própria trilha.

| Etapa | Cenário | Onde (passo do roteiro) |
| --- | --- | --- |
| 1. Empresa compradora | Vitta Foods | 1–2 (login, Painel) |
| 2. Necessidade financeira aberta | **A — nova linha de R$ 12 mi** | 3 |
| 3. Consulta à RFQ | A | 3 |
| 4. Condições solicitadas | A | 3 (Visão geral: demanda tipada e revisão) |
| 5. Convite e participação | A (leitura) / **C — concorrência sazonal** (Modo 2) | 4; I6 |
| 6. Envio de proposta | C (Modo 2, ao vivo) — ou A em leitura (Atlas v2) | 5; I6 |
| 7. Revisão e versionamento | C (Modo 2) / A em leitura | I8; 5 |
| 8. Volta à empresa | C (Modo 2) / A | I9; 6 |
| 9. Comparação financeira | **B — adquirência Lumina** (completa) e C (parcial) | 6; I9 |
| 10. Aprovação e decisão | B (decidida) e A (aprovação pendente na CFO) | 7; I4–I5 |
| 11. Contrato associado | B | 8 |
| 12. Implantação | B | 9; I3 |
| 13. Obrigações e covenants | **D — crédito vigente do Atlas** | 10 |
| 14. Tarefas e responsáveis | Vitta Foods (todas as trilhas) | 13; I1–I2 |
| 15. Histórico e rastreabilidade | B e D | 7 (trilha da decisão), 12 (relacionamento), detalhe da implantação (origem) |
| 16. Renovação e continuidade | D | 11 (janela de renovação → "Iniciar nova concorrência") |

Frases de transição: A→B "esta é outra contratação da Vitta, já decidida; vejam o que acontece depois"; B→D "e este é um contrato antigo, que já gera obrigações e está perto de renovar"; para C "outra necessidade da mesma empresa, ainda recebendo propostas — é aqui que a instituição responde ao vivo".

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
| 8 | 1 min | Contratos | Cartões com vigência, aviso prévio, responsável, termos versionados; nos contratos que nasceram de concorrência (Atlas crédito, Lumina) o título da solicitação de origem aparece no topo do cartão e "Ver processo e decisão de origem" abre a aba Decisão daquele processo (até 18/10 o link não aparecia). A fiança é carteira existente: sem origem inventada | Contrato como objeto operacional, ligado à decisão que o gerou | não |
| 9 | 1 min | cartão da Lumina → "Implantação deste contrato" | Bloco "Vindo do contrato" + plano bloqueado (terminais) + Detalhe (origem: contrato, decisão registrada, marcos com evidência) | A decisão não encerra o trabalho; a lista é filtrada pelo próprio contrato (e a tela diz isso) | não |
| 10 | 1 min | cartão do Atlas (Crédito) → "Covenants e obrigações deste contrato" | Conforme após revisão; dados ausentes ≠ conformidade; waiver | Obrigações pós-contrato com proveniência | não |
| 11 | 1 min | Contratos → cartão do Atlas | "Janela de renovação aberta. Decida até … (prazo do aviso prévio)"; linha do tempo 90/60/30 | Ciclo recorrente: renovação ligada à nova concorrência | não |
| 12 | 1 min | Instituições → "Relacionamento com Atlas Bank" | Contratos, facility com fotografia de saldo, processos, links a covenants/tarifas/spend | Memória institucional reutilizável | não |
| 13 | 1 min | Tarefas | Abertas agrupadas por urgência (Vencidas · Próximos 7 dias · Mais adiante · Sem prazo); filtros (Abertas, Atribuídas a mim, Sem responsável, Concluídas) consultam o servidor; "N tarefas carregadas · há mais neste filtro" + "Carregar mais tarefas" | Responsabilidade explícita sem números inventados | **sim**, se concluir/atribuir (rode `demo:local:reset` depois) |
| — | 30 s | Fechamento | Repita a mensagem final | | |

Transição buyer → provider no passo 5; volte à janela da Juliana no passo 6.

### Opcionais (se houver tempo)
- Janela anônima com **Helena (CFO)** → Aprovações: a vez dela, com contexto. *Aprovar grava* (reset depois).
- Janela anônima com **Carlos (leitor)** → Tarefas: sem caixas de conclusão; aviso de quem pode alterar (servidor recusa a escrita do leitor com 404).
- Passport, Performance, Spend, Qualificação, Documentos, Oportunidades: ver `RUNBOOK.md`, passos 10b e 13–19.

## Modo 2 — demonstração interativa (20–30 min, grava dados)

Mesmo roteiro, com operações reais. Cada uma: mostre o **antes**, faça a
**ação**, leia a **confirmação**, **recarregue** a página e mostre o **depois**.
Ensaio automatizado de todas: `node scripts/demo/interactive.mjs` (só roda contra
a Demo local; ver `docs/evidence/claude-enterprise-product-2026-10-17.md`).
**Depois da apresentação: `npm run demo:local:reset`.**

| # | Quando | Persona / rota | Antes | Ação | Confirmação | Depois (após recarregar) |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | após o passo 9 | Juliana → Tarefas | lista "Abertas" | Nova tarefa "Pedir à Lumina o cronograma de remessa dos terminais", responsável **Rafael Menezes**, prazo | "Tarefa criada." | tarefa na lista com Rafael como responsável |
| I2 | em seguida | mesma tela | tarefa aberta | marcar a caixa | "Tarefa concluída." | aparece em "Concluídas" |
| I3 | passo 9 | Implantação → Detalhe → "Registrar impedimento" | 1 impedimento aberto | "Transportadora sem data para os 60 terminais", resolver até +7 dias | formulário fecha | 2 impedimentos no detalhe e botão "Resolver: …" |
| I4 | passo 7 | janela anônima: **Helena (CFO)** → Aprovações | "Aguardando você" com a nova linha | Aprovar → confirmar | "Aprovação registrada." | pedido em "Concluídas"; na janela da Juliana o Painel passa a sugerir "Registrar decisão" |

| I5 | após I4 | Juliana → Painel | "Precisa de você" | — (efeito de I4) | — | "Registrar decisão: Capital de giro — nova linha…" |
| I6 | após o passo 5 | janela anônima: **Patrícia (Meridian)** → Portal → "Capital de giro sazonal — safra de inverno" | "Responda: …", rascunho não enviado; Orbe já respondeu (a Patrícia não vê) | Clicar "Revisar e enviar" vazio (mostra os obrigatórios); preencher Produto "Giro safra — mesa agro", Valor 5000000 (a tela lê "= R$ 5.000.000"), Taxa 1,29, Prazo 12, CET 19,2, Carência 3, nota | resumo "Enviar proposta?" → "Proposta enviada como versão 1." | "Proposta enviada · versão 1" e histórico "Versão 1" |
| I7 | em seguida | janela anônima: **Bruno (Orbe)** abre o link da proposta da Meridian | — | colar o endereço | "Proposta não encontrada" | nenhuma condição da Meridian aparece; o servidor é a autoridade (RLS), não a tela |
| I8 | em seguida | Patrícia, mesma tela | v1 enviada | Taxa 1,27 e nota da versão 2 → enviar | "Enviar a versão 2?" → "Proposta enviada como versão 2." | histórico com "Taxa (% a.m.): 1,29% → 1,27%" |
| I9 | volte à Juliana | Solicitações → "Capital de giro sazonal…" → Propostas / Comparação | Orbe v1; Meridian "aceitou o convite e está preparando" | — | — | card "Meridian Financial · versão 2 de 2"; Comparação diz "Coleta em andamento: 2 de 2 instituições convidadas enviaram proposta" |

A concorrência sazonal (coleta aberta, prazo em 9 dias) é um cenário separado da
nova linha de R$ 12 mi: explique a transição como "outra necessidade da mesma
empresa, ainda recebendo propostas". Não encerre a coleta nem registre decisão nela.

### Se uma operação do Modo 2 falhar

A tela nunca diz "feito" sem o servidor confirmar. Use esta tabela para decidir em segundos; na dúvida, **siga em modo leitura** — a jornada não depende da operação.

| Op. | Persistiu? Como saber | Seguro repetir? | O que fazer |
| --- | --- | --- | --- |
| I1 criar tarefa | Aviso "Não confirmamos…" = incerto | **Sim**, por "Conferir com o servidor" (mesma chave; nunca cria a segunda) | Clique em "Conferir com o servidor"; título igual na lista **não** prova nada |
| I2 concluir tarefa | Recusa (404) = nada mudou; rede = incerto | Sim, depois de recarregar a lista | Recarregue e veja em "Concluídas" |
| I3 impedimento | "Confira antes de repetir" = incerto (sem chave idempotente) | **Não** às cegas | "Fechar e conferir a lista" → abra o Detalhe; só registre de novo se não aparecer |
| I4 aprovação da CFO | "Não confirmamos se a sua decisão foi registrada" = incerto; "Você não pode mais decidir…" = recusa | Só após "Conferir o pedido" | Recarregue Aprovações; se o pedido estiver em "Concluídas", siga |
| I6/I8 proposta | Botão volta e dados ficam = recusa; sem resposta = incerto | Depois de recarregar o portal e ver o histórico de versões | Se a versão nova aparece no histórico, ela vale |
| Qualquer | "Sua sessão expirou e nada foi registrado" | Sim | "Entrar em outra aba", volte e repita: o formulário continua preenchido |
| Qualquer | "Muitas requisições em pouco tempo" | Sim, quando o botão liberar | Use outra janela/persona na espera; não recarregue em sequência |

Reset (`npm run demo:local:reset`) só **depois** da apresentação, ou antes dela se a prontidão disser "Modo interativo: NÃO PRONTO". Nunca no meio, nunca em banco hospedado.

### Mapa dos 20 pontos do ciclo

1 workspace → passo 1 · 2 usuário/organização/papel → passo 1 (menu do usuário e Configurações → "Seu acesso") · 3 pendências → 2 · 4 necessidade → 3 · 5 RFQ → 3 · 6 condições → 3 (Visão geral) · 7 convites → 4 · 8 portal do provedor → 5 · 9 preencher → I6 · 10 enviar → I6 · 11 revisar → I8 · 12 nova versão → I8 · 13 volta ao comprador → I9 · 14 comparar → 6 e I9 · 15 aprovação e decisão → 7 e I4–I5 · 16 contrato → 8 · 17 implantação → 9 e I3 · 18 obrigações → 10 · 19 tarefa → 13 e I1–I2 · 20 renovação → 11.
Pontos 8–13 só gravam no Modo 2 (cenário C); em leitura, mostre o histórico de versões do Atlas (cenário A, passo 5).

## O que NÃO dizer
- Não citar economia, ROI, ganho de tempo quantificado ou "melhor proposta".
- Não dizer que a Demo pública está atualizada/validada (M3 hospedado é trabalho do Codex).
- Não prometer integrações com bancos, ERP ou Open Finance (não existem).

## Limitações conhecidas e plano B

O que está comprovado: **produto funcional na Demo local** (ensaios desta pasta).
**Não** comprovado: Demo hospedada. Capturas e gravações de contingência são
material de apoio — nunca apresente como execução ao vivo.
| Situação | Plano B |
| --- | --- |
| "Muitas requisições em pouco tempo" (limite legítimo) | A tela diz quanto esperar e só libera "Tentar novamente" depois; nada é perdido nem repetido sozinho. Siga com outra persona/janela enquanto isso. Prevenção: prontidão ≥10 min antes, sem recarregar telas em sequência. |
| Aviso "Não conseguimos carregar … desta solicitação" | Decisão e aprovação ficam bloqueadas de propósito (não se decide com informação incompleta). Aguarde e use "Recarregar". |
| Resultado incerto ao criar tarefa | A tela não diz "criada"; use "Conferir com o servidor" — repete a mesma tentativa e nunca cria a segunda. Título igual na lista não prova nada. |
| Demo local fora do ar / Docker não sobe | `npm run demo:setup` (≈20 min — tenha a máquina pronta antes); se falhar, use as capturas de `docs/evidence/claude-financial-demo-2026-10-16/`, `claude-enterprise-demo-2026-10-17/` e `claude-enterprise-product-2026-10-17/`, **ditas como capturas**. |
| Sessão expirada no meio | Ao gravar, a tela diz "Sua sessão expirou e nada foi registrado" com "Entrar em outra aba": entre lá, volte e repita — o que estava preenchido continua. Ao navegar, "Entrar de novo". |
| Prontidão "NÃO PRONTO" na hora | Modo interativo não pronto, leitura pronta → apresente o Modo leitura. Leitura não pronta → plano de capturas abaixo, ditas como capturas. Nunca reset em banco hospedado. |
| Operação do Modo 2 falha | A tela diz o que aconteceu e que nada foi confirmado; siga em modo leitura e explique a regra (só conta o que o servidor confirmou). |
| Seed inconsistente após ensaio | `npm run demo:local:reset` (≈15 min; termina com `39/39 checagens OK`). Nunca rode reset em banco hospedado. |
| Falha de login | Confira a senha em `scripts/pilot-local/.state/demo.env`. Muitas tentativas por IP (12/10 min) → espere a janela; não insista. Prontidão mostra se a persona entra pelo Auth local. |
| Backend indisponível (telas com "Não foi possível carregar") | `bash scripts/demo/local.sh readiness`: se acusar serviço essencial fora do ar, `npm run demo:setup` (não é caso de reset). Enquanto isso, capturas **ditas como capturas**. |
| Navegador com problema | Abra outra janela anônima (cookies limpos) ou outro navegador com o mesmo login; a Demo não guarda estado no navegador além da sessão. |
| Sem rede externa | A Demo local não depende de serviços externos depois de montada. |
