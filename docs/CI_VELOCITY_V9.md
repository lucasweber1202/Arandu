# CI Velocity 9.0

Base reconciliada: `f26b803a76c28f618801d50ccc92f8928dcf458e` (#331).
Reconciliação posterior: `d4c40694` (#332), integrada pela atualização remota
da PR; as alterações funcionais e o contrato de budget dessa main são preservados.
A própria alteração é D. Nenhum ruleset, fonte dos quatro contextos,
permissão GitHub, quota de produto ou configuração hospedada é alterado.
O resultado medido da candidata será publicado na PR após os gates no SHA exato;
metas de 6–10/8–12/<18 minutos não são resultados.

## Preservação e ambiente local

Checkpoint remoto `ccb40716`: preservação solicitada antes de retomar, sem PR.
Worktree isolada `codex/ci-velocity-v9-clean`. Os testes de recovery usam
`os.homedir()` para criar lojas privadas temporárias; não fixam `/home/agent`.
No executor somente leitura, configurar HOME/XDG/cache npm em diretório privado
sob `/workspace` resolve a preparação sem alterar assertions ou autorizações.
Chromium e Firefox locais executaram o teste alterado; WebKit depende dos
pacotes de sistema do runner oficial. Ausência local não equivale a PASS.

## Navegadores e trabalho redundante

Três grupos disjuntos na candidata final, preservando os cinco projetos:

| Grupo | Projetos | Tempo de workers histórico, ms |
|---|---|---:|
| chromium_firefox | Chromium desktop + Chrome mobile + Firefox desktop | 2.554.744 |
| webkit | WebKit desktop | 1.709.595 |
| safari | Safari mobile | 1.593.170 |

Fonte: run `41898780191`; comparação reproduzível:
`node scripts/ci/browser-balance.mjs`. Dois/três/quatro grupos têm carga máxima
3.005.656 / 2.554.744 / 1.709.595 ms, com os mesmos 5.857.509 ms totais de
workers. Isto é balanceamento de trabalho medido, **não wall-clock** nem economia
comprovada de runner-minutes. O custo de runners adicionais inclui instalação, checkout e dispatch.
O experimento oficial de quatro grupos (`42092929396`) reduziu o maior job
de 844 para 548 s, mas elevou a matriz de 29 para 31 runner-minutes, no mesmo
catálogo de 2.150 casos (2.122 pass, 28 skips). A matriz e presentation passaram
sem retries; a integração desse run foi cancelada pela atualização remota da
branch e não comprova D integral. Como o seed domina, a candidata final usa três
grupos para reduzir overhead; seu resultado integral ainda exige medição.

O preflight da Demo reutiliza a configuração existente de archive Ubuntu
assinado e retries de rede limitados antes de instalar ferramentas ausentes;
não troca chaves de confiança nem aumenta timeouts dos testes.
Cada grupo instala/prova somente seu motor. Presentation continua com os três.
O cache de binários tem sufixo de grupo, evitando que jobs paralelos salvem conjuntos
parciais na mesma chave. Restore de cache antigo pode conter mais motores;
o motor exigido sempre é instalado/verificado, mesmo em cache hit. Nada depende
do cache ou da quota de artifacts para executar testes. Builds locais do mesmo
checkout continuam baratos e preservam budgets/asset integrity; não se transfere
dist não verificável entre jobs.

O plano integral é produzido antes dos grupos. O verificador exige o SHA,
a presença dos três recibos, união exata dos IDs, projeto/arquivo/linha,
nenhuma duplicação, retries contíguos e skips explícitos. Falha/ausência/cancelamento
não vira sucesso. Todos os gates originais permanecem e aguardam full/integration.

## Seed: limite preservado, não uma aceleração fictícia

O v8 já sobrepôs cinco histórias oficiais (baseline + quatro visitantes), com
41 checks cada e 41 de releitura. O trecho 1.232 → 629 s é ganho do **v8**, não v9.
A evidência oficial registra cerca de 83 tentativas da gestora, incluindo um
429, em quota de 60/600 s, com ~529 s de backpressure em `spend/reconcile`.

A guarda `finance-write` é aplicada a todo comando não GET antes do dispatch de
domínio. `spend/record` grava o lançamento com fonte; `spend/reconcile` confirma
conferência por outro papel. Não são duplicados: gravação não substitui a revisão.
Convites, transições, propostas, decisão, contrato, performance, obrigações e
CRM preservam autoria, auditoria e dependências. Não há endpoint público de
batch dos comandos do seed. Batching que contabilize cada comando mantém a
mesma quota; contar um lote inteiro como uma escrita mudaria a proteção.

Com 82 chamadas não 429 de uma identidade e a janela **local ancorada na primeira
chamada**, pelo menos duas janelas são necessárias: a 61ª só passa após 600 s.
A duração total é maior que esse piso, pois ainda inclui preparação e trabalho
posterior. Esta prova é condicional ao inventário medido e não se aplica
indiscriminadamente ao contador distribuído de buckets alinhados.

`seedQuotaReport` agora emite `ARANDU_SEED_QUOTA` com tentativas, 429, chamadas
não 429 por papel/domínio, espera e piso condicional por história. Sem identidades,
payloads ou credenciais. Papéis podem agregar contas; o relatório avisa essa
limitação. O cálculo não modifica execução, sleeps, Retry-After ou quotas.

A preparação do Chromium da Demo pode se sobrepor a essa janela sem disputar
comandos de negócio. Após smoke, `seed-browser.mjs` executa o seed oficial e a
instalação Chromium em dois processos próprios, aguarda ambos e preserva limites
individuais de 25/15 minutos, dentro dos 26 minutos originais da fase. Falha,
timeout ou sinal aborta os grupos próprios, drena stdio e mantém FAIL. O seed
continua coordenando suas cinco histórias e cleanup internos. E2E só começa
depois de sanidade, pool, recovery e verificação de recibo local ligado a
SHA/run/tentativa. Recibo ausente, herdado, incompleto ou de falha é recusado.
A instalação não é substituída pelo recibo: ele comprova a execução real bem
sucedida do instalador no mesmo job. O marker de timing separa duração dos
filhos e interseção real, sem atribuir ganho à eliminação do 429. A comparação
oficial deverá medir o benefício; cenários e quotas permanecem idênticos.

Alternativas futuras: retirar ≥22 comandos da gestora requer revisar formalmente
cenários/cobertura; uma API batch com accounting por operação poupa round trips,
mas não o piso; preparar fixtures fora da API abandona a prova de comandos reais.
Nenhuma dessas alternativas foi aplicada. Não se troca autor, usa service role
para comandos de negócio, reinicia limitador durante seed nem remove sanidade.

## Risco e pré-publicação

`npm run ci:preflight` usa **a mesma** classifyChanges/selectSuites da CI.
O parser NUL compartilhado preserva origem/destino de renomes, cópias, remoções
e nomes com espaços/quebras. Preflight exige checkpoint limpo e main ancestral;
mostra SHA/base, razões por arquivo, testes, jobs, triggers integrais e referência
histórica. Sem dados oficiais equivalentes de A/B/C, a estimativa fica não medida;
para D, mediana/p95 históricos padrão são referências da arquitetura anterior.
`npm run ci:preflight -- origin/main --history report.json` aceita uma saída de
ci:report (ou array de relatórios), filtra classe e arquitetura da matriz,
remove tentativas duplicadas, falhas e reruns parciais/herdados e calcula mediana,
intervalo e p95 empírico com tamanho da amostra explícito. Não apresenta p95 com
uma amostra. O plano também enumera o catálogo PRODUCT_E2E integral para D,
os cinco projetos, grupos, apresentação, SQL, recovery e integração, sem confundir
a seleção financeira do fast path com toda a cobertura profunda.

A auditoria encontrou imagens de evidência visual tratadas como desconhecidas.
PNG/JPG/WebP sob `docs/evidence` são evidência raster passiva e passam a A;
termos críticos no caminho continuam prevalecendo. SVG/HTML/JSON/Markdown,
contratos de API, CI, governança, Auth, SQL e infraestrutura não recebem essa
exceção. `CONTRACT_PORTFOLIO_SCALE.md`, por exemplo, define contratos de API e
permanece D. Evidência de release/recovery não é documentação explicativa.
A auditoria também fechou um falso negativo: E2E fora da seleção executada pelo
caminho rápido (como perf-journey-weight, demo-persona-entry e Work OS) ficam em
D. Só suítes finance-* canônicas e o tour público, efetivamente executados no
fast path, podem receber B. Suíte nova/desconhecida não fica em B por extensão.

`npm run ci:prepublish` confirma main remota/ancestralidade antes e depois,
executa check:all hermético, builds regular/Demo, budgets e integridade de assets.
Publicar o lote uma vez após PASS local; o comando não faz push/merge e não
substitui SQL, browsers e integração oficiais. Main avançada exige integrar e
revalidar. Cancelamento dos runs obsoletos permanece por ref.

## Performance e observabilidade

O mark `route` mede navigation-start → primeiro render. Os quatro re-renders
não criavam novas amostras: o p95 anterior podia representar uma única navegação.
O teste mantém a prova de ouvintes e painel e mede 20 navegações por tentativa,
sem excluir warm-up/outlier nem misturar retries/projetos. Mantém 1.500 ms,
usa nearest-rank e anexa amostras, min/max, desvio e p50/p95/p99. É p95 empírico
local com 20 observações, não estimativa populacional/SLA. O custo adicional
de medição deve aparecer no run; nenhuma assertion de negócio foi retirada.

O benchmark também expôs um retry de WebKit/Safari no teste de recuperação do
módulo de busca. O teste aguardava networkidle depois do clique em Recarregar,
mas esse estado podia pertencer ao documento anterior. Agora registra a espera
por DOMContentLoaded antes do clique e confirma a prontidão da nova view antes
do atalho. Mantém as assertions de erro legível e recuperação, sem alterar view,
limite de latência, retries ou timeouts. A correção exige CI integral no novo SHA;
os benchmarks da arquitetura anterior à correção não autorizam esse HEAD.

`npm run ci:report -- owner/repo RUN_ID output.json` coleta metadados oficiais,
paginando jobs de **todas as tentativas**. Registra head SHA e SHA analisado,
PRs disponíveis, risco/arquivos do recibo classify, etapas/fases, fila,
espera pré-criação (dependência + dispatch), duração, caminho do DAG declarado,
runner-minutes arredondados, retries e flakes medidos dos recibos dos browsers.
Logs não são exportados: só projeções de metadados e marcadores controlados.
Logs ausentes/expirados deixam os campos não medidos, nunca zero inventado.

Reexecução parcial pode copiar jobs antigos com completed_at anterior ao novo
created_at. Esses jobs são listados como herdados e não cobrados novamente.
updated_at do run pode incluir muito tempo até uma reexecução: duração por
tentativa usa run_started_at → último job executado. DAG parcial/desconhecido ou
timestamps ausentes produzem caminho crítico nulo. Fila não é confundida com
espera até criar o job. Runner-minutes são estimativa, não fatura.

Referência oficial `42054780986`: tentativa 1, 1.092 s desde início da tentativa,
80 runner-minutes estimados; integração 1.002 s; browsers 879/884 s; presentation
763 s com falha. Reexecução parcial: 667 s e 15 runner-minutes adicionais,
presentation 651 s. Somar tudo como uma única medição reproduzível seria errado.
A comparação da candidata deve separar cobertura adicionada pela main e contar
falhas/retries e consumo total, sem prometer economia antes da medição.
