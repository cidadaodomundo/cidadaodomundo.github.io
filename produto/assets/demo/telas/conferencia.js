/* Conferencia da Maquininha (demonstracao).
   Simula a porta conferencia_maquininha:
     p_acao 'resumo'      -> [{situacao, casos, valor}]
     p_acao 'lista'       -> [{dia_operacional, unidade, n_pedido, quando, entregador, meio, valor,
                              saipos_forma, rede_nsu, hora_na_rede, dif_min, situacao, motivo}]
     p_acao 'por_motoboy' -> [{entregador, cobrou, conferido, provavel, a_cobrar, valor_a_cobrar, comanda_nao_cobrada}]
     p_dados {de, ate} (dias no formato AAAA-MM-DD)
   Base: pedidos pagos com cartao na entrega de MUNDO.pedidos. Cada pedido recebe sempre a mesma
   situacao, cruzando o app de entregas, o Saipos e a maquininha (Rede). Maquininhas com apelidos
   genericos. Expoe DEMO.maquininha para a tela Cobranca na Porta usar os mesmos casos. */
(function () {
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* duas maquininhas por loja: Maquininha 1 e 2 na primeira loja, 3 e 4 na segunda... */
  var MAQ = {};
  M.lojas.forEach(function (l, i) { MAQ[l.id] = ['Maquininha ' + (i * 2 + 1), 'Maquininha ' + (i * 2 + 2)]; });

  /* um dia antigo em que a Rede nao mandou o arquivo de uma das lojas (exemplo) */
  var ULTIMA = M.lojas.length ? M.lojas[M.lojas.length - 1].id : '';
  function semRede(p) { return p.dia === M.dia(-9) && p.loja === ULTIMA; }

  var FORMAS = [['Crédito', 50], ['Débito', 40], ['Vale-refeição', 10]];
  function dinheiro(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); }

  function ehCartaoNaPorta(p) {
    return p.pagamento === 'cartao_na_entrega' && !p.cancelado && p.canal !== 'retirada' && p.status === 'entregue';
  }

  /* situacao repetivel de um pedido pago com cartao na entrega */
  var memo = {};
  function situacaoDe(p) {
    if (memo[p.id]) return memo[p.id];
    var r = M.rng('maq|' + p.id);
    var forma = M.pesado(r, FORMAS);
    var maq = M.escolhe(r, MAQ[p.loja] || ['Maquininha 1']);
    var nsu = String(M.entre(r, 100000000, 999999999));
    var x = r();
    var o = { meio: 'Cartão · ' + forma, saipos_forma: forma, rede_nsu: null, hora_na_rede: null, dif_min: null };
    function naRede(dif) {
      o.rede_nsu = nsu;
      o.dif_min = Math.abs(dif);
      o.hora_na_rede = M.hm(((p.min_entrega + dif) % 1440 + 1440) % 1440) + ' · ' + maq;
    }
    if (p.dia === M.hoje()) {
      o.situacao = 'SEM DADO DA REDE';
      o.motivo = 'o arquivo da Rede do dia chega na manhã seguinte';
    } else if (semRede(p)) {
      o.situacao = 'SEM DADO DA REDE';
      o.motivo = 'a Rede não mandou o arquivo deste dia desta loja';
    } else if (x < 0.012) {
      o.situacao = 'A COBRAR DO MOTOBOY';
      o.motivo = 'o Saipos confirma cartão de ' + dinheiro(p.total) + ' e nenhuma maquininha da loja tem transação desse valor no horário';
    } else if (x < 0.022) {
      o.situacao = 'COMANDA NAO COBRADA';
      o.saipos_forma = 'comanda em aberto';
      naRede(M.entre(r, -2, 4));
      o.motivo = 'a transação está na Rede, mas a comanda ficou aberta no Saipos (falta fechar no caixa)';
    } else if (x < 0.032) {
      o.situacao = 'SEM VENDA NO SAIPOS';
      o.saipos_forma = null;
      naRede(M.entre(r, -2, 5));
      o.motivo = 'a transação está na Rede, mas o pedido não foi lançado no Saipos';
    } else if (x < 0.07) {
      o.situacao = 'PROVAVEL - CONFERIR';
      var longe = r() < 0.6;
      naRede(longe ? M.entre(r, 22, 75) : M.entre(r, -3, 6));
      o.motivo = longe ? 'há transação do mesmo valor, mas longe do horário da entrega'
                       : 'há transação no horário, com centavos de diferença no valor';
    } else if (x < 0.10) {
      o.situacao = 'PAGO DE OUTRO JEITO';
      o.saipos_forma = r() < 0.6 ? 'Pix' : 'Dinheiro';
      o.motivo = 'o Saipos registrou ' + o.saipos_forma + ': o cliente trocou a forma de pagamento na porta';
    } else {
      o.situacao = 'CONFERIDO';
      naRede(M.entre(r, -1, 6));
      o.motivo = 'bate nas três fontes';
    }
    memo[p.id] = o;
    return o;
  }

  var ORDEM = ['A COBRAR DO MOTOBOY', 'COMANDA NAO COBRADA', 'SEM VENDA NO SAIPOS', 'PROVAVEL - CONFERIR', 'PAGO DE OUTRO JEITO', 'SEM DADO DA REDE', 'CONFERIDO'];

  /* todos os pedidos de cartao na entrega de um periodo, ja com a situacao */
  var cache = {};
  function casos(de, ate) {
    var hoje = M.hoje();
    if (!de || de > ate) de = M.somaDias(ate || hoje, -30);
    if (!ate || ate > hoje) ate = hoje;
    if (de < M.somaDias(ate, -92)) de = M.somaDias(ate, -92);
    var k = de + '|' + ate;
    if (cache[k]) return cache[k];
    var lista = [];
    M.intervalo(de, ate).forEach(function (dia) {
      M.pedidos(dia).forEach(function (p) {
        if (!ehCartaoNaPorta(p)) return;
        var s = situacaoDe(p);
        lista.push({
          id: p.id, loja: p.loja, min: p.min_entrega,
          dia_operacional: p.dia,
          unidade: p.unidade,
          n_pedido: '#' + p.numero,
          quando: 'entregue ' + (p.hora_entrega || p.hora_pedido),
          entregador: p.motoboy_nome || '—',
          meio: s.meio,
          valor: p.total,
          saipos_forma: s.saipos_forma,
          rede_nsu: s.rede_nsu,
          hora_na_rede: s.hora_na_rede,
          dif_min: s.dif_min,
          situacao: s.situacao,
          motivo: s.motivo
        });
      });
    });
    lista.sort(function (a, b) {
      var d = ORDEM.indexOf(a.situacao) - ORDEM.indexOf(b.situacao);
      if (d) return d;
      if (a.dia_operacional !== b.dia_operacional) return a.dia_operacional < b.dia_operacional ? 1 : -1;
      return b.min - a.min;
    });
    cache[k] = lista;
    return lista;
  }

  function semInterno(l) {
    return l.map(function (x) {
      var o = {};
      for (var c in x) if (c !== 'id' && c !== 'loja' && c !== 'min') o[c] = x[c];
      return o;
    });
  }

  D.rpc('conferencia_maquininha', function (b) {
    var dd = (b && b.p_dados) || {};
    var l = casos(dd.de, dd.ate);
    var acao = b && b.p_acao;
    if (acao === 'resumo') {
      var g = {};
      l.forEach(function (x) {
        var s = g[x.situacao] || (g[x.situacao] = { situacao: x.situacao, casos: 0, valor: 0 });
        s.casos++; s.valor += x.valor;
      });
      return ORDEM.filter(function (s) { return g[s]; }).map(function (s) { g[s].valor = M.arred(g[s].valor); return g[s]; });
    }
    if (acao === 'por_motoboy') {
      var m = {};
      l.forEach(function (x) {
        var e = m[x.entregador] || (m[x.entregador] = { entregador: x.entregador, cobrou: 0, conferido: 0, provavel: 0, a_cobrar: 0, valor_a_cobrar: 0, comanda_nao_cobrada: 0 });
        e.cobrou++;
        if (x.situacao === 'CONFERIDO') e.conferido++;
        else if (x.situacao === 'PROVAVEL - CONFERIR') e.provavel++;
        else if (x.situacao === 'A COBRAR DO MOTOBOY') { e.a_cobrar++; e.valor_a_cobrar += x.valor; }
        else if (x.situacao === 'COMANDA NAO COBRADA') e.comanda_nao_cobrada++;
      });
      return Object.keys(m).map(function (k) { m[k].valor_a_cobrar = M.arred(m[k].valor_a_cobrar); return m[k]; });
    }
    return semInterno(l);
  });

  /* para a tela Cobranca na Porta (mesmos pedidos, mesma situacao) */
  D.maquininha = { situacao: situacaoDe, ehCartaoNaPorta: ehCartaoNaPorta, casos: casos };
})();
