/* Central do Estoque (demonstracao). Tela: estoque/index.html.
   Simula a rpc estoque_consulta (p_cred, p_acao, p_dados):
     painel        -> { itens:[...], entradas:[...], contagens:[...] }
                      itens: id, unidade, item, medida, minimo, ultima, contado_em, contado_por,
                             falta, sem_contagem, sugestao (repor ate o dobro do minimo, regra de exemplo)
                      entradas: ultimos 30 dias; contagens: as mais recentes dos ultimos 30 dias, em dias inteiros (cerca de 30 linhas)
     contar, entrada, item_add, item_del, del_contagem, del_entrada -> { ok:true }
   Insumos de hamburgueria inventados, com fornecedores ficticios. As lojas vem do config.js.
   O que se grava na tela fica so neste navegador (localStorage, prefixo demo_estoque_). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* insumo, medida, minimo na loja principal, fornecedor (todos ficticios) */
  var INSUMOS = [
    ['Pão brioche', 'un', 120, 'Padaria Exemplo'],
    ['Pão australiano', 'un', 40, 'Padaria Exemplo'],
    ['Blend bovino 160 g', 'un', 150, 'Frigorífico Exemplo'],
    ['Bacon fatiado', 'kg', 5, 'Frigorífico Exemplo'],
    ['Queijo cheddar fatiado', 'kg', 4, 'Laticínios Exemplo'],
    ['Batata pré-frita congelada', 'kg', 30, 'Distribuidora Exemplo'],
    ['Óleo de fritura', 'L', 36, 'Distribuidora Exemplo'],
    ['Maionese (balde)', 'kg', 6, 'Distribuidora Exemplo'],
    ['Alface americana', 'un', 12, 'Hortifrúti Exemplo'],
    ['Tomate', 'kg', 6, 'Hortifrúti Exemplo'],
    ['Refrigerante lata', 'fardo', 6, 'Bebidas Exemplo'],
    ['Caixa kraft para burger', 'un', 300, 'Embalagens Exemplo'],
    ['Guardanapo', 'pacote', 10, 'Embalagens Exemplo']
  ];
  var ESSENCIAIS = { 'Pão brioche': 1, 'Blend bovino 160 g': 1, 'Batata pré-frita congelada': 1, 'Óleo de fritura': 1, 'Caixa kraft para burger': 1, 'Queijo cheddar fatiado': 1 };
  /* entregas que a equipe costuma lancar: fornecedor, a cada quantos dias, itens, dias de folga entre lojas */
  var ENTREGAS = [
    ['Padaria Exemplo', 7, ['Pão brioche']],
    ['Frigorífico Exemplo', 10, ['Blend bovino 160 g']],
    ['Hortifrúti Exemplo', 10, ['Alface americana', 'Tomate']],
    ['Distribuidora Exemplo', 15, ['Óleo de fritura']],
    ['Embalagens Exemplo', 30, ['Caixa kraft para burger']]
  ];
  var DIA_CONTAGEM = [1, 6, 4, 3, 5, 2];   /* dia da semana da contagem geral de cada loja (1 = segunda) */
  var INTEIRO = { un: 1, caixa: 1, pacote: 1, fardo: 1 };

  /* ---------------- guardado so neste navegador ---------------- */
  var MEM = {};
  function ler(k, padrao) {
    try { var v = localStorage.getItem('demo_estoque_' + k); if (v) return JSON.parse(v); } catch (e) {}
    return MEM[k] != null ? MEM[k] : padrao;
  }
  function gravar(k, v) { MEM[k] = v; try { localStorage.setItem('demo_estoque_' + k, JSON.stringify(v)); } catch (e) {} }
  function proximoId() { var n = ler('seq', 0) + 1; gravar('seq', n); return 900000 + n; }

  /* ---------------- ajudantes ---------------- */
  function chave(unidade, item) { return String(unidade || '').trim().toLowerCase() + '|' + String(item || '').trim().toLowerCase(); }
  function arredMedida(v, medida) { return INTEIRO[medida] ? Math.max(0, Math.round(v)) : Math.max(0, M.arred(v, 1)); }
  function idDe(txt) { return 100000 + (M.hash(txt) % 800000); }
  function lojaIdx(unidade) {
    for (var i = 0; i < M.lojas.length; i++) if (M.lojas[i].nome === unidade) return i;
    return 99;
  }
  function quemDaLoja(L, semente) {
    var gente = M.equipe.filter(function (p) { return p.loja === L.id && (p.setor === 'Cozinha' || p.setor === 'Gerência'); });
    if (!gente.length) return 'Equipe da cozinha';
    var p = gente[M.hash(semente) % gente.length];
    var partes = p.nome.split(' ');
    return partes[0] + ' ' + partes[partes.length - 1].charAt(0) + '.';
  }
  function ultimoDiaSemana(dow) {
    for (var k = 0; k < 7; k++) {
      var d = M.dia(-k);
      if (M.diaSemana(d) === dow) {
        if (k === 0 && M.minutosAgora() < 600) return M.dia(-7);   /* contagem do dia sai depois das 10h */
        return d;
      }
    }
    return M.hoje();
  }

  /* ---------------- base inventada (sempre igual para o mesmo dia) ---------------- */
  function base() {
    var itens = [], contagens = [], entradas = [];
    var trinta = M.dia(-30);
    M.lojas.forEach(function (L, li) {
      var r = M.rng('estoque|' + L.id);
      var fator = 0.5 + 0.5 * (L.peso || 0.5);
      var lista = INSUMOS.filter(function (x) { return li === 0 || ESSENCIAIS[x[0]] || (li === M.lojas.length - 1 && x[0] === 'Guardanapo') || r() > 0.35; });
      /* quais itens estao abaixo do minimo na ultima contagem */
      var candidatos = lista.filter(function (x) { return x[0] !== 'Guardanapo'; });
      var faltam = {};
      var nFalta = li === 0 ? 3 : 2;
      for (var t = 0; t < 30 && Object.keys(faltam).length < nFalta; t++) faltam[candidatos[Math.floor(r() * candidatos.length)][0]] = 1;
      var diaGeral = ultimoDiaSemana(DIA_CONTAGEM[li % DIA_CONTAGEM.length]);

      lista.forEach(function (x, xi) {
        var nome = x[0], medida = x[1];
        var minimo = x[2] >= 40 ? Math.max(10, Math.round(x[2] * fator / 10) * 10) : INTEIRO[medida] || x[2] * fator >= 10 ? Math.max(1, Math.round(x[2] * fator)) : Math.max(1, Math.round(x[2] * fator * 2) / 2);
        if (li === M.lojas.length - 1 && li > 0 && nome === 'Guardanapo') minimo = null;   /* item sem minimo: nunca avisa */
        var item = { id: li * 100 + INSUMOS.indexOf(x) + 1, unidade: L.nome, item: nome, medida: medida, minimo: minimo };
        itens.push(item);
        var ref = minimo || x[2] * fator;
        /* contagem geral semanal, nas ultimas 5 semanas */
        for (var s = 0; s < 5; s++) {
          var dia = M.somaDias(diaGeral, -7 * s);
          if (dia < trinta) break;
          var rr = M.rng('cont|' + L.id + '|' + nome + '|' + dia);
          var q = s === 0 && faltam[nome] ? ref * (0.25 + rr() * 0.55) : ref * (1.05 + rr() * 1.5);
          contagens.push({ id: idDe('c|' + L.id + '|' + nome + '|' + dia), data: dia, unidade: L.nome, item: nome, quantidade: arredMedida(q, medida), lancado_por: quemDaLoja(L, 'c' + dia + li) });
        }
        /* item que estava acabando foi conferido de novo no dia seguinte */
        var reconf = M.somaDias(diaGeral, 1);
        if (faltam[nome] && reconf < M.hoje() && M.hash(nome + L.id) % 2 === 0) {
          var r2 = M.rng('reconf|' + L.id + '|' + nome + '|' + reconf);
          contagens.push({ id: idDe('c|' + L.id + '|' + nome + '|' + reconf), data: reconf, unidade: L.nome, item: nome, quantidade: arredMedida(ref * (0.2 + r2() * 0.5), medida), lancado_por: quemDaLoja(L, 'r' + reconf + li) });
        }
      });

      /* itens cadastrados que ainda nao foram contados */
      if (li === 1) itens.push({ id: li * 100 + 61, unidade: L.nome, item: 'Molho de pimenta (galão)', medida: 'un', minimo: 2 });
      if (li === 2) itens.push({ id: li * 100 + 62, unidade: L.nome, item: 'Papel-toalha', medida: 'fardo', minimo: 2 });

      /* entradas de mercadoria dos ultimos 30 dias */
      ENTREGAS.forEach(function (e, ei) {
        var passo = e[1], desloc = (li * 2 + ei) % passo;
        for (var k = desloc; k < 30; k += passo) {
          var dia = M.dia(-k);
          var minuto = 8 * 60 + ((li * 37 + ei * 53) % 180);
          if (k === 0 && M.minutosAgora() < minuto) continue;
          e[2].forEach(function (nome) {
            var x = null; for (var i = 0; i < lista.length; i++) if (lista[i][0] === nome) x = lista[i];
            if (!x) return;
            var re = M.rng('ent|' + L.id + '|' + nome + '|' + dia);
            var q = x[2] * fator * (1.2 + re() * 1.2);
            entradas.push({
              id: idDe('e|' + L.id + '|' + nome + '|' + dia), data: dia, unidade: L.nome, item: nome,
              quantidade: arredMedida(x[2] >= 40 ? Math.round(q / 10) * 10 : q, x[1]),
              fornecedor: e[0], nota: re() < 0.8 ? String(10000 + Math.floor(re() * 89999)) : '',
              lancado_por: quemDaLoja(L, 'e' + dia + li), _min: minuto
            });
          });
        }
      });
    });
    return { itens: itens, contagens: contagens, entradas: entradas };
  }

  /* ---------------- base + o que a pessoa mudou nesta demonstracao ---------------- */
  function estado() {
    var b = base();
    var itensDel = ler('itens_del', []), contDel = ler('cont_del', []), entDel = ler('ent_del', []);
    var mudMin = ler('itens_mud', {});
    var itens = b.itens.concat(ler('itens', [])).filter(function (i) { return itensDel.indexOf(i.id) < 0; })
      .map(function (i) { var m = mudMin[i.id]; return m ? Object.assign({}, i, m) : i; });
    var contagens = b.contagens.concat(ler('cont', [])).filter(function (c) { return contDel.indexOf(c.id) < 0; });
    var entradas = b.entradas.concat(ler('ent', [])).filter(function (e) { return entDel.indexOf(e.id) < 0; });
    return { itens: itens, contagens: contagens, entradas: entradas };
  }
  /* corta a lista sem partir um dia ao meio: dias inteiros ate cerca de 'max' linhas (o primeiro dia sempre entra) */
  function diasInteiros(lista, max) {
    var r = [];
    for (var i = 0; i < lista.length; ) {
      var j = i; while (j < lista.length && lista[j].data === lista[i].data) j++;
      if (r.length && r.length + (j - i) > max) break;
      r = r.concat(lista.slice(i, j)); i = j;
    }
    return r;
  }
  function maisRecente(a, b) { return a.data !== b.data ? (a.data < b.data ? 1 : -1) : (a._ord || 0) !== (b._ord || 0) ? (b._ord || 0) - (a._ord || 0) : b.id - a.id; }

  function painel() {
    var e = estado();
    var ultima = {};
    e.contagens.slice().sort(maisRecente).forEach(function (c) {
      var k = chave(c.unidade, c.item);
      if (!ultima[k]) ultima[k] = c;
    });
    var itens = e.itens.map(function (i) {
      var c = ultima[chave(i.unidade, i.item)];
      var o = { id: i.id, unidade: i.unidade, item: i.item, medida: i.medida, minimo: i.minimo == null ? null : Number(i.minimo) };
      o.ultima = c ? Number(c.quantidade) : null;
      o.contado_em = c ? c.data : null;
      o.contado_por = c ? c.lancado_por : null;
      o.sem_contagem = !c;
      o.falta = !!(c && o.minimo != null && o.ultima < o.minimo);
      o.sugestao = o.falta ? arredMedida(Math.ceil((o.minimo * 2 - o.ultima) * 10) / 10, i.medida) : null;
      return o;
    }).sort(function (a, b) {
      return lojaIdx(a.unidade) - lojaIdx(b.unidade) || a.unidade.localeCompare(b.unidade, 'pt') || a.item.localeCompare(b.item, 'pt');
    });
    var trinta = M.dia(-30);
    function limpa(x) { var o = {}; for (var k in x) if (k.charAt(0) !== '_') o[k] = x[k]; return o; }
    var contagens = diasInteiros(e.contagens.filter(function (c) { return c.data >= trinta; }).sort(maisRecente), 30).map(limpa);
    var entradas = e.entradas.filter(function (x) { return x.data >= trinta; }).sort(maisRecente).map(limpa);
    return { itens: itens, entradas: entradas, contagens: contagens };
  }

  function exige(d, campos) {
    campos.forEach(function (c) { if (d[c] == null || String(d[c]).trim() === '') throw D.erro(400, 'Faltou preencher: ' + c, 'P0001'); });
  }

  D.rpc('estoque_consulta', function (b, ctx) {
    var acao = b.p_acao, d = b.p_dados || {};
    switch (acao) {
      case 'painel':
        return painel();

      case 'contar': {
        exige(d, ['unidade', 'item', 'quantidade']);
        var q = Number(d.quantidade);
        if (!(q >= 0)) throw D.erro(400, 'Quantidade inválida', 'P0001');
        var e = estado();
        var existe = e.itens.some(function (i) { return chave(i.unidade, i.item) === chave(d.unidade, d.item); });
        if (!existe) {   /* item contado pela primeira vez entra no controle, ainda sem minimo */
          var med = 'un';
          e.itens.forEach(function (i) { if (i.item.toLowerCase() === String(d.item).trim().toLowerCase()) med = i.medida; });
          var novos = ler('itens', []);
          novos.push({ id: proximoId(), unidade: d.unidade, item: String(d.item).trim(), medida: med, minimo: null });
          gravar('itens', novos);
        }
        var l = ler('cont', []);
        l.push({ id: proximoId(), data: d.data || M.hoje(), unidade: d.unidade, item: String(d.item).trim(), quantidade: q, lancado_por: d.lancado_por || ctx.nome, _ord: Date.now() });
        gravar('cont', l);
        return { ok: true };
      }

      case 'entrada': {
        exige(d, ['unidade', 'item', 'quantidade']);
        var qe = Number(d.quantidade);
        if (!(qe > 0)) throw D.erro(400, 'A quantidade tem que ser maior que zero', 'P0001');
        var le = ler('ent', []);
        le.push({ id: proximoId(), data: d.data || M.hoje(), unidade: d.unidade, item: String(d.item).trim(), quantidade: qe, fornecedor: d.fornecedor || '', nota: d.nota || '', lancado_por: d.lancado_por || ctx.nome, _ord: Date.now() });
        gravar('ent', le);
        return { ok: true };
      }

      case 'item_add': {
        exige(d, ['unidade', 'item']);
        var min = d.minimo === '' || d.minimo == null ? null : Number(d.minimo);
        var est = estado(), achou = null;
        est.itens.forEach(function (i) { if (chave(i.unidade, i.item) === chave(d.unidade, d.item)) achou = i; });
        if (achou) {   /* ja estava no controle: atualiza medida e minimo */
          var mud = ler('itens_mud', {});
          mud[achou.id] = { medida: d.medida || achou.medida, minimo: min };
          gravar('itens_mud', mud);
          var ln = ler('itens', []).map(function (i) { return i.id === achou.id ? Object.assign({}, i, mud[achou.id]) : i; });
          gravar('itens', ln);
          return { ok: true, atualizado: true };
        }
        var li = ler('itens', []);
        li.push({ id: proximoId(), unidade: d.unidade, item: String(d.item).trim(), medida: d.medida || 'un', minimo: min });
        gravar('itens', li);
        return { ok: true };
      }

      case 'item_del': {
        var id = Number(d.id);
        gravar('itens', ler('itens', []).filter(function (i) { return i.id !== id; }));
        var del = ler('itens_del', []); if (del.indexOf(id) < 0) del.push(id); gravar('itens_del', del);
        return { ok: true };
      }
      case 'del_contagem': {
        var idc = Number(d.id);
        gravar('cont', ler('cont', []).filter(function (c) { return c.id !== idc; }));
        var dc = ler('cont_del', []); if (dc.indexOf(idc) < 0) dc.push(idc); gravar('cont_del', dc);
        return { ok: true };
      }
      case 'del_entrada': {
        var ide = Number(d.id);
        gravar('ent', ler('ent', []).filter(function (x) { return x.id !== ide; }));
        var de = ler('ent_del', []); if (de.indexOf(ide) < 0) de.push(ide); gravar('ent_del', de);
        return { ok: true };
      }
    }
    throw D.erro(400, 'Ação não simulada na demonstração: ' + acao, 'P0001');
  });
})();
