# Operação master: release preservado e relacionamento com dados próprios

Data da sessão: 22/10/2026 em America/Sao_Paulo (artefatos em UTC de 23/10).
Base: `5e5ce0cdc7deb2d555341c3c0adbc8a730f4d1e7`, PR #260 incorporada.
Trilha B: `codex/post-oct29-product-evolution`, integração **somente após 29/10**.

## A. Resumo executivo

A publicação M2 foi novamente provada na base atual. Os quatro gates e
merge-audit dessa main estão SUCCESS. O executor continua sem backend canônico;
a máquina definitiva não foi acessada. Nenhum freeze foi realizado.

O avanço funcional é o relacionamento da instituição com pendências consultadas
no seu próprio escopo. A implementação anterior substituía os dados da resposta
pelo cache do overview, limitado às primeiras 100 tarefas globais. Também
recuperava aviso prévio desse cache porque a resposta omitia o campo. Uma tarefa
fora do resumo desaparecia; uma tarefa concluída depois do carregamento podia
continuar aparecendo. O endpoint agora retorna aviso prévio e até 200 tarefas
abertas dos contratos autorizados, com nomes dos responsáveis do mesmo tenant.
A interface permite atualizar, revela as pendências além das seis iniciais e
explicita truncamento. Falha de leitura mostra erro; não confirma ausência.

Risco remanescente: o relacionamento continua um recorte de até 200 contratos,
não todo o histórico; truncamento de tarefas usa sentinela 201. A lista canônica
Tarefas mantém sua paginação existente. Nenhum claim de completude histórica.

## B. Repositório

Worktrees anteriores preservadas. Release: `/workspace/Arandu-release-current`,
detached na base; produto: `/workspace/Arandu-product`, branch acima.
Não houve escrita direta na main. Um lote de código/testes/evidência será
submetido para revisão sem merge automático. O SHA final é o HEAD da PR;
não se confunde com o SHA público da base.

Arquivos funcionais: `lib/api/domains/finance-portfolio.mjs`,
`finance/src/views/provider-relationship.js`, `relationship-context.js`.
Regressões: `scripts/test-finance-portfolio.mjs` e
`tests/e2e/finance-relationship-center.spec.js`.

## C. CI/CD

Main: database, deploy-boundaries, presentation, validate e merge-audit SUCCESS.
CI run `39882120059`; audit `39882120132`. Não foram solicitados reruns.
Checks do HEAD da PR são independentes e devem ser consultados antes de integrar.
Demo e Pilot têm statuses SUCCESS; Production tem FAILURE. Deployment Production
`HLd84jhjCkjWXxSACE8xEUkwmkA6`: leitura Vercel retorna 403 no scope correto
`lucas-projects467`. Causa interna não confirmada; não inferir de outros projetos.
Política `main=true`, `docs/**=false`, `**=false` preservada.
Deployments solicitados pela missão: **zero**. Sem preview ou deploy manual.

## D. Produto e priorização factual

| Jornada | Evidência desta alteração | Decisão |
|---|---|---|
| Instituição → contrato → próxima ação | Teste reproduziu tasks ausente; UI mostrou tarefa antiga e omitiu tarefa atual | Corrigido nesta PR |
| Renovação no relacionamento | Campo omitido e preenchido por cache global | Consultar campo do contrato; ausência continua explícita |
| Fila com mais de seis pendências | Texto mandava procurar abaixo sem renderizar itens restantes | Expansão nativa com destinos canônicos |
| Atualização com backend indisponível | Erro de consulta não pode virar lista vazia bem-sucedida | Testes negativos API e navegador |
| Responsável de covenant vs tarefa | Contrato source-specific ainda necessário | Adiado; sem herança automática de owner |
| RFQ, proposta externa, decisão e portal institucional | Regressões da suíte existente; sem nova implementação neste lote | Preservar release; avaliar com usuários após evento |
| Tiers, billing e conectores | Sem evidência comercial/operacional nova | Fora do escopo |

Isto não é uma auditoria nova exaustiva de todos os módulos, nem validação de
mercado. A próxima pesquisa deve observar um comprador tentando achar uma
obrigação fora do resumo global, decidir renovação e entregar tarefa a alguém;
o portal institucional precisa de pesquisa separada com instituição autorizada.

## E. Segurança

Leituras usam `rest(token)` com JWT do usuário, sem service role. Organização
BUYER e provedor são autorizados antes das consultas filhas. IDs de contrato
vêm da leitura já sujeita a RLS; tarefas filtram tenant, tipo contract, IDs e
status open. Nomes só são consultados para assignees de tarefas retornadas e
no mesmo tenant. RLS existente `fin_task_read` continua vinculada à visibilidade
da entidade; não houve alteração de policy nem de grants.

Testes de API usam transporte mock: verificam JWT/filtros, provedor de outro
escopo, organização inadequada, consulta vazia sem tarefas/membros adicionais,
sentinela/truncamento e falha fechada. **Não constituem prova executada de RLS
no PostgreSQL.** A suíte SQL original foi executada à parte, com resultado
PASS; não atravessa GoTrue/PostgREST/Storage reais. Auth, sessão, rate limiting,
documentos, idempotência e portal
institucional não receberam mudanças; seus checks existentes são regressão.

Changelog Supabase e documentação atual de segurança da Data API consultados.
A mudança anunciada de cifras TLS antigas para novembro não exige ajuste no
Node 24 desta leitura; TLS e proxies foram preservados.

## F. Banco e rollback

Contrato de resposta aditivo: `contracts[].renewal_notice_days`, `tasks`,
`coverage.tasks_truncated` e `coverage.limits.tasks`. Sem coluna, RPC, migration,
seed, escrita de dados ou aplicação SQL hospedada. Sem mudança na semântica
de assignee. Reverter o commit restaura o comportamento anterior; não requer
rollback de dados. Deploy antigo deve continuar com seu frontend correspondente.
A suíte SQL original foi executada separadamente em PostgreSQL 16.15 descartável,
com três bancos principais e os bancos temporários do ensaio Pilot;
resultado PASS no registro de execução.
O bootstrap de Auth/Storage é o dos testes, não serviços GoTrue/Storage reais.
A recuperação cifrada real adicional do job CI (PostgreSQL 17/age) não foi
executada localmente.

## G. Experiência e validação

UI mantém tokens, componentes, links canônicos e disclosure HTML nativo.
Leitor pode atualizar dados sem ganhar ações de escrita. Nenhum polling novo.
Capturas reais de navegador com **respostas sintéticas de teste**, não demo
canônica: `reports/relationship-{before,after}-{chromium-desktop,mobile-chrome}.png`.
Antes foi renderizado a partir do código da base, com os mesmos fixtures do
regresso; ambos os testes falharam por ausência da tarefa atual. Depois usa
código corrigido. Screenshots não atestam integração com banco.

Validação final e métricas de bundle constam no registro de execução ao fim.
Firefox/WebKit não executados neste ambiente; apenas Chromium desktop e móvel.

## H. Demo e decisões independentes

Prova pública: `https://arandu-demo.vercel.app/`, base `5e5ce0c`,
`2026-10-23T01:22:38.978Z`, 229 verificações sem falha, 36 etapas/capturas,
Chromium 156.0.8078.4 / Playwright 1.64.1. Transporte relay de respostas reais
com hashes verificados; sem fallback sintético de transporte. O próprio produto
publicado identifica `synthetic-fixtures`, visita informativa com sandbox.
Artefato integral: `/workspace/Arandu-release-current/reports/public-demo/proof.json`.

| Dimensão | Veredito nesta sessão | Limite |
|---|---|---|
| Publicação M2 | GO / PUBLIC_SHAREABLE PASS | Apenas o SHA público provado |
| Estação definitiva | NOT_VERIFIED | Windows/WSL2 físico inacessível |
| Estação deste executor | BLOCKED | Cloud efêmero, sem serviços/psql |
| Modo leitura canônico local | NOT_RUN | Backend local indisponível |
| Modo interativo canônico local | NOT_RUN | Sem seed, pool ou buyer/provider reais |
| Demo M3 | BLOCKED | Publicação é synthetic-fixtures, não backend canônico |
| Production M5 | BLOCKED | Status failure; detalhes 403; readiness não demonstrada |
| Release 29/10 canônico/local | NO-GO enquanto a estação não for provada | A visita M2 pública tem GO independente; não integra esta P1 antes do evento |

`station --fast` na base atual produziu BLOCKED às `2026-10-23T01:28:47.311Z`.
Relatório em `/workspace/Arandu-release-current/reports/demo-station/station.json`.
Não houve setup, reset, uso de pool, seed ou freeze nesta sessão. O handoff da
PR #260 permanece a contingência operacional, sem repetir PR documental P0.

## I. Limitações do executor

Node 24.19.0, npm 11.9.0, Docker 28.4.0 com driver vfs. Docker observado sem
imagens/containers/volumes/cache; disco overlay 32 GB, cerca de 27 GB livres.
`psql` ausente no host. A tentativa anterior de registrar a imagem Supabase
PostgreSQL oficial falhou por ENOSPC; não foi repetida no mesmo driver.
Foi viável baixar a imagem padrão menor usada pela suíte SQL do CI: PostgreSQL
16.15, 451.304.147 bytes, digest
`postgres@sha256:9e2cf6287f25c3151f4c9421ccce2b17f3e60061c111a29165e0d2cdd9ff0a97`.
Container exclusivo `arandu-product-sql-20261022`, sem rede externa ou porta
publicada, dados em tmpfs. Não é substituição da stack canônica.
Cliente real psql do container acessado por adaptador temporário em
`/tmp/arandu-sql-bin/psql`, preservando SQL, parâmetros, includes relativos,
PGOPTIONS e PGAPPNAME. As duas primeiras tentativas expuseram problemas de
transporte (includes e consumo do stdin do loop); o adaptador foi corrigido,
sem alterar scripts, migrations ou fixtures. A rodada seguinte chegou ao
ensaio de backup e parou por falta de pg_dump; pg_dump e pg_restore reais
16.15 foram então disponibilizados e um dump/restore de transporte foi
comprovado antes de repetir a suíte original completa.
Após baixar a imagem, havia cerca de 23 GB livres.
Nenhum prune, mudança global de driver ou remoção de recursos de terceiros.
O container exclusivo é encerrado após os testes; a imagem fica em cache.

O sandbox impede listen em 127.0.0.1 e spawnSync por padrão (EPERM); browser
tests e checks com subprocessos foram
executados com a permissão de execução necessária. Uma rodada intermediária
foi invalidada por rebuild durante o teste; não é usada como PASS final.
A máquina definitiva precisa executar os checks do runbook no seu próprio SHA,
com backend, seed, pool e readiness íntegros, antes de declarar READY.

## J. Sequência após 29/10

1. Revisar e integrar esta PR apenas após o evento, com gates do próprio HEAD.
2. Provar esta resposta em stack canônica com dois tenants e escopo restrito;
   verificar tarefa fora das 100 globais, conclusão/refresh e membro removido.
3. Observar comprador real completando próxima ação; medir encontrabilidade,
   clareza do prazo e execução, sem atribuir scores comerciais inventados.
4. Se necessário, paginar contratos/tarefas por instituição além do recorte;
   preservar autorização em cada página e ausência diferente de zero.
5. Tratar covenant/assignee apenas com contrato source-specific e adversariais.
6. M3 depende de alvo/dados/recuperação autorizados; Production depende de
   acesso de leitura no scope correto, diagnóstico e readiness própria.

## Registro de execução

- `build`, `check:all` hermético e `check:build-size`: PASS.
- API focada: PASS, após reproduzir `payload.tasks` ausente na base.
- Financeiro Chromium desktop/mobile: **538 PASS, 10 SKIPPED, 0 FAIL**.
- Apresentação Chromium desktop/mobile: **136 PASS, 20 SKIPPED, 0 FAIL**.
- Capturas finais e atualização com erro: **2 PASS**, sem cache antigo.
- `npm run test:database`: **exit 0**, script original completo em PostgreSQL
  16.15 real. Instalação limpa, upgrade, reaplicação, rollback, RLS e concorrência
  passaram. Canary chegou a 10.888 verificações sem vazamentos no seu cenário;
  os números pertencem aos fixtures, não a dados de clientes.
- Ensaio Pilot sintético: 39 migrations, `financial-surface-hardening-1` →
  `financial-external-proposals-1`; dump/restore real validado, interrupção
  ROLLED_BACK, fronteira destrutiva recusada sem reconhecimento de restore,
  histórico preservado. **Hosted NOT_RUN**. Não é recuperação cifrada PG17/age.
- Propostas externas: seis criações → uma versão, seis confirmações → um
  recibo; conflito de edição e revogação de membro após lock recusados.
- Bundle normal: maior rota RFQ **245.884 / 250.000 bytes**, aviso de 98%
  preservado; JavaScript total 558.038 / 800.000 bytes. Limites inalterados.
- Links e checks de governança: PASS com execução permitida. `check:evidence`
  manteve 1/13 gates de readiness liberados; não é liberação operacional.
- Skips continuam skips. API/browser mocks, SQL real e jornada canônica são
  evidências distintas. Nenhuma promoção de M3/M5 ou estação READY.

Logs integrais em `/tmp/arandu-product-{checkall-final,finance-final,presentation-final,database-complete}.log`.
Hashes dos fontes, capturas, transportes e resultados no
[manifesto de validação](relationship-workspace-validation-2026-10-22.json).
O manifesto vincula os testes ao conteúdo dos fontes; o HEAD da PR identifica
esse mesmo conteúdo depois do commit. O build de HEAD e smoke focal são
rechecados antes do único push.

