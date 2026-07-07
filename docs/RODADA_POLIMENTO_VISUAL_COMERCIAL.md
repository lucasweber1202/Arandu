# Rodada de polimento visual e comercial

## Objetivo

Melhorar leitura, contraste, sensação de compra e organização visual do Arandu antes de nova rodada de validação em preview.

## O que foi ajustado

- Criação de uma camada global de contraste e legibilidade em `css/arandu-visual-commercial-polish.css`.
- Prevenção de textos sobrepostos por meio de regras de `overflow-wrap`, `min-width: 0`, isolamento de seções e controle de elementos decorativos.
- Melhor hierarquia de leitura para títulos, parágrafos, cards, notas de confiança, botões e tags.
- Criação de `js/arandu-visual-commercial-polish.js` para:
  - inserir busca visível em páginas comerciais quando ela não existir;
  - conectar a busca da página Comprar Arte;
  - aplicar classes de leitura em parágrafos longos;
  - reforçar rótulos de compra e reserva.
- Reformulação de `comprar-arte.html` com:
  - hero mais humano;
  - busca por técnica, artista ou intenção;
  - seção “Oportunidades no acervo”;
  - três peças para considerar;
  - explicação mais clara do processo de compra acompanhada.

## Referências usadas como direção

A lógica aplicada se inspirou em padrões de galeria online já usados no mercado, especialmente:

- navegação por artistas, obras, categorias e oportunidades de acervo;
- destaque para peças selecionadas;
- busca visível;
- coleções por inspiração, formato e intenção de compra;
- linguagem de entrada mais próxima de “colecionar” do que de comprar um produto comum.

## Validação recomendada

```bash
npm run check:quality
npm run check:all
npm run build
```

Páginas para olhar visualmente no preview:

```text
/
/comprar-arte.html
/obras.html
/obra.html?id=estudo-de-solo-04
/para-artistas.html
/confianca.html
/admin.html
```

## Observação

A seção de oportunidades não deve ser tratada como desconto falso. A redação usa “oportunidade”, “faixa acessível” e “seleção da semana” para motivar compra sem afirmar promoção real quando ainda não existe política comercial de desconto configurada.
