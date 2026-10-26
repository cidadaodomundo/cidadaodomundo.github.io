/* Avaliacoes do dia (demonstracao).
   Quadro usado no Inicio (hub), na tela avaliacoes/ e dentro da Central Salao.
   Simula: rpc inicio_avaliacoes (quando hoje|ontem; por loja: foto da fachada, iFood, Google; Accon sem leitura)
   e a funcao guardar-foto-chat (acao 'ver': fotos que o cliente mandou no pedido avaliado).
   iFood: MUNDO.avaliacoesIfood, a mesma conta da TV da Cozinha (o iFood libera a avaliacao 1 ou 2 dias
   depois do pedido; marcas de MUNDO.marcas). Google: as mesmas leituras diarias da
   TV da Cozinha e da Central Salao. Fotos sao desenhos ilustrativos. */
(function () {
  'use strict';
  if (!window.DEMO || !window.MUNDO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG || {};
  var BASE = M.marcas[0].nome;   /* a marca principal (MUNDO.marcas) */

  function idx(L) { return M.lojas.indexOf(L); }
  function xml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  /* aspas simples e parenteses tambem codificados: o quadro so aceita data:image sem aspas */
  function svgUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29'); }
  function hex8(n) { var s = (n >>> 0).toString(16); while (s.length < 8) s = '0' + s; return s; }
  function nomes(cat) { return M.cardapio.filter(function (c) { return c.categoria === cat; }).map(function (c) { return c.nome; }); }

  /* ---------------- iFood: avaliacoes que chegaram num dia ----------------
     a conta e a do MUNDO (MUNDO.avaliacoesIfood), a mesma da TV da Cozinha: totais, media e notas ruins batem */
  var UUIDS = {};
  function uuidDe(p) {
    var s = hex8(M.hash('u1|' + p.id)) + hex8(M.hash('u2|' + p.id)) + hex8(M.hash('u3|' + p.id)) + hex8(M.hash('u4|' + p.id));
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20, 32);
  }
  var BONS = ['Sabor', 'Embalagem caprichada', 'Entrega rápida', 'Bem servido', 'Temperatura certa'];
  function tags(a) {
    var t = String(a.p.comentario || ''), r = [];
    if (/frio|morna/i.test(t)) r.push('Temperatura da comida');
    if (/errado/i.test(t)) r.push('Pedido errado');
    if (/faltou/i.test(t)) r.push('Faltou item');
    if (/demor/i.test(t)) r.push('Demora na entrega');
    if (/motoboy|endereço/i.test(t)) r.push('Entregador');
    if (!r.length && a.p.nota >= 4) {
      var x = M.rng('tags|' + a.p.id), n = Math.floor(x() * 3);
      for (var i = 0; i < n; i++) { var b = BONS[Math.floor(x() * BONS.length)]; if (r.indexOf(b) < 0) r.push(b); }
    }
    return r;
  }
  function semResposta(a, dia) {
    if (!a.p.comentario) return false;
    var h = M.hash('resp|' + a.p.id);
    if (dia === M.hoje()) return h % 3 === 0 || a.min + 90 > M.minutosAgora();   /* a loja responde em ~1h30 */
    return h % 6 === 0;
  }
  function blocoIfood(L, dia) {
    var av = M.avaliacoesIfood(dia, L.id), semResp = 0;
    var itens = av.lista.map(function (a) {
      var sr = semResposta(a, dia); if (sr) semResp++;
      var u = uuidDe(a.p); UUIDS[u] = a.p;
      return {
        uuid: u, nota: a.p.nota, marca: a.marca.nome, pedido_em: M.br(a.p.dia) + ' ' + a.p.hora_pedido,
        sem_resposta: sr, texto: a.p.comentario || '', tags: tags(a), _min: a.min
      };
    });
    /* as piores primeiro; com comentario antes de sem comentario; as mais recentes antes */
    itens.sort(function (x, y) { return x.nota - y.nota || (y.texto ? 1 : 0) - (x.texto ? 1 : 0) || y._min - x._min; });
    itens = itens.slice(0, 25).map(function (x) { delete x._min; return x; });
    return {
      n: av.n, media: av.media, notas: av.notas.slice(),
      itens: itens, sem_resposta: semResp, ontem: M.avaliacoesIfood(M.somaDias(dia, -1), L.id).n
    };
  }

  /* ---------------- Google (mesmas leituras da TV da Cozinha e da Central Salao) ---------------- */
  var GOO_BASE = [1480, 960, 720, 640];
  function notaGoogle(i) { return i === 0 ? 4.6 : i === 1 ? 4.5 : 4.7; }
  /* os textos e a semente sao os mesmos de telas/salao.js (Central Salao): mexer junto para os comentarios baterem */
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
  var QUANDO = ['há 1 dia', 'há 3 dias', 'há 5 dias', 'há 1 semana', 'há 2 semanas'];
  var ORDEM_TIPO = [['positivo', 'negativo', 'positivo', 'positivo'], ['positivo', 'positivo', 'negativo', 'positivo'], ['positivo', 'positivo', 'positivo', 'negativo']];
  function preenche(t, r) {
    return t.replace('{b}', M.escolhe(r, BURGERS)).replace('{a}', M.escolhe(r, ACOMP).toLowerCase()).replace('{s}', M.escolhe(r, SOBREM).toLowerCase());
  }
  function destaques(L, dia) {
    var i = idx(L), semana = M.somaDias(dia, -M.diaSemana(dia));
    var r = M.rng('salao-goo|' + L.id + '|' + semana);
    var ordem = ORDEM_TIPO[i % ORDEM_TIPO.length], usadosE = {}, usadosQ = {};
    return ordem.map(function (tipo, k) {
      var lista = tipo === 'positivo' ? ELOGIOS : QUEIXAS, usados = tipo === 'positivo' ? usadosE : usadosQ, j;
      do { j = Math.floor(r() * lista.length); } while (usados[j] && Object.keys(usados).length < lista.length);
      usados[j] = 1;
      var d = { texto: preenche(lista[j], r), autor: M.iniciais(r), quando: QUANDO[Math.min(QUANDO.length - 1, k + (r() < 0.5 ? 0 : 1))] };
      if (k === 0 && i % 2 === 0) d.foto = fotoPrato(L);   /* um comentario com foto, para mostrar o recurso */
      return d;
    });
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
      if (d < M.somaDias(hoje, -10)) return;
      lista.push({ dia: d, total: tot, nota: notaGoogle(i), minuto: minuto });
    });
    GOO[k] = lista;
    return lista;
  }
  function blocoGoogle(L, dia) {
    var l = leiturasGoogle(L), pos = -1, i;
    for (i = l.length - 1; i >= 0; i--) if (l[i].dia <= dia) { pos = i; break; }
    if (pos < 0) return null;
    var u = l[pos], antes = l[pos - 1] || null, doDia = u.dia === dia;
    return {
      nota: u.nota, total: u.total, lido: M.br(u.dia) + ' ' + M.hm(u.minuto), lido_hoje: doDia,
      novas: doDia && antes ? u.total - antes.total : null,
      destaques: destaques(L, u.dia), perfil: BASE + ' · ' + L.nome
    };
  }

  /* ---------------- fotos ilustrativas ---------------- */
  var PAREDES = ['#3b2f2a', '#2a3440', '#35402a', '#402a35'];
  /* fachada desenhada sem tamanho fixo: preenche a caixa da foto. Caixa alta (computador, uma loja so):
     a fachada inteira no meio, com a parede acima e a calcada abaixo. Caixa larga (celular): corta no letreiro. */
  function fotoFachada(L) {
    var i = idx(L), cor = (C.cores && C.cores.brand) || '#F47B3C', parede = PAREDES[i % PAREDES.length];
    var nome = BASE.toUpperCase(), larg = Math.min(108, nome.length * 9);
    var listras = '', janelas = '';
    for (var k = 0; k < 7; k++) listras += '<rect x="' + (14 + k * 32) + '" y="262" width="16" height="30" fill="#ffffff" opacity=".22"/>';
    for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) janelas += '<rect x="' + (38 + b * 60) + '" y="' + (20 + a * 58) + '" width="44" height="40" rx="3" fill="#f4d58d" opacity="' + (((a + b + i) % 3) ? '.8' : '.35') + '"/>';
    var predio = '<rect width="240" height="480" fill="' + parede + '"/><rect y="410" width="240" height="70" fill="#5b5b57"/>' + janelas
      + '<rect x="58" y="200" width="124" height="52" rx="6" fill="#111110"/>'
      + '<text x="120" y="230" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="' + cor + '" text-anchor="middle" textLength="' + larg + '" lengthAdjust="spacingAndGlyphs">' + xml(nome) + '</text>'
      + '<text x="120" y="245" font-family="Arial, sans-serif" font-size="8" fill="#ffffff" opacity=".7" text-anchor="middle">ilustração</text>'
      + '<rect x="6" y="262" width="228" height="30" fill="' + cor + '"/>' + listras
      + '<rect x="24" y="304" width="66" height="70" fill="#f4d58d" opacity=".85"/><rect x="150" y="304" width="66" height="70" fill="#f4d58d" opacity=".85"/>'
      + '<rect x="96" y="300" width="48" height="110" fill="#1d1d1b"/><circle cx="136" cy="356" r="3" fill="' + cor + '"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">'
      + '<style>.alta{display:none}@media (max-aspect-ratio: 3/4){.alta{display:inline}.larga{display:none}}</style>'
      + '<rect width="100%" height="100%" fill="' + parede + '"/><rect y="50%" width="100%" height="50%" fill="#5b5b57"/>'
      + '<svg class="alta" width="100%" height="100%" viewBox="0 0 240 480" preserveAspectRatio="xMidYMid meet">' + predio + '</svg>'
      + '<svg class="larga" width="100%" height="100%" viewBox="0 0 240 480" preserveAspectRatio="xMidYMid slice">' + predio + '</svg>'
      + '</svg>';
    return svgUrl(svg);
  }
  function fotoPrato(L) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300">'
      + '<rect width="480" height="300" fill="#5a3b26"/><ellipse cx="240" cy="190" rx="190" ry="70" fill="#efe6d6"/>'
      + '<ellipse cx="240" cy="200" rx="110" ry="26" fill="#d9a05b"/><ellipse cx="240" cy="180" rx="118" ry="24" fill="#6b3b22"/>'
      + '<ellipse cx="240" cy="160" rx="114" ry="13" fill="#5aa64a"/><path d="M128 158 Q240 50 352 158 Z" fill="#e0a24e"/>'
      + '<rect x="360" y="150" width="14" height="60" rx="4" fill="#f2c14e" transform="rotate(12 367 180)"/>'
      + '<rect x="380" y="150" width="14" height="60" rx="4" fill="#f2c14e" transform="rotate(-8 387 180)"/>'
      + '<rect x="0" y="266" width="480" height="34" fill="rgba(0,0,0,.55)"/>'
      + '<text x="240" y="288" font-family="Arial, sans-serif" font-size="14" fill="#ffffff" text-anchor="middle">foto ilustrativa · demonstração · ' + xml(L.nome) + '</text>'
      + '</svg>';
    return svgUrl(svg);
  }
  function fotoCliente(p, k) {
    var t = String(p.comentario || ''), errado = /errado/i.test(t), faltou = /faltou/i.test(t);
    var marca = faltou
      ? '<rect x="360" y="120" width="130" height="130" rx="12" fill="none" stroke="#e66767" stroke-width="6" stroke-dasharray="16 10"/>'
        + '<text x="425" y="205" font-family="Arial, sans-serif" font-size="60" font-weight="700" fill="#e66767" text-anchor="middle">?</text>'
      : '<circle cx="' + (errado ? 250 : 320) + '" cy="215" r="80" fill="none" stroke="#e66767" stroke-width="6" stroke-dasharray="16 10"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">'
      + '<rect width="640" height="420" fill="' + (k % 2 ? '#3a3a36' : '#2e2e2b') + '"/>'
      + '<rect x="50" y="280" width="540" height="80" rx="10" fill="#c49a62"/><rect x="50" y="280" width="540" height="16" fill="#b3884f"/>'
      + '<g transform="translate(' + (faltou ? -60 : 0) + ' 0)"><ellipse cx="320" cy="262" rx="130" ry="30" fill="#d9a05b"/><ellipse cx="320" cy="238" rx="140" ry="28" fill="#6b3b22"/>'
      + '<ellipse cx="320" cy="212" rx="136" ry="14" fill="#5aa64a"/><path d="M182 210 Q320 80 458 210 Z" fill="#e0a24e"/></g>'
      + marca
      + '<rect x="0" y="376" width="640" height="44" fill="rgba(0,0,0,.55)"/>'
      + '<text x="320" y="404" font-family="Arial, sans-serif" font-size="18" fill="#ffffff" text-anchor="middle">foto ilustrativa · demonstração</text>'
      + '</svg>';
    return svgUrl(svg);
  }

  /* ---------------- portas ---------------- */
  /* a leitura do iFood roda a cada 20 minutos, o dia todo: o aviso de leitura parada (mais de 3 h) nao aparece */
  function leituraIfood() {
    var agora = M.minutosAgora(), u = Math.floor(agora / 20) * 20;
    return { em: M.hm(u), min: agora - u };
  }

  D.rpc('inicio_avaliacoes', function (b) {
    if (!D.papelDoToken(b.p_token)) throw D.erro(401, 'Sessão expirada', '28000');
    var q = b.p_dados && b.p_dados.quando === 'ontem' ? 'ontem' : 'hoje';
    var dia = q === 'hoje' ? M.hoje() : M.dia(-1), lido = leituraIfood();
    return {
      quando: q, dia: M.br(dia), ifood_lido_em: lido.em, ifood_lido_min: lido.min,
      lojas: M.lojas.map(function (L) {
        return {
          unidade: L.nome, id_loja: L.id,
          foto: fotoFachada(L),   /* toda loja com a fachada ilustrada (sem foto, a tela mostra o logo) */
          ifood: blocoIfood(L, dia), google: blocoGoogle(L, dia)
        };
      })
    };
  });

  /* fotos que o cliente mandou junto com a reclamacao (so nas notas baixas com problema visivel) */
  if (!D.tem('funcao', 'guardar-foto-chat')) {
    D.funcao('guardar-foto-chat', function (b) {
      if (!D.papelDoToken(b.token_portal)) throw D.erro(401, 'sessão expirada');
      if (b.acao !== 'ver') return { ok: false, erro: 'ação desconhecida' };
      var p = UUIDS[String(b.uuid_pedido || '')], fotos = [];
      if (p && p.nota <= 3 && /frio|morna|errado|faltou/i.test(p.comentario || '')) {
        var n = 1 + M.hash('fotos|' + p.id) % 2;
        for (var k = 0; k < n; k++) fotos.push({ link: fotoCliente(p, k), nome: 'foto-' + (k + 1) + '.svg' });
      }
      return { ok: true, fotos: fotos };
    });
  }
})();
