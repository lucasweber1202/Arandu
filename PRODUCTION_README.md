# Arandu — guia rápido de produção

> **Legado — vertical de arte (aposentada).** Este guia descreve o go-live da vertical de arte. Para o produto atual (Financial Procurement), comece pelo [`README.md`](README.md) e por [`docs/FINANCIAL_PILOT_GO_LIVE.md`](docs/FINANCIAL_PILOT_GO_LIVE.md).

O Arandu está em pré-produção para um piloto fechado de vendas assistidas. Build verde não libera lançamento: catálogo, política comercial, ambiente real, jurídico, monitoramento, backup e piloto precisam de evidência.

## Validação técnica

```bash
npm ci
npm run check:all
npm run build
npm run check:seo:dist
npm run test:e2e
npm audit
```

## Segurança administrativa

- `/api/health` oferece somente liveness pública.
- `/api/readiness` exige sessão administrativa, papel imutável e MFA.
- páginas de `lib/internal-pages.mjs` não entram no `dist`;
- HTML interno é servido por `api/internal-page.js` somente após autorização;
- APIs privilegiadas não aceitam segredo compartilhado;
- a service role não possui fallback para anon key.

Para criar, revogar e validar uma conta administrativa, consulte `docs/ADMIN_AUTH_MFA.md`.

## Pendências externas que continuam bloqueando o lançamento

- Supabase real, migrations, write canary, RLS e restauração de backup;
- pelo menos 5 artistas e 20 obras reais verificadas;
- política comercial e revisão jurídica;
- domínio, contatos, marca e identidade final;
- monitoramento, rate limit distribuído e e-mail transacional;
- piloto fechado com ao menos 10 participantes e zero bloqueadores críticos.

Não marque gates como prontos sem a evidência correspondente.
