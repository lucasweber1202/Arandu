# Contribuindo com o Arandu

O Arandu (Financial Procurement) está em preparação para o piloto. Toda mudança deve preservar a separação entre o que foi implementado no código e o que foi comprovado em staging, produção ou por aprovação humana.

Antes de propor ou implementar mudança relevante de produto, UX, arquitetura, dados, IA, integrações ou operação, leia `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` (v3), `docs/IMPLEMENTATION_MATRIX.md` e `docs/FINANCIAL_PRODUCT_BOUNDARIES.md`. A guideline v3 é a referência estratégica do Arandu; o addendum v2.1 é histórico/superseded e não prevalece sobre ela. Mudanças que contradigam tese, limites, princípios, arquitetura de longo prazo, enterprise resilience, data governance ou papel da IA exigem decisão explícita e atualização documental; não devem entrar como efeito colateral de uma PR comum.

A guideline descreve o **target-state**, não uma autorização para implementar todo o roadmap. Cada PR deve respeitar a missão explícita da rodada, dependências e prioridade atual. Não antecipe Product Packs, network, benchmark ou refactors apenas porque aparecem como requisitos futuros.

## Fluxo de trabalho

1. Parta da `pilot` atualizada. Mudanças funcionais vão para `pilot` e são promovidas para `main` por PR depois de testadas no piloto (fluxo e hotfix em `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`). Se `pilot` estiver atrás de `main`, reconcilie a topologia antes de iniciar uma nova feature.
2. Se `main` estiver com guideline estratégica mais antiga que uma guideline já aprovada em `pilot`, não inicie feature nova a partir dessa documentação obsoleta. Resolva por `pilot → main` ou, quando promover todo o `pilot` for incorreto, por backport **docs-only** explícito para `main`, seguido de reconciliação `main → pilot` antes da próxima feature relevante. Essa é a exceção de canonicality (originalmente definida no addendum v2.1, hoje histórico; a v3 §23.5 mantém a obrigação de reconciliar hotfix de `main` em `pilot`).
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

Mudanças em migrations, RLS, autorização, governança de dados ou propostas também exigem:

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
- Preserve decisão humana, neutralidade de comparação e proveniência conforme a guideline v3 e `docs/FINANCIAL_PRODUCT_BOUNDARIES.md`.
- Integrações devem declarar source of truth, direção de sync, idempotência, conflito, fallback e observabilidade.
- Mudanças que afetem dados devem avaliar classificação, minimização, retenção, exclusão/offboarding e impacto em backup conforme aplicável. Tabela nova entra no registro `lib/finance/data-governance.mjs`.
- A vertical de marketplace de arte está aposentada (`docs/LEGACY_ART_RETIREMENT.md`): não reintroduza código, páginas, assets, scripts, testes, rotas, variáveis ou documentos de arte a partir do histórico sem tarefa explícita de recuperação.
- Mudanças que afetem produção, migrations ou recuperação devem avaliar backup, restore, rollback/forward-fix, canário e runbook. **Backup existente não equivale a restore comprovado.**
- Não alegue RPO, RTO, SLA, data residency, branch protection, certificação ou compliance sem evidência operacional/contratual adequada.

## Evidências e release

Financial Procurement: o estado de cada item do piloto fica em
`docs/FINANCIAL_PILOT_GO_LIVE.md`, com evidência datada em
`docs/FINANCIAL_RELEASE_EVIDENCE_*.md`. `ops/release-evidence.json` guarda os
gates externos de produção.

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
- compatibilidade com `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` (v3) e maturity state atualizado em `docs/IMPLEMENTATION_MATRIX.md` quando a mudança for relevante para produto, dados, IA, cálculos, comparação, integrações ou enterprise readiness;
- quando aplicável, impacto em data governance, operational resilience e source of truth.

Não marque a PR como pronta enquanto checks obrigatórios estiverem falhando ou enquanto o texto atribuir ao código uma validação externa que não ocorreu.

**Merge somente com os quatro gates verdes no HEAD exato.** Antes de mergear, rode `npm run merge:gates -- <número-da-PR>` (com `GITHUB_TOKEN` de leitura): o script lê o SHA atual do HEAD da PR e exige `database`, `deploy-boundaries`, `validate` e `presentation` concluídos com sucesso nesse SHA. Pending, in_progress, falha, cancelamento, skip, ausência ou run de commit anterior bloqueiam, assim como PR que não contém a ponta atual da base (atualize a branch e espere os quatro gates no novo HEAD). A #118 foi mergeada com `validate`/`presentation` ainda rodando e a #124 com `presentation` vermelho e base desatualizada; a regra existe para isso não se repetir. `.github/workflows/merge-audit.yml` acusa, depois do push em `pilot`/`main`, um merge que escapou da regra. O script não substitui a proteção de branch no GitHub (ver `docs/BRANCH_PROTECTION.md`).

## Documentação

Use `docs/OPERATIONS_INDEX.md` para encontrar a documentação canônica. `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` (v3) governa a direção estratégica de produto e engenharia; o addendum v2.1 é histórico e não a sobrepõe. Documentos especializados governam a implementação concreta. Documentos históricos devem ser claramente marcados e não podem competir com os runbooks atuais.
