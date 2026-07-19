-- Arandu — Sprint 2: catálogo real e prontidão verificável
-- Aplicar depois das políticas de produção e antes da migration do piloto.

alter table public.artists add column if not exists identity_verified boolean not null default false;
alter table public.artists add column if not exists publishing_consent_at timestamptz;
alter table public.artists add column if not exists verified_at timestamptz;
alter table public.artists add column if not exists source_reference text;

alter table public.artworks add column if not exists image_authorized_at timestamptz;
alter table public.artworks add column if not exists price_verified_at timestamptz;
alter table public.artworks add column if not exists availability_verified_at timestamptz;
alter table public.artworks add column if not exists catalog_verified_at timestamptz;
alter table public.artworks add column if not exists source_reference text;

create table if not exists public.catalog_releases (
  id text primary key default 'production',
  dataset_version text not null default 'unconfigured',
  dataset_kind text not null default 'demonstration' check (dataset_kind in ('demonstration','real')),
  verified_ready boolean not null default false,
  verified_by text,
  verified_at timestamptz,
  write_verified_at timestamptz,
  write_verified_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.catalog_releases (id, dataset_version, dataset_kind, verified_ready, notes)
values ('production', 'unconfigured', 'demonstration', false, 'Catálogo ainda não aprovado para publicação.')
on conflict (id) do nothing;

drop trigger if exists trg_catalog_releases_updated_at on public.catalog_releases;
create trigger trg_catalog_releases_updated_at before update on public.catalog_releases
for each row execute function public.set_updated_at();

create index if not exists idx_artists_catalog_verification
  on public.artists(status, identity_verified, verified_at);
create index if not exists idx_artworks_catalog_verification
  on public.artworks(published, status, catalog_verified_at);

create or replace view public.v_catalog_readiness as
with release as (
  select * from public.catalog_releases where id = 'production'
), counts as (
  select
    (select count(*) from public.artists ar
      where ar.status = 'published'
        and ar.identity_verified = true
        and ar.publishing_consent_at is not null
        and ar.verified_at is not null
        and coalesce(ar.source_reference, '') <> '') as verified_artist_count,
    (select count(*) from public.artworks aw
      join public.artists ar on ar.id = aw.artist_id
      where aw.published = true
        and aw.status in ('available','in_conversation','reserved')
        and aw.price > 0
        and coalesce(aw.main_image_url, '') <> ''
        and aw.image_authorized_at is not null
        and aw.price_verified_at is not null
        and aw.availability_verified_at is not null
        and aw.catalog_verified_at is not null
        and coalesce(aw.source_reference, '') <> ''
        and ar.status = 'published'
        and ar.identity_verified = true
        and ar.publishing_consent_at is not null
        and ar.verified_at is not null
        and coalesce(ar.source_reference, '') <> '') as verified_artwork_count
)
select
  release.id,
  release.dataset_version,
  release.dataset_kind,
  release.verified_ready as release_approved,
  release.verified_at,
  release.write_verified_at,
  counts.verified_artist_count,
  counts.verified_artwork_count,
  5::integer as required_artist_count,
  20::integer as required_artwork_count,
  (
    release.dataset_kind = 'real'
    and release.verified_ready = true
    and release.verified_at is not null
    and release.write_verified_at is not null
    and counts.verified_artist_count >= 5
    and counts.verified_artwork_count >= 20
  ) as verified_ready
from release cross join counts;

drop view if exists public.v_public_catalog;
create view public.v_public_catalog as
select
  artwork.id,
  artwork.slug,
  artwork.title,
  artwork.artist_id,
  artist.name as artist_name,
  artist.city as artist_city,
  artist.region as artist_region,
  artist.languages as artist_languages,
  artwork.language,
  artwork.type,
  artwork.technique,
  artwork.support,
  artwork.year,
  artwork.dimensions,
  artwork.price,
  artwork.price_label,
  artwork.status,
  artwork.edition,
  artwork.edition_size,
  artwork.certificate,
  artwork.thumb,
  artwork.main_image_url,
  artwork.detail_image_url,
  artwork.room_image_url,
  artwork.recommended_for,
  artwork.tags,
  artwork.moods,
  artwork.spaces,
  artwork.search,
  artwork.summary,
  artwork.curatorial_reading,
  artwork.first_artwork,
  artwork.logistics,
  artwork.created_at,
  artwork.updated_at
from public.artworks artwork
join public.artists artist on artist.id = artwork.artist_id
where artwork.published = true
  and artwork.status in ('available','in_conversation','reserved')
  and artwork.price > 0
  and coalesce(artwork.main_image_url, '') <> ''
  and artwork.image_authorized_at is not null
  and artwork.price_verified_at is not null
  and artwork.availability_verified_at is not null
  and artwork.catalog_verified_at is not null
  and coalesce(artwork.source_reference, '') <> ''
  and artist.status = 'published'
  and artist.identity_verified = true
  and artist.publishing_consent_at is not null
  and artist.verified_at is not null
  and coalesce(artist.source_reference, '') <> ''
  and exists (select 1 from public.v_catalog_readiness readiness where readiness.verified_ready = true);

drop view if exists public.v_public_artists;
create view public.v_public_artists as
select
  artist.id,
  artist.name,
  artist.slug,
  artist.city,
  artist.state,
  artist.region,
  artist.languages,
  artist.curatorial_axes,
  artist.profile,
  artist.trajectory,
  artist.statement,
  artist.status,
  artist.artist_level,
  artist.image_url,
  artist.studio_image_url,
  artist.created_at,
  artist.updated_at
from public.artists artist
where artist.status = 'published'
  and artist.identity_verified = true
  and artist.publishing_consent_at is not null
  and artist.verified_at is not null
  and coalesce(artist.source_reference, '') <> ''
  and exists (select 1 from public.v_catalog_readiness readiness where readiness.verified_ready = true);

alter table public.catalog_releases enable row level security;

drop policy if exists catalog_releases_public_read on public.catalog_releases;

drop policy if exists artists_public_read on public.artists;
create policy artists_public_read on public.artists for select to anon, authenticated
  using (
    status = 'published'
    and identity_verified = true
    and publishing_consent_at is not null
    and verified_at is not null
    and coalesce(source_reference, '') <> ''
    and exists (
      select 1 from public.catalog_releases release
      where release.id = 'production'
        and release.dataset_kind = 'real'
        and release.verified_ready = true
        and release.verified_at is not null
        and release.write_verified_at is not null
    )
  );

drop policy if exists artworks_public_read on public.artworks;
create policy artworks_public_read on public.artworks for select to anon, authenticated
  using (
    published = true
    and status in ('available','in_conversation','reserved')
    and image_authorized_at is not null
    and price_verified_at is not null
    and availability_verified_at is not null
    and catalog_verified_at is not null
    and coalesce(source_reference, '') <> ''
    and price > 0
    and coalesce(main_image_url, '') <> ''
    and exists (
      select 1 from public.artists artist
      where artist.id = artworks.artist_id
        and artist.status = 'published'
        and artist.identity_verified = true
        and artist.publishing_consent_at is not null
        and artist.verified_at is not null
        and coalesce(artist.source_reference, '') <> ''
    )
    and exists (
      select 1
      from public.catalog_releases release
      where release.id = 'production'
        and release.dataset_kind = 'real'
        and release.verified_ready = true
        and release.verified_at is not null
        and release.write_verified_at is not null
    )
  );

revoke all on public.catalog_releases from anon, authenticated;
revoke select on public.artists from anon, authenticated;
revoke select on public.artworks from anon, authenticated;
grant select on public.v_catalog_readiness to anon, authenticated;
grant select on public.v_public_catalog to anon, authenticated;
grant select on public.v_public_artists to anon, authenticated;

comment on table public.catalog_releases is 'Gate de publicação do catálogo real da Arandu.';
comment on view public.v_catalog_readiness is 'Prontidão calculada: aprovação, escrita verificada, 5 artistas e 20 obras reais.';
comment on view public.v_public_catalog is 'Colunas públicas de obras verificadas, sem payload nem campos de auditoria.';
comment on view public.v_public_artists is 'Colunas públicas de artistas verificados, sem dados internos de comprovação.';
