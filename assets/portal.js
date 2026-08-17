/* Portal Cidadao do Mundo - utilidades de layout
   1) Ordenacao por clique no cabecalho de qualquer tabela
   2) Carimbo "dados ate DD/MM" no topo de cada tela
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
    '@media print{.cdm-fresh{border:0}}';
  document.head.appendChild(st);

  /* ---------------- 1. ordenacao ---------------- */
  function celTxt(r, i) {
    var c = r.cells[i];
    return c ? (c.innerText || c.textContent || '').trim() : '';
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
})();
