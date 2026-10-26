/* Central Cozinha (demonstracao). Tela: cozinha/index.html.
   Simula:
     rpc cozinha_ao_vivo    erros do dia da cozinha (hoje ou ontem), o que chegou como erro mas nao conta,
                            avaliacoes ruins com comentario dos ultimos 7 dias e a ultima novidade de cada fonte;
     rpc cozinha_pausados   itens fora do ar no iFood (com a resposta da loja) e itens desligados no tablet da mesa;
     rpc cozinha_itens_top  quantidade vendida por item e loja nos ultimos dias (chamada por GET, ?p_dias=7);
     tabela cozinha_vw_preparo_dia  tempo medio de preparo por loja e dia operacional.
   Os cancelamentos do iFood (ifood_fato_cancelamento e ifood_dim_loja) vem de telas/ifood.js, carregado antes
   deste arquivo; se ele faltar, aqui ha uma versao simples das duas tabelas.
   Erros usam o mesmo sorteio da TV da Cozinha e as pausas o mesmo sorteio de Produtos pausados e Resolver hoje,
   para as telas baterem entre si. Tudo sai de MUNDO; nada sai deste navegador. */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG || {};

  /* ---------------- relogio: o dia da cozinha vai das 6h as 6h ---------------- */
  function agoraReal() { return M.minutosAgora(); }
  function diaOp() { return agoraReal() < 360 ? M.dia(-1) : M.hoje(); }
  function agoraOp() { var r = agoraReal(); return r < 360 ? r + 1440 : r; }
  function tsMs(dia, min) { return Date.parse(M.ts(dia, min)); }
  function escolheP(lista, x) {   /* escolha com peso usando um numero ja sorteado (0..1) */
    var tot = 0, i; for (i = 0; i < lista.length; i++) tot += lista[i].peso;
    var y = x * tot;
    for (i = 0; i < lista.length; i++) { y -= lista[i].peso; if (y <= 0) return lista[i]; }
    return lista[lista.length - 1];
  }
  function um(lista, x) { return lista[Math.min(lista.length - 1, Math.floor(x * lista.length))]; }
  function sorteios(r, n) { var a = []; for (var i = 0; i < n; i++) a.push(r()); return a; }

  /* ---------------- marcas virtuais (as mesmas da TV da Cozinha) ---------------- */
  var BASE = C.marca || 'Burger Modelo';
  var MARCAS_TV = [BASE, BASE + ' Veggie', BASE + ' Smash', BASE + ' Marmitas'];
  function marcaIdx(p) { var h = M.hash('marca|' + p.id) % 10; return h < 5 ? 0 : h < 7 ? 1 : h < 9 ? 2 : 3; }
  function marcaDe(p, L, semVeggie) {
    var i = marcaIdx(p); if (semVeggie && i === 1) i = 0;
    var m = MARCAS_TV[i] + ' - ' + L.nome;
    return M.hash('caixa|' + p.id) % 3 === 0 ? m.toUpperCase() : m;
  }

  /* =====================================================================
     1. ERROS DO DIA — mesmo sorteio da TV da Cozinha (telas/tv.js)
     ===================================================================== */
  var TIPOS = [
    { fam: 'sacola', setor: 'montagem', titulo: 'Faltou item no pedido', item: 'acomp', peso: 6,
      disse: ['Faltou {item} no meu pedido.', 'Veio sem {item}.', 'Paguei {item} e não veio.'] },
    { fam: 'sacola', setor: 'montagem', titulo: 'Faltou adicional', item: 'adicional', peso: 3,
      disse: ['Paguei {item} e não veio.', 'Pedi {item} e não mandaram.'] },
    { fam: 'errado', setor: 'montagem', titulo: 'Lanche trocado', item: 'burger', peso: 2,
      disse: ['Pedi {item} e veio outro lanche.', 'Veio o lanche de outro pedido.'] },
    { fam: 'errado', setor: 'cozinha', titulo: 'Observação do pedido não atendida', item: 'burger', peso: 3,
      disse: ['Pedi sem cebola e veio com cebola.', 'Pedi sem tomate e veio com tomate.', 'Pedi sem picles e veio com picles.'] },
    { fam: 'ponto', setor: 'cozinha', titulo: 'Carne crua por dentro', item: 'carne', qual: true, peso: 2,
      disse: ['O hambúrguer estava cru no meio.', 'A carne veio crua por dentro.'] },
    { fam: 'ponto', setor: 'cozinha', titulo: 'Carne passou do ponto', item: 'carne', qual: true, peso: 2,
      disse: ['Pedi ao ponto e veio bem passado.', 'A carne estava seca e queimada.'] },
    { fam: 'sabor', setor: 'cozinha', titulo: 'Sal demais', item: 'burger', qual: true, peso: 1,
      disse: ['Estava muito salgado.', 'O molho estava salgado demais.'] },
    { fam: 'sabor', setor: 'cozinha', titulo: 'Porção pequena', item: 'acomp', peso: 1,
      disse: ['A porção de {item} veio pela metade.'] },
    { fam: 'embalagem', setor: 'montagem', titulo: 'Embalagem vazou', item: 'liquido', peso: 2,
      disse: ['Chegou com {item} vazando na sacola.', 'A embalagem abriu e sujou tudo.'] },
    { fam: 'frio', setor: 'expedição', titulo: 'Pedido chegou frio', item: 'burger', qual: true, peso: 2,
      disse: ['Chegou tudo frio.', 'A batata chegou fria e murcha.'] },
    { fam: 'grave', setor: 'cozinha', titulo: 'Cabelo no lanche', item: 'burger', qual: true, grave: true, peso: 0.4,
      disse: ['Achei um fio de cabelo no lanche.'] },
    { fam: 'acabou', setor: 'cozinha', titulo: 'Item acabou sem pausar no iFood', item: 'qualquer', peso: 1,
      disse: ['A loja avisou depois que {item} tinha acabado.'] }
  ];
  var FONTES = [{ v: 'chat iFood', peso: 6 }, { v: 'negociação iFood', peso: 3 }, { v: 'Gestor Web (cancelamento)', peso: 1 }];
  var RESOLVEU = [{ v: 'Reembolso parcial no iFood', peso: 4 }, { v: 'Reembolso total no iFood', peso: 2 }, { v: 'Reenviou o item', peso: 2 },
    { v: 'Cupom para o próximo pedido', peso: 2 }, { v: 'SEM REGISTRO da solução', peso: 2 }];
  var FORA = [
    { nao_conta: 'Reclamação repetida (já está na lista)', titulo: 'Faltou item no pedido', disse: 'Ainda estou esperando o item que faltou.' },
    { nao_conta: 'Pedido do cliente, não é erro', titulo: 'Observação do cliente', disse: 'Por favor, não esqueçam os guardanapos.' },
    { nao_conta: 'Assunto de entrega ou endereço', titulo: 'Entrega', disse: 'O entregador não achou o prédio.' },
    { nao_conta: 'Pedido não chegou (assunto de entrega)', titulo: 'Pedido não chegou', disse: 'Meu pedido ainda não chegou.' },
    { nao_conta: 'Erro do próprio cliente', titulo: 'Pediu na loja errada', disse: 'Pedi da unidade errada, foi engano meu.' },
    { nao_conta: 'Mesmo pedido registrado em outra loja', titulo: 'Pedido duplicado', disse: '' }
  ];

  function cardapioDe(cat, x) {
    var l = M.cardapio.filter(function (c) { return cat.indexOf(c.categoria) >= 0; });
    return l.length ? um(l, x).nome : M.cardapio[0].nome;
  }
  function itemDe(p, tipo, x) {
    var its = (p && p.itens) || [];
    function acha(cats) { for (var i = 0; i < its.length; i++) if (cats.indexOf(its[i].categoria) >= 0) return its[i].nome; return null; }
    if (tipo.item === 'burger') return acha(['Burgers']) || cardapioDe(['Burgers'], x);
    if (tipo.item === 'carne') {
      for (var c = 0; c < its.length; c++) if (its[c].categoria === 'Burgers' && !/veggie|frango|salada/i.test(its[c].nome)) return its[c].nome;
      return um(M.cardapio.filter(function (k) { return k.categoria === 'Burgers' && !/veggie|frango|salada/i.test(k.nome); }), x).nome;
    }
    if (tipo.item === 'liquido') {
      for (var b = 0; b < its.length; b++) if (/milkshake|suco|refrigerante/i.test(its[b].nome)) return its[b].nome;
      return um(M.cardapio.filter(function (k) { return /milkshake|suco/i.test(k.nome); }), x).nome;
    }
    if (tipo.item === 'acomp') return acha(['Acompanhamentos', 'Sobremesas']) || cardapioDe(['Acompanhamentos'], x);
    if (tipo.item === 'adicional') return cardapioDe(['Adicionais'], x);
    if (tipo.item === 'bebida') return acha(['Bebidas']) || cardapioDe(['Bebidas'], x);
    return its.length ? its[0].nome : cardapioDe(['Burgers', 'Acompanhamentos'], x);
  }
  function minutoDoErro(x, y) {   /* reclamacao chega no almoco ou no jantar */
    return x < 0.35 ? 12 * 60 + 10 + Math.round(y * 170) : 18 * 60 + 40 + Math.round(y * 290);
  }
  function pedidoPerto(ped, min, x) {   /* um pedido feito entre 30 min e 2h30 antes da reclamacao */
    var c = ped.filter(function (p) { return p.min_pedido <= min - 30 && p.min_pedido >= min - 150; });
    return c.length ? um(c, x) : null;
  }
  function montaErro(L, dia, ped, s, suf, minFixo) {
    var tipo = escolheP(TIPOS, s[0]);
    var min = minFixo != null ? minFixo : minutoDoErro(s[1], s[2]);
    var p = pedidoPerto(ped, min, s[3]);
    var pedido = p && s[4] > 0.07 ? (p.numero_ifood || String(p.numero)) : null;
    var marca = p && s[5] > 0.06 ? marcaDe(p, L, tipo.fam === 'ponto') : '';
    var item = itemDe(p, tipo, s[6]);
    var disse = s[7] < 0.12 ? '' : um(tipo.disse, s[8]).replace('{item}', String(item).toLowerCase());
    return {
      k: L.id + '-' + dia + '-' + suf, min: min, ts: tsMs(dia, min), hora: M.hm(min), dia: dia,
      setor: tipo.setor, grave: !!tipo.grave, titulo: tipo.titulo, fam: tipo.fam,
      marca: marca, pedido: pedido, item: item, disse: disse,
      fontes: tipo.fam === 'acabou' ? 'Gestor Web (cancelamento)' : escolheP(FONTES, s[10]).v,
      resolveu: escolheP(RESOLVEU, s[11]).v
    };
  }

  /* erro "ao vivo" de hoje: mesma gaveta do navegador da TV (demo_tv_vivo), para as duas telas mostrarem o mesmo */
  var VIVO = null;
  function lerVivo() {
    if (VIVO) return VIVO;
    try { VIVO = JSON.parse(localStorage.getItem('demo_tv_vivo') || '{}') || {}; } catch (e) { VIVO = {}; }
    return VIVO;
  }
  function vivos(L, dia, criar) {
    if (dia !== diaOp()) return [];
    var v = lerVivo(), k = L.id + '|' + dia, l = v[k] || [], ag = agoraOp();
    if (criar && ag >= 11 * 60 + 40 && ag <= 23 * 60 + 50 && (!l.length || (l.length < 2 && ag - l[l.length - 1] >= 40))) {
      l.push(ag - (l.length ? 1 : 4 + 6 * Math.max(0, M.lojas.indexOf(L))));   /* cada loja num minuto diferente */
      v[k] = l;
      try { localStorage.setItem('demo_tv_vivo', JSON.stringify(v)); } catch (e) {}
    }
    return l;
  }

  /* a mesma frase do cliente nao se repete no mesmo dia: troca pela outra frase do tipo (ou fica sem frase) */
  function variaDisse(e, lista) {
    var igual = function (d) { return lista.some(function (x) { return x !== e && x.disse === d; }); };
    if (!e.disse || !igual(e.disse)) return;
    var t = TIPOS.filter(function (x) { return x.titulo === e.titulo; })[0];
    var alt = (t ? t.disse : []).map(function (d) { return d.replace('{item}', String(e.item).toLowerCase()); })
      .filter(function (d) { return !igual(d); });
    e.disse = alt.length ? alt[0] : '';
  }

  var ERR = {};
  function errosDia(L, dia, criar) {
    var hoje = diaOp();
    if (!dia || dia > hoje) return { conta: [], fora: [], exp: [] };
    var k = L.id + '|' + dia;
    if (ERR[k] && dia < hoje) return ERR[k];
    var limite = dia === hoje ? agoraOp() : Infinity;
    var r = M.rng('tv-erros|' + dia + '|' + L.id);
    var dow = M.diaSemana(dia), fat = (dow === 0 || dow === 5 || dow === 6) ? 1.3 : 1;
    var n = Math.max(0, Math.min(6, Math.round(M.normal(r, 2.1 * L.peso * fat, 1.1))));
    var ped = M.pedidos(dia, L.id).filter(function (p) { return !p.cancelado; });
    var conta = [], fora = [], exp = [], i, s;
    for (i = 0; i < n; i++) {
      s = sorteios(r, 12);
      var e = montaErro(L, dia, ped, s, 'f' + i);
      if (e.min <= limite) { variaDisse(e, conta); conta.push(e); }
    }
    var nf = M.pesado(r, [[0, 5], [1, 4], [2, 2]]);
    for (i = 0; i < nf; i++) {
      s = sorteios(r, 5);
      var f = um(FORA, s[0]), fm = minutoDoErro(s[1], s[2]), fp = pedidoPerto(ped, fm, s[3]);
      if (fm <= limite) fora.push({ hora: M.hm(fm), min: fm, nao_conta: f.nao_conta, titulo: f.titulo, disse: f.disse, pedido: fp && s[4] > 0.2 ? (fp.numero_ifood || String(fp.numero)) : null });
    }
    s = sorteios(r, 5);
    if (s[0] < 0.3) {
      var xm = minutoDoErro(s[1], s[2]), xp = pedidoPerto(ped, xm, s[3]);
      if (xm <= limite) exp.push({ k: L.id + '-' + dia + '-x0', min: xm, ts: tsMs(dia, xm), hora: M.hm(xm), dia: dia, setor: 'expedição', grave: false,
        titulo: 'Lanche morno (demora na rota)', item: itemDe(xp, TIPOS[0], s[4]),
        marca: xp ? marcaDe(xp, L) : '', pedido: xp ? (xp.numero_ifood || String(xp.numero)) : null,
        disse: 'O lanche chegou morno, o entregador demorou.', fontes: 'chat iFood', resolveu: 'Cupom para o próximo pedido' });
    }
    vivos(L, dia, !!criar).forEach(function (m, j) {
      /* o erro ao vivo e de um tipo que ainda nao apareceu hoje (sorteia de novo, no maximo 6 vezes) */
      var ev, t = 0;
      do {
        var rv = M.rng('tv-vivo|' + dia + '|' + L.id + '|' + j + (t ? '|' + t : '')), sv = sorteios(rv, 12);
        ev = montaErro(L, dia, ped, sv, 'v' + j, m); t++;
      } while (t < 6 && conta.some(function (x) { return x.titulo === ev.titulo; }));
      variaDisse(ev, conta);
      ev.resolveu = 'SEM REGISTRO da solução';
      ev.fontes = 'chat iFood';
      conta.push(ev);
    });
    var porMin = function (a, b) { return a.min - b.min; };
    conta.sort(porMin); fora.sort(porMin); exp.sort(porMin);
    var res = { conta: conta, fora: fora, exp: exp };
    if (dia < hoje) ERR[k] = res;
    return res;
  }

  /* ---------------- avaliacoes do iFood (as notas que ja estao em MUNDO.pedidos) ---------------- */
  var AV = {};
  function notasDoDia(L, dia) {   /* avaliacoes dos pedidos feitos neste dia; o iFood libera 1 ou 2 dias depois */
    var k = L.id + '|' + dia;
    if (AV[k]) return AV[k];
    var r = M.pedidos(dia, L.id).filter(function (p) { return p.nota != null && !p.cancelado; }).map(function (p) {
      return { p: p, nota: p.nota, disse: p.comentario || '', avaliou: M.somaDias(p.dia, M.hash('av|' + p.id) % 10 < 7 ? 1 : 2), marca: marcaDe(p, L) };
    });
    if (dia < M.hoje()) AV[k] = r;
    return r;
  }
  function chegadas(L, de, ate) {   /* avaliacoes que o iFood liberou entre de e ate */
    var r = [];
    M.intervalo(M.somaDias(de, -2), ate).forEach(function (d) {
      notasDoDia(L, d).forEach(function (a) { if (a.avaliou >= de && a.avaliou <= ate && a.avaliou <= M.hoje()) r.push(a); });
    });
    return r;
  }
  /* nome e setor da reclamacao a partir das palavras do cliente */
  function temaAval(t) {
    t = String(t || '');
    if (/frio|morna/i.test(t)) return { titulo: 'Chegou frio', setor: 'expedição' };
    if (/errado/i.test(t)) return { titulo: 'Pedido errado', setor: 'cozinha' };
    if (/faltou/i.test(t)) return { titulo: 'Faltou item', setor: 'montagem' };
    if (/cru|salgad|queimad|sabor/i.test(t)) return { titulo: 'Comida ruim', setor: 'cozinha' };
    if (/demor|motoboy|endereço|entregador/i.test(t)) return { titulo: 'Entrega', setor: 'entrega' };
    return { titulo: 'Avaliação ruim', setor: 'cozinha' };
  }

  function frescor(ultimaAval) {
    var h = M.hoje(), a = agoraReal();
    return { gestor_web: M.ts(h, a - 2), chat_ifood: M.ts(h, a - 5), negociacao: M.ts(h, a - 38),
             sac: M.ts(M.dia(-1), 20 * 60 + 47), avaliacao: ultimaAval };
  }

  D.rpc('cozinha_ao_vivo', function (b) {
    var d = (b && b.p_dados) || {}, ontem = !!d.ontem;
    var hoje = diaOp(), dia = ontem ? M.somaDias(hoje, -1) : hoje;
    var erros = [], fora = [], avs = [];
    M.lojas.forEach(function (L) {
      var ed = errosDia(L, dia, !ontem);
      ed.conta.concat(ed.exp).forEach(function (e) {
        var pend = /SEM REGISTRO/i.test(e.resolveu || '');
        erros.push({ k: e.k, ts: e.ts, hora: e.hora, loja: L.nome, setor: e.setor, grave: !!e.grave, titulo: e.titulo,
          pedido: e.pedido, marca: e.marca || null, disse: e.disse || '', item: e.item || null,
          pendente: pend, resolveu: pend ? null : e.resolveu, fontes: e.fontes });
      });
      ed.fora.forEach(function (f, i) {
        fora.push({ k: L.id + '-' + dia + '-n' + i, ts: tsMs(dia, f.min), hora: f.hora, loja: L.nome, nao_conta: f.nao_conta,
          titulo: f.titulo, disse: f.disse, pedido: f.pedido });
      });
      /* avaliacoes de 1 a 3 com comentario, chegadas nos ultimos 7 dias */
      chegadas(L, M.somaDias(M.hoje(), -6), M.hoje()).forEach(function (a) {
        if (a.nota > 3 || !a.disse) return;
        var t = temaAval(a.disse);
        if (t.setor === 'entrega') return;   /* reclamacao so de entrega fica nas telas do delivery */
        avs.push({ loja: L.nome, setor: t.setor, grave: a.nota === 1 && t.setor === 'cozinha', dia: M.br(a.avaliou), quando: a.avaliou,
          nota: a.nota, titulo: t.titulo, pedido: a.p.numero_ifood || String(a.p.numero), disse: a.disse, min: a.p.min_pedido });
      });
    });
    erros.sort(function (a, b) { return b.ts - a.ts; });
    fora.sort(function (a, b) { return b.ts - a.ts; });
    avs.sort(function (a, b) { return a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : b.min - a.min; });
    var ultima = avs.length ? avs[0].quando : M.dia(-1);
    return {
      dia: M.br(dia), agora: M.agoraISO(), ontem: ontem,
      erros: erros, fora: fora,
      avaliacoes: avs.map(function (a) { return { loja: a.loja, setor: a.setor, grave: a.grave, dia: a.dia, nota: a.nota, titulo: a.titulo, pedido: a.pedido, disse: a.disse }; }),
      frescor: frescor(ultima)
    };
  });

  /* =====================================================================
     2. ITENS FORA DO AR — mesmo sorteio de Produtos pausados / Resolver hoje (telas/pausados.js),
        com as respostas gravadas na mesma gaveta do navegador (demo_resolver_pausas)
     ===================================================================== */
  var MARCAS_PZ = [C.marca || 'Burger Modelo', 'Smash da Esquina', 'Casa do Frango'];
  function lerLS(k, padrao) { try { var v = localStorage.getItem('demo_resolver_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function hojeOp() { return M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(); }
  function quando(dia, min) { var t = M.ts(dia, min); return M.br(t.slice(0, 10)) + ' ' + t.slice(11, 16); }
  function agoraTxt() { var a = M.agoraISO(); return M.br(a) + ' ' + a.slice(11, 16); }
  function gerente(L) { var g = M.equipe.filter(function (x) { return x.loja === L.id && x.cargo === 'Gerente da loja'; })[0]; return g ? g.apelido : 'Gerência'; }
  function embaralha(r, lista) {
    var l = lista.slice();
    for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; }
    return l;
  }
  var PROVAS = ['Anotação no item: "acabou o estoque, chega amanhã cedo"', 'Anotação no item: "pausado de propósito, saiu do cardápio de inverno"', 'Anotação no item: "faltou embalagem, volta à noite"'];
  function pausasLoja(L, dias) {
    var h = hojeOp(), ag = M.minutosAgora() + (M.minutosAgora() < 300 ? 1440 : 0), linhas = [];
    var r = M.rng('pausas|' + h + '|' + L.id);
    var cands = M.cardapio.filter(function (c) { return c.categoria !== 'Bebidas' || r() < 0.5; });
    var usados = {};
    function pega() { for (var t = 0; t < 40; t++) { var c = M.escolhe(r, cands); if (!usados[c.codigo]) { usados[c.codigo] = 1; return c; } } return cands[0]; }
    function marcasDe() { var n = M.pesado(r, [[1, 50], [2, 35], [3, 15]]); return MARCAS_PZ.slice(0, n); }
    function linha(c, extra) {
      return marcasDe().map(function (mc) {
        var o = { unidade: L.nome, item: c.nome, marca: mc, tipo: c.categoria === 'Adicionais' ? 'Complemento' : 'Item', chave: 'pausado|' + L.id + '|' + c.codigo,
                  resolvido: false, contradito: false, quem: null, o_que: null, em: null, prova: null };
        for (var k in extra) o[k] = extra[k];
        return o;
      });
    }
    var sits = M.escolhe(r, [['SEM', 'RESP', 'VENCIDA'], ['SEM', 'CONTRA', 'RESP'], ['SEM_LONGA', 'SEM', 'RESP', 'VENCIDA'], ['CONTRA', 'SEM']]);
    function inicio(diasAtras) {
      var fim = diasAtras === 0 ? Math.min(ag - 25, 23 * 60) : 23 * 60;
      if (fim < 11 * 60 + 10) { diasAtras = 1; fim = 23 * 60; }
      return M.entre(r, 11 * 60, fim) - diasAtras * 1440;
    }
    sits.forEach(function (s) {
      var c = pega(), longa = s === 'SEM_LONGA' || s === 'VENCIDA';
      var ini = inicio(longa ? M.entre(r, 2, 4) : M.entre(r, 0, 1)), min = ag - ini;
      var depois = function (ate) { return quando(h, ini + M.entre(r, 15, Math.max(16, Math.min(min - 5, ate)))); };
      var ex = { aberta: true, minutos: min, pausou: quando(h, ini), minimo: s === 'SEM_LONGA', voltou: null };
      var quem = gerente(L);
      if (s === 'VENCIDA') { ex.quem = quem; ex.o_que = 'Acabou, vai voltar a vender'; ex.em = depois(90); }
      if (s === 'CONTRA') { ex.quem = quem; ex.o_que = 'Despausei'; ex.em = depois(180); ex.contradito = true; }
      if (s === 'RESP') { ex.quem = quem; ex.o_que = M.escolhe(r, ['Pode excluir do cardápio', 'Acabou, vai voltar a vender']); ex.em = depois(120); ex.resolvido = true;
                          if (r() < 0.6) ex.prova = M.escolhe(r, PROVAS); }
      linhas = linhas.concat(linha(c, ex));
    });
    dias.forEach(function (dia) {
      var rv = M.rng('voltou|' + dia + '|' + L.id), n = M.entre(rv, 1, 2), fim = dia === h ? ag : 23 * 60;
      for (var i = 0; i < n; i++) {
        var ini = M.entre(rv, 11 * 60, 21 * 60), dur = M.entre(rv, 15, 150);
        if (ini + dur > fim) continue;
        var c = pega();
        linhas = linhas.concat(linha(c, { aberta: false, minutos: dur, pausou: quando(dia, ini), voltou: quando(dia, ini + dur), minimo: false }));
      }
    });
    return linhas;
  }

  var MODELOS_TABLET = [['SEM', 'AMBOS', 'VENCIDA', 'RESP', 'ESC'], ['CONTRA', 'SEM', 'ESC', 'RESP'], ['ESC', 'SEM', 'RESP', 'RESP']];
  var PROPOSITO = ['Pausado de proposito: só no fim de semana', 'Pausado de proposito: item só do almoço', 'Item nao existe mais (pode excluir)', 'Acabou, vai voltar a vender'];
  /* dia da ultima leitura do tablet (a leitura roda as 06:10; antes disso vale a de ontem) */
  function diaTablet() { var h = hojeOp(); return (h === M.hoje() && M.minutosAgora() < 6 * 60 + 20) ? M.somaDias(h, -1) : h; }
  function tabletLoja(L, idx, atras) {
    var h = diaTablet(), r = M.rng('pz-tablet|' + h + '|' + L.id), out = [];
    var pool = embaralha(r, M.cardapio);
    var sits = MODELOS_TABLET[idx % MODELOS_TABLET.length];
    sits.forEach(function (s, i) {
      var c = pool[i];
      var dias = (atras || 0) + (s === 'VENCIDA' ? M.entre(r, 3, 5) : s === 'RESP' ? M.entre(r, 1, 6) : s === 'CONTRA' ? M.entre(r, 1, 3) : M.entre(r, 0, 3));
      var o = { unidade: L.nome, marca: MARCAS_PZ[0], item: c.nome, tipo: c.categoria === 'Adicionais' ? 'Complemento' : 'Item',
                estado: s === 'ESC' ? 'escondido' : 'pausado', desde: M.br(M.somaDias(h, -dias)), dias: dias,
                chave: 'pausado:' + L.id + '|Tablet|' + c.codigo,
                resolvido: false, contradito: false, quem: null, o_que: null, em: null };
      var respDia = M.somaDias(h, -Math.max(1, dias - 1));
      if (s === 'VENCIDA') { o.quem = gerente(L); o.o_que = 'Acabou, vai voltar a vender'; o.em = quando(M.somaDias(h, -dias), M.entre(r, 12 * 60, 21 * 60)); }
      if (s === 'CONTRA') { o.quem = gerente(L); o.o_que = 'Despausei'; o.em = quando(respDia, M.entre(r, 11 * 60, 15 * 60)); o.contradito = true; }
      if (s === 'RESP') { o.quem = gerente(L); o.o_que = M.escolhe(r, PROPOSITO); o.em = quando(respDia, M.entre(r, 11 * 60, 15 * 60)); o.resolvido = true; }
      out.push(o);
      if (s === 'AMBOS') {
        var e = {}; for (var k in o) e[k] = o[k];
        e.estado = 'escondido'; e.dias = Math.max(atras || 0, dias - 1); e.desde = M.br(M.somaDias(h, -e.dias));
        out.push(e);
      }
    });
    return out;
  }
  function aplicaMarcas(lista, marcas, soAbertas) {
    lista.forEach(function (x) {
      var mk = marcas[x.chave];
      if (!mk || (soAbertas && !x.aberta)) return;
      if (mk.desfeito) { x.resolvido = false; x.contradito = false; x.quem = null; x.o_que = null; x.em = null; }
      else { x.resolvido = true; x.contradito = false; x.quem = mk.quem; x.o_que = mk.o_que; x.em = mk.em; }
      if ('prova' in x) x.prova = null;
    });
  }

  D.rpc('cozinha_pausados', function () {
    var h = hojeOp(), marcas = lerLS('pausas', {});
    var linhas = [], tablet = [], lidos = [];
    M.lojas.forEach(function (L, i) {
      /* o tablet e lido uma vez por dia de manha; a terceira loja ficou 2 dias sem leitura (exemplo de alerta) */
      var atras = i === 2 ? 2 : 0;
      linhas = linhas.concat(pausasLoja(L, [h]));
      tablet = tablet.concat(tabletLoja(L, i, atras));
      lidos.push({ curto: L.curto, txt: quando(M.somaDias(diaTablet(), -atras), 6 * 60 + 10 + i * 3), atras: atras });
    });
    aplicaMarcas(linhas, marcas, true);
    aplicaMarcas(tablet, marcas, false);
    var a = M.minutosAgora(), lido = a - (a % 5);
    var atrasados = lidos.filter(function (x) { return x.atras > 0; });
    var tabletLido = lidos[0] ? lidos[0].txt : '—';
    if (atrasados.length) tabletLido += ' (' + atrasados.map(function (x) { return x.curto + ' só até ' + x.txt; }).join(', ') + ')';
    return {
      linhas: linhas.filter(function (x) { return x.aberta; }),
      lido_em: agoraTxt().slice(0, 6) + M.hm(lido), lido_min: a - lido,
      tablet: tablet.map(function (x) { return { item: x.item, unidade: x.unidade, estado: x.estado, desde: x.desde, dias: x.dias }; }),
      tablet_lido: tabletLido
    };
  });

  /* =====================================================================
     3. O QUE MAIS SAI — soma dos itens de MUNDO.pedidos (dias fechados, sem cancelados)
     ===================================================================== */
  D.rpc('cozinha_itens_top', function (b, ctx) {
    var n = +((b && b.p_dias) || (ctx.params && ctx.params.get('p_dias')) || 7);
    if (!(n > 0) || n > 60) n = 7;
    var ate = M.dia(-1), de = M.somaDias(ate, -(n - 1)), out = [];
    M.lojas.forEach(function (L) {
      var g = {};
      M.intervalo(de, ate).forEach(function (dia) {
        M.pedidos(dia, L.id).forEach(function (p) {
          if (p.cancelado) return;
          p.itens.forEach(function (it) { g[it.nome] = (g[it.nome] || 0) + (it.qtd || 1); });
        });
      });
      Object.keys(g).map(function (k) { return { unidade: L.nome, produto: k, qtd: g[k], dado_ate: ate }; })
        .sort(function (a, b) { return b.qtd - a.qtd; }).slice(0, 50)
        .forEach(function (x) { out.push(x); });
    });
    return out;
  });

  /* =====================================================================
     4. TEMPO DE PREPARO — mesma conta da Fila de Pedidos: do pedido entrar ate ficar pronto.
        Na semana anterior (so usada na comparacao) a primeira loja era mais lenta e a segunda mais
        rapida, para a tela mostrar "mais rapido" e "mais lento".
     ===================================================================== */
  var AJUSTE_SEMANA_ANTERIOR = [1.4, -1.1, 0];
  D.tabela('cozinha_vw_preparo_dia', function () {
    var real = M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(), linhas = [];
    var agora = M.minutosAgora() + (real < M.hoje() ? 1440 : 0);
    var corteSemana = M.somaDias(real, -7);
    M.lojas.forEach(function (L, li) {
      for (var i = 15; i >= 0; i--) {
        var dia = M.somaDias(real, -i), corte = i === 0 ? agora : 99999;
        var ps = M.pedidos(dia, L.id).filter(function (p) { return !p.cancelado && p.min_pronto <= corte; });
        if (!ps.length) continue;
        var soma = ps.reduce(function (a, p) { return a + (p.min_pronto - p.min_pedido); }, 0);
        var aj = dia < corteSemana ? (AJUSTE_SEMANA_ANTERIOR[li % AJUSTE_SEMANA_ANTERIOR.length] || 0) : 0;
        linhas.push({ unidade: L.nome, dia_operacional: dia, pedidos: ps.length, preparo_medio_min: M.arred(soma / ps.length + aj, 1) });
      }
    });
    return linhas;
  });

  /* =====================================================================
     5. RESERVA: cancelamentos do iFood, so se telas/ifood.js nao estiver carregado
     ===================================================================== */
  if (!D.tem('tabela', 'ifood_dim_loja')) {
    D.tabela('ifood_dim_loja', function () {
      return M.lojas.map(function (l) { return { id_loja: 'ifood-' + l.id, nome: BASE + ' · ' + l.nome, unidade: l.nome, ativa: true }; });
    });
  }
  if (!D.tem('tabela', 'ifood_fato_cancelamento')) {
    var MOTIVOS = [['PEDIDO VEIO ERRADO', 14], ['PARTE DO ITEM NÃO FOI ENVIADO', 10], ['ITEM IMPRÓPRIO PARA CONSUMO', 5],
      ['PEDIDO REVIRADO/VIOLADO', 7], ['CLIENTE DESISTIU DO PEDIDO', 10], ['CLIENTE NÃO LOCALIZADO', 5]];
    D.tabela('ifood_fato_cancelamento', function () {
      var out = [], ate = M.minutosAgora() < 300 ? M.dia(-1) : M.hoje();
      M.intervalo(M.somaDias(ate, -40), ate).forEach(function (dia) {
        M.lojas.forEach(function (L) {
          var r = M.rng('coz-canc|' + dia + '|' + L.id);
          var ps = M.pedidos(dia, L.id).filter(function (p) { return p.canal === 'ifood' && p.status === 'entregue'; });
          var n = ps.length ? M.pesado(r, [[0, 30], [1, 38], [2, 22], [3, 10]]) : 0;
          for (var i = 0; i < n; i++) {
            var p = M.escolhe(r, ps), mot = M.pesado(r, MOTIVOS.map(function (m) { return [m[0], m[1]]; }));
            var it = p.itens[Math.floor(r() * p.itens.length)];
            out.push({ id_loja: 'ifood-' + L.id, data: dia, motivo: mot,
              valor_cancelamento: M.arred(/PARTE DO ITEM/.test(mot) ? it.preco * it.qtd : p.total) });
          }
        });
      });
      return out;
    });
  }
})();
