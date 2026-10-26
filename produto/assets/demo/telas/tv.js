/* TV da Cozinha (demonstracao).
   Simula: rpc cozinha_tv (TV da parede, entra pelo codigo da TV), rpc cozinha_tv_portal (aba do portal),
           rpc cozinha_tv_dia (tabela dos erros de um dia da meta), tabelas tv_meta_google e
           google_fato_avaliacao (meta de avaliacoes novas no Google) e a funcao guardar-foto-chat
           (acao ver = fotos de um pedido; acao carrossel = fotos dos erros da semana).
   Erros, notas e avaliacoes saem de MUNDO.pedidos (os mesmos pedidos das outras telas); as avaliacoes do
   iFood saem de MUNDO.avaliacoesIfood (a mesma conta da tela Avaliacoes do dia) e as marcas de MUNDO.marcas.
   Um erro "ao vivo" aparece com NOVO quando a tela abre no horario de movimento, e outro a cada
   40 min (no maximo 2 por dia), para mostrar o aviso de erro novo. As fotos sao desenhos de exemplo. */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG || {};

  var SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var SEM_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  /* ---------------- relogio: o dia da cozinha vai das 6h as 6h ---------------- */
  function agoraReal() { return M.minutosAgora(); }
  function diaOp() { return agoraReal() < 360 ? M.dia(-1) : M.hoje(); }
  function agoraOp() { var r = agoraReal(); return r < 360 ? r + 1440 : r; }
  function tsMs(dia, min) { return Date.parse(M.ts(dia, min)); }
  function sabado(d) { return M.somaDias(d, -((M.diaSemana(d) + 1) % 7)); }   /* sabado que abre a semana da meta */
  function arred(v, c) { return M.arred(v, c == null ? 2 : c); }
  function escolheP(lista, x) {   /* escolha com peso usando um numero ja sorteado (0..1) */
    var tot = 0, i; for (i = 0; i < lista.length; i++) tot += lista[i].peso;
    var y = x * tot;
    for (i = 0; i < lista.length; i++) { y -= lista[i].peso; if (y <= 0) return lista[i]; }
    return lista[lista.length - 1];
  }
  function um(lista, x) { return lista[Math.min(lista.length - 1, Math.floor(x * lista.length))]; }
  function sorteios(r, n) { var a = []; for (var i = 0; i < n; i++) a.push(r()); return a; }

  /* ---------------- marcas no iFood (a lista unica de MUNDO.marcas; cada pedido tem sempre a mesma marca) ---------------- */
  function marcaDe(p, L, semFrango) {
    var mc = M.marcaDoPedido(p);
    if (semFrango && mc.id === 'frango') mc = M.marcas[0];   /* carne crua/passada nunca e da marca de frango */
    var m = mc.nome + ' - ' + L.nome;
    return M.hash('caixa|' + p.id) % 3 === 0 ? m.toUpperCase() : m;   /* o iFood escreve cada marca de um jeito */
  }

  /* ---------------- regra da meta por loja (regra de exemplo, configuravel) ---------------- */
  function idx(L) { return M.lojas.indexOf(L); }
  function regra(L) {
    var i = idx(L);
    if (i === 0) return { teto: 16, verde: 3, dias: 4, google: 25, nota: 4.6 };
    if (i === 1) return { teto: 10, verde: 3, dias: 4, proxima: true, nota: 4.5 };
    return { teto: null, verde: 3, dias: 4, desde: true, nota: 4.7 };
  }

  /* ---------------- codigo da TV de cada loja ---------------- */
  function codigo(L) {
    var c = String(L.curto || L.nome || 'TV').normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    c = (c + 'XXX').slice(0, 3);
    return 'DEMO-' + c + (idx(L) + 1);
  }
  function lojaDoCodigo(ch) {
    var c = String(ch || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (var i = 0; i < M.lojas.length; i++) if (codigo(M.lojas[i]).replace(/-/g, '') === c) return M.lojas[i];
    return null;
  }
  function podeTv(papel) { var ok = D.papeis && D.papeis[papel]; return !ok || ok.indexOf('tv') >= 0; }

  /* ---------------- avaliacoes do iFood: a conta e a do MUNDO (MUNDO.avaliacoesIfood), ----------------
     a mesma da tela Avaliacoes do dia, para os totais, a media e as notas ruins baterem */
  function daTv(a, L) {
    return { p: a.p, nota: a.nota, disse: a.disse, avaliou: a.avaliou, marca: marcaDe(a.p, L), mi: M.marcas.indexOf(a.marca) };
  }
  function notasDoDia(L, dia) {   /* avaliacoes dos pedidos feitos neste dia (so as que o iFood ja liberou) */
    return M.avaliacoesIfood(dia, L.id, { por: 'pedido' }).lista.map(function (a) { return daTv(a, L); });
  }
  function chegadas(L, de, ate) {   /* avaliacoes que o iFood liberou entre de e ate */
    var r = [];
    M.intervalo(de, ate).forEach(function (d) {
      M.avaliacoesIfood(d, L.id).lista.forEach(function (a) { r.push(daTv(a, L)); });
    });
    return r;
  }
  function tags(t) {
    t = String(t || '');
    var r = [];
    if (/frio|morna/i.test(t)) r.push('Comida fria');
    if (/errado/i.test(t)) r.push('Pedido errado');
    if (/faltou/i.test(t)) r.push('Faltou item');
    if (/demor/i.test(t)) r.push('Demorou');
    if (/motoboy|endereço/i.test(t)) r.push('Entrega');
    return r;
  }
  function deComida(t) { return /frio|morna|sabor|cru|salgad|queimad/i.test(String(t || '')); }
  function temaDe(t) {
    t = String(t || '');
    if (/frio|morna/i.test(t)) return 'frio';
    if (/faltou|errado/i.test(t)) return 'faltou';
    if (/salgad|sabor/i.test(t)) return 'sabor';
    if (/cru|ponto/i.test(t)) return 'ponto';
    if (/porção|pouca/i.test(t)) return 'porcao';
    if (/vazou|embalagem/i.test(t)) return 'embalagem';
    return '';
  }
  function media(l) { if (!l.length) return null; var s = 0; l.forEach(function (a) { s += a.nota; }); return s / l.length; }

  /* ---------------- Google (leitura 1 vez por dia, perto do meio-dia) ---------------- */
  var GOO_BASE = [1480, 960, 720, 640];
  var GOO = {};
  function leiturasGoogle(L) {
    var hoje = M.hoje(), k = L.id + '|' + hoje + '|' + (agoraReal() >= 12 * 60 + 35 ? 1 : 0);
    if (GOO[k]) return GOO[k];
    var R = regra(L), i = idx(L), tot = GOO_BASE[i] || 600, lista = [];
    var inicio = M.somaDias(hoje, -150);
    M.intervalo(inicio, hoje).forEach(function (d) {
      var r = M.rng('tv-goo|' + L.id + '|' + d), dow = M.diaSemana(d);
      var fds = dow === 0 || dow === 6 || dow === 5;
      var novas = i === 0 ? M.entre(r, 1, fds ? 9 : 6) : M.entre(r, 0, fds ? 5 : 3);
      var minuto = 12 * 60 + 18 + M.entre(r, 0, 14);
      tot += novas;
      if (d === hoje && agoraReal() < minuto) return;
      if (d < M.somaDias(hoje, -60)) return;
      lista.push({ unidade: L.nome, loja: L.nome, data_coleta: d, num_avaliacoes: tot, nota: R.nota, created_at: M.ts(d, minuto) });
    });
    GOO[k] = lista;
    return lista;
  }
  function leituraDo(L, d) { var l = leiturasGoogle(L); for (var i = l.length - 1; i >= 0; i--) if (l[i].data_coleta === d) return { atual: l[i], antes: l[i - 1] || null }; return null; }
  var DISSE_GOOGLE = ['Atendimento ótimo no salão, voltaremos!', 'Lanche muito bom e ambiente agradável.', 'Garçom muito atencioso, recomendo.', 'Batata crocante e burger no ponto certo.', 'Lugar limpo e comida saborosa.'];
  function recentesGoogle(L, d) {
    var r = M.rng('tv-goo-txt|' + L.id + '|' + d);
    if (r() > 0.45) return [];
    return [{ disse: um(DISSE_GOOGLE, r()), quando: um(['1 dia atrás', '2 dias atrás', '3 dias atrás'], r()), autor: M.iniciais(r) }];
  }
  function resumoGoogle(L) {
    var l = leiturasGoogle(L); if (!l.length) return null;
    var u = l[l.length - 1], s = null;
    var alvo = M.somaDias(u.data_coleta, -7);
    for (var i = l.length - 1; i >= 0; i--) if (l[i].data_coleta <= alvo) { s = l[i]; break; }
    return { total: u.num_avaliacoes, nota: u.nota, novas7: s ? u.num_avaliacoes - s.num_avaliacoes : null, coleta: M.br(u.data_coleta), recentes: recentesGoogle(L, u.data_coleta) };
  }

  /* ---------------- erros do dia (inventados, presos aos pedidos de MUNDO) ---------------- */
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
    var fotos = pedido && s[9] < 0.32 ? (s[9] < 0.08 ? 2 : 1) : 0;
    return {
      k: L.id + '-' + dia + '-' + suf, min: min, ts: tsMs(dia, min), hora: M.hm(min), dia: dia,
      setor: tipo.setor, grave: !!tipo.grave, titulo: tipo.titulo, fam: tipo.fam,
      marca: marca, pedido: pedido, item: item, disse: disse, qual: !!tipo.qual, na_meta: true, fotos: fotos,
      fontes: tipo.fam === 'acabou' ? 'Gestor Web (cancelamento)' : escolheP(FONTES, s[10]).v,
      resolveu: escolheP(RESOLVEU, s[11]).v
    };
  }

  /* erro "ao vivo" de hoje: guardado neste navegador para nao sumir quando a tela recarrega */
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
      l.push(ag - (l.length ? 1 : 4));
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
      if (xm <= limite) exp.push({ hora: M.hm(xm), min: xm, setor: 'expedição', qual: true, na_meta: false, titulo: 'Lanche morno (demora na rota)', item: itemDe(xp, TIPOS[0], s[4]),
        marca: xp ? marcaDe(xp, L) : '', pedido: xp ? (xp.numero_ifood || String(xp.numero)) : null, fotos: 0,
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

  /* ---------------- blocos da resposta ---------------- */
  function semana(L) {
    var hoje = diaOp(), s0 = sabado(hoje), R = regra(L);
    var desde = R.desde && s0 < hoje ? M.somaDias(s0, 1) : null;
    var dias = [];
    for (var i = 0; i < 7; i++) {
      var d = M.somaDias(s0, i), q = d < hoje ? 'passou' : d === hoje ? 'hoje' : 'falta';
      var o = { dia: M.br(d), sem: SEM[M.diaSemana(d)], quando: q, erros: q === 'falta' ? null : errosDia(L, d).conta.length };
      if (desde && d < desde) o.conta = false;
      dias.push(o);
    }
    var a0 = M.somaDias(s0, -7), tot = 0, verdes = 0;
    for (i = 0; i < 7; i++) { var n = errosDia(L, M.somaDias(a0, i)).conta.length; tot += n; if (n <= R.verde) verdes++; }
    return {
      dias: dias, verde_ate: R.verde, meta_dias: R.dias, teto_semana: R.teto, conta_desde: desde ? M.br(desde) : null,
      anterior: { de: M.br(a0), ate: M.br(M.somaDias(a0, 6)), total: tot, teto: R.teto, verdes: verdes }
    };
  }
  function proxima(L) {
    var R = regra(L); if (!R.proxima) return null;
    return { a_partir: M.br(M.somaDias(sabado(diaOp()), 7)), teto: 8, verde_ate: 2, google_meta: 15 };
  }

  function melhorar(L) {
    var hoje = diaOp(), de = M.somaDias(hoje, -7), ate = M.somaDias(hoje, -1);
    var fams = {}, itens = {}, total = 0;
    M.intervalo(de, ate).forEach(function (d) {
      errosDia(L, d).conta.forEach(function (e) {
        total++;
        var f = fams[e.fam] || (fams[e.fam] = { fam: e.fam, n: 0, dd: {} });
        f.n++; f.dd[d] = 1;
        if (e.fam === 'sacola' && e.item) {
          var it = itens[e.item] || (itens[e.item] = { nome: e.item, n: 0, dd: {} });
          it.n++; it.dd[d] = 1;
        }
      });
    });
    var ruins = chegadas(L, de, ate).filter(function (a) { return a.nota <= 3; });
    var temas = {};
    ruins.forEach(function (a) {
      var t = temaDe(a.disse); if (!t) return;
      var x = temas[t] || (temas[t] = { tema: t, n: 0, dd: {} });
      x.n++; x.dd[a.avaliou] = 1;
    });
    function lista(o) {
      return Object.keys(o).map(function (k) { return { n: o[k].n, dias: Object.keys(o[k].dd).length, fam: o[k].fam, nome: o[k].nome, tema: o[k].tema }; })
        .sort(function (a, b) { return b.n - a.n || b.dias - a.dias; });
    }
    var tl = lista(temas);
    return {
      de: M.br(de), ate: M.br(ate), calculado: M.br(hoje) + ' 06:05', erros: total,
      familias: lista(fams).map(function (x) { return { fam: x.fam, n: x.n, dias: x.dias }; }),
      itens: lista(itens).slice(0, 5).map(function (x) { return { nome: x.nome, n: x.n, dias: x.dias }; }),
      tema: tl.length ? { tema: tl[0].tema, n: tl[0].n, dias: tl[0].dias } : null,
      aval_ruins: ruins.length
    };
  }

  function avaliacoes(L) {
    var hoje = M.hoje(), lista = chegadas(L, M.somaDias(hoje, -2), hoje), deHoje = M.avaliacoesIfood(hoje, L.id);
    lista.sort(function (a, b) { return a.avaliou < b.avaliou ? 1 : a.avaliou > b.avaliou ? -1 : b.p.min_pedido - a.p.min_pedido; });
    function card(a) {
      return { nota: a.nota, dia: M.br(a.avaliou), pedido: a.p.numero_ifood || String(a.p.numero), pedido_dia: M.br(a.p.dia), marca: a.marca, tags: tags(a.disse), disse: a.disse };
    }
    var ruins = lista.filter(function (a) { return a.nota <= 3; }).slice(0, 4).map(card);
    var bom = lista.filter(function (a) { return a.nota === 5 && a.disse; })[0];
    var ult = lista.length ? lista[0].avaliou : null;
    return {
      hoje: { n: deHoje.n, media: deHoje.media, ruins: deHoje.ruins },
      atraso_dias: ult ? Math.round((Date.parse(hoje) - Date.parse(ult)) / 864e5) : null,
      ultima: ult ? M.br(ult) : null,
      lido_em: M.hm(Math.max(0, agoraReal() - 6)),
      ruins: ruins,
      elogio: bom ? card(bom) : null,
      google: resumoGoogle(L)
    };
  }

  var PZ_ABERTO = ['acabou, volta amanhã', 'faltou insumo, aguardando entrega', 'equipamento em manutenção'];
  var PZ_PROPOSITO = ['fora do cardápio nesta época', 'sai só no fim de semana', 'item só do almoço', 'troca de fornecedor'];
  function pausados(L) {
    var dia = diaOp(), r = M.rng('tv-pz|' + dia + '|' + L.id), ag = agoraOp();
    var nAb = idx(L) === 2 ? M.pesado(r, [[0, 2], [1, 1]]) : M.entre(r, 2, 5), nOk = M.entre(r, 2, 4);
    var pool = M.cardapio.filter(function (c) { return c.categoria !== 'Adicionais'; }).slice();
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    var itens = [];
    function linhas(c, aberto) {
      var nm = M.entre(r, 1, 3), comeco = M.entre(r, 8 * 60, 17 * 60), dias = M.entre(r, 1, 6);
      var oque = aberto ? (r() < 0.4 ? um(PZ_ABERTO, r()) : '') : um(PZ_PROPOSITO, r());
      if (aberto && comeco > ag - 3) return;   /* a pausa de hoje ainda nao aconteceu */
      for (var k = 0; k < nm; k++) {
        itens.push({
          item: c.nome, marca: M.marcas[(k + M.hash(c.id)) % M.marcas.length].nome + ' - ' + L.nome,
          minutos: aberto ? ag - comeco + k * 4 : dias * 1440 + k * 30,
          resolvido: !aberto, o_que: oque
        });
      }
    }
    pool.slice(0, nAb).forEach(function (c) { linhas(c, true); });
    pool.slice(nAb, nAb + nOk).forEach(function (c) { linhas(c, false); });
    return { itens: itens, lido_min: M.entre(r, 2, 7) };
  }

  var NOTAS = {};
  function notas(L) {
    var hoje = M.hoje(), k = L.id + '|' + hoje;
    if (NOTAS[k]) return NOTAS[k];
    var diaN = M.somaDias(hoje, -2), de = M.somaDias(hoje, -31);
    function periodo(Lx) { var l = []; M.intervalo(de, diaN).forEach(function (d) { l = l.concat(notasDoDia(Lx, d)); }); return l; }
    var doDia = notasDoDia(L, diaN), est = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    doDia.forEach(function (a) { est[a.nota]++; });
    var p30 = periodo(L), porMarca = {};
    p30.forEach(function (a) { (porMarca[a.mi] || (porMarca[a.mi] = [])).push(a); });
    var marcas = Object.keys(porMarca).map(function (mi) {
      var l = porMarca[mi]; return { marca: M.marcas[mi].nome + ' - ' + L.nome, n: l.length, media: arred(media(l), 2) };
    }).sort(function (a, b) { return b.n - a.n; });
    var lojas = M.lojas.map(function (Lx) { return { loja: Lx.nome, media: arred(media(Lx === L ? p30 : periodo(Lx)) || 0, 2) }; })
      .sort(function (a, b) { return b.media - a.media; });
    var dm = media(doDia);
    var r = {
      dia: M.br(diaN), dia_n: doDia.length, dia_media: dm == null ? null : arred(dm, 2), dia_estrelas: est,
      loja_n: p30.length, loja_media: arred(media(p30) || 0, 2), marcas: marcas, lojas: lojas,
      meta: 4.7, atraso_dias: 1, ultima: M.br(M.somaDias(hoje, -1))
    };
    NOTAS[k] = r;
    return r;
  }

  function frescor() {
    var h = M.hoje(), a = agoraReal();
    return { gestor_web: M.ts(h, a - 2), chat_ifood: M.ts(h, a - 5), negociacao: M.ts(h, a - 38) };
  }

  function publico(e) {
    return { k: e.k, ts: e.ts, hora: e.hora, setor: e.setor, grave: e.grave, titulo: e.titulo, marca: e.marca, pedido: e.pedido, item: e.item, disse: e.disse };
  }
  function pacote(L, modo) {
    var hoje = diaOp();
    var ed = errosDia(L, hoje, true);
    return {
      loja: L.nome, dia: M.br(hoje), agora: M.agoraISO(),
      tv: modo === 'portal' ? 'aberta pelo portal (demonstração)' : 'TV da loja ' + L.nome + ' (demonstração)',
      erros: ed.conta.slice().sort(function (a, b) { return b.min - a.min; }).map(publico),
      semana: semana(L), regra_proxima: proxima(L), melhorar: melhorar(L), avaliacoes: avaliacoes(L),
      pausados: pausados(L), notas: notas(L), frescor: frescor()
    };
  }

  /* ---------------- portas ---------------- */
  D.rpc('cozinha_tv', function (b) {
    var L = lojaDoCodigo(b.p_chave);
    if (!L) throw D.erro(403, 'Código da TV não aceito', '42501');
    return pacote(L, 'tv');
  });

  D.rpc('cozinha_tv_portal', function (b) {
    var papel = D.papelDoToken(b.p_token);
    if (!papel) throw D.erro(401, 'Sessão expirada', '28000');
    if (!podeTv(papel)) throw D.erro(403, 'Sem acesso a esta tela', '42501');
    var L = M.loja(b.p_loja) || M.lojas[0];
    var j = pacote(L, 'portal');
    j.codigo_tv = codigo(L);
    j.codigos_tv = (papel === 'delivery' ? [L] : M.lojas).map(function (x) { return { loja: x.nome, codigo: codigo(x) }; });
    return j;
  });

  D.rpc('cozinha_tv_dia', function (b) {
    var L;
    if (b.p_chave) { L = lojaDoCodigo(b.p_chave); if (!L) throw D.erro(403, 'Código da TV não aceito', '42501'); }
    else {
      var papel = D.papelDoToken(b.p_token);
      if (!papel) throw D.erro(401, 'Sessão expirada', '28000');
      L = M.loja(b.p_loja) || M.lojas[0];
    }
    var dia = String(b.p_dia || '').slice(0, 10), hoje = diaOp();
    var ed = errosDia(L, dia);
    var R = regra(L);
    var av = M.avaliacoesIfood(dia, L.id, { por: 'pedido' });   /* so as que o iFood ja liberou */
    var pedDia = av.lista.map(function (a) { return daTv(a, L); });
    var ruins = pedDia.filter(function (a) { return a.nota <= 3; }).sort(function (a, b) { return a.p.min_pedido - b.p.min_pedido; }).map(function (a) {
      return { hora: a.p.hora_pedido, nota: a.nota, tags: tags(a.disse), marca: a.marca, pedido: a.p.numero_ifood || String(a.p.numero),
        disse: a.disse, avaliou: M.br(a.avaliou), qual: deComida(a.disse) };
    });
    var lg = leituraDo(L, dia);
    function linha(e) {
      return { hora: e.hora, setor: e.setor, qual: e.qual, na_meta: e.na_meta, titulo: e.titulo, item: e.item, marca: e.marca,
        pedido: e.pedido, fotos: e.fotos, disse: e.disse, fontes: e.fontes, resolveu: e.resolveu };
    }
    return {
      loja: L.nome, dia: M.br(dia), sem: SEM_LONGO[M.diaSemana(dia)], hoje: dia === hoje, ontem: dia === M.somaDias(hoje, -1),
      lido_em: M.br(M.hoje()) + ' ' + M.hm(Math.max(0, agoraReal() - 3)), verde_ate: R.verde,
      conta: ed.conta.map(linha), fora: ed.fora.map(function (f) { return { hora: f.hora, nao_conta: f.nao_conta, titulo: f.titulo, disse: f.disse, pedido: f.pedido }; }),
      expedicao: ed.exp.map(linha),
      avaliacoes: {
        ifood: { n: av.n, media: av.media, ruins: ruins },
        google: lg ? { total: lg.atual.num_avaliacoes, nota: lg.atual.nota, novas: lg.antes ? lg.atual.num_avaliacoes - lg.antes.num_avaliacoes : null,
          coleta: M.br(dia), recentes: recentesGoogle(L, dia) } : null
      }
    };
  });

  /* meta do Google: so a primeira loja tem (as outras mostram a meta so de erros) */
  D.tabela('tv_meta_google', function () {
    return M.lojas.filter(function (L) { return regra(L).google; }).map(function (L) {
      var desde = M.somaDias(sabado(diaOp()), -21), l = leituraDo(L, desde);
      return { loja: L.nome, desde: desde, base_total: l ? l.atual.num_avaliacoes : GOO_BASE[idx(L)], alvo: regra(L).google };
    });
  });
  D.tabela('google_fato_avaliacao', function () {
    var r = [];
    M.lojas.forEach(function (L) { r = r.concat(leiturasGoogle(L)); });
    return r;
  });

  /* ---------------- fotos: desenhos de exemplo (nunca foto de cliente) ---------------- */
  function fotoSvg(e, n) {
    var t = String(e.titulo || '') + ' ' + String(e.disse || '');
    var carne = /cru/i.test(t) ? '#b4535b' : /passou|queimad|seca/i.test(t) ? '#2b1a10' : '#6b3a1f';
    var fundo = ['#3b3a36', '#2f3b3a', '#3a3340'][n % 3];
    var falta = e.fam === 'sacola' || e.fam === 'embalagem' || /faltou|vazou/i.test(t);
    var cx = falta ? 230 : 320, esc = falta ? 0.75 : 1;
    var burger = '<g transform="translate(' + cx + ' 250) scale(' + esc + ') translate(-320 -250)">'
      + '<ellipse cx="320" cy="300" rx="150" ry="40" fill="#d9a05b"/>'
      + '<ellipse cx="320" cy="272" rx="165" ry="36" fill="' + carne + '"/>'
      + '<path d="M165 255 L475 255 L455 285 L420 262 L390 290 L355 262 L320 292 L285 262 L250 290 L215 262 L185 285 Z" fill="#f2c230"/>'
      + '<ellipse cx="320" cy="236" rx="160" ry="20" fill="#5aa64a"/>'
      + '<path d="M160 232 Q320 70 480 232 Z" fill="#e0a24e"/>'
      + '<ellipse cx="270" cy="170" rx="7" ry="4" fill="#f6e3b8"/><ellipse cx="320" cy="150" rx="7" ry="4" fill="#f6e3b8"/>'
      + '<ellipse cx="370" cy="172" rx="7" ry="4" fill="#f6e3b8"/><ellipse cx="300" cy="195" rx="7" ry="4" fill="#f6e3b8"/>'
      + '<ellipse cx="350" cy="200" rx="7" ry="4" fill="#f6e3b8"/></g>';
    var marca = falta
      ? '<rect x="400" y="200" width="150" height="140" rx="12" fill="none" stroke="#e66767" stroke-width="6" stroke-dasharray="16 10"/>'
        + '<text x="475" y="285" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#e66767" text-anchor="middle">?</text>'
      : '<circle cx="' + (/cru|passou|queimad|seca/i.test(t) ? 400 : 320) + '" cy="272" r="62" fill="none" stroke="#e66767" stroke-width="6" stroke-dasharray="16 10"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">'
      + '<rect width="640" height="480" fill="' + fundo + '"/>'
      + '<rect x="50" y="330" width="540" height="90" rx="10" fill="#c49a62"/><rect x="50" y="330" width="540" height="18" fill="#b3884f"/>'
      + burger + marca
      + '<rect x="0" y="430" width="640" height="50" fill="rgba(0,0,0,.55)"/>'
      + '<text x="320" y="462" font-family="Arial, sans-serif" font-size="20" fill="#ffffff" text-anchor="middle">foto ilustrativa · demonstração</text>'
      + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  D.funcao('guardar-foto-chat', function (b) {
    var L;
    if (b.chave_tv) { L = lojaDoCodigo(b.chave_tv); if (!L) throw D.erro(403, 'código da TV não aceito'); }
    else {
      if (!D.papelDoToken(b.token_portal)) { var e401 = D.erro(401, 'sessão expirada'); e401.demoCorpo.erro = 'sessão expirada'; throw e401; }
      L = M.loja(b.loja || b.unidade) || M.lojas[0];
    }
    if (b.acao === 'ver') {
      var dia = String(b.dia || diaOp()).slice(0, 10), alvo = String(b.pedido_curto || '');
      var e = errosDia(L, dia).conta.filter(function (x) { return x.pedido === alvo && x.fotos > 0; })[0];
      var fotos = [];
      for (var i = 0; e && i < e.fotos; i++) fotos.push({ link: fotoSvg(e, i), nome: 'foto-' + (i + 1) + '.svg' });
      return { ok: true, fotos: fotos };
    }
    if (b.acao === 'carrossel') {
      var hoje = diaOp(), s0 = sabado(hoje), lista = [];
      M.intervalo(s0, hoje).forEach(function (d) {
        errosDia(L, d).conta.forEach(function (x) {
          for (var k = 0; k < x.fotos; k++) {
            lista.push({ id: x.k + '-' + k, link: fotoSvg(x, k + lista.length), titulo: x.titulo, marca: x.marca, pedido: x.pedido,
              quando: SEM[M.diaSemana(d)] + ' ' + M.br(d) + ' · ' + x.hora });
          }
        });
      });
      return { ok: true, loja: L.nome, fotos: lista.reverse().slice(0, 8) };
    }
    return { ok: false, erro: 'ação desconhecida' };
  });

  /* tela do codigo (TV da parede): mostra o codigo de demonstracao */
  document.addEventListener('DOMContentLoaded', function () {
    if (/[?&]portal=1/.test(location.search)) return;
    var box = document.querySelector('#cod .box'), inp = document.getElementById('cod-in');
    if (!box || !inp || !M.lojas.length) return;
    var p = document.createElement('p');
    p.style.color = 'var(--brand)';
    p.appendChild(document.createTextNode('Demonstração: use o código '));
    var b = document.createElement('b'); b.textContent = codigo(M.lojas[0]); p.appendChild(b);
    p.appendChild(document.createTextNode(' (loja ' + M.lojas[0].nome + ')' + (M.lojas.length > 1 ? '. As outras lojas: ' + M.lojas.slice(1).map(function (L) { return codigo(L) + ' (' + L.nome + ')'; }).join(', ') + '.' : '.')));
    box.insertBefore(p, inp);
  });
})();
