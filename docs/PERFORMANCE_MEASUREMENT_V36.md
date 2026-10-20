# Performance e integridade v3.6 — protocolo reproduzível

Owner desta trilha: scripts de prova, instrumentação e testes. Não modifica UI,
runbooks da estação, API, migrations ou infraestrutura hospedada. Os objetivos
abaixo são **hipóteses**, não resultados, SLAs ou capacidade comercial comprovada.

## Mecanismos existentes e incremento

- `build-size.mjs`, `check-build-size.mjs` e `bundle-profile.mjs`: budgets por
  produto/sandbox, maior chunk, fechamento estático por rota, atribuição de
  módulos e lazy loading. Permanecem autoridade; nenhum limite foi aumentado.
- `smoke-public-demo.mjs` e manifesto da #242: identificação e hashes do
  artefato servido, visita anônima desktop/mobile, deep links e reloads. Agora
  incluem falhas por etapa/ação/path e opção `--performance` no mesmo navegador.
- `benchmark-proposal-join.mjs`: preserva o benchmark legado de join e acrescenta
  chamadas ao `buildComparison` real com dez propostas fictícias, valida saída
  determinística, neutralidade e ausência de mutação, grava quantis e contexto.
- `test-database.sh`: instalação/upgrade/rollback, RLS, isolamento, concorrência
  de decisões, recibos e contratos, revogação de sessão, documentos e outbox.
  O harness de recibos agora exige 1 commit + 5 duplicações P0001 reconhecidas,
  zero erros inesperados e reconciliação RFQ/recibo/FK. Não ignora conexão perdida.
- Testes de p95 de navegação/boot já estão em `demo-work-os-v3.spec.js`; CI
  existente cobre Chromium/Firefox/WebKit e mobile. Isso não é RUM nem latência
  da API canônica hospedada. `finance-performance.spec.js` testa o módulo de
  performance de instituições; o nome não representa carga de infraestrutura.
- `hosted-infrastructure-doctor.mjs`, `demo/station.mjs` e os contratos de
  recovery continuam responsáveis pelos seus diagnósticos. Não foram duplicados.

## Reprodução de baixo custo

```bash
npm ci --include=optional
npm run check:all
npm run build
npm run check:build-size
npm run build:demo
npm run check:build-size
npm run benchmark:domain
node scripts/test-publication-browser.mjs
node scripts/public-tour-proof-flow.mjs "$APPROVED_MAIN_SHA" /tmp/arandu-flow.json
npm run smoke:public-demo -- --url=https://arandu-demo.vercel.app/ --sha="$APPROVED_MAIN_SHA" --browser --performance --flow=/tmp/arandu-flow.json
```

`APPROVED_MAIN_SHA` é escolhido pelos gates do commit exato; o manifesto não
aprova o próprio SHA. Sem browsers instalados, usar o Playwright fixado no
lockfile, sem trocar engines, retries ou timeouts. O benchmark é explícito,
não novo job por push; regressões de contrato pequenas usam check:all existente.

`reports/performance/local-domain.json` registra SHA/ref, árvore dirty ou limpa,
Node/executor, data, dataset, volumes, warmup, amostras, duração, memória e
p50/p95/p99 nearest-rank. Cada amostra nova mede **uma chamada**, não mistura
médias de lotes com percentis individuais. A comparação anterior/posterior do
join continua separada: é microbenchmark sintético, não melhoria de API medida.
O primeiro tempo registrado ocorre após verificar a saída; não é cold process.
Não há DB, Auth, JWT, RLS, Storage, rede ou usuários concorrentes nessa medição.

## Frontend: laboratório separado de RUM

Objetivos p75 por desktop/mobile: LCP ≤2500 ms; INP ≤200 ms; CLS ≤0,1.
O smoke opcional coleta Navigation Timing, último candidato LCP observado e CLS
com janelas de sessão de 1 s de intervalo / 5 s de duração, excluindo shifts
associados a input recente. Não injeta beacon ou persistência na aplicação.

Cada etapa tem **uma navegação de laboratório** após reload. São rotas/estados
distintos, não uma população estatística para agregar: p50/p95/p99/p75 ficam
não estimados. `LCP candidate` pode mudar até a página ser ocultada; CLS é o
observado até o instante da coleta. INP fica NOT_MEASURED, pois um clique ou
Navigation Timing não implementam a metodologia de INP. O viewport 390 px não
reproduz CPU, rádio ou rede de telefone; não há throttling e o proxy do executor
participa da latência. Cache é desabilitado pela interceptação de requests.

Para aferir o alvo, coletar RUM autorizado sem PII, segmentando tipo de página,
dispositivo, release, região, navegador e janela de observação. Registrar o
número de visitas elegíveis e intervalos/limites da amostra. Sem volume real:
NOT_PROVEN. Não usar resultados do laboratório como Core Web Vitals de usuários.

## API: protocolo para o ambiente canônico autorizado

Hipóteses: leituras comuns p95 ≤500 ms; escritas p95 ≤1000 ms; comparação de
10 propostas p95 ≤2000 ms; 5xx elegíveis **<**0,5%. O módulo
`performance-contract.mjs` centraliza valores, quantis e o denominador: zero
requisições elegíveis retorna NOT_MEASURED, nunca sucesso por divisão por zero.

1. Escolher ambiente **descartável isolado**, SHA/ref exatos, versão do schema,
   configuração equivalente ao cenário, banco/Auth/Storage/e-mail fictícios e
   limites de CPU/memória/conexões. Guardar região, kernel/runtime e limitações.
   Backend hospedado compartilhado/Production exige autorização específica.
2. Reusar seed, API, sessões e jornadas canônicas existentes. Não medir endpoint
   simulado, service-role bypass de RLS ou health como operação de produto.
3. Medir separadamente: criar RFQ; convidar/aceitar; criar/revisar proposta;
   comparar dez propostas; aprovação/decisão; contrato/termos; tarifas/evidências;
   portfólio e histórico da instituição. Cada papel usa sua sessão e organização.
4. Registrar cold e warm separadamente. Aquecer 60 s e medir 5 min por perfil,
   com think time 1–3 s; fases/duração são proposta, não resultados desta rodada.
   Mix inicial a registrar: 70% leituras, 20% escritas, 10% comparação. Manter
   amostras individuais e resultado por operação, sem promediar percentis.
5. Incluir timeouts, tentativas, 429, 4xx esperados, 5xx e falhas de transporte
   em contadores separados; relatar erros totais e retries por intenção original.
   Denominador 5xx = tentativas válidas dessas operações; excluir apenas sondas
   deliberadamente inválidas de uma fase adversarial identificada. Não excluir
   dependência lenta ou timeout para melhorar artificialmente o resultado.
6. Registrar p50/p95/p99 por operação/ambiente e taxas com numerador/denominador,
   requisições/s, duração, conexões, locks/deadlocks, CPU/RSS, queries, tamanho
   de respostas, filas e event loop. Correlation IDs sem PII/segredos/conteúdo
   financeiro; baseline só comparável com mesmo dataset, recursos e metodologia.
7. Critério de interrupção: corrupção, leitura intertenant, falha de autorização
   ou side effect real encerra o teste; pressão de memória, saturação de conexões
   ou erro sustentado encerra o estágio e gera diagnóstico, não threshold maior.

## Perfis de capacidade — preparados, NOT_RUN

| Perfil | Dataset e concorrência | Prova exigida |
| --- | --- | --- |
| pilot-30 | 10 organizações / 30 usuários simultâneos | identidades distintas, distribuição de papéis explícita, isolamento comprador/provedor |
| pilot-100 | 50 organizações / 100 usuários simultâneos | mesmos controles; teto do pool não autoriza ensaio no pool público |
| lifecycle-volume | 10.000 contratos / 100.000 observações sintéticas | fixture identificada, índices/plans, paginação sem truncamento, obrigações/tarifas reconciliadas |

Volumes não são usuários, RFQs ou contratos reais. Organizações incluem ambas
as partes; documentar a distribuição e participantes antes de semear. Não
reutilizar pool de visitantes em atendimento. Perfis não devem rodar em CI por
push ou em hospedagem compartilhada. Um executor de carga só será acrescentado
quando houver backend/dataset isolados aptos, sem criar hoje uma API paralela.

Concorrência/falhas usa as regressões existentes: decisão × versão de proposta
nas duas ordens, duas decisões/contratos, retry do request key após resultado
incerto, proposta após encerramento, sessão revogada, documentos de outra org,
provider concorrente, SoD e referências hostis. Para DB/API/Storage/e-mail:
injetar indisponibilidade exclusivamente no ambiente isolado; exigir falha
fechada e releitura de persistência/auditoria, não sucesso antes do commit.
Usar `test-operational-resilience.mjs`/outbox para falha de conclusão e retry;
esses mocks não provam disponibilidade do serviço gerenciado.

## Auditoria de gargalos e limites

- Maior rota RFQ já usa 97–98% do teto; sandbox usa >99% do seu teto congelado.
  Investigar closures reais e imports estáticos antes de adicionar capacidade.
  Não retirar segurança ou produto do build demonstrativo para caber.
- `finance.mjs` agrega propostas/versões/provedores em queries por conjuntos,
  evitando N+1 naquele trecho. Listas privadas ainda possuem limites como 100
  contratos/propostas e 500 versões no portal: têm teto, mas isso não prova
  paginação completa para 10 mil registros. Exigir teste de continuidade e
  truncamento antes de afirmar suporte a volume. API pública usa keyset próprio.
- Índices/grants/RLS são preservados. Não criar índice por intuição: colher
  EXPLAIN (ANALYZE, BUFFERS) no dataset representativo, em ambiente isolado,
  observar seletividade, paginação, locks e índices existentes. Plano sobre
  tabela vazia não prova performance. Não executar ANALYZE real sem autorização.
- As transações de integridade mantêm locks curtos em produção; o pg_sleep do
  harness é só uma ferramenta de disputa sintética e não uma medição de latência.
- P0-A não requer backend; P0-B exige validação na máquina definitiva e M3
  exige recovery/cutover. Nenhuma medição neste documento promove esses estados.
