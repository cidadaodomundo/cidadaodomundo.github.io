/* =====================================================================
   PORTAS COMUNS (modo demonstracao): entrada, menu, anotacoes, frescor.
   O menu de cada pessoa sai daqui (MODULOS + PAPEIS).
   No banco de verdade isto vem das tabelas portal_usuario, portal_modulo
   e portal_usuario_modulo (veja LEIA-ME.md).
   ===================================================================== */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* id, nome, icone, grupo, url, ordem. Grupo comecando com "_" = tela que so abre por dentro de outra. */
  var MODULOS = [
    ['agora', 'Agora', '🔴', 'Delivery', 'agora/', 1],
    ['pausados', 'Produtos pausados', '⏸️', 'Delivery', 'pausados/', 2],
    ['cancelados', 'Cancelamentos', '🚫', 'Delivery', 'cancelados/', 3],
    ['turno', 'Turno do Delivery', '🧾', 'Delivery', 'turno/', 4],
    ['avaliacoes', 'Avaliações do dia', '⭐', 'Delivery', 'avaliacoes/', 5],
    ['qualidade', 'Como fomos · Qualidade', '📊', 'Delivery', 'qualidade/', 6],
    ['escala', 'Escala & Clima', '🗓', 'Delivery', 'delivery/escala.html', 7],
    ['motoboys', 'Motoboys · documentos', '🛵', 'Delivery', 'motoboys/', 8],

    ['rh', 'Central do RH', '👥', 'Gestão', 'rh/', 10],
    ['salao', 'Central Salão', '🍽', 'Gestão', 'salao/', 11],
    ['cozinha', 'Central Cozinha', '👨‍🍳', 'Gestão', 'cozinha/', 12],
    ['tv', 'TV da Cozinha', '📺', 'Gestão', 'tv/?portal=1', 13],
    ['freelas', 'Banco de Taxas e Freelas', '🤝', 'Gestão', 'freelas/', 14],
    ['manutencao', 'Manutenção', '🔧', 'Gestão', 'manutencao/', 15],
    ['cancelcaixa', 'Cancelamentos no Caixa', '🧾', 'Gestão', 'cancelcaixa/', 16],
    ['caixadia', 'Caixa · dia a dia', '📅', 'Gestão', 'cancelcaixa/dia.html', 17],
    ['escala-mensal', 'Escala do Mês', '📅', 'Gestão', 'escala-mensal/', 18],
    ['estoque', 'Central do Estoque', '📦', 'Gestão', 'estoque/', 19],
    ['producao', 'Central da Produção', '🍳', 'Gestão', 'producao/', 20],
    ['operacao', 'Desperdício', '🗑', 'Gestão', 'operacao/', 21],
    ['encomendas', 'Encomendas Grandes', '📦', 'Gestão', 'encomendas/', 22],

    ['pagamento', 'Pagar Motoboys', '💰', 'Escritório', 'pagamento/', 30],
    ['ponto', 'Painel RH', '📋', 'Escritório', 'ponto/', 31],
    ['rhcaixa', 'Caixa de entrada do RH', '📥', 'Escritório', 'rh/caixa.html', 32],
    ['folha', 'Folha do mês', '🧾', 'Escritório', 'rh/folha.html', 33],
    ['rescisao', 'Simular rescisão', '🧮', 'Escritório', 'rh/rescisao.html', 34],
    ['contas', 'Contas a Pagar', '💳', 'Escritório', 'contas/', 35],
    ['receber', 'Contas a Receber', '💵', 'Escritório', 'contas/?aba=receber', 36],
    ['conferencia', 'Conferência da Maquininha', '🧾', 'Escritório', 'conferencia/', 37],

    ['hoje', 'Um olho no negócio', '👁', 'Proprietário', 'hoje/', 40],
    ['painel', 'Painel do Dono', '🕹', 'Proprietário', 'painel/', 41],
    ['placar', 'Placar do Delivery', '🏆', 'Proprietário', 'placar/', 42],
    ['cobranca', 'Cobrança na Porta', '🧾', 'Proprietário', 'cobranca/', 43],
    ['ifood', 'iFood · Qualidade', '🍔', 'Proprietário', 'delivery/ifood-proprietario.html', 44],
    ['acessos', 'Acessos', '🔑', 'Proprietário', 'acessos/', 45],

    ['chegada', 'Chegada do dia', '⏱', '_dentro', 'chegada/', 90],
    ['resolver', 'Resolver hoje', '🔥', '_dentro', 'resolver/', 91],
    ['delivery', 'Central do Delivery · Agora', '🛵', '_dentro', 'delivery/central.html', 92],
    ['tempo', 'Tempo de Entrega', '⏱', '_dentro', 'tempo/', 93],
    ['fila', 'Fila de Pedidos · Agora', '🍔', '_dentro', 'fila/', 94],
    ['prestadores', 'Quem conserta', '📞', '_dentro', 'prestadores/', 95]
  ].map(function (x) { return { id: x[0], nome: x[1], icone: x[2], grupo: x[3], url: x[4], ordem: x[5] }; });

  var DENTRO_DELIVERY = ['chegada', 'resolver', 'delivery', 'tempo', 'fila'];
  var PAPEIS = {
    dono: null, /* todos */
    gerente: ['agora', 'pausados', 'cancelados', 'turno', 'avaliacoes', 'qualidade', 'escala', 'motoboys',
              'rh', 'salao', 'cozinha', 'tv', 'freelas', 'manutencao', 'cancelcaixa', 'caixadia', 'escala-mensal',
              'estoque', 'producao', 'operacao', 'encomendas', 'prestadores'].concat(DENTRO_DELIVERY),
    escritorio: ['pagamento', 'ponto', 'rhcaixa', 'folha', 'rescisao', 'contas', 'receber', 'conferencia',
                 'rh', 'freelas', 'manutencao', 'prestadores', 'avaliacoes', 'motoboys'],
    delivery: ['agora', 'pausados', 'cancelados', 'turno', 'avaliacoes', 'qualidade', 'escala', 'tv'].concat(DENTRO_DELIVERY)
  };
  function modulosDe(papel) {
    var ok = PAPEIS[papel];
    return MODULOS.filter(function (m) { return !ok || ok.indexOf(m.id) >= 0; });
  }
  function sessao(papel) {
    var u = D.usuarios[papel];
    return { usuario: u.usuario, nome: u.nome, admin: u.admin, papel: papel, modulos: modulosDe(papel), precisa_trocar: false };
  }
  /* para outras telas de demonstracao */
  D.modulos = MODULOS;
  D.papeis = PAPEIS;
  D.sessao = sessao;

  D.rpc('portal_login', function (b) {
    var u = String(b.p_usuario || '').trim().toLowerCase();
    if (!D.usuarios[u] || String(b.p_senha || '') !== 'demo') throw D.erro(401, 'Usuário ou senha inválidos', '28000');
    var s = sessao(u);
    s.token = 'demo-' + u;
    return s;
  });
  D.rpc('portal_eu', function (b, ctx) {
    var p = D.papelDoToken(b.p_token);
    if (!p) throw D.erro(401, 'Sessão expirada', '28000');
    return sessao(p);
  });
  D.rpc('portal_ok', function (b) { return !!D.papelDoToken(b.p_token); });
  D.rpc('portal_sair', function () { return true; });
  D.rpc('portal_trocar_senha', function () { return true; });

  /* anotacoes: ficam guardadas so neste navegador */
  function chaveNotas(tela) { return 'demo_notas:' + tela; }
  function lerNotas(tela) { try { return JSON.parse(localStorage.getItem(chaveNotas(tela)) || '[]'); } catch (e) { return []; } }
  D.rpc('anotacao_ler', function (b) { return lerNotas(b.p_tela || ''); });
  D.rpc('anotacao_gravar', function (b, ctx) {
    var l = lerNotas(b.p_tela || '').filter(function (n) { return n.chave !== b.p_chave; });
    if (b.p_texto) l.push({ chave: b.p_chave, texto: b.p_texto, autor: ctx.nome, atualizado_em: new Date().toISOString() });
    try { localStorage.setItem(chaveNotas(b.p_tela || ''), JSON.stringify(l)); } catch (e) {}
    return { ok: true, autor: ctx.nome };
  });

  /* frescor das fontes de dados: na demonstracao, tudo em dia */
  D.tabela('fato_frescor', function () {
    var h = M.hoje();
    return ['pdv_vendas', 'ifood_avaliacao', 'ifood_cancelamento', 'maquininha', 'ponto', 'entregas', 'google_avaliacao']
      .map(function (f) { return { fonte: f, ultimo_dia: h, farol: 'OK', ultima_carga: M.agoraISO() }; });
  });
})();
