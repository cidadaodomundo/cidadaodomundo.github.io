/* Central Salão (demonstração).
   A tela mostra a equipe do salão por turno, o cardápio fora do ar no tablet da mesa, as reservas,
   a nota e os comentários do Google e os próximos eventos da cidade.
   Simula as tabelas google_fato_avaliacao, fato_escala_posicao, fato_espelho_dia, dim_funcionario,
   escala_cobertura_min, cardapio_pausado (canal Goomer), saipos_venda_status (vendas do balcão),
   salao_reserva e evento_cidade. As portas pausados_consulta / pausados_marcar vêm de telas/pausados.js
   (carregado antes, para o tablet bater com a tela Produtos pausados); aqui fica só uma reserva para o caso
   de aquele arquivo faltar. Também deixa em window.DEMO_SALAO o exemplo de notas em outros sites (foto manual).
   Pessoas, batidas e movimento vêm do MUNDO (mesma escala da Central do RH e mesmas leituras do Google da TV). */
(function () {
  'use strict';
  if (!window.DEMO || !window.MUNDO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG || {};
  var MARCA = C.marca || 'Restaurante';

  /* ---------------- utilidades ---------------- */
  function ler(k, padrao) { try { var v = localStorage.getItem('demo_salao_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravar(k, v) { try { localStorage.setItem('demo_salao_' + k, JSON.stringify(v)); } catch (e) {} }
  function lerRH(k, padrao) { try { var v = localStorage.getItem('demo_rh_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function ddmm(iso) { return String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7); }
  function ddmmaaaa(iso) { return ddmm(iso) + '/' + String(iso).slice(0, 4); }
  function difDias(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
  function idx(L) { return M.lojas.indexOf(L); }
  function agoraTxt() { var a = M.agoraISO(); return ddmm(a) + ' ' + a.slice(11, 16); }
  function porNome(nome) { for (var i = 0; i < M.equipe.length; i++) if (M.equipe[i].nome === nome) return M.equipe[i]; return null; }
  function nomes(cat) { return M.cardapio.filter(function (c) { return c.categoria === cat; }).map(function (c) { return c.nome; }); }

  /* ---------------- equipe (mesmos afastamentos de exemplo da Central do RH) ---------------- */
  var EQUIPE = M.equipe;
  var COMUNS = EQUIPE.filter(function (p) { return !p.cargo_confianca && !p.experiencia; });
  function comumDaLoja(lojaId, n) { var l = COMUNS.filter(function (p) { return p.loja === lojaId; }); return l.length ? l[n % l.length] : null; }
  var AFAST = {};
  (function () {
    var a = comumDaLoja(M.lojas[0] && M.lojas[0].id, 2), b = comumDaLoja(M.lojas[1] && M.lojas[1].id, 1);
    if (a) AFAST[a.id] = { desde: M.dia(-9), ate: M.dia(11), motivo: 'Férias' };
    if (b) AFAST[b.id] = { desde: M.dia(-1), ate: M.dia(2), motivo: 'Atestado' };
  })();
  function afastado(p, dia) { var a = AFAST[p.id]; return a && a.desde <= dia && a.ate >= dia ? a : null; }

  /* ---------------- escala (fato_escala_posicao) ---------------- */
  /* mesma regra de posição da Central do RH (quem está afastado não entra na escala do dia).
     Quem é do Delivery ou do Bar e foi lançado no Atendimento/Caixa aparece com o aviso do setor do cadastro. */
  function posicao(p, dia) {
    var b = M.batidas(p, dia);
    if (b.situacao === 'FOLGA') return 'FOLGA';
    if (b.situacao === 'FALTA' || b.situacao === 'ATESTADO') return 'Falta/Ausente';
    var c = p.cargo || '';
    if (p.setor === 'Gerência') return 'Gerência';
    if (p.setor === 'Cozinha') {
      if (/Chapeiro/.test(c)) return 'Chapa';
      if (/Líder/.test(c)) return 'Chapa, Montagem de burgers';
      if (/Auxiliar/.test(c)) return 'Produção/Cozinha (apoio), Fritadeira';
      return 'Montagem de burgers, Montagem de marmitas/pratos';
    }
    if (p.setor === 'Delivery') return /Expedi/.test(c) ? 'Separação de pacotes/expedição' : 'Separação de pacotes/expedição, Atendimento/Caixa';
    if (p.setor === 'Limpeza') return 'Limpeza';
    return 'Atendimento/Caixa';
  }
  function turnoEscala(p) {
    if (!p) return 'Dia';
    if (p.cargo_confianca) return 'Integral';
    if (p.turno === 'Noite') return idx(M.loja(p.loja)) % 2 ? 'Noite/Madrugada' : 'Noite';
    if (p.turno === 'Intermediário') return p.setor === 'Salão' || p.setor === 'Caixa' ? 'Integral' : 'Noite';
    return 'Dia';
  }
  /* como na Central do RH: só a primeira loja já lançou a escala de hoje (as outras mostram o aviso "falta lançar") */
  function lancouHoje(L) { return idx(L) === 0; }
  function escala() {
    var salvo = lerRH('escala', {}), hoje = M.hoje(), out = [];
    M.intervalo(M.dia(-7), hoje).forEach(function (dia) {
      M.lojas.forEach(function (L) {
        var k = dia + '|' + L.nome;
        if (salvo[k]) {   /* o que a Central do RH gravou nesta demonstração */
          Object.keys(salvo[k]).forEach(function (n) {
            out.push({ data: dia, nome: n, turno: turnoEscala(porNome(n)), posicao: salvo[k][n], unidade: L.nome });
          });
          return;
        }
        if (dia === hoje && !lancouHoje(L)) return;
        EQUIPE.forEach(function (p) {
          if (p.loja !== L.id || dia < p.admissao || afastado(p, dia)) return;
          out.push({ data: dia, nome: p.nome, turno: turnoEscala(p), posicao: posicao(p, dia), unidade: L.nome });
        });
      });
    });
    return out;
  }
  D.tabela('fato_escala_posicao', escala);

  /* mínimo de gente no salão por loja, dia da semana e turno (regra de exemplo, configurável) */
  D.tabela('escala_cobertura_min', function () {
    var out = [];
    M.lojas.forEach(function (L) {
      var base = idx(L) === 0 ? 3 : 2;
      for (var dw = 0; dw < 7; dw++) {
        out.push({ unidade: L.nome, setor: 'Salão', turno: 'Dia', dia_semana: dw, funcao: 'Atendimento', minimo: base + (dw === 0 ? 1 : 0) });
        out.push({ unidade: L.nome, setor: 'Salão', turno: 'Noite', dia_semana: dw, funcao: 'Atendimento', minimo: base + (dw === 5 || dw === 6 ? 1 : 0) });
      }
    });
    return out;
  });

  /* ---------------- cadastro (dim_funcionario) ---------------- */
  D.tabela('dim_funcionario', function () {
    return EQUIPE.map(function (p) {
      return { id: p.id, nome: p.nome, unidade: p.unidade, setor: p.setor, cargo: p.cargo,
        entrada: p.cargo_confianca ? null : p.entrada + ':00',   /* gerência não bate ponto */
        saida: p.cargo_confianca ? null : p.saida + ':00', ativo: true };
    });
  });

  /* ---------------- ponto (fato_espelho_dia): chega com um dia de atraso ---------------- */
  function linhaPonto(p, dia) {
    var o = { nome: p.nome, unidade: p.unidade, data: dia, entrada: null, saida: null, categoria: 'OK' };
    var af = afastado(p, dia);
    if (af) { o.categoria = af.motivo === 'Férias' ? 'FERIAS' : 'AFASTADO'; return o; }
    var b = M.batidas(p, dia);
    if (b.situacao === 'FOLGA') { o.categoria = 'FOLGA'; return o; }
    if (b.situacao === 'ATESTADO') { o.categoria = 'AFASTADO'; return o; }
    if (!b.batidas.length) { o.categoria = 'FALTA_A_CONFIRMAR'; return o; }
    o.entrada = b.batidas[0] + ':00';
    o.saida = b.batidas.length === 4 ? b.batidas[3] + ':00' : null;
    if (b.batidas.length < 4) o.categoria = 'BATIDAS_INCOMPLETAS';
    else if (b.intervalo_min < 50) o.categoria = 'INTERVALO_ABAIXO_LEGAL';
    else if (b.extra_min > 30) o.categoria = 'HORA_EXTRA';
    else if (b.intervalo_min < 57) o.categoria = 'INTERVALO_ABAIXO_PADRAO';
    else if (b.atraso_min > 10) o.categoria = 'ATRASO';
    return o;
  }
  D.tabela('fato_espelho_dia', function () {
    var out = [];
    M.intervalo(M.dia(-6), M.dia(-1)).forEach(function (dia) {
      EQUIPE.forEach(function (p) {
        if (p.cargo_confianca || dia < p.admissao) return;
        out.push(linhaPonto(p, dia));
      });
    });
    return out;
  });

  /* ---------------- balcão (saipos_venda_status, canal vazio = venda do salão) ---------------- */
  /* cada loja tem o seu último dia reportado; a última loja está com um dia de atraso */
  function ultimoDiaBalcao(L) { return M.lojas.length > 2 && idx(L) === M.lojas.length - 1 ? M.dia(-2) : M.dia(-1); }
  D.tabela('saipos_venda_status', function () {
    var out = [];
    M.lojas.forEach(function (L) {
      var dia = ultimoDiaBalcao(L), s = M.salao(dia, L.id), r = M.rng('salao-balcao|' + L.id + '|' + dia);
      var n = Math.max(1, s.mesas), canc = Math.min(n, s.cancelamentos_caixa), num = 2000 + M.entre(r, 100, 800);
      for (var i = 0; i < n; i++) {
        var temNumero = r() < 0.62;
        out.push({ unidade: L.nome, dia_operacional: dia, n_pedido: temNumero ? String(++num) : null, cancelado: i < canc, canal: null });
      }
    });
    return out;
  });

  /* ---------------- Google (mesmas leituras da TV da Cozinha) ---------------- */
  var GOO_BASE = [1480, 960, 720, 640];
  function notaGoogle(i) { return i === 0 ? 4.6 : i === 1 ? 4.5 : 4.7; }
  /* a tela Avaliações do dia (telas/avaliacoes.js) sorteia os mesmos comentários com a mesma semente: mexer junto */
  var BURGERS = nomes('Burgers'), SOBREM = nomes('Sobremesas');
  var ACOMP = nomes('Acompanhamentos').filter(function (n) { return /^Batata/i.test(n); });
  if (!ACOMP.length) ACOMP = ['Batata frita'];
  var ELOGIOS = [
    'O lanche {b} chegou no ponto certinho e a {a} estava crocante. Atendimento do salão muito simpático.',
    'Ambiente agradável e mesa rápida mesmo no sábado à noite. O lanche {b} vale cada centavo.',
    'Garçom atencioso, indicou o lanche {b} e acertou em cheio. Voltaremos com certeza!',
    'Lugar limpo, música boa e a sobremesa ({s}) é imperdível.',
    'Fomos em família e fomos muito bem recebidos. Porções generosas e preço justo.',
    'Melhor hambúrguer da região. O lanche {b} é enorme e muito saboroso.'
  ];
  var QUEIXAS = [
    'Esperamos uns 40 minutos pelo lanche numa noite de movimento. Comida boa, mas a demora pesou.',
    'O lanche {b} veio frio na mesa. Avisamos e trocaram, mas demorou bastante.',
    'Fila grande no caixa para pagar no horário de pico; poderia ter mais gente atendendo.',
    'Ficamos um bom tempo sem atendimento e precisamos chamar o garçom duas vezes.'
  ];
  var RESUMOS = [
    'Os clientes elogiam o lanche {b}, a {a} e o atendimento do salão. A reclamação que mais aparece é a espera nas noites de fim de semana.',
    'Elogios frequentes ao ambiente e ao lanche {b}. Algumas queixas sobre a fila do caixa no horário de pico.',
    'Avaliações muito positivas sobre o sabor do lanche {b} e a simpatia da equipe. Poucas queixas, quase todas sobre demora para fazer o pedido.'
  ];
  var QUANDO = ['há 1 dia', 'há 3 dias', 'há 5 dias', 'há 1 semana', 'há 2 semanas'];
  var ORDEM_TIPO = [['positivo', 'negativo', 'positivo', 'positivo'], ['positivo', 'positivo', 'negativo', 'positivo'], ['positivo', 'positivo', 'positivo', 'negativo']];
  function preenche(t, r) {
    return t.replace('{b}', M.escolhe(r, BURGERS)).replace('{a}', M.escolhe(r, ACOMP).toLowerCase()).replace('{s}', M.escolhe(r, SOBREM).toLowerCase());
  }
  function comentarios(L, dia) {
    var i = idx(L), semana = M.somaDias(dia, -M.diaSemana(dia));
    var r = M.rng('salao-goo|' + L.id + '|' + semana);
    var ordem = ORDEM_TIPO[i % ORDEM_TIPO.length], usadosE = {}, usadosQ = {};
    var destaques = ordem.map(function (tipo, k) {
      var lista = tipo === 'positivo' ? ELOGIOS : QUEIXAS, usados = tipo === 'positivo' ? usadosE : usadosQ, j;
      do { j = Math.floor(r() * lista.length); } while (usados[j] && Object.keys(usados).length < lista.length);
      usados[j] = 1;
      return { tipo: tipo, texto: preenche(lista[j], r), autor: M.iniciais(r), quando: QUANDO[Math.min(QUANDO.length - 1, k + (r() < 0.5 ? 0 : 1))] };
    });
    return { resumo: preenche(RESUMOS[i % RESUMOS.length], r), destaques: destaques };
  }
  var GOO = {};
  function leiturasGoogle(L) {
    var hoje = M.hoje(), k = L.id + '|' + hoje + '|' + (M.minutosAgora() >= 12 * 60 + 35 ? 1 : 0);
    if (GOO[k]) return GOO[k];
    var i = idx(L), tot = GOO_BASE[i] || 600, lista = [];
    M.intervalo(M.somaDias(hoje, -150), hoje).forEach(function (d) {
      var r = M.rng('tv-goo|' + L.id + '|' + d), dow = M.diaSemana(d);
      var fds = dow === 0 || dow === 6 || dow === 5;
      var novas = i === 0 ? M.entre(r, 1, fds ? 9 : 6) : M.entre(r, 0, fds ? 5 : 3);
      var minuto = 12 * 60 + 18 + M.entre(r, 0, 14);
      tot += novas;
      if (d === hoje && M.minutosAgora() < minuto) return;
      if (d < M.somaDias(hoje, -60)) return;
      var c = comentarios(L, d);
      lista.push({ unidade: L.nome, id_loja: L.id, data_coleta: d, num_avaliacoes: tot, nota: notaGoogle(i),
        resumo: c.resumo, destaques: c.destaques, created_at: M.ts(d, minuto) });
    });
    GOO[k] = lista;
    return lista;
  }
  D.tabela('google_fato_avaliacao', function () {
    var r = [];
    M.lojas.forEach(function (L) { r = r.concat(leiturasGoogle(L)); });
    return r;
  });

  /* notas em outros sites: foto manual de exemplo (a tela lê window.DEMO_SALAO) */
  var WEB_EX = [
    [{ fonte: 'TripAdvisor', nota: 4.4, qtd: '#87 de 2.140 restaurantes da cidade', url: '' },
     { fonte: 'Restaurant Guru', nota: 4.5, qtd: '1.284 avaliações · 96 fotos', url: '' },
     { fonte: 'Guia gastronômico local', nota: null, qtd: 'resenha editorial', url: '' }],
    [{ fonte: 'Restaurant Guru', nota: 4.3, qtd: '412 avaliações · 38 fotos', url: '' },
     { fonte: 'TripAdvisor', nota: 4.2, qtd: '#214 de 2.140 restaurantes da cidade', url: '' }],
    [{ fonte: 'Restaurant Guru', nota: 3.9, qtd: '88 avaliações', url: '' }]
  ];
  var web = {};
  M.lojas.forEach(function (L, i) { web[L.nome] = WEB_EX[i % WEB_EX.length]; });
  window.DEMO_SALAO = {
    coleta: ddmmaaaa(M.dia(-40)),
    web: web,
    marca: [
      { fonte: 'Instagram da marca', nota: null, qtd: '≈12 mil seguidores', url: '' },
      { fonte: 'Facebook da marca', nota: null, qtd: '≈8.300 curtidas', url: '' },
      { fonte: 'TikTok', nota: null, qtd: 'vídeos de clientes mencionando a marca', url: '' },
      { fonte: 'Site oficial', nota: null, qtd: 'cardápio e endereço das lojas', url: '' },
      { fonte: 'Portal de notícias local', nota: null, qtd: 'citada entre as melhores hamburguerias da cidade', url: '' }
    ]
  };

  /* ---------------- cardápio fora do ar no tablet da mesa ---------------- */
  /* situação de exemplo de cada item, por loja: SEM = ninguém respondeu; VENCIDA = disseram que voltava e
     continua fora; CONTRA = disseram que despausou e continua fora; RESP = respondido */
  var PADRAO = [['SEM', 'VENCIDA', 'CONTRA', 'RESP', 'SEM'], ['SEM', 'RESP', 'SEM', 'VENCIDA'], ['SEM', 'CONTRA', 'RESP']];
  var DIAS_FORA = { SEM: [[0, 40], [1, 35], [2, 25]], VENCIDA: [[5, 40], [7, 35], [9, 25]], CONTRA: [[2, 50], [3, 30], [4, 20]], RESP: [[6, 40], [10, 35], [15, 25]] };
  var RESP_TXT = ['Pausado de proposito — fornecedor sem estoque esta semana', 'Item nao existe mais (pode excluir)'];
  /* a leitura do tablet roda uma vez por dia; na última loja ela está atrasada (aviso de "leitura velha") */
  function lidoDe(L) { return M.lojas.length > 2 && idx(L) === M.lojas.length - 1 ? M.dia(-2) : M.hoje(); }
  function gerenteDe(L) { var g = EQUIPE.filter(function (p) { return p.loja === L.id && p.cargo_confianca; })[0]; return g ? g.apelido : 'Gerente da loja'; }
  var TAB = {};
  function itensTablet(L) {
    var lido = lidoDe(L), k = L.id + '|' + lido;
    if (TAB[k]) return TAB[k];
    var i = idx(L), pad = PADRAO[i % PADRAO.length], r = M.rng('salao-tablet|' + k), hoje = M.hoje();
    var pool = M.cardapio.slice(), out = [], quem = gerenteDe(L), nResp = 0;
    pad.forEach(function (sit, n) {
      var it = pool.splice(Math.floor(r() * pool.length), 1)[0];
      var dias = n === 0 ? 0 : M.pesado(r, DIAS_FORA[sit]);
      var primeiro = M.somaDias(lido, -dias);
      var g = { unidade: L.nome, marca: MARCA, item: it.nome, tipo: it.categoria === 'Adicionais' ? 'Complemento' : 'Produto',
        estados: n === 1 && i === 0 ? ['pausado', 'escondido'] : [r() < 0.7 ? 'pausado' : 'escondido'],
        primeiro: primeiro, dias: difDias(primeiro, hoje), chave: 'pausado:' + L.nome + '|Tablet|' + it.nome,
        resolvido: false, contradito: false, quem: null, o_que: null, em: null };
      if (sit === 'VENCIDA') { g.quem = quem; g.o_que = 'Acabou, vai voltar a vender'; g.em = ddmm(M.somaDias(hoje, -Math.min(4, g.dias))) + ' 19:40'; }
      if (sit === 'CONTRA') { g.quem = quem; g.o_que = 'Despausei'; g.contradito = true; g.em = ddmm(M.somaDias(hoje, -1)) + ' 21:05'; }
      if (sit === 'RESP') { g.quem = quem; g.o_que = RESP_TXT[(i + nResp++) % RESP_TXT.length]; g.resolvido = true; g.em = ddmm(M.somaDias(primeiro, 1)) + ' 15:20'; }
      out.push(g);
    });
    TAB[k] = out;
    return out;
  }
  /* aplica o que a tela gravou nesta demonstração */
  function comRespostas(g) {
    var o = {}, x;
    for (x in g) o[x] = g[x];
    var mudou = ler('tablet', {})[g.chave];
    if (mudou && mudou.desfeito) { o.resolvido = false; o.contradito = false; o.quem = null; o.o_que = null; o.em = null; }
    else if (mudou) { o.resolvido = true; o.contradito = false; o.quem = mudou.quem; o.o_que = mudou.o_que; o.em = mudou.em; }
    return o;
  }
  /* A página carrega antes telas/pausados.js (tela Produtos pausados): quando ele está presente, as portas
     pausados_consulta / pausados_marcar são as dele, e o tablet mostra os mesmos itens e as mesmas respostas
     nas duas telas. As versões abaixo só entram se aquele arquivo não estiver na página. */
  if (!D.tem('rpc', 'pausados_consulta')) D.rpc('pausados_consulta', function () {
    var tablet = [], lidos = [], hoje = M.hoje();
    M.lojas.forEach(function (L) {
      itensTablet(L).map(comRespostas).forEach(function (g) {
        g.estados.forEach(function (est) {
          tablet.push({ unidade: g.unidade, marca: g.marca, item: g.item, tipo: g.tipo, estado: est, dias: g.dias, desde: ddmm(g.primeiro),
            chave: g.chave, resolvido: g.resolvido, contradito: g.contradito, quem: g.quem, o_que: g.o_que, em: g.em });
        });
      });
      var lido = lidoDe(L);
      lidos.push({ unidade: L.nome, lido: ddmm(lido), dias: difDias(lido, hoje), aprox: false });
    });
    return { linhas: [], tablet: tablet, tablet_lido: lidos, accon: [], accon_lido: null };
  });
  if (!D.tem('rpc', 'pausados_marcar')) D.rpc('pausados_marcar', function (b, ctx) {
    var d = (b && b.p_dados) || {};
    if (!d.chave) throw D.erro(400, 'Falta a chave do item.', 'P0001');
    var g = ler('tablet', {});
    if (d.desfazer) g[d.chave] = { desfeito: true };
    else g[d.chave] = { o_que: String(d.o_que_foi_feito || ''), quem: ctx.nome, em: agoraTxt() };
    gravar('tablet', g);
    return { ok: true };
  });
  /* leitura crua do tablet (a tela usa quando a porta não responde, e na capa antes da porta chegar):
     sai da mesma porta pausados_consulta, para os números baterem */
  D.tabela('cardapio_pausado', function () {
    return fetch(C.rest + 'rpc/pausados_consulta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_dados: {} }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        var out = [], hoje = M.hoje(), lido = {};
        if (!j || !Array.isArray(j.tablet)) return out;
        (j.tablet_lido || []).forEach(function (l) { lido[l.unidade] = M.somaDias(hoje, -(+l.dias || 0)); });
        j.tablet.forEach(function (x) {
          out.push({ canal: 'Goomer', unidade: x.unidade, marca: x.marca || MARCA, item: x.item, tipo: x.tipo, estado: x.estado,
            primeiro_visto: M.ts(M.somaDias(hoje, -(+x.dias || 0)), 6 * 60 + 10), visto_em: M.ts(lido[x.unidade] || hoje, 6 * 60 + 10) });
        });
        return out;
      });
  });

  /* ---------------- reservas (salao_reserva) ---------------- */
  var AREAS = ['Salão principal', 'Varanda', 'Mezanino', 'Área externa'];
  var OBS = ['Aniversário — vão trazer bolo', 'Pediram mesa longe da porta', 'Precisa de 2 cadeirinhas de bebê',
    'Confraternização da empresa — querem conta única', 'Uma pessoa com restrição a glúten', 'Chegam em dois horários', '', ''];
  var ORIGENS = ['telefone', 'balcão', 'site', 'Instagram'];
  var DIAS_RES = [[0, 3, 5, 11], [1, 5, 9], [4, 12]];
  D.tabela('salao_reserva', function () {
    var out = [];
    M.lojas.forEach(function (L) {
      var i = idx(L);
      DIAS_RES[i % DIAS_RES.length].forEach(function (off, n) {
        var dia = M.dia(off), r = M.rng('salao-reserva|' + L.id + '|' + dia);
        var almoco = r() < 0.25;
        var sinal = M.pesado(r, [[true, 55], [false, 30], [null, 15]]);
        var status = sinal === true ? 'confirmada' : sinal === false ? (r() < 0.5 ? 'aguardando sinal' : 'a confirmar') : 'confirmada (sem sinal)';
        if (i === 0 && n === 1) { sinal = false; status = 'aguardando sinal'; }
        var faixa = M.pesado(r, [[[4, 8], 45], [[9, 15], 35], [[16, 26], 20]]);
        out.push({ unidade: L.nome, data: dia, hora: (almoco ? M.escolhe(r, ['12:00', '12:30', '13:00']) : M.escolhe(r, ['19:00', '19:30', '20:00', '20:30'])) + ':00',
          pessoas: M.entre(r, faixa[0], faixa[1]), area: M.escolhe(r, AREAS), sinal_pago: sinal, status: status,
          observacao: M.escolhe(r, OBS) || null, origem: M.escolhe(r, ORIGENS) });
      });
    });
    return out;
  });

  /* ---------------- eventos da cidade (evento_cidade) ---------------- */
  var FERIADOS = [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'],
    ['09-07', 'Independência do Brasil'], ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'],
    ['11-15', 'Proclamação da República'], ['11-20', 'Dia da Consciência Negra'], ['12-25', 'Natal']];
  /* [dias a partir de hoje, tipo, hora, título, local, índice da loja perto (ou -1), a confirmar] */
  var AGENDA = [
    [1, 'outro', '10:00', 'Feira gastronômica de rua', 'Praça Central', 0, false],
    [3, 'jogo_casa', '21:30', 'Estadual: Municipal FC x União do Vale', 'Estádio Municipal', 0, false],
    [5, 'show', '20:00', 'Show: Banda Horizonte', 'Arena do Parque', 1, false],
    [6, 'jogo_fora', '16:00', 'Série B: Atlético Litoral x Municipal FC', '', -1, false],
    [7, 'outro', '07:00', 'Corrida de rua da cidade — ruas fechadas de manhã', 'Av. Central', 0, true],
    [10, 'jogo_casa', '19:00', 'Copa Regional: Municipal FC x Serrano EC', 'Estádio Municipal', 0, true],
    [16, 'show', '21:00', 'Festival de música — dois palcos', 'Parque das Águas', 1, false],
    [24, 'jogo_casa', '18:30', 'Estadual: Municipal FC x Esporte Clube Vale', 'Estádio Municipal', 0, false]
  ];
  D.tabela('evento_cidade', function () {
    var atualizado = M.ts(M.dia(-2), 10 * 60 + 12), out = [];
    AGENDA.forEach(function (e) {
      var L = e[5] >= 0 ? M.lojas[e[5] % M.lojas.length] : null;
      out.push({ data: M.dia(e[0]), hora: e[2] + ':00', tipo: e[1], titulo: e[3], local: e[4] || null,
        perto_loja: L ? L.nome : null, fonte_url: null, a_confirmar: e[6], atualizado_em: atualizado });
    });
    M.intervalo(M.hoje(), M.dia(30)).forEach(function (d) {
      FERIADOS.forEach(function (f) {
        if (d.slice(5) === f[0]) out.push({ data: d, hora: null, tipo: 'feriado', titulo: f[1], local: null, perto_loja: null, fonte_url: null, a_confirmar: false, atualizado_em: atualizado });
      });
    });
    return out;
  });
})();
