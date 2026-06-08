# Funcionalidades pré-backend implementadas — Arandu

Esta rodada fortalece a experiência de produto antes de atacar backend complexo.

## 1. Busca global mais forte

`js/site.js` foi expandido com:

- mais páginas indexadas;
- sugestões rápidas;
- categorias de resultado;
- intenção de busca;
- CTA para curadoria guiada.

## 2. Quiz curatorial completo

`encontrar-arte.html` agora funciona como quiz por:

- ambiente;
- sensação;
- orçamento;
- linguagem.

Foi criado `js/quiz-curatorial.js`, que gera resultado com obras, artista recomendado e próximos passos.

## 3. Páginas por intenção

Criadas páginas estáticas para SEO e jornada:

- `arte-para-casa.html`
- `arte-para-apartamento.html`
- `arte-para-empresa.html`
- `arte-para-hotelaria.html`
- `fotografia-brasileira.html`
- `pintura-contemporanea-brasileira.html`
- `escultura-brasileira.html`
- `obras-ate-3000.html`

## 4. Minha Seleção melhorada

`minha-selecao.html` agora tem:

- contexto da seleção;
- campos de briefing;
- comparação da seleção;
- exportação em HTML;
- botão para salvar na conta;
- leitura curatorial mais explícita.

Foi criado `js/selection-tools.js`.

## 5. Comparação de obras

Criada `comparar-obras.html`, comparando fotografia, pintura e escultura por:

- preço;
- técnica;
- dimensão;
- presença visual;
- perfil de comprador;
- obra sugerida.

## 6. Modo iniciante

Criada `guia-primeira-obra.html`, com explicações sobre:

- o que observar;
- como pensar orçamento;
- fotografia, pintura ou escultura;
- certificado;
- preço;
- conversa com curadoria.

## 7. Confiança e processo

Criadas páginas:

- `como-selecionamos-artistas.html`
- `como-precificamos-obras.html`
- `como-funciona-reserva.html`

## 8. Narrativas editoriais

Criadas páginas de artigo:

- `narrativa-primeira-obra.html`
- `narrativa-empresas-arte.html`
- `narrativa-certificado.html`
- `narrativa-fotografia-primeira-compra.html`
- `narrativa-obra-ambiente.html`
- `narrativa-comprar-pintura.html`

`narrativas.html` agora aponta para esses artigos.

## 9. Para artistas mais estratégico

`para-artistas.html` foi reforçada com:

- o que a Arandu oferece;
- comissão e política comercial preliminar;
- checklist de materiais;
- processo após aprovação.

Criada `checklist-portfolio-artista.html`.

## 10. Jornada corporativa específica

Criadas páginas:

- `arte-para-escritorios.html`
- `arte-para-hoteis.html`
- `arte-para-restaurantes.html`
- `arte-para-clinicas.html`
- `arte-para-recepcoes.html`

## Arquivos atualizados

- `encontrar-arte.html`
- `minha-selecao.html`
- `narrativas.html`
- `para-artistas.html`
- `js/site.js`
- `sitemap.xml`
- `scripts/check-static.mjs`

## Como testar

```bash
npm run check:all
npm run build
```

Páginas principais para teste:

- `/encontrar-arte.html`
- `/guia-primeira-obra.html`
- `/comparar-obras.html`
- `/minha-selecao.html`
- `/narrativas.html`
- `/arte-para-empresa.html`
- `/como-precificamos-obras.html`
