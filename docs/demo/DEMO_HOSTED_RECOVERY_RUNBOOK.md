# Demo hospedada — procedimento único de verificação, recuperação e GO/NO-GO

**Alvo único:** Supabase Demo `offgpyysgdhfemjlchod` + projeto Vercel `arandu-demo`.
**Nunca:** o legado `igacnfjeuqhxcmfyepgj`, o projeto `arandu` (produção) ou qualquer ref fora de
`ACTIVE_SUPABASE_ASSIGNMENTS.demo` (`lib/deployment-topology.mjs`).
Tudo abaixo roda em **GitHub → Actions → "Arandu — semeadura remota da Demo"**
(`.github/workflows/demo-hosted-seed.yml`), pelo navegador. Nenhum comando local é necessário.

Estados de maturidade continuam distintos (guideline v3 §5): código ≠ build ≠ deployment ≠ API ≠
Supabase conectado ≠ schema compatível ≠ Auth ≠ baseline ≠ workspaces ≠ jornadas verificadas.
Um `GET /api/health` 200 prova só "API viva".

## Leitura x escrita

| Modo do workflow | Escreve? | Autorização | Para que serve |
| --- | --- | --- | --- |
| `preflight-only` | não (só GET/HEAD) | — | alvo, segredos (só nomes), app/commit, Auth, Storage, schema, dados |
| `inspect-baseline` | não (só GET/HEAD) | — | preflight + classificação da baseline + plano com `plan_sha256` |
| `seed-and-provision` | sim | `authorization_reference` | **somente** banco vazio (preflight `before-seed` exige DATA ausente) |
| `recover-and-provision` | sim | `authorization_reference` **e** `approved_plan_sha256` | executa exatamente o plano revisado |

GO de preflight **não** autoriza escrita. Autorização antiga não vale para outra execução:
o `plan_sha256` muda se qualquer contagem, estado, ref ou versão de schema mudar.

## 1. SHA da `main`
GitHub → Code → `main` → copiar o SHA completo do último commit. É o `expected_sha`.
Confirme que o commit pretendido está na `main` (não confiar em "merged":
`git merge-base --is-ancestor <sha> origin/main`, ver CLAUDE.md).

## 2. Deployment correto
`https://arandu-demo.vercel.app/api/health` (ou a URL do deployment em `ARANDU_DEMO_APP_URL`) deve
responder `release.environment=demo`, `release.datasource=supabase` e `release.commit=<expected_sha>`.

Observado em 19/11/2026 (leitura pública): `environment=null`, `datasource=synthetic-fixtures`,
`commit=8219c643…` (PR #339, 55 commits atrás da `main`). Ou seja, o alias público ainda serve o
**sandbox** (`ARANDU_DEPLOYMENT_KIND=demo`, sem banco). O preflight responde
`APP_NOT_CANONICAL` (com a dica "publicação em modo sandbox") e/ou `APP_COMMIT_MISMATCH`.
Corrigir é configuração do proprietário no projeto `arandu-demo` (variável `ARANDU_ENV=demo` +
credenciais Demo, deploy do SHA revisado); nunca um bypass do guard.

## 3. Configuração sem ver segredos
O preflight verifica só **presença e formato mínimo** de `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ARANDU_DEMO_PASSWORD`, `CRON_SECRET` (Environment `demo` do GitHub) e
recusa 401. Nenhum valor é impresso, gravado em artefato ou aceito como input do workflow.
Na Vercel, conferir por **nome e escopo** em Settings → Environment Variables.

## 4. Preflight somente leitura
Run workflow → `preflight-only`, `confirm_ref=offgpyysgdhfemjlchod`, `expected_sha`.
Resumo: um código estável por verificação (`lib/demo/hosted-preflight.mjs` → `CODES`) e as camadas
`app_compiled · api · canonical_runtime · auth · schema · demo_data · workspaces · journeys`.

## 5. Schema
O preflight compara o OpenAPI do PostgREST com `docs/supabase-migrations.json`:
`compatible` (OK) · `incremental` (`SCHEMA_PENDING`, lista em ordem) · `partial` · `divergent` ·
`indeterminate`. Migrations hospedadas **não** são aplicadas por este workflow (exigem autorização
separada; ver `docs/demo/ARANDU_10_2_DEMO_READINESS.md`). A versão `financial-arandu-10-1`
observada no Demo é a mesma do manifesto atual (confirmado no ensaio local de 19/11).

## 6. Classificar a baseline
Run workflow → `inspect-baseline`. Executa `scripts/demo/baseline-state.mjs inspect` (só GET) e
publica `reports/demo-baseline-inspect.json` + resumo:

| Estado | Significado | Plano automático |
| --- | --- | --- |
| `empty` / `marker_only` | nada da Demo além do marcador | seed → check → 2 workspaces |
| `baseline_partial` | só personas fictícias e o que elas criaram; história interrompida | reset **escopado** da baseline (que semeia de novo) → check → 2 workspaces |
| `baseline_complete` | 9 personas, 1+5 organizações, RFQs e contratos esperados | check → workspaces faltantes |
| `inconsistent` | identidade fictícia desconhecida, organização/RFQ duplicada, baseline sem marcador, workspaces sem baseline | **nenhum** — revisão manual |
| `foreign` | marcador de outro ambiente, conta fora de `.example`, organização criada por quem não é persona | **nenhum** — parar |
| `schema_blocked` | schema ≠ `compatible` | **nenhum** — reconciliar schema antes |
| `indeterminate` | qualquer leitura falhou | **nenhum** — repetir/investigar |

Workspaces com contas sem linha em `fin_demo_workspaces`, ou presos em
`provisioning|cleaning|failed`, entram no plano como limpeza **por slug** (`seed.mjs --cleanup`,
escopo `+ws-<slug>`). `claimed`/`expired` seguem o ciclo normal do pool.

Estado esperado hoje (auditoria de 19/11: 9 contas, 6 organizações, 0 workspaces, seed interrompido
em `crm-activities`): `baseline_partial`. Isso foi reproduzido em Postgres/GoTrue/PostgREST reais
locais interrompendo o seed oficial no mesmo ponto.

## 7. Preparar a recuperação
Ler o plano no resumo: cada operação diz se escreve e o escopo exato. O reset da baseline remove
**somente** as contas das 9 personas sem `+ws` e as linhas cujo escopo é das organizações criadas
por elas (lista fechada em `scripts/demo/seed.mjs` → `scopedTables`), mais objetos de Storage
desses documentos. Não há `TRUNCATE`, reset de banco nem `DELETE` sem filtro de escopo. Dados de
workspaces não são tocados pelo reset da baseline.

## 8. O que exige autorização
Toda operação marcada `ESCRITA`. Registre a decisão (issue/comentário) citando: ref, `expected_sha`,
estado, `plan_sha256` e a lista de operações. A referência vai em `authorization_reference`.

## 9. Provisionar após autorização
Run workflow → `recover-and-provision` com o **mesmo** `expected_sha`, `authorization_reference` e
`approved_plan_sha256`. O workflow:
1. refaz preflight (fase `recovery`) e a inspeção **no mesmo run**; se o `plan_sha256` recalculado
   for diferente do aprovado, para sem escrever (estado mudou);
2. repete o preflight imediatamente antes de escrever;
3. `baseline-state execute`: recalcula e compara o plano de novo, executa só operações da lista
   fechada, em ordem, parando na primeira falha;
4. `baseline-state verify-after` (só leitura): exige `baseline_complete`, ≥ 2 workspaces `ready`,
   sem entulho;
5. preflight fase `status` (só leitura): `READY` exige dados marcados e 2 workspaces.

Concorrência: o grupo `arandu-demo-pool` (sem cancelamento) serializa este workflow com o
mantenedor do pool; o seed tem coordenação própria (`scripts/ci-demo/seed-coordination.mjs`).
Repetir é seguro: após falha, `inspect-baseline` mostra o plano **restante**, que precisa de nova
aprovação.

`seed-and-provision` continua existindo apenas para banco realmente vazio.

## 10. Testes hospedados
Depois de `READY`: E2E autenticado contra o deployment canônico e as jornadas de
`docs/demo/ARANDU_10_2_DEMO_READINESS.md`. Testes locais/CI efêmero **não** validam a Demo
hospedada (são B, nunca M3).

## 11. GO / NO-GO
GO para apresentação real somente com, no mesmo SHA:
`app` = demo+supabase+commit esperado · `schema` = compatible · `auth`/`storage` OK ·
`verify-after` = READY · preflight `status` = READY · E2E hospedado verde. Qualquer item faltando =
NO-GO, com o código estável do item.

## 12. Falhas sem destruir dados
- NO-GO de preflight: nada foi escrito; corrigir a causa indicada pelo código.
- `PLAN_MISMATCH` (exit 3): nada foi escrito; inspecionar de novo e reaprovar.
- `EXECUTION_FAILED`: parou na operação indicada; nenhuma operação seguinte rodou. Rodar
  `inspect-baseline`; o plano restante precisa de nova aprovação.
- `foreign`/`inconsistent`: não usar reset; investigar com leitura e decidir manualmente.
- Nunca: `TRUNCATE`, reset de projeto, migrations ad hoc, mudar o ref, desligar o guard.

## 13. Evidência suficiente para apresentação
Artefatos `demo-preflight-<sha>` e `demo-recovery-<sha>` (JSON sanitizados, sem e-mails nem chaves),
resumo do run com estado/plano/hash/autorização, `verify-after=READY`, `status=READY` e o relatório
do E2E hospedado — todos no mesmo `expected_sha` que `/api/health` publica.

## Produção (`arandu`) permanece bloqueada — de propósito
`ACTIVE_SUPABASE_ASSIGNMENTS.production` está vazio e o legado está em `legacy`. Por isso
`scripts/vercel-build.mjs` → `scripts/check-finance-env.mjs` reprova builds do projeto `arandu`
com `ARANDU_ENV=production` apontando para o legado ("projeto Supabase sem atribuição ativa
aprovada para production; concluir recuperação e cutover antes do deploy"). Esse é o comportamento
correto até um cutover autorizado; a Demo não depende dele.
