-- Rollback de emergência — supabase-transactions-rbac-audit.sql
-- Este rollback remove funções e constraints novas, mas preserva colunas e dados.
-- Antes de executar, interrompa escritas, faça backup e registre a justificativa.

drop function if exists public.create_commercial_record_atomic(text[], uuid, uuid, uuid, text, text, text, text, numeric, text, jsonb, text, text, text, text, text, text, text, text);
drop function if exists public.apply_catalog_review_atomic(text, text, text, jsonb, text, text, text, text);
drop function if exists public.create_proposal_atomic(text[], uuid, uuid, uuid, text, text, text, text, text, text, text, numeric, text, jsonb, text, text, text, text, text, text, text);
drop function if exists public.expire_reservations(boolean, text, text);
drop function if exists public.create_reservation_atomic(text, uuid, text, text, text, text, text, timestamptz, text, text, jsonb, text, text, text, text, text, text, text, text);
drop function if exists public.cleanup_idempotency(boolean);
drop function if exists public.fail_idempotency(text, text, text, text, text);
drop function if exists public.complete_idempotency(text, text, text, text, integer, jsonb);
drop function if exists public.acquire_idempotency(text, text, text, text, integer, integer);

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'artists', 'artworks', 'certificates', 'leads', 'artist_submissions',
    'company_briefs', 'saved_selections', 'reservations', 'proposals',
    'proposal_items', 'crm_notes', 'tasks', 'media_assets',
    'commercial_records', 'commercial_items', 'privacy_requests'
  ]
  loop
    execute format('drop trigger if exists trg_arandu_audit on public.%I', v_table);
  end loop;
end;
$$;

drop function if exists public.audit_privileged_mutation();
drop function if exists public.arandu_safe_audit_state(jsonb);
drop index if exists public.uq_reservations_one_active_artwork;
drop index if exists public.uq_proposal_items_artwork;

-- As policies antigas de escrita não são restauradas automaticamente. Isso é
-- intencional: reabrir escrita direta exige uma decisão de segurança separada.
