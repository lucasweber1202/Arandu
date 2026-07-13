# Arandu — MVP operacional programável

Este pacote transforma a definição estratégica do Arandu em fluxo navegável e mensurável dentro do site.

## O que foi implementado

### 1. Página `mvp-operacional.html`

Página central para o pré-lançamento do Arandu com:

- metas do MVP fechado;
- blocos estratégicos de 5 frentes;
- jornada de artistas, compradores e parceiros;
- formulários conectados aos endpoints existentes;
- checklist operacional de 25 entregas;
- calculadora de receita do piloto;
- roadmap local de 8 semanas;
- links para painel e SQL operacional.

### 2. JS `js/mvp-operacional.js`

Camada interativa com:

- submissão de artista para `/api/forms` com `type=submissao-artista`;
- interesse de comprador para `/api/forms`;
- briefing empresarial para `/api/forms` com `type=empresa-intencao`;
- reserva assistida para `/api/reservations`;
- checklist salvo em `localStorage`;
- exportação CSV do checklist e roadmap;
- calculadora de ticket, vendas e comissão;
- rotina local de 8 semanas;
- cópia de prompt técnico.

### 3. CSS `css/arandu-mvp.css`

Camada visual própria para a página do MVP, mantendo:

- vermelho pau-brasil;
- off-white quente;
- grafite/terra;
- visual editorial;
- cards responsivos;
- formulário e roadmap limpos.

### 4. SQL `docs/arandu-mvp-operacional.sql`

Views operacionais para rodar depois do schema base:

- `v_mvp_operational_dashboard`;
- `v_mvp_artist_pipeline`;
- `v_mvp_submission_pipeline`;
- `v_mvp_artwork_price_bands`;
- `v_mvp_certificate_readiness`;
- `v_mvp_commercial_pipeline`;
- `v_mvp_validation_scorecard`.

## Como usar no piloto

1. Publique a branch em preview.
2. Acesse `/mvp-operacional.html`.
3. Use os formulários para testar leads, artistas, briefings e reservas.
4. Rode o SQL `docs/arandu-mvp-operacional.sql` no Supabase.
5. Acompanhe o painel existente em `/painel.html` e os dados no Supabase.
6. Use o checklist para controlar o lançamento fechado.

## Próximos passos técnicos recomendados

- Conectar `v_mvp_operational_dashboard` diretamente ao endpoint `/api/dashboard`.
- Criar cards administrativos específicos para scorecard de validação.
- Adicionar busca por artista/obra nos formulários de reserva.
- Gerar certificado automaticamente quando uma reserva virar venda.
- Criar página pública de coleção com 3 coleções iniciais reais.

## Escopo propositalmente não implementado ainda

O MVP continua sem:

- checkout completo automatizado;
- marketplace aberto;
- leilão;
- assinatura;
- clube de arte;
- revenda;
- sistema complexo de reputação.

Essa decisão preserva a estratégia: validar primeiro artistas, compradores, reservas e confiança antes de escalar tecnologia.
