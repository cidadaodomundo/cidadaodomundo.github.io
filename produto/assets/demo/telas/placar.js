/* Placar do Delivery (demonstracao).
   Simula a porta placar_delivery_portal:
     {parte:'historico'}        -> {placar:{chaves, linhas, ontem, gerado, hoje, det, erros, frescor}, extra:{chaves, linhas}, dono}
     {parte:'vivo', ja_tenho}   -> {quando, dia, hoje, vivo:{lojas, cancelados, parciais, erros}, fontes, fontes_em, fontes_tipo, gerado}
                                   ou {igual:true} quando nada mudou desde a ultima leitura.
   Os numeros saem de MUNDO.pedidos (os mesmos pedidos das outras telas) e de MUNDO.motoboys.
   Valores em R$ so vao para o dono (ctx.admin); para a equipe as chaves de dinheiro nem existem.
   Metas e regras sao de exemplo. */
(function () {
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG;
  var LOJAS = M.lojas.map(function (l) { return l.id; });

  /* ---------------- relogio: o dia de operacao vai das 5h as 5h ---------------- */
  function op() {
    var m = M.minutosAgora(), h = M.hoje();
    return m < 300 ? { dia: M.somaDias(h, -1), min: m + 1440 } : { dia: h, min: m };
  }
  function hmOp(min) { return M.hm(((Math.round(min) % 1440) + 1440) % 1440); }
  function dmy(iso) { return M.br(iso); }
  function stamp(dia, min, seg) { /* 'YYYY-MM-DD HH:MM:SS' na hora local */
    var t = M.ts(dia, min); return t.slice(0, 10) + ' ' + t.slice(11, 16) + ':' + (seg == null ? '00' : (seg < 10 ? '0' : '') + seg);
  }

  /* ---------------- ajudantes ---------------- */
  function med(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var i = (s.length - 1) / 2; return (s[Math.floor(i)] + s[Math.ceil(i)]) / 2; }
  function p90(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]; }
  function soma(a, f) { var t = 0; a.forEach(function (x) { t += f(x); }); return M.arred(t); }
  function r1(x) { return x == null ? null : Math.round(x * 10) / 10; }
  function ehDelivery(p) { return p.canal !== 'retirada'; }
  function numPed(p) { return p.numero_ifood || String(p.numero); }
  var MARCAS = [C.marca, 'Smash Express', 'Marmita da Casa'];   /* marcas de exemplo no iFood */

  /* culpa de cada motivo de cancelamento do MUNDO */
  var CULPA = { 'Cliente desistiu': 'cliente', 'Endereço fora da área': 'cliente', 'Item indisponível': 'loja', 'Demora na entrega': 'loja', 'Pedido em duplicidade': 'outros', 'Problema no pagamento': 'outros' };
  var QUEM = { 'Cliente desistiu': 'CONSUMER', 'Endereço fora da área': 'RESTAURANT', 'Item indisponível': 'RESTAURANT', 'Demora na entrega': 'CONSUMER', 'Pedido em duplicidade': 'CONSUMER', 'Problema no pagamento': 'IFOOD' };

  /* estado do pedido num minuto de corte */
  function estado(p, corte) {
    if (p.cancelado) return 'cancelado';
    if (corte < p.min_pronto) return 'preparando';
    if (corte < p.min_saida) return 'pronto';
    if (corte < p.min_entrega) return 'rua';
    return 'entregue';
  }

  /* ---------------- acontecimentos de cada pedido (sorteio repetivel por pedido) ----------------
     parcial (item devolvido), erro (cozinha / delivery / a classificar / fora), reclamacao no iFood, chat sem resposta */
  var ERROS = {
    cozinha: [['Lanche trocado', 'Burgers', 'Veio outro lanche no lugar do pedido.'], ['Faltou adicional', 'Adicionais', 'Pediu bacon extra e não veio.'], ['Ponto da carne errado', 'Burgers', 'Carne passou do ponto pedido.'], ['Batata fria', 'Acompanhamentos', 'Batata chegou fria e murcha.'], ['Faltou molho', 'Burgers', 'Molho da casa não veio na sacola.'], ['Embalagem vazou', 'Pratos', 'Embalagem abriu no caminho.']],
    delivery: [['Faltou bebida', 'Bebidas', 'Refrigerante não veio no pedido.'], ['Bebida errada', 'Bebidas', 'Veio outro sabor de bebida.'], ['Faltou sobremesa', 'Sobremesas', 'Sobremesa ficou fora da sacola.']],
    classificar: [['Reclamação sem item', null, 'Cliente disse que faltou coisa no pedido, sem dizer o quê.']],
    fora: [['Pedido duplicado pelo cliente', null, 'Cliente: pedi duas vezes sem querer.'], ['Endereço incompleto', null, 'Cliente não informou o número da casa.']]
  };
  var FONTES_ERRO = ['API iFood (reclamação de item)', 'Chat iFood', 'Gestor Web', 'Negociação iFood', 'Central Cozinha', 'API iFood (reclamação de item) + Chat iFood'];
  function doCardapio(r, cat) {
    var l = M.cardapio.filter(function (c) { return c.categoria === cat; });
    return l.length ? M.escolhe(r, l) : M.escolhe(r, M.cardapio);
  }
  var cacheEv = {}, cachePos = {};
  /* posicao do pedido entre as entregas do dia da loja (ordem de chegada); a lista de hoje so cresce no fim */
  function posDia(p) {
    var k = p.dia + '|' + p.loja, m = cachePos[k];
    if (!m || m[p.id] == null) {
      m = cachePos[k] = {}; var i = 0;
      M.pedidos(p.dia, p.loja).forEach(function (q) { if (!q.cancelado && ehDelivery(q)) m[q.id] = i++; });
    }
    return m[p.id];
  }
  function eventos(p) {
    if (cacheEv[p.id]) return cacheEv[p.id];
    var r = M.rng('placar-ev|' + p.id), ev = [];
    var atraso = p.min_entrega - p.min_pedido - p.prazo_min;
    var xParc = r(), xErro = r(), xRec = r(), xChat = r(), xGrupo = r(), xSac = r(), xRep = r(), xItemRec = r();
    if (!p.cancelado && ehDelivery(p)) {
      if (p.canal === 'ifood' && xParc < 0.012) {
        var it = doCardapio(r, M.escolhe(r, ['Bebidas', 'Sobremesas', 'Acompanhamentos', 'Adicionais']));
        ev.push({ tipo: 'parcial', min: p.min_entrega + 18, item: it.nome, valor: it.preco, sacola: xSac < 0.55 });
      }
      /* exemplo fixo: o 4o e o 25o pedido de entrega de cada loja no dia tem um erro (cozinha e delivery),
         para a lista de erros de hoje nao ficar vazia logo depois do almoco */
      var pos = posDia(p), fixo = pos === 3 ? 'cozinha' : pos === 24 ? 'delivery' : null;
      if (fixo || xErro < 0.02) {
        var g = fixo || (xGrupo < 0.55 ? 'cozinha' : xGrupo < 0.83 ? 'delivery' : xGrupo < 0.94 ? 'classificar' : 'fora');
        var e = M.escolhe(r, ERROS[g]);
        var item = e[1] ? doCardapio(r, e[1]).nome : '';
        ev.push({ tipo: 'erro', min: p.min_entrega + 12, grupo: g, rotulo: e[0], item: item, texto: e[2], fonte: M.escolhe(r, FONTES_ERRO) });
        if (g !== 'fora' && xRep < 0.18) ev.push({ tipo: 'erro', min: p.min_entrega + 40, grupo: g, rotulo: e[0], item: item, texto: 'Mesmo problema avisado de novo, sem número do pedido.', fonte: 'Central Cozinha', repetido_de: numPed(p) });
      }
      if (p.canal === 'ifood' && atraso > 8 && xRec < 0.4) ev.push({ tipo: 'reclam', sub: 'atraso', min: p.min_pedido + p.prazo_min + 4 });
      if (p.canal === 'ifood' && ev.some(function (x) { return x.tipo === 'parcial' || (x.tipo === 'erro' && x.grupo !== 'fora' && !x.repetido_de); }) && xItemRec < 0.7) ev.push({ tipo: 'reclam', sub: 'item', min: p.min_entrega + 20 });
      if (p.canal === 'ifood' && xChat < 0.008) ev.push({ tipo: 'chat', min: p.min_entrega - 5 });
    }
    cacheEv[p.id] = ev;
    return ev;
  }
  function evDe(lista, tipo, corte) {
    var out = [];
    lista.forEach(function (p) { eventos(p).forEach(function (e) { if (e.tipo === tipo && e.min <= corte) out.push({ p: p, e: e }); }); });
    return out;
  }

  /* ---------------- valores do dia (por loja, cortado num minuto) ---------------- */
  var cacheDia = {};
  function pedidosDe(dia, loja, corte) {
    return M.pedidos(dia, loja).filter(function (p) { return ehDelivery(p) && p.min_pedido <= corte; });
  }
  function apiDe(lista, corte) {
    /* chaves da API do iFood (viram "vivo.<nome>" na tela) */
    var ifd = lista.filter(function (p) { return p.canal === 'ifood'; });
    var okI = ifd.filter(function (p) { return !p.cancelado; });
    var ent = okI.filter(function (p) { return estado(p, corte) === 'entregue'; });
    var pronto = okI.filter(function (p) { return p.min_pronto <= corte; });
    var saiu = okI.filter(function (p) { return p.min_saida <= corte; });
    var noPrazo = ent.filter(function (p) { return p.min_entrega - p.min_pedido <= p.prazo_min; }).length;
    var atr30 = ent.filter(function (p) { return p.min_entrega - p.min_pedido - p.prazo_min > 30; }).length;
    var canc = lista.filter(function (p) { return p.cancelado && p.min_pedido + 10 <= corte; });
    var cul = function (c) { return canc.filter(function (p) { return CULPA[p.motivo_cancelamento] === c; }); };
    var parc = evDe(lista, 'parcial', corte), err = evDe(lista, 'erro', corte), rec = evDe(lista, 'reclam', corte);
    var errN = function (g) { return err.filter(function (x) { return x.e.grupo === g && !x.e.repetido_de; }).length; };
    var cozT = pronto.map(function (p) { return p.min_pronto - p.min_pedido; });
    var estT = saiu.map(function (p) { return p.min_saida - p.min_pronto; });
    var lojT = saiu.map(function (p) { return p.min_saida - p.min_pedido; });
    var entT = ent.map(function (p) { return p.min_entrega - p.min_saida; });
    var totT = ent.map(function (p) { return p.min_entrega - p.min_pedido; });
    return {
      pedidos_api: ifd.length,
      prazo_medidos: ent.length, prazo_no_prazo: noPrazo, prazo_atrasados: ent.length - noPrazo, prazo_atr30: atr30,
      t_cozinha_med: med(cozT), t_cozinha_p90: p90(cozT), t_cozinha_n: cozT.length,
      t_estufa_med: med(estT), t_estufa_p90: p90(estT), t_estufa_n: estT.length, t_estufa_neg: 0,
      t_loja_med: med(lojT), t_loja_p90: p90(lojT), t_loja_n: lojT.length,
      t_entrega_med: med(entT), t_entrega_p90: p90(entT), t_entrega_n: entT.length,
      t_total_med: med(totT), t_total_p90: p90(totT), t_total_n: totT.length,
      cancelados: canc.length, cancel_culpa_loja: cul('loja').length, cancel_cliente: cul('cliente').length, cancel_outros: cul('outros').length,
      valor_cancelado: soma(canc, function (p) { return p.total; }),
      parciais: parc.length, valor_parcial: soma(parc, function (x) { return x.e.valor; }),
      reclam_item: rec.filter(function (x) { return x.e.sub === 'item'; }).length,
      erros_cozinha: errN('cozinha'), erros_delivery: errN('delivery'), erros_classificar: errN('classificar'), erros_fora: errN('fora')
    };
  }

  function sorteioDia(dia, loja) { return M.rng('placar-dia|' + dia + '|' + loja); }

  /* placar de um dia fechado (dia x loja): chave -> valor */
  function placarDia(dia, loja, ontem) {
    var k = dia + '|' + loja;
    if (cacheDia[k]) return cacheDia[k];
    var corte = 99999, li = LOJAS.indexOf(loja);
    var lista = pedidosDe(dia, loja, corte);
    var ok = lista.filter(function (p) { return !p.cancelado; });
    var canc = lista.filter(function (p) { return p.cancelado; });
    var ifd = ok.filter(function (p) { return p.canal === 'ifood'; });
    var ent = ok;   /* dia fechado: todos entregues */
    var noPrazo = ent.filter(function (p) { return p.min_entrega - p.min_pedido <= p.prazo_min; }).length;
    var atr30 = ent.filter(function (p) { return p.min_entrega - p.min_pedido - p.prazo_min > 30; }).length;
    var r = sorteioDia(dia, loja);
    var fds = [0, 5, 6].indexOf(M.diaSemana(dia)) >= 0;
    var semBaixa = r() < 0.12 ? 1 : 0;
    var faixaMed = Math.round(40 + (fds ? 5 : 0) + r() * 6);
    var faixaMax = faixaMed + 5 + Math.floor(r() * 18);
    var parc = evDe(lista, 'parcial', corte), rec = evDe(lista, 'reclam', corte), chat = evDe(lista, 'chat', corte), err = evDe(lista, 'erro', corte);
    var cul = function (c) { return canc.filter(function (p) { return CULPA[p.motivo_cancelamento] === c; }); };
    var mot = function (m) { return canc.filter(function (p) { return p.motivo_cancelamento === m; }).length; };
    var notas = ifd.filter(function (p) { return p.nota != null; });
    if (dia === ontem) notas = notas.slice(0, Math.floor(notas.length * 0.45));                   /* avaliacoes ainda chegando */
    else if (dia === M.somaDias(ontem, -1)) notas = notas.slice(0, Math.floor(notas.length * 0.85));
    var mbs = M.motoboys.filter(function (m) { return m.loja === loja; });
    var escalados = Math.max(3, Math.round(mbs.length * (fds ? 0.95 : 0.7)));
    var chegTarde = r() < 0.18 ? 1 : 0, semAnot = r() < 0.08 ? 1 : 0;
    var pausasNovas = 1 + Math.floor(r() * 5), pausadosFim = 2 + Math.floor(r() * 6);
    if (dia === ontem && li === 1) chegTarde = 2;     /* exemplo de alerta: motoboys chegando tarde */
    if (dia === ontem && li === 0) pausasNovas = 9;   /* exemplo de alerta: acabou mais coisa que o normal */
    var porta = ok.filter(function (p) { return p.pagamento === 'cartao_na_entrega' || p.pagamento === 'dinheiro'; });
    var cartoes = porta.filter(function (p) { return p.pagamento === 'cartao_na_entrega'; }).length;
    var redeAte = M.somaDias(ontem, -1);
    var portaProb = r() < 0.08 ? 1 : 0;
    var recente = dia >= M.somaDias(ontem, -6);
    var casoA = recente && r() < 0.18 ? 1 : 0, casoP = recente && r() < 0.1 ? 1 : 0;
    var vend = soma(ok, function (p) { return p.total; }), vendI = soma(ifd, function (p) { return p.total; });
    var o = {
      'vendas.pedidos_delivery': ok.length, 'vendas.pedidos_ifood': ifd.length,
      'vendas.vendido_delivery': vend, 'vendas.vendido_ifood': vendI, 'vendas.vendido_fora_ifood': M.arred(vend - vendI),
      'vendas.pedidos_fora_ifood': ok.length - ifd.length, 'vendas.valor_cancelado': soma(canc, function (p) { return p.total; }),
      'vendas.pedidos_almoco': ok.filter(function (p) { return p.min_pedido < 18 * 60; }).length,
      'vendas.pedidos_noite': ok.filter(function (p) { return p.min_pedido >= 18 * 60; }).length,
      'vendas.pedidos_ifood_api': ifd.length,
      'prazo.pedidos_medidos': ent.length, 'prazo.pedidos_no_prazo': noPrazo,
      'prazo.pct_no_prazo': ent.length ? r1(noPrazo / ent.length * 100) : null,
      'prazo.pedidos_atrasados': ent.length - noPrazo, 'prazo.atrasados_mais_30min': atr30,
      'prazo.pedidos_sem_baixa_3h': semBaixa,
      'prazo.tempo_total_mediana_min': med(ent.map(function (p) { return p.min_entrega - p.min_pedido; })),
      'prazo.tempo_ate_sair_mediana_min': med(ent.map(function (p) { return p.min_saida - p.min_pedido; })),
      'prazo.tempo_rua_mediana_min': med(ent.map(function (p) { return p.min_entrega - p.min_saida; })),
      'prazo.prazo_prometido_mediana_min': med(ent.map(function (p) { return p.prazo_min; })),
      'prazo.cobertura_medicao_pct': r1(96 + r() * 4),
      'loja_ifood.faixa_tempo_media_min': faixaMed, 'loja_ifood.faixa_tempo_max_min': faixaMax,
      'loja_ifood.pct_horas_faixa_acima_padrao': r1(r() * 22),
      'loja_ifood.itens_pausados_fim_dia': pausadosFim, 'loja_ifood.pausas_novas': pausasNovas,
      'loja_ifood.chat_sem_resposta': chat.length,
      'cancelamentos.cancelados_total': canc.length, 'cancelamentos.pedidos_delivery': ok.length + canc.length,
      'cancelamentos.cancel_culpa_loja': cul('loja').length, 'cancelamentos.cancel_culpa_cliente': cul('cliente').length,
      'cancelamentos.valor_cancel_culpa_loja': soma(cul('loja'), function (p) { return p.total; }),
      'cancelamentos.valor_devolvido_parcial': soma(parc, function (x) { return x.e.valor; }),
      'cancelamentos.cancel_por_atraso': mot('Demora na entrega'), 'cancelamentos.cancel_pedido_errado': 0,
      'cancelamentos.cancel_item_indisponivel': mot('Item indisponível'), 'cancelamentos.cancel_sem_motoboy': 0,
      'cancelamentos.parciais_ifood': parc.length, 'cancelamentos.esquecido_na_sacola': parc.filter(function (x) { return x.e.sacola; }).length,
      'cancelamentos.cancel_endereco_cliente': mot('Endereço fora da área'),
      'clientes.reclam_ifood': rec.length, 'clientes.reclam_atraso_cancelar': rec.filter(function (x) { return x.e.sub === 'atraso'; }).length,
      'clientes.reclam_problema_pedido': rec.filter(function (x) { return x.e.sub === 'item'; }).length,
      'clientes.reclam_sem_resposta_loja': 0,
      'clientes.aval_qtd': notas.length,
      'clientes.aval_nota_media': notas.length ? r1(notas.reduce(function (a, p) { return a + p.nota; }, 0) / notas.length) : null,
      'clientes.aval_notas_1_2': notas.filter(function (p) { return p.nota <= 2; }).length,
      'motoboys.chegadas_atrasadas_anotacao': chegTarde, 'motoboys.turnos_sem_anotacao': semAnot, 'motoboys.turnos_escalados': escalados,
      'motoboys.entregas_saipos': ent.length, 'motoboys.motoboys_anotados_chegada': escalados - semAnot,
      'motoboys.entregas_por_motoboy_estimada': r1(ent.length / Math.max(1, escalados - semAnot)),
      'motoboys.porta_entregas': porta.length, 'motoboys.porta_sem_cobranca': 0, 'motoboys.porta_so_a_comida': portaProb,
      'motoboys.porta_cobrou_a_mais': 0, 'motoboys.porta_nao_cobrou_confirmado': 0,
      'motoboys.porta_aguardando_rede': dia > redeAte ? cartoes : 0,
      'motoboys.cobranca_casos_abertos': casoA, 'motoboys.cobranca_em_processo': casoP
    };
    var api = apiDe(lista, corte);
    var e = {}; for (var x in api) e[x] = api[x];
    cacheDia[k] = { placar: o, extra: e, lista: lista, err: err };
    return cacheDia[k];
  }

  /* chaves (ordem das colunas) */
  var CHAVES = ['vendas.pedidos_delivery', 'vendas.pedidos_ifood', 'vendas.vendido_delivery', 'vendas.vendido_ifood', 'vendas.vendido_fora_ifood',
    'vendas.pedidos_fora_ifood', 'vendas.valor_cancelado', 'vendas.pedidos_almoco', 'vendas.pedidos_noite', 'vendas.pedidos_ifood_api',
    'prazo.pedidos_medidos', 'prazo.pedidos_no_prazo', 'prazo.pct_no_prazo', 'prazo.pedidos_atrasados', 'prazo.atrasados_mais_30min',
    'prazo.pedidos_sem_baixa_3h', 'prazo.tempo_total_mediana_min', 'prazo.tempo_ate_sair_mediana_min', 'prazo.tempo_rua_mediana_min',
    'prazo.prazo_prometido_mediana_min', 'prazo.cobertura_medicao_pct',
    'loja_ifood.faixa_tempo_media_min', 'loja_ifood.faixa_tempo_max_min', 'loja_ifood.pct_horas_faixa_acima_padrao',
    'loja_ifood.itens_pausados_fim_dia', 'loja_ifood.pausas_novas', 'loja_ifood.chat_sem_resposta',
    'cancelamentos.cancelados_total', 'cancelamentos.pedidos_delivery', 'cancelamentos.cancel_culpa_loja', 'cancelamentos.cancel_culpa_cliente',
    'cancelamentos.valor_cancel_culpa_loja', 'cancelamentos.valor_devolvido_parcial', 'cancelamentos.cancel_por_atraso',
    'cancelamentos.cancel_pedido_errado', 'cancelamentos.cancel_item_indisponivel', 'cancelamentos.cancel_sem_motoboy',
    'cancelamentos.parciais_ifood', 'cancelamentos.esquecido_na_sacola', 'cancelamentos.cancel_endereco_cliente',
    'clientes.reclam_ifood', 'clientes.reclam_atraso_cancelar', 'clientes.reclam_problema_pedido', 'clientes.reclam_sem_resposta_loja',
    'clientes.aval_qtd', 'clientes.aval_nota_media', 'clientes.aval_notas_1_2',
    'motoboys.chegadas_atrasadas_anotacao', 'motoboys.turnos_sem_anotacao', 'motoboys.turnos_escalados', 'motoboys.entregas_saipos',
    'motoboys.motoboys_anotados_chegada', 'motoboys.entregas_por_motoboy_estimada', 'motoboys.porta_entregas', 'motoboys.porta_sem_cobranca',
    'motoboys.porta_so_a_comida', 'motoboys.porta_cobrou_a_mais', 'motoboys.porta_nao_cobrou_confirmado', 'motoboys.porta_aguardando_rede',
    'motoboys.cobranca_casos_abertos', 'motoboys.cobranca_em_processo'];
  var CHAVES_EXTRA = ['pedidos_api', 'prazo_medidos', 'prazo_no_prazo', 'prazo_atrasados', 'prazo_atr30',
    't_cozinha_med', 't_cozinha_p90', 't_cozinha_n', 't_estufa_med', 't_estufa_p90', 't_estufa_n', 't_estufa_neg',
    't_loja_med', 't_loja_p90', 't_loja_n', 't_entrega_med', 't_entrega_p90', 't_entrega_n', 't_total_med', 't_total_p90', 't_total_n',
    'cancelados', 'cancel_culpa_loja', 'cancel_cliente', 'cancel_outros', 'valor_cancelado', 'parciais', 'valor_parcial', 'reclam_item',
    'erros_cozinha', 'erros_delivery', 'erros_classificar', 'erros_fora'];
  /* chaves de dinheiro: a equipe nao recebe */
  var DINHEIRO = { 'vendas.vendido_delivery': 1, 'vendas.vendido_ifood': 1, 'vendas.vendido_fora_ifood': 1, 'vendas.valor_cancelado': 1,
    'cancelamentos.valor_cancel_culpa_loja': 1, 'cancelamentos.valor_devolvido_parcial': 1, valor_cancelado: 1, valor_parcial: 1 };

  /* ---------------- "hoje" (H) e "ontem ate a mesma hora" (H0) ---------------- */
  function hojeLoja(dia, loja, corte, dono) {
    var lista = pedidosDe(dia, loja, corte);
    var ok = lista.filter(function (p) { return !p.cancelado; });
    var ifd = ok.filter(function (p) { return p.canal === 'ifood'; });
    var ent = ok.filter(function (p) { return estado(p, corte) === 'entregue'; });
    var noPrazo = ent.filter(function (p) { return p.min_entrega - p.min_pedido <= p.prazo_min; }).length;
    var atr30 = ent.filter(function (p) { return p.min_entrega - p.min_pedido - p.prazo_min > 30; }).length;
    var ase = ok.filter(function (p) { return estado(p, corte) !== 'entregue' && corte - p.min_pedido > p.prazo_min; }).length;
    var canc = lista.filter(function (p) { return p.cancelado && p.min_pedido + 10 <= corte; });
    var rec = evDe(lista, 'reclam', corte);
    var o = { pedidos: ok.length, pedidos_ifood: ifd.length, medidos: ent.length, no_prazo: noPrazo, atr30: atr30,
      atrasados_sem_entrega: ase, cancelados: canc.length, reclam: rec.length, reclam_atraso: rec.filter(function (x) { return x.e.sub === 'atraso'; }).length };
    if (dono) { o.vendido = soma(ok, function (p) { return p.total; }); o.vendido_ifood = soma(ifd, function (p) { return p.total; }); }
    return { o: o, lista: lista };
  }
  function agoraLoja(lista, corte) {
    var ok = lista.filter(function (p) { return !p.cancelado; });
    var st = function (s) { return ok.filter(function (p) { return estado(p, corte) === s; }); };
    var prontos = st('pronto');
    return {
      em_preparo: st('preparando').length,
      prontos_esperando: prontos.length,
      pronto_mais_antigo_min: prontos.length ? Math.max.apply(null, prontos.map(function (p) { return corte - p.min_pronto; })) : null,
      na_rua: st('rua').length,
      atrasados_sem_entrega: ok.filter(function (p) { return p.canal === 'ifood' && estado(p, corte) !== 'entregue' && corte - p.min_pedido > p.prazo_min; }).length
    };
  }
  function tempoIfoodAgora(min, loja) {
    var h = Math.floor((min % 1440) / 60), r = M.rng('tempo-ifood|' + op().dia + '|' + loja + '|' + h);
    var pico = (h >= 19 && h <= 21) || (h >= 12 && h <= 13);
    return Math.round((pico ? 52 : 42) + r() * 8);
  }
  function montaHoje(dono) {
    var o = op(), ontem = M.somaDias(o.dia, -1), lojas = {};
    var primeiro = null;
    LOJAS.forEach(function (l, i) {
      var h = hojeLoja(o.dia, l, o.min, dono), h0 = hojeLoja(ontem, l, o.min, dono);
      if (h.lista.length) { var m0 = h.lista[0].min_pedido; if (primeiro == null || m0 < primeiro) primeiro = m0; }
      var lidoT = Math.max(11 * 60, Math.floor(Math.min(o.min, 1439) / 15) * 15);   /* o tempo do iFood so e lido ate a meia-noite */
      var maior = 0;
      for (var t = 11 * 60; t <= Math.min(o.min, 24 * 60); t += 60) maior = Math.max(maior, tempoIfoodAgora(t, l));
      var ult = h.lista.length ? h.lista[h.lista.length - 1].min_pedido : null;
      lojas[l] = {
        hoje: h.o, ontem: h0.o,
        pausados_agora: 3 + i + (o.min > 19 * 60 ? 2 : 0),
        tempo_ifood_agora: o.min >= 11 * 60 ? tempoIfoodAgora(o.min, l) : null,
        tempo_ifood_maior_hoje: o.min >= 11 * 60 ? maior : null,
        tempo_ifood_lido_as: o.min >= 11 * 60 ? hmOp(lidoT) : null,
        saipos_lido_as: ult != null ? hmOp(ult) : null,
        saipos_faltando: 0,
        _lista: h.lista, _lista0: h0.lista
      };
    });
    return { dia: o.dia, ate: hmOp(o.min), desde: primeiro != null ? hmOp(primeiro) : '05:00', lojas: lojas };
  }
  function limpaHoje(hj) {   /* tira as listas internas antes de mandar para a tela */
    var out = { dia: hj.dia, ate: hj.ate, desde: hj.desde, lojas: {} };
    Object.keys(hj.lojas).forEach(function (l) { var x = {}, y = hj.lojas[l]; for (var k in y) if (k.charAt(0) !== '_') x[k] = y[k]; out.lojas[l] = x; });
    return out;
  }
  function semDinheiro(o) { var x = {}; for (var k in o) if (!DINHEIRO[k]) x[k] = o[k]; return x; }

  /* ---------------- detalhe de ontem ---------------- */
  function detalhe(ontem, dono) {
    var det = { vendas: {}, prazo: {}, loja_ifood: {}, clientes: {}, cancelamentos: {}, motoboys: {} };
    var marcas = [], conf = [], porHora = {}, pico = [], piores = [], faixas = [], mud = [], leit = [], pf = [], pd = [];
    var recMot = [], recL = [], avT = [], avM = [], avR = [], neg = [], cMot = [], cLis = [], parL = [], chegL = [], semL = [], casos = [];
    var semanas = [1, 2, 3, 4].map(function (n) { return M.somaDias(ontem, -7 * n); });
    var FAIXAS = [['1) Almoço (11h às 15h)', 660, 900], ['2) Tarde (15h às 18h)', 900, 1080], ['3) Noite (18h às 21h)', 1080, 1260], ['4) Fim da noite (21h à 0h)', 1260, 1500]];
    function marcaDe(p) { var x = M.rng('marca|' + p.id)(); return x < 0.7 ? 0 : x < 0.9 ? 1 : 2; }
    LOJAS.forEach(function (l, li) {
      var dd = placarDia(ontem, l, ontem), ps = dd.lista, ok = ps.filter(function (p) { return !p.cancelado; });
      var r = M.rng('placar-det|' + ontem + '|' + l);
      var ifd = ok.filter(function (p) { return p.canal === 'ifood'; });
      /* marcas */
      var cont = [0, 0, 0]; ifd.forEach(function (p) { cont[marcaDe(p)]++; });
      if (li === 2) { cont[0] += cont[2]; cont[2] = 0; }   /* exemplo de alerta: uma marca sem venda */
      var base = [0, 0, 0];
      semanas.forEach(function (d) { placarDia(d, l, ontem).lista.forEach(function (p) { if (!p.cancelado && p.canal === 'ifood') base[marcaDe(p)]++; }); });
      MARCAS.forEach(function (n, i) { marcas.push({ loja: l, marca: n, pedidos: cont[i], pedidos_media4: base[i] / 4 }); });
      conf.push({ loja: l, api_ifood: ifd.length, saipos_ifood: ifd.length });
      /* pedidos por hora (contra a media das 4 semanas) */
      var hs = {}, hb = {};
      ok.forEach(function (p) { var h = Math.floor(p.min_pedido / 60) % 24; hs[h] = (hs[h] || 0) + 1; });
      semanas.forEach(function (d) { placarDia(d, l, ontem).lista.forEach(function (p) { if (!p.cancelado) { var h = Math.floor(p.min_pedido / 60) % 24; hb[h] = (hb[h] || 0) + 1; } }); });
      var arr = [], mx = null;
      for (var h = 11; h <= 23; h++) { arr.push([h, hs[h] || 0, M.arred((hb[h] || 0) / 4, 1)]); if (!mx || (hs[h] || 0) > mx.pedidos) mx = { loja: l, hora: h, pedidos: hs[h] || 0 }; }
      porHora[l] = arr; if (mx) pico.push(mx);
      /* pedidos mais atrasados */
      ok.map(function (p) { return { p: p, a: p.min_entrega - p.min_pedido - p.prazo_min }; }).filter(function (x) { return x.a > 0; })
        .sort(function (a, b) { return b.a - a.a; }).slice(0, 4).forEach(function (x) {
          var p = x.p;
          piores.push({ loja: l, pedido: numPed(p), atraso_min: x.a, pedido_as: p.hora_pedido, prometido_as: p.hora_prometida, entregue_as: hmOp(p.min_entrega),
            ate_sair_min: p.min_saida - p.min_pedido, na_rua_min: p.min_entrega - p.min_saida, sem_baixa_3h: false });
        });
      if (dd.placar['prazo.pedidos_sem_baixa_3h']) {
        var sb = ok[Math.floor(r() * ok.length)];
        if (sb) piores.push({ loja: l, pedido: numPed(sb), atraso_min: 180 - sb.prazo_min, pedido_as: sb.hora_pedido, prometido_as: sb.hora_prometida,
          entregue_as: hmOp(sb.min_pedido + 185), ate_sair_min: sb.min_saida - sb.min_pedido, na_rua_min: 185 - (sb.min_saida - sb.min_pedido), sem_baixa_3h: true });
      }
      /* atraso por faixa de horario */
      FAIXAS.forEach(function (f) {
        var fx = ok.filter(function (p) { return p.min_pedido >= f[1] && p.min_pedido < f[2]; });
        if (!fx.length) return;
        var at = fx.filter(function (p) { return p.min_entrega - p.min_pedido > p.prazo_min; }).length;
        faixas.push({ loja: l, faixa: f[0], medidos: fx.length, atrasados: at, pct_no_prazo: r1((fx.length - at) / fx.length * 100),
          ate_sair_mediana_min: med(fx.map(function (p) { return p.min_saida - p.min_pedido; })), na_rua_mediana_min: med(fx.map(function (p) { return p.min_entrega - p.min_saida; })) });
      });
      /* tempo mostrado no iFood ao longo do dia */
      var tl = [];
      [[11, 40], [12, 50], [14, 40], [19, 55], [22, 45]].forEach(function (t) { var v = t[1] + Math.round(r() * 6) - 2; mud.push({ loja: l, lido_as: (t[0] < 10 ? '0' : '') + t[0] + ':00', tempo_min: v }); tl.push(t[0] + 'h ' + v + ' min'); });
      leit.push({ loja: l, leituras_hora_a_hora: tl.join(' · ') });
      /* cardapio pausado no fim do dia */
      var prin = M.cardapio.filter(function (c) { return c.categoria === 'Burgers' || c.categoria === 'Pratos'; });
      var comp = M.cardapio.filter(function (c) { return c.categoria === 'Adicionais' || c.categoria === 'Bebidas' || c.categoria === 'Sobremesas'; });
      var n0 = dd.placar['loja_ifood.itens_pausados_fim_dia'];
      for (var k = 0; k < Math.min(4, n0); k++) {
        var principal = k === 0 && li === 0;
        var item = principal ? prin[(li * 3 + 2) % prin.length] : comp[(li * 5 + k * 3) % comp.length];
        pf.push({ loja: l, item: item.nome, tipo: principal ? 'Item principal' : 'Complemento', desde: dmy(principal ? M.somaDias(ontem, -3) : ontem), marcas: 1 + (k % 2) });
      }
      for (var q = 0; q < 2; q++) {
        var it = comp[(li * 4 + q * 7 + 1) % comp.length], ini = 19 * 60 + Math.floor(r() * 150);
        pd.push({ loja: l, item: it.nome, pausou: 'pausou às ' + hmOp(ini), voltou: q === 0 ? 'voltou às ' + hmOp(ini + 35 + Math.floor(r() * 40)) : '' });
      }
      /* reclamacoes no iFood */
      var rec = evDe(ps, 'reclam', 99999), ra = rec.filter(function (x) { return x.e.sub === 'atraso'; }), rit = rec.filter(function (x) { return x.e.sub === 'item'; });
      if (ra.length) recMot.push({ loja: l, tipo: 'atraso: pediu para cancelar ou nova previsão', qtd: ra.length, viraram_cancelamento: Math.min(ra.length, dd.placar['cancelamentos.cancel_por_atraso']) });
      if (rit.length) recMot.push({ loja: l, tipo: 'item faltando ou errado', qtd: rit.length, viraram_cancelamento: 0 });
      rit.forEach(function (x) {
        var er = eventos(x.p).filter(function (e) { return e.tipo === 'erro' || e.tipo === 'parcial'; })[0] || {};
        recL.push({ loja: l, pedido: numPed(x.p), hora: hmOp(x.e.min), marca: MARCAS[marcaDe(x.p)], cliente: x.p.cliente, tipo: 'item',
          motivo: er.texto || ('Faltou ' + (er.item || 'um item') + ' no pedido.'), resultado: r() < 0.6 ? 'reembolso parcial aceito' : 'loja ofereceu cupom' });
      });
      ra.slice(0, 2).forEach(function (x) { recL.push({ loja: l, pedido: numPed(x.p), hora: hmOp(x.e.min), marca: MARCAS[marcaDe(x.p)], cliente: x.p.cliente, tipo: 'atraso', motivo: 'Pedido passou do horário prometido.', resultado: 'nova previsão enviada' }); });
      /* avaliacoes sem resposta (exemplo: a loja 1 tem a mais antiga vencendo amanha) */
      var abertas = [7, 3, 4][li % 3], antiga = [9, 2, 6][li % 3];
      avT.push({ loja: l, abertas: abertas, mais_antiga_dias: antiga });
      var comentarios = { 1: ['Veio o lanche errado.', 'Lanche chegou frio e a batata murcha.', 'Pedido chegou revirado na sacola.'],
        2: ['Demorou demais, mais de uma hora.', 'Faltou o molho e a batata veio fria.', 'Lanche bom, mas chegou bem atrasado.'],
        4: ['Muito bom, só faltou o molho.', 'Gostei, embalagem caprichada.', 'Gostoso, mas demorou um pouco.'] };
      for (var a = 0; a < Math.min(3, abertas); a++) {
        var nota = a === 0 ? 2 : a === 1 ? 4 : 1, dAb = Math.max(1, antiga - a * 2);
        avM.push({ loja: l, nota: nota, marca: MARCAS[a % 2], comentario: comentarios[nota][li % 3], dias_em_aberto: dAb, ultimo_dia_aprox: M.somaDias(M.somaDias(ontem, 1), (li === 0 ? 1 : 9) + a) });
        if (nota <= 2 && dAb <= 3) avR.push({ loja: l, nota: nota });
      }
      /* negociacao aberta na tela do iFood */
      if (li === 1 && ifd.length) { var pn = ifd[Math.floor(ifd.length * 0.7)]; neg.push({ loja: l, pedido: numPed(pn), hora: hmOp(pn.min_entrega + 25), motivo: 'Cliente pediu reembolso da bebida', resposta_loja: 'loja aceitou o reembolso', resposta_cliente: 'cliente aceitou' }); }
      /* cancelados do dia */
      var mts = {};
      ps.filter(function (p) { return p.cancelado; }).forEach(function (p) {
        var cu = CULPA[p.motivo_cancelamento] || 'outros';
        var c = { loja: l, pedido: numPed(p), hora: p.hora_pedido, motivo: p.motivo_cancelamento, responsavel: cu, texto: '' };
        if (dono) c.valor = p.total;
        cLis.push(c);
        var kk = cu + '|' + p.motivo_cancelamento; mts[kk] = (mts[kk] || 0) + 1;
      });
      Object.keys(mts).forEach(function (kk) { var t = kk.split('|'); cMot.push({ loja: l, responsavel: t[0], motivo: t[1], qtd: mts[kk] }); });
      evDe(ps, 'parcial', 99999).forEach(function (x) {
        var c = { loja: l, pedido: numPed(x.p), hora: hmOp(x.p.min_pedido), o_que_faltou: x.e.item + (x.e.sacola ? ' (ficou fora da sacola)' : ''), esquecido_na_sacola: x.e.sacola };
        if (dono) c.valor_devolvido = x.e.valor;
        parL.push(c);
      });
      /* motoboys: chegada anotada no balcao */
      var mbs = M.motoboys.filter(function (m) { return m.loja === l; });
      for (var c1 = 0; c1 < dd.placar['motoboys.chegadas_atrasadas_anotacao']; c1++) {
        var mb = mbs[(c1 * 2 + li) % mbs.length], esc0 = c1 === 0 ? 18 * 60 : 11 * 60, atr = 32 + Math.floor(r() * 25);
        chegL.push({ loja: l, motoboy: mb.apelido, minutos: atr, escala: hmOp(esc0), anotado: hmOp(esc0 + atr), digitada: c1 === 1 });
      }
      for (var s1 = 0; s1 < dd.placar['motoboys.turnos_sem_anotacao']; s1++) { var mb2 = mbs[(s1 + 3 + li) % mbs.length]; semL.push({ loja: l, motoboy: mb2.apelido, escala: 'escala 18:00 às 23:30' }); }
    });
    /* casos de cobranca na porta em aberto (dos ultimos dias) */
    LOJAS.forEach(function (l) {
      for (var i = 0; i <= 6; i++) {
        var d = M.somaDias(ontem, -i), pl = placarDia(d, l, ontem).placar, n = pl['motoboys.cobranca_casos_abertos'] + pl['motoboys.cobranca_em_processo'];
        for (var j = 0; j < n; j++) {
          var ps2 = placarDia(d, l, ontem).lista.filter(function (p) { return !p.cancelado && p.pagamento === 'cartao_na_entrega'; });
          var p = ps2[(j * 7 + i) % Math.max(1, ps2.length)]; if (!p) continue;
          casos.push({ loja: l, pedido: numPed(p), dia: dmy(d), meio: 'cartão na entrega', situacao: j === 0 && pl['motoboys.cobranca_casos_abertos'] ? 'AGUARDANDO_RESPOSTA' : 'EM_PROCESSO', resultado: 'cobrou só a comida, faltou a taxa de entrega' });
        }
      }
    });
    var cartoes = 0, ok0 = 0;
    LOJAS.forEach(function (l) { var pl = placarDia(ontem, l, ontem).placar; cartoes += pl['motoboys.porta_aguardando_rede']; ok0 += pl['motoboys.porta_entregas'] - pl['motoboys.porta_aguardando_rede']; });
    var ifdOntem = [];
    LOJAS.forEach(function (l) { placarDia(ontem, l, ontem).lista.forEach(function (p) { if (p.cancelado && p.canal === 'ifood') ifdOntem.push({ loja: l, pedido: numPed(p) }); }); });
    var escalaAte = {}; LOJAS.forEach(function (l) { escalaAte[l] = dmy(M.somaDias(ontem, 8)); });

    det.vendas = { marcas: marcas, conferencia_ifood: conf, pedidos_por_hora: porHora, hora_pico: pico };
    det.prazo = { piores_pedidos: piores.sort(function (a, b) { return b.atraso_min - a.atraso_min; }), atraso_por_faixa_horario: faixas, tempo_configurado_ifood_mudancas: mud };
    det.loja_ifood = { faixa_de_tempo_ontem: leit, pausados_fim_do_dia: pf, pausas_de_ontem: pd };
    det.clientes = { reclamacoes_ifood_ontem_motivos: recMot, reclamacoes_ifood_ontem: recL, avaliacoes_sem_resposta_total: avT,
      avaliacoes_sem_resposta_mais_antigas: avM, avaliacoes_ruins_ultimos_3_dias: avR, negociacoes_tela_ontem: neg };
    var hojeTxt = dmy(M.somaDias(ontem, 1));
    det.cancelamentos = { motivos: cMot, cancelados: cLis, parciais: parL,
      fontes: { gestor_web_ultimo: hojeTxt + ' 05:12', saipos_ultimo: hojeTxt + ' 05:20', api_ifood_ultimo: hojeTxt + ' 05:25', relatorio_ifood_ate: M.somaDias(ontem, -1) },
      ifood_cancelado_saipos_aberto: ifdOntem.slice(0, 1) };
    det.motoboys = { chegadas_atrasadas: chegL, escalados_sem_anotacao: semL, casos_cobranca_em_aberto: casos,
      cobranca_porta_ontem: { resumo: { OK: ok0, AGUARDANDO_REDE: cartoes }, rede_ate: dmy(M.somaDias(ontem, -1)) },
      fontes_paradas: { rede_ate: dmy(M.somaDias(ontem, -1)), trackeat_gps_ate: dmy(ontem), trackeat_entregas_ate: dmy(ontem), escala_ate: escalaAte } };
    return det;
  }

  /* ---------------- historico (montado uma vez por abertura da tela) ---------------- */
  var cacheHist = {};
  function historico(dono) {
    var o = op(), ontem = M.somaDias(o.dia, -1), chave = ontem + '|' + (dono ? 1 : 0);
    if (cacheHist[chave]) return cacheHist[chave];
    var y = +ontem.slice(0, 4), m = +ontem.slice(5, 7) - 2; if (m < 1) { m += 12; y--; }
    var ini = y + '-' + (m < 10 ? '0' : '') + m + '-01';
    var dias = M.intervalo(ini, ontem);
    var ch = CHAVES.filter(function (k) { return dono || !DINHEIRO[k]; });
    var chE = CHAVES_EXTRA.filter(function (k) { return dono || !DINHEIRO[k]; });
    var linhas = [], extra = [];
    dias.forEach(function (d) {
      LOJAS.forEach(function (l) {
        var x = placarDia(d, l, ontem);
        linhas.push([d, l, ch.map(function (k) { var v = x.placar[k]; return v === undefined ? null : v; })]);
        extra.push([d, l, chE.map(function (k) { var v = x.extra[k]; return v === undefined ? null : v; })]);
      });
    });
    var hj = montaHoje(dono);
    var placar = {
      chaves: ch, linhas: linhas, ontem: ontem, gerado: o.dia + 'T05:31:00',
      hoje: limpaHoje(hj), det: detalhe(ontem, dono), erros: {},
      frescor: [['selo_super', ontem, 'OK']]
    };
    cacheHist[chave] = { placar: placar, extra: { chaves: chE, linhas: extra }, dono: !!dono };
    return cacheHist[chave];
  }

  /* ---------------- leitura ao vivo ---------------- */
  function listasVivo(hj, dono) {
    var canc = [], parc = [], erros = [];
    LOJAS.forEach(function (l) {
      var lista = hj.lojas[l]._lista, corte = op().min;
      lista.filter(function (p) { return p.cancelado && p.min_pedido + 10 <= corte; }).forEach(function (p) {
        var c = { loja: l, pedido: numPed(p), hora: hmOp(p.min_pedido + 10), motivo: p.motivo_cancelamento, culpa: CULPA[p.motivo_cancelamento] || 'outros',
          quem: QUEM[p.motivo_cancelamento] || 'CONSUMER', origem: p.canal === 'ifood' ? 'API iFood' : 'Saipos (site próprio)' };
        if (dono) c.valor = p.total;
        canc.push(c);
      });
      evDe(lista, 'parcial', corte).forEach(function (x) {
        var c = { loja: l, pedido: numPed(x.p), hora: hmOp(x.e.min), item: x.e.item, motivo: x.e.sacola ? 'item ficou fora da sacola' : 'item não veio', desfecho: 'reembolso do item' };
        if (dono) c.valor = x.e.valor;
        parc.push(c);
      });
      evDe(lista, 'erro', corte).forEach(function (x) {
        var e = x.e;
        erros.push({ loja: l, pedido: e.repetido_de ? '' : numPed(x.p), hora: hmOp(e.min), grupo: e.grupo, cat: e.rotulo, rotulo: e.rotulo, item: e.item || '',
          texto: e.texto, fonte: e.fonte, repetido: e.repetido_de ? true : false, repetido_de: e.repetido_de || null });
      });
    });
    return { cancelados: canc, parciais: parc, erros: erros };
  }
  function vivo(dono) {
    var o = op(), hj = montaHoje(dono), lojas = {};
    LOJAS.forEach(function (l) {
      var x = hj.lojas[l];
      var a = apiDe(x._lista, o.min), b = apiDe(x._lista0, o.min);
      lojas[l] = { hoje: dono ? a : semDinheiro(a), ontem: dono ? b : semDinheiro(b), agora: agoraLoja(x._lista, o.min) };
    });
    var ls = listasVivo(hj, dono);
    function antes(min) { return hmOp(Math.max(0, o.min - min)); }
    function em(min, seg) { return stamp(o.dia, Math.max(0, o.min - min), seg); }
    var sv = {}, si = {}, svE = {}, siE = {};
    LOJAS.forEach(function (l, i) {
      var dv = [6, 9, 38, 12, 7, 4][i % 6], di = [3, 4, 5, 2, 6, 3][i % 6];   /* uma loja com a leitura de vendas um pouco atrasada */
      sv[l] = antes(dv); si[l] = antes(di); svE[l] = em(dv, 10); siE[l] = em(di, 40);
    });
    return {
      quando: M.agoraISO().slice(0, 16), dia: o.dia, hoje: limpaHoje(hj),
      vivo: { lojas: lojas, cancelados: ls.cancelados, parciais: ls.parciais, erros: ls.erros },
      fontes: { api_ifood: antes(0), espelho_gw: antes(1), saipos_vendas: sv, saipos_itens: si, tempo_ifood: antes(20), cardapio: antes(2), chat_ifood: antes(25) },
      fontes_em: { api_ifood: em(0, 20), espelho_gw: em(1, 5), saipos_vendas: svE, saipos_itens: siE, tempo_ifood: em(20, 0), cardapio: em(2, 30), chat_ifood: em(25, 0) },
      fontes_tipo: { chat_ifood: 'evento' },
      fontes_falha: null,
      gerado: M.agoraISO().slice(0, 19)
    };
  }

  D.rpc('placar_delivery_portal', function (corpo, ctx) {
    var d = (corpo && corpo.p_dados) || {};
    var dono = !!ctx.admin;
    if (d.parte === 'vivo') {
      if (d.ja_tenho && d.ja_tenho === M.agoraISO().slice(0, 16)) return { igual: true };
      return vivo(dono);
    }
    return historico(dono);
  });
})();
