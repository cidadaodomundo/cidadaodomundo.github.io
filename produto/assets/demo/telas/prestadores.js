/* Quem conserta (demonstracao): lista de prestadores de servico por setor.
   Simula a rpc prestador_consulta (acoes listar, adicionar, editar e arquivar).
   Usada pela tela prestadores/ e pela Manutencao (sugestao no cartao e janela de telefones).
   Empresas e telefones sao inventados: telefone no formato ficticio (00) 90000-0000.
   O que se grava na tela fica so neste navegador (localStorage, chave demo_prestadores). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;
  var L2 = (M.lojas[1] || M.lojas[0] || { nome: '' }).nome;

  /* nome, setor, telefone, o que faz, aviso, quem tem o numero, dias desde a ultima vez, origem */
  var BASE = [
    ['Refrigeração Exemplo', 'Refrigeração e câmara fria', '(00) 90000-0101', 'Freezer, geladeira, câmara fria e chopeira', 'Cobra visita técnica fora do horário comercial (regra de exemplo)', '', 6, 'Indicação de fornecedor'],
    ['Assistência Frio Exemplo', 'Refrigeração e câmara fria', '(00) 90000-0102', 'Câmara fria, balcão refrigerado e máquina de gelo', '', '', 41, 'Cadastro na tela'],
    ['Geladeiras Modelo Express', 'Refrigeração e câmara fria', '(00) 90000-0103', 'Freezer horizontal e geladeira', 'NÃO RECOMENDADO: demorou 10 dias e o freezer voltou a parar', '', 130, 'Cadastro na tela'],
    ['Elétrica Modelo', 'Elétrica', '(00) 90000-0201', 'Tomadas, disjuntores, quadro de luz e iluminação', '', '', 3, 'Indicação de outro restaurante'],
    ['Eletro Exemplo Serviços', 'Elétrica', '(00) 3000-0202', 'Instalação de equipamentos e troca de fiação', 'Só atende com hora marcada', '', 58, 'Cadastro na tela'],
    ['Eletricista de plantão (noite)', 'Elétrica', '', 'Atende à noite e no fim de semana', '', 'gerente da loja ' + L2, 19, 'Indicação da equipe'],
    ['Hidráulica Faz-Tudo Exemplo', 'Hidráulica e faz-tudo', '(00) 90000-0301', 'Pia, torneira, ralo, descarga e pequenos reparos', 'Só atende de manhã', '', 9, 'Cadastro na tela'],
    ['Desentupidora Modelo', 'Hidráulica e faz-tudo', '(00) 90000-0302', 'Esgoto e ralo entupidos, 24 horas', 'Pedir orçamento antes de começar', '', 27, 'Indicação de outro restaurante'],
    ['Assistência Cozinha Exemplo', 'Equipamentos de cozinha', '(00) 90000-0401', 'Fritadeira, banho-maria, seladora, liquidificador e moedor', '', '', 5, 'Nota fiscal de serviço'],
    ['Assistência de Fornos Exemplo', 'Forno e micro-ondas', '(00) 90000-0501', 'Forno combinado, forno elétrico e micro-ondas', 'Nunca foi testado: sem serviço confirmado ainda', '', 0, 'Indicação de fornecedor'],
    ['Exaustão Modelo', 'Coifa e exaustão', '(00) 90000-0601', 'Limpeza e conserto de coifa e motor do exaustor', '', '', 14, 'Cadastro na tela'],
    ['Gás & Chapa Exemplo', 'Gás e chapa', '(00) 90000-0701', 'Chapa, fogão industrial, broiler, mangueira e registro de gás', 'Conferir a validade da mangueira na visita', '', 33, 'Nota fiscal de serviço'],
    ['Ar-Condicionado Exemplo', 'Ar-condicionado', '(00) 90000-0801', 'Split: limpeza, recarga de gás e instalação', '', '', 64, 'Cadastro na tela'],
    ['Reparos & Obras Exemplo', 'Telhado e obra', '(00) 90000-0901', 'Telhado, goteira, toldo, pintura, piso e porta', '', '', 22, 'Indicação de outro restaurante'],
    ['Limpeza Pesada Modelo', 'Limpeza pesada', '(00) 90000-1001', 'Caixa de gordura, fossa e limpeza pós-obra', 'Agendar com 3 dias de antecedência', '', 46, 'Cadastro na tela'],
    ['Casa das Peças Exemplo', 'Peças e outros', '(00) 3000-1101', 'Borracha de geladeira, resistência, botão e termostato', '', '', 12, 'Cadastro na tela'],
    ['Vidraçaria Exemplo', 'Vidraçaria', '', 'Vidro de porta, vitrine e espelho', '', 'escritório', 0, 'Cadastro na tela']
  ];

  var CHAVE = 'demo_prestadores';
  function ler() {
    try { var o = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (o && o.mud) return o; } catch (e) {}
    return { novos: [], mud: {}, fora: [], seq: 900 };
  }
  function grava(o) { try { localStorage.setItem(CHAVE, JSON.stringify(o)); } catch (e) {} }
  var MEM = ler();

  function base() {
    return BASE.map(function (x, i) {
      return {
        id: 101 + i, nome: x[0], setor: x[1], telefone: x[2], faz: x[3], aviso: x[4], numero_com: x[5],
        ultima: x[6] ? M.dia(-x[6]) : null, origem: x[7]
      };
    });
  }
  function lista() {
    var l = base().concat(MEM.novos.map(function (p) { var o = {}; for (var k in p) o[k] = p[k]; return o; }));
    return l.filter(function (p) { return MEM.fora.indexOf(p.id) < 0; }).map(function (p) {
      var m = MEM.mud[p.id];
      if (m) for (var k in m) p[k] = m[k];
      return p;
    });
  }
  function limpa(d) {
    d = d || {};
    return {
      nome: String(d.nome || '').trim(), setor: String(d.setor || 'Peças e outros').trim(),
      telefone: String(d.telefone || '').trim(), faz: String(d.faz || '').trim(),
      aviso: String(d.aviso || '').trim(), numero_com: String(d.numero_com || '').trim()
    };
  }

  D.rpc('prestador_consulta', function (b, ctx) {
    var acao = b.p_acao || 'listar', d = b.p_dados || {};
    if (acao === 'listar') return { gente: lista(), quem: ctx.nome };
    if (acao === 'adicionar') {
      var n = limpa(d);
      if (!n.nome) throw D.erro(400, 'Escreva o nome', 'P0001');
      n.id = ++MEM.seq; n.ultima = M.hoje(); n.origem = 'Cadastro na tela';
      MEM.novos.push(n); grava(MEM);
      return { ok: true, id: n.id };
    }
    if (acao === 'editar') {
      var id = +d.id;
      if (!lista().some(function (p) { return p.id === id; })) throw D.erro(404, 'Contato não encontrado', 'P0002');
      MEM.mud[id] = limpa(d); grava(MEM);
      return { ok: true, id: id };
    }
    if (acao === 'arquivar') {
      var ia = +d.id;
      if (MEM.fora.indexOf(ia) < 0) MEM.fora.push(ia);
      grava(MEM);
      return { ok: true, id: ia };
    }
    throw D.erro(400, 'Ação desconhecida: ' + acao, 'P0001');
  });
})();
