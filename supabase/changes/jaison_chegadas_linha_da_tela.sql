-- 13/11/2026 - pedido expresso do Fabio (chat-mensagem-jaison-chegada-13-11):
-- o aviso de chegada ao Jaison passa a usar a MESMA fonte e o MESMO criterio da tela Chegada do dia
-- (entrada combinada, chegada, saida registrada, garantido e refeicao). Banco pessoal kqvoatdprjwxyadhvtdd.
-- Desfazer: supabase/rollback/jaison_chegadas_linha_da_tela.sql (_backup_ddl antes-linha-da-tela-13-11).
-- Nao muda regra de pagamento, lacre, cron, grants nem a tela.

create or replace function public.escala_canal_chegadas_linhas(p_dia date)
 returns jsonb
 language plpgsql
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_l jsonb;
begin
  -- mesmas linhas da tela: chegada_do_dia (copia sem token) + chegada_direito + ultima escolha manual do dono
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_l from fabio_delivery.chegada_dia(p_dia) x;
  v_l := chegada_direito(v_l, p_dia);
  return (
    with t as (
      select e, e->>'unidade' unidade, e->>'entregador' entregador, coalesce((e->>'n_turno')::int, 1) n_turno,
             coalesce((e->>'na_escala')::boolean, false) na_escala, e->>'direito' direito,
             coalesce((e->>'garantido_perdido')::boolean, false) gp,
             nullif(e->>'chegou_txt', '') chegou_txt,
             case when nullif(e->>'escala_txt', '') ~ '^\d{2}:\d{2}'
                  then (p_dia + left(e->>'escala_txt', 5)::time) at time zone 'America/Sao_Paulo' end combinado
        from jsonb_array_elements(v_l) e
    ), l as (
      select t.*, lead(t.combinado) over (partition by t.unidade, t.entregador order by t.n_turno) proximo,
             (p_dia + t.chegou_txt::time
               + case when t.chegou_txt::time < time '05:00' then interval '1 day' else interval '0' end)
               at time zone 'America/Sao_Paulo' chegada
        from t
    ), m as (
      select l.*, g.valor g_manual, r.valor r_manual, s.saida
        from l
        left join lateral (select mm.valor from motoboy_direito_manual mm
                            where mm.dia = p_dia and mm.unidade = l.unidade
                              and mm.chave_curta = lower(extensions.unaccent(l.entregador))
                              and mm.campo = 'garantido' and mm.n_turno = 0
                            order by mm.id desc limit 1) g on true
        left join lateral (select mm.valor from motoboy_direito_manual mm
                            where mm.dia = p_dia and mm.unidade = l.unidade
                              and mm.chave_curta = lower(extensions.unaccent(l.entregador))
                              and mm.campo = 'rango' and mm.n_turno = l.n_turno
                            order by mm.id desc limit 1) r on true
        -- saida registrada = so batida de saida (QR), como na tela; fim da escala nao e saida
        left join lateral (select max(q.ultima_saida) saida from foody_vw_horas_qr q
                            where q.dia_operacional = p_dia and q.unidade = l.unidade
                              and q.completo and q.sem_batida_saida = 0
                              and lower(extensions.unaccent(q.nome)) = lower(extensions.unaccent(l.entregador))
                              and l.combinado is not null and q.ultima_saida >= l.combinado
                              and q.ultima_saida < coalesce(l.proximo, 'infinity'::timestamptz)) s on true
       where l.chegou_txt is not null
    ), v as (
      select m.*,
             coalesce(m.g_manual, not (m.gp or coalesce(m.direito, '') in ('perdeu', 'rango_excecao'))) vale_g,
             coalesce(m.r_manual, m.direito is distinct from 'perdeu') vale_r
        from m
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'unidade', v.unidade, 'dia_operacional', p_dia, 'entregador', v.entregador, 'n_turno', v.n_turno,
             'chegada', v.chegada,
             'linha',
               '• ' || v.entregador || case when v.na_escala then '' else ' (fora da escala)' end
               || ' — ' || case when nullif(v.e->>'escala_txt', '') is null then 'sem horário combinado'
                                else 'entrada ' || left(v.e->>'escala_txt', 5) end
               || ' · chegou ' || left(v.chegou_txt, 5)
               || ' · saída: ' || coalesce(to_char(v.saida at time zone 'America/Sao_Paulo', 'HH24:MI'), 'ainda não')
               || E'\n  Garantido: '
               || case when v.g_manual is not null then case when v.vale_g then '✅ Sim' else '❌ Não' end || ' (decisão do dono)'
                       when not v.na_escala then '🟡 A conferir'
                       when v.direito in ('no_prazo', 'aguarda_balcao') then '⏳ Aguardando'
                       when v.direito is null or v.direito = 'nao_chegou' then '🟡 A conferir'
                       when v.vale_g then '✅ Sim' else '❌ Não' end
               || ' · Refeição: '
               || case when v.r_manual is not null then case when v.vale_r then '✅ Sim' else '❌ Não' end || ' (decisão do dono)'
                       when not v.na_escala then '🟡 A conferir'
                       when v.direito in ('no_prazo', 'aguarda_balcao') then '⏳ Aguardando'
                       when v.direito is null or v.direito = 'nao_chegou' then '🟡 A conferir'
                       when v.vale_r then '✅ Sim' else '❌ Não' end
               || case when not v.na_escala then ' (sem escala vinculada)'
                       when v.direito = 'perdeu' then coalesce(' (limite era ' || nullif(v.e->>'limite_txt', '') || ')', ' (passou do limite)')
                       when v.direito = 'rango_excecao' then ' (passou do limite, mas tem combinado: fica com a refeição)'
                       when v.direito = 'sem_prova' then ' (sem prova do GPS: não se corta, conferir)'
                       when v.direito = 'ok' and v.gp then ' (garantido do dia já caiu em outro turno)'
                       else '' end
           ) order by v.unidade, v.chegada), '[]'::jsonb)
      from v
  );
end $function$;

revoke all on function public.escala_canal_chegadas_linhas(date) from public, anon, authenticated;

create or replace function public.escala_canal_chegadas(p_so_testar boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'vault', 'pg_temp'
as $function$
declare
  -- 13/11/2026: mesmo dia operacional da tela Chegada (vira as 05h)
  v_dia date := ((now() at time zone 'America/Sao_Paulo') - interval '5 hours')::date;
  p record; v_novas jsonb; v_txt text; v_env text; v_n int; v_saida jsonb := '[]'::jsonb; v_janela boolean;
begin
  if not pg_try_advisory_xact_lock(hashtext('escala_canal_chegadas')) then return jsonb_build_object('pulou', 'ja esta rodando'); end if;
  select coalesce(jsonb_agg(x order by x->>'unidade', (x->>'chegada')::timestamptz), '[]'::jsonb) into v_novas
    from jsonb_array_elements(escala_canal_chegadas_linhas(v_dia)) x
   where (x->>'chegada')::timestamptz > now() - interval '3 hours'      -- chegada velha nao se manda
     and not exists (select 1 from escala_canal_chegada_enviada e
                      where e.unidade = x->>'unidade' and e.dia_operacional = v_dia
                        and e.entregador = x->>'entregador' and e.n_turno = (x->>'n_turno')::int);
  v_n := jsonb_array_length(v_novas);
  if v_n = 0 then return jsonb_build_object('novas', 0); end if;

  select string_agg(bloco, E'\n\n' order by unidade) into v_txt from (
    select x->>'unidade' unidade,
           '*' || (x->>'unidade') || E'*\n' || string_agg(x->>'linha', E'\n' order by (x->>'chegada')::timestamptz) bloco
      from jsonb_array_elements(v_novas) x group by x->>'unidade') b;
  v_txt := E'🛵 *Chegada dos motoboys* (pelo sistema)\n\n' || v_txt || E'\n\nSe algum horário estiver errado, me avise aqui.';

  for p in select id, numeros[1] num, numeros from escala_canal_pessoa where ativo and nome='Jaison' loop
    select exists (select 1 from whatsapp_msg m where m.direcao = 'recebida' and m.ocorrido_em > now() - interval '24 hours'
                     and regexp_replace(coalesce(m.numero_contato,''), '\D', '', 'g') = any(p.numeros)) into v_janela;
    if p_so_testar then
      v_saida := v_saida || jsonb_build_object('para', right(p.num, 4), 'janela_24h', v_janela, 'texto', v_txt);
    elsif v_janela then
      v_env := whatsapp_avisar_numero(p.num, v_txt);
      v_saida := v_saida || jsonb_build_object('para', right(p.num, 4), 'envio', v_env);
    else
      v_saida := v_saida || jsonb_build_object('para', right(p.num, 4), 'envio', 'nao mandei: fora das 24h');
    end if;
  end loop;

  if not p_so_testar and (v_env like 'ok%' or v_env is null) then
    -- marca como tratada (mandada ou fora das 24h): chegada nao e reenviada depois
    insert into escala_canal_chegada_enviada (unidade, dia_operacional, entregador, n_turno, chegada, como)
    select x->>'unidade', (x->>'dia_operacional')::date, x->>'entregador', (x->>'n_turno')::int, (x->>'chegada')::timestamptz,
           left(coalesce(v_env, 'fora das 24h'), 60)
      from jsonb_array_elements(v_novas) x
    on conflict do nothing;
    insert into log_rotina (rotina, dia_alvo, status, etapa, detalhe, linhas_gravadas)
    values ('escala-jaison-chegadas', v_dia,
            case when v_env like 'ok%' then 'OK' when v_env is null then 'NADA_A_FAZER' else 'FALHA' end, 'v2-linha-da-tela',
            format('chegadas novas: %s | %s', v_n, left(v_saida::text, 400)), v_n);
  end if;
  return jsonb_build_object('novas', v_n, 'saida', v_saida);
end $function$;
