# Apresentação de 29/10/2026 — roteiro executável (12–15 min)

Produto real (`main`) em `ARANDU_ENV=demo` com o seed canônico da Vitta Foods
(`scripts/demo/seed.mjs`). Nada aqui é tela de apresentação: cada passo é uma rota
do produto. Dados 100% fictícios (`*.example`). Ensaio técnico registrado em
`docs/evidence/claude-financial-demo-2026-10-16.md` (Demo **local**; a Demo canônica hospedada
só vale com M3 READY; visita pública M2 tem prova separada e não opera o backend).

**Pergunta que a apresentação responde:** por que uma equipe financeira usaria o
Arandu em vez de e-mail, planilhas e portais bancários desconectados?
**Mensagem final:** *o Arandu organiza a contratação financeira e preserva as
decisões e obrigações que surgem depois dela.*

## Antes de começar — preparação antecipada e janela final

O procedimento vigente está no [cartão do operador](OPERATOR_29-10.md): D-3
prepara, ensaia em workspace descartável e congela; D-1 retoma e repõe somente
a capacidade consumida; D-0 verifica com antecedência. `demo:setup` resemeia e
`demo:down` apaga dados: não são comandos de retomada. Nenhum reset na sequência
padrão ou durante a apresentação.

1. Até T-60: `bash scripts/demo/local.sh resume` se necessário; depois
   `bash scripts/demo/local.sh readiness --smoke` e `bash scripts/demo/local.sh station`.
   Só READY na estação física, no SHA congelado, libera o Modo B.
2. Leia os modos separadamente: leitura PRONTO permite o roteiro sem gravação;
   interativo PRONTO exige também cenário íntegro, CFO pendente, Meridian sem
   proposta e capacidade do pool. Não escreva no baseline após o freeze.
3. T-30: abra **uma** janela anônima em
   `https://localhost:4443/login.html#demonstracao`; depois nenhuma suíte,
   readiness ou provisionamento. Comece com Juliana e use "Trocar persona"
   nessa janela somente nos pontos do roteiro. Cada troca consome entrada;
   nova janela consome workspace e orçamento da rede.
4. 429: respeite o tempo exibido na mesma sessão. Não troque conta ou janela
   para contornar o limite. Escrita incerta exige conferir o servidor.
5. Local não READY → Modo C, visita/capturas declaradas como tais. Hospedado
   só pode ser Modo A com M3 READY; PUBLIC_SHAREABLE de uma visita M2 não basta.

## Roteiro A (Demo hospedada) × Roteiro B (Demo local)

Os dois usam **o mesmo produto** (`main`), o mesmo seed e as mesmas 16 etapas abaixo. Muda só onde ele roda e como se entra.

| | Roteiro A — hospedado | Roteiro B — local (estação de apresentação) |
| --- | --- | --- |
| Quando vale | Só se `node scripts/demo/hosted-parity.mjs --url=<URL pública> --sha=<SHA da main>` terminar em **READY** (identidade, prontidão, entrada por persona, sessão exigida, assets e rotas lidos do servidor). `NOT_READY` = falha comprovada; `ACCESS_BLOCKED` = o verificador não tem acesso; `INCONCLUSIVE` = rede/timeout ou item não verificado. Só READY libera o Roteiro A | Somente com `station` READY **na própria estação**, SHA congelado e modo correspondente PRONTO |
| Estado em 18/10 (`41513ee`) | **NÃO VALE — NOT_READY**: `arandu-demo.vercel.app` está no SHA da `main`, mas responde sem `environment`, `datasource=synthetic-fixtures`, prontidão 503, sem entrada por persona, `/api/finance/*` 404 e sandbox legado em `/demo` (bloqueio do Codex: Supabase DEMO e cutover) | Vale: Auth, API, RLS e Storage reais em Docker, seed 39/39 |
| Entrada | Site → "Acessar plataforma" → **Conheça o Arandu por dentro** (escolha de persona) | Igual, em `https://localhost:4443/login.html#demonstracao`; ou as contas do baseline por e-mail (itens 4–5) |

**Duas formas de entrar no Roteiro B:**
1. **Por persona (recomendada para quem vai mexer):** cada janela anônima é um visitante com **workspace próprio** — o que se cria ou aprova ali não aparece para ninguém e não exige reset. Antes: `npm run demo:local:workspaces -- provision --count=<visitantes>` (≈ 10 min por par de workspaces, medido em 18/10). Troca de persona no topo do workspace ("Trocar persona"): mesma empresa, mesmo workspace.
2. **Pelas contas do baseline (e-mail e senha):** é o cenário compartilhado do Modo 2; escreve no baseline e pede `npm run demo:local:reset` depois.

Nunca use o sandbox ilustrativo (`/demo` do build antigo, empresa "Acme") como substituto silencioso: ele não é o produto e não grava nada no servidor.

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
| 4 | 1 min | mesma RFQ, "Instituições convidadas" | 3 convidados · 2 responderam; Atlas v2, Orbe v1, Meridian sem resposta | Quem recebe o quê e a situação de cada instituição | não |
| 5 | 1,5 min | janela anônima: Eduardo (Atlas) → Portal da instituição | Oportunidades e histórico de versões do Atlas | Lado bilateral; o provedor **não** vê concorrentes, notas nem comparação | não |
| 6 | 2 min | Juliana → "Adquirência — revisão de MDR…" → Comparação | Tabela por condição, versão selecionável, cobertura, "O Arandu não recomenda instituições" | Propostas comparáveis e versões preservadas, sem vencedor do sistema | não |
| 7 | 1 min | mesma RFQ → Aprovações / Decisão | Controller → CFO, justificativa, "Lumina Pay · proposta v2" | Decisão humana com versão analisada e trilha | não |
| 8 | 1 min | Contratos | Cartões com vigência, aviso prévio, responsável, termos versionados; nos contratos que nasceram de concorrência (Atlas crédito, Lumina) o título da solicitação de origem aparece no topo do cartão e "Ver processo e decisão de origem" abre a aba Decisão daquele processo (até 18/10 o link não aparecia). A fiança é carteira existente: sem origem inventada | Contrato como objeto operacional, ligado à decisão que o gerou | não |
| 9 | 1 min | cartão da Lumina → "Implantação deste contrato" | Bloco "Vindo do contrato" + plano bloqueado (terminais) + Detalhe (origem: contrato, decisão registrada, marcos com evidência) | A decisão não encerra o trabalho; a lista é filtrada pelo próprio contrato (e a tela diz isso) | não |
| 10 | 1 min | cartão do Atlas (Crédito) → "Covenants e obrigações deste contrato" | Conforme após revisão; dados ausentes ≠ conformidade; waiver | Obrigações pós-contrato com proveniência | não |
| 11 | 1 min | Contratos → cartão do Atlas | "Janela de renovação aberta. Decida até … (prazo do aviso prévio)"; linha do tempo 90/60/30 | Ciclo recorrente: renovação ligada à nova concorrência | não |
| 12 | 1,5 min | Instituições ("O que pede ação nos relacionamentos") → "Relacionamento" do Atlas Bank | Fila por instituição: tarefa vencida sem responsável (covenant Dívida/EBITDA), janela de renovação do crédito Atlas ("decidir até 15/11, aviso prévio de 60 dias registrado no cadastro — confira no documento"), duas negociações com as instituições convidadas, tarefas pós-contrato da Lumina; filtro por instituição/condição/situação. No relacionamento do Atlas: término × marco de aviso prévio × tarefas operacionais, contratos, facility com fotografia de saldo e links | Primeiro valor sem o banco aderir: a empresa organiza o que já tem e vê onde agir; responsável ausente aparece como ausente | não |
| 13 | 1 min | Tarefas | Abertas agrupadas por urgência (Vencidas · Próximos 7 dias · Mais adiante · Sem prazo); filtros (Abertas, Atribuídas a mim, Sem responsável, Concluídas) consultam o servidor; "N tarefas carregadas · há mais neste filtro" + "Carregar mais tarefas" | Responsabilidade explícita sem números inventados | **sim**, se concluir/atribuir (rode `demo:local:reset` depois) |
| — | 30 s | Fechamento | Repita a mensagem final | | |

Transição buyer → provider no passo 5; volte à janela da Juliana no passo 6.

### Ordem buyer-first (recomendada desde 22/10)

Mesmos passos e rotas, com o relacionamento existente **antes** da demanda — a sequência da guideline v3.7 (§39.5, §41.1): problema → contrato/relação existente → demanda → proposta → comparação → aprovação → decisão → contrato → obrigação → instituição → próximo trabalho.

| Ordem | Passo da tabela | Persona · rota | Resultado observável no seed | Transição |
| --- | --- | --- | --- | --- |
| 1 | 1–2 | Juliana · `/finance/dashboard.html` | "Precisa de você" com 4 itens (obrigação vencida sem responsável, renovação do Atlas, tarefa, rascunho) | "De onde vem isso? Dos contratos que a Vitta já tinha." |
| 2 | 12 | Juliana · `/finance/providers.html` | Fila por instituição: tarefa vencida, janela de renovação do crédito Atlas (decidir até a data do aviso prévio), 2 negociações, tarefas da Lumina; "3 instituições sem contrato vigente registrado". "Abrir tarefa" leva à tarefa exata (`#task-…`) desde 22/10 | "A renovação do Atlas puxa uma nova necessidade" |
| 3 | 3–4 | Juliana · Solicitações → nova linha de R$ 12 mi | Demanda tipada; "Instituições convidadas": 3 convidadas, 2 responderam | "Do outro lado, o banco" |
| 4 | 5 | Eduardo · `/provider/index.html` ("Portal da instituição") | Só as 3 oportunidades do Atlas; aviso de que concorrentes e comparação nunca aparecem | "De volta à empresa, outra concorrência já decidida" |
| 5 | 6–7 | Juliana · Adquirência → Comparação / Decisão | 3 propostas, versões, "O Arandu não recomenda instituições"; decisão Lumina v2 com trilha | "A decisão vira contrato" |
| 6 | 8–11 | Juliana · Contratos → Implantação → Covenants → Renovação | Contrato com origem; implantação bloqueada (terminais); covenant conforme / aguardando dados / waiver; janela de renovação | "E quem cuida de cada coisa?" |
| 7 | 13 | Juliana · Tarefas | Abertas por urgência, com e sem responsável | Mensagem final |

Risco conhecido (22/10, dado do seed, não da tela): o covenant de Dívida líquida/EBITDA tem Juliana como responsável na tabela de Covenants, mas a **tarefa** gerada para o período vencido aparece "Sem responsável" no Painel e na Central. São registros diferentes (obrigação × tarefa); se perguntarem, explique assim e não diga que a obrigação está sem dono. Registrado para a frente técnica.

### Roteiro final em 5 atos (12–15 min) — ensaiado em 22/10 no laboratório

Responde: *como o Arandu ajuda a empresa a organizar o relacionamento financeiro do início ao fim?* Persona padrão: **Juliana Ramos** pela entrada por persona (`/login.html#demonstracao`, janela anônima). Tudo em **leitura**; nada grava. Cada linha é uma rota real; os dados são os do seed Vitta Foods (39/39).

| Ato · tempo | Persona · rota | Ação | Dado esperado no seed | Resultado observável | Transição | Risco · contingência |
| --- | --- | --- | --- | --- | --- | --- |
| 1 · Primeiro valor (3 min) | Juliana · `/finance/dashboard.html` | Mostrar "Precisa de você" | 4 itens: obrigação Dívida/EBITDA vencida sem responsável, renovação Atlas (aviso prévio em data absoluta), tarefa da TAC, rascunho de pagamentos on-line | Cada item com motivo, prazo e responsável (ou "sem responsável") | "De onde vem isso? Do que a Vitta já tinha contratado." | 429 na entrada → espere o tempo da tela (caso F do cartão) |
| 1 | Juliana · Relacionamentos › Instituições (`/finance/providers.html`) | Fila "O que pede ação"; filtro Instituição = Atlas Bank; botão "Relacionamento" | Atlas: janela de renovação do crédito (decidir até o marco do aviso prévio, 60 dias "registrado no cadastro — confira no documento"); fiança como carteira existente; 3 instituições sem contrato vigente | Instituição, contrato, prazo, condição, origem e responsável na mesma linha; "Abrir tarefa" abre a tarefa exata | "A renovação puxa uma nova necessidade" | Sem risco de escrita |
| 2 · Procurement (5 min) | Juliana · Solicitações → "Capital de giro — nova linha de R$ 12 milhões / 36 meses" | Visão geral; "Instituições convidadas" | 3 convidadas, 2 responderam; Atlas v2, Orbe v1 sem CET, Meridian convite aceito sem proposta | Demanda tipada (valor, prazo, carência, garantias) e situação por instituição | "Agora uma concorrência já comparada" | — |
| 2 | Juliana · "Adquirência — revisão de MDR…" → Comparação | Seletores de versão; "Como ler esta comparação" | 3 propostas, 11 condições comparáveis, 2 com informação pendente; Lumina v2 com "8 condições mudaram desde a v1"; "O Arandu não recomenda instituições" | Informado × pendente × não comparável aparece por célula; pesos são da empresa | "Quem decide é a empresa" | Não chame nenhuma proposta de "melhor" |
| 2 | Juliana · mesma RFQ → Aprovações / Decisão; opcional: Helena · `/finance/approvals.html` | Mostrar Controller → CFO e a justificativa | Decisão "Lumina Pay · proposta v2" com trilha; na nova linha de R$ 12 mi, etapa 2 de 2 aguardando a CFO | Separação de responsabilidades; decisão humana registrada com a versão analisada | "A decisão vira contrato" | Helena **não** aprova no Modo leitura (aprovar grava) |
| 3 · Continuidade (3 min) | Juliana · Contratos → cartão da Lumina; depois Atlas (Crédito) | "Ver processo e decisão de origem"; "Implantação deste contrato"; "Covenants e obrigações deste contrato" | Lumina: implantação bloqueada (60 terminais); Atlas: covenant conforme, período aguardando dados, waiver vigente; janela de renovação | Condição, prazo e responsável do contrato; obrigações com proveniência | "E quem faz o quê?" | Ausência de dado ≠ conformidade (diga assim) |
| 3 | Juliana · Tarefas (a partir de "Abrir tarefa" na Central) | Abrir a tarefa específica | Tarefa destacada; abertas por urgência | Tarefa com prazo e responsável; volta para a instituição | "E do lado do banco?" | Não marque a caixa (grava) |
| 4 · Instituição (2 min) | "Trocar persona" → **Eduardo Lima (Atlas Bank)** · `/provider/index.html` | Portal da instituição → Oportunidades | 3 oportunidades do Atlas (1 em avaliação pela empresa, 2 encerradas); histórico de versões v1→v2 | Aviso de que concorrentes e a comparação da empresa nunca aparecem; nenhuma linha de Orbe/Meridian/Nexo/Lumina | "De volta à empresa" | Cada troca = 1 das 12 entradas/10 min |
| 5 · Fechamento (1 min) | "Trocar persona" → Juliana · Painel | Repetir o fio: relação → negociação → contrato → trabalho | — | Mesmo painel, agora entendido | Mensagem final | Sem ROI, economia ou "melhor banco" |

Pergunta provável sobre a obrigação "sem responsável": ver o risco conhecido acima (a tarefa gerada pela rotina não herda o responsável da obrigação; confirmado em `docs/supabase-financial-covenants.sql` no `ef5e8c9`).

### Opcionais (se houver tempo)
- Janela anônima com **Helena (CFO)** → Aprovações: a vez dela, com contexto. *Aprovar grava* (reset depois).
- Janela anônima com **Carlos (leitor)** → Tarefas: sem caixas de conclusão; aviso de quem pode alterar (servidor recusa a escrita do leitor com 404).
- Passport, Performance, Spend, Qualificação, Documentos, Oportunidades: ver `RUNBOOK.md`, passos 10b e 13–19.

## Modo 2 — demonstração interativa (20–30 min, grava dados)

Mesmo roteiro, com operações reais. Cada uma: mostre o **antes**, faça a
**ação**, leia a **confirmação**, **recarregue** a página e mostre o **depois**.
Ensaio automatizado de todas: `node scripts/demo/interactive.mjs` (só roda contra
a Demo local; ver `docs/evidence/claude-enterprise-product-2026-10-17.md`).
**Use workspace de visitante. O baseline congelado não deve receber escritas.**
Reset não faz parte da operação padrão: exige decisão explícita de descartar
os dados sintéticos locais identificados, fora da apresentação.

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
| Qualquer | "Muitas requisições em pouco tempo" | Sim, quando o botão liberar | Espere na mesma sessão; não recarregue em sequência |

Se o modo interativo não estiver pronto, siga em leitura ou Modo C. Reset somente com decisão explícita de descarte do baseline sintético local, antes de novo ensaio/freeze ou depois do evento; nunca como recuperação automática nem em banco hospedado.

### Mapa dos 20 pontos do ciclo

1 workspace → passo 1 · 2 usuário/organização/papel → passo 1 (menu do usuário e Configurações → "Seu acesso") · 3 pendências → 2 · 4 necessidade → 3 · 5 RFQ → 3 · 6 condições → 3 (Visão geral) · 7 convites → 4 · 8 portal do provedor → 5 · 9 preencher → I6 · 10 enviar → I6 · 11 revisar → I8 · 12 nova versão → I8 · 13 volta ao comprador → I9 · 14 comparar → 6 e I9 · 15 aprovação e decisão → 7 e I4–I5 · 16 contrato → 8 · 17 implantação → 9 e I3 · 18 obrigações → 10 · 19 tarefa → 13 e I1–I2 · 20 renovação → 11.
Pontos 8–13 só gravam no Modo 2 (cenário C); em leitura, mostre o histórico de versões do Atlas (cenário A, passo 5).

## O que NÃO dizer
- Não citar economia, ROI, ganho de tempo quantificado ou "melhor proposta".
- Não dizer que a Demo canônica hospedada está validada sem M3 READY; a visita pública informativa tem prova M2 separada no SHA servido.
- Não prometer integrações com bancos, ERP ou Open Finance (não existem).

## Limitações conhecidas e plano B

O que está comprovado: **produto funcional na Demo local** (ensaios desta pasta).
**Não** comprovado: Demo hospedada. Capturas e gravações de contingência são
material de apoio — nunca apresente como execução ao vivo.
| Situação | Plano B |
| --- | --- |
| "Muitas requisições em pouco tempo" (limite legítimo) | A tela diz quanto esperar e só libera "Tentar novamente" depois; nada é perdido nem repetido sozinho. Espere na mesma sessão enquanto isso. Prevenção: prontidão ≥10 min antes, sem recarregar telas em sequência. |
| Aviso "Não conseguimos carregar … desta solicitação" | Decisão e aprovação ficam bloqueadas de propósito (não se decide com informação incompleta). Aguarde e use "Recarregar". |
| Resultado incerto ao criar tarefa | A tela não diz "criada"; use "Conferir com o servidor" — repete a mesma tentativa e nunca cria a segunda. Título igual na lista não prova nada. |
| Demo local fora do ar / Docker não sobe | Abra Docker Desktop e use `bash scripts/demo/local.sh resume` para a stack existente; se falhar, use as capturas de `docs/evidence/claude-financial-demo-2026-10-16/`, `claude-enterprise-demo-2026-10-17/` e `claude-enterprise-product-2026-10-17/`, **ditas como capturas**. |
| Sessão expirada no meio | Ao gravar, a tela diz "Sua sessão expirou e nada foi registrado" com "Entrar em outra aba": entre lá, volte e repita — o que estava preenchido continua. Ao navegar, "Entrar de novo". |
| Prontidão "NÃO PRONTO" na hora | Modo interativo não pronto, leitura pronta e station READY → apresente o Modo leitura. Leitura não pronta → plano de capturas abaixo, ditas como capturas. Nunca reset em banco hospedado. |
| Operação do Modo 2 falha | A tela diz o que aconteceu e que nada foi confirmado; siga em modo leitura e explique a regra (só conta o que o servidor confirmou). |
| Seed inconsistente após ensaio | No D-0, não resete: leitura se validada e station READY, senão Modo C. Antes do freeze, recuperação do cenário exige decisão explícita de descarte dos dados sintéticos locais e novo ensaio. |
| Falha de login | Confira a senha em `scripts/pilot-local/.state/demo.env`. Muitas tentativas por IP (12/10 min) → espere a janela; não insista. Prontidão mostra se a persona entra pelo Auth local. |
| Backend indisponível (telas com "Não foi possível carregar") | `bash scripts/demo/local.sh readiness`: se acusar serviço essencial fora do ar, `bash scripts/demo/local.sh resume` (retomada sem resemeadura). Enquanto isso, capturas **ditas como capturas**. |
| Navegador com problema | Reabra a aba na mesma janela anônima; fechar a janela perde o visitante e uma nova entrada consome capacidade. Persistindo, Modo C. |
| Sem rede externa | A Demo local não depende de serviços externos depois de montada. |
| Entrada por persona diz "A demonstração está cheia" | O pool acabou: continue na sessão já aberta ou leitura validada; sem sessão disponível, Modo C. Reposição só antes da janela final, fora da apresentação. Nada foi criado. |
| Entrada por persona diz "Muitas entradas em pouco tempo" | Limite legítimo de entradas por rede (12 a cada 10 min). Use "Trocar persona" só quando a jornada pedir; espere a janela. A tela não diz que entrou. |
| Na página de login, "Muitas entradas em pouco tempo a partir desta rede. Tente de novo em N minutos" no lugar da escolha de persona | Limite da **lista** de personas (30 consultas a cada 10 min por rede; observado em 21/10 depois de três suítes de ensaio seguidas). Desde 21/10 a tela explica e diz quanto esperar (antes a escolha sumia sem aviso). Quem já está num workspace segue com "Trocar persona". Não recarregue a página de login em sequência |
| "A demonstração não está disponível neste endereço" | O servidor não é de demonstração (ou a Demo hospedada não passou na verificação). Vá para o Roteiro B local. |
| Link antigo `/demo/...` | Na Demo canônica ele mostra "Não encontramos esta página" com "Entrar na demonstração" (vai à escolha de persona). |

## Decisão A / B / C (na véspera e na hora)

| Estado | Condição verificável | O que apresentar |
| --- | --- | --- |
| **A — hospedada** | `hosted-parity.mjs` = **READY** no SHA aprovado **e** o roteiro pela entrada pública ensaiado no domínio (Codex confirma banco DEMO autorizado para escrita sintética) | Roteiro A, entrada pública, um visitante por janela anônima |
| **B — local canônica** | `station` READY no SHA congelado **nesta estação**, `39/39`, prontidão do modo escolhido e ensaio `demo-entry-lifecycle.spec.js` aprovado | Roteiro B por persona (recomendado) |
| **C — NO-GO** | Nem A nem B comprovados | Não apresentar operação ao vivo. Capturas da evidência, **ditas como capturas**, e explicar a limitação |

Um runner de CI destruído não é estação pronta; um Preview "Ready" não é Demo validada; uma resposta 200 com `synthetic-fixtures` não é a Demo canônica.

## Estação de apresentação (Roteiro B) — preparação reproduzível

> Para operar no dia, use o cartão de uma página [`OPERATOR_29-10.md`](OPERATOR_29-10.md) (D-1, T-30, durante, recuperação, encerramento). Esta seção detalha o porquê de cada passo.

Sem conhecimento tácito: qualquer pessoa com a máquina e o repositório segue esta lista.

1. Máquina com Docker, Node 24 e Chromium (Playwright). `git fetch && git checkout <SHA aprovado>`; `git rev-parse HEAD` igual ao SHA aprovado.
2. `npm ci --include=optional` e `npm run build`.
3. `bash scripts/demo/local.sh prepare-station --provision` → `39/39 checagens OK` e pool preparado; retoma estado existente sem reset. Senha das personas do baseline: `scripts/pilot-local/.state/demo.env` (nunca em slide, HTML ou chat).
4. `npm run demo:local:workspaces -- list`: confira os 4 prontos preparados no passo 3. Não acrescente mais 4 a cada ensaio; reponha só o consumido.
5. Verificação: `node scripts/demo/hosted-parity.mjs --url=https://localhost:4443 --local` deve mostrar PASS em identidade, entrada por persona, sessão exigida, assets e rotas (prontidão 503 é esperada no laboratório e por isso o veredito local não é READY: ele não serve para liberar o Roteiro A).
6. Ensaio completo, consumindo **um** workspace: `ARANDU_DEMO_LIFECYCLE_E2E=1 npx playwright test --config playwright.demo.config.js tests/e2e/demo-entry-lifecycle.spec.js --project=demo-desktop`. Verde = o roteiro inteiro gravou e releu no servidor. Reponha o workspace consumido (passo 4, `--count=1`).
7. Após o ensaio e reposição, na estação definitiva: `bash scripts/demo/local.sh freeze --station`, `bash scripts/demo/local.sh readiness --smoke`, `bash scripts/demo/local.sh station`. Só READY libera B. Para reinício controlado **sem apagar dados**, abra Docker Desktop e use `bash scripts/demo/local.sh resume`; falhas de ordem de serviços seguem C3 no cartão do operador. `demo:setup` resemeia e `demo:down` apaga tudo; nenhum é reinício.
8. T-30 min: nenhum teste, prontidão ou provisionamento. Abra uma janela anônima e siga o cartão do operador.
9. **Orçamento de visitantes por rede:** o servidor aceita **4 workspaces novos por hora por origem** (`auth-demo-claim`). Cada janela anônima nova que escolhe persona é um workspace novo; trocar de persona na mesma janela não conta. Na hora anterior à apresentação, não use mais que 2 janelas novas em ensaios e deixe ao menos 2 para a sessão. Público na mesma rede (Wi-Fi da sala) divide o mesmo orçamento.

## Contingências da apresentação ao vivo (complemento)

Cada linha aponta o que já existe no produto ou no repositório. Nunca: limpar banco hospedado, trocar de identidade para fugir de limite, compartilhar senha administrativa com visitante.

| Situação | Como reconhecer | Procedimento seguro |
| --- | --- | --- |
| Vercel fora do ar (Roteiro A) | Domínio sem resposta; `hosted-parity` = INCONCLUSIVE | Roteiro B na estação preparada. Não use o sandbox como substituto |
| Supabase DEMO fora do ar (A) | Telas com "Não foi possível carregar"; prontidão 503 | Roteiro B. Nada a resetar no hospedado |
| Auth / login indisponível | Entrada por persona responde erro do servidor; a tela não diz que entrou | Aguarde 1 min e tente uma vez; persistindo, Roteiro B |
| Pool esgotado / Demo cheia | "A demonstração está cheia" | B: sessão já aberta ou leitura validada; sem sessão disponível, Modo C. Repor capacidade fora da apresentação |
| Rede lenta / timeout | Botões em "Salvando…", avisos "Não confirmamos…" | Não clique de novo. Use "Conferir com o servidor" ou recarregue e confira a lista (tarefa, aprovação, proposta) |
| 409 / registro mudou | "A tarefa mudou enquanto você a alterava…", "Recarregue a página para resolver o conflito de rascunho" | Recarregue e mostre o estado salvo: é o produto protegendo a última versão |
| Proposta alterada antes da aprovação | Aprovação mostra a versão analisada; comparação mostra "N condições mudaram desde a vX" | Explique: a aprovação vale para a versão vista; nova versão pede nova revisão humana |
| Falha de Storage / documento inacessível | Download não abre ou aviso de arquivo indisponível | Siga sem o anexo: a trilha mostra quem enviou e quando; o arquivo só sai por link temporário |
| Permissão revogada no meio | "Você não pode mais decidir este pedido… Nada foi registrado" / "Esta tarefa não está mais disponível para você. Nada mudou." | Troque para a persona com o papel certo ("Trocar persona") |
| Sessão expirada | "Sua sessão expirou e nada foi registrado" | "Entrar em outra aba", volte e repita: o formulário continua preenchido |
| 429 de entradas | "Muitas entradas em pouco tempo… Tente de novo em N minutos" | Espere o tempo informado na mesma persona; siga narrando a tela aberta. Se a janela nova não entra (limite de **4 workspaces novos por hora** na rede), continue na janela já aberta com "Trocar persona" — ela não consome workspace novo |
| Navegador travado | Página sem resposta | Reabrir a aba na mesma janela anônima; fechar a janela perde o cookie e uma nova entrada consome workspace |
| Celular incompatível | Navegador antigo sem módulos JS | Use o notebook; o produto exige navegador atual (Chrome, Safari, Firefox, Edge recentes) |
| Fonte/asset não carregou | Página sem estilo ou sem ação | Recarregue; persistindo, `hosted-parity` mostra o asset com falha. Roteiro B |
| Dados alterados pela apresentação anterior | Tarefa de ensaio, aprovação já feita | Por persona, cada janela anônima nova é um workspace novo e intocado; pelo baseline, `npm run demo:local:reset` **depois** |
