-- Arandu — seed inicial demonstrativo

insert into artists (slug, name, city, state, bio_short, bio, languages, axes, labels, status, represented)
values
  ('marina-silveira', 'Marina Silveira', 'São Paulo', 'SP', 'Investiga terra, pigmento e memória doméstica.', 'Investiga terra, pigmento e memória doméstica em pinturas de composição silenciosa.', array['pintura'], array['Metrópoles Brasileiras'], array['matéria','território','abstração brasileira'], 'published', true),
  ('camila-reboucas', 'Camila Rebouças', 'Recife', 'PE', 'Fotografa paisagens, interiores e vestígios.', 'Fotografa paisagens, interiores e vestígios de permanência.', array['fotografia'], array['Brasil Profundo'], array['fotografia documental','memória','território'], 'published', true),
  ('arthur-davila', 'Arthur D''Avila', 'Curitiba', 'PR', 'Pesquisa volume, peso e respiração formal.', 'Pesquisa volume, peso e respiração formal em esculturas de presença silenciosa.', array['escultura'], array['Metrópoles Brasileiras'], array['escultura contemporânea','presença','arquitetura'], 'published', true)
on conflict (slug) do nothing;

insert into artworks (slug, artist_id, title, year, language, technique, dimensions, price_cents, status, edition_type, context_tags, curatorial_note, provenance_note, published)
select 'estudo-de-solo-04', artists.id, 'Estudo de Solo Nº 04', 2026, 'pintura', 'Óleo sobre tela', '120 x 100 cm', 420000, 'available', 'Obra única', array['matéria','memória','reflexão','tons terrosos'], 'Obra de presença silenciosa, indicada para quem busca matéria e força cromática.', 'Obra registrada e certificada pela Arandu.', true
from artists where slug = 'marina-silveira'
on conflict (slug) do nothing;

insert into artworks (slug, artist_id, title, year, language, technique, dimensions, price_cents, status, edition_type, edition_total, context_tags, curatorial_note, provenance_note, published)
select 'sertao-silencioso', artists.id, 'Sertão Silencioso', 2026, 'fotografia', 'Fotografia fine art', '60 x 90 cm', 210000, 'available', 'Edição limitada', 7, array['memória','silêncio','primeira obra'], 'Fotografia de entrada com linguagem documental e poética.', 'Edição certificada pela Arandu.', true
from artists where slug = 'camila-reboucas'
on conflict (slug) do nothing;

insert into artworks (slug, artist_id, title, year, language, technique, dimensions, price_cents, status, edition_type, context_tags, curatorial_note, provenance_note, published)
select 'equilibrio-suspenso', artists.id, 'Equilíbrio Suspenso', 2026, 'escultura', 'Bronze fundido', '45 x 20 cm', 890000, 'in_conversation', 'Obra única', array['equilíbrio','matéria','tensão'], 'Escultura de tensão formal e presença silenciosa.', 'Obra única certificada pela Arandu.', true
from artists where slug = 'arthur-davila'
on conflict (slug) do nothing;

insert into collections (slug, title, description, status)
values
  ('primeira-obra', 'Primeira obra', 'Seleção para quem quer começar a comprar arte com orientação.', 'published'),
  ('arte-para-escritorio', 'Arte para escritório', 'Obras para recepções, salas de reunião e ambientes corporativos.', 'published'),
  ('presentes-autorais', 'Presentes autorais', 'Obras com narrativa, presença e permanência.', 'published')
on conflict (slug) do nothing;

insert into certificates (code, artwork_id, issued_to, issued_at, verification_status, criteria)
select 'ARD-2026-0001', artworks.id, 'Colecionador demonstrativo', now(), 'valid', '{"autoria":true,"ficha_tecnica":true,"imagem":true,"registro_interno":true}'::jsonb
from artworks where slug = 'estudo-de-solo-04'
on conflict (code) do nothing;

insert into narratives (slug, title, category, excerpt, status, published_at)
values
  ('como-escolher-primeira-obra', 'Como escolher sua primeira obra de arte', 'primeira obra', 'Um guia para começar sem reduzir a escolha a preço ou decoração.', 'published', now()),
  ('empresas-e-arte-brasileira', 'Por que empresas devem investir em arte brasileira contemporânea', 'empresas', 'Arte como experiência, cultura e sinal de cuidado.', 'published', now()),
  ('obra-certificada', 'O que significa uma obra certificada', 'autenticidade', 'Autoria, ficha técnica e rastreabilidade.', 'published', now())
on conflict (slug) do nothing;
