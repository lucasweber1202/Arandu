# Proteção recomendada da branch `main`

Estas configurações são aplicadas nas configurações do GitHub, não por arquivos do repositório. Elas devem ser habilitadas depois do merge deste pacote.

## Regra obrigatória

Crie uma ruleset para a branch padrão `main` com:

- exigir pull request antes do merge;
- exigir que a conversa seja resolvida;
- exigir aprovação do CODEOWNER quando arquivos críticos forem alterados;
- exigir checks de status antes do merge;
- impedir force push;
- impedir exclusão da branch;
- exigir branch atualizada antes do merge;
- aplicar a regra também ao administrador, salvo procedimento documentado de incidente.

## Checks obrigatórios

Use os nomes efetivamente publicados pelo workflow:

- `validate`;
- `database`;
- `Vercel`, quando o deploy preview for requisito da revisão visual.

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
