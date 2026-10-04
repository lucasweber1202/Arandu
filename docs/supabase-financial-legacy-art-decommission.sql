-- Aposentadoria dos objetos de banco da antiga vertical de arte
-- (docs/LEGACY_ART_RETIREMENT.md). Marker: financial-legacy-art-decommission-1.
--
-- As migrations históricas que criaram esses objetos continuam imutáveis na
-- cadeia canônica: o clean install cria e depois aposenta, e o estado final é o
-- que vale. Esta migration:
--   A. recusa rodar fora de um schema financeiro com Data Governance;
--   B. recusa apagar qualquer linha de arte (fora as semeadas pelas próprias
--      migrations históricas) sem reconhecimento explícito de
--      export/backup verificado (SET arandu.legacy_art_decommission_ack =
--      'export-verified:<referência>'); registra só contagens como evidência;
--   C. troca a única dependência do produto financeiro (nome padrão do membro
--      lia public.profiles) por leitura dos metadados da própria conta;
--   D. remove o gatilho legado em auth.users, views, funções e tabelas de arte
--      SEM cascade: qualquer dependência inesperada aborta a transação.
-- Infraestrutura compartilhada fica: api_rate_limits/consume_rate_limit,
-- transactional_email_outbox e suas funções de claim/complete/fail.
--
-- Reaplicável: na segunda execução não há objeto nem linha para remover.
-- Destrutiva: não existe rollback que restaure dados; recuperação = restore de
-- backup verificado (docs/rollback/supabase-financial-legacy-art-decommission.rollback.sql).
-- Nenhuma alteração de banco hospedado é autorizada por este arquivo.
begin;

-- A. Só sobre o produto financeiro com P0.11 aplicado (ou esta própria aposentadoria).
do $$ begin
  if to_regclass('public.fin_legal_holds') is null
     or coalesce((select value from public.fin_settings where key = 'schema_version'), '') not in ('financial-data-governance-1', 'financial-legacy-art-decommission-1') then
    raise exception 'legacy art decommission requires schema financial-data-governance-1';
  end if;
end $$;

-- B. Nenhum dado de arte some sem export/backup reconhecido.
do $$
declare
  t text; n bigint; v_total bigint := 0; v_counts jsonb := '{}'::jsonb;
  v_ack text := nullif(current_setting('arandu.legacy_art_decommission_ack', true), '');
begin
  foreach t in array array[
    'artists','artworks','certificates','leads','artist_submissions','company_briefs','saved_selections','reservations','proposals',
    'proposal_items','crm_notes','tasks','artwork_events','media_assets','newsletter_subscriptions','profiles','catalog_releases',
    'curated_collections','collection_artworks','pilot_events','pilot_feedback','catalog_review_history','audit_logs','privacy_requests',
    'idempotency_keys','conversion_events','commercial_records','commercial_items','consignments','logistics_records','orders',
    'order_status_history','data_retention_policies','data_legal_holds','operational_status_history','artist_accounts'
  ] loop
    if to_regclass('public.' || t) is not null then
      -- Linhas semeadas pelas próprias migrations históricas (configuração e
      -- coleções editoriais de exemplo) não são dado de ninguém.
      execute format('select count(*) from public.%I x where %s', t, case t
        when 'catalog_releases' then 'not (x.id = ''production'' and x.dataset_version = ''unconfigured'')'
        when 'curated_collections' then 'x.id not in (''primeira'', ''casa'', ''empresa'', ''brasil'')'
        else 'true' end) into n;
      if n > 0 then v_counts := v_counts || jsonb_build_object(t, n); end if;
      v_total := v_total + n;
    end if;
  end loop;
  if v_total > 0 and (v_ack is null or v_ack !~ '^export-verified:[A-Za-z0-9._:/#-]{3,120}$') then
    raise exception 'legacy art data present (% rows): export or verify backup first, then SET arandu.legacy_art_decommission_ack = ''export-verified:<reference>''', v_total;
  end if;
  if to_regclass('public.artworks') is not null or v_total > 0 then
    insert into public.fin_settings(key, value) values ('legacy_art_decommission', jsonb_build_object(
      'decommissioned_at', now(), 'rows_removed', v_total, 'tables_with_rows', v_counts,
      'acknowledgement', case when v_total > 0 then v_ack end)::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;

-- C. Nome padrão do membro: metadados da conta (full_name do cadastro), não a
--    tabela legada de perfis.
create or replace function public.fin_member_default_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.display_name is null then
    select trim(u.raw_user_meta_data ->> 'full_name') into v_name from auth.users u where u.id = new.user_id;
    if v_name is not null and length(v_name) between 2 and 120 and v_name !~ '[<>@]' then new.display_name := v_name; end if;
  end if;
  return new;
end $$;
revoke all on function public.fin_member_default_name() from public, anon, authenticated;

-- D1. Gatilho legado no cadastro (criava linha em public.profiles).
drop trigger if exists trg_auth_user_profile on auth.users;
drop trigger if exists on_auth_user_created on auth.users;

-- D2. Views de arte (todas de uma vez: dependem entre si).
drop view if exists
  public.v_artworks_full, public.v_available_artworks, public.v_quality_issues, public.v_sales_pipeline, public.v_catalog_readiness,
  public.v_public_catalog, public.v_public_artists, public.v_mvp_operational_dashboard, public.v_mvp_artist_pipeline,
  public.v_mvp_submission_pipeline, public.v_mvp_artwork_price_bands, public.v_mvp_certificate_readiness, public.v_mvp_commercial_pipeline,
  public.v_mvp_validation_scorecard, public.v_public_collections, public.v_public_collection_items, public.v_catalog_editorial_readiness,
  public.v_commercial_pipeline;

-- D3. Tabelas de arte (gatilhos próprios saem com elas; sem cascade).
drop table if exists
  public.order_status_history, public.orders, public.logistics_records, public.consignments, public.commercial_items, public.commercial_records,
  public.collection_artworks, public.curated_collections, public.catalog_review_history, public.catalog_releases, public.artwork_events,
  public.media_assets, public.certificates, public.proposal_items, public.proposals, public.reservations, public.saved_selections,
  public.crm_notes, public.tasks, public.company_briefs, public.artist_submissions, public.leads, public.artist_accounts, public.artworks,
  public.artists, public.newsletter_subscriptions, public.pilot_events, public.pilot_feedback, public.audit_logs, public.privacy_requests,
  public.idempotency_keys, public.conversion_events, public.data_legal_holds, public.data_retention_policies, public.operational_status_history,
  public.profiles;

-- D4. Funções de arte (RPCs, auxiliares e funções de gatilho órfãs).
drop function if exists public.acquire_idempotency(text, text, text, text, integer, integer);
drop function if exists public.complete_idempotency(text, text, text, text, integer, jsonb);
drop function if exists public.fail_idempotency(text, text, text, text, text);
drop function if exists public.cleanup_idempotency(boolean);
drop function if exists public.apply_catalog_review_atomic(text, text, text, jsonb, text, text, text, text);
drop function if exists public.apply_operational_status_atomic(text, text, text, text, text, text, text);
drop function if exists public.operational_transition_allowed(text, text, text);
drop function if exists public.log_operational_status_change();
drop function if exists public.audit_privileged_mutation();
drop function if exists public.arandu_safe_audit_state(jsonb);
drop function if exists public.create_commercial_record_atomic(text[], uuid, uuid, uuid, text, text, text, text, numeric, text, jsonb, text, text, text, text, text, text, text, text);
drop function if exists public.create_order_atomic(uuid, uuid, uuid, text, text, text, text, text, text, text);
drop function if exists public.create_proposal_atomic(text[], uuid, uuid, uuid, text, text, text, text, text, text, text, numeric, text, jsonb, text, text, text, text, text, text, text);
drop function if exists public.create_reservation_atomic(text, uuid, text, text, text, text, text, timestamptz, text, text, jsonb, text, text, text, text, text, text, text, text);
drop function if exists public.expire_reservations(boolean, text, text);
drop function if exists public.transition_order_atomic(uuid, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.transition_order_atomic(uuid, text, text, text, text, text, text, text);
drop function if exists public.enqueue_order_email_events();
drop function if exists public.enqueue_transactional_email_for_user(uuid, text, text, text, text, jsonb, text, text);
drop function if exists public.protect_order_history_append_only();
drop function if exists public.protect_order_immutable_fields();
drop function if exists public.link_artist_account_atomic(uuid, text, text, text, text);
drop function if exists public.revoke_artist_account_atomic(uuid, text, text, text);
drop function if exists public.create_legal_hold(text, text, text, text);
drop function if exists public.release_legal_hold(text, text, text, text);
drop function if exists public.is_under_legal_hold(text, text);
drop function if exists public.execute_data_retention(text, boolean, text, text);
drop function if exists public.handle_new_user_profile();
drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();

insert into public.fin_settings(key, value) values ('schema_version', 'financial-legacy-art-decommission-1')
  on conflict (key) do update set value = excluded.value, updated_at = now();
notify pgrst, 'reload schema';
commit;
