-- Arandu — beta pública 2026-08-28
-- Amplia o vocabulário de eventos de conversão com a candidatura de artista.
--
-- Sem este evento não existe medição do funil que define a beta: tráfego
-- externo -> página de artistas -> portfólio enviado. O CHECK original foi
-- escrito em docs/supabase-sprint6-12-platform.sql e precisa ser recriado
-- porque Postgres não permite estender uma restrição existente.
--
-- Idempotente: pode ser reaplicada sobre um banco que já recebeu a mudança.

alter table public.conversion_events
  drop constraint if exists conversion_events_event_type_check;

alter table public.conversion_events
  add constraint conversion_events_event_type_check
  check (event_type in (
    'search',
    'catalog_view',
    'artwork_view',
    'selection_add',
    'contact_start',
    'reservation_start',
    'reservation_complete',
    'submit_artist_application'
  ));
