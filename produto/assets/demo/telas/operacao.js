/* Desperdicio (demonstracao). Tela: operacao/index.html.
   Simula a rpc operacao_consulta (p_cred, p_acao, p_dados) nas acoes desta tela:
     resumo {de, ate} -> [ { unidade, custo, custo_evitavel, lancamentos } ]  (uma linha por loja)
     lista  {de, ate} -> [ { id, data, unidade, turno, produto, quantidade, medida, custo_total,
                            motivo, evitavel, detalhe, lancado_por } ]  (mais recentes primeiro)
     add, del         -> { ok:true }
   Valores em R$ (custo, custo_evitavel, custo_total) so vao para o dono (ctx.admin), como no banco de verdade.
   Perdas inventadas com itens do cardapio de MUNDO e insumos ficticios. As lojas vem do config.js.
   O que se grava na tela fica so neste navegador (localStorage, prefixo demo_operacao_). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  function doCardapio(nome, padrao) {
    for (var i = 0; i < M.cardapio.length; i++) if (M.cardapio[i].nome === nome) return M.cardapio[i];
    return { nome: padrao || nome, preco: 30 };
  }
  var BURGERS = M.cardapio.filter(function (c) { return c.categoria === 'Burgers'; }).slice(0, 6);
  var BATATA = doCardapio('Batata Rústica'), SHAKE = doCardapio('Milkshake Chocolate');

  /* produto, medida, custo por unidade (regra de exemplo), [ [motivo, peso], ... ], quantidade minima e maxima, peso do produto */
  var PRODUTOS = [];
  BURGERS.forEach(function (b) {
    PRODUTOS.push([b.nome, 'un', M.arred(b.preco * 0.36), [['Erro de pedido', 35], ['Queimou', 20], ['Caiu no chão', 15], ['Devolução do cliente', 20], ['Teste / treinamento', 10]], 1, 2, 2]);
  });
  PRODUTOS.push(
    [BATATA.nome, 'porção', 4.2, [['Sobra de produção', 30], ['Erro de pedido', 25], ['Queimou', 20], ['Caiu no chão', 15], ['Devolução do cliente', 10]], 1, 3, 5],
    ['Pão brioche', 'un', 1.85, [['Venceu / estragou', 50], ['Caiu no chão', 30], ['Outro', 20]], 2, 12, 4],
    ['Blend bovino 160 g', 'un', 6.4, [['Queimou', 50], ['Caiu no chão', 30], ['Venceu / estragou', 20]], 1, 6, 5],
    ['Alface americana', 'un', 3.5, [['Venceu / estragou', 100]], 1, 3, 3],
    ['Tomate', 'kg', 7.9, [['Venceu / estragou', 100]], 0.5, 2, 3],
    ['Maionese da casa', 'kg', 18, [['Sobra de produção', 60], ['Venceu / estragou', 40]], 0.5, 1.5, 3],
    ['Cebola caramelizada', 'kg', 14, [['Sobra de produção', 100]], 0.3, 1, 2],
    ['Bacon fatiado', 'kg', 42, [['Queimou', 70], ['Venceu / estragou', 30]], 0.2, 0.8, 2],
    ['Óleo de fritura', 'L', 9.2, [['Outro', 100]], 9, 18, 1],
    [SHAKE.nome, 'un', M.arred(SHAKE.preco * 0.34), [['Erro de pedido', 60], ['Caiu no chão', 40]], 1, 2, 2]
  );
  var EVITAVEL = { 'Queimou': 0.85, 'Caiu no chão': 0.9, 'Erro de pedido': 0.9, 'Venceu / estragou': 0.7, 'Sobra de produção': 0.5, 'Devolução do cliente': 0.3, 'Teste / treinamento': 0, 'Outro': 0.2 };
  var DETALHES = {
    'Queimou': ['Chapa muito quente no pico', 'Ficou tempo demais na chapa durante o pico'],
    'Caiu no chão': ['Bandeja virou na passagem', 'Caiu ao montar o lanche'],
    'Erro de pedido': ['Saiu sem conferir o adicional', 'Montou o lanche trocado', 'Pedido lançado duas vezes no sistema'],
    'Venceu / estragou': ['Passou da validade na geladeira', 'Ficou fora da câmara fria'],
    'Sobra de produção': ['Produziu acima do movimento do dia', 'Sobrou no fim do turno'],
    'Devolução do cliente': ['Cliente reclamou do ponto da carne', 'Cliente pediu sem cebola e veio com cebola'],
    'Teste / treinamento': ['Treinamento de chapeiro novo', 'Teste de lanche novo do cardápio'],
    'Outro': []
  };
  /* detalhe que so faz sentido para um produto */
  var DETALHES_PRODUTO = {
    'Óleo de fritura': { 'Outro': ['Troca antes do previsto: óleo escureceu', 'Troca antecipada depois de limpeza da fritadeira'] },
    'Tomate': { 'Venceu / estragou': ['Lote chegou maduro demais', 'Passou do ponto na bancada'] },
    'Alface americana': { 'Venceu / estragou': ['Lote chegou murcho', 'Passou da validade na geladeira'] },
    'Bacon fatiado': { 'Queimou': ['Ficou tempo demais na chapa durante o pico', 'Chapa muito quente no pico'] },
    'Pão brioche': { 'Outro': ['Pacote rasgado na entrega'], 'Venceu / estragou': ['Passou da validade', 'Mofou na embalagem'] }
  };
  DETALHES_PRODUTO[BATATA.nome] = {
    'Queimou': ['Fritadeira com termostato desregulado', 'Cesto esquecido na fritadeira no pico'],
    'Erro de pedido': ['Saiu porção a mais no pedido', 'Pedido lançado duas vezes no sistema'],
    'Devolução do cliente': ['Cliente reclamou que chegou fria', 'Chegou murcha ao cliente'],
    'Caiu no chão': ['Bandeja virou na passagem']
  };
  DETALHES_PRODUTO[SHAKE.nome] = {
    'Erro de pedido': ['Saiu o sabor trocado', 'Pedido lançado duas vezes no sistema'],
    'Caiu no chão': ['Copo virou na passagem']
  };
  /* turno, minuto de inicio, minuto de fim, peso */
  var TURNOS = [['Almoço', 690, 870, 30], ['Tarde', 870, 1080, 15], ['Jantar', 1080, 1410, 45], ['Madrugada', 1410, 1530, 10]];

  /* ---------------- guardado so neste navegador ---------------- */
  var MEM = {};
  function ler(k, padrao) {
    try { var v = localStorage.getItem('demo_operacao_' + k); if (v) return JSON.parse(v); } catch (e) {}
    return MEM[k] != null ? MEM[k] : padrao;
  }
  function gravar(k, v) { MEM[k] = v; try { localStorage.setItem('demo_operacao_' + k, JSON.stringify(v)); } catch (e) {} }
  function proximoId() { var n = ler('seq', 0) + 1; gravar('seq', n); return 900000 + n; }

  function idDe(txt) { return 100000 + (M.hash(txt) % 800000); }
  function quemDaLoja(L, semente) {
    var gente = M.equipe.filter(function (p) { return p.loja === L.id && (p.setor === 'Cozinha' || p.setor === 'Gerência' || p.setor === 'Delivery'); });
    if (!gente.length) return 'Equipe da loja';
    var p = gente[M.hash(semente) % gente.length];
    var partes = p.nome.split(' ');
    return partes[0] + ' ' + partes[partes.length - 1].charAt(0) + '.';
  }

  /* perdas inventadas de um dia (hoje: so o que ja aconteceu) */
  var cache = {};
  function doDia(dia) {
    var hoje = dia === M.hoje();
    if (!hoje && cache[dia]) return cache[dia];
    var agora = M.minutosAgora(), l = [];
    M.lojas.forEach(function (L, li) {
      var r = M.rng('desp|' + L.id + '|' + dia);
      var n = M.pesado(r, [[0, 62 - Math.round(12 * (L.peso || 0.5))], [1, 32], [2, 9], [3, 1]]);
      for (var k = 0; k < n; k++) {
        var p = M.pesado(r, PRODUTOS.map(function (x) { return [x, x[6]]; }));
        var t = M.pesado(r, TURNOS.map(function (x) { return [x, x[3]]; }));
        var min = t[1] + Math.floor(r() * (t[2] - t[1]));
        if (hoje && min > agora) continue;
        var motivo = M.pesado(r, p[3]);
        var q = p[1] === 'un' || p[1] === 'porção' ? M.entre(r, p[4], p[5]) : M.arred(p[4] + r() * (p[5] - p[4]), 1);
        var semCusto = r() < 0.08;
        var dets = (DETALHES_PRODUTO[p[0]] && DETALHES_PRODUTO[p[0]][motivo]) || DETALHES[motivo] || [];
        l.push({
          id: idDe('d|' + L.id + '|' + dia + '|' + k), data: dia, unidade: L.nome, turno: t[0], produto: p[0],
          quantidade: q, medida: p[1], custo_total: semCusto ? null : M.arred(q * p[2]),
          motivo: motivo, evitavel: r() < (EVITAVEL[motivo] || 0),
          detalhe: dets.length && r() < 0.55 ? M.escolhe(r, dets) : '',
          lancado_por: quemDaLoja(L, 'd' + dia + k + li), _ord: min
        });
      }
    });
    if (!hoje) cache[dia] = l;
    return l;
  }

  function lancamentos(de, ate) {
    var hoje = M.hoje();
    de = de && /^\d{4}-\d{2}-\d{2}$/.test(de) ? de : M.dia(-30);
    ate = ate && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate : hoje;
    var ateBase = ate > hoje ? hoje : ate;   /* a tela calcula "hoje" em UTC: a noite pode pedir o dia seguinte */
    var del = ler('del', []), l = [];
    var limite = M.dia(-400);
    if (de < limite) de = limite;
    M.intervalo(de, ateBase).forEach(function (d) { l = l.concat(doDia(d)); });
    l = l.concat(ler('novos', []).filter(function (x) { return x.data >= de && x.data <= ate; }));
    return l.filter(function (x) { return del.indexOf(x.id) < 0; }).sort(function (a, b) {
      return a.data !== b.data ? (a.data < b.data ? 1 : -1) : (b._ord || 0) - (a._ord || 0);
    });
  }

  function semDinheiro(x, ctx) {
    var o = {};
    for (var k in x) {
      if (k.charAt(0) === '_') continue;
      if (!ctx.admin && (k === 'custo_total' || k === 'custo' || k === 'custo_evitavel' || k === 'custo_unit')) continue;
      o[k] = x[k];
    }
    return o;
  }

  D.rpc('operacao_consulta', function (b, ctx) {
    var acao = b.p_acao, d = b.p_dados || {};
    switch (acao) {
      case 'lista':
        return lancamentos(d.de, d.ate).map(function (x) { return semDinheiro(x, ctx); });

      case 'resumo': {
        var por = {};
        lancamentos(d.de, d.ate).forEach(function (x) {
          var r = por[x.unidade] || (por[x.unidade] = { unidade: x.unidade, custo: 0, custo_evitavel: 0, lancamentos: 0 });
          r.lancamentos++;
          r.custo = M.arred(r.custo + Number(x.custo_total || 0));
          if (x.evitavel) r.custo_evitavel = M.arred(r.custo_evitavel + Number(x.custo_total || 0));
        });
        return M.lojas.map(function (L) { return por[L.nome]; }).filter(Boolean)
          .concat(Object.keys(por).filter(function (u) { return !M.lojas.some(function (L) { return L.nome === u; }); }).map(function (u) { return por[u]; }))
          .map(function (x) { return semDinheiro(x, ctx); });
      }

      case 'add': {
        if (!d.unidade || !String(d.produto || '').trim()) throw D.erro(400, 'Faltou a loja ou o que se perdeu', 'P0001');
        var q = Number(d.quantidade);
        if (!(q > 0)) throw D.erro(400, 'A quantidade tem que ser maior que zero', 'P0001');
        var cu = d.custo_unit === '' || d.custo_unit == null ? null : Number(d.custo_unit);
        var l = ler('novos', []);
        l.push({
          id: proximoId(), data: d.data || M.hoje(), unidade: d.unidade, turno: d.turno || '', produto: String(d.produto).trim(),
          quantidade: q, medida: d.medida || 'un', custo_total: cu ? M.arred(q * cu) : null,
          motivo: d.motivo || 'Outro', evitavel: !!d.evitavel, detalhe: d.detalhe || '',
          lancado_por: d.lancado_por || ctx.nome, _ord: 5000 + Date.now() / 1e9
        });
        gravar('novos', l);
        return { ok: true };
      }

      case 'del': {
        var id = Number(d.id);
        gravar('novos', ler('novos', []).filter(function (x) { return x.id !== id; }));
        var del = ler('del', []); if (del.indexOf(id) < 0) del.push(id); gravar('del', del);
        return { ok: true };
      }
    }
    throw D.erro(400, 'Ação não simulada na demonstração: ' + acao, 'P0001');
  });
})();
