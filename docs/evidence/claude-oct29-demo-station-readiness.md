# Estação da apresentação de 29/10 — Plano B (Claude, 19/10/2026)

Categorias: **CÓDIGO** (nesta branch) · **LAB_VALIDATED** (executado no laboratório desta sessão: container de nuvem efêmero, Docker local, serviços reais) · **STATION_VALIDATED** (executado na estação física da apresentação) · **HOSTED_VALIDATED** · **BLOCKED** · **NOT_RUN**.

> **A estação física do proprietário não foi preparada por esta sessão.** Tudo abaixo rodou num container de nuvem que é reciclado quando fica ocioso (aconteceu duas vezes nesta missão: Docker, gateway e app pararam). O que se entrega é o procedimento **provado** de ponta a ponta e o cartão do operador para repetir na máquina da apresentação. Até isso acontecer lá, o estado de B é **"procedimento validado em laboratório; estação NOT_RUN"**.

## 1. Diagnóstico (LAB_VALIDATED)

| Item | Valor |
| --- | --- |
| SHA da `main` usado | `4f9556e6343b80111aecb67e4e09b2e6784c3012` (mais os commits desta branch: só `scripts/demo/**` e `docs/**`, nenhum de interface) |
| Ferramentas | Node 24.22.0, npm 11.19.1, Docker 29.8.2, Compose v5.6.0, psql 16.15, age/age-keygen 1.1.1, Playwright 1.64.0 (Chromium) |
| Recursos | 4 CPUs, 15 GB de RAM, 23 GB livres (preflight do harness exige 6 GB e 12 GB) |
| Imagens | `supabase/postgres:15.14.1.064`, `supabase/gotrue:v2.181.0`, `postgrest/postgrest:v12.2.9`, `supabase/storage-api:v1.25.3` |
| Limites lidos no código (19/10) | API por usuário: **240 req/10 min** e **60 escritas/10 min**; login por rede **12/10 min**; login por conta **20/h**; entrada por persona **12/10 min** por rede; **workspaces novos: 4/h por rede**; teto de 25 workspaces ativos; workspace vale 24 h (4 h sem uso). O roteiro dizia "120/10 min" — corrigido |

## 2. Ensaio completo isolado — `docs/DEMO_RELEASE_REHEARSAL.md` (LAB_VALIDATED)

1ª execução, **exatamente como o documento lista**: falhou em `e2e demo-desktop` — as duas suítes de visitante pararam na primeira entrada porque não havia pool. O documento omite a fase **`pool`**, que o workflow `demo-integration.yml` executa entre `check` e `recovery` (handoff H-15). 2ª execução na ordem do workflow:

| Fase | Resultado |
| --- | --- |
| preflight, npm ci, build, images, up | OK |
| smoke | **17/17 PASS** (RLS em 117 tabelas `fin_*`, Auth, PostgREST, Storage privado, sessões e revogação) |
| seed / check | OK |
| pool | **4/4**; `VISITOR_POOL_VALIDATED ready=4` |
| recovery | backup → restore → sondas → canário → binários; Storage `MATCH` em 30 objetos, permissões negadas como esperado; **recovery COMPLETE** |
| e2e demo-desktop | **8 passed, 1 skipped** (o ensaio completo tem flag própria); `VISITOR_E2E_VALIDATED tests=2` |
| e2e demo-mobile | **6 passed, 3 skipped** (visitantes só no desktop, por desenho) |
| journey | PASS, inclusive **documentos v1/v2, histórico, remoção e download recusado (403)** |
| adversarial | **24 sondas, 24 PASS, 0 FAIL, 0 SKIPPED** |
| evidence / down | OK; `REHEARSAL_EXIT=0` |

Decisão do ensaio isolado: **B (laboratório)**. Ele termina com teardown: não deixa estação.

## 3. Estação montada do zero depois do teardown (LAB_VALIDATED)

1. `npm run demo:setup` → **39/39**.
2. `npm run demo:local:workspaces -- provision --count=4` → **4/4** (≈ 640 s por par).
3. Prontidão **durante** o provisionamento: "Etapa da CFO" FAIL com "organização não lida" — falso. Reproduzido: a leitura estourou os 15 s com dois seeds ocupando o banco. Corrigido o diagnóstico (seção 6). Mesma prontidão com o pool pronto: **Modo leitura PRONTO · Modo interativo PRONTO** (CFO pendente, Meridian sem proposta, 0 tarefa de ensaio, pool 4 prontos, 0 entradas novas na hora).

## 4. Ensaio da apresentação na estação (LAB_VALIDATED)

| Ensaio | Resultado | Prova |
| --- | --- | --- |
| Dois visitantes simultâneos (`demo-entry-journeys`) | **1 passed** | workspaces diferentes; escrita de A invisível para B; troca de persona preserva o workspace; logout → 401 |
| Roteiro inteiro pela entrada pública (`demo-entry-lifecycle`, `ARANDU_DEMO_LIFECYCLE_E2E=1`) | **1 passed (9,8 min)** | o tempo é espera legítima de `Retry-After` (12 entradas/10 min por rede), logo depois do teste de dois visitantes: entrada → Painel → RFQ → comparação → CFO aprova (relido) → "Registrar decisão" → contrato com origem → implantação → covenants → renovação → tarefa relida → Meridian v1/v2 com histórico → Orbe sem acesso → "versão 2 de 2" → leitor sem escrita → sair = 401 |
| Baseline, desktop e mobile (`demo-baseline`) | **8 passed** | tesouraria ponta a ponta, CFO, provedor, Passport, pós-contrato com **documento**, responsáveis de tarefa |
| **Modo 2** no cenário-base (`scripts/demo/interactive.mjs`) | **9/9 persistidas e relidas** | tarefa criada e concluída, impedimento de implantação, aprovação da CFO, efeito no Painel, Meridian v1 e v2 (1,29% → 1,27%), Orbe "Proposta não encontrada", comprador recebe "versão 2 de 2" |
| **Modo 1** (leitura, 1440 e 390 px) | **0 erro de console, 0 4xx/5xx da API, 0 overflow, 0 UUID/ISO/enum na tela** | Painel, Solicitações, RFQ da nova linha (5 abas), comparação/aprovação/decisão da adquirência, Contratos, Implantação, Covenants, Instituições, Tarefas, Propostas, aprovações da CFO, portal da Meridian |
| Permissões | leitor sem caixa nem formulário; provedor sem concorrentes; aprovação só pela CFO na vez dela | lifecycle, baseline e Modo 2 |
| Sessão expirada, 401/403/409/429/500, rede, resposta perdida | cobertos pela suíte `npm run test:e2e` (707 passed na #226) e pela #216/#218; não reexecutados aqui porque nenhuma tela mudou | NOT_RUN nesta rodada |

## 5. Repreparação depois do ensaio

`npm run demo:local:reset` (cenário-base de volta) e `provision --count=3` (pool de volta a 4 prontos). Prontidão final: seção 8.

## 6. Correções (CÓDIGO, `scripts/demo/**` e `docs/demo/**`)

| # | Defeito | Correção |
| --- | --- | --- |
| R1 | A prontidão não olhava o **pool de visitantes**: sem workspaces, o Modo interativo por persona falharia só na frente do cliente ("A demonstração está cheia") | Novo item do Modo interativo: ≥ 2 workspaces prontos e ≤ 2 entradas novas na última hora (o servidor aceita 4/h por rede); o FAIL diz o comando |
| R2 | Leitura sem resposta (timeout) aparecia como "nenhum pedido pendente (organização não lida)" e mandava **resetar** uma estação intacta (15 min e pool perdido à toa) | "A API não respondeu… nada indica uso anterior", com correção "rode de novo em alguns minutos, sem reset" |
| R3 | Roteiro com limite antigo da API (120/10 min) | Valores lidos do código |
| R5 | Leitura da prontidão logo depois do `seed --check` falhava às vezes com `UND_ERR_SOCKET` (socket keep-alive morto) | `get()` repete **uma vez** só leituras (GET) nesse erro; escrita nunca é repetida |
| R4 | Não havia uma página única para o operador | `docs/demo/OPERATOR_29-10.md`: A/B/C, D-1, T-30 em 12 itens, durante, contingência curta, recuperação e encerramento |

## 7. Estado do seed, pool, login, persistência e isolamento

- Seed: **39/39** após o setup e após o reset.
- Pool: 4/4 no setup; 3 consumidos no ensaio; reposto (seção 8).
- Login: 8 personas do baseline entram (prontidão); entrada por persona: Juliana, Rafael, Carlos, Helena, Meridian, Orbe.
- Persistência: Modo 2 9/9 e lifecycle — tudo relido depois de recarregar.
- Isolamento: dois visitantes simultâneos e 24 sondas adversariais (inclusive provedor chamando RPCs com IDs da compradora).
- Documentos privados: journey do harness (v1/v2, remoção, 403) e baseline (documento no pós-contrato).

## 8. Prontidão final da estação (LAB_VALIDATED)

Depois do reset e da reposição do pool, esperando a janela de 1 h das entradas do ensaio:

- 05:40 UTC: Modo leitura PRONTO; Modo interativo NÃO PRONTO por **uma** linha: "a API não respondeu à leitura das aprovações (UND_ERR_SOCKET); nada indica uso anterior" — R2 já evitou o falso "rode reset". Investigado: `approvals` respondeu 200 em ~120 ms em 15 chamadas com pausas de 0 a 6 s; a falha vinha do socket keep-alive fechado na pausa longa do `seed --check`, reaproveitado pelo `fetch` do Node (o navegador repete GET nesse caso; o produto não é afetado). Correção R5.
- **05:41 UTC, commit `3490662` (árvore limpa): Modo leitura PRONTO · Modo interativo PRONTO** — 8 personas entram, 39/39, CFO pendente, Meridian sem proposta, 0 tarefa de ensaio, pool 4 prontos e 0 entradas novas na hora, smoke das jornadas PASS, Atlas sem concorrentes. Único AVISO: sonda hospedada (esperada no laboratório). Relatório sanitizado (sem senha, token, cookie ou chave — conferido): `claude-oct29-demo-station-readiness/readiness-final.md`.

O laboratório **não** foi derrubado depois disso (sem `demo:down`), mas é um container efêmero: não serve como a estação do dia 29.

## 9. Estado A / B / C

- **A — HOSTED: BLOCKED.** `arandu-demo.vercel.app` segue NOT_READY (Codex).
- **B — procedimento LAB_VALIDATED; estação física NOT_RUN.** Repetir `OPERATOR_29-10.md` (D-1 e T-30) na máquina da apresentação.
- **C** se a estação física não chegar a "Modo leitura PRONTO".

## 10. Handoff ao Codex

| Campo | H-15 |
| --- | --- |
| Problema | `docs/DEMO_RELEASE_REHEARSAL.md` lista as fases do ensaio local **sem `pool`**; o workflow executa `pool` entre `check` e `recovery` |
| Reprodução | Rodar o bloco do documento como está |
| Observado | `e2e demo-desktop`: `demo-entry-journeys` e `demo-workspaces` falham na primeira entrada (sem workspace); `REHEARSAL_EXIT=1` |
| Esperado | Documento igual ao workflow: `… check`, `pool`, `recovery` … |
| Severidade | P2 (o ensaio local documentado reprova sem defeito do produto) |
| Aceite | Bloco do documento com `pool`; rodado como está termina em `REHEARSAL_EXIT=0` (reproduzido nesta sessão com a fase incluída) |
