/* Tempo de Entrega (demonstracao).
   Simula: rpc delivery_tempo (faixa do iFood, a conta de quanto prometer, motoboys com o aplicativo ligado,
           pedidos na mao e recados da equipe), rpc delivery_sugestao_gravar (novo recado) e
           rpc delivery_sugestao_acao (o dono marca o recado como lido, feito ou descartado).
   Usa a mesma cena, as mesmas faixas e a mesma conta da Fila de Pedidos (telas/fila.js), para as duas
   telas dizerem a mesma coisa sobre a mesma loja. Os recados ficam guardados so neste navegador. */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  var SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  /* faixas de tempo salvas no iFood (regra de exemplo, configuravel) */
  var FAIXAS = [
    { nome: 'Faixa 1', de: 30, ate: 40 }, { nome: 'Faixa 2', de: 40, ate: 50 },
    { nome: 'Faixa 3', de: 50, ate: 60 }, { nome: 'Faixa 4', de: 60, ate: 70 }
  ];
  var LIMITE_POR_MOTOBOY = 5.5;   /* pedidos por motoboy por hora (regra de exemplo, configuravel) */

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
  function p80(v) {
    if (!v.length) return null;
    var s = v.slice().sort(function (a, b) { return a - b; });
    return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.8))]);
  }
  function entrega(p) { return !p.cancelado && p.canal !== 'retirada'; }
  function lojaDe(corpo) { return M.loja(corpo && corpo.p_unidade) || M.lojas[0]; }

  /* ---------------- a cena (mesma regra da Fila) ----------------
     Ate as 5h ainda conta como o dia anterior. Com movimento, acompanha o relogio.
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
      if (ag < PICO) c.dia = M.somaDias(dia, -1);
      c.agora = PICO;
      c.aviso = 'Demonstração: a loja está com pouco movimento agora, então esta tela mostra como estava ' +
        (c.dia === M.hoje() ? 'hoje' : 'ontem') + ' às ' + M.hm(PICO) + ', no pico do jantar. No horário de movimento, ela acompanha o relógio.';
    }
    CENA = c;
    return c;
  }

  /* tempo normal da loja: mediana dos ultimos 7 dias */
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
    REG[k] = { ate_sair: Math.round(mediana(sai)), ate_entregar: Math.round(mediana(ent)), entregas7: mbs };
    return REG[k];
  }

  /* ---------------- a loja agora ---------------- */
  function calc(L) {
    var c = cena(), ag = c.agora, dia = c.dia;
    var reg = regua(L, dia);
    var todos = M.pedidos(dia, L.id).filter(function (p) { return entrega(p) && p.min_pedido <= ag; });
    var abertos = todos.filter(function (p) { return ag < p.min_entrega; });
    var mbs = M.motoboys.filter(function (m) { return m.loja === L.id; });
    var semGps = mbs.length ? mbs[M.hash('gps|' + dia + '|' + L.id) % mbs.length].id : null;
    var base = [L.lat, L.lng];

    /* na rua, por motoboy */
    var porMb = {}, ordemMb = [], gpsDe = {};
    abertos.forEach(function (p) {
      if (ag < p.min_saida || !p.motoboy_id) return;
      if (!porMb[p.motoboy_id]) { porMb[p.motoboy_id] = []; ordemMb.push(p.motoboy_id); }
      porMb[p.motoboy_id].push(p);
    });
    ordemMb.forEach(function (id) {
      var ps = porMb[id].sort(function (a, b) { return a.min_entrega - b.min_entrega; }), p1 = ps[0];
      var f = Math.max(0.05, Math.min(0.98, (ag - p1.min_saida) / Math.max(1, p1.min_entrega - p1.min_saida)));
      gpsDe[id] = id === semGps ? null : [M.arred(L.lat + (p1.lat - L.lat) * f, 5), M.arred(L.lng + (p1.lng - L.lng) * f, 5)];
    });

    /* na loja: em preparo e prontos (pronto que sai em ate 3 min ja tem motoboy, se ele estiver na loja) */
    var naLoja = abertos.filter(function (p) { return ag < p.min_saida; }).map(function (p) {
      var pronto = ag >= p.min_pronto;
      var mb = (pronto && p.min_saida - ag <= 3 && p.motoboy_id && !porMb[p.motoboy_id]) ? p.motoboy_nome : null;
      return { p: p, pronto: pronto, motoboy: mb };
    });

    /* motoboys com o aplicativo ligado (mesma conta da Fila) */
    var ativos = mbs.filter(function (m) {
      return todos.some(function (p) { return p.motoboy_id === m.id && p.min_saida >= ag - 150 && p.min_saida <= ag + 30; });
    });
    var volta = Math.max(8, Math.round(reg.ate_entregar - reg.ate_sair));
    var lista = ativos.map(function (m) {
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
      var pegando = naLoja.some(function (x) { return x.motoboy === m.nome; });
      o.no_patio = true; o.onde = 'na loja'; o.dist = null;
      o.situacao = pegando ? 'pegando pedido' : 'esperando pedido';
      o.faltam = 0; o.livre = 'agora'; o.livre_min = 0;
      return o;
    });
    /* um motoboy com o app ligado mas fora do TrackEat (mostra o caso "sem bolinha") */
    var patio = lista.filter(function (o) { return o.no_patio && o.situacao === 'esperando pedido'; });
    if (lista.length >= 4 && patio.length >= 2) {
      var fora = patio[patio.length - 1];
      fora.faltam = null; fora.livre = null; fora.livre_min = null; fora.situacao = 'fora do TrackEat';
    }
    lista.sort(function (a, b) {
      var x = a.livre_min == null ? 9999 : a.livre_min, y = b.livre_min == null ? 9999 : b.livre_min;
      return (a.no_patio === b.no_patio ? 0 : a.no_patio ? 1 : -1) || x - y;
    });

    /* promessa: pedidos do iFood abertos que ja passaram da hora prometida */
    var passou = abertos.filter(function (p) { return p.canal === 'ifood' && ag - p.min_pedido >= 3 && p.min_pedido + p.prazo_min < ag; });

    /* a conta (mesma regra de exemplo da Fila) */
    var pico = (ag >= 720 && ag <= 810) || (ag >= 1170 && ag <= 1290);
    var atual = FAIXAS[pico ? 1 : 0];
    var prontos = naLoja.filter(function (x) { return x.pronto; }).length;
    var naCozinha = naLoja.length - prontos;
    var naHora = todos.filter(function (p) { return p.min_pedido >= ag - 60; }).length;
    var sug = Math.max(25, Math.min(70, Math.round(reg.ate_entregar + 1.5 * Math.max(0, prontos - 2) + (passou.length ? 4 : 0) + naHora / 6)));
    var alvo = FAIXAS.filter(function (f) { return sug <= f.ate; })[0] || FAIXAS[FAIXAS.length - 1];
    var acao = sug > atual.de + 4 && alvo.de > atual.de ? 'subir' : (sug < atual.de - 8 && alvo.de < atual.de ? 'baixar' : 'fica');
    /* a linha "parados" da conta so soma quando ha pedido alem da hora prometida; senao tudo fica na linha do historico */
    var addCarga = passou.length ? Math.round(1.5 * Math.max(0, prontos - 2) + 4) : 0;
    var addClima = 0;
    var rBase = sug - addCarga - addClima;

    /* ritmo: o que saiu para entrega na ultima hora, por motoboy */
    var saiu1h = todos.filter(function (p) { return p.min_saida > ag - 60 && p.min_saida <= ag; }).length;
    var ppm = lista.length ? M.arred(saiu1h / lista.length, 1) : null;

    /* preparo e o que chegou de verdade nas ultimas 2 horas */
    var prep = todos.filter(function (p) { return p.min_pronto <= ag && p.min_pronto >= ag - 120; }).map(function (p) { return p.min_pronto - p.min_pedido; });
    var real = todos.filter(function (p) { return p.min_entrega <= ag && p.min_entrega >= ag - 120; }).map(function (p) { return p.min_entrega - p.min_pedido; });
    var antigo = abertos.reduce(function (a, p) { return Math.max(a, ag - p.min_pedido); }, 0);

    /* pedidos na mao agora: um por linha, com o motoboy (ou sem motoboy ainda) */
    var pedidos = [];
    naLoja.forEach(function (x) {
      pedidos.push({ entregador: x.motoboy, pedido: '#' + x.p.numero, etapa: x.pronto ? 'pronto no balcão' : 'na cozinha', entrou: M.hm(x.p.min_pedido), min: ag - x.p.min_pedido });
    });
    ordemMb.forEach(function (id) {
      porMb[id].forEach(function (p, i) {
        pedidos.push({ entregador: p.motoboy_nome, pedido: '#' + p.numero, etapa: (i === 0 && ag >= p.min_entrega - 2) ? 'chegando no cliente' : 'na rua', entrou: M.hm(p.min_pedido), min: ag - p.min_pedido });
      });
    });
    pedidos.sort(function (a, b) { return b.min - a.min; });

    /* motivo da decisao, em uma frase */
    var motivo;
    if (acao === 'subir') motivo = 'Entraram ' + naHora + ' pedidos na última hora' + (prontos > 2 ? ' e ' + prontos + ' estão prontos esperando motoboy' : '') + (passou.length ? '; ' + passou.length + ' já passaram da hora prometida' : '');
    else if (acao === 'baixar') motivo = 'Movimento fraco: ' + naHora + ' pedido' + (naHora === 1 ? '' : 's') + ' na última hora e a entrega desta loja está levando ' + reg.ate_entregar + ' min';
    else motivo = 'Com ' + naHora + ' pedido' + (naHora === 1 ? '' : 's') + ' na última hora e ' + lista.length + ' motoboy' + (lista.length === 1 ? '' : 's') + ' na rua, a entrega cabe na ' + atual.nome + ' (' + atual.de + '–' + atual.ate + ' min)';

    var rc = M.rng('chuva|' + dia + '|' + L.id);
    return {
      agora: M.hm(ag),
      agora_dia: SEMANA[M.diaSemana(dia)] + ', ' + M.br(dia) + ' · ' + M.hm(ag),
      aviso: c.aviso,
      dia_semana: SEMANA[M.diaSemana(dia)],
      turno: ag < 15 * 60 ? 'almoço' : (ag < 18 * 60 ? 'meio da tarde' : 'jantar'),
      loja_status: 'aberta', loja_horario: L.abre + ' às ' + L.fecha, loja_status_ha_min: 0,
      cego: false, cego_motivo: null, cor: acao === 'subir' ? 'vermelho' : acao === 'baixar' ? 'azul' : 'verde',

      prometido: atual.de, sugerido: sug, acao: acao, motivo: motivo,
      preset_atual: atual.nome, preset_sugerido: acao === 'fica' ? null : alvo.nome,
      preset_sugerido_de: alvo.de, preset_sugerido_ate: alvo.ate,
      presets: FAIXAS.map(function (f) { return { nome: f.nome, de: f.de, ate: f.ate }; }),

      clima: 'seco', chuva_mm: 0, chuva_prob: M.entre(rc, 5, 35),
      por_motoboy: ppm, limite_por_motoboy: LIMITE_POR_MOTOBOY,
      motoboys: lista.length, pedidos_hora: naHora,
      prontos_sem_motoboy: prontos, esperando_cozinha: naCozinha,
      mais_antigo_min: antigo, parados: passou.length,
      parados_fonte: 'além da hora prometida', gw_atraso_min: null,
      preparo_p80: p80(prep) || 0,

      regua_base: rBase, regua_add_clima: addClima, regua_add_carga: addCarga,
      real_p80: p80(real), real_n: real.length, real_fonte: real.length ? 'TrackEat' : null,

      motoboys_lista: lista,
      motoboys_regua: { ida_min: Math.round(reg.ate_entregar - reg.ate_sair), entre_min: 8, volta_min: volta, amostra: reg.entregas7, dias: 7 },
      pedidos: pedidos
    };
  }

  /* ---------------- recados da equipe ---------------- */
  var CHAVE = 'demo_tempo_recados';
  function lerGuardado() {
    try { var g = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (g && g.novos && g.status) return g; } catch (e) {}
    return { novos: [], status: {} };
  }
  function guardar(g) { try { localStorage.setItem(CHAVE, JSON.stringify(g)); } catch (e) {} }
  var MEMORIA = null;   /* se o navegador nao deixar guardar, fica so nesta aba */
  function guardado() { if (!MEMORIA) MEMORIA = lerGuardado(); return MEMORIA; }

  var MODELOS = [
    { texto: 'A tela conta motoboy que já foi embora do turno.', status: 'feito', resposta: 'Ajustado: agora só conta quem está com o aplicativo ligado nos últimos 30 minutos.' },
    { texto: 'Quando começa a chover a faixa demora para subir aqui na tela.', status: 'lido', resposta: null },
    { texto: 'Seria bom mostrar quantos pedidos de retirada estão esperando no balcão.', status: 'novo', resposta: null },
    { texto: 'O apito está alto demais no tablet do balcão.', status: 'descartado', resposta: 'O volume é o do tablet: dá para baixar nas configurações dele.' },
    { texto: 'Mostrar a hora prometida do pedido mais atrasado aqui em cima ajudaria.', status: 'novo', resposta: null }
  ];
  function semente(L) {
    var r = M.rng('recados|' + L.id), gente = M.equipe.filter(function (p) { return p.loja === L.id; });
    var qtd = M.entre(r, 2, 4), lista = [];
    var ordem = MODELOS.map(function (m, i) { return { m: m, i: i, k: r() }; }).sort(function (a, b) { return a.k - b.k; }).slice(0, qtd);
    var ja = {};
    ordem.forEach(function (x, n) {
      var quem = '';
      for (var t = 0; t < 10 && gente.length; t++) { quem = M.escolhe(r, gente).apelido; if (!ja[quem]) break; }
      ja[quem] = 1;
      var diasAtras = M.entre(r, 1, 18) + n;
      lista.push({
        id: 1000 + M.lojas.indexOf(L) * 100 + x.i, unidade: L.nome, quem: r() < 0.15 ? '' : quem,
        texto: x.m.texto, status: x.m.status, resposta: x.m.resposta,
        em: M.ts(M.dia(-diasAtras), M.entre(r, 11 * 60, 23 * 60))
      });
    });
    return lista;
  }
  function quando(iso) { return M.br(iso.slice(0, 10)) + ' às ' + iso.slice(11, 16); }
  function recados(L) {
    var g = guardado();
    var todos = semente(L).concat(g.novos.filter(function (s) { return s.unidade === L.nome; }));
    var limite = M.dia(-21);
    return todos.filter(function (s) { return s.em.slice(0, 10) >= limite; })
      .map(function (s) {
        return { id: s.id, quem: s.quem, quando: quando(s.em), status: g.status[s.id] || s.status, texto: s.texto, resposta: s.resposta || null, _em: s.em };
      })
      .sort(function (a, b) { return a._em < b._em ? 1 : -1; })
      .map(function (s) { delete s._em; return s; });
  }

  /* ---------------- portas ---------------- */
  D.rpc('delivery_tempo', function (corpo, ctx) {
    var L = lojaDe(corpo);
    var d = calc(L);
    d.sugestoes = recados(L);
    d.sou_dono = !!ctx.admin;
    return d;
  });

  D.rpc('delivery_sugestao_gravar', function (corpo) {
    var L = lojaDe(corpo), txt = String(corpo.p_texto || '').trim();
    if (txt.length < 5) return { ok: false, erro: 'Escreva pelo menos uma frase.' };
    var g = guardado(), id = 5000 + g.novos.length + 1;
    g.novos.push({ id: id, unidade: L.nome, quem: String(corpo.p_quem || '').trim().slice(0, 40), texto: txt.slice(0, 800), status: 'novo', resposta: null, em: M.agoraISO() });
    guardar(g);
    return { ok: true, id: id };
  });

  D.rpc('delivery_sugestao_acao', function (corpo, ctx) {
    if (!ctx.admin) return { ok: false, erro: 'Só o dono muda o andamento dos recados.' };
    var st = String(corpo.p_status || '');
    if (['novo', 'lido', 'feito', 'descartado'].indexOf(st) < 0) return { ok: false, erro: 'Andamento desconhecido.' };
    var g = guardado();
    g.status[corpo.p_id] = st;
    guardar(g);
    return { ok: true };
  });
})();
