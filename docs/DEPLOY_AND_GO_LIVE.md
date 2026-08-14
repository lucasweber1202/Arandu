# Deploy técnico e go-live público

O Arandu separa implantação técnica da autorização comercial para abertura pública.

## Deploy técnico automático

A Vercel executa `npm run vercel-build`, que chama somente `npm run deploy:check` em preview e produção.

O gate técnico verifica:

- build determinístico;
- orçamento de tamanho;
- contratos, segurança, governança e checks não estritos;
- SEO do `dist`;
- descoberta das jornadas Playwright.

Ele não promove catálogo, política comercial, piloto ou evidências externas.

## Go-live público

A autorização final é explícita:

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
