-- Hardening da superfície exposta ao PostgREST no banco do piloto financeiro.
-- Aditivo, idempotente, sem DROP. Rollback: docs/rollback/supabase-financial-pilot-surface-hardening.rollback.sql
--
-- Contexto: no Supabase, `alter default privileges` concede ALL a anon e
-- authenticated em toda tabela, view e função nova do schema public. Um
-- `revoke ... from public` não retira essas concessões diretas. Este arquivo
-- fecha o que ficou exposto por isso, reproduzido no Postgres/PostgREST reais
-- da Supabase (scripts/pilot-local) e registrado nos advisors do projeto piloto.
--
-- Absorve a PR #76 (docs/supabase-financial-pilot-advisor-hardening.sql), já
-- aplicada à mão no piloto: reaplicar este arquivo lá é no-op para esses itens.
-- NÃO aplicar ao projeto legado de arte: as views do catálogo público de arte
-- deixam de ser legíveis por anon (a vertical de arte não é publicada).

-- 1. Tabelas de arte sem RLS. Nenhuma é usada pelo domínio financeiro; o
--    service role e as funções SECURITY DEFINER (donas das tabelas) seguem
--    funcionando porque atravessam o RLS.
do $$
declare t text;
begin
  foreach t in array array['artwork_events','api_rate_limits','crm_notes','media_assets','tasks'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- 2. Views legadas de arte. Views comuns rodam com o privilégio do dono e
--    atravessam o RLS das tabelas de base (advisor security_definer_view).
--    Passam a respeitar o RLS de quem consulta e deixam de ser legíveis pelo
--    cliente. O piloto não publica a vertical de arte.
do $$
declare v text;
begin
  foreach v in array array[
    'v_artworks_full','v_available_artworks','v_catalog_editorial_readiness','v_catalog_readiness',
    'v_commercial_pipeline','v_mvp_artist_pipeline','v_mvp_artwork_price_bands',
    'v_mvp_certificate_readiness','v_mvp_commercial_pipeline','v_mvp_operational_dashboard',
    'v_mvp_submission_pipeline','v_mvp_validation_scorecard','v_public_artists','v_public_catalog',
    'v_public_collection_items','v_public_collections','v_quality_issues','v_sales_pipeline'
  ] loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = on)', v);
      execute format('revoke all on public.%I from anon, authenticated', v);
    end if;
  end loop;
end $$;

-- 3. Funções de gatilho não são RPC. O Postgres só confere EXECUTE da função
--    de gatilho ao criar o gatilho; revogar não altera nenhum gatilho.
--    As de arte são tratadas só se existirem (o fluxo de upgrade não tem todas).
do $$
declare f text;
begin
  foreach f in array array[
    'public.audit_privileged_mutation()','public.enqueue_order_email_events()','public.handle_new_user_profile()',
    'public.log_operational_status_change()','public.protect_order_history_append_only()',
    'public.protect_order_immutable_fields()','public.set_updated_at()',
    'public.operational_transition_allowed(text,text,text)','public.arandu_safe_audit_state(jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;
revoke all on function public.fin_capture_rfq_revision() from public, anon, authenticated;
revoke all on function public.fin_log_rfq_revision() from public, anon, authenticated;
revoke all on function public.fin_seed_rfq_revision() from public, anon, authenticated;
revoke all on function public.fin_notify_event() from public, anon, authenticated;
revoke all on function public.fin_stamp_proposal_rfq_revision() from public, anon, authenticated;
revoke all on function public.fin_clear_submitted_draft() from public, anon, authenticated;
revoke all on function public.fin_apply_notification_preference() from public, anon, authenticated;
revoke all on function public.fin_enqueue_notification_email() from public, anon, authenticated;
revoke all on function public.fin_member_default_name() from public, anon, authenticated;

-- 4. Auxiliares chamadas só de dentro de funções SECURITY DEFINER (que rodam
--    como o dono). Expostas, vazavam informação a qualquer conta autenticada:
--    - fin_pilot_access_allowed: dizia se um e-mail/domínio está na allowlist
--      do piloto (a lista de quem participa é, ela mesma, informação);
--    - fin_comment_object_org: dizia a organização dona de qualquer UUID de
--      RFQ, proposta, aprovação, decisão, contrato ou tarefa de outro tenant.
revoke all on function public.fin_pilot_access_allowed(text) from public, anon, authenticated;
revoke all on function public.fin_comment_object_org(text, uuid) from public, anon, authenticated;
--    (operational_transition_allowed e arandu_safe_audit_state, auxiliares de
--    arte chamadas só por funções SECURITY DEFINER, foram revogadas acima.)

-- 5. search_path mutável (advisor function_search_path_mutable). As três
--    usam apenas pg_catalog (now(), VALUES, operador jsonb - text[]).
do $$
declare f text;
begin
  foreach f in array array['public.set_updated_at()','public.operational_transition_allowed(text,text,text)','public.arandu_safe_audit_state(jsonb)'] loop
    if to_regprocedure(f) is not null then execute format('alter function %s set search_path = %L', f, ''); end if;
  end loop;
  if to_regprocedure('public.enqueue_transactional_email_for_user(uuid,text,text,text,text,jsonb,text,text)') is not null then
    alter function public.enqueue_transactional_email_for_user(uuid, text, text, text, text, jsonb, text, text)
      set search_path = public, extensions;
  end if;
end $$;

-- 5b. enqueue_transactional_email_for_user fixa search_path = public e chamava
--     digest() do pgcrypto, que no Supabase mora em `extensions`: o gatilho de
--     e-mail de pedido falhava com "function digest(text, unknown) does not
--     exist". O arquivo de origem passou a usar sha256() do núcleo; bancos já
--     instalados recebem o schema no caminho (extensions não é gravável por
--     anon/authenticated).
--     (aplicado no bloco acima, junto das outras.)

-- 6. Convite de membro exige e-mail confirmado, como o convite de provedor
--    (docs/supabase-financial-final-hardening.sql). Sem isso, uma conta com o
--    e-mail do convidado ainda não confirmado aceitaria o convite.
create or replace function public.fin_accept_member_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.fin_member_invitations%rowtype; v_email text; v_confirmed timestamptz;
begin
  if auth.uid() is null or coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'invalid invitation'; end if;
  select nullif(lower(trim(coalesce(email, ''))), ''), email_confirmed_at into v_email, v_confirmed
    from auth.users where id = auth.uid();
  select * into v_inv from public.fin_member_invitations
    where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and accepted_at is null and expires_at > now()
    for update;
  if not found or v_email is null or v_confirmed is null or v_inv.email is distinct from v_email then
    raise exception 'invalid invitation';
  end if;
  insert into public.fin_members (organization_id, user_id, role)
    values (v_inv.organization_id, auth.uid(), v_inv.role)
    on conflict (organization_id, user_id) do nothing;
  update public.fin_member_invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.organization_id;
end $$;
revoke all on function public.fin_accept_member_invitation(text) from public, anon;
grant execute on function public.fin_accept_member_invitation(text) to authenticated;

insert into public.fin_settings (key, value) values ('schema_version', 'financial-surface-hardening-1')
  on conflict (key) do update set value = excluded.value, updated_at = now();
