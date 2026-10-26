/* Turno do Delivery (demonstracao).
   Simula: rpc turno_delivery (acoes carregar, marcar, maq_definir, maq_serie, cob_listar, cob_decidir) e
   rpc turno_passagem (acoes ver, foto, apagar_foto, entregar, receber).
   Checklist, maquininhas, casos de cobranca e passagem saem de MUNDO: mesmas lojas, equipe, motoboys e
   pedidos das outras telas. As fotos de exemplo sao desenhos (SVG) feitos aqui mesmo.
   O que se marca na tela fica so neste navegador (localStorage, prefixo demo_turno_). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* ---------------- memoria da demonstracao ---------------- */
  var MEM = {};
  function ler(k, padrao) {
    if (MEM[k] !== undefined) return MEM[k];
    var v = padrao;
    try { var s = localStorage.getItem('demo_turno_' + k); if (s) v = JSON.parse(s); } catch (e) {}
    MEM[k] = v; return v;
  }
  function gravar(k, v) { MEM[k] = v; try { localStorage.setItem('demo_turno_' + k, JSON.stringify(v)); } catch (e) {} }

  /* ---------------- utilitarios ---------------- */
  function dados(b) { return (b && b.p_dados) || {}; }
  function lojaDe(d) { return M.loja(d.unidade) || M.lojas[0]; }
  function turnoDe(d) { return d.turno === 'manha' ? 'manha' : 'noite'; }
  function diaDe(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d.dia || '')) ? d.dia : M.hoje(); }
  function agoraHM() { return M.agoraISO().slice(11, 16); }
  function agoraTxt() { var a = M.agoraISO(); return M.br(a) + ' ' + a.slice(11, 16); }
  function chave(dia, turno, L) { return dia + '|' + turno + '|' + L.id; }

  /* turnos em sequencia: manha (ate 18h) e noite (depois das 18h; madrugada ainda e a noite de ontem) */
  var CORTE = 18 * 60, CORTE_PED = 17 * 60;
  function idx(dia, turno) {
    var n = Math.round((Date.parse(dia + 'T12:00:00Z') - Date.parse('2026-01-01T12:00:00Z')) / 864e5);
    return n * 2 + (turno === 'noite' ? 1 : 0);
  }
  function atual() {
    var a = M.minutosAgora();
    if (a < 300) return idx(M.dia(-1), 'noite');
    return idx(M.hoje(), a < CORTE ? 'manha' : 'noite');
  }
  function anterior(dia, turno) { return turno === 'noite' ? { dia: dia, turno: 'manha' } : { dia: M.somaDias(dia, -1), turno: 'noite' }; }
  /* janela do turno em minutos do dia (noite passa da meia-noite) */
  function janela(turno) { return turno === 'manha' ? { ini: 9 * 60, fim: 17 * 60 + 45 } : { ini: 17 * 60 + 30, fim: 24 * 60 + 30 }; }
  function agoraMinDe(dia) {
    var a = M.minutosAgora();
    if (dia === M.hoje()) return a;
    if (dia === M.dia(-1) && a < 300) return a + 1440;
    return dia < M.hoje() ? 99999 : -1;
  }
  function pedidosTurno(dia, turno, L) {
    return M.pedidos(dia, L.id).filter(function (p) { return turno === 'manha' ? p.min_pedido < CORTE_PED : p.min_pedido >= CORTE_PED; });
  }

  /* equipe do delivery da loja (quem marca o checklist e faz a passagem).
     Fica de fora quem tem o mesmo primeiro nome de um motoboy da loja, para nao confundir na tela. */
  var TIME = {};
  function time(L) {
    if (TIME[L.id]) return TIME[L.id];
    var motos = M.motoboys.filter(function (m) { return m.loja === L.id; }).map(function (m) { return m.apelido; });
    var daLoja = M.equipe.filter(function (x) { return x.loja === L.id && motos.indexOf(x.apelido) < 0; });
    var grupos = [
      function (x) { return x.setor === 'Delivery' || x.cargo === 'Gerente da loja'; },
      function (x) { return x.setor === 'Caixa'; },
      function (x) { return x.setor === 'Salão'; }
    ];
    var xs = [];
    grupos.forEach(function (g) { if (xs.length < 3) xs = xs.concat(daLoja.filter(g)); });
    if (!xs.length) xs = daLoja.length ? daLoja : M.equipe.filter(function (x) { return x.loja === L.id; });
    TIME[L.id] = xs;
    return xs;
  }

  /* motoboys da loja, com nome curto sem repetir */
  var NOMES_MOTO = {};
  function motosDe(L) {
    if (NOMES_MOTO[L.id]) return NOMES_MOTO[L.id];
    var ms = M.motoboys.filter(function (m) { return m.loja === L.id; });
    var cont = {};
    ms.forEach(function (m) { cont[m.apelido] = (cont[m.apelido] || 0) + 1; });
    NOMES_MOTO[L.id] = ms.map(function (m) {
      var p = m.nome.split(' ');
      return { id: m.id, nome: cont[m.apelido] > 1 ? m.apelido + ' ' + p[p.length - 1].charAt(0) + '.' : m.apelido };
    });
    return NOMES_MOTO[L.id];
  }

  /* ---------------- checklist (regra de exemplo, configuravel) ---------------- */
  var CHECK = {
    manha: [
      ['Abertura', 'Ligar as maquininhas e conferir a bateria de todas'],
      ['Abertura', 'Abrir a loja no iFood e conferir o tempo de entrega'],
      ['Abertura', 'Conferir se há produto pausado no cardápio sem motivo'],
      ['Abertura', 'Separar embalagens, sacolas e lacres para o turno'],
      ['Abertura', 'Conferir a geladeira de bebidas do delivery'],
      ['Durante o turno', 'Olhar a fila de pedidos a cada hora'],
      ['Durante o turno', 'Responder o chat do iFood dentro do aplicativo'],
      ['Durante o turno', 'Conferir a bag térmica de cada motoboy'],
      ['Fechamento', 'Conferir os pedidos cancelados e o motivo de cada um'],
      ['Fechamento', 'Recolher os canhotos das maquininhas'],
      ['Fechamento', 'Limpar o setor e repor a geladeira para o próximo turno'],
      ['Fechamento', 'Fazer a passagem de turno com as fotos']
    ],
    noite: [
      ['Abertura', 'Receber a passagem do turno da manhã'],
      ['Abertura', 'Anotar com qual motoboy ficou cada maquininha'],
      ['Abertura', 'Conferir o tempo de entrega no iFood para o pico da noite'],
      ['Abertura', 'Repor embalagens, sacolas e lacres'],
      ['Durante o turno', 'Avisar a cozinha dos pedidos que estão atrasando'],
      ['Durante o turno', 'Conferir se todo pedido em cartão voltou com o canhoto'],
      ['Durante o turno', 'Ler as avaliações do dia'],
      ['Fechamento', 'Fechar a loja no iFood no horário'],
      ['Fechamento', 'Conferir a maquininha de cada motoboy com os pedidos dele'],
      ['Fechamento', 'Recolher e colocar as maquininhas para carregar'],
      ['Fechamento', 'Limpar o setor, as bags e repor a geladeira'],
      ['Fechamento', 'Fazer a passagem de turno com as fotos']
    ]
  };

  function checklist(dia, turno, L) {
    var lista = CHECK[turno], i = idx(dia, turno), cur = atual();
    var r = M.rng('turno-check|' + dia + '|' + turno + '|' + L.id);
    var eq = time(L), j = janela(turno), dur = j.fim - j.ini;
    var fr = i < cur ? 1 : (i > cur ? 0 : Math.max(0, Math.min(1, (agoraMinDe(dia) - j.ini) / dur)));
    var marcas = ler('marcas', {});
    var base = turno === 'manha' ? 1 : 101;
    return lista.map(function (x, k) {
      var id = base + k, pos = (k + 0.5) / lista.length;
      var falha = r() < 0.1, pessoa = M.escolhe(r, eq), jit = r();
      var feito = (i < cur || (i === cur && pos <= fr)) && !falha;
      var quem = null, quando = null;
      if (feito) { quem = pessoa.apelido; quando = M.hm(j.ini + pos * dur + jit * 14 - 7); }
      var mk = marcas[chave(dia, turno, L) + '|' + id];
      if (mk) { feito = !!mk.feito; quem = feito ? mk.quem : null; quando = feito ? mk.quando : null; }
      return { id: id, secao: x[0], texto: x[1], feito: feito, quem: quem, quando: quando };
    });
  }

  /* ---------------- maquininhas ---------------- */
  function maqsDe(L) {
    var li = Math.max(0, M.lojas.indexOf(L));
    var n = Math.min(7, Math.max(3, motosDe(L).length - 1));
    var l = [];
    for (var k = 1; k <= n; k++) l.push({ id: (li + 1) * 100 + k, apelido: 'Máquina ' + k, tipo: 'motoboy' });
    l.push({ id: (li + 1) * 100 + 50, apelido: 'Máquina do balcão', tipo: 'loja' });
    return l;
  }
  function serieDe(L, n) { var r = M.rng('turno-serie|' + L.id + '|' + n); return 'MQ' + String(100000 + Math.floor(r() * 899999)); }
  /* numero de serie ligado a cada maquininha (fica valendo para todos os turnos) */
  function ligacoes(L) {
    var salvo = ler('series', {});
    var out = {};
    maqsDe(L).forEach(function (m, k, todas) {
      /* a ultima maquininha de motoboy (penultima da lista) comeca sem serie, para a tela mostrar o caso */
      var padrao = (m.tipo === 'motoboy' && k === todas.length - 2) ? '' : serieDe(L, k + 1);
      out[m.id] = salvo[m.id] !== undefined ? salvo[m.id] : padrao;
    });
    return out;
  }
  function seriesDe(L) {
    var maqs = maqsDe(L), lig = ligacoes(L), vistas = [];
    var r = M.rng('turno-series-lista|' + L.id);
    for (var k = 1; k <= maqs.length + 2; k++) vistas.push(serieDe(L, k));
    return vistas.map(function (s, k) {
      var dono = maqs.filter(function (m) { return lig[m.id] === s; })[0];
      var dias = dono ? M.entre(r, 0, 1) : M.entre(r, 2, 9);
      var vendas = dono ? M.entre(r, 70, 320) : M.entre(r, 4, 38);
      return { serie: s, vendas: vendas, usada_por: dono ? dono.apelido : null, ultimo: M.br(M.dia(-dias)) + ' ' + M.hm(M.entre(r, 19 * 60, 23 * 60)) };
    });
  }
  function escalaMaq(dia, turno, L) {
    var i = idx(dia, turno), cur = atual(), maqs = maqsDe(L), motos = motosDe(L);
    var r = M.rng('turno-maq|' + dia + '|' + turno + '|' + L.id);
    var ordem = motos.slice();
    for (var x = ordem.length - 1; x > 0; x--) { var y = Math.floor(r() * (x + 1)), t = ordem[x]; ordem[x] = ordem[y]; ordem[y] = t; }
    var eq = time(L), j = janela(turno);
    var salvo = ler('maq', {}), out = {};
    var mm = maqs.filter(function (m) { return m.tipo === 'motoboy'; });
    mm.forEach(function (m, k) {
      var pula = r() < 0.12, anotou = M.escolhe(r, eq), jit = M.entre(r, 0, 25);
      var tem = i < cur || (i === cur && k < Math.ceil(mm.length * 0.7));
      var o = { motoboy: '', quem: null, quando: null };
      if (tem && !pula && ordem[k]) o = { motoboy: ordem[k].nome, quem: anotou.apelido, quando: M.hm(j.ini + 5 + jit) };
      var s = salvo[chave(dia, turno, L) + '|' + m.id];
      if (s) o = s;
      out[m.id] = o;
    });
    return out;
  }
  function maquininhas(dia, turno, L, admin) {
    var lig = ligacoes(L), esc = escalaMaq(dia, turno, L), motos = motosDe(L);
    var peds = pedidosTurno(dia, turno, L).filter(function (p) { return !p.cancelado && p.pagamento === 'cartao_na_entrega' && (p.status === 'entregue' || p.status === 'em_rota'); });
    var rb = M.rng('turno-balcao|' + dia + '|' + turno + '|' + L.id);
    var extraBalcao = idx(dia, turno) <= atual() ? M.entre(rb, 3, 14) : 0;
    return maqsDe(L).map(function (m) {
      var o = { id: m.id, apelido: m.apelido, tipo: m.tipo, serie: lig[m.id] || '', motoboy: '', vendas: 0, quem: null, quando: null };
      var vs = [];
      if (m.tipo === 'motoboy') {
        var e = esc[m.id] || {};
        o.motoboy = e.motoboy || ''; o.quem = e.quem || null; o.quando = e.quando || null;
        var mb = motos.filter(function (x) { return x.nome === o.motoboy; })[0];
        if (mb) vs = peds.filter(function (p) { return p.motoboy_id === mb.id; });
      } else {
        vs = peds.filter(function (p) { return p.canal === 'retirada'; });
      }
      if (o.serie) {
        var valor = vs.reduce(function (s, p) { return s + p.total; }, 0);
        o.vendas = vs.length;
        if (m.tipo === 'loja') { o.vendas += extraBalcao; valor += extraBalcao * 41.9; }
        if (admin) o.valor = M.arred(valor);
      }
      return o;
    });
  }

  /* ---------------- casos de cobranca (pedido em cartao sem venda na maquininha) ---------------- */
  var RESULT = ['canhoto', 'canhoto', 'dinheiro', 'nao_entregue', 'loja', 'descontar'];
  var OBS = { canhoto: 'canhoto estava na gaveta do caixa', dinheiro: 'cliente trocou para Pix na porta', nao_entregue: 'cliente não estava, pedido voltou', loja: 'pedido lançado como cartão por engano', descontar: '' };
  function casos(dia, L) {
    var out = [], eq = time(L);
    var fim = dia > M.hoje() ? M.hoje() : dia;
    for (var n = 9; n >= 0; n--) {
      var d = M.somaDias(fim, -n);
      var r = M.rng('turno-cob|' + d + '|' + L.id);
      if (r() > 0.6) continue;
      var ag = agoraMinDe(d);
      var cands = M.pedidos(d, L.id).filter(function (p) { return !p.cancelado && p.status === 'entregue' && p.pagamento === 'cartao_na_entrega' && p.motoboy && p.min_entrega <= ag; });
      if (!cands.length) continue;
      var p = M.escolhe(r, cands), comanda = r() < 0.2;
      out.push({
        id: M.hash(p.id) % 900000 + 100000,
        unidade: L.nome, n_pedido: p.numero_ifood || String(p.numero), dia: M.br(d), hora_entrega: p.hora_entrega,
        entregador: p.motoboy || '—', cliente: p.cliente, meio: r() < 0.6 ? 'cartão de crédito' : 'cartão de débito', valor: p.total,
        origem: comanda ? 'COMANDA NAO COBRADA' : 'MAQUININHA SEM VENDA',
        _d: d, _r: M.escolhe(r, RESULT), _quem: M.escolhe(r, eq).apelido, _h: M.entre(r, 10 * 60, 16 * 60)
      });
    }
    var salvo = ler('cob', {});
    /* os 3 mais recentes ficam esperando explicacao; os mais antigos ja vem explicados */
    out.sort(function (a, b) { return a._d < b._d ? 1 : a._d > b._d ? -1 : 0; });
    return out.map(function (o, k) {
      var c = {}; for (var x in o) if (x.charAt(0) !== '_') c[x] = o[x];
      c.resultado = null; c.quem = null; c.quando = null; c.observacao = '';
      if (k >= 3) { c.resultado = o._r; c.quem = o._quem; c.quando = M.br(M.somaDias(o._d, 1)) + ' ' + M.hm(o._h); c.observacao = OBS[o._r] || ''; }
      var s = salvo[c.id];
      if (s) { c.resultado = s.resultado; c.quem = s.quem; c.quando = s.quando; c.observacao = s.observacao || ''; }
      return c;
    });
  }

  /* ---------------- fotos de exemplo (desenhos) ---------------- */
  function svg(corpo) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="600" height="600">' + corpo +
      '<rect x="8" y="8" width="112" height="22" rx="6" fill="#000" fill-opacity=".55"/>' +
      '<text x="17" y="23" font-family="Arial,sans-serif" font-size="12" fill="#fff">foto de exemplo</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }
  var CORES = ['#c0392b', '#e67e22', '#27ae60', '#2c3e50', '#f1c40f', '#8e44ad', '#16a085'];
  function fotoGeladeira(r) {
    var c = '<rect width="300" height="300" fill="#3b3934"/><rect y="252" width="300" height="48" fill="#2a2925"/>' +
      '<rect x="58" y="18" width="184" height="254" rx="10" fill="#d9dde0"/>' +
      '<rect x="68" y="28" width="164" height="204" rx="6" fill="#a9c9d9"/>';
    var falta = r() < 0.35 ? M.entre(r, 2, 5) : 0;
    [72, 124, 176, 226].forEach(function (y, li) {
      c += '<rect x="70" y="' + y + '" width="160" height="4" fill="#eef2f4"/>';
      var n = 8;
      for (var k = 0; k < n; k++) {
        if (falta && li === 1 && k < falta) continue;
        var x = 76 + k * 19, cor = CORES[(li * 3 + k) % CORES.length], lata = li >= 2;
        if (lata) c += '<rect x="' + (x + 1) + '" y="' + (y - 26) + '" width="13" height="26" rx="2" fill="' + cor + '"/><rect x="' + (x + 1) + '" y="' + (y - 26) + '" width="13" height="4" fill="#d0d4d6"/>';
        else c += '<rect x="' + (x + 3) + '" y="' + (y - 40) + '" width="9" height="6" rx="1" fill="#ecf0f1"/><rect x="' + x + '" y="' + (y - 34) + '" width="15" height="34" rx="4" fill="' + cor + '"/><rect x="' + x + '" y="' + (y - 22) + '" width="15" height="9" fill="#fff" fill-opacity=".75"/>';
      }
    });
    c += '<rect x="220" y="96" width="6" height="64" rx="3" fill="#7f8c8d"/><rect x="68" y="240" width="164" height="24" rx="4" fill="#b8bec2"/>';
    for (var g = 0; g < 7; g++) c += '<rect x="' + (78 + g * 22) + '" y="246" width="14" height="12" rx="2" fill="#9aa1a5"/>';
    return svg(c);
  }
  function fotoSetor(r) {
    var c = '<rect width="300" height="300" fill="#4a463e"/>';
    for (var t = 0; t < 6; t++) c += '<rect x="' + (t * 50) + '" y="232" width="49" height="68" fill="' + (t % 2 ? '#5d5a53' : '#66625a') + '"/>';
    c += '<rect x="20" y="40" width="260" height="8" fill="#8d6e4f"/><rect x="20" y="98" width="260" height="8" fill="#8d6e4f"/>';
    for (var k = 0; k < 6; k++) c += '<rect x="' + (28 + k * 42) + '" y="' + (14 + (k % 2) * 4) + '" width="34" height="' + (26 - (k % 2) * 4) + '" rx="2" fill="#c9a56b"/>';
    for (var s = 0; s < 9; s++) c += '<rect x="' + (26 + s * 28) + '" y="66" width="22" height="32" rx="2" fill="' + (s % 3 ? '#e8e2d4' : '#d35400') + '"/>';
    c += '<rect x="10" y="150" width="280" height="16" fill="#9aa1a5"/><rect x="16" y="166" width="268" height="66" fill="#7f868a"/>';
    var bags = M.entre(r, 2, 4);
    for (var b = 0; b < bags; b++) c += '<rect x="' + (24 + b * 58) + '" y="104" width="50" height="46" rx="6" fill="#c0392b"/><rect x="' + (34 + b * 58) + '" y="112" width="30" height="8" rx="3" fill="#e74c3c"/>';
    c += '<rect x="222" y="118" width="54" height="32" rx="4" fill="#2c3e50"/><rect x="230" y="112" width="38" height="8" fill="#ecf0f1"/>';
    c += '<rect x="30" y="180" width="80" height="40" rx="3" fill="#6b7276"/><rect x="190" y="180" width="80" height="40" rx="3" fill="#6b7276"/>';
    return svg(c);
  }

  function fotoMaquininhas(r) {
    var c = '<rect width="300" height="300" fill="#3f3c36"/><rect y="200" width="300" height="100" fill="#8a7a64"/>' +
      '<rect y="196" width="300" height="8" fill="#a08f76"/><path d="M0 60 H300" stroke="#55524b" stroke-width="3"/>';
    var n = M.entre(r, 4, 6);
    for (var k = 0; k < n; k++) {
      var x = 14 + k * 47;
      c += '<path d="M' + (x + 19) + ' 128 C ' + (x + 19) + ' 90, ' + (x + 30) + ' 70, ' + (x + 30) + ' 60" stroke="#222" stroke-width="3" fill="none"/>' +
        '<rect x="' + x + '" y="120" width="38" height="78" rx="7" fill="#2d3436"/>' +
        '<rect x="' + (x + 5) + '" y="126" width="28" height="22" rx="2" fill="' + (k % 3 ? '#74b9ff' : '#55efc4') + '"/>';
      for (var t = 0; t < 9; t++) c += '<rect x="' + (x + 6 + (t % 3) * 9) + '" y="' + (154 + Math.floor(t / 3) * 10) + '" width="7" height="7" rx="1" fill="#b2bec3"/>';
      c += '<rect x="' + (x + 13) + '" y="112" width="12" height="9" fill="#dfe6e9"/>';
    }
    c += '<rect x="20" y="230" width="90" height="40" rx="3" fill="#f5f0e1"/><path d="M28 242 H100 M28 252 H90 M28 262 H80" stroke="#b9b2a0" stroke-width="3"/>';
    return svg(c);
  }

  /* ---------------- passagem de turno ---------------- */
  var VOLTARAM = ['pedido {n} voltou, cliente não atendeu', 'pedido {n} voltou, endereço não encontrado'];
  var BOS = ['nenhum', 'nenhum', 'nenhum', 'Máquina 3 com bateria fraca', 'faltou refrigerante lata na geladeira',
    'impressora da expedição falhando', 'bag térmica de um motoboy rasgada', 'acabou a sacola grande'];
  var PROBLEMAS = ['geladeira sem refrigerante lata', 'setor com caixas no chão', 'duas maquininhas sem carga', 'bag térmica suja'];

  function passBase(dia, turno, L) {
    var i = idx(dia, turno), cur = atual();
    var rec = { fotos: [] };
    if (i >= cur) return rec;
    var r = M.rng('turno-pass|' + dia + '|' + turno + '|' + L.id);
    var eq = time(L);
    var sai = M.escolhe(r, eq), outros = eq.filter(function (x) { return x !== sai; });
    var entra = M.escolhe(r, outros.length ? outros : eq);
    var semEntrega = r() < 0.07;
    var j = janela(turno), ent = j.fim - 10 + M.entre(r, 0, 25);
    var okRec = r() < 0.8, prob = M.escolhe(r, PROBLEMAS), outra = r() < 0.3;
    var peds = pedidosTurno(dia, turno, L).filter(function (p) { return p.status === 'entregue' && p.canal !== 'retirada'; });
    var pv = peds.length ? M.escolhe(r, peds) : null;
    var volt = r() < 0.6 || !pv ? 'nenhum' : M.escolhe(r, VOLTARAM).replace('{n}', pv.numero_ifood || pv.numero);
    var bos = M.escolhe(r, BOS);
    var base = (i % 100000) * 10;
    if (!semEntrega) {
      rec.entregue_por = sai.apelido;
      rec.entregue_em = M.ts(dia, ent);
      rec.fotos = [
        { id: base + 1, tipo: 'setor', imagem: fotoSetor(r), hora: M.hm(ent - 7) },
        { id: base + 2, tipo: 'geladeira', imagem: fotoGeladeira(r), hora: M.hm(ent - 5) }
      ];
      if (outra) rec.fotos.push({ id: base + 3, tipo: 'outra', imagem: fotoMaquininhas(r), hora: M.hm(ent - 3) });
      rec.voltaram = volt;
      rec.bos = bos;
    }
    if (i < cur - 1) {
      var prox = turno === 'manha' ? { dia: dia, ini: 17 * 60 + 40 } : { dia: M.somaDias(dia, 1), ini: 9 * 60 + 5 };
      rec.recebido_por = entra.apelido;
      rec.recebido_em = M.ts(prox.dia, Math.max(prox.ini, turno === 'manha' ? ent + 4 : 0) + M.entre(r, 0, 20));
      rec.recebido_ok = semEntrega ? false : okRec;
      rec.recebido_obs = semEntrega ? 'o turno anterior não registrou a entrega' : (okRec ? '' : prob);
    }
    return rec;
  }
  function getRec(dia, turno, L) {
    var s = ler('pass', {})[chave(dia, turno, L)];
    return s ? JSON.parse(JSON.stringify(s)) : passBase(dia, turno, L);
  }
  function setRec(dia, turno, L, rec) {
    var t = ler('pass', {});
    t[chave(dia, turno, L)] = rec;
    gravar('pass', t);
  }
  function ver(d) {
    var L = lojaDe(d), dia = diaDe(d), turno = turnoDe(d), a = anterior(dia, turno);
    return {
      dia: dia, turno: turno, unidade: L.nome,
      anterior_dia: a.dia, anterior_turno: a.turno,
      anterior: getRec(a.dia, a.turno, L),
      atual: getRec(dia, turno, L)
    };
  }

  /* ---------------- porta turno_delivery ---------------- */
  D.rpc('turno_delivery', function (b, ctx) {
    var acao = b && b.p_acao, d = dados(b);
    var L = lojaDe(d), dia = diaDe(d), turno = turnoDe(d);
    if (acao === 'carregar') {
      return {
        dia: dia, turno: turno, unidade: L.nome, dono: !!ctx.admin,
        checklist: checklist(dia, turno, L),
        maquininhas: maquininhas(dia, turno, L, ctx.admin),
        motoboys: motosDe(L).map(function (m) { return m.nome; }),
        series: seriesDe(L)
      };
    }
    if (acao === 'marcar') {
      var t = ler('marcas', {});
      t[chave(dia, turno, L) + '|' + Number(d.item_id)] = { feito: !!d.feito, quem: ctx.nome, quando: dia === M.hoje() ? agoraHM() : agoraTxt() };
      gravar('marcas', t);
      return { ok: true };
    }
    if (acao === 'maq_definir') {
      var mq = ler('maq', {});
      mq[chave(dia, turno, L) + '|' + Number(d.maquininha_id)] = d.motoboy
        ? { motoboy: String(d.motoboy), quem: ctx.nome, quando: dia === M.hoje() ? agoraHM() : agoraTxt() }
        : { motoboy: '', quem: null, quando: null };
      gravar('maq', mq);
      return { ok: true };
    }
    if (acao === 'maq_serie') {
      var id = Number(d.maquininha_id), serie = String(d.serie || '');
      var lig = ligacoes(L), sv = ler('series', {});
      /* uma serie so pode estar ligada a uma maquininha: sai da anterior */
      Object.keys(lig).forEach(function (k) { if (serie && lig[k] === serie && Number(k) !== id) sv[k] = ''; });
      sv[id] = serie;
      gravar('series', sv);
      return { ok: true };
    }
    if (acao === 'cob_listar') return { casos: casos(dia, L) };
    if (acao === 'cob_decidir') {
      var c = ler('cob', {});
      c[Number(d.id)] = { resultado: String(d.resultado || ''), observacao: String(d.observacao || ''), quem: ctx.nome, quando: agoraTxt() };
      gravar('cob', c);
      return { ok: true };
    }
    throw D.erro(400, 'ação desconhecida: ' + acao);
  });

  /* ---------------- porta turno_passagem ---------------- */
  D.rpc('turno_passagem', function (b) {
    var acao = b && b.p_acao, d = dados(b);
    var L = lojaDe(d), dia = diaDe(d), turno = turnoDe(d);
    if (acao === 'ver') return ver(d);
    if (acao === 'foto' || acao === 'apagar_foto' || acao === 'entregar') {
      var rec = getRec(dia, turno, L);
      rec.fotos = rec.fotos || [];
      if (rec.entregue_em) throw D.erro(400, 'Este turno já foi entregue.');
      if (acao === 'foto') {
        if (!/^(setor|geladeira|outra)$/.test(String(d.tipo))) throw D.erro(400, 'tipo de foto inválido');
        if (!/^data:image\//.test(String(d.imagem || ''))) throw D.erro(400, 'a foto não chegou');
        var seq = ler('seq', 9000000) + 1; gravar('seq', seq);
        rec.fotos.push({ id: seq, tipo: d.tipo, imagem: d.imagem, hora: agoraHM() });
      } else if (acao === 'apagar_foto') {
        rec.fotos = rec.fotos.filter(function (f) { return f.id !== Number(d.id); });
      } else {
        var falta = ['setor', 'geladeira'].filter(function (k) { return !rec.fotos.some(function (f) { return f.tipo === k; }); });
        if (falta.length) throw D.erro(400, 'Falta a foto ' + falta.map(function (k) { return k === 'setor' ? 'do setor' : 'da geladeira'; }).join(' e ') + '.');
        if (!String(d.nome || '').trim()) throw D.erro(400, 'Escreva seu nome.');
        rec.entregue_por = String(d.nome).trim();
        rec.entregue_em = M.agoraISO();
        rec.voltaram = String(d.voltaram || '');
        rec.bos = String(d.bos || '');
      }
      setRec(dia, turno, L, rec);
      return ver(d);
    }
    if (acao === 'receber') {
      var a = anterior(dia, turno), ant = getRec(a.dia, a.turno, L);
      if (ant.recebido_em) throw D.erro(400, 'O turno anterior já foi recebido.');
      ant.recebido_por = String(d.nome || '').trim();
      ant.recebido_em = M.agoraISO();
      ant.recebido_ok = !!d.ok;
      ant.recebido_obs = String(d.obs || '');
      setRec(a.dia, a.turno, L, ant);
      return ver(d);
    }
    throw D.erro(400, 'ação desconhecida: ' + acao);
  });
})();
