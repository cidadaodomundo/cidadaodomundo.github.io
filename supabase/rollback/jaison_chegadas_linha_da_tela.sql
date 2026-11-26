-- Desfaz supabase/changes/jaison_chegadas_linha_da_tela.sql (13/11/2026). Banco pessoal kqvoatdprjwxyadhvtdd.
-- Volta o aviso de chegada ao Jaison para o formato anterior (nome, combinado, chegou, minutos depois).
-- A versao anterior de public.escala_canal_chegadas(boolean) esta guardada em _backup_ddl id 1123
-- (nome 'escala_canal_chegadas', versao 'antes-linha-da-tela-13-11').

do $$
declare v_ddl text;
begin
  select ddl into v_ddl from _backup_ddl where id = 1123 and nome = 'escala_canal_chegadas';
  if v_ddl is null then raise exception 'backup 1123 nao encontrado'; end if;
  execute v_ddl;
end $$;

drop function if exists public.escala_canal_chegadas_linhas(date);
