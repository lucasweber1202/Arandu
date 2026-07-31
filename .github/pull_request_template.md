## Problema

Descreva o problema, a causa e por que esta mudança é necessária.

## Solução

Descreva o que foi alterado e o que ficou deliberadamente fora do escopo.

## Impacto

- Usuário:
- Operação:
- Segurança/privacidade:
- Banco/migrations:

## Validação

Marque somente o que foi realmente executado.

- [ ] `npm ci --include=optional`
- [ ] `npm run audit:ci`
- [ ] `npm run check:all`
- [ ] `npm run build`
- [ ] `npm run test:e2e:list`
- [ ] `npm run test:e2e`
- [ ] `npm run test:database`
- [ ] `git diff --check`

## Evidências externas

- [ ] Não alterei gates externos.
- [ ] Alterei gates externos somente com responsável, data e referência verificável.
- [ ] Não confundi CI com staging ou produção.
- [ ] Aprovações humanas foram registradas por quem possui autoridade para decidir.

## Segurança

- [ ] Não incluí segredos, PII, e-mails reais ou strings de conexão.
- [ ] Adicionei testes negativos para autenticação, RLS ou autorização quando aplicável.
- [ ] Preços, comissões e privilégios continuam calculados ou validados no servidor.
- [ ] O rollback está documentado quando a mudança altera dados ou migrations.

## Risco e rollback

Explique o maior risco da mudança e como reverter com segurança.

## Checklist final

- [ ] A documentação canônica foi atualizada.
- [ ] A branch pode ser removida após o merge.
- [ ] A PR permanece draft enquanto houver validação obrigatória pendente.
