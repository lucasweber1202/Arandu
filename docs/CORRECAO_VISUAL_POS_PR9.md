# Correção visual pós PR #9

## Problemas identificados no preview

- Frases com fundo branco aplicado por cima de blocos terrosos.
- Textos e títulos quebrando palavra por palavra.
- Cards de obras comprimidos em colunas estreitas.
- Busca comercial com rótulo visível quebrado.
- Falta de harmonia entre tons claros, Pau-Brasil e elementos de compra.

## Correções aplicadas depois do merge inicial

- CSS reescrito para reduzir seletores globais agressivos.
- Remoção de `overflow-wrap:anywhere` aplicado em todos os elementos.
- Tags e preços passam a manter leitura horizontal.
- Seção `Comprar Arte` reconstruída em quatro blocos estáveis:
  - hero;
  - busca;
  - oportunidades;
  - como comprar;
  - peças em destaque.
- Fundo e cards em paleta terrosa, sem remendo branco em frases.

## Validação visual obrigatória

```text
/comprar-arte.html
/
/obras.html
/obra.html?id=estudo-de-solo-04
/confianca.html
```
