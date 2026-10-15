# Codex Foundation — 15/10/2026

Estado desta trilha: implementação e validação local; CI do HEAD final a verificar na PR. Nenhuma evidência local representa validação hospedada ou autorização de cutover.

## Baseline, escopo e isolamento

- `origin/main` confirmado por `git fetch origin main`: `57afa792dfad6fcf4df6f2f5e197f40342b9697d` (merge #195). PRs #190/#191/#193/#194/#195 consideradas; não reimplementadas.
- Coordenador: `/workspace/Arandu-codex`, branch `codex/foundation-20261015`; três especialistas com worktrees filhas próprias e arquivos exclusivos; integração por cherry-pick.
- Worktree original `/workspace/Arandu` preservada. Nenhum checkout, commit ou edição de arquivo nessa árvore. Guideline, Implementation Matrix, frontend, Demo e demais arquivos exclusivos do Claude preservados.
- Normas: `CLAUDE.md`, `CONTRIBUTING.md`, Guideline v3.4 (especialmente §§5/18/23/25/26/34/36), Implementation Matrix, boundaries, security, data governance, operational resilience, Stage 0, QA adversarial, preservação cifrada, consolidação e deployment workflow.
- Nenhum Supabase/Vercel hospedado acessado ou alterado; nenhum export real, migration hospedada, restore remoto, seed/reset/cutover ou infraestrutura paga. GitHub usado somente para Git/PR/CI autorizados.

## Preflight na baseline exata

| Verificação | Estado | Evidência e limite |
| --- | --- | --- |
| Worktree exclusiva limpa | PASS | `git status --short` vazio antes de alterações; branch própria na ponta confirmada |
| Node.js | PASS | `v24.19.0`; Node 24 já alinhado pelas entregas anteriores |
| `npm ci --include=optional` | PASS | Reexecutado com `--cache /tmp/arandu-npm-cache`; primeira tentativa BLOCKED por cache padrão fora da área gravável |
| `npm run audit:ci` | PASS | Zero vulnerabilidades; cache local em `/tmp` |
| `npm run check:all` | PASS | Execução integral exit 0 após configurar somente executor: permissão para fixtures no homedir e `umask 0022` |
| `npm run build` | PASS | Exit 0; sem alterar budgets |
| `npm run test:e2e:list` | PASS | 750 casos listados em 20 arquivos; listagem não significa execução browser |
| `npm run test:database` | PASS | PostgreSQL 17.11 local descartável, porta 55430; clean/upgrade/reapply/rollback/RLS/corridas/canário (9.785 verificações, zero vazamentos) |
| Recovery estático/sintético de contratos | PASS | Suítes de `check:staging` dentro de `check:all`; não são backup real |
| Recovery hospedado / migrations hospedadas | NOT RUN | Expressamente fora da autorização desta missão |

Limitações ambientais iniciais separadas de defeitos: `psql` ausente; cache npm/homedir protegidos; `umask 0077` transformava fixture deliberadamente 0644 em 0600 e invalidava o negativo. Não se mudou código para mascarar isso. PostgreSQL 17.11 Debian foi extraído em `/tmp/arandu-tools`; age 1.3.2 com SHA-256 fixado pelo instalador do repositório foi verificado e extraído no mesmo local. Bancos/identidades sintéticos, sem credencial hospedada. O cluster do coordenador não é armazenamento de backup durável.

## Problemas confirmados e correções

### AUTH-1 — logout global não confirmado (P1)

Antes, timeout/5xx do Supabase Auth era engolido: a API devolvia 200/`ok:true` e apagava o cookie apesar de não revogar a sessão upstream. Reproduzido com cookie assinado sintético; teste novo recebeu 200 onde exigia 503 antes da correção.

Agora o escopo global é explícito (`logout?scope=global`). Timeout, 5xx, token expirado/rejeitado e Auth desconfigurado devolvem `503 auth_logout_unconfirmed`, mensagem fixa e cookie local apagado. `session_not_found` não é usado como prova de encerramento de outras sessões. Nenhum refresh automático durante logout. Sem cookie reconhecido, saída local continua idempotente.

Arquivos: `lib/api/domains/auth.mjs`, `scripts/test-auth-api.mjs`. Testes cobrem timeout/rede/500/403/401, configuração ausente, redação de dados upstream e ausência de chamadas extras. Revogação efetiva depende do Auth; não se estende automaticamente a Storage, Realtime ou URLs assinadas. Perda/rotação da chave de assinatura torna cookie antigo irreconhecível, sem prova de revogação global.

Operação: em resposta não confirmada, reautenticar para tentar revogação global ou usar procedimento administrativo autorizado; limpar cookie não encerra token capturado. O frontend `finance/src/shell.js` atualmente ignora o status do logout; comunicar essa pendência à trilha do Claude, sem editar sua superfície.

### REC-1 — completude baseada em contagem anterior ao snapshot (P0 no verificador)

A contagem de objetos Storage vinha de probe anterior ao snapshot do dump. Um objeto inserido no intervalo entrava no dump, mas contagem anterior zero podia classificar banco restaurado como `COMPLETE` sem binários. Reprodução sintética do manifesto inconsistente confirmou aceitação na base.

Correção: contagem autoritativa do próprio snapshot do `pg_dump`, consistência obrigatória no verificador e inventário de buckets/objetos capturado no mesmo snapshot. Os nomes de objetos não são publicados; somente digest e contagens vão ao manifesto.

### REC-2 — Storage de outra origem/conjunto e prova incompleta de autorização (alta)

O verificador aceitava export Storage pela quantidade, sem conferir projeto/classificação/conjunto; sondas podiam aceitar apenas público/anônimo após erro silencioso no subprocesso de membros. Registro declarando `DENIED_AS_EXPECTED` sem checks era aceito. `verify` não falhava quando os binários coincidiam mas permissões estavam expostas.

Correção: vínculo por projeto, classificação sintética/real e digest do inventário do snapshot; consultas de membros falham fechadas; prova exige sondas explícitas e cobertura de outra organização quando aplicável; status de timeout/rate limit/erro genérico não comprova negação; `verify` também falha em exposição ou resultado inconclusivo. Exports antigos com objetos sem novo vínculo não elevam recovery completo e exigem novo export autorizado. Ausência de membro restaurado não fabrica evidência autenticada.

Arquivos da trilha recovery: `lib/storage-recovery.mjs`, `scripts/storage-recovery.mjs`, `scripts/recovery.mjs`, `scripts/consolidation-export.mjs` e suas suítes. O negativo RLS do ensaio real exige processo executado, ausência de sinal, exit 3 do `psql` e erro RLS; erro de execução/conexão não comprova recusa. O ensaio real PostgreSQL 17.11 + age 1.3.2 passou novamente na árvore integrada. Uma tentativa integrada anterior foi BLOCKED por colisão da porta 55433 com o cluster do especialista; após mover esse cluster para 55434, a repetição passou sem alteração de código.

### CI-1 — redação insuficiente de e-mail e teardown falso sucesso (média)

A exceção de domínios sintéticos preservava endereços reais contendo `.example` no meio do domínio. Teste novo falhou na base com `pessoa@tenant.example.com`. Agora só o sufixo final `.example` é preservado.

`pilot-local/down.sh` ignorava falha do Compose e apagava estado/chaves; também encerrava processos de todas as worktrees por padrão textual amplo. Agora erro do Docker/consulta ou container, volume ou rede residual fazem falhar e preservam `.state`; processos são restritos por argv/cwd à worktree. Regressão de Compose exit 7 falhou na base e passa corrigida. Testes usam CLI Docker simulada e diretório isolado; nenhum teardown de outra stack foi executado.

Arquivos: `scripts/ci-demo/sanitize.mjs`, `scripts/pilot-local/down.sh`, `scripts/test-ci-demo.mjs` (16 casos nesta etapa). Sem novo job caro obrigatório, remoção de check, alteração de navegador/budget, retry para verde ou mudança de Node/dependências.

### CI-2 — evidência de restore apesar de falha de cleanup (média/alta)

A função `cleanup` do `scripts/pilot-restore-drill.sh` ignorava `docker rm` malsucedido; o relatório PASS era escrito antes do trap. Reprodução com Docker simulado retornando exit 7 terminou em exit 0 na base. Agora o relatório nasce `pending_cleanup` e somente é promovido a `passed` depois de limpar Docker e arquivos temporários. Falha de remoção, consulta ou recurso residual invalida o relatório e preserva estado. UUID/label/nome exato e remoção por ID evitam apagar container alheio por colisão de PID. `KEEP=1` explícito registra `cleanup: retained`. O trap existe antes dos wrappers/preflight. Dez cenários com função real e Docker simulado cobrem sucesso, erro rm/consulta, residual, recurso estrangeiro, falha de arquivos, KEEP, falha prévia e falha antes do preflight; suíte CI-demo 17/17 PASS. Sem ensaio Docker real nesta sessão.

### AUTH-2 — conclusão privilegiada de upload após revogação (P1)

Confirmado em PostgreSQL descartável com transação desfeita: reservar PDF como membro, remover `fin_members`, observar `fin_has_role=false` e `fin_can_read_document=false`, mas consultar reserva ainda retornava caminho. Finalização service role sem `auth.uid()` publicava versão, incrementava `current_version` e gravava evento. Migration aditiva `docs/supabase-financial-document-upload-authorization.sql` (`financial-document-upload-authorization-1`): helper privado resolve autorização do autor gravado em `uploaded_by`, sem aceitar ator da API nem reescrever claims. Exige papel de escrita, escopo atual e documento não removido. Locks membro → objeto/entidade → concessão → documento → versão serializam revogação e publicação. RPCs preservam assinaturas; API anterior é compatível. O helper não é executável por `anon`, `authenticated` ou `service_role` diretamente.

Testes SQL cobrem membro removido, viewer, escopo revogado, documento removido, provider, caminho legítimo e replay sem evento duplicado. A regressão falhou na base (`removed member retained pending upload access`) e passou corrigida. Corrida determinística com duas sessões reais e espera observada em `pg_stat_activity`: revogação primeiro → publicação recusada sem versão/evento; publicação primeiro → remoção aguarda commit. O harness possui prazos e exige erro SQL real (exit 3), sem usar falha de subprocesso como prova de autorização.

Manifesto, ordenação, rollback/reaplicação, schema esperado do doctor/preflight/canário e probes foram atualizados. Suíte completa passou na worktree do especialista em PostgreSQL 17.11; probe negativo detectou helper indevidamente concedido a `authenticated`. Sem nova tabela: classificação/retenção/source of truth permanecem os de documentos financeiros existentes.

Rollout futuro: após autorização e recovery aplicável, migration primeiro, probes e doctor no schema novo, depois deploy da aplicação/doctor compatível. Rollback em `docs/rollback/supabase-financial-document-upload-authorization.rollback.sql` apenas restaura funções/marker, sem apagar dados, mas reabre a vulnerabilidade; preferir forward-fix. Nenhuma migration foi aplicada fora dos bancos descartáveis.

## Validação do lote integrado

Árvore de código validada localmente: `e34b6bf7d4275b6ebb013d5d3e990431daa26958`; o commit documental seguinte só acrescenta este relatório. CI deve verificar o HEAD completo da PR, sem herdar o resultado local.

| Verificação final integrada | Estado | Resultado |
| --- | --- | --- |
| `npm run check:all` | PASS | Exit 0; `umask 0022` e permissão para fixtures privadas; inclui contratos Auth, 17 testes CI-demo, segurança, migrations, governança e recovery |
| `npm run build` | PASS | Exit 0 |
| `npm run check:build-size` / `check:dist-assets` | PASS | Sem alteração de budgets; JS 478.627/800.000 bytes; aviso preexistente de rota RFQ 231.501/250.000 (93%) |
| `npm run test:e2e:list` | PASS | 750 casos/20 arquivos; não é execução de navegador |
| `npm run test:database` | PASS | PostgreSQL 17.11 loopback descartável; suíte integral no código integrado, nova migration clean/upgrade/rollback/reapply, autorização e corrida nas duas ordens |
| `scripts/test-recovery-real.mjs` | PASS | PostgreSQL 17.11 + age 1.3.2; export cifrado e restore do mesmo backup sintético em três clusters próprios, reconciliação e negativos |
| Contratos de API/backend/segurança e CI-demo direcionados | PASS | Executados após integração das respectivas correções; novamente cobertos por `check:all` final |
| `git diff --check` / isolamento de arquivos | PASS | Sem erro de whitespace; nenhum arquivo vedado alterado; worktree original limpa |
| Quatro gates GitHub no HEAD final | NOT RUN neste registro | Verificar na PR com `npm run merge:gates -- <PR>`; manter draft enquanto pendente/falhando |
| Auth/Storage Docker integrado + matriz browser completa local | NOT RUN | Transportes de Storage e cleanup testados com falhas simuladas; banco real não comprova serviços Supabase |
| Ambiente hospedado/recovery real/cutover | NOT RUN | Nenhuma autorização usada para operar esses alvos |

Logs locais sanitizados de execução em `/tmp/arandu-final-*.log` e `/tmp/arandu-integrated-recovery-real-final.log` são efêmeros, não backup nem artefatos duráveis. Descrição/status da PR preservam evidência de CI no SHA exato. O relatório no repositório preserva procedimentos, contratos e limites; não publica dumps, identidades, tokens ou conteúdo financeiro.

## Impacto, rollback e limites

- Nenhuma tabela nova ou classe de dado nova criada; documentos financeiros continuam privados e sob a governança existente. Testes usam identidades e dados sintéticos.
- Mudanças de contratos operacionais tornam falhas visíveis e recusam provas insuficientes; podem exigir nova captura autorizada de export e reautenticação no logout não confirmado.
- Revert de código não reverte banco nem recupera dados; migration terá rollback próprio. Reabrir falhas de autorização não é recuperação segura; preferir forward-fix.
- Classificação P0 de REC-1 refere-se ao risco de decisão operacional equivocada do verificador, sem alegação de perda de Production ou exploração observada.
- Restore local e contagens/digests não provam configuração externa OAuth/SMTP/Vault/cron, conteúdo completo de ambientes gerenciados, MFA, RPO/RTO, hospedagem ou prontidão comercial.

## Riscos residuais e intervenção externa mínima

1. Recovery real dos dois slots, classificação de PII/cliente, destino privado durável/custódia, restore do mesmo export em Supabase compatível e reconciliação/configuração externa continuam pendentes. Necessários autorização explícita, identidade exata dos alvos e credenciais fora do chat/repo; nenhuma operação executada nesta missão.
2. Migration de autorização e demais migrations não aplicadas no hospedado. Após recovery e aprovação, aplicar bundle exato, probes, doctor/canário/jornada no release/ambiente correto. Não ativar allowlists antes disso.
3. URLs assinadas já emitidas permanecem bearer até expiração; PostgREST guard não as revoga. Realtime/Auth/Storage exigem provas por superfície.
4. Oráculo de UUID em RPCs legadas mantém classificação P3 aceita em Stage 0; não se reescreveram dezenas de funções por conjectura.
5. UI do logout requer coordenação com Claude para apresentar revogação não confirmada. Sem edição de frontend nesta trilha.
6. O drill Supabase legado usa dumps separados; igualdade de probes não prova snapshot transacional global. O export cifrado canônico usa snapshot compartilhado e o binding novo. Não confundir os contratos.
7. Docker integrado com Auth/Storage reais e matriz browser completa nesta sessão: NOT RUN até registro contrário; os testes PostgreSQL e transportes sintéticos não os substituem.

Proposta de maturidade: M1/LOCAL_VALIDATED para as correções com os testes finais aprovados; M2 somente se os quatro gates `database`, `deploy-boundaries`, `validate`, `presentation` passarem no HEAD exato e a base atual estiver contida. M3/M4/M5/M6 não reivindicados. A Implementation Matrix será consolidada na integração, conforme divisão de propriedade; não foi editada.

## Arquivos alterados nesta trilha

- `docs/evidence/codex-foundation-2026-10-15.md`
- `docs/rollback/supabase-financial-document-upload-authorization.rollback.sql`
- `docs/supabase-financial-document-upload-authorization.sql`
- `docs/supabase-migrations.json`
- `lib/api/domains/auth.mjs`
- `lib/finance/pilot-doctor.mjs`
- `lib/pilot-backup-preflight.mjs`
- `lib/storage-recovery.mjs`
- `ops/sql/pilot-isolation-canary.sql`
- `ops/sql/post-migration-probes.sql`
- `scripts/check-migrations.mjs`
- `scripts/ci-demo/sanitize.mjs`
- `scripts/consolidation-export.mjs`
- `scripts/pilot-local/down.sh`
- `scripts/pilot-restore-drill.sh`
- `scripts/recovery.mjs`
- `scripts/storage-recovery.mjs`
- `scripts/test-auth-api.mjs`
- `scripts/test-ci-demo.mjs`
- `scripts/test-consolidation-export.mjs`
- `scripts/test-database.sh`
- `scripts/test-pending-migration-bundle.mjs`
- `scripts/test-pilot-backup-preflight.mjs`
- `scripts/test-recovery-real.mjs`
- `scripts/test-storage-recovery.mjs`
- `tests/database/document-upload-authorization-race.mjs`
- `tests/database/financial-contract-onboarding.sql`
- `tests/database/financial-document-upload-authorization.sql`
- `tests/database/financial-final-hardening.sql`
- `tests/database/financial-p0-closure.sql`
- `tests/database/financial-renewal-cycles.sql`
- `tests/database/financial-security-closure.sql`
- `tests/database/financial-surface-hardening.sql`
