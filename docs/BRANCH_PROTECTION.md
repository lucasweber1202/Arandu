# Proteção recomendada das branches `pilot` e `main`

Estas configurações são aplicadas nas configurações do GitHub, não por arquivos do repositório. Elas devem ser habilitadas depois do merge deste pacote.

## Regra obrigatória

Crie uma ruleset para `pilot` (integração das features) e para `main` (promoção `pilot → main`, `hotfix/*` e exceção docs-only) com:

- exigir pull request antes do merge;
- exigir que a conversa seja resolvida;
- exigir aprovação do CODEOWNER quando arquivos críticos forem alterados;
- exigir checks de status antes do merge;
- impedir force push;
- impedir exclusão da branch;
- exigir branch atualizada antes do merge;
- aplicar a regra também ao administrador, salvo procedimento documentado de incidente.

## Checks obrigatórios

Use os nomes efetivamente publicados pelo workflow `.github/workflows/ci.yml`:

- `database`;
- `deploy-boundaries`;
- `validate`;
- `presentation`;
- `Vercel`, quando o deploy preview for requisito da revisão visual.

Enquanto a ruleset não estiver ativa, a única barreira é processual: `npm run merge:gates -- <PR>` antes de qualquer merge (ver `CONTRIBUTING.md`). Ela não substitui a proteção no GitHub.

## Rulesets versionados (prontos para importar)

`.github/rulesets/pilot.json` e `.github/rulesets/main.json` são a configuração exata, no formato de import do GitHub, e são verificados em `check:governance` (`scripts/test-merge-gates.mjs`): ativa, sem bypass, PR obrigatória, conversas resolvidas, bloqueio de deleção e force push, e os quatro checks `database`, `deploy-boundaries`, `validate`, `presentation` com `strict` (branch atualizada) e `integration_id` 15368 (GitHub Actions — um status manual com o mesmo nome não satisfaz o gate). `required_approving_review_count` é 0 e CODEOWNER review está desligado porque o repositório tem um único mantenedor e o GitHub não deixa aprovar a própria PR; quando houver segundo revisor, suba para 1 e ligue `require_code_owner_review`.

Passo a passo (owner/admin, ~2 minutos):

1. GitHub → repositório → **Settings → Rules → Rulesets → New ruleset → Import a ruleset**.
2. Selecione `.github/rulesets/pilot.json` (baixado da `pilot`) → **Create**.
3. Repita com `.github/rulesets/main.json`.
4. Verifique: a API `GET /repos/lucasweber1202/Arandu/rules/branches/pilot` lista `pull_request`, `required_status_checks`, `non_fast_forward` e `deletion`; uma PR com qualquer dos quatro checks vermelho ou desatualizada mostra o botão de merge bloqueado.
5. Rollback: Settings → Rules → Rulesets → a ruleset → **Disable** (ou Delete). Nenhum dado é afetado.

## Barreiras versionadas enquanto a ruleset não existe

- `npm run merge:gates -- <PR>`: quatro checks `completed/success` no SHA exato do HEAD **e** a ponta atual da base contida nesse HEAD (`compare` `ahead`/`identical`). Dois PRs verdes contra a mesma base antiga, mergeados em sequência, deixam a combinação sem CI — foi o que aconteceu em `pilot@556258c` (#123 + #124, a #124 ainda com `presentation` vermelho).
- `.github/workflows/merge-audit.yml`: a cada push em `pilot`/`main`, um job curto e só leitura (`scripts/audit-merge.mjs`) falha se o commit não veio de PR com os quatro gates verdes no HEAD mergeado e com a base contida. É **detecção**, não prevenção: o merge já aconteceu quando ele falha; a correção é uma PR nova, nunca reescrever a história.

## Estado observado (2026-10-05, após #125/#126/#127)

`pilot` e `main` continuam `protected=false` (API de branches, 05/10). A sessão de agente não tem permissão administrativa (o conector não expõe rulesets e o `GH_TOKEN` do executor é inválido), portanto **não** configurou nem verificou ruleset. Nenhuma proteção ativa é afirmada aqui. Histórico: a #118 foi mergeada com `validate`/`presentation` rodando; a #124 foi mergeada com `presentation` vermelho (run `37228221232`); a #127 foi mergeada com `validate`/`presentation` em execução e sem a ponta da `pilot` após a #125 — detectada pelo `merge-audit` (run `37317090124`) e registrada como MGI-2026-10-05-01 em `FINANCIAL_REPO_GOVERNANCE.md`.

```
OWNER_ACTION_REQUIRED: proteção de branch para pilot e main
WHY: sem ruleset, merge com gate pendente/falho/desatualizado é possível (ocorreu na #118, na #124 e na #127)
WHO MUST ACT: owner do repositório (admin)
EXACT ACTION: importar .github/rulesets/pilot.json e .github/rulesets/main.json (passo a passo acima)
WHAT IS READY: rulesets versionados e testados; merge:gates com frescor de base; merge-audit pós-merge
HOW TO VERIFY: API de branches retorna protected=true para pilot e main; rules/branches/<branch> lista as quatro regras
ROLLBACK: desativar a ruleset em Settings → Rules
```

Não torne Dependabot ou jobs opcionais em checks obrigatórios sem antes confirmar que eles executam em todas as PRs.

## Método de merge

Prefira **squash merge** para branches de implementação. Isso mantém a `main` legível mesmo quando o conector cria múltiplos commits pequenos por arquivo.

Mantenha merge commit apenas quando a preservação da estrutura de uma cadeia empilhada for deliberada.

## Exceção de emergência

Uma exceção deve registrar:

- incidente;
- responsável;
- motivo do bypass;
- commit aplicado;
- validações executadas depois;
- ação que impede recorrência.

A exceção não autoriza inserir segredo, desativar RLS ou marcar gate externo sem evidência.

## Verificação periódica

A cada mês, confirme:

1. se a `main` continua protegida;
2. se os nomes dos checks não mudaram;
3. se CODEOWNERS cobre API, banco, workflows e release;
4. se branches mescladas estão sendo removidas;
5. se permissões de colaboradores continuam mínimas.
