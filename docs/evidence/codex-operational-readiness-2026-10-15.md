# Evidência — prontidão operacional Codex, 15/10/2026

## Escopo e baseline

Checkout exclusivo `/workspace/arandu-operational`, branch `codex/operational-readiness-20261015`, criado de `origin/main` local após confirmar o SHA pelo GitHub. `HEAD=0aeb2e6c93bc0abbd1f4b4fc8ce91b62171fcaf5`; árvore limpa antes das validações. O `git fetch origin main` falhou por indisponibilidade do proxy. A ref local coincide com o commit retornado pela API do GitHub. Nenhuma worktree do Claude foi alterada.

PRs #198 e #199 estão ancestrais da main. CI `38804369287` terminou SUCCESS no HEAD exato, com `database`, `deploy-boundaries`, `validate` e `presentation` SUCCESS. Merge audit `38804369334` também terminou SUCCESS nesse SHA. Há uma PR aberta de Dependabot (#177), fora desta trilha.

Durante a missão, PR #200 foi integrada à `main`, que avançou para `bf6eb712bb17739d173e4b6c258e9b7ed90b15bc`. A branch desta missão incorporou essa base em `0d675bacaecc9fc665c0642c2b9ae8ba99fad176`; compare confirmou `behind_by=0`. A PR desta missão é [#201](https://github.com/lucasweber1202/Arandu/pull/201). CI `38813025926` validou esse HEAD e concluiu os quatro gates obrigatórios como SUCCESS (`database` 3m, `deploy-boundaries` 2m40s, `validate` 11m43s, `presentation` 13m44s). O job de database incluiu clean install/upgrade/rollback/RLS/concorrência e restore cifrado sintético no laboratório descartável. Deploy Vercel associados ao PR apareceram SUCCESS via status GitHub, sem servir como prova de datasource ou prontidão M3. A evidência será carregada no próximo HEAD da PR e requer nova execução de CI antes da integração.

## Estado de hospedagem observado por fontes read-only autorizadas

GitHub commit statuses em `0aeb2e6` reportam deployments: `arandu-demo` SUCCESS (deployment `DE5gpSiuvKMYNRnCUtCrQoEXDiL1`), `arandu-pilot` SUCCESS (`HRaGeJJfDCbvLQW4jtB5LJ6ttxA9`) e `arandu` FAILURE (`KrFrUJ8MGgJfh8D4pM9dPJQHgWeE`). Esses estados estão associados ao commit, mas não revelam alias/ambiente/datasource efetivos. O motivo do build Production não foi obtido; não atribuir causa.

A conexão read-only Supabase lista somente estes dois projetos, ambos PostgreSQL 17.6 `ACTIVE_HEALTHY` na região `sa-east-1`:

| Projeto observado | Identidade e schema | Evidência de Auth/Storage/RLS | Interpretação |
| --- | --- | --- | --- |
| Pilot `offgpyysgdhfemjlchod` | `financial-surface-hardening-1`; `deployment_environment` ausente; 3 migrations registradas (`arandu_pilot_clean_install_main_64a9bdc`, `pilot_advisor_hardening_9470493`, `financial_pilot_surface_hardening`) | 33 tabelas `fin_*`, 33 policies; nenhuma tabela pública sem RLS. `auth.users=0`, `auth.mfa_factors=0`. Um bucket privado `fin-documents`, limite 10 MiB e allowlist PDF/JPEG/PNG/DOCX/XLSX; 0 policies no schema `storage` | Projeto antigo de Pilot, não Demo canônica. Migration de revogação não aplicada: `fin_request_session_guard()` e `fin_current_session_alive()` inexistentes, sem `pgrst.db_pre_request` nos settings de banco/papel `authenticator` consultados. Não foi feita requisição com identidade de usuário; portanto não alegar teste comportamental de sessão, Auth ou RLS. |
| Legado `igacnfjeuqhxcmfyepgj` | PostgreSQL 17.6; nenhuma migration registrada; `public.fin_settings` ausente e zero tabelas `fin_*` | `auth.users=0`, fatores MFA=0 e zero buckets | Não é Production financeiro e não foi alvo de export, restore ou migration. Apenas catálogo foi consultado. |

O Supabase Security Advisor do Pilot reportou 43 funções `SECURITY DEFINER` executáveis por `authenticated` (WARN) e 30 tabelas com RLS sem policy (INFO; comportamento fail-closed). O primeiro grupo deve ser reconciliado com o contrato esperado de RPCs e probes no release atual; o aviso sozinho não prova exploração. Sem migrations/configuração hospedada recente, sem usuários de teste e sem sessão autorizada, a efetividade de Auth/RLS/Storage permanece INCONCLUSIVE.

A topologia de código mantém atribuições ativas vazias para Demo e Production. Não existe projeto Supabase dedicado de Demo na listagem autorizada. O status Vercel verde de `arandu-demo` não prova alias, ambiente, backend, schema nem jornada M3. Vercel direto já retornou 403 no escopo `lucas-projects467` em consulta anterior; nesta missão não repetimos a mesma consulta nem mudamos de escopo. Configuração, variáveis por nome, build logs, health e datasource atuais ficam `ACCESS_BLOCKED`/INCONCLUSIVE.

## Caminho crítico restante para M3

| Gate | Estado | Menor próximo passo seguro |
| --- | --- | --- |
| Identidade do deploy e datasource Demo/Production | BLOCKED | acesso read-only Vercel no escopo autorizado ou prova pública equivalente que vincule alias, SHA e datasource; Production requer logs para determinar a causa do status FAILURE |
| Recuperação de origem e cutover | NOT_RUN / exige autorização | responsável aprova origem/destino e custódia; classificar dados; export cifrado com Auth/Storage conforme aplicável; restaurar o mesmo export em Supabase descartável compatível; reconciliar políticas/configuração externa; não iniciar enquanto a prova estiver incompleta |
| Sessão revogável no PostgREST | FAIL no Pilot observado | após recovery e aprovação, aplicar o bundle permitido no destino certo; verificar hook, migration, probe HTTP com sessão ativa/revogada e regressões por superfície |
| Storage e Auth | INCONCLUSIVE | configuração Auth/OAuth/MFA/SMTP fora do catálogo acessível; bucket privado observado, mas sem policies storage e sem usuários de teste. Validar com identidades sintéticas e jornada autorizada após cutover |
| Doctor, canário, isolamento e jornada hospedada | NOT_RUN | somente depois de o deployment, datasource, schema e SHA estarem vinculados e migrations/configuração autorizadas |

Pilot permanece estágio transitório, não terceiro ambiente permanente. Nenhuma migration, segredo, atribuição, binding, deploy, domínio, export, restore, seed/reset hospedado, banco ou dado foi alterado nesta investigação. M3/M4/M5/M6 não são reivindicados.

## Verificações locais no HEAD da main

Node `v24.19.0`, npm `11.9.0`. `npm ci --include=optional` passou após habilitar a permissão de rede solicitada para o registry; a primeira tentativa sem a permissão falhou ao acessar o proxy/gravador de log. No preflight da main, antes desta migration, `npm run check:all` passou com `umask 0022`; execução com umask restritiva falhou num fixture de arquivo 0644, sem alteração de controle. Após a integração local, `npm run check:all` não passou nesta sessão, parando em `scripts/test-deploy-release-separation.mjs` porque `spawnSync` recebeu stderr vazio para subprocesso que deveria ser bloqueado; `check:finance` também parou com stderr vazio em `scripts/test-finance-env.mjs`. Os arquivos desses contratos não fazem parte da mudança. `npm run check:migrations` e `npm run check:security` passaram. `npm run build` passou. `npm run test:e2e:list` listou 795 casos em 20 arquivos; nenhum browser E2E foi executado. `npm run audit:ci` encontrou 0 vulnerabilidades após permitir acesso ao registry.

`npm run test:database` passou no preflight da main em container descartável PostgreSQL 17.6, sem conexão a banco hospedado. Após integrar a migration, a suíte completa não concluiu: um helper preexistente falhou com `psql: error: /tmp/tmp.9jzxCJW4eq/holder.sql: No such file or directory`, antes dos novos testes de labels. O teste direcionado da migration passou em PostgreSQL descartável, incluindo aplicação repetida, backfill exato e preservação de títulos personalizados. A execução comissionada também validou `npm run check:migrations` e `git diff --check`. O relatório de subrevisão de segurança não confirmou defeito explorável novo. Nenhum teste foi marcado como browser ou hospedado.

## Correções de domínio avaliadas e handoff

PR #199 documenta dois gaps. Títulos de implantação eram gravados como `Implantação: go live`, `settlement validation` etc., embora o schema já tenha códigos estáveis de milestone. A migration aditiva `financial-implementation-task-labels-1` agora mapeia os códigos para rótulos legíveis na origem e faz backfill somente quando milestone e tarefa ainda têm exatamente os textos automáticos antigos. O teste PostgreSQL direcionado confirmou repetibilidade, rótulos legíveis para `pricing_activation`/`go_live` e preservação de títulos editados. O rollback restaura a função antiga somente se ainda não houver plano de implantação; caso existam dados, falha fechado e exige forward-fix. A migration não foi aplicada a nenhum Supabase hospedado.

`fin_tasks` não persiste responsável e os contratos `GET /api/finance/tasks` e `overview.tasks` não projetam `assignee_id/assignee_name`, apesar da UI existente esperar esses campos. Assignment permanece pendente: uma coluna isolada não cobre validação do membro atual por organização/entidade, auditoria, remoção de membro, projeção e concorrência. O handoff ao Claude é manter esses campos opcionais e não inferir autorização da atribuição. Uma implementação deve ser desenhada como contrato completo, sem conceder acesso ao objeto/documento.

## Riscos, impacto e rollback

Sem mudança de dados hospedados ou produção nesta etapa; as consultas Supabase foram limitadas a catálogo, markers, contagens agregadas e configuração de bucket. Nenhum conteúdo de objetos, identidade de usuário, segredo ou payload foi lido. Falha de deployment permanece sem causa comprovada. A ausência do hook no Pilot é risco real de revogação direta PostgREST naquele schema; não foi corrigida porque migrations hospedadas exigem recovery e aprovação. A suíte completa de database pós-migration não passou do helper preexistente de concorrência (`holder.sql` ausente); o teste direcionado da migration passou. `test-pending-migration-bundle` e dois testes de contrato de deploy/env também observaram saída vazia de subprocessos. `check:security` foi aprovado no checkout integrado. Esses resultados são registrados como limitação do executor; não houve alteração dos controles nem falsos verdes.

Branch `codex/operational-readiness-20261015`; commits da migration `e7337fa`, documentação inicial `289ed34`, ajuste dos contadores de bundle `8772983`, correção da ordem do fixture de rollback `38cfb27` e merge da main atual em `0d675ba`. PR #201 aberta. A execução `38813025926` passou nos quatro gates obrigatórios no HEAD `0d675ba`; se a atualização desta evidência for commitada, o novo HEAD exige nova CI e verificação por `npm run merge:gates -- 201`. Nenhuma integração foi feita nesta etapa.
