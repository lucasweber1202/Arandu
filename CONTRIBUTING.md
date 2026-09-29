# Contribuindo com o Arandu

O Arandu (Financial Procurement) está em preparação para o piloto. Toda mudança deve preservar a separação entre o que foi implementado no código e o que foi comprovado em staging, produção ou por aprovação humana.

## Fluxo de trabalho

1. Parta da `pilot` atualizada. Mudanças vão para `pilot` e são promovidas para `main` por PR
   depois de testadas no piloto (fluxo e hotfix em `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`).
2. Crie uma branch curta e descritiva:
   - `agent/<descricao>` para pacotes implementados por agentes;
   - `feature/<descricao>` para funcionalidade;
   - `fix/<descricao>` para correção;
   - `chore/<descricao>` para manutenção.
3. Não faça commits diretamente na `main` nem na `pilot`; `main` só recebe a promoção `pilot → main` e `hotfix/*`.
4. Abra PR em modo draft enquanto houver testes ou evidências pendentes.
5. Remova a branch remota depois do merge, salvo quando ela for uma base empilhada ainda ativa.

## Push em lote (minutos do GitHub Actions)

Cada push em uma branch com PR dispara os quatro jobs do CI. O push seguinte
cancela o run anterior, mas cada job já iniciado cobra pelo menos um minuto: em
setembro de 2026, 83 dos 100 runs mais recentes foram cancelados por pushes
feitos commit a commit, e a quota mensal acabou (`docs/GITHUB_ACTIONS_MINUTES.md`).

- rode a validação local abaixo **antes** de enviar;
- agrupe os commits e faça **um push por lote validado**, não um por commit;
- não use push para "ver se o CI passa" — reproduza a falha localmente;
- não faça push vazio nem feche e reabra PR para disparar o CI.

## Validação mínima

```bash
npm ci --include=optional
npm run audit:ci
npm run check:all
npm run build
npm run test:e2e:list
```

Mudanças em migrations, RLS, reservas, propostas ou política comercial também exigem:

```bash
npm run test:database
```

Mudanças visuais devem executar Playwright quando Chromium estiver disponível:

```bash
npx playwright install chromium
npm run test:e2e
```

## Regras de segurança e privacidade

- Nunca registre segredos, tokens, strings de conexão, e-mails reais ou PII no Git.
- Não use `user_metadata` para conceder privilégios.
- Não reintroduza fallback de `service role` para clientes públicos.
- Não aceite preço, comissão ou autorização privilegiada calculados no navegador.
- Não torne páginas internas parte do artefato público.
- Mudanças de autenticação, RLS, upload e operação comercial precisam de testes negativos.

## Evidências e release

Financial Procurement: o estado de cada item do piloto fica em
`docs/FINANCIAL_PILOT_GO_LIVE.md`, com evidência datada em
`docs/FINANCIAL_RELEASE_EVIDENCE_*.md`. `ops/release-evidence.json` guarda os
gates externos herdados da vertical de arte.

Um gate só pode sair de `not_started` quando houver:

- responsável identificável sem PII;
- data observada no passado;
- referência verificável;
- nível de evidência compatível com o ambiente realmente testado.

CI não comprova staging. Staging não comprova produção. Teste automatizado não substitui aprovação comercial, jurídica ou do piloto.

## Pull requests

A descrição da PR deve explicar:

- problema e causa;
- solução;
- impacto para usuário e operação;
- riscos e rollback;
- testes executados;
- gates externos deliberadamente não alterados.

Não marque a PR como pronta enquanto checks obrigatórios estiverem falhando ou enquanto o texto atribuir ao código uma validação externa que não ocorreu.

## Documentação

Use `docs/OPERATIONS_INDEX.md` para encontrar a documentação canônica. Documentos históricos devem ser claramente marcados e não podem competir com os runbooks atuais.
