/* Motoboys · documentos (demonstracao).
   Simula a rpc motoboys_consulta, com as acoes listar, doc e ficha.
   Fichas a partir de MUNDO.motoboys; entregas dos ultimos 30 dias contadas em MUNDO.pedidos;
   Pix igual ao cadastro do pagamento (MUNDO.motoboys[].pix_ok).
   Documentos mostram so a situacao e mascaras: nenhum numero de documento de verdade.
   O que se grava na tela fica so neste navegador (localStorage, chave demo_motoboys). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  var ITENS = ['mei', 'cnh', 'moto', 'contrato'];
  var SITS = ['ok', 'pasta', 'atencao', 'falta', 'nao_sei'];
  /* so dono e escritorio mudam as fichas (o gerente so ve) */
  var QUEM = ['Escritório (demonstração)', 'Dono (demonstração)', 'Escritório (demonstração)'];
  var FONTES = ['cópia entregue na loja', 'pasta do contrato', 'foto enviada ao escritório', 'conferido na hora da contratação'];
  var OBS = ['Roda só no almoço', 'Prefere entregas perto da loja', 'Cobre as folgas do fim de semana', 'Roda só à noite', 'Tem baú grande, bom para pedido grande'];

  /* ---------------- memoria (so neste navegador) ---------------- */
  var CHAVE = 'demo_motoboys';
  function ler() {
    try { var o = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (o && o.docs && o.fichas && o.novas) return o; } catch (e) {}
    return { docs: {}, fichas: {}, novas: [], seq: 950 };
  }
  function grava() { try { localStorage.setItem(CHAVE, JSON.stringify(MEM)); } catch (e) {} }
  var MEM = ler();

  /* ---------------- utilitarios ---------------- */
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function brAno(iso) { iso = String(iso || ''); return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }
  function agoraTxt() { var a = M.agoraISO(); return brAno(a) + ' ' + a.slice(11, 16); }
  function quandoTxt(r, diasAtras) { return brAno(M.dia(-diasAtras)) + ' ' + M.hm(M.entre(r, 9 * 60, 18 * 60)); }
  function nomeLoja(x) { var l = M.loja(x); return l ? l.nome : String(x || ''); }
  function nomeTrack(mb) { var p = String(mb.nome).split(' '); return p[0] + ' ' + p[p.length - 1].charAt(0) + '.'; }
  function mascaraCnpj(r) { return '••.•••.•••/0001-' + M.entre(r, 0, 9) + M.entre(r, 0, 9); }
  function mascaraPlaca(mb) { return mb.moto + ' · placa ••••' + String(mb.placa || '').slice(-3); }
  function podeEditar(ctx) { return !!(ctx && (ctx.admin || ctx.papel === 'escritorio')); }

  /* ---------------- entregas dos ultimos 30 dias (de MUNDO.pedidos) ---------------- */
  var cacheEnt = null, cacheDia = '';
  function entregas30() {
    var h = M.hoje();
    if (cacheEnt && cacheDia === h) return cacheEnt;
    var por = {};
    M.intervalo(M.dia(-29), h).forEach(function (d) {
      M.lojas.forEach(function (L) {
        M.pedidos(d, L.id).forEach(function (p) {
          if (!p.motoboy_id || p.cancelado || p.status !== 'entregue') return;
          var x = por[p.motoboy_id] || (por[p.motoboy_id] = { n: 0, ultima: '', onde: {} });
          x.n++;
          if (d > x.ultima) x.ultima = d;
          x.onde[L.id] = (x.onde[L.id] || 0) + 1;
        });
      });
    });
    cacheEnt = por; cacheDia = h;
    return por;
  }

  /* ---------------- base: fichas montadas a partir do MUNDO ---------------- */
  var SEM_FICHA_IDS = (function () {
    /* o ultimo motoboy extra das duas ultimas lojas ainda nao tem ficha */
    var ids = [];
    M.lojas.slice(-2).forEach(function (L) {
      var l = M.motoboys.filter(function (m) { return m.loja === L.id && !m.fixo; });
      if (l.length) ids.push(l[l.length - 1].id);
    });
    return ids;
  })();

  function docsDe(mb, forca) {
    var r = M.rng('motoboys-docs|' + mb.id);
    var o = {};
    function marca(sit, numero, validade, detalhe) {
      var d = { situacao: sit };
      if (numero) d.numero = numero;
      if (validade) d.validade = validade;
      if (detalhe) d.detalhe = detalhe;
      if (sit !== 'nao_sei') {
        d.quando = quandoTxt(r, M.entre(r, 1, 40)); d.quem = M.escolhe(r, QUEM); d.fonte = M.escolhe(r, FONTES);
        /* de onde veio combina com a situacao */
        if (sit === 'pasta') d.fonte = 'pasta do contrato';
        else if (sit === 'falta') d.fonte = 'conferência da pasta do contrato';
      }
      return d;
    }
    /* MEI */
    if (forca === 'pronto' || (forca !== 'pasta' && mb.mei && r() < 0.75)) o.mei = marca('ok', mascaraCnpj(r), null, 'Cartão do CNPJ conferido, MEI ativo');
    else if (mb.mei || forca === 'pasta') o.mei = marca('pasta', mascaraCnpj(r), null, 'Cópia na pasta do contrato, ainda não vista aqui');
    else o.mei = r() < 0.7 ? marca('falta', '', null, M.escolhe(r, ['Ainda não abriu o MEI', 'MEI baixado: pedir para regularizar'])) : marca('nao_sei');
    /* CNH (categoria A; validade conta) */
    var cat = r() < 0.5 ? 'A' : 'AB';
    if (forca || mb.cnh_ok) {
      var perto = !forca && r() < 0.2;
      var val = M.dia(perto ? M.entre(r, 8, 55) : M.entre(r, 120, 1500));
      var sc = forca === 'pasta' || (!forca && r() < 0.2) ? 'pasta' : 'ok';
      o.cnh = marca(sc, cat, val, perto ? 'CNH vence logo: pedir a renovação' : sc === 'pasta' ? 'Cópia na pasta do contrato' : 'CNH conferida');
    } else {
      var t = r();
      if (t < 0.4) o.cnh = marca('ok', cat, M.dia(-M.entre(r, 5, 120)), 'Conferida, mas a validade já passou');
      else if (t < 0.7) o.cnh = marca('atencao', 'B', M.dia(M.entre(r, 200, 900)), 'CNH só categoria B: precisa ter A');
      else o.cnh = marca('falta', '', null, 'Não entregou a cópia da CNH');
    }
    /* documento da moto */
    var sm = forca === 'pronto' ? 'ok' : forca === 'pasta' ? 'pasta' : M.pesado(r, [['ok', 62], ['pasta', 16], ['atencao', 10], ['falta', 6], ['nao_sei', 6]]);
    o.moto = marca(sm, sm === 'falta' || sm === 'nao_sei' ? '' : mascaraPlaca(mb), null,
      sm === 'atencao' ? 'Licenciamento do ano não aparece no documento' : sm === 'falta' ? 'Documento da moto não entregue' : sm === 'pasta' ? 'Cópia na pasta do contrato' : 'Documento em dia');
    /* contrato */
    if (forca === 'pronto' || (forca !== 'pasta' && mb.contrato_ok && r() < 0.6)) o.contrato = marca('ok', 'Assinado em ' + brAno(M.somaDias(mb.desde, M.entre(r, 0, 6))), null, 'Contrato de prestação de serviço assinado');
    else if (mb.contrato_ok || forca === 'pasta') o.contrato = marca('pasta', 'Assinado em ' + brAno(M.somaDias(mb.desde, M.entre(r, 0, 6))), null, 'Contrato feito, guardado na pasta');
    else o.contrato = r() < 0.75 ? marca('falta', '', null, 'Contrato ainda não assinado') : marca('nao_sei');
    return o;
  }

  function fichasBase() {
    var ent = entregas30();
    var lista = [];
    var forcados = {};
    /* garante na demonstracao: um motoboy com tudo conferido e um so com a pasta */
    M.lojas.forEach(function (L, i) {
      var c = M.motoboys.filter(function (m) { return m.loja === L.id && m.pix_ok && SEM_FICHA_IDS.indexOf(m.id) < 0; });
      if (c[0]) forcados[c[0].id] = 'pronto';
      if (i === 0 && c[1]) forcados[c[1].id] = 'pasta';
    });
    var temTeste = false;
    M.motoboys.forEach(function (mb) {
      if (SEM_FICHA_IDS.indexOf(mb.id) >= 0) return;
      var r = M.rng('motoboys-ficha|' + mb.id);
      var e = ent[mb.id] || { n: 0, ultima: '', onde: {} };
      var tipo = mb.fixo ? 'fixo' : (mb.desde > M.dia(-45) ? 'teste' : 'extra');
      if (tipo === 'teste') temTeste = true;
      var onde = Object.keys(e.onde).map(function (k) { return { loja: nomeLoja(k), n: e.onde[k] }; });
      lista.push({
        id: mb.id, nome: mb.nome, loja: mb.unidade, tipo: tipo, ativo: true,
        obs: r() < 0.25 ? M.escolhe(r, OBS) : '',
        entregas: e.n, ultima: e.ultima || null, onde: onde,
        pix: !!mb.pix_ok,
        docs: docsDe(mb, forcados[mb.id])
      });
    });
    if (!temTeste) {
      var x = lista.filter(function (f) { return f.tipo === 'extra'; })[0];
      if (x) {
        /* em teste: contrato assinado ha menos de 45 dias, antes das mudancas da ficha */
        x.tipo = 'teste';
        var c = x.docs.contrato;
        if (c && c.numero) c.numero = 'Assinado em ' + brAno(M.dia(-M.entre(M.rng('motoboys-teste|' + x.id), 41, 44)));
      }
    }

    /* garante na demonstracao um caso de CNH so categoria B (precisa ter A) */
    if (!lista.some(function (f) { return f.docs.cnh && f.docs.cnh.numero === 'B'; })) {
      var alvo = lista.filter(function (f) {
        return f.entregas && !forcados[f.id] && f.docs.cnh && f.docs.cnh.situacao === 'ok' && f.docs.cnh.validade > M.dia(90);
      });
      alvo = alvo[Math.min(2, alvo.length - 1)];
      if (alvo) { alvo.docs.cnh.situacao = 'atencao'; alvo.docs.cnh.numero = 'B'; alvo.docs.cnh.detalhe = 'CNH só categoria B: precisa ter A'; }
    }

    /* dois motoboys fixos tambem cobriram outra loja */
    var r2 = M.rng('motoboys-cobertura|' + M.hoje());
    lista.filter(function (f) { return f.tipo === 'fixo' && f.entregas; }).slice(1, 3).forEach(function (f, i) {
      var outra = M.lojas.filter(function (l) { return l.nome !== f.loja; })[i % Math.max(1, M.lojas.length - 1)];
      if (!outra) return;
      var n = M.entre(r2, 3, 9);
      f.onde.push({ loja: outra.nome, n: n });
      f.entregas += n;
      f.obs = f.obs || 'Cobre a loja ' + outra.nome + ' quando falta gente';
    });

    /* fichas sem entrega no periodo: extras parados e quem nao roda mais (gente inventada, fora do MUNDO) */
    var usados = {};
    M.motoboys.concat(M.equipe, M.freelas).forEach(function (p) { var s = String(p.nome).split(' '); usados[s[0] + '|' + s[s.length - 1]] = 1; });
    var nomes = ['Valter Rangel Couto', 'Kléber Sampaio', 'Breno Falcão Vidal', 'Igor Telles', 'Jefferson Amaral', 'Ulisses Borba', 'Yuri Galvão', 'Everton Lacerda'];
    nomes = nomes.filter(function (n) { var s = n.split(' '); return !usados[s[0] + '|' + s[s.length - 1]]; });
    var extras = [
      { tipo: 'extra', ativo: true, pix: true, obs: 'Chamado só em dia de muito movimento', docs: 'meio' },
      { tipo: 'extra', ativo: true, pix: null, obs: '', docs: 'pouco' },
      { tipo: 'fixo', ativo: false, pix: true, obs: 'Saiu para outro trabalho', docs: 'meio' },
      { tipo: 'extra', ativo: false, pix: false, obs: '', docs: 'pouco' }
    ];
    extras.forEach(function (x, i) {
      if (!nomes[i]) return;
      var L = M.lojas[i % M.lojas.length];
      var fake = { id: 901 + i, nome: nomes[i], moto: 'Honda CG 160', placa: 'XYZ0A' + (10 + i * 7), mei: x.docs === 'meio', cnh_ok: x.docs === 'meio', contrato_ok: x.docs === 'meio', desde: M.dia(-200 - i * 40) };
      var docs = docsDe(fake, null);
      if (x.docs === 'pouco') { docs.moto = { situacao: 'nao_sei' }; docs.contrato = { situacao: 'nao_sei' }; }
      lista.push({ id: fake.id, nome: fake.nome, loja: L.nome, tipo: x.tipo, ativo: x.ativo, obs: x.obs, entregas: 0, ultima: null, onde: [], pix: x.pix, docs: docs });
    });
    return lista;
  }

  function semFichaBase() {
    var ent = entregas30();
    return SEM_FICHA_IDS.map(function (id) {
      var mb = M.motoboys.filter(function (m) { return m.id === id; })[0];
      var e = ent[id] || { n: 0, ultima: '' };
      return { nome: nomeTrack(mb), loja: mb.unidade, entregas: e.n, ultima: e.ultima || M.dia(-3), _id: id };
    }).filter(function (s) { return s.entregas > 0; });
  }

  /* ---------------- leitura com as mudancas feitas na tela ---------------- */
  function montar() {
    var sem = semFichaBase();
    var fichas = fichasBase();
    MEM.novas.forEach(function (n) {
      var f = copia(n);
      var s = sem.filter(function (x) { return n.nome_trackeat && x.nome.toLowerCase() === String(n.nome_trackeat).toLowerCase(); })[0];
      f.entregas = s ? s.entregas : 0;
      f.ultima = s ? s.ultima : null;
      f.onde = s ? [{ loja: s.loja, n: s.entregas }] : [];
      if (f.pix === undefined) f.pix = null;
      f.docs = {};
      fichas.push(f);
    });
    var ligados = MEM.novas.map(function (n) { return String(n.nome_trackeat || '').toLowerCase(); });
    sem = sem.filter(function (s) { return ligados.indexOf(s.nome.toLowerCase()) < 0; });
    fichas.forEach(function (f) {
      var m = MEM.fichas[f.id];
      if (m) for (var k in m) f[k] = m[k];
      var d = MEM.docs[f.id];
      if (d) for (var it in d) f.docs[it] = copia(d[it]);
    });
    return { fichas: fichas, sem: sem };
  }

  function texto(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 400); }

  D.rpc('motoboys_consulta', function (b, ctx) {
    var acao = String(b.p_acao || 'listar');
    var dados = b.p_dados || {};
    var pode = podeEditar(ctx);

    if (acao === 'listar') {
      var m = montar();
      return {
        fichas: m.fichas,
        sem_ficha: m.sem.map(function (s) { return { nome: s.nome, loja: s.loja, entregas: s.entregas, ultima: s.ultima }; }),
        quem: ctx.nome, pode_editar: pode, gerado_em: agoraTxt()
      };
    }

    if (!pode) throw D.erro(403, 'Sem permissão para mudar as fichas', '42501');

    if (acao === 'doc') {
      var id = Number(dados.ficha_id), item = String(dados.item || '');
      if (ITENS.indexOf(item) < 0) throw D.erro(400, 'Documento desconhecido', 'P0001');
      var sit = SITS.indexOf(dados.situacao) >= 0 ? dados.situacao : 'nao_sei';
      if (!montar().fichas.some(function (f) { return f.id === id; })) throw D.erro(404, 'Ficha não encontrada', 'P0002');
      var d = { situacao: sit, quando: agoraTxt(), quem: ctx.nome, fonte: 'mudança feita nesta tela' };
      var num = texto(dados.numero, 60), val = texto(dados.validade, 10), det = texto(dados.detalhe, 400);
      if (num) d.numero = num;
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) d.validade = val;
      if (det) d.detalhe = det;
      (MEM.docs[id] || (MEM.docs[id] = {}))[item] = d;
      grava();
      return { ok: true };
    }

    if (acao === 'ficha') {
      var nome = texto(dados.nome, 120);
      if (!nome) throw D.erro(400, 'Escreva o nome', 'P0001');
      var loja = nomeLoja(dados.loja) || (M.lojas[0] && M.lojas[0].nome) || '';
      var tipo = ['fixo', 'extra', 'teste'].indexOf(dados.tipo) >= 0 ? dados.tipo : 'fixo';
      if (dados.id != null) {
        var fid = Number(dados.id);
        if (!montar().fichas.some(function (f) { return f.id === fid; })) throw D.erro(404, 'Ficha não encontrada', 'P0002');
        MEM.fichas[fid] = { nome: nome, loja: loja, tipo: tipo, obs: texto(dados.obs, 300), ativo: dados.ativo !== false };
        grava();
        return { ok: true, id: fid };
      }
      var nova = { id: ++MEM.seq, nome: nome, loja: loja, tipo: tipo, obs: texto(dados.obs, 300), ativo: true, nome_trackeat: texto(dados.nome_trackeat, 80) };
      MEM.novas.push(nova);
      grava();
      return { ok: true, id: nova.id };
    }

    throw D.erro(400, 'Ação desconhecida: ' + acao, 'P0001');
  });
})();
