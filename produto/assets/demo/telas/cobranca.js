/* Cobranca na Porta (demonstracao).
   Simula a porta cobranca_consulta:
     p_dados {dias: 7|15|30}  -> periodo que termina ontem
     p_dados {dia: 'AAAA-MM-DD'} -> um dia so
   Devolve {fila, conferido, arquivado, agora, hoje, dias, de_texto, ate_texto} (ou dia e dia_texto).
   Os casos saem dos pedidos pagos na entrega de MUNDO.pedidos (cartao na entrega, dinheiro, Pix):
   no cartao, sao os pedidos que a Conferencia da Maquininha marca como "a cobrar do motoboy";
   em dinheiro e Pix, uma parte pequena sorteada de forma repetivel. A varredura e de exemplo. */
(function () {
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;
  var SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  function diaTxt(iso) { return M.br(iso) + ' · ' + SEM[M.diaSemana(iso)]; }
  function dinheiro(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); }
  function idade(iso) { return Math.round((new Date(M.hoje() + 'T12:00:00Z') - new Date(iso + 'T12:00:00Z')) / 864e5); }

  var FONTES = {
    cartao: ['Rede', 'Saipos', 'iFood', 'GPS', 'Cofre'],
    dinheiro: ['Cofre', 'Saipos', 'iFood', 'GPS', 'Extrato'],
    pix: ['Extrato', 'Pix', 'Saipos', 'iFood', 'GPS']
  };
  var MEIO = { cartao: 'Cartão na entrega', dinheiro: 'Dinheiro', pix: 'Pix' };
  var RESULTADOS = {
    cartao: [['canhoto', 30], ['nao cobrou', 40], ['balcao', 30]],
    dinheiro: [['dinheiro', 45], ['balcao', 20], ['nao cobrou', 20], ['canhoto', 15]],
    pix: [['cobrado', 60], ['nao cobrou', 25], ['balcao', 15]]
  };
  var QUEM = { cobrado: 'Varredura automática', dinheiro: 'Escritório', balcao: 'Gerente da loja', canhoto: 'Escritório', 'nao cobrou': 'Gerente da loja' };

  /* o pedido vira caso? e de que tipo */
  function tipoDe(p) {
    if (p.cancelado || p.canal === 'retirada' || p.status !== 'entregue') return null;
    if (p.pagamento === 'cartao_na_entrega') {
      var maq = D.maquininha;
      return maq && maq.situacao(p).situacao === 'A COBRAR DO MOTOBOY' ? 'cartao' : null;
    }
    var r = M.rng('porta|' + p.id);
    if (p.pagamento === 'dinheiro') return r() < 0.05 ? 'dinheiro' : null;
    if (p.pagamento === 'pix') return r() < 0.03 ? 'pix' : null;
    return null;
  }

  function situacaoTxt(t, p, conferido) {
    var s = t === 'cartao' ? 'O Saipos registrou cartão, mas nenhuma maquininha da loja tem transação de ' + dinheiro(p.total) + ' perto das ' + (p.hora_entrega || p.hora_pedido) + '.'
          : t === 'dinheiro' ? 'Pago em dinheiro na entrega; o valor não entrou no fechamento do cofre do dia.'
          : 'Pix na entrega; nenhum Pix desse valor no extrato até o dia seguinte.';
    return s + (conferido ? ' Conferido em todas as fontes: falta a explicação da equipe.' : ' Ainda faltam fontes para conferir.');
  }

  function montar(dias) {
    var fila = [], conferido = [], arquivado = [];
    dias.forEach(function (dia) {
      if (dia >= M.hoje()) return; /* a varredura olha ate ontem */
      M.pedidos(dia).forEach(function (p) {
        var t = tipoDe(p);
        if (!t) return;
        var r = M.rng('cob|' + p.id);
        var age = idade(dia);
        var base = {
          dia: diaTxt(dia), unidade: p.unidade, pedido: p.numero,
          entregador: p.motoboy_nome || '—', valor: p.total, _dia: dia, _min: p.min_entrega
        };
        var pResolve = age >= 5 ? 0.65 : age >= 2 ? 0.55 : 0.2;
        if (r() < pResolve) {
          var res = M.pesado(r, RESULTADOS[t]);
          var quando = M.somaDias(dia, Math.max(1, Math.min(age, M.entre(r, 1, 3))));
          var hora = M.entre(r, 9 * 60 + 20, 17 * 60);
          if (quando === M.hoje()) hora = Math.min(hora, Math.max(0, M.minutosAgora() - M.entre(r, 5, 60)));
          base.resultado = res;
          base.olhamos = FONTES[t].slice();
          base.quem = QUEM[res];
          base.quando = M.br(quando) + ' às ' + M.hm(hora);
          conferido.push(base);
        } else if (age >= 5) {
          base.arquivado_em = M.br(M.somaDias(dia, 5)) + ' · sem explicação em 5 dias';
          arquivado.push(base);
        } else {
          var conf = age >= 3 || r() < 0.35; /* caso recente pode estar so detectado */
          base.meio = MEIO[t];
          base.cliente = p.cliente;
          base.hora = p.hora_entrega || p.hora_pedido;
          base.conferido = conf;
          base.situacao = situacaoTxt(t, p, conf);
          base.olhamos = conf ? FONTES[t].slice() : FONTES[t].slice(0, M.entre(r, 2, 3));
          fila.push(base);
        }
      });
    });
    function ordem(a, b) { return a._dia !== b._dia ? (a._dia < b._dia ? 1 : -1) : b._min - a._min; }
    function limpa(l) { return l.sort(ordem).map(function (x) { delete x._dia; delete x._min; return x; }); }
    return { fila: limpa(fila), conferido: limpa(conferido), arquivado: limpa(arquivado) };
  }

  D.rpc('cobranca_consulta', function (b) {
    var dd = (b && b.p_dados) || {};
    var hoje = M.hoje();
    var agora = M.agoraISO();
    var o;
    if (dd.dia && /^\d{4}-\d{2}-\d{2}$/.test(dd.dia)) {
      var dia = dd.dia > hoje ? hoje : dd.dia;
      o = montar([dia]);
      o.dia = dia;
      o.dia_texto = diaTxt(dia);
    } else {
      var n = Math.max(1, Math.min(90, +dd.dias || 7));
      var de = M.dia(-n), ate = M.dia(-1);
      o = montar(M.intervalo(de, ate));
      o.dias = n;
      o.de_texto = M.br(de);
      o.ate_texto = M.br(ate);
    }
    o.hoje = hoje;
    o.agora = M.br(hoje) + ' às ' + agora.slice(11, 16);
    return o;
  });
})();
