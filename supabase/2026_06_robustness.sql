-- Arandu — robustez operacional
-- Rodar após schema.sql e 2026_06_operational_expansion.sql.

create or replace view v_artworks_full as
select
  artworks.*,
  artists.name as artist_name,
  artists.slug as artist_slug,
  artists.city as artist_city,
  artists.state as artist_state,
  coalesce(cert_count.count, 0) as certificate_count,
  coalesce(image_count.count, 0) as image_count
from artworks
left join artists on artists.id = artworks.artist_id
left join (
  select artwork_id, count(*)::int as count from certificates group by artwork_id
) cert_count on cert_count.artwork_id = artworks.id
left join (
  select artwork_id, count(*)::int as count from artwork_images group by artwork_id
) image_count on image_count.artwork_id = artworks.id;

create or replace view v_pipeline_summary as
select 'leads' as source, status, count(*)::int as total from leads group by status
union all
select 'artist_submissions' as source, status, count(*)::int as total from artist_submissions group by status
union all
select 'company_briefs' as source, status, count(*)::int as total from company_briefs group by status
union all
select 'proposals' as source, status, count(*)::int as total from proposals group by status
union all
select 'reservations' as source, status, count(*)::int as total from reservations group by status
union all
select 'tasks' as source, status, count(*)::int as total from tasks group by status;

create or replace view v_quality_issues as
select 'artwork_without_artist' as issue_type, id as entity_id, title as label, 'Obra sem artista vinculado' as description
from artworks where artist_id is null and published = true
union all
select 'published_artwork_without_certificate' as issue_type, artworks.id as entity_id, artworks.title as label, 'Obra publicada sem certificado' as description
from artworks left join certificates on certificates.artwork_id = artworks.id
where artworks.published = true and certificates.id is null
union all
select 'published_artwork_without_image' as issue_type, artworks.id as entity_id, artworks.title as label, 'Obra publicada sem imagem cadastrada' as description
from artworks left join artwork_images on artwork_images.artwork_id = artworks.id
where artworks.published = true and artwork_images.id is null and artworks.image_url is null
union all
select 'artist_without_bio' as issue_type, id as entity_id, name as label, 'Artista publicado sem bio curta' as description
from artists where status = 'published' and coalesce(bio_short, '') = ''
union all
select 'expired_active_reservation' as issue_type, id as entity_id, coalesce(client_name, 'Reserva') as label, 'Reserva ativa com prazo expirado' as description
from reservations where status = 'active' and reserved_until is not null and reserved_until < now()
union all
select 'overdue_task' as issue_type, id as entity_id, title as label, 'Tarefa em aberto com prazo vencido' as description
from tasks where status in ('open','doing') and due_at is not null and due_at < now();

create or replace function public.log_artwork_status_change()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from new.status then
    insert into artwork_events (artwork_id, event_type, payload)
    values (new.id, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if old.price_cents is distinct from new.price_cents then
    insert into artwork_events (artwork_id, event_type, payload)
    values (new.id, 'price_changed', jsonb_build_object('from', old.price_cents, 'to', new.price_cents));
  end if;
  return new;
end;
$$;

drop trigger if exists artwork_status_audit on artworks;
create trigger artwork_status_audit
after update on artworks
for each row execute procedure public.log_artwork_status_change();

create or replace function public.sync_artwork_status_from_reservation()
returns trigger
language plpgsql
as $$
begin
  if new.artwork_id is not null then
    if new.status = 'active' then
      update artworks set status = 'temporarily_reserved' where id = new.artwork_id and status <> 'sold';
      insert into artwork_events (artwork_id, event_type, payload)
      values (new.artwork_id, 'reserved', jsonb_build_object('reservation_id', new.id, 'reserved_until', new.reserved_until));
    elsif new.status in ('expired','cancelled') then
      update artworks set status = 'available' where id = new.artwork_id and status = 'temporarily_reserved';
    elsif new.status = 'converted' then
      update artworks set status = 'sold' where id = new.artwork_id;
      insert into artwork_events (artwork_id, event_type, payload)
      values (new.artwork_id, 'sold', jsonb_build_object('reservation_id', new.id));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reservation_sync_artwork on reservations;
create trigger reservation_sync_artwork
after insert or update on reservations
for each row execute procedure public.sync_artwork_status_from_reservation();
