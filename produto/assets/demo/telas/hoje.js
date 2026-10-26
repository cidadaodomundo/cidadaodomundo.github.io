/* Um olho no negocio (demonstracao).
   Simula as portas:
     painel_hoje {p_token} -> { agora, ontem, dia_comecou, fila:[{quem, titulo, detalhe, tarefa}],
                               alertas:[{grave, area, titulo, texto, tela}] }
     painel_hoje_feito {p_token, p_tarefa} -> {ok:true}  (a tarefa some da fila ate o fim do dia)
   Os alertas saem dos mesmos dados das outras telas: vendas de ontem (MUNDO.pedidos + MUNDO.salao) contra a
   media dos 4 mesmos dias da semana, prazo de entrega de hoje contra os ultimos 28 dias, ponto de ontem
   (MUNDO.batidas, sem nomes e sem cargo de confianca), cancelamentos e notas baixas de ontem.
   Itens pausados no iFood vem da porta pausados_consulta quando ela esta carregada (telas/pausados.js);
   contas a vencer vem da porta contas_pagar_consulta quando ela esta carregada (telas/contas.js).
   Limites dos alertas: regra de exemplo, configuravel. Valores em R$ so para o dono (ctx.admin). */
(function () {
  if (!window.DEMO) return;
  var M = window.MUNDO, C = window.PORTAL_CFG;

  /* ---------------- regras de exemplo (configuraveis) ---------------- */
  var REGRA = {
    vendaAmarelo: -5, vendaVermelho: -10,      /* % contra a media dos 4 mesmos dias da semana */
    prazoAtrasoPct: 15, prazoMinEntregas: 8,   /* % de entregas fora do prazo hoje */
    prazoPiorMin: 5,                            /* minutos acima da media de 28 dias = vermelho */
    cancelAmareloPct: 4, cancelVermelhoPct: 6,
    notasAmarelo: 3, notasVermelho: 5           /* notas 1 e 2 no dia, por loja */
  };

  /* ---------------- ajudantes ---------------- */
  var SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var SEMANA_PL = ['dos 4 últimos domingos', 'das 4 últimas segundas', 'das 4 últimas terças', 'das 4 últimas quartas', 'das 4 últimas quintas', 'das 4 últimas sextas', 'dos 4 últimos sábados'];
  function reais(v) { return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(v) { var n = Math.round(v); return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + '%'; }
  function pct1(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }
  function media(a) { if (!a.length) return null; var s = 0; a.forEach(function (x) { s += x; }); return s / a.length; }
  function hojeOp() { return M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(); }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

  function venda(dia, lojaId) {
    var deliv = 0;
    M.pedidos(dia, lojaId).forEach(function (p) { if (!p.cancelado) deliv += p.total; });
    var s = M.salao(dia, lojaId);
    return { deliv: deliv, salao: s.faturamento, total: deliv + s.faturamento };
  }

  /* ---------------- tarefas marcadas como feitas (so neste navegador) ---------------- */
  var CHAVE = 'demo_hoje_feito';
  function lerFeitas() {
    try { var o = JSON.parse(localStorage.getItem(CHAVE) || 'null'); return o && o.dia === hojeOp() ? o.tarefas || [] : []; } catch (e) { return []; }
  }
  function gravarFeita(t) {
    var l = lerFeitas(); if (l.indexOf(t) < 0) l.push(t);
    try { localStorage.setItem(CHAVE, JSON.stringify({ dia: hojeOp(), tarefas: l })); } catch (e) {}
  }

  /* ---------------- alertas ---------------- */
  function alertaVenda(L, ontem, admin) {
    var v = venda(ontem, L.id);
    var base = [7, 14, 21, 28].map(function (k) { return venda(M.somaDias(ontem, -k), L.id); });
    var mt = media(base.map(function (b) { return b.total; })), md = media(base.map(function (b) { return b.deliv; })), ms = media(base.map(function (b) { return b.salao; }));
    var dev = (v.total / mt - 1) * 100;
    var out = { dev: dev, total: v.total, media: mt, alerta: null };
    if (dev > REGRA.vendaAmarelo) return out;
    var dw = M.diaSemana(ontem), dd = (v.deliv / md - 1) * 100, ds = (v.salao / ms - 1) * 100;
    var pior = dd < ds ? 'O delivery caiu mais (' + pct(dd) + ') que o salão (' + pct(ds) + ').' : 'O salão caiu mais (' + pct(ds) + ') que o delivery (' + pct(dd) + ').';
    var txt = admin
      ? 'Ontem (' + SEMANA[dw] + ', ' + M.br(ontem) + ') a loja ' + L.nome + ' vendeu ' + reais(v.total) + ' somando delivery e salão; a média ' + SEMANA_PL[dw] + ' é ' + reais(mt) + '. ' + pior
      : 'Ontem (' + SEMANA[dw] + ', ' + M.br(ontem) + ') a loja ' + L.nome + ' vendeu ' + pct(dev) + ' contra a média ' + SEMANA_PL[dw] + '. ' + pior;
    out.alerta = { grave: dev <= REGRA.vendaVermelho ? 1 : 0, area: 'Vendas', titulo: L.nome + ' vendeu ' + Math.abs(Math.round(dev)) + '% menos ontem', texto: txt, tela: 'Placar do Delivery' };
    return out;
  }

  function alertaPrazo(L, dia) {
    var hj = M.pedidos(dia, L.id).filter(function (p) { return p.status === 'entregue' && p.canal !== 'retirada'; });
    if (hj.length < REGRA.prazoMinEntregas) return null;
    var fora = hj.filter(function (p) { return !p.no_prazo; }).length;
    var mh = media(hj.map(function (p) { return p.minutos_total; }));
    var hist = [];
    for (var k = 1; k <= 28; k++) M.pedidos(M.somaDias(dia, -k), L.id).forEach(function (p) { if (!p.cancelado && p.canal !== 'retirada') hist.push(p.minutos_total); });
    var m28 = media(hist);
    var pctFora = fora * 100 / hj.length;
    var grave = mh - m28 >= REGRA.prazoPiorMin;
    if (!grave && (pctFora < REGRA.prazoAtrasoPct || fora < 3)) return null;
    return {
      grave: grave ? 1 : 0, area: 'Prazo',
      titulo: L.nome + ': ' + plural(fora, 'entrega passou', 'entregas passaram') + ' do prazo hoje',
      texto: fora + ' de ' + hj.length + ' entregas de hoje chegaram depois da hora prometida ao cliente (' + Math.round(pctFora) + '%). Tempo médio hoje: ' + Math.round(mh) + ' min; a média dos últimos 28 dias da loja é ' + Math.round(m28) + ' min.',
      tela: 'Tempo de Entrega'
    };
  }

  function alertaPonto(L, ontem) {
    var c = { falta: 0, incompleto: 0, atraso: 0 };
    M.equipe.forEach(function (p) {
      if (p.loja !== L.id || p.cargo_confianca || !p.ativo) return;
      var b = M.batidas(p, ontem);
      if (b.situacao === 'FALTA') c.falta++;
      else if (b.situacao === 'INCOMPLETO' || b.situacao === 'SEM_BATIDA') c.incompleto++;
      if (b.atraso_min > 15) c.atraso++;
    });
    var casos = c.falta + c.incompleto + c.atraso;
    if (casos < 2 && !c.falta) return null;
    var partes = [];
    if (c.falta) partes.push(plural(c.falta, 'falta', 'faltas'));
    if (c.incompleto) partes.push(plural(c.incompleto, 'batida incompleta', 'batidas incompletas'));
    if (c.atraso) partes.push(plural(c.atraso, 'atraso de mais de 15 min', 'atrasos de mais de 15 min'));
    var lista = partes.length > 1 ? partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1] : partes[0];
    return {
      grave: (c.falta >= 1 || c.incompleto >= 2) ? 1 : 0, area: 'Ponto',
      titulo: L.nome + ': ' + plural(casos, 'caso', 'casos') + ' no ponto de ontem',
      texto: 'Ontem (' + M.br(ontem) + '): ' + lista + '. Os nomes ficam no Painel RH; quem tem cargo de confiança não entra na conta.',
      tela: 'Painel RH'
    };
  }

  function alertaCancel(L, ontem) {
    var ps = M.pedidos(ontem, L.id), cc = ps.filter(function (p) { return p.cancelado; });
    if (!ps.length) return null;
    var taxa = cc.length * 100 / ps.length;
    if (taxa < REGRA.cancelAmareloPct) return null;
    var mot = {}; cc.forEach(function (p) { mot[p.motivo_cancelamento] = (mot[p.motivo_cancelamento] || 0) + 1; });
    var top = Object.keys(mot).sort(function (a, b) { return mot[b] - mot[a]; })[0];
    return {
      grave: taxa >= REGRA.cancelVermelhoPct ? 1 : 0, area: 'Cancelamentos',
      titulo: L.nome + ' cancelou ' + cc.length + ' pedidos ontem',
      texto: cc.length + ' de ' + ps.length + ' pedidos de delivery foram cancelados ontem (' + pct1(taxa) + '%). Motivo que mais apareceu: ' + top.toLowerCase() + ' (' + mot[top] + 'x).',
      tela: 'Cancelamentos'
    };
  }

  function alertaNotas(L, ontem) {
    var ruins = M.pedidos(ontem, L.id).filter(function (p) { return p.nota != null && p.nota <= 2; });
    if (ruins.length < REGRA.notasAmarelo) return null;
    var cont = {};
    ruins.forEach(function (p) { if (p.comentario) cont[p.comentario] = (cont[p.comentario] || 0) + 1; });
    var frases = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; }).slice(0, 2)
      .map(function (k) { return '“' + k.replace(/[.!]+$/, '') + '”' + (cont[k] > 1 ? ' (' + cont[k] + 'x)' : ''); });
    var semTexto = ruins.filter(function (p) { return !p.comentario; }).length;
    return {
      grave: ruins.length >= REGRA.notasVermelho ? 1 : 0, area: 'Avaliações',
      titulo: L.nome + ' recebeu ' + ruins.length + ' notas baixas no iFood ontem',
      texto: 'Notas 1 e 2 de ontem. ' + (frases.length ? 'O que os clientes escreveram: ' + frases.join(' e ') + '.' : '') + (semTexto ? ' ' + plural(semTexto, 'avaliação veio', 'avaliações vieram') + ' sem comentário.' : ''),
      tela: 'Avaliações do dia'
    };
  }

  function chamar(nome, ctx, corpo) {
    corpo.p_token = ctx.token;
    return fetch(C.rest + 'rpc/' + nome, {
      method: 'POST', headers: { apikey: C.chave, Authorization: 'Bearer ' + C.chave, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (r) { if (!r.ok) throw new Error(nome + ' ' + r.status); return r.json(); });
  }

  /* contas a vencer: le a mesma porta da tela Contas a Pagar, quando ela esta carregada (telas/contas.js).
     Olha os proximos 3 dias e avisa o primeiro dia com boleto ou Pix ainda nao baixado. */
  function alertaContas(ctx, admin) {
    if (!DEMO.tem('rpc', 'contas_pagar_consulta')) return Promise.resolve(contasExemplo(admin));
    var dias = [1, 2, 3].map(function (k) { return M.somaDias(M.hoje(), k); }), meses = [];
    dias.forEach(function (d) { if (meses.indexOf(d.slice(0, 7)) < 0) meses.push(d.slice(0, 7)); });
    return Promise.all(meses.map(function (m) {
      return chamar('contas_pagar_consulta', ctx, { p_dados: { dia: { loja: null, ano: +m.slice(0, 4), mes: m, escopo: 'mes' } } });
    })).then(function (rs) {
      var lista = [];
      rs.forEach(function (d) { lista = lista.concat((d && d.lista) || []); });
      lista = lista.filter(function (x) { return /boleto|pix/i.test(x.metodo || ''); });
      var alvo = null, doDia = [];
      for (var i = 0; i < dias.length && !alvo; i++) {
        doDia = lista.filter(function (x) { return x.dia === dias[i]; });
        if (doDia.length) alvo = dias[i];
      }
      if (!alvo) return null;
      var tot = 0, cats = [];
      doDia.forEach(function (x) {
        tot += Number(x.valor) || 0;
        var c = String(x.categoria || '').toLowerCase();
        if (c && cats.indexOf(c) < 0) cats.push(c);
      });
      var quando = alvo === dias[0] ? 'amanhã' : 'em ' + M.br(alvo);
      var lojas = [];
      doDia.forEach(function (x) { if (x.loja && lojas.indexOf(x.loja) < 0) lojas.push(x.loja); });
      var oQue = cats.slice(0, 4).join(', ') + (cats.length > 4 ? ' e mais ' + plural(cats.length - 4, 'tipo', 'tipos') : '');
      return {
        grave: 0, area: 'Contas',
        titulo: plural(doDia.length, 'conta vence', 'contas vencem') + ' ' + quando,
        texto: (admin ? 'Somam ' + reais(tot) + ' (' + oQue + ')' : oQue.charAt(0).toUpperCase() + oQue.slice(1)) +
          (lojas.length ? ', ' + (lojas.length > 1 ? 'nas lojas ' + lojas.slice(0, -1).join(', ') + ' e ' + lojas[lojas.length - 1] : 'na loja ' + lojas[0]) : '') +
          '. São boletos e Pix: confira se já estão agendados.',
        tela: 'Contas a Pagar'
      };
    }).catch(function () { return contasExemplo(admin); });
  }

  /* exemplo fixo, quando a porta da tela Contas a Pagar nao esta carregada */
  function contasExemplo(admin) {
    var r = M.rng('hoje-contas|' + hojeOp());
    var nomes = M.escolhe(r, [['gás', 'hortifrúti', 'aluguel da máquina de gelo'], ['carnes', 'embalagens', 'energia'], ['pães', 'bebidas', 'manutenção da coifa']]);
    var n = M.entre(r, 2, 3), tot = 0;
    for (var i = 0; i < n; i++) tot += M.entre(r, 380, 2600) + M.entre(r, 0, 99) / 100;
    return {
      grave: 0, area: 'Contas',
      titulo: plural(n, 'boleto vence', 'boletos vencem') + ' amanhã',
      texto: (admin ? 'Somam ' + reais(tot) + ' (' : '(') + nomes.slice(0, n).join(', ') + '). Confira se já estão agendados.',
      tela: 'Contas a Pagar'
    };
  }

  /* itens pausados no iFood: le a mesma porta da tela Produtos pausados, quando ela esta carregada */
  function alertaPausados(ctx) {
    if (!DEMO.tem('rpc', 'pausados_consulta')) return Promise.resolve(null);
    return fetch(C.rest + 'rpc/pausados_consulta', {
      method: 'POST', headers: { apikey: C.chave, Authorization: 'Bearer ' + C.chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: ctx.token })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var abertas = ((d && d.linhas) || []).filter(function (x) { return x.aberta && !x.resolvido; });
      if (!abertas.length) return null;
      var porLoja = {}, itens = {}, maisVelha = 0;
      abertas.forEach(function (x) {
        porLoja[x.unidade] = (porLoja[x.unidade] || 0) + 1;
        itens[x.unidade + '|' + x.item] = 1;
        maisVelha = Math.max(maisVelha, x.minutos || 0);
      });
      var nItens = Object.keys(itens).length, lojas = Object.keys(porLoja);
      var horas = Math.floor(maisVelha / 60);
      return {
        grave: maisVelha >= 120 ? 1 : 0, area: 'Cardápio',
        titulo: plural(nItens, 'item pausado', 'itens pausados') + ' no iFood sem solução',
        texto: (lojas.length > 1 ? 'Nas lojas ' + lojas.slice(0, -1).join(', ') + ' e ' + lojas[lojas.length - 1] : 'Na loja ' + lojas[0]) + '. O mais antigo está pausado há ' + (horas >= 24 ? plural(Math.floor(horas / 24), 'dia', 'dias') : horas >= 1 ? plural(horas, 'hora', 'horas') : maisVelha + ' min') + '. Cada item pausado é venda que não entra.',
        tela: 'Produtos pausados'
      };
    }).catch(function () { return null; });
  }

  /* ---------------- fila do dia ---------------- */
  function fila(ontem, notasRuins) {
    var ag = M.minutosAgora(), r = M.rng('hoje-fila|' + hojeOp());
    var lj = M.lojas[M.entre(r, 0, M.lojas.length - 1)];
    var orc1 = M.entre(r, 5, 8) * 100 + 80, orc2 = orc1 + M.entre(r, 2, 4) * 100 + 60;
    var f = [
      { quem: 'dono', tarefa: 'folha', titulo: 'Dar o ok na prévia da folha do mês', detalhe: 'O escritório deixou a prévia pronta, com horas extras e faltas conferidas. Falta só a sua aprovação.' },
      { quem: 'dono', tarefa: 'orcamento', titulo: 'Escolher o orçamento do conserto da fritadeira (' + lj.nome + ')', detalhe: 'Chegaram dois orçamentos: ' + reais(orc1) + ' e ' + reais(orc2) + '. A gerência da loja prefere o mais barato.' },
      { quem: 'dono', tarefa: 'motoboys', titulo: 'Liberar o pagamento dos motoboys da semana', detalhe: 'O fechamento está pronto em Pagar Motoboys; o escritório espera o seu ok para pagar.' }
    ];
    if (notasRuins > 0) f.splice(1, 0, { quem: 'dono', tarefa: 'avaliacoes', titulo: 'Responder ' + plural(notasRuins, 'avaliação ruim', 'avaliações ruins') + ' de ontem', detalhe: 'Notas 1 e 2 no iFood de ' + M.br(ontem) + '. Resposta rápida ajuda a recuperar o cliente.' });
    /* tarefas automaticas: aparecem enquanto o sistema ainda esta trabalhando */
    if (ag < 11 * 60) f.push({ quem: 'computador', tarefa: 'pdv', titulo: 'Buscando as vendas de ontem no PDV', detalhe: 'Faltam ' + plural(Math.max(1, M.lojas.length - 1), 'loja', 'lojas') + '. Termina sozinho, sem precisar de você.' });
    f.push({ quem: 'computador', tarefa: 'leitura-avaliacoes', titulo: 'Lendo as avaliações novas do iFood e do Google', detalhe: 'Roda de hora em hora; a próxima leitura é às ' + M.hm((Math.floor(ag / 60) + 1) * 60) + '.' });
    if (ag >= 11 * 60 && ag < 15 * 60) f.push({ quem: 'computador', tarefa: 'maquininha', titulo: 'Conferindo a maquininha contra o caixa de ontem', detalhe: 'Cruza as vendas no cartão com o fechamento de caixa das lojas.' });
    var feitas = lerFeitas();
    return f.filter(function (x) { return feitas.indexOf(x.tarefa) < 0; });
  }

  DEMO.rpc('painel_hoje', function (corpo, ctx) {
    if (!ctx.admin) throw DEMO.erro(403, 'Só o dono vê esta tela', '42501');
    var dia = hojeOp(), ontem = M.somaDias(dia, -1), admin = !!ctx.admin;
    var alertas = [], totOntem = 0, totMedia = 0, notasRuins = 0;

    M.lojas.forEach(function (L) {
      var v = alertaVenda(L, ontem, admin);
      totOntem += v.total; totMedia += v.media;
      if (v.alerta) alertas.push(v.alerta);
    });
    M.lojas.forEach(function (L) { var a = alertaPrazo(L, dia); if (a) alertas.push(a); });
    M.lojas.forEach(function (L) { var a = alertaPonto(L, ontem); if (a) alertas.push(a); });
    M.lojas.forEach(function (L) { var a = alertaCancel(L, ontem); if (a) alertas.push(a); });
    M.lojas.forEach(function (L) {
      notasRuins += M.pedidos(ontem, L.id).filter(function (p) { return p.nota != null && p.nota <= 2; }).length;
      var a = alertaNotas(L, ontem); if (a) alertas.push(a);
    });
    return Promise.all([alertaPausados(ctx), alertaContas(ctx, admin)]).then(function (extra) {
      if (extra[0]) alertas.unshift(extra[0]);
      if (extra[1]) alertas.push(extra[1]);
      var dev = totMedia ? (totOntem / totMedia - 1) * 100 : 0;
      var ag = M.minutosAgora();
      var comecou = ag > 8 * 60 + 52 ? 8 * 60 + 47 : Math.max(0, ag - 5);
      return {
        agora: M.hm(ag),
        ontem: Math.abs(dev) < 1.5 ? 'na média' : pct(dev),
        dia_comecou: M.hm(comecou),
        fila: fila(ontem, notasRuins),
        alertas: alertas
      };
    });
  });

  DEMO.rpc('painel_hoje_feito', function (corpo, ctx) {
    if (!ctx.admin) throw DEMO.erro(403, 'Só o dono vê esta tela', '42501');
    if (!corpo.p_tarefa) throw DEMO.erro(400, 'Falta a tarefa', 'P0001');
    gravarFeita(String(corpo.p_tarefa));
    return { ok: true };
  });
})();
