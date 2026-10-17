# Consolidação de integridade enterprise — 17/10/2026

## Trabalho recuperado e identidade

Worktree `/workspace/arandu-integrity`, branch
`codex/enterprise-integrity-m3-20261017`, base remota
`605c7f5a9ff619e18fec6f1e7160949d878f345a`. Nenhum commit local anterior perdido;
o arquivo exploratório `approval-membership-race.mjs` foi preservado, corrigido
e integrado à suíte. O erro inicial era `psql -c` recebendo `\set ON_ERROR_STOP`;
não foi observado bloqueio de segurança da plataforma nesse erro. Nenhum reset,
clean ou descarte de alterações. Node 24.19.0; lockfile inalterado.

Diretrizes, boundaries e deployment comparados com a rodada anterior: sem
alterações normativas; matriz, evidências #211/#213 e handoff #214 reconciliados.
Quatro gates e merge audit SUCCESS observados na base. Só #177 (Dependabot)
estava aberta na leitura inicial. Não se herda o CI da base para este novo lote.

## Defeitos reproduzidos

| Item | Baseline e negativo | Correção |
| --- | --- | --- |
| P0 — RPC antiga contorna a versão vista | Banco descartável: depois de v1→v2, authenticated chamou `fin_record_decision` sem versão esperada e o snapshot registrou silenciosamente `2`. Novo teste falhou `unversioned decision entry point still exposed` | REVOKE de PUBLIC/anon/authenticated/service_role; implementação permanece interna e v2 continua executável. Nenhuma decisão reescrita |
| P0 — voto após remoção | Sessões independentes: RPC verifica papel, espera a etapa travada; terceira sessão remove membro e commita; etapa é liberada. Baseline gravou aprovação: `Approval committed after membership revocation` | Guarda BEFORE UPDATE reconfere membro/entidade/policy na escrita, trava vínculo e grants até commit. Ordem inversa faz remoção esperar. Sem voto/evento parcial |
| P1 — comprador não identificado no portal | Teste novo da API executado com `finance.mjs` da base falhou: `buyer_name` ausente | Nome aditivo por RPC limitada a convite aceito/proposta do próprio provedor, sempre JWT do chamador, sem ampliar RLS de organizações |
| P2 — diagnóstico ambíguo | Doctor não distinguia ausência de configuração de HTTP 401/403/503; negativo novo falhou na baseline | Detalhes explícitos NOT_CONFIGURED, ACCESS_BLOCKED, SERVICE_FAILURE e CONNECTION_FAILED, sem corpo do erro ou credencial |

Migration única aditiva, sem tabelas novas: manifesto, ordem, rollback,
doctor, bundle, canário e probes atualizados. Probes exigem grants efetivos,
v2 e trigger instalado, não apenas marker. Nenhuma classificação nova de dados
necessária: nomes vêm de fin_organizations, já classificada.

## Validação por superfície de sessão e autorização

| Superfície | Garantia/limite | Evidência desta sessão |
| --- | --- | --- |
| API própria | Cookie assinado; resolve identidade via GoTrue; logout exige confirmação de `scope=global`; banco verifica vínculo/papel/entidade | IMPLEMENTED previamente; testes convencionais de Auth/API em check:all LOCAL_VALIDATED. Login/logout HTTP com GoTrue real NOT_RUN nesta rodada |
| PostgREST/Data API | Hook `fin_request_session_guard` consulta sessão viva por session_id assinado; precisa estar instalado no authenticator | Função com sessão viva, inexistente, not_after vencido e bypass previsto de anon/service_role: SQL LOCAL_VALIDATED. HTTP direto com GoTrue/PostgREST real NOT_RUN; smoke existente não foi contabilizado como nova execução |
| Revogação de membro/papel/entidade | RLS exige vínculo atual; guarda de voto fecha a janela check→lock→write. Escopo/policy continua autoritativo | SQL/RLS, outros tenants/provedores, membro removido, corridas de voto e atribuição de tarefa LOCAL_VALIDATED |
| Auth | Sessões locais/globais e exclusão são responsabilidades do GoTrue; hook SQL não revoga Auth | Contratos de código/testes convencionais; múltiplas sessões HTTP, logout local/global e MFA reais NOT_RUN nesta rodada |
| Storage | API autoriza documento antes de service role; bucket privado; usuário não recebe chave de serviço | Testes de API/SQL e corrida de finalização × revogação LOCAL_VALIDATED. Binários/Storage HTTP real após remoção NOT_RUN |
| URL assinada emitida | Link é bearer até expirar: download pede 60 s. Remoção não revoga instantaneamente link já emitido. Upload tem TTL próprio do Storage e janela do banco de 600 s | Contrato e testes de assinatura existentes LOCAL_VALIDATED; revogação global de URLs NÃO GARANTIDA |
| Realtime | Não identificado consumidor no runtime financeiro revisado | NOT_RUN / não há promessa de revogação por essa superfície |
| Integrações | Credencial de máquina tem expiração/revogação/escopo próprios; não equivale à sessão humana | SQL de Public API/offboarding e testes de API LOCAL_VALIDATED; integração externa real NOT_RUN |

Não se declara revogação global de todas as superfícies. Leitor indicado no
fluxo de aprovação legado tem permissão para votar; a guarda não confunde esse
contrato com permissão para criar RFQ ou alterar tarefas.

## Execução local e falhas de laboratório

- npm ci com Node 24 e lockfile: PASS.
- check:all, build e audit:ci: PASS; auditoria com zero vulnerabilidades.
- deploy:check: PASS, incluindo check:all hermético, build, orçamento, assets,
  superfície/navegação, SEO e listagem de 990 casos E2E (não execução do browser).
  Usada URL sintética apenas na checagem SEO. A verificação final identificou
  uma mensagem exclusiva da guarda de migration na cobertura de traduções;
  ela foi classificada explicitamente como interna e a suíte inteira repetida.
- Script canônico `scripts/test-database.sh`: PASS integral em PostgreSQL 17.6
  descartável, container exclusivo sem rede externa e sem porta publicada.
  Clean install, upgrade, rollback compatível/reapply, RLS, versão obsoleta,
  proposta invisível/inexistente, histórico e corridas independentes passaram.
- Novos testes de grants/nomes e corrida de aprovação passaram nos caminhos
  upgrade e fresh; corrida de proposta × decisão, upload × revogação e tarefas
  × membership continuam passando. Nenhuma assertion removida.
- Cinco suítes históricas usam helper temporário invoker somente no teste:
  antes da criação da v2 usam a interface histórica; no schema final usam v2
  com a versão da fixture sintética. A produção não recebe esse helper. Testes
  explícitos de stale version continuam inalterados, e a RPC antiga é negada.
- Tentativa inicial via adapter Docker/psql consumiu o stdin do loop de arquivos
  e pulou migrations; foi corrigido o adapter de laboratório. Outra tentativa
  coincidiu com a reinicialização dos bancos descartáveis e foi interrompida.
  Um timeout do adapter afetou o primeiro rerun da corrida. Nada disso foi PASS.
  A execução definitiva rodou o harness e os clientes nativos dentro do
  container, serialmente, com resultado integral aprovado.
- Probes adicionais de grants/trigger executados no schema final: PASS.
- CI no HEAD final será registrado na PR, sem push intermediário para disparar
  jobs pagos. Browser local NOT_RUN; nenhum E2E ou frontend foi modificado.

## Recovery

Teste real existente `scripts/test-recovery-real.mjs`: LOCAL_VALIDATED em
PostgreSQL 17.6 + age 1.3.2, usuário postgres, clusters separados de origem e
destino, export cifrado, restore do mesmo backup, roles, RLS, conteúdo/catálogos
e hashes reconciliados. Negativos de adulteração, identidade, permissões,
symlink e registro pertencente a outro export passaram; cleanup do próprio
teste removeu clusters, chaves e dumps.

Classificação emitida: `synthetic_postgresql17_age_same_backup_restore`,
VALIDATED. Não é recovery completo de Supabase: Auth/OAuth externo, MFA,
binários de Storage e configuração essencial hospedada continuam NOT_RUN/
NOT_PROVEN. Testes de Storage/manifestos/custódia em check:all usam transportes
simulados. Não foi inferida preservação completa, nem RPO/RTO. Nenhum export
ou transferência de dados hospedados foi executado.

## Ambientes e M3

Read-only no Pilot `offgpyysgdhfemjlchod`: marker
`financial-surface-hardening-1`, deployment_environment ausente,
fin_record_decision_v2 ausente, fin_current_session_alive ausente e configuração
db_pre_request ausente. VERIFIED somente para esses metadados; operação
hospedada, revogação HTTP e M3 continuam BLOCKED/NOT_PROVEN.

GitHub na base: Demo/Pilot deployment SUCCESS e Official FAILURE. Leitura
detalhada Vercel continua ACCESS_BLOCKED pelo 403 já observado no scope
lucas-projects467 (GET /v13/deployments/{id}); não houve nova tentativa com as
mesmas credenciais nem escopo alternativo. Causa efetiva do erro oficial segue
inconclusiva; testes de deploy positivos/negativos locais não a comprovam.

Assignments ativos, segredos, Auth, Storage e bancos hospedados não alterados.
Preparação M3 exige schema e configuração efetivos, identidade/SHA, Auth/API,
RLS/Storage, visitantes isolados, canário, observabilidade e recovery aplicável;
READY ou HTTP 200 isolado não libera M3. Doctor agora distingue acesso bloqueado
de configuração ausente/falha de serviço e espera o novo marker.

## Rollout, riscos e próximos passos

Contrato completo: `codex-integrity-api-handoff-2026-10-17.md`. Schema antes do
app; app anterior já usa v2 e é compatível. Sem a nova RPC, o app novo pode
recusar assignments, por isso não publicar aplicação em schema antigo.
Rollback SQL mantém as duas correções de segurança e remove só a extensão
de nomes; rollback de código não reabre a RPC antiga. Preferir forward-fix.

Handoff H-2/429: limites legítimos conservados. Perfil local não introduzido
sem um atestado de runtime local distinto de variáveis herdáveis; não há bypass
via cliente. Nenhum loop novo foi demonstrado no backend. Latência p95/p99 das
autorizações e stack completo Auth/Storage não foram medidos nesta rodada.

Operador: obter leitura Vercel no mesmo scope, classificar/preservar a origem,
provar restore completo do mesmo conjunto custodiado, aprovar rollout e
configuração, executar probes HTTP e jornada no SHA/schema reais. Não há
migration, reset, segredo, cutover ou merge hospedado automático nesta missão.
