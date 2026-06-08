# Data schema — Arandu

Este documento descreve as principais entidades previstas para a plataforma.

## artists

Representa artistas selecionados ou em análise.

Campos principais:

- slug
- name
- city
- state
- bio
- languages
- labels

## artworks

Representa obras disponíveis, reservadas, vendidas ou arquivadas.

Campos principais:

- slug
- artist_id
- title
- year
- technique
- dimensions
- price_cents
- status
- edition_type
- context_tags
- curatorial_note

## collections

Agrupa obras por intenção curatorial.

Exemplos:

- Primeira obra
- Arte para sala
- Arte para escritório
- Presentes autorais
- Fotografia brasileira

## leads

Registra contatos gerais.

Tipos possíveis:

- comprador
- curadoria
- newsletter
- seleção
- empresa
- arquiteto

## artist_submissions

Recebe portfólios de artistas.

Status sugeridos:

- received
- reviewing
- accepted
- declined
- archived

## architect_briefs

Recebe briefings de arquitetos, designers e empresas.

Campos relevantes:

- project_type
- city
- environment
- budget
- deadline
- wall_dimensions
- references_url

## certificates

Registra certificados de autenticidade e procedência.

Campos principais:

- code
- artwork_id
- issued_to
- issued_at
- verification_status
- payload

## saved_selections

Guarda seleções de obras enviadas à curadoria.

Campos principais:

- lead_id
- items
- notes
