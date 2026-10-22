# Ensaio da estação de 29/10 — laboratório, 22/10/2026

**Ambiente real: B — executor Linux efêmero (sessão remota do Claude Code), não WSL2.**
Veredito da estação física: **STATION_NOT_VERIFIED**. O próprio `station` recusa READY
aqui ("executor efêmero (CLAUDE_CODE_REMOTE): nunca é a estação"). Dados 100% sintéticos;
nenhum ambiente hospedado foi tocado; nenhum freeze foi gravado (o freeze definitivo é
na máquina do owner, no SHA aprovado).

## Identidade

| Item | Valor |
| --- | --- |
| Checkout | `main@ef5e8c92460647b2c1b58b598cd8b4970a0d796f`, árvore limpa |
| SHA servido pelo app | igual ao checkout (`station`: "SHA integral confere") |
| Node / npm | 24.22.1 (tarball oficial, SHA-256 conferido) / 11.19.1 |
| Migrations | marker `financial-external-proposals-1` = esperado |
| Docker / Compose | 29.9.1 / 5.6.0; imagens oficiais via `mirror.gcr.io` (Docker Hub 429; cartão C2) |
| Chromium | 141.0.7390.37. **Desvio de laboratório:** o executor não baixa navegadores; o build 1194 instalado foi apontado como o 1248 do lockfile por um diretório temporário de links. Na máquina real use `npx playwright install chromium`. |

`npm ci --include=optional`, `npm run check:all` e `npm run build` no Node 24: PASS.

## Serviços e dados

| Item | Resultado |
| --- | --- |
| PostgreSQL / Auth / PostgREST / Storage / gateway / app | healthy / 200 / 200 / 200 / 200 / 200 `ARANDU_ENV=demo` |
| Seed | 39/39 (prepare-station, reset de laboratório e checagem final) |
| `prepare-station --provision` | 1ª tentativa parou no gateway: Auth em reinício contínuo até o banco ficar healthy (cartão C3); 2ª: requisitos OK → stack retomada → 39/39 → pool 4 (637 s por lote de 2) → leitura e interativo PRONTO → estação **PREPARED** (só freeze, declaração e máquina persistente pendentes, por desenho) |
| Isolamento entre visitantes | `demo-workspaces` 1/1: workspaces, escritas, aprovações e sessões isolados |
| Fim do dia | pool consumido pelos ensaios (0 prontos) → `provision --count=2` (637 s) → 2 prontos. Prontidão final: leitura **PRONTO**; interativo **NÃO PRONTO** só pelo orçamento de 4 entradas novas/h da rede (expira sozinho). Uma leitura de aprovações deu EPIPE durante o provisionamento e passou depois (o cartão já manda não rodar a prontidão com o pool provisionando) |

## Jornadas efetivamente executadas (Chromium desktop, backend real)

| Teste | Resultado |
| --- | --- |
| `demo-entry-lifecycle` (roteiro de 29/10 pela entrada pública: compra, aprovação, contrato, pós-contrato, instituição, leitor, saída) | 1/1 PASS (47 s, 1 workspace) |
| `demo-baseline` (6 jornadas no cenário-base) | 1ª: 5/6 — 429 na escrita de responsáveis, logo após outros ensaios; 2ª, com janela de cota nova: **6/6**, seed 39/39 |
| `demo-workspaces` (2 visitantes) | 1/1 PASS |
| `scripts/demo/audit.mjs` (todas as personas, 6 larguras, só leitura) | 0 achados de identificador/ISO/enum, overflow, controle fora da tela ou console; 7 achados = 429 da Juliana logo após o reset |

Os 5 atos do roteiro final (`PRESENTATION_2026-10-29.md`) usam só telas e dados
observados nesta sessão e em 22/10 (capturas da evidência `claude-product-experience-2026-10-22`).

## Ensaio de falhas (medido)

| Cenário | Sintoma | Procedimento | Medido |
| --- | --- | --- | --- |
| Só o app parado | `station --fast`: App/SHA BLOCKED, ECONNREFUSED | `local.sh app` | 1 s, 200, sem cota (C4) |
| Docker reiniciado | banco `Exited`, Auth em loop, PostgREST "schema cache" | `resume`/`prepare-station` de novo; `docker restart` do rest | 2ª tentativa OK, 39/39 (C3) |
| `resume` depois de uso intenso | "limite de requisições… aguardando 30 s" | esperar | 487 s (C5) |
| Ensaio de escrita interrompido por 429 | seed 38/39 "Tarefas com e sem responsável"; interativo NÃO PRONTO | reset só antes do D-1; no D-0, Modo leitura | reset 636 s, 39/39, pool preservado (C6) |
| Pool esgotado | "0 pronto(s)… capacity_unavailable" | Modo leitura; repor no D-1 | ver acima |

Não repetidos hoje (medidos em 19/10, `docs/demo/EVIDENCE_2026-10-19.md`): Storage
parado, banco parado com sessão mantida, link de documento expirado.

## Problema conhecido confirmado

`docs/supabase-financial-covenants.sql:99` cria a tarefa do período sem `assignee_id`,
embora a obrigação tenha responsável: Painel/Central mostram "Sem responsável";
Covenants mostra Juliana. Exige migration (fora desta rodada); o roteiro explica o caso.
Contrato sugerido ao Codex: a tarefa herda o responsável da obrigação.

## O que falta (só na máquina do owner)

Seguir o cartão `OPERATOR_29-10.md` (D-3, D-1, D-0) no SHA aprovado e em WSL2. Avaliação
desta rodada: **GO somente leitura** como plano mínimo comprovado em laboratório; GO completo
depende de `station` = READY na estação física.
