/* Pagar Motoboys (demonstracao).
   Simula as portas: pagamento_do_dia, pagamento_agora, pagamento_apontar, pagamento_motoboy_consulta,
   pagamento_dupla_consulta, pagamento_dupla_decidir, fechamento_deles_do_dia, maquininha_conferir,
   maquininha_extrato, pagamento_varrer, pagamento_sem_par, cobranca_marcar e prova_painel.
   Motoboys de MUNDO.motoboys, entregas de MUNDO.pedidos. As regras de pagamento sao exemplo.
   Marcacoes feitas na tela ficam guardadas so neste navegador (localStorage, prefixo demo_). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG;

  /* ---------------- regra de exemplo (configuravel) ---------------- */
  var REGRA = {
    hora: 20, horaFds: 25,             /* R$ por hora de escala */
    pisoAlmoco: 80, pisoJantar: 100,   /* piso do turno fora da escala */
    hAlmoco: 4, hJantar: 5,            /* horas de escala de cada turno */
    iniAlmoco: 660, iniJantar: 1080,   /* 11:00 e 18:00 */
    tolerancia: 30,                    /* minutos de atraso antes de perder o garantido */
    taxaBase: 6, taxaKm: 1.8           /* taxa da entrega para o motoboy */
  };
  var SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  /* ---------------- utilitarios ---------------- */
  function arr(v) { return Math.round(Number(v || 0) * 100) / 100; }
  function soma(l, f) { var t = 0; l.forEach(function (x) { t += Number(f(x) || 0); }); return arr(t); }
  function hojeOp() { return M.minutosAgora() < 300 ? M.dia(-1) : M.hoje(); }
  function ontem() { return M.somaDias(hojeOp(), -1); }
  function fds(dia) { var w = M.diaSemana(dia); return w === 0 || w === 6; }
  function agoraTxt() { var a = M.agoraISO(); return M.br(a) + ' ' + a.slice(11, 16); }
  function rs(n) { return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function podeVer(ctx) { return !!(ctx && (ctx.admin || ctx.papel === 'escritorio')); }
  function nomeMb(mb) { var p = String(mb.nome).split(' '); return p[0] + ' ' + p[p.length - 1]; }
  function taxaMoto(p) { return Math.round((REGRA.taxaBase + REGRA.taxaKm * Number(p.distancia_km || 0)) * 2) / 2; }
  function hex(sem, n) { var r = M.rng(sem), h = '0123456789abcdef', s = ''; for (var i = 0; i < n; i++) s += h[Math.floor(r() * 16)]; return s; }
  function chavePix(id) { /* chave aleatoria inventada, no formato de chave Pix aleatoria */
    var s = hex('pix|' + id, 32);
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20, 32);
  }
  function lerLS(k, padrao) { try { var v = localStorage.getItem('demo_pagamento_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravarLS(k, v) { try { localStorage.setItem('demo_pagamento_' + k, JSON.stringify(v)); } catch (e) {} }
  var MB = {}; M.motoboys.forEach(function (m) { MB[m.id] = m; });
  var BURGERS = M.cardapio.filter(function (c) { return c.categoria === 'Burgers' || c.categoria === 'Pratos'; });
  function lojaDe(u) { return M.loja(u) || M.lojas.filter(function (l) { return l.nome === u; })[0] || null; }
  /* quem marca na tela Chegada: o(a) gerente ficticio(a) da loja */
  function gerenteDe(L) {
    var g = (M.equipe || []).filter(function (e) { return e.loja === L.id && e.cargo === 'Gerente da loja'; })[0];
    return g ? nomeMb(g) + ' (gerência)' : 'a gerência da loja';
  }

  /* planilha de fechamento de cada loja: ontem a ultima loja ainda nao mandou; 6 dias atras uma nao deu para ler */
  function statusPlanilha(dia, lojaId) {
    var h = hojeOp(), ult = M.lojas[M.lojas.length - 1];
    if (dia >= h) return null;
    if (dia === M.somaDias(h, -1) && ult && lojaId === ult.id) return 'SEM FOTO';
    if (dia === M.somaDias(h, -6) && M.lojas.length > 1 && lojaId === M.lojas[1].id) return 'ILEGIVEL';
    return 'OK';
  }
  function planilhaLida(dia, lojaId) { return statusPlanilha(dia, lojaId) === 'OK'; }

  /* ---------------- a conta de cada motoboy no dia (sem marcacoes da tela) ---------------- */
  var CACHE = {};
  function baseDia(dia) {
    var h = hojeOp();
    var k = dia + (dia === h ? '|' + Math.floor(M.minutosAgora() / 5) : '');
    if (CACHE[k]) return CACHE[k];
    var out = { dia: dia, linhas: [], semDono: [], candidatos: [] };
    CACHE[k] = out;
    if (dia > h) return out;
    var vh = fds(dia) ? REGRA.horaFds : REGRA.hora, vivo = dia === h;
    M.lojas.forEach(function (L) {
      var peds = M.pedidos(dia, L.id).filter(function (p) { return p.canal !== 'retirada' && !p.cancelado && p.motoboy_id && p.hora_saida; });
      var por = {};
      peds.forEach(function (p) { (por[p.motoboy_id] = por[p.motoboy_id] || []).push(p); });
      M.motoboys.filter(function (mb) { return mb.loja === L.id; }).forEach(function (mb) {
        var lp = por[mb.id]; if (!lp || !lp.length) return;
        var r = M.rng('pag|' + dia + '|' + mb.id);
        var ent = lp.filter(function (p) { return p.hora_entrega; });
        var primeira = Math.min.apply(null, lp.map(function (p) { return p.min_saida; }));
        var ultima = ent.length ? Math.max.apply(null, ent.map(function (p) { return p.min_entrega; })) : null;
        var taxas = soma(lp, taxaMoto);
        var ini = primeira >= 900 ? REGRA.iniJantar : REGRA.iniAlmoco;
        var folga = primeira - 3 - ini;
        var temGps = r() < 0.9;
        var atraso = (r() < 0.14 && folga > 34) ? M.entre(r, 31, Math.min(58, folga)) : Math.min(M.entre(r, -18, 9), folga);
        var cheg = ini + atraso;
        var almoco = cheg < 900, jantar = cheg >= 900 || (ultima != null && ultima >= 1140);
        var turnos = (almoco ? 1 : 0) + (jantar ? 1 : 0);
        var semEscala = r() < 0.08, faltou = !semEscala && r() < 0.04;
        /* sem escala no dia nao ha hora combinada: nao existe atraso para cortar */
        if (semEscala && atraso > 8) { atraso = Math.min(M.entre(r, -10, 8), folga); cheg = ini + atraso; }
        var horasEsc = semEscala ? 0 : (almoco ? REGRA.hAlmoco : 0) + (jantar ? REGRA.hJantar : 0);
        var gA = semEscala ? REGRA.pisoAlmoco : Math.max(REGRA.hAlmoco * vh, REGRA.pisoAlmoco);
        var gJ = semEscala ? REGRA.pisoJantar : Math.max(REGRA.hJantar * vh, REGRA.pisoJantar);
        var gCalc = (almoco ? gA : 0) + (jantar ? gJ : 0);
        var atrasado = temGps && atraso > REGRA.tolerancia;
        var garantido = true, gFonte = 'regra', gQuem = null, gMotivo = null, rango = null;
        if (atrasado) {
          if (r() < 0.3) {
            gFonte = 'botao'; gQuem = gerenteDe(L);
            gMotivo = M.escolhe(r, ['pneu furado no caminho, avisou antes', 'veio cobrir a escala de outro motoboy', 'chuva forte, a loja liberou']);
            rango = 'com rango marcado na tela Chegada pela gerência';
          } else garantido = false;
        } else if (r() < 0.02) {
          garantido = false; gFonte = 'botao'; gQuem = gerenteDe(L); gMotivo = 'saiu no meio do turno sem avisar';
        }
        var direito = Math.max(0, turnos - (atrasado && !rango ? 1 : 0));
        var gVal = garantido ? gCalc : 0;
        var y = r(), lanches = direito;
        if (y < 0.15) lanches = direito + 1; else if (y < 0.27) lanches = Math.max(0, direito - 1);
        var item = M.escolhe(r, BURGERS);
        var semPreco = lanches > direito && r() < 0.15 ? 1 : 0;
        var cobrar = lanches > direito && !semPreco ? arr(item.preco * (lanches - direito)) : 0;
        var aj = 0, motivos = null, z = r();
        if (z < 0.04) { aj = -7.5; motivos = 'refrigerante pego na comanda'; }
        else if (z < 0.07) { aj = 15; motivos = 'acerto de uma entrega do dia anterior'; }
        var m = {
          unidade: L.nome, loja: L.id, motoboy_id: mb.id, entregador: nomeMb(mb), apelido: mb.apelido,
          combinado: M.hm(ini), chegada: M.hm(cheg), chegada_min: cheg, atraso_min: atraso, tem_gps: temGps,
          ultima_entrega: ultima != null ? M.hm(ultima) : null, ultima_min: ultima,
          horas: ultima != null ? Math.round((ultima - cheg) / 6) / 10 : null,
          turnos: turnos, turnos_furados: atrasado ? 1 : 0, entregas: lp.length, taxas: taxas,
          horas_escala: horasEsc, valor_hora: vh,
          garantido: garantido, garantido_valido: gVal, garantido_calc: gCalc,
          garantido_fonte: gFonte, garantido_quem: gQuem, garantido_motivo: gMotivo, rango_notas: rango,
          fonte_garantido: semEscala ? 'sem escala: piso do turno' : (faltou ? 'escala · faltou ao reforço das 19h da escala (não entra)' : 'escala'),
          direito_refeicoes: direito, lanches: lanches, lanche_produto: lanches > 0 ? item.nome : null, lanche_preco: item.preco,
          cobrar_refeicao: cobrar, lanche_sem_preco: semPreco, ajustes: aj, motivos: motivos,
          chave_pix: mb.pix_ok ? chavePix(mb.id) : null,
          ligado_agora: vivo && lp.some(function (p) { return p.status === 'em_rota'; }),
          no_patio_agora: vivo && lp.some(function (p) { return p.status === 'aguardando_motoboy'; })
        };
        fechaConta(m);
        var av = [];
        if (semEscala) av.push('Não estava na escala do dia: o garantido é o piso de cada turno rodado.');
        if (faltou) av.push('Estava na escala também para um reforço às 19h e não apareceu: esse turno não entra.');
        if (atrasado && !garantido) av.push('Chegou ' + atraso + ' min depois do combinado (carimbo de GPS): ficou sem o garantido de ' + rs(gCalc) + ' e sem o lanche daquele turno.');
        if (cobrar > 0) av.push('Pegou ' + lanches + ' lanche(s) e tinha direito a ' + direito + ': o extra é descontado pelo preço de cardápio.');
        if (!av.length && r() < 0.3 && gVal > taxas) av.push('Rodou ' + (turnos > 1 ? 'almoço e jantar' : (almoco ? 'o almoço' : 'o jantar')) + '. Garantido de ' + rs(gVal) + '; as ' + lp.length + ' entregas renderam ' + rs(taxas) + '.');
        m.aviso = av.join(' ') || null;
        out.linhas.push(m);
        out.candidatos.push({ unidade: L.nome, entregador: m.entregador });
      });
      var r2 = M.rng('semdono|' + dia + '|' + L.id);
      var n = (out.candidatos.some(function (c) { return c.unidade === L.nome; })) ? M.pesado(r2, [[0, 50], [1, 38], [2, 12]]) : 0;
      for (var i = 0; i < n; i++) {
        var it = M.escolhe(r2, BURGERS);
        out.semDono.push({ unidade: L.nome, numero_venda: String(M.entre(r2, 3000, 9899)), produto: it.nome, preco: it.preco, id_sale: 'V' + dia.replace(/-/g, '') + L.id + i });
      }
    });
    out.linhas.sort(function (a, b) {
      var ia = M.lojas.indexOf(lojaDe(a.loja)), ib = M.lojas.indexOf(lojaDe(b.loja));
      return ia - ib || a.entregador.localeCompare(b.entregador);
    });
    return out;
  }
  function fechaConta(m) { m.pagar = arr(Math.max(m.taxas, m.garantido_valido) - m.cobrar_refeicao + m.ajustes); return m; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  /* aplica o que foi feito na tela: lanche apontado e desconto de corrida em dobro */
  function comMods(dia) {
    var b = copia(baseDia(dia));
    var ap = lerLS('apontar', {});
    b.semDono = b.semDono.filter(function (x) {
      var a = ap[dia + '|' + x.id_sale];
      if (!a) return true;
      var m = b.linhas.filter(function (l) { return l.unidade === x.unidade && l.entregador === a.entregador; })[0];
      if (m) {
        m.lanches += 1; m.lanche_produto = m.lanche_produto || x.produto;
        if (m.lanches > m.direito_refeicoes) m.cobrar_refeicao = arr(m.cobrar_refeicao + x.preco);
        fechaConta(m);
      }
      return false;
    });
    var dec = lerLS('dupla', {});
    Object.keys(dec).forEach(function (k) {
      var d = dec[k];
      if (!d || d.dia !== dia || d.decisao !== 'nao_pagar' || !(d.desconto > 0)) return;
      var m = b.linhas.filter(function (l) { return l.unidade === d.unidade && l.entregador === d.entregador; })[0];
      if (!m) return;
      m.ajustes = arr(m.ajustes - d.desconto);
      m.motivos = (m.motivos ? m.motivos + ' · ' : '') + 'corrida em dobro: não pagar a 2ª do pedido #' + d.pedido;
      fechaConta(m);
    });
    return b;
  }

  function totais(l) {
    var t = { gente: l.length, pagar: 0, almocos: 0, sem_almoco: 0, dobrados: 0, sem_gps: 0, sem_pix: 0, cobrados: 0, cobrado_total: 0, sem_preco: 0, entregas: 0, horas: 0, rodando_agora: 0 };
    l.forEach(function (m) {
      t.pagar += Number(m.pagar || 0); t.almocos += Number(m.direito_refeicoes || 0);
      if (!m.direito_refeicoes) t.sem_almoco++;
      if (m.turnos > 1) t.dobrados++;
      if (!m.tem_gps) t.sem_gps++;
      if (!m.chave_pix) t.sem_pix++;
      if (m.cobrar_refeicao > 0) { t.cobrados++; t.cobrado_total += Number(m.cobrar_refeicao); }
      t.sem_preco += Number(m.lanche_sem_preco || 0);
      t.entregas += Number(m.entregas || 0); t.horas += Number(m.horas || 0);
      if (m.ligado_agora) t.rodando_agora++;
    });
    t.pagar = arr(t.pagar); t.cobrado_total = arr(t.cobrado_total); t.horas = Math.round(t.horas * 10) / 10;
    return t;
  }

  function montaDia(dia, ctx) {
    var b = comMods(dia), ve = podeVer(ctx);
    var linhas = b.linhas.map(function (m) {
      var o = copia(m);
      delete o.chegada_min; delete o.ultima_min; delete o.lanche_preco;
      if (!ve) o.chave_pix = null;
      if (!ve && !planilhaLida(dia, m.loja)) {
        o.escondido = true;
        ['pagar', 'taxas', 'garantido_valido', 'garantido_calc', 'cobrar_refeicao', 'ajustes'].forEach(function (k) { o[k] = null; });
      } else o.escondido = false;
      return o;
    });
    return {
      dia: dia, dia_texto: M.br(dia), dia_semana: SEM[M.diaSemana(dia)], fim_de_semana: fds(dia), agora: agoraTxt(),
      linhas: linhas, totais: totais(linhas),
      lanches_sem_dono: ve ? b.semDono.map(function (x) { return { unidade: x.unidade, numero_venda: x.numero_venda, produto: x.produto, id_sale: x.id_sale }; }) : [],
      candidatos: b.candidatos, pode_apontar: ve, ve_pix: ve, tolerancia_min: REGRA.tolerancia
    };
  }

  D.rpc('pagamento_do_dia', function (b, ctx) {
    return montaDia(b.p_dia || ontem(), ctx);
  });

  D.rpc('pagamento_agora', function (b, ctx) {
    var dia = hojeOp(), j = montaDia(dia, ctx);
    var r = M.rng('patio|' + dia + '|' + Math.floor(M.minutosAgora() / 5));
    j.no_patio = j.linhas.filter(function (m) { return m.ligado_agora || m.no_patio_agora || r() < 0.2; }).map(function (m) {
      var patio = m.no_patio_agora && !m.ligado_agora;
      return { unidade: m.unidade, entregador: m.entregador, no_patio: patio, dist_loja_m: patio ? M.entre(r, 5, 60) : M.entre(r, 400, 5200),
               na_fila: patio && r() < 0.5, disponivel: !m.ligado_agora, visto: M.hm(M.minutosAgora() - M.entre(r, 0, 4)) };
    });
    return j;
  });

  D.rpc('pagamento_apontar', function (b) {
    var d = b.p_dados || {};
    if (!d.entregador || !d.id_sale) throw D.erro(400, 'faltou dizer o motoboy', 'P0001');
    var ap = lerLS('apontar', {});
    ap[d.dia + '|' + d.id_sale] = { entregador: d.entregador, unidade: d.unidade };
    gravarLS('apontar', ap);
    return { ok: true };
  });

  D.rpc('pagamento_motoboy_consulta', function (b) {
    var ate = b.p_ate || ontem(), de = b.p_de || M.somaDias(ate, -6);
    var dias = M.intervalo(de, ate).slice(0, 62), l = [];
    dias.forEach(function (d) { l = l.concat(comMods(d).linhas); });
    var gente = {};
    l.forEach(function (m) { gente[m.motoboy_id] = 1; });
    return {
      de: M.br(de), ate: M.br(ate), de_iso: de, ate_iso: ate, agora: agoraTxt(),
      resumo: {
        total: soma(l, function (m) { return m.pagar; }),
        total_antigo: soma(l, function (m) { return (m.horas_escala || 0) * REGRA.hora - m.cobrar_refeicao; }),
        pagamentos: l.length, motoboys: Object.keys(gente).length,
        sem_hora: l.filter(function (m) { return m.horas == null; }).length,
        sem_pix: l.filter(function (m) { return !m.chave_pix; }).length
      }
    };
  });

  /* ---------------- planilha de fechamento da loja ---------------- */
  function delesDe(dia, b) {
    var r = M.rng('deles|' + dia + '|' + b.motoboy_id);
    var kind = M.pesado(r, [['igual', 54], ['diaria', 14], ['pendente', 8], ['menos', 7], ['reprovada', 5], ['lanche', 5], ['ajuste', 3], ['desconto', 4]]);
    var gWins = b.garantido_valido >= b.taxas;
    var fee = arr(b.taxas / Math.max(1, b.entregas));
    if (kind === 'lanche' && !(b.cobrar_refeicao > 0)) kind = 'igual';
    if (kind === 'ajuste' && !b.ajustes) kind = 'igual';
    if ((kind === 'diaria' || kind === 'menos') && !gWins) kind = 'igual';
    var o = { kind: kind, valor: b.pagar, entregas: b.entregas, taxas: b.taxas, pendentes: 0, reprovadas: 0,
              c_entregas: 0, c_garantido: 0, c_lanche: 0, c_ajustes: 0, c_desconto: 0,
              nome: r() < 0.15 ? b.apelido : b.entregador };
    if (kind === 'diaria') { var mais = fds(dia) ? 25 : 20; o.valor = arr(b.pagar + mais); o.c_garantido = -mais; }
    else if (kind === 'menos') { o.valor = arr(b.pagar - 20); o.c_garantido = 20; }
    else if (kind === 'pendente') { o.pendentes = 1; o.entregas = b.entregas - 1; o.taxas = arr(b.taxas - fee); if (!gWins) { o.valor = arr(b.pagar - Math.min(fee, b.taxas - b.garantido_valido)); o.c_entregas = arr(b.pagar - o.valor); } }
    else if (kind === 'reprovada') { o.reprovadas = 1; o.entregas = b.entregas + 1; o.taxas = arr(b.taxas + fee); if (!gWins) { o.valor = arr(b.pagar + fee); o.c_entregas = -fee; } }
    else if (kind === 'lanche') { o.valor = arr(b.pagar + b.cobrar_refeicao); o.c_lanche = b.cobrar_refeicao; }
    else if (kind === 'ajuste') { o.valor = arr(b.pagar - b.ajustes); o.c_ajustes = b.ajustes; }
    else if (kind === 'desconto') { o.valor = arr(b.pagar - 7.5); o.c_desconto = 7.5; }
    return o;
  }

  var MAQ_TXT = { NAO_COBROU: 'não cobrou na porta', SEM_COBRANCA_LONGE: 'sem cobrança e GPS longe', SEM_COBRANCA_SEM_GPS: 'sem cobrança e sem GPS' };

  D.rpc('fechamento_deles_do_dia', function (b) {
    var dia = b.p_dia || ontem();
    var lidas = M.lojas.filter(function (L) { return planilhaLida(dia, L.id); });
    if (!lidas.length) return { tem: false, linhas: [], totais: {}, maquininha: {} };
    var base = baseDia(dia), mods = comMods(dia), vh = fds(dia) ? REGRA.horaFds : REGRA.hora;
    var linhas = [];
    mods.linhas.forEach(function (m) {
      if (!planilhaLida(dia, m.loja)) return;
      var pura = base.linhas.filter(function (x) { return x.motoboy_id === m.motoboy_id; })[0] || m;
      var d = delesDe(dia, pura), r = M.rng('exato|' + dia + '|' + m.motoboy_id);
      var exata = m.tem_gps && r() < 0.65, amais = exata ? Math.round(M.entre(r, 0, 140) / 10 * 10) / 10 : 0;
      var seg = function () { var s = M.entre(r, 0, 59); return ':' + (s < 10 ? '0' : '') + s; };
      linhas.push({
        unidade: m.unidade, motoboy: m.entregador, nome_deles: d.nome, onde: 'nos dois',
        deles_pagar: d.valor, nosso_pagar: m.pagar, dif: arr(m.pagar - d.valor),
        nosso_horas: m.horas, deles_entregas: d.entregas, nosso_entregas: m.entregas,
        pendentes: d.pendentes, reprovadas: d.reprovadas, taxas: m.taxas, lanche_cobrado: m.cobrar_refeicao,
        refeicoes: m.direito_refeicoes, prato: m.lanche_produto, atraso_min: m.atraso_min,
        combinado: m.combinado, chegada: m.chegada, ultima: m.ultima_entrega, tem_gps: m.tem_gps,
        chegada_exata: exata ? M.hm(m.chegada_min - amais) + seg() : null,
        ultima_exata: m.tem_gps && m.ultima_min != null ? M.hm(m.ultima_min) + seg() : null,
        hora_exata: exata ? M.hm(m.chegada_min - amais) + seg() : null, fonte_exata: exata ? 'aplicativo do TrackEat' : null,
        minutos_a_mais: amais, garantido: m.garantido_valido, garantido_calc: m.garantido_calc
      });
    });
    var r = M.rng('extras|' + dia);
    if (r() < 0.35 && M.freelas.length) {
      var f = M.escolhe(r, M.freelas), L = M.escolhe(r, lidas);
      linhas.push({ unidade: L.nome, motoboy: f.nome.split(' ')[0] + ' ' + f.nome.split(' ').pop(), nome_deles: f.apelido, onde: 'só na planilha deles',
        deles_pagar: 120, nosso_pagar: null, dif: -120, nosso_horas: null, deles_entregas: 9, nosso_entregas: null, pendentes: 0, reprovadas: 0,
        taxas: null, lanche_cobrado: 0, refeicoes: null, atraso_min: null, chegada: null, ultima: null, tem_gps: null, minutos_a_mais: 0 });
    }
    if (r() < 0.25 && linhas.length > 2) {
      var x = linhas[M.entre(r, 0, linhas.length - 2)];
      x.onde = 'só no sistema'; x.deles_pagar = null; x.deles_entregas = null; x.nome_deles = null; x.dif = x.nosso_pagar;
    }
    var maq = {};
    maqDia(dia).forEach(function (l) {
      if (!MAQ_TXT[l.situacao]) return;
      var k = String(l.unidade) + '|' + String(l.motoboy || '').trim().toLowerCase();
      maq[k] = { texto: (maq[k] ? maq[k].texto + ' · ' : '') + 'pedido #' + l.pedido + ': ' + MAQ_TXT[l.situacao] };
    });
    var t = {
      deles: soma(linhas, function (x) { return x.deles_pagar; }), nosso: soma(linhas, function (x) { return x.nosso_pagar; }),
      deles_entregas: soma(linhas, function (x) { return x.deles_entregas; }), nosso_entregas: soma(linhas, function (x) { return x.nosso_entregas; }),
      minutos_a_mais: Math.round(soma(linhas, function (x) { return x.minutos_a_mais; })),
      pendentes: soma(linhas, function (x) { return x.pendentes; }), reprovadas: soma(linhas, function (x) { return x.reprovadas; }),
      refeicoes: soma(linhas, function (x) { return x.refeicoes; })
    };
    t.dif = arr(t.nosso - t.deles);
    return { tem: true, dia: dia, linhas: linhas, totais: t, valor_hora: vh, maquininha: maq,
             com_hora_exata: linhas.filter(function (x) { return x.hora_exata; }).length };
  });

  /* ---------------- corrida em dobro ---------------- */
  function outroMb(L, mb, r) {
    var l = M.motoboys.filter(function (x) { return x.loja === L.id && x.id !== mb.id; });
    return l.length ? M.escolhe(r, l) : mb;
  }
  var PARES = {};
  function paresDia(dia, L) {
    var k = dia + '|' + L.id;
    if (PARES[k]) return PARES[k];
    var r = M.rng('dup|' + dia + '|' + L.id), out = [];
    PARES[k] = out;
    var peds = M.pedidos(dia, L.id).filter(function (p) { return p.status === 'entregue' && p.canal !== 'retirada' && p.motoboy_id; });
    if (peds.length < 12) return out;
    var n = M.pesado(r, [[0, 38], [1, 44], [2, 18]]), h = hojeOp();
    for (var i = 0; i < n; i++) {
      var idx = M.entre(r, 0, peds.length - 7), p1 = peds[idx];
      var mesmo = r() < 0.35, p2 = mesmo ? p1 : peds[idx + M.entre(r, 1, 6)];
      if (!mesmo && p2.min_saida - p1.min_saida > 170) { mesmo = true; p2 = p1; }
      var mb1 = MB[p1.motoboy_id], mb2 = mesmo ? (r() < 0.5 ? mb1 : outroMb(L, mb1, r)) : MB[p2.motoboy_id];
      var s1 = p1.min_saida, s2 = mesmo ? p1.min_saida + M.entre(r, 18, 95) : Math.max(p2.min_saida, s1 + 4);
      var entre = s2 - s1, x = r(), ver, vis, menor;
      if (x < 0.36) { ver = 'PAGAR UMA SÓ — o GPS mostra uma ida só ao endereço'; vis = 1; menor = M.entre(r, 8, 60); }
      else if (x < 0.56) { ver = 'CONFERIR — o GPS não achou o motoboy perto do endereço na 2ª corrida'; vis = 0; menor = null; }
      else if (x < 0.84 || mesmo) { ver = 'PAGAR AS DUAS — o GPS mostra duas idas ao endereço'; vis = 2; menor = M.entre(r, 5, 40); }
      else { ver = 'PAGAR AS DUAS — pedidos diferentes, com ' + entre + ' min de folga'; vis = 2; menor = M.entre(r, 5, 40); }
      var fonte = r() < 0.8 ? 'TrackEat' : 'App próprio';
      var recente = dia >= M.somaDias(h, -2);
      var st2 = fonte !== 'TrackEat' ? null : (recente ? (r() < 0.7 ? 'Pendente' : 'Aprovado') : (r() < 0.75 ? 'Aprovado' : 'Pendente'));
      var quem = vis === 0 ? null : (vis === 1 ? 'só ' + nomeMb(mb1) + ' passou lá' : (mb1 === mb2 ? nomeMb(mb1) + ' foi duas vezes' : nomeMb(mb1) + ' e ' + nomeMb(mb2) + ' passaram lá'));
      var par = {
        unidade: L.nome, loja: L.id, dia_operacional: dia,
        porta_txt: p1.endereco + ' · ' + p1.bairro, cliente_1: p1.cliente, cliente_2: mesmo || r() < 0.5 ? p1.cliente : p2.cliente,
        pedido_1: String(p1.numero), pedido_2: String(p2.numero), mesmo_pedido: mesmo,
        saiu_1: M.ts(dia, s1), saiu_2: M.ts(dia, s2), minutos_entre: entre,
        entregador_1: nomeMb(mb1), entregador_2: nomeMb(mb2),
        valor_1: taxaMoto(p1), valor_2: taxaMoto(p2),
        fonte_1: fonte, fonte_2: fonte, status_1: fonte === 'TrackEat' ? 'Aprovado' : null, status_2: st2,
        visitas: vis, menor_m: menor, quem_chegou: quem, veredito: ver,
        decisao: null, valor_desconto: null, decidido_por: null, decidido_em: null, decisao_obs: null
      };
      /* decisoes antigas, ja tomadas */
      if (ver.indexOf('PAGAR AS DUAS') !== 0 && dia < M.somaDias(h, -4) && r() < 0.5) {
        if (ver.indexOf('PAGAR UMA') === 0 && r() < 0.55) {
          par.decisao = 'nao_pagar'; par.decidido_por = 'conferência automática do Pix'; par.decisao_obs = 'o Pix do dia saiu sem a 2ª corrida';
        } else if (fonte === 'TrackEat' && r() < 0.5) {
          par.decisao = 'reprovado_track'; par.decidido_por = 'Escritório (demonstração)';
        } else {
          par.decisao = 'pagar_duas'; par.decidido_por = 'Escritório (demonstração)'; par.decisao_obs = 'cliente pediu de novo, confirmado na loja';
        }
        par.decidido_em = M.ts(M.somaDias(dia, 1), M.entre(r, 600, 1080));
      }
      out.push(par);
    }
    return out;
  }
  function chaveDup(unidade, dia, pedido2, saiu2) { return [unidade, dia, pedido2, saiu2 || ''].join('|'); }
  function descontoPara(dia, unidade, entregador, valor) {
    var m = baseDia(dia).linhas.filter(function (l) { return l.unidade === unidade && l.entregador === entregador; })[0];
    if (!m || !m.garantido) return m ? arr(Math.min(valor, m.taxas)) : 0;
    if (m.garantido_valido >= m.taxas) return 0;
    if (m.taxas - valor >= m.garantido_valido) return arr(valor);
    return arr(m.taxas - m.garantido_valido);
  }

  function reprovadasDia(dia, L) {
    var r = M.rng('reprov|' + dia + '|' + L.id);
    if (r() > 0.4) return [];
    var peds = M.pedidos(dia, L.id).filter(function (p) { return p.status === 'entregue' && p.canal !== 'retirada' && p.motoboy_id; });
    if (peds.length < 10) return [];
    var i = M.entre(r, 0, peds.length - 4), p = peds[i], par = peds[i + M.entre(r, 1, 3)];
    var mb = MB[p.motoboy_id], nome = nomeMb(mb), valor = taxaMoto(p);
    var base = baseDia(dia).linhas.filter(function (l) { return l.motoboy_id === mb.id; })[0];
    var pixSaiu = dia < ontem() || r() < 0.5;
    var repetida = r() < 0.6, cobriu = base && base.garantido_valido >= base.taxas;
    var ver;
    if (!pixSaiu) ver = r() < 0.5 ? 'Pix ainda não saiu' : 'não sei — o Pix do dia ainda não foi conferido';
    else if (repetida) ver = r() < 0.8 ? 'certa — era repetida e não entrou no Pix' : 'repetida, mas foi paga no Pix';
    else ver = cobriu ? 'reprovada errada: não era repetida, mas o garantido cobriu o dia' : 'reprovada errada: não era repetida — o motoboy ficou sem a corrida';
    var parMb = MB[par.motoboy_id];
    return [{
      unidade: L.nome, dia: dia, pedido: String(p.numero), saiu: p.ts_pedido ? M.ts(dia, p.min_saida) : null,
      entregador: nome, valor: valor, endereco: p.endereco + ' · ' + p.bairro,
      motivo: M.escolhe(r, ['Entrega duplicada', 'Mesmo endereço em sequência', 'Pedido já pago em outra corrida']),
      repetida: repetida, par_pedido: repetida || r() < 0.5 ? String(par.numero) : null,
      par_entregador: parMb ? nomeMb(parMb) : null,
      pago: pixSaiu && base ? base.pagar : null,
      resultado: pixSaiu && base ? 'Pix do dia ' + M.br(dia) + ' para ' + nome : '',
      veredito: ver
    }];
  }

  D.rpc('pagamento_dupla_consulta', function (b) {
    var d = b.p_dados || {}, h = hojeOp();
    var inicio = M.somaDias(h, -30);
    var ate = d.ate && d.ate < h ? d.ate : h, de = d.de || M.somaDias(h, -20);
    if (de < inicio) de = inicio;
    var dec = lerLS('dupla', {}), linhas = [], reprov = [];
    M.intervalo(de, ate).forEach(function (dia) {
      M.lojas.forEach(function (L) {
        paresDia(dia, L).forEach(function (p) {
          var o = copia(p), s = dec[chaveDup(o.unidade, dia, o.pedido_2, o.saiu_2)];
          if (s) {
            if (s.desfeito) { o.decisao = null; o.decidido_por = null; o.decidido_em = null; o.decisao_obs = null; o.valor_desconto = null; }
            else { o.decisao = s.decisao; o.decidido_por = s.por; o.decidido_em = s.em; o.decisao_obs = null; o.valor_desconto = s.decisao === 'nao_pagar' ? s.desconto : null; }
          }
          if (o.decisao === 'reprovado_track') o.status_2 = 'Reprovado';
          delete o.loja;
          linhas.push(o);
        });
        reprov = reprov.concat(reprovadasDia(dia, L));
      });
    });
    linhas.sort(function (a, b2) { return a.dia_operacional < b2.dia_operacional ? 1 : a.dia_operacional > b2.dia_operacional ? -1 : (a.saiu_2 < b2.saiu_2 ? 1 : -1); });
    reprov.sort(function (a, b2) { return a.dia < b2.dia ? 1 : -1; });
    var R = { ainda_da: 0, valor_ainda_em_jogo: 0, pendente_no_track: 0, sem_status: 0, aprovado_no_track: 0, pagar_duas: 0, pagar_duas_gps: 0, pagar_duas_folga: 0, decididos: 0, nao_pagar: 0 };
    linhas.forEach(function (l) {
      var v = l.veredito;
      if (v.indexOf('PAGAR AS DUAS') === 0) { R.pagar_duas++; if (v.indexOf('GPS') >= 0) R.pagar_duas_gps++; else R.pagar_duas_folga++; return; }
      if (l.decisao) { R.decididos++; if (l.decisao === 'nao_pagar') R.nao_pagar++; return; }
      if (l.fonte_2 !== 'TrackEat') { R.sem_status++; R.ainda_da++; R.valor_ainda_em_jogo += l.valor_2; }
      else if (l.status_2 === 'Pendente') { R.pendente_no_track++; R.ainda_da++; R.valor_ainda_em_jogo += l.valor_2; }
      else if (v.indexOf('PAGAR UMA') === 0) R.aprovado_no_track++;
    });
    R.valor_ainda_em_jogo = arr(R.valor_ainda_em_jogo);
    var a = M.agoraISO(), min = M.minutosAgora();
    return { resumo: R, linhas: linhas, reprovadas: reprov, inicio: inicio,
             cache_em: M.ts(a.slice(0, 10), min - (min % 60) + 2), repetida_janela_min: 40, repetida_raio_m: 60 };
  });

  D.rpc('pagamento_dupla_decidir', function (b, ctx) {
    var d = b.p_dados || {}, dec = lerLS('dupla', {});
    var k = chaveDup(d.unidade, d.dia, d.pedido_2, d.saiu_2);
    if (d.decisao === 'desfazer') { dec[k] = { desfeito: true }; gravarLS('dupla', dec); return { ok: true, msg: 'Decisão desfeita.' }; }
    var L = lojaDe(d.unidade), par = L ? paresDia(d.dia, L).filter(function (p) { return p.pedido_2 === String(d.pedido_2) && p.saiu_2 === d.saiu_2; })[0] : null;
    var desconto = 0;
    if (d.decisao === 'nao_pagar' && par) desconto = descontoPara(d.dia, d.unidade, par.entregador_2, par.valor_2);
    dec[k] = { decisao: d.decisao, por: ctx.nome, em: M.agoraISO(), dia: d.dia, unidade: d.unidade, pedido: d.pedido_2,
               entregador: par ? par.entregador_2 : null, desconto: desconto };
    gravarLS('dupla', dec);
    var msg = d.decisao === 'nao_pagar' ? (desconto > 0 ? 'Anotado.' : 'Anotado, sem desconto: o garantido do dia já cobria esta corrida.') :(d.decisao === 'pagar_duas' ? 'anotado: as duas corridas entram no pagamento.' : 'anotado como reprovada no TrackEat.');
    return { ok: true, msg: msg, desconto: desconto, dia_ja_pago: d.dia <= M.somaDias(hojeOp(), -2) };
  });

  /* ---------------- maquininha ---------------- */
  var MARCAS = [[C.marca, 20], ['Modelo Smash', 12], ['Modelo Fit', 8]];
  var MAQ = {};
  function maqDia(dia) {
    var h = hojeOp(), on = M.somaDias(h, -1);
    var k = dia + (dia >= on ? '|' + Math.floor(M.minutosAgora() / 5) : '');
    if (MAQ[k]) return MAQ[k];
    var out = [];
    MAQ[k] = out;
    if (dia > h) return out;
    var antesDas9 = M.minutosAgora() < 540;
    M.pedidos(dia).forEach(function (p) {
      if (p.canal === 'retirada' || p.cancelado || p.pagamento === 'online' || p.status !== 'entregue' || !p.motoboy_id) return;
      var r = M.rng('maq|' + p.id), sit, forma;
      if (p.pagamento === 'cartao_na_entrega') {
        forma = M.pesado(r, [['Crédito', 50], ['Débito', 38], ['Vale-refeição', 12]]);
        sit = M.pesado(r, [['COBRADO', 72], ['OUTRO_METODO', 4], ['COBROU_A_MAIS', 4], ['SO_A_COMIDA', 5], ['NAO_COBROU', 5], ['SEM_COBRANCA_LONGE', 4], ['SEM_COBRANCA_SEM_GPS', 6]]);
        if (sit === 'SO_A_COMIDA' && !(p.taxa_entrega > 0)) sit = 'COBRADO';
      } else if (p.pagamento === 'pix') {
        forma = 'Pix'; sit = M.pesado(r, [['PIX_ACHADO', 78], ['PIX_SEM_RASTRO', 16], ['OUTRO_METODO', 6]]);
      } else { forma = 'Dinheiro'; sit = 'DINHEIRO'; }
      var L = lojaDe(p.loja), mb = MB[p.motoboy_id];
      var marca = M.pesado(r, MARCAS.concat([[C.marca + ' ' + L.nome, 60]]));
      out.push({ _p: p, _r: r, unidade: p.unidade, marca: marca, pedido: String(p.numero), curto: p.numero_ifood || null,
                 cliente: p.cliente, bairro: p.bairro, motoboy: nomeMb(mb), entregue_em: p.hora_entrega, pedido_em: p.hora_pedido,
                 forma: forma, promessa: r() < 0.2, na_porta: p.total, taxa: p.taxa_entrega, situacao: sit,
                 chegou_cliente: r() < 0.4 ? M.hm(p.min_entrega - M.entre(r, 1, 4)) : null });
    });
    /* garante exemplos das situacoes nos dias fechados */
    if (dia < h && out.length > 15) {
      var rf = M.rng('maqforca|' + dia);
      var cobr = function () { return out.filter(function (l) { return l.situacao === 'COBRADO'; }); };
      var tem = function (s) { return out.some(function (l) { return l.situacao === s; }); };
      ['NAO_COBROU', 'SEM_COBRANCA_LONGE', 'SEM_COBRANCA_SEM_GPS', 'SO_A_COMIDA', 'COBROU_A_MAIS', 'OUTRO_METODO', 'PIX_ACHADO', 'PIX_SEM_RASTRO', 'DINHEIRO'].forEach(function (s) {
        if (tem(s)) return;
        var c = cobr().filter(function (l) { return s !== 'SO_A_COMIDA' || l.taxa > 0; });
        if (c.length < 4) return;
        var l = M.escolhe(rf, c);
        l.situacao = s;
        if (s === 'PIX_ACHADO' || s === 'PIX_SEM_RASTRO') l.forma = 'Pix';
        if (s === 'DINHEIRO') l.forma = 'Dinheiro';
      });
    }
    /* Rede: chega no dia seguinte as 9h e cobre ate 22h30 */
    var COM_REDE = { COBRADO: 1, COBROU_A_MAIS: 1, SO_A_COMIDA: 1, NAO_COBROU: 1, SEM_COBRANCA_LONGE: 1, SEM_COBRANCA_SEM_GPS: 1 };
    var pend = function (l) { return dia === h || (dia === on && (antesDas9 || l._p.min_entrega >= 1350)); };
    out.forEach(function (l) {
      if ((COM_REDE[l.situacao] || (l.situacao === 'OUTRO_METODO' && l.forma !== 'Pix')) && pend(l)) l.situacao = 'AGUARDANDO_REDE';
    });
    if (dia === on && !antesDas9 && !out.some(function (l) { return l.situacao === 'AGUARDANDO_REDE'; })) {
      var tarde = out.filter(function (l) { return l.situacao === 'COBRADO'; }).sort(function (a, b) { return b._p.min_entrega - a._p.min_entrega; })[0];
      if (tarde) tarde.situacao = 'AGUARDANDO_REDE';
    }
    if (dia < on) {
      var sr = out.filter(function (l) { return l.situacao === 'PIX_SEM_RASTRO'; });
      if (sr.length > 1) { sr[0].situacao = 'RESOLVIDO_PIX'; sr[0].conferido = { resultado: 'pix', quem: 'Escritório (demonstração)', quando: M.br(M.somaDias(dia, 1)) + ' 10:20' }; }
    }
    function modo(f) { return f === 'Débito' ? 'DEBIT' : (f === 'Vale-refeição' ? 'VAN' : 'CREDIT'); }
    out.forEach(function (l) {
      var p = l._p, r = l._r, s = l.situacao, ent = p.min_entrega;
      l.rede = null; l.gps = { dist_m: M.entre(r, 4, 110), raio: 150, hora: p.hora_entrega }; l.pix = null;
      if (r() < 0.05) l.gps = { sem_endereco: true };
      var dm = r() < 0.06 ? M.entre(r, 18, 45) : M.entre(r, 0, 7);
      var rede = function (mod, valor) { return { hora: M.hm(ent + dm), modalidade: mod, valor: arr(valor), dif_min: dm }; };
      if (s === 'COBRADO') l.rede = rede(modo(l.forma), p.total);
      else if (s === 'OUTRO_METODO') l.rede = l.forma === 'Pix' ? rede('CREDIT', p.total) : rede(l.forma === 'Crédito' ? 'DEBIT' : 'CREDIT', p.total);
      else if (s === 'COBROU_A_MAIS') l.rede = rede(modo(l.forma), p.total + M.escolhe(r, [10, 15, 20]));
      else if (s === 'SO_A_COMIDA') l.rede = rede(modo(l.forma), p.subtotal);
      else if (s === 'SEM_COBRANCA_LONGE') l.gps = { dist_m: M.entre(r, 600, 2600), raio: 150, hora: p.hora_entrega };
      else if (s === 'SEM_COBRANCA_SEM_GPS') l.gps = null;
      else if (s === 'NAO_COBROU') l.gps = { dist_m: M.entre(r, 5, 90), raio: 150, hora: p.hora_entrega };
      else if (s === 'PIX_ACHADO') l.pix = { data: M.br(dia) + ' ' + M.hm(ent + M.entre(r, -2, 5)), desc: 'Pix recebido · ' + p.cliente };
      if (!l.conferido && s === 'NAO_COBROU' && dia < on && r() < 0.5) l.conferido = { resultado: 'em processo', quem: 'Escritório (demonstração)', quando: M.br(M.somaDias(dia, 1)) + ' 11:05' };
    });
    out.sort(function (a, b) { return a._p.min_entrega - b._p.min_entrega; });
    return out;
  }
  function maqLinhas(dia, unidade, ctx) {
    var marcas = lerLS('marcas', {}), L = unidade ? lojaDe(unidade) : null, dono = !!ctx.admin;
    return maqDia(dia).filter(function (l) { return !L || l.unidade === L.nome; }).map(function (l) {
      var o = {}; for (var k in l) if (k.charAt(0) !== '_') o[k] = l[k];
      o.rede = l.rede ? copia(l.rede) : null; o.gps = l.gps ? copia(l.gps) : null; o.pix = l.pix ? copia(l.pix) : null;
      o.conferido = l.conferido ? copia(l.conferido) : null;
      var mk = marcas[l.unidade + '|' + dia + '|' + l.pedido];
      if (mk) {
        o.conferido = mk.resultado ? { resultado: mk.resultado, quem: mk.quem, quando: mk.quando } : null;
        if (mk.resultado === 'pix' && /^(PIX_SEM_RASTRO|NAO_COBROU|SEM_COBRANCA)/.test(l.situacao)) o.situacao = 'RESOLVIDO_PIX';
      }
      if (!dono) { o.na_porta = null; if (o.rede) o.rede.valor = null; if (o.pix) o.pix.desc = null; }
      return o;
    });
  }
  function redeAte(dia) {
    var h = hojeOp(), on = M.somaDias(h, -1);
    if (dia >= on) return M.minutosAgora() < 540 && dia === on ? M.br(M.somaDias(on, -1)) + ' 22:30' : M.br(on) + ' 22:30';
    return M.br(dia) + ' 23:59';
  }

  D.rpc('maquininha_conferir', function (b, ctx) {
    var dia = b.p_dia || ontem(), L = maqLinhas(dia, b.p_unidade, ctx), R = {};
    L.forEach(function (l) { R[l.situacao] = (R[l.situacao] || 0) + 1; });
    return { dia: dia, dia_texto: M.br(dia), linhas: L, resumo: R, dono: !!ctx.admin, rede_ate: redeAte(dia), agora: agoraTxt(), janela_min: 240, raio_m: 150 };
  });

  D.rpc('cobranca_marcar', function (b, ctx) {
    var d = b.p_dados || {}, marcas = lerLS('marcas', {});
    marcas[d.unidade + '|' + d.dia + '|' + d.pedido] = { resultado: d.resultado || '', quem: ctx.nome, quando: agoraTxt() };
    gravarLS('marcas', marcas);
    return { ok: true };
  });

  var BAND = { CREDIT: [['Visa', 'crédito'], ['Mastercard', 'crédito'], ['Elo', 'crédito']], DEBIT: [['Visa', 'débito'], ['Mastercard', 'débito'], ['Elo', 'débito']], VAN: [['Alelo', 'vale'], ['Ticket', 'vale'], ['VR', 'vale']] };
  function passadas(dia) {
    var rows = [];
    maqDia(dia).forEach(function (l) {
      if (!l.rede) return;
      var b = M.escolhe(l._r, BAND[l.rede.modalidade] || BAND.CREDIT), L = lojaDe(l.unidade);
      rows.push({ min: M.minDe(l.rede.hora) < 300 ? M.minDe(l.rede.hora) + 1440 : M.minDe(l.rede.hora), hora: l.rede.hora, unidade: l.unidade, valor: l.rede.valor,
                  bandeira: b[0], tipo: b[1], maquina: 'POS ' + L.curto + '-0' + (1 + (+l.pedido % 2)), papel: 'rota', pedido: l.pedido });
    });
    if (dia > hojeOp() || (dia === hojeOp())) return rows;
    /* a Rede manda o dia anterior as 9h e cobre ate 22h30: nada de passada depois do que ja foi lido */
    var ontemOp = M.somaDias(hojeOp(), -1);
    if (dia === ontemOp && M.minutosAgora() < 540) return rows;
    var lim = dia === ontemOp ? 1350 : 1439;
    M.lojas.forEach(function (L) {
      var r = M.rng('pass|' + dia + '|' + L.id), i, m, b;
      var nova = function (papel, maq, pedido, de, ate) {
        m = M.entre(r, de, Math.min(ate, lim)); var mod = M.pesado(r, [['CREDIT', 50], ['DEBIT', 38], ['VAN', 12]]); b = M.escolhe(r, BAND[mod]);
        rows.push({ min: m, hora: M.hm(m), unidade: L.nome, valor: arr(M.entre(r, 2400, 14000) / 100), bandeira: b[0], tipo: b[1], maquina: maq, papel: papel, pedido: pedido });
      };
      var nr = M.entre(r, 1, 3);
      for (i = 0; i < nr; i++) nova('rota', 'POS ' + L.curto + '-0' + M.entre(r, 1, 2), null, 690, 1380);
      if (r() < 0.5) nova('indefinida', 'POS ' + L.curto + '-05', r() < 0.5 ? String(M.entre(r, 1001, 1100)) : null, 700, 1350);
      var nb = M.entre(r, 8, 14);
      for (i = 0; i < nb; i++) nova('balcao', 'POS ' + L.curto + '-0' + M.entre(r, 3, 4), null, 690, 1400);
      if (r() < 0.4) nova('balcao', 'POS ' + L.curto + '-03', String(M.entre(r, 1001, 1100)), 700, 1350);
    });
    return rows;
  }

  D.rpc('maquininha_extrato', function (b, ctx) {
    var d = b.p_dados || {}, dia = d.dia || ontem(), L = d.unidade ? lojaDe(d.unidade) : null, dono = !!ctx.admin;
    var todas = passadas(dia).filter(function (x) { return !L || x.unidade === L.nome; });
    var R = {};
    todas.forEach(function (x) {
      var k = (x.papel === 'indefinida' ? 'indefinida' : x.papel) + (x.pedido == null ? '_sem_pedido' : '_com_pedido');
      if (!R[k]) R[k] = { n: 0, total: 0 };
      R[k].n++; R[k].total = arr(R[k].total + x.valor);
    });
    Object.keys(R).forEach(function (k) { if (!dono) R[k].total = null; });
    var linhas = todas.filter(function (x) { return d.tudo || x.papel !== 'balcao'; }).sort(function (a, c) { return a.min - c.min; })
      .map(function (x) { return { hora: x.hora, unidade: x.unidade, valor: dono ? x.valor : null, bandeira: x.bandeira, tipo: x.tipo, maquina: x.maquina, papel: x.papel, pedido: x.pedido }; });
    var h = hojeOp();
    return { dia: dia, dia_texto: M.br(dia), janela: '5h às 5h do dia seguinte', rede_ate: redeAte(dia), agora: agoraTxt(), dono: dono,
             linhas: linhas, resumo: R,
             apuracao: { de: M.br(M.somaDias(h, -60)), ate: M.br(M.somaDias(h, -31)), em: M.br(M.somaDias(h, -30)), maquinas: 2 * M.lojas.length } };
  });

  var VARRIDO = null;
  D.rpc('pagamento_varrer', function (b) {
    if (b.p_acao === 'varrer') VARRIDO = Date.now();
    var desde = VARRIDO ? Math.max(0, Math.round((Date.now() - VARRIDO) / 60000)) : null;
    var agora = M.minutosAgora(), rede = agora >= 540 ? agora - 540 : agora + 900;
    var f = function (rotulo, base, explica, botao) {
      var min = desde != null && botao ? Math.min(base, desde + 1) : base;
      return { rotulo: rotulo, min_atras: min, cor: min < 90 ? 'verde' : (min < 600 ? 'amarelo' : 'vermelho'), explica: explica,
               olhei: M.hm(agora - Math.min(min, 30)), alcanca_botao: botao };
    };
    return { fontes: [
      f('Pedidos (Saipos)', 12, 'Pedidos do dia e a forma de pagamento anotada no caixa.', true),
      f('Rede (maquininhas)', rede, 'Vendas das maquininhas; a Rede manda o dia anterior às 9h.', true),
      f('Extrato (Pix)', 95, 'Pix recebidos na conta da loja.', false),
      f('GPS dos motoboys (TrackEat)', 3, 'Posição dos motoboys durante as entregas.', true),
      f('Cofre (dinheiro)', 1500, 'Fechamento do cofre do dia, lançado à mão.', false)
    ] };
  });

  D.rpc('pagamento_sem_par', function (b, ctx) {
    var d = b.p_dados || {}, dia = d.dia || ontem(), dono = !!ctx.admin;
    var L = maqLinhas(dia, d.unidade, ctx).filter(function (l) { return /^(NAO_COBROU|SEM_COBRANCA)/.test(l.situacao); });
    var lj = d.unidade ? lojaDe(d.unidade) : null;
    var P = passadas(dia).filter(function (x) { return x.papel === 'rota' && x.pedido == null && (!lj || x.unidade === lj.nome); });
    var csv = ['tipo;loja;pedido;hora;valor;motoboy;situacao'];
    L.forEach(function (l) { csv.push(['pedido sem cobrança', l.unidade, l.pedido, l.entregue_em, dono ? String(l.na_porta).replace('.', ',') : '', l.motoboy, l.situacao].join(';')); });
    P.forEach(function (x) { csv.push(['maquininha sem pedido', x.unidade, '', x.hora, dono ? String(x.valor).replace('.', ',') : '', '', 'SEM PEDIDO'].join(';')); });
    return { dia: dia, quantos: { pedidos: L.length, rede: P.length }, csv: csv.join('\n') };
  });

  /* ---------------- prova real ---------------- */
  function faixa(d) { d = Math.abs(d); return d < 0.01 ? 'centavo' : (d <= 1 ? 'ate R$1' : (d <= 10 ? 'ate R$10' : 'acima de R$10')); }
  D.rpc('prova_painel', function (b, ctx) {
    if (!podeVer(ctx)) throw D.erro(403, 'só o dono e o escritório veem a prova real', '42501');
    var h = hojeOp(), on = M.somaDias(h, -1), de = M.somaDias(h, -12), ate = M.somaDias(h, 1);
    var antesOficial = M.minutosAgora() < 545;
    var linhas = [], lacres = [], planilhas = [], alertas = [];
    var esperando = 0, semDono = 0;
    M.intervalo(de, on).forEach(function (dia) {
      var base = baseDia(dia), oficial = !(dia === on && antesOficial);
      lacres.push({ dia: dia, tipo: 'PREVIA', n: 12, primeiro: '22:00', ultimo: '03:30', codigo: hex('lacre-p|' + dia, 6) });
      if (oficial) lacres.push({ dia: dia, tipo: 'OFICIAL', primeiro: '09:05', codigo: hex('lacre|' + dia, 6) });
      M.lojas.forEach(function (L) { planilhas.push({ dia: dia, unidade: L.nome, status: statusPlanilha(dia, L.id) }); });
      base.linhas.forEach(function (m) {
        var r = M.rng('prova|' + dia + '|' + m.motoboy_id);
        var lida = planilhaLida(dia, m.loja), dl = lida ? delesDe(dia, m) : null;
        var deles = dl ? dl.valor : null;
        var pixStatus = dia === on && r() < 0.35 ? 'esperando o banco' : 'chegou';
        var pago = null, dp = 0;
        if (pixStatus === 'chegou') {
          if (deles != null) { dp = r() < 0.08 ? 7.5 : 0; pago = arr(deles - dp); }
          else pago = r() < 0.85 ? m.pagar : null;
        }
        if (pixStatus !== 'chegou') esperando++;
        var mudou = r() < 0.05;
        var casa = deles != null ? deles : pago;
        var fx = casa != null ? faixa(m.pagar - casa) : 'so no sistema';
        var x = {
          dia: dia, pessoa: m.entregador, lojas: m.unidade, lacre_tipo: oficial ? 'OFICIAL' : 'PREVIA',
          nosso: m.pagar, nosso_antes: mudou ? arr(m.pagar - M.escolhe(r, [8.5, 10, 12])) : null, mudou_depois: mudou,
          deles: deles, pago: pago, pix_status: pixStatus, faixa: fx,
          n_taxas: m.taxas, n_entregas: m.entregas, d_taxas: dl ? dl.taxas : null, d_entregas: dl ? dl.entregas : null,
          c_entregas: dl ? dl.c_entregas : 0, c_garantido: dl ? dl.c_garantido : 0, c_lanche: dl ? dl.c_lanche : 0,
          c_ajustes: dl ? dl.c_ajustes : 0, c_desconto: dl ? dl.c_desconto : 0,
          n_fonte: m.horas_escala ? 'escala: ' + m.horas_escala + 'h × R$ ' + m.valor_hora : m.fonte_garantido,
          dif_dp: deles != null && pago != null ? arr(deles - pago) : 0,
          pix: pago != null ? [{ data: M.br(M.somaDias(dia, 1)), nome: m.entregador, valor: pago, conta: 'conta da loja ' + m.unidade }] : []
        };
        linhas.push(x);
      });
      var r2 = M.rng('prova-extra|' + dia);
      if (r2() < 0.25 && dia < on) {
        var f = M.escolhe(r2, M.freelas), L = M.escolhe(r2, M.lojas), v = M.escolhe(r2, [60, 80, 120]);
        semDono++;
        linhas.push({ dia: dia, pessoa: 'sem dono: Pix de ' + rs(v), lojas: L.nome, lacre_tipo: null, nosso: null, deles: null, pago: v,
                      pix_status: 'chegou', faixa: 'so no Pix', pix: [{ data: M.br(M.somaDias(dia, 1)), nome: f.nome, valor: v, conta: 'conta da loja ' + L.nome }] });
      }
      if (r2() < 0.2 && dia < on) {
        var lid = M.lojas.filter(function (l) { return planilhaLida(dia, l.id); });
        if (lid.length) {
          var f2 = M.escolhe(r2, M.freelas), L2 = M.escolhe(r2, lid);
          linhas.push({ dia: dia, pessoa: f2.nome, lojas: L2.nome, lacre_tipo: null, nosso: null, deles: 110, pago: 110,
                        pix_status: 'chegou', faixa: 'so na planilha', dif_dp: 0, pix: [{ data: M.br(M.somaDias(dia, 1)), nome: f2.nome, valor: 110, conta: 'conta da loja ' + L2.nome }] });
        }
      }
    });
    /* hoje, depois das 22h: lacres da noite */
    if (M.minutosAgora() >= 1320) {
      lacres.push({ dia: h, tipo: 'PREVIA', n: Math.floor((M.minutosAgora() - 1320) / 30) + 1, primeiro: '22:00', ultimo: M.hm(M.minutosAgora() - (M.minutosAgora() % 30)), codigo: hex('lacre-p|' + h, 6) });
      baseDia(h).linhas.forEach(function (m) {
        linhas.push({ dia: h, pessoa: m.entregador, lojas: m.unidade, lacre_tipo: 'PREVIA', nosso: m.pagar, deles: null, pago: null, pix_status: 'esperando o banco', faixa: 'so no sistema', pix: [] });
      });
    }
    M.lojas.forEach(function (L) {
      if (statusPlanilha(on, L.id) === 'SEM FOTO') alertas.push({ texto: L.nome + ': a planilha de fechamento de ' + M.br(on) + ' ainda não chegou — sem ela esse dia da loja não entra no placar.' });
    });
    if (esperando) alertas.push({ texto: esperando + ' Pix de ' + M.br(on) + ' ainda esperando o banco.' });
    if (semDono) alertas.push({ texto: semDono + ' Pix sem dono para o escritório identificar.' });
    var nMb = M.motoboys.length, comp = nMb * 21, rc = M.rng('calib');
    var totN = arr(comp * (185 + rc() * 20)), lastOf = lacres.filter(function (l) { return l.tipo === 'OFICIAL'; }).pop();
    return {
      hoje: h, agora: agoraTxt(),
      janela: { de: de, ate: ate, de_texto: M.br(de), ate_texto: M.br(ate), dias_total: 14, dia_n: 12, terminou: false },
      linhas: linhas, lacres: lacres, planilhas: planilhas, alertas: alertas,
      calibracao: { de_texto: M.br(M.somaDias(de, -21)), ate_texto: M.br(M.somaDias(de, -1)),
                    antiga: { comparaveis: comp, bate: Math.round(comp * 0.52) },
                    nova: { comparaveis: comp, bate: Math.round(comp * 0.9), total_nosso: totN, total_casa: arr(totN * 1.035) } },
      cadeia: { ok: true, na_prova: lacres.length, calibracao: 21, ultimo_codigo: lastOf ? lastOf.codigo : '—' }
    };
  });
})();
