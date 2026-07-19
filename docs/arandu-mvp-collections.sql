-- Arandu — coleções curatoriais do MVP
-- Rodar depois de docs/supabase-sprint2-catalog-readiness.sql.
-- Obrigatório para publicar a rota canônica de coleções.

create table if not exists curated_collections (
  id text primary key,
  slug text unique not null,
  title text not null,
  summary text,
  curatorial_axis text,
  audience text,
  status text default 'published' check (status in ('draft','published','archived')),
  position integer default 1,
  hero_image_url text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists collection_artworks (
  collection_id text references curated_collections(id) on delete cascade,
  artwork_id text references artworks(id) on delete cascade,
  position integer default 1,
  curatorial_note text,
  created_at timestamptz default now(),
  primary key (collection_id, artwork_id)
);

create index if not exists idx_curated_collections_status on curated_collections(status, position);
create index if not exists idx_collection_artworks_collection on collection_artworks(collection_id, position);
create index if not exists idx_collection_artworks_artwork on collection_artworks(artwork_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_curated_collections_updated_at on curated_collections;
create trigger trg_curated_collections_updated_at before update on curated_collections for each row execute function set_updated_at();

insert into curated_collections (id, slug, title, summary, curatorial_axis, audience, position, payload)
values
  ('primeira', 'primeira-colecao', 'Primeira coleção', 'Obras para começar com segurança, repertório e faixa de entrada.', 'Primeira aquisição', 'Comprador iniciante', 1, '{"price_focus":"até R$ 7 mil","mvp":true}'::jsonb),
  ('casa', 'casa-e-apartamento', 'Casa e apartamento', 'Peças para convivência, sala, corredor, biblioteca e quarto.', 'Ambiente doméstico', 'Comprador final', 2, '{"spaces":["sala","biblioteca","quarto"],"mvp":true}'::jsonb),
  ('empresa', 'empresas-e-espacos', 'Empresas e espaços', 'Obras para recepção, escritórios, clínicas, hotéis e restaurantes.', 'Arte para espaços', 'Arquitetos e empresas', 3, '{"spaces":["recepção","escritório","hotel","clínica"],"mvp":true}'::jsonb),
  ('brasil', 'brasil-em-obra', 'Brasil em obra', 'Território, cidade, rio, sertão, corpo, memória e linguagem.', 'Território e memória', 'Colecionador em formação', 4, '{"axes":["território","cidade","natureza","memória"],"mvp":true}'::jsonb)
on conflict (id) do update set
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  curatorial_axis = excluded.curatorial_axis,
  audience = excluded.audience,
  position = excluded.position,
  payload = excluded.payload,
  updated_at = now();

drop view if exists v_public_collection_items;
drop view if exists v_public_collections;

create view v_public_collections as
select
  c.id,
  c.slug,
  c.title,
  c.summary,
  c.curatorial_axis,
  c.audience,
  c.position,
  c.hero_image_url,
  c.created_at,
  c.updated_at,
  count(catalog.id) as artwork_count,
  min(catalog.price) filter (where catalog.price is not null) as starting_price,
  max(catalog.created_at) as last_artwork_at
from curated_collections c
left join collection_artworks ca on ca.collection_id = c.id
left join v_public_catalog catalog on catalog.id = ca.artwork_id
where c.status = 'published'
group by c.id
order by c.position asc, c.created_at desc;

create view v_public_collection_items as
select
  c.id as collection_id,
  c.slug as collection_slug,
  c.title as collection_title,
  ca.position,
  ca.curatorial_note as collection_note,
  catalog.id,
  catalog.slug,
  catalog.title,
  catalog.artist_id,
  catalog.artist_name,
  catalog.artist_city,
  catalog.artist_region,
  catalog.artist_languages,
  catalog.language,
  catalog.type,
  catalog.technique,
  catalog.support,
  catalog.year,
  catalog.dimensions,
  catalog.price,
  catalog.price_label,
  catalog.status,
  catalog.edition,
  catalog.edition_size,
  catalog.certificate,
  catalog.thumb,
  catalog.main_image_url,
  catalog.detail_image_url,
  catalog.room_image_url,
  catalog.recommended_for,
  catalog.tags,
  catalog.moods,
  catalog.spaces,
  catalog.search,
  catalog.summary,
  catalog.curatorial_reading,
  catalog.first_artwork,
  catalog.logistics,
  catalog.created_at,
  catalog.updated_at
from curated_collections c
join collection_artworks ca on ca.collection_id = c.id
join v_public_catalog catalog on catalog.id = ca.artwork_id
where c.status = 'published'
order by c.position asc, ca.position asc;

alter table curated_collections enable row level security;
alter table collection_artworks enable row level security;

drop policy if exists curated_collections_public_read on curated_collections;
create policy curated_collections_public_read on curated_collections for select to anon, authenticated using (status = 'published');

drop policy if exists collection_artworks_public_read on collection_artworks;
create policy collection_artworks_public_read on collection_artworks for select to anon, authenticated using (true);

revoke select on curated_collections from anon, authenticated;
revoke select on collection_artworks from anon, authenticated;
grant select on v_public_collections to anon, authenticated;
grant select on v_public_collection_items to anon, authenticated;

comment on table curated_collections is 'Coleções curatoriais editáveis do MVP Arandu.';
comment on table collection_artworks is 'Relação entre coleções curatoriais e obras.';
