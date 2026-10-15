# QA adversarial — 14/10/2026

Base: `main` em `80fb0758f33cfe30ee02b4d23722605a23d35c7d` (merge da #189).
Ambiente: só infraestrutura efêmera — Supabase real em Docker (Postgres 15,
GoTrue, PostgREST, Storage) no container da sessão e no runner do GitHub
Actions, Postgres 16 descartável para `npm run test:database`, dados sintéticos
da Vitta Foods. Nenhum Supabase hospedado, secret ou deploy foi tocado.

Estados usados aqui: **PASS**, **FAIL**, **SKIPPED** (pré-condição ausente),
**NOT RUN** (não executado nesta rodada). Nada não executado é contado como PASS.

## Defeitos

| ID | Sev. | Problema | Reprodução | Correção | Estado |
| --- | --- | --- | --- | --- | --- |
| D1 | P1 | Aditivo que prorroga o contrato quebrava o ciclo de renovação: (a) o contrato seguia "em renovação" e a tarefa "Revisar renovação" seguia vencendo na data antiga; (b) os marcos eram únicos por (contrato, marco), então o novo vencimento **nunca mais** gerava marco, tarefa ou aviso — o contrato prorrogado chegava ao fim sem alerta. | Supabase real: contrato a 20 dias do fim → agenda grava D-30 → aditivo +12 meses → status `renewing`, tarefa para hoje; contrato de novo a 19 dias do fim → agenda cria 0 marcos e 0 avisos. Sondas `RENEW-1/2` falhavam pela API real. | Migration `supabase-financial-renewal-cycles.sql`: marco ganha o ciclo (`cycle_ends_on`), unicidade (contrato, ciclo, marco), histórico preservado e reclassificado; agenda e processamento por organização usam o ciclo; aditivo que muda fim/aviso recalcula status e move a tarefa de revisão. Rollback recusa se já houver dois ciclos (não apaga evidência imutável). | Corrigido; `tests/database/financial-renewal-cycles.sql` falha no código anterior ("prorrogado deveria voltar a vigente") e passa no novo |
| T1 | P3 (teste) | `tests/e2e/demo-baseline.spec.js` esperava 2 contratos vigentes; o seed cria 3 desde 72d860c. O spec não rodava em CI. | Primeira execução integrada. | Corrigido na #189. | Corrigido |
| T2 | P3 (infra) | `scripts/demo/local.sh app` segurava o stdout de quem chamava; qualquer `| tee` travava. | Ensaio do harness. | Corrigido na #189. | Corrigido |
| T3 | P3 (teste) | Minhas próprias sondas: uma tratava documento compartilhado legítimo como vazamento; outra marcava "n/a" como PASS. | Triagem das sondas. | Regra certa (só `shared` da RFQ convidada ou da própria proposta) e estado SKIPPED. | Corrigido |

Nenhum P0 confirmado.

## Riscos residuais (não corrigidos nesta rodada)

Atualização da missão Stage 0 (`docs/STAGE0_READINESS_2026-10-14.md`): R1
mitigado no repositório (`financial-session-revocation.sql`); R3 reproduzido
(impasse) e corrigido junto com D2 (`financial-decision-integrity.sql`); R2
classificado, segue P3. Nenhuma das migrations foi aplicada em banco hospedado.

| ID | Risco | Evidência | Por que não agora |
| --- | --- | --- | --- |
| R1 | Depois do logout, o PostgREST aceita o access token até expirar (≤ 1 h). GoTrue (403) e a API do Arandu (401) recusam. | Medido na stack local: `/rest/v1/fin_contracts` 200 com 6 linhas após logout. | Exige token já roubado (cookie HttpOnly). Mitigar pede checar `session_id` contra `auth.sessions` em todas as policies: mudança ampla de RLS, com custo em cada consulta; decisão de arquitetura. |
| R2 | RPCs `SECURITY DEFINER` que travam a linha antes de checar papel distinguem "não existe" de "sem permissão" para quem chama a RPC direto (oráculo de existência de UUID). | Leitura de `fin_contract_for_write`. | UUID v4 não é enumerável; a API do Arandu mapeia ambos para 404/403 via RLS antes. P3. |
| R3 | `fin_record_decision` lê a versão da proposta sem travar a linha da proposta; um envio simultâneo do provedor pode entrar entre a leitura e o snapshot. | Leitura do SQL. | Janela de milissegundos; a decisão registra `decided_version` explícito. Hipótese não reproduzida. |

## Suítes executadas

| Área | Casos | PASS | FAIL | Cobertura adicional | Evidência |
| --- | ---: | ---: | ---: | --- | --- |
| Demo integrada (run 38629589204, PR #189, `46c64e3`) | 12 smoke + 37 seed + 37 recheck + 10 E2E + 24 passos/63 ataques | todos | 0 | — | Actions |
| Demo integrada (run 38631825424, main `80fb075`) | idem | todos | 0 | 1ª execução independente do SHA da main | Actions |
| Demo integrada (run 38637308227, main `80fb075`) | idem | todos | 0 | 2ª execução independente do mesmo SHA | Actions |
| Demo integrada (run 38644216490, main `80fb075`) | idem | todos | 0 | 3ª execução independente do mesmo SHA | Actions |
| Demo integrada + sondas (run 38638144266, PR #190, `f4b61b6`) | idem + 66 migrations + 23 sondas | todos; 23/23 sondas, 0 SKIPPED | 0 | primeira execução com a correção D1 e a fase adversarial no runner | Actions |
| Sondas adversariais (novas) | 23 | 21 + 2 SKIPPED* | 0 com a correção; 2 (RENEW-1/2) sem ela | sessão, entre tenants por API/PostgREST/RPC, RBAC, concorrência real, ciclo de renovação, multi-entity (analista restrito: detalhe, listas, busca, painel, PostgREST, atribuição e reescopo recusado) | `scripts/ci-demo/adversarial.mjs` |
| Injeção de falhas do harness (sem Docker) | 6 | 6 | 0 | serviços fora do ar → FAIL em todas, alvo remoto → código 3, variável ausente → código 2, sanitização, fase desconhecida, SKIPPED ≠ PASS | `scripts/test-ci-demo.mjs` |
| `npm run test:database` (Postgres 16 descartável) | suíte completa + ciclos de renovação | PASS | 0 | upgrade, reaplicação, rollback e recusa de rollback com dois ciclos | local |
| Estimativas financeiras contra referência independente (novo) | 917 | 917 | 0 | PRICE simulado mês a mês, monotonicidade, taxa zero, recusas, adquirência em centavos | `scripts/test-finance-estimates-reference.mjs` |
| `npm run check:all` + `npm run build` | — | PASS | 0 | — | local |

\* CONC-3 e TENANT-6 ficaram SKIPPED só nas passadas locais sobre banco
reaproveitado (sem aprovação pendente e sem a jornada); no runner o banco é
novo e a jornada roda antes.

## Testes dos próprios testes (mutação dirigida, nunca publicada)

| Mutação em `lib/finance/products.mjs` | Suíte existente | Referência nova |
| --- | --- | --- |
| juros simples no lugar de compostos (PRICE) | detecta | detecta |
| MDR dividido por 1000 | detecta | detecta |
| taxa mensal negativa aceita | **não detecta** | detecta |
| parcela truncada em vez de arredondada | **não detecta** | detecta |
| tarifas fora do custo total | detecta | detecta |
| prazo fracionário aceito | detecta | detecta |

`tests/database/financial-renewal-cycles.sql` sem a migration (bloco de
superfície removido): falha em "prorrogado deveria voltar a vigente".

## Não executado nesta rodada (NOT RUN)

Firefox/WebKit contra a stack integrada; pool de workspaces de visitante
(`demo-workspaces.spec.js`, SKIPPED por desenho); injeção de falhas com
Docker (imagem indisponível, porta ocupada, seed interrompido) — a parte sem Docker está em `test-ci-demo.mjs`;
recovery sintético (coberto pelo job `database` dos gates); documentos hostis
além das regressões já existentes; matriz completa de multi-entity com membro
restrito na stack integrada (coberta em `financial-multi-entity.sql`).

## Maturidade

Nada aqui eleva M3+: é evidência de CI e laboratório efêmero (M2). Ambiente
hospedado validado, release e Production seguem dependendo de cutover,
backup/restore comprovado e evidência no ambiente real.

## Estabilidade do laboratório remoto (mesmo SHA, `80fb075`)

| Run | Duração | Pull das imagens | Memória / disco livres | Seed | E2E desktop / mobile | Jornada | Teardown | Artifact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 38631825424 | 14 min | 1 min 44 s | 14 921 MB / 85 GB | 37/37 + 37/37 | 5 + 1 skip / 5 + 1 skip | 24 passos, 63 ataques, 0 falhas | 0 containers | 228 KB |
| 38637308227 | 17 min | 4 min 56 s | 14 537 MB / 85 GB | 37/37 + 37/37 | 5 + 1 skip / 5 + 1 skip | 24 passos, 63 ataques, 0 falhas | 0 containers | 228 KB |
| 38644216490 | 14 min | 1 min 54 s | 14 862 MB / 85 GB | 37/37 + 37/37 | 5 + 1 skip / 5 + 1 skip | 24 passos, 63 ataques, 0 falhas | 0 containers | 228 KB |

Execuções sequenciais (concorrência 1), `workflow_dispatch`, sem mudança de
código entre elas e sem reexecução (todas `run_attempt` 1). Imagens sempre do
ECR público com os mesmos digests; a única variação foi o tempo de pull (rede).
O skip de cada E2E é o `demo-workspaces.spec.js` (pool de visitantes), por desenho.
O run 38629589204 (PR #189, `46c64e3`) testou outro SHA e não entra nessa conta.

Com três execuções verdes no mesmo SHA, a proposta de tornar este workflow um
gate obrigatório fica registrada para decisão humana; nada nos quatro gates
atuais nem na branch protection foi alterado. Custo a considerar: ~15 min por
execução e a fila única do grupo de concorrência.

