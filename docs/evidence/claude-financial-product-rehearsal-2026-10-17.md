# Evidência — hardening de produto e prontidão da Demo de 29/10 (Claude), 17/10/2026

Base: `main` @ `605c7f5` (#212–#214 integradas). Branch: a branch gerenciada da sessão, reiniciada dessa `main`.
Área exclusiva respeitada: `finance/**` (interface), `tests/e2e/**`, `scripts/demo/{readiness,requests,local.sh}`,
`docs/demo/**` e este documento. **Nenhum** arquivo de `api/**`, `lib/api/**`, `lib/finance/**`, autenticação/RLS,
migrations, `lib/runtime-mode.mjs`, `lib/deployment-topology.mjs`, scripts Vercel/recovery, `tests/database/**`,
`package.json`/lock, workflows, `docs/IMPLEMENTATION_MATRIX.md` ou arquivos do Codex. Maturidade: M1 + LOCAL_VALIDATED
(Demo canônica local, backend real em Docker). **Demo hospedada não validada.**

## Defeitos reproduzidos e corrigidos (por prioridade)

| # | Prior. | Onde | Antes (`main`) | Depois | Arquivos |
| --- | --- | --- | --- | --- | --- |
| F1 | **P0** | Solicitação em avaliação/decidida, quando aprovações, decisões ou política não carregam (429, 5xx, rede) | A falha virava "sem aprovação exigida" e "sem decisão": a tela oferecia **Registrar decisão** e o formulário, e o "Próximo passo" mandava decidir (captura `decision-gap-before.png`) | Aviso único no topo diz o que não carregou e que nada foi alterado; decisão e pedido de aprovação ficam indisponíveis até "Recarregar"; abas mostram "Indisponível até recarregar" | `finance/src/views/rfq.js`, `finance/app.js` |
| F2 | **P0** | Painel e Aprovações quando a lista de aprovações falha | Painel dizia "Tudo em dia"/"Nada pendente"; Aprovações mostrava caixas vazias | Painel avisa que pode haver pedido aguardando e leva a Aprovações; Aprovações mostra erro com repetição | `finance/src/views/dashboard.js`, `company.js`, `app.js` |
| F3 | **P0** | Qualquer tela com 429 | Mensagem do servidor + "Tentar novamente" ativo na hora (cada clique gastava a cota de novo); `Retry-After` ignorado; código de referência com UUID inteiro | Uma mensagem só ("Muitas requisições em pouco tempo… Tente de novo em N segundos"); botão volta só após `Retry-After` (ou 60 s), com contagem; nada repete sozinho; escrita diz "Nada foi registrado"; referência curta (8 caracteres) | `finance/app.js`, `finance/src/ui.js` |
| F4 | **P0** | Sessão expirada ao gravar (comentário, proposta, solicitação e demais formulários) | "Sessão expirada ou ausente." sem caminho; o provedor via "Entre na sua conta…" sem dizer se gravou | "Sua sessão expirou e nada foi registrado. Entre de novo em outra aba e repita aqui: o que você preencheu continua nesta tela." + link "Entrar em outra aba" (`/login.html?next=` da própria tela); carga de tela com 401 oferece "Entrar de novo" | `finance/app.js`, `ui.js`, `shared.js`, `provider.js`, `rfqs.js` |
| F5 | **P0** | Tarefas, `409 task_creation_unknown` com tarefa homônima | Qualquer tarefa aberta com o mesmo título (antiga, de colega) era apresentada como "a lista atualizada já mostra uma tarefa aberta com este título" — **falsa correspondência** | A tela diz quantas homônimas existem e que o título não prova nada; "Conferir com o servidor" reenvia a mesma tentativa com a **mesma chave** (o servidor devolve a tarefa gravada ou grava uma única vez) | `finance/src/views/company.js` |
| F6 | P1 | Erro do comentário | `<p>` sem `role=alert`: leitor de tela não anunciava a falha | anunciado | `shared.js` |
| F7 | P1 | Portal do provedor, convite sem `buyer_name` | "Aceite o convite de undefined" / "undefined · Crédito" | "Aceite o convite: <solicitação>"; sem comprador inventado | `provider.js` |

Regressões novas (`tests/e2e`): `finance-procurement` — governança não carregada, aprovações não carregadas no painel/lista,
429 com `Retry-After` (relógio controlado: nenhum pedido antes da espera), sessão expirada ao publicar comentário;
`finance-contracts` — 409 com homônima de outra pessoa (sem gravar) + teste 409 existente atualizado;
`finance-provider-draft` — convite sem nome do comprador. **Contra `origin/main` (worktree limpa, mesmos testes): 7 FAIL.
Com esta branch: PASS.**

## Prontidão da Demo (P0 §3)

`bash scripts/demo/local.sh readiness [--smoke]` (`scripts/demo/readiness.mjs`, novo): só lê; recusa alvo não local
(trava `assertDemoTarget` + host `localhost`); nunca reseta (aponta o comando). Verifica identidade (commit, árvore,
build e app mais novos que o último commit), serviços (contêineres, Auth, PostgREST, app, sonda de prontidão), personas
(8 entram pelo Auth local, sem gastar a cota de login do app), cenário (39/39 do `seed --check`, RFQs, contratos),
estado intocado do Modo interativo e smoke das jornadas (comparação, implantação por `contract_id`, covenants, leitor,
Meridian vê a coleta, Atlas não vê concorrentes). Saída sanitizada (sem senha, chaves, JWT, cookie ou id) e relatório
`reports/demo-readiness/readiness.{md,json}` com veredito **por modo**; "não executado" nunca conta como PASS.

Resultados reais nesta rodada:
- Demo recém-montada: **Modo leitura PRONTO, Modo interativo PRONTO** (smoke 6/6).
- Logo após o Modo 2: **ambos NÃO PRONTOS** (seed 36/39; Meridian já enviou; CFO já aprovou) → apontou
  `npm run demo:local:reset`. Detecção correta de Demo "usada".
- A sonda `/api/health?probe=ready` responde `not_ready` localmente (`topology:unassigned_database`): registrada como
  **aviso**, não PASS — o banco local não faz parte da topologia hospedada.

## Requisições e limite (P0 §4)

`node scripts/demo/requests.mjs` (novo, só lê) mede a jornada da gestora no backend real: login 11, Painel 9,
Solicitações 5, RFQ 12 (+4 ao percorrer as 6 abas), Aprovações 5, Contratos 5, Implantação 6, Covenants 6,
Instituições 5, Tarefas 5, Propostas 4 = **77 requisições**. **Nenhuma** chamada repetida na carga, **nenhuma** ao mudar
a largura (1440→390→1440), **nenhuma** em 10 s parada (sem polling). Não houve defeito de excesso a corrigir; o 429
observado vem da soma seed/checagens/ensaios na mesma janela de 10 min — tratado pela interface (F3) e pelo roteiro.

## Modo 2 — persistência no backend real

`scripts/demo/interactive.mjs` na Demo recém-montada, build desta branch: **9/9 operações persistidas e verificadas
após recarregar** (`claude-financial-product-rehearsal-2026-10-17/interactive-result.json`): tarefa com Rafael,
conclusão, impedimento, aprovação da CFO, efeito no Painel, proposta v1 da Meridian, isolamento da Orbe ("Proposta
não encontrada"), v2 com "1,29% → 1,27%", recebimento pela empresa. Em seguida, `npm run demo:local:reset` explícito.

## Roteiro

`docs/demo/PRESENTATION_2026-10-29.md`: prontidão verificável por modo antes de começar; a jornada em **16 etapas**
mapeada aos passos com os **cenários sintéticos distintos** (A nova linha, B adquirência Lumina, C concorrência
sazonal, D crédito do Atlas) e frases de transição — sem ligar objetos de histórias diferentes; plano B atualizado
(429 com espera, governança não carregada, resultado incerto de tarefa, sessão expirada, prontidão "NÃO PRONTO").

## Capturas antes/depois

`claude-financial-product-rehearsal-2026-10-17/`: `decision-gap-{before,after}[-mobile].png`,
`dashboard-approvals-{before,after}[-mobile].png`, `rate-limit-{before,after}[-mobile].png` (mesmos cenários de falha
simulados no navegador; antes = build de `origin/main`, depois = esta branch; 1280 px e Pixel 7).

## Validação

| Verificação | Resultado |
| --- | --- |
| Node 24.22.0, `npm ci --include=optional`, `check:all`, `build`, `check:design`, `check:demo-parity`, `check:financial-surface`, `check:financial-navigation`, `git diff --check` | PASS |
| `test:e2e` — Chromium desktop + Pixel 7 | ver descrição da PR |
| `test:e2e:presentation`, `test:e2e:demo` | ver descrição da PR |
| `demo:setup` / `demo:local:reset` | 39/39 |
| Modo 2 (`interactive.mjs`) | 9/9 |
| Regressões novas contra `origin/main` | 7 FAIL |
| Firefox, WebKit, iPhone | **NOT_RUN** localmente (só Chromium); o gate `presentation` do CI cobre os cinco motores |
| `test:database` | NOT_RUN — sem SQL |

## Auditado sem defeito novo demonstrável

Conflito de versão na decisão (já tratado: nada gravado, mudanças mostradas, confirmação explícita), comparação
indisponível (recusa cálculo local), envio de proposta recusado (botão volta, dados preservados), proposta de outra
instituição ("Proposta não encontrada"), leitor sem controles de escrita (#214), rascunho de RFQ entre abas.

## Pendências para o Codex (handoff, sem alteração no servidor)

| ID | Prior. | Endpoint | Atual | Necessário | Reprodução |
| --- | --- | --- | --- | --- | --- |
| H-4 | P2 | 429 de `api/[...path].js` (limite em memória e distribuído) | sem `Retry-After` e sem `code` | `Retry-After` com os segundos até o fim da janela e `code: 'rate_limited'`; a interface já usa ambos (hoje cai no padrão de 60 s) | `node scripts/demo/requests.mjs` duas vezes seguidas |
| H-1 | P1 | `GET assignments` | sem `buyer_name` (inalterado desde a #214) | campo aditivo; a interface já o consome de forma opcional | Patrícia → Portal |
| H-2 | P2 | perfil de limite da Demo local | seed/reset consomem a cota da gestora | decisão via `lib/runtime-mode.mjs` | `npm run demo:local:reset` seguido do ensaio |

## Riscos

- Demo hospedada não validada (Codex/M3).
- Cota legítima: prontidão e reset ≥10 min antes do ensaio; o roteiro diz isso.
- Bloqueio de decisão por leitura incompleta é deliberado: com rede instável, a decisão espera o "Recarregar".

## Rollback

Reverter a PR: interface, testes, scripts locais da Demo e documentos. Nenhum contrato de API, dado ou migration.
