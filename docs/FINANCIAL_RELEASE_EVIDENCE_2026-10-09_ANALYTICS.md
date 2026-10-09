# Evidência de sessão — 09/10/2026

## Baseline e limites

Branch `feature/private-product-analytics` criada de
`main@595796ca656863fd6c159ebbe6ca53388716c660`. CI #807
(`37939685752`) success pertence à baseline, não a este lote. Merge-audit #22
(`37939685638`) failure registra base desatualizada no merge #148.
`main.protected=false` na leitura pública. Não se alteraram regras remotas.

Vercel Production `dpl_A8xahZmN4bkrSmBwt1UEx82TFCmJ`: ERROR. Leitura de projetos
e deployments funciona; build events retornam 403 e browser redireciona ao login.
Sem primeiro erro comprovado, não houve ajuste especulativo de ambiente/build.
Preview anterior `dpl_CGvv2xgctw1pc4e2CfFTMyaHybQR` estava READY; não prova este HEAD.

Supabase: `igacnfjeuqhxcmfyepgj` e `offgpyysgdhfemjlchod` ACTIVE_HEALTHY.
A sessão apenas listou projetos. Nenhuma migration, export, restore, seed,
conversão, configuração de Auth/Storage, novo projeto ou atribuição ativa foi feita.
Inventários históricos não foram promovidos a recuperação comprovada.

PostHog `655307`: `ingested_event=false`; dashboard `2191077` e insights
`12696033`/`12696034` criados e consultados sem amostra. Nenhum evento fictício
foi capturado para simular produção. Data Catalog indisponível por escopo.
Linear: projeto P-ARA-1 e issues ARA-5–ARA-9 criados; ARA-7 em andamento.

## Implementação e validação local — M1/E1

- Adaptador server-only, capability central, schemas mínimos/HMAC por tenant,
  gates de privacidade/configuração e entrega limitada independente da resposta.
- Cinco operações existentes instrumentadas após sucesso autorizado. Funil
  limitado a pessoa+tenant, sem claim financeiro ou funil completo de organização.
- Speed Insights minimiza URL e aceita somente rotas estáticas explícitas.
- Junção de propostas indexada preserva termos atuais e contagem histórica,
  sem consultas extras ou alteração de payload público.
- `npm run check:all`, `npm run test:analytics`, testes existentes de API e
  `ARANDU_SITE_URL=https://arandu.example.com npm run deploy:check`: aprovados.
  Deploy check inclui build, assets, surface/navigation, SEO, budgets e listagem
  de 520 casos E2E. Listagem não equivale à execução dos navegadores.
- Baseline JS 435.886 bytes; build final do lote 436.929 bytes (+1.043).
  Budgets preservados: JS 800.000, maior chunk 100.000, RFQ 250.000 bytes.
  Maior chunk 41.935 e rota RFQ 209.306 bytes; registrar também saída do CI.
- `npm audit --audit-level=high`: zero vulnerabilidades na execução local.
- Benchmark Node v24.19.0: 500 propostas/2.000 versões, mediana de 21 lotes
  de 25 execuções após warmup; antes 1,749 ms, depois 0,076 ms (~23×).
  Resultados iguais. Mede **somente junção sintética em memória**, sem claim
  de latência API/DB, throughput, Web Vitals ou custo de produção.
- E2E Chromium tentado: bloqueado por executável ausente. Download Playwright
  recebeu arquivo inválido/truncado. Firefox/WebKit/mobile não executados localmente.
- `test:database` tentado exclusivamente contra localhost: `psql` ausente.
  Nenhuma alteração SQL neste lote. CI database continua obrigatório.

## Próximos gates e rollback

PR permanece draft até database/deploy-boundaries/validate/presentation passarem
no HEAD exato com a base atual, seguido de `merge:gates`. Nenhuma maturidade M2+
é herdada da baseline. Release/produção ainda bloqueadas por build log, proteção,
recovery e configuração/privacidade (ARA-5/6/8/9).

Rollback é desligar analytics no servidor e reverter PR. Não há migration a
reverter. Exclusão de eventos remotos, retenção e rotação da chave devem seguir
a revisão registrada antes da ativação; falha de PostHog não interrompe escrita
financeira. Fonte de verdade continua Supabase e decisão continua humana.
