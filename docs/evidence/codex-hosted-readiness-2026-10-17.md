# Operação enterprise e preparação hospedada — 17/10/2026

## Identidade e baseline

Base remota confirmada `e459f901f89a92ab61cc35877e863a0abf8ab932`;
branch `codex/hosted-readiness-integrity-20261017`, worktree exclusiva
`/workspace/arandu-hosted`. #211/#213/#215/#216 são ancestrais da base; #215 e
#216 integradas, somente #177 (Dependabot) aberta na consulta inicial.
Diretrizes e documentos especializados sem alteração normativa desde a rodada
anterior; capítulo 36 v3.4, matriz, manifesto e evidências reconciliados.
Quatro gates e merge-audit SUCCESS na base, sem atribuí-los ao lote novo.
Node 24.19.0; PostgreSQL local 17.6; age 1.3.2. Data da rodada em São Paulo;
metadados de inspeção registrados em UTC (17/10/2026, aproximadamente 23:30Z).

Sem alterações em `finance/**`, E2E, scripts/docs Demo, evidências do Claude,
workflows, package.json ou lockfile. Sem reset, force-push ou banco/container
compartilhado com outro agente. Laboratório próprio
`arandu-codex-hosted-pg`, sem rede externa e sem porta publicada.

## Defeitos e provas antes/depois

| Defeito | Baseline comprovada | Correção e negativos |
| --- | --- | --- |
| P0 decisão após revogação | Sessões independentes: SHARE em fin_decisions deixa passar leituras/autorização e bloqueia INSERT; outra sessão remove o decisor e commita; ao liberar, decisão persistia. Assertion `Decision committed after membership revocation` falhou | BEFORE INSERT revalida ator/papel/entidade e trava membro/grants até commit. Remoção, rebaixamento e perda de escopo recusados sem decisão/evento; ordem inversa faz alteração de membro esperar |
| P0 upgrade parcial | Primeiro arquivo pendente, approval-handoff, não tem transação própria. Na cópia restaurada sintética, erro entre função e marker deixa DDL commitado com marker antigo; novo teste de wrapper falhou na baseline | Gerador envolve arquivos sem transação em upgrades após marker observado; fontes publicadas preservadas. Erro injetado antes do COMMIT deixa função, marker e histórico anteriores intactos; retomada pelo marker real |
| P1 rate limit pouco diagnosticável | Teste 429 falhou: código rate_limited ausente | Código e Retry-After padronizados no limitador do roteador, correlação sanitizada. Contador indisponível/malformado vira 503; limites mantidos, Production/Preview não aceitam bypass por cliente |
| P1 app novo/schema antigo | Novo teste de RPC ausente falhou: 404 PGRST202 bruto, sem schema_incompatible | RPC ausente vira 503 diagnosticável e neutro. Assignments falha fechado, sem nome inventado nem service-role fallback; JWT/anon key preservados |
| P1 custódia de binários | Novo teste falhou: storageEvidence ainda aceitava ciphertext 0644 | Manifesto e binários precisam ser arquivos privados regulares; diretório de binários privado e sem symlink. Hash íntegro não substitui custódia; negativos 0644 e diretório desviado recusados |

A #215 não foi reimplementada: EXECUTE antigo continua revogado, v2 e guarda
de aprovação intactos. Nova migration é aditiva, sem tabela nova ou decisão
reescrita. Função de trigger SECURITY DEFINER com search_path vazio, sem
EXECUTE para PUBLIC/anon/authenticated/service_role, checando auth.uid e
decided_by; não é uma RPC pública. Probes exigem trigger habilitado e grants
efetivos. Rollback compatível retém a segurança; forward-fix preferível.

## Segurança por superfície e concorrência

| Superfície | Prova / limite nesta rodada |
| --- | --- |
| API financeira/Auth | Testes convencionais com transporte simulado; JWT, 401/403, origem, provedor/tenant e redaction preservados. GoTrue real e múltiplas sessões HTTP NOT_RUN |
| PostgREST | SQL de hook/sessão e RLS no harness canônico. HTTP direto no PostgREST/GoTrue real NOT_RUN; configurar authenticator não protege os demais serviços |
| Decisão/aprovação/proposta | Versão esperada, stale, proposta invisível/inexistente, versão imutável, histórico/eventos e corrida proposta × decisão no harness. Nova corrida cobre três revogações e ordem inversa; sem retry, escolha ou aprovação automática |
| Membro/entidade/papel | Membership/grants atuais e locks na decisão; outras regressões cross-tenant/provider/entity, tarefas/offboarding e aprovação existentes mantidas. Sem alegação de serialização universal de qualquer operação administrativa |
| Documentos/Storage | Autorização antes da assinatura e regressão upload × revogação existentes. Novo restore usa bytes reais e fixture HTTP de objetos; permissões dessa fixture NÃO validam Supabase Storage |
| URLs assinadas | Download já emitido é bearer até seu TTL (pede 60 s); remoção não o invalida instantaneamente. Upload tem janela própria. Sem promessa de revogação global |
| Realtime/integrações | Realtime não validado; credenciais de integração têm escopo/expiração/revogação próprios. Nenhuma inferência a partir do hook |

Medição local: 100 chamadas completas de v2 por caminho do ensaio, com inserts,
trigger e rollback de subtransação. Log emite p50/p95/p99; exemplo direcionado
p50 2,556 ms, p95 4,705 ms, p99 6,722 ms. São tempos de servidor em fixture
pequena, cache aquecido e sem tráfego externo; não incluem API/GoTrue/rede e
não sustentam SLA ou capacidade hospedada. Interleavings determinísticos
observam espera por Lock e comparam o contador de deadlocks; não usam sleeps
para decidir a ordem. Não foram adicionados índices ou locks em leituras.

## Upgrade, recuperação e falhas intermediárias

Runbook: `docs/HOSTED_SCHEMA_ROLLOUT.md`. Teste novo usa o manifesto real:
38 migrations desde financial-surface-hardening-1 até
financial-decision-authorization-1. Prefixo cria o Pilot sintético; dump e
restore completos precedem acknowledgement da etapa destrutiva. Sem
acknowledgement, a etapa é recusada e o marker permanece data-governance;
o teste regenera o sufixo e retoma, preservando versões de propostas e
verificando grants/RLS/probes/canário e zero pendências. Não se ignora a
aposentadoria nem se aplica só a última migration.

Recovery ampliado: mesmo dump cifrado + subexport de binários, dois documentos
de tenants distintos, referências/tamanho/hash SQL, age real, HTTP loopback,
releitura de bytes, restore SQL e RLS. Metadados sem binários, artefato ausente,
adulterado e referência quebrada falham. Classes emitidas:
`synthetic_postgresql17_age_same_backup_restore` e
`synthetic_pg17_age_http_object_fixture_same_set`. Sucesso só é emitido após
stop verificado de todos os clusters e remoção dos temporários; falha de
teardown impede VALIDATED.

Inventário de completude:

| Componente | Estado |
| --- | --- |
| Public, roles sem senhas, extensões, grants/RLS, funções/triggers, dados e auditoria SQL | LOCAL_VALIDATED no laboratório; gerenciado exige restore próprio |
| Auth SQL e metadados Storage | LOCAL_VALIDATED como fixture, não compatibilidade GoTrue/OAuth/MFA real |
| Binários sintéticos e referências | LOCAL_VALIDATED com age/HTTP/SQL reais; serviço de objetos é fixture |
| Chaves | Identidades age sintéticas, separadas do ciphertext e removidas no teardown; chaves reais não coletadas |
| OAuth, Auth externo, chaves hospedadas, domínios/endpoints, schedules externos, integrações | NOT_RUN; inventário e preservação real exigem responsável e autorização |
| Recovery Supabase gerenciado completo, RPO/RTO, cutover | BLOCKED / NOT_PROVEN |

Falhas de laboratório não contabilizadas como PASS: tentativa de corrida antes
do bootstrap; término SIGTERM de backend no primeiro ensaio integral (sem
causa atribuída ao produto); preparação com include relativo via stdin; primeira
versão do teste assumia transação inexistente; duas fixtures antigas inseriam
decisão sem declarar ator; saída SET exigiu leitura da linha do resultado no
teste de RLS; cópia de arquivo root 0600 exigiu corrigir ownership para o
usuário postgres. As correções foram no harness/fixtures, sem retirar assertions
ou abrir autorização. Resultados definitivos são os reruns, não essas tentativas.

## Custódia durável e custos

Nenhum serviço contratado ou dado hospedado exportado. Opções já previstas:

| Opção | Requisitos / custo a orçar | Limite |
| --- | --- | --- |
| private-store em executor com volume persistente aprovado | Files/dirs privados, age, chave separada recuperável, fsync, retenção aprovada, ACL, auditoria e teste de perda do host. Custo do volume, snapshots, redundância e operação | Atestar persistência não prova durabilidade do provedor; não usar filesystem de runner efêmero |
| Runner confiável + object store privado durável | Identidade/SHA/destino aprovados, PUT sem sobrescrita, GET/hash, retenção/lifecycle/hold, acesso mínimo, auditoria, key recovery e teste de restore. Custo = GB-mês retidos + requests + transferência + KMS/operação aplicáveis | Adapter S3 atual cobre dump/roles/manifesto; não transfere automaticamente subexport Storage/configuração. Não tratar essa transferência isolada como conjunto completo |
| Backup/PITR do provedor como complemento | Verificar plano, retenção, região, custo de restore e cobertura real com o owner | Não substitui binários/configuração externa nem prova restauração do conjunto preservado |

Dimensionar com tamanho cifrado medido e retenção escolhida: por exemplo,
quatro conjuntos completos de 20 GB representam até 80 GB retidos antes de
dedupe/versionamento; aplicar tarifas verificadas do destino aprovado, sem
supor preço ou contratar. Chaves fora do mesmo domínio de falha, acesso
auditável, retenção/hold coerentes e teste do mesmo conjunto são mínimos.

## Estado hospedado e intervenção mínima

Inspeção read-only reconfirmou dois projetos ACTIVE_HEALTHY: Pilot
offgpyysgdhfemjlchod (PG17.6.1.166) e histórico igacnfjeuqhxcmfyepgj
(PG17.6.1.155). Pilot permanece surface-hardening-1, sem marker de ambiente,
sem v2/buyer_names/session guard/hook e com EXECUTE authenticated na RPC antiga.
Catálogos: 33 tabelas financeiras com RLS habilitada e forçada, auth.sessions
presente, guards de aprovação/decisão ausentes; hook ausente tanto em rolconfig
quanto em pg_db_role_setting do authenticator. Extensões observadas:
pgcrypto 1.3, uuid-ossp 1.1, plpgsql 1.0, pg_stat_statements 1.11 e
supabase_vault 0.3.1. Não se presume configuração a partir da existência delas.
Histórico não tem public.fin_settings; schemas Auth e Storage existem. Isso é
verificação de metadados, não HOSTED_VALIDATED dos fluxos.

GitHub na base e459f90: Demo/Pilot SUCCESS, Official FAILURE. Detalhe do
deployment oficial 4m9K28Vjje1EFrAkq9cxJNXaj1it recusado em
GET /v13/deployments/{idOrUrl}, HTTP403, scope lucas-projects467. CLI Vercel
autenticado não disponível. Não repetido com credenciais inalteradas nem
outro scope. Node/build override, logs efetivos e causa do erro oficial não
foram inferidos a partir do build local. Intervenção mínima: leitura autorizada
do mesmo projeto/scope e logs desse deployment; não é solicitação de segredo.

Para M3 faltam inventário/classificação aprovados, destino durável completo,
preservação/restore reais autorizados, aprovação do rollout de schema/config,
Supabase Demo próprio com Auth/Storage, identidade/SHA/schema efetivos,
doctor/readiness/canário e jornadas hospedadas comprador/provedor/visitantes.
Assignments/topologia, secrets, Auth/Storage, aliases e bancos hospedados não
foram alterados. Demo/Production continuam os dois ambientes permanentes;
Pilot não foi convertido, histórico não foi atribuído à Production.

## Entrega e verificação

IMPLEMENTED: guarda, bundle atômico, contratos de erro e custódia.
LOCAL_VALIDATED: testes direcionados, upgrade completo, recovery ampliado,
check:all, build/deploy:check e audit:ci (zero vulnerabilidades).
Harness canônico `scripts/test-database.sh` integral PASS nativo no container
PG17.6 exclusivo: clean, upgrade, reapply, rollback, RLS, invariantes e corridas;
upgrade do marker Pilot também PASS. `deploy:check` listou 1.020 casos E2E;
listagem não foi execução de navegador. Recovery ampliado PASS com teardown
VERIFIED. Negativo operacional com shim de pg_ctl (para o cluster de verdade e
reporta falha na parada) saiu 1 e não emitiu nenhum resultado VALIDATED.
CI_VALIDATED: somente os quatro gates do HEAD final registrados na PR, sem
herdar os da base. HOSTED_VALIDATED: nenhum novo fluxo de produto.
BLOCKED: detalhes Vercel, recovery/rollout real e M3. NOT_RUN: browser local,
GoTrue/PostgREST/Storage gerenciados e latência hospedada.

Contrato consumível pelo Claude:
`docs/evidence/codex-hosted-api-handoff-2026-10-17.md`.
Arquivos alterados e HEAD final: diff/commit da PR; resultado dos gates,
merge:gates e URL registrados nela. Sem merge automático e sem push posterior
à verificação final de gates.
