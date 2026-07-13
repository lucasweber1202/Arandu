-- Arandu — coleções curatoriais do MVP
-- Rodar depois de docs/supabase-schema.sql.
-- Opcional, mas recomendado para transformar as coleções em dados editáveis.

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

create or replace view v_public_collections as
select
  c.*,
  count(ca.artwork_id) as artwork_count,
  min(a.price) filter (where a.price is not null and a.published = true) as starting_price,
  max(a.created_at) as last_artwork_at
from curated_collections c
left join collection_artworks ca on ca.collection_id = c.id
left join artworks a on a.id = ca.artwork_id and a.published = true and a.status in ('available','in_conversation','reserved','sold')
where c.status = 'published'
group by c.id
order by c.position asc, c.created_at desc;

create or replace view v_public_collection_items as
select
  c.id as collection_id,
  c.slug as collection_slug,
  c.title as collection_title,
  ca.position,
  ca.curatorial_note as collection_note,
  a.*,
  ar.name as artist_name,
  ar.city as artist_city,
  ar.state as artist_state,
  ar.region as artist_region
from curated_collections c
join collection_artworks ca on ca.collection_id = c.id
join artworks a on a.id = ca.artwork_id
join artists ar on ar.id = a.artist_id
where c.status = 'published'
  and a.published = true
  and a.status in ('available','in_conversation','reserved','sold')
order by c.position asc, ca.position asc;

alter table curated_collections enable row level security;
alter table collection_artworks enable row level security;

drop policy if exists curated_collections_public_read on curated_collections;
create policy curated_collections_public_read on curated_collections for select to anon, authenticated using (status = 'published');

drop policy if exists collection_artworks_public_read on collection_artworks;
create policy collection_artworks_public_read on collection_artworks for select to anon, authenticated using (true);

comment on table curated_collections is 'Coleções curatoriais editáveis do MVP Arandu.';
comment on table collection_artworks is 'Relação entre coleções curatoriais e obras.';
