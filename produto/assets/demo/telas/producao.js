/* Central da Producao (demonstracao). Tela: producao/index.html.
   Simula a rpc producao_consulta (p_cred, p_acao, p_dados):
     painel     -> { plano:[...], hoje:[...], vencendo:[...], historico:[...] }
                   plano: id, unidade, item, quantidade (meta do dia), medida, feito (soma lancada hoje)
                   hoje: lancamentos de hoje (id, unidade, turno, item, quantidade, medida, validade_ate, obs, lancado_por)
                   vencendo: lotes com validade entre hoje e daqui a 2 dias
                   historico: total por dia, loja e item dos ultimos 14 dias (sem hoje), em dias inteiros ate cerca de 60 linhas
     lancar, apagar, plano_add, plano_del -> { ok:true }
   Preparos de hamburgueria inventados. As lojas vem do config.js; o que ja foi feito hoje depende da hora.
   O que se grava na tela fica so neste navegador (localStorage, prefixo demo_producao_). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* plano fixo: item, meta na loja principal, medida, partes do dia [turno, hora, fracao] */
  var PLANO = [
    ['Hambúrguer moldado 160 g', 160, 'un', [['Manhã', '09:40', 0.6], ['Tarde', '15:20', 0.4]]],
    ['Alface higienizada', 6, 'bandeja', [['Manhã', '10:10', 1]]],
    ['Tomate fatiado', 4, 'bandeja', [['Manhã', '10:30', 0.5], ['Jantar', '17:50', 0.5]]],
    ['Maionese da casa', 3, 'kg', [['Tarde', '14:30', 1]]],
    ['Cheddar cremoso', 2, 'kg', [['Jantar', '18:10', 1]]],
    ['Cebola caramelizada', 1.5, 'kg', [['Almoço', '11:40', 1]]]
  ];
  /* preparos de tempos em tempos (fora do plano fixo): item, quantidade, medida, a cada N dias, validade em dias, turno, hora */
  var PERIODICOS = [
    ['Molho barbecue da casa', 2, 'L', 3, 5, 'Tarde', '15:00'],
    ['Picles de pepino', 1.5, 'kg', 5, 7, 'Manhã', '10:50'],
    ['Farofa de bacon', 1, 'kg', 4, 4, 'Tarde', '16:00']
  ];
  var OBS = ['segundo lote do dia', 'lote menor: acabou o insumo, completar no próximo turno', 'conferido pelo líder do turno', 'temperatura conferida antes de guardar'];
  /* quanto cada loja costuma lancar do que produz (as lojas novas ainda esquecem de lancar) */
  var ADESAO = [1, 0.7, 0.55, 0.6, 0.6, 0.6];
  var INTEIRO = { un: 1, porção: 1, bandeja: 1 };

  /* ---------------- guardado so neste navegador ---------------- */
  var MEM = {};
  function ler(k, padrao) {
    try { var v = localStorage.getItem('demo_producao_' + k); if (v) return JSON.parse(v); } catch (e) {}
    return MEM[k] != null ? MEM[k] : padrao;
  }
  function gravar(k, v) { MEM[k] = v; try { localStorage.setItem('demo_producao_' + k, JSON.stringify(v)); } catch (e) {} }
  function proximoId() { var n = ler('seq', 0) + 1; gravar('seq', n); return 900000 + n; }

  /* ---------------- ajudantes ---------------- */
  function chave(unidade, item) { return String(unidade || '').trim().toLowerCase() + '|' + String(item || '').trim().toLowerCase(); }
  function arredMedida(v, medida) { return INTEIRO[medida] ? Math.max(1, Math.round(v)) : Math.max(0.1, M.arred(v, 1)); }
  function idDe(txt) { return 100000 + (M.hash(txt) % 800000); }
  function lojaIdx(unidade) { for (var i = 0; i < M.lojas.length; i++) if (M.lojas[i].nome === unidade) return i; return 99; }
  function numDia(iso) { return Math.round(Date.parse(iso + 'T12:00:00Z') / 864e5); }
  function quemDaLoja(L, semente) {
    var gente = M.equipe.filter(function (p) { return p.loja === L.id && p.setor === 'Cozinha'; });
    if (!gente.length) return 'Equipe da cozinha';
    var p = gente[M.hash(semente) % gente.length];
    var partes = p.nome.split(' ');
    return partes[0] + ' ' + partes[partes.length - 1].charAt(0) + '.';
  }
  function metaDe(base, L, medida) {
    var f = 0.5 + 0.5 * (L.peso || 0.5);
    return base >= 40 ? Math.round(base * f / 10) * 10 : INTEIRO[medida] ? Math.max(1, Math.round(base * f)) : Math.max(0.5, Math.round(base * f * 2) / 2);
  }

  /* plano fixo de cada loja */
  function planoBase() {
    var l = [];
    M.lojas.forEach(function (L, li) {
      PLANO.forEach(function (p, pi) {
        if (li === 2 && p[0] === 'Cebola caramelizada') return;
        l.push({ id: li * 100 + pi + 1, unidade: L.nome, item: p[0], quantidade: li === 1 && p[0] === 'Cebola caramelizada' ? null : metaDe(p[1], L, p[2]), medida: p[2], _loja: L, _partes: p[3] });
      });
    });
    return l;
  }

  /* lancamentos inventados de um dia (hoje: so o que ja passou da hora) */
  function lancamentosDoDia(dia, plano) {
    var hoje = dia === M.hoje(), agora = M.minutosAgora(), l = [];
    M.lojas.forEach(function (L, li) {
      var adesao = ADESAO[li % ADESAO.length];
      var atraso = (li * 23) % 45;   /* cada loja num ritmo */
      plano.filter(function (p) { return p._loja === L; }).forEach(function (p, pi) {
        var r = M.rng('prod|' + L.id + '|' + p.item + '|' + dia);
        if (!hoje && r() > adesao) return;
        var meta = p.quantidade || metaDe(1.5, L, p.medida);
        var curto = M.hash(L.id + p.item + dia) % 7 === 0;   /* de vez em quando fica abaixo da meta */
        var soma = 0;
        p._partes.forEach(function (pt, k) {
          var min = M.minDe(pt[1]) + atraso + Math.round((r() - 0.5) * 20);
          if (hoje && min > agora) return;
          var ultima = k === p._partes.length - 1;
          var q = ultima ? meta - soma + (curto ? -meta * 0.3 : meta * r() * 0.06) : meta * pt[2] * (0.95 + r() * 0.1);
          q = arredMedida(q, p.medida);
          soma += q;
          l.push({
            id: idDe('p|' + L.id + '|' + p.item + '|' + dia + '|' + k), data: dia, unidade: L.nome, turno: pt[0], item: p.item,
            quantidade: q, medida: p.medida, validade_ate: null,
            obs: ultima && curto ? OBS[1] : k > 0 && r() < 0.35 ? OBS[0] : (r() < 0.12 ? OBS[2] : ''),
            lancado_por: quemDaLoja(L, 'p' + dia + pt[0] + li), _ord: min
          });
        });
      });
      PERIODICOS.forEach(function (x, xi) {
        if ((numDia(dia) + li + xi) % x[3] !== 0) return;
        var min = M.minDe(x[6]) + atraso;
        if (hoje && min > agora) return;
        var r = M.rng('per|' + L.id + '|' + x[0] + '|' + dia);
        l.push({
          id: idDe('q|' + L.id + '|' + x[0] + '|' + dia), data: dia, unidade: L.nome, turno: x[5], item: x[0],
          quantidade: arredMedida(metaDe(x[1], L, x[2]) * (0.9 + r() * 0.3), x[2]), medida: x[2],
          validade_ate: M.somaDias(dia, x[4]), obs: r() < 0.3 ? OBS[3] : '',
          lancado_por: quemDaLoja(L, 'q' + dia + li), _ord: min
        });
      });
    });
    return l;
  }

  /* ---------------- base + o que a pessoa mudou nesta demonstracao ---------------- */
  function estado() {
    var planoDel = ler('plano_del', []), lancDel = ler('lanc_del', []);
    var pb = planoBase();
    var plano = pb.concat(ler('plano', [])).filter(function (p) { return planoDel.indexOf(p.id) < 0; });
    var lanc = [];
    for (var k = 0; k <= 14; k++) lanc = lanc.concat(lancamentosDoDia(M.dia(-k), pb));
    lanc = lanc.concat(ler('lanc', [])).filter(function (x) { return lancDel.indexOf(x.id) < 0; });
    return { plano: plano, lanc: lanc };
  }
  function limpa(x) { var o = {}; for (var k in x) if (k.charAt(0) !== '_') o[k] = x[k]; return o; }

  function painel() {
    var e = estado(), hoje = M.hoje(), ate2 = M.dia(2), de14 = M.dia(-14);
    var feito = {};
    e.lanc.forEach(function (x) { if (x.data === hoje) { var k = chave(x.unidade, x.item); feito[k] = (feito[k] || 0) + Number(x.quantidade || 0); } });
    var plano = e.plano.map(function (p) {
      var o = limpa(p);
      o.feito = M.arred(feito[chave(p.unidade, p.item)] || 0, 2);
      return o;
    }).sort(function (a, b) { return lojaIdx(a.unidade) - lojaIdx(b.unidade) || a.id - b.id; });

    var deHoje = e.lanc.filter(function (x) { return x.data === hoje; })
      .sort(function (a, b) { return (b._ord || 0) - (a._ord || 0); }).map(limpa);

    var vencendo = e.lanc.filter(function (x) { return x.validade_ate && x.validade_ate >= hoje && x.validade_ate <= ate2; })
      .sort(function (a, b) { return a.validade_ate < b.validade_ate ? -1 : a.validade_ate > b.validade_ate ? 1 : lojaIdx(a.unidade) - lojaIdx(b.unidade); })
      .map(function (x) { return { id: x.id, validade_ate: x.validade_ate, unidade: x.unidade, item: x.item, quantidade: x.quantidade, medida: x.medida, data: x.data }; });

    var soma = {};
    e.lanc.forEach(function (x) {
      if (x.data >= hoje || x.data < de14) return;
      var k = x.data + '|' + x.unidade + '|' + x.item + '|' + (x.medida || '');
      if (!soma[k]) soma[k] = { data: x.data, unidade: x.unidade, item: x.item, quantidade: 0, medida: x.medida };
      soma[k].quantidade = M.arred(soma[k].quantidade + Number(x.quantidade || 0), 2);
    });
    var ordenado = Object.keys(soma).map(function (k) { return soma[k]; }).sort(function (a, b) {
      return a.data !== b.data ? (a.data < b.data ? 1 : -1) : lojaIdx(a.unidade) - lojaIdx(b.unidade) || a.item.localeCompare(b.item, 'pt');
    });
    /* dias inteiros ate cerca de 60 linhas: nunca corta um dia ao meio */
    var historico = [];
    for (var i = 0; i < ordenado.length; ) {
      var j = i; while (j < ordenado.length && ordenado[j].data === ordenado[i].data) j++;
      if (historico.length && historico.length + (j - i) > 60) break;
      historico = historico.concat(ordenado.slice(i, j)); i = j;
    }

    return { plano: plano, hoje: deHoje, vencendo: vencendo, historico: historico };
  }

  function exige(d, campos) {
    campos.forEach(function (c) { if (d[c] == null || String(d[c]).trim() === '') throw D.erro(400, 'Faltou preencher: ' + c, 'P0001'); });
  }

  D.rpc('producao_consulta', function (b, ctx) {
    var acao = b.p_acao, d = b.p_dados || {};
    switch (acao) {
      case 'painel':
        return painel();

      case 'lancar': {
        exige(d, ['unidade', 'item', 'quantidade']);
        var q = Number(d.quantidade);
        if (!(q > 0)) throw D.erro(400, 'A quantidade tem que ser maior que zero', 'P0001');
        var l = ler('lanc', []);
        l.push({ id: proximoId(), data: d.data || M.hoje(), unidade: d.unidade, turno: d.turno || '', item: String(d.item).trim(), quantidade: q, medida: d.medida || 'un', validade_ate: d.validade_ate || null, obs: d.obs || '', lancado_por: d.lancado_por || ctx.nome, _ord: 5000 + Date.now() / 1e9 });
        gravar('lanc', l);
        return { ok: true };
      }
      case 'apagar': {
        var id = Number(d.id);
        gravar('lanc', ler('lanc', []).filter(function (x) { return x.id !== id; }));
        var del = ler('lanc_del', []); if (del.indexOf(id) < 0) del.push(id); gravar('lanc_del', del);
        return { ok: true };
      }
      case 'plano_add': {
        exige(d, ['unidade', 'item']);
        var ja = estado().plano.some(function (p) { return chave(p.unidade, p.item) === chave(d.unidade, d.item); });
        if (ja) throw D.erro(400, 'Este item já está no plano desta loja', 'P0001');
        var pl = ler('plano', []);
        pl.push({ id: proximoId(), unidade: d.unidade, item: String(d.item).trim(), quantidade: d.quantidade === '' || d.quantidade == null ? null : Number(d.quantidade), medida: d.medida || 'un' });
        gravar('plano', pl);
        return { ok: true };
      }
      case 'plano_del': {
        var idp = Number(d.id);
        gravar('plano', ler('plano', []).filter(function (p) { return p.id !== idp; }));
        var dp = ler('plano_del', []); if (dp.indexOf(idp) < 0) dp.push(idp); gravar('plano_del', dp);
        return { ok: true };
      }
    }
    throw D.erro(400, 'Ação não simulada na demonstração: ' + acao, 'P0001');
  });
})();
