# Evidência da missão Passport — 20/10/2026

Base da branch: `546048985ce41901ddedce3d5259bb36ff54b0cc`, main atual na
abertura. Nenhuma PR concorrente aberta nessa consulta. Branch independente
`codex/passport-evidence-contract`; ownership backend/contrato/testes e estes
documentos próprios. Não foram modificados UI, package.json, guideline, matriz,
Vercel, Supabase assignments ou configuração hospedada.

## Reconciliação da #245 e publicação

PR #245 MERGED em 20/10 às 14:34:32 UTC, HEAD corretiva
`18d95e884fb561e63824046b572bac01bb57657c`. Consultados check-runs desse SHA
exato: database SUCCESS, deploy-boundaries SUCCESS, validate SUCCESS e
presentation SUCCESS. Confirmado ancestral de origin/main com merge-base.
Nenhum merge executado nesta missão.

Smoke externo anônimo no domínio `https://arandu-demo.vercel.app/`, executado
sobre main `546048985ce41901ddedce3d5259bb36ff54b0cc`:
HTTP_ARTIFACT PASS, BROWSER_DESKTOP PASS, BROWSER_MOBILE PASS,
PUBLIC_SHAREABLE PASS. SHA do manifesto coincide com o esperado. Nenhum
pageerror foi ignorado: erro ViewTransition não ocorreu nesta execução.
Prova completa em [public-proof.json](codex-passport-2026-10-20/public-proof.json).
Inclui rota/contexto das etapas, verificação de assets e métricas de laboratório.
Não é garantia de ausência universal de erros nem RUM/INP/capacidade de API.
CANONICAL_HOSTED_M3 permanece BLOCKED; estação do owner não foi validada aqui.

Reprodução (executar com acesso de rede e Chromium instalado):

```bash
node scripts/public-tour-proof-flow.mjs 546048985ce41901ddedce3d5259bb36ff54b0cc /tmp/passport-flow.json
npm run smoke:public-demo -- --url=https://arandu-demo.vercel.app/ --sha=546048985ce41901ddedce3d5259bb36ff54b0cc --browser --performance --flow=/tmp/passport-flow.json
```

O domínio pode avançar após este relatório; não substituir expected SHA por um
SHA observado sem revisar sua integração/gates. Esta prova pertence ao SHA
servido acima e não atesta hospedagem do novo contrato desta PR.

## Validação da mudança local

| Verificação | Resultado observado |
| --- | --- |
| `npm run check:all` (umask 022) | PASS; domínio, API, Passport, autorização, documentos, segurança, migrations estáticas, governança e supply chain |
| `npm run build` | PASS, build financeiro |
| `npm run check:build-size` | PASS; rota máxima RFQ 242369/250000 bytes; aviso de envelope saudável mantido |
| `node scripts/test-finance-passport.mjs` | PASS, incluindo novos positivos/negativos de representação e fronteira da API |
| `node scripts/test-document-intelligence.mjs` | PASS, parser/limites/extrações adversariais existentes |
| `CI=true npx playwright test tests/e2e/finance-passport.spec.js --project=chromium-desktop --project=mobile-chrome --workers=2` | 31 PASS, 7 skips existentes de larguras distribuídas entre tipos de projeto; nenhuma falha ou flaky reportada |
| `bash scripts/test-database.sh` em PostgreSQL isolado | PASS: instalação limpa, upgrade, reaplicação, rollback, RLS/entidades, Passport/histórico/snapshot, documentos, sessões, decisões/versões e concorrência |
| `git diff --check` | PASS |

SQL executado em container exclusivo sem rede, PostgreSQL16, imagem
`postgres@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4`,
repo montado somente leitura, 2 CPUs/768 MiB, fixtures sintéticas. Usado
`ARANDU_DATABASE_TEST_URL` loopback dentro do container, sem credenciais reais.
Container e volume removidos após execução. Canário existente: 594 verificações,
zero vazamentos, marker financial-decision-authorization-1; hosted NOT_RUN.
Esse teste não reproduz serviços gerenciados Auth/Storage e não promove M3.

O E2E existente usa fixtures/interceptação de API; valida compatibilidade de
jornada, não persistência hospedada do contrato. A fronteira real do handler é
exercitada pelo teste de API com transporte simulado; invariantes persistidas
são exercitadas separadamente pela suíte PostgreSQL. Não confundir as provas.

Novos testes estão no script já incluído no CI, sem novos jobs, dependências,
retries, thresholds ou skips. A denominação metadata_available explicita que não houve download de bytes
nessa resposta. Após finalizar código/testes, check:all e build foram repetidos.

## Diagnóstico e intervenções

Contrato, auditoria por estrutura, riscos, dossiê futuro, classificação
build/prepare/integrate/avoid e custos/dependências:
[PASSPORT_EVIDENCE_CONTRACT_2026-10-20.md](../PASSPORT_EVIDENCE_CONTRACT_2026-10-20.md).

Revisão humana/integração só após quatro gates no HEAD desta PR. Não usar o
resultado da #245 como aprovação desta mudança. Sem autorização pendente para
os testes reversíveis executados; continuam necessárias decisões do owner para
pesquisa real, critérios de documentos/destinatários, revisão jurídica antes
de dados externos e operação hospedada/recovery/cutover, além da prova da
estação de apresentação. Não foram solicitadas credenciais por chat nem
contratados serviços ou integrações.
