/* =====================================================================
   BANCO DE MENTIRA (modo demonstracao)

   Fica entre as telas e a internet. Toda chamada que uma tela faria ao
   banco (Supabase: /rest/v1/rpc/<porta> e /rest/v1/<tabela>) e respondida
   aqui mesmo, no navegador, com dados inventados.

   Cada tela registra as suas portas em assets/demo/telas/<tela>.js:
     DEMO.rpc('nome_da_porta', function (corpo, ctx) { return {...}; });
     DEMO.tabela('nome_da_tabela', function (ctx) { return [ {...}, ... ]; });
   - corpo = o JSON que a tela mandou (ex.: {p_token, p_dados})
   - ctx   = { usuario, papel, admin, url, params, metodo, cabecalhos }
   - pode devolver um valor ou uma Promise; para simular erro:
     throw DEMO.erro(400, 'mensagem', 'P0001')

   Tabelas aceitam os filtros mais comuns do PostgREST (select, eq, neq,
   gt, gte, lt, lte, like, ilike, in, is, order, limit, offset).

   Porta que ninguem registrou: responde 404 e aparece em DEMO.faltando
   (e no console como "[DEMO] porta sem dados: ...").

   Qualquer outro endereco que nao seja a propria pasta do portal, fonte
   do Google, bibliotecas publicas (cdnjs/jsdelivr/unpkg) ou mapa (OSM)
   e BLOQUEADO em modo demo: a demonstracao nao conversa com servidor nenhum.
   ===================================================================== */
(function () {
  'use strict';
  var C = window.PORTAL_CFG || {};
  if (!C.demo) return;

  var RPC = {}, TAB = {}, FUN = {};
  var faltando = [];
  var bloqueados = [];

  var USUARIOS = {
    dono:       { usuario: 1, nome: 'Dono (demonstração)',     admin: true,  papel: 'dono' },
    gerente:    { usuario: 2, nome: 'Gerente (demonstração)',  admin: false, papel: 'gerente' },
    escritorio: { usuario: 3, nome: 'Escritório (demonstração)', admin: false, papel: 'escritorio' },
    delivery:   { usuario: 4, nome: 'Equipe do Delivery (demonstração)', admin: false, papel: 'delivery' }
  };

  function erro(status, msg, code) {
    var e = new Error(msg || 'erro');
    e.demoStatus = status || 400;
    e.demoCorpo = { message: msg || 'erro', code: code || 'P0001', details: null, hint: null };
    return e;
  }

  function lerToken() {
    try { return sessionStorage.getItem('cdm_token') || ''; } catch (e) { return ''; }
  }
  function papelDoToken(t) {
    var m = /^demo-([a-z]+)$/.exec(String(t || ''));
    return m && USUARIOS[m[1]] ? m[1] : null;
  }

  /* Tela aberta direto (fora do portal) em modo demo: entra como Dono. */
  (function () {
    try {
      var raizPath = new URL(C.raiz, location.href).pathname, p = location.pathname;
      var ehHub = p === raizPath || p === raizPath + 'index.html';
      if (!ehHub && !papelDoToken(lerToken())) {
        sessionStorage.setItem('cdm_token', 'demo-dono');
        sessionStorage.setItem('cdm_admin', '1');
        sessionStorage.setItem('cdm_nome', USUARIOS.dono.nome);
      }
    } catch (e) {}
  })();

  function ctxDe(url, metodo, cabecalhos, corpo) {
    var tok = (corpo && (corpo.p_token || corpo.p_cred || corpo.token_portal || corpo.p_senha)) || lerToken();
    var papel = papelDoToken(tok) || papelDoToken(lerToken()) || 'dono';
    var u = USUARIOS[papel];
    return {
      url: url, metodo: metodo, cabecalhos: cabecalhos || {},
      params: new URL(url).searchParams,
      papel: papel, usuario: u.usuario, nome: u.nome, admin: u.admin,
      token: tok
    };
  }

  /* ---------------- mini PostgREST para tabelas ---------------- */
  function valorFiltro(v) {
    if (v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }
  function cmp(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    var na = Number(a), nb = Number(b);
    if (typeof a !== 'boolean' && a !== '' && b !== '' && !isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  function casa(linha, col, expr) {
    var neg = false;
    if (expr.indexOf('not.') === 0) { neg = true; expr = expr.slice(4); }
    var p = expr.indexOf('.');
    var op = p < 0 ? expr : expr.slice(0, p), v = p < 0 ? '' : expr.slice(p + 1);
    var x = linha[col], ok;
    switch (op) {
      case 'eq': ok = cmp(x, valorFiltro(v)) === 0 && x != null; break;
      case 'neq': ok = x == null || cmp(x, valorFiltro(v)) !== 0; break;
      case 'gt': ok = x != null && cmp(x, v) > 0; break;
      case 'gte': ok = x != null && cmp(x, v) >= 0; break;
      case 'lt': ok = x != null && cmp(x, v) < 0; break;
      case 'lte': ok = x != null && cmp(x, v) <= 0; break;
      case 'is': ok = v === 'null' ? x == null : v === 'true' ? x === true : v === 'false' ? x === false : true; break;
      case 'in':
        var lista = v.replace(/^\(|\)$/g, '').split(',').map(function (s) { return s.replace(/^"|"$/g, ''); });
        ok = lista.some(function (s) { return cmp(x, s) === 0; }); break;
      case 'like': case 'ilike':
        var re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*') + '$', op === 'ilike' ? 'i' : '');
        ok = x != null && re.test(String(x)); break;
      default: ok = true;
    }
    return neg ? !ok : ok;
  }
  /* separa por virgula, mas nao dentro de parenteses: in.(a,b) */
  function dividir(txt) {
    var r = [], nivel = 0, atual = '';
    for (var i = 0; i < txt.length; i++) {
      var c = txt.charAt(i);
      if (c === '(') nivel++;
      if (c === ')') nivel--;
      if (c === ',' && nivel === 0) { r.push(atual); atual = ''; } else atual += c;
    }
    if (atual) r.push(atual);
    return r;
  }
  function aplicarConsulta(linhas, params) {
    var reservados = { select: 1, order: 1, limit: 1, offset: 1, or: 1, and: 1 };
    var r = (linhas || []).slice();
    params.forEach(function (v, k) {
      if (reservados[k]) return;
      r = r.filter(function (l) { return casa(l, k, v); });
    });
    var or = params.get('or');
    if (or) {
      var partes = dividir(or.replace(/^\(|\)$/g, ''));
      r = r.filter(function (l) {
        return partes.some(function (pp) {
          var i = pp.indexOf('.');
          return casa(l, pp.slice(0, i), pp.slice(i + 1));
        });
      });
    }
    var ord = params.get('order');
    if (ord) {
      var chaves = ord.split(',').map(function (s) {
        var t = s.split('.');
        var desc = t.indexOf('desc') > 0;
        /* padrao do PostgREST: asc = nulos no fim; desc = nulos no comeco */
        var nf = t.indexOf('nullsfirst') > 0 ? true : t.indexOf('nullslast') > 0 ? false : desc;
        return { c: t[0], desc: desc, nf: nf };
      });
      r.sort(function (a, b) {
        for (var i = 0; i < chaves.length; i++) {
          var k = chaves[i], x = a[k.c], y = b[k.c];
          if (x == null || y == null) {
            if (x == null && y == null) continue;
            return (x == null) === k.nf ? -1 : 1;
          }
          var d = cmp(x, y);
          if (d) return k.desc ? -d : d;
        }
        return 0;
      });
    }
    var total = r.length;
    var off = +params.get('offset') || 0, lim = params.get('limit');
    if (off) r = r.slice(off);
    if (lim != null) r = r.slice(0, +lim);
    var sel = params.get('select');
    if (sel && sel !== '*') {
      var cols = sel.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      r = r.map(function (l) {
        var o = {};
        cols.forEach(function (c) {
          var m = /^([a-zA-Z_0-9]+):([a-zA-Z_0-9]+)/.exec(c);   /* apelido:coluna */
          if (m) o[m[1]] = l[m[2]];
          else { var nome = c.replace(/::.*$/, '').replace(/\(.*$/, ''); o[nome] = l[nome]; }
        });
        return o;
      });
    }
    r.total = total;
    return r;
  }

  /* ---------------- respostas ---------------- */
  function resposta(status, corpo, extra) {
    var h = { 'Content-Type': 'application/json' };
    if (extra) for (var k in extra) h[k] = extra[k];
    return new Response(corpo === undefined ? 'null' : JSON.stringify(corpo), { status: status, headers: h });
  }
  function espera() { return new Promise(function (ok) { setTimeout(ok, 40 + Math.floor(Math.random() * 120)); }); }

  function anotaFalta(tipo, nome) {
    var k = tipo + ':' + nome;
    if (faltando.indexOf(k) < 0) {
      faltando.push(k);
      try { console.warn('[DEMO] porta sem dados: ' + k); } catch (e) {}
    }
  }

  function lerCorpo(init, req) {
    var b = init && init.body;
    if (b == null && req && typeof req.clone === 'function') return req.clone().text().then(function (t) { return t; });
    return Promise.resolve(b == null ? null : b);
  }
  function json(t) {
    if (t == null || t === '') return {};
    if (typeof t !== 'string') { try { return JSON.parse(String(t)); } catch (e) { return {}; } }
    try { return JSON.parse(t); } catch (e) { return {}; }
  }
  function cabecalhosDe(init, req) {
    var h = {};
    var src = (init && init.headers) || (req && req.headers);
    if (!src) return h;
    if (typeof src.forEach === 'function' && !Array.isArray(src)) src.forEach(function (v, k) { h[String(k).toLowerCase()] = v; });
    else if (Array.isArray(src)) src.forEach(function (p) { h[String(p[0]).toLowerCase()] = p[1]; });
    else for (var k in src) h[k.toLowerCase()] = src[k];
    return h;
  }

  function atender(url, init, req) {
    var u = new URL(url);
    var metodo = String((init && init.method) || (req && req.method) || 'GET').toUpperCase();
    var cab = cabecalhosDe(init, req);
    return lerCorpo(init, req).then(function (txt) {
      var corpo = json(txt);
      var ctx = ctxDe(url, metodo, cab, corpo);
      var caminho = u.pathname;
      return espera().then(function () {
        var m;
        if ((m = /\/rest\/v1\/rpc\/([a-zA-Z_0-9]+)/.exec(caminho))) {
          var fn = RPC[m[1]];
          if (!fn) { anotaFalta('rpc', m[1]); return resposta(404, { code: 'PGRST202', message: 'Porta ' + m[1] + ' ainda sem dados na demonstração' }); }
          return Promise.resolve().then(function () { return fn(corpo, ctx); }).then(function (v) { return resposta(200, v === undefined ? null : v); });
        }
        if ((m = /\/functions\/v1\/([a-zA-Z_0-9-]+)/.exec(caminho))) {
          var f = FUN[m[1]];
          if (!f) { anotaFalta('funcao', m[1]); return resposta(404, { ok: false, erro: 'função sem dados na demonstração' }); }
          return Promise.resolve().then(function () { return f(corpo, ctx); }).then(function (v) { return resposta(200, v); });
        }
        if ((m = /\/rest\/v1\/([a-zA-Z_0-9]+)/.exec(caminho))) {
          var nome = m[1], gerador = TAB[nome];
          if (metodo !== 'GET' && metodo !== 'HEAD') {
            if (!gerador) anotaFalta('tabela-escrita', nome);
            return resposta(metodo === 'POST' ? 201 : 204, metodo === 'POST' ? [] : undefined);
          }
          if (!gerador) {
            /* carimbo "dados ate" (order=col.desc&limit=1 numa coluna so): responde com hoje */
            var sel = u.searchParams.get('select'), ord = u.searchParams.get('order') || '';
            if (sel && sel.indexOf(',') < 0 && u.searchParams.get('limit') === '1' && ord.indexOf(sel + '.desc') === 0 && window.MUNDO) {
              var o = {}; o[sel] = window.MUNDO.hoje(); return resposta(200, [o]);
            }
            anotaFalta('tabela', nome);
            return resposta(200, []);
          }
          return Promise.resolve().then(function () { return gerador(ctx); }).then(function (linhas) {
            var r = aplicarConsulta(linhas, u.searchParams);
            var prefer = String(cab.prefer || '');
            var acc = String(cab.accept || '');
            if (acc.indexOf('application/vnd.pgrst.object+json') >= 0) return resposta(r.length ? 200 : 406, r[0] || null);
            var ini = +u.searchParams.get('offset') || 0;
            return resposta(200, r, /count=/.test(prefer) ? { 'Content-Range': (r.length ? ini + '-' + (ini + r.length - 1) : '*') + '/' + r.total } : null);
          });
        }
        anotaFalta('caminho', caminho);
        return resposta(404, { message: 'caminho desconhecido na demonstração' });
      });
    }).catch(function (e) {
      if (e && e.demoStatus) return resposta(e.demoStatus, e.demoCorpo);
      try { console.error('[DEMO] erro na porta', url, e); } catch (x) {}
      return resposta(500, { message: 'erro na demonstração: ' + (e && e.message) });
    });
  }

  /* ---------------- quem pode sair para a internet ---------------- */
  var LIVRES = [
    /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
    /^https:\/\/cdnjs\.cloudflare\.com\//,
    /^https:\/\/cdn\.jsdelivr\.net\/npm\//,
    /^https:\/\/unpkg\.com\//,
    /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\//
  ];
  function mesmaOrigem(url) {
    try { return new URL(url, location.href).origin === location.origin; } catch (e) { return false; }
  }
  function livre(url) {
    if (mesmaOrigem(url)) return true;
    for (var i = 0; i < LIVRES.length; i++) if (LIVRES[i].test(url)) return true;
    return false;
  }

  var fetchOriginal = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (entrada, init) {
    var req = (typeof Request !== 'undefined' && entrada instanceof Request) ? entrada : null;
    var url = new URL(req ? req.url : String(entrada), location.href).href;
    if (/^https:\/\/demo\.invalid\//.test(url) || /\/rest\/v1\/|\/functions\/v1\//.test(url) && !mesmaOrigem(url)) {
      return atender(url, init, req);
    }
    if (!livre(url)) {
      if (bloqueados.indexOf(url) < 0) bloqueados.push(url);
      try { console.warn('[DEMO] bloqueado (a demonstração não acessa a internet): ' + url); } catch (e) {}
      return Promise.resolve(resposta(503, { message: 'bloqueado na demonstração' }));
    }
    return fetchOriginal(entrada, init);
  };

  window.DEMO = {
    rpc: function (nome, fn) { RPC[nome] = fn; },
    tabela: function (nome, fn) { TAB[nome] = fn; },
    funcao: function (nome, fn) { FUN[nome] = fn; },
    erro: erro,
    usuarios: USUARIOS,
    papelDoToken: papelDoToken,
    faltando: faltando,
    bloqueados: bloqueados,
    tem: function (tipo, nome) { return !!(tipo === 'rpc' ? RPC : tipo === 'tabela' ? TAB : FUN)[nome]; }
  };
})();
