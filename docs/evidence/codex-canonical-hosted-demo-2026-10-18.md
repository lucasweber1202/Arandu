# Demo canônica hospedada — evidência de 18/10/2026

**C / NO-GO hospedado.** A aplicação pública continua sandbox. Correções reais
de backend/readiness e prova de artefatos entregues; publicação integral não
atingida. Nenhum export, migration, secret, projeto, alias ou dado hospedado foi
alterado. Nenhum arquivo ou recurso operacional do Claude foi modificado.

Base main reconfirmada: `005676a0ddc10ccabdee9c728f653f8f13de6de8`.
#221 e #222 integradas nessa base; CI da base verde não valida esta branch.
Branch: `codex/p0-canonical-hosted-demo-20261018`.
Commit das correções: `150e30687d0c0d35e7f90a9212de4a2881ecb0be`.
HEAD final inclui esta evidência e a decisão de preparação da conversão A;
obter SHA literal por `git rev-parse HEAD` e comparar com `head.sha` da PR.
[PR da branch](https://github.com/lucasweber1202/Arandu/pulls?q=is%3Apr+head%3Acodex%2Fp0-canonical-hosted-demo-20261018).
URL direta, SHA final e quatro gates são registrados no relatório final e na PR.

## Estado observado e autorização

| Domínio | Código / evidência válida | Defeito ou bloqueio | Classe e ação segura |
| --- | --- | --- | --- |
| Publicação | GET público no SHA base: environment null, mode demo, datasource synthetic-fixtures; raiz carrega `/assets/demo/index-…js` | Sandbox continua publicado | BLOCKED P0: preservar publicação até candidato canônico aprovado |
| Readiness | Público `/api/health` 200/alive; `?probe=ready` 503/not_ready | Não há backend canônico hospedado comprovado | HOSTED_VALIDATED somente para essa observação negativa; não M3 |
| Vercel | Status GitHub arandu-demo/pilot success, arandu failure | GET `/v9/projects/arandu-demo` 403 scope lucas-projects467; CLI ausente | ACCESS_BLOCKED: acesso ao mesmo projeto/scope; sem desvio de escopo |
| Supabase | Dois projetos ativos observados, Pilot e histórico; nenhum novo criado | Assignments permanentes continuam vazios | BLOCKED P0: preparar conversão preservada A, conforme escolha do owner |
| Schema | Pilot marker financial-surface-hardening-1; decisão v2 e workspaces ausentes | Schema antigo | BLOCKED P0 hospedado; upgrade integral ensaiado isoladamente |
| Dados | 107 tabelas contadas em public/auth/storage/supabase_migrations; 71 públicas; organizações/RFQs/propostas/Auth users/Storage objects = 0, bucket = 1 | Registros legados/operacionais existem; classificação de conteúdo e PII não atestada | Inventário read-only, sem conteúdo/export. Não autoriza reset ou descarte |
| Auth/Storage | Código real e provas sintéticas disponíveis | Configuração gerenciada, login e URLs assinadas sem prova hospedada | BLOCKED: validação do destino após preservação e autorização |
| Recovery | Mesmo export PostgreSQL+age restaurado e reconciliado, objetos/referências sintéticos verificados | Sem custódia/export/restore gerenciado autorizado | LOCAL_RECOVERY_VALIDATED; HOSTED_RECOVERY_VALIDATED não atingido |
| Production | Status do deployment failure, detalhes indisponíveis | Causa BUILD_UTILS não reconfirmada por logs | ACCESS_BLOCKED; guardas preservadas, sem mudança colateral |

Não há autorização implícita de conversão na escolha A. Ainda são necessários:
destino privado durável, custódio da identidade, escopo/classificação/retenção,
janela aprovada de preservação e restore; depois aprovação distinta de rollout
e cutover. Nenhum custo de projeto novo foi consultado após a escolha do owner.

## Implementações e antes/depois

**IMPLEMENTED / LOCAL_VALIDATED:**

- Antes, readiness podia ignorar o segredo necessário ao login de persona e a
  capacidade de visitantes. Agora exige o mesmo critério forte do servidor,
  consulta somente status/baseline das linhas ready com service role e bloqueia
  pool vazio, malformado, obsoleto ou indisponível. Cache invalida na rotação do
  segredo; nenhum valor é exposto na resposta pública.
- Antes, catálogo crítico omitia quatro funções de ambiente/claim/resume/active.
  Agora ausência de qualquer uma impede GO. Doctor inclui segredo e pool;
  evidência v3 do candidato exige `demo_personas` e `demo_workspaces` PASS.
- Antes, paridade era principalmente estática. Agora o gate existente também
  compila Demo e Production separadamente e compara 31 rotas, seus entrypoints
  e hashes de 37 assets JS/CSS. Rejeita sandbox, rota/asset ausente ou diferente,
  entrypoint divergente, falha do subprocesso e falha de limpeza. Saída identifica
  SHA e escopo local; nenhum bypass de build/topologia foi criado.
- Cópia de assets aceita diretório explícito para os ensaios temporários; padrão
  dist preservado. Mesmo código canônico, sem alterações em finance/demo/E2E.
- Runbook operacional e handoff documentam API de persona existente, cookies,
  contexto de organização, seed/pool, erros, release identity, gates e rollback.

Limites: pool disponível não comprova todos os logins, conteúdo do seed,
congruência da senha com contas existentes, grants ou autenticação gerenciada.
Readiness usa cache de até 30 s; não é reserva de capacidade nem proteção de
escrita. Admissão e autorização continuam nas RPCs/API. Catálogo não prova bodies
SQL; RLS/tenant/sessão/Storage precisam de probes próprios.

## Arquivos modificados

- Backend: `lib/api/domains/auth.mjs`, `lib/finance/demo-entry-readiness.mjs`,
  `lib/finance/pilot-doctor.mjs`, `lib/finance/pilot-release.mjs`, `lib/readiness.mjs`.
- Execução/configuração: `.env.example`, `package.json`,
  `scripts/check-finance-env.mjs`, `scripts/copy-runtime-assets.mjs`.
- Regressões: `scripts/test-readiness.mjs`, `scripts/test-finance-env.mjs`,
  `scripts/test-demo-hosted-readiness.mjs`, `scripts/test-canonical-build-parity.mjs`.
- Operação: `docs/CANONICAL_HOSTED_DEMO_RELEASE.md`,
  `docs/DEMO_PRESENTATION_2026-10-29.md`, `docs/IMPLEMENTATION_MATRIX.md`, esta evidência.

## Validação local

Node v24.19.0; dependências do lockfile via `npm ci --include=optional`.
Comandos executados com umask 022, subprocessos e laboratório próprios:

| Verificação | Resultado / limite |
| --- | --- |
| check:all | PASS; inclui contratos API/Auth/readiness/doctor/recovery/segurança e novas regressões |
| build | PASS, também executado dentro de deploy:check |
| check:security / check:governance / check:supply-chain | PASS individualmente e no gate completo |
| audit:ci | PASS, 0 vulnerabilidades |
| check:demo-parity | PASS: 31 capacidades estáticas, 16 mutações históricas e builds reais 31 rotas / 37 JS/CSS idênticos |
| test-demo-hosted-readiness | PASS com transporte sintético e atribuição futura somente na cópia temporária do módulo; não altera topology operacional |
| test:database | PASS PostgreSQL 17.6 isolado porta 55471: clean install, upgrade/reaplicação/rollback, RLS, sessões/concorrência, quotas/isolation de workspace e canário |
| Upgrade Pilot | PASS: sequência existente de 38 migrations, marker antigo → financial-decision-authorization-1; interrupção rolled back, fronteira destrutiva recusada sem restore ACK, retomada e histórico preservados |
| Canário SQL | PASS: 6 pessoas sintéticas, 594 verificações, 0 vazamentos na fixture |
| test-recovery-real | PASS: age 1.3.2 verificado, mesmo backup PostgreSQL restaurado; duas referências/objetos e RLS; teardown VERIFIED |
| deploy:check | PASS com `ARANDU_SITE_URL=https://arandu.example.com`, como no CI; listagem 1105 testes E2E, sem executar jornadas do Claude |
| git diff --check / secret exposure | PASS |
| Jornadas E2E/canary com escrita no domínio real | NOT_RUN, sem janela autorizada nem destino canônico |
| Demo canônica local completa / estação de apresentação | NOT_RUN; stack pertence ao Claude |
| Preservação/restore gerenciados | NOT_RUN, sem autorização específica e custódia |

Execuções iniciais: teste com subprocesso restrito não gerou stdout e foi
reexecutado com permissão local apropriada. Primeiro start do laboratório falhou
por socket padrão `/var/run/postgresql` inexistente; corrigido para diretório
próprio. Duas execuções iniciais de deploy:check pararam no requisito de base SEO
(sem domínio próprio, inclusive alias vercel.app); a execução com configuração
sintética do CI passou. Nenhum gate foi enfraquecido. Cluster e container de
ferramentas desta missão foram parados/removidos; temporários de recovery e
paridade tiveram limpeza verificada.

**CI_VALIDATED:** conferir database, deploy-boundaries, validate e presentation
no `head.sha` final da PR. No instante desta coleta, o lote ainda não havia sido
publicado; nenhum resultado da base foi apresentado como CI desta mudança.
O relatório final complementa esta evidência com URLs e resultados efetivos.

## Resultado e próxima execução

M1 implementado e provas locais ampliadas; M2 depende dos quatro gates do HEAD
final. M3/M4 não promovidos. A não atingido; B não comprovado por esta missão;
**C permanece** para a publicação canônica pública observada.

Próxima rodada deve executar a ficha de preservação A, resolver acesso Vercel no
scope correto, preservar/restaurar e reconciliar antes do rollout integral,
provisionar pool/seed sintéticos com autorização, validar candidato canônico e
obter aprovação específica de cutover. Só depois testar jornadas persistidas
comprador/provedor e isolamento no domínio real. Procedimento, configuração
proposta, handoff e rollback: `docs/CANONICAL_HOSTED_DEMO_RELEASE.md`.
