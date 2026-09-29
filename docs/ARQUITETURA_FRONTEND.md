# Arquitetura front-end da Arandu

> **Legado — vertical de arte (aposentada).** Documento histórico: não descreve o produto atual (Arandu Financial Procurement). Ver [`LEGACY_ART_RETIREMENT.md`](LEGACY_ART_RETIREMENT.md) e [`OPERATIONS_INDEX.md`](OPERATIONS_INDEX.md).

Este documento existe para responder a uma pergunta que o repositório sozinho não
responde: **em qual arquivo eu mexo?**

O site é multipágina estático (MPA), sem framework de componentes. Cada página é
um `.html` na raiz. O que dá coerência visual e de navegação a todas elas é um
pipeline de injeção no build somado a um shell em JavaScript. Entender essa ordem
é o que evita passar a próxima hora numa guerra de `!important`.

## As três formas de um asset chegar à página

| Como | Onde é declarado | Vale para |
| --- | --- | --- |
| `<link>`/`<script>` escritos à mão | o próprio `.html` | só aquela página |
| Injeção no build | `vite.config.js`, `injectGlobalAssets()` | todas as páginas |
| Injeção em tempo de execução | `js/site.js`, `GLOBAL_STYLES` e `GLOBAL_SCRIPTS` | páginas que carregam `site.js` |

## Ordem da cascata

Esta é a parte que mais causa surpresa. A ordem final no `<head>` é:

1. **Folhas próprias da página** — as escritas no `.html`. São as **mais fracas**,
   porque tudo o mais entra depois delas.
   O Vite empacota as referências relativas (`href="css/x.css"`) em
   `/assets/x-<hash>.css`; as absolutas (`/css/x.css`) são servidas como estão.
2. **Folhas injetadas pelo build** — a lista de `injectGlobalAssets()`, em ordem
   de declaração, terminando em `arandu-refinamento.css`.
3. **Folhas injetadas pelo `site.js`** — anexadas ao `<head>` depois do
   carregamento, portanto **depois de tudo que o build colocou**.
4. **`arandu-refinamento.css`, reposicionada** — o `site.js` move essa folha para
   o fim do `<head>` justamente para que ela mantenha a última palavra.

Consequência prática: **uma regra nova no HTML da página perde** para as camadas
globais. Estilo específico de página precisa de seletor mais específico que o das
camadas globais, não apenas de vir "por último no arquivo".

### Especificidade vence ordem entre `!important`

Várias camadas declaram `!important` sobre `html, body` (especificidade 0,1,0).
Entre declarações `!important` de mesma origem, **quem tem seletor mais específico
ganha, independentemente da ordem**. É por isso que `css/arandu-home.css` usa
`body.emergency-home` (0,1,1) e não `.emergency-home` (0,1,0).

## As camadas, e para que serve cada uma

As folhas nasceram por sprint, não por responsabilidade, e os nomes refletem a
data em que foram criadas mais do que a função. As que importam para trabalho novo:

| Arquivo | Papel |
| --- | --- |
| `css/arandu-system.css` | tokens e base histórica |
| `css/arandu-home.css` | exclusivo da home (`index.html`) |
| `css/arandu-ui-rescue.css` | garante cabeçalho e navegação visíveis |
| `css/arandu-clarity.css` | contraste e legibilidade por superfície |
| `css/arandu-readability-commerce.css` | legibilidade das telas de compra |
| `css/arandu-refinamento.css` | **camada transversal — última palavra** |

### Onde colocar estilo novo

- Vale para o site inteiro (foco, movimento, alvo de toque, impressão)?
  → `css/arandu-refinamento.css`.
- Vale só para a home? → `css/arandu-home.css`.
- Vale só para uma página interna? → `<link>` na própria página, com seletor
  ancorado numa classe do `<body>`.
- **Não crie uma folha nova por sprint.** Foi assim que se chegou a 60 arquivos,
  31 deles mortos.

## A classe do `<body>` decide o tema

`css/arandu-ux-final-tune.css` aplica o gradiente escuro das páginas internas com
`body:not(.home-page):not(.admin-page)`. Uma página que devesse escapar disso e
não carregue a classe recebe o tema errado — foi exatamente o que aconteceu com a
home, cujo texto escuro caiu para 2,7:1 de contraste sobre fundo médio.

Ao criar uma página, escolha a classe de `<body>` conscientemente.

## O shell de navegação (`js/site.js`)

Um único arquivo monta cabeçalho, menu móvel, busca e rodapé em todas as páginas
públicas. Pontos que não são óbvios ao ler o código:

- **A navegação é reconstruída mais de uma vez** (DOM pronto, sessão reconhecida,
  reparo tardio). Por isso `ensureHeaderNav` e `buildMobileMenu` comparam uma
  assinatura antes de reescrever o DOM: sem isso, cada passagem descartava o botão
  já vinculado e o foco de quem navegava por teclado.
- **Os ouvintes globais do menu consultam o botão vivo** em vez de capturá-lo numa
  closure, porque o botão é recriado quando a navegação muda.
- **`reconcile()` não é um `run()` repetido.** Ele só reconstrói se o cabeçalho
  tiver sumido; caso contrário apenas revalida estado e links.

## Gates automatizados

`npm run check:all` roda a bateria completa. Os mais ligados a este documento:

| Comando | Garante |
| --- | --- |
| `npm run check:http` | CSP aplicada, cabeçalhos de borda, guarda de mesma origem |
| `node scripts/check-asset-inventory.mjs` | nenhum CSS/JS órfão novo |
| `npm run check:ux` | elementos e camadas de navegação presentes |
| `npm run check:seo` | meta tags, canonical e manifest por página |

## Segurança das respostas

`lib/http-security.mjs` centraliza o que toda função em `api/` aplica:

- `crossOriginRejection(req)` recusa escrita (`POST`/`PUT`/`PATCH`/`DELETE`) vinda
  de outra origem, checando `Origin` e `Sec-Fetch-Site`. Requisições sem esses
  cabeçalhos (cliente não-navegador) passam — elas não carregam cookie de sessão
  de terceiro.
- `applyApiSecurityHeaders(res)` aplica `no-store`, `nosniff`, `X-Frame-Options`,
  `Referrer-Policy` e `Vary` de forma idêntica em todos os handlers.

Os cabeçalhos de borda ficam em `vercel.json`. A CSP é **aplicada**, não apenas
relatada. Ela ainda depende de `'unsafe-inline'` em `script-src` e `style-src`
porque o site tem estilo e script inline em várias páginas; retirar essa
permissão exige antes eliminar esses trechos — é o próximo passo natural do
endurecimento, e o gate `check:http` já impede que a CSP volte a ser só relatório.
