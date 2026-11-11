-- Pedido do Fabio em 11/11/2026. Vigencia financeira 11/11; lacres anteriores preservados.

CREATE SCHEMA IF NOT EXISTS cdm_interno;
REVOKE ALL ON SCHEMA cdm_interno FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION cdm_interno.chegada_medicao(
 p_dia date,p_unidade text,p_nome text,p_turno integer,p_combinado timestamptz,p_ini timestamptz,p_fim timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,extensions,pg_temp AS $f$
WITH nome AS (SELECT lower(extensions.unaccent(public.motoboy_nome_padrao(p_unidade,p_nome))) AS k),
eventos AS (
 SELECT p.visto_em AS ts, CASE WHEN p.origem='trackeat-site' THEN 'site' ELSE 'api' END AS fonte
 FROM public.foody_presenca p,nome
 WHERE p.dia_operacional=p_dia AND p.unidade=p_unidade AND (p.no_patio OR p.na_fila)
 AND lower(extensions.unaccent(public.motoboy_nome_padrao(p_unidade,p.entregador)))=nome.k
 AND p.visto_em>=p_ini AND p.visto_em<p_fim
 UNION ALL
 SELECT k.chegou_em,CASE WHEN k.origem='site' THEN 'site' ELSE 'api' END
 FROM public.trackeat_chegada k,nome
 WHERE k.dia_operacional=p_dia AND k.unidade=p_unidade
 AND lower(extensions.unaccent(public.motoboy_nome_padrao(p_unidade,k.entregador)))=nome.k
 AND k.chegou_em>=p_ini AND k.chegou_em<p_fim
),
fontes AS (
 SELECT min(ts) FILTER(WHERE fonte='site') AS site,min(ts) FILTER(WHERE fonte='api') AS api FROM eventos
),
balcao AS (
 SELECT a.hora_anotada AS ts,a.quem,a.digitada FROM public.chegada_anotada a,nome
 WHERE a.dia_operacional=p_dia AND a.unidade=p_unidade AND a.n_turno=p_turno
 AND lower(extensions.unaccent(public.motoboy_nome_padrao(p_unidade,a.entregador)))=nome.k
 AND a.hora_anotada>=p_ini AND a.hora_anotada<p_fim ORDER BY a.id DESC LIMIT 1
),
x AS (
 SELECT fontes.*,b.ts AS balcao,b.quem,b.digitada,
 -- O leitor de segundos e a fonte principal; a API cobre a ausencia dele.
 coalesce(site,api) AS oficial,
 motoboy_tolerancia(p_dia) AS tolerancia,
 trackeat_fila_cega(p_unidade,p_combinado,motoboy_tolerancia(p_dia)::int) AS robo_cego
 FROM fontes LEFT JOIN balcao b ON true
),
y AS (
 SELECT x.*,CASE WHEN oficial IS NOT NULL AND balcao IS NOT NULL THEN oficial+(balcao-oficial)/2 END AS media,
 abs(extract(epoch FROM oficial-balcao)) AS diferenca_seg,
 CASE WHEN site IS NOT NULL AND api IS NOT NULL THEN abs(extract(epoch FROM site-api)) END AS coletores_diferenca_seg,
 p_combinado+make_interval(mins=>tolerancia::int) AS limite FROM x
),
z AS (
 SELECT y.*,CASE
 WHEN oficial IS NULL THEN 'sem_coleta'
 WHEN balcao IS NULL THEN 'sem_balcao'
 WHEN diferenca_seg>180 THEN 'divergencia_balcao'
 WHEN coletores_diferenca_seg>180 THEN 'divergencia_coletores'
 WHEN (oficial>limite) IS DISTINCT FROM (balcao>limite) THEN 'limite_divergente'
 WHEN robo_cego THEN 'falha_coleta'
 ELSE 'conferido' END AS status FROM y
)
SELECT jsonb_build_object(
 'site',site,'api',api,'oficial',oficial,'balcao',balcao,'media',media,
 'fonte_oficial',CASE WHEN site IS NOT NULL THEN 'leitor de segundos' WHEN api IS NOT NULL THEN 'API de reserva' END,
 'diferenca_seg',round(diferenca_seg,3),'coletores_diferenca_seg',round(coletores_diferenca_seg,3),
 'status',status,'quem',quem,'digitada',digitada,'robo_cego',robo_cego,
 'furou',CASE WHEN status='conferido' THEN media>limite ELSE NULL END,
 'regra','media_oficial_balcao_v1','vigencia','2026-11-11',
 'observacao','Media de duas fontes; divergencia acima de 3 min, limite discordante ou fonte ausente exige conferencia e nao gera corte automatico.'
) FROM z;
$f$;
REVOKE ALL ON FUNCTION cdm_interno.chegada_medicao(date,text,text,integer,timestamptz,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE VIEW cdm_interno.chegada_turno_anterior WITH(security_invoker=true) AS  WITH par AS (
         SELECT COALESCE(max(motoboy_param.valor) FILTER (WHERE motoboy_param.chave = 'tolerancia_atraso_min'::text), 30::numeric) AS tol
           FROM motoboy_param
        ), turno AS (
         SELECT foody_escala.unidade,
            foody_escala.data AS dia_operacional,
            foody_escala.nome AS entregador,
            foody_escala.entrada,
            foody_escala.saida,
            row_number() OVER (PARTITION BY foody_escala.unidade, foody_escala.data, foody_escala.nome ORDER BY foody_escala.entrada) AS n_turno,
            count(*) OVER (PARTITION BY foody_escala.unidade, foody_escala.data, foody_escala.nome) AS turnos_no_dia,
            ((foody_escala.data + foody_escala.entrada) AT TIME ZONE 'America/Sao_Paulo'::text) AS combinado_em
           FROM foody_escala
          WHERE foody_escala.origem ~~ 'jaison%'::text
        ), radar AS (
         SELECT foody_presenca.unidade,
            foody_presenca.dia_operacional,
            min(foody_presenca.visto_em) AS ligou_em
           FROM foody_presenca
          GROUP BY foody_presenca.unidade, foody_presenca.dia_operacional
        ), marcas AS (
         SELECT foody_fato_pedido.unidade,
            foody_fato_pedido.entregador,
            (foody_fato_pedido.dt_coletado AT TIME ZONE 'America/Sao_Paulo'::text) AS quando
           FROM foody_fato_pedido
          WHERE foody_fato_pedido.entregador IS NOT NULL AND foody_fato_pedido.dt_coletado IS NOT NULL
        UNION ALL
         SELECT trackeat_fato_entrega.unidade,
            trackeat_fato_entrega.entregador,
            (trackeat_fato_entrega.dt_entrega AT TIME ZONE 'America/Sao_Paulo'::text) AS timezone
           FROM trackeat_fato_entrega
          WHERE trackeat_fato_entrega.entregador IS NOT NULL
        ), chegada AS (
         SELECT t.unidade,
            t.dia_operacional,
            t.entregador,
            t.n_turno,
            t.turnos_no_dia,
            t.entrada,
            t.saida,
            t.combinado_em,
            rd.ligou_em AS radar_ligou,
            LEAST(( SELECT min(p_1.visto_em) AS min
                   FROM foody_presenca p_1
                  WHERE p_1.unidade = t.unidade AND p_1.entregador = t.entregador AND p_1.no_patio AND p_1.visto_em >= (t.combinado_em - '02:00:00'::interval) AND p_1.visto_em <= (t.combinado_em + '04:00:00'::interval)), ( SELECT min(k.chegou_em) AS min
                   FROM trackeat_chegada k
                  WHERE k.unidade = t.unidade AND lower(k.entregador) = lower(t.entregador) AND k.chegou_em >= (t.combinado_em - '02:00:00'::interval) AND k.chegou_em <= (t.combinado_em + '04:00:00'::interval))) AS chegou_gps,
            ( SELECT min(p_2.visto_em) AS min
                   FROM foody_presenca p_2
                  WHERE p_2.unidade = t.unidade AND lower(p_2.entregador) = lower(t.entregador) AND p_2.no_patio AND p_2.visto_em >= (t.combinado_em - '02:00:00'::interval) AND p_2.visto_em <= (t.combinado_em + '04:00:00'::interval)) AS chegou_radar,
            ( SELECT min(m.quando) AS min
                   FROM marcas m
                  WHERE m.unidade = t.unidade AND lower(m.entregador) = lower(t.entregador) AND m.quando >= (t.combinado_em - '02:00:00'::interval) AND m.quando <= (t.combinado_em + '04:00:00'::interval)) AS primeiro_trabalho
           FROM turno t
             LEFT JOIN radar rd ON rd.unidade = t.unidade AND rd.dia_operacional = t.dia_operacional
        )
 SELECT c.unidade,
    c.dia_operacional,
    c.entregador,
    c.n_turno,
    c.turnos_no_dia,
    c.entrada AS hora_combinada,
    c.combinado_em,
    c.chegou_gps,
    c.primeiro_trabalho,
    c.radar_ligou,
    c.chegou_gps AS chegada,
    c.chegou_gps IS NOT NULL AS tem_gps,
    c.radar_ligou IS NOT NULL AND c.radar_ligou <= (c.combinado_em + ((p.tol || ' minutes'::text)::interval)) AS radar_valia,
        CASE
            WHEN c.chegou_gps IS NULL THEN NULL::integer
            ELSE round(EXTRACT(epoch FROM c.chegou_gps - c.combinado_em) / 60.0)::integer
        END AS atraso_min,
        CASE
            WHEN c.chegou_gps IS NULL THEN NULL::boolean
            WHEN c.dia_operacional >= '2026-11-10'::date THEN
            CASE
                WHEN (EXTRACT(epoch FROM c.chegou_gps - c.combinado_em) / 60.0) <= p.tol THEN false
                WHEN trackeat_fila_cega(c.unidade, c.combinado_em, p.tol::integer) THEN NULL::boolean
                ELSE true
            END
            WHEN c.radar_ligou IS NULL THEN NULL::boolean
            WHEN c.radar_ligou > (c.combinado_em + ((p.tol || ' minutes'::text)::interval)) THEN NULL::boolean
            ELSE (EXTRACT(epoch FROM c.chegou_gps - c.combinado_em) / 60.0) > p.tol
        END AS furou_tolerancia,
    c.saida AS hora_saida
   FROM chegada c
     CROSS JOIN LATERAL ( SELECT motoboy_tolerancia(c.dia_operacional) AS tol) p;;
REVOKE ALL ON cdm_interno.chegada_turno_anterior FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE VIEW public.vw_motoboy_turno_gps AS 
WITH escala AS (
 SELECT DISTINCT ON(e.unidade,e.data,lower(extensions.unaccent(e.nome)),e.entrada)
 e.* FROM public.foody_escala e
 WHERE e.data>=date '2026-11-11' AND e.entrada IS NOT NULL
 AND (e.origem LIKE 'jaison%' OR e.origem='colado/whatsapp')
 ORDER BY e.unidade,e.data,lower(extensions.unaccent(e.nome)),e.entrada,
 (e.origem LIKE 'jaison%') DESC,e.criado_em DESC,e.id DESC
), turno AS (
 SELECT e.*,row_number() OVER w AS n_turno,count(*) OVER(PARTITION BY unidade,data,nome) AS turnos_no_dia,
 (data+entrada) AT TIME ZONE 'America/Sao_Paulo' AS combinado_em,
 lead((data+entrada) AT TIME ZONE 'America/Sao_Paulo') OVER w AS proximo,
 lag((data+saida+CASE WHEN saida<entrada THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE 'America/Sao_Paulo') OVER w AS fim_anterior
 FROM escala e WINDOW w AS(PARTITION BY unidade,data,nome ORDER BY entrada)
), medidas AS (
 SELECT t.*,cdm_interno.chegada_medicao(data,unidade,nome,n_turno::int,combinado_em,
 greatest(combinado_em-interval '2 hours',fim_anterior),
 least(combinado_em+interval '4 hours',proximo)) AS m
 FROM turno t
), atual AS (
 SELECT unidade,data AS dia_operacional,nome AS entregador,n_turno,turnos_no_dia,
 entrada AS hora_combinada,combinado_em,
 (m->>'oficial')::timestamptz AS chegou_gps,
 NULL::timestamptz AS primeiro_trabalho,
 (SELECT min(p.visto_em) FROM public.foody_presenca p WHERE p.unidade=t.unidade AND p.dia_operacional=t.data) AS radar_ligou,
 coalesce((m->>'media')::timestamptz,(m->>'oficial')::timestamptz) AS chegada,
 m->>'oficial' IS NOT NULL AS tem_gps,
 NOT (m->>'robo_cego')::boolean AS radar_valia,
 floor(extract(epoch FROM(coalesce((m->>'media')::timestamptz,(m->>'oficial')::timestamptz)-combinado_em))/60)::int AS atraso_min,
 (m->>'furou')::boolean AS furou_tolerancia,saida AS hora_saida
 FROM medidas t
)
SELECT * FROM cdm_interno.chegada_turno_anterior WHERE dia_operacional<date '2026-11-11'
UNION ALL SELECT * FROM atual;
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

  -- Fabio, 11/11/2026: fontes separadas, media auditavel e nenhuma penalidade por dados discordantes.
  with turnos as (
    select v.*,lag((v.dia_operacional+v.hora_saida+
             case when v.hora_saida<v.hora_combinada then interval '1 day' else interval '0' end)
             at time zone 'America/Sao_Paulo') over w as fim_anterior,
           lead(v.combinado_em) over w as proximo
    from vw_motoboy_turno_gps v where v.dia_operacional=v_dia
    window w as(partition by v.unidade,v.entregador order by v.n_turno)
  )
  select coalesce(jsonb_agg(x.e || case when t.entregador is not null then
       jsonb_build_object('medicao',cdm_interno.chegada_medicao(v_dia,t.unidade,t.entregador,t.n_turno::int,t.combinado_em,
           greatest(t.combinado_em-interval '2 hours',t.fim_anterior),
           least(t.combinado_em+interval '4 hours',t.proximo)),
          'media_em_vigor',v_dia>=date '2026-11-11',
          'chegou_fonte',case when v_dia>=date '2026-11-11' then 'media oficial e balcao (ou fonte unica pendente)' else x.e->>'chegou_fonte' end)
       else '{}'::jsonb end order by x.ord),'[]'::jsonb) into v_todas
  from jsonb_array_elements(v_todas) with ordinality x(e,ord)
  left join turnos t on t.unidade=x.e->>'unidade' and t.entregador=x.e->>'entregador'
      and t.n_turno=(x.e->>'n_turno')::int;


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
  if v_dono then
    v_linhas := v_todas;
  else
    select coalesce(jsonb_agg(
             (e - 'sistema_txt' - 'fonte' - 'diferenca_min' - 'trava_txt' - 'chegou_txt' - 'chegou_fonte' - 'atraso_min' - 'medicao')
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
    'agora', to_char(now() at time zone 'America/Sao_Paulo','HH24:MI'),
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
CREATE OR REPLACE FUNCTION public.pagamento_linhas_editadas(p_dia date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
/* 15/10 (chat-pagar-motoboys-tira-aovivo-14-10): pega a conta automatica (pagamento_linhas_do_dia) e aplica a edicao
   dos atendentes (motoboy_pagamento_manual, coluna nula = automatico). Junta turnos, lanches, corridas em dobro
   e pendentes do TrackEat para a comanda mostrar tudo. Nao muda nenhuma view nem outra tela. */
with base as (select public.pagamento_linhas_do_dia(p_dia, true) as b),
ov as (select * from public.motoboy_pagamento_manual where dia_operacional = p_dia and ativo),
lan as (
  select unidade, entregador,
         jsonb_agg(jsonb_build_object('ordem', ordem_caro, 'preco', coalesce(preco_refeicao,0), 'produto', produto,
                   'sem_preco', preco_refeicao is null) order by ordem_caro) as lista
    from public.motoboy_refeicao_do_dia(p_dia) where entregador is not null group by 1,2),
tur as (
  select unidade, entregador,
         jsonb_agg(jsonb_build_object('medicao',cdm_interno.chegada_medicao(p_dia,unidade,entregador,n_turno::int,combinado_em,
                   greatest(combinado_em-interval '2 hours',fim_anterior),least(combinado_em+interval '4 hours',proximo)),
                   'media_em_vigor',p_dia>=date '2026-11-11','n', n_turno, 'combinado', to_char(hora_combinada,'HH24:MI'),
                   'chegada', to_char(chegada at time zone 'America/Sao_Paulo','HH24:MI'),
                   'atraso_min', atraso_min, 'furou', furou_tolerancia, 'gps', tem_gps) order by n_turno) as lista
    from (select v.*,
         lag((dia_operacional+hora_saida+case when hora_saida<hora_combinada then interval '1 day' else interval '0' end)
           at time zone 'America/Sao_Paulo') over w as fim_anterior,
         lead(combinado_em) over w as proximo
         from public.vw_motoboy_turno_gps v where dia_operacional=p_dia
         window w as(partition by unidade,entregador order by n_turno)) medidas
    group by 1,2),
pend as (
  select unidade, entregador, count(*) as n, sum(valor_total) as valor
    from public.trackeat_fato_entrega
   where status = 'Pendente'
     and (case when extract(hour from dt_entrega) < 5 then dt_entrega::date - 1 else dt_entrega::date end) = p_dia
   group by 1,2),
dup as (
  select m.unidade, m.entregador_2,
         jsonb_agg(jsonb_build_object('fonte_2', m.fonte_2, 'pedido_2', m.pedido_2, 'saiu_2', m.saiu_2, 'pedido_1', m.pedido_1,
                   'hora_1', to_char(m.saiu_1 at time zone 'America/Sao_Paulo','HH24:MI'),
                   'hora_2', to_char(m.saiu_2 at time zone 'America/Sao_Paulo','HH24:MI'),
                   'valor_2', m.valor_2, 'mesmo_pedido', m.mesmo_pedido, 'veredito', m.veredito,
                   'decisao', d.decisao, 'desconto', d.valor_desconto, 'por', d.por,
                   'quando', to_char(d.criado_em at time zone 'America/Sao_Paulo','DD/MM HH24:MI')) order by m.saiu_2) as lista
    from public.mv_corrida_dupla m
    left join public.corrida_dupla_decisao d
      on d.unidade = m.unidade and d.dia_operacional = m.dia_operacional and d.fonte_2 = m.fonte_2
     and d.pedido_2 = m.pedido_2 and d.saiu_2 = m.saiu_2
   where m.dia_operacional = p_dia
     and (m.veredito like 'PAGAR UMA%' or m.veredito like 'CONFERIR%' or d.id is not null)
   group by 1,2),
lin as (
  select x.n, x.l, ov.chegada as o_chegada, ov.horas as o_horas, ov.entregas as o_entregas, ov.taxas as o_taxas,
         ov.tem_garantido as o_gar, ov.horas_garantido as o_hg, ov.refeicoes_direito as o_ref, ov.ajuste as o_aj,
         ov.motivo as o_motivo, ov.quem_nome as o_quem, ov.atualizado_em as o_em, (ov.unidade is not null) as tem_ov,
         lan.lista as lanches_lista, tur.lista as turnos_lista, pend.n as pend_n, pend.valor as pend_valor,
         (select dd.lista from dup dd
           where dd.unidade = x.l->>'unidade'
             and (lower(dd.entregador_2) = lower(x.l->>'entregador') or public.cdm_mesma_pessoa(dd.entregador_2, x.l->>'entregador'))
           order by (lower(dd.entregador_2) = lower(x.l->>'entregador')) desc limit 1) as dup_lista
    from base cross join lateral jsonb_array_elements(base.b->'linhas') with ordinality as x(l, n)
    left join ov   on ov.unidade   = x.l->>'unidade' and ov.entregador   = x.l->>'entregador'
    left join lan  on lan.unidade  = x.l->>'unidade' and lan.entregador  = x.l->>'entregador'
    left join tur  on tur.unidade  = x.l->>'unidade' and tur.entregador  = x.l->>'entregador'
    left join pend on pend.unidade = x.l->>'unidade' and pend.entregador = x.l->>'entregador'
),
calc as (
  select lin.*,
         coalesce(o_taxas, (l->>'taxas')::numeric, 0) as taxas_ef,
         coalesce(o_gar, coalesce((l->>'garantido')::boolean, true)) as gar_ok,
         case when o_hg is not null then round(o_hg * coalesce((l->>'valor_hora')::numeric,0), 2)
              else coalesce((l->>'garantido_calculado')::numeric, 0) end as gar_ef,
         coalesce(o_ref, (l->>'direito_refeicoes')::int, 1) as dir_ef
    from lin
),
fin as (
  select calc.*,
         coalesce((select sum((e->>'preco')::numeric) from jsonb_array_elements(coalesce(calc.lanches_lista,'[]'::jsonb)) e
                    where (e->>'ordem')::int > calc.dir_ef), 0) as cobrar_ef
    from calc
),
pago as (
  select fin.*,
         round(case when gar_ok then greatest(round(taxas_ef,2), gar_ef) else round(taxas_ef,2) end
               + coalesce((l->>'ajustes')::numeric,0) + coalesce(o_aj,0) - cobrar_ef, 2) as pagar_ef
    from fin
),
saida as (
  select n, l || jsonb_build_object(
      'pagar', pagar_ef, 'taxas', taxas_ef, 'garantido', gar_ok, 'garantido_calculado', gar_ef,
      'garantido_valido', case when gar_ok then gar_ef else 0 end,
      'direito_refeicoes', dir_ef, 'cobrar_refeicao', cobrar_ef,
      'entregas', coalesce(o_entregas, (l->>'entregas')::int),
      'horas', coalesce(o_horas, (l->>'horas')::numeric),
      'chegada', coalesce(to_char(o_chegada,'HH24:MI'), l->>'chegada'),
      'ajuste_manual', o_aj,
      'turnos_det', coalesce(turnos_lista,'[]'::jsonb),
      'lanches_det', coalesce(lanches_lista,'[]'::jsonb),
      'duplicadas', coalesce(dup_lista,'[]'::jsonb),
      'pendentes_track', case when pend_n > 0 then jsonb_build_object('n', pend_n, 'valor', pend_valor) end,
      'auto', jsonb_build_object('pagar', l->'pagar', 'taxas', l->'taxas', 'garantido', l->'garantido',
               'garantido_calculado', l->'garantido_calculado', 'direito_refeicoes', l->'direito_refeicoes',
               'cobrar_refeicao', l->'cobrar_refeicao', 'entregas', l->'entregas', 'horas', l->'horas',
               'chegada', l->'chegada', 'horas_escala', l->'horas_escala'),
      'editado', case when tem_ov then jsonb_build_object('quem', o_quem, 'motivo', o_motivo,
               'quando', to_char(o_em at time zone 'America/Sao_Paulo','DD/MM HH24:MI'),
               'campos', jsonb_strip_nulls(jsonb_build_object('chegada', to_char(o_chegada,'HH24:MI'), 'horas', o_horas,
                          'entregas', o_entregas, 'taxas', o_taxas, 'tem_garantido', o_gar, 'horas_garantido', o_hg,
                          'refeicoes_direito', o_ref, 'ajuste', o_aj))) end
    ) as l
    from pago
)
select (select b from base) || jsonb_build_object(
  'linhas', coalesce((select jsonb_agg(s.l order by s.n) from saida s), '[]'::jsonb),
  'totais', coalesce((select b from base)->'totais', '{}'::jsonb) || jsonb_build_object(
      'pagar', coalesce((select round(sum((s.l->>'pagar')::numeric),2) from saida s), 0),
      'cobrado_total', coalesce((select round(sum((s.l->>'cobrar_refeicao')::numeric),2) from saida s), 0),
      'editados', (select count(*) from saida s where jsonb_typeof(s.l->'editado') = 'object')))
$function$
;