-- Arandu — camada operacional do MVP
-- Rodar depois de docs/supabase-schema.sql e docs/supabase-production.sql.
-- Objetivo: medir piloto fechado, captação de artistas, acervo, certificados e funil comercial.

create or replace view v_mvp_operational_dashboard as
select
  (select count(*) from artists) as artists_total,
  (select count(*) from artists where status in ('approved','published')) as artists_ready,
  (select count(*) from artworks) as artworks_total,
  (select count(*) from artworks where published = true and status in ('available','in_conversation','reserved')) as artworks_live,
  (select count(*) from leads where created_at >= now() - interval '30 days') as leads_30d,
  (select count(*) from artist_submissions where created_at >= now() - interval '30 days') as artist_submissions_30d,
  (select count(*) from company_briefs where created_at >= now() - interval '30 days') as company_briefs_30d,
  (select count(*) from reservations where created_at >= now() - interval '30 days') as reservations_30d,
  (select count(*) from reservations where status = 'converted') as converted_reservations_total,
  (select count(*) from proposals where status in ('sent','approved')) as active_proposals,
  (select count(*) from certificates where verification_status = 'valid') as valid_certificates,
  (select count(*) from tasks where status in ('open','doing')) as open_tasks;

create or replace view v_mvp_artist_pipeline as
select
  status,
  coalesce(state, 'sem_uf') as state,
  coalesce(region, 'sem_regiao') as region,
  count(*) as artists,
  count(*) filter (where array_length(languages, 1) is not null) as with_languages,
  count(*) filter (where coalesce(profile, '') <> '' and coalesce(trajectory, '') <> '') as with_profile_ready
from artists
group by status, coalesce(state, 'sem_uf'), coalesce(region, 'sem_regiao')
order by status, artists desc;

create or replace view v_mvp_submission_pipeline as
select
  status,
  coalesce(state, 'sem_uf') as state,
  coalesce(price_range, 'sem_faixa') as price_range,
  count(*) as submissions,
  min(created_at) as first_received_at,
  max(created_at) as last_received_at
from artist_submissions
group by status, coalesce(state, 'sem_uf'), coalesce(price_range, 'sem_faixa')
order by last_received_at desc;

create or replace view v_mvp_artwork_price_bands as
select
  case
    when price is null then 'sob_consulta'
    when price <= 1000 then 'ate_1000_primeira_aquisicao'
    when price <= 3000 then '1001_3000_obras_acessiveis'
    when price <= 8000 then '3001_8000_colecionador_em_formacao'
    when price <= 20000 then '8001_20000_obras_selecionadas'
    else 'acima_20000_obras_especiais'
  end as price_band,
  count(*) as artworks,
  round(avg(price), 2) as avg_price,
  round(sum(price), 2) as gross_inventory_value,
  count(*) filter (where status = 'available' and published = true) as available_live,
  count(*) filter (where certificate = true) as with_certificate_flag
from artworks
group by 1
order by min(price) nulls first;

create or replace view v_mvp_certificate_readiness as
select
  a.id as artwork_id,
  a.title,
  ar.name as artist_name,
  a.status,
  a.published,
  a.certificate as certificate_required,
  c.code as certificate_code,
  c.verification_status,
  case
    when c.verification_status = 'valid' then 'pronto'
    when a.certificate = true and c.id is null then 'certificado_pendente'
    when c.verification_status in ('draft','under_review') then 'em_revisao'
    when c.verification_status = 'revoked' then 'revogado'
    else 'sem_exigencia'
  end as readiness,
  a.created_at
from artworks a
join artists ar on ar.id = a.artist_id
left join certificates c on c.artwork_id = a.id;

create or replace view v_mvp_commercial_pipeline as
select 'lead' as source, status, count(*) as records, min(created_at) as first_at, max(created_at) as last_at from leads group by status
union all
select 'briefing_empresa' as source, status, count(*) as records, min(created_at) as first_at, max(created_at) as last_at from company_briefs group by status
union all
select 'selecao_salva' as source, status, count(*) as records, min(created_at) as first_at, max(created_at) as last_at from saved_selections group by status
union all
select 'reserva' as source, status, count(*) as records, min(created_at) as first_at, max(created_at) as last_at from reservations group by status
union all
select 'proposta' as source, status, count(*) as records, min(created_at) as first_at, max(created_at) as last_at from proposals group by status;

create or replace view v_mvp_validation_scorecard as
select
  'artistas_interessados_30d' as metric,
  count(*)::numeric as value,
  15::numeric as target,
  case when count(*) >= 15 then 'validado' when count(*) >= 8 then 'em_tracao' else 'insuficiente' end as signal
from artist_submissions
where created_at >= now() - interval '30 days'
union all
select
  'compradores_leads_30d',
  count(*)::numeric,
  30::numeric,
  case when count(*) >= 30 then 'validado' when count(*) >= 12 then 'em_tracao' else 'insuficiente' end
from leads
where created_at >= now() - interval '30 days'
union all
select
  'reservas_30d',
  count(*)::numeric,
  3::numeric,
  case when count(*) >= 3 then 'validado' when count(*) >= 1 then 'em_tracao' else 'insuficiente' end
from reservations
where created_at >= now() - interval '30 days'
union all
select
  'obras_publicadas',
  count(*)::numeric,
  40::numeric,
  case when count(*) >= 40 then 'validado' when count(*) >= 20 then 'em_tracao' else 'insuficiente' end
from artworks
where published = true and status in ('available','in_conversation','reserved','sold')
union all
select
  'certificados_validos',
  count(*)::numeric,
  20::numeric,
  case when count(*) >= 20 then 'validado' when count(*) >= 8 then 'em_tracao' else 'insuficiente' end
from certificates
where verification_status = 'valid';

comment on view v_mvp_operational_dashboard is 'Resumo executivo do MVP fechado do Arandu.';
comment on view v_mvp_artist_pipeline is 'Funil de artistas por status, estado e região.';
comment on view v_mvp_artwork_price_bands is 'Faixas de preço e valor potencial de estoque.';
comment on view v_mvp_certificate_readiness is 'Prontidão de certificados por obra.';
comment on view v_mvp_validation_scorecard is 'Scorecard de validação comercial do piloto fechado.';
