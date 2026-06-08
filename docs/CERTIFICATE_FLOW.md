# Fluxo operacional de certificado — Arandu

## Quando emitir

O certificado deve ser emitido após confirmação da venda, disponibilidade da obra e validação final dos dados técnicos.

## Quem valida

- Curadoria Arandu.
- Artista, quando possível.
- Especialista externo, em obras de maior valor ou casos específicos.

## Campos obrigatórios

- Código do certificado.
- Nome da obra.
- Nome do artista.
- Ano.
- Técnica.
- Dimensões.
- Imagem da obra.
- Edição ou obra única.
- Nome do comprador, quando aplicável.
- Data de emissão.
- Assinatura/validação.

## Numeração

Formato inicial sugerido:

```text
ARD-ANO-SEQUENCIAL
Ex.: ARD-2026-0001
```

## Arquivamento

- Guardar PDF do certificado.
- Guardar imagem da obra.
- Guardar dados da venda.
- Guardar validação do artista.

## Verificação

A página `verificar-certificado.html` deve futuramente consultar a tabela `certificates` no banco de dados.

## Status

- valid
- pending
- cancelled
- replaced
- under_review
