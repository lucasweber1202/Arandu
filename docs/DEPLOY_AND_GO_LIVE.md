# Deploy técnico, beta pública e go-live comercial

O Arandu separa implantação técnica, beta pública com catálogo/comércio fechados e autorização para go-live comercial completo.

## Deploy técnico automático

A Vercel executa `npm run vercel-build`, que chama somente `npm run deploy:check` em preview e produção.

O gate técnico verifica:

- build determinístico;
- orçamento de tamanho;
- contratos, segurança, governança e checks não estritos;
- SEO do `dist`;
- descoberta das jornadas Playwright.

Ele não promove catálogo, política comercial, piloto ou evidências externas.

## Beta pública

A beta usa `deploy:check` e o checklist operacional de
`docs/RELEASE_CANDIDATE_1.md`. Ela não exige catálogo real, política comercial
aprovada, piloto fechado ou todos os gates de release; catálogo e comércio
permanecem explicitamente fechados.

## Go-live comercial completo

A autorização comercial final é explícita:

```bash
npm run predeploy
```

`predeploy` executa primeiro `deploy:check` e depois `release:check --require-ready`. O gate final continua bloqueando quando qualquer evidência externa estiver pendente, incluindo staging real, migrations, restore, write canary, RLS, concorrência, catálogo, política comercial, monitoramento, contato LGPD, domínio e piloto.

Nunca altere `ops/release-evidence.json` apenas para aprovar um deploy técnico.

## Consentimento analítico

`ARANDU_CONSENT_VERSION` é uma configuração pública não secreta e a única fonte canônica da versão. A API publica o valor em `/api/public-config`; o frontend não mantém versão hardcoded.

Se a variável estiver ausente ou inválida:

- analytics permanece desativado no frontend;
- o botão de aceite de métricas não é exibido;
- `/api/conversion-events` responde `503 analytics_consent_unconfigured`;
- o gate final de go-live permanece bloqueado.

## Staging protegido

`ARANDU_MIGRATION_FLOW` nasce do input tipado `migration_flow` no `env` do job. Os valores aceitos pelo workflow são `existingDatabase` e `cleanInstall`. Inputs manuais nunca são interpolados diretamente no shell.
