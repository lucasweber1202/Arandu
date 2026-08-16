-- Arandu — rollback do vínculo verificado entre conta e artista
--
-- Remove o portal do artista. Contas vinculadas perdem o acesso imediatamente.
-- Exporte public.artist_accounts antes de executar.

drop function if exists public.revoke_artist_account_atomic(uuid,text,text,text);
drop function if exists public.link_artist_account_atomic(uuid,text,text,text,text);
drop table if exists public.artist_accounts;
