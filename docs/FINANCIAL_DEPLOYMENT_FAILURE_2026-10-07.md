# Deployment Official — investigação de 07/10/2026

Baseline: main `477ad8be5b95733e8ac97aa3a6f3e1c6a2e54d62`, árvore
`6575db8fb0dbf9895676464b07cef2ba75c6911c`. Instruções e runbooks foram lidos
integralmente antes de alterar este registro. Não houve mudança de runtime,
configuração, secrets, Supabase, alias, promoção ou rollback nesta investigação.

## CI comprovado, incidente separado

Run #794: https://github.com/lucasweber1202/Arandu/actions/runs/37664210563

| Gate | Resultado | Fim UTC |
| --- | --- | --- |
| database | success | 18:08:03Z |
| deploy-boundaries | success | 18:07:25Z |
| validate | success | 18:18:46Z |
| presentation | success | 18:21:39Z |

O commit mergeado está M2/E2. Não há regressão de CI observada nessa árvore.
merge-audit `37664210727` detectou corretamente #142 mergeada às 18:06:00Z
com validate/presentation in_progress no HEAD `85e95cd94a023a3012c6b20841c64f2fd159af36`.
Incidente MGI-2026-10-07-08 registrado em FINANCIAL_REPO_GOVERNANCE.md;
o verde posterior não altera a ordem dos fatos. Audit permanece intacto.

## Deployment identificado

- Team: lucas-projects467 / `team_BBpDcLVx5izJjXz5qBEq2cRy`.
- Projeto: arandu / `prj_lW4anlfqzftRUF6vaIuN29MBQuGl`.
- SHA: main477ad8be; GitHub status Vercel – arandu = failure.
- Deployment: `dpl_Aj44zzVxwHt139cYZ3H4XZNLuZVE`.
- URL: https://vercel.com/lucas-projects467/arandu/Aj44zzVxwHt139cYZ3H4XZNLuZVE
- **Causa raiz exata: não comprovada, build logs indisponíveis.**

Tentativas autorizadas: list_deployments por projeto/SHA, get_project,
get_deployment com Git metadata e list_deployment_events completo (limit=-1,
forward, follow=0). Todos retornaram 403: not authorized no escopo
lucas-projects467. Não repetir chamadas idênticas. Fallback CLI inspect --logs
tentado: vercel command not found; não há token nem auth file CLI no executor.
Não usar outra equipe, credencial de Demo ou bypass de checks como alternativa.

O acesso browser como fallback precisa da aprovação explícita ainda pendente
desde a rodada anterior; não foi tentado para contornar a rejeição anterior.

## Comparação segura disponível

GitHub registrou os três statuses para o mesmo SHA:

| Projeto | Status | Deployment |
| --- | --- | --- |
| arandu | failure | dpl_Aj44zzVxwHt139cYZ3H4XZNLuZVE |
| arandu-demo | success | dpl_AU48RjaceRZt9V3SLhLiEEWvwnQo |
| arandu-pilot (transitório) | success | dpl_DszbLEpHV9MsshGANf2DWq4qTyJh |

Na árvore atual, vercel.json define install npm ci --include=optional, build
npm run vercel-build, output dist; package engines Node 24.x e bundler Vite.
Isso não confirma Root Directory, Framework override, Node efetivo, branch
Production, bindings ou integração Git nos settings de cada projeto. Esses
settings, target e aliases do deployment novo permanecem sem leitura Vercel.

Produção exige main, ARANDU_ENV=production, runtime official/datasource supabase
e banco próprio. lib/deployment-topology.mjs ainda distingue destinos de
conversão (igacnfjeuqhxcmfyepgj → Production; offgpyysgdhfemjlchod → Demo)
das atribuições ativas legado/Pilot. Não reclassificar refs para fazer o build
passar sem recovery/cutover. Não inferir o vínculo do Official a partir do
Supabase Preview do GitHub. Build pode recusar uma configuração incorreta;
sem os logs isso é hipótese, não a causa observada.

## Smoke público de leitura

| Rota | arandu-bice | arandu-demo | arandu-pilot |
| --- | --- | --- | --- |
| /api/health | 200, sem release/SHA | 200, main477ad8be, demo/synthetic-fixtures | 200, sem release/SHA |
| /finance/dashboard.html | 200 | 200 | 200 |
| /finance/rfqs.html | 200 | 200 | 200 |
| /finance/passport.html | 404 | 200 | 200 |
| /finance/contracts.html | 200 | 200 | 200 |
| /finance/portfolio.html | 404 | 200 | 200 |
| /api/finance/organizations | 401 | 404 (sandbox) | 401 |

São probes HTTP sem autenticação; 200 da página não prova interação nem
readiness. Demo não apresentou regressão nesses probes, mas continua sandbox,
sem prova de API/Auth/RLS canônicos. Status verde do projeto Pilot no SHA novo
não comprova que seu alias público ou Production Branch foi trocado.
Official não foi considerado atualizado: SHA público não exposto e duas
rotas financeiras estão ausentes. Sem doctor/jornada/recovery, não promover
M3/M4/M5 nem afirmar que o vínculo Supabase de Production está validado.

## Próximo passo concreto

Autorizar browser fallback para leitura dos build logs/settings do deployment
identificado, ou disponibilizar acesso Vercel autorizado ao mesmo escopo.
Depois dos logs, corrigir apenas a configuração demonstrada ou abrir PR mínima
para main se for código. Novo merge exige quatro gates no HEAD exato. Deploy
de Production exige identidade e release gates aplicáveis; não usar CI verde
para pular recovery, compartilhar banco ou promover ambiente ambíguo.
Reexecutar no SHA esperado, comprovar READY + identidade, repetir smoke,
doctor/jornada e confirmar vínculo separado de Supabase. Esta investigação
não declara o deployment corrigido.

## Validação local do registro

Clone limpo de main477ad8be: npm ci --include=optional, audit:ci (0
vulnerabilidades), check:all, build, check:build-size e check:dist-assets PASS.
Testes de merge-gates, runtime-mode e deploy-release-separation PASS. Somente
documentos alterados; nenhum teste/assertion/threshold/guard foi alterado.
Isso não reproduz o ambiente de build Vercel e não prova sua causa raiz.
