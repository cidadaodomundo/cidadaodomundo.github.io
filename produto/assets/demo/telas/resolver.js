/* Resolver hoje (demonstracao).
   Simula: rpc resolver_hoje (quadros e listas de pendencias do periodo), rpc resolver_pausas (itens pausados
   no cardapio do iFood), rpc resolver_marcar (fechar e reabrir pendencia, responder pausa, pedido de ajuste,
   conversa do chat do iFood) e funcao guardar-foto-chat (sem fotos na demonstracao). A tabela fato_frescor
   vem do comum.js.
   Os casos saem de MUNDO.pedidos: mesmos pedidos, lojas e motoboys das outras telas. Toda fala de cliente
   aqui e inventada e generica. O que se marca na tela fica so neste navegador (localStorage, prefixo demo_resolver_). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG;

  /* marcas no iFood (a mesma cozinha vende com mais de um nome): a lista unica de MUNDO.marcas */
  var MARCAS = M.marcas.map(function (m) { return m.nome; });
  var MOT_GER = ['Resolvido com o cliente', 'Ja estava certo', 'Nao era problema nosso', 'Combinado com a equipe'];
  var MOT_REE = ['Faltou item na sacola', 'Cliente pediu de novo', 'Saiu junto, sem corrida a mais', 'Cozinha refez o pedido'];

  /* ---------------- utilitarios ---------------- */
  function lerLS(k, padrao) { try { var v = localStorage.getItem('demo_resolver_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravarLS(k, v) { try { localStorage.setItem('demo_resolver_' + k, JSON.stringify(v)); } catch (e) {} }
  function hojeOp() { return M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(); }
  function agoraOp(dia) { var a = M.minutosAgora(); return dia === M.hoje() ? a : (dia === M.dia(-1) && a < 300 ? a + 1440 : 99999); }
  function quando(dia, min) { var t = M.ts(dia, min); return M.br(t.slice(0, 10)) + ' ' + t.slice(11, 16); }
  function agoraTxt() { var a = M.agoraISO(); return M.br(a) + ' ' + a.slice(11, 16); }
  function rs(n) { return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function ref(p) { return p.numero_ifood || String(p.numero); }
  function curto(nome) { var p = String(nome || '').split(' '); return p.length > 1 ? p[0] + ' ' + p[p.length - 1] : p[0]; }
  function gerente(L) { var g = M.equipe.filter(function (x) { return x.loja === L.id && x.cargo === 'Gerente da loja'; })[0]; return g ? g.apelido : 'Gerência'; }
  function atendente(L, r) {
    var xs = M.equipe.filter(function (x) { return x.loja === L.id && (x.setor === 'Delivery' || x.cargo === 'Gerente da loja'); });
    return xs.length ? M.escolhe(r, xs).apelido : gerente(L);
  }
  function periodo(d) {
    var h = hojeOp();
    if (d.ontem) return [M.somaDias(h, -1)];
    if (+d.dias === 7) return M.intervalo(M.somaDias(h, -6), h);
    return [h];
  }
  function lojasDe(d) { var L = d.unidade ? M.loja(d.unidade) : null; return L ? [L] : M.lojas; }
  function dados(b) { return (b && b.p_dados) || {}; }

  /* ---------------- casos de cada dia e loja (fixos para o mesmo pedido) ---------------- */
  var CANC = {
    'Cliente desistiu': ['Cancelado pelo cliente', 'Cliente'],
    'Pedido em duplicidade': ['Cancelado pelo cliente', 'Cliente'],
    'Item indisponível': ['Cancelado pela loja', 'Loja'],
    'Endereço fora da área': ['Cancelado pela loja', 'Loja'],
    'Demora na entrega': ['Cancelado pelo iFood', 'iFood'],
    'Problema no pagamento': ['Cancelado pelo iFood', 'iFood']
  };
  /* pergunta do cliente e resposta da loja (exemplos genericos) */
  var CHAT = [
    ['Meu pedido ainda não chegou, pode verificar?', 'Olá! Já saiu para entrega, chega em poucos minutos.'],
    ['Consigo trocar a bebida do meu pedido?', 'Olá! Conseguimos trocar, já está anotado.'],
    ['O entregador está perto?', 'Olá! Está a caminho, desculpe a espera.'],
    ['Esqueci de pedir sem cebola, ainda dá tempo?', 'Olá! Desculpe a demora, o lanche já tinha saído. Fica anotado para o próximo pedido.'],
    ['Vocês mandam talheres junto?', 'Olá! Mandamos sim, já vão na sacola.'],
    ['Pode confirmar o número da casa para a entrega?', 'Olá! Confirmado, obrigado por avisar.']];
  var NEGOC = ['O lanche chegou frio.', 'Veio faltando um item.', 'O pedido atrasou muito.', 'A batata veio murcha.'];

  /* modelos de "Errado no pedido": familia, tipo, o que o cliente escreveu, categoria do item, extras */
  var ERRADOS = [
    { familia: 'BEBIDA', tipo: 'Item faltando', disse: 'Faltou a bebida que eu pedi.', cat: 'Bebidas' },
    { familia: 'BEBIDA', tipo: 'Pedido errado', disse: 'Veio outra bebida, não a que eu pedi.', cat: 'Bebidas' },
    { familia: 'SOBREMESA', tipo: 'Item faltando', disse: 'A sobremesa não veio no pedido.', cat: 'Sobremesas' },
    { familia: 'COMIDA', tipo: 'Pedido errado', disse: 'Pedi sem cebola e veio com cebola.', cat: 'Burgers' },
    { familia: 'COMIDA', tipo: 'Item faltando', disse: 'Faltou o acompanhamento.', cat: 'Acompanhamentos' },
    { familia: 'COMIDA', tipo: 'Pedido errado', disse: 'O lanche veio diferente do que eu pedi.', cat: 'Burgers' },
    { familia: 'BEBIDA', tipo: 'Item faltando', disse: 'Não veio o refrigerante do combo.', cat: 'Burgers', aviso: true },
    { familia: 'COMIDA', tipo: 'Qualidade', disse: 'Encontrei um corpo estranho no lanche.', cat: 'Burgers', grave: true },
    { familia: 'NAO DEU PARA SABER', tipo: 'Reclamação', disse: 'O entregador deixou o pedido no endereço errado.', cat: 'Burgers', entrega: true },
    { familia: 'NAO DEU PARA SABER', tipo: 'Reclamação', disse: '', cat: 'Burgers' }
  ];

  var CACHE = {};
  function casosDia(dia, L) {
    var ag = agoraOp(dia);
    var k = dia + '|' + L.id + (ag < 99999 ? '|' + Math.floor(ag / 5) : '');
    if (CACHE[k]) return CACHE[k];
    var out = { itens: [], esquecidos: [], chegada: [] };
    var passado = dia < hojeOp();
    var mbs = {}; M.motoboys.forEach(function (m) { mbs[m.id] = m; });
    M.pedidos(dia, L.id).forEach(function (p) {
      var r = M.rng('resolver|' + p.id), x = r();
      r();   /* este sorteio escolhia a marca: fica, para o resto do sorteio nao mudar (o Cancelados anda igual) */
      var marca = M.marcaDoPedido(p).nome;   /* a marca do pedido e a mesma em todas as telas */
      /* ja resolvido? dias passados quase sempre; hoje, so o que tem mais de hora e meia */
      function fechou(min) { return passado ? r() < 0.85 : (ag - min > 90 && r() < 0.5); }
      function base(tipo, min) {
        var ok = fechou(min);
        return { tipo: tipo, chave: tipo + '|' + L.id + '|' + dia + '|' + p.numero, unidade: L.nome, dia: dia, quando: quando(dia, min),
                 _min: min, referencia: ref(p), cliente_disse: '', o_que_e: '', detalhe: '', valor: null,
                 /* chat: a loja responde atrasada, mas no mesmo atendimento (6 a 40 min) */
                 _fim: ok ? Math.min(min + (tipo === 'chat' ? M.entre(r, 6, 40) : M.entre(r, 15, 140)), ag - 1) : null,
                 resolvido: ok, quem: ok ? atendente(L, r) : null, resolvido_em: null,
                 o_que_foi_feito: ok ? M.escolhe(r, tipo === 'reentrega' ? MOT_REE : MOT_GER) : null,
                 fotos: 0, tem_conversa: false, n_conversas: 0, canal: p.canal, _cliente: p.cliente };
      }
      function pronto(it) { if (it._fim != null) it.resolvido_em = quando(dia, it._fim); return it; }
      if (p.cancelado) {
        var c = CANC[p.motivo_cancelamento] || ['Cancelado pela loja', 'Loja'], it = base('cancelamento', Math.min(p.min_pedido + 6, ag - 1));
        var cont = c[1] === 'Cliente' || p.canal !== 'ifood' ? '' : (r() < 0.5 ? 'contestado, aguardando o iFood' : 'sem contestação');
        it.o_que_e = p.canal === 'ifood' ? marca : MARCAS[0];
        it.detalhe = 'tipo: ' + c[0] + ' | disse: ' + p.motivo_cancelamento + ' | quem cancelou: ' + c[1] +
          (cont ? ' | contestação: ' + cont : '') + ' | de onde veio: ' + (p.canal === 'ifood' ? 'Cancelamentos do iFood' : 'Saipos (pedido do site)');
        it._valor = p.total;
        if (it.resolvido) it.o_que_foi_feito = c[1] === 'Cliente' ? 'Nao era problema nosso' : 'Combinado com a equipe';
        out.itens.push(pronto(it));
        return;
      }
      var entregue = p.status === 'entregue';
      if (p.canal === 'ifood' && entregue && x < 0.02) {                               /* item cancelado */
        var itp = p.itens[p.itens.length - 1], pc = base('parcial', Math.min(p.min_entrega + 12, ag - 1));
        var dz = itp.categoria === 'Bebidas' ? 'A bebida não veio.' : itp.categoria === 'Sobremesas' ? 'A sobremesa não veio.'
               : itp.categoria === 'Acompanhamentos' ? 'Faltou o acompanhamento.' : 'Um dos lanches veio errado.';
        pc.o_que_e = marca;
        pc._valorItem = itp.preco * itp.qtd;
        pc.detalhe = 'disse: ' + dz + ' | item: ' + itp.nome + ' | como ficou: ' + (pc.resolvido ? 'iFood reembolsou o item ao cliente' : 'reembolso pedido, loja ainda não respondeu') +
          ' | de onde veio: Reclamação oficial do iFood';
        out.itens.push(pronto(pc));
      } else if (p.canal === 'ifood' && entregue && (x < 0.055 || /errado|Faltou/.test(p.comentario || ''))) {   /* errado no pedido */
        var mod = ERRADOS[Math.floor(r() * ERRADOS.length)];
        var cands = M.cardapio.filter(function (c2) { return c2.categoria === mod.cat; });
        var noPed = p.itens.filter(function (i2) { return i2.categoria === mod.cat; })[0];
        var item = noPed ? noPed.nome : M.escolhe(r, cands).nome;
        var min = p.min_entrega + M.entre(r, 8, 40);
        if (min > ag) min = ag - 1;
        var y = r(), pend, cor, resolveu;
        if (passado ? y < 0.15 : y < 0.6) { pend = true; cor = 'bad'; resolveu = 'ninguém respondeu no iFood ainda'; }
        else if (y < (passado ? 0.8 : 0.85)) { pend = false; cor = 'ok'; resolveu = 'loja respondeu e o iFood reembolsou o cliente'; }
        else { pend = false; cor = 'warn'; resolveu = 'loja recusou o reembolso: o item foi conferido na saída'; }
        var chat = r() < 0.25 ? 'Boa noite, meu pedido veio incompleto.' : '';
        out.esquecidos.push({
          pendente: pend, familia: mod.familia, fotos: 0, fotos_api: r() < 0.15 ? 1 : 0, origem: 'api', cor: cor,
          grave: !!mod.grave, tipo: mod.tipo, entrega: !!mod.entrega, disse: mod.disse, chat: chat,
          unidade: L.nome, pedido: ref(p), marca: marca, item: mod.aviso ? M.escolhe(r, cands).nome : item, item_aviso: !!mod.aviso,
          resolveu: resolveu, fontes: 'Reclamação oficial do iFood' + (chat ? ' + chat do iFood' : ''),
          quando: quando(dia, min), uuid: 'demo-' + p.id, dia: dia, _min: min
        });
      } else if (p.motoboy_id && entregue && x < 0.065) {                                  /* reentrega */
        var mb = mbs[p.motoboy_id], re = base('reentrega', p.min_saida + 38);
        if (re._min > ag) return;
        re.o_que_e = 'O motoboy ' + curto(mb && mb.nome) + ' saiu duas vezes para este pedido';
        re.detalhe = '1ª saída ' + M.hm(p.min_saida) + ' | 2ª saída ' + M.hm(p.min_saida + 38) + ' | visto no TrackEat';
        re._valor = M.escolhe(r, [6.5, 7, 8.5, 9]);
        out.itens.push(pronto(re));
      } else if (p.canal === 'ifood' && x < 0.09) {                                       /* cliente sem resposta no chat */
        var ch = base('chat', p.min_pedido + M.entre(r, 6, 25));
        if (ch._min > ag) return;
        var par = M.escolhe(r, CHAT);
        ch.cliente_disse = par[0];
        ch.o_que_e = ch.resolvido ? 'A loja respondeu depois de ' + (ch._fim - ch._min) + ' min' : 'Mensagem sem resposta da loja';
        ch.detalhe = 'o iFood pede resposta em até 5 min';
        ch.tem_conversa = true;
        ch.n_conversas = r() < 0.12 ? 2 : 1;
        ch._resposta = par[1];
        out.itens.push(pronto(ch));
      } else if (p.canal === 'ifood' && entregue && x < 0.105) {                           /* negociacao do iFood */
        var ng = base('negociacao', p.min_entrega + M.entre(r, 15, 50));
        if (ng._min > ag) return;
        ng.cliente_disse = M.escolhe(r, NEGOC);
        ng.o_que_e = 'Cliente pediu reembolso pelo iFood';
        ng.detalhe = 'Proposta: reembolso parcial | prazo para a loja responder: 2 h';
        ng._valor = M.arred(p.subtotal * M.escolhe(r, [0.3, 0.5, 1]));
        out.itens.push(pronto(ng));
      } else if (p.motoboy_id && p.hora_saida && x < 0.12) {                            /* chegada nao sinalizada */
        var mc = mbs[p.motoboy_id], mn = p.min_saida - M.entre(r, 2, 6);
        out.chegada.push({ diac: M.br(dia), hora: M.hm(mn), unidade: L.nome, quem: curto(mc && mc.nome), fonte: 'TrackEat', _k: dia + M.hm(mn) });
      }
    });
    CACHE[k] = out;
    return out;
  }

  /* ---------------- maquininha: comanda fica ate alguem resolver, de qualquer dia ---------------- */
  function maquininha(lojas) {
    var h = hojeOp(), out = [];
    lojas.forEach(function (L) {
      for (var n = 10; n >= 1; n--) {
        var dia = M.somaDias(h, -n), r = M.rng('maq|' + dia + '|' + L.id);
        if (r() > 0.45) continue;
        var min = M.entre(r, 12 * 60, 23 * 60), mesa = M.entre(r, 1, 24), cmd = String(M.entre(r, 2100, 9800));
        var ok = n > 3 ? r() < 0.75 : r() < 0.2;
        out.push({ tipo: 'maquininha', chave: 'maquininha|' + L.id + '|' + dia + '|' + cmd, unidade: L.nome, dia: dia, quando: quando(dia, min), _min: min,
          referencia: cmd, cliente_disse: '', o_que_e: 'Comanda fechada no Saipos sem cobrança na maquininha',
          detalhe: 'Mesa ' + mesa + ' | fechada às ' + M.hm(min) + ' | ' + M.escolhe(r, ['caixa 1', 'caixa 2', 'balcão']),
          _valor: M.arred(M.entre(r, 4500, 26000) / 100), valor: null,
          resolvido: ok, quem: ok ? gerente(L) : null, resolvido_em: ok ? quando(M.somaDias(dia, 1), M.entre(r, 600, 900)) : null,
          o_que_foi_feito: ok ? M.escolhe(r, ['Cobrado no Pix, comprovante no caixa', 'Mesa pagou em dinheiro', 'Comanda lançada duas vezes no Saipos']) : null,
          fotos: 0, tem_conversa: false, n_conversas: 0, canal: 'salao' });
      }
    });
    return out;
  }

  /* marcacoes feitas na tela (fechar, reabrir) por cima do que veio "do banco" */
  function aplicaMarca(it, marcas) {
    var mk = marcas[it.chave];
    if (!mk) return it;
    if (mk.desfeito) { it.resolvido = false; it.quem = null; it.resolvido_em = null; it.o_que_foi_feito = null; }
    else { it.resolvido = true; it.quem = mk.quem; it.resolvido_em = mk.em; it.o_que_foi_feito = mk.o_que; }
    return it;
  }
  function limpa(it, ctx) {
    var o = {}; for (var k in it) if (k.charAt(0) !== '_') o[k] = it[k];
    o.valor = ctx.admin && it._valor != null ? it._valor : null;
    if (it.tipo === 'parcial' && ctx.admin && it._valorItem && it.resolvido) o.detalhe = it.detalhe.replace('iFood reembolsou o item ao cliente', 'iFood reembolsou ' + rs(it._valorItem) + ' ao cliente');
    return o;
  }

  /* Corrida em dobro: mesma conta da tela Pagar Motoboys (telas/pagamento.js, carregada junto nesta tela),
     para o numero do quadro bater com a lista aberta aqui dentro. Sem ela, um numero de exemplo. */
  function duplaDe(lojas, ctx) {
    /* mesmo inicio que a tela Pagar Motoboys usa quando abre na aba da corrida em dobro (21 dias atras) */
    var de = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10), nomes = lojas.map(function (l) { return l.nome; });
    var pode = !!(ctx.admin || ctx.papel === 'escritorio');
    var exemplo = function () {
      var rd = M.rng('dupla|' + hojeOp() + '|' + nomes.join(',')), n = M.entre(rd, lojas.length === M.lojas.length ? 2 : 0, lojas.length === M.lojas.length ? 5 : 2);
      return { abertos: n, desde: M.br(de), da_para_barrar: Math.min(n, M.entre(rd, 0, 2)), pode_decidir: pode };
    };
    if (!D.tem('rpc', 'pagamento_dupla_consulta')) return Promise.resolve(exemplo());
    return fetch(C.rest + 'rpc/pagamento_dupla_consulta', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: ctx.token, p_dados: { de: de, ate: null } }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.linhas) return exemplo();
        var ab = j.linhas.filter(function (l) { return nomes.indexOf(l.unidade) >= 0 && !l.decisao && String(l.veredito || '').indexOf('PAGAR AS DUAS') !== 0; });
        var barrar = ab.filter(function (l) { return l.fonte_2 !== 'TrackEat' || l.status_2 === 'Pendente'; }).length;
        return { abertos: ab.length, desde: M.br(de), da_para_barrar: barrar, pode_decidir: pode };
      })
      .catch(function () { return exemplo(); });
  }

  var REF = {};   /* referencia -> caso de chat (para a conversa) */
  D.rpc('resolver_hoje', function (b, ctx) {
    var d = dados(b), dias = periodo(d), lojas = lojasDe(d), marcas = lerLS('marcas', {});
    var itens = [], esq = [], cheg = [];
    dias.forEach(function (dia) {
      lojas.forEach(function (L) {
        var cs = casosDia(dia, L);
        itens = itens.concat(cs.itens.map(function (x) { var o = {}; for (var k in x) o[k] = x[k]; return aplicaMarca(o, marcas); }));
        esq = esq.concat(cs.esquecidos);
        cheg = cheg.concat(cs.chegada);
      });
    });
    itens = itens.concat(maquininha(lojas).map(function (x) { return aplicaMarca(x, marcas); }));
    var ordem = function (a, c) { return a.dia < c.dia ? 1 : a.dia > c.dia ? -1 : c._min - a._min; };
    itens.sort(ordem); esq.sort(ordem);
    cheg.sort(function (a, c) { return a._k < c._k ? 1 : -1; });
    itens.forEach(function (x) { if (x.tipo === 'chat') REF[x.referencia] = x; });

    var R = { abertas: 0 };
    ['reentrega', 'cancelamento', 'parcial', 'chat', 'negociacao', 'maquininha'].forEach(function (t) { R[t] = 0; R[t + '_total'] = 0; });
    itens.forEach(function (x) { R[x.tipo + '_total']++; if (!x.resolvido) { R[x.tipo]++; R.abertas++; } });
    esq.forEach(function (e) { if (e.pendente) R.abertas++; });

    var aM = M.minutosAgora(), maqMin = 6 * 60 + 10, maqDia = aM >= maqMin ? M.hoje() : M.dia(-1);

    var ciente = lerLS('cientes', []), pedidos = PEDIDOS_BASE().concat(lerLS('pedidos', []))
      .filter(function (p) { return ciente.indexOf(p.id) < 0; }).reverse();

    return duplaDe(lojas, ctx).then(function (dupla) { return {
      resumo: R,
      itens: itens.map(function (x) { return limpa(x, ctx); }),
      esquecidos: esq.map(function (e) { var o = {}; for (var k in e) if (k.charAt(0) !== '_') o[k] = e[k]; return o; }),
      chegada: { linhas: cheg.map(function (c) { return { diac: c.diac, hora: c.hora, unidade: c.unidade, quem: c.quem, fonte: c.fonte }; }),
                 dia: dias.length > 1 ? M.br(dias[0]) + ' a ' + M.br(dias[dias.length - 1]) : M.br(dias[0]), em: agoraTxt() },
      dupla: dupla,
      maq_cache: M.br(maqDia) + ' 06:10',
      maq_horas: Math.round(((aM >= maqMin ? aM : aM + 1440) - maqMin) / 60),
      pedidos: pedidos
    }; });
  });

  /* pedidos de ajuste ja enviados (exemplo) */
  function PEDIDOS_BASE() {
    return [
      { id: 1, quando: M.br(M.dia(-1)) + ' 22:15', quem: 'Gerente (' + (M.lojas[0] ? M.lojas[0].nome : 'loja') + ')', o_que: 'Essa reentrega não foi erro nosso, o cliente pediu de novo.' },
      { id: 2, quando: M.br(M.hoje()) + ' 09:40', quem: 'Atendimento do delivery', o_que: 'O cancelamento de ontem à noite foi o cliente que desistiu, não a loja. Pode tirar da conta da loja?' }
    ];
  }

  /* ---------------- cardapio pausado ---------------- */
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
    /* fechadas no periodo: pausou e voltou. O sorteio anda sempre de hoje para tras, para o mesmo dia
       mostrar os mesmos itens em Hoje, Ontem e 7 dias; so entram na resposta os dias pedidos. */
    var maisAntigo = dias.reduce(function (a, b) { return b < a ? b : a; }, h);
    M.intervalo(maisAntigo, h).reverse().forEach(function (dia) {
      var mostra = dias.indexOf(dia) >= 0;
      var rv = M.rng('voltou|' + dia + '|' + L.id), n = M.entre(rv, 1, 2), fim = dia === h ? ag : 23 * 60;
      for (var i = 0; i < n; i++) {
        var ini = M.entre(rv, 11 * 60, 21 * 60), dur = M.entre(rv, 15, 150);
        if (ini + dur > fim) continue;
        var c = pega(), ls = linha(c, { aberta: false, minutos: dur, pausou: quando(dia, ini), voltou: quando(dia, ini + dur), minimo: false });
        if (mostra) linhas = linhas.concat(ls);
      }
    });
    return linhas;
  }
  D.rpc('resolver_pausas', function (b) {
    var d = dados(b), dias = periodo(d), lojas = lojasDe(d), marcas = lerLS('pausas', {}), linhas = [];
    lojas.forEach(function (L) { linhas = linhas.concat(pausasLoja(L, dias)); });
    linhas.forEach(function (x) {
      var mk = marcas[x.chave];
      if (!mk || !x.aberta) return;
      if (mk.desfeito) { x.resolvido = false; x.contradito = false; x.quem = null; x.o_que = null; x.em = null; x.prova = null; }
      else { x.resolvido = true; x.contradito = false; x.quem = mk.quem; x.o_que = mk.o_que; x.em = mk.em; x.prova = null; }
    });
    var a = M.minutosAgora(), lido = a - (a % 5);
    return { linhas: linhas, lido_em: agoraTxt().slice(0, 6) + M.hm(lido), lido_min: a - lido };
  });

  /* ---------------- gravar ---------------- */
  D.rpc('resolver_marcar', function (b, ctx) {
    var d = dados(b);
    if (d.acao === 'pedido') {
      var ps = lerLS('pedidos', []), id = 100 + ps.length + 1;
      ps.push({ id: id, quando: agoraTxt(), quem: ctx.nome, o_que: String(d.texto || '').slice(0, 600) });
      gravarLS('pedidos', ps);
      return { ok: true, resposta: 'Anotado. O administrador vai ver o seu pedido.' };
    }
    if (d.acao === 'pedido_ciente') {
      var ci = lerLS('cientes', []); if (ci.indexOf(+d.id) < 0) ci.push(+d.id); gravarLS('cientes', ci);
      return { ok: true, resposta: 'ciente ✓' };
    }
    if (d.acao === 'conversa') {
      var x = REF[String(d.pedido || '')];
      if (!x) return { msgs: [] };
      var hh = String(x.quando).slice(6), msgs = [];
      msgs.push({ papel: 'cliente', quem: x._cliente || '', quando: hh, texto: x.cliente_disse });
      msgs.push({ papel: 'ifood', quem: '', quando: hh, texto: 'Mensagem automática: o restaurante foi avisado.' });
      if (x.n_conversas > 1) msgs.push({ papel: 'cliente', quem: x._cliente || '', quando: hh, texto: 'Alguém pode me responder?' });
      if (x.resolvido) msgs.push({ papel: 'loja', quem: x.quem || '', quando: String(x.resolvido_em || '').slice(6) || hh, texto: x._resposta || 'Olá! Já estamos vendo o seu pedido.' });
      return { msgs: msgs };
    }
    if (!d.chave) throw D.erro(400, 'Falta a chave do item', 'P0001');
    var k = d.tipo === 'pausado' ? 'pausas' : 'marcas', m = lerLS(k, {});
    if (d.desfazer) m[d.chave] = { desfeito: true };
    else {
      if (!d.o_que_foi_feito) throw D.erro(400, 'Escreva o que foi feito', 'P0001');
      m[d.chave] = { quem: ctx.nome, em: agoraTxt(), o_que: String(d.o_que_foi_feito).slice(0, 400) };
    }
    gravarLS(k, m);
    return { ok: true };
  });

  /* fotos que o cliente mandou: a demonstracao nao guarda foto nenhuma */
  D.funcao('guardar-foto-chat', function () { return { ok: true, fotos: [] }; });

  /* fato_frescor fica com o registro comum (comum.js): sem linha "PARADO" da fonte de entregas,
     os quadros do TrackEat mostram o numero normalmente. */
})();
