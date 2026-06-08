-- Arandu — seed inicial demonstrativo

insert into artists (slug, name, city, state, bio, languages, labels)
values
  ('marina-silveira', 'Marina Silveira', 'São Paulo', 'SP', 'Investiga terra, pigmento e memória doméstica em pinturas de composição silenciosa.', array['pintura'], array['matéria e território','abstração brasileira','natureza e paisagem']),
  ('camila-reboucas', 'Camila Rebouças', 'Recife', 'PE', 'Fotografa paisagens, interiores e vestígios de permanência.', array['fotografia'], array['fotografia documental','sertões e territórios','memória']),
  ('arthur-davila', 'Arthur D''Avila', 'Curitiba', 'PR', 'Pesquisa volume, peso e respiração formal em esculturas de presença silenciosa.', array['escultura'], array['escultura contemporânea','presença','arquitetura'])
on conflict (slug) do nothing;

insert into artworks (slug, artist_id, title, year, technique, dimensions, price_cents, status, edition_type, context_tags, curatorial_note)
select 'estudo-de-solo-04', artists.id, 'Estudo de Solo Nº 04', 2026, 'Óleo sobre tela', '120 x 100 cm', 420000, 'available', 'Obra única', array['sala','recepção','obra grande','primeira coleção'], 'Obra de presença silenciosa, indicada para ambientes que pedem matéria e força cromática.'
from artists where slug = 'marina-silveira'
on conflict (slug) do nothing;

insert into artworks (slug, artist_id, title, year, technique, dimensions, price_cents, status, edition_type, context_tags, curatorial_note)
select 'sertao-silencioso', artists.id, 'Sertão Silencioso', 2026, 'Fotografia fine art', '60 x 90 cm', 210000, 'available', 'Edição de 7', array['primeira obra','presente','apartamento'], 'Fotografia de entrada com linguagem documental e poética.'
from artists where slug = 'camila-reboucas'
on conflict (slug) do nothing;

insert into artworks (slug, artist_id, title, year, technique, dimensions, price_cents, status, edition_type, context_tags, curatorial_note)
select 'equilibrio-suspenso', artists.id, 'Equilíbrio Suspenso', 2026, 'Bronze fundido', '45 x 20 cm', 890000, 'reserved', 'Obra única', array['escritório','empresa','escultura'], 'Escultura de tensão formal indicada para recepções e projetos corporativos.'
from artists where slug = 'arthur-davila'
on conflict (slug) do nothing;

insert into collections (slug, title, description)
values
  ('primeira-obra', 'Primeira obra', 'Seleção para quem quer começar a comprar arte com orientação.'),
  ('arte-para-escritorio', 'Arte para escritório', 'Obras para recepções, salas de reunião e ambientes corporativos.'),
  ('presentes-autorais', 'Presentes autorais', 'Obras com narrativa, presença e permanência.')
on conflict (slug) do nothing;

insert into certificates (code, artwork_id, issued_to, issued_at, verification_status)
select 'ARD-2026-0001', artworks.id, 'Colecionador demonstrativo', now(), 'valid'
from artworks where slug = 'estudo-de-solo-04'
on conflict (code) do nothing;
