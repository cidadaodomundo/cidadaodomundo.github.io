/* Banco de Taxas e Freelas (demonstracao): quem se ofereceu para trabalhar como taxa (diaria) ou vaga fixa.
   Simula a rpc freela_consulta (acoes listar, adicionar, editar e arquivar).
   As pessoas sao as de MUNDO.freelas (inventadas), com telefone no formato ficticio (00) 90000-0000.
   O que se grava na tela fica so neste navegador (localStorage, chave demo_freelas). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* funcao do MUNDO -> area da tela e o que a pessoa quer fazer */
  var AREA = {
    'Garçom/Garçonete': ['Atendimento e salão', 'atendimento no salão'],
    'Auxiliar de cozinha': ['Cozinha', 'auxiliar de cozinha'],
    'Chapeiro(a)': ['Cozinha', 'chapa'],
    'Copeiro(a)': ['Cozinha', 'copa (bebidas e sobremesas)'],
    'Bartender': ['Bar', 'bartender'],
    'Motoboy': ['Entrega', 'entregas com moto própria']
  };
  var DISP = ['Disponível sexta, sábado e domingo à noite', 'Disponível de segunda a sexta no almoço',
    'Disponível qualquer dia depois das 17h', 'Só fins de semana', 'Disponível para cobrir folgas e férias'];
  var EXP = ['Já trabalhou em hamburgueria', 'Dois anos de experiência em cozinha industrial', 'Primeiro emprego, aprende rápido',
    'Já fez eventos e festas', 'Trabalhou em restaurante por quilo'];
  var ORIGEM = ['Indicação da equipe', 'Balcão da loja', 'Ligou na loja', 'Já trabalhou como taxa', 'Cadastro na tela'];

  function base() {
    var r = M.rng('freelas-demo-v1');
    return M.freelas.map(function (f, i) {
      var a = AREA[f.funcao] || ['Não disse a área', ''];
      var L = f.loja ? M.loja(f.loja) : null;
      var tipo = i === 3 || i === 9 ? 'Vaga fixa' : i === 12 ? 'Não identificado' : M.pesado(r, [['Taxa', 8], ['Vaga fixa', 2]]);
      var semTel = i === 5 || i === 11;
      var obs = [];
      if (semTel) obs.push('Deixou o contato com o gerente da loja ' + (L ? L.nome : M.lojas[0].nome) + '.');
      obs.push('Mora no bairro ' + M.escolhe(r, M.bairros) + '.');
      obs.push(M.escolhe(r, DISP) + '.');
      obs.push(i % 4 === 1 ? 'Trabalhou como taxa na casa em ' + M.br(f.ultima_vez) + ' e foi bem.' : M.escolhe(r, EXP) + '.');
      if (tipo === 'Taxa') obs.push('Diária combinada de exemplo: R$ ' + f.valor_dia + '.');
      /* quem ja trabalhou como taxa entrou no banco antes desse dia */
      var desde = M.dia(-M.entre(r, 4, 220));
      if (i % 4 === 1 && desde > f.ultima_vez) desde = M.somaDias(f.ultima_vez, -M.entre(r, 10, 90));
      return {
        id: f.id, nome: f.nome,
        telefone: semTel ? '' : f.telefone,
        telefone2: i === 2 || i === 7 ? '(00) 90000-' + String(5100 + i * 13) : '',
        setor: i === 12 ? 'Não disse a área' : a[0], tipo: tipo, quer: i === 12 ? '' : a[1],
        obs: obs.join(' '), destaque: !semTel && tipo === 'Taxa' && f.nota >= 5,
        loja: L ? L.nome : '', desde: desde, origem: M.escolhe(r, ORIGEM)
      };
    });
  }

  var CHAVE = 'demo_freelas';
  function ler() {
    try { var o = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (o && o.mud) return o; } catch (e) {}
    return { novos: [], mud: {}, fora: [], seq: 9000 };
  }
  function grava() { try { localStorage.setItem(CHAVE, JSON.stringify(MEM)); } catch (e) {} }
  var MEM = ler();

  function lista() {
    return base().concat(MEM.novos.map(function (p) { var o = {}; for (var k in p) o[k] = p[k]; return o; }))
      .filter(function (p) { return MEM.fora.indexOf(p.id) < 0; })
      .map(function (p) { var m = MEM.mud[p.id]; if (m) for (var k in m) p[k] = m[k]; return p; });
  }
  function limpa(d) {
    d = d || {};
    var lojaOk = M.lojas.some(function (l) { return l.nome === d.loja; });
    return {
      nome: String(d.nome || '').trim(), telefone: String(d.telefone || '').trim(), telefone2: String(d.telefone2 || '').trim(),
      setor: String(d.setor || 'Não disse a área'), tipo: String(d.tipo || 'Não identificado'),
      quer: String(d.quer || '').trim(), obs: String(d.obs || '').trim(), destaque: !!d.destaque,
      loja: lojaOk ? d.loja : ''
    };
  }

  D.rpc('freela_consulta', function (b, ctx) {
    var acao = b.p_acao || 'listar', d = b.p_dados || {};
    if (acao === 'listar') return { gente: lista(), quem: ctx.nome };
    if (acao === 'adicionar') {
      var n = limpa(d);
      if (!n.nome) throw D.erro(400, 'Escreva o nome', 'P0001');
      n.id = ++MEM.seq; n.desde = M.hoje(); n.origem = 'Cadastro na tela';
      n.destaque = false; /* a tela grava o destaque logo depois, com editar */
      MEM.novos.push(n); grava();
      return { ok: true, id: n.id };
    }
    if (acao === 'editar') {
      var id = +d.id;
      if (!lista().some(function (p) { return p.id === id; })) throw D.erro(404, 'Pessoa não encontrada', 'P0002');
      MEM.mud[id] = limpa(d); grava();
      return { ok: true, id: id };
    }
    if (acao === 'arquivar') {
      var ia = +d.id;
      if (MEM.fora.indexOf(ia) < 0) MEM.fora.push(ia);
      grava();
      return { ok: true, id: ia };
    }
    throw D.erro(400, 'Ação desconhecida: ' + acao, 'P0001');
  });
})();
