-- Fabio, 14/11/2026 (chat-lanche-motoboy-batata-14-11), palavras dele:
-- "E um prato que e o prato do dia R$24,50, um hamburguer sozinho R$24,50, e quando for
--  hamburguer com batata, o One Rings R$29,90." + "E R$29,90 o valor."
-- So muda o PRECO do lanche que ja seria cobrado (quem passou do direito). Quem tem direito continua sem pagar.
-- A batata / onion rings ja vem marcada no Saipos como escolha do lanche de funcionario
-- (payload items[].choices[].desc_sale_item_choice = 'BATATA FUNCIONARIOS' / 'ONION RINGS FUNCIONARIOS').
-- Vale do dia operacional 14/11/2026 em diante. Lacres anteriores nao mudam.

insert into motoboy_param(chave, valor, descricao) values
 ('refeicao_preco_com_acomp', 29.90, 'Lanche cobrado do motoboy quando o hamburguer vai COM batata ou onion rings (escolha BATATA FUNCIONARIOS / ONION RINGS FUNCIONARIOS no Saipos). Fabio 14/11/2026: "hamburguer com batata, o One Rings R$29,90". Sem acompanhamento e prato do dia continuam em refeicao_preco_fixo.'),
 ('refeicao_preco_com_acomp_desde', 20261114, 'A partir deste dia operacional (AAAAMMDD) vale refeicao_preco_com_acomp. Antes, lanche com batata cobrava refeicao_preco_fixo. Lacres anteriores nao mudam.')
on conflict (chave) do nothing;

create or replace function public.motoboy_refeicao_preco(p_unidade text, p_id_sale text, p_dia date, p_preco_produto numeric)
returns numeric
language sql
stable
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
  select case
    when to_char(p_dia,'YYYYMMDD')::numeric >= coalesce((select mp.valor from motoboy_param mp where mp.chave = 'refeicao_preco_fixo_desde'), 99999999)
    then case
      when to_char(p_dia,'YYYYMMDD')::numeric >= coalesce((select mp.valor from motoboy_param mp where mp.chave = 'refeicao_preco_com_acomp_desde'), 99999999)
       and exists (
            select 1
              from saipos_raw_item r,
                   lateral jsonb_array_elements(case when jsonb_typeof(r.payload -> 'items') = 'array' then r.payload -> 'items' else '[]'::jsonb end) it(value),
                   lateral jsonb_array_elements(case when jsonb_typeof(it.value -> 'choices') = 'array' then it.value -> 'choices' else '[]'::jsonb end) c(value)
             where r.unidade = p_unidade
               and ((r.payload ->> 'id_sale'))::bigint = p_id_sale::bigint
               and coalesce(it.value ->> 'deleted', 'N') <> 'Y'
               and coalesce(c.value ->> 'deleted', 'N') <> 'Y'
               and upper(coalesce(c.value ->> 'desc_sale_item_choice', '')) in ('BATATA FUNCIONARIOS', 'ONION RINGS FUNCIONARIOS'))
      then coalesce((select mp.valor from motoboy_param mp where mp.chave = 'refeicao_preco_com_acomp'),
                    (select mp.valor from motoboy_param mp where mp.chave = 'refeicao_preco_fixo'),
                    p_preco_produto)
      else coalesce((select mp.valor from motoboy_param mp where mp.chave = 'refeicao_preco_fixo'), p_preco_produto)
    end
    else p_preco_produto
  end
$fn$;

-- Sem grant novo: igual as vizinhas (motoboy_refeicao_do_dia), so postgres e service_role executam.
revoke all on function public.motoboy_refeicao_preco(text, text, date, numeric) from public, anon, authenticated;

-- Troca, na view e na funcao do dia, SO o trecho do preco (CASE ... END AS preco_refeicao) pela chamada acima.
do $do$
declare
  v_def text; v_ini int; v_fim int; v_novo text;
  c_fim constant text := 'END AS preco_refeicao';
  c_call constant text := 'motoboy_refeicao_preco(k.unidade, k.id_sale, k.dia_operacional, pr.valor) AS preco_refeicao';
  -- Desempate fixo: a ordem antiga (pr.valor DESC) ja dava o lanche mais caro como o de direito e cobrava o mais barato.
  -- Com dois precos (24,50 / 29,90) o empate de cardapio precisa de ordem certa: o de 29,90 conta como direito, cobra-se o de 24,50; depois id_sale.
  c_ord_de constant text := 'ORDER BY pr.valor DESC)';
  c_ord_para constant text := 'ORDER BY pr.valor DESC, (motoboy_refeicao_preco(k.unidade, k.id_sale, k.dia_operacional, pr.valor)) DESC, k.id_sale)';
begin
  -- view
  v_def := pg_get_viewdef('public.vw_motoboy_refeicao'::regclass);
  if position('motoboy_refeicao_preco(' in v_def) = 0 then
    if (length(v_def) - length(replace(v_def, 'to_char(', ''))) / length('to_char(') <> 1
       or (length(v_def) - length(replace(v_def, c_fim, ''))) / length(c_fim) <> 1 then
      raise exception 'vw_motoboy_refeicao: ancora do preco nao e unica';
    end if;
    v_fim := position(c_fim in v_def) + length(c_fim);
    v_ini := length(left(v_def, position('to_char(' in v_def))) - position('ESAC' in reverse(left(v_def, position('to_char(' in v_def)))) - 2;
    if substr(v_def, v_ini, 4) <> 'CASE' then raise exception 'vw_motoboy_refeicao: inicio do CASE nao achado'; end if;
    v_novo := left(v_def, v_ini - 1) || c_call || substr(v_def, v_fim);
    if (length(v_novo) - length(replace(v_novo, c_ord_de, ''))) / length(c_ord_de) <> 1 then raise exception 'vw_motoboy_refeicao: ancora da ordem nao e unica'; end if;
    v_novo := replace(v_novo, c_ord_de, c_ord_para);
    execute 'create or replace view public.vw_motoboy_refeicao as ' || v_novo;
  end if;

  -- funcao do dia
  v_def := pg_get_functiondef('public.motoboy_refeicao_do_dia(date)'::regprocedure);
  if position('motoboy_refeicao_preco(' in v_def) = 0 then
    if (length(v_def) - length(replace(v_def, 'to_char(', ''))) / length('to_char(') <> 1
       or (length(v_def) - length(replace(v_def, c_fim, ''))) / length(c_fim) <> 1 then
      raise exception 'motoboy_refeicao_do_dia: ancora do preco nao e unica';
    end if;
    v_fim := position(c_fim in v_def) + length(c_fim);
    v_ini := length(left(v_def, position('to_char(' in v_def))) - position('ESAC' in reverse(left(v_def, position('to_char(' in v_def)))) - 2;
    if substr(v_def, v_ini, 4) <> 'CASE' then raise exception 'motoboy_refeicao_do_dia: inicio do CASE nao achado'; end if;
    v_novo := left(v_def, v_ini - 1) || c_call || substr(v_def, v_fim);
    if (length(v_novo) - length(replace(v_novo, c_ord_de, ''))) / length(c_ord_de) <> 1 then raise exception 'motoboy_refeicao_do_dia: ancora da ordem nao e unica'; end if;
    v_novo := replace(v_novo, c_ord_de, c_ord_para);
    execute v_novo;
  end if;
end
$do$;
