/* Chegada do dia (demonstracao).
   Simula as portas: chegada_conferir (escala x chegada dos motoboys, direito a garantido e rango, quem esta
   rodando agora), chegada_marcar (hora anotada pelo balcao), chegada_direito_marcar (mudanca de garantido ou
   rango com motivo), aviso_chegando (entregas a caminho, para avisar o cliente) e aviso_chegando_marcar.
   Motoboys de MUNDO.motoboys e entregas de MUNDO.pedidos. Escala, tolerancia e combinados sao regra de
   exemplo (configuravel). O que se marca na tela fica so neste navegador (localStorage, prefixo demo_chegada_). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG;

  /* ---------------- regra de exemplo (configuravel) ---------------- */
  var REGRA = {
    tolerancia: 30,                 /* min depois da escala: perde o rango do turno e o garantido do dia */
    avisoMin: 150, avisoMax: 600,   /* janela (metros do cliente) para avisar que o motoboy esta chegando */
    portaParado: 3,                 /* min parado na porta para virar alerta vermelho */
    portaFoto: 8                    /* min na porta antes de poder tirar a foto e seguir */
  };
  var TURNOS = {
    almoco: { ini: 660, fim: 900 },    /* 11:00 as 15:00 */
    tarde:  { ini: 900, fim: 1140 },   /* 15:00 as 19:00 */
    jantar: { ini: 1080, fim: 1410 }   /* 18:00 as 23:30 */
  };
  var ORDEM = ['almoco', 'tarde', 'jantar'];
  var MOTIVOS_SIM = ['pneu furado no caminho, avisou antes', 'veio cobrir a escala de outro motoboy', 'chuva forte, a loja liberou'];
  var COMPLEMENTOS = ['apto 42, bloco B', 'casa 2, fundos', 'apto 1103', 'sobrado de portão verde', 'sala 5, 2º andar', 'apto 21, torre 1'];
  var REFERENCIAS = ['portão azul', 'ao lado da padaria', 'em frente à praça', 'condomínio com portaria 24h', 'esquina com a farmácia'];

  /* ---------------- utilitarios ---------------- */
  function lerLS(k, padrao) { try { var v = localStorage.getItem('demo_chegada_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravarLS(k, v) { try { localStorage.setItem('demo_chegada_' + k, JSON.stringify(v)); } catch (e) {} }
  function hojeOp() { return M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(); }
  /* minutos "agora" dentro do dia de operacao (madrugada passa de 1440); dia passado = fim do dia */
  function agoraOp(dia) {
    var h = hojeOp(), a = M.minutosAgora();
    if (dia < h) return 99999;
    if (dia > h) return -1;
    return h !== M.hoje() ? a + 1440 : a;
  }
  function dados(b) { return (b && b.p_dados) || {}; }
  function nomeMb(mb) { var p = String(mb.nome).split(' '); return p[0] + ' ' + p[p.length - 1]; }
  function txtTurno(t) { return M.hm(t.ini) + '–' + M.hm(t.fim); }
  function copia(o) { var x = {}; for (var k in o) if (k.charAt(0) !== '_') x[k] = o[k]; return x; }
  function lojasDe(u) { var L = u ? M.loja(u) : null; return L ? [L] : (u ? [] : M.lojas); }
  function gerente(L) {
    var g = M.equipe.filter(function (x) { return x.loja === L.id && x.cargo === 'Gerente da loja'; })[0];
    return g ? g.apelido : 'Gerência';
  }
  function atendente(L, r) {
    var mbs = M.motoboys.map(function (m) { return m.apelido; });   /* nao confundir quem avisou com um motoboy */
    var xs = M.equipe.filter(function (x) { return x.loja === L.id && (x.setor === 'Delivery' || x.cargo === 'Gerente da loja') && mbs.indexOf(x.apelido) < 0; });
    return xs.length ? M.escolhe(r, xs).apelido : 'balcão';
  }

  /* ---------------- escala do dia (regra de exemplo) ---------------- */
  /* fixo: jantar (e as vezes almoco), um fixo por loja cobre a tarde, folga 1 dia na semana;
     avulso: reforco de almoco ou jantar, ou aparece fora da escala */
  function escalaDe(mb, dia, idxFixo) {
    var r = M.rng('chegada|escala|' + dia + '|' + mb.id);
    if (mb.fixo) {
      if (M.diaSemana(dia) === mb.id % 7) return { turnos: [], fora: null };
      if (idxFixo === 1) return { turnos: ['tarde'], fora: null };
      return { turnos: r() < 0.6 ? ['almoco', 'jantar'] : ['jantar'], fora: null };
    }
    var x = r();
    if (x < 0.45) return { turnos: ['jantar'], fora: null };
    if (x < 0.65) return { turnos: ['almoco'], fora: null };
    if (x < 0.85) return { turnos: [], fora: r() < 0.5 ? 'almoco' : 'jantar' };
    return { turnos: [], fora: null };
  }
  /* hora que chegou, se o GPS pegou, chance de o balcao anotar */
  function chegadaDe(mb, dia, per, excecao) {
    var r = M.rng('chegada|' + dia + '|' + mb.id + '|' + per);
    var t = TURNOS[per], x = r(), atraso;
    var tarde = excecao && per === 'almoco' ? 0.5 : 0.13;
    var falta = x < 0.04;
    if (x < 0.04 + tarde) atraso = M.entre(r, REGRA.tolerancia + 1, REGRA.tolerancia + 28);
    else if (x < 0.19 + tarde) atraso = M.entre(r, 1, REGRA.tolerancia - 2);
    else atraso = M.entre(r, -25, 0);
    return {
      falta: falta, min: t.ini + atraso, foraMin: t.ini + M.entre(r, -10, 45),
      gps: r() < 0.92,
      fonte: M.pesado(r, [['fila do TrackEat', 75], ['GPS do TrackEat', 15], ['1ª entrega', 10]]),
      sorteAnot: r(), difAnot: M.entre(r, -2, 5), extra: M.entre(r, 0, 45)
    };
  }

  /* ---------------- linhas do dia (visao do dono, todas as lojas) ---------------- */
  function linhasDia(dia) {
    var h = hojeOp(), ag = agoraOp(dia);
    var vivo = dia === h;
    var gp = dia === M.somaDias(h, -4);            /* um dia passado de exemplo com o GPS sem sinal */
    var anot = lerLS('anot', {}), dir = lerLS('direito', {});
    var porMb = [], ent = null;
    var todas = [], semeou = false;   /* o primeiro que perdeu no dia ja vem com uma mudanca da gerencia */
    M.lojas.forEach(function (L) {
      var mbs = M.motoboys.filter(function (m) { return m.loja === L.id; });
      var fixos = mbs.filter(function (m) { return m.fixo; });
      var exc = fixos[2] ? fixos[2].id : null;   /* combinado de exemplo: fica com o rango mesmo chegando tarde */
      var daLoja = [];
      mbs.forEach(function (mb) {
        var e = escalaDe(mb, dia, fixos.indexOf(mb));
        var pers = e.turnos.map(function (p) { return { per: p, escala: true }; });
        if (e.fora) pers.push({ per: e.fora, escala: false });
        pers.sort(function (a, b) { return ORDEM.indexOf(a.per) - ORDEM.indexOf(b.per); });
        var nome = nomeMb(mb), meus = [];
        pers.forEach(function (x) {
          var t = TURNOS[x.per], c = chegadaDe(mb, dia, x.per, mb.id === exc);
          var cheg = c.falta ? null : (x.escala ? c.min : c.foraMin);
          var viu = cheg != null && cheg <= ag;
          if (!x.escala && !viu) return;          /* fora da escala so aparece depois que chegou */
          var sis = viu && c.gps && !gp;           /* o sistema viu a chegada */
          var l = {
            unidade: L.nome, entregador: nome, n_turno: 0, na_escala: x.escala,
            escala_txt: x.escala ? txtTurno(t) : null,
            limite_txt: x.escala ? M.hm(t.ini + REGRA.tolerancia) : null,
            chegou_txt: sis ? M.hm(cheg) : null, chegou_fonte: sis ? c.fonte : null,
            atraso_min: sis && x.escala ? cheg - t.ini : null,
            anotado_txt: null, direito: null, garantido_perdido: false,
            garantido_manual: null, garantido_quem: null, garantido_motivo: null,
            rango_manual: null, rango_quem: null, rango_motivo: null,
            vivo_onde: null, vivo_dist_m: null, vivo_fila: null, vivo_visto: null, vivo_rodando: false,
            _ini: t.ini, _fim: t.fim + c.extra, _viu: viu, _sis: sis
          };
          if (viu) {
            var chance = (!c.gps || gp) ? 0.95 : 0.86;
            if (vivo) chance = cheg <= ag - 3 ? chance - 0.2 : 0;
            if (c.sorteAnot < chance) l.anotado_txt = M.hm(Math.min(cheg + c.difAnot, ag));
          }
          meus.push(l);
        });
        meus.forEach(function (l, i) {
          l.n_turno = i + 1;
          var k = dia + '|' + l.unidade + '|' + l.entregador + '|' + l.n_turno;
          if (k in anot) l.anotado_txt = anot[k];
        });
        /* veredito da regra */
        meus.forEach(function (l) {
          if (!l.na_escala) l.direito = 'fora';
          else if (l._sis) l.direito = l.atraso_min > REGRA.tolerancia ? (mb.id === exc ? 'rango_excecao' : 'perdeu') : 'ok';
          else if (ag < l._ini + REGRA.tolerancia) l.direito = 'no_prazo';
          else if (l.anotado_txt || gp) l.direito = 'sem_prova';
          else l.direito = 'nao_chegou';
        });
        var perdeuDia = meus.some(function (l) { return l.direito === 'perdeu' || l.direito === 'rango_excecao'; });
        meus.forEach(function (l) { l.garantido_perdido = perdeuDia; });
        /* mudancas da equipe: garantido vale o dia, rango vale o turno */
        var kd = dia + '|' + L.nome + '|' + nome;
        var rs = M.rng('chegada|manual|' + kd), semente = null;
        var perdeuMesmo = meus.some(function (l) { return l.direito === 'perdeu'; });
        if (perdeuMesmo && (!semeou || rs() < 0.3)) { semeou = true; semente = { valor: true, quem: gerente(L), motivo: M.escolhe(rs, MOTIVOS_SIM) }; }
        else if (!perdeuDia && meus.some(function (l) { return l.direito === 'ok'; }) && rs() < 0.03)
          semente = { valor: false, quem: gerente(L), motivo: 'saiu no meio do turno sem avisar' };
        var g = ('g|' + kd) in dir ? dir['g|' + kd] : semente;
        meus.forEach(function (l) {
          if (g && (g.valor === true || g.valor === false)) { l.garantido_manual = g.valor; l.garantido_quem = g.quem; l.garantido_motivo = g.motivo; }
          var kr = 'r|' + kd + '|' + l.n_turno;
          var sr = semente && semente.valor === true && l.direito === 'perdeu' ? semente : null;
          var rr = kr in dir ? dir[kr] : sr;
          if (rr && (rr.valor === true || rr.valor === false)) { l.rango_manual = rr.valor; l.rango_quem = rr.quem; l.rango_motivo = rr.motivo; }
        });
        porMb.push({ mb: mb, meus: meus });
        daLoja = daLoja.concat(meus);
      });
      daLoja.sort(function (a, b) { return a._ini - b._ini || a.entregador.localeCompare(b.entregador, 'pt-BR'); });
      todas = todas.concat(daLoja);
    });
    /* ao vivo: aplicativo ligado, onde esta e se esta na fila (as entregas sao as mesmas do "Avisar o cliente") */
    if (vivo && !gp) {
      ent = entregasAgora(dia, ag, porMb);
      porMb.forEach(function (x) {
        var mb = x.mb, meus = x.meus;
        var chegados = meus.filter(function (l) { return l._viu; });
        if (!chegados.length) return;
        var fimMax = Math.max.apply(null, chegados.map(function (l) { return l._fim; }).concat([-1]));
        var rt = ent.rotas[mb.id], p = rt ? rt[0] : null, pf = ent.fila[mb.id];
        var rv = M.rng('chegada|vivo|' + dia + '|' + mb.id + '|' + Math.floor(ag / 10));
        var onde = null, dist = null, fila = null, rod = false;
        if (ag <= fimMax || p || pf) {
          if (p) {
            var prog = Math.max(0, Math.min(1, (ent.ag - p.min_saida) / Math.max(1, p.min_entrega - p.min_saida)));
            onde = 'na rua'; fila = 'indisponivel'; rod = true; dist = Math.max(200, Math.round(p.distancia_km * 1000 * (0.3 + 0.7 * prog) / 10) * 10);
          } else if (pf) { onde = 'no patio'; fila = 'na fila'; rod = true; dist = M.entre(rv, 5, 60); }
          else {
            var y = rv();
            if (y < 0.06) onde = null;                                   /* aplicativo desligado */
            else if (y < 0.2) { onde = 'longe'; fila = 'indisponivel'; dist = M.entre(rv, 1500, 6000); }
            else if (y < 0.6) { onde = 'no patio'; fila = 'na fila'; rod = true; dist = M.entre(rv, 5, 60); }
            else { onde = 'no patio'; fila = 'disponivel'; rod = true; dist = M.entre(rv, 5, 80); }
          }
        }
        if (onde) {
          var visto = M.hm(ag - (rv() < 0.7 ? 0 : 1));
          meus.forEach(function (l) { l.vivo_onde = onde; l.vivo_dist_m = dist; l.vivo_fila = fila; l.vivo_visto = visto; l.vivo_rodando = rod; });
        }
      });
    }
    return { linhas: todas, vivo: vivo, gp: gp, ag: ag, ent: ent };
  }

  /* ---------------- entregas na rua agora ---------------- */
  /* Cada entrega vai com um motoboy que esta trabalhando agora na mesma loja (o mesmo que a Chegada mostra
     "na rua"); fora do horario, com um motoboy que nao esta na escala do dia. Cada rota leva no maximo
     3 entregas e a primeira e a da vez. Com menos de 3 entregas na rua, a demonstracao repete o pico do
     jantar de ontem, com os horarios trazidos para o relogio de agora, para a lista nao ficar vazia. */
  function entregasAgora(dia, ag, porMb) {
    var ativos = {}, livres = {}, algum = false;
    porMb.forEach(function (x) {
      var ch = x.meus.filter(function (l) { return l._viu; });
      var fim = Math.max.apply(null, ch.map(function (l) { return l._fim; }).concat([-1]));
      var k = x.mb.loja;
      if (ch.length && ag <= fim) { (ativos[k] = ativos[k] || []).push(x.mb); algum = true; }
      else if (!x.meus.length) (livres[k] = livres[k] || []).push(x.mb);
    });
    var base = ag, diaP = dia, lista = M.pedidos(dia);
    function entrega(p) { return !p.cancelado && p.canal !== 'retirada' && p.motoboy_id; }
    function naRua(p) { return entrega(p) && p.min_saida <= base && base < p.min_entrega; }
    if (lista.filter(naRua).length < 3) { diaP = M.somaDias(dia, -1); base = 20 * 60 + 40; lista = M.pedidos(diaP); }
    function quem(p) {
      var c = (algum ? ativos[p.loja] : livres[p.loja]) || [];
      if (!c.length) return null;
      for (var i = 0; i < c.length; i++) if (c[i].id === p.motoboy_id) return c[i];
      return c[M.hash(p.id) % c.length];
    }
    function comMb(p, mb) { var o = {}; for (var k in p) o[k] = p[k]; o.motoboy_id = mb.id; o.motoboy = mb.apelido; o.motoboy_nome = mb.nome; return o; }
    var rotas = {}, fila = {}, rota = [];
    lista.filter(naRua).sort(function (a, b) { return a.min_entrega - b.min_entrega; }).forEach(function (p) {
      var mb = quem(p); if (!mb) return;
      var r = rotas[mb.id] = rotas[mb.id] || [];
      if (r.length >= 3) return;
      var o = comMb(p, mb); o.ordem = r.length; r.push(o); rota.push(o);
    });
    /* quem leva mais de uma entrega saiu uma vez so, com todas */
    Object.keys(rotas).forEach(function (k) {
      var s = Math.min.apply(null, rotas[k].map(function (p) { return p.min_saida; }));
      rotas[k].forEach(function (p) { p.min_saida = s; });
    });
    lista.forEach(function (p) {
      if (!entrega(p) || !(p.min_pronto <= base && base < p.min_saida)) return;
      var mb = quem(p); if (mb && !rotas[mb.id] && !fila[mb.id]) fila[mb.id] = comMb(p, mb);
    });
    var entregues = [];
    lista.forEach(function (p) {
      if (!entrega(p) || !(p.min_entrega <= base && p.min_entrega > base - 40)) return;
      var mb = quem(p); if (mb) entregues.push(comMb(p, mb));
    });
    return { dia: diaP, ag: base, desloca: ag - base, rota: rota, rotas: rotas, fila: fila, entregues: entregues };
  }

  /* quem nao e dono: sem a hora do sistema nem o atraso; veredito so depois de o balcao anotar */
  function paraBalcao(l) {
    var o = {}; for (var k in l) o[k] = l[k];
    o.chegou_txt = null; o.chegou_fonte = null; o.atraso_min = null;
    if (!o.anotado_txt) { o.direito = 'aguarda_balcao'; o.garantido_perdido = false; }
    return o;
  }

  D.rpc('chegada_conferir', function (b, ctx) {
    var d = dados(b), h = hojeOp();
    var dia = d.dia || h;
    var base = { dia: dia, hoje: M.hoje(), dono: !!ctx.admin, ao_vivo: false, gps_parado: false, gps_ultimo: null,
                 tolerancia: REGRA.tolerancia, agora: M.agoraISO().slice(11, 16), linhas: [],
                 placar: { anotados: 0, turnos: 0, rodando: 0, fora_escala: 0, parado: 0, sem_sinal: 0 } };
    if (dia > M.hoje()) return base;
    var r = linhasDia(dia);
    var nomes = lojasDe(d.unidade).map(function (L) { return L.nome; });
    var L = r.linhas.filter(function (l) { return nomes.indexOf(l.unidade) >= 0; });
    if (!ctx.admin) L = L.map(paraBalcao);
    var contam = L.filter(function (l) { return !l.na_escala || l._ini <= r.ag; });
    function pessoas(f) { var s = {}; L.forEach(function (l) { if (f(l)) s[l.unidade + '|' + l.entregador] = 1; }); return Object.keys(s).length; }
    base.ao_vivo = r.vivo;
    base.gps_parado = r.gp;
    base.gps_ultimo = r.gp ? M.br(M.somaDias(dia, -1)) + ' 23:58' : null;
    base.placar = {
      turnos: contam.length,
      anotados: contam.filter(function (l) { return !!l.anotado_txt; }).length,
      rodando: pessoas(function (l) { return l.vivo_rodando; }),
      fora_escala: pessoas(function (l) { return l.vivo_rodando && !l.na_escala; }),
      parado: pessoas(function (l) { return l.vivo_onde && !l.vivo_rodando; }),
      sem_sinal: pessoas(function (l) { return !l.vivo_onde && l.na_escala; })
    };
    base.linhas = L.map(copia);
    return base;
  });

  D.rpc('chegada_marcar', function (b) {
    var d = dados(b), dia = d.dia || hojeOp();
    if (dia > M.hoje()) throw D.erro(400, 'Não dá para anotar um dia que ainda não chegou', 'P0001');
    if (!d.unidade || !d.entregador) throw D.erro(400, 'Faltou dizer quem chegou', 'P0001');
    var hora = d.hora ? String(d.hora).trim() : '';
    if (hora) {
      var m = /^(\d{1,2}):(\d{2})$/.exec(hora);
      if (!m || +m[1] > 23 || +m[2] > 59) throw D.erro(400, 'Escreva a hora assim: 18:05', 'P0001');
      hora = (m[1].length < 2 ? '0' : '') + m[1] + ':' + m[2];
    } else hora = M.hm(M.minutosAgora());
    var anot = lerLS('anot', {});
    var k = dia + '|' + d.unidade + '|' + d.entregador + '|' + (+d.turno || 1);
    anot[k] = d.desfazer ? null : hora;
    gravarLS('anot', anot);
    return { ok: true, hora: anot[k] };
  });

  D.rpc('chegada_direito_marcar', function (b, ctx) {
    var d = dados(b), h = hojeOp(), dia = d.dia || h;
    if (dia !== h && dia !== M.somaDias(h, -1)) throw D.erro(400, 'Só dá para mudar hoje e ontem', 'P0001');
    if (d.campo !== 'garantido' && d.campo !== 'rango') throw D.erro(400, 'Campo desconhecido', 'P0001');
    var v = d.valor === true || d.valor === false ? d.valor : null;
    var motivo = String(d.motivo || '').trim();
    if (v !== null && motivo.length < 3) throw D.erro(400, 'Escreva o motivo (pelo menos 3 letras)', 'P0001');
    var kd = dia + '|' + d.unidade + '|' + d.entregador;
    var k = d.campo === 'garantido' ? 'g|' + kd : 'r|' + kd + '|' + (+d.turno || 1);
    var dir = lerLS('direito', {});
    dir[k] = { valor: v, quem: v === null ? null : ctx.nome, motivo: v === null ? null : motivo };
    gravarLS('direito', dir);
    return { ok: true };
  });

  /* ---------------- avisar o cliente: entregas a caminho ---------------- */
  /* as mesmas entregas que a Chegada usa para mostrar quem esta "na rua" (ver entregasAgora) */
  function aCaminho(unidade) {
    var dia = hojeOp(), r = linhasDia(dia), e = r.ent;
    var ids = lojasDe(unidade).map(function (L) { return L.id; });
    function daqui(p) { return ids.indexOf(p.loja) >= 0; }
    if (!e) return { dia: dia, ag: r.ag, desloca: 0, rota: [], entregues: [] };
    return { dia: e.dia, ag: e.ag, desloca: e.desloca, rota: e.rota.filter(daqui), entregues: e.entregues.filter(daqui) };
  }
  var MB = {}; M.motoboys.forEach(function (m) { MB[m.id] = m; });

  D.rpc('aviso_chegando', function (b, ctx) {
    var d = dados(b), x = aCaminho(d.unidade), ag = x.ag, dz = x.desloca;
    var marcados = lerLS('avisos', {});
    var marca = C.marca || 'restaurante';
    var linhas = [];
    function comum(p, r) {
      var mb = MB[p.motoboy_id];
      return {
        unidade: p.unidade, pedido: p.numero_ifood || String(p.numero), pedido_saipos: p.id,
        motoboy: mb ? nomeMb(mb) : (p.motoboy_nome || 'motoboy'),
        onde: p.endereco + ' · ' + p.bairro, saiu: M.hm(p.min_saida + dz), gps_em: M.hm(ag + dz - (r() < 0.7 ? 0 : 1)),
        complemento: r() < 0.6 ? M.escolhe(r, COMPLEMENTOS) : '', referencia: r() < 0.45 ? M.escolhe(r, REFERENCIAS) : '',
        mensagem: 'Oi! Aqui é do ' + marca + '. Seu pedido está quase aí — o entregador chega em poucos minutos. 🛵',
        mensagem_porta: 'Oi! Aqui é do ' + marca + '. O entregador chegou e está te esperando na portaria. Consegue vir receber?',
        min_na_porta: null, falta_foto_min: null
      };
    }
    x.rota.forEach(function (p) {
      var r = M.rng('aviso|' + p.id), l = comum(p, r);
      var prog = Math.max(0, Math.min(1, (ag - p.min_saida) / Math.max(1, p.min_entrega - p.min_saida)));
      var y = r(), m;
      var mk = marcados[x.dia + '|' + p.unidade + '|' + p.id];
      if (p.ordem > 0) {                       /* nao e a vez deste cliente na rota do motoboy */
        m = M.entre(r, REGRA.avisoMin, REGRA.avisoMax * 3);
        l.situacao = 'tem outra entrega antes na rota';
      } else if (y < 0.18) {
        m = M.entre(r, 10, REGRA.avisoMin - 20);
        var parado = M.entre(r, 1, 11);
        if (parado >= REGRA.portaParado) {
          l.situacao = 'NA PORTA'; l.min_na_porta = parado; l.falta_foto_min = Math.max(0, REGRA.portaFoto - parado);
        } else l.situacao = 'na porta há menos de ' + REGRA.portaParado + ' min';
      } else if (y < 0.6) {
        m = M.entre(r, REGRA.avisoMin, REGRA.avisoMax);
        l.situacao = r() < 0.15 ? 'se afastando do cliente' : 'AVISAR';
      } else {
        m = Math.max(REGRA.avisoMax + 50, Math.round(p.distancia_km * 1000 * 1.2 * (1 - prog) / 10) * 10);
        l.situacao = 'ainda longe (mais de ' + REGRA.avisoMax + ' m)';
      }
      l.metros = Math.round(m / 10) * 10;
      if (mk && mk.em) { l.situacao = 'JA AVISADO'; l.avisado_em = mk.em; l.avisado_por = mk.por; l.min_na_porta = null; }
      linhas.push(l);
    });
    /* ja entregues nos ultimos 40 min: alguns foram avisados antes */
    x.entregues.forEach(function (p) {
      var r = M.rng('aviso|feito|' + p.id), mk = marcados[x.dia + '|' + p.unidade + '|' + p.id];
      var sorte = r() < 0.12;
      if (mk && !mk.em) return;                 /* desfeito na tela */
      if (!mk && !sorte) return;
      var l = comum(p, r), L = M.loja(p.loja);
      l.situacao = 'JA AVISADO'; l.metros = 0;
      l.avisado_em = mk ? mk.em : M.hm(p.min_entrega + dz - M.entre(r, 2, 6));
      l.avisado_por = mk ? mk.por : (L ? atendente(L, r) : 'balcão');
      linhas.push(l);
    });
    return { linhas: linhas, regua: { metros_min: REGRA.avisoMin, metros_max: REGRA.avisoMax, porta_min_parado: REGRA.portaParado } };
  });

  D.rpc('aviso_chegando_marcar', function (b, ctx) {
    var d = dados(b);
    if (!d.unidade || !d.pedido) throw D.erro(400, 'Faltou dizer o pedido', 'P0001');
    /* o codigo do pedido na demonstracao leva o dia: loja-AAAAMMDD-numero */
    var m = /-(\d{4})(\d{2})(\d{2})-/.exec(String(d.pedido));
    var dia = m ? m[1] + '-' + m[2] + '-' + m[3] : aCaminho(d.unidade).dia;
    var marcados = lerLS('avisos', {});
    marcados[dia + '|' + d.unidade + '|' + d.pedido] = d.desfazer ? { em: null } : { em: M.hm(M.minutosAgora()), por: ctx.nome };
    gravarLS('avisos', marcados);
    return { ok: true };
  });
})();
