-- Fabio, 14/11/2026 (chat-lanche-motoboy-batata-14-11), palavras dele:
-- "E um prato que e o prato do dia R$24,50, um hamburguer sozinho R$24,50, e quando for
--  hamburguer com batata, o One Rings R$29,90." + "E R$29,90 o valor."
-- So muda o PRECO do lanche que ja seria cobrado (quem passou do direito). Quem tem direito continua sem pagar.
-- A batata / onion rings ja vem marcada no Saipos como escolha do lanche de funcionario
-- (payload items[].choices[].desc_sale_item_choice = 'BATATA FUNCIONARIOS' / 'ONION RINGS FUNCIONARIOS').
-- Vale do dia operacional 14/11/2026 em diante. Lacres anteriores nao mudam.
-- Nenhuma funcao nova e nenhuma mudanca de permissao.

insert into motoboy_param(chave, valor, descricao) values
 ('refeicao_preco_com_acomp', 29.90, 'Lanche cobrado do motoboy quando o hamburguer vai COM batata ou onion rings (escolha BATATA FUNCIONARIOS / ONION RINGS FUNCIONARIOS no Saipos). Fabio 14/11/2026: "hamburguer com batata, o One Rings R$29,90". Sem acompanhamento e prato do dia continuam em refeicao_preco_fixo.'),
 ('refeicao_preco_com_acomp_desde', 20261114, 'A partir deste dia operacional (AAAAMMDD) vale refeicao_preco_com_acomp. Antes, lanche com batata cobrava refeicao_preco_fixo. Lacres anteriores nao mudam.')
on conflict (chave) do nothing;

-- Troca, na view e na funcao do dia, o trecho do preco (CASE ... END AS preco_refeicao) e a ordem do desempate.
do $do$
declare
  v_def text; v_ini int; v_fim int; v_novo text;
  c_fim constant text := 'END AS preco_refeicao';
  -- Preco escrito DENTRO da view e da funcao do dia (sem funcao auxiliar): assim ninguem ganha nem perde permissao;
  -- quem ja lia a view (claude_leitor, service_role) continua lendo igual.
  c_expr constant text := $e$(CASE WHEN (to_char(k.dia_operacional, 'YYYYMMDD'))::numeric >= COALESCE((SELECT mp.valor FROM motoboy_param mp WHERE mp.chave = 'refeicao_preco_fixo_desde'), 99999999)
      THEN CASE WHEN (to_char(k.dia_operacional, 'YYYYMMDD'))::numeric >= COALESCE((SELECT mp.valor FROM motoboy_param mp WHERE mp.chave = 'refeicao_preco_com_acomp_desde'), 99999999)
                 AND EXISTS (SELECT 1
                       FROM saipos_raw_item r,
                            LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.payload -> 'items') = 'array' THEN r.payload -> 'items' ELSE '[]'::jsonb END) it(value),
                            LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(it.value -> 'choices') = 'array' THEN it.value -> 'choices' ELSE '[]'::jsonb END) c(value)
                      WHERE r.unidade = k.unidade
                        AND ((r.payload ->> 'id_sale'))::bigint = (k.id_sale)::bigint
                        AND COALESCE(it.value ->> 'deleted', 'N') <> 'Y'
                        AND COALESCE(c.value ->> 'deleted', 'N') <> 'Y'
                        AND upper(COALESCE(c.value ->> 'desc_sale_item_choice', '')) IN ('BATATA FUNCIONARIOS', 'ONION RINGS FUNCIONARIOS'))
                THEN COALESCE((SELECT mp.valor FROM motoboy_param mp WHERE mp.chave = 'refeicao_preco_com_acomp'), (SELECT mp.valor FROM motoboy_param mp WHERE mp.chave = 'refeicao_preco_fixo'), pr.valor)
                ELSE COALESCE((SELECT mp.valor FROM motoboy_param mp WHERE mp.chave = 'refeicao_preco_fixo'), pr.valor) END
      ELSE pr.valor END)$e$;
  c_call constant text := c_expr || ' AS preco_refeicao';
  -- Desempate fixo: a ordem antiga (pr.valor DESC) ja dava o lanche mais caro como o de direito e cobrava o mais barato.
  -- Com dois precos (24,50 / 29,90) o empate de cardapio precisa de ordem certa: o de 29,90 conta como direito, cobra-se o de 24,50; depois id_sale.
  c_ord_de constant text := 'ORDER BY pr.valor DESC)';
  c_ord_para constant text := 'ORDER BY pr.valor DESC, ' || c_expr || ' DESC, k.id_sale)';
begin
  -- view
  v_def := pg_get_viewdef('public.vw_motoboy_refeicao'::regclass);
  if position('refeicao_preco_com_acomp' in v_def) = 0 then
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
  if position('refeicao_preco_com_acomp' in v_def) = 0 then
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
