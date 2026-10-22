# Release final — auditoria e Demo pública, 22/10/2026

**Release aprovado inicial e público:** `ef5e8c92460647b2c1b58b598cd8b4970a0d796f`.
Branch de verificação: `codex/final-release-proof-20261022`, criada dessa main.
O HEAD final do verificador é o HEAD da PR que contém este relatório; não é
um release já publicado. Main não foi alterada nesta missão. Datas humanas
em America/Sao_Paulo; JSONs usam UTC. Worktree isolada, sem tocar a estação
ou arquivos visuais do Claude.

## Vereditos

| Item | Resultado | Evidência |
| --- | --- | --- |
| Merge Audit da main | **SUCCESS**, tentativa 2; só o job falho foi reexecutado | [run 39812611109](https://github.com/lucasweber1202/Arandu/actions/runs/39812611109), [governance.json](release-final-ef5e8c9/governance.json) |
| Quatro gates da main | **SUCCESS no SHA ef5e8c9 integral** | [CI 39812610887](https://github.com/lucasweber1202/Arandu/actions/runs/39812610887), IDs/SHA no JSON |
| Demo pública P0-A | **PASS / GO como visita demonstrativa** | [public-proof.json](release-final-ef5e8c9/public-proof.json), 229 verificações, 36 capturas |
| Desktop / mobile / teclado | **PASS / PASS / PASS** | Chromium do lockfile; 18 passos técnicos por viewport, incluindo as 13 etapas |
| Demo canônica hospedada M3 | **BLOCKED** | Publicação declara synthetic-fixtures e M3 BLOCKED; não é operação Auth/RLS/Storage hospedada |
| Production M5 | **BLOCKED; causa remota não confirmada** | Status GitHub failure; detalhes/events Vercel 403 no scope correto |
| Estação Windows/WSL2 | **NOT_VERIFIED** | Testes de regras são fixtures; esta não é a máquina física da apresentação |

O CI da main não é herdado pela alteração nova do verificador. A PR própria
precisa dos quatro gates no seu HEAD antes de integração. Nenhum merge foi feito.

## Merge audit: investigação e resolução sem mudança de código

A associação de `ef5e8c9` foi relida pela API e aponta para a PR **#257**, merged.
HEAD da PR: `75364b0e57cbdfff6d447b67a7a4ed62f0aef567`; quatro checks completed /
success nesse SHA. O primeiro pai do merge é
`9927119019a2dc74f9e4913793415d1cb53de763`, igual à base registrada da PR.
`git merge-base --is-ancestor <primeiro-pai> <HEAD-PR>` exit 0: base contida.

O log do job original `119942604540` parou com “push sem PR associada”.
O rerun suportado de **failed jobs only** criou o job `119955065270`, no
mesmo run, tentativa 2. Seu log registra PR #257, quatro gates OK e “Merge
auditado: quatro gates verdes no HEAD mergeado, base contida”. Conclusão
do check merge-audit e do run: **SUCCESS**.

Isso comprova que o rerun, com os dados agora disponíveis, satisfaz o audit
inalterado. É compatível com ausência transitória da associação; **não**
estabelece o mecanismo exato de indexação/cache do GitHub, pois o payload
original de `/commits/<sha>/pulls` não foi preservado no log.
`audit-merge.mjs`, `merge-gates.mjs`, workflow e branch protection não mudaram.
Nenhum retry de código foi introduzido, nem workflow completo reexecutado.

## Prova pública final

Alvo anônimo: `https://arandu-demo.vercel.app/`. SHA esperado e servido:
`ef5e8c92460647b2c1b58b598cd8b4970a0d796f`. Manifesto e health concordam com
main / synthetic-fixtures / informative-tour-with-browser-sandbox. O health
não foi usado como prova de backend M3.

**229 verificações, 36 capturas reais:** 185 artefatos do inventário, raiz,
manifesto, health, cinco rotas aposentadas e 36 observações de navegador.
As 13 etapas do produto estão cobertas em **18 passos técnicos por viewport**
(entrada, introdução, repetição deliberada do painel, áreas e retorno incluídos).
Desktop **1440×900**, mobile **390×844**, Chromium **156.0.8078.4**,
Playwright **1.64.1**, hash do lockfile no JSON. Tab e Enter reais, reload dos
deep links, imagens efetivamente decodificadas, fontes, limites de layout,
JS/console, status HTTP, redirects e hashes de JS/CSS/chunks/imagens verificados.
Horário exato e duração estão em `checked_at` / `duration_ms` do JSON.

Fluxo revisado: [tour-flow.json](release-final-ef5e8c9/tour-flow.json).
Capturas reais de exemplo:
[relacionamentos desktop](release-final-ef5e8c9/desktop-relationships.png),
[comparação mobile](release-final-ef5e8c9/mobile-comparison.png).
Todas as 36 imagens estão ao lado do JSON, com hash individual. O JSON
também contém hashes do código do verificador usado.

A modalidade e os dados fictícios aparecem na tela. Nenhum login, envio,
gravação financeira, reset, seed ou API de backend foi executado. São telas
e dados demonstrativos; não se anuncia persistência real nem recomendação.
O cenário declara processos distintos, não uma única negociação fabricada.

`captures.json` possui 13 entradas, rotas/personas e fonte
`bebc553bd177f123701f35e0a650985103be7186`, ancestral do release. Não há diff
em `finance/` ou `provider/` entre esse commit e o release aprovado. A etapa
de comparação preserva `#comparacao`; a última etapa institucional reutiliza
a captura do próprio portal, explicitamente no metadata. Há **24 arquivos
WebP únicos**, não 26 telas independentes. As quatro capturas móveis de
amostra (solicitação, proposta, aprovação e contrato) foram inspecionadas e
não são as telas de 429 citadas no ensaio “depois” do Claude.

Limites: mobile é emulação de viewport, não dispositivo físico; não é
auditoria WCAG, pesquisa humana ou prova de todos os fluxos autenticados.
Screenshots congelam dados sintéticos; não provam operação atual do backend.

## Defeitos do verificador corrigidos nesta PR

1. **Cobertura omitida:** o adaptador anterior ainda ignorava `relacionamentos`.
   O teste novo falhou antes da correção. Agora o fluxo inclui a etapa e o
   validador exige cada etapa da fonte aprovada, inclusive as antes opcionais
   quando presentes. Fonte futura sem mapeamento revisado bloqueia a prova.
2. **Lazy loading:** o smoke exigia imagens de seções ocultas já carregadas
   na introdução. O navegador mostrou ausência de overflow e imagens lazy
   ainda não solicitadas. A sonda agora rola de verdade até cada imagem
   renderizada, espera carga e decode; etapa canônica sem captura também falha.
   As 13 etapas são percorridas e o inventário HTTP continua integral.
3. **Retenção de corpos no Chromium:** a leitura tardia de `response.body()`
   após navegação perdeu identificadores do CDP ou ficou pendente. Não era
   evidência de 404 ou erro do produto. O navegador agora recebe a **resposta
   real da origem**, via `route.fetch` com redirects desabilitados e timeout,
   somente após status/MIME/hash serem conferidos. `route.fulfill({response})`
   entrega essa mesma resposta, sem fixture, conteúdo inventado ou fallback.
   O timeout do conjunto é bloqueante e resulta NOT_PROVEN, nunca PASS.

Cancelamentos `net::ERR_ABORTED` de imagens pela troca de seção são registrados
no JSON, não ocultados. Só são aceitos quando seus bytes reais foram
verificados; toda imagem exibida precisa decodificar separadamente. Demais
falhas de request continuam bloqueantes. Cancelamento não autoriza ignorar
imagem quebrada, conteúdo diferente, JS com erro ou chamada financeira.
Esse transporte serve à integridade/renderização, **não a benchmarks de rede**.

Testes usam Chromium e origem HTTP local descartável: bytes válidos chegam ao
navegador, bytes adulterados são recusados e POST financeiro não chega à
origem. Fixture lazy fora da tela carrega com scroll; imagem oculta quebrada
é recusada ao ser revelada. Tabindex=-1 e focus trap continuam recusados.
Os resultados intermediários não foram marcados PASS: primeiro houve falha
da sonda lazy; depois corpos indisponíveis/cancelamentos foram diagnosticados.
A evidência final foi repetida com o mecanismo corrigido.

## Regressões de confiabilidade e gates locais

Executados com exit 0: `npm ci --include=optional`, `npm run check:all`,
`npm run build`, `check:security`, `check:governance`, `check:vercel-routing`,
`check:build-size`, `test-demo-station.mjs`, `test-finance-env.mjs`,
`test-deploy-release-separation.mjs`, `test-merge-gates.mjs`,
`test-publication-proof.mjs`, `test-publication-keyboard.mjs` e diff/syntax checks.

Positivos/negativos existentes da #256 continuam passando: SHA divergente,
máquina/lockfile/relatório diferentes, seed incompleto, isolamento/baseline/
capacidade do pool, Storage indisponível, browser ausente, relatório
contraditório e Production sem assignment recusados. Nenhuma proteção foi
removida; scripts de station/readiness não foram editados nesta rodada.
Não foi executada stack canônica local ou ensaio da máquina definitiva.

## Production e autorizações futuras

Status GitHub do release: Demo e Pilot success; `arandu` failure no deployment
`dpl_HPdBsHfvHxTsVT4eVJ3EtqqCHKFW`. API Vercel de detalhes e build events:
**403** em `lucas-projects467`. `BUILD_UTILS_SPAWN_1` continua informação anterior,
não causa reconfirmada no log atual. Falha remota inicial **não confirmada**.

Confirmação local independente: `ACTIVE_SUPABASE_ASSIGNMENTS.production` vazio;
o build guard deve bloquear esse destino. Testes da CLI aceitam configuração
estrutural completa apenas em topologia hipotética descartável e recusam
faltas, papéis trocados, branch errada e refs não autorizados. Isso não
autentica chaves nem configura o projeto real.

Intervenção mínima: permitir leitura dos logs desse deployment no scope
correto, ou fornecer log sanitizado. Para futura resolução operacional:
inventário e classificação de dados relevantes/PII; autorização de preservação
com origem, escopo, custódio, retenção, ciphertext e destino durável privado;
restore isolado do **mesmo** export, incluindo Auth/Storage/configuração;
reconciliação e decisão separada de conversão; migrations/assignment próprios
por PR aprovada; doctor, canário, jornada, recovery, observabilidade e release
independente. Não usar Pilot/legado como Production improvisada.
Nada disso foi executado ou autorizado por esta prova pública.

## Custo, arquivos, riscos e integração

Código alterado somente em `scripts/public-tour-proof-flow.mjs`,
`scripts/publication-proof.mjs`, `scripts/smoke-public-demo.mjs`,
`scripts/test-publication-proof.mjs` e `scripts/test-publication-keyboard.mjs`.
Documentação nova: este relatório e `docs/evidence/release-final-ef5e8c9/`.
Nenhuma UI, roteiro, station, schema, dependência, workflow ou configuração
remota alterada. Não existe expansão funcional do produto.
As capturas/JSONs acrescentam aproximadamente 9,2 MiB ao Git, fora de `dist`;
o bundle do produto não recebeu código ou assets novos nesta PR.

Política Vercel preservada e testada: só main publica automaticamente.
Um único pacote/commit/push/PR, necessário pelos defeitos reproduzidos do smoke;
nenhum deploy manual, preview liberado ou merge. Auditoria resolvida com um
rerun do job falho, sem novo build Vercel nem rerun dos quatro jobs caros.
Rollback: reverter o commit de tooling; não há rollback de dados/configuração.
O revert reabre as lacunas de cobertura e lazy loading; preferir forward-fix.

Riscos remanescentes: estação física NOT_VERIFIED; M3/M5 bloqueados por seus
gates próprios; logs Production 403; RFQ em **245.884/250.000 bytes (98%)**,
aviso preexistente preservado; tarefa de covenant sem responsável segue gap
conhecido documentado pelo Claude, fora desta missão de release. Nova publicação
ou mudança de links exige repetir a prova no novo SHA. A nova PR do verificador
não autoriza usar seu HEAD como se já estivesse publicado.

**GO para P0-A como visita pública do SHA ef5e8c9 comprovado.** Isso não libera
M3, M5 nem certifica P0-B. A preparação física, roteiro e ensaio humano
continuam com o proprietário/Claude; não copiar evidência de laboratório para
declarar prontidão naquela máquina.
