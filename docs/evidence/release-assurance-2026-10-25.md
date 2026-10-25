# Release assurance — 25/10/2026

Auditoria parcial, em ambiente cloud Linux/Node 24.19.0. Datas operacionais em America/Sao_Paulo.
Não constitui aprovação humana do release ou da apresentação.

## Identidade e limites

- Main remota conferida pela API GitHub: `f57cbfa028a8482c4ff8a847cf7bb9377c3d00f2`.
- Branch de evidência: `codex/p0-oct29-release-assurance`; base exata acima.
- SHA final e PR: consultar o commit e o HEAD desta PR; este arquivo não pode incluir seu próprio hash.
- Checkout fornecido: `fa551c0`, histórico termina na PR #190; árvore inicialmente limpa.
- `git fetch origin`: BLOCKED, conexão recusada em proxy:8080. O objeto da main atual não existe no checkout.
- Por isso não foi criada worktree de uma base antiga nem executado build antigo como prova atual. Leitura e publicação documental usam o conector GitHub, com árvore baseada na main atual.
- Não houve edição de UI, CSS, package.json, vite.config.js, vercel.json, workflows, PR #265, migrations ou ambientes hospedados. Nenhum reset, freeze, merge, pull de imagem ou alteração de segurança.

## Atualização após os checks desta PR

**BLOCKED por audit:ci**: o novo run detectou advisory alto em zod transitivo da base. Os verdes anteriores são históricos; não liberar merge/freeze com base neles. [Achado, patch isolado e integração coordenada obrigatória](release-assurance-2026-10-25-security.md). O parecer anterior de preflight abaixo descreve somente código isolado; o veredito de integração de #265 agora é BLOCKED.

## Decisão executiva

O candidato técnico conhecido é main `f57cbfa`, com database, deploy-boundaries, validate e presentation SUCCESS nesse SHA.
A escolha/aprovação humana do SHA não foi observada. Não existe nesta rodada prova suficiente para liberar a apresentação completa.
PUBLIC_SHAREABLE: NOT_PROVEN nesta rodada. LOCAL_STATION_READY: NOT_PROVEN. CANONICAL_HOSTED_M3: NOT_PROVEN. PRODUCTION_M5: NOT_PROVEN.

| Área | Estado | Evidência | Risco | Próxima ação |
|---|---|---|---|---|
| PR #265 | BLOCKED para release; preflight aprovado isoladamente | Diff de quatro arquivos, HEAD d92f4b3, verdes históricos; 23 verificações herméticas PASS; novo audit:ci FAIL | zod transitivo sinalizado; WSL2 não provado | Corrigir dependência compartilhada e revalidar antes de revisão/merge |
| Migration #262 | SCHEMA_APP_COMPATIBLE em laboratório CI; hosted NOT_PROVEN | Job database 120604020135 da main e schema observado no ensaio canônico | Banco hospedado não inspecionado; matriz exaustiva schema antigo/app novo não repetida | Manter contrato app primeiro no rollback; verificar schema hospedado por leitura autorizada |
| Backend canônico | PASS para cobertura existente no merge efêmero 593dea7 | Run 40014337079, 26 passos, 63 ataques, 24 sondas PASS, recovery/teardown SUCCESS | Quatro cenários browser SKIPPED; não equivale a main isolada nem a hardware | Reutilizar prova apenas para os SHAs/arquivos cobertos |
| Demo pública | BLOCKED nesta auditoria / NOT_PROVEN | curl falha no proxy; ferramenta web também não acessa raiz/visita | SHA servido, modo, assets, teclado e navegação atuais não observados | Restaurar rede do executor e executar smoke/public-tour proof existentes no domínio |
| Estação local | NOT_PROVEN | Executor cloud; nenhuma execução na máquina definitiva | P0-B depende de WSL2/Windows e browser físico | Operador executar cartão no SHA aprovado |
| Vercel | VERCEL_ACCESS_BLOCKED_403 | GET deployment arandu-demo no scope lucas-projects467 recusado | Sem logs/configuração/identidade autenticada do deployment | Owner autorizar conexão no mesmo team |
| Production | NOT_PROVEN; status GitHub FAILURE | Vercel – arandu FAILURE na main | Causa e runtime inacessíveis | Triagem após acesso; não retirar foco dos P0 salvo segurança transversal |

## PR #265 — revisão e teste proporcional

Base `f57cbfa028a8482c4ff8a847cf7bb9377c3d00f2`; HEAD `d92f4b3383fc08ab9e6ca8807c6210432d4a382a`; aberta, não integrada.
Mudanças: resources.mjs, run.sh, teste do harness e documentação. Nenhum arquivo visual.
O shell mantém proteção de falha no pipeline; preflight roda antes do pull e novamente após download recusado, antes do registry alternativo.
Pisos não podem ser reduzidos: memória 6000 MiB; workspace 12 GiB; Docker 12 GiB para drivers aceitos, 32 GiB para vfs.
Filesystem medido pelo DockerRootDir, separado do checkout; leitura inválida, caminho ausente, driver desconhecido e endpoint não unix bloqueiam.
Não há prune, remoção de volume, troca de imagem ou desativação de gate.
Falha de pull pode deixar camadas parciais: o recheck impede avançar abaixo do piso, mas não reserva capacidade contra consumo concorrente.
Socket unix sozinho não comprova que o filesystem do daemon coincide com o namespace do processo. WSL2/Docker Desktop continua dependência física; caminho inacessível falha fechado. Esta PR trata o laboratório CI, não certifica a estação.

Teste novo isolado sobre os bytes exatos de resources.mjs do HEAD da PR: **23 PASS, 0 FAIL**.
Cobre seis drivers aceitos, pressão de memória/workspace/Docker/vfs, driver desconhecido, NaN/Infinity/negativo, overrides, endpoints TCP/SSH/npipe, discos distintos, df inválido e DockerRootDir ausente.
Somente fixtures; nenhum daemon foi contatado pelo teste, nenhuma imagem baixada.
SHA256 do fonte auditado: `56509d2c4ff183f7897db08ca963ca19ce87d79068bd0358c195a5826b14c0f2`.
SHA256 do teste desta auditoria: `f3fd104099e1c02a2da2eb77b493d8a87085aaa1a11830ec2d6fd19acc3d004c`.
Nenhum defeito funcional reproduzível confirmado que justifique alteração de código antes do evento.

## Migration #262

A migration é a última entrada em cleanInstall e existingDatabase, após external-proposals.
Cria projeção derivada sem copiar tarefas; join exige contrato e tarefa na mesma organização compradora.
`security_invoker=true` e `security_barrier=true`; revoga privilégios de public/anon/authenticated/service_role e concede somente SELECT a authenticated.
RLS das tabelas base continua necessária; grants não substituem isolamento.
Dois índices de paginação são aditivos, IF NOT EXISTS; marker atualizado na mesma transação; notify PostgREST após DDL.
Rollback remove somente view/índices e retrocede o marker quando ele corresponde à migration. Contrato explícito: reverter aplicação correspondente primeiro; não remover schema enquanto código novo depender da view.
A API consulta a view com JWT do usuário, filtros de organização/provedor e limite+1. Cursor vincula organização, provedor, seção, ID e ordenação; datas nulas têm ramo específico. Não usa fallback service-role.
Falha na consulta não vira lista vazia de sucesso no teste existente de finance-portfolio. Ausência autorizada e erro de backend permanecem distintos.

Evidência reaproveitada, não nova execução local:
- Job database da main executou instalação limpa/upgrade/reaplicação/rollback e SQL da projeção; script contém ciclo apply/apply/rollback/apply/test nos dois bancos descartáveis.
- Canary: 7961 verificações, zero vazamentos em um dos cenários; outros cenários também registrados com zero vazamentos.
- Testes SQL cobrem tarefa além do contrato 200, leitor, entidade restrita, outro tenant, provedor, membro removido e grants.
- Logs de upgrade sintético: interruption ROLLED_BACK, history PRESERVED, hosted NOT_RUN.
- Ensaio canônico: PostgreSQL 15.14, marker financial-relationship-continuity-1, seed 39/39 e recovery SUCCESS.
- Schema antigo+código antigo, schema antigo+código novo em PostgreSQL com API real e rollback do binário completo: NOT_RUN nesta rodada; não declarar matriz exaustiva provada.
- Schema/build hospedados: NOT_PROVEN.

## Reconciliação do ensaio canônico

[Run 40014337079](https://github.com/lucasweber1202/Arandu/actions/runs/40014337079).
Metadados head_sha: `d92f4b3383fc08ab9e6ca8807c6210432d4a382a`.
Logs TESTED_SHA: `593dea7c2cbaf281d9dc1a6f0e2e2748ecc08962`, merge efêmero desse HEAD com main `f57cbfa`.
As duas identidades são diferentes e não devem ser trocadas.
A frase da descrição da PR dizendo que não inclui a migration institucional não corresponde ao marker efetivamente observado neste run: os logs mostram `financial-relationship-continuity-1`.
Este registro acrescenta reconciliação; não reescreve evidência histórica.

Resultados observados nos logs: jornada 26 passos/63 ataques/0 falhas; adversarial 24 PASS/0 FAIL/0 SKIPPED; desktop 8 PASS/1 SKIP; mobile 6 PASS/3 SKIP; Auth/PostgREST/Storage/seed/pool/recovery/teardown SUCCESS.
Os skips incluem roteiros de visitante; não declarar todos os caminhos comprador/provedor/visitantes cobertos no browser.
Artefato 12530056327; digest registrado no upload `66aada2b8303af22485d17fdef935131c656e8b32a87ea36f6dac103a040bb6b`.
Digest conferido nos logs do upload, não recalculado por download nesta rodada.
A stack pesada não foi repetida: nenhuma mudança de runtime foi feita e a prova existente identifica exatamente a base avaliada.

## Publicação e acesso

GitHub informa Vercel – arandu-demo SUCCESS, arandu-pilot SUCCESS, arandu FAILURE para main.
Isso não prova domínio servido, schema ativo, M3, permanência de um ambiente Pilot ou Production pronta.
GET autenticado de arandu-demo.vercel.app no scope lucas-projects467 retornou 403 forbidden.
Team informado pela resposta: `team_BBpDcLVx5izJjXz5qBEq2cRy`.
Dependência mínima: proprietário autorizar a conexão existente para esse team e permitir leitura de deployment/logs. Não foi tentada outra conta, token ou scope; não enviar segredos pelo chat.
O erro do proxy local não prova indisponibilidade global do site. SHA_MISMATCH não foi atribuído sem ler o SHA servido.
Sem navegação renderizada nesta rodada: responsividade, teclado, console, deep links, integridade de assets e rótulos atuais permanecem NOT_PROVEN.

## Handoff mínimo para 26–29/10

Seguir docs/demo/OPERATOR_29-10.md, sem improvisar nova sequência.
1. Owner escolher/aprovar SHA completo com quatro gates verdes; nenhuma aprovação inferida de SUCCESS.
2. No Windows definitivo: Docker Desktop ativo e integrado ao WSL2, Node 24 Linux, repositório no filesystem Linux, ferramentas e Chromium do lockfile.
3. Instalar dependências, check:all/build; prepare-station --provision, lendo cada BLOCKED/UNSAFE.
4. Ensaiar no workspace descartável conforme cartão; repor pool e aguardar provisionamento terminar.
5. Só então freeze --station no SHA aprovado e árvore limpa; readiness --smoke; station deve ser READY na máquina física. PREPARED cloud não basta.
6. D-1 repetir ensaio/reposição e readiness conforme cotas. D-0 T-60 resume se necessário, readiness e station; T-30 parar testes/provisionamento.
7. Conferir seed 39/39, Auth/PostgREST/Storage/app, pool e browser Windows em HTTPS localhost.
8. Resposta incerta após escrita: consultar registro, não reenviar por impulso. 429: respeitar janela; sem bypass, reset ou service-role.
9. Plano C em cópia isolada do SHA aprovado: build:demo e PORT=4174 serve:test; conferir rotas/assets/browser antes do evento. Build estático desta rodada NOT_RUN por checkout antigo e rede indisponível.
10. Sem station READY e leitura pronta, usar capturas/visita explicitamente informativas; não simular backend operacional.

## Validação e rollback desta entrega

Mudança exclusivamente documental (este relatório, evidência sanitizada e nota aditiva na Implementation Matrix).
Build/check:all da árvore atual: BLOCKED neste executor; não substituídos por testes da base antiga.
SQL novo local: NOT_RUN; evidência CI exata reaproveitada acima.
Quatro gates desta PR precisam ser lidos no HEAD próprio; checks da base não são transferidos.
Rollback documental: reverter o commit desta PR; nenhum efeito em schema/dados/runtime.
Nenhum segredo, dump, cookie, token, estado de estação ou log bruto foi incluído.
P2/refatoração e novas capabilities foram adiadas. P0 externos restantes: rede, prova pública, autorização Vercel e estação definitiva.
