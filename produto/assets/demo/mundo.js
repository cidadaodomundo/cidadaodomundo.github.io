/* =====================================================================
   O RESTAURANTE DE MENTIRA (modo demonstracao)

   Tudo aqui e inventado: pessoas, motoboys, clientes, enderecos, cardapio,
   pedidos, notas. Nenhum nome, telefone, documento ou endereco real.
   Os numeros sao "sorteados" de forma repetivel: o mesmo dia e a mesma
   loja geram sempre os mesmos pedidos, para as telas baterem entre si.

   Uso nas telas de demonstracao (assets/demo/telas/*.js):
     MUNDO.hoje()                -> '2026-10-26' (dia de hoje, horario de Brasilia)
     MUNDO.dia(-1)               -> ontem
     MUNDO.lojas                 -> [{id,nome,curto,lat,lng,endereco,abre,fecha}]
     MUNDO.equipe                -> funcionarios (ver pessoa())
     MUNDO.motoboys              -> motoboys
     MUNDO.freelas               -> taxas/freelancers
     MUNDO.cardapio              -> itens do cardapio
     MUNDO.pedidos(dia, lojaId)  -> pedidos de delivery do dia (hoje: so ate agora)
     MUNDO.salao(dia, lojaId)    -> resumo do salao/balcao do dia
     MUNDO.batidas(pessoa, dia)  -> batidas de ponto
     MUNDO.rng('semente')        -> sorteador repetivel: r() devolve 0..1
   ===================================================================== */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var C = window.PORTAL_CFG;

  /* ---------------- sorteio repetivel ---------------- */
  function hash(s) {
    s = String(s);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(semente) {
    var a = typeof semente === 'number' ? semente >>> 0 : hash(semente);
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function entre(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function escolhe(r, lista) { return lista[Math.floor(r() * lista.length)]; }
  function pesado(r, pares) { /* [[valor, peso], ...] */
    var tot = 0, i; for (i = 0; i < pares.length; i++) tot += pares[i][1];
    var x = r() * tot;
    for (i = 0; i < pares.length; i++) { x -= pares[i][1]; if (x <= 0) return pares[i][0]; }
    return pares[pares.length - 1][0];
  }
  function normal(r, media, desvio) {
    var u = 1 - r(), v = r();
    return media + desvio * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function arred(v, c) { var f = Math.pow(10, c == null ? 2 : c); return Math.round(v * f) / f; }

  /* ---------------- datas (horario de Brasilia) ---------------- */
  var FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  function partes(d) {
    var o = {};
    FMT.formatToParts(d || new Date()).forEach(function (p) { o[p.type] = p.value; });
    if (o.hour === '24') o.hour = '00';
    return o;
  }
  function hoje() { var p = partes(); return p.year + '-' + p.month + '-' + p.day; }
  function somaDias(iso, n) {
    var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function dia(n) { return somaDias(hoje(), n || 0); }
  function minutosAgora() { var p = partes(); return (+p.hour) * 60 + (+p.minute); }
  function hm(min) { min = Math.max(0, Math.round(min)); var h = Math.floor(min / 60) % 24, m = min % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  /* min pode passar de 1440 (madrugada do dia seguinte) */
  function ts(iso, min) {
    var d = iso, m = Math.round(min);
    while (m >= 1440) { d = somaDias(d, 1); m -= 1440; }
    while (m < 0) { d = somaDias(d, -1); m += 1440; }
    return d + 'T' + hm(m) + ':00-03:00';
  }
  function agoraISO() { var p = partes(); return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + '-03:00'; }
  function br(iso) { iso = String(iso || ''); return iso.slice(8, 10) + '/' + iso.slice(5, 7); }
  function diaSemana(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); } /* 0 = domingo */
  function intervalo(de, ate) { var r = [], d = de; while (d <= ate && r.length < 400) { r.push(d); d = somaDias(d, 1); } return r; }

  /* ---------------- lojas ---------------- */
  var POS = [
    { lat: -23.5505, lng: -46.6333, endereco: 'Rua das Acácias, 120' },
    { lat: -23.5030, lng: -46.6250, endereco: 'Av. das Palmeiras, 845' },
    { lat: -23.6150, lng: -46.6640, endereco: 'Rua do Comércio, 77' },
    { lat: -23.5800, lng: -46.6900, endereco: 'Rua Primavera, 310' }
  ];
  var lojas = (C.lojas || []).map(function (l, i) {
    var p = POS[i % POS.length];
    return { id: l.id, nome: l.nome, curto: l.curto || l.nome.slice(0, 3).toUpperCase(), lat: p.lat, lng: p.lng, endereco: p.endereco, abre: '11:00', fecha: '23:30', peso: [1, 0.7, 0.55, 0.5][i] || 0.5 };
  });
  function loja(x) {
    if (x == null || x === '') return null;
    var s = String(x).toLowerCase();
    for (var i = 0; i < lojas.length; i++) if (lojas[i].id === s || lojas[i].nome.toLowerCase() === s || lojas[i].curto.toLowerCase() === s) return lojas[i];
    return null;
  }

  /* ---------------- gente (toda inventada) ---------------- */
  var NOMES_F = ['Renata', 'Sofia', 'Beatriz', 'Larissa', 'Patrícia', 'Fernanda', 'Gabriela', 'Heloísa', 'Isabela', 'Letícia', 'Mariana', 'Olívia', 'Raquel', 'Simone', 'Tatiana', 'Valéria', 'Vanessa', 'Cecília', 'Débora', 'Elaine', 'Giovana', 'Helena', 'Joana', 'Lívia', 'Melissa', 'Nicole', 'Sabrina', 'Teresa'];
  var NOMES_M = ['Bernardo', 'Caetano', 'Davi', 'Emanuel', 'Gilson', 'Heitor', 'Igor', 'Nicolas', 'Otávio', 'Paulo', 'Renan', 'Samuel', 'Tomás', 'Ulisses', 'Valter', 'William', 'Anderson', 'Breno', 'Cláudio', 'Danilo', 'Everton', 'Gerson', 'Ivan', 'Jefferson', 'Kléber', 'Leonel', 'Mário', 'Nelson', 'Raul', 'Wesley', 'Yuri', 'Adriano', 'Rodrigo', 'Roberto', 'Rogério', 'Silvio', 'Douglas'];
  var SOBRENOMES = ['Almeida', 'Barros', 'Campos', 'Dias', 'Farias', 'Machado', 'Monteiro', 'Moreira', 'Nogueira', 'Pinto', 'Rocha', 'Siqueira', 'Azevedo', 'Brandão', 'Cavalcanti', 'Correia', 'Guimarães', 'Leite', 'Macedo', 'Nascimento', 'Peixoto', 'Quintana', 'Rezende', 'Sampaio', 'Tavares', 'Valente', 'Batista', 'Coelho', 'Fagundes', 'Lacerda', 'Rangel', 'Sales', 'Toledo', 'Vasques', 'Aragão', 'Borba', 'Couto', 'Falcão', 'Galvão', 'Queiroz', 'Rebouças', 'Telles', 'Vidal', 'Amaral'];

  var usados = {};
  function nomeNovo(r, sexo) {
    for (var t = 0; t < 200; t++) {
      var p = escolhe(r, sexo === 'f' ? NOMES_F : NOMES_M), s = escolhe(r, SOBRENOMES), s2 = escolhe(r, SOBRENOMES);
      var n = p + ' ' + (s2 !== s && r() < 0.4 ? s2 + ' ' : '') + s;
      if (!usados[p + '|' + s]) { usados[p + '|' + s] = 1; return { nome: n, primeiro: p }; }
    }
    return { nome: 'Pessoa ' + t, primeiro: 'Pessoa' };
  }

  var SETORES = [
    { setor: 'Cozinha', cargos: ['Cozinheiro(a)', 'Auxiliar de cozinha', 'Chapeiro(a)', 'Líder de cozinha'], peso: 5 },
    { setor: 'Salão', cargos: ['Garçom/Garçonete', 'Cumim', 'Recepcionista'], peso: 3 },
    { setor: 'Caixa', cargos: ['Operador(a) de caixa'], peso: 1 },
    { setor: 'Delivery', cargos: ['Atendente do delivery', 'Expedição'], peso: 2 },
    { setor: 'Bar', cargos: ['Bartender', 'Copeiro(a)'], peso: 1 },
    { setor: 'Limpeza', cargos: ['Auxiliar de limpeza'], peso: 1 }
  ];
  var TURNOS = [
    { turno: 'Dia', entrada: '10:00', saida: '18:20', intervalo: 60 },
    { turno: 'Intermediário', entrada: '14:00', saida: '22:20', intervalo: 60 },
    { turno: 'Noite', entrada: '17:00', saida: '01:20', intervalo: 60 }
  ];
  var SALARIO = { 'Cozinheiro(a)': 2450, 'Auxiliar de cozinha': 1950, 'Chapeiro(a)': 2300, 'Líder de cozinha': 3200, 'Garçom/Garçonete': 1900, 'Cumim': 1750, 'Recepcionista': 1850, 'Operador(a) de caixa': 2000, 'Atendente do delivery': 1900, 'Expedição': 1900, 'Bartender': 2200, 'Copeiro(a)': 1800, 'Auxiliar de limpeza': 1750, 'Gerente da loja': 4800 };

  var equipe = [];
  (function () {
    var r = rng('equipe-v1'), id = 100;
    lojas.forEach(function (l, li) {
      var qtd = Math.max(8, Math.round(16 * l.peso));
      var g = nomeNovo(r, r() < 0.5 ? 'f' : 'm');
      equipe.push(pessoa(++id, g, l, 'Gerência', 'Gerente da loja', TURNOS[0], true, r, li));
      for (var k = 0; k < qtd; k++) {
        var s = pesado(r, SETORES.map(function (x) { return [x, x.peso]; }));
        var t = pesado(r, [[TURNOS[0], 4], [TURNOS[1], 2], [TURNOS[2], 3]]);
        equipe.push(pessoa(++id, nomeNovo(r, r() < 0.5 ? 'f' : 'm'), l, s.setor, escolhe(r, s.cargos), t, false, r, li));
      }
    });
    function pessoa(id, g, l, setor, cargo, t, confianca, r, li) {
      var anos = entre(r, 0, 5), mes = entre(r, 1, 12), d = entre(r, 1, 28);
      var adm = (2026 - anos) + '-' + (mes < 10 ? '0' : '') + mes + '-' + (d < 10 ? '0' : '') + d;
      if (adm > hoje()) adm = somaDias(hoje(), -entre(r, 20, 80));
      return {
        id: id, nome: g.nome, apelido: g.primeiro, loja: l.id, unidade: l.nome, setor: setor, cargo: cargo,
        turno: t.turno, entrada: t.entrada, saida: t.saida, intervalo_min: t.intervalo,
        folga: entre(r, 1, 6), /* 1 = segunda ... 6 = sabado */
        admissao: adm, cartao: 'C' + (1000 + id), matricula: String(id), cargo_confianca: confianca,
        salario: SALARIO[cargo] || 2000, ativo: true, experiencia: adm > somaDias(hoje(), -90)
      };
    }
  })();

  /* tres pessoas em contrato de experiencia, sempre perto de hoje (o aviso de experiencia nunca fica vazio) */
  (function () {
    var cand = equipe.filter(function (p) { return !p.cargo_confianca; });
    [[2, -25], [7, -30], [12, -86]].forEach(function (x) {
      var p = cand[x[0]];
      if (p) { p.admissao = somaDias(hoje(), x[1]); p.experiencia = true; }
    });
  })();

  var MOTOS = ['Honda CG 160', 'Honda Biz 125', 'Yamaha Factor 150', 'Honda Pop 110', 'Yamaha Fazer 250', 'Honda Bros 160'];
  var motoboys = [];
  (function () {
    var r = rng('motoboys-v1'), id = 500;
    lojas.forEach(function (l) {
      var qtd = Math.max(4, Math.round(9 * l.peso));
      for (var k = 0; k < qtd; k++) {
        var g = nomeNovo(r, r() < 0.15 ? 'f' : 'm');
        var letras = 'ABCDEFGHJKLMNPRSTUVWXZ';
        var placa = 'XYZ' + entre(r, 0, 9) + letras[entre(r, 0, letras.length - 1)] + entre(r, 10, 99); /* placa ficticia */
        motoboys.push({
          id: ++id, nome: g.nome, apelido: g.primeiro, loja: l.id, unidade: l.nome,
          moto: escolhe(r, MOTOS), placa: placa,
          mei: r() < 0.75, cnh_ok: r() < 0.85, contrato_ok: r() < 0.7, pix_ok: r() < 0.9,
          fixo: k < Math.ceil(qtd * 0.6), desde: somaDias(hoje(), -entre(r, 15, 900))
        });
      }
    });
  })();

  var freelas = [];
  (function () {
    var r = rng('freelas-v1'), id = 800;
    var func = ['Garçom/Garçonete', 'Auxiliar de cozinha', 'Chapeiro(a)', 'Copeiro(a)', 'Motoboy', 'Bartender'];
    for (var k = 0; k < 14; k++) {
      var g = nomeNovo(r, r() < 0.5 ? 'f' : 'm');
      var l = escolhe(r, lojas);
      freelas.push({ id: ++id, nome: g.nome, apelido: g.primeiro, funcao: escolhe(r, func), loja: r() < 0.3 ? '' : l.id, unidade: l.nome, valor_dia: escolhe(r, [100, 120, 130, 150]), nota: entre(r, 3, 5), ultima_vez: somaDias(hoje(), -entre(r, 1, 60)), telefone: '(00) 90000-' + String(1000 + k * 37).slice(-4) });
    }
  })();

  /* ---------------- cardapio (inventado) ---------------- */
  var cardapio = [
    ['Clássico da Casa', 'Burgers', 32.9], ['Cheddar Bacon', 'Burgers', 38.9], ['Duplo Smash', 'Burgers', 36.9],
    ['Salada Leve', 'Burgers', 31.9], ['Barbecue Defumado', 'Burgers', 39.9], ['Frango Crocante', 'Burgers', 33.9],
    ['Veggie Grão-de-Bico', 'Burgers', 34.9], ['Picanha Premium', 'Burgers', 46.9], ['Mini Burger Kids', 'Burgers', 24.9],
    ['Costela Desfiada', 'Burgers', 42.9],
    ['Batata Rústica', 'Acompanhamentos', 18.9], ['Batata com Cheddar e Bacon', 'Acompanhamentos', 26.9],
    ['Anéis de Cebola', 'Acompanhamentos', 21.9], ['Nuggets (10 un.)', 'Acompanhamentos', 22.9],
    ['Prato do Dia', 'Pratos', 29.9], ['Parmegiana de Frango', 'Pratos', 38.9], ['Salada Caesar', 'Pratos', 29.9],
    ['Refrigerante Lata', 'Bebidas', 7.5], ['Suco Natural 500 ml', 'Bebidas', 11.9], ['Água sem gás', 'Bebidas', 5],
    ['Cerveja Long Neck', 'Bebidas', 12.9], ['Milkshake Chocolate', 'Bebidas', 19.9], ['Milkshake Morango', 'Bebidas', 19.9],
    ['Brownie com Sorvete', 'Sobremesas', 18.9], ['Petit Gâteau', 'Sobremesas', 21.9],
    ['Adicional de Bacon', 'Adicionais', 6], ['Adicional de Cheddar', 'Adicionais', 5], ['Burger extra', 'Adicionais', 12]
  ].map(function (x, i) { return { id: 'P' + (1001 + i), codigo: String(1001 + i), nome: x[0], categoria: x[1], preco: x[2] }; });

  /* ---------------- clientes e enderecos (inventados) ---------------- */
  var RUAS = ['Rua das Acácias', 'Rua dos Ipês', 'Av. das Palmeiras', 'Rua da Harmonia', 'Rua das Hortênsias', 'Rua dos Girassóis', 'Av. Brasil', 'Rua Primavera', 'Rua do Comércio', 'Rua das Laranjeiras', 'Rua Monte Azul', 'Rua da Paz', 'Travessa do Sol', 'Rua Boa Vista', 'Av. Central', 'Rua das Oliveiras'];
  var BAIRROS = ['Jardim das Flores', 'Vila Esperança', 'Parque Central', 'Alto da Colina', 'Vila Nova', 'Bela Vista', 'Santa Luzia', 'Recanto Verde', 'Morada do Sol', 'Vila Real', 'Jardim Europa', 'Parque das Águas'];
  var LETRAS = 'ABCDEFGHIJLMNOPRSTV';
  function iniciais(r) { return LETRAS[entre(r, 0, LETRAS.length - 1)] + '. ' + LETRAS[entre(r, 0, LETRAS.length - 1)] + '.'; }

  var COMENT_BOM = ['Chegou quentinho, muito bom!', 'Melhor burger da região.', 'Entrega rápida, parabéns.', 'Batata crocante, voltarei a pedir.', 'Tudo certo, lanche excelente.', 'Muito saboroso, embalagem caprichada.', 'Carne no ponto certinho.', 'Pão macio e molho da casa ótimo.', 'Chegou antes do previsto, nota 10.', 'Sempre peço e nunca decepciona.', 'Milkshake perfeito.', 'Lanche bem montado, nada caiu.'];
  var COMENT_MEIO = ['Bom, mas demorou um pouco.', 'Lanche bom, batata chegou morna.', 'Faltou o molho extra que pedi.', 'Gostoso, mas veio pouco bacon.', 'O lanche estava bom, a embalagem amassou.', 'Achei um pouco salgado.', 'Bom, mas mais caro que da última vez.'];
  var COMENT_RUIM = ['Demorou mais de uma hora.', 'Veio o lanche errado.', 'Chegou frio.', 'Faltou um item do pedido.', 'O motoboy não achou o endereço.', 'Carne passada do ponto que pedi.', 'Batata murcha e fria.', 'Pedi sem cebola e veio com cebola.', 'Refrigerante não veio.', 'Lanche desmontado dentro da caixa.'];
  var MOTIVOS_CANCEL = ['Cliente desistiu', 'Pedido em duplicidade', 'Item indisponível', 'Endereço fora da área', 'Demora na entrega', 'Problema no pagamento'];

  /* ---------------- pedidos de delivery ---------------- */
  var FATOR_DIA = [1.25, 0.75, 0.7, 0.8, 0.9, 1.15, 1.3]; /* dom..sab */
  var cache = {};
  function pedidos(diaIso, lojaId) {
    diaIso = diaIso || hoje();
    if (!lojaId) {
      var tudo = [];
      lojas.forEach(function (l) { tudo = tudo.concat(pedidos(diaIso, l.id)); });
      return tudo.sort(function (a, b) { return a.min_pedido - b.min_pedido; });
    }
    var L = loja(lojaId); if (!L) return [];
    var k = diaIso + '|' + L.id;
    if (!cache[k]) cache[k] = gerarDia(diaIso, L);
    var lista = cache[k];
    var agora = minutosAgora();
    if (diaIso === hoje()) {
      if (agora < 300) return []; /* madrugada: o dia de hoje ainda nao abriu; o movimento e do dia anterior */
      return lista.filter(function (p) { return p.min_pedido <= agora; }).map(function (p) { return comStatus(p, agora); });
    }
    if (diaIso === somaDias(hoje(), -1) && agora < 300) {
      var ag = agora + 1440; /* madrugada: o dia anterior ainda esta terminando */
      return lista.filter(function (p) { return p.min_pedido <= ag; }).map(function (p) { return comStatus(p, ag); });
    }
    if (diaIso > hoje()) return [];
    return lista.map(function (p) { return comStatus(p, 99999); });
  }

  function gerarDia(diaIso, L) {
    var r = rng('pedidos|' + diaIso + '|' + L.id);
    var n = Math.round(140 * L.peso * FATOR_DIA[diaSemana(diaIso)] * (0.9 + r() * 0.2));
    var mbs = motoboys.filter(function (m) { return m.loja === L.id; });
    var lista = [];
    for (var i = 0; i < n; i++) {
      var faixa = pesado(r, [['almoco', 30], ['tarde', 7], ['jantar', 63]]);
      var min;
      if (faixa === 'almoco') min = Math.max(11 * 60, Math.min(15 * 60, normal(r, 12.6 * 60, 50)));
      else if (faixa === 'tarde') min = 15 * 60 + r() * 150;
      else min = Math.max(17.5 * 60, Math.min(23.4 * 60, normal(r, 20.4 * 60, 70)));
      var canal = pesado(r, [['ifood', 76], ['proprio', 16], ['retirada', 8]]);
      var nItens = pesado(r, [[1, 30], [2, 40], [3, 20], [4, 10]]);
      var itens = [], total = 0;
      for (var j = 0; j < nItens; j++) {
        var it = j === 0 ? escolhe(r, cardapio.slice(0, 14)) : escolhe(r, cardapio);
        var q = r() < 0.15 ? 2 : 1;
        itens.push({ codigo: it.codigo, nome: it.nome, categoria: it.categoria, qtd: q, preco: it.preco });
        total += it.preco * q;
      }
      var taxa = canal === 'retirada' ? 0 : escolhe(r, [0, 4.99, 6.99, 8.99]);
      var prazo = canal === 'retirada' ? 25 : entre(r, 40, 60);
      var preparo = Math.max(8, normal(r, 17, 5));
      var esperaMoto = canal === 'retirada' ? 0 : Math.max(1, normal(r, 7, 5));
      var rota = canal === 'retirada' ? 0 : Math.max(5, normal(r, 16, 7));
      var pagto = canal === 'ifood' ? pesado(r, [['online', 86], ['cartao_na_entrega', 10], ['pix', 2], ['dinheiro', 2]])
                                    : pesado(r, [['cartao_na_entrega', 45], ['pix', 35], ['dinheiro', 20]]);
      var dist = canal === 'retirada' ? 0 : arred(Math.max(0.6, normal(r, 3.2, 1.6)), 1);
      var ang = r() * Math.PI * 2;
      var cancel = r() < 0.025;
      var nota = null, comentario = '';
      if (!cancel && canal === 'ifood' && r() < 0.28) {
        var atrasou = preparo + esperaMoto + rota > prazo + 5;
        nota = atrasou ? pesado(r, [[5, 30], [4, 20], [3, 20], [2, 12], [1, 18]]) : pesado(r, [[5, 72], [4, 15], [3, 6], [2, 3], [1, 4]]);
        var c = r();
        comentario = c < 0.45 ? '' : nota >= 4 ? escolhe(r, COMENT_BOM) : nota === 3 ? escolhe(r, COMENT_MEIO) : escolhe(r, COMENT_RUIM);
      }
      var mb = canal === 'retirada' || !mbs.length ? null : escolhe(r, mbs);
      var num = 1000 + i + 1;
      lista.push({
        id: L.id + '-' + diaIso.replace(/-/g, '') + '-' + num,
        loja: L.id, unidade: L.nome, dia: diaIso,
        numero: num, numero_ifood: canal === 'ifood' ? String(entre(r, 1000, 9999)) : null,
        canal: canal, min_pedido: Math.round(min),
        hora_pedido: hm(min), prazo_min: prazo, hora_prometida: hm(min + prazo),
        min_pronto: Math.round(min + preparo), min_saida: Math.round(min + preparo + esperaMoto), min_entrega: Math.round(min + preparo + esperaMoto + rota),
        itens: itens, subtotal: arred(total), taxa_entrega: taxa, total: arred(total + taxa),
        pagamento: pagto, cliente: iniciais(r), bairro: escolhe(r, BAIRROS),
        endereco: escolhe(r, RUAS) + ', ' + entre(r, 10, 2400),
        lat: arred(L.lat + Math.sin(ang) * dist / 111, 5), lng: arred(L.lng + Math.cos(ang) * dist / 102, 5), distancia_km: dist,
        motoboy: mb ? mb.apelido : null, motoboy_id: mb ? mb.id : null, motoboy_nome: mb ? mb.nome : null,
        cancelado: cancel, motivo_cancelamento: cancel ? escolhe(r, MOTIVOS_CANCEL) : null,
        nota: nota, comentario: comentario
      });
    }
    lista.sort(function (a, b) { return a.min_pedido - b.min_pedido; });
    return lista;
  }

  function comStatus(p, agora) {
    var o = {}; for (var k in p) o[k] = p[k];
    var st;
    if (p.cancelado) st = 'cancelado';
    else if (agora < p.min_pronto) st = 'preparando';
    else if (agora < p.min_saida) st = p.canal === 'retirada' ? 'pronto' : 'aguardando_motoboy';
    else if (agora < p.min_entrega) st = 'em_rota';
    else st = 'entregue';
    o.status = st;
    o.hora_pronto = agora >= p.min_pronto ? hm(p.min_pronto) : null;
    o.hora_saida = agora >= p.min_saida && p.canal !== 'retirada' ? hm(p.min_saida) : null;
    o.hora_entrega = agora >= p.min_entrega && !p.cancelado ? hm(p.min_entrega) : null;
    o.minutos_total = st === 'entregue' ? p.min_entrega - p.min_pedido : null;
    o.no_prazo = st === 'entregue' ? (p.min_entrega - p.min_pedido) <= p.prazo_min : null;
    o.atraso_min = st === 'entregue' ? Math.max(0, p.min_entrega - p.min_pedido - p.prazo_min) : Math.max(0, agora - p.min_pedido - p.prazo_min);
    o.ts_pedido = ts(p.dia, p.min_pedido);
    o.ts_entrega = o.hora_entrega ? ts(p.dia, p.min_entrega) : null;
    return o;
  }

  /* ---------------- salao / balcao ---------------- */
  function salao(diaIso, lojaId) {
    var L = loja(lojaId) || lojas[0];
    var r = rng('salao|' + diaIso + '|' + L.id);
    var mesas = Math.round(55 * L.peso * FATOR_DIA[diaSemana(diaIso)] * (0.85 + r() * 0.3));
    var pessoas = Math.round(mesas * (2.1 + r() * 0.8));
    var ticket = arred(68 + r() * 22);
    var corte = diaIso === hoje() ? Math.max(0, Math.min(1, (minutosAgora() - 660) / 720)) : 1;
    return { dia: diaIso, loja: L.id, unidade: L.nome, mesas: Math.round(mesas * corte), pessoas: Math.round(pessoas * corte), ticket_medio: ticket, faturamento: arred(mesas * corte * ticket * 2.2), cancelamentos_caixa: Math.round(entre(r, 0, 4) * corte) };
  }

  /* ---------------- ponto ---------------- */
  function minDe(hhmm) { var t = String(hhmm).split(':'); return (+t[0]) * 60 + (+t[1]); }
  function batidas(p, diaIso) {
    var r = rng('ponto|' + p.id + '|' + diaIso);
    var dow = diaSemana(diaIso);
    if (dow === p.folga) return { dia: diaIso, situacao: 'FOLGA', batidas: [] };
    var x = r();
    if (x < 0.025) return { dia: diaIso, situacao: 'FALTA', batidas: [] };
    if (x < 0.04) return { dia: diaIso, situacao: 'ATESTADO', batidas: [] };
    var e = minDe(p.entrada), s = minDe(p.saida); if (s < e) s += 1440;
    var atraso = r() < 0.12 ? entre(r, 6, 35) : entre(r, -12, 4);
    var ent = e + atraso;
    var sai = s + (r() < 0.15 ? entre(r, 12, 50) : entre(r, -8, 9));
    var ini = ent + Math.round((sai - ent) / 2) - 30 + entre(r, -40, 40);
    var dur = p.intervalo_min + (r() < 0.1 ? -entre(r, 10, 25) : entre(r, -4, 8));
    var b = [hm(ent), hm(ini), hm(ini + dur), hm(sai)];
    if (r() < 0.04) b = b.slice(0, 3);
    if (diaIso === hoje()) { var ag = minutosAgora(); b = b.filter(function (h, i) { return [ent, ini, ini + dur, sai][i] <= ag; }); }
    return { dia: diaIso, situacao: b.length === 4 ? 'OK' : (b.length ? 'INCOMPLETO' : 'SEM_BATIDA'), batidas: b, atraso_min: Math.max(0, atraso), intervalo_min: dur, trabalhado_min: b.length === 4 ? (sai - ent - dur) : null, extra_min: b.length === 4 ? (sai - ent - dur) - (s - e - p.intervalo_min) : null };
  }

  window.MUNDO = {
    hash: hash, rng: rng, entre: entre, escolhe: escolhe, pesado: pesado, normal: normal, arred: arred,
    hoje: hoje, dia: dia, somaDias: somaDias, intervalo: intervalo, minutosAgora: minutosAgora, hm: hm, ts: ts, agoraISO: agoraISO, br: br, diaSemana: diaSemana, minDe: minDe,
    lojas: lojas, loja: loja, equipe: equipe, motoboys: motoboys, freelas: freelas, cardapio: cardapio,
    ruas: RUAS, bairros: BAIRROS, iniciais: iniciais, motivosCancelamento: MOTIVOS_CANCEL,
    pedidos: pedidos, salao: salao, batidas: batidas,
    pessoa: function (id) { for (var i = 0; i < equipe.length; i++) if (equipe[i].id === +id) return equipe[i]; return null; }
  };
})();
