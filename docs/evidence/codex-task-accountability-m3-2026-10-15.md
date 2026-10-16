# Evidência — responsabilidade de tarefas e prontidão M3

## Baseline e escopo

- Data: 15/10/2026 (UTC).
- Validação local finalizada em 16/10/2026 (UTC), após a suíte PostgreSQL completa.
- `origin/main` revalidada em `b84efd3e822a7aa4ef4c89647047f9b9692c7baa`; PRs #200, #201 e #202 eram ancestrais. A branch isolada é `codex/task-accountability-m3-20261015`.
- CI da baseline: run `38817582036`, quatro gates (`database`, `deploy-boundaries`, `validate`, `presentation`) SUCCESS; merge audit `38817582049` SUCCESS.
- Node `v24.19.0`, npm `11.9.0`.
- Nenhum código ou arquivo de interface sob ownership de Claude foi editado. Nenhum banco, segredo, migration ou serviço hospedado foi alterado.

## Estado de prontidão M3

A revisão do doctor não reproduziu falha corrigível: `pilot-doctor` já verifica schema marker, deployment marker, tabelas/RPCs, Auth, Storage e SHA publicado, com `--expected-commit`. `/api/health?probe=ready` verifica disponibilidade/configuração e não é prova M3. Os testes existentes de readiness e merge-gates passaram. O teste de recovery doctor não pôde usar o fixture durável neste executor: `/home/agent` é read-only e HOME em `/tmp` é recusado pelo guard de store durável. Nenhum controle foi afrouxado.

A reconciliação read-only proporcional de GitHub para o SHA da baseline encontrou status de deployment Vercel Demo e Pilot SUCCESS e Production FAILURE. Não havia evidência autorizada de alias/datasource, projeto Supabase associado, schema hospedado atual ou logs que identifiquem a causa Production. O status FAILURE não permite atribuir causa a código, build ou configuração. A consulta Vercel anterior ao escopo `lucas-projects467` retornou 403; não foi repetida. Permanecem `ACCESS_BLOCKED`/`INCONCLUSIVE` os detalhes de hospedagem não visíveis.

Observações de Supabase em evidências anteriores — Pilot em schema antigo, sem hook de revogação, legado sem schema financeiro e ausência de projeto Demo dedicado na lista consultada — são snapshots históricos, não revalidação do estado em `b84efd3`. Não foram feitas chamadas a banco hospedado.

**Maturidade:** nenhuma validação local ou CI desta mudança demonstra M3. Continuam necessários datasource e identidade de release comprovados para Demo e Production, ambiente Production operacional, rollout autorizado, recovery real de snapshot incluindo Auth/Storage/configuração essencial, probes autenticados de isolamento/revogação e jornadas hospedadas vinculadas ao SHA/schema executados.

## Defeito e contrato de responsabilidade

Antes da mudança, `fin_tasks` não guardava a identidade responsável e `GET /api/finance/tasks` e `overview.tasks` não forneciam responsabilidade persistida. A migration `financial-task-accountability-1` adiciona `assignee_id` opcional e `assignee_source` (`manual`/`inherited`), com FK composta à membership da mesma organização. Tarefas históricas ficam sem responsável; nenhum backfill inventa identidade ou altera título/status. `fin_tasks` continua a fonte de verdade; não foi criada tabela.

A atribuição manual é permitida a `admin` ou `finance_manager` da mesma organização, com escopo válido na entidade. A pessoa atribuída precisa de membership na organização, papel operacional aceito e acesso de escopo à entidade. A validação é repetida no trigger SQL; papéis/grants inválidos, membership removida ou escopo revogado são recusados/limpos. Offboarding bloqueia atribuição manual. Atribuição não autoriza a leitura do documento ou objeto relacionado. O FK e os triggers limpam referências inválidas; eventos registram IDs de tarefa/ator e motivo, não nomes.

Não há herança automática habilitada nesta versão. `related_type='contract'` agrupa obrigações, renovações e implantação e não identifica uma origem única e segura. Atribuições humanas, inclusive desatribuição explícita, não podem ser substituídas silenciosamente por sync. `inherited` permanece reservado a uma função futura service-only com validação source-specific; JWT de cliente não pode forjá-la. Quando a origem não pode ser classificada com segurança, a tarefa permanece sem responsável.

Contrato para Claude:

- `GET /api/finance/tasks` mantém envelope e linhas atuais, adicionando `assignee_id` e `assignee_name`; nome é projetado apenas para tarefas já retornadas por RLS e buscado no conjunto de memberships da mesma organização. Sem membership/nome, retorna `null`.
- `overview.tasks` passa a conter os mesmos campos.
- `POST /api/finance/tasks` aceita `assignee_id` opcional; UUID ou `null` explícito. Presença do campo significa decisão manual e exige papel permitido. `assignee_source`, nome, papel, autor e escopo não são aceitos do cliente.
- `POST /api/finance/tasks` aceita também `idempotency_key` opcional (UUID estável por intenção de criação). O índice único `(organization_id, created_by, idempotency_key)` serializa retries; mesmo payload retorna a tarefa existente com HTTP 200, payload diferente retorna 409 `idempotency_key_reused`. Sem chave, mantém o comportamento antigo (HTTP 201). O hash interno não é projetado.
- `PATCH /api/finance/tasks` preserva mudança de status; suporta reatribuição quando `assignee_id` está presente e desatribuição com `null`. Campo omitido não altera atribuição. Operações simultâneas ficam serializadas pelas guardas/membership e mantêm a transação atômica.
- Nenhum filtro servidor por responsável foi criado; atribuição não altera visibilidade do objeto relacionado nem conclusão financeira da obrigação.

## Migration, reversão e impacto em dados

- Migration aditiva `docs/supabase-financial-task-accountability.sql`, manifesto atualizado e registro `pii: true` para `fin_tasks` em `lib/finance/data-governance.mjs`.
- Rollback conservador em `docs/rollback/supabase-financial-task-accountability.rollback.sql`: recusa reversão depois de dados de atribuição ou de idempotência e requer forward-fix. Reaplicação idempotente, sem reescrever histórico.
- SQL de clean install, upgrade, rollback/reaplicação, RLS, papéis, organização/entidade, desatribuição, remoção/offboarding, auditoria e corridas em duas sessões foi integrado em `scripts/test-database.sh`.
- Migration não aplicada em hospedagem.

## Validação

Os resultados locais finais foram executados na branch a partir dos commits `571544c` (SQL/data model) e `f790710` (API); os arquivos de follow-up ainda não tinham commit ao fechar os testes. A PR deve ser avaliada no SHA final que contém também esta evidência:

- `npm ci --include=optional`: PASS.
- `npm run build`: PASS.
- `npm run check:backend`: PASS.
- `node scripts/test-finance-api.mjs`: PASS; exceções DB de assignment são traduzidas para erro estável sem detalhe SQL.
- `npm run check:migrations`: PASS.
- `npm run check:security`: PASS.
- `npm run test:database`: PASS em PostgreSQL 17.6 Docker descartável, com clean install, upgrade, reaplicação, rollback seguro, RLS, isolamento por entidade, eventos de auditoria, retry de chave única sem duplicar tarefa/evento, offboarding e corrida concorrente de membership. Canário final da migration de accountability: 119 identidades sintéticas, 10.591 verificações, zero vazamentos. Nenhuma hospedagem foi acessada.
- `npm run check:all`: FAIL no baseline e nesta branch em `scripts/test-deploy-release-separation.mjs:38`: subprocesso esperado com mensagem `deploy interrompido` devolve `stderr` vazio neste executor. Nenhum arquivo desse guard foi modificado. O check para antes das suites seguintes.
- `npm run check:finance`: FAIL, também em teste preexistente não modificado `scripts/test-finance-env.mjs:29`: subprocesso de fixture retorna `stderr` vazio em vez da mensagem esperada `projeto legado de arte`. As suites anteriores do comando passaram; o teste de ambiente já havia reproduzido o mesmo bloqueio na baseline pristine, portanto não é regressão desta mudança.
- `npm run test:e2e:list`: baseline listou 810 casos; browser E2E não foi executado e é ownership de Claude/CI.
- Teste de recovery doctor: NOT_RUN por restrição do fixture durável descrita acima.

Os testes de migração também encontraram e corrigiram a lista fixa de schema markers em fixtures históricos, probes e canários para aceitar `financial-task-accountability-1`; os controles não foram alterados.

## Riscos, dependências e rollback

- Risco residual: fontes automáticas ainda não herdam responsáveis; permanecem sem responsável até classificação source-specific futura ou atribuição humana. Isso evita inferência incorreta entre tipos com o mesmo `related_type`.
- O lookup de nome é organizacional e posterior ao filtro de RLS das tarefas; não foi implementado enumeração de usuários.
- Nenhum risco de dados hospedados foi assumido; rollback só é permitido antes de atribuição real. Depois, deve-se usar forward-fix.
- CI, PR, merge audit e SHA final serão registrados após publicação; não promova a maturidade com base em teste local.

## Handoff e estado da integração

A implementação é aditiva e retrocompatível com tarefas sem responsável. O contrato detalhado acima está pronto para consumo de interface; não requer alteração de schema no cliente. Nenhum handoff visual foi necessário.

CI remoto, PR, merge audit e SHA final da branch ainda serão registrados após push. O teste local `check:all` permanece bloqueado pelo subprocesso da baseline; por isso esta entrega ainda não está autorizada para integração. Nenhuma PR foi integrada.
