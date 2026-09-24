/* Portal Cidadao do Mundo - utilidades de layout
   1) Ordenacao por clique no cabecalho de qualquer tabela
   2) Carimbo "dados ate DD/MM" no topo de cada tela
   3) Nenhuma tela rola para o lado: tabela quebra linha no computador
      e vira cartao no celular (24/09/2026)
   4) Linha de anotacao em toda linha de tabela que tem botao de decisao,
      e uma caixa de anotacao geral no fim de cada tela (24/09/2026)
   Nao depende de nenhuma variavel das paginas. Publicado em 17/08/2026. */
(function () {
  'use strict';

  var SB = 'https://kqvoatdprjwxyadhvtdd.supabase.co/rest/v1/';
  var KEY = 'sb_publishable_tp_dgwYNsZZOC3uNYTuybw_mUDNHEmV';

  /* ---------------- estilo ---------------- */
  var st = document.createElement('style');
  st.textContent =
    'table th:not([onclick]){cursor:pointer;-webkit-user-select:none;user-select:none}' +
    'table th[data-cdmsd]::after{content:" \\25B2";font-size:9px;opacity:.8}' +
    'table th[data-cdmsd="d"]::after{content:" \\25BC"}' +
    '.cdm-fresh{display:inline-block;font-size:11px;line-height:1.5;padding:1px 8px;' +
    'border-radius:999px;border:1px solid currentColor;margin-left:8px;white-space:nowrap}' +
    '.cdm-fresh.ok{color:#38b26a}.cdm-fresh.warn{color:#e0a33a}.cdm-fresh.old{color:#e2574c}' +
    '.cdm-fresh-bar{padding:6px 14px 0;font-size:11px}' +
    '@media print{.cdm-fresh{border:0}}' +
    /* 3. sem rolagem lateral */
    'html,body{max-width:100%}' +
    'table{min-width:0!important;max-width:100%}' +
    'th,td{white-space:normal!important;overflow-wrap:break-word}' +
    '@media (max-width:700px){' +
    'table.cdm-card,table.cdm-card>tbody{display:block!important;width:auto!important;' +
    'max-width:100%!important;min-width:0!important;overflow:visible!important}' +
    /* linha e celula sem !important: a tela continua podendo esconder linha/coluna */
    'table.cdm-card>tbody>tr,table.cdm-card>tr,table.cdm-card>tbody>tr>td,table.cdm-card>tr>td{display:block}' +
    'table.cdm-card>tbody>tr>td,table.cdm-card>tr>td{width:auto!important;max-width:100%!important;min-width:0!important}' +
    'table.cdm-card>thead,table.cdm-card tr.cdm-hd{display:none!important}' +
    'table.cdm-card>tbody>tr,table.cdm-card>tr{border:1px solid rgba(128,128,128,.35)!important;' +
    'border-radius:10px;margin:0 0 10px;padding:6px 10px}' +
    'table.cdm-card td{border:0!important;padding:3px 0!important;text-align:left!important}' +
    'table.cdm-card td[data-cdm-l]::before{content:attr(data-cdm-l);display:block;font-size:10.5px;' +
    'opacity:.6;text-transform:uppercase;letter-spacing:.03em;margin-top:2px}' +
    'table.cdm-grade{font-size:11px!important}table.cdm-grade th,table.cdm-grade td{padding:3px 2px!important}}' +
    /* 4. anotacao */
    '.cdm-nota{display:block;width:100%;box-sizing:border-box;margin-top:6px;min-width:0;' +
    'font:inherit;font-size:12px;padding:5px 8px;border-radius:8px;border:1px dashed rgba(128,128,128,.55);' +
    'background:transparent;color:inherit}' +
    '.cdm-nota:focus{outline:none;border-style:solid;border-color:#e0a33a}' +
    '.cdm-nota.tem{border-style:solid;border-color:#e0a33a;background:rgba(224,163,58,.08)}' +
    '.cdm-nota-q{display:block;font-size:10.5px;opacity:.6;margin-top:2px;white-space:normal}' +
    '.cdm-nota-tela{max-width:1100px;margin:18px auto 24px;padding:0 14px}' +
    '.cdm-nota-tela b{display:block;font-size:12px;opacity:.75;margin-bottom:4px}' +
    '.cdm-nota-tela textarea.cdm-nota{min-height:54px;resize:vertical}' +
    '@media print{.cdm-nota:not(.tem),.cdm-nota-tela{display:none}}';
  document.head.appendChild(st);

  /* ---------------- 1. ordenacao ---------------- */
  function celTxt(r, i) {
    var c = r.cells[i];
    if (!c) return '';
    var k = c.getAttribute('data-k');            /* chave explicita vence o texto */
    return (k !== null ? k : (c.innerText || c.textContent || '')).trim();
  }

  function chave(s) {
    if (!s) return null;
    var d = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (d) {
      var y = d[3] ? (+d[3] < 100 ? 2000 + +d[3] : +d[3]) : 2000;
      return y * 10000 + +d[2] * 100 + +d[1];
    }
    var h = s.match(/^(\d{1,2}):(\d{2})$/);
    if (h) return +h[1] * 60 + +h[2];
    var n = s.replace(/[^\d,.\-]/g, '');
    if (/\d/.test(n)) {
      if (n.indexOf(',') > -1) n = n.replace(/\./g, '').replace(',', '.');
      else if (/^-?\d{1,3}(\.\d{3})+$/.test(n)) n = n.replace(/\./g, '');
      var f = parseFloat(n);
      if (!isNaN(f)) return f;
    }
    return null;
  }

  document.addEventListener('click', function (e) {
    var alvo = e.target;
    if (!alvo || !alvo.closest) return;
    var th = alvo.closest('th');
    if (!th || th.getAttribute('onclick')) return;
    var tab = th.closest('table');
    if (!tab) return;
    var linha = th.parentNode;
    var todas = [].slice.call(tab.rows);
    var hi = todas.indexOf(linha);
    if (hi < 0) return;
    var corpo = todas.slice(hi + 1).filter(function (r) {
      return !r.querySelector('th') && r.cells.length > 1;
    });
    if (corpo.length < 2) return;

    var i = th.cellIndex;
    var desc = th.getAttribute('data-cdmsd') !== 'd';
    [].forEach.call(linha.cells, function (c) { c.removeAttribute('data-cdmsd'); });
    th.setAttribute('data-cdmsd', desc ? 'd' : 'a');
    var dir = desc ? -1 : 1;

    corpo.sort(function (a, b) {
      var sa = celTxt(a, i), sb = celTxt(b, i);
      var ka = chave(sa), kb = chave(sb);
      if (ka !== null && kb !== null) return (ka - kb) * dir;
      if (!sa && sb) return 1;
      if (sa && !sb) return -1;
      return sa.localeCompare(sb, 'pt-BR', { numeric: true }) * dir;
    });
    corpo.forEach(function (r) { r.parentNode.appendChild(r); });
    /* a pagina pode ter ordenacao propria mais fraca; a nossa prevalece */
    e.stopPropagation();
  }, true);

  /* ---------------- 2. carimbo de frescor ---------------- */
  var FONTES = [
    { re: /\/delivery\/escala/i,         t: 'foody_escala',                    c: 'data',            ate: true },
    { re: /\/delivery\/ifood/i,          t: 'ifood_fato_avaliacao',            c: 'data_avaliacao' },
    { re: /\/delivery\//i,               t: 'foody_fato_fechamento_turno_dia', c: 'dia_operacional' },
    { re: /\/(rh|ponto|reuniao)(\/|$)/i, t: 'fato_espelho_dia',                c: 'data' },
    { re: /\/salao(\/|$)/i,              t: 'google_fato_avaliacao',           c: 'data_coleta' }
  ];

  function ancora() {
    return document.getElementById('upd') ||
           document.getElementById('sub') ||
           document.getElementById('hsub') ||
           document.getElementById('periodo') ||
           document.querySelector('header .sub') || null;
  }

  function hojeISO() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  }

  function fixar(el) {
    var a = ancora();
    if (!a) {
      var bar = document.createElement('div');
      bar.className = 'cdm-fresh-bar';
      bar.appendChild(el);
      var h = document.querySelector('header');
      if (h && h.parentNode) h.parentNode.insertBefore(bar, h.nextSibling);
      else document.body.insertBefore(bar, document.body.firstChild);
      return;
    }
    a.appendChild(el);
    try {
      new MutationObserver(function () {
        if (!a.contains(el)) a.appendChild(el);
      }).observe(a, { childList: true });
    } catch (e) {}
  }

  function carimbo() {
    var p = location.pathname, f = null;
    for (var k = 0; k < FONTES.length; k++) {
      if (FONTES[k].re.test(p)) { f = FONTES[k]; break; }
    }
    if (!f) return;
    var hoje = hojeISO();
    var u = SB + f.t + '?select=' + f.c + '&order=' + f.c + '.desc&limit=1' +
            (f.ate ? ('&' + f.c + '=lte.' + hoje) : '');
    fetch(u, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j[0] || !j[0][f.c]) return;
        var d = String(j[0][f.c]).slice(0, 10);
        var dias = Math.round((new Date(hoje) - new Date(d)) / 864e5);
        var el = document.createElement('span');
        el.className = 'cdm-fresh ' + (dias <= 1 ? 'ok' : (dias <= 3 ? 'warn' : 'old'));
        el.title = 'Fonte: ' + f.t + '.' + f.c;
        el.textContent = 'dados ate ' + d.slice(8, 10) + '/' + d.slice(5, 7) +
                         (dias > 1 ? ' - ' + dias + ' dias atras' : '');
        fixar(el);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', carimbo);
  else carimbo();

  /* ---------------- 3. tabela vira cartao no celular ---------------- */
  function limpa(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }

  function ehCabecalho(tr) {
    if (!tr.cells.length) return false;
    for (var i = 0; i < tr.cells.length; i++) if (tr.cells[i].tagName !== 'TH') return false;
    return true;
  }

  function cartao(tab) {
    if (tab.hasAttribute('data-cdm-livre')) return;
    var linhas = [].slice.call(tab.rows);
    var hd = null, ncol = 0;
    linhas.forEach(function (r) {
      var n = 0;
      [].forEach.call(r.cells, function (c) { n += c.colSpan || 1; });
      if (n > ncol) ncol = n;
      if (!hd && ehCabecalho(r)) hd = r;
    });
    if (ncol < 3) return;
    if (ncol > 12) { tab.classList.add('cdm-grade'); return; }
    tab.classList.add('cdm-card');
    var nomes = [];
    if (hd) {
      [].forEach.call(hd.cells, function (c) {
        for (var k = 0; k < (c.colSpan || 1); k++) nomes.push(limpa(c.innerText || c.textContent));
      });
    }
    linhas.forEach(function (r) {
      if (ehCabecalho(r)) { r.classList.add('cdm-hd'); return; }
      var pos = 0;
      [].forEach.call(r.cells, function (c) {
        var nm = nomes[pos];
        if (nm && !c.hasAttribute('data-cdm-l')) c.setAttribute('data-cdm-l', nm.replace(/[\u25B2\u25BC]/g, '').trim());
        pos += c.colSpan || 1;
      });
    });
  }

  /* ---------------- 4. anotacao ---------------- */
  var TELA = location.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '') || '/';
  var NOTAS = null, NOTAS_PEDIDO = false;

  function token() { try { return sessionStorage.getItem('cdm_token') || ''; } catch (e) { return ''; } }

  function rpc(fn, corpo) {
    return fetch(SB + 'rpc/' + fn, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); });
  }

  function quando(ts) {
    var d = new Date(ts);
    if (isNaN(d)) return '';
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return z(d.getDate()) + '/' + z(d.getMonth() + 1) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  function temAcao(td) { return !!td.querySelector('button,select,input:not(.cdm-nota),a[onclick]'); }

  function chaveLinha(tr, acao) {
    var k = tr.getAttribute('data-cdm-chave');
    if (k) return k;
    var partes = [];
    for (var i = 0; i < tr.cells.length && partes.length < 3; i++) {
      var c = tr.cells[i];
      if (c === acao || temAcao(c)) continue;
      var t = limpa(c.innerText || c.textContent);
      if (t) partes.push(t.slice(0, 60));
    }
    if (partes.length < 2) return '';   /* chave fraca misturaria linhas diferentes */
    return partes.join(' | ').slice(0, 200);
  }

  function preencher(inp) {
    var n = NOTAS && NOTAS[inp.getAttribute('data-cdm-k')];
    var q = inp.nextSibling && inp.nextSibling.className === 'cdm-nota-q' ? inp.nextSibling : null;
    if (n && document.activeElement !== inp) inp.value = n.texto;
    inp.classList.toggle('tem', !!(n && n.texto));
    if (q) q.textContent = n && n.texto ? ('anotado por ' + (n.autor || '?') + ' em ' + quando(n.atualizado_em)) : '';
  }

  function gravar(inp) {
    var k = inp.getAttribute('data-cdm-k'), txt = inp.value.trim();
    var antes = NOTAS && NOTAS[k] ? NOTAS[k].texto : '';
    if (txt === antes) return;
    var q = inp.nextSibling;
    if (q && q.className === 'cdm-nota-q') q.textContent = 'gravando…';
    rpc('anotacao_gravar', { p_token: token(), p_tela: TELA, p_chave: k, p_texto: txt,
                              p_contexto: inp.getAttribute('data-cdm-ctx') || null })
      .then(function (j) {
        NOTAS = NOTAS || {};
        NOTAS[k] = { texto: txt, autor: j && j.autor, atualizado_em: new Date().toISOString() };
        document.querySelectorAll('.cdm-nota').forEach(function (o) {
          if (o.getAttribute('data-cdm-k') === k) preencher(o);
        });
      })
      .catch(function () { if (q) q.textContent = 'não gravou — entre de novo no portal e tente outra vez'; });
  }

  function campo(k, ctx, grande) {
    var inp = document.createElement(grande ? 'textarea' : 'input');
    if (!grande) inp.type = 'text';
    inp.className = 'cdm-nota';
    inp.placeholder = grande ? '\u270F\uFE0F Anotação desta tela (fica gravada com seu nome)' : '\u270F\uFE0F anotação...';
    inp.setAttribute('data-cdm-k', k);
    if (ctx) inp.setAttribute('data-cdm-ctx', ctx);
    inp.maxLength = 1000;
    var espera = null;
    inp.addEventListener('input', function () {
      clearTimeout(espera);
      espera = setTimeout(function () { gravar(inp); }, 1500);
    });
    inp.addEventListener('change', function () { clearTimeout(espera); gravar(inp); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !grande) inp.blur(); });
    var q = document.createElement('span');
    q.className = 'cdm-nota-q';
    var f = document.createDocumentFragment();
    f.appendChild(inp); f.appendChild(q);
    return { frag: f, inp: inp };
  }

  function notaNaLinha(tr) {
    if (tr.querySelector('.cdm-nota') || ehCabecalho(tr) || tr.cells.length < 2) return;
    var tab = tr.closest('table');
    if (!tab || tab.hasAttribute('data-cdm-sem-nota') || tr.hasAttribute('data-cdm-sem-nota')) return;
    var acao = null;
    for (var i = tr.cells.length - 1; i >= 0; i--) if (temAcao(tr.cells[i])) { acao = tr.cells[i]; break; }
    if (!acao) return;
    var k = chaveLinha(tr, acao);
    if (!k) return;
    var c = campo(k, k, false);
    acao.appendChild(c.frag);
    preencher(c.inp);
  }

  function notaDaTela() {
    if (document.querySelector('.cdm-nota-tela') || !document.body) return;
    var box = document.createElement('div');
    box.className = 'cdm-nota-tela';
    var b = document.createElement('b');
    b.textContent = 'Anotação da equipe nesta tela';
    box.appendChild(b);
    var c = campo('__tela', document.title || TELA, true);
    box.appendChild(c.frag);
    document.body.appendChild(box);
    preencher(c.inp);
  }

  function carregarNotas() {
    if (NOTAS_PEDIDO) return;
    NOTAS_PEDIDO = true;
    rpc('anotacao_ler', { p_token: token(), p_tela: TELA })
      .then(function (j) {
        NOTAS = {};
        (j || []).forEach(function (n) { NOTAS[n.chave] = n; });
        document.querySelectorAll('.cdm-nota').forEach(preencher);
      })
      .catch(function () { NOTAS = {}; });
  }

  var agendado = false;
  function varrer() {
    agendado = false;
    [].forEach.call(document.querySelectorAll('table'), cartao);
    if (!token()) return;               /* sem login, sem anotacao */
    carregarNotas();
    [].forEach.call(document.querySelectorAll('table tr'), notaNaLinha);
    notaDaTela();
  }
  function agenda() {
    if (agendado) return;
    agendado = true;
    setTimeout(varrer, 120);
  }

  function iniciar() {
    varrer();
    try {
      new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) {
          var t = ms[i].target;
          if (t && t.classList && (t.classList.contains('cdm-nota-q'))) continue;
          agenda(); return;
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
