/* Cancelamentos do delivery (demonstracao).
   Simula: rpc cancelados_porta (acoes painel, lista, explicar, apagar e conversa) e a funcao guardar-foto-chat
   (fotos ilustrativas, desenhadas na hora). Os pedidos saem de MUNDO.pedidos: cancelado inteiro e todo pedido do
   iFood que o MUNDO marcou como cancelado; parte devolvida e reembolso no chat usam o mesmo sorteio da tela
   Resolver hoje (mesmos pedidos, mesma marca, mesmo "resolvido"), para os numeros baterem entre as telas.
   Valores em R$ so vao para o dono (ctx.admin). Explicacoes gravadas na tela ficam so neste navegador
   (localStorage, prefixo demo_cancelados_). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG;

  /* mesmas listas de exemplo da tela Resolver hoje (o sorteio precisa andar igual) */
  var MOT_GER = ['Resolvido com o cliente', 'Ja estava certo', 'Nao era problema nosso', 'Combinado com a equipe'];
  var NEGOC = ['O lanche chegou frio.', 'Veio faltando um item.', 'O pedido atrasou muito.', 'A batata veio murcha.'];
  var ACENTO = { 'Ja estava certo': 'Já estava certo', 'Nao era problema nosso': 'Não era problema nosso' };
  function txt(t) { return ACENTO[t] || t; }

  /* motivo do MUNDO -> quem apertou o cancelar e de quem foi o problema (regra de exemplo) */
  var CANC = {
    'Cliente desistiu':      { quem: 'Cliente', origem: 'cliente', culpa: 'cliente' },
    'Pedido em duplicidade': { quem: 'Cliente', origem: 'cliente', culpa: 'cliente' },
    'Item indisponível':     { quem: 'Loja', origem: 'loja', culpa: 'loja' },
    'Endereço fora da área': { quem: 'Loja', origem: 'loja', culpa: 'cliente' },
    'Demora na entrega':     { quem: 'iFood', origem: 'ifood_cliente', culpa: 'loja' },
    'Problema no pagamento': { quem: 'iFood', origem: 'ifood', culpa: 'cliente' }
  };
  var DISSE = {
    'Cliente desistiu': ['Pedi sem querer.', 'Vou comer fora, desculpa.', 'Demorou para confirmar o pedido.'],
    'Pedido em duplicidade': ['Fiz o pedido duas vezes.'],
    'Demora na entrega': ['Já passou mais de uma hora.', 'Está muito atrasado, não quero mais.'],
    'Problema no pagamento': ['O pagamento não passou.']
  };
  var EXPL = {
    'Cliente desistiu': ['Cliente pediu para cancelar antes do preparo', 'Cliente não atendeu o entregador nem o chat'],
    'Pedido em duplicidade': ['Cliente fez o mesmo pedido duas vezes', 'Pedido repetido; o outro foi entregue'],
    'Item indisponível': ['Ingrediente acabou no pico; item pausado no cardápio', 'Item faltou no estoque do dia'],
    'Endereço fora da área': ['Endereço fora do raio de entrega', 'Endereço incompleto e cliente sem resposta'],
    'Demora na entrega': ['Cozinha atrasou no pico do jantar', 'Faltou motoboy no horário de pico'],
    'Problema no pagamento': ['Pagamento recusado pelo iFood', 'Cartão do cliente não passou']
  };
  var EXPL_PARC = ['Item conferido na saída, mas faltou na sacola', 'Montagem trocada no pico', 'Reforçado o checklist da expedição'];
  var FAMILIA = { 'Bebidas': 'Bebida que não veio', 'Sobremesas': 'Sobremesa que não veio', 'Acompanhamentos': 'Acompanhamento que não veio',
                  'Adicionais': 'Adicional que não veio', 'Pratos': 'Prato veio errado' };
  var DISSE_PARC = { 'Bebidas': 'A bebida não veio.', 'Sobremesas': 'A sobremesa não veio.', 'Acompanhamentos': 'Faltou o acompanhamento.',
                     'Adicionais': 'Paguei o adicional e ele não veio.', 'Pratos': 'O prato veio diferente do que eu pedi.' };

  /* ---------------- utilitarios ---------------- */
  function lerLS(k, padrao) { try { var v = localStorage.getItem('demo_cancelados_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravarLS(k, v) { try { localStorage.setItem('demo_cancelados_' + k, JSON.stringify(v)); } catch (e) {} }
  function hojeOp() { return M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(); }
  function agoraOp(dia) { var a = M.minutosAgora(); return dia === M.hoje() ? a : (dia === M.dia(-1) && a < 300 ? a + 1440 : 99999); }
  function quando(dia, min) { var t = M.ts(dia, min); return M.br(t.slice(0, 10)) + ' ' + t.slice(11, 16); }
  function agoraTxt() { var a = M.agoraISO(); return M.br(a) + ' ' + a.slice(11, 16); }
  function arred(v) { return M.arred(v, 2); }
  function dados(b) { return (b && b.p_dados) || {}; }
  function gerente(L) { var g = M.equipe.filter(function (x) { return x.loja === L.id && x.cargo === 'Gerente da loja'; })[0]; return g ? g.apelido : 'Gerência'; }
  function atendente(L, r) {
    var xs = M.equipe.filter(function (x) { return x.loja === L.id && (x.setor === 'Delivery' || x.cargo === 'Gerente da loja'); });
    return xs.length ? M.escolhe(r, xs).apelido : gerente(L);
  }
  /* turnos de exemplo (configuraveis): dia 11h-18h, noite 18h-1h; o que passa da meia-noite ate 1h conta na noite anterior */
  var TURNOS_TXT = { dia: '11h–18h', noite: '18h–1h', fora: '1h–11h', vira: '1h' };
  function turnoDe(min) { var m = min % 1440; if (m >= 660 && m < 1080) return 'dia'; if (m >= 1080 || m < 60) return 'noite'; return 'fora'; }
  function dowDe(dia) { var d = M.diaSemana(dia); return d === 0 ? 7 : d; }
  function periodo(per) {
    var h = hojeOp();
    if (per === 'hoje') return [h];
    if (per === 'ontem') return [M.somaDias(h, -1)];
    if (per === '7') return M.intervalo(M.somaDias(h, -6), h);
    return M.intervalo(M.somaDias(h, -29), h);
  }
  function lojasDe(u) { var L = u && u !== 'Todas' ? M.loja(u) : null; return L ? [L] : M.lojas; }
  function finAte() { return M.somaDias(hojeOp(), -2); }   /* financeiro do iFood chega com 2 dias de atraso */
  function relAte() { return M.somaDias(hojeOp(), -2); }   /* relatorio de cancelamentos idem */
  function chaveItem(o) { return [o.loja, o.dia_iso, o.hora, o.n_pedido, o.tipo].join('|'); }
  function idNum(s) { return 1000 + (M.hash(s) % 900000000); }

  /* ---------------- casos de cada dia e loja (fixos para o mesmo pedido) ---------------- */
  var CACHE = {};
  function casosDia(dia, L) {
    var ag = agoraOp(dia), passado = dia < hojeOp();
    var k = dia + '|' + L.id + (ag < 99999 ? '|' + Math.floor(ag / 5) : '');
    if (CACHE[k]) return CACHE[k];
    var fin = finAte(), rel = relAte(), out = [];
    M.pedidos(dia, L.id).forEach(function (p) {
      if (p.canal !== 'ifood') return;
      /* mesmo sorteio do Resolver hoje: x, marca e, se for o caso, o "resolvido" */
      var r = M.rng('resolver|' + p.id), x = r();
      r();   /* o sorteio que escolhia a marca continua aqui, igual ao Resolver hoje */
      var marca = M.marcaDoPedido(p).nome;   /* marca de MUNDO.marcas: a mesma em todas as telas */
      var q = M.rng('cancelados|' + p.id);
      function fechou(min) {
        var ok = passado ? r() < 0.85 : (ag - min > 90 && r() < 0.5);
        if (!ok) return null;
        var fim = Math.min(min + M.entre(r, 15, 140), ag - 1);
        var quem = atendente(L, r), oque = M.escolhe(r, MOT_GER);
        return { texto: txt(oque), quem: quem, quando: quando(dia, fim) };
      }
      var base = {
        loja: L.id, loja_nome: L.nome, marca: marca, n_pedido: p.numero_ifood || String(p.numero), uuid: 'demo-' + p.id,
        dia: M.br(dia), dia_iso: dia, hora: p.hora_pedido, turno: turnoDe(p.min_pedido), dow: dowDe(dia),
        valor: p.total, fotos: 0, tem_chat: false, expl: null, tratado: null, _min: p.min_pedido, _sub: p.subtotal
      };
      var o;
      if (p.cancelado) {
        var c = CANC[p.motivo_cancelamento] || { quem: 'Loja', origem: 'loja', culpa: 'loja' };
        var tratado = fechou(Math.min(p.min_pedido + 6, ag - 1));
        var contestou = c.quem === 'Cliente' ? false : r() < 0.5;
        o = Object.assign({}, base, { tipo: 'inteiro', motivo: p.motivo_cancelamento, origem: c.origem, culpa: c.culpa, tratado: tratado });
        if (tratado && c.quem === 'Cliente') tratado.texto = 'Não era problema nosso';
        else if (tratado) tratado.texto = 'Combinado com a equipe';
        o.saiu = false;
        if (p.motivo_cancelamento === 'Demora na entrega') {
          if (q() < 0.3) { o.origem = 'entrega'; o.culpa = 'outros'; o.saiu = true; } else o.saiu = q() < 0.5;
        } else if (p.motivo_cancelamento === 'Cliente desistiu') {
          if (q() < 0.25) o.origem = 'ifood_cliente';
          o.saiu = q() < 0.2;
        } else if (p.motivo_cancelamento === 'Problema no pagamento') {
          if (q() < 0.5) o.culpa = 'outros';
        }
        o.contestavel = c.quem !== 'Cliente';
        o.contestou = contestou;
        o.contest_res = null;
        if (contestou && dia <= rel) o.contest_res = q() < 0.6 ? 'contestação aceita' : 'contestação recusada';
        o.aguardando_fin = dia > fin;
        var volta = false;
        if (!o.aguardando_fin) {
          if (o.contest_res === 'contestação aceita' || o.origem === 'entrega') volta = true;
          else if (o.origem === 'cliente') volta = q() < 0.75;
          else if (o.origem === 'ifood') volta = q() < 0.6;
          else if (o.origem === 'ifood_cliente') volta = q() < 0.15;
        }
        o.volta_sim = volta;
        o.volta = volta ? arred(p.subtotal * 0.87) : null;
        o._prejuizo = o.saiu && !o.aguardando_fin && !volta;
        var ds = DISSE[p.motivo_cancelamento];
        o.disse = ds && q() < 0.55 ? M.escolhe(q, ds) : '';
        o.loja_fez = p.motivo_cancelamento === 'Item indisponível' && q() < 0.7 ? 'Pausou o item no cardápio'
          : contestou ? 'Pediu ao iFood para rever o cancelamento'
          : (p.motivo_cancelamento === 'Demora na entrega' && q() < 0.6 ? 'Avisou o cliente pelo chat do iFood' : '');
        o.tem_chat = p.motivo_cancelamento === 'Demora na entrega' || q() < 0.3;
        o.motivo_fonte = 'API de pedidos do iFood';
        o.fontes = ['API do iFood'].concat(o.aguardando_fin ? [] : ['financeiro do iFood']).concat(o.contestavel && dia <= rel ? ['relatório do iFood'] : []).concat(o.tem_chat ? ['chat do iFood'] : []);
        o._expl = M.escolhe(q, EXPL[p.motivo_cancelamento] || ['Conferido com a equipe']);
        out.push(o);
        return;
      }
      var entregue = p.status === 'entregue';
      if (entregue && x < 0.02) {                                         /* parte do pedido devolvida */
        var itp = p.itens[p.itens.length - 1];
        var trp = fechou(Math.min(p.min_entrega + 12, ag - 1));
        o = Object.assign({}, base, { tipo: 'parcial', tratado: trp });
        o.familia = FAMILIA[itp.categoria] || 'Lanche veio errado';
        o.motivo = o.familia;
        o.item = itp.nome;
        o.disse = DISSE_PARC[itp.categoria] || 'Um dos lanches veio errado.';
        o.devolvido = arred(itp.preco * itp.qtd);
        o.fotos = q() < 0.4 ? (q() < 0.3 ? 2 : 1) : 0;
        o.tem_chat = o.fotos > 0 || q() < 0.3;
        o.motivo_fonte = q() < 0.6 ? 'Gestor Web' : 'API do iFood';
        o.fontes = ['API do iFood (reclamação aceita)', 'Gestor Web'].concat(dia <= rel ? ['relatório do iFood'] : []);
        o.loja_fez = !trp ? '' : /certo|problema/.test(trp.texto) ? 'Conferiu o pedido e respondeu ao iFood' : 'Aceitou o reembolso do item';
        o._expl = M.escolhe(q, EXPL_PARC);
        out.push(o);
        return;
      }
      if (entregue && x >= 0.09 && x < 0.105 && !/errado|Faltou/.test(p.comentario || '')) {   /* reembolso combinado no chat */
        var min = p.min_entrega + M.entre(r, 15, 50);
        var trc = fechou(min);
        if (min > ag || !trc) return;
        if (trc.texto !== 'Resolvido com o cliente' && trc.texto !== 'Combinado com a equipe') return;   /* so quando houve reembolso */
        var disse = M.escolhe(r, NEGOC), fator = M.escolhe(r, [0.3, 0.5, 1]);
        o = Object.assign({}, base, { tipo: 'chat', tratado: trc, motivo: disse, devolvido: arred(p.subtotal * fator) });
        o.tem_chat = true;
        o.motivo_fonte = 'chat do iFood (Gestor Web)';
        o.fontes = ['Gestor Web', 'chat do iFood'];
        o.loja_fez = 'Combinou o reembolso com o cliente no chat';
        out.push(o);
      }
    });
    CACHE[k] = out;
    return out;
  }

  /* explicacoes: as "antigas" saem do sorteio; as gravadas na tela ficam no navegador */
  function comExplicacao(o0, ctx) {
    var o = Object.assign({}, o0), k = chaveItem(o);
    var gravadas = lerLS('expl', {}), apagadas = lerLS('apagadas', []);
    var g = gravadas[k];
    if (g) o.expl = { id: g.id, texto: g.texto, quem: g.quem, quando: g.quando, pode_apagar: true };
    else if (!o.tratado && o.tipo !== 'chat' && o.dia_iso <= M.somaDias(hojeOp(), -2)) {
      var r = M.rng('cancelados-expl|' + k), id = idNum('expl|' + k);
      if (r() < 0.6 && apagadas.indexOf(id) < 0) {
        var L = M.loja(o.loja) || M.lojas[0];
        o.expl = { id: id, texto: o._expl, quem: atendente(L, r), quando: quando(M.somaDias(o.dia_iso, 1), M.entre(r, 600, 900)), pode_apagar: !!ctx.admin };
      }
    }
    return o;
  }
  function itens(u, per, ctx) {
    var lista = [];
    periodo(per).forEach(function (dia) {
      lojasDe(u).forEach(function (L) { casosDia(dia, L).forEach(function (o) { lista.push(comExplicacao(o, ctx)); }); });
    });
    return lista;
  }
  function casa(o, f) {
    if (f.tipo && o.tipo !== f.tipo) return false;
    if (!f.tipo && o.tipo === 'chat') return false;
    if (f.motivo != null && f.motivo !== '' && o.motivo !== f.motivo) return false;
    if (f.origem && o.origem !== f.origem) return false;
    if (f.culpa && o.culpa !== f.culpa) return false;
    if (f.dow != null && f.dow !== '' && o.dow !== +f.dow) return false;
    if (f.marca && o.marca !== f.marca) return false;
    if (f.so === 'sem_expl' && (o.expl || o.tratado)) return false;
    if (f.so === 'foto' && !o.fotos) return false;
    if (f.so === 'prejuizo' && !o._prejuizo) return false;
    if (f.so === 'volta' && !o.volta_sim) return false;
    if (f.so === 'contestavel' && !o.contestavel) return false;
    return true;
  }
  /* o que sai para a tela: sem campos internos e, para quem nao e dono, sem R$ */
  function limpa(o, ctx) {
    var r = {};
    for (var k in o) if (k.charAt(0) !== '_' && k !== 'dow' && k !== 'culpa') r[k] = o[k];
    if (!ctx.admin) { r.valor = null; r.volta = null; if ('devolvido' in r) r.devolvido = null; }
    return r;
  }
  function podeChat(ctx) { var ok = D.papeis && D.papeis[ctx.papel]; return !ok || ok.indexOf('resolver') >= 0; }

  /* ---------------- painel (quadros) ---------------- */
  function painel(d, ctx) {
    var u = d.unidade || 'Todas', per = d.periodo || '30', dias = periodo(per), xs = itens(u, per, ctx), dono = !!ctx.admin;
    var R = { inteiros: 0, inteiros_sem_expl: 0, parciais: 0, parciais_sem_expl: 0, parciais_foto: 0, inteiros_valor: 0, parciais_valor: 0,
              prejuizo_n: 0, prejuizo_valor: 0, volta_n: 0, volta_valor: 0, aguardando_fin: 0, contestavel: 0, contestou: 0,
              acatada: 0, recusada: 0, contest_sem_res: 0, chat_n: 0, chat_valor: 0 };
    var mi = {}, mp = {}, tu = { dia: { turno: 'dia', inteiros: 0, parciais: 0 }, noite: { turno: 'noite', inteiros: 0, parciais: 0 }, fora: { turno: 'fora', inteiros: 0, parciais: 0 } };
    var cu = {}, qm = {}, se = {}, ma = {};
    function soma(mapa, chave, ini, o) {
      var m = mapa[chave] || (mapa[chave] = Object.assign({ total: 0, dia: 0, noite: 0, fora: 0, sem_expl: 0 }, ini));
      m.total++; m[o.turno]++; if (!o.expl && !o.tratado) m.sem_expl++;
      return m;
    }
    xs.forEach(function (o) {
      var pend = !o.expl && !o.tratado;
      if (o.tipo === 'chat') { R.chat_n++; R.chat_valor += o.devolvido || 0; return; }
      var s = se[o.dow] || (se[o.dow] = { dow: o.dow, dia: 0, noite: 0, fora: 0, inteiros: 0, parciais: 0 });
      s[o.turno]++;
      var mk = ma[o.marca] || (ma[o.marca] = { marca: o.marca, inteiros: 0, parciais: 0 });
      if (o.tipo === 'inteiro') {
        R.inteiros++; R.inteiros_valor += o.valor || 0; if (pend) R.inteiros_sem_expl++;
        if (o._prejuizo) { R.prejuizo_n++; R.prejuizo_valor += o.valor || 0; }
        if (o.volta_sim) { R.volta_n++; R.volta_valor += o.volta || 0; }
        if (o.aguardando_fin) R.aguardando_fin++;
        if (o.contestavel) R.contestavel++;
        if (o.contestou) { R.contestou++; if (!o.contest_res) R.contest_sem_res++; }
        if (o.contest_res === 'contestação aceita') R.acatada++;
        if (o.contest_res === 'contestação recusada') R.recusada++;
        soma(mi, o.motivo, { motivo: o.motivo }, o);
        soma(cu, o.culpa, { culpa: o.culpa }, o);
        var qq = qm[o.origem] || (qm[o.origem] = { origem: o.origem, total: 0, volta_n: 0, sem_volta_n: 0, aguardando: 0, volta_valor: 0 });
        qq.total++;
        if (o.aguardando_fin) qq.aguardando++; else if (o.volta_sim) { qq.volta_n++; qq.volta_valor += o.volta || 0; } else qq.sem_volta_n++;
        tu[o.turno].inteiros++; s.inteiros++; mk.inteiros++;
      } else {
        R.parciais++; R.parciais_valor += o.devolvido || 0; if (pend) R.parciais_sem_expl++; if (o.fotos) R.parciais_foto++;
        var m = soma(mp, o.motivo, { motivo: o.motivo, valor: 0 }, o); m.valor += o.devolvido || 0;
        tu[o.turno].parciais++; s.parciais++; mk.parciais++;
      }
    });
    function lista(mapa) { return Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) { return b.total - a.total; }); }
    ['inteiros_valor', 'parciais_valor', 'prejuizo_valor', 'volta_valor', 'chat_valor'].forEach(function (k) { R[k] = dono ? arred(R[k]) : null; });
    var mpl = lista(mp); mpl.forEach(function (m) { m.valor = dono ? arred(m.valor) : null; });
    var qml = lista(qm); qml.forEach(function (q) { q.volta_valor = dono ? arred(q.volta_valor) : null; });
    var ag = M.minutosAgora(), h = M.hoje();
    return {
      unidade: u, dono: dono,
      periodo: { ini: M.br(dias[0]), fim: M.br(dias[dias.length - 1]) },
      resumo: R,
      motivos_inteiro: lista(mi), motivos_parcial: mpl,
      turnos: [tu.dia, tu.noite, tu.fora], turnos_txt: TURNOS_TXT,
      culpa: lista(cu), quem: qml,
      semana: Object.keys(se).map(function (k) { return se[k]; }).sort(function (a, b) { return a.dow - b.dow; }),
      marcas: Object.keys(ma).map(function (k) { return ma[k]; }).sort(function (a, b) { return (b.inteiros + b.parciais) - (a.inteiros + a.parciais); }),
      fontes: {
        api: quando(h, ag - 4), api_min: 4, gestor: quando(h, ag - 11), gestor_min: 11, chat: quando(h, ag - 7),
        financeiro_ate: M.br(finAte()), relatorio_ate: M.br(relAte()), relatorio_dias: 2
      }
    };
  }

  /* ---------------- lista de pedidos de um quadro ---------------- */
  function listaPedidos(d, ctx) {
    var xs = itens(d.unidade || 'Todas', d.periodo || '30', ctx).filter(function (o) { return casa(o, d); });
    xs.sort(function (a, b) { return a.dia_iso < b.dia_iso ? 1 : a.dia_iso > b.dia_iso ? -1 : b._min - a._min; });
    return { total: xs.length, itens: xs.slice(0, 60).map(function (o) { return limpa(o, ctx); }), dono: !!ctx.admin, pode_chat: podeChat(ctx) };
  }

  /* acha o caso pelo codigo uuid ("demo-<loja>-<AAAAMMDD>-<numero>") */
  function acha(uuid, ctx) {
    var m = /^demo-(.+)-(\d{4})(\d{2})(\d{2})-(\d+)$/.exec(String(uuid || ''));
    if (!m) return null;
    var L = M.loja(m[1]), dia = m[2] + '-' + m[3] + '-' + m[4];
    if (!L) return null;
    return casosDia(dia, L).filter(function (o) { return o.uuid === uuid; })[0] || null;
  }

  /* conversa do chat do iFood (falas genericas, inventadas) */
  var CLIENTE_DIZ = {
    'Cliente desistiu': 'Oi, consigo cancelar o pedido?',
    'Pedido em duplicidade': 'Fiz o pedido duas vezes sem querer, pode cancelar um?',
    'Item indisponível': 'Tudo bem, pode cancelar então.',
    'Endereço fora da área': 'Não entregam no meu bairro?',
    'Demora na entrega': 'Meu pedido está muito atrasado, ainda vem?',
    'Problema no pagamento': 'Apareceu erro no pagamento, o pedido vai sair?'
  };
  var LOJA_DIZ = {
    'Cliente desistiu': 'Olá! Tudo bem, vamos pedir o cancelamento.',
    'Pedido em duplicidade': 'Olá! Vimos os dois pedidos, vamos cancelar um deles.',
    'Item indisponível': 'Olá! Um item do seu pedido acabou agora. Podemos cancelar para você pedir de novo?',
    'Endereço fora da área': 'Olá! Infelizmente o seu endereço fica fora da nossa área de entrega.',
    'Demora na entrega': 'Olá! Pedimos desculpas pela demora, já estamos verificando.',
    'Problema no pagamento': 'Olá! O iFood não confirmou o pagamento, por isso o pedido não saiu.'
  };
  function conversa(d, ctx) {
    var pode = podeChat(ctx);
    if (!pode) return { pode_chat: false, chat: [] };
    var o = acha(d.uuid, ctx);
    if (!o || !o.tem_chat) return { pode_chat: true, chat: [] };
    var h0 = M.minDe(o.hora), msgs = [];
    function m(quem, dm, texto, foto) { msgs.push({ quem: quem, quando: M.hm(h0 + dm), texto: texto, foto: !!foto }); }
    if (o.tipo === 'inteiro') {
      if (o.motivo === 'Item indisponível') {   /* aqui quem fala primeiro e a loja */
        m('Loja', 4, LOJA_DIZ[o.motivo]);
        m('Cliente', 6, CLIENTE_DIZ[o.motivo]);
      } else {
        m('Cliente', 4, CLIENTE_DIZ[o.motivo] || 'Pode verificar meu pedido?');
        m('Loja', 6, LOJA_DIZ[o.motivo] || 'Olá! Já estamos vendo o seu pedido.');
      }
      m('iFood', 9, 'Pedido cancelado.');
    } else if (o.tipo === 'parcial') {
      var dm = 55;   /* a reclamacao chega depois da entrega */
      m('Cliente', dm, o.disse, o.fotos > 0);
      m('Loja', dm + 3, 'Olá! Sentimos muito, já pedimos o reembolso do item.');
      m('iFood', dm + 5, 'Reembolso do item aprovado para o cliente.');
    } else {
      m('Cliente', 50, o.motivo);
      m('Loja', 53, 'Olá! Sentimos muito. Podemos devolver parte do valor do pedido, tudo bem?');
      m('Cliente', 56, 'Tudo bem, obrigado.');
      m('iFood', 58, 'Reembolso combinado registrado.');
    }
    return { pode_chat: true, chat: msgs };
  }

  D.rpc('cancelados_porta', function (b, ctx) {
    if (!D.papelDoToken(b.p_token)) throw D.erro(401, 'Sessão expirada. Entre no portal de novo.', '28000');
    var acao = b.p_acao, d = dados(b);
    if (acao === 'painel') return painel(d, ctx);
    if (acao === 'lista') return listaPedidos(d, ctx);
    if (acao === 'conversa') return conversa(d, ctx);
    if (acao === 'explicar') {
      var t = String(d.texto || '').trim();
      if (t.length < 3) throw D.erro(400, 'Escreva o que aconteceu', 'P0001');
      var g = lerLS('expl', {}), id = Date.now();
      g[[d.loja, d.dia, d.hora, d.n_pedido, d.tipo].join('|')] = { id: id, texto: t.slice(0, 300), quem: ctx.nome, quando: agoraTxt() };
      gravarLS('expl', g);
      return { ok: true, id: id };
    }
    if (acao === 'apagar') {
      var id2 = +d.id, gs = lerLS('expl', {}), achou = false;
      Object.keys(gs).forEach(function (k) { if (gs[k].id === id2) { delete gs[k]; achou = true; } });
      if (achou) gravarLS('expl', gs);
      else { var ap = lerLS('apagadas', []); if (ap.indexOf(id2) < 0) ap.push(id2); gravarLS('apagadas', ap); }
      return { ok: true };
    }
    throw D.erro(400, 'Ação desconhecida', 'P0001');
  });

  /* ---------------- fotos do cliente: desenho ilustrativo ---------------- */
  function fotoSvg(o, i) {
    var fundos = ['#3b3a36', '#2f3b3a', '#3d3330'], fundo = fundos[(M.hash(o.uuid) + i) % fundos.length];
    var bebida = /Bebida/.test(o.familia || ''), faltou = /não veio/.test(o.familia || '');
    var obj = bebida
      ? '<rect x="270" y="150" width="100" height="170" rx="14" fill="#c0392b"/><rect x="270" y="190" width="100" height="40" fill="#e8e2d0"/>'
      : '<ellipse cx="320" cy="300" rx="130" ry="34" fill="#d9a05b"/><ellipse cx="320" cy="274" rx="142" ry="30" fill="#6b3b22"/>'
        + '<ellipse cx="320" cy="244" rx="138" ry="16" fill="#5aa64a"/><path d="M180 240 Q320 100 460 240 Z" fill="#e0a24e"/>';
    var marca = faltou
      ? '<rect x="420" y="170" width="140" height="150" rx="12" fill="none" stroke="#e66767" stroke-width="6" stroke-dasharray="16 10"/>'
        + '<text x="490" y="262" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#e66767" text-anchor="middle">?</text>'
      : '<circle cx="320" cy="250" r="90" fill="none" stroke="#e66767" stroke-width="6" stroke-dasharray="16 10"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">'
      + '<rect width="640" height="480" fill="' + fundo + '"/>'
      + '<rect x="50" y="330" width="540" height="90" rx="10" fill="#c49a62"/><rect x="50" y="330" width="540" height="18" fill="#b3884f"/>'
      + (faltou ? '<g transform="translate(-90 0)">' + obj + '</g>' : obj) + marca
      + '<rect x="0" y="430" width="640" height="50" fill="rgba(0,0,0,.55)"/>'
      + '<text x="320" y="462" font-family="Arial, sans-serif" font-size="20" fill="#ffffff" text-anchor="middle">foto ilustrativa · demonstração</text>'
      + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  D.funcao('guardar-foto-chat', function (b, ctx) {
    if (!D.papelDoToken(b.token_portal)) throw D.erro(401, 'sessão expirada');
    if (b.acao !== 'ver') return { ok: false, erro: 'ação desconhecida' };
    if (!podeChat(ctx)) throw D.erro(401, 'sem acesso');
    var o = acha(b.uuid_pedido, ctx), fotos = [];
    for (var i = 0; o && i < o.fotos; i++) fotos.push({ link: fotoSvg(o, i), nome: 'foto-' + (i + 1) + '.svg' });
    return { ok: true, fotos: fotos };
  });
})();
