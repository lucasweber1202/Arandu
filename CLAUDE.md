# Instruções para agentes (Claude Code e similares)

- **Push em lote.** Rode localmente `npm run check:all`, `npm run build` e os
  testes da área alterada (`npm run test:database` para SQL, `npm run test:e2e`
  para interface) e só então faça **um** push com os commits do lote. Nunca
  faça push commit a commit: cada push inicia quatro jobs pagos no GitHub Actions
  (ver `docs/GITHUB_ACTIONS_MINUTES.md` e `CONTRIBUTING.md`).
- Não faça push vazio nem feche/reabra PR para disparar o CI.
- Não desative checks, navegadores ou jobs, e não use `|| true` para ficar verde.
- Migration nova: arquivo aditivo em `docs/`, rollback em `docs/rollback/`,
  registro em `docs/supabase-migrations.json`, `scripts/check-migrations.mjs` e
  `scripts/test-database.sh`, teste em `tests/database/`.
- Branches: `feature/*` sai de `pilot` e volta para `pilot` por PR; `main` só
  recebe `pilot → main` e `hotfix/*` (depois `main → pilot`). Ver
  `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`.
- Ambientes reais: `ARANDU_ENV=pilot|production npm run finance:pilot:doctor`.
  Piloto e produção nunca compartilham Supabase; nenhum usa o projeto legado.
