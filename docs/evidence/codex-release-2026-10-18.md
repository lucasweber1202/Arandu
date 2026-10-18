# Release engineering — 18/10/2026

Base efetiva `c359cb97b0b943ebab91cf7d6e0da7c696af2a69`; branch exclusiva
`codex/release-engineering-20261018`. Código e runbook em
`4a70697051d34fa4da0991449dc1e8195e7db02d`. JSON reproduzível e hashes dos logs
locais: `codex-release-2026-10-18-results.json`. O commit documental posterior
não se autoatesta: SHA final e quatro gates próprios devem ser conferidos na
PR. Nenhum merge automático, mudança de assignments, migration, secret, export,
reset ou cutover hospedado. Frontend/E2E/Compose/.state do Claude preservados.

## Reconciliação

Fetch real atualizou o checkout de fa551c0 para c359cb9; #215–#220 confirmadas
por `git merge-base --is-ancestor` de cada merge commit. Nenhuma PR aberta na
leitura inicial. CI main `39142323671`: database, deploy-boundaries, validate e
presentation SUCCESS no SHA c359cb9; merge audit `39142323682` SUCCESS. A falha
anterior da PR #220 foi sucedida por seu run verde; não foi herdada como falha
atual, nem seu verde como prova desta branch.

GitHub deploy status na base: Demo e Pilot success, Official failure.
Vercel GET arandu-demo no scope lucas-projects467: HTTP 403 ACCESS_BLOCKED;
CLI Vercel não disponível, sem troca de scope. A listagem Supabase identificou
somente Pilot e legado (PG17.6); ambos ACTIVE_HEALTHY não comprova M3.
Consulta SQL read-only do Pilot confirmou marker surface-hardening, sem
fin_record_decision_v2, sem fin_assignment_buyer_names e zero trigger
fin_decisions_live_actor. Probes públicos de alias foram inconclusivos por
transporte; nenhum vínculo novo de deployment/datasource foi presumido.

| Domínio | Código atual | Evidência válida | Defeito ou bloqueio | Gravidade | Correção permitida |
| --- | --- | --- | --- | --- | --- |
| Release/CI | quatro gates, candidato v3 e ensaio existente | baseline CI exato; regressões e deploy check locais | candidato não exigia prova própria de readiness; A/B ainda não comprovados no código desta PR | P1 | prova hosted_readiness obrigatória, sem relaxar gates |
| API/Auth | cookie assinado, sessão vigente, RBAC/RLS e doctor | suites de Auth/API e banco existentes executadas | health 200 e probes diretos do operador não comprovavam dependências do deploy | P1 | doctor consulta readiness publicada e identidade; outcomes/codes aditivos |
| Database/RLS | decisão v2, locks, guardas e manifesto | clean/upgrade/reapply/rollback/concorrência; 594 verificações do canário sem vazamentos | Pilot atrasado 38 migrations; marker sozinho não prova grants/hooks | P0 para operar nesse schema | leitura de schema/catálogo na readiness; rollout/recovery preparados, aplicação não autorizada |
| Storage | privado; export/restore com índice cifrado | dois objetos de dois tenants, referências/RLS, negativos | download sem limite real, todos ciphertexts na RAM; paths/duplicatas ambíguos | P1 | stream limitado, cancelamento, escrita por objeto, inventário/índice estritos |
| Recovery | snapshot compartilhado, hashes, age, readback | mesmo conjunto restaurado; teardown VERIFIED | manifesto de transferência podia seguir symlink e sobrescrever outro arquivo; ownership/hardlink insuficientes | P1 | O_NOFOLLOW + descriptor verificado antes de truncar, ownership, diretório privado, hardlink recusado |
| Demo/Production | assignments continuam vazios; Pilot transitório | guardas e leitura read-only real | Demo canônica hospedada, recuperação gerenciada e estação 29/10 não comprovadas | P0 para A | runbook com A/B/C; sem fabricar READY |
| Observabilidade | request IDs, erros sanitizados, doctor | suites de observabilidade/API; estados estruturados | live checker classificava metadado público previsto como vazamento e não exigia SHA/readiness | P1 | allowlist estrita, comparação SHA/ambiente, leitura limitada e erro sem mensagem upstream |

## Antes / depois comprovados

- **Readiness:** baseline aceitava REST 401 e sandbox como pronto, sem ler
  schema. Agora exige configuração, atribuição, main/SHA, Auth/settings,
  catálogo versionado, marker e bucket privado; responde 503 em falha ou
  inconclusão. Cache considera valores de configuração, não identidade do
  objeto mutável. Resposta pública conserva somente projeção segura.
- **Doctor e candidato:** antes, API viva/datasource direto/READY podiam
  compor uma prova declarada sem readiness do app. Agora doctor compara
  identidade das duas sondas; candidato v3 exige hosted_readiness recente no
  SHA/schema/ref com todos os componentes PASS. NOT_RUN, BLOCKED,
  ACCESS_BLOCKED, INCONCLUSIVE ou falha adicional recusam GO.
- **Download:** baseline aceitou quatro bytes para inventário de três; agora
  excesso sem Content-Length é cancelado durante streaming, truncamento e
  erro de corpo falham sem conteúdo/log sensível. Redirect recusado. Apenas
  um objeto cifrado permanece em memória; índice ainda cresce por objeto.
- **Custódia:** regressão na baseline sobrescreveu vítima sintética via
  symlink de manifest. Agora symlink/hardlink e arquivo 0644 são recusados
  antes de truncar; arquivo original preservado. Binários/identidade exigem
  ownership, regularidade e privacidade. Não é defesa contra operador
  malicioso com controle total do processo/diretório.
- **Escopo do recovery:** campos legados de nível 4/5 mantidos, mas relatório
  explicita PostgreSQL/Storage artifacts e environment_recovery NOT_PROVEN;
  COMPLETE não equivale a GoTrue/OAuth/MFA/chaves/configuração gerenciada.

## Validação e reprodução

Node v24.19.0; `npm ci --include=optional` (cache temporário, lockfile inalterado).
PASS: `check:all`, `build`, `check:security`, `check:governance`,
`check:supply-chain`, `audit:ci` (zero vulnerabilidades), `test:database`,
`deploy:check`, `git diff --check`. SEO do deploy check usou
ARANDU_SITE_URL=https://arandu.example.com, origem sintética igual ao CI.
A listagem de 1075 E2E não é execução de navegador. Browser local NOT_RUN;
quatro gates do HEAD final da PR são exigidos separadamente.

```sh
node scripts/test-readiness.mjs
node scripts/test-pilot-doctor.mjs
node scripts/test-release-candidate.mjs
node scripts/test-recovery-transfer.mjs
node scripts/test-storage-recovery.mjs
node scripts/test-consolidation-export.mjs
# Somente cluster descartável exclusivo, nunca banco hospedado/default 5432:
ARANDU_DATABASE_TEST_URL=postgresql://postgres@127.0.0.1:55471/postgres npm run test:database
# PG17 e age/age-keygen no PATH; usa clusters temporários loopback próprios:
node scripts/test-recovery-real.mjs
```

PG17.6 extraído de imagem postgres:17.6; age1.3.2 validado pelo checksum já
fixado no instalador existente. Sem instalar pacote global nem iniciar cluster
padrão. Banco integral usou porta 55471 e diretório exclusivo em /tmp;
recovery usou apenas seus clusters 55431–55434 e diretórios mkdtemp próprios.
Sem usar demo:setup/reset ou recursos de Claude. O recovery reconcilia schema,
conteúdo, roles/grants, funções/triggers/índices, referências, bytes e RLS;
metadado sem binário, hash/tamanho errado e restore parcial são recusados.
Auth/Storage HTTP do ensaio é fixture própria, não serviço Supabase gerenciado.

Duas execuções integrais sintéticas finalizaram VALIDATED/teardown VERIFIED;
entre elas houve falha de inicialização pg_ctl no alvo de Storage. A causa não
foi comprovada; a execução serial final passou. Não contar a tentativa falha
como PASS nem alegar estabilidade do harness. check:all inicialmente encontrou
uma fixture de contagens sem bucket (corrigida) e depois uma fixture de
permissão afetada pela umask 077 do executor: com umask 022 igual ao CI passou,
sem remover assert. Falhas de subprocesso no sandbox padrão foram superadas
pela execução autorizada; não se tornaram PASS por inferência.

Performance existente, 100 decisões v2 com escrita/rollback, concorrência 1,
fixture pequena: primeira medição p50 1,783 ms / p95 3,092 / p99 13,284;
segunda p50 1,863 / p95 3,496 / p99 8,140. Medida SQL local, sem latência HTTP,
sem SLA ou inferência hospedada. Demais benchmarks de jornada NOT_RUN; não houve
otimização sem medição. Corridas usam sessões PostgreSQL independentes e locks,
não sleeps como prova de correção.

## Operação pendente e veredito

**C — NO-GO para declarar a apresentação validada neste momento.** Backend e
recovery sintéticos LOCAL_VALIDATED; nenhum M3/M4/M5 promovido. B exige ensaio
Demo completo e estação real no SHA aprovado; A exige identidade hospedada,
configuração/schema/Auth/Storage/isolamento, recovery aplicável e jornada real.

Intervenções externas mínimas: leitura Vercel no scope já autorizado; responsável
pela classificação/custódia e aprovações específicas de preservação/restore e
rollout/cutover; configuração independente dos ambientes; operador da estação
com handoff do Claude e ensaio canônico. Juridico/operação/SSO de cliente e DR
continuam gates próprios para dados reais, não pré-requisitos inventados para
implementar correções locais. Repetir o harness de recovery com diagnóstico da
inicialização transitória antes de afirmar estabilidade operacional.

Runbook diretamente utilizável: `docs/DEMO_PRESENTATION_2026-10-29.md` (D-7,
D-3, D-1, D-0; personas, smoke, contingência, interrupção e erro incerto).
Próxima rodada: fechar acesso e preservação autorizada, provar Demo canônica
hospedada; depois ensaio M4. Nenhuma ferramenta local autentica sozinha a
origem de um JSON de evidência.
