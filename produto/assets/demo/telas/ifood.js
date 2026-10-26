/* iFood · Qualidade (demonstracao)
   Tela: delivery/ifood-proprietario.html (tambem ?semmoto=1, embutida na Central do Delivery).
   Portas simuladas:
     tabelas ifood_dim_loja, ifood_fato_cancelamento, ifood_fato_negociacao, ifood_fato_avaliacao,
     ifood_fato_qualidade_periodo, ifood_fato_super_status;
     do sistema de entregas antigo (so com PDG_FOODY ligado): tabelas foody_vw_entregas_dia,
     foody_vw_pedido_prazo e rpc foody_pagamento_motoboy (senha da demonstracao: demo).
   Tudo sai de MUNDO e segue as mesmas regras da Central do Delivery: mesmas lojas no iFood,
   mesmos pedidos, cancelamentos, chamados e avaliacoes. Fotos e conversas sao exemplos inventados. */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG || {};

  /* ---------------- datas e utilidades ---------------- */
  /* antes das 5h ainda vale o dia de ontem (dia operacional) */
  function ultimoDia() { return M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(); }
  function ehHoje(dia) { return dia === M.hoje(); }
  function diasAte(n) { var u = ultimoDia(); return M.intervalo(M.somaDias(u, -(n - 1)), u); }
  function fechados(n) { return diasAte(n).filter(function (d) { return d < M.hoje(); }); }
  /* horario local sem fuso: 'AAAA-MM-DD HH:MM:SS' (min pode passar de 1440) */
  function lt(dia, min) { return M.ts(dia, min).slice(0, 19).replace('T', ' '); }
  function turnoDe(min) { return min < 15 * 60 ? 'Almoço' : min < 18 * 60 ? 'Tarde' : min < 24 * 60 ? 'Jantar' : 'Madrugada'; }
  function pedidosDia(dia, lojaId) { return dia > ultimoDia() ? [] : M.pedidos(dia, lojaId); }
  function brl(v) { return Math.round(v * 100) / 100; }
  function fds(dia) { var w = M.diaSemana(dia); return w === 0 || w === 6; }
  function cacheado(cache, dia, fn) {
    if (!ehHoje(dia) && cache[dia]) return cache[dia];
    var v = fn(dia);
    if (!ehHoje(dia)) cache[dia] = v;
    return v;
  }

  /* ---------------- lojas no iFood (cada loja vende com as marcas de MUNDO.marcas; a primeira e a principal) ---------------- */
  var MARCAS = M.marcas.map(function (m) { return m.nome; });
  var DIM = [];
  M.lojas.forEach(function (l) {
    MARCAS.forEach(function (nm, i) {
      DIM.push({ id_loja: 'ifood-' + l.id + (i ? '-' + (i + 1) : ''), nome: nm + ' · ' + l.nome, unidade: l.nome, loja: l.id, marca: i });
    });
  });
  function marcaDo(p) { return M.marcas.indexOf(M.marcaDoPedido(p)); }   /* a mesma marca do pedido em todas as telas */
  function idLojaDo(p) { var i = marcaDo(p); return 'ifood-' + p.loja + (i ? '-' + (i + 1) : ''); }
  function idPedido(p) { return String(100000000 + (M.hash('idp|' + p.id) % 900000000)); }
  function idSaipos(p) { return String(40000 + (M.hash('saipos|' + p.id) % 50000)); }
  /* pedido sem Codigo de Coleta: no iFood, poucos */
  function semCodigo(p) { return p.canal === 'proprio' || (p.canal === 'ifood' && (M.hash('sc|' + p.id) % 100) < 4); }
  var FORMA = { online: 'Pago pelo app', cartao_na_entrega: 'Cartão na entrega', pix: 'Pix na entrega', dinheiro: 'Dinheiro' };
  function pagamento(p) { return { forma_pagamento: FORMA[p.pagamento] || 'Pago pelo app', pagamento_online: p.pagamento === 'online' }; }
  function junta(a, b) { for (var k in b) a[k] = b[k]; return a; }

  D.tabela('ifood_dim_loja', function () {
    return DIM.map(function (x) { return { id_loja: x.id_loja, nome: x.nome, unidade: x.unidade, ativa: true }; });
  });

  /* ---------------- fotos de exemplo (desenhos; nenhuma foto de verdade) ---------------- */
  var FOTOS = (function () {
    var rodape = '<rect x="0" y="262" width="400" height="38" fill="rgba(0,0,0,.55)"/><text x="200" y="287" font-family="Arial,sans-serif" font-size="15" fill="#fff" text-anchor="middle">';
    function svg(fundo, desenho, legenda) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="' + fundo + '"/>' + desenho + rodape + legenda + ' · foto de exemplo</text></svg>';
    }
    var lista = [
      svg('#d8c3a5', '<ellipse cx="200" cy="120" rx="120" ry="55" fill="#e0a85a"/><rect x="85" y="140" width="230" height="22" rx="10" fill="#6b3b1f"/><rect x="80" y="160" width="240" height="12" rx="6" fill="#f2c94c"/><rect x="85" y="172" width="230" height="10" rx="5" fill="#5fae4f"/><ellipse cx="200" cy="200" rx="118" ry="28" fill="#d99a4e"/>', 'Lanche aberto'),
      svg('#c9d6df', '<rect x="110" y="70" width="180" height="150" rx="8" fill="#b08968"/><path d="M110 70 L150 40 L250 40 L290 70 Z" fill="#9c7656"/><path d="M180 70 L200 120 L215 70" stroke="#5a3e2b" stroke-width="4" fill="none"/><text x="200" y="175" font-family="Arial,sans-serif" font-size="18" fill="#3b2a1e" text-anchor="middle">lacre aberto</text>', 'Embalagem'),
      svg('#e8e2d0', '<rect x="120" y="60" width="160" height="180" rx="10" fill="#fff" stroke="#999"/><line x1="140" y1="95" x2="260" y2="95" stroke="#555" stroke-width="3"/><line x1="140" y1="130" x2="260" y2="130" stroke="#555" stroke-width="3"/><line x1="140" y1="165" x2="230" y2="165" stroke="#c0392b" stroke-width="3"/><circle cx="250" cy="165" r="12" fill="none" stroke="#c0392b" stroke-width="3"/>', 'Item faltando'),
      svg('#bfd7c4', '<rect x="165" y="60" width="70" height="170" rx="14" fill="#c0392b"/><rect x="165" y="110" width="70" height="40" fill="#f5f5f5"/><ellipse cx="200" cy="62" rx="35" ry="8" fill="#aaa"/>', 'Bebida'),
      svg('#d9d2c3', '<rect x="60" y="110" width="280" height="110" rx="12" fill="#f4e1b5"/><rect x="80" y="125" width="80" height="80" rx="6" fill="#e8b04b"/><rect x="175" y="125" width="70" height="80" rx="6" fill="#f1d27a"/><rect x="260" y="125" width="60" height="80" rx="6" fill="#d98c3a"/>', 'Batata e acompanhamentos')
    ];
    return lista.map(function (s) {
      try { return URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' })); }
      catch (e) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); }
    });
  })();
  /* foto combinando com o motivo (0 lanche, 1 embalagem, 2 item faltando, 3 bebida, 4 batata) */
  var FOTO_MOTIVO = {
    'PEDIDO VEIO ERRADO': [0, 4], 'PEDIDO ERRADO': [0, 4], 'ITEM COM CARACTERÍSTICA DE QUALIDADE RUIM': [0, 4],
    'PARTE DO ITEM NÃO FOI ENVIADO': [2, 3], 'FALTOU ITEM': [2, 3], 'PEDIDO REVIRADO/VIOLADO': [1, 0]
  };
  function fotosDe(r, n, motivo) {
    var lista = FOTO_MOTIVO[motivo] || [0, 1, 2, 3, 4], out = [];
    for (var i = 0; i < n; i++) {
      var f = FOTOS[lista[Math.floor(r() * lista.length)]];
      if (out.indexOf(f) < 0) out.push(f);
    }
    return out;
  }

  /* ---------------- cancelamentos do iFood (mesma regra da Central) ---------------- */
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
  var GRUPO = {};
  POS_ENTREGA.forEach(function (m) { GRUPO[m[0]] = m[1]; });
  /* quem pediu o cancelamento e se conta contra o selo Super (regra de exemplo) */
  var ORIGEM_ANTES = {
    'CLIENTE DESISTIU DO PEDIDO': ['CLIENTE', false], 'PEDIDO EM DUPLICIDADE': ['CLIENTE', false],
    'ITEM INDISPONÍVEL NO MOMENTO': ['LOJA', true], 'ENDEREÇO FORA DA ÁREA DE ENTREGA': ['IFOOD', false],
    'O PEDIDO ESTÁ DEMORANDO': ['CLIENTE', true], 'PROBLEMA COM O PAGAMENTO': ['IFOOD', false]
  };
  /* conversa de exemplo no chat do iFood, por motivo */
  var CHAT_CANC = {
    'CLIENTE DESISTIU DO PEDIDO': ['Pedi por engano, pode cancelar?', 'Tudo bem, cancelado. Até a próxima!'],
    'O PEDIDO ESTÁ DEMORANDO': ['Já passou do horário e nada do pedido.', 'Desculpe a demora, o pedido está saindo agora.'],
    'ITEM INDISPONÍVEL NO MOMENTO': ['Posso trocar o item que acabou?', 'Infelizmente acabou mesmo, vamos cancelar e estornar.'],
    'PEDIDO VEIO ERRADO': ['Veio um lanche diferente do que eu pedi.', 'Sentimos muito pelo erro! Pode mandar uma foto?'],
    'PARTE DO ITEM NÃO FOI ENVIADO': ['Faltou a bebida no meu pedido.', 'Desculpe! Vamos estornar o item que faltou.'],
    'ITEM COM CARACTERÍSTICA DE QUALIDADE RUIM': ['A batata chegou murcha e fria.', 'Sentimos muito, vamos verificar com a cozinha.'],
    'PEDIDO REVIRADO/VIOLADO': ['A embalagem chegou aberta.', 'Que chato! Pode enviar uma foto da embalagem?'],
    'O PEDIDO NÃO FOI ENTREGUE': ['O app diz entregue mas não recebi.', 'O entregador registrou a entrega no local, vamos conferir.'],
    'CLIENTE NÃO LOCALIZADO': ['O entregador não me achou.', 'Ele ficou 10 minutos no endereço e tentou ligar pelo app.']
  };
  function itensTxt(p) { return p.itens.map(function (i) { return i.qtd + 'x ' + i.nome; }).join(' · '); }

  function linhaCanc(p, dia, motivo, itens, valorCanc, contestavel, contestou) {
    var rx = M.rng('cancx|' + p.id + '|' + motivo);
    var grupo = GRUPO[motivo] || 'antes';
    var stc = '-';
    if (contestou) stc = M.pesado(rx, [['CONTESTAÇÃO ACATADA', 55], ['CONTESTAÇÃO NEGADA', 30], ['EM ANÁLISE', 15]]);
    else rx();
    /* recente e ainda dentro do prazo do iFood: nao conta como "fora do prazo" */
    if (contestavel && !contestou && dia >= M.dia(-2)) stc = 'AGUARDANDO CONTESTAÇÃO';
    var origem, impacta;
    if (grupo === 'antes') { var o = ORIGEM_ANTES[motivo] || ['CLIENTE', false]; origem = o[0]; impacta = o[1]; }
    else { origem = 'CLIENTE'; impacta = grupo !== 'nr'; }
    if (stc === 'CONTESTAÇÃO ACATADA') impacta = false;
    var fala = CHAT_CANC[motivo], chat = [];
    if (fala && rx() < (grupo === 'antes' ? 0.35 : 0.7)) {
      chat.push({ autor: 'Cliente', texto: fala[0] });
      if (rx() < 0.85) chat.push({ autor: 'Loja', texto: fala[1] });
    }
    var fotos = (grupo === 'coz' || grupo === 'des') && rx() < 0.55 ? fotosDe(rx, 1 + Math.floor(rx() * 3), motivo) : [];
    return junta({
      id_loja: idLojaDo(p), id_pedido: idPedido(p), data: dia, turno: turnoDe(p.min_pedido),
      status_pedido: motivo === 'PARTE DO ITEM NÃO FOI ENVIADO' ? 'CONCLUIDO' : 'CANCELADO',
      motivo: motivo, impactou_super: impacta, origem: origem,
      itens_cancelados: itens, valor_cancelamento: brl(valorCanc), valor_pedido: brl(p.total),
      contestavel: !!contestavel, loja_contestou: !!contestou, status_contestacao: stc,
      data_limite_contestacao: M.somaDias(dia, 7) + 'T23:59:00-03:00',
      id_saipos: idSaipos(p), primeiro_pedido: rx() < 0.08, chat: chat, fotos: fotos
    }, pagamento(p));
  }
  var cacheCanc = {};
  function cancDia(dia) {
    return cacheado(cacheCanc, dia, function () {
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
      return out;
    });
  }
  D.tabela('ifood_fato_cancelamento', function () {
    var out = [];
    diasAte(62).forEach(function (dia) { out = out.concat(cancDia(dia)); });
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
  var cacheAval = {};
  function avalDia(dia) {
    return cacheado(cacheAval, dia, function () {
      var out = [];
      M.lojas.forEach(function (l) {
        pedidosDia(dia, l.id).forEach(function (p) {
          if (p.canal !== 'ifood' || p.nota == null) return;
          var r = M.rng('aval|' + p.id);
          out.push({
            id_loja: idLojaDo(p), data_avaliacao: dia, nota: p.nota, tags: tagsDe(p, r), comentario: p.comentario || null,
            data_pedido: M.ts(p.dia, p.min_pedido), id_pedido_curto: p.numero_ifood
          });
        });
      });
      return out;
    });
  }
  D.tabela('ifood_fato_avaliacao', function () {
    var out = [];
    M.intervalo(M.dia(-62), M.dia(-1)).forEach(function (dia) { out = out.concat(avalDia(dia)); });
    return out;
  });

  /* ---------------- chamados (negociacao) do iFood (mesma regra da Central) ---------------- */
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
  var REJEITA = {
    'INFORMOU NOVO PRAZO': 'Não dá para esperar mais, prefiro cancelar.', 'ENVIOU O ITEM QUE FALTOU': 'Não precisa mandar, prefiro o reembolso.',
    'OFERECEU REEMBOLSO PARCIAL': 'Reembolso parcial não resolve.', 'ENVIOU O ITEM CORRETO': 'Não precisa, prefiro o reembolso.'
  };
  var MOMENTO = {
    'PEDIDO ATRASADO': 'PEDIDO EM ATRASO', 'QUERO CANCELAR O PEDIDO': 'PEDIDO EM ATRASO',
    'FALTOU ITEM': 'APÓS A ENTREGA', 'PEDIDO ERRADO': 'APÓS A ENTREGA',
    'ALTERAR ENDEREÇO': 'DURANTE O PREPARO', 'DÚVIDA SOBRE O PEDIDO': 'DURANTE O PREPARO'
  };
  var cacheCha = {};
  function chamadosDia(dia) {
    return cacheado(cacheCha, dia, function () {
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
          /* campos extras desta tela (sorteio separado, para nao mudar o que a Central mostra) */
          var rx = M.rng('chamx|' + p.id);
          var rc = semResp ? (p.cancelado ? 'CANCELOU' : (rx() < 0.5 ? 'EXPIRADA' : 'NÃO RESPONDEU'))
            : evitou ? 'ACEITOU' : voltou ? (EVITA[resp] && rx() < 0.5 ? 'REJEITOU' : 'RESPONDEU') : 'NÃO RESPONDEU';
          var reemb = resp === 'OFERECEU REEMBOLSO PARCIAL' ? brl(Math.min(p.subtotal, 8 + rx() * 20)) : 0;
          var cupom = resp === 'INFORMOU NOVO PRAZO' && rx() < 0.35 ? M.escolhe(rx, [5, 10, 15]) : 0;
          var fotos = (mot === 'FALTOU ITEM' || mot === 'PEDIDO ERRADO') && rx() < 0.45 ? fotosDe(rx, 1 + Math.floor(rx() * 2), mot) : [];
          /* a ultima fala do cliente acompanha a resposta registrada */
          if (rc === 'REJEITOU' && chat.length > 2) chat[2] = { autor: 'Cliente', texto: REJEITA[resp] || 'Não concordo.' };
          out.push(junta({
            id_loja: idLojaDo(p), id_pedido: idPedido(p), data: dia, turno: turnoDe(p.min_pedido), motivo: mot,
            momento_solicitacao: MOMENTO[mot] || 'APÓS A ENTREGA', quem_iniciou: 'CLIENTE',
            resposta_loja: resp, resposta_cliente: rc, valor_reembolso: reemb, valor_cupom: cupom,
            cancelamento_evitado: evitou, impactou_super: semResp || (p.cancelado && !evitou),
            id_saipos: idSaipos(p), primeiro_pedido: rx() < 0.07, chat: chat, fotos: fotos
          }, pagamento(p)));
        });
      });
      return out;
    });
  }
  D.tabela('ifood_fato_negociacao', function () {
    var out = [];
    diasAte(62).forEach(function (dia) { out = out.concat(chamadosDia(dia)); });
    return out;
  });

  /* ---------------- qualidade por semana (resumo do Portal do Parceiro) ---------------- */
  D.tabela('ifood_fato_qualidade_periodo', function () {
    var out = [], fim = M.dia(-1);
    while (M.diaSemana(fim) !== 0) fim = M.somaDias(fim, -1);  /* semanas fechadas, de segunda a domingo */
    for (var s = 0; s < 8; s++) {
      var f = M.somaDias(fim, -7 * s), ini = M.somaDias(f, -6), g = {};
      DIM.forEach(function (x) { g[x.id_loja] = { ped: 0, canc: 0, neg: 0, negSup: 0, resp: 0, nAv: 0, sAv: 0 }; });
      M.intervalo(ini, f).forEach(function (dia) {
        M.lojas.forEach(function (l) {
          pedidosDia(dia, l.id).forEach(function (p) { if (p.canal === 'ifood') g[idLojaDo(p)].ped++; });
        });
        cancDia(dia).forEach(function (c) { if (c.impactou_super) g[c.id_loja].canc++; });
        chamadosDia(dia).forEach(function (n) {
          var o = g[n.id_loja]; o.neg++;
          if (n.impactou_super) o.negSup++;
          if (n.resposta_loja !== 'NÃO RESPONDEU') o.resp++;
        });
        avalDia(dia).forEach(function (a) { var o = g[a.id_loja]; o.nAv++; o.sAv += a.nota; });
      });
      DIM.forEach(function (x) {
        var o = g[x.id_loja];
        out.push({
          id_loja: x.id_loja, periodo_inicio: ini, periodo_fim: f, pedidos_totais: o.ped,
          cancelamentos_super: o.canc, pct_cancelamentos_super: o.ped ? M.arred(o.canc / o.ped, 4) : 0,
          negociacoes_super: o.negSup, pct_negociacoes_super: o.ped ? M.arred(o.negSup / o.ped, 4) : 0,
          pct_respostas_negociacoes: o.neg ? M.arred(o.resp / o.neg, 4) : 1,
          qtd_avaliacoes: o.nAv, media_avaliacoes: o.nAv ? M.arred(o.sAv / o.nAv, 2) : null
        });
      });
    }
    return out;
  });

  /* ---------------- selo Super Restaurante (por marca) ---------------- */
  var PLANOS = {
    canc: 'Reduzir cancelamentos: conferir itens na expedição e pausar produto em falta na hora.',
    cham: 'Responder todos os chamados em até 5 minutos e oferecer novo prazo antes do cliente pedir.',
    nota: 'Subir a nota: revisar embalagem térmica e o tempo de espera do pedido pronto.'
  };
  function superLinhas() {
    var seg = M.hoje(); while (M.diaSemana(seg) !== 1) seg = M.somaDias(seg, -1);
    var dez = M.hoje().slice(0, 8) + '10';
    if (dez > M.hoje()) dez = M.somaDias(M.hoje().slice(0, 8) + '01', -1).slice(0, 8) + '10';
    var out = [];
    DIM.forEach(function (x) {
      /* nivel atual: mesmo sorteio da Central */
      var r = M.rng('super|' + x.id_loja);
      var L = M.loja(x.loja) || { peso: 0.6 };
      var nivel = M.pesado(r, [[4, 30], [3, 35], [2, 25], [1, 10]]);
      var a = {
        tipo: 'nivel_atual', id_loja: x.id_loja, nome: x.nome, nivel: nivel, e_super: nivel >= 3 && r() < 0.85,
        total_pedidos: Math.round((x.marca ? 900 : 3600) * L.peso * (0.85 + r() * 0.3)),
        media_avaliacoes: M.arred(4.5 + r() * 0.4, 1), pct_cancelamento: M.arred(0.004 + r() * 0.016, 4),
        pct_chamados: M.arred(0.01 + r() * 0.03, 4), atualizado_em: seg + 'T08:00:00-03:00'
      };
      var rx = M.rng('superx|' + x.id_loja);
      function completa(o, ref, periodo) {
        o.referencia = ref; o.periodo = periodo; o.e_elegivel = o.nivel != null;
        o.status = o.e_super ? 'SUPER' : 'NÃO SUPER';
        o.pedidos_avaliados = Math.round(o.total_pedidos * (0.22 + rx() * 0.08));
        o.canc_resp_loja = Math.round(o.total_pedidos * o.pct_cancelamento);
        o.chamados_validos = Math.round(o.total_pedidos * o.pct_chamados);
        /* indicador mais longe da meta (metas de exemplo: 1,5% canc., 3% chamados, nota 4,8) */
        var sc = [['canc', o.pct_cancelamento / 0.015], ['cham', o.pct_chamados / 0.03], ['nota', (4.95 - o.media_avaliacoes) / 0.3]];
        sc.sort(function (x, y) { return y[1] - x[1]; });
        var pior = sc[0][1] >= 0.85 ? sc[0][0] : null;
        o.plano_acao = o.e_super ? (pior ? PLANOS[pior] : 'Manter o ritmo: nenhum indicador fora da meta.') : PLANOS[pior || 'cham'];
        return o;
      }
      out.push(completa(a, dez, 'ciclo fechado (trimestre anterior)'));
      /* previsao do ciclo em andamento: pode subir ou cair um nivel */
      var d = M.pesado(rx, [[0, 60], [1, 22], [-1, 18]]);
      var nv = Math.max(1, Math.min(5, nivel + d));
      var p = {
        tipo: 'proxima_avaliacao', id_loja: x.id_loja, nome: x.nome, nivel: nv, e_super: nv >= 3 && (d > 0 || a.e_super || rx() < 0.5),
        total_pedidos: Math.round(a.total_pedidos * (0.55 + rx() * 0.2)),
        media_avaliacoes: M.arred(Math.min(4.9, Math.max(4.3, a.media_avaliacoes + (d * 0.1) + (rx() - 0.5) * 0.1)), 1),
        pct_cancelamento: M.arred(Math.max(0.002, a.pct_cancelamento * (d < 0 ? 1.4 : d > 0 ? 0.7 : 1)), 4),
        pct_chamados: M.arred(Math.max(0.005, a.pct_chamados * (d < 0 ? 1.3 : d > 0 ? 0.75 : 1)), 4),
        atualizado_em: M.dia(-1) + 'T08:00:00-03:00'
      };
      out.push(completa(p, M.dia(-1), 'parcial do ciclo em andamento'));
    });
    return out;
  }
  D.tabela('ifood_fato_super_status', superLinhas);

  /* =================================================================
     Sistema de entregas antigo (so aparece com PDG_FOODY ligado em assets/chaves.js)
     ================================================================= */
  function entreguesIfood(dia) {
    var out = [];
    M.lojas.forEach(function (l) {
      pedidosDia(dia, l.id).forEach(function (p) {
        if (p.canal !== 'ifood' || p.cancelado || p.status !== 'entregue' || !p.motoboy_id) return;
        out.push(p);
      });
    });
    return out;
  }
  function atrasoDe(p) { return (p.min_entrega - p.min_pedido) - p.prazo_min; }

  /* entregas do iFood por dia, marca e turno */
  var cacheEnt = {};
  D.tabela('foody_vw_entregas_dia', function () {
    var out = [];
    diasAte(62).forEach(function (dia) {
      out = out.concat(cacheado(cacheEnt, dia, function () {
        var g = {}, lista = [];
        entreguesIfood(dia).forEach(function (p) {
          var id = idLojaDo(p), t = turnoDe(p.min_pedido), k = id + '|' + t;
          var o = g[k];
          if (!o) {
            o = g[k] = { id_loja: id, unidade: p.unidade, dia_operacional: dia, turno: t, pedidos: 0, no_prazo: 0, atrasados: 0,
              atraso_ate_10: 0, atraso_10_30: 0, atraso_mais_30: 0, _sa: 0, pior_atraso_min: 0, sem_codigo: 0, no_prazo_foody: 0, _sp: 0, _se: 0 };
            lista.push(o);
          }
          var a = atrasoDe(p);
          o.pedidos++;
          if (a <= 0) o.no_prazo++;
          else {
            o.atrasados++; o._sa += a;
            if (a <= 10) o.atraso_ate_10++; else if (a <= 30) o.atraso_10_30++; else o.atraso_mais_30++;
            if (a > o.pior_atraso_min) o.pior_atraso_min = a;
          }
          /* prazo padrao do sistema antigo: mais folgado, por isso inflava o numero */
          if (a <= 10) o.no_prazo_foody++;
          if (semCodigo(p)) o.sem_codigo++;
          o._sp += p.min_pronto - p.min_pedido; o._se += p.min_entrega - p.min_saida;
        });
        return lista.map(function (o) {
          return {
            id_loja: o.id_loja, unidade: o.unidade, dia_operacional: o.dia_operacional, turno: o.turno, pedidos: o.pedidos,
            no_prazo: o.no_prazo, atrasados: o.atrasados, atraso_ate_10: o.atraso_ate_10, atraso_10_30: o.atraso_10_30,
            atraso_mais_30: o.atraso_mais_30, atraso_medio_min: o.atrasados ? M.arred(o._sa / o.atrasados, 1) : null,
            pior_atraso_min: o.pior_atraso_min, sem_codigo: o.sem_codigo, no_prazo_foody: o.no_prazo_foody,
            preparo_medio_min: M.arred(o._sp / o.pedidos, 1), entrega_medio_min: M.arred(o._se / o.pedidos, 1)
          };
        });
      }));
    });
    return out;
  });

  /* pedido a pedido, com o prazo prometido (lista "ver pedidos atrasados") */
  var cachePz = {};
  D.tabela('foody_vw_pedido_prazo', function () {
    var out = [];
    diasAte(62).forEach(function (dia) {
      out = out.concat(cacheado(cachePz, dia, function () {
        return entreguesIfood(dia).map(function (p) {
          var a = atrasoDe(p);
          return {
            n_pedido: p.numero, id_ifood: p.numero_ifood, unidade: p.unidade, turno: turnoDe(p.min_pedido),
            entregador: p.motoboy_nome, dia_operacional: dia, prazo_prometido_min: p.prazo_min, atraso_real_min: a,
            data_hora_pedido: lt(dia, p.min_pedido), entrega_prometida: lt(dia, p.min_pedido + p.prazo_min),
            fonte_prazo_real: (M.hash('fpz|' + p.id) % 10) < 2 ? 'raio (estimado)' : 'real (iFood)',
            no_prazo_real: a <= 1   /* 1 minuto de tolerancia */
          };
        });
      }));
    });
    return out;
  });

  /* pagamento dos entregadores por bloco (protegido por senha; valores em R$ so para o dono) */
  var REGRA = { hora: 18, horaFds: 22, taxaBase: 5, taxaKm: 1.2, hDia: 4, hNoite: 5.5 };  /* regra de exemplo, configuravel */
  function taxaMoto(p) { return Math.round((REGRA.taxaBase + REGRA.taxaKm * Number(p.distancia_km || 0)) * 2) / 2; }
  var cachePg = {};
  function pagamentoDia(dia) {
    if (cachePg[dia]) return cachePg[dia];
    var g = {}, lista = [], vh = fds(dia) ? REGRA.horaFds : REGRA.hora;
    M.lojas.forEach(function (l) {
      M.pedidos(dia, l.id).forEach(function (p) {
        if (p.canal === 'retirada' || p.cancelado || p.status !== 'entregue' || !p.motoboy_id) return;
        var bloco = p.min_pedido < 17 * 60 ? 'Dia' : 'Noite', k = l.id + '|' + bloco + '|' + p.motoboy_id;
        var o = g[k];
        if (!o) { o = g[k] = { loja: l.id, unidade: l.nome, bloco: bloco, mb: p.motoboy_id, entregador: p.motoboy_nome, entregas: 0, taxas: 0, atrasos: 0, ini: null, fim: null }; lista.push(o); }
        o.entregas++; o.taxas += taxaMoto(p);
        if (atrasoDe(p) > 0) o.atrasos++;
        if (o.ini == null || p.min_saida < o.ini) o.ini = p.min_saida;
        if (o.fim == null || p.min_entrega > o.fim) o.fim = p.min_entrega;
      });
    });
    cachePg[dia] = lista.map(function (o) {
      var r = M.rng('pgx|' + dia + '|' + o.mb + '|' + o.bloco);
      var semEscala = r() < 0.08;
      var hEsc = semEscala ? null : (o.bloco === 'Dia' ? REGRA.hDia : REGRA.hNoite);
      var hEnt = Math.max(1, (o.fim - o.ini) / 60);
      return {
        id_loja: 'ifood-' + o.loja, unidade: o.unidade, dia_operacional: dia, bloco: o.bloco, entregador: o.entregador,
        horas_escala: hEsc, entregas: o.entregas, atrasos: o.atrasos,
        valor_hora: vh, fim_de_semana: fds(dia),   /* a tela escreve a regra com este valor */
        taxas: brl(o.taxas),
        pagar_por_escala: brl(Math.max(o.taxas, (hEsc || 0) * vh)),
        pagar_por_entregas: brl(Math.max(o.taxas, hEnt * vh))
      };
    });
    return cachePg[dia];
  }
  D.rpc('foody_pagamento_motoboy', function (b, ctx) {
    if (String((b && b.p_senha) || '') !== 'demo') throw D.erro(401, 'Senha inválida', '28000');
    var out = [];
    fechados(36).forEach(function (dia) {
      pagamentoDia(dia).forEach(function (o) {
        var x = junta({}, o);
        if (!ctx.admin) { x.taxas = null; x.pagar_por_escala = null; x.pagar_por_entregas = null; x.valor_hora = null; }
        out.push(x);
      });
    });
    return out;
  });
})();
