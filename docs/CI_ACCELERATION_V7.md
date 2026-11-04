# CI Acceleration 7.0 — execução e evidência

Base inicial: `e93fa35d` (#321/#323/#324/#325 integradas). Classificação A/B/C/D
continua a v6.2; esta mudança de CI é D. Não altera os quatro contextos finais,
ancestralidade, merge candidate, SHA, pins, testes SQL, Auth/Storage reais,
integração, recuperação ou teardown. Não reduz timeout para esconder trabalho,
nem aumenta timeouts para acomodar lentidão.

## Perfil histórico

Fontes sanitizadas em `ops/ci/acceleration-v7/`: metadados oficiais de três runs
completos e projeção do list reporter, sem títulos, payloads ou screenshots.

| Run | PR | Wall-clock, min | Runner-minutes estimados | Soma de fila real, s |
|---|---|---:|---:|---:|
| 41851388026 | 321 | 34,65 | 81 | 22 |
| 41898780191 | 324 | 32,27 | 82 | 21 |
| 41892913073 | 325 | 33,93 | 82 | 26 |

Runner-minutes são durações por job arredondadas para cima, não fatura. A fila
usa `job.created_at → started_at`; a espera até criar o job inclui dependências
e dispatch. Não confundir quatro minutos aguardando deploy-boundaries com fila
de runner. Tentativa, SHA, labels do runner e durações por fase são preservados.

No run #324: 2.020 casos planejados, 1.992 execuções e 28 skips explícitos,
30 arquivos / 150 pares arquivo-projeto. Soma de durações por projeto (tempo de
workers, não wall-clock): Chromium desktop 696.867 ms; mobile Chrome 715.619 ms;
Firefox desktop 1.142.258 ms; WebKit desktop 1.709.595 ms; mobile Safari
1.593.170 ms. Contratos e procurement concentram grande parte do trabalho.
O perfil histórico não expõe hooks/fixtures/rede; esses valores ficam desconhecidos.

## Novo caminho de navegador

Dois grupos medidos: `gecko_webkit` (Firefox + WebKit desktop) e
`chromium_mobile` (Chromium desktop + Chrome/Safari mobile). Os custos históricos
somados ficam próximos; todos os testes de cada projeto permanecem. Workers
continuam adaptados a CPU/memória, no máximo quatro por runner. Não há runner
pago especial ou aumento indiscriminado de paralelismo.

`validate-source` executa audit/SBOM, check:all, build regular, budgets, assets,
SEO, superfície/navegação, plano completo dos casos e budget do build Demo.
Só depois os dois grupos e presentation começam. Deploy-boundaries permanece
completo, independente e obrigatório no resultado agregado do workflow full.
Erros baratos de fonte/build impedem os jobs caros sem produzir PASS falso.

Cada grupo recompila o produto estático do mesmo checkout (aproximadamente um
segundo), em vez de depender da quota de artifacts para um build obrigatório.
Pins e instalação/verificação dos três motores permanecem. Não são reutilizados
resultados de testes, sessões, Auth mutante ou dados privados.

O plano lista cada ID/projeto/arquivo/linha no SHA candidato. Recibos medem cada
execução/retry e os hooks de setup/teardown. O verificador exige a união exata
planejada, cada caso em um único grupo, sequência válida de retries e resultado
esperado. SHA divergente, grupo ausente, caso removido/duplicado, interrupção,
falha inesperada e skip silencioso falham. Skips explícitos existentes são
contados à parte; nunca entram na contagem PASS. Flaky continua visível.

Recibos compactados via outputs do MESMO workflow/run evitam uma nova dependência
da quota de artifacts. Têm limite de tamanho, descompressão limitada e SHA
obrigatório. Não incluem seletores, mensagens de assertions, anexos, cookies,
queries, credenciais ou páginas. Os artifacts/HTML e evidências de falha existentes
continuam com nomes distintos por grupo. A verificação de cobertura é obrigatória.

A lista canônica também passou a exigir todos os `finance-*.spec.js`: conectividade
e radar eram suítes existentes omitidas. A primeira enumeração local da nova
lista teve 2.055 casos / 32 arquivos, 35 casos adicionais; mudanças posteriores
da main exigem nova enumeração. Medidas futuras devem separar conjunto comum
e cobertura adicionada, sem atribuir aumento de cobertura a uma aceleração.

## Seed e quatro workspaces

O run #324 registra uma espera de **534.000 ms** por 429 no seed de 613 s; cada
workspace levou cerca de 620 s. Não é apenas custo de INSERT ou Docker.
`profile.mjs` agora mede fases inclusivas, HTTP até consumir o corpo, status,
role/side do ator, quantidade de tentativas e esperas narrativas/backpressure.
Não captura payload, URL/query, ID, segredo, resposta ou texto de erro.

`ARANDU_SEED_PROFILE_DIR` no laboratório escreve um JSON por baseline/workspace
(somente metadados). Os quatro seeds continuam isolados e concorrentes. Rate
limits, Retry-After, sessões, API, RLS, sanidade e limpeza permanecem. O próximo
perfil deve determinar o batching/redução de round trips necessário; não se
atribui ganho de seed a esta instrumentação nem se contorna o limitador.

## Pré-publicação

`node scripts/ci-prepublish.mjs`: checkpoint limpo, main remota atual e ancestral,
classe estimada pelo código, check:all hermético, builds regular e Demo, budgets,
assets e nova conferência de SHA/main antes de terminar. Não aceita flag para
pular builds. A saída `LOCAL_PREFLIGHT_PASS_CI_STILL_REQUIRED` não autoriza merge,
release ou hosted. SQL/E2E/integridade profunda continuam nos caminhos exigidos.
Se main avançar, integrar e repetir antes do push em lote.

## Estado

Implementado e em validação local. União de planos por grupo comprovada; teste
real Chromium desktop/mobile com recibos executado. Não há ganho de wall-clock
ou custo em runner novo comprovado até concluir o CI do SHA candidato. Metas
20–25 min / validate <18–20 min / seed-pool <5 min continuam hipóteses.
Nenhuma escrita, exportação ou conversão Supabase hospedada ocorreu.
