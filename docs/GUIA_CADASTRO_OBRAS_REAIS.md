# Guia de cadastro de obras reais — Arandu

Use este guia para substituir a base demonstrativa por catálogo real.

## Quantidade mínima

Antes de divulgar publicamente:

- 5 artistas reais;
- 20 obras reais;
- imagens autorizadas;
- preços ou faixas validadas;
- status de disponibilidade confirmado.

## Dados obrigatórios da obra

Cada obra precisa ter:

- título;
- artista;
- técnica;
- suporte, quando aplicável;
- dimensões;
- ano;
- preço ou faixa de preço;
- status: disponível, reservada ou vendida;
- imagem principal;
- texto curto de apresentação;
- leitura curatorial curta.

## Dados recomendados

- imagem de detalhe;
- imagem em ambiente;
- tiragem ou edição, quando aplicável;
- certificado vinculado;
- cidade e estado do artista;
- tags de busca;
- observações de montagem, moldura ou conservação.

## Imagens

Usar, no mínimo:

- uma imagem frontal limpa;
- uma imagem de detalhe;
- uma imagem com escala ou ambiente, quando possível.

Não publicar imagem sem autorização do artista.

## Critério de publicação

Uma obra só deve ir ao ar quando:

- a ficha técnica estiver completa;
- o preço estiver validado;
- a disponibilidade estiver confirmada;
- a imagem estiver autorizada;
- o texto não prometer laudo técnico ou avaliação pericial;
- o certificado estiver coerente com a obra.

## Planilha base

Usar como modelo:

```text
data/catalog-intake-template.csv
```

## Validação final

Depois de cadastrar:

```bash
npm run check:data
npm run check:quality
npm run build
```
