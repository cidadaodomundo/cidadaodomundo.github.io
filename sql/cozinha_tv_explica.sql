create or replace function public.cozinha_tv_explica(p_token text, p_dados jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer stable
set search_path to 'public','extensions','pg_temp' set statement_timeout to '10s'
as $function$
/* 25/11/2026 (thread "Mostrar explicação completa do erro ao clicar", projeto Qualidade): porta SO-LEITURA do painel
   "explicacao completa" da lista de erros da TV, so na versao do dono (admin + modulo tvdono, igual cozinha_camera).
   Devolve a conversa inteira do chat iFood de UM pedido (dia da cozinha 6h-6h), sem o nome do cliente. Nao grava nada. */
declare v_loja text := p_dados->>'loja'; v_ped text := nullif(trim(p_dados->>'pedido'),''); v_dia date; u portal_usuario;
  v_ini timestamptz; v_fim timestamptz; v_msgs jsonb; v_n int; v_lido timestamptz;
begin
  if v_loja is null or v_loja not in ('Água Verde','São Braz','Ahú') then raise exception 'loja invalida' using errcode='22023'; end if;
  u := portal_sessao_usuario(p_token);
  if not (coalesce(u.admin,false) and portal_pode(p_token,'tvdono')) then raise exception 'sem acesso a esta tela' using errcode='42501'; end if;
  begin v_dia := (p_dados->>'dia')::date; exception when others then v_dia := null; end;
  if v_ped is null or v_dia is null then return jsonb_build_object('msgs','[]'::jsonb,'conversas',0); end if;
  v_ini := (v_dia::timestamp + interval '6 hours') at time zone 'America/Sao_Paulo';
  v_fim := v_ini + interval '1 day';
  select count(*) into v_n from ifood_chat_conversa c
   where c.unidade=v_loja and c.pedido_curto=v_ped and c.criado_em>=v_ini - interval '2 hours' and c.criado_em<v_fim;
  with conv as (select c.canal_url from ifood_chat_conversa c
                 where c.unidade=v_loja and c.pedido_curto=v_ped and c.criado_em>=v_ini - interval '2 hours' and c.criado_em<v_fim),
       m as (select m.enviado_em, m.papel, m.tipo, m.texto,
                    lag(m.texto) over (partition by m.canal_url order by m.enviado_em, m.id) ant
               from ifood_chat_mensagem m join conv using (canal_url))
  select coalesce(jsonb_agg(jsonb_build_object(
           'h', to_char(enviado_em at time zone 'America/Sao_Paulo','HH24:MI'),
           'papel', papel, 'tipo', tipo, 'texto', left(texto,1500),
           'problema', (papel='sistema' and coalesce(ant,'') ilike 'Cliente informou problema%' and coalesce(tipo,'texto')<>'foto'))
         order by enviado_em),'[]'::jsonb)
    into v_msgs from m where coalesce(texto,'')<>'' or tipo='foto';
  select max(atualizado_em) into v_lido from ifood_chat_conversa where unidade=v_loja;
  return jsonb_build_object('msgs',v_msgs,'conversas',v_n,
    'lido_em',to_char(v_lido at time zone 'America/Sao_Paulo','DD/MM HH24:MI'));
end $function$;
revoke all on function public.cozinha_tv_explica(text,jsonb) from public;
grant execute on function public.cozinha_tv_explica(text,jsonb) to anon, authenticated;
