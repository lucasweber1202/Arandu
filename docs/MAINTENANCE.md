# Manutenção do MVP — Arandu

## Como adicionar uma nova obra

1. Criar página `obra-nome-da-obra.html` a partir de uma página existente.
2. Adicionar card em `obras.html`.
3. Adicionar item em `data/catalog.json`.
4. Adicionar URL em `sitemap.xml` se for pública.
5. Testar salvar na Minha Seleção.

## Como adicionar novo artista

1. Criar página `artista-nome.html`.
2. Adicionar card em `artistas.html`.
3. Adicionar dados em `data/catalog.json`.
4. Vincular obras do artista.
5. Adicionar página no sitemap se for pública.

## Como alterar preço

1. Atualizar card em `obras.html`.
2. Atualizar página individual da obra.
3. Atualizar `data/catalog.json`.
4. Conferir `data-price` para ordenação no catálogo.

## Como alterar número de WhatsApp

1. Abrir `data/whatsapp-config.js`.
2. Alterar `window.ARANDU_WHATSAPP_NUMBER`.
3. Usar formato internacional: `55DDDNUMERO`.

## Como atualizar menu

1. Alterar headers das páginas principais ou migrar para componente no futuro.
2. Atualizar `data/site.json`.
3. Testar mobile menu.

## Como atualizar sitemap

- Páginas públicas: `sitemap.xml`.
- Páginas internas/mock: `sitemap-interno.xml`.

## Como publicar

1. Rodar `npm run check`.
2. Rodar `npm run dev`.
3. Testar páginas principais.
4. Fazer deploy em Vercel, Netlify, GitHub Pages ou Cloudflare Pages.
