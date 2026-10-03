# Contribuindo com o Arandu

O Arandu (Financial Procurement) está em preparação para o piloto. Toda mudança deve preservar a separação entre o que foi implementado no código e o que foi comprovado em staging, produção ou por aprovação humana.

Antes de propor ou implementar mudança relevante de produto, UX, arquitetura, dados, IA, integrações ou operação, leia `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md`, `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES_V2_1_ADDENDUM.md` e `docs/FINANCIAL_PRODUCT_BOUNDARIES.md`. A guideline é a referência estratégica principal do Arandu; enquanto o addendum v2.1 existir, ele é normativo e prevalece em conflito. Mudanças que contradigam tese, limites, princípios, arquitetura de longo prazo, enterprise resilience, data governance ou papel da IA exigem decisão explícita e atualização documental; não devem entrar como efeito colateral de uma PR comum.

A guideline descreve o **target-state**, não uma autorização para implementar todo o roadmap. Cada PR deve respeitar a missão explícita da rodada, dependências e prioridade atual. Não antecipe Product Packs, network, benchmark ou refactors apenas porque aparecem como requisitos futuros.

## Fluxo de trabalho

1. Parta da `pilot` atualizada. Mudanças funcionais vão para `pilot` e são promovidas para `main` por PR depois de testadas no piloto (fluxo e hotfix em `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`). Se `pilot` estiver atrás de `main`, reconcilie a topologia antes de iniciar uma nova feature.
2. Se `main` estiver com guideline estratégica mais antiga que uma guideline já aprovada em `pilot`, não inicie feature nova a partir dessa documentação obsoleta. Resolva por `pilot → main` ou, quando promover todo o `pilot` for incorreto, por backport **docs-only** explícito para `main`, seguido de reconciliação `main → pilot` antes da próxima feature relevante. Essa é a exceção de canonicality definida no addendum v2.1.
3. Crie uma branch curta e descritiva:
   - `agent/<descricao>` para pacotes implementados por agentes;
   - `feature/<descricao>` para funcionalidade;
   - `fix/<descricao>` para correção;
   - `chore/<descricao>` para manutenção;
   - `docs/<descricao>` para documentação normativa/operacional.
4. Não faça commits diretamente na `main` nem na `pilot`; `main` só recebe a promoção `pilot → main`, `hotfix/*` e a exceção docs-only de canonicality documentada acima.
5. Abra PR em modo draft enquanto houver testes ou evidências pendentes.
6. Remova a branch remota depois do merge, salvo quando ela for uma base empilhada ainda ativa.

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

## Regras de segurança, privacidade e enterprise readiness

- Nunca registre segredos, tokens, strings de conexão, e-mails reais ou PII no Git.
- Não use `user_metadata` para conceder privilégios.
- Não reintroduza fallback de `service role` para clientes públicos.
- Não aceite preço, comissão ou autorização privilegiada calculados no navegador.
- Não torne páginas internas parte do artefato público.
- Mudanças de autenticação, RLS, upload e operação comercial precisam de testes negativos.
- Preserve decisão humana, neutralidade de comparação e proveniência conforme a guideline, o addendum v2.1 e `docs/FINANCIAL_PRODUCT_BOUNDARIES.md`.
- Integrações devem declarar source of truth, direção de sync, idempotência, conflito, fallback e observabilidade.
- Mudanças que afetem dados devem avaliar classificação, minimização, retenção, exclusão/offboarding e impacto em backup conforme aplicável.
- Mudanças que afetem produção, migrations ou recuperação devem avaliar backup, restore, rollback/forward-fix, canário e runbook. **Backup existente não equivale a restore comprovado.**
- Não alegue RPO, RTO, SLA, data residency, branch protection, certificação ou compliance sem evidência operacional/contratual adequada.

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
- objetos afetados e impacto para usuário/operação;
- segurança, privacidade e autorização;
- banco/migrations quando aplicável;
- riscos e rollback;
- testes executados;
- evidência visual quando aplicável;
- gates externos deliberadamente não alterados;
- compatibilidade com `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` + `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES_V2_1_ADDENDUM.md` quando a mudança for relevante para produto, dados, IA, cálculos, comparação, integrações ou enterprise readiness;
- quando aplicável, impacto em data governance, operational resilience e source of truth.

Não marque a PR como pronta enquanto checks obrigatórios estiverem falhando ou enquanto o texto atribuir ao código uma validação externa que não ocorreu.

## Documentação

Use `docs/OPERATIONS_INDEX.md` para encontrar a documentação canônica. `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` governa a direção estratégica de produto e engenharia e, enquanto existir, o addendum v2.1 completa/override essa direção. Documentos especializados governam a implementação concreta. Documentos históricos devem ser claramente marcados e não podem competir com os runbooks atuais.
