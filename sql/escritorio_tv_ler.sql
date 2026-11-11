CREATE OR REPLACE FUNCTION public.escritorio_tv_ler(p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_rh jsonb; v_dp date; v_atual timestamptz; v_dia date; v_ini timestamptz; v_chave text;
  r jsonb; v_quando timestamptz; v_erros jsonb; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ag jsonb;
  v_ponto_vivo jsonb := '[]'::jsonb; v_pv jsonb; v_uni text; v_movimento jsonb;
  v_op date; v_op_ini timestamptz;
begin
  v_rh := public.rh_tv_ler(p_chave);   -- confere o codigo da TV (erro se invalido)

  -- PONTO: ultimo dia carregado do Flash
  select max(data), max(importado_em) into v_dp, v_atual from fato_espelho_dia where coalesce(ativo,true);

  -- ERROS DA COZINHA: mesmo calculo/cache da TV da cozinha (cozinha_tv), todas as lojas
  v_dia := ((now() at time zone 'America/Sao_Paulo') - interval '6 hours')::date;
  v_ini := (v_dia + time '06:00') at time zone 'America/Sao_Paulo';
  v_chave := 'cozinha_vivo:'||v_dia;
  select c.valor, c.quando into r, v_quando from cdm_cache c where c.chave = v_chave;
  if r is null or v_quando < now() - interval '60 seconds' then
    r := cozinha_vivo_calc(v_ini, v_ini + interval '24 hours');
    insert into cdm_cache(chave, valor, quando) values (v_chave, r, now())
      on conflict (chave) do update set valor = excluded.valor, quando = excluded.quando;
  end if;
  v_erros := coalesce((
    select jsonb_agg((e - 'valor') || jsonb_build_object(
             'resolveu', regexp_replace(cdm_mascara_dinheiro(e->>'resolveu'), '\s*R\$ —', '', 'g'),
             'disse', cdm_mascara_dinheiro(e->>'disse'),
             'item', cdm_mascara_dinheiro(e->>'item')) order by o)
      from jsonb_array_elements(cozinha_tv_triagem(r->'erros')) with ordinality x(e, o)
     where e->>'nao_conta' is null), '[]'::jsonb);

  -- LEMBRETES: contas que vencem hoje, SEM valor e SEM pagamento de pessoa (salario, bonificacao etc. so contados)
  v_ag := coalesce(contas_agenda(v_hoje, v_hoje, null, 200), '[]'::jsonb);


  -- 11/11/2026 TV LG: mesma regra do Ponto ao vivo, por unidade; somente quem tem batida.
  for v_uni in select unnest(array['Água Verde','São Braz','Ahú']) loop
    declare v_dia date; v_agora timestamp; v_lido timestamp;
      begin
        v_agora := now() at time zone 'America/Sao_Paulo';
        v_dia := case when v_agora::time >= time '07:00' then v_agora::date else v_agora::date - 1 end;
        select max(importado_em) at time zone 'America/Sao_Paulo' into v_lido
          from fato_marcacao
         where (v_uni is null or unidade = v_uni)
           and data_marcacao between v_dia - 1 and v_dia + 1;

        v_pv := jsonb_build_object(
          'dia', v_dia, 'agora', v_agora, 'lido_em', v_lido,
          'janela', '07:00 as 03:00',
          'gente', coalesce((
            select jsonb_agg(to_jsonb(g) order by g.ordem, g.turno, g.setor, g.esc_entrada, g.nome)
            from (
              with esc as (
                select j0.nome, j0.setor, j0.turno, j0.esc_entrada, j0.esc_saida, (j0.folga or j0.evento is not null) as folga, j0.marcacao, j0.evento
                  from (
                    select coalesce(e.nome, f.nome) as nome,
                           coalesce(nullif(e.setor,''), f.setor, 'Sem setor') as setor,
                           coalesce(nullif(e.turno,''), case when f.noturno then 'Noite' else 'Dia' end) as turno,
                           case when e.nome is not null then coalesce(e.entrada, f.entrada)
                                else coalesce((f.excecoes_dia -> extract(dow from v_dia)::int::text ->> 'entrada')::time, f.entrada) end as esc_entrada,
                           case when e.nome is not null then coalesce(e.saida, f.saida)
                                else coalesce((f.excecoes_dia -> extract(dow from v_dia)::int::text ->> 'saida')::time, f.saida) end as esc_saida,
                           ((case when e.nome is not null then (coalesce(e.marcacao,'') in ('FOLGA','FERIAS'))
                                else coalesce((f.excecoes_dia -> extract(dow from v_dia)::int::text ->> 'folga')::boolean, false) end)
                            or exists (select 1 from fato_escala_posicao pz
                                        where pz.data = v_dia
                                          and upper(btrim(pz.posicao)) = 'FOLGA'
                                          and pz.nome = coalesce(e.nome, f.nome)
                                          and (v_uni is null or pz.unidade = v_uni))) as folga,
                           nullif(coalesce(e.marcacao,''),'') as marcacao,
                           (select ev.tipo from vw_evento_dia ev
                             where ev.dia = v_dia
                               and ev.nome = coalesce(e.nome, f.nome)
                               and (v_uni is null or ev.unidade = v_uni)
                               and ev.cobre_falta
                               and ev.tipo <> 'DECLARACAO'
                             limit 1) as evento
                      from (select nome, setor, turno, entrada, saida, marcacao from escala_semana where data = v_dia and (v_uni is null or unidade = v_uni)) e
                      full outer join (
                        select f0.nome, f0.setor, f0.noturno, f0.entrada, f0.saida, f0.excecoes_dia from dim_funcionario f0
                         where f0.ativo and (v_uni is null or f0.unidade = v_uni) and f0.entrada is not null
                           and not coalesce(f0.cargo_confianca,false)
                           and not (f0.afastado_desde is not null
                                    and v_dia >= f0.afastado_desde
                                    and (f0.afastado_ate is null or v_dia <= f0.afastado_ate))
                      ) f on f.nome = e.nome
                  ) j0
                 where not exists (select 1 from dim_funcionario fc
                                    where fc.nome = j0.nome and coalesce(fc.cargo_confianca,false))
                   and (j0.esc_entrada is not null or j0.marcacao is not null)
              ),
              bat as (
                select m.nome, count(*) as batidas, (array_agg(m.horario order by (m.data_marcacao + m.horario)))[1] as primeira, (array_agg(m.horario order by (m.data_marcacao + m.horario) desc))[1] as ultima, (array_agg(m.horario order by (m.data_marcacao + m.horario)))[2] as b2, (array_agg(m.horario order by (m.data_marcacao + m.horario)))[3] as b3, (array_agg(m.data_marcacao + m.horario order by (m.data_marcacao + m.horario)))[2] as b2ts, (array_agg(m.data_marcacao + m.horario order by (m.data_marcacao + m.horario)))[3] as b3ts
                  from fato_marcacao m
                 where (v_uni is null or m.unidade = v_uni)
                   and ((m.data_marcacao = v_dia     and m.horario >= time '07:00')
                     or (m.data_marcacao = v_dia + 1 and m.horario <  time '03:00'))
                   and not exists (select 1 from dim_funcionario f2
                                    where f2.nome = m.nome and coalesce(f2.cargo_confianca,false))
                 group by m.nome
              ),
              j as (
                select coalesce(e.nome, b.nome) as nome,
                       coalesce(e.setor,'Sem setor') as setor,
                       coalesce(e.turno,'Fora da escala') as turno,
                       e.esc_entrada, e.esc_saida, coalesce(e.folga,false) as folga, e.marcacao, e.evento,
                       b.batidas, b.primeira, b.ultima, b.b2, b.b3, b.b2ts, b.b3ts, (v_dia + e.esc_saida + case when e.esc_saida < e.esc_entrada then interval '1 day' else interval '0 day' end) as fim_ts,
                       (e.nome is null) as nao_escalado
                  from esc e full outer join bat b on b.nome = e.nome
              )
              select j.nome, j.setor, j.turno,
                     to_char(j.esc_entrada,'HH24:MI') as esc_entrada,
                     to_char(j.esc_saida,'HH24:MI')   as esc_saida,
                     coalesce(j.batidas,0) as batidas, j.marcacao as esc_marcacao, j.evento as evento,
                     substr(j.primeira::text,1,5) as entrou,
                     substr(j.primeira::text,1,5) as primeira,
                     substr(j.b2::text,1,5) as int_saiu,
                     substr(j.b3::text,1,5) as int_voltou,
                     case when j.b2ts is not null and j.b3ts is not null then round(extract(epoch from (j.b3ts - j.b2ts))/60)::int end as int_min,
                     case when coalesce(j.batidas,0) >= 2 and coalesce(j.batidas,0) % 2 = 0 and not (coalesce(j.batidas,0) = 2 and j.b2ts is not null and v_agora < j.b2ts + interval '2 hours' and (j.fim_ts is null or v_agora < j.fim_ts)) then substr(j.ultima::text,1,5) end as saida,
                     (coalesce(j.batidas,0) = 2 and j.b2ts is not null and v_agora < j.b2ts + interval '2 hours' and (j.fim_ts is null or v_agora < j.fim_ts)) as no_intervalo,
                     substr(j.ultima::text,1,5)   as ultima,
                     (coalesce(j.batidas,0) % 2 = 1 or (coalesce(j.batidas,0) = 2 and j.b2ts is not null and v_agora < j.b2ts + interval '2 hours' and (j.fim_ts is null or v_agora < j.fim_ts))) as dentro,
                     case
                       when j.nao_escalado then 'NAO_ESCALADO'
                       when j.folga and coalesce(j.batidas,0) > 0 then 'TRABALHOU_NA_FOLGA'
                       when j.folga then coalesce(j.evento, j.marcacao, 'FOLGA')
                       when coalesce(j.batidas,0) = 2 and j.b2ts is not null and v_agora < j.b2ts + interval '2 hours' and (j.fim_ts is null or v_agora < j.fim_ts) then 'NO_INTERVALO'
                       when j.batidas is not null and j.batidas % 2 = 1 then 'NA_LOJA'
                       when j.batidas is not null then 'SAIU'
                       when coalesce(j.marcacao,'') = 'TAXA' then 'TAXA'
                       when v_agora <= (v_dia + j.esc_entrada) + interval '10 minutes' then 'NAO_CHEGOU'
                       when v_lido is null or v_lido <= (v_dia + j.esc_entrada) + interval '10 minutes'
                            then 'SEM_LEITURA_AINDA'
                       else 'ATRASADO' end as situacao,
                     case when j.batidas is null and j.esc_entrada is not null
                               and v_lido > (v_dia + j.esc_entrada) + interval '10 minutes'
                          then round(extract(epoch from (v_agora - (v_dia + j.esc_entrada)))/60)::int end as atraso_min,
                     case
                       when j.nao_escalado then 1
                       when j.folga and coalesce(j.batidas,0) > 0 then 1
                       when coalesce(j.marcacao,'') = 'TAXA' and j.batidas is null then 3
                       when j.batidas is null and j.esc_entrada is not null
                            and v_lido > (v_dia + j.esc_entrada) + interval '10 minutes' then 0
                       when j.batidas is not null and j.batidas % 2 = 1 then 2
                       when coalesce(j.batidas,0) = 2 and j.b2ts is not null and v_agora < j.b2ts + interval '2 hours' and (j.fim_ts is null or v_agora < j.fim_ts) then 2
                       when j.batidas is null then 3
                       else 4 end as ordem
                from j
               where not (j.folga and coalesce(j.batidas,0) = 0)
               limit 300
            ) g),'[]'));
      end;
    v_ponto_vivo := v_ponto_vivo || jsonb_build_array(
      (v_pv - 'gente') || jsonb_build_object('unidade',v_uni,'gente',coalesce((
        select jsonb_agg(jsonb_build_object(
          'nome',g->>'nome','setor',g->>'setor','situacao',g->>'situacao',
          'dentro',g->'dentro','no_intervalo',g->'no_intervalo',
          'entrou',g->>'entrou','int_saiu',g->>'int_saiu','int_voltou',g->>'int_voltou',
          'saida',g->>'saida','batidas',g->'batidas','ultima',g->>'ultima') order by o)
          from jsonb_array_elements(v_pv->'gente') with ordinality z(g,o)
         where (g->>'batidas')::integer > 0
      ),'[]'::jsonb)));
  end loop;

  -- Contagens do Saipos e situação do cache da equipe. Sem dinheiro/dados de cliente.
  v_op := ((now() at time zone 'America/Sao_Paulo') - interval '5 hours')::date;
  v_op_ini := (v_op + time '05:00') at time zone 'America/Sao_Paulo';
  select jsonb_agg(jsonb_build_object(
    'unidade',u.unidade,'dia',v_op,'lido_em',lf.lido_em,
    'salao',case when lf.lido_em >= v_op_ini then n.salao end,
    'delivery',case when lf.lido_em >= v_op_ini then n.delivery end,
    'retirada',case when lf.lido_em >= v_op_ini then n.retirada end,
    'cache_quando',c.quando,'cache_dia',c.valor->>'dia',
    'agora',jsonb_build_object(
      'em_preparo',c.valor#>array['vivo','lojas',u.unidade,'agora','em_preparo'],
      'prontos_esperando',c.valor#>array['vivo','lojas',u.unidade,'agora','prontos_esperando'],
      'na_rua',c.valor#>array['vivo','lojas',u.unidade,'agora','na_rua'],
      'atrasados_sem_entrega',c.valor#>array['vivo','lojas',u.unidade,'agora','atrasados_sem_entrega'])
  ) order by u.ordem) into v_movimento
  from (values ('Água Verde',1),('São Braz',2),('Ahú',3)) u(unidade,ordem)
  left join lateral (
    select max(l.executado_em) lido_em from saipos_sync_log l
     where l.unidade=u.unidade and l.endpoint='search_sales' and l.status='ok'
       and l.executado_em >= now()-interval '2 days'
  ) lf on true
  left join lateral (
    select count(*) filter(where (s.payload->>'id_sale_type')::integer=3) salao,
           count(*) filter(where (s.payload->>'id_sale_type')::integer=1) delivery,
           count(*) filter(where (s.payload->>'id_sale_type')::integer=2) retirada
      from saipos_raw_venda s where s.unidade=u.unidade and s.shift_date=v_op
       and (s.payload->>'canceled') is distinct from 'Y'
  ) n on true
  left join cdm_cache c on c.chave='placar:delivery:vivo';

  return jsonb_build_object(
    'ponto_vivo',v_ponto_vivo,
    'movimento',v_movimento,
    'consulta_em',now(),
    'agora', to_char(now() at time zone 'America/Sao_Paulo','DD/MM HH24:MI'),
    'rh', v_rh,
    'ponto', jsonb_build_object(
      'dia', to_char(v_dp,'DD/MM'),
      'atualizado', to_char(v_atual at time zone 'America/Sao_Paulo','DD/MM HH24:MI'),
      'atrasos', coalesce((select jsonb_agg(jsonb_build_object('nome',initcap(nome),'loja',unidade,'entrada',to_char(entrada,'HH24:MI')) order by unidade, nome)
                  from fato_espelho_dia where data = v_dp and coalesce(ativo,true) and categoria = 'ATRASO'),'[]'),
      'faltas', coalesce((select jsonb_agg(jsonb_build_object('nome',initcap(nome),'loja',unidade) order by unidade, nome)
                  from fato_espelho_dia where data = v_dp and coalesce(ativo,true) and categoria in ('FALTA','FALTA_A_CONFIRMAR')),'[]'),
      'flash', coalesce((select jsonb_agg(jsonb_build_object('nome',initcap(nome),'loja',unidade,'o_que',replace(lower(categoria),'_',' ')) order by unidade, nome)
                  from fato_espelho_dia where data = v_dp and coalesce(ativo,true) and categoria in ('BATIDAS_INCOMPLETAS','SEM_BATIDA')),'[]'),
      'refeicao', coalesce((select jsonb_agg(jsonb_build_object('nome',initcap(nome),'loja',unidade) order by unidade, nome)
                  from vw_refeicao_vs_ponto where dia = v_dp and situacao = 'NAO LANCOU'),'[]')
    ),
    'erros', jsonb_build_object('dia', to_char(v_dia,'DD/MM'), 'total', jsonb_array_length(v_erros),
      'itens', coalesce((select jsonb_agg(e) from (select e from jsonb_array_elements(v_erros) e limit 14) z),'[]')),
    'lembretes', jsonb_build_object(
      'contas', coalesce((select jsonb_agg(jsonb_build_object('o_que', coalesce(nullif(a->>'fornecedor',''), a->>'descricao'), 'loja', a->>'loja', 'categoria', a->>'categoria'))
                  from jsonb_array_elements(v_ag) a
                 where coalesce(a->>'categoria','') !~* '(sal[aá]r|bonif|pr[oó].?labore|rescis|f[eé]rias|adiant|vale|comiss|13|motoboy|diaria|di[aá]ria)'),'[]'),
      'pagamentos_equipe', (select count(*) from jsonb_array_elements(v_ag) a
                 where coalesce(a->>'categoria','') ~* '(sal[aá]r|bonif|pr[oó].?labore|rescis|f[eé]rias|adiant|vale|comiss|13|motoboy|diaria|di[aá]ria)')
    ),
    'novidades', coalesce((select jsonb_agg(jsonb_build_object('titulo',titulo,'resumo',resumo,'serve_para',serve_para,'fonte',fonte,'semana',to_char(semana,'DD/MM')) order by id desc)
                  from (select * from novidades_claude order by id desc limit 6) n),'[]')
  );
end $function$

