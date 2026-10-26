/* Central do Delivery (demonstracao)
   Tela: delivery/central.html (tambem ?embed=equipe, a aba Motoboys da Qualidade).
   Portas simuladas:
     rpc central_pedidos (base | detalhe), rpc escala_consulta (aderencia),
     rpc reentrega_consulta (listar | motivos | marcar);
     tabelas ifood_dim_loja, ifood_fato_cancelamento, ifood_fato_avaliacao,
     ifood_fato_negociacao, ifood_fato_super_status, ifood_previa_dia,
     cardapio_pausado, saipos_venda_status, saipos_vw_status_dia
     e as do sistema de entregas antigo (foody_*), usadas so com PDG_FOODY ligado.
   Tudo sai de MUNDO: mesmos pedidos, motoboys e equipe das outras telas. */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG || {};

  /* ---------------- datas e utilidades ---------------- */
  /* antes das 5h ainda vale o dia de ontem (dia operacional) */
  function ultimoDia() { return M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(); }
  function ehHoje(dia) { return dia === M.hoje(); }
  function diasAte(n) { var u = ultimoDia(); return M.intervalo(M.somaDias(u, -(n - 1)), u); }
  /* horario local sem fuso: 'AAAA-MM-DD HH:MM:SS' (min pode passar de 1440) */
  function lt(dia, min) { return M.ts(dia, min).slice(0, 19).replace('T', ' '); }
  function turnoDe(min) { return min < 15 * 60 ? 'Almoço' : min < 18 * 60 ? 'Tarde' : min < 24 * 60 ? 'Jantar' : 'Madrugada'; }
  function pedidosDia(dia, lojaId) { return dia > ultimoDia() ? [] : M.pedidos(dia, lojaId); }
  function canalNome(p) { return p.canal === 'ifood' ? 'iFood' : p.canal === 'proprio' ? 'Cardápio próprio' : 'Retirada no balcão'; }
  function brl(v) { return Math.round(v * 100) / 100; }

  /* ---------------- lojas no iFood (uma marca principal e uma marca extra por loja) ---------------- */
  var MARCA = C.marca || 'Restaurante';
  var MARCAS = [MARCA, MARCA + ' Express'];
  var DIM = [];
  M.lojas.forEach(function (l) {
    DIM.push({ id_loja: 'ifood-' + l.id, nome: MARCAS[0] + ' · ' + l.nome, unidade: l.nome, loja: l.id, marca: 0 });
    DIM.push({ id_loja: 'ifood-' + l.id + '-2', nome: MARCAS[1] + ' · ' + l.nome, unidade: l.nome, loja: l.id, marca: 1 });
  });
  function marcaDo(p) { return (M.hash('marca|' + p.id) % 10) < 3 ? 1 : 0; }
  function idLojaDo(p) { return 'ifood-' + p.loja + (marcaDo(p) ? '-2' : ''); }
  function idPedido(p) { return String(100000000 + (M.hash('idp|' + p.id) % 900000000)); }
  /* pedido sem Codigo de Coleta: canal proprio nunca tem; no iFood, poucos */
  function semCodigo(p) { return p.canal === 'proprio' || (p.canal === 'ifood' && (M.hash('sc|' + p.id) % 100) < 4); }

  D.tabela('ifood_dim_loja', function () {
    return DIM.map(function (x) { return { id_loja: x.id_loja, nome: x.nome, unidade: x.unidade }; });
  });

  /* ---------------- pedidos entregues, etapa por etapa ---------------- */
  function linhaPedido(p) {
    var r = M.rng('etapas|' + p.id);
    var espera = Math.max(1, p.min_saida - p.min_pronto);
    var desp = p.min_pronto + Math.round(espera * (0.2 + r() * 0.35));
    var ace = desp + Math.max(0, Math.round((p.min_saida - desp) * (0.3 + r() * 0.5)));
    if (ace > p.min_saida) ace = p.min_saida;
    var total = p.min_entrega - p.min_pedido;
    var atraso = total - p.prazo_min;
    return {
      dia_operacional: p.dia, unidade: p.unidade, turno: turnoDe(p.min_pedido),
      entregador: p.motoboy_nome, motoboy_chave: 'mb-' + p.motoboy_id,
      n_pedido: String(p.numero), id_ifood: p.numero_ifood, canal: canalNome(p),
      data_hora_pedido: lt(p.dia, p.min_pedido), dt_pronto: lt(p.dia, p.min_pronto),
      dt_despachado: lt(p.dia, desp), dt_aceite: lt(p.dia, ace),
      dt_coletado: lt(p.dia, p.min_saida), dt_entregue: lt(p.dia, p.min_entrega),
      entrega_prometida: lt(p.dia, p.min_pedido + p.prazo_min), prazo_prometido_min: p.prazo_min,
      atraso_real_min: atraso, no_prazo_real: atraso <= 0, t_total_min: total, t_aceite_min: ace - desp,
      raio_km: p.distancia_km, sem_codigo: semCodigo(p)
    };
  }
  var cacheDet = {};
  function detalhe(dia) {
    if (!ehHoje(dia) && cacheDet[dia]) return cacheDet[dia];
    var out = [];
    M.lojas.forEach(function (l) {
      pedidosDia(dia, l.id).forEach(function (p) {
        if (p.canal === 'retirada' || p.cancelado || p.status !== 'entregue' || !p.motoboy_id) return;
        out.push(linhaPedido(p));
      });
    });
    if (!ehHoje(dia)) cacheDet[dia] = out;
    return out;
  }
  /* resumo por dia, loja e turno (base para comparar com o mesmo dia da semana) */
  function base() {
    var out = [];
    diasAte(35).forEach(function (dia) {
      var g = {};
      detalhe(dia).forEach(function (p) {
        var k = p.unidade + '|' + p.turno;
        var o = g[k] = g[k] || { dia_operacional: dia, unidade: p.unidade, turno: p.turno, n: 0, n_ok: 0 };
        o.n++; if (p.no_prazo_real) o.n_ok++;
      });
      for (var k in g) out.push(g[k]);
    });
    return out;
  }
  D.rpc('central_pedidos', function (b) {
    var a = b && b.p_acao;
    if (a === 'base') return base();
    if (a === 'detalhe') return b.p_dia ? detalhe(String(b.p_dia).slice(0, 10)) : [];
    throw D.erro(400, 'ação desconhecida: ' + a);
  });

  /* ---------------- escala x chegada (aderencia) ---------------- */
  D.rpc('escala_consulta', function (b) {
    var a = b && b.p_acao, d = (b && b.p_dados) || {};
    if (a !== 'aderencia') throw D.erro(400, 'ação desconhecida: ' + a);
    var de = String(d.de || M.dia(-7)).slice(0, 10), ate = String(d.ate || M.hoje()).slice(0, 10);
    if (ate > ultimoDia()) ate = ultimoDia();
    var out = [];
    M.intervalo(de, ate).forEach(function (dia) {
      M.lojas.forEach(function (l) {
        var ps = pedidosDia(dia, l.id).filter(function (p) { return p.status === 'entregue' && p.motoboy_id; });
        M.motoboys.filter(function (m) { return m.loja === l.id; }).forEach(function (mb) {
          var r = M.rng('escala|' + dia + '|' + mb.id);
          var noite = r() < (mb.fixo ? 0.6 : 0.4);
          var ent = noite ? 18 * 60 : 11 * 60;
          var minhas = ps.filter(function (p) { return p.motoboy_id === mb.id && (noite ? p.min_pedido >= 17 * 60 : p.min_pedido < 17 * 60); });
          var st = M.pesado(r, [['No horário', 74], ['Atrasado', 16], ['Muito atrasado', 5], ['Sem check-in', 5]]);
          if (!minhas.length) st = 'Faltou';
          if (ehHoje(dia) && ent > M.minutosAgora()) st = 'Sem check-in';
          var atraso = st === 'No horário' ? M.entre(r, -10, 5) : st === 'Atrasado' ? M.entre(r, 6, 20) : st === 'Muito atrasado' ? M.entre(r, 21, 50) : null;
          out.push({
            dia_op: dia, unidade: l.nome, turno: noite ? 'Jantar' : 'Almoço', nome: mb.nome,
            entrada: M.hm(ent) + ':00', chegada_efetiva: atraso == null ? null : M.ts(dia, ent + atraso),
            fonte_chegada: atraso == null ? null : 'primeira coleta', atraso_min: atraso, status: st,
            entregas: st === 'Faltou' || st === 'Sem check-in' ? 0 : minhas.length
          });
        });
      });
    });
    return { aderencia: out };
  });

  /* ---------------- reentregas ---------------- */
  var MOTIVOS_REE = [
    { motivo: 'Faltou item na sacola', familia: 'DESPACHO' },
    { motivo: 'Pedido trocado na expedição', familia: 'DESPACHO' },
    { motivo: 'Bebida esquecida', familia: 'DESPACHO' },
    { motivo: 'Lanche montado errado', familia: 'COZINHA' },
    { motivo: 'Ponto da carne errado', familia: 'COZINHA' },
    { motivo: 'Item com qualidade ruim', familia: 'COZINHA' },
    { motivo: 'Cliente pediu de novo (sem erro da loja)', familia: 'CLIENTE' },
    { motivo: 'Endereço errado informado pelo cliente', familia: 'CLIENTE' }
  ];
  function familiaDe(m) { for (var i = 0; i < MOTIVOS_REE.length; i++) if (MOTIVOS_REE[i].motivo === m) return MOTIVOS_REE[i].familia; return null; }

  var CHAVE_REE = 'demo_central_reentrega';
  var MARC = (function () { try { return JSON.parse(localStorage.getItem(CHAVE_REE) || '{}') || {}; } catch (e) { return {}; } })();
  function gravaMarc() { try { localStorage.setItem(CHAVE_REE, JSON.stringify(MARC)); } catch (e) {} }

  function naHora(lista, min) {
    var m = min % 1440;
    return lista.filter(function (e) {
      var a = M.minDe(e.entrada), b = M.minDe(e.saida);
      if (b < a) return m >= a || m <= b;
      return m >= a && m <= b;
    });
  }
  function nomes(lista, r, n) {
    var l = lista.slice(), out = [];
    while (l.length && out.length < n) out.push(l.splice(Math.floor(r() * l.length), 1)[0].nome);
    return out;
  }
  var cacheRee = {};
  function reeDia(dia, L) {
    var k = dia + '|' + L.id;
    if (!ehHoje(dia) && cacheRee[k]) return cacheRee[k];
    var r = M.rng('ree|' + k);
    var ps = pedidosDia(dia, L.id).filter(function (p) { return p.canal !== 'retirada' && p.status === 'entregue' && p.min_pedido < 21 * 60 + 30; });
    var out = [], recente = dia >= M.dia(-1);
    var n = ps.length ? M.pesado(r, recente ? [[0, 12], [1, 38], [2, 32], [3, 18]] : [[0, 36], [1, 36], [2, 19], [3, 9]]) : 0;
    var coz = M.equipe.filter(function (e) { return e.loja === L.id && e.setor === 'Cozinha'; });
    var exp = M.equipe.filter(function (e) { return e.loja === L.id && e.setor === 'Delivery'; });
    var mbs = M.motoboys.filter(function (m) { return m.loja === L.id; });
    for (var i = 0; i < n; i++) {
      var par = M.escolhe(r, ps);
      var depois = M.entre(r, 22, 150);
      var min = par.min_pedido + depois;
      var tipo = r() < 0.45 ? 'hash' : 'endereco';
      var semPar = tipo === 'hash' && r() < 0.3;
      var mesmo = tipo === 'endereco' ? (r() < 0.7 ? true : null) : (r(), true); /* com #: e o mesmo pedido relancado, mesmo cliente */
      var mo = r() < (recente ? 0.45 : 0.85) ? M.escolhe(r, MOTIVOS_REE) : null;
      var cz = naHora(coz, min), dp = naHora(exp, min);
      var eqC = nomes(cz.length ? cz : coz, r, 3), eqD = nomes(dp.length ? dp : exp, r, 2);
      var fam = mo ? mo.familia : null;
      var eq = fam === 'COZINHA' ? eqC : fam === 'DESPACHO' ? eqD : null;
      var resp = eq && eq.length && r() < 0.5 ? M.escolhe(r, eq) : null;
      var outro = M.iniciais(r);
      var canal = tipo === 'hash' ? 'Lançado pela loja (#)' : M.pesado(r, [['iFood', 70], ['Cardápio próprio', 20], ['Telefone', 10]]);
      var num = tipo === 'hash' ? '#' + par.numero : String(2000 + M.entre(r, 1, 999));
      var mb = mbs.length ? M.escolhe(r, mbs) : null;
      if (ehHoje(dia) && min > M.minutosAgora()) continue; /* ainda nao aconteceu */
      out.push({
        dia_operacional: dia, unidade: L.nome, turno: turnoDe(min), data_hora_pedido: lt(dia, min),
        n_pedido: num, canal: canal,
        cliente_ini: mesmo === true ? par.cliente : mesmo === false ? outro : null,
        entregador: mb ? mb.nome : null,
        par_n_pedido: semPar ? null : String(par.numero), par_data_hora: semPar ? null : lt(dia, par.min_pedido),
        par_minutos: semPar ? null : depois, par_canal: semPar ? null : canalNome(par),
        par_entregador: semPar ? null : par.motoboy_nome, par_cliente_ini: semPar ? null : par.cliente,
        mesmo_cliente: semPar ? null : mesmo, endereco: semPar ? null : par.endereco + ' · ' + par.bairro,
        detectada_por_endereco: tipo === 'endereco',
        motivo: mo ? mo.motivo : null, familia: fam, responsavel: resp,
        equipe_cozinha: eqC, equipe_despacho: eqD
      });
    }
    if (!ehHoje(dia)) cacheRee[k] = out;
    return out;
  }
  function comMarca(x) {
    var m = MARC[x.unidade + '|' + x.data_hora_pedido];
    if (!m) return x;
    var o = {}; for (var k in x) o[k] = x[k];
    o.motivo = m.motivo || null; o.familia = familiaDe(o.motivo); o.responsavel = m.responsavel || null;
    return o;
  }
  function reeLista(de) {
    var out = [];
    M.intervalo(de, ultimoDia()).forEach(function (dia) {
      M.lojas.forEach(function (L) { out = out.concat(reeDia(dia, L).map(comMarca)); });
    });
    return out.sort(function (a, b) { return a.data_hora_pedido < b.data_hora_pedido ? 1 : -1; });
  }
  function acharRee(unidade, dh) {
    var L = M.loja(unidade); if (!L) return null;
    var d0 = String(dh).slice(0, 10), achado = null;
    [d0, M.somaDias(d0, -1)].forEach(function (dia) {
      if (achado || dia > ultimoDia()) return;
      reeDia(dia, L).forEach(function (x) { if (x.data_hora_pedido === dh) achado = comMarca(x); });
    });
    return achado;
  }
  D.rpc('reentrega_consulta', function (b) {
    var a = b && b.p_acao, d = (b && b.p_dados) || {};
    if (a === 'motivos') return MOTIVOS_REE.map(function (m) { return { motivo: m.motivo, familia: m.familia }; });
    if (a === 'listar') return reeLista(String(d.de || M.dia(-35)).slice(0, 10));
    if (a === 'marcar') {
      var atual = acharRee(d.unidade, d.data_hora_pedido);
      if (!atual) throw D.erro(404, 'pedido não encontrado');
      var mot = d.motivo || null;
      var resp = Object.prototype.hasOwnProperty.call(d, 'responsavel') ? (d.responsavel || null)
        : (atual.motivo === mot ? atual.responsavel : null);
      MARC[d.unidade + '|' + d.data_hora_pedido] = { motivo: mot, responsavel: resp };
      gravaMarc();
      return { ok: true };
    }
    throw D.erro(400, 'ação desconhecida: ' + a);
  });

  /* ---------------- cancelamentos do iFood ---------------- */
  var MAPA_CANC = {
    'Cliente desistiu': 'CLIENTE DESISTIU DO PEDIDO', 'Pedido em duplicidade': 'PEDIDO EM DUPLICIDADE',
    'Item indisponível': 'ITEM INDISPONÍVEL NO MOMENTO', 'Endereço fora da área': 'ENDEREÇO FORA DA ÁREA DE ENTREGA',
    'Demora na entrega': 'O PEDIDO ESTÁ DEMORANDO', 'Problema no pagamento': 'PROBLEMA COM O PAGAMENTO'
  };
  var POS_ENTREGA = [
    ['PEDIDO VEIO ERRADO', 'coz', 14], ['PARTE DO ITEM NÃO FOI ENVIADO', 'coz', 10],
    ['ITEM COM CARACTERÍSTICA DE QUALIDADE RUIM', 'coz', 7], ['PEDIDO REVIRADO/VIOLADO', 'des', 7],
    ['O PEDIDO NÃO FOI ENTREGUE', 'nr', 6], ['CLIENTE NÃO LOCALIZADO', 'nr', 5],
    ['NINGUÉM PODERÁ RECEBER O PEDIDO', 'nr', 3], ['O ENDEREÇO ESTÁ INCOMPLETO E O CLIENTE NÃO ATENDE', 'nr', 2]
  ];
  function itensTxt(p) { return p.itens.map(function (i) { return i.qtd + 'x ' + i.nome; }).join(' · '); }
  var cacheCanc = {};
  function cancDia(dia) {
    if (!ehHoje(dia) && cacheCanc[dia]) return cacheCanc[dia];
    var out = [];
    M.lojas.forEach(function (l) {
      var ps = pedidosDia(dia, l.id).filter(function (p) { return p.canal === 'ifood'; });
      ps.forEach(function (p) {
        if (!p.cancelado) return;
        var r = M.rng('canc|' + p.id);
        var mot = MAPA_CANC[p.motivo_cancelamento] || 'CLIENTE DESISTIU DO PEDIDO';
        var cont = mot === 'O PEDIDO ESTÁ DEMORANDO' && r() < 0.6;
        out.push(linhaCanc(p, dia, mot, itensTxt(p), p.total, cont, cont && dia < M.dia(-2) && r() < 0.5));
      });
      var entregues = ps.filter(function (p) { return p.status === 'entregue'; });
      var r2 = M.rng('pos|' + dia + '|' + l.id);
      var n = entregues.length ? M.pesado(r2, [[0, 30], [1, 38], [2, 22], [3, 10]]) : 0;
      for (var i = 0; i < n; i++) {
        var p = M.escolhe(r2, entregues);
        var x = M.pesado(r2, POS_ENTREGA.map(function (m) { return [m, m[2]]; }));
        var parte = x[0] === 'PARTE DO ITEM NÃO FOI ENVIADO';
        var it = p.itens[Math.floor(r2() * p.itens.length)];
        var cont = r2() < (x[1] === 'nr' ? 0.65 : 0.35);
        var jaCont = cont && dia < M.dia(-2) && r2() < 0.5;
        out.push(linhaCanc(p, dia, x[0], parte ? it.qtd + 'x ' + it.nome : itensTxt(p), parte ? it.preco * it.qtd : p.total, cont, jaCont));
      }
    });
    if (!ehHoje(dia)) cacheCanc[dia] = out;
    return out;
  }
  function linhaCanc(p, dia, motivo, itens, valorCanc, contestavel, contestou) {
    return {
      id_loja: idLojaDo(p), id_pedido: idPedido(p), data: dia, turno: turnoDe(p.min_pedido), motivo: motivo,
      itens_cancelados: itens, valor_cancelamento: brl(valorCanc), valor_pedido: brl(p.total),
      contestavel: !!contestavel, loja_contestou: !!contestou,
      data_limite_contestacao: M.somaDias(dia, 7) + 'T23:59:00-03:00'
    };
  }
  D.tabela('ifood_fato_cancelamento', function () {
    var out = [];
    diasAte(38).forEach(function (dia) { out = out.concat(cancDia(dia)); });
    return out;
  });

  /* ---------------- avaliacoes do iFood (publicadas ate ontem) ---------------- */
  var TAGS_BOAS = ['Saboroso', 'Bem embalado', 'Entrega rápida', 'Chegou quentinho'];
  var TAGS_RUINS = ['Comida fria', 'Demorou', 'Pedido errado', 'Faltou item', 'Embalagem ruim'];
  function tagsDe(p, r) {
    var c = p.comentario || '';
    if (p.nota >= 4) return r() < 0.5 ? [M.escolhe(r, TAGS_BOAS)] : [];
    var t = [];
    if (/frio|morna/i.test(c)) t.push('Comida fria');
    if (/emor/i.test(c)) t.push('Demorou');
    if (/errado/i.test(c)) t.push('Pedido errado');
    if (/faltou/i.test(c)) t.push('Faltou item');
    if (/endereço/i.test(c)) t.push('Entregador não achou o endereço');
    if (!t.length) t.push(M.escolhe(r, TAGS_RUINS));
    return t;
  }
  D.tabela('ifood_fato_avaliacao', function () {
    var out = [], ate = M.dia(-1);
    M.intervalo(M.dia(-16), ate).forEach(function (dia) {
      M.lojas.forEach(function (l) {
        pedidosDia(dia, l.id).forEach(function (p) {
          if (p.canal !== 'ifood' || p.nota == null) return;
          var r = M.rng('aval|' + p.id);
          out.push({ id_loja: idLojaDo(p), data_avaliacao: dia, nota: p.nota, tags: tagsDe(p, r), comentario: p.comentario || null });
        });
      });
    });
    return out;
  });

  /* ---------------- chamados (negociacao) do iFood ---------------- */
  var FALA = {
    'PEDIDO ATRASADO': ['Meu pedido está atrasado, já passou do horário.', 'Pedimos desculpas! O pedido já saiu e chega em poucos minutos.'],
    'FALTOU ITEM': ['Faltou um item no meu pedido.', 'Sentimos muito. Vamos resolver agora mesmo.'],
    'PEDIDO ERRADO': ['Veio um lanche diferente do que eu pedi.', 'Desculpe pelo erro! Vamos corrigir.'],
    'QUERO CANCELAR O PEDIDO': ['Quero cancelar, está demorando demais.', 'Seu pedido já está pronto e saindo. Podemos manter?'],
    'ALTERAR ENDEREÇO': ['Consigo trocar o número da casa?', 'Sim! Já avisamos o entregador.'],
    'DÚVIDA SOBRE O PEDIDO': ['O lanche vem com molho à parte?', 'Vem sim, em potinho separado.']
  };
  var RESPOSTA = {
    'PEDIDO ATRASADO': ['INFORMOU NOVO PRAZO'], 'FALTOU ITEM': ['ENVIOU O ITEM QUE FALTOU', 'OFERECEU REEMBOLSO PARCIAL'],
    'PEDIDO ERRADO': ['OFERECEU REEMBOLSO PARCIAL', 'ENVIOU O ITEM CORRETO'], 'QUERO CANCELAR O PEDIDO': ['INFORMOU NOVO PRAZO', 'ACEITOU CANCELAR'],
    'ALTERAR ENDEREÇO': ['ATUALIZOU O ENDEREÇO'], 'DÚVIDA SOBRE O PEDIDO': ['RESPONDEU A DÚVIDA']
  };
  var EVITA = { 'INFORMOU NOVO PRAZO': 1, 'ENVIOU O ITEM QUE FALTOU': 1, 'OFERECEU REEMBOLSO PARCIAL': 1, 'ENVIOU O ITEM CORRETO': 1 };
  var cacheCha = {};
  function chamadosDia(dia) {
    if (!ehHoje(dia) && cacheCha[dia]) return cacheCha[dia];
    var out = [];
    M.lojas.forEach(function (l) {
      pedidosDia(dia, l.id).forEach(function (p) {
        if (p.canal !== 'ifood') return;
        var r = M.rng('cham|' + p.id);
        var atrasado = (p.atraso_min || 0) > 10;
        var ruim = p.nota != null && p.nota <= 2;
        var prob = p.cancelado ? 0.5 : atrasado ? 0.3 : ruim ? 0.4 : 0.025;
        if (r() >= prob) return;
        var c = p.comentario || '';
        var mot = p.cancelado ? 'QUERO CANCELAR O PEDIDO' : atrasado ? 'PEDIDO ATRASADO'
          : /faltou/i.test(c) ? 'FALTOU ITEM' : /errado/i.test(c) ? 'PEDIDO ERRADO'
          : M.escolhe(r, ['ALTERAR ENDEREÇO', 'DÚVIDA SOBRE O PEDIDO', 'PEDIDO ATRASADO', 'FALTOU ITEM']);
        var semResp = r() < 0.12;
        var resp = semResp ? 'NÃO RESPONDEU' : M.escolhe(r, RESPOSTA[mot]);
        var evitou = !p.cancelado && !!EVITA[resp] && r() < 0.85;
        var f = FALA[mot];
        var chat = [{ autor: 'Cliente', texto: f[0] }], voltou = false;
        if (!semResp) {
          chat.push({ autor: 'Loja', texto: f[1] });
          if (r() < 0.6) { voltou = true; chat.push({ autor: 'Cliente', texto: evitou ? 'Combinado, obrigado!' : 'Ok.' }); }
        }
        out.push({
          id_loja: idLojaDo(p), id_pedido: idPedido(p), data: dia, motivo: mot, quem_iniciou: 'CLIENTE',
          resposta_loja: resp, resposta_cliente: semResp ? (p.cancelado ? 'CANCELOU' : 'SEM RESPOSTA') : evitou ? 'ACEITOU' : voltou ? 'RESPONDEU' : 'SEM RESPOSTA',
          cancelamento_evitado: evitou, chat: chat
        });
      });
    });
    if (!ehHoje(dia)) cacheCha[dia] = out;
    return out;
  }
  D.tabela('ifood_fato_negociacao', function () {
    var out = [];
    diasAte(32).forEach(function (dia) { out = out.concat(chamadosDia(dia)); });
    return out;
  });

  /* ---------------- selo Super Restaurante (por marca) ---------------- */
  D.tabela('ifood_fato_super_status', function () {
    var seg = M.hoje(); while (M.diaSemana(seg) !== 1) seg = M.somaDias(seg, -1);
    return DIM.map(function (x) {
      var r = M.rng('super|' + x.id_loja);
      var L = M.loja(x.loja) || { peso: 0.6 };
      var nivel = M.pesado(r, [[4, 30], [3, 35], [2, 25], [1, 10]]);
      return {
        tipo: 'nivel_atual', id_loja: x.id_loja, nome: x.nome, nivel: nivel, e_super: nivel >= 3 && r() < 0.85,
        total_pedidos: Math.round((x.marca ? 900 : 3600) * L.peso * (0.85 + r() * 0.3)),
        media_avaliacoes: M.arred(4.5 + r() * 0.4, 1), pct_cancelamento: M.arred(0.004 + r() * 0.016, 4),
        pct_chamados: M.arred(0.01 + r() * 0.03, 4), atualizado_em: seg + 'T08:00:00-03:00'
      };
    });
  });

  /* ---------------- previa do dia (tela do iFood, capturas ao longo do dia) ---------------- */
  D.tabela('ifood_previa_dia', function () {
    var out = [], agora = M.minutosAgora();
    var horas = [9, 12, 15, 18, 21].map(function (h) { return h * 60; });
    [-2, -1, 0].forEach(function (k) {
      var dia = M.dia(k);
      var ult = k < 0 ? horas[horas.length - 1] : horas.filter(function (h) { return h <= agora; }).pop();
      if (ult == null) return;
      M.lojas.forEach(function (l) {
        var r = M.rng('previa|' + dia + '|' + l.id + '|' + ult);
        var ps = M.pedidos(dia, l.id).filter(function (p) { return p.canal === 'ifood' && p.min_pedido <= ult; });
        out.push({
          data: dia, unidade: l.nome, cancelamentos_hoje: ps.filter(function (p) { return p.cancelado; }).length,
          chamados_abertos: M.entre(r, 0, 3), avaliacoes_sem_resposta: M.entre(r, 0, 6), capturado_em: M.ts(dia, ult)
        });
      });
    });
    return out;
  });

  /* ---------------- itens pausados no cardapio online ---------------- */
  D.tabela('cardapio_pausado', function () {
    var hojeOp = new Date(Date.now() - 7 * 36e5).toISOString().slice(0, 10); /* mesmo "hoje" da tela */
    var r = M.rng('pausados|' + hojeOp);
    var out = [];
    M.lojas.forEach(function (l) {
      var n = M.entre(r, 1, 3), vistos = {};
      for (var i = 0; i < n; i++) {
        var it = M.escolhe(r, M.cardapio);
        if (vistos[it.nome]) continue;
        vistos[it.nome] = 1;
        var idade = M.pesado(r, [[0, 45], [1, 25], [3, 18], [6, 12]]);
        out.push({
          canal: r() < 0.75 ? 'iFood' : 'Accon', unidade: l.nome, marca: MARCAS[r() < 0.7 ? 0 : 1], item: it.nome,
          tipo: it.categoria === 'Adicionais' ? 'Complemento' : 'Produto', estado: r() < 0.8 ? 'Pausado' : 'Escondido',
          primeiro_visto: M.somaDias(hojeOp, -idade), visto_em: hojeOp
        });
      }
    });
    /* o tablet de mesa aparece em outra tela; aqui o filtro da tela deixa de fora */
    out.push({ canal: 'Goomer', unidade: M.lojas[0].nome, marca: MARCAS[0], item: M.cardapio[20].nome, tipo: 'Produto', estado: 'Pausado', primeiro_visto: hojeOp, visto_em: hojeOp });
    return out;
  });

  /* ---------------- Saipos: status das vendas ---------------- */
  D.tabela('saipos_venda_status', function () {
    var out = [];
    diasAte(10).forEach(function (dia) {
      M.lojas.forEach(function (l) {
        pedidosDia(dia, l.id).forEach(function (p) {
          if (!p.cancelado && !semCodigo(p)) return;
          out.push({
            unidade: l.nome, dia_operacional: dia, n_pedido: String(p.numero), cancelado: !!p.cancelado,
            itens_cancelados: p.cancelado ? itensTxt(p) : null,
            canal: p.canal === 'ifood' ? 'iFood · ' + MARCAS[marcaDo(p)] : p.canal === 'proprio' ? 'Cardápio próprio' : ''
          });
        });
      });
    });
    return out;
  });
  D.tabela('saipos_vw_status_dia', function () {
    var out = [];
    diasAte(10).forEach(function (dia) {
      M.lojas.forEach(function (l) {
        var ps = pedidosDia(dia, l.id);
        if (!ps.length) return;
        var c = ps.filter(function (p) { return p.cancelado; }).length;
        out.push({ dia_operacional: dia, unidade: l.nome, vendas: ps.length - c, cancelados: c });
      });
    });
    return out;
  });

  /* ---------------- sistema de entregas antigo (so com PDG_FOODY ligado) ---------------- */
  function porMotoboy(dia) {
    var g = {};
    detalhe(dia).forEach(function (p) {
      var k = p.unidade + '|' + p.entregador;
      var o = g[k] = g[k] || { dia_operacional: dia, unidade: p.unidade, entregador: p.entregador, entregas: 0, no_prazo: 0, atrasos: 0, atraso_mais_10: 0, sem_codigo: 0, alm: 0, jan: 0, ini: null, fim: null };
      o.entregas++;
      if (p.no_prazo_real) o.no_prazo++; else o.atrasos++;
      if (p.atraso_real_min > 10) o.atraso_mais_10++;
      if (p.sem_codigo) o.sem_codigo++;
      if (p.turno === 'Almoço' || p.turno === 'Tarde') o.alm++; else o.jan++;
      if (!o.ini || p.dt_coletado < o.ini) o.ini = p.dt_coletado;
      if (!o.fim || p.dt_entregue > o.fim) o.fim = p.dt_entregue;
    });
    return Object.keys(g).map(function (k) {
      var o = g[k], L = M.loja(o.unidade);
      var h = (new Date(o.fim.replace(' ', 'T')) - new Date(o.ini.replace(' ', 'T'))) / 36e5;
      o.horas = M.arred(Math.min(10, Math.max(2, h + 0.5)), 1);
      o.turno = o.alm >= o.jan ? 'Almoço' : 'Jantar';
      o.id_loja = 'ifood-' + (L ? L.id : '');
      return o;
    });
  }
  function fechados(n) { return diasAte(n).filter(function (d) { return d < M.hoje(); }); }
  D.tabela('foody_fato_fechamento_turno_dia', function () {
    var out = [];
    fechados(31).forEach(function (dia) {
      porMotoboy(dia).forEach(function (o) {
        out.push({ id_loja: o.id_loja, unidade: o.unidade, dia_operacional: dia, turno: o.turno, entregador: o.entregador, horas: o.horas, entregas: o.entregas, no_prazo: o.no_prazo, atrasos: o.atrasos, sem_codigo: o.sem_codigo });
      });
    });
    return out;
  });
  D.tabela('foody_vw_pagamento_dia', function (ctx) {
    var out = [];
    fechados(31).forEach(function (dia) {
      porMotoboy(dia).forEach(function (o) {
        out.push({
          dia_operacional: dia, unidade: o.unidade, nome: o.entregador, horas: o.horas, horas_qr: o.horas,
          entregas: o.entregas, atrasos: o.atrasos, no_prazo: o.no_prazo, sem_codigo: o.sem_codigo,
          /* valor feito no dia (regra de exemplo, configuravel): so o dono ve */
          fez: ctx.admin ? brl(Math.max(60, o.entregas * 7.5)) : null
        });
      });
    });
    return out;
  });
  D.tabela('foody_vw_prazo_real_dia', function () {
    var out = [];
    diasAte(31).forEach(function (dia) {
      porMotoboy(dia).forEach(function (o) {
        out.push({ dia_operacional: dia, unidade: o.unidade, entregador: o.entregador, entregas: o.entregas, no_prazo: o.no_prazo, atrasos: o.atrasos, atraso_mais_10: o.atraso_mais_10 });
      });
    });
    return out;
  });
  D.tabela('foody_fato_pedido_sem_codigo', function () {
    var out = [];
    diasAte(31).forEach(function (dia) {
      detalhe(dia).forEach(function (p) {
        if (!p.sem_codigo) return;
        var L = M.loja(p.unidade);
        out.push({ id_loja: 'ifood-' + (L ? L.id : ''), unidade: p.unidade, dia_operacional: dia, turno: p.turno, entregador: p.entregador, n_pedido: p.n_pedido, hora_pedido: p.data_hora_pedido });
      });
    });
    return out;
  });
  D.tabela('foody_vw_entregas_dia', function () {
    var out = [];
    diasAte(31).forEach(function (dia) {
      var g = {};
      detalhe(dia).forEach(function (p) {
        var o = g[p.unidade] = g[p.unidade] || { dia_operacional: dia, unidade: p.unidade, entregas: 0, pedidos: 0, sem_codigo: 0 };
        o.entregas++;
        if (p.canal === 'iFood') { o.pedidos++; if (p.sem_codigo) o.sem_codigo++; }
      });
      for (var k in g) out.push(g[k]);
    });
    return out;
  });
})();
