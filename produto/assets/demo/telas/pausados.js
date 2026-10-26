/* Produtos pausados (demonstracao).
   Simula: rpc pausados_consulta (itens pausados no iFood, no tablet da mesa do salao e no site proprio Accon,
   com a hora da ultima leitura de cada canal) e rpc pausados_marcar (resposta da loja e "reabrir").
   Os itens saem de MUNDO.cardapio. A lista do iFood usa o mesmo sorteio e as mesmas chaves do Resolver hoje,
   e as respostas ficam na mesma gaveta do navegador (localStorage demo_resolver_pausas): marcar aqui vale la,
   e o contrario tambem. Nada sai deste navegador. */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG;

  /* marcas no iFood: a lista unica de MUNDO.marcas (as mesmas do Resolver hoje) */
  var MARCAS = M.marcas.map(function (m) { return m.nome; });

  /* ---------------- utilitarios ---------------- */
  function lerLS(k, padrao) { try { var v = localStorage.getItem('demo_resolver_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravarLS(k, v) { try { localStorage.setItem('demo_resolver_' + k, JSON.stringify(v)); } catch (e) {} }
  function hojeOp() { return M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(); }
  /* dia da ultima leitura do tablet (a leitura roda as 06:10; antes disso vale a de ontem) */
  function diaTablet() { var h = hojeOp(); return (h === M.hoje() && M.minutosAgora() < 6 * 60 + 20) ? M.somaDias(h, -1) : h; }
  function quando(dia, min) { var t = M.ts(dia, min); return M.br(t.slice(0, 10)) + ' ' + t.slice(11, 16); }
  function agoraTxt() { var a = M.agoraISO(); return M.br(a) + ' ' + a.slice(11, 16); }
  function gerente(L) { var g = M.equipe.filter(function (x) { return x.loja === L.id && x.cargo === 'Gerente da loja'; })[0]; return g ? g.apelido : 'Gerência'; }
  function dados(b) { return (b && b.p_dados) || {}; }
  function embaralha(r, lista) {
    var l = lista.slice();
    for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; }
    return l;
  }

  /* ---------------- iFood: mesmo sorteio do Resolver hoje ---------------- */
  var PROVAS = ['Anotação no item: "acabou o estoque, chega amanhã cedo"', 'Anotação no item: "pausado de propósito, saiu do cardápio de inverno"', 'Anotação no item: "faltou embalagem, volta à noite"'];
  function pausasLoja(L, dias) {
    var h = hojeOp(), ag = M.minutosAgora() + (M.minutosAgora() < 300 ? 1440 : 0), linhas = [];
    var r = M.rng('pausas|' + h + '|' + L.id);
    var cands = M.cardapio.filter(function (c) { return c.categoria !== 'Bebidas' || r() < 0.5; });
    var usados = {};
    function pega() { for (var t = 0; t < 40; t++) { var c = M.escolhe(r, cands); if (!usados[c.codigo]) { usados[c.codigo] = 1; return c; } } return cands[0]; }
    function marcasDe() { var n = M.pesado(r, [[1, 50], [2, 35], [3, 15]]); return MARCAS.slice(0, n); }
    function linha(c, extra) {
      return marcasDe().map(function (mc) {
        var o = { unidade: L.nome, item: c.nome, marca: mc, tipo: c.categoria === 'Adicionais' ? 'Complemento' : 'Item', chave: 'pausado|' + L.id + '|' + c.codigo,
                  resolvido: false, contradito: false, quem: null, o_que: null, em: null, prova: null };
        for (var k in extra) o[k] = extra[k];
        return o;
      });
    }
    /* abertas: uma de cada situacao, conforme a loja */
    var sits = M.escolhe(r, [['SEM', 'RESP', 'VENCIDA'], ['SEM', 'CONTRA', 'RESP'], ['SEM_LONGA', 'SEM', 'RESP', 'VENCIDA'], ['CONTRA', 'SEM']]);
    /* a pausa comeca sempre com a loja aberta (11:00 as 23:00); devolve o minuto contado a partir do dia h */
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
      if (s === 'RESP') { ex.quem = quem; ex.o_que = M.escolhe(r, ['Pode excluir do cardapio', 'Acabou, vai voltar a vender']); ex.em = depois(120); ex.resolvido = true;
                          if (r() < 0.6) ex.prova = M.escolhe(r, PROVAS); }
      linhas = linhas.concat(linha(c, ex));
    });
    /* fechadas no periodo: pausou e voltou */
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

  /* ---------------- tablet da mesa (Goomer) e site proprio (Accon) ----------------
     Uma linha por item e estado. AMBOS = o mesmo item aparece pausado e escondido (duas linhas, uma chave). */
  var MODELOS = {
    tablet: [['SEM', 'AMBOS', 'VENCIDA', 'RESP', 'ESC'], ['CONTRA', 'SEM', 'ESC', 'RESP'], ['ESC', 'SEM', 'RESP', 'RESP']],
    accon: [['SEM', 'RESP'], ['CONTRA', 'ESC', 'RESP'], ['SEM', 'VENCIDA']]
  };
  var PROPOSITO = ['Pausado de proposito: só no fim de semana', 'Pausado de proposito: item só do almoço', 'Item nao existe mais (pode excluir)', 'Acabou, vai voltar a vender'];
  /* atras = dias sem leitura do canal nessa loja: o que aparece pausado ja estava assim na ultima leitura */
  function canalLoja(kind, L, idx, atras) {
    var h = kind === 'tablet' ? diaTablet() : hojeOp(), r = M.rng('pz-' + kind + '|' + h + '|' + L.id), out = [];
    var rotulo = kind === 'tablet' ? 'Tablet' : 'Accon';
    var pool = embaralha(r, kind === 'tablet' ? M.cardapio : M.cardapio.filter(function (c) { return c.categoria !== 'Bebidas' || r() < 0.4; }));
    var sits = MODELOS[kind][idx % MODELOS[kind].length];
    sits.forEach(function (s, i) {
      var c = pool[i];
      var dias = (atras || 0) + (s === 'VENCIDA' ? M.entre(r, 3, 5) : s === 'RESP' ? M.entre(r, 1, 6) : s === 'CONTRA' ? M.entre(r, 1, 3) : M.entre(r, 0, 3));
      var o = { unidade: L.nome, marca: MARCAS[0], item: c.nome, tipo: c.categoria === 'Adicionais' ? 'Complemento' : 'Item',
                estado: s === 'ESC' ? 'escondido' : 'pausado', desde: M.br(M.somaDias(h, -dias)), dias: dias,
                chave: 'pausado:' + L.id + '|' + rotulo + '|' + c.codigo,
                resolvido: false, contradito: false, quem: null, o_que: null, em: null };
      /* resposta sempre num dia que ja passou (nunca "hoje mais tarde") */
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

  /* resposta gravada neste navegador por cima do que o "banco" sorteou */
  function aplicaMarcas(lista, marcas, soAbertas) {
    lista.forEach(function (x) {
      var mk = marcas[x.chave];
      if (!mk || (soAbertas && !x.aberta)) return;
      if (mk.desfeito) { x.resolvido = false; x.contradito = false; x.quem = null; x.o_que = null; x.em = null; }
      else { x.resolvido = true; x.contradito = false; x.quem = mk.quem; x.o_que = mk.o_que; x.em = mk.em; }
      if ('prova' in x) x.prova = null;
    });
  }

  /* ---------------- leitura ---------------- */
  D.rpc('pausados_consulta', function () {
    var h = hojeOp(), marcas = lerLS('pausas', {});
    var linhas = [], tablet = [], tabletLido = [], accon = [];
    M.lojas.forEach(function (L, i) {
      /* o tablet e lido uma vez por dia de manha; a terceira loja ficou 2 dias sem leitura (exemplo de alerta) */
      var atras = i === 2 ? 2 : 0;
      linhas = linhas.concat(pausasLoja(L, [h]));
      tablet = tablet.concat(canalLoja('tablet', L, i, atras));
      accon = accon.concat(canalLoja('accon', L, i, 0));
      tabletLido.push({ unidade: L.nome, lido: quando(M.somaDias(diaTablet(), -atras), 6 * 60 + 10 + i * 3), dias: atras });
    });
    aplicaMarcas(linhas, marcas, true);
    aplicaMarcas(tablet, marcas, false);
    aplicaMarcas(accon, marcas, false);
    var a = M.minutosAgora(), lido = a - (a % 5), acc = a - (a % 30);
    var r = M.rng('pz-mais7d|' + h);
    return {
      linhas: linhas,
      lido_em: agoraTxt().slice(0, 6) + M.hm(lido), lido_min: a - lido,
      tablet: tablet, tablet_lido: tabletLido,
      accon: accon, accon_dias: 0, accon_lido: agoraTxt().slice(0, 6) + M.hm(acc),
      mais7d: M.entre(r, 1, 3)
    };
  });

  /* ---------------- gravar ---------------- */
  D.rpc('pausados_marcar', function (b, ctx) {
    var d = dados(b);
    if (!d.chave) throw D.erro(400, 'Falta a chave do item', 'P0001');
    var m = lerLS('pausas', {});
    if (d.desfazer) m[d.chave] = { desfeito: true };
    else {
      if (!d.o_que_foi_feito) throw D.erro(400, 'Escolha o que foi feito', 'P0001');
      m[d.chave] = { quem: ctx.nome, em: agoraTxt(), o_que: String(d.o_que_foi_feito).slice(0, 400) };
    }
    gravarLS('pausas', m);
    return { ok: true };
  });
})();
