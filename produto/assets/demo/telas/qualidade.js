/* Qualidade do Delivery (demonstracao).
   Simula as portas da tela qualidade/:
     qualidade_consulta      {periodo, dias, unidade} -> numeros do periodo e do periodo anterior
     qualidade_cancelamentos {periodo, dias, unidade} -> relatorio de cancelamentos do iFood (chega no dia seguinte)
     qualidade_cancel_vivo   {unidade}                -> cancelamentos e chat do iFood de hoje, por fonte
     qualidade_dia           {dia, unidade}           -> um dia em detalhe (turno, hora, atrasados)
     qualidade_frescor                                -> de quando e cada numero
     qualidade_super         {dias}                   -> Selo Super por marca, motivos de chamado e de cancelamento
     qualidade_avaliacoes    {unidade}                -> avaliacoes liberadas pelo iFood
     qualidade_negociacoes   {periodo, dias, unidade} -> chamados/negociacoes do iFood
     delivery_prazo_gw       {unidade}                -> prazo medido pelo Gestor Web, 14 dias
     reentrega2_consulta     (p_acao listar|motivos|marcar)
     maquininha_conferir     {dia, unidade}           -> cada entrega paga na porta x Rede x extrato x GPS
     maquininha_extrato      {dia, unidade, tudo}     -> passadas das maquininhas
   Tudo sai de MUNDO.pedidos (os mesmos pedidos das outras telas). Valores em R$ so vao para o dono (ctx.admin).
   Regras (prazo, raio do GPS, cobertura minima, Selo Super) sao de exemplo. */
(function () {
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG;

  /* ---------------- relogio: o dia de operacao vai das 5h as 5h ---------------- */
  function op() {
    var m = M.minutosAgora(), h = M.hoje();
    return m < 300 ? { dia: M.somaDias(h, -1), min: m + 1440 } : { dia: h, min: m };
  }
  function ifoodAte() { return M.somaDias(op().dia, -1); }   /* o relatorio do iFood chega no dia seguinte */
  function ped(dia, lojaId) { return dia > op().dia ? [] : M.pedidos(dia, lojaId); }
  function hmOp(min) { return M.hm(((Math.round(min) % 1440) + 1440) % 1440); }
  function isoMin(dia, min) { return M.ts(dia, min).slice(0, 16); }            /* 'YYYY-MM-DDTHH:MM' */
  function brHora(dia, min) { var t = M.ts(dia, min); return M.br(t.slice(0, 10)) + ' às ' + t.slice(11, 16); }

  /* ---------------- ajudantes ---------------- */
  function soma(a, f) { var t = 0; a.forEach(function (x) { t += f(x) || 0; }); return M.arred(t); }
  function media(a) { if (!a.length) return null; var t = 0; a.forEach(function (x) { t += x; }); return t / a.length; }
  function mediana(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var i = (s.length - 1) / 2; return (s[Math.floor(i)] + s[Math.ceil(i)]) / 2; }
  function r0(x) { return x == null ? null : Math.round(x); }
  function r1(x) { return x == null ? null : Math.round(x * 10) / 10; }
  function pct(a, b) { return b ? Math.round(100 * a / b) : null; }
  function lojasDe(unidade) { var l = unidade ? M.loja(unidade) : null; return l ? [l] : M.lojas; }
  function ehEntrega(p) { return p.canal !== 'retirada'; }
  function entregue(p) { return p.status === 'entregue' && ehEntrega(p); }
  function numPed(p) { return p.numero_ifood || String(p.numero); }
  function canalNome(c) { return c === 'ifood' ? 'iFood' : (c === 'proprio' ? 'Cardápio próprio' : 'Retirada'); }
  function turnoDe(min) { return hmOp(min) < '16:00' && hmOp(min) >= '05:00' ? 'Almoço' : 'Noite'; }
  var TURNO_NOME = { 'Almoço': 'Almoço (11h–16h)', 'Noite': 'Noite (16h–fechamento)' };
  function dinheiro(ctx, v) { return ctx.admin ? M.arred(v) : undefined; }
  function semDinheiro(ctx, o, chaves) { if (!ctx.admin) chaves.forEach(function (k) { delete o[k]; }); return o; }

  /* marcas de exemplo no iFood (uma loja pode vender com mais de uma marca) */
  var MARCAS = [C.marca, 'Smash Express', 'Marmita da Casa'];
  function marcaIdx(p) { if (p.canal !== 'ifood') return 0; var h = M.hash('marca|' + p.id) % 100; return h < 68 ? 0 : (h < 88 ? 1 : 2); }
  function marcaDe(p) { return MARCAS[marcaIdx(p)]; }
  function marcaIfood(idx, L) {   /* nome como o iFood mostra (com a loja no fim) */
    if (idx === 1) return (MARCAS[1] + ' ' + L.curto).toUpperCase();
    return MARCAS[idx] + ' - ' + L.nome;
  }

  /* ---------------- o que cada pedido "gerou" (repetivel) ---------------- */
  var MOT_CHAMADO = [
    ['Pedido atrasado', 'Durante a entrega'], ['Item faltando', 'Depois da entrega'], ['Item errado', 'Depois da entrega'],
    ['Pedido chegou frio', 'Depois da entrega'], ['Embalagem danificada', 'Depois da entrega'], ['Pedido não chegou', 'Durante a entrega'],
    ['Quer mudar o endereço', 'Antes da entrega']
  ];
  var cacheCh = {}, cacheEsc = {};
  /* primeiro pedido do iFood (nao cancelado) de cada loja e dia a partir de "desde" que passa no teste:
     garante alguns casos todo dia (chamado e parcial), sem depender do sorteio */
  function escolhido(p, chave, desde, teste) {
    var k = chave + '|' + p.dia + '|' + p.loja;
    if (cacheEsc[k] === undefined) {
      var l = M.pedidos(p.dia, p.loja), id = null;
      for (var i = 0; i < l.length; i++) {
        var q = l[i];
        if (q.canal === 'ifood' && !q.cancelado && q.min_pedido >= desde && (!teste || teste(q))) { id = q.id; break; }
      }
      if (!id) return false;          /* hoje: ainda nao chegou nenhum pedido que sirva */
      cacheEsc[k] = id;
    }
    return cacheEsc[k] === p.id;
  }
  function chamado(p) {   /* chamado do cliente no iFood (reclamacao aberta) */
    if (cacheCh[p.id] !== undefined) return cacheCh[p.id];
    var r = M.rng('chamado|' + p.id), x = r(), o = null;
    var garantido = p.canal === 'ifood' && !p.cancelado && p.min_pedido >= 735 && escolhido(p, 'ch', 735);
    if (garantido) x = 0;   /* um chamado por loja e dia, no almoco */
    if (p.canal === 'ifood' && p.cancelado && (p.motivo_cancelamento === 'Demora na entrega' || p.motivo_cancelamento === 'Cliente desistiu') && x < 0.45) {
      /* chamado que terminou em cancelamento */
      o = { motivo: 'Pedido atrasado', momento: 'Durante a entrega', evitado: false, virou_cancelamento: true, loja_nao_respondeu: r() < 0.3,
        reembolso: M.arred(p.total), impactou_super: true, arbitragem: false, fotos: false, quem: 'Cliente', oferta: M.escolhe(r, [10, 15, 20]),
        min: p.min_pedido + p.prazo_min + 3 };
    } else if (p.canal === 'ifood' && !p.cancelado && x < (p.atraso_min > 10 ? 0.07 : 0.006)) {
      var mot = p.atraso_min > 10 && r() < 0.7 ? MOT_CHAMADO[0] : MOT_CHAMADO[1 + Math.floor(r() * (MOT_CHAMADO.length - 1))];
      var evitado = r() < 0.62, reemb = !evitado && r() < 0.6;
      var naoResp = r() < 0.12;
      o = {
        motivo: mot[0], momento: mot[1], evitado: evitado, virou_cancelamento: false,
        loja_nao_respondeu: naoResp, reembolso: reemb ? M.arred(mot[0] === 'Item faltando' || mot[0] === 'Item errado' ? p.itens[p.itens.length - 1].preco : p.total * (r() < 0.5 ? 1 : 0.5)) : 0,
        impactou_super: !evitado && r() < 0.6, arbitragem: !evitado && r() < 0.15, fotos: (mot[0] === 'Item errado' || mot[0] === 'Embalagem danificada') && r() < 0.7,
        quem: r() < 0.85 ? 'Cliente' : 'iFood', oferta: mot[0] === 'Pedido atrasado' ? M.escolhe(r, [10, 15, 20]) : null,
        min: p.min_pedido + (mot[1] === 'Antes da entrega' ? 5 : (mot[1] === 'Durante a entrega' ? p.prazo_min + 3 : (p.min_entrega - p.min_pedido) + 12))
      };
    }
    cacheCh[p.id] = o;
    return o;
  }
  var ERRO = { 'Item indisponível': 'cozinha', 'Demora na entrega': 'entrega' };
  var CONTESTA = { 'Cliente desistiu': true, 'Pedido em duplicidade': true, 'Endereço fora da área': false, 'Problema no pagamento': false, 'Item indisponível': false, 'Demora na entrega': false };
  function cancInfo(p) {
    var r = M.rng('cancel|' + p.id);
    var erro = ERRO[p.motivo_cancelamento] || null;
    var saiu = p.motivo_cancelamento === 'Demora na entrega' || (p.motivo_cancelamento === 'Endereço fora da área' && r() < 0.5);
    var contestavel = CONTESTA[p.motivo_cancelamento];
    return {
      erro: erro, saiu: saiu, entregador: saiu && r() < 0.8 ? p.motoboy : null,
      contestavel: contestavel, contestou: !!contestavel && r() < 0.5,
      produto: erro === 'cozinha' ? p.itens[0].nome : null
    };
  }
  var MOT_PARCIAL = ['Item indisponível', 'Item veio errado', 'Item faltando no pacote'];
  function parcial(p) {   /* cancelamento parcial: um item devolvido */
    if (p.cancelado || p.canal !== 'ifood' || p.itens.length < 2) return null;
    var r = M.rng('parcial|' + p.id);
    var garantido = p.min_pedido >= 690 && escolhido(p, 'par', 690, function (q) { return q.itens.length >= 2; });
    if (r() > 0.03 && !garantido) return null;   /* um parcial garantido por loja e dia, no comeco do almoco */
    var it = p.itens[1 + Math.floor(r() * (p.itens.length - 1))];
    return { item: it.nome, valor: M.arred(it.preco * it.qtd), motivo: M.escolhe(r, MOT_PARCIAL), origem: r() < 0.6 ? 'pedido pela loja' : 'pedido pelo cliente', escreveu: r() < 0.7 };
  }

  /* ---------------- periodos ---------------- */
  function diasEntre(de, ate) { return M.intervalo(de, ate); }
  function periodo(nome, dias) {
    var o = op(), hoje = o.dia, de, ate = hoje, antesDe, antesAte, corte = null, turno = null;
    nome = nome || 'hoje';
    if (nome === 'turno') {
      turno = turnoDe(o.min); de = hoje; antesDe = antesAte = M.somaDias(hoje, -1); corte = o.min;
    } else if (nome === 'hoje') {
      de = hoje; antesDe = antesAte = M.somaDias(hoje, -1); corte = o.min;
    } else if (nome === 'ontem') {
      de = ate = M.somaDias(hoje, -1); antesDe = antesAte = M.somaDias(hoje, -2);
    } else if (nome === 'semana') {
      de = M.somaDias(hoje, -6); antesAte = M.somaDias(de, -1); antesDe = M.somaDias(antesAte, -6);   /* ultimos 7 dias */
    } else if (nome === 'quinzena') {
      var d = +hoje.slice(8, 10);
      de = hoje.slice(0, 8) + (d <= 15 ? '01' : '16');
      var n = diasEntre(de, hoje).length;
      antesAte = M.somaDias(de, -1); antesDe = M.somaDias(antesAte, -(n - 1));
    } else if (nome === 'mes') {
      de = hoje.slice(0, 8) + '01';
      var n2 = diasEntre(de, hoje).length;
      var mesAnt = M.somaDias(de, -1).slice(0, 8) + '01';
      antesDe = mesAnt; antesAte = M.somaDias(mesAnt, n2 - 1);
      if (antesAte >= de) antesAte = M.somaDias(de, -1);
    } else {
      var nn = Math.max(1, Math.min(120, +dias || 30));
      de = M.somaDias(hoje, -(nn - 1)); antesAte = M.somaDias(de, -1); antesDe = M.somaDias(antesAte, -(nn - 1));
    }
    return { de: de, ate: ate, antesDe: antesDe, antesAte: antesAte, corte: corte, turno: turno, dias: diasEntre(de, ate) };
  }
  /* pedidos de um intervalo; corte = minuto do dia (para comparar "ate a mesma hora") */
  function pedidosDe(de, ate, lojas, corte, turno) {
    var r = [];
    diasEntre(de, ate).forEach(function (d) {
      lojas.forEach(function (L) {
        ped(d, L.id).forEach(function (p) {
          if (corte != null && p.min_pedido > corte) return;
          if (turno && turnoDe(p.min_pedido) !== turno) return;
          r.push(p);
        });
      });
    });
    return r;
  }

  /* ---------------- contas de prazo ---------------- */
  function contaPrazo(lista) {
    var E = lista.filter(entregue);
    var atr = E.filter(function (p) { return !p.no_prazo; });
    return {
      entregas: E.length,
      no_prazo: E.length - atr.length,
      pct_prazo: pct(E.length - atr.length, E.length),
      atrasados: atr.length,
      atraso_medio: r0(media(atr.map(function (p) { return p.atraso_min; }))),
      pior_atraso: atr.length ? Math.max.apply(null, atr.map(function (p) { return p.atraso_min; })) : null,
      preparo_medio: r0(media(E.map(function (p) { return p.min_pronto - p.min_pedido; }))),
      coleta_media: r0(media(E.map(function (p) { return p.min_saida - p.min_pronto; }))),
      entrega_media: r0(media(E.map(function (p) { return p.min_entrega - p.min_saida; })))
    };
  }
  /* numeros do iFood (relatorio): so dos dias que ja chegaram */
  function contaIfood(lista) {
    var lim = ifoodAte();
    var L = lista.filter(function (p) { return p.dia <= lim && p.canal === 'ifood'; });
    var notas = L.filter(function (p) { return p.nota != null; });
    var ch = L.map(chamado).filter(Boolean);
    var canc = L.filter(function (p) { return p.cancelado; });
    return {
      tem: L.length > 0,
      nota: notas.length ? r1(media(notas.map(function (p) { return p.nota; }))) : null,
      notas_baixas: notas.filter(function (p) { return p.nota <= 3; }).length,
      cancelamentos: canc.length,
      erro_cozinha: canc.filter(function (p) { return ERRO[p.motivo_cancelamento] === 'cozinha'; }).length,
      erro_entrega: canc.filter(function (p) { return ERRO[p.motivo_cancelamento] === 'entrega'; }).length,
      chamados: ch.length,
      evitados: ch.filter(function (c) { return c.evitado; }).length
    };
  }
  function bloco(lista) {
    var a = contaPrazo(lista), b = contaIfood(lista);
    return {
      entregas: a.entregas, pct_prazo: a.pct_prazo, atraso_medio: a.atraso_medio, sem_prazo: 0,
      nota: b.tem ? b.nota : null, notas_baixas: b.tem ? b.notas_baixas : null, cancelamentos: b.tem ? b.cancelamentos : null,
      chamados: b.tem ? b.chamados : null, evitados: b.tem ? b.evitados : null
    };
  }

  /* ================= qualidade_consulta ================= */
  var PAUSADOS = [
    ['Costela Desfiada', 0, 'iFood', 9], ['Milkshake Morango', 1, 'iFood', 3], ['Petit Gâteau', 0, 'Cardápio próprio', 1],
    ['Veggie Grão-de-Bico', 2, 'iFood', 12], ['Suco Natural 500 ml', 1, 'iFood', 0]
  ];
  D.rpc('qualidade_consulta', function (b, ctx) {
    var q = b.p_dados || {}, P = periodo(q.periodo, q.dias), lojas = lojasDe(q.unidade);
    var agora = pedidosDe(P.de, P.ate, lojas, null, P.turno);
    var antes = pedidosDe(P.antesDe, P.antesAte, lojas, P.corte, P.turno);
    var lim = ifoodAte(), u7 = pedidosDe(M.somaDias(lim, -6), lim, lojas);
    var ui = contaIfood(u7);
    var res = {
      modo: ctx.admin ? 'dono' : 'equipe',
      periodo: q.periodo || 'hoje', dias: P.dias.length,
      de: P.de, ate: P.ate, de_antes: P.antesDe, ate_antes: P.antesAte,
      turno_atual: P.turno ? TURNO_NOME[P.turno] : null,
      unidade: q.unidade || null,
      agora: bloco(agora), antes: bloco(antes),
      ultimo: {
        nota: ui.nota, notas_baixas: ui.notas_baixas, cancelamentos: ui.cancelamentos, evitados: ui.evitados, chamados: ui.chamados,
        erro_cozinha: ui.erro_cozinha, erro_entrega: ui.erro_entrega,
        avaliacao_ate: lim, cancelamento_ate: lim, negociacao_ate: lim,
        por_loja: lojas.map(function (L) {
          var x = contaIfood(u7.filter(function (p) { return p.loja === L.id; }));
          return { unidade: L.nome, nota: x.nota, notas_baixas: x.notas_baixas, chamados: x.chamados, evitados: x.evitados };
        })
      },
      por_loja: lojas.map(function (L) {
        var l = agora.filter(function (p) { return p.loja === L.id; }), a = contaPrazo(l), f = contaIfood(l);
        return { unidade: L.nome, entregas: a.entregas, pct_prazo: a.pct_prazo, atraso_medio: a.atraso_medio,
          nota: f.tem ? f.nota : null, notas_baixas: f.tem ? f.notas_baixas : 0, cancelamentos: f.tem ? f.cancelamentos : null,
          chamados: f.tem ? f.chamados : null, evitados: f.tem ? f.evitados : null };
      }),
      por_turno: ['Almoço', 'Noite'].map(function (t) {
        var a = contaPrazo(agora.filter(function (p) { return turnoDe(p.min_pedido) === t; }));
        return { turno: TURNO_NOME[t], entregas: a.entregas, pct_prazo: a.pct_prazo, atraso_medio: a.atraso_medio };
      }).filter(function (t) { return t.entregas > 0; }),
      por_dia: P.dias.map(function (d) {
        return { dia: d, pct_prazo: contaPrazo(agora.filter(function (p) { return p.dia === d; })).pct_prazo };
      }),
      cliente_falou: agora.filter(function (p) { return p.nota != null && p.comentario && p.dia <= lim; })
        .sort(function (x, y) { return x.dia < y.dia ? 1 : (x.dia > y.dia ? -1 : y.min_pedido - x.min_pedido); })
        .map(function (p) { return { nota: p.nota, data: p.dia, unidade: p.unidade, comentario: p.comentario }; }),
      pausados: PAUSADOS.map(function (x, i) {
        var L = M.lojas[i % M.lojas.length];
        return { L: L, item: x[0], unidade: L.nome, marca: MARCAS[x[1]], canal: x[2], dias: x[3] };
      }).filter(function (x) { var ok = lojas.indexOf(x.L) >= 0; delete x.L; return ok; })
    };
    if (ctx.admin) {
      var canc = agora.filter(function (p) { return p.cancelado && p.canal === 'ifood' && p.dia <= lim; }), cancA = antes.filter(function (p) { return p.cancelado && p.canal === 'ifood' && p.dia <= lim; });
      var chs = agora.filter(function (p) { return p.dia <= lim; }).map(function (p) { return { p: p, c: chamado(p) }; }).filter(function (x) { return x.c; });
      res.dinheiro = {
        perdido_cancelamento: soma(canc, function (p) { return p.total; }),
        perdido_antes: soma(cancA, function (p) { return p.total; }),
        reembolsado: soma(chs, function (x) { return x.c.reembolso; }),
        salvo_por_negociar: soma(chs.filter(function (x) { return x.c.evitado; }), function (x) { return x.p.total; })
      };
      var por = {};
      agora.filter(entregue).forEach(function (p) { (por[p.motoboy_nome] = por[p.motoboy_nome] || []).push(p); });
      res.por_pessoa = Object.keys(por).map(function (k) {
        var a = contaPrazo(por[k]);
        return { entregador: k, entregas: a.entregas, pct_prazo: a.pct_prazo, atraso_medio: a.atraso_medio };
      }).filter(function (x) { return x.entregas >= 10; }).sort(function (x, y) { return y.entregas - x.entregas; });
    }
    return res;
  });

  /* ================= qualidade_cancelamentos ================= */
  function resumoCanc(lista, ctx, tem) {
    if (!tem) return { total: null, contestavel: null, ja_contestou: null, erro_cozinha: null, erro_entrega: null };
    var C2 = lista.filter(function (p) { return p.cancelado; });
    var inf = C2.map(cancInfo);
    var o = {
      total: C2.length,
      contestavel: inf.filter(function (i) { return i.contestavel; }).length,
      ja_contestou: inf.filter(function (i) { return i.contestou; }).length,
      erro_cozinha: inf.filter(function (i) { return i.erro === 'cozinha'; }).length,
      erro_entrega: inf.filter(function (i) { return i.erro === 'entrega'; }).length
    };
    if (ctx.admin) o.valor = soma(C2, function (p) { return p.total; });
    return o;
  }
  D.rpc('qualidade_cancelamentos', function (b, ctx) {
    var q = b.p_dados || {}, P = periodo(q.periodo, q.dias), lojas = lojasDe(q.unidade), lim = ifoodAte();
    function doRelatorio(p) { return p.dia <= lim && p.canal === 'ifood'; }   /* o relatorio do iFood so traz pedidos do iFood */
    var agora = pedidosDe(P.de, P.ate, lojas, null, P.turno).filter(doRelatorio);
    var antes = pedidosDe(P.antesDe, P.antesAte, lojas, P.corte, P.turno).filter(doRelatorio);
    var temAgora = P.de <= lim;
    var atraso = P.dias.filter(function (d) { return d > lim; }).length;
    var lista = agora.filter(function (p) { return p.cancelado; }).sort(function (x, y) { return x.dia < y.dia ? 1 : (x.dia > y.dia ? -1 : y.min_pedido - x.min_pedido); })
      .map(function (p) {
        var i = cancInfo(p), o = { data: p.dia, unidade: p.unidade, pedido: numPed(p), motivo: p.motivo_cancelamento, entregador: i.entregador, saiu: i.saiu,
          erro: i.erro, contestou: i.contestou, contestavel: i.contestavel, produto: i.produto };
        if (ctx.admin) o.valor = p.total;
        return o;
      });
    function parciaisDe(L) {
      return L.map(function (p) { var x = parcial(p); return x ? { p: p, x: x } : null; }).filter(Boolean);
    }
    var par = parciaisDe(agora).sort(function (a, c) { return a.p.dia < c.p.dia ? 1 : (a.p.dia > c.p.dia ? -1 : c.p.min_pedido - a.p.min_pedido); }).map(function (z) {
      var o = { hora: z.p.hora_pedido, data: z.p.dia, pedido: numPed(z.p), turno: turnoDe(z.p.min_pedido), unidade: z.p.unidade, marca: marcaDe(z.p),
        itens: z.x.item, motivo: z.x.motivo, origem: z.x.origem };
      if (ctx.admin) { o.valor_pedido = z.p.total; o.valor_devolvido = z.x.valor; o.entregador = z.p.motoboy; }
      return o;
    });
    return {
      modo: ctx.admin ? 'dono' : 'equipe', ifood_ate: lim, atraso_dias: atraso,
      resumo: { agora: resumoCanc(agora, ctx, temAgora), antes: resumoCanc(antes, ctx, temAgora) },
      lista: lista, parciais: par, parciais_antes: parciaisDe(antes).length
    };
  });

  /* ================= qualidade_cancel_vivo ================= */
  D.rpc('qualidade_cancel_vivo', function (b, ctx) {
    var q = b.p_dados || {}, o = op(), lojas = lojasDe(q.unidade), hoje = o.dia;
    var r = M.rng('cancvivo|' + hoje);
    var gwMin = o.min >= 1080 ? 1080 : (o.min >= 720 ? 720 : 60);       /* Gestor Web lido 1h, 12h e 18h */
    var todos = [];
    lojas.forEach(function (L) { todos = todos.concat(ped(hoje, L.id)); });
    var canc = todos.filter(function (p) { return p.cancelado; });
    var pars = todos.map(function (p) { var x = parcial(p); return x ? { p: p, x: x } : null; }).filter(Boolean);
    var cruzada = [], x0 = null, L0 = null, viuGw = false;
    canc.forEach(function (p) {
      var f = ['Saipos'];
      if (p.canal === 'ifood') { f.push('Porta oficial'); if (p.min_pedido <= gwMin) f.push('Gestor Web'); }
      var x = { tipo: 'total', hora: p.hora_pedido, pedido: numPed(p), unidade: p.unidade, canal: canalNome(p.canal), itens: p.itens.length, motivo: p.canal === 'ifood' && p.min_pedido <= gwMin ? p.motivo_cancelamento : null, fontes: f, _m: p.min_pedido };
      if (ctx.admin && p.canal === 'ifood') { x.reembolso_loja = ERRO[p.motivo_cancelamento] ? p.total : 0; x.retencao = ERRO[p.motivo_cancelamento] ? 0 : M.arred(p.total * 0.12); }
      cruzada.push(x);
    });
    pars.forEach(function (z) {
      var x = { tipo: 'parcial', hora: z.p.hora_pedido, pedido: numPed(z.p), unidade: z.p.unidade, canal: 'iFood', itens: 1, motivo: z.p.min_pedido <= gwMin ? z.x.motivo : null, fontes: z.p.min_pedido <= gwMin ? ['Saipos', 'Gestor Web'] : ['Saipos'], _m: z.p.min_pedido };
      if (ctx.admin) { x.reembolso_loja = z.x.valor; x.retencao = 0; }
      cruzada.push(x);
    });
    /* um cancelamento que so o iFood viu (pedido que nao entrou no Saipos) */
    if (o.min > 705) {
      var m0 = 700; L0 = lojas[0]; viuGw = m0 <= gwMin;
      x0 = { tipo: 'ifood', hora: hmOp(m0), pedido: String(M.entre(r, 1000, 9999)), unidade: L0.nome, canal: 'iFood', itens: null, motivo: viuGw ? 'Pedido não confirmado a tempo pela loja' : null, fontes: viuGw ? ['Porta oficial', 'Gestor Web'] : ['Porta oficial'], _m: m0 };
      if (ctx.admin) { x0.reembolso_loja = 0; x0.retencao = 0; }
      cruzada.push(x0);
    }
    cruzada.sort(function (x, y) { return y._m - x._m; }).forEach(function (x) { delete x._m; });

    var chatsLoja = lojas.map(function (L) {
      var ifo = todos.filter(function (p) { return p.loja === L.id && p.canal === 'ifood'; });
      var rr = M.rng('chat|' + hoje + '|' + L.id);
      var com = Math.max(0, Math.round(ifo.length * (0.12 + rr() * 0.06)));
      var sem = com ? M.pesado(rr, [[0, 60], [1, 30], [2, 10]]) : 0;
      return { unidade: L.nome, com_cliente: com, respondidas: Math.max(0, com - sem), sem_resposta: sem, tempo_medio_min: com ? M.entre(rr, 2, 9) : null, _nl: sem ? M.entre(rr, 0, sem + 1) : 0 };
    });
    var tot = soma(chatsLoja, function (l) { return l.com_cliente; }), semR = soma(chatsLoja, function (l) { return l.sem_resposta; });
    var tm = chatsLoja.filter(function (l) { return l.tempo_medio_min != null; });
    var res = {
      dono: !!ctx.admin,
      janela: { rotulo: 'dia de hoje', de: '05:00', ate: hmOp(o.min) },
      fontes: { saipos: isoMin(hoje, o.min - 3), chat: isoMin(hoje, o.min - 1), api: isoMin(hoje, o.min - 6), gw: isoMin(hoje, gwMin + 4), foody: null },
      por_loja: lojas.map(function (L) {
        var c = canc.filter(function (p) { return p.loja === L.id; }), pp = pars.filter(function (z) { return z.p.loja === L.id; });
        var so = (x0 && L === L0) ? 1 : 0, soGw = so && viuGw ? 1 : 0;   /* o cancelamento que so o iFood viu */
        if (!c.length && !pp.length && !so) return null;
        return { unidade: L.nome, totais: c.length, parciais: pp.length, itens: pp.length, foody: null,
          api_cancel: c.filter(function (p) { return p.canal === 'ifood'; }).length + so,
          gw_cancel: c.filter(function (p) { return p.canal === 'ifood' && p.min_pedido <= gwMin; }).length + soGw };
      }).filter(Boolean),
      chats: {
        total: tot, sem_resposta: semR, nao_lidas: soma(chatsLoja, function (l) { return l._nl; }),
        tempo_medio_min: tm.length ? r0(media(tm.map(function (l) { return l.tempo_medio_min; }))) : null,
        por_loja: chatsLoja.map(function (l) { delete l._nl; return l; })
      },
      cruzada: cruzada,
      parciais: pars.filter(function (z) { return z.p.min_pedido <= gwMin; }).map(function (z) {
        var x = { hora: z.p.hora_pedido, pedido: numPed(z.p), unidade: z.p.unidade, marca: marcaDe(z.p), item: z.x.item,
          o_que_a_loja_fez: z.x.origem === 'pedido pela loja' ? 'tirou o item e avisou o cliente pelo chat' : 'aceitou o pedido do cliente',
          loja_escreveu: z.x.escreveu };
        if (ctx.admin) x.valor_devolvido = z.x.valor;
        return x;
      })
    };
    return res;
  });

  /* ================= qualidade_dia ================= */
  D.rpc('qualidade_dia', function (b, ctx) {
    var q = b.p_dados || {}, dia = q.dia || op().dia, lojas = lojasDe(q.unidade);
    var L = [];
    lojas.forEach(function (l) { L = L.concat(ped(dia, l.id)); });
    var t = contaPrazo(L);
    var horas = {};
    L.forEach(function (p) { var h = Math.floor(((p.min_pedido % 1440) + 1440) % 1440 / 60); (horas[h] = horas[h] || []).push(p); });
    var res = {
      modo: ctx.admin ? 'dono' : 'equipe', dia: dia,
      total: t,
      por_turno: ['Almoço', 'Noite'].map(function (tn) {
        var l = L.filter(function (p) { return turnoDe(p.min_pedido) === tn; }), a = contaPrazo(l);
        a.turno = TURNO_NOME[tn];
        a.cancelamentos = l.filter(function (p) { return p.cancelado; }).length;
        a.chamados = l.map(chamado).filter(Boolean).length;
        return a;
      }).filter(function (x) { return x.entregas > 0 || x.cancelamentos > 0; }),
      por_hora: Object.keys(horas).map(Number).sort(function (a, c) { return a - c; }).map(function (h) {
        var a = contaPrazo(horas[h]);
        return { h: h, entregas: a.entregas, pct_prazo: a.pct_prazo, atraso_medio: a.atraso_medio };
      }),
      avaliacoes: L.filter(function (p) { return p.nota != null && p.comentario; }).slice(-12).reverse()
        .map(function (p) { return { comentario: p.comentario, nota: p.nota, marca: marcaDe(p), unidade: p.unidade }; }),
      problemas: L.filter(function (p) { return entregue(p) && !p.no_prazo; }).sort(function (x, y) { return y.atraso_min - x.atraso_min; }).slice(0, 25)
        .map(function (p) {
          var o = { n_pedido: numPed(p), hora: p.hora_pedido, unidade: p.unidade, turno: turnoDe(p.min_pedido), atraso: p.atraso_min, prometido: p.prazo_min,
            preparo: p.min_pronto - p.min_pedido, coleta: p.min_saida - p.min_pronto, entrega: p.min_entrega - p.min_saida };
          if (ctx.admin) o.entregador = p.motoboy_nome;
          return o;
        })
    };
    return res;
  });

  /* ================= qualidade_frescor ================= */
  D.rpc('qualidade_frescor', function () {
    var o = op();
    return { fontes: [
      { fonte: 'Entregas (Saipos)', min: 3 }, { fonte: 'Prazo (TrackEat)', min: 5 },
      { fonte: 'Avaliações do iFood', min: 22 }, { fonte: 'Chamados do iFood', dias: 1 },
      { fonte: 'Cancelamentos do iFood', dias: 1 }, { fonte: 'Selo Super', dias: o.min % 2 ? 2 : 3 }
    ] };
  });

  /* ================= qualidade_super ================= */
  var REGRA = { nota_min: 4.7, canc_max_pct: 1, chamados_max_pct: 2.5 };
  D.rpc('qualidade_super', function (b) {
    var q = b.p_dados || {}, dias = Math.max(7, Math.min(90, +q.dias || 30)), lim = ifoodAte();
    var L = pedidosDe(M.somaDias(lim, -(dias - 1)), lim, M.lojas).filter(function (p) { return p.canal === 'ifood'; });
    var marcas = [];
    M.lojas.forEach(function (Lj) {
      MARCAS.forEach(function (nm, idx) {
        var l = L.filter(function (p) { return p.loja === Lj.id && marcaIdx(p) === idx; });
        if (!l.length) return;
        var notas = l.filter(function (p) { return p.nota != null; }).map(function (p) { return p.nota; });
        /* a nota do selo nao conta as avaliacoes que o iFood descarta (problema que nao e da loja): ajuste de exemplo */
        var nota = notas.length ? Math.min(5, media(notas) + 0.3) : null;
        var cancErro = l.filter(function (p) { return p.cancelado && ERRO[p.motivo_cancelamento]; }).length;
        var ch = l.map(chamado).filter(Boolean).length;
        var cp = r1(100 * cancErro / l.length), chp = r1(100 * ch / l.length), nt = nota == null ? null : Math.round(nota * 100) / 100;
        var nok = nt != null && nt >= REGRA.nota_min, cok = cp <= REGRA.canc_max_pct, hok = chp <= REGRA.chamados_max_pct;
        var falta = [];
        if (!nok) falta.push('subir a nota para 4,7 (está em ' + String(nt).replace('.', ',') + ')');
        if (!cok) falta.push('baixar cancelamento por erro para 1% (está em ' + String(cp).replace('.', ',') + '%)');
        if (!hok) falta.push('baixar chamados para 2,5% (está em ' + String(chp).replace('.', ',') + '%)');
        var ok = nok && cok && hok, quase = falta.length === 1;
        var amostra = l.length >= 45 && notas.length >= 10;
        marcas.push({
          marca: nm + ' · ' + Lj.nome, pedidos: l.length, avaliados: notas.length,
          e_super: ok && amostra, status: !amostra ? 'Sem amostra' : (ok ? 'Super' : (quase ? 'Quase lá' : 'Abaixo')),
          nota: nt, nota_ok: nok, canc_pct: cp, canc_ok: cok, chamados_pct: chp, chamados_ok: hok,
          o_que_falta: !amostra ? 'precisa de 45 pedidos e 10 avaliações' : (ok ? 'nada — manter' : falta.join('; '))
        });
      });
    });
    var mc = {}, mx = {};
    L.forEach(function (p) {
      var c = chamado(p);
      if (c) { var k = mc[c.motivo] || (mc[c.motivo] = { motivo: c.motivo, qtd: 0, evitados: 0 }); k.qtd++; if (c.evitado) k.evitados++; }
      if (p.cancelado) { var k2 = mx[p.motivo_cancelamento] || (mx[p.motivo_cancelamento] = { motivo: p.motivo_cancelamento, qtd: 0 }); k2.qtd++; }
    });
    function ord(o) { return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, c) { return c.qtd - a.qtd; }); }
    return { dias: dias, regra: REGRA, marcas: marcas, motivos_chamado: ord(mc), motivos_cancelamento: ord(mx) };
  });

  /* ================= qualidade_avaliacoes ================= */
  var TAG_RUIM = ['Comida fria', 'Demorou', 'Faltou item', 'Embalagem ruim', 'Item errado'];
  var TAG_BOA = ['Saboroso', 'Bem embalado', 'Chegou rápido', 'Bem temperado'];
  D.rpc('qualidade_avaliacoes', function (b) {
    var q = b.p_dados || {}, o = op(), dias = 7, lojas = lojasDe(q.unidade);
    var de = M.somaDias(o.dia, -(dias - 1));
    var lib = o.min - 90;                                   /* o iFood libera a avaliacao um tempo depois */
    var todas = pedidosDe(de, o.dia, lojas).filter(function (p) {
      return p.nota != null && (p.dia < o.dia || p.min_pedido <= lib);
    });
    function conta(l) {
      return { avaliacoes: l.length, nota_media: l.length ? Math.round(100 * media(l.map(function (p) { return p.nota; }))) / 100 : null,
        baixas: l.filter(function (p) { return p.nota <= 3; }).length, com_comentario: l.filter(function (p) { return p.comentario; }).length };
    }
    var porLoja = lojas.map(function (L) { var x = conta(todas.filter(function (p) { return p.loja === L.id; })); x.unidade = L.nome; return x; });
    var porMarca = [];
    lojas.forEach(function (L) {
      MARCAS.forEach(function (nm, idx) {
        var l = todas.filter(function (p) { return p.loja === L.id && marcaIdx(p) === idx; });
        if (!l.length) return;
        var x = conta(l); x.unidade = L.nome; x.marca = marcaIfood(idx, L); porMarca.push(x);
      });
    });
    var ult = todas.slice().sort(function (x, y) { return x.dia < y.dia ? 1 : (x.dia > y.dia ? -1 : y.min_pedido - x.min_pedido); });
    var lista = ult.filter(function (p) { return p.comentario || p.nota <= 3; }).slice(0, 40).map(function (p) {
      var r = M.rng('aval|' + p.id), tg = [];
      if (r() < 0.6) { var pool = p.nota <= 3 ? TAG_RUIM : TAG_BOA; tg.push(M.escolhe(r, pool)); if (r() < 0.3) { var t2 = M.escolhe(r, pool); if (t2 !== tg[0]) tg.push(t2); } }
      var chegaMin = Math.min(p.min_entrega + 20 + Math.floor(r() * 100), p.dia === o.dia ? o.min - 5 : 99999);
      return { nota: p.nota, pedido_em: isoMin(p.dia, p.min_pedido), marca: marcaDe(p), unidade: p.unidade, pedido: numPed(p),
        comentario: p.comentario || '', tags: tg, chegou: brHora(p.dia, chegaMin) };
    });
    return {
      dias: dias, robo_status: 'OK', lido_min: 4, lido_em: 'hoje às ' + hmOp(o.min - 4),
      mais_nova: ult.length ? brHora(ult[0].dia, ult[0].min_pedido) : null,
      por_loja: porLoja, por_marca: porMarca, lista: lista
    };
  });

  /* ================= qualidade_negociacoes ================= */
  var RESP_LOJA = { 'Pedido atrasado': 'pediu desculpas e informou o novo horário', 'Item faltando': 'ofereceu reenviar o item', 'Item errado': 'ofereceu trocar o item',
    'Pedido chegou frio': 'ofereceu desconto no próximo pedido', 'Embalagem danificada': 'ofereceu reenviar o pedido', 'Pedido não chegou': 'conferiu com o entregador e informou a posição',
    'Quer mudar o endereço': 'confirmou o novo endereço' };
  function negDe(lista, ctx, comRelatorio) {
    var lim = ifoodAte();
    return lista.map(function (p) { var c = chamado(p); return c ? { p: p, c: c, rel: p.dia <= lim } : null; }).filter(Boolean)
      .filter(function (z) { return comRelatorio || !z.rel; });
  }
  function resumoNeg(Z, ctx) {
    var rel = Z.filter(function (z) { return z.rel; });
    var o = {
      chamados: Z.length,
      evitados_medidos: rel.length > 0, evitados: rel.filter(function (z) { return z.c.evitado; }).length,
      virou_cancelamento: Z.filter(function (z) { return z.c.virou_cancelamento; }).length,
      loja_nao_respondeu: Z.filter(function (z) { return z.c.loja_nao_respondeu; }).length,
      com_reembolso: Z.filter(function (z) { return z.c.reembolso > 0; }).length,
      impactou_super_medidos: rel.length > 0, impactou_super: rel.filter(function (z) { return z.c.impactou_super; }).length
    };
    if (ctx.admin) {
      o.reembolsado = soma(Z, function (z) { return z.c.reembolso; });
      o.valor_em_jogo = rel.length ? soma(rel, function (z) { return z.p.total; }) : null;
      o.salvo = rel.length ? soma(rel.filter(function (z) { return z.c.evitado; }), function (z) { return z.p.total; }) : null;
    }
    return o;
  }
  D.rpc('qualidade_negociacoes', function (b, ctx) {
    var q = b.p_dados || {}, P = periodo(q.periodo, q.dias), lojas = lojasDe(q.unidade), o = op(), lim = ifoodAte();
    var Z = negDe(pedidosDe(P.de, P.ate, lojas, null, P.turno), ctx, true);
    var A = negDe(pedidosDe(P.antesDe, P.antesAte, lojas, P.corte, P.turno), ctx, true);
    /* os de hoje so tem as linhas do chat (o relatorio chega amanha): sem "evitado" e sem valores */
    Z.forEach(function (z) { if (!z.rel && z.c.min > o.min) z.fora = true; });
    Z = Z.filter(function (z) { return !z.fora; });
    var pm = {}, pl = {};
    Z.forEach(function (z) {
      var k = z.c.motivo + '|' + z.c.momento, m = pm[k] || (pm[k] = { motivo: z.c.motivo, momento: z.c.momento, n: 0, evitados: 0, reembolsado: 0 });
      m.n++; if (z.rel && z.c.evitado) m.evitados++; m.reembolsado += z.c.reembolso;
      var k2 = z.p.unidade + '|' + marcaDe(z.p), l = pl[k2] || (pl[k2] = { unidade: z.p.unidade, marca: marcaDe(z.p), n: 0, evitados: 0, nao_respondeu: 0, reembolsado: 0 });
      l.n++; if (z.rel && z.c.evitado) l.evitados++; if (z.c.loja_nao_respondeu) l.nao_respondeu++; l.reembolsado += z.c.reembolso;
    });
    function lst(obj) { return Object.keys(obj).map(function (k) { var x = obj[k]; if (ctx.admin) x.reembolsado = M.arred(x.reembolsado); else delete x.reembolsado; return x; }).sort(function (a, c) { return c.n - a.n; }); }
    var lista = Z.slice().sort(function (x, y) { return x.p.dia < y.p.dia ? 1 : (x.p.dia > y.p.dia ? -1 : y.c.min - x.c.min); }).slice(0, 60).map(function (z) {
      var c = z.c, p = z.p, r = M.rng('neg|' + p.id);
      var x = {
        data: p.dia, hora: hmOp(c.min), pedido: numPed(p), unidade: p.unidade, marca: marcaDe(p),
        motivo: c.motivo, momento: c.momento, quem_iniciou: c.quem,
        evitado: z.rel ? c.evitado : null, status_pedido: c.virou_cancelamento ? 'CANCELADO' : (z.rel ? 'CONCLUIDO' : (p.status === 'entregue' ? 'ENTREGUE' : 'EM ANDAMENTO')),
        arbitragem: z.rel && c.arbitragem, resultado_arbitragem: z.rel && c.arbitragem ? (r() < 0.5 ? 'a favor da loja' : 'a favor do cliente') : null,
        impactou_super: z.rel && c.impactou_super, tem_fotos: c.fotos,
        resposta_loja: c.loja_nao_respondeu ? 'não respondeu' : RESP_LOJA[c.motivo], tempo_ofertado_min: c.oferta,
        resposta_cliente: c.loja_nao_respondeu ? null : (c.evitado ? 'aceitou' : (c.virou_cancelamento ? 'pediu o cancelamento' : 'pediu reembolso'))
      };
      if (ctx.admin) { x.valor_pedido = z.rel ? p.total : null; x.valor_reembolso = c.reembolso; }   /* a linha do chat nao traz o valor do pedido */
      return x;
    });
    return {
      modo: ctx.admin ? 'dono' : 'equipe', ifood_ate: lim, atraso_dias: 1,
      fontes: { relatorio_ate: lim, relatorio_atraso_dias: 1, chat_ate: o.dia, aviso: null },
      resumo: resumoNeg(Z, ctx), antes: resumoNeg(A, ctx),
      por_motivo: lst(pm), por_loja: lst(pl), lista: lista
    };
  });

  /* ================= delivery_prazo_gw ================= */
  D.rpc('delivery_prazo_gw', function (b) {
    var q = b.p_dados || {}, o = op(), lojas = lojasDe(q.unidade);
    var de = M.somaDias(o.dia, -13), dias = M.intervalo(de, o.dia).reverse();
    var linhas = [];
    dias.forEach(function (d, di) {
      lojas.slice().sort(function (a, c) { return a.nome.localeCompare(c.nome, 'pt-BR'); }).forEach(function (L, li) {
        var r = M.rng('gw|' + d + '|' + L.id);
        var l = ped(d, L.id).filter(function (p) { return p.canal === 'ifood' && !p.cancelado && (d < o.dia || p.status === 'entregue'); });
        var cob = 93 + Math.floor(r() * 8);
        if (di === 4 && li === 0) cob = 62 + Math.floor(r() * 15);   /* dia em que a leitura parou no meio */
        if (di === 9 && li === lojas.length - 1) cob = 0;              /* dia sem leitura */
        cob = Math.min(100, cob);
        var med = l.filter(function (p) { return M.rng('gwm|' + p.id)() * 100 < cob; });
        var ok = med.filter(function (p) { return p.no_prazo; }).length;
        linhas.push({
          dia: d, unidade: L.nome, pedidos: l.length, medidos: med.length,
          cobertura: l.length ? Math.round(100 * med.length / l.length) : null,
          no_prazo: ok, pct: med.length ? Math.round(1000 * ok / med.length) / 10 : null,
          med_total: r1(mediana(med.map(function (p) { return p.min_entrega - p.min_pedido; }))),
          med_rua: r1(mediana(med.map(function (p) { return p.min_entrega - p.min_saida; })))
        });
      });
    });
    return { de: de, ate: o.dia, gw_lido_em: 'hoje às ' + hmOp(o.min - 7), por_dia: linhas };
  });

  /* ================= reentrega2_consulta ================= */
  var MOT_REE = [
    ['Item faltando', 'COZINHA'], ['Lanche montado errado', 'COZINHA'], ['Pedido trocado no despacho', 'DESPACHO'],
    ['Bebida esquecida no balcão', 'DESPACHO'], ['Endereço incompleto do cliente', 'CLIENTE'], ['Cliente não atendeu', 'CLIENTE']
  ];
  var FAM = {}; MOT_REE.forEach(function (m) { FAM[m[0]] = m[1]; });
  var FALAS = { COZINHA: ['Veio sem a batata que eu pedi.', 'O lanche veio sem o bacon.'], DESPACHO: ['Esse pedido não é o meu.', 'Faltou o refrigerante.'], CLIENTE: ['Não achei o número da casa.', 'Estava no banho, desculpa.'] };
  var REE_KEY = 'demo_qualidade_ree';
  function reeMarcas() { try { return JSON.parse(localStorage.getItem(REE_KEY) || '{}'); } catch (e) { return {}; } }
  function equipeDe(L, setor) {
    var vistos = {};
    return M.equipe.filter(function (e) { return e.loja === L.id && e.setor === setor; }).map(function (e) { return e.apelido; })
      .filter(function (n) { if (vistos[n]) return false; vistos[n] = 1; return true; }).slice(0, 4);
  }
  function reeLista(de, ctx) {
    var o = op(), marc = reeMarcas(), rows = [];
    M.intervalo(de, o.dia).forEach(function (d) {
      M.lojas.forEach(function (L) {
        var r = M.rng('ree|' + d + '|' + L.id), qtd = M.pesado(r, [[0, 45], [1, 40], [2, 15]]);
        var l = ped(d, L.id).filter(function (p) { return entregue(p) && p.motoboy; });
        for (var k = 0; k < qtd && l.length > 2; k++) {
          var p = l[Math.floor(r() * l.length)];
          var tipo = M.pesado(r, [['SAIU DE NOVO', 70], ['PROVAVEL BAIXA MANUAL', 20], ['LANCAMENTO DUPLICADO', 10]]);
          var fam0 = M.escolhe(r, MOT_REE);
          var m = marc[L.nome + '|' + p.ts_pedido] || {};
          var sorteado = r() < 0.5 ? fam0[0] : null;
          var motivo = m.motivo || sorteado, familia = motivo ? FAM[motivo] : null;
          var par = l[Math.floor(r() * l.length)], pm = Math.max(10, p.min_pedido - par.min_pedido);
          var mesmo = r() < 0.6 ? true : (r() < 0.5 ? false : null);
          var falou = r() < 0.6 && fam0[1] !== 'CLIENTE' ? M.escolhe(r, FALAS[fam0[1]]) : null;
          var x = {
            dia_operacional: d, data_hora_pedido: p.ts_pedido, n_pedido: tipo === 'LANCAMENTO DUPLICADO' && r() < 0.5 ? '#' + p.numero : numPed(p),
            canal: canalNome(p.canal), cliente_ini: p.cliente, fonte: 'TrackEat', unidade: L.nome, turno: turnoDe(p.min_pedido), entregador: p.motoboy,
            par_n_pedido: tipo === 'SAIU DE NOVO' ? numPed(par) : null, par_data_hora: M.ts(d, p.min_pedido - Math.min(pm, 120)),
            par_minutos: Math.min(pm, 120), par_canal: canalNome(p.canal), par_entregador: par.motoboy, par_cliente_ini: mesmo ? p.cliente : par.cliente,
            mesmo_cliente: mesmo, endereco: p.endereco + ' · ' + p.bairro, detectada_por_endereco: !motivo,
            familia: familia, motivo: motivo, responsavel: m.responsavel || null, tipo: tipo,
            equipe_cozinha: equipeDe(L, 'Cozinha'), equipe_despacho: equipeDe(L, 'Delivery'),
            motivo_provavel: falou ? fam0[0].toLowerCase() : 'sem conversa no chat',
            fala_cliente: falou, itens: p.itens.map(function (i) { return i.qtd + 'x ' + i.nome; }).join(', '),
            cache_em: M.agoraISO()
          };
          if (ctx.admin) x.custo_extra = M.arred(6 + r() * 6);
          rows.push(x);
        }
      });
    });
    return rows.sort(function (a, c) { return a.data_hora_pedido < c.data_hora_pedido ? 1 : -1; });
  }
  D.rpc('reentrega2_consulta', function (b, ctx) {
    var acao = b.p_acao, q = b.p_dados || {};
    if (acao === 'motivos') return MOT_REE.map(function (m) { return { motivo: m[0], familia: m[1] }; });
    if (acao === 'marcar') {
      var marc = reeMarcas(), k = q.unidade + '|' + q.data_hora_pedido;
      marc[k] = { motivo: q.motivo || null, responsavel: q.responsavel || null };
      try { localStorage.setItem(REE_KEY, JSON.stringify(marc)); } catch (e) {}
      return { ok: true };
    }
    return reeLista(q.de || M.somaDias(op().dia, -7), ctx);
  });

  /* ================= maquininha_conferir / maquininha_extrato ================= */
  var BANDEIRA = { CREDIT: ['Visa', 'Mastercard', 'Elo'], DEBIT: ['Visa', 'Mastercard', 'Elo'], VAN: ['Alelo', 'VR', 'Ticket'] };
  var TIPO = { CREDIT: 'crédito', DEBIT: 'débito', VAN: 'voucher' };
  function maquina(L, k) { return 'T-' + (M.hash('maq|' + L.id + '|' + k) % 65536).toString(16).toUpperCase().padStart(4, '0'); }
  function conferir(dia, lojas) {
    var o = op(), hoje = dia >= o.dia, linhas = [], extra = [];
    lojas.forEach(function (L) {
      ped(dia, L.id).forEach(function (p) {
        if (!entregue(p) || p.pagamento === 'online') return;
        var r = M.rng('maqc|' + p.id), sit, rede = null, pix = null, gps;
        var mod = p.pagamento === 'cartao_na_entrega' ? M.pesado(r, [['CREDIT', 55], ['DEBIT', 35], ['VAN', 10]]) : null;
        var forma = p.pagamento === 'pix' ? 'Pix' : (p.pagamento === 'dinheiro' ? 'Dinheiro' : (mod === 'CREDIT' ? 'Cartão de crédito' : (mod === 'DEBIT' ? 'Cartão de débito' : 'Vale-refeição')));
        if (p.pagamento === 'dinheiro') sit = 'DINHEIRO';
        else if (hoje) sit = 'AGUARDANDO_REDE';
        else if (p.pagamento === 'pix') sit = r() < 0.88 ? 'PIX_ACHADO' : 'PIX_SEM_RASTRO';
        else sit = M.pesado(r, [['COBRADO', 84], ['OUTRO_METODO', 4], ['COBROU_A_MAIS', 2], ['SO_A_COMIDA', 3], ['NAO_COBROU', 2], ['SEM_COBRANCA_LONGE', 2], ['SEM_COBRANCA_SEM_GPS', 3]]);
        if (sit === 'SO_A_COMIDA' && !p.taxa_entrega) sit = 'COBRADO';   /* sem taxa nao existe "faltou a taxa" */
        var hEnt = p.min_entrega, dist = M.entre(r, 8, 95);
        gps = { dist_m: dist, raio: 150, hora: hmOp(hEnt - M.entre(r, 0, 3)) };
        if (sit === 'SEM_COBRANCA_LONGE') gps = { dist_m: M.entre(r, 900, 3200), raio: 150, hora: hmOp(hEnt) };
        else if (sit === 'SEM_COBRANCA_SEM_GPS') gps = null;
        else if (r() < 0.04) gps = { sem_endereco: true };
        if (['COBRADO', 'OUTRO_METODO', 'COBROU_A_MAIS', 'SO_A_COMIDA'].indexOf(sit) >= 0) {
          var m2 = sit === 'OUTRO_METODO' ? (mod === 'CREDIT' ? 'DEBIT' : 'CREDIT') : mod;
          var v = sit === 'COBROU_A_MAIS' ? p.total + M.escolhe(r, [10, 15, 20]) : (sit === 'SO_A_COMIDA' ? p.subtotal : p.total);
          var dif = r() < 0.08 ? M.entre(r, 18, 40) : M.entre(r, 0, 6);
          rede = { hora: hmOp(hEnt + dif - 2), modalidade: m2 + (m2 === 'VAN' ? '' : '_' + (m2 === 'CREDIT' ? 'A_VISTA' : 'PRE')), valor: M.arred(v), dif_min: dif, _bandeira: M.escolhe(r, BANDEIRA[m2]), _tipo: TIPO[m2], _min: hEnt + dif - 2 };
        }
        if (sit === 'PIX_ACHADO') pix = { data: M.br(dia) + ' ' + hmOp(p.min_pedido + M.entre(r, 1, 30)), desc: 'Pix recebido · R$ ' + p.total.toFixed(2).replace('.', ',') };
        linhas.push({ p: p, L: L, sit: sit, forma: forma, mod: mod, rede: rede, pix: pix, gps: gps, promessa: r() < 0.3, chegou: r() < 0.85 ? hmOp(hEnt - M.entre(r, 0, 2)) : null });
      });
      if (!hoje) {   /* passadas da rota que nao casaram com pedido nenhum */
        var rr = M.rng('maqx|' + dia + '|' + L.id), n = M.pesado(rr, [[0, 30], [1, 45], [2, 25]]);
        for (var i = 0; i < n; i++) {
          var mm = M.entre(rr, 12 * 60, 23 * 60), md = M.pesado(rr, [['CREDIT', 55], ['DEBIT', 40], ['VAN', 5]]);
          extra.push({ L: L, min: mm, valor: M.arred(M.escolhe(rr, [6.99, 8.99, 12, 15, 24.9, 38.9])), modalidade: md, papel: 'rota', pedido: null });
        }
        if (L === lojas[0] && rr() < 0.7) extra.push({ L: L, min: M.entre(rr, 19 * 60, 22 * 60), valor: 41.8, modalidade: 'CREDIT', papel: 'indefinida', pedido: null });
      }
    });
    return { linhas: linhas, extra: extra };
  }
  function cabMaq(dia) {
    var o = op();
    return { dia_texto: M.br(dia), rede_ate: M.br(M.somaDias(o.dia, -1)) + ' (chega às 9h do dia seguinte)', agora: 'hoje às ' + hmOp(o.min) };
  }
  D.rpc('maquininha_conferir', function (b, ctx) {
    var q = b.p_dados || {}, dia = q.dia || M.somaDias(op().dia, -1), lojas = lojasDe(q.unidade);
    var X = conferir(dia, lojas), res = cabMaq(dia), resumo = {};
    res.dono = !!ctx.admin; res.janela_min = 240; res.raio_m = 150;
    res.linhas = X.linhas.map(function (z) {
      resumo[z.sit] = (resumo[z.sit] || 0) + 1;
      var o = {
        situacao: z.sit, unidade: z.L.nome, pedido: numPed(z.p), curto: z.p.numero_ifood ? String(z.p.numero) : null,
        cliente: z.p.cliente, bairro: z.p.bairro, motoboy: z.p.motoboy, entregue_em: z.p.hora_entrega, pedido_em: z.p.hora_pedido,
        forma: z.forma, promessa: z.promessa, chegou_cliente: z.chegou, gps: z.gps,
        rede: z.rede ? { hora: z.rede.hora, modalidade: z.rede.modalidade, dif_min: z.rede.dif_min } : null,
        pix: z.pix ? { data: z.pix.data } : null
      };
      if (ctx.admin) {
        o.na_porta = z.p.total; o.taxa = z.p.taxa_entrega;
        if (o.rede) o.rede.valor = z.rede.valor;
        if (o.pix) o.pix.desc = z.pix.desc;
      }
      return o;
    });
    res.resumo = resumo;
    return res;
  });
  D.rpc('maquininha_extrato', function (b, ctx) {
    var q = b.p_dados || {}, dia = q.dia || M.somaDias(op().dia, -1), lojas = lojasDe(q.unidade), o = op();
    var X = conferir(dia, lojas), res = cabMaq(dia), L = [];
    res.dono = !!ctx.admin; res.janela = '05:00 às 05:00 do dia seguinte';
    res.apuracao = { de: M.br(M.somaDias(o.dia, -60)), ate: M.br(M.somaDias(o.dia, -31)), em: M.br(M.somaDias(o.dia, -30)), maquinas: lojas.length * 3 };
    X.linhas.forEach(function (z) {
      if (!z.rede) return;
      L.push({ min: z.rede._min, L: z.L, valor: z.rede.valor, bandeira: z.rede._bandeira, tipo: z.rede._tipo, maquina: maquina(z.L, M.hash(z.p.motoboy || '') % 3), papel: 'rota', pedido: numPed(z.p) });
    });
    X.extra.forEach(function (e) {
      var r = M.rng('ext|' + e.L.id + '|' + e.min);
      L.push({ min: e.min, L: e.L, valor: e.valor, bandeira: M.escolhe(r, BANDEIRA[e.modalidade]), tipo: TIPO[e.modalidade], maquina: e.papel === 'indefinida' ? maquina(e.L, 9) : maquina(e.L, M.entre(r, 0, 2)), papel: e.papel, pedido: null });
    });
    if (q.tudo && dia < o.dia) {   /* balcao e salao */
      lojas.forEach(function (Lj) {
        var r = M.rng('balcao|' + dia + '|' + Lj.id), n = M.entre(r, 8, 14);
        for (var i = 0; i < n; i++) {
          var md = M.pesado(r, [['CREDIT', 50], ['DEBIT', 40], ['VAN', 10]]);
          L.push({ min: M.entre(r, 11 * 60 + 30, 23 * 60), L: Lj, valor: M.arred(40 + r() * 180), bandeira: M.escolhe(r, BANDEIRA[md]), tipo: TIPO[md], maquina: maquina(Lj, 5 + (i % 2)), papel: 'balcao', pedido: r() < 0.1 ? String(M.entre(r, 1001, 1100)) : null });
        }
      });
    }
    var R = { rota_com_pedido: { n: 0, total: 0 }, rota_sem_pedido: { n: 0, total: 0 }, balcao_sem_pedido: { n: 0, total: 0 }, balcao_com_pedido: { n: 0, total: 0 }, indefinida_com_pedido: { n: 0, total: 0 }, indefinida_sem_pedido: { n: 0, total: 0 } };
    L.sort(function (a, c) { return a.min - c.min; });
    res.linhas = L.map(function (x) {
      var k = x.papel + (x.pedido ? '_com_pedido' : '_sem_pedido');
      R[k].n++; R[k].total += x.valor;
      var o2 = { hora: hmOp(x.min), unidade: x.L.nome, bandeira: x.bandeira, tipo: x.tipo, maquina: x.maquina, papel: x.papel, pedido: x.pedido };
      if (ctx.admin) o2.valor = x.valor;
      return o2;
    });
    Object.keys(R).forEach(function (k) { if (ctx.admin) R[k].total = M.arred(R[k].total); else R[k].total = null; });
    res.resumo = R;
    return res;
  });
})();
