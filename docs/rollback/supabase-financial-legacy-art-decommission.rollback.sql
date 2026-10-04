-- Rollback de docs/supabase-financial-legacy-art-decommission.sql: NÃO EXISTE.
--
-- A aposentadoria removeu tabelas, views e funções da vertical de arte. Recriar
-- tabelas vazias não restauraria nada e seria uma "restauração" falsa; por isso
-- este arquivo só recusa. Caminhos honestos:
--   * código: reverter o merge não precisa de nada no banco (o runtime
--     financeiro não depende dos objetos removidos);
--   * dados: restore do backup verificado tirado antes da aplicação (ver o
--     reconhecimento gravado em fin_settings.legacy_art_decommission e
--     docs/LEGACY_ART_RETIREMENT.md), num banco descartável, e cópia seletiva do
--     que for necessário — forward-fix, com decisão do owner;
--   * schema: forward-fix por migration nova, nunca editando esta.
begin;
do $$ begin
  raise exception 'restore required: legacy art decommission has no schema rollback (use verified backup + forward-fix)';
end $$;
rollback;
