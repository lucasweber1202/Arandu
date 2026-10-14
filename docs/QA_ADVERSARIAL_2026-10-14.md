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
| Sondas adversariais (novas) | 18 | 17 + 1 SKIPPED* | 0 com a correção; 2 (RENEW-1/2) sem ela | sessão, entre tenants por API/PostgREST/RPC, RBAC, concorrência real, ciclo de renovação | `scripts/ci-demo/adversarial.mjs` |
| `npm run test:database` (Postgres 16 descartável) | suíte completa + ciclos de renovação | PASS | 0 | upgrade, reaplicação, rollback e recusa de rollback com dois ciclos | local |
| Estimativas financeiras contra referência independente (novo) | 917 | 917 | 0 | PRICE simulado mês a mês, monotonicidade, taxa zero, recusas, adquirência em centavos | `scripts/test-finance-estimates-reference.mjs` |
| `npm run check:all` + `npm run build` | — | PASS | 0 | — | local |

\* CONC-3 ficou SKIPPED só na segunda passada local, sobre banco reaproveitado
(a primeira passada consumiu a aprovação pendente); no runner o banco é novo.

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
(`demo-workspaces.spec.js`, SKIPPED por desenho); injeção de falhas de
infraestrutura (imagem indisponível, porta ocupada, seed interrompido);
recovery sintético (coberto pelo job `database` dos gates); documentos hostis
além das regressões já existentes; matriz completa de multi-entity com membro
restrito na stack integrada (coberta em `financial-multi-entity.sql`).

## Maturidade

Nada aqui eleva M3+: é evidência de CI e laboratório efêmero (M2). Ambiente
hospedado validado, release e Production seguem dependendo de cutover,
backup/restore comprovado e evidência no ambiente real.
