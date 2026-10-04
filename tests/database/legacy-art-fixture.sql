\set ON_ERROR_STOP on
-- Dados FICTÍCIOS da antiga vertical de arte para provar a aposentadoria do
-- banco (docs/supabase-financial-legacy-art-decommission.sql): com linhas de
-- arte presentes, a migration recusa sem reconhecimento de export e, com ele,
-- remove só a vertical. Não testa comportamento de arte (aposentado); só
-- existe para o caminho "há dado a aposentar".
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-4111-8111-111111111111', 'legado-a@example.invalid', '{"full_name":"Pessoa legado A"}')
on conflict (id) do nothing;
insert into public.artists (id, name, slug, status, identity_verified, publishing_consent_at, verified_at, source_reference, editorial_status)
values ('legado-artista-1', 'Legado 1', 'legado-artista-1', 'published', true, now(), now(), 'database-test', 'published')
on conflict (id) do nothing;
insert into public.artworks (id, slug, title, artist_id, price, status, published, main_image_url, image_authorized_at, price_verified_at,
  availability_verified_at, catalog_verified_at, source_reference, editorial_status)
values ('legado-obra-1', 'legado-obra-1', 'Legado obra 1', 'legado-artista-1', 1000, 'available', true, 'https://example.com/legado.webp',
  now(), now(), now(), now(), 'database-test', 'published')
on conflict (id) do nothing;
insert into public.leads (id, user_id, name, status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Lead legado', 'new')
on conflict (id) do nothing;
do $$ begin
  if (select count(*) from public.leads) = 0 or (select count(*) from public.artworks) = 0 then
    raise exception 'fixture de arte não gravou';
  end if;
end $$;
