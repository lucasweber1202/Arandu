# v3.6 — publicação, medição e integridade (20/10/2026)

Base da branch própria: `ba8f74fc1d47e04c22fc0c53f240bd924d2a3b6e`.
Guideline #243 integrada; #241 e #242 confirmadas ancestrais da main por Git.
O HEAD documental aprovado `bda7705f557501edaf3a1440d799576b7fd620de`
possuía quatro gates SUCCESS. O merge SHA servido é ba8f74f; na reconciliação
inicial seus jobs presentation/validate pós-merge ainda executavam. Esses
checks não substituem os da nova PR própria nem a observação pública.

## Publicação efetivamente observada

https://arandu-demo.vercel.app/ respondeu anonimamente, sem cookie/token de
Vercel/GitHub ou bypass. Manifesto e runtime concordam no SHA completo da base,
branch main, modalidade informative-tour-with-browser-sandbox e datasource
synthetic-fixtures. Os **159 arquivos**, raiz e assets carregados pelo navegador
foram confrontados com hashes/tamanhos do manifesto: HTTP_ARTIFACT=PASS.
Não foi executado deploy, troca de alias, mudança de env ou configuração remota.

O smoke percorreu **15 etapas** por links reais, com reload, em 1440×900 e
390×844: entrada, introdução, painel, solicitação, convites, propostas,
comparação, aprovação, contrato, continuidade/tarefas, instituição, sua proposta,
cinco áreas e retorno. Não houve overflow crítico ou assets quebrados nas
etapas verificadas. A interceptação recusa API/escrita/origem externa na visita.

**PUBLIC_SHAREABLE=FAIL / JS_ERROR no contrato técnico estrito.** Ambos os
viewports registraram `Transition was aborted because of invalid state.
ViewTransition opt-in disabled`, nas ações de navegação `explore` para
/demo/visita.html e `return` para /demo/index.html. Não houve exceção, skip,
threshold maior ou filtro do erro. O E2E existente public-tour.spec.js também falhou: na branch, 7 passed,
1 failed, 1 flaky e 1 skip preexistente de teclado mobile; na main limpa em
checkout independente, 7 passed, 2 failed e o mesmo skip. Mesma exceção de
ViewTransition na entrada, sem mudanças de UI, teste, retries ou threshold.
A falha é reproduzida na base e permanece bloqueadora, não uma exceção ao gate.

O relatório agora identifica viewport,
etapa, ação e path. A correção de HTML/CSS pertence ao Claude; nenhum arquivo
demo/** ou componente visual foi alterado nesta branch.

Vercel get_project retornou 403 em arandu-demo/team_BBpDcLVx5izJjXz5qBEq2cRy
(scope lucas-projects467), sem repetição ou escopo alternativo. Isso não impediu
verificar o domínio público, mas configuração/identidade interna do deployment
permanecem ACCESS_BLOCKED. Intervenção mínima: conceder leitura da conexão a
esse projeto/escopo; não publicar tokens no chat nem remover proteção global.

## Performance observada e limites

Instrumentação opcional no smoke existente produziu 30 amostras individuais
(15 estados × 2 viewports), laboratório sem throttling, via proxy, sem população
RUM. LCP é candidato observado, CLS usa janelas de sessão; INP e p75 ficam
explicitamente não medidos/não estimados. Os estados são heterogêneos: não
agregar um percentil entre rotas para alegar Core Web Vitals.

Há CLS elevado em algumas navegações de laboratório (inclusive entrada e
comparação). Isso é um sinal para reproduzir estabilidade visual em dispositivo
real e medir RUM, não prova de violação p75 populacional. JS_ERROR já impede
aprovação do smoke independentemente das métricas. Não foram mudadas metas.

O benchmark existente agora executa o **buildComparison real**, dez propostas
sintéticas, 25 warmups e 200 chamadas medidas. Nesta coleta: p50 ≈0,203 ms,
p95 ≈0,439 ms, p99 ≈0,597 ms. Dados exatos, memória, executor e método estão no
JSON. Não mediu API, banco, Auth, RLS, Storage ou rede; **não** prova o alvo p95
end-to-end de 2 segundos. O benchmark de join anterior continua separado.

Build financeiro: produto JS 513.680 B, maior rota RFQ 242.369/250.000 B.
Demo: produto JS 557.679 B, sandbox 327.807/330.000 B, RFQ 244.246/250.000 B.
Todos os budgets PASS; sandbox dispõe de **2.193 B**, maior rota Demo de
**5.754 B**. Nenhum limite foi aumentado. Prioridade de engenharia: headroom de
closures/imports RFQ e sandbox; observar perfil antes de acrescentar código.
Listas privadas com limites fixos exigem prova de paginação antes de volumes
maiores; não foi alegado suporte atual a 10 mil contratos/100 mil observações.

## Integridade: problema reproduzido e correção verificada

O teste request-receipt-concurrency ignorava todo status de erro das seis
sessões (`wait ... || true`) e verificava apenas uma RFQ. Um psql controlado
simulou 1 commit + 5 conexões perdidas; o harness antigo retornou sucesso, e o
novo teste negativo falhou. Corrigido o harness, o teste exige exclusivamente
1 commit + 5 `P0001: duplicate request`, nenhuma falha inesperada, uma RFQ,
um recibo e referência reconciliada. Recibo ausente ou conexão perdida falham.
Alvo não loopback é recusado antes de qualquer psql.

A suíte SQL **completa** passou em PostgreSQL 16 descartável (digest no JSON),
network=none, 2 CPUs, 768 MiB, repositório somente leitura. Incluiu clean install,
upgrade/reaplicação/rollback, RLS, SoD, negação de provider concorrente/documento
intertenant, sessão revogada, decisões × versões, contrato, outbox/leases e
recibos. O harness real confirmou os seis resultados esperados e reconciliação.
Canário sintético existente: 594 verificações, zero vazamentos. Não é canário
hospedado nem prova de Auth/Storage gerenciados. Nenhuma migration foi criada.

## P0-B e M3 — diagnósticos independentes

`demo/station.mjs` foi executado sem provisionar, iniciar/resetar serviços ou
alterar scripts/runbooks. Resultado **BLOCKED neste executor efêmero**:
psql ausente no host, stack canônica/certificado/seed/pool/freeze não presentes.
O container descartável de SQL não é a stack da estação. A heurística de
persistência não reconheceu sinais efêmeros neste runtime; não foi usada para
alegar que esta máquina é definitiva. **STATION_READY na máquina do owner
continua NOT_PROVEN**. O operador executa o runbook existente na estação real.

O hosted-infrastructure-doctor existente, read-only, retornou BLOCKED,
release_ready=false e cutover_authorized=false. Atribuição Supabase Demo,
inventário/classificação atual, preservação em custódia durável, restore do
mesmo export, plano/bundle reconciliado e autorização de cutover continuam
sem prova. Configuração reportada é do executor, não presença de secrets na
Vercel. Readiness pública permanece FAIL para o contrato canônico de Supabase;
health de fixtures não vale M3. Sem consultas a conteúdo de dados hospedados,
export real, restore hospedado, seed/reset, migration remota ou assignments.

## Validação e próxima sequência

PASS local: npm ci, check:all, build oficial/demo, check:build-size, links,
segurança, supply-chain, audit (zero vulnerabilidades), domínio/autorização,
SQL completo e regressão Chromium independente com instrumentação. O teste
independente preserva NOT_PROVEN para localhost mesmo com navegação verde.
CI própria deve ser conferida no commit da PR, sem herdar o sucesso da base.

1. Frente UX corrige os JS_ERROR nas duas transições, preservando ownership;
   repetir o smoke externo no SHA aprovado da main após a integração.
2. Finalizar quatro gates no HEAD próprio; integrar pelo processo aprovado,
   sem merge direto. Relatório de CI/deploy em andamento é PENDING, não PASS.
3. Tratar headroom e verificar paginação com dataset isolado antes de expansão;
   contratos de performance/protocolos em docs/PERFORMANCE_MEASUREMENT_V36.md.
4. Owner valida P0-B na máquina definitiva. M3 depende de decisões separadas
   de classificação/preservação/restauração/cutover, nunca do tour público.
5. Perfis 30/100 usuários e 10k/100k registros estão preparados, **NOT_RUN**.
   Executar somente em ambiente descartável apto ou sob autorização específica;
   resultados do domínio local não são capacidade de API ou resultado comercial.

JSONs adjacentes contêm metadados públicos e dados sintéticos. As medições de
engenharia foram feitas na base acima com o diff local desta PR (dirty=true no
benchmark), sem afirmar que a nova branch estava implantada. Não há cookies,
chaves, dados pessoais ou traces de autenticação publicados.

## Compatibilidade com a frente UX em andamento

A PR #244 (237bf53f9ecfd1e9d04ef55bf3c57b7037eae6c8) foi lida em sua
branch, sem alterações nela. O adaptador foi estendido para incluir contexto
e valor da instituição somente quando esses IDs existem no manifesto de
etapas real. Mantém todas as 15 etapas obrigatórias e recusa duplicações ou
reordenação; a visita nova produz 17 etapas. Essa preparação não afirma que
#244 foi aprovada, mergeada ou publicada. Revalidar na main integrada.
