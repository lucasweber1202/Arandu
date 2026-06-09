# Arandu — Estado de Produção

## Objetivo da rodada

A rodada atual consolidou o site para funcionar com um carregamento centralizado, limpo e mais seguro para validação em Codespace e posterior deploy no Vercel.

## O que está implementado

- `site.js` aciona automaticamente `arandu-loader.js`.
- `arandu-loader.js` centraliza as camadas globais.
- `arandu-public-mode.js` esconde ferramentas internas na navegação pública.
- `arandu-visual-governor.js` controla excesso visual, duplicidades e mobile.
- `arandu-quality-gate.mjs` valida sintaxe, links, duplicidades, carregamento e conteúdo.
- `page-inventory.mjs` lista páginas, scripts, CSS e status do loader.

## Comandos essenciais

```bash
git pull origin main
npm install --include=optional
npm run predeploy
```

Para diagnóstico específico:

```bash
npm run check:quality
npm run check:inventory
```

Relatórios gerados:

```text
reports/arandu-quality-report.json
reports/page-inventory.json
```

## Fluxo prioritário para teste manual

1. `/`
2. `obras.html`
3. `obra.html?id=estudo-de-solo-04`
4. `minha-selecao.html`
5. `proposta-curatorial.html`
6. `contato.html`
7. `autenticidade.html`
8. `verificar-certificado.html`

## Critérios de aprovação visual

- Header sem duplicidade de Pesquisar.
- Explorar funcionando.
- Mobile sem excesso de botões flutuantes.
- Página de obra abre e mostra conteúdo.
- Seleção salva obras e atualiza contagem.
- Proposta e contato preservam contexto.
- Nenhum painel interno visível no modo público normal.

## Modo de depuração

Para ver elementos internos e QA visual:

```text
?debug=1
```

Ou no console:

```js
localStorage.setItem('arandu.debug', 'true')
```

Para voltar ao modo público:

```js
localStorage.removeItem('arandu.debug')
```

## Observação antes do deploy

Só publicar no Vercel se:

```bash
npm run predeploy
```

passar sem erro crítico.
