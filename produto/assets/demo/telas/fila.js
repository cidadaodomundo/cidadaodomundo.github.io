/* Fila de Pedidos ao vivo (demonstracao).
   Simula: rpc fila_pedidos (pedidos na loja e na rua, motoboys, promessa, faixa do iFood),
           rpc fila_painel (o dia ate agora), rpc fila_pedido_itens (itens de um pedido)
           e a tabela cozinha_vw_preparo_dia (tempo de preparo por loja e dia).
   Os pedidos saem de MUNDO.pedidos (os mesmos das outras telas) e a situacao de cada um
   (em preparo, pronto, na rua) e calculada pela hora atual. Quando a loja esta parada
   (fora do horario ou no vale da tarde), a tela mostra o ultimo pico e avisa isso no topo. */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  var SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  /* faixas de tempo salvas no iFood (regra de exemplo, configuravel) */
  var FAIXAS = [
    { nome: 'Faixa 1', de: 30, ate: 40 }, { nome: 'Faixa 2', de: 40, ate: 50 },
    { nome: 'Faixa 3', de: 50, ate: 60 }, { nome: 'Faixa 4', de: 60, ate: 70 }
  ];

  /* ---------------- utilidades ---------------- */
  function km(a, b) {
    var R = function (x) { return x * Math.PI / 180; };
    var dl = R(b[0] - a[0]), dg = R(b[1] - a[1]);
    var s = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(R(a[0])) * Math.cos(R(b[0])) * Math.sin(dg / 2) * Math.sin(dg / 2);
    return 12742 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  function kmTxt(k) { return k < 1 ? (Math.round(k * 100) * 10) + ' m' : k.toFixed(1).replace('.', ',') + ' km'; }
  function mediana(v) {
    if (!v.length) return null;
    var s = v.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function entrega(p) { return !p.cancelado && p.canal !== 'retirada'; }   /* o que passa pelo TrackEat */
  function lojaDe(corpo) { return M.loja(corpo && corpo.p_unidade) || M.lojas[0]; }
  function diaBr(iso) { return SEMANA[M.diaSemana(iso)] + ', ' + M.br(iso); }

  /* ---------------- a "cena": que dia e que minuto a tela mostra ----------------
     Dia operacional: ate as 5h ainda conta como o dia anterior (minuto passa de 1440).
     Com movimento (2+ pedidos abertos por loja, em media), acompanha o relogio.
     Sem movimento, repete o ultimo pico do jantar (19:40 de hoje, se ja passou, ou de ontem). */
  var PICO = 19 * 60 + 40;
  var CENA = null;
  function cena() {
    var real = M.minutosAgora(), dia = real < 300 ? M.dia(-1) : M.hoje(), ag = real < 300 ? real + 1440 : real;
    var k = dia + '|' + ag;
    if (CENA && CENA.k === k) return CENA;
    var abertos = 0;
    M.lojas.forEach(function (l) {
      M.pedidos(dia, l.id).forEach(function (p) { if (entrega(p) && p.min_pedido <= ag && ag < p.min_entrega) abertos++; });
    });
    var c = { k: k, dia: dia, agora: ag, aviso: '' };
    if (abertos < 2 * Math.max(1, M.lojas.length)) {
      var ontem = ag < PICO;
      if (ontem) c.dia = M.somaDias(dia, -1);
      c.agora = PICO;
      c.aviso = 'Demonstração: a loja está com pouco movimento agora, então a fila mostra como estava ' +
        (c.dia === M.hoje() ? 'hoje' : 'ontem') + ' às ' + M.hm(PICO) + ', no pico do jantar. No horário de movimento, esta tela acompanha o relógio.';
    }
    CENA = c;
    return c;
  }

  /* ---------------- tempo normal da loja (mediana dos ultimos 7 dias) ---------------- */
  var REG = {};
  function regua(L, dia) {
    var k = L.id + '|' + dia;
    if (REG[k]) return REG[k];
    var sai = [], ent = [], mbs = 0;
    for (var i = 1; i <= 7; i++) {
      M.pedidos(M.somaDias(dia, -i), L.id).forEach(function (p) {
        if (!entrega(p)) return;
        sai.push(p.min_saida - p.min_pedido); ent.push(p.min_entrega - p.min_pedido);
        if (p.motoboy_id) mbs++;
      });
    }
    sai = sai.slice(-300); ent = ent.slice(-300);
    REG[k] = { ate_sair: Math.round(mediana(sai)), ate_entregar: Math.round(mediana(ent)), amostra: sai.length, medida_em: '06:00', entregas7: mbs };
    return REG[k];
  }

  /* numero da rota (grupo) de cada motoboy no dia */
  function grupoDe(dia, mbId) { return 100 + (M.hash('rota|' + dia + '|' + mbId) % 900); }

  function endereco(p) {
    var r = M.rng('compl|' + p.id);
    var c = r() < 0.4 ? ' - Compl: ' + M.escolhe(r, ['Apto 12', 'Casa 2', 'Bloco B, apto 304', 'Fundos', 'Portão azul', 'Sala 5', 'Apto 801, interfone 81']) : '';
    return p.endereco + ' - ' + p.bairro + c;
  }

  /* ---------------- fila de uma loja na cena ---------------- */
  function fila(L) {
    var c = cena(), ag = c.agora, dia = c.dia;
    var reg = regua(L, dia);
    var todos = M.pedidos(dia, L.id).filter(function (p) { return entrega(p) && p.min_pedido <= ag; });
    var abertos = todos.filter(function (p) { return ag < p.min_entrega; });
    var mbs = M.motoboys.filter(function (m) { return m.loja === L.id; });
    var semGps = mbs.length ? mbs[M.hash('gps|' + dia + '|' + L.id) % mbs.length].id : null;
    var base = [L.lat, L.lng];

    function item(p) {
      var o = {
        pedido: String(p.numero), ifood: p.canal === 'ifood' ? p.numero_ifood : null,
        entrou: M.hm(p.min_pedido), min: ag - p.min_pedido,
        end: endereco(p), lat: p.lat, lng: p.lng
      };
      if (p.canal === 'ifood' && ag - p.min_pedido >= 3) {
        o.prometido = M.hm(p.min_pedido + p.prazo_min);
        o.falta_prom = p.min_pedido + p.prazo_min - ag;
      } else { o.prometido = null; o.falta_prom = null; }
      return o;
    }

    /* na rua: agrupado por motoboy, na ordem de entrega */
    var porMb = {}, ordemMb = [];
    abertos.forEach(function (p) {
      if (ag < p.min_saida || !p.motoboy_id) return;
      if (!porMb[p.motoboy_id]) { porMb[p.motoboy_id] = []; ordemMb.push(p.motoboy_id); }
      porMb[p.motoboy_id].push(p);
    });
    var naRua = [], grupos = [], gpsDe = {};
    ordemMb.forEach(function (id) {
      var ps = porMb[id].sort(function (a, b) { return a.min_entrega - b.min_entrega; });
      var mb = M.motoboys.filter(function (m) { return m.id === id; })[0];
      var g = grupoDe(dia, id), p1 = ps[0];
      var f = Math.max(0.05, Math.min(0.98, (ag - p1.min_saida) / Math.max(1, p1.min_entrega - p1.min_saida)));
      var gps = id === semGps ? null : [M.arred(L.lat + (p1.lat - L.lat) * f, 5), M.arred(L.lng + (p1.lng - L.lng) * f, 5)];
      gpsDe[id] = gps;
      var lista = ps.map(function (p, i) {
        var o = item(p);
        o.grupo = g; o.seq = i + 1;
        o.onde = (i === 0 && ag >= p.min_entrega - 2) ? 'porta' : 'rua';
        o.atrasado = o.min > reg.ate_entregar;
        o.dist_m = gps ? Math.round(km(gps, [p.lat, p.lng]) * 100) * 10 : null;
        grupos.push({ g: g, lat: p.lat, lng: p.lng });
        return o;
      });
      naRua.push({
        motoboy: mb.nome, saiu_ha: ag - Math.min.apply(null, ps.map(function (p) { return p.min_saida; })),
        com_gps: gps ? 1 : 0, quantos: ps.length, gps: gps ? { lat: gps[0], lng: gps[1] } : null, pedidos: lista
      });
    });
    naRua.sort(function (a, b) { return b.saiu_ha - a.saiu_ha; });

    /* na loja: em preparo e prontos; pronto que sai em ate 3 min ja tem motoboy (se ele estiver na loja) */
    var naLoja = abertos.filter(function (p) { return ag < p.min_saida; }).map(function (p) {
      var o = item(p);
      o.onde = ag < p.min_pronto ? 'preparo' : 'pronto';
      o.atrasado = o.min > reg.ate_sair;
      o.motoboy = null; o.grupo = null;
      if (o.onde === 'pronto' && p.min_saida - ag <= 3 && p.motoboy_id && !porMb[p.motoboy_id]) {
        o.motoboy = p.motoboy_nome; o.grupo = grupoDe(dia, p.motoboy_id);
        grupos.push({ g: o.grupo, lat: p.lat, lng: p.lng });
      }
      return o;
    });
    naLoja.sort(function (a, b) { return b.min - a.min; });

    /* motoboys com o aplicativo ligado: quem trabalha neste horario */
    var ativos = mbs.filter(function (m) {
      return todos.concat(abertos).some(function (p) { return p.motoboy_id === m.id && p.min_saida >= ag - 150 && p.min_saida <= ag + 30; });
    });
    var volta = Math.max(8, Math.round(reg.ate_entregar - reg.ate_sair));
    var tabela = ativos.map(function (m, i) {
      var r = M.rng('app|' + dia + '|' + m.id + '|' + Math.floor(ag / 10));
      var o = { motoboy: m.nome, app: r() < 0.85 ? 'ligado' : 'em segundo plano', visto: M.hm(ag - M.entre(r, 0, 2)) };
      var pend = porMb[m.id] || [];
      if (pend.length) {
        var ult = pend[pend.length - 1], g = gpsDe[m.id];
        o.no_patio = false; o.onde = pend[0].bairro; o.situacao = 'em rota';
        o.dist = g ? kmTxt(km(base, g)) : null;
        o.faltam = pend.length;
        o.livre_min = Math.max(1, ult.min_entrega - ag + volta); o.livre = M.hm(ag + o.livre_min);
        return o;
      }
      var feitas = todos.filter(function (p) { return p.motoboy_id === m.id && p.min_entrega <= ag; })
        .sort(function (a, b) { return b.min_entrega - a.min_entrega; });
      var u = feitas[0];
      if (u && ag - u.min_entrega < volta) {
        var falta = volta - (ag - u.min_entrega), fr = falta / volta;
        o.no_patio = false; o.onde = 'voltando de ' + u.bairro; o.situacao = 'voltando para a loja';
        o.dist = kmTxt(km(base, [u.lat, u.lng]) * fr);
        o.faltam = 0; o.livre_min = falta; o.livre = M.hm(ag + falta);
        return o;
      }
      var pegando = naLoja.some(function (p) { return p.motoboy === m.nome; });
      o.no_patio = true; o.onde = 'na loja'; o.dist = null;
      o.situacao = pegando ? 'pegando pedido' : 'esperando pedido';
      o.faltam = 0; o.livre = 'agora'; o.livre_min = 0;
      return o;
    });
    /* um motoboy com o app ligado mas fora do TrackEat (mostra o caso "sem bolinha") */
    var patio = tabela.filter(function (o) { return o.no_patio && o.situacao === 'esperando pedido'; });
    if (tabela.length >= 4 && patio.length >= 2) {
      var fora = patio[patio.length - 1];
      fora.faltam = null; fora.livre = null; fora.livre_min = null; fora.situacao = 'fora do TrackEat';
    }
    tabela.sort(function (a, b) {
      var x = a.livre_min == null ? 9999 : a.livre_min, y = b.livre_min == null ? 9999 : b.livre_min;
      return (a.no_patio === b.no_patio ? 0 : a.no_patio ? 1 : -1) || x - y;
    });

    /* promessa ao cliente */
    var abertosProm = naLoja.concat([].concat.apply([], naRua.map(function (m) { return m.pedidos; })))
      .filter(function (o) { return o.prometido; });
    var passou = abertosProm.filter(function (o) { return o.falta_prom < 0; });
    var ult45 = todos.filter(function (p) { return p.canal === 'ifood' && p.min_pedido >= ag - 45; });
    var prazos = ult45.map(function (p) { return p.prazo_min; }), uP = ult45[ult45.length - 1];

    /* faixa do iFood: a configurada depende do horario; a sugerida, da carga de agora (regra de exemplo) */
    var pico = (ag >= 720 && ag <= 810) || (ag >= 1170 && ag <= 1290);
    var atual = FAIXAS[pico ? 1 : 0];
    var prontos = naLoja.filter(function (p) { return p.onde === 'pronto'; }).length;
    var naHora = todos.filter(function (p) { return p.min_pedido >= ag - 60; }).length;
    var sug = Math.max(25, Math.min(70, Math.round(reg.ate_entregar + 1.5 * Math.max(0, prontos - 2) + (passou.length ? 4 : 0) + naHora / 6)));
    var alvo = FAIXAS.filter(function (f) { return sug <= f.ate; })[0] || FAIXAS[FAIXAS.length - 1];
    var acao = sug > atual.de + 4 && alvo.de > atual.de ? 'subir' : (sug < atual.de - 8 && alvo.de < atual.de ? 'baixar' : 'fica');
    var faixa = {
      atual: atual.nome, prometido: atual.de, cliente_ve: atual.de + 10, sugerido: sug,
      sugerida: acao === 'fica' ? null : alvo.nome, sug_de: alvo.de, sug_ate: alvo.ate,
      acao: acao, parados: passou.length, pedidos_hora: naHora, cego: false,
      cor: acao === 'subir' ? 'vermelho' : acao === 'baixar' ? 'azul' : 'verde', loja_status: 'aberta'
    };

    var noRua = naRua.reduce(function (a, m) { return a + m.quantos; }, 0);
    return {
      agora: M.hm(ag), visto_em: M.hm(ag), gps_visto_em: M.hm(ag), aviso: c.aviso,
      loja: { lat: L.lat, lng: L.lng },
      resumo: { preparo: naLoja.filter(function (p) { return p.onde === 'preparo'; }).length, pronto: prontos, rua: noRua, motoboys: naRua.length },
      regua: { ate_sair: reg.ate_sair, ate_entregar: reg.ate_entregar, amostra: reg.amostra, medida_em: reg.medida_em },
      promessa: { passou: passou.length, pior_min: passou.length ? Math.max.apply(null, passou.map(function (o) { return -o.falta_prom; })) : 0, com: abertosProm.length },
      promessa_agora: ult45.length
        ? { n: ult45.length, min: Math.min.apply(null, prazos), max: Math.max.apply(null, prazos), ultimo_em: M.hm(uP.min_pedido), ultimo: uP.prazo_min }
        : { n: 0 },
      faixa: faixa,
      grupos: grupos,
      na_loja: naLoja,
      na_rua: naRua,
      motoboys: tabela,
      motoboys_regua: { ida_min: Math.round(reg.ate_entregar - reg.ate_sair), entre_min: 8, volta_min: volta, amostra: reg.entregas7, dias: 7 }
    };
  }

  D.rpc('fila_pedidos', function (corpo) { return fila(lojaDe(corpo)); });

  /* ---------------- o dia ate agora ---------------- */
  D.rpc('fila_painel', function (corpo) {
    var c = cena(), ag = c.agora, L = lojaDe(corpo);
    function feitas(dia) {
      return M.pedidos(dia, L.id).filter(function (p) { return entrega(p) && p.min_entrega <= ag; });
    }
    var hj = feitas(c.dia);
    var ok = hj.filter(function (p) { return p.min_entrega - p.min_pedido <= p.prazo_min; }).length;
    var bn = 0, bo = 0;
    for (var s = 1; s <= 4; s++) {
      feitas(M.somaDias(c.dia, -7 * s)).forEach(function (p) { bn++; if (p.min_entrega - p.min_pedido <= p.prazo_min) bo++; });
    }
    var mbs = {};
    hj.forEach(function (p) { if (p.motoboy_id) mbs[p.motoboy_id] = 1; });
    var ult = hj.reduce(function (a, p) { return Math.max(a, p.min_entrega); }, 0);
    var r = M.rng('painel|' + c.dia + '|' + L.id);
    var esq = [];
    if (hj.length > 10) {
      var nq = M.pesado(r, [[0, 4], [1, 4], [2, 2]]);
      for (var i = 0; i < nq; i++) {
        var p = hj[Math.floor(r() * hj.length)];
        esq.push({ pedido: String(p.numero), quando: M.hm(p.min_entrega + M.entre(r, 4, 25)), familia: M.escolhe(r, ['BEBIDA', 'SOBREMESA', 'COMIDA']) });
      }
      esq.sort(function (a, b) { return a.quando < b.quando ? -1 : 1; });
    }
    return {
      dia: diaBr(c.dia), entregas: hj.length, no_prazo: ok, atrasos: hj.length - ok,
      base_n: bn, base_ok: bo, ultima_entrega: ult ? M.hm(ult) : null,
      motoboys: Object.keys(mbs).length, sem_codigo: hj.length > 10 ? M.entre(r, 0, 2) : 0,
      reentrega: hj.length > 20 && r() < 0.5 ? 1 : 0,
      esquecidos: esq, chat_lido_em: M.hm(ag - 2), gw: null
    };
  });

  /* ---------------- itens de um pedido (sem preco e sem nome de cliente) ---------------- */
  D.rpc('fila_pedido_itens', function (corpo) {
    var c = cena(), L = lojaDe(corpo), num = +corpo.p_pedido;
    var p = M.pedidos(c.dia, L.id).filter(function (x) { return x.numero === num && x.min_pedido <= c.agora; })[0];
    if (!p) return { achou: false };
    var r = M.rng('itens|' + p.id);
    var pontos = ['Ponto: ao ponto', 'Ponto: bem passado', 'Ponto: mal passado'];
    var obs = ['sem cebola', 'sem picles', 'molho à parte', 'cortar ao meio', 'sem tomate'];
    var itens = p.itens.map(function (it) {
      var o = { q: it.qtd, nome: it.nome, obs: null, escolhas: [] };
      if (it.categoria === 'Burgers') {
        o.escolhas.push({ nome: M.escolhe(r, pontos) });
        if (r() < 0.3) o.escolhas.push({ nome: M.escolhe(r, ['Adicional de bacon', 'Adicional de cheddar', 'Pão australiano']), obs: r() < 0.3 ? 'bem crocante' : null });
        if (r() < 0.25) o.obs = M.escolhe(r, obs);
      } else if (it.categoria === 'Bebidas' && /Refrigerante/.test(it.nome)) {
        o.escolhas.push({ nome: M.escolhe(r, ['Cola', 'Cola zero', 'Guaraná', 'Laranja']) });
      }
      return o;
    });
    var recente = c.agora - p.min_pedido < 4;
    return {
      achou: true, endereco: endereco(p), tem_venda: !recente, itens: recente ? [] : itens,
      lido_em: M.hm(c.agora - M.entre(r, 1, 6))
    };
  });

  /* ---------------- tempo de preparo por loja e dia operacional ---------------- */
  /* quando a cena repete o pico de ontem, os dias andam junto, para o "hoje" da tela ser o dia que a fila mostra */
  D.tabela('cozinha_vw_preparo_dia', function () {
    var c = cena(), linhas = [];
    var real = M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(), desl = c.dia < real ? 1 : 0;
    M.lojas.forEach(function (L) {
      for (var i = 9; i >= 0; i--) {
        var dia = M.somaDias(c.dia, -i), corte = i === 0 ? c.agora : 99999;
        var ps = M.pedidos(dia, L.id).filter(function (p) { return !p.cancelado && p.min_pronto <= corte; });
        if (!ps.length) continue;
        var soma = ps.reduce(function (a, p) { return a + (p.min_pronto - p.min_pedido); }, 0);
        linhas.push({ unidade: L.nome, dia_operacional: M.somaDias(dia, desl), pedidos: ps.length, preparo_medio_min: M.arred(soma / ps.length, 1) });
      }
    });
    return linhas;
  });
})();
