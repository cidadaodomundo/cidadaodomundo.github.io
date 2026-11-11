-- Retorna ao estado anterior a ativacao de consulta Hellen, preservando a lista de segundos.
CREATE OR REPLACE FUNCTION public.chegada_conferir(p_token text, p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  u       portal_usuario;
  v_dono  boolean;
  -- 24/09/2026: dia da operacao vira as 05h (ver chegada_do_dia)
  v_op    date := ((now() at time zone 'America/Sao_Paulo') - interval '5 hours')::date;
  v_dia   date := coalesce(nullif(p_dados->>'dia','')::date, ((now() at time zone 'America/Sao_Paulo') - interval '5 hours')::date);
  v_uni   text := nullif(p_dados->>'unidade','');
  v_hoje  boolean;
  v_todas jsonb;
  v_linhas jsonb;
  v_placar json;
begin
  u := portal_sessao_usuario(p_token);
  v_dono := coalesce(u.admin, false);
  v_hoje := v_dia = v_op;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_todas
    from (select * from chegada_do_dia(p_token, v_dia)) x
   where v_uni is null or x.unidade = v_uni;

  -- 14/10/2026 (chat-chegada-garantido-14-10): direito ao garantido e ao rango por turno (mesma regra do pagamento).
  -- Desfazer: _backup_ddl 775 (antes de tudo) ou 782 (antes da revisao de 15/10).
  v_todas := chegada_direito(v_todas, v_dia);

  -- 15/10/2026 (chat-chegada-botoes-15-10), pedido do Fabio: botao com/sem garantido e com/sem rango na Chegada.
  -- Vem junto da regra a ultima escolha da equipe (motoboy_direito_manual). Garantido vale o dia (n_turno 0).
  -- null = segue a regra. Desfazer: _backup_ddl 799 (versao antes-botoes-garantido-rango-15-10).
  select coalesce(jsonb_agg(x.e || jsonb_build_object(
           'garantido_manual', g.valor, 'garantido_quem', g.quem, 'garantido_motivo', g.motivo,
           'rango_manual', r.valor, 'rango_quem', r.quem, 'rango_motivo', r.motivo) order by x.ord), '[]'::jsonb)
    into v_todas
    from jsonb_array_elements(v_todas) with ordinality x(e, ord)
    left join lateral (select m.valor, m.quem, m.motivo from motoboy_direito_manual m
                        where m.dia = v_dia and m.unidade = x.e->>'unidade'
                          and m.chave_curta = lower(extensions.unaccent(x.e->>'entregador'))
                          and m.campo = 'garantido' and m.n_turno = 0
                        order by m.id desc limit 1) g on true
    left join lateral (select m.valor, m.quem, m.motivo from motoboy_direito_manual m
                        where m.dia = v_dia and m.unidade = x.e->>'unidade'
                          and m.chave_curta = lower(extensions.unaccent(x.e->>'entregador'))
                          and m.campo = 'rango' and m.n_turno = coalesce((x.e->>'n_turno')::integer, 1)
                        order by m.id desc limit 1) r on true;

  -- 11/09/2026, decisao do Fabio: a hora que o SISTEMA viu, a diferenca e a coluna "bate?"
  -- sao SO DO DONO. Com a hora do sistema na tela, o balcao copia em vez de olhar o relogio.

  -- Fabio 11/11: chegada da fila com segundos; somente consulta, sem mudar regra de pagamento.
  with t as (
   select v.*,lead(v.combinado_em) over w as proximo,
    lag((v.dia_operacional+v.hora_saida+case when v.hora_saida<v.hora_combinada then interval '1 day' else interval '0' end)
       at time zone 'America/Sao_Paulo') over w as fim_anterior
   from public.vw_motoboy_turno_gps v where v.dia_operacional=v_dia
   window w as(partition by v.unidade,v.entregador order by v.n_turno)
  ), dados as (
   select x.e,x.ord,t.chegada,t.hora_saida,
    fila.chegada_fila,qr.saida_qr
   from jsonb_array_elements(v_todas) with ordinality x(e,ord)
   left join t on t.unidade=x.e->>'unidade' and t.entregador=x.e->>'entregador' and t.n_turno=(x.e->>'n_turno')::int
   left join lateral (
    select min(k.chegou_em) as chegada_fila from public.trackeat_chegada k
    where k.dia_operacional=v_dia and k.unidade=x.e->>'unidade' and k.origem='api'
    and lower(extensions.unaccent(public.motoboy_nome_padrao(k.unidade,k.entregador)))
        =lower(extensions.unaccent(public.motoboy_nome_padrao(x.e->>'unidade',x.e->>'entregador')))
    and k.chegou_em>=coalesce(greatest(t.combinado_em-interval '2 hours',t.fim_anterior),(v_dia+time '05:00') at time zone 'America/Sao_Paulo')
    and k.chegou_em<coalesce(least(t.combinado_em+interval '4 hours',t.proximo),(v_dia+1+time '05:00') at time zone 'America/Sao_Paulo')
   ) fila on true
   left join lateral (
    select max(q.ultima_saida) as saida_qr from public.foody_vw_horas_qr q
    where q.dia_operacional=v_dia and q.unidade=x.e->>'unidade' and q.completo and q.sem_batida_saida=0
     and lower(extensions.unaccent(q.nome))=lower(extensions.unaccent(x.e->>'entregador'))
     and t.combinado_em is not null and q.ultima_saida>=t.combinado_em
     and q.ultima_saida<least(coalesce(t.proximo,'infinity'::timestamptz),
       ((v_dia+t.hora_saida+case when t.hora_saida<t.hora_combinada then interval '1 day' else interval '0' end)
          at time zone 'America/Sao_Paulo')+interval '2 hours')
   ) qr on true
  )
  select coalesce(jsonb_agg(d.e||jsonb_build_object(
   'escala_saida_txt',to_char(d.hora_saida,'HH24:MI'),
   'chegada_fila_txt',to_char(d.chegada_fila at time zone 'America/Sao_Paulo','HH24:MI:SS'),
   'chegada_fila_em',d.chegada_fila,
   'saida_registrada_txt',to_char(d.saida_qr at time zone 'America/Sao_Paulo','HH24:MI:SS'),
   'tempo_registrado_min',case when d.saida_qr>=coalesce(d.chegada_fila,d.chegada)
     then round(extract(epoch from(d.saida_qr-coalesce(d.chegada_fila,d.chegada)))/60)::int end,
   'tempo_fonte',case when d.saida_qr is not null then 'intervalo até saída QR' end
  ) order by d.ord),'[]'::jsonb) into v_todas from dados d;

  if v_dono then
    v_linhas := v_todas;
  else
    select coalesce(jsonb_agg(
             (e - 'chegada_fila_txt' - 'chegada_fila_em' - 'sistema_txt' - 'fonte' - 'diferenca_min' - 'trava_txt' - 'chegou_txt' - 'chegou_fonte' - 'atraso_min')
             || jsonb_build_object('situacao',
                  case when e->>'anotado_txt' is not null then 'anotado' else 'esperando o balcao' end)
             -- 15/10/2026 (revisao do supervisor): sem anotacao do balcao, o veredito fica escondido; senao a troca de
             -- "no prazo" para "garantido + rango" entregaria a hora em que o sistema viu a chegada.
             || case when e->>'anotado_txt' is null and coalesce(e->>'direito','') <> 'fora'
                     then jsonb_build_object('direito', 'aguarda_balcao', 'garantido_perdido', false, 'motivo_sem_prova', null)
                     else '{}'::jsonb end
           ), '[]'::jsonb) into v_linhas
      from jsonb_array_elements(v_todas) e;

    -- 15/10/2026 (2a revisao): o garantido perdido e recalculado so com os turnos que a pessoa ve;
    -- senao o turno anotado entregava o veredito do turno ainda escondido. Desfazer: _backup_ddl 783.
    select coalesce(jsonb_agg(m.e || jsonb_build_object('garantido_perdido', m.gp) order by m.ord), '[]'::jsonb) into v_linhas
      from (select x.e, x.ord,
                   coalesce(bool_or(x.e->>'direito' in ('perdeu', 'rango_excecao'))
                              over (partition by x.e->>'unidade', x.e->>'entregador'), false) as gp
              from jsonb_array_elements(v_linhas) with ordinality x(e, ord)) m;
  end if;

  -- turnos e anotados contam TURNO; rodando, fora_escala, sem_sinal e parado contam PESSOA.
  -- 24/09/2026: rodando = trabalhando de verdade (vivo_rodando); app ligado longe e parado conta a parte.
  select json_build_object(
           'turnos',      count(*) filter (where (e->>'na_escala')::boolean),
           'anotados',    count(*) filter (where (e->>'na_escala')::boolean and e->>'anotado_txt' is not null),
           'rodando',     count(distinct (e->>'unidade')||'|'||(e->>'entregador'))
                            filter (where (e->>'vivo_rodando')::boolean),
           'fora_escala', count(distinct (e->>'unidade')||'|'||(e->>'entregador'))
                            filter (where not (e->>'na_escala')::boolean and (e->>'vivo_rodando')::boolean),
           'parado',      count(distinct (e->>'unidade')||'|'||(e->>'entregador'))
                            filter (where e->>'vivo_onde' is not null and not (e->>'vivo_rodando')::boolean),
           'sem_sinal',   count(distinct (e->>'unidade')||'|'||(e->>'entregador'))
                            filter (where (e->>'na_escala')::boolean and e->>'vivo_onde' is null),
           'bateram',     case when v_dono then count(*) filter (where e->>'situacao' = 'bate') end,
           'nao_bateram', case when v_dono then count(*) filter (where e->>'situacao' = 'nao bate') end,
           'perdidos',    case when v_dono then count(*) filter (where e->>'situacao' = 'o sistema perdeu') end,
           'erro_medio',  case when v_dono then round(avg(abs((e->>'diferenca_min')::numeric))
                                                     filter (where e->>'diferenca_min' is not null)) end
         ) into v_placar
    from jsonb_array_elements(v_todas) e;

  -- 14-15/10/2026 (chat-chegada-garantido-14-10): contagem do veredito sobre o que a pessoa ve.
  -- com_direito = garantido E rango; so_rango = ficou com o rango mas perdeu o garantido do dia (outro turno ou excecao do Jaison).
  select (v_placar::jsonb || jsonb_build_object(
           'com_direito', count(*) filter (where e->>'direito' = 'ok' and not coalesce((e->>'garantido_perdido')::boolean, false)),
           'so_rango',    count(*) filter (where (e->>'direito' = 'ok' and coalesce((e->>'garantido_perdido')::boolean, false))
                                                 or e->>'direito' = 'rango_excecao'),
           'perderam',    count(*) filter (where e->>'direito' = 'perdeu'),
           'sem_prova',   count(*) filter (where e->>'direito' = 'sem_prova'),
           'nao_chegaram',count(*) filter (where e->>'direito' = 'nao_chegou'),
           'garantido_perdido', count(distinct (e->>'unidade')||'|'||(e->>'entregador'))
                            filter (where coalesce((e->>'garantido_perdido')::boolean, false))
         ))::json into v_placar
    from jsonb_array_elements(v_linhas) e;

  return json_build_object(
    'dia', v_dia, 'hoje', v_op,
    'agora', to_char(now() at time zone 'America/Sao_Paulo','HH24:MI:SS'),
    'dono', v_dono, 'ao_vivo', v_hoje,
    /* 04/10/2026 (chat-cartoes-operacao-04-10), pedido do Fabio: "essa aqui nao esta atualizada".
       O GPS do TrackEat (foody_presenca) parou em 25/09 e a tela dizia "o sistema nao viu" para todos.
       gps_parado: hoje = nenhum sinal nos ultimos 30 min; dia passado = nenhum sinal desde o comeco daquele dia (5h).
       Desfazer: _backup_ddl 553. */
    'gps_ultimo', (select to_char(max(p.visto_em) at time zone 'America/Sao_Paulo','DD/MM HH24:MI')
                     from foody_presenca p where p.visto_em > now() - interval '60 days'),
    'gps_parado', coalesce((select max(p.visto_em) from foody_presenca p where p.visto_em > now() - interval '60 days')
                     < case when v_hoje then now() - case when extract(hour from now() at time zone 'America/Sao_Paulo') between 4 and 8
                                                    then interval '6 hours'   /* o robo do TrackEat nao roda das ~4h as 9h */
                                                    else interval '30 minutes' end
                            else (v_dia::timestamp + interval '5 hours') at time zone 'America/Sao_Paulo' end, true),
    'tolerancia', motoboy_tolerancia(v_dia),
    /* 10/11/2026 (chat-chegada-gps-decide-10-11): saude do robo que le a fila do TrackEat, por loja (leituras boas do dia,
       das 10h as 03h): ultima leitura, ha quantos minutos, quantas, e o maior buraco. Desfazer: _backup_ddl antes-barra-robo-10-11. */
    'robo', (select coalesce(json_agg(to_json(w) order by w.unidade), '[]'::json)
                 from (select z.unidade,
                              to_char(max(z.lido_em) at time zone 'America/Sao_Paulo', 'HH24:MI') as ultima_txt,
                              floor(extract(epoch from (now() - max(z.lido_em))) / 60.0)::int as min_atras,
                              count(*) filter (where z.fonte = 'api') as leituras,
                              -- 10/11/2026: leitor rapido do site (BENTOIK, 10 em 10 s), so Agua Verde. Desfazer: _backup_ddl antes-barra-site-10-11.
                              count(*) filter (where z.fonte = 'site') as site_leituras,
                              to_char(max(z.lido_em) filter (where z.fonte = 'site') at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as site_ultima_txt,
                              floor(extract(epoch from (now() - max(z.lido_em) filter (where z.fonte = 'site'))))::int as site_seg_atras,
                              coalesce(ceil(extract(epoch from max(z.gap)) / 60.0)::int, 0) as buraco_max_min
                         from (select b.unidade, b.fonte, b.lido_em, b.lido_em - lag(b.lido_em) over (partition by b.unidade order by b.lido_em) as gap
                                 from trackeat_fila_batida b
                                where b.lido_em >= ((v_dia + time '10:00') at time zone 'America/Sao_Paulo')
                                  and b.lido_em <  ((v_dia + 1 + time '03:00') at time zone 'America/Sao_Paulo')
                                  and (v_uni is null or b.unidade = v_uni)) z
                        group by z.unidade) w),
    'linhas', v_linhas, 'placar', v_placar
  );
end $function$
;
CREATE OR REPLACE FUNCTION public.chegada_do_dia(p_token text, p_dia date DEFAULT NULL::date)
 RETURNS TABLE(unidade text, entregador text, n_turno integer, na_escala boolean, escala_txt text, sistema_txt text, fonte text, anotado_txt text, quem text, digitada boolean, diferenca_min integer, situacao text, vivo_onde text, vivo_dist_m integer, vivo_visto text, vivo_fila text, vivo_rodando boolean, vivo_nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  -- 24/09/2026: o dia da OPERACAO vira as 05h. A loja fecha 01h30 e o "fecha" roda ate ~04h;
  -- antes disso a tela usava o dia do calendario e o Jose das 20h/fecha aparecia com a escala do dia seguinte.
  v_op   date := ((now() at time zone 'America/Sao_Paulo') - interval '5 hours')::date;
  v_dia  date := coalesce(p_dia, ((now() at time zone 'America/Sao_Paulo') - interval '5 hours')::date);
  v_hoje boolean := coalesce(p_dia, ((now() at time zone 'America/Sao_Paulo') - interval '5 hours')::date)
                    = ((now() at time zone 'America/Sao_Paulo') - interval '5 hours')::date;
begin
  if not (portal_pode(p_token, 'qualidade') or portal_pode(p_token, 'chegada')) then
    raise exception 'sem permissao para a tela da Chegada do dia' using errcode='42501';
  end if;

  return query
  with turnos as (
    select t.unidade::text as unidade, t.entregador::text as entregador, t.n_turno::int as n_turno,
           lower(extensions.unaccent(t.entregador)) as chave,
           t.hora_combinada as escala, t.chegada as sistema, t.tem_gps as tem_gps
      from vw_motoboy_turno_gps t
     where t.dia_operacional = v_dia
  ),
  anot as (select a.* from chegada_anotada a where a.dia_operacional = v_dia),
  viv as (
    select distinct on (fp.unidade, lower(extensions.unaccent(fp.entregador)))
           fp.unidade::text as unidade, fp.entregador::text as entregador,
           lower(extensions.unaccent(fp.entregador)) as chave,
           fp.no_patio, fp.dist_loja_m, fp.na_fila, fp.disponivel, fp.visto_em,
           (select greatest((max(q.lat)-min(q.lat))*111000, (max(q.lng)-min(q.lng))*102000)
              from foody_presenca q
             where q.unidade = fp.unidade
               and lower(extensions.unaccent(q.entregador)) = lower(extensions.unaccent(fp.entregador))
               and q.visto_em > now() - interval '20 minutes') as mexeu_m
      from foody_presenca fp
     where v_hoje and fp.visto_em > now() - interval '20 minutes'
     order by fp.unidade, lower(extensions.unaccent(fp.entregador)), fp.visto_em desc
     limit 200
  ),
  base as (
    select t.unidade, t.entregador, t.n_turno, true as na_escala, t.chave, t.escala, t.sistema, t.tem_gps
      from turnos t
    union all
    select a.unidade, a.entregador, a.n_turno, false, a.chave_curta, null::time, null::timestamptz, false
      from anot a
     where not exists (select 1 from turnos t
                        where t.unidade = a.unidade and t.chave = a.chave_curta and t.n_turno = a.n_turno)
    union all
    -- 10/09/2026: quem esta com o aplicativo ligado agora e nao esta na escala nem foi anotado.
    -- 24/09/2026: nome do aplicativo "Mateus Ribeiro" = escala "Mateus Ribeiro dos Santos" (um comeca o outro).
    select v.unidade, v.entregador, 1, false, v.chave, null::time, null::timestamptz, false
      from viv v
     where not exists (select 1 from turnos t where t.unidade = v.unidade
                          and (t.chave = v.chave or t.chave like v.chave||' %' or v.chave like t.chave||' %'))
       and not exists (select 1 from anot a where a.unidade = v.unidade and a.chave_curta = v.chave)
  )
  select b.unidade, b.entregador, b.n_turno, b.na_escala,
         to_char(b.escala, 'HH24:MI'),
         to_char(b.sistema at time zone 'America/Sao_Paulo', 'HH24:MI'),
         case when b.sistema is not null and b.tem_gps then 'GPS do aplicativo' end,
         to_char(a.hora_anotada at time zone 'America/Sao_Paulo', 'HH24:MI'),
         a.quem,
         coalesce(a.digitada, false),
         case when b.sistema is not null and a.hora_anotada is not null
              then round(extract(epoch from (a.hora_anotada - b.sistema)) / 60.0)::int end,
         case
           when b.sistema is null and a.hora_anotada is null and not b.na_escala then 'esperando o balcao'
           when b.sistema is null and a.hora_anotada is null then 'nao chegou'
           when a.hora_anotada is null then 'esperando o balcao'
           when b.sistema is null then 'o sistema perdeu'
           when abs(extract(epoch from (a.hora_anotada - b.sistema)) / 60.0) <= 3 then 'bate'
           when abs(extract(epoch from (a.hora_anotada - b.sistema)) / 60.0) <= 10 then 'diferenca pequena'
           else 'nao bate'
         end,
         case when v.chave is null then null
              when v.no_patio then 'no patio'
              when v.dist_loja_m is not null and v.dist_loja_m < 3000 then 'na rua'
              else 'longe' end,
         v.dist_loja_m,
         to_char(v.visto_em at time zone 'America/Sao_Paulo', 'HH24:MI'),
         case when v.chave is null then null
              when v.na_fila then 'na fila'
              when v.disponivel then 'disponivel'
              else 'indisponivel' end,
         -- 24/09/2026, pedido do Fabio: "rodando" e quem esta trabalhando de verdade:
         -- no patio, na fila, disponivel ou se mexeu 100 m ou mais nos ultimos 20 min. 24/09 02h40: em 23/09 19h-23h, 38 de 38 casos perto da loja e 7 longe estavam se mexendo (entregando); a distancia da loja saiu da regra.
         -- Aplicativo ligado, parado, fora da fila e indisponivel NAO e rodando (em geral e o motoboy em casa).
         case when v.chave is null then null
              else (coalesce(v.no_patio,false) or coalesce(v.na_fila,false) or coalesce(v.disponivel,false)
                    or coalesce(v.mexeu_m, 0) >= 100) end,
         case when v.chave is not null and v.chave <> b.chave then v.entregador end
    from base b
    left join anot a on a.unidade = b.unidade and a.chave_curta = b.chave and a.n_turno = b.n_turno
    left join lateral (
      select vv.* from viv vv
       where vv.unidade = b.unidade
         and (vv.chave = b.chave or vv.chave like b.chave||' %' or b.chave like vv.chave||' %')
       order by (vv.chave = b.chave) desc, vv.visto_em desc
       limit 1) v on true
   order by b.unidade, b.escala nulls last, b.entregador, b.n_turno;
end $function$
;
UPDATE public.portal_modulo SET ativo=false WHERE id='hellen_chegada';