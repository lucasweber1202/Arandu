# Evidência — produto financeiro enterprise e Demo comercial verificável (Claude), 17/10/2026

Base: `main` @ `0fb48d3` (#212 integrada). Branch: a branch gerenciada da sessão, criada dessa `main`.
Área exclusiva respeitada: só `finance/**` (interface), `tests/e2e/**`, `scripts/demo/{seed,dataset,interactive,audit}.mjs`,
`docs/demo/**` (roteiro e dataset) e este documento. **Nenhum** arquivo de `api/**`, `lib/api/**`, `lib/finance/**`,
`lib/runtime-mode.mjs`, `lib/deployment-topology.mjs`, migrations, `tests/database/**`, workflows, `package.json`/lock,
`docs/IMPLEMENTATION_MATRIX.md` ou `docs/evidence/codex-*`. Maturidade: M1 + LOCAL_VALIDATED (Demo canônica local,
backend real em Docker: Postgres, GoTrue, PostgREST, Storage e a API do Arandu). **Demo hospedada não validada.**

## Como a auditoria foi feita (Lote A)

`scripts/demo/audit.mjs` (novo, só leitura, recusa URL não local) entra com cada persona pela tela de login real e
percorre as telas do produto: Juliana (gestora, 21 telas + 5 RFQs × 6 abas), Helena (CFO/admin), Rafael (analista),
Carlos (Controller, leitor), Patrícia (Meridian) e Diego (Lumina). Cada tela é carregada uma vez em 1440 px e
remedida em 1024, 768, 390, 375 e 320 px sem recarregar (o limite da API não aceita uma carga por largura).
Procura: identificador, instante/data ISO, enum cru, `undefined/null/NaN`, rolagem horizontal da página, controle
fora da tela, erro de console, resposta da API com falha e tela de erro. Além do automático, as capturas de cada tela
foram revisadas uma a uma (hierarquia, papel, linguagem, próximos passos).

Resultado automático na `main` (antes): **0** UUID/ISO/enum/overflow/controle cortado em todas as larguras; os únicos
achados foram respostas **429** (limite legítimo de 120 requisições/10 min por pessoa) depois de ~25 telas seguidas da
mesma persona — ver "Riscos para 29/10". Depois das correções: 0 achados (capturas em `reports/demo-audit-after`, local).

## Defeitos reproduzidos e corrigidos

| # | Sev. | Onde / persona | Antes (`main`) | Depois | Regressão (FAIL na `main`, PASS aqui) |
| --- | --- | --- | --- | --- | --- |
| D1 | **P0** (Demo) | Portal do provedor | O seed não tinha concorrência com coleta aberta: nenhuma instituição podia enviar proposta ao vivo; o ciclo comprador ↔ instituição só era mostrado em leitura | Cenário sintético novo no seed canônico (`RFQ_OPEN`): "Capital de giro sazonal — safra de inverno (R$ 5 mi / 12 meses)", em coleta, prazo em 9 dias; Orbe já enviou v1, Meridian aceitou e não enviou. Check de sanidade novo (39/39) | `seed.mjs --check`: "Concorrência aberta: proposta recebida e instituição convidada sem envio" |
| D2 | P1 | Painel e menu do **leitor** (Carlos) | "Precisa de você: Obrigação: Dívida líquida / EBITDA · Sem responsável · Vencida" e contador "Tarefas 16" — tarefas que o papel dele não conclui nem assume (o banco recusa) | Leitor só vê como pendência o que foi atribuído a ele; tarefas da equipe continuam visíveis para acompanhamento fora de "Precisa de você"; contador do menu segue a mesma regra | `finance-contracts`: "painel e menu do leitor: tarefa sem responsável não vira pendência dele…" |
| D3 | P1 | Conversa do processo (RFQ → Atividade), leitor | Formulário "Publicar comentário" e botões "Responder" oferecidos ao leitor; `fin_post_comment` recusa (`forbidden`) | Leitor vê os comentários e um aviso de que comentar fica com análise, gestão e administração; sem formulário | `finance-procurement`: "leitor: conversa do processo em leitura…" (+ controle: gestão mantém o formulário) |
| D4 | P1 | Configurações, usuário convidado (B2) | Nenhum lugar dizia o papel, a organização, o que o papel permite e o que não permite | Card "Seu acesso": "Leitura e aprovação em Vitta Foods S.A.", "Você pode" / "Fica com outros papéis", e a quem pedir outro acesso (espelha `UI_PERMISSION_ROLES` e as regras do banco; servidor continua a autoridade) | `finance-procurement`: "configurações: Seu acesso…" |
| D5 | P2 | Configurações (leitor) e qualquer campo desabilitado | Campo de texto desabilitado parecia editável (fundo branco): a regra `input:disabled` perdia em especificidade | Fundo rebaixado, texto atenuado e cursor de bloqueio também nos campos de texto | mesmo teste (cor computada) |
| D6 | P1 | Tarefas, `409 task_creation_unknown` (H3) | Mostrava só o aviso genérico; não relia a lista que o servidor pede para conferir | Não mostra sucesso; relê a lista persistida; se já existe tarefa aberta com o título, diz isso; mantém a mesma chave de idempotência; repetir não duplica | `finance-contracts`: "tarefas: 409 task_creation_unknown não vira sucesso, relê a lista…" |
| D7 | P1 | Comparação com coleta aberta (E2) | Matriz de uma coluna sem dizer que é parcial | "Coleta em andamento: 1 de 2 instituições convidadas enviaram proposta… com uma só proposta não há comparação lado a lado"; convite revogado não conta; some na avaliação | `finance-procurement`: "comparação com coleta aberta…" |
| D8 | P2 | Formulários com valor monetário (C2: proposta, RFQ, edição da demanda) | `5000000` digitado sem leitura; erro de casa decimal só aparecia no resumo | Leitura por extenso sob o campo ("= R$ 5.000.000"), associada por `aria-describedby`; rascunho recuperado atualiza a leitura sem marcar o formulário como alterado | `finance-provider-draft`: "envio da proposta: obrigatórios validados, valor por extenso…" |
| D9 | P2 | Portal do provedor (hero) | "Empresa · prazo em 9 dias": placeholder no lugar do comprador (a API não envia o nome — handoff H-1) | Não inventa nome: "Prazo em 9 dias" | `finance-provider-draft`: "comprador sem nome na resposta…" |
| D10 | P3 | Formulários em grade | Campo vizinho de um campo com texto auxiliar descia (grid esticava as linhas do `.field`) | `align-content:start` no `.field` | capturas |
| D11 | P3 | Linha do tempo do contrato | "Aviso prévio 11 de nov" e "60 dias 11 de nov" repetidos | "Aviso prévio · 60 dias" uma vez | `finance-contracts`: "linha do tempo do contrato…" |

Cobertura nova sem defeito na `main` (passam nos dois): envio recusado pelo servidor não aparece como enviado
(botão volta, dados preservados, motivo dito); link de proposta de outra instituição mostra "Proposta não encontrada"
sem dado da solicitação.

Execução das regressões novas contra a `main` (worktree limpa de `origin/main`, mesmos testes): **8 FAIL** (D2, D3, D4/D5, D11,
D6, D7, D8, D9) e 2 PASS (cobertura). Com esta branch: todas PASS (Chromium desktop e Pixel 7).

## Modo 2 — operações reais e persistidas (`scripts/demo/interactive.mjs`)

Só roda contra a Demo local. Cada operação passa pela interface e só conta se reaparece depois de recarregar.
Login com espera honesta no limite por IP (12/10 min) e 4 sessões no total (antes eram 5).

| Op. | Persona | Ação | Verificação após recarregar |
| --- | --- | --- | --- |
| I1 | Juliana | criar tarefa com responsável Rafael | tarefa com Rafael |
| I2 | Juliana | concluir a tarefa | em "Concluídas" |
| I3 | Juliana | impedimento no plano da Lumina | impedimento no detalhe |
| I4 | Helena (CFO) | aprovar a etapa pendente | pedido em "Concluídas" |
| I5 | Juliana | (efeito) Painel | "Registrar decisão: Capital de giro — nova linha…" |
| **I6** | **Patrícia (Meridian)** | enviar proposta pelo portal (primeiro sem obrigatórios → "Obrigatório para enviar."; depois produto, valor, taxa, prazo, CET, carência, nota) | "Proposta enviada · versão 1" e histórico "Versão 1" |
| **I7** | **Bruno (Orbe)** | abrir o link direto da proposta da Meridian | "Proposta não encontrada"; nenhuma condição/nome da Meridian na tela |
| **I8** | Patrícia | revisar a taxa e enviar a versão 2 | histórico com "1,29% → 1,27%" |
| **I9** | Juliana | Solicitações → concorrência sazonal → Propostas | "Meridian Financial · versão 2 de 2", fora de "Ainda sem resposta"; Comparação: "2 de 2 instituições convidadas enviaram proposta" |

**Resultado no backend real (desktop 1440), HEAD desta branch, Demo recém-resetada: 9/9 PASS**
(`claude-enterprise-product-2026-10-17/interactive-result.json`, capturas `interactive-6…9`). A Demo foi resetada em
seguida (`demo:local:reset`). Uma execução anterior marcou I9 como FAIL por engano do próprio ensaio (lia a lista de
convidados da aba oculta "Visão geral"); corrigido para ler só o painel visível e confirmado na tela real.

## Validação

| Verificação | Resultado |
| --- | --- |
| Node 24.11.0, `npm ci --include=optional`, `check:all`, `build`, `check:design`, `check:demo-parity`, `check:financial-surface`, `check:financial-navigation`, `git diff --check` | PASS |
| `test:e2e` — Chromium desktop + Pixel 7 | 397 passed, 7 skipped (antes: 377/7) |
| `test:e2e:presentation` — Chromium desktop + Pixel 7 | 125 passed, 19 skipped |
| `demo:setup` / `demo:local:reset` | 39/39 checagens (inclui a concorrência aberta), em quatro resets |
| `test:e2e:demo` (backend real) | desktop 6 + 1 skip; celular 6 + 1 skip. Duas execuções logo após reset/ensaio falharam por limite legítimo (429 da API; login 12/10 min por IP) e passaram depois da janela — ver H-2 |
| `scripts/demo/interactive.mjs` | 9/9 operações persistidas e verificadas após recarregar |
| `scripts/demo/audit.mjs` | antes: 0 achados de linguagem/layout, só 429 depois de ~25 telas seguidas; depois (Carlos, Helena, Rafael, Patrícia, Diego): 0 achados. Telas da Juliana depois da mudança cobertas por `test:e2e:demo` e Modo 2 (cota da API) |
| Regressões novas contra `origin/main` | 8 FAIL (D2–D9 e D11), 2 PASS (cobertura) |
| Firefox, WebKit, iPhone | **NOT_RUN** localmente (só Chromium 1194); gate `presentation` do CI cobre |
| `test:database` | NOT_RUN — sem SQL |

## Frentes auditadas sem defeito novo demonstrável

Dashboard da gestora (itens com motivo, prazo e responsável; contadores com link), aprovações da CFO (contexto,
etapa, ações), decisão bloqueada por aprovação pendente (explica e leva ao pedido), contratos e renovação (D-90/60/30,
aviso prévio em data absoluta, "Iniciar nova concorrência", atalhos de implantação e covenants por `contract_id`),
tarefas (filtros no servidor, contagem honesta, idempotência), portal do provedor (isolamento, rascunho, versões),
nova solicitação para leitor ("Seu papel não cria solicitações"), comparação (sem vencedor, origem por célula).
Performance (Lote N): 5–8 chamadas por tela e 11 no detalhe da RFQ, sem chamadas repetidas; nenhum cache novo
(não guardar dado financeiro no navegador).

## Pendências para o Codex (handoff, sem alteração no servidor)

| ID | Prior. | Tela / persona / fluxo | Endpoint | Atual | Necessário | Risco | Reprodução |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H-1 | P1 | Portal do provedor, Patrícia/Bruno: início, oportunidades e proposta | `GET /api/finance/assignments` | linhas sem nome do comprador (`buyer_name` ausente); a instituição não sabe qual empresa convidou | campo aditivo com o nome de exibição da organização compradora (nome fantasia ou razão social), lido sob o JWT/RLS do provedor convidado | baixo (aditivo); a interface já usa `buyer_name` quando existir | Demo local, Patrícia → `/provider/index.html`: "Prazo em 9 dias" sem empresa |
| H-2 | P2 | Ensaio da apresentação (todas as personas) | limite de requisições/login | 120 req/10 min por pessoa e 12 logins/10 min por IP: o próprio seed consome a cota da gestora e a suíte `test:e2e:demo` logo após o reset recebe 429 | decidir, via `lib/runtime-mode.mjs`, se a Demo **local** pode ter perfil de limite próprio — sem enfraquecer Production | médio para 29/10 (tela "Muitas tentativas" ao vivo) | `npm run demo:local:reset` seguido de `npm run test:e2e:demo` |
| H-3 | P3 | Erros genéricos | respostas de erro | "Código de referência: <uuid completo>" | (opcional) referência curta para leitura ao telefone com o suporte | baixo | qualquer 429 na Demo |

## Riscos para 29/10 e o que permanece não comprovado

- **Demo hospedada não validada** (Codex/M3). Nada aqui prova Preview/Production.
- Limite legítimo da API e do login (H-2): logar antes, não recarregar telas em sequência, esperar o reset terminar
  ~10 min antes do ensaio. O Modo 2 agora espera o limite de login em vez de falhar.
- Firefox, WebKit e iPhone: **NOT_RUN** localmente (Chromium 1194 apenas); o gate `presentation` do CI cobre os cinco motores.
- `test:database`: NOT_RUN — nenhuma alteração de SQL.
- O cenário sazonal é separado da nova linha de R$ 12 mi (explicado no roteiro); a demonstração não encerra a coleta
  nem registra decisão nele.

## Capturas

`claude-enterprise-product-2026-10-17/` (Demo local, dados fictícios): antes/depois do Painel do leitor (390 px), de
Configurações do leitor, do início do portal da Meridian, da comparação com coleta aberta e do formulário da
proposta; e as capturas das operações I6–I9.

## Rollback

Reverter a PR. Interface, testes, scripts de Demo e documentos; nenhum contrato de API, dado de produção ou migration.
O cenário novo do seed só existe depois de `npm run demo:local:reset`/`demo:setup` em banco marcado como demonstração.
