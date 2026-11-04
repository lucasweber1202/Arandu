# Capacidade Free, consulta de tarefas e RPCs privilegiadas

Complemento da consolidação de 04/11/2026, sem migration nem alteração hosted.
Não altera a baseline, o manifesto, RLS, grants ou a topologia.

## Consulta medida

`node scripts/benchmark-financial-queries.mjs`, com `ARANDU_DATABASE_TEST_URL`
loopback, cria um banco novo, instala o bundle financeiro e semeia 20 organizações
com 100 mil tarefas sintéticas (5 mil por organização). Executa como authenticated,
com os helpers reais de RLS, a mesma ordenação de GET tasks e limite 201 (inclui
sentinela). Não desabilita seqscan/RLS nem força plano. Remove o banco em finally.

Um warmup e cinco EXPLAIN ANALYZE BUFFERS FORMAT JSON por fase. Medição PG17.11:

| Medida | Schema atual | Índice candidato local |
|---|---:|---:|
| Mediana SQL | 1.447,704 ms | 77,137 ms |
| Buffers hit no primeiro plano registrado | 28.648 | 2.176 |
| Plano filho do LIMIT | Sort | Index Scan |
| Espaço adicional | 0 | 7.749.632 bytes |
| Resultado paginado | idêntico | idêntico |
| Usuário sem membership | zero linhas | zero linhas |
| INSERT autenticado, 1.000 tarefas, mediana | 57,633 ms | 59,950 ms |

Índice candidato: `(organization_id,status,due_on ASC NULLS LAST,created_at,id)`.
Planos completos, custos, linhas, loops, buffers, triggers e WAL em
`ops/consolidation/query-benchmark-2026-11-04.json`. A medição inclui RLS e seus
lookups e INSERTs autenticados sempre revertidos, mas não rede, PostgREST,
sessões HTTP, latência de commit ou carga concorrente. Não é p95 de cliente
nem previsão de egress.

O índice foi **descartado com o laboratório**. Há benefício demonstrado nesse
perfil de leitura e custos de armazenamento/escrita mensurados; mistura de
escritas/leitura, outros filtros/status e latência de commit precisam ser
avaliados antes de uma migration própria.
Não remover `fin_tasks_entity_idx`/assignee/FK por inferência: cobrem outros
predicados. O Free não justifica reduzir isolamento ou indexar todo aviso.

## Revisão das 43 SECURITY DEFINER autenticadas

`ops/consolidation/definer-review-2026-11-04.json` registra por assinatura:
finalidade, necessidade de acesso privilegiado, sinal de validação de usuário/
organização/papel, helpers, grants, search_path, risco, comparação com o corpo
canônico e localização dos testes adversariais. Nenhum corpo SQL ou dado de
usuário foi exportado; hashes de corpo servem para detectar drift, não atestar
correção. Sinais lexicais e ocorrência do nome em teste não são prova de segurança.

Comparação somente leitura com instalação sintética canônica no marker atual:

| Resultado | Quantidade | Ação |
|---|---:|---|
| Corpo igual e boundary canônica preservada | 27 | manter e continuar validando as autorizações |
| Corpo hospedado difere do canônico | 15 | upgrade após recovery e aprovação; não aplicar hotfix isolado por advisor |
| Entrada antiga fechada a authenticated no canônico | 1 | `fin_record_decision`: fechar pelo upgrade completo, preservando entrada e triggers atuais |

Os corpos divergentes incluem aprovações, documentos, contratos, renovação,
busca e propostas. A versão antiga de pending upload filtra uploaded_by/status/
TTL; a atual também trava e revalida autorização. A versão antiga de decisão
não deve continuar sendo tratada como contrato atual da aplicação. Isso explica
por que marcador, READY ou quantidade de RPCs não bastam para Demo funcional.

Helpers de membership consultam identidade Auth e papéis persistidos; helpers
de provedor exigem participação/compartilhamento; operadores usam papel de
plataforma separado; perfil próprio só altera nome/cargo; convite exige token
único e email confirmado correspondente. Criação de organização associa o ator
à organização nova, sem aceitar papel arbitrário. Cada RPC continua sujeita a
seus estados/objetos e testes negativos. Não houve revogação indiscriminada.

Para reproduzir a comparação, apontar `ARANDU_DATABASE_TEST_URL` para uma cópia
**local** canônica, no marker do manifesto, e executar
`node scripts/review-financial-definers.mjs`. O script apenas consulta catálogo
e hashes e recusa referência com marker divergente. O snapshot hosted é datado;
renová-lo antes de uma operação. Não usa conexão administrativa hosted nem
executa ataques mutantes nos dois Supabase.

## Exceções de seeds na aposentadoria histórica

A migration histórica isenta quatro IDs editoriais e o marcador unconfigured.
**ID conhecido não prova conteúdo intacto, origem sintética nem retenção livre.**
`ops/sql/legacy-art-seed-review.sql` compara dentro do banco o conteúdo sem
timestamps com os literais históricos, retornando apenas contagens de iguais e
alterados. Não altera linhas e sempre declara conversão BLOCKED. Pode ser
regenerado em PostgreSQL local por `node scripts/review-retirement-seeds.mjs`.

Teste real descartável: tabelas ausentes, seeds exatos, conteúdo modificado sob
IDs isentos, nenhuma divulgação de conteúdo e contagens preservadas. Integra
`test:database` sem remover nenhuma cobertura anterior.

Consulta hosted de 04/11: Pilot tem quatro coleções e um marcador exatamente
iguais aos seeds nas colunas comparadas; zero exceções alteradas. Legado não
possui essas tabelas. Evidência em `seed-review-2026-11-04-<ref>.json`.
Isso é só evidência técnica; os 14 registros do Pilot e os 42 legados continuam
dependentes da decisão de classificação/preservação. Conteúdo alterado em um
ID isento deve bloquear a suposição de seed e voltar à revisão do data owner.
Não executar a aposentadoria apoiado apenas na sua guarda sintática de ack.

## Matriz ampliada de operação (mesmo dia, nova missão)

`node scripts/benchmark-financial-workloads.mjs` cria outro banco loopback,
instala a baseline e remove o banco em finally. São 20 tenants, dois escopos de
entidade no tenant consultado e 1.000 / 10.000 / 100.000 tarefas. Testa status
open/done, vencimento, cursor completo (data/criação/id + NULLS LAST), usuário
restrito a entidade, filtro explícito de entidade e ausência de membership.
Não força planner, desliga RLS ou remove índices existentes. Cada cenário compara
os resultados ordenados antes/depois. Quatro leitores simultâneos reconciliam a
mesma página; as escritas autenticadas são revertidas. Nenhum conteúdo hospedado.

Um warmup + cinco EXPLAIN ANALYZE BUFFERS WAL por consulta/fase. O relatório
`ops/consolidation/workload-matrix-2026-11-04.json` conserva as cinco amostras e o
plano mediano, incluindo buffers, WAL e triggers. VACUUM ANALYZE medido após a
mesma carga de 6.000 inserts revertidos em cada fase; reset de heap entre tamanhos
é setup fora da medição. Resultados desta execução PG17.11:

| Medida, ms (antes → candidato) | 1.000 tarefas | 10.000 | 100.000 |
|---|---:|---:|---:|
| Página open, mediana SQL | 8,505 → 12,415 | 97,761 → 87,724 | 1.203,576 → 53,377 |
| Cursor, mediana SQL | 7,182 → 6,352 | 72,660 → 100,793 | 800,654 → 60,311 |
| Filtro de entidade, mediana SQL | 6,710 → 5,065 | 44,736 → 52,127 | 450,041 → 510,552 |
| INSERT 1.000, mediana SQL | 42,775 → 47,328 | 41,787 → 43,620 | 48,273 → 56,305 |
| Quatro leitores, parede incl. psql | 56,863 → 58,127 | 312,430 → 259,105 | 4.980,037 → 162,274 |
| VACUUM ANALYZE, parede incl. psql | 17,000 → 17,574 | 38,179 → 42,773 | 158,084 → 187,121 |
| Bytes alocados no candidato | 319.488 | 1.261.568 | 7.749.632 |

**Decisão: não adotar neste lote.** Ganho grande no perfil open/cursor de maior
volume não se repete em todos os tamanhos/predicados; há regressão no recorte de
entidade, no cursor médio e na página pequena, além de custo de escrita/espaço.
Volumes hospedados atuais são 42/14 linhas públicas totais. Não há distribuição
real de tráfego que justifique escolher o tradeoff agora. Candidato removido com
o banco, zero migrations/índices adicionados. Não remover os índices existentes.

As medidas são laboratório quente e não p95, commit latency, egress ou throughput
hospedado. Concurrency/VACUUM têm uma observação de parede por fase, sem intervalo
de confiança; WAL varia com checkpoints/full-page images e não é projeção linear
de cobrança. A comparação não autoriza atribuir toda variação de tempo ao índice.

## Capacidade sem serviço adicional

`ops/sql/financial-capacity.sql` usa transação somente leitura e timeout de 15s.
Agrega banco/índices, counters e stats_reset, estimativas de manutenção, conexões,
sessões, bytes declarados de Storage e status retidos de jobs. Foi executado nos
dois projetos; snapshots sanitizados estão em `capacity-2026-11-04-*.json`.
Ausência de tabela retorna null, não consumo zero. Bytes Storage são metadados,
não leitura de binários. Counters com reset desconhecido não comprovam taxas.
Quotas, egress, Auth MAU, fatura e headroom permanecem null: não inventar limites
ou cobrança a partir de contagens. Não foi criado cron/serviço de monitoramento.
