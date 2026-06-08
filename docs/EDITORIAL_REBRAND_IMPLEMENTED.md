# Repaginação editorial Arandu

Implementação sem novas Serverless Functions.

## O que foi alterado

- Nova paleta mais madura, com areia, papel cru, pau-brasil profundo, argila queimada, verde mata, azul petróleo e dourado seco.
- Sistema de cards menos genérico, com visual editorial, bordas menos arredondadas e marca lateral curatorial.
- Homepage reconstruída para ser mais consultiva e menos marketplace.
- Pesquisa estática ampliada com `pesquisa.html`, `data/search-index.json` e `js/static-search.js`.
- Seleção com leitura curatorial automática mais forte e exportação HTML mais apresentável.
- Busca por intenção, contexto, empresa, certificado, técnica e primeira obra.
- CSS com cache busting via `vite.config.js`.

## Arquivos principais

```text
index.html
css/arandu-product.css
pesquisa.html
data/search-index.json
js/static-search.js
js/selection-tools.js
vite.config.js
```

## Observação operacional

As melhorias são estáticas e não criam novas funções serverless. O limite Hobby da Vercel continua protegido.

## Testes recomendados

```bash
npm run check:all
npm run build
```

Rotas para validar no deploy:

```text
/
/pesquisa.html
/encontrar-arte.html
/minha-selecao.html
/empresas-e-arquitetos.html
/obras.html
```
