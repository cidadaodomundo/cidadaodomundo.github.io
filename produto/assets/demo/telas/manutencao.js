/* Manutencao (demonstracao): chamados de conserto por loja.
   Simula a tabela manutencao_chamado (leitura com filtros) e a rpc manutencao_acao
   (novo, editar, situacao, resolver, anotar, nao_conserto, excluir, confirmar).
   A lista de prestadores (rpc prestador_consulta) vem de telas/prestadores.js.
   Os chamados sao abertos na propria tela; os de exemplo usam as lojas do config.js e datas relativas a hoje.
   O que se grava na tela fica so neste navegador (localStorage, chave demo_manutencao). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  function loja(i) { return i === 'T' ? 'Todas' : (M.lojas[i % M.lojas.length] || { nome: 'Todas' }).nome; }
  function nota(d, hora, autor, txt) { return M.br(M.dia(-d)) + ' ' + hora + ' ' + autor + ': ' + txt; }
  function agoraNota(autor, txt) { return M.br(M.hoje()) + ' ' + M.hm(M.minutosAgora()) + ' ' + autor + ': ' + txt; }
  function quando(d, hora) {
    var min = M.minDe(hora);
    if (d === 0) min = Math.min(min, Math.max(5, M.minutosAgora() - 40));
    return M.ts(M.dia(-d), min);
  }

  /* loja, item, detalhe, prioridade, situacao, aberto por, dias aberto, hora, dias desde resolvido, observacoes */
  var BASE = [
    [0, 'Freezer da cozinha não gela', 'A temperatura subiu para -5 °C desde ontem à noite. Os produtos foram passados para o freezer do bar.', 'urgente', 'aberto', 'cozinha', 1, '22:40', null,
      [[0, '09:15', 'Gerente', 'Liguei para a refrigeração, vem hoje à tarde.']]],
    [0, 'Lâmpada queimada no salão', 'Duas lâmpadas da área das mesas perto da janela.', 'quando_der', 'aberto', 'gerente da loja', 11, '18:05', null, []],
    [0, 'Torneira da pia de lavagem pingando', 'Pinga sem parar mesmo fechada.', 'normal', 'agendado', 'checklist de abertura', 4, '10:02', null,
      [[3, '10:20', 'Gerente', 'Hidráulica marcada para quinta de manhã.']]],
    [0, 'Chapa esquentando só de um lado', 'O lado direito não passa de 150 °C. Atrasa os pedidos no pico.', 'urgente', 'aberto', 'cozinha', 0, '12:20', null, []],
    [1, 'Ar-condicionado do salão não liga', 'Controle com pilha nova e mesmo assim não liga.', 'normal', 'aberto', 'gerente da loja', 5, '14:30', null,
      [[4, '15:02', 'Gerente', 'O disjuntor está ligado.']]],
    [1, 'Coifa fazendo barulho alto', 'Barulho de metal raspando quando liga na velocidade 2.', 'normal', 'aberto', 'cozinha', 8, '11:50', null,
      [[8, '12:10', 'Cozinha', 'O barulho começou no almoço.'], [7, '09:30', 'Gerente', 'Pedi orçamento para a exaustão.'],
       [5, '16:45', 'Escritório', 'Orçamento aprovado.'], [2, '11:00', 'Gerente', 'Peça encomendada, chega em 3 dias.']]],
    [1, 'Tomada do balcão do delivery em curto', 'Soltou faísca ao ligar a seladora. A tomada foi isolada com fita.', 'urgente', 'aberto', 'caixa', 2, '19:12', null,
      [[1, '18:30', 'Gerente', 'Ninguém usa a tomada até o eletricista vir.']]],
    [1, 'Fritadeira não esquenta', 'O óleo não passa de 120 °C.', 'normal', 'aberto', 'cozinha', 3, '17:40', null, []],
    [1, 'Goteira no estoque seco', 'Quando chove, pinga em cima da prateleira de embalagens.', 'normal', 'agendado', 'gerente da loja', 13, '09:10', null,
      [[10, '14:00', 'Gerente', 'Obra agendada para sábado de manhã.']]],
    [2, 'Ralo da cozinha entupido', 'Voltando sujeira pelo ralo perto da pia.', 'urgente', 'aberto', 'cozinha', 0, '11:35', null, []],
    [2, 'Forno combinado com erro E3', 'Mostra E3 no painel e desliga sozinho.', 'normal', 'aberto', 'cozinha', 6, '16:15', null,
      [[5, '10:10', 'Gerente', 'A assistência pediu foto do painel.']]],
    [2, 'Wi-fi do salão caindo', 'Clientes reclamam que a internet cai toda hora.', 'quando_der', 'aberto', 'caixa', 16, '20:30', null, []],
    [2, 'Porta da câmara fria não veda', 'Borracha rasgada embaixo, entra ar quente.', 'normal', 'aberto', 'checklist de abertura', 7, '10:45', null, []],
    ['T', 'Caixa de gordura: limpeza do trimestre', 'Limpeza programada em todas as lojas (regra de exemplo: a cada 3 meses).', 'quando_der', 'agendado', 'escritório', 10, '15:00', null,
      [[9, '11:30', 'Escritório', 'Agendado com a limpeza pesada para o começo do mês.']]],
    ['T', 'Extintores: conferir validade', 'Conferir a etiqueta de todos os extintores e trocar os vencidos.', 'normal', 'aberto', 'escritório', 3, '09:00', null, []],

    [0, 'Descarga do banheiro dos clientes', '', 'normal', 'resolvido', 'gerente da loja', 6, '13:20', 2,
      [[2, '16:20', 'Gerente', 'Trocado o reparo da descarga.']]],
    [1, 'Liquidificador industrial travando', 'O copo trava na base.', 'normal', 'resolvido', 'cozinha', 9, '18:00', 5,
      [[5, '15:30', 'Gerente', 'Assistência trocou o acoplamento.']]],
    [2, 'Disjuntor da cozinha desarmando', 'Desarma quando liga forno e chapa juntos.', 'urgente', 'resolvido', 'cozinha', 3, '12:05', 1,
      [[1, '10:05', 'Gerente', 'Eletricista trocou o disjuntor e separou o circuito.']]],
    [2, 'Recado: entrega do pão vai chegar mais cedo', '', 'normal', 'resolvido', 'caixa', 4, '08:30', 3,
      [[3, '08:40', 'Gerente', 'marcou: não era conserto']]],
    [0, 'Cadeira do salão bamba', '', 'quando_der', 'resolvido', 'gerente da loja', 5, '21:10', 1,
      [[1, '10:30', 'Gerente', 'Parafusos apertados.']]],
    [1, 'Pintura da fachada', 'Pintura descascando na entrada.', 'quando_der', 'resolvido', 'gerente da loja', 30, '10:00', 4,
      [[4, '17:10', 'Gerente', 'excluiu da tela']]],
    [0, 'Toldo da entrada rasgado', '', 'quando_der', 'resolvido', 'gerente da loja', 40, '15:40', 20, []],
    [1, 'Botijão de gás vazando', 'Cheiro de gás perto do fogão.', 'urgente', 'resolvido', 'cozinha', 36, '19:50', 35,
      [[35, '09:00', 'Gerente', 'Trocado o registro e a mangueira.']]],
    ['T', 'Dedetização das lojas', '', 'normal', 'resolvido', 'escritório', 60, '09:30', 50, []]
  ];

  function base() {
    return BASE.map(function (x, i) {
      var obs = (x[9] || []).map(function (o) { return nota(o[0], o[1], o[2], o[3]); }).join(' | ');
      var aberto = x[4] !== 'resolvido';
      var robo = aberto && !obs && x[6] >= 10
        ? 'Aviso automático: aberto há ' + x[6] + ' dias sem nenhuma observação. Ainda precisa de conserto?' : null;
      return {
        id: 2001 + i, unidade: loja(x[0]), item: x[1], descricao: x[2], prioridade: x[3], status: x[4], origem: x[5],
        aberto_em: quando(x[6], x[7]), resolvido_em: x[8] == null ? null : quando(x[8], '17:30'),
        obs: obs, robo_aviso: robo
      };
    });
  }

  var CHAVE = 'demo_manutencao';
  function ler() {
    try { var o = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (o && o.mud) return o; } catch (e) {}
    return { novos: [], mud: {}, seq: 5000 };
  }
  function grava() { try { localStorage.setItem(CHAVE, JSON.stringify(MEM)); } catch (e) {} }
  var MEM = ler();

  function todos() {
    return base().concat(MEM.novos.map(function (r) { var o = {}; for (var k in r) o[k] = r[k]; return o; })).map(function (r) {
      var m = MEM.mud[r.id];
      if (m) for (var k in m) r[k] = m[k];
      return r;
    });
  }
  function acha(id) {
    var r = todos().filter(function (x) { return x.id === +id; })[0];
    if (!r) throw D.erro(404, 'Chamado não encontrado', 'P0002');
    return r;
  }
  function muda(id, campos, autor, txt) {
    var r = acha(id), m = MEM.mud[r.id] || (MEM.mud[r.id] = {});
    for (var k in campos) m[k] = campos[k];
    if (txt) m.obs = (r.obs ? r.obs + ' | ' : '') + agoraNota(autor, txt);
    grava();
    return { ok: true, id: r.id };
  }

  D.tabela('manutencao_chamado', function () { return todos(); });

  D.rpc('manutencao_acao', function (b, ctx) {
    var a = b.p_acao, d = b.p_dados || {}, quem = ctx.nome;
    var PRI = { urgente: 1, normal: 1, quando_der: 1 };
    switch (a) {
      case 'novo':
        if (!String(d.item || '').trim()) throw D.erro(400, 'Escreva o que quebrou', 'P0001');
        var n = {
          id: ++MEM.seq, unidade: d.unidade || loja(0), item: String(d.item).trim(), descricao: String(d.descricao || '').trim(),
          prioridade: PRI[d.prioridade] ? d.prioridade : 'normal', status: 'aberto', origem: quem,
          aberto_em: M.agoraISO(), resolvido_em: null, obs: '', robo_aviso: null
        };
        MEM.novos.push(n); grava();
        return { ok: true, id: n.id };
      case 'editar':
        return muda(d.id, {
          item: String(d.item || '').trim() || acha(d.id).item, unidade: d.unidade || acha(d.id).unidade,
          prioridade: PRI[d.prioridade] ? d.prioridade : 'normal', descricao: String(d.descricao || '').trim()
        }, quem, 'editou o chamado');
      case 'situacao':
        return muda(d.id, { status: d.status === 'agendado' ? 'agendado' : 'aberto' }, quem,
          d.status === 'agendado' ? 'marcou como agendado' : 'voltou para aberto');
      case 'resolver':
        return d.feito
          ? muda(d.id, { status: 'resolvido', resolvido_em: M.agoraISO(), robo_aviso: null }, quem, 'marcou como resolvido')
          : muda(d.id, { status: 'aberto', resolvido_em: null }, quem, 'reabriu o chamado');
      case 'anotar':
        if (!String(d.texto || '').trim()) throw D.erro(400, 'Observação vazia', 'P0001');
        return muda(d.id, {}, quem, String(d.texto).trim().replace(/\s*\|\s*/g, ' / '));
      case 'nao_conserto':
        return muda(d.id, { status: 'resolvido', resolvido_em: M.agoraISO(), robo_aviso: null }, quem, 'marcou: não era conserto');
      case 'excluir':
        return muda(d.id, { status: 'resolvido', resolvido_em: M.agoraISO(), robo_aviso: null }, quem, 'excluiu da tela');
      case 'confirmar':
        return muda(d.id, { robo_aviso: null }, quem, 'conferiu: continua aberto');
    }
    throw D.erro(400, 'Ação desconhecida: ' + a, 'P0001');
  });
})();
