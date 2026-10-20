# Visita guiada pública (P0-A, guideline v3.5 §37)

Status: **implementação local (M1/M2 conforme CI)**. Não declara PUBLIC_SHAREABLE: isso depende da publicação e do smoke externo do Codex (Issue #240).

## Rotas (somente no build demonstrativo: `npm run build:demo` / `ARANDU_PRESENTATION_MODE`)

| Rota | O que é | Categoria |
| --- | --- | --- |
| `/` (projeto arandu-demo) e `/demo/index.html` | Entrada: tese do produto, uma ação principal (“Conhecer a plataforma”) e as três formas de conhecer | — |
| `/demo/visita.html` | Visita guiada, 10 etapas + cinco áreas | VISITA INFORMATIVA |
| `/demo/visita.html#painel` … `#continuidade` | Jornada da empresa (8 etapas) | VISITA INFORMATIVA |
| `/demo/visita.html#instituicao`, `#instituicao-proposta` | Jornada da instituição financeira | VISITA INFORMATIVA |
| `/demo/visita.html#areas` | Cinco áreas, de `lib/finance/navigation.mjs` | VISITA INFORMATIVA |
| `/demo/finance/*`, `/demo/provider/*` | Sandbox histórico (Acme), rotulado na entrada | SIMULAÇÃO NO NAVEGADOR |
| — | Apresentação ao vivo com backend real (P0-B) | OPERAÇÃO REAL DE BACKEND — **não** disponível no link |

O build oficial não publica nenhuma dessas rotas (`scripts/test-demo-mode.mjs --dist`).

## Fontes e manifesto

- `lib/public-tour.mjs`: etapas, rota canônica, item de menu, persona e categoria. Sem valores financeiros nem maturidade.
- `scripts/generate-public-tour.mjs`: gera `demo/visita.html` a partir do manifesto, de `scripts/demo/dataset.mjs` (o mesmo cenário Vitta Foods que `scripts/demo/seed.mjs` grava pela API real), de `lib/finance/navigation.mjs` e de `demo/visita/captures.json`. `--check` falha se a página divergir das fontes.
- `scripts/test-public-tour.mjs` (em `check:demo-parity`): etapas ↔ menu ↔ rotas canônicas, comprador e instituição, cinco áreas, uma ação principal, ausência de vencedor/recomendação/login/UUID/termos técnicos, proveniência das capturas e fronteira do build.
- `tests/e2e/public-tour.spec.js` (suíte `test:e2e:presentation`): entrada → visita, jornada completa ida e volta, links profundos, etapa inexistente, teclado, overflow e assets sem 4xx.

## Capturas de tela do produto

`demo/visita/captures.json` aceita, por etapa, capturas desktop/mobile com SHA, data, base, dataset, rota, persona e dimensões; o gerador só mostra imagem com essa proveniência. **Nesta entrega não há capturas**: a Demo canônica local (`npm run demo:setup`) não subiu no executor porque o Docker Hub respondeu 429 (limite de downloads) às imagens do Supabase. Nenhuma imagem histórica ou mockup foi usada no lugar. Com a stack local de pé, capture com `npm run design:capture` (mesmos viewports) e registre os arquivos e a proveniência em `captures.json`; depois `node scripts/generate-public-tour.mjs`.

## Evidência visual desta entrega

`artifacts/public-tour/`: entrada, visita e etapas (comparação, continuidade, instituição, áreas, etapa inexistente) em 1440×900 e 390×844, Chromium, build `npm run build:demo` no commit-base `3b3fd48` + esta branch; overflow horizontal medido = 0 em todas.

## Para o Codex (Issue #240)

1. `npm ci --include=optional && npm run build:demo` — `dist/index.html` deve conter `id="tour-start"` e `dist/demo/visita.html` deve existir.
2. Smoke no domínio publicado: `/`, `/demo/visita.html`, `/demo/visita.html#comparacao`, `#instituicao`, `#areas`; todos 200, CSS/JS da visita 200, faixa “Ambiente demonstrativo”, `noindex`, nenhuma chamada a `/api/`.
3. Nenhuma mudança em `vercel.json`, scripts de deploy ou topologia foi feita. Opcional: redirect `/visita` → `/demo/visita.html`.

## Limitações declaradas

- Visita é leitura do cenário fictício; não há login, gravação, envio a instituições ou decisão.
- A simulação histórica continua com outra empresa fictícia (Acme) e sem as áreas `sandboxExcluded`; a entrada diz isso.
- Capturas reais pendentes (acima).
