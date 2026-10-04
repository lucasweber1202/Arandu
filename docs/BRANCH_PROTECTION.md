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

## Estado observado (2026-10-04)

`pilot` foi observada com `protected=false`, e a #118 foi mergeada com `validate` e `presentation` ainda em execução no HEAD final; os dois falharam depois. A sessão de agente que registrou isto **não tem permissão administrativa** no repositório (só leitura/escrita de conteúdo e PRs via conector), portanto não configurou nem verificou ruleset. Nenhuma proteção ativa é afirmada aqui.

```
BLOCKER: proteção de branch para pilot e main
WHY: sem ruleset, merge com gate pendente/falho é possível (ocorreu na #118)
WHO MUST ACT: owner do repositório (admin)
EXACT ACTION: Settings → Rules → Rulesets → nova ruleset para pilot e main: exigir PR, os quatro checks acima (strict/atualizada), bloquear force push e exclusão, sem bypass
WHAT IS READY: CI com os quatro jobs; npm run merge:gates; template de PR com a regra
HOW TO VERIFY: Settings → Rules mostra a ruleset ativa; a API de branches retorna protected=true para pilot e main
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
