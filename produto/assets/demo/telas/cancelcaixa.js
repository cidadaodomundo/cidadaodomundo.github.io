/* Cancelamentos no Caixa e Caixa dia a dia (demonstracao).
   Simula a rpc caixa_cancelamentos (leitura do periodo e acao "nomear") e a rpc caixa_cancel_dia.
   Itens tirados da comanda do salao, inventados de forma repetivel por dia e loja: as duas telas
   mostram os mesmos cancelamentos. Comandas canceladas inteiras seguem MUNDO.salao().cancelamentos_caixa.
   Logins do sistema de caixa: um login generico de caixa, os operadores de caixa (MUNDO.equipe setor Caixa),
   o gerente da loja (quem libera com senha), a equipe do salao (quem lanca) e um login so com numero.
   Valores em R$ e observacao do item so vao para o dono (ctx.admin). Nomes dados na tela ficam neste
   navegador (localStorage, prefixo demo_cancelcaixa_). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* regras de exemplo, configuraveis */
  var REGRAS = { janela_relancado_min: 20, folga_antes_min: 5, dias_leitura: 3, limite_itens: 250, limite_comandas: 60 };
  /* o dia a dia monta o resumo e cada dia a partir da lista: o limite precisa caber um mes inteiro */
  var LIMITE_DIA = 800;
  var ULTIMO_LANCE = 23 * 60 + 25; /* depois da meia-noite so se cancela: lancamento e abertura ficam antes do fechamento */
  var MOTIVOS = [[1, 'Cliente desistiu'], [2, 'Lançado errado'], [3, 'Demora no preparo'], [4, 'Item em falta'], [5, null]];
  var COMPL = {
    Burgers: ['Ponto: ao ponto', 'Ponto: bem passado', 'Sem cebola', 'Adicional de Bacon', 'Adicional de Cheddar', 'Pão australiano'],
    Acompanhamentos: ['Porção grande', 'Molho da casa'],
    Bebidas: ['Com gelo e limão', 'Sem açúcar'],
    Pratos: ['Arroz e fritas', 'Sem salada'],
    Sobremesas: ['Com calda extra']
  };
  var OBS = ['sem picles', 'cliente pediu para trocar', 'molho à parte', 'trocar por suco', 'mesa pediu tudo junto', 'para embalar'];
  var ABRE = 11 * 60 + 5; /* primeiro lancamento possivel do dia (regra de exemplo) */
  var CARD = M.cardapio.filter(function (c) { return c.categoria !== 'Adicionais'; });

  /* ---------------- utilitarios ---------------- */
  function dados(b) { return (b && b.p_dados) || {}; }
  function hojeOp() { return M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(); }
  function agoraTurno(dia) {
    var h = hojeOp();
    if (dia > h) return -1;
    if (dia < h) return 99999;
    return M.hoje() === dia ? M.minutosAgora() : M.minutosAgora() + 1440;
  }
  function quando(dia, min) { var t = M.ts(dia, min); return M.br(t.slice(0, 10)) + ' ' + t.slice(11, 16); }
  function arred(v) { return M.arred(v, 2); }
  function idxLoja(L) { for (var i = 0; i < M.lojas.length; i++) if (M.lojas[i].id === L.id) return i; return 0; }
  function primeiroDoMes(iso) { return iso.slice(0, 8) + '01'; }

  function lerNomes() { try { return JSON.parse(localStorage.getItem('demo_cancelcaixa_nomes') || '{}') || {}; } catch (e) { return {}; } }
  function gravarNomes(o) { try { localStorage.setItem('demo_cancelcaixa_nomes', JSON.stringify(o)); } catch (e) {} }
  function nomeDe(tipo, unidade, id, padrao) {
    var n = lerNomes(), k = tipo + '|' + unidade + '|' + id;
    if (Object.prototype.hasOwnProperty.call(n, k)) return n[k] ? n[k] : null;
    return padrao == null ? null : padrao;
  }

  /* ---------------- logins do sistema de caixa (por loja) ---------------- */
  var LOGINS = {};
  function logins(L) {
    if (LOGINS[L.id]) return LOGINS[L.id];
    var li = idxLoja(L), base = 3000 + li * 100;
    var eq = M.equipe.filter(function (p) { return p.loja === L.id; });
    function nm(p) { var s = p.nome.split(' '); return p.apelido + ' ' + s[s.length - 1].charAt(0) + '.'; }
    var o = { caixa: [], gerente: [], salao: [], todos: {} };
    function poe(lista, id, nome) { var x = { id: id, nome: nome }; lista.push(x); o.todos[id] = x; return x; }
    poe(o.caixa, base + 1, 'Caixa Salão');
    eq.filter(function (p) { return p.setor === 'Caixa'; }).forEach(function (p, i) { poe(o.caixa, base + 2 + i, nm(p)); });
    poe(o.caixa, base + 7, null); /* login que ainda nao ganhou nome */
    eq.filter(function (p) { return p.cargo === 'Gerente da loja'; }).forEach(function (p) { poe(o.gerente, base + 10, nm(p)); });
    if (!o.gerente.length) poe(o.gerente, base + 10, 'Gerência');
    poe(o.salao, base + 11, 'Atendimento');
    eq.filter(function (p) { return p.setor === 'Salão'; }).slice(0, 4).forEach(function (p, i) { poe(o.salao, base + 20 + i, nm(p)); });
    LOGINS[L.id] = o;
    return o;
  }

  /* ---------------- cancelamentos de um dia numa loja ---------------- */
  var CACHE = {};
  function semSenhaNaLoja(L) { return M.lojas.length >= 3 && idxLoja(L) === M.lojas.length - 1; }
  function diaSemVenda(dia, L) { return M.lojas.length > 1 && idxLoja(L) === 1 && dia === M.somaDias(hojeOp(), -9); }

  function horaCancel(r) {
    var x = r();
    if (x < 0.32) return M.entre(r, 11 * 60 + 40, 14 * 60 + 50);
    if (x < 0.95) return M.entre(r, 18 * 60 + 40, 23 * 60 + 40);
    return M.entre(r, 24 * 60 + 5, 24 * 60 + 50); /* depois da meia-noite: conta no dia do turno */
  }
  function minutosAposLancar(r) {
    return M.pesado(r, [[M.entre(r, 1, 9), 40], [M.entre(r, 10, 40), 38], [M.entre(r, 41, 95), 16], [M.entre(r, 120, 210), 6]]);
  }
  function senhaSorteada(r, L) {
    if (semSenhaNaLoja(L)) return 'sem';
    return M.pesado(r, [['outro', 72], ['propria', 10], ['sem', 18]]);
  }
  function novoItem(r, dia, L, base) {
    var lg = logins(L);
    var prod = M.escolhe(r, CARD);
    var qtd = r() < 0.12 ? 2 : 1;
    var cs = COMPL[prod.categoria] || [];
    var comp = cs.length && r() < (prod.categoria === 'Burgers' ? 0.45 : 0.18) ? M.escolhe(r, cs) : '';
    if (comp && prod.categoria === 'Burgers' && r() < 0.35) { var c2 = M.escolhe(r, cs); if (c2 !== comp) comp += ' · ' + c2; }
    var lancou = M.escolhe(r, lg.salao);
    var cancelou = base.cancelou || M.pesado(r, [[M.escolhe(r, lg.caixa), 72], [lancou, 22], [lg.gerente[0], 6]]);
    var senha = base.senha || senhaSorteada(r, L);
    if (senha === 'outro' && cancelou.id === lg.gerente[0].id) senha = 'propria';
    var autorizou = senha === 'outro' ? lg.gerente[0] : senha === 'propria' ? cancelou : null;
    var minutos = base.minutos != null ? base.minutos : minutosAposLancar(r);
    minutos = Math.max(1, Math.min(minutos, base.min - ABRE));
    if (base.min - minutos > ULTIMO_LANCE) minutos = base.min - ULTIMO_LANCE;
    var mot = base.motivo !== undefined ? base.motivo : M.pesado(r, [[1, 30], [2, 25], [3, 14], [4, 10], [5, 9], [0, 12]]);
    return {
      dia: dia, loja: L.id, unidade: L.nome, min: base.min, comanda: base.comanda, mesa: base.mesa,
      produto: prod.nome, complementos: comp, obs: r() < 0.2 ? M.escolhe(r, OBS) : '',
      qtd: qtd, valor: arred(prod.preco * qtd), lancado_min: base.min - minutos, minutos: minutos,
      lancou: lancou.id, cancelou: cancelou.id, senha: senha, autorizou: autorizou ? autorizou.id : null,
      motivo: mot || null, comanda_inteira: !!base.inteira,
      relancado: false, relancado_mesma: false
    };
  }

  function doDia(dia, L) {
    var k = dia + '|' + L.id;
    if (CACHE[k]) return CACHE[k];
    var r = M.rng('caixa-cancel|' + dia + '|' + L.id);
    var s = M.salao(dia, L.id);
    var ag = agoraTurno(dia);
    var out = { dia: dia, loja: L.id, unidade: L.nome, vendas: 0, salao: 0, itens: [], comandas: [] };
    if (ag < 0 || diaSemVenda(dia, L)) return (CACHE[k] = out);
    var deliv = M.pedidos(dia, L.id).length;
    out.salao = s.mesas;
    out.vendas = s.mesas + deliv;
    if (!s.mesas) return (CACHE[k] = out);
    var lg = logins(L), seq = 0;

    /* itens tirados de comandas abertas */
    var n = M.pesado(r, [[0, 14], [1, 24], [2, 24], [3, 18], [4, 12], [5, 8]]);
    if (r() > L.peso + 0.25) n = Math.max(0, n - 1);
    for (var i = 0; i < n; i++) {
      var min = horaCancel(r), mesa = M.entre(r, 1, 24);
      var it = novoItem(r, dia, L, { min: min, mesa: 'Mesa ' + mesa, comanda: dia + '|' + L.id + '|' + mesa + '|' + (++seq) });
      if (r() < 0.16) { it.relancado = true; it.relancado_mesma = r() < 0.6; }
      out.itens.push(it);
    }

    /* comandas canceladas inteiras (mesma conta da Central Salao) */
    var nc = s.cancelamentos_caixa;
    for (var c = 0; c < nc; c++) {
      var minC = horaCancel(r), mesaC = M.entre(r, 1, 24), linhas = M.pesado(r, [[0, 22], [1, 38], [2, 26], [3, 14]]);
      var quem = M.pesado(r, [[M.escolhe(r, lg.caixa), 88], [lg.gerente[0], 12]]);
      var aberta = Math.min(ULTIMO_LANCE - 15, Math.max(ABRE, minC - M.entre(r, 25, 110)));
      var chave = dia + '|' + L.id + '|' + mesaC + '|c' + (++seq);
      var senhaC = senhaSorteada(r, L), misto = r() < 0.2 && !semSenhaNaLoja(L);
      var its = [];
      for (var j = 0; j < linhas; j++) {
        var x = novoItem(r, dia, L, {
          min: minC, mesa: 'Mesa ' + mesaC, comanda: chave, inteira: true, cancelou: quem,
          senha: misto && j === linhas - 1 && linhas > 1 ? (senhaC === 'sem' ? 'outro' : 'sem') : senhaC,
          minutos: Math.max(1, minC - aberta - M.entre(r, 0, 15)), motivo: r() < 0.7 ? 1 : 0
        });
        its.push(x);
        out.itens.push(x);
      }
      out.comandas.push({ dia: dia, loja: L.id, unidade: L.nome, min: minC, aberta_min: aberta, mesa: 'Mesa ' + mesaC, itens: its, cancelou: quem.id });
    }

    /* hoje: so o que ja aconteceu */
    if (ag < 99999) {
      out.itens = out.itens.filter(function (x) { return x.min <= ag; });
      out.comandas = out.comandas.filter(function (x) { return x.min <= ag; });
    }
    CACHE[k] = out;
    return out;
  }

  /* ---------------- periodo e lojas pedidas ---------------- */
  function periodo(p) {
    var h = hojeOp();
    switch (String(p || '')) {
      case 'hoje': return [h, h];
      case 'ontem': var o = M.somaDias(h, -1); return [o, o];
      case '15': return [M.somaDias(h, -14), h];
      case '30': return [M.somaDias(h, -29), h];
      case 'mes': return [primeiroDoMes(h), h];
      case 'mespassado':
        var fim = M.somaDias(primeiroDoMes(h), -1);
        return [primeiroDoMes(fim), fim];
      default: return [M.somaDias(h, -6), h];
    }
  }
  function lojasPedidas(unidade) {
    if (unidade) { var L = M.loja(unidade); if (L) return [L]; }
    return M.lojas.slice();
  }
  function juntar(de, ate, lojas) {
    var dias = M.intervalo(de, ate).reverse(), res = { dias: [], itens: [], comandas: [] };
    dias.forEach(function (dia) {
      lojas.forEach(function (L) {
        var x = doDia(dia, L);
        res.dias.push(x);
        res.itens = res.itens.concat(x.itens);
        res.comandas = res.comandas.concat(x.comandas);
      });
    });
    function ordem(a, b) { return a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : b.min - a.min; }
    res.itens.sort(ordem);
    res.comandas.sort(ordem);
    return res;
  }

  /* ---------------- o que vai para a tela ---------------- */
  function loginNome(L, id) { var x = logins(L).todos[id]; return nomeDe('usuario', L.nome, id, x ? x.nome : null); }
  function motivoNome(L, id) { var m = MOTIVOS.filter(function (x) { return x[0] === id; })[0]; return nomeDe('motivo', L.nome, id, m ? m[1] : null); }
  function itemTela(it, dono) {
    var L = M.loja(it.loja);
    return {
      dia: it.dia, unidade: it.unidade, hora: quando(it.dia, it.min), mesa: it.mesa,
      produto: it.produto, complementos: it.complementos || null, obs: dono && it.obs ? it.obs : null,
      lancado: M.hm(it.lancado_min), lancou: it.lancou, lancou_nome: loginNome(L, it.lancou),
      qtd: it.qtd, valor: dono ? it.valor : null,
      cancelou: it.cancelou, cancelou_nome: loginNome(L, it.cancelou),
      senha: it.senha, autorizou: it.autorizou, autorizou_nome: it.autorizou == null ? null : loginNome(L, it.autorizou),
      motivo: it.motivo, motivo_nome: it.motivo == null ? null : motivoNome(L, it.motivo),
      comanda_inteira: it.comanda_inteira, relancado: it.relancado, relancado_mesma: it.relancado_mesma,
      minutos: it.minutos
    };
  }
  function soma(its, f) { return arred(its.reduce(function (a, x) { return a + (f ? (f(x) ? x.valor : 0) : x.valor); }, 0)); }

  function cartaoLoja(L, de, ate, res, dono) {
    var its = res.itens.filter(function (x) { return x.loja === L.id; });
    var cms = res.comandas.filter(function (x) { return x.loja === L.id; });
    var mexidas = {};
    its.forEach(function (x) { mexidas[x.comanda] = 1; });
    var li = idxLoja(L), h = hojeOp(), incluiHoje = ate === h;
    var ultimo = null;
    for (var d = h; d >= M.somaDias(h, -REGRAS.dias_leitura); d = M.somaDias(d, -1)) {
      var x = doDia(d, L);
      if (x.vendas > 0) {
        var ag = agoraTurno(d);
        var fim = ag < 99999 ? Math.min(ag, 25 * 60) : 23 * 60 + 20 + li * 7;
        ultimo = M.ts(d, fim - M.entre(M.rng('caixa-ate|' + d + '|' + L.id), 2, 18));
        break;
      }
    }
    var dias = M.intervalo(de, ate).length;
    return {
      unidade: L.nome,
      itens: its.length,
      unidades: its.reduce(function (a, x) { return a + x.qtd; }, 0),
      com_senha: its.filter(function (x) { return x.senha === 'outro'; }).length,
      senha_propria: its.filter(function (x) { return x.senha === 'propria'; }).length,
      sem_senha: its.filter(function (x) { return x.senha === 'sem'; }).length,
      valor: dono ? soma(its) : null,
      valor_sem_senha: dono ? soma(its, function (x) { return x.senha === 'sem'; }) : null,
      valor_senha_propria: dono ? soma(its, function (x) { return x.senha === 'propria'; }) : null,
      relancados: its.filter(function (x) { return x.relancado; }).length,
      valor_sem_relancados: dono ? soma(its, function (x) { return !x.relancado; }) : null,
      comandas_mexidas: Object.keys(mexidas).length,
      comandas_inteiras: cms.length,
      comandas_vazias: cms.filter(function (c) { return !c.itens.length; }).length,
      aguardando_venda: li === 1 && incluiHoje && doDia(h, L).salao > 0 ? 1 : 0,
      vendas_sem_itens: li === 0 && dias >= 7 ? 1 : 0,
      dados_ate: ultimo
    };
  }

  function pessoasELogins(L, its, dono) {
    var canc = {}, aut = {}, mot = {};
    its.forEach(function (x) {
      var c = canc[x.cancelou] || (canc[x.cancelou] = { unidade: L.nome, papel: 'cancelou', id: x.cancelou, nome: loginNome(L, x.cancelou), itens: 0, sem_senha: 0, senha_propria: 0, valor: 0 });
      c.itens++; c.valor += x.valor;
      if (x.senha === 'sem') c.sem_senha++;
      if (x.senha === 'propria') c.senha_propria++;
      if (x.autorizou != null) {
        var a = aut[x.autorizou] || (aut[x.autorizou] = { unidade: L.nome, papel: 'autorizou', id: x.autorizou, nome: loginNome(L, x.autorizou), itens: 0, senha_propria: 0, valor: 0 });
        a.itens++; a.valor += x.valor;
        if (x.senha === 'propria') a.senha_propria++;
      }
      var km = x.motivo == null ? 'sem' : x.motivo;
      var m = mot[km] || (mot[km] = { unidade: L.nome, id: x.motivo, nome: x.motivo == null ? null : motivoNome(L, x.motivo), itens: 0, valor: 0 });
      m.itens++; m.valor += x.valor;
    });
    function lista(o) {
      return Object.keys(o).map(function (k) { var v = o[k]; v.valor = dono ? arred(v.valor) : null; return v; })
        .sort(function (a, b) { return b.itens - a.itens; });
    }
    return { pessoas: lista(canc).concat(lista(aut)), motivos: lista(mot) };
  }

  function comandaTela(c, dono) {
    var L = M.loja(c.loja), its = c.itens;
    var senhas = its.reduce(function (a, x) { if (a.indexOf(x.senha) < 0) a.push(x.senha); return a; }, []);
    var quem = its.reduce(function (a, x) { if (a.indexOf(x.cancelou) < 0) a.push(x.cancelou); return a; }, []);
    if (!quem.length) quem = [c.cancelou];
    return {
      unidade: c.unidade, mesa: c.mesa, cancelada: quando(c.dia, c.min), aberta: quando(c.dia, c.aberta_min),
      linhas: its.length, qtd: its.reduce(function (a, x) { return a + x.qtd; }, 0),
      valor: dono ? soma(its) : null,
      cancelou: quem.map(function (id) { return { id: id, nome: loginNome(L, id) }; }),
      senha: senhas.length === 1 ? senhas[0] : senhas.length ? 'misto' : 'sem'
    };
  }

  /* ---------------- porta da tela Cancelamentos no Caixa ---------------- */
  D.rpc('caixa_cancelamentos', function (b, ctx) {
    var p = dados(b);
    if (p.acao === 'nomear') {
      if (!ctx.admin) throw D.erro(403, 'Só o dono pode dar nome aos logins e motivos.', '42501');
      var tipo = p.tipo === 'motivo' ? 'motivo' : 'usuario';
      var n = lerNomes();
      n[tipo + '|' + (p.unidade || '') + '|' + p.id] = String(p.nome || '').trim();
      gravarNomes(n);
      return { ok: true };
    }
    var dono = !!ctx.admin;
    var per = periodo(p.periodo), de = per[0], ate = per[1];
    var lojas = lojasPedidas(p.unidade);
    var res = juntar(de, ate, lojas);
    var pessoas = [], motivos = [];
    lojas.forEach(function (L) {
      var pm = pessoasELogins(L, res.itens.filter(function (x) { return x.loja === L.id; }), dono);
      pessoas = pessoas.concat(pm.pessoas);
      motivos = motivos.concat(pm.motivos);
    });
    var total = res.itens.length, totalC = res.comandas.length;
    return {
      de: de, ate: ate, modo: dono ? 'dono' : 'equipe', pode_nomear: dono, loja_fixa: null,
      unidade: lojas.length === 1 && p.unidade ? lojas[0].nome : null,
      regras: REGRAS,
      lojas: lojas.map(function (L) { return cartaoLoja(L, de, ate, res, dono); }),
      itens: res.itens.slice(0, REGRAS.limite_itens).map(function (x) { return itemTela(x, dono); }),
      total_itens: total, cortado: total > REGRAS.limite_itens,
      pessoas: pessoas, motivos: motivos,
      comandas: res.comandas.slice(0, REGRAS.limite_comandas).map(function (c) { return comandaTela(c, dono); }),
      comandas_total: totalC, comandas_cortado: totalC > REGRAS.limite_comandas
    };
  });

  /* ---------------- porta da tela Caixa dia a dia ---------------- */
  D.rpc('caixa_cancel_dia', function (b, ctx) {
    var p = dados(b), dono = !!ctx.admin;
    var per = periodo(p.periodo), de = per[0], ate = per[1];
    var lojas = lojasPedidas(p.unidade);
    var res = juntar(de, ate, lojas);
    var total = res.itens.length;
    return {
      de: de, ate: ate, hoje: hojeOp(), modo: dono ? 'dono' : 'equipe', loja_fixa: null,
      unidade: lojas.length === 1 && p.unidade ? lojas[0].nome : null,
      regras: { janela_relancado_min: REGRAS.janela_relancado_min, limite_itens: LIMITE_DIA },
      dias: res.dias.map(function (x) { return { dia: x.dia, unidade: x.unidade, vendas: x.vendas, salao: x.salao }; }),
      itens: res.itens.slice(0, LIMITE_DIA).map(function (x) { return itemTela(x, dono); }),
      total_itens: total, cortado: total > LIMITE_DIA
    };
  });
})();
