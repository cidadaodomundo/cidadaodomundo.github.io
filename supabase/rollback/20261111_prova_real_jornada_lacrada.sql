CREATE OR REPLACE FUNCTION public.prova_painel(p_token text, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
-- 15/10/2026 chat-pagar-motoboys-tira-aovivo-14-10 · PROVA REAL: a porta da aba "Prova real" (so Fabio/admin e Hellen)
declare u portal_usuario; j record; v_hoje date; v_ontem date; v_de date; v_ate date; v_pix_ate date;
  v_linhas jsonb; v_calib jsonb; v_alertas jsonb := '[]'::jsonb; v_plan jsonb; v_lacres jsonb; v_cadeia jsonb; v_robo record;
begin
  u := portal_sessao_usuario(p_token);
  if not (coalesce(u.admin,false) or u.id = 3) then
    raise exception 'so o proprietario e a Hellen veem a prova real' using errcode = '42501';
  end if;
  select * into j from prova_janela order by id desc limit 1;
  v_hoje := ((now() at time zone 'America/Sao_Paulo') - interval '5 hours')::date;   -- dia operacional em andamento
  v_ontem := v_hoje - 1;
  v_de := coalesce(p_de, j.de); v_ate := least(coalesce(p_ate, j.ate), v_hoje);

  select min(m) into v_pix_ate from (select max(v.data) m from prova_pix_visto v
    where v.operacao <> 'sumiu' and v.conta in ('ITAU AV 27004-3','ITAU AHU 99466-7','ITAU SAO BRAZ 99055-5') group by v.conta) x;

  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_strip_nulls(jsonb_build_object('madr', case when c.nosso is not null and c.deles is not null and c.d_entregas > c.n_entregas then motoboy_madrugada_anterior(c.dia, c.pessoa) end,
      'chave_pix', coalesce(
        (select nullif(trim(ll.chave_pix),'') from prova_lacre_linha ll where ll.lacre_id = c.lacre_id and coalesce(prova_quem('trackeat', ll.entregador), ll.entregador) = c.pessoa and nullif(trim(ll.chave_pix),'') is not null limit 1),
        (select nullif(trim(f.chave_pix),'') from motoboy_fechamento_deles f where f.dia = c.dia and coalesce(prova_quem('planilha', f.motoboy), 'sem dono: ' || f.motoboy) = c.pessoa and nullif(trim(f.chave_pix),'') is not null limit 1),
        (select nullif(trim(m.chave_pix),'') from motoboy_cadastro m where nullif(trim(m.chave_pix),'') is not null and (lower(m.nome) = lower(c.pessoa) or lower(m.nome_foody) = lower(c.pessoa)) limit 1)))) order by c.dia, c.pessoa), '[]'::jsonb) into v_linhas
    from prova_cruzar(v_de, v_ate, 'AUTO') c;

  -- calibracao: os dias de antes da prova, recalculados hoje (regua antiga x regua nova) - nao conta como prova.
  -- referencia: a planilha deles; o Pix so quando nao ha planilha.
  select jsonb_object_agg(r, x) into v_calib from (
    select r, jsonb_build_object(
      'comparaveis', count(*) filter (where nosso is not null and coalesce(deles, pago) is not null),
      'bate', count(*) filter (where faixa in ('centavo','ate R$1')),
      'a_mais', round(coalesce(sum(nosso - coalesce(deles, pago)) filter (where faixa = 'diferente' and nosso > coalesce(deles, pago)), 0), 2),
      'a_menos', round(coalesce(sum(coalesce(deles, pago) - nosso) filter (where faixa = 'diferente' and nosso < coalesce(deles, pago)), 0), 2),
      'total_nosso', round(coalesce(sum(nosso) filter (where nosso is not null and coalesce(deles, pago) is not null), 0), 2),
      'total_casa', round(coalesce(sum(coalesce(deles, pago)) filter (where nosso is not null and coalesce(deles, pago) is not null), 0), 2)) x
    from (select 'antiga' r, * from prova_cruzar(date '2026-09-23', date '2026-10-14', 'RETRO')
          union all select 'nova', * from prova_cruzar(date '2026-09-23', date '2026-10-14', 'EXTRA')) t
    where not (t.lojas like '%Água Verde%' and t.dia between date '2026-09-25' and date '2026-09-27')
    group by r) k;

  -- planilha de cada loja em cada dia da janela (ate ontem)
  select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'unidade', l.u,
           'status', case when exists (select 1 from motoboy_fechamento_deles m where m.dia = d.dia and m.unidade = l.u) then 'OK'
                          else coalesce((select f.status from fechamento_foto_lida f where f.dia = d.dia and f.unidade = l.u order by f.lido_em desc limit 1), 'SEM FOTO') end,
           'linhas', (select count(*) from motoboy_fechamento_deles m where m.dia = d.dia and m.unidade = l.u),
           'trackeat', (select count(*) from trackeat_fato_entrega e where e.unidade = l.u and e.dt_entrega >= d.dia + time '05:00' and e.dt_entrega < d.dia + 1 + time '05:00'))
         order by d.dia, l.u), '[]'::jsonb) into v_plan
    from (select g::date as dia from generate_series(v_de, least(v_ate, v_ontem), interval '1 day') g) d
    cross join (values ('Água Verde'), ('São Braz'), ('Ahú')) l(u);

  -- lacres de cada dia da janela
  select coalesce(jsonb_agg(jsonb_build_object('dia', x.dia, 'tipo', x.tipo, 'n', x.n, 'primeiro', x.primeiro, 'ultimo', x.ultimo, 'codigo', x.codigo, 'total', x.total) order by x.dia, x.tipo), '[]'::jsonb)
    into v_lacres
    from (select l.dia, l.tipo, count(*) n, to_char(min(l.tirado_em) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') primeiro,
                 to_char(max(l.tirado_em) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') ultimo,
                 upper(left((array_agg(l.hash order by l.id desc))[1], 4) || '-' || substr((array_agg(l.hash order by l.id desc))[1], 5, 4)) codigo,
                 (array_agg(l.total_pagar order by l.id desc))[1] total
            from prova_lacre l where l.dia between v_de and v_ate and l.erro is null and l.tipo in ('PREVIA','OFICIAL','FINAL') group by l.dia, l.tipo) x;
  v_cadeia := prova_conferir_cadeia() || jsonb_build_object(
    'na_prova', (select count(*) from prova_lacre where tipo in ('PREVIA','OFICIAL','FINAL')),
    'calibracao', (select count(*) from prova_lacre where tipo in ('RETRO','EXTRA')));

  -- o que esta travando
  if v_pix_ate is null or v_pix_ate < v_ontem then
    select r.status, r.detalhe, to_char(r.criado_em at time zone 'America/Sao_Paulo','DD/MM HH24:MI') quando into v_robo
      from log_rotina r where r.rotina = 'organizze-importar-deepseek' order by r.id desc limit 1;
    v_alertas := v_alertas || jsonb_build_object('tipo', 'pix', 'texto',
      'O extrato do banco está atrasado em ' || coalesce((select string_agg(case x.conta when 'ITAU AV 27004-3' then 'Água Verde' when 'ITAU AHU 99466-7' then 'Ahú' else 'São Braz' end || ' (até ' || to_char(x.m, 'DD/MM') || ')', ', ')
          from (select v.conta, max(v.data) m from prova_pix_visto v where v.operacao <> 'sumiu' and v.conta in ('ITAU AV 27004-3','ITAU AHU 99466-7','ITAU SAO BRAZ 99055-5') group by 1) x
         where x.m < v_ontem), '—') || '. Os pagamentos dessas lojas ficam "esperando o banco".' ||
      case when v_robo.status = 'FALHA' then ' O robô que puxa o extrato do banco para o Organizze (computador do Fábio) está parado: ' || coalesce(v_robo.detalhe, '') || ' (' || v_robo.quando || ').' else '' end);
  end if;
  v_alertas := v_alertas || coalesce((select jsonb_agg(jsonb_build_object('tipo', 'planilha', 'texto',
      'Planilha ' || case p->>'unidade' when 'Água Verde' then 'da Água Verde' when 'São Braz' then 'de São Braz' else 'do Ahú' end ||
      ' de ' || to_char((p->>'dia')::date, 'DD/MM') || ': ' ||
      case p->>'status' when 'SEM FOTO' then 'a foto não chegou no grupo (a loja rodou ' || (p->>'trackeat') || ' entregas no TrackEat).'
                        when 'CONFERIR' then 'a foto chegou mas a leitura automática não conseguiu ler. Precisa digitar.'
                        else 'situação ' || (p->>'status') end))
      from jsonb_array_elements(v_plan) p
     where p->>'status' <> 'OK' and (p->>'trackeat')::int > 0), '[]'::jsonb);
  v_alertas := v_alertas || coalesce((select jsonb_agg(jsonb_build_object('tipo', 'lacre', 'texto',
      'O lacre oficial do dia ' || to_char(d.dia, 'DD/MM') || ' não foi tirado (devia sair às 09h05 do dia seguinte).'))
      from (select g::date as dia from generate_series(v_de, v_ontem - case when (now() at time zone 'America/Sao_Paulo')::time < time '10:00' then 1 else 0 end, interval '1 day') g) d
     where not exists (select 1 from prova_lacre l where l.dia = d.dia and l.tipo = 'OFICIAL' and l.erro is null)), '[]'::jsonb);
  if not coalesce((v_cadeia->>'ok')::boolean, false) then
    v_alertas := v_alertas || jsonb_build_object('tipo', 'cadeia', 'texto', 'ATENÇÃO: a corrente de lacres não confere. Alguém mexeu num número lacrado.');
  end if;
  -- regua mudou no meio da prova
  v_alertas := v_alertas || coalesce((select jsonb_agg(jsonb_build_object('tipo', 'regua', 'texto',
      'A régua de pagamento mudou durante a prova: a partir do lacre de ' || to_char(x.primeiro at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') ||
      ' o cálculo é outro. Os dias antes e depois foram medidos com réguas diferentes.') order by x.primeiro)
      from (select l.codigo_hash, l.regua_hash, min(l.tirado_em) primeiro from prova_lacre l
             where l.tipo in ('PREVIA','OFICIAL','FINAL') and l.dia between j.de and j.ate and l.erro is null
             group by 1, 2) x
     where x.primeiro > (select min(l.tirado_em) from prova_lacre l where l.tipo in ('PREVIA','OFICIAL','FINAL') and l.dia between j.de and j.ate and l.erro is null)), '[]'::jsonb);
  -- escala mexida depois que a planilha chegou
  v_alertas := v_alertas || coalesce((select jsonb_agg(jsonb_build_object('tipo', 'escala', 'texto',
      'A escala de ' || to_char(x.dia, 'DD/MM') || ' (' || x.unidade || ') foi mexida às ' || to_char(x.mexida at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') ||
      ', depois que a planilha chegou. Pode ter mudado o valor do sistema daquele dia.'))
      from (select e.data dia, e.unidade, max(e.criado_em) mexida from foody_escala e
             where e.data between v_de and v_ate
               and e.criado_em > (select min(v.visto_em) from prova_deles_visto v where v.dia = e.data and v.unidade = e.unidade and v.operacao <> 'sumiu')
             group by 1, 2) x), '[]'::jsonb);
  v_alertas := v_alertas || coalesce((select jsonb_agg(distinct jsonb_build_object('tipo', 'nome', 'texto',
      'Não sei quem é "' || substr(x->>'pessoa', 11) || '" (' || case when x->>'deles' is not null then 'planilha' else 'Pix' end || '). A Hellen precisa dizer quem é.'))
      from jsonb_array_elements(v_linhas) x where x->>'pessoa' like 'sem dono: %'), '[]'::jsonb);

  return jsonb_build_object(
    'janela', jsonb_build_object('de', j.de, 'ate', j.ate, 'de_texto', to_char(j.de, 'DD/MM'), 'ate_texto', to_char(j.ate, 'DD/MM'),
       'dias_total', (j.ate - j.de) + 1, 'dia_n', greatest(0, least((j.ate - j.de) + 1, v_hoje - j.de)), 'motivo', j.motivo,
       'terminou', v_hoje > j.ate),
    'hoje', v_hoje, 'pix_ate', v_pix_ate, 'pix_ate_texto', to_char(v_pix_ate, 'DD/MM'),
    'linhas', v_linhas, 'calibracao', v_calib, 'planilhas', v_plan, 'lacres', v_lacres, 'cadeia', v_cadeia,
    'alertas', v_alertas, 'dono', coalesce(u.admin, false),
    'agora', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'));
end $function$
;