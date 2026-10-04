# Higiene do repositório

## Política de branches

Branches de PR mesclada devem ser removidas depois que deixarem de servir como base para outra PR ativa.

Mantenha somente:

- `main`;
- branches com PR aberta;
- branches empilhadas ainda necessárias;
- branches de recuperação explicitamente documentadas.

## Limpeza inicial recomendada

O repositório acumulou branches `agent/`, `feature/`, `fix/`, `codex/` e `chore/` de PRs já concluídas. Antes de excluir em lote:

1. liste as PRs abertas;
2. confirme que cada branch candidata foi mesclada ou abandonada;
3. compare a branch com `main` quando houver dúvida;
4. preserve qualquer branch usada como base de uma PR aberta;
5. remova primeiro pelo GitHub, nunca por force push na `main`.

Exemplo com GitHub CLI em ambiente autenticado:

```bash
gh pr list --state open --json number,headRefName,baseRefName

git fetch --prune origin

git branch -r --merged origin/main
```

A exclusão deve ser deliberada e revisada. Não automatize a remoção de branches não mescladas.

## Inventário de branches — 2026-10-04

Levantado com `git rev-list --count origin/pilot..<branch>` e `git cherry origin/pilot <branch>` (88 branches remotas). Nada foi apagado: a remoção é ação separada, revisada pelo owner.

**Totalmente contidas na `pilot` (0 commits fora dela) — candidatas seguras à remoção:** `agent/arandu-admin-auth-mfa`, `agent/arandu-audit-320-batch-1`, `agent/arandu-final-consolidation`, `agent/arandu-integrate-pr42-post46`, `agent/arandu-product-readiness`, `agent/arandu-production-gap-closure`, `agent/arandu-production-readiness-final`, `agent/arandu-security-privacy-hardening`, `agent/arandu-structural-debt-closure`, `agent/arandu-transactions-rls-operations`, `agent/arandu-vercel-release-gate-fixes`, `agent/recover-contract-provider-portfolio`, `chore/final-post-merge-reconciliation`, `claude/arandu-beta-launch-2026-08-28`, `claude/arandu-friday-ready-9fcxvs`, `claude/arandu-mudancas-a3r84y`, `claude/arandu-rc1-closure-taldyw`, `claude/arandu-readiness-audit-yjm9ny`, `claude/eager-franklin-0ew309`, `claude/eloquent-bohr-59fuk0`, `claude/friendly-goodall-n9k0as`, `claude/hopeful-archimedes-37u43x`, `claude/inspiring-clarke-0c7zaf`, `claude/lucid-hopper-6zcuqj`, `claude/pilot-operational-closure`, `claude/sleepy-dirac-nlmjia`, `claude/vibrant-planck-m71705`, `codex/pilot-advisor-hardening`, `docs/arandu-guideline-v2-1-enterprise-hardening`, `docs/arandu-master-guidelines-v1`, `docs/financial-procurement-os-guideline-v2`, `feature/data-governance`, `feature/demo-baseline`, `feature/enterprise-sso-foundation`, `feature/environment-topology`, `feature/integrate-financial-graph`, `feature/operational-resilience`, `feature/passport-operational-closure-2026-10-02`, `feature/pilot-passport-hosted-rollout-2026-10-02`, `feature/policy-engine-v2`, `feature/public-api-webhooks`, `feature/stabilize-pilot-contract-actions`, `fix/pilot-webkit-route-performance`, `hotfix/arandu-wave0-safari-closure`, `noop-do-not-use`, `work/arandu-enterprise-procurement-depth`, `work/arandu-final-beta-code-closure`, `work/arandu-financial-platform-deepening`, `work/arandu-financial-procurement-pilot-hardening`, `work/arandu-financial-productization`, `work/arandu-first-financial-pilot-readiness`, `work/arandu-operational-depth`.

**Equivalentes por patch, mas com commits próprios (rebase/squash) — revisar antes de remover:** `feature/financial-graph-foundations` e `feature/passport-legal-entity` (0 patches não aplicados).

**Com trabalho não presente na `pilot` — NÃO remover sem decisão:** `agent/contract-center-v2` (3 patches), `agent/policy-engine-v2` (4), `claude/modest-shannon-7vd88r` (3), `work/arandu-b2b-platform-pivot` (10), `agent/arandu-production-gates-ops` (2), `agent/consolidate-pr37-after-pr38`, `agent/arandu-presentation-readiness-hardening`, `agent/arandu-staging-rehearsal-evidence`, `agent/arandu-governance-release-hygiene`, `agent/arandu-launch-hardening-remote`.

**Era de arte com histórico próprio (1.000+ commits fora da `pilot`, junho–julho de 2026):** `launch-ready-arandu`, `codex/arandu-experiencia-visual`, `launch-readiness-20260625`, `chore/test-vite-upgrade`, `codex/arandu-mvp-operacao-20260706`, `fix/vercel-runtime-assets`, `fix/vercel-build-runtime-assets`, `feature/arandu-commerce-polish`, `feature/arandu-launch-cleanup-readiness`, `feature/arandu-public-experience-v2`, `feature/arandu-visual-commercial-fix`, `feature/arandu-visual-commercial-polish`, `feature/accounts-companies`, `product-layout`, `feature/final-product-layout`, `feature/arandu-mvp-programavel-20260713`, `agent/arandu-sprints2-5-launch`, `agent/arandu-sprint1-security-auth`, `agent/arandu-seo-pwa-integration`, `agent/arandu-sprints6-12-hardening`, `agent/arandu-production-execution`, `agent/arandu-ux-security-cleanup`. São história da vertical aposentada; preservar enquanto o owner não decidir (uma tag de arquivo por branch é alternativa barata a mantê-las).

## Documentação

`docs/OPERATIONS_INDEX.md` define a documentação canônica.

Documentos históricos de rodadas financeiras devem permanecer úteis como registro de decisão ou receber aviso explícito de que não representam o estado atual. Documentos da vertical de arte aposentada não ficam no tree: o Git preserva o conteúdo e `docs/LEGACY_ART_RETIREMENT.md` é a ponte.

Evite criar um novo documento de “go-live” para cada rodada. Atualize o documento canônico e registre mudanças no changelog.

## Artefatos e arquivos gerados

Não versione:

- `node_modules/`;
- `dist/` quando produzido pela CI;
- relatórios locais com PII;
- logs completos;
- dumps de banco;
- backups;
- arquivos `.env` reais;
- evidências contendo tokens, e-mails ou strings de conexão.

## Revisão trimestral

A revisão deve verificar:

- branches antigas;
- documentos duplicados;
- dependências sem manutenção;
- workflows obsoletos;
- owners e permissões;
- issues de release sem responsável;
- scripts declarados que não são executados na CI.
