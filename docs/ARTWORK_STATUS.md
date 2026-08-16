# Matriz de status das obras — Arandu

Esta é a matriz **operacional** da obra, aplicada por
`public.apply_operational_status_atomic`. As rotas válidas entre estes status,
as permissões exigidas e a trilha de histórico estão em
`docs/OPERATIONAL_STATUS_FLOW.md`.

O estado editorial da obra (`draft`, `documentation_pending`,
`curatorial_review`, `approved`, `published`, `rejected`, `archived`) é um eixo
separado, gravado em `editorial_status` e decidido em `/api/catalog-review`.
Uma obra só chega ao catálogo público com os dois eixos resolvidos.

## available

Obra disponível para venda ou proposta curatorial.

Exige `image_authorized_at` registrado: sem autorização de imagem a obra não é
oferecida. Vem de `in_conversation`, `reserved` ou `not_published`.

## in_conversation

Há conversa comercial ativa sobre a obra, sem reserva formalizada. Serve para
não oferecer a mesma obra a dois interessados sem contexto.

## reserved

Obra temporariamente reservada para comprador, arquiteto ou projeto. Deve ter
prazo claro na reserva correspondente. É o único status que leva a `sold`.

## sold

Obra vendida. Exige preço registrado. Deve ter certificado emitido e dados de
venda registrados.

Status terminal do ponto de vista comercial: obra vendida não volta a
`available`. O único caminho seguinte é `archived`.

## not_published

Obra cadastrada e fora da vitrine — documentação incompleta, imagem sem
autorização, preço não verificado ou decisão curatorial de não expor.
Substitui os antigos rótulos `pending_documentation` e `exhibition_only`, que
nunca existiram no banco.

## archived

Obra fora do acervo comercial. Pode permanecer no histórico do artista, mas não
aparece como disponível. Volta apenas para `not_published`, nunca direto para
`available`.
