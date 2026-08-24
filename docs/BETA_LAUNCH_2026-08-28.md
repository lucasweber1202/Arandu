# Beta pública Arandu — 28 de agosto de 2026

Estado desta branch: `claude/arandu-beta-launch-2026-08-28`, a partir de `main@35952a4`
(merge do PR #49, 18/08).

O objetivo desta rodada não é abrir a operação comercial. É deixar a Arandu
publicável e utilizável por pessoas reais na sexta: entender a proposta, navegar
sem quebra no celular, enviar portfólio como artista, falar com a curadoria, e
medir de onde veio o tráfego — sem em nenhum momento sugerir que compra,
pagamento ou política comercial estão operando.

Os gates externos continuam fail-closed e nada aqui os promove.

---

## A. Concluído no código (nesta branch)

| # | Item | Onde |
| - | ---- | ---- |
| A1 | Aviso de beta pública emitido no build em toda página pública, antes do cabeçalho. Estático no HTML (CLS medido em 0), some sozinho com `ARANDU_COMMERCIAL_READY=true`. | `vite.config.js` |
| A2 | Home reescrita: proposta honesta e as quatro ações levam a algo que existe hoje — submissão de portfólio, contato, critérios de seleção, acervo em preparação. Rodapé com privacidade, termos e contato. | `index.html` |
| A3 | `comprar-arte.html` descreve o estado real (acervo em validação, compra/reserva inativas) e aponta para curadoria e submissão em vez de reserva. | `comprar-arte.html` |
| A4 | Estados vazios de acervo, artistas e coleções passam a oferecer contato com a curadoria e envio de portfólio, no lugar do link para a página interna de diagnóstico. | `js/catalog-source.js`, `js/catalog-page.js`, `js/artists-page.js`, `js/collections-page.js`, `js/collection-detail.js` |
| A5 | Navegação móvel colapsada em todas as páginas: o cabeçalho em 390px caiu de **297px para 68px**. Removida a regra legada que vencia por especificidade, mais peso morto (`.mobile-menu-button`, duplicatas). | `css/arandu-runtime.css` |
| A6 | Primeiro CTA da home volta à primeira dobra: 614px de 844px (390px), 603/900 (768px), 725/900 (1440px). | `index.html`, `vite.config.js`, `css/arandu-runtime.css` |
| A7 | Atribuição de primeiro toque por aba (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, host do referrer, página de entrada). Antes a UTM era lida na URL do envio e se perdia entre a home e o formulário. | `js/platform-runtime.js`, `js/forms.js` |
| A8 | Servidor passa a persistir a atribuição no lead, podada a rótulo alfanumérico. Nunca guarda a URL de origem completa. | `lib/api-dtos.mjs` |
| A9 | Evento de conversão `submit_artist_application` (o número que define esta beta) e distinção entre clique de WhatsApp, e-mail e página de contato. Atribuição aceita no payload de conversão. | `api/[...path].js`, `lib/api/domains/privacy.mjs`, `js/platform-runtime.js`, `js/forms.js`, `docs/supabase-beta-conversion-events.sql` |
| A10 | Falha de envio deixa de ser beco sem saída: oferece WhatsApp e e-mail da configuração pública, mais a página de contato, com o resumo já preenchido. Sucesso de portfólio aponta o próximo passo. | `js/forms.js` |
| A11 | Nota de privacidade LGPD junto ao botão dos dez formulários públicos; status do envio anunciado por leitor de tela. | 10 páginas com `data-form-type`, `js/forms.js` |
| A12 | `ARANDU_SITE_URL` com host sem TLD (o placeholder `https://sua-url-da-vercel`, hoje em produção) deixa de passar como domínio próprio no runtime, no build e no gate. | `lib/api/domains/public-content.mjs`, `vite.config.js`, `scripts/check-domain-config.mjs` |
| A13 | Contraste WCAG AA restaurado em oito páginas públicas. `tests/e2e/contrast.spec.js` falhava em `main` e passa aqui. | `css/arandu-runtime.css` |

### Preservado deliberadamente

- `data/catalog-release.json` continua `datasetKind: demonstration`, `verifiedReady: false`.
- `data/commercial-policy.json` continua `status: draft`, `approved: false`.
- `ops/release-evidence.json` intocado.
- Modo de apresentação continua bloqueado em `VERCEL_ENV=production` (verificado: o build falha).
- Nenhum gate de release foi afrouxado. Nenhum domínio, contato LGPD, comissão, pagamento, frete, seguro, modelo fiscal, obra, artista ou aprovação foi inventado.

---

## B. Exige Lucas (decisão ou execução pessoal, até sexta)

| # | O quê | Por quê | Bloqueia a beta? |
| - | ----- | ------- | ---------------- |
| **B1** | **Aplicar as migrations no Supabase de produção**, na ordem de `docs/supabase-migrations.json` (fluxo `existingDatabase`), incluindo a nova `docs/supabase-beta-conversion-events.sql` ao final. | **Este é o único bloqueador P0 real.** Hoje `POST /api/forms` responde **503 `rate_limit_unavailable`** em produção, porque o limitador distribuído depende da RPC `consume_rate_limit`, que não existe no banco. Na prática **nenhum formulário funciona**: nem portfólio, nem contato. `/api/catalog` confirma o mesmo com `catalog_migration_pending`. | **SIM** |
| B2 | Depois de B1, enviar um portfólio de teste em `/para-artistas.html` e conferir a linha em `artist_submissions`, com a UTM no `payload`. | Só o teste real fecha o critério "formulário de artista funciona de verdade". | SIM |
| B3 | Decidir o texto do primeiro vídeo/bio do TikTok apontando para `/para-artistas.html?utm_source=tiktok&utm_medium=social&utm_campaign=beta-agosto`. | A atribuição só existe se o link carregar UTM. | Não, mas sem isso não há medição |
| B4 | Definir se a beta usa o domínio `.vercel.app` ou um domínio próprio. | Enquanto não houver domínio próprio, o build marca o site como **noindex** e não gera sitemap. Para uma beta divulgada por TikTok isso é aceitável; para SEO, não. | Não |
| B5 | Revisar a copy da home e de `comprar-arte.html`. Ela mudou de tom: deixou de prometer compra. | É decisão de marca, não técnica. | Não |

---

## C. Exige ambiente / credencial (Vercel)

| # | Variável | Estado hoje em produção | Efeito |
| - | -------- | ----------------------- | ------ |
| C1 | `ARANDU_SITE_URL` | **`https://sua-url-da-vercel`** — placeholder | Depois da correção A12 o runtime passa a tratá-lo como ausente (honesto). Preencher com o domínio real ou deixar vazio; **não deixar o placeholder**. |
| C2 | `ARANDU_CONSENT_VERSION` | ausente | **Analytics inteiramente desligado.** `/api/public-config` responde `consent.configured: false`, o banner diz que métricas estão indisponíveis e `/api/conversion-events` recusa com 503. Sem isso não há funil de TikTok, mesmo com A7–A9 no ar. |
| C3 | `ARANDU_CONTACT_EMAIL` | ausente (`null`) | O resgate de formulário e os CTAs de contato caem só no WhatsApp. Um e-mail dá segunda via. |
| C4 | `ARANDU_WHATSAPP_NUMBER` | **configurado** (`5521976706600`) | OK. É hoje o único canal de contato realmente ativo. |
| C5 | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | configurados (o erro é de schema, não de credencial) | Nada a fazer além de B1. |
| C6 | `ARANDU_PRIVACY_CONTACT_EMAIL` | ausente | Contato LGPD. Não inventar; decidir. |
| C7 | `ARANDU_BRAND_READY`, `ARANDU_COMMERCIAL_READY` | `false` | **Manter false.** São o que mantém o aviso de beta no ar e a compra fechada. |

---

## D. Exige artista / dado / autorização real

| # | Item |
| - | ---- |
| D1 | Mínimo de 5 artistas e 20 obras reais, com autoria, ficha técnica, imagens e **autorização escrita** de publicação. |
| D2 | Só com D1 é que `data/catalog-release.json` pode virar `datasetKind: real` e `verifiedReady: true`. Não antes. |
| D3 | Logo final em PNG. Hoje existe só a vetorial provisória em `assets/logo-arandu.svg`. |

---

## E. Exige decisão comercial / jurídica

| # | Item |
| - | ---- |
| E1 | Comissão (`ARANDU_PLATFORM_FEE_RATE`), moeda, prazo de reserva. |
| E2 | Política de pagamento, frete, embalagem, seguro, cancelamento, devolução, avaria, certificado. |
| E3 | Modelo fiscal e emissor de nota. |
| E4 | Aprovação formal de `data/commercial-policy.json` (`approved`, `approvedBy`, `approvedAt`). |
| E5 | Termos para artistas e contrato de comissionamento. |

Nada disso bloqueia a beta — a beta declara explicitamente que a compra não está aberta.

---

## F. Pode ficar para depois da beta

- Restauração de backup comprovada nos últimos 30 dias (`ARANDU_BACKUP_VERIFIED_AT`).
- Monitoramento de erros (`ARANDU_ERROR_MONITORING_READY`).
- E-mail transacional (`ARANDU_EMAIL_PROVIDER` segue `disabled`).
- Piloto fechado (`ARANDU_PILOT_ENABLED`).
- Rate limit distribuído confirmado (`ARANDU_DISTRIBUTED_RATE_LIMIT=true`) — hoje já é forçado em qualquer deploy da Vercel; a variável é só a declaração explícita.

---

## Não bloquear a beta por isso

Itens de operação plena que **não** impedem a landing nem a open call, desde que
a comunicação siga honesta — e ela segue, porque o aviso de beta está em toda
página e a página de acervo diz o que está acontecendo:

- **Catálogo real.** A beta não vende. `comprar-arte.html`, `artistas.html` e
  `colecoes.html` explicam que o acervo está em validação curatorial e oferecem
  curadoria e submissão como próximo passo.
- **Política comercial aprovada.** Nada na beta cobra, reserva ou promete prazo.
  `/api/reservations` e `/api/proposals` continuam fail-closed.
- **Domínio próprio.** Um `.vercel.app` recebe tráfego de TikTok normalmente. O
  custo é SEO, e a beta não depende de busca orgânica.
- **Marca final aprovada.** A identidade atual está coerente; a logo definitiva
  é polimento.
- **E-mail transacional.** O retorno da curadoria pode ser manual no volume de
  uma beta.
- **Certificados e verificação pública.** Só passam a importar quando houver
  obra real vendida.

O que **não** entra nesta lista é **B1**. Sem as migrations aplicadas, a beta
não recebe um único lead — o formulário responde 503 para todo mundo.

---

## Testes executados nesta branch

| Comando | Resultado |
| ------- | --------- |
| `npm ci --include=optional` | OK (aviso de engine: Node 22 no ambiente, `package.json` pede 24) |
| `npm audit --audit-level=high` | 0 vulnerabilidades |
| `npm run check:all` | **passou** (33 gates) |
| `npm run build` | **passou** |
| `npm run check:dist-assets` | **passou** — 97 páginas, 1631 referências locais |
| `npm run check:seo:dist` | **passou** com `ARANDU_SITE_URL` real (sem domínio o gate recusa validar, por desenho) |
| `npm run test:e2e:list` | 110 testes em 4 arquivos |
| `npm run test:e2e` (chromium-desktop + mobile-chrome) | **42 passaram, 2 pulados** (pulos são do próprio spec, por projeto) |
| `npm run test:e2e:presentation` (idem) | **9 passaram** |
| `npm run test:database` (PostgreSQL 16 local) | **passou** — instalação limpa, upgrade, reaplicação, rollback, RLS, transações, pedidos, outbox, fencing e retenção, já com a migration nova |
| `git diff --check` | limpo |
| Build com `ARANDU_PRESENTATION_MODE=true VERCEL_ENV=production` | **falha, como esperado** |

**Limitação do ambiente:** só o Chromium está instalado (build 1194; o
`@playwright/test` do repo espera 1234), e sem rede para baixar os demais. Os
projetos `firefox-desktop`, `webkit-desktop` e `mobile-safari` **não foram
executados** nesta rodada e precisam rodar no CI. O navegador do ambiente
também não alcança a internet, então as evidências de produção vieram de `curl`
e as de browser, de build local servido em `127.0.0.1:4173`.

## Evidência de produção coletada em 24/08 (via `curl`)

```
GET /api/health          -> {"ok":true,"service":"arandu-api","status":"alive"}
GET /api/public-config   -> siteUrl "https://sua-url-da-vercel", consent.configured false,
                            contact.whatsappNumber "5521976706600", contact.email null
GET /api/catalog         -> 
                            {"ok":false,"code":"catalog_migration_pending"}
POST /api/forms          -> 503 {"ok":false,"code":"rate_limit_unavailable"}
```

## Risco e rollback

- **Risco 1 — B1 não acontecer.** A beta sobe e nenhum lead é gravado. Mitigado
  em código: o formulário passa a oferecer WhatsApp com o resumo preenchido, de
  modo que a candidatura ainda chega. Não é substituto do banco.
- **Risco 2 — mudança de copy.** A home mudou de tom. Reversível: é HTML.
- **Risco 3 — cascata de CSS.** As correções de contraste mexem em regras
  legadas compartilhadas. Cobertas por `tests/e2e/contrast.spec.js`, que agora
  varre as 97 páginas do build e passa.
- **Rollback:** todos os commits são independentes e reversíveis com
  `git revert`. Nenhuma migration destrutiva: `docs/supabase-beta-conversion-events.sql`
  só recria um `CHECK` e é idempotente.
