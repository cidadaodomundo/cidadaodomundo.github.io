/* Encomendas Grandes (demonstracao): pedidos grandes de empresas, escolas e festas.
   Simula a tabela encomenda (leitura com filtros), a rpc encomenda_acao
   (novo, editar, situacao, assumir, anotar, contato) e a rpc dinheiro_consulta
   (p_acao 'encomenda': valor combinado de cada encomenda, so para o dono).
   Clientes e contatos sao ficticios (telefones com DDD 00). As encomendas sao cadastradas na propria tela;
   o que se grava fica so neste navegador (localStorage, chave demo_encomendas). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* a tela conta os dias pela data do navegador; os exemplos usam a mesma referencia */
  var HOJE = (function () { try { return new Date().toLocaleDateString('sv-SE'); } catch (e) { return M.hoje(); } })();
  function dia(n) { return M.somaDias(HOJE, n || 0); }
  function agora() { var d = new Date(); return { min: d.getHours() * 60 + d.getMinutes() }; }

  function loja(i) { return i == null || !M.lojas.length ? 'A definir' : M.lojas[i % M.lojas.length].nome; }
  function prato(i) { return (M.cardapio[i] || M.cardapio[0]).nome.replace(/\s*\(.*\)\s*$/, ''); }
  function daEquipe(i, cargo, padrao) {
    if (i == null || !M.lojas.length) return padrao;
    var id = M.lojas[i % M.lojas.length].id;
    var p = M.equipe.filter(function (x) { return x.loja === id && x.cargo === cargo; })[0];
    return p ? p.apelido : padrao;
  }
  function resp(tipo, i) {
    if (tipo === 'g') return daEquipe(i, 'Gerente da loja', 'Gerente');
    if (tipo === 'c') return daEquipe(i, 'Líder de cozinha', 'Cozinha');
    if (tipo === 'e') return 'Escritório';
    return null;
  }
  /* nota de hoje nunca fica com hora no futuro */
  function nota(d, hora, autor, txt) {
    if (!d && M.minDe(hora) > agora().min) hora = M.hm(Math.max(0, agora().min - 15));
    return M.br(dia(-d)) + ' ' + hora + ' ' + autor + ': ' + txt;
  }
  function notaAgora(autor, txt) { return M.br(HOJE) + ' ' + M.hm(agora().min) + ' ' + autor + ': ' + txt; }
  function quem(ctx) { return String(ctx.nome || 'Equipe').replace(/\s*\(.*\)\s*$/, ''); }

  /* loja, descricao, dias ate a entrega (null = a combinar), hora, quantidade, situacao,
     quem cuida (g = gerente da loja, c = cozinha, e = escritorio), por onde chegou, criada ha (dias),
     valor combinado (R$), contato do cliente, observacoes [dias atras, hora, autor (G = gerente), texto] */
  var BASE = [
    [0, 'Happy hour de fim de ano do Escritório Contábil Exemplo — 120 ' + prato(0) + ' e ' + prato(10), 2, '19:00', 120, 'confirmada', 'g', 'telefone', 9, 6240,
      'Recepção do Escritório Contábil Exemplo · (00) 90000-4120',
      [[9, '10:12', 'G', 'Cliente pediu orçamento para 120 pessoas.'], [6, '15:40', 'Escritório', 'Sinal de 50% recebido.'],
       [1, '11:05', 'G', 'Confirmado: entrega às 19h, molhos à parte e guardanapos extras.']]],
    [1, 'Formatura da Escola Modelo — 80 ' + prato(8) + ' e sucos', 5, '11:30', 80, 'anotada', null, 'e-mail', 2, 2950,
      'Secretaria da Escola Modelo · (00) 3000-1180',
      [[2, '09:20', 'Escritório', 'Pediram cardápio infantil e opção sem glúten.']]],
    [2, 'Confraternização da Academia Exemplo — 45 combos ' + prato(2), 0, '20:00', 45, 'em_producao', 'g', 'balcão', 6, 2180,
      'Recepção da Academia Exemplo · (00) 90000-2245',
      [[6, '18:30', 'G', 'Cliente passou na loja e combinou o cardápio.'], [3, '14:00', 'Escritório', 'Pagamento total recebido.'],
       [0, '10:10', 'Cozinha', 'Pães e carnes separados para a produção.']]],
    [1, 'Treinamento da Construtora Exemplo — 35 marmitas de ' + prato(15), 1, '12:00', 35, 'confirmada', 'g', 'telefone', 4, 1050,
      'Departamento pessoal da Construtora Exemplo · (00) 3000-2035',
      [[4, '16:00', 'G', 'Entregar no canteiro de obras, portão 2.'], [1, '10:30', 'G', 'Confirmado por telefone.']]],
    [2, 'Reunião do Condomínio Exemplo — 30 porções de ' + prato(13) + ' e ' + prato(12), 3, '19:30', 30, 'anotada', null, 'telefone', 1, 780,
      'Síndico do Condomínio Exemplo · (00) 90000-3030', []],
    [0, 'Aniversário de 15 anos — 60 ' + prato(1) + ' e milkshakes', 9, '20:30', 60, 'anotada', 'g', 'site', 3, 3300,
      'Família do aniversariante · (00) 90000-1560',
      [[3, '21:15', 'G', 'Querem uma mesa de burgers no salão de festas do prédio.']]],
    [null, 'Lançamento da Loja de Bicicletas Exemplo — cerca de 150 burgers', null, null, 150, 'anotada', null, 'e-mail', 5, null,
      'Marketing da Loja de Bicicletas Exemplo · (00) 3000-4150',
      [[5, '11:00', 'Escritório', 'Ainda vão definir a data e o local.']]],
    [0, 'Almoço de equipe da Clínica Exemplo — 25 ' + prato(16) + ' e ' + prato(5), null, null, 25, 'anotada', 'g', 'telefone', 2, null,
      'Administração da Clínica Exemplo · (00) 3000-5025', []],
    [1, 'Casamento — 200 mini burgers no coquetel', 14, '21:00', 200, 'confirmada', 'g', 'site', 20, 9800,
      'Cerimonial do casamento · (00) 90000-7200',
      [[20, '15:30', 'Dono', 'Visita técnica marcada no salão de festas.'], [12, '10:00', 'Escritório', 'Contrato assinado. Sinal de 30% recebido.'],
       [5, '17:20', 'G', 'Degustação feita, aprovaram o cardápio.']]],
    [null, 'Feira de negócios da Associação Comercial Exemplo — 300 burgers em 2 dias', 21, '10:00', 300, 'anotada', 'e', 'e-mail', 7, 13500,
      'Organização da feira · (00) 3000-6300',
      [[7, '09:00', 'Escritório', 'Pediram proposta com estande e equipe no local.']]],

    /* abertas com data que ja passou: vao para o bloco "Ja passaram" */
    [2, 'Churrasco da Transportadora Exemplo — 50 ' + prato(9), -2, '12:00', 50, 'confirmada', 'g', 'telefone', 10, 2150,
      'RH da Transportadora Exemplo · (00) 3000-7050',
      [[10, '14:00', 'G', 'Combinado: entrega no pátio da empresa.']]],
    [0, 'Palestra na Escola Modelo — 40 ' + prato(0), -5, '18:00', 40, 'em_producao', 'c', 'telefone', 12, 1320,
      'Secretaria da Escola Modelo · (00) 3000-1180', []],

    /* historico recente */
    [1, 'Aniversário infantil — 30 ' + prato(8) + ' e ' + prato(10), -1, '16:00', 30, 'entregue', 'g', 'balcão', 8, 990,
      'Família da aniversariante · (00) 90000-8030',
      [[8, '15:00', 'G', 'Combinado no balcão, retirada às 16h.'], [1, '16:20', 'G', 'Entregue no horário. Cliente elogiou.']]],
    [0, 'Happy hour da Agência Exemplo — 70 burgers variados', -4, '19:00', 70, 'entregue', 'g', 'e-mail', 11, 3150,
      'Atendimento da Agência Exemplo · (00) 3000-9070',
      [[11, '10:40', 'Escritório', 'Orçamento enviado por e-mail.'], [4, '19:45', 'G', 'Entregue. Sobrou batata, ficou de cortesia.']]],
    [2, 'Encontro do Clube de Corrida Exemplo — 40 combos ' + prato(5), -7, '09:00', 40, 'cancelada', null, 'site', 13, 1600,
      'Coordenação do clube · (00) 90000-6040',
      [[9, '10:00', 'Escritório', 'Cliente desmarcou o evento: previsão de chuva forte.']]],
    [0, 'Festa da família da Escola Modelo — 90 burgers', -10, '12:00', 90, 'entregue', 'g', 'telefone', 25, 3870,
      'Secretaria da Escola Modelo · (00) 3000-1180',
      [[10, '13:10', 'G', 'Entregue. Pediram para repetir no fim do ano.']]]
  ];

  function base() {
    return BASE.map(function (x, i) {
      var autorG = resp('g', x[0] == null ? 0 : x[0]) || 'Gerente';
      var obs = (x[11] || []).map(function (o) { return nota(o[0], o[1], o[2] === 'G' ? autorG : o[2], o[3]); }).join(' | ');
      var criado = x[11] && x[11].length ? x[11][0] : [x[8], '10:00'];
      return {
        id: 3001 + i, unidade: loja(x[0]), descricao: x[1],
        data_entrega: x[2] == null ? null : dia(x[2]), hora: x[3] ? x[3] + ':00' : null,
        qtd_itens: x[4], status: x[5], responsavel: resp(x[6], x[0]), origem: x[7],
        criado_em: M.ts(dia(-Math.max(x[8], criado[0])), M.minDe(criado[1])),
        obs: obs, _valor: x[9], _contato: x[10]
      };
    });
  }

  var CHAVE = 'demo_encomendas';
  function ler() {
    try { var o = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (o && o.mud && o.novos) return o; } catch (e) {}
    return { novos: [], mud: {}, seq: 3500 };
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
    if (!r) throw D.erro(404, 'Encomenda não encontrada', 'P0002');
    return r;
  }
  function muda(id, campos, autor, txt) {
    var r = acha(id), m = MEM.mud[r.id] || (MEM.mud[r.id] = {});
    for (var k in campos) m[k] = campos[k];
    if (txt) m.obs = (r.obs ? r.obs + ' | ' : '') + notaAgora(autor, txt);
    grava();
    return { ok: true, id: r.id };
  }
  function limpo(t) { return String(t || '').trim().replace(/\s*\|\s*/g, ' / '); }
  function qtd(v) { v = String(v == null ? '' : v).trim(); return !v ? null : (/^\d+$/.test(v) ? +v : v); }
  function valor(v) { v = String(v == null ? '' : v).trim(); if (!v) return null; var n = Number(v); return isNaN(n) ? null : n; }
  function lojaOk(u) { var n = String(u || '').trim(); return M.lojas.some(function (l) { return l.nome === n; }) ? n : 'A definir'; }
  function data(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null; }
  function hora(v) { return /^\d{2}:\d{2}/.test(String(v || '')) ? String(v).slice(0, 5) + ':00' : null; }
  var NOME_ST = { anotada: 'anotada', confirmada: 'confirmada', em_producao: 'em produção', entregue: 'entregue', cancelada: 'cancelada' };

  /* leitura: contato e valor ficam fora da tabela (saem pelas portas proprias).
     Aplica aqui o or=(data_entrega.gte.X,status.in.(...)) da tela: abertas + as dos ultimos dias. */
  D.tabela('encomenda', function (ctx) {
    var or = (ctx && ctx.params && ctx.params.get('or')) || '';
    var corte = (/data_entrega\.gte\.(\d{4}-\d{2}-\d{2})/.exec(or) || [])[1] || null;
    var sts = (/status\.in\.\(([^)]*)\)/.exec(or) || [])[1];
    sts = sts ? sts.split(',') : null;
    return todos().filter(function (r) {
      if (!corte && !sts) return true;
      return !!(corte && r.data_entrega && r.data_entrega >= corte) || !!(sts && sts.indexOf(r.status) >= 0);
    }).map(function (r) {
      var o = {}; for (var k in r) if (k.charAt(0) !== '_') o[k] = r[k];
      return o;
    });
  });

  D.rpc('dinheiro_consulta', function (b, ctx) {
    if (!ctx.admin || b.p_acao !== 'encomenda') return [];
    return todos().filter(function (r) { return r._valor != null; }).map(function (r) { return { id: r.id, valor: r._valor }; });
  });

  D.rpc('encomenda_acao', function (b, ctx) {
    var a = b.p_acao, d = b.p_dados || {}, eu = quem(ctx);
    switch (a) {
      case 'novo':
        var desc = limpo(d.descricao);
        if (!desc) throw D.erro(400, 'Escreva o que é a encomenda', 'P0001');
        var n = {
          id: ++MEM.seq, unidade: lojaOk(d.unidade), descricao: desc, data_entrega: data(d.data_entrega), hora: hora(d.hora),
          qtd_itens: qtd(d.qtd_itens), status: 'anotada', responsavel: limpo(d.responsavel) || null, origem: 'portal',
          criado_em: M.ts(HOJE, agora().min), obs: limpo(d.obs) ? notaAgora(eu, limpo(d.obs)) : '',
          _valor: ctx.admin ? valor(d.valor) : null, _contato: limpo(d.contato) || null
        };
        MEM.novos.push(n); grava();
        return { ok: true, id: n.id };
      case 'editar':
        var r0 = acha(d.id);
        var c = {
          descricao: limpo(d.descricao) || r0.descricao, unidade: lojaOk(d.unidade), data_entrega: data(d.data_entrega),
          hora: hora(d.hora), qtd_itens: qtd(d.qtd_itens), responsavel: limpo(d.responsavel) || null
        };
        if (limpo(d.contato)) c._contato = limpo(d.contato);
        if (ctx.admin && d.valor !== undefined) c._valor = valor(d.valor);
        return muda(d.id, c, eu, limpo(d.obs));
      case 'situacao':
        if (!NOME_ST[d.status]) throw D.erro(400, 'Situação desconhecida', 'P0001');
        return muda(d.id, { status: d.status }, eu, 'marcou como ' + NOME_ST[d.status]);
      case 'assumir':
        return muda(d.id, { responsavel: eu }, eu, 'assumiu a encomenda');
      case 'anotar':
        if (!limpo(d.texto)) throw D.erro(400, 'Observação vazia', 'P0001');
        return muda(d.id, {}, eu, limpo(d.texto));
      case 'contato':
        return { contato: acha(d.id)._contato || null };
    }
    throw D.erro(400, 'Ação desconhecida: ' + a, 'P0001');
  });
})();
