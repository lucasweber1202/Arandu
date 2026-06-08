# Plano de backend — Arandu

## Objetivo

Transformar o MVP estático em plataforma operacional com catálogo dinâmico, formulários reais, painel interno, certificados e relacionamento com compradores, artistas e arquitetos.

## Etapa 1 — Formulários reais

Prioridade:

- contato de comprador;
- briefing de arquiteto;
- solicitação de empresa;
- submissão de artista;
- newsletter;
- envio da Minha Seleção.

Soluções possíveis:

- Formspree para validação rápida;
- Resend para e-mail transacional;
- Supabase para banco de dados;
- backend próprio em fase posterior.

## Etapa 2 — Supabase

Usar `supabase/schema.sql` como ponto de partida.

Tabelas principais:

- artists;
- artworks;
- collections;
- artwork_collections;
- leads;
- artist_submissions;
- architect_briefs;
- certificates;
- saved_selections.

## Etapa 3 — Painel interno

Módulos:

- obras;
- artistas;
- leads;
- briefings;
- submissões;
- certificados;
- coleções;
- status comercial.

## Etapa 4 — Certificados

Funcionalidades:

- gerar código único;
- vincular obra;
- registrar comprador;
- emitir PDF;
- página pública de verificação.

## Etapa 5 — Comercialização

Funcionalidades futuras:

- reserva de obra;
- disponibilidade;
- proposta comercial;
- pagamento;
- entrega;
- seguro;
- pós-venda.
