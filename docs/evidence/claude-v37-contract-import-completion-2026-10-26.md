# Claude v3.7 — Integração da intenção de registro contratual (#276) — 2026-10-26

## Propriedade temporária

Com o Codex indisponível, o Claude assumiu temporariamente a propriedade da
integração de contratos (SQL, validadores, runner, API já integrada e UI) para
fechar a pendência da #276. A autorização termina com esta PR. **Codex: não
refazer esta integração nem editar estes arquivos em paralelo; partir da `main`
reconciliada depois do merge.**

- SHA inicial: `ef056e79d03b3e00b39ff129baa8b6b96bc5e3cc` (contém #272–#276, confirmado por ancestralidade).
- Branch: `claude/practical-turing-s07mn2` (branch designada da sessão; recriada da `main`, pois #274 já estava integrada).
- Worktree: contêiner de sessão isolado; nenhum worktree/branch do Codex tocado.
- SHA final, PR e gates: ver a PR desta branch.

## Problema comprovado (estado anterior)

- `docs/pending/contract-import-integrity/{migration,rollback}.sql` fora de `docs/supabase-migrations.json` (nem `cleanInstall` nem `existingDatabase`); o runner canônico só testava até `financial-external-decision-1`.
- Doctor esperava `financial-external-decision-1`; probes, canário, preflight de backup, bundle e testes históricos não reconheciam o marker novo.
- `contract-center.js` não enviava `request_key` nem `owner_id` e conferia resultado incerto procurando nome/datas no overview (recorte).
- Baseline antes de qualquer mudança: o gate standalone da #276 passou sobre o manifesto limpo (B aplicado fora do manifesto).

## Banco — integração

- Ordem: `… relationship-continuity → external-decision → contract-import-integrity` nos dois fluxos; regra de ordem em `scripts/check-migrations.mjs`.
- Arquivos: `docs/supabase-financial-contract-import-integrity.sql`, `docs/rollback/supabase-financial-contract-import-integrity.rollback.sql` (movidos com `git mv`; `docs/pending/` removido). Alteração no SQL: só o comentário de cabeçalho e o espaço em `('schema_version', '…')`, exigido pelo teste do doctor.
- Marker: `financial-contract-import-integrity-1`; rollback restaura o marker salvo (`financial-external-decision-1`) e recusa uso material (recibo ou evento `contract_owner_assigned`).
- Doctor (`EXPECTED_SCHEMA_VERSION`), preflight de backup, canário de isolamento, probes pós-migration (inclusive probe nova da superfície: RPCs públicas só para `authenticated`, helpers internos fechados, constraint/índice/gatilho do recibo, RLS+FORCE em `fin_contracts`), bundle pendente (contagens +1 e caso "após decisão externa = 1 pendente") e listas de marker dos testes SQL históricos.
- Runner (`scripts/test-database.sh`): B sai antes de A em todas as cadeias de rollback; novo bloco em `clean`, `upgrade` e `fresh`: aplicar → rollback (verifica marker A) → aplicar ×2 → `tests/database/financial-contract-import-integrity.sql` → `contract-import-integrity-concurrency.mjs` → probes → canário → marker final B.
- Teste SQL da #276: fixture passou a usar ids próprios (`c1b`), porque no runner canônico `financial-contract-onboarding.sql` já grava os ids `c0b` (colisão reproduzida na primeira execução).
- Gate standalone ajustado para não instalar B duas vezes: o manifesto já instala; o script faz rollback pré-uso, reaplica ×2, SQL e concorrência.

### Execução real (PostgreSQL 16.15 descartável, loopback 127.0.0.1:55432, fora de rede pública)

| Caminho | Resultado |
|---|---|
| A. Instalação limpa (manifesto completo, marker final B) | PASS |
| B. Upgrade a partir do schema da #275 | PASS |
| C. Reaplicação (B ×2 após rollback) | PASS |
| D. Rollback pré-uso → marker `financial-external-decision-1`; rollback após uso recusado | PASS |
| SQL: replay, conflito de material, responsável (inexistente, sem papel, sem entidade, saída posterior), outro tenant/entidade/ator, recibo | PASS (×3 bancos) |
| Concorrência: 8 retries da mesma intenção → 1 contrato/1 tarefa, conflito material, recibo pending, escritor revogado durante lock | PASS (×3 bancos) |
| `npm run test:database` completo | PASS (2 execuções; a segunda após o ajuste de formatação) |
| `scripts/test-contract-import-integrity.sh` | PASS |

Os cenários adversariais são os da suíte da #276 (não reescritos); esta PR os coloca no runner canônico.

## Frontend

`finance/src/views/contract-center.js` (sem novas importações globais):

- Uma `request_key` (`crypto.randomUUID()`) por intenção material, reenviada igual em cada tentativa; conteúdo diferente → intenção nova; recusa definitiva (4xx) descarta a chave. Nada vai para localStorage.
- "Conferir registro" usa `GET contract-import-result` (com `legal_entity_id` da intenção): `confirmed` abre o contrato; `pending` não reenvia; `unconfirmed` diz que não prova recusa e permite reenviar a **mesma** intenção; 401/403/409/5xx com mensagens próprias. A carteira carregada deixou de ser usada como prova (inclusive no 409 de duplicata).
- Depois de resultado incerto, editar exige "Começar um registro novo" com confirmação explícita do risco de dois contratos.
- Instituição nova sem recibo próprio: se só o cadastro dela ficou incerto, "Conferir instituição" relê a lista autorizada e reaproveita a homônima (limitação registrada abaixo).
- "Responsável pelo contrato" opcional (padrão: quem registra, como define a API) entre membros admin/gestor/analista; servidor decide (`contract_owner_unavailable` aponta o campo). Revisão distingue responsável do contrato, da tarefa de renovação e de aprovações.
- Painel do contrato: seção "Responsável pelo contrato" com troca via `POST contract-owner` (`expected_owner_id`), confirmada só pela releitura de `contract-detail`; conflito relê e mantém a explicação; leitor só vê.

## Testes de interface (API simulada — prova de UI, não de banco)

`tests/e2e/finance-contracts.spec.js`: recibo confirmed após resposta perdida; pending/unconfirmed com reenvio da mesma chave; registro novo com chave nova; 401/403/409/5xx na conferência; instituição incerta reaproveitada; responsável elegível e recusado; troca posterior com conflito; leitor sem controles; entidade em foco; deep link e refresh; 390 px e teclado (testes existentes).

| Execução | Resultado |
|---|---|
| `npm run test:e2e` (lista completa), Chromium desktop + Pixel 7 | 628/628 PASS |
| Firefox, WebKit, mobile-safari | NOT_RUN local (navegadores ausentes); cobertos pelo gate `validate` |
| Jornada API/Auth/RLS na Demo canônica local | NOT_RUN: sem Supabase local/Auth neste contêiner; a transação está provada em PostgreSQL real acima |

## Builds

| Medida | `main` | Esta PR |
|---|---|---|
| Rota RFQ (build financeiro) | 247.792 B | 247.792 B |
| Rota RFQ (build:demo) | 249.664 B | 249.664 B |

Limite 250.000 B não alterado. Aviso de envelope (99–100%) é pré-existente.

## Outros comandos

PASS: `npm ci --include=optional`, `npm run check:all` (inclui security, governance, design, migrations), `npm run build`, `npm run build:demo`, `npm run check:build-size`, `npm run audit:ci`, `node scripts/test-pending-migration-bundle.mjs`, `node scripts/check-migrations.mjs`.

## Diagnóstico de Production (somente leitura)

Sem acesso a Vercel/Supabase neste ambiente (nenhum token disponível): logs hospedados e SHA exato do deploy em ERROR não foram consultados — **NOT_RUN**. Reprodução local do contrato de build:

- `VERCEL_ENV=production ARANDU_ENV=production node scripts/vercel-build.mjs` termina com exit 1 antes de qualquer build: `scripts/check-finance-env.mjs` reprova o ambiente. Com `SUPABASE_URL` apontando para o ref legado (`igacnfjeuqhxcmfyepgj`, alvo planejado de production), a mensagem é: *"SUPABASE_URL da produção aponta para o projeto legado, que ainda não tem atribuição ativa para production. Só o PR de cutover…"*.
- Causa provável do `BUILD_UTILS_SPAWN_1` (`npm run vercel-build` com exit ≠ 0): `ACTIVE_SUPABASE_ASSIGNMENTS.production` está vazio em `lib/deployment-topology.mjs` (`CONSOLIDATION_TARGETS.production.status = PENDING_DATA_REVIEW`). É um **bloqueio deliberado e correto** de topologia, não bug de código; foi preservado. Confirmar com o log hospedado exige acesso do owner.
- Resolver exige decisão do owner: export, restore isolado e classificação dos dados legados, e o PR de cutover descrito em `docs/TWO_ENVIRONMENT_CONSOLIDATION.md`. Nenhuma ação hospedada foi feita. M3 não está comprovada; produção não está operacional.

## Limitações e riscos

- Cadastro de instituição (`POST providers`) não tem recibo: a reconciliação de instituição incerta continua por nome na lista autorizada. Contrato proposto: `request_key` em `providers` com o mesmo padrão de recibo.
- Requisições antigas sem chave continuam aceitas pela API (compatibilidade); a UI nova sempre envia chave.
- Rollback: reverter a PR antes de qualquer aplicação hospedada. Em banco que já recebeu B com uso, o rollback SQL recusa (forward-fix).

## Próximos passos

1. Owner: autorizar recovery/cutover para Production (fora do escopo desta PR).
2. Recibo idempotente para cadastro de instituição.
3. Jornada API/Auth/RLS na Demo canônica local quando houver estação isolada.
