/* Escala & Clima do delivery (demonstracao).
   Simula as portas:
     - tabela clima_vw_dia: previsao do tempo por dia, somada de uma previsao inventada hora a hora
       (alguns dias com garoa, chuva ou chuva forte em horarios do almoco ou do jantar);
     - foody_sugere_escala_semana: motoboys sugeridos por loja, dia e turno (demanda tirada de MUNDO.pedidos
       das ultimas semanas, corrigida pela chuva prevista);
     - escala_consulta: acoes 'escala' (escala salva), 'aderencia' (combinado x chegada) e 'salvar_dia';
     - foody_sugere_nomes: horario tipico de cada motoboy;
     - tabela foody_fato_fechamento_turno_dia: quem rodou em cada loja nos ultimos dias.
   Motoboys de MUNDO.motoboys. Alvos e tolerancias sao regra de exemplo (configuravel).
   A escala salva na tela fica so neste navegador (localStorage, prefixo demo_escala_). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* ---------------- regra de exemplo (configuravel) ---------------- */
  var REGRA = {
    alvoSeco: 3.5,        /* entregas por motoboy-hora no seco */
    alvoChuva: 3,         /* na chuva */
    alvoForte: 2.5,       /* na chuva forte */
    complementoAbaixo: 3, /* abaixo disto (entregas por motoboy-hora) a loja paga complemento */
    tolerancia: 10,       /* minutos depois do combinado para contar como atrasado */
    muitoAtraso: 30,      /* acima disto: muito atrasado */
    valorHora: 10,        /* custo previsto por motoboy-hora (so o dono ve) */
    taxaMedia: 6          /* taxa media paga por entrega (so o dono ve) */
  };
  var TURNOS = [
    { turno: 'Almoço', ini: 660, fim: 900, h: 4, h0: 11, h1: 14 },
    { turno: 'Tarde', ini: 900, fim: 1080, h: 3, h0: 15, h1: 17 },
    { turno: 'Jantar', ini: 1080, fim: 1410, h: 5, h0: 18, h1: 23 },
    { turno: 'Madrugada', ini: 1410, fim: 1800, h: 2, h0: 24, h1: 25 }
  ];
  var DIAS_PL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];

  /* ---------------- utilitarios ---------------- */
  function difDias(dia) { return Math.round((new Date(dia + 'T12:00:00Z') - new Date(M.hoje() + 'T12:00:00Z')) / 864e5); }
  function hms(t) { t = String(t || '00:00'); return t.length === 5 ? t + ':00' : t.slice(0, 8); }
  function minDe(t) { var p = String(t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function embaralha(r, l) { var a = l.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function lerLS(k) { try { var v = localStorage.getItem('demo_escala_' + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function gravarLS(k, v) { try { localStorage.setItem('demo_escala_' + k, JSON.stringify(v)); } catch (e) {} }
  function intervalo(de, ate, max) {
    if (!de || !ate) return [];
    if (de > ate) { var x = de; de = ate; ate = x; }
    var l = M.intervalo(de, ate);
    return l.length > max ? l.slice(l.length - max) : l;
  }

  /* ---------------- previsao do tempo (inventada, hora a hora) ---------------- */
  var CEN = {}, HORAS = {};
  function cenario(dia) {
    if (CEN[dia]) return CEN[dia];
    var r = M.rng('escala|clima|cenario|' + dia);
    var c = M.pesado(r, [['seco', 48], ['garoa', 17], ['chuva', 24], ['forte', 11]]);
    var off = difDias(dia);
    if (off === 1 && (c === 'seco' || c === 'garoa')) c = 'chuva_noite';   /* amanha: chuva no jantar */
    if (off === 4 && (c === 'seco' || c === 'garoa')) c = 'forte'; /* um dia de chuva forte na semana */
    return (CEN[dia] = c);
  }
  function horas(dia) {
    if (HORAS[dia]) return HORAS[dia];
    var r = M.rng('escala|clima|horas|' + dia);
    var c = cenario(dia), ini = null, dur = 0, base = null;
    if (c === 'garoa') { ini = M.entre(r, 10, 19); dur = M.entre(r, 2, 4); base = [0.2, 0.7]; }
    else if (c === 'chuva') { ini = M.entre(r, 11, 19); dur = M.entre(r, 2, 5); base = [1, 2.6]; }
    else if (c === 'forte') { ini = M.entre(r, 14, 18); dur = M.entre(r, 3, 5); base = [3, 6]; }
    else if (c === 'chuva_noite') { ini = 18; dur = M.entre(r, 3, 5); base = [1.2, 2.6]; }
    var tmin = M.entre(r, 12, 17), tmax = tmin + M.entre(r, 6, 11) - (ini == null ? 0 : 3);
    var nuvem = r(), hs = [];
    for (var h = 0; h < 24; h++) {
      var chove = ini != null && h >= ini && h < ini + dur;
      var mm = 0;
      if (chove) {
        var forma = Math.sin(Math.PI * ((h - ini + 0.5) / dur));
        mm = Math.max(0.2, M.arred((base[0] + (base[1] - base[0]) * r()) * (0.6 + forma), 1));
      }
      var prob = chove ? M.entre(r, 65, 95) : (ini != null && Math.abs(h - ini) <= 2 ? M.entre(r, 25, 50) : M.entre(r, 2, 18));
      var temp = tmin + (tmax - tmin) * Math.max(0, Math.sin(Math.PI * (h - 6) / 18)) - (chove ? 2 : 0);
      var wcode = !chove ? (nuvem < 0.35 ? 0 : nuvem < 0.6 ? 1 : nuvem < 0.85 ? 2 : 3)
        : mm < 1 ? 53 : mm < 4 ? 63 : (c === 'forte' && mm >= 5 ? 95 : 65);
      hs.push({ hora: h, mm: mm, prob: prob, temp: Math.round(temp), wcode: wcode });
    }
    return (HORAS[dia] = hs);
  }
  function classe(maxMm, totMm) {
    if (totMm != null && totMm < 0.5) return 'Seco';
    if (maxMm <= 0) return 'Seco';
    if (maxMm < 1) return 'Garoa';
    if (maxMm < 4) return 'Chuva';
    return 'Chuva forte';
  }
  function climaTurno(dia, T) {
    if (T.h0 >= 24) return 'Seco';
    var hs = horas(dia), mx = 0;
    for (var h = T.h0; h <= T.h1; h++) mx = Math.max(mx, hs[h].mm);
    return classe(mx);
  }
  function climaDia(dia) {
    var hs = horas(dia), r = M.rng('escala|clima|dia|' + dia);
    var tot = 0, mx = 0, prob = 0, chov = 0, wc = 0, tmin = 99, tmax = -99;
    hs.forEach(function (x) {
      tot += x.mm; mx = Math.max(mx, x.mm); prob = Math.max(prob, x.prob); wc = Math.max(wc, x.wcode);
      if (x.mm >= 0.2) chov++;
      tmin = Math.min(tmin, x.temp); tmax = Math.max(tmax, x.temp);
    });
    var off = difDias(dia);
    return {
      dia_op: dia, clima: classe(mx, tot), chuva_mm: M.arred(tot, 1), prob_max: prob,
      tmin: tmin, tmax: tmax, horas_chovendo: chov,
      confianca: r() < (off >= 4 ? 0.55 : 0.82) ? 'modelos concordam' : 'modelos divergem',
      wcode_pico: wc, atualizado_em: M.ts(M.hoje(), M.minutosAgora() - 17),
      horas: hs
    };
  }

  /* ---------------- demanda e sugestao ---------------- */
  /* os 3 ultimos dias do mesmo dia da semana, antes de hoje */
  function diasHist(dia) {
    var h = M.hoje(), l = [], k = 1;
    while (l.length < 3 && k < 12) { var d = M.somaDias(dia, -7 * k); if (d < h) l.push(d); k++; }
    return l;
  }
  var NEC = {};
  function necessidade(dia, L) {
    var ch = dia + '|' + L.id;
    if (NEC[ch]) return NEC[ch];
    var hist = diasHist(dia);
    var cont = {}, pico = {};
    TURNOS.forEach(function (T) { cont[T.turno] = 0; pico[T.turno] = {}; });
    hist.forEach(function (hd) {
      M.pedidos(hd, L.id).forEach(function (p) {
        if (p.canal === 'retirada' || p.cancelado) return;
        var m = p.min_pedido < 300 ? p.min_pedido + 1440 : p.min_pedido;
        for (var i = 0; i < TURNOS.length; i++) {
          var T = TURNOS[i];
          if (m >= T.ini && m < T.fim) { cont[T.turno]++; var hh = Math.floor(m / 60); pico[T.turno][hh] = (pico[T.turno][hh] || 0) + 1; break; }
        }
      });
    });
    var res = {};
    TURNOS.forEach(function (T) {
      var media = hist.length ? cont[T.turno] / hist.length : 0;
      var cl = climaTurno(dia, T);
      var almoco = T.turno === 'Almoço';
      var fator = cl === 'Chuva forte' ? (almoco ? 1.25 : 1.15) : cl === 'Chuva' ? (almoco ? 1.15 : 1.1) : cl === 'Garoa' ? 1.05 : 1;
      var alvo = cl === 'Chuva forte' ? REGRA.alvoForte : cl === 'Chuva' ? REGRA.alvoChuva : REGRA.alvoSeco;
      var ent = Math.round(media * fator);
      var sug = ent > 0 ? Math.max(1, Math.ceil(ent / (alvo * T.h))) : 0;
      var hp = null, best = 0;
      Object.keys(pico[T.turno]).forEach(function (k) { if (pico[T.turno][k] > best) { best = pico[T.turno][k]; hp = +k; } });
      var partes = ['média das 3 últimas ' + DIAS_PL[M.diaSemana(dia)]];
      if (fator > 1) partes.push((cl === 'Garoa' ? 'garoa' : cl === 'Chuva' ? 'chuva' : 'chuva forte') + ' no turno: +' + Math.round((fator - 1) * 100) + '% de pedidos');
      if (alvo < REGRA.alvoSeco) partes.push('menos entregas por motoboy na chuva');
      if (hp != null && ent > 0) partes.push('pico às ' + (hp % 24) + 'h');
      if (!ent) partes.push('sem pedido previsto');
      res[T.turno] = { turno: T.turno, ent_prev: ent, sug: sug, clima: cl, motivo: partes.join(' · '), h_cada: T.h };
    });
    return (NEC[ch] = res);
  }

  /* ---------------- escala ---------------- */
  /* escala de exemplo: dias passados, hoje e amanha completos; depois de amanha so o jantar; o resto falta fazer */
  function escalaGerada(dia, L) {
    var off = difDias(dia), li = M.lojas.indexOf(L);
    if (off > 2) return [];
    var nd = necessidade(dia, L);
    var r = M.rng('escala|monta|' + dia + '|' + L.id);
    var mbs = M.motoboys.filter(function (m) { return m.loja === L.id; });
    var disp = mbs.filter(function (m) { return m.fixo ? M.diaSemana(dia) !== m.id % 7 : r() < 0.75; });
    var fixos = embaralha(r, disp.filter(function (m) { return m.fixo; }));
    var avul = embaralha(r, disp.filter(function (m) { return !m.fixo; }));
    var nJ = nd['Jantar'].sug, nA = nd['Almoço'].sug, nT = nd['Tarde'].sug;
    var jant = fixos.concat(avul).slice(0, nJ);
    var livres = avul.concat(fixos).filter(function (m) { return jant.indexOf(m) < 0; });
    var almo = livres.slice(0, nA + nT), dobra = [];
    for (var i = 0; almo.length + dobra.length < nA + nT && i < jant.length; i++) dobra.push(jant[i]);   /* faz almoco e jantar */
    /* um entra 10h-16h; quem cobre a tarde vai das 11h as 17h (se nao for fazer o jantar tambem) */
    var linhas = [], todos = almo.concat(dobra), kTarde = almo.length >= 2 ? almo.length - 1 : -1;
    todos.forEach(function (m, k) {
      var longo = k === 0 || (nT > 0 && kTarde < 0 && k === 1);
      var t = longo ? ['10:00', '16:00'] : (nT > 0 && k === kTarde) ? ['11:00', '17:00'] : ['10:00', '14:00'];
      linhas.push({ nome: m.nome, turno: 'Almoço', entrada: t[0], saida: t[1] });
    });
    jant.forEach(function (m, k) {
      var t = (k === 0 && nJ >= 3) ? ['17:00', '23:00'] : ['18:00', '00:00'];
      linhas.push({ nome: m.nome, turno: 'Jantar', entrada: t[0], saida: t[1] });
    });
    /* fim de semana: um motoboy de fechamento nas lojas maiores
       (se nao sobrar ninguem, o ultimo do jantar fica para fechar) */
    var dow = M.diaSemana(dia);
    if ((dow === 0 || dow === 5 || dow === 6) && li < 2) {
      var livre = livres.filter(function (m) { return almo.indexOf(m) < 0; })[0];
      if (livre) linhas.push({ nome: livre.nome, turno: 'Fecha', entrada: '20:00', saida: '02:00' });
      else if (jant.length >= 3) {
        for (var q = linhas.length - 1; q >= 0; q--) {
          if (linhas[q].turno === 'Jantar') { linhas[q] = { nome: linhas[q].nome, turno: 'Fecha', entrada: '20:00', saida: '02:00' }; break; }
        }
      }
    }
    if (off === 2) linhas = linhas.filter(function (x) { return x.turno !== 'Almoço'; });
    if (off === 1 && li === 1) {   /* uma loja com a escala de amanha pela metade */
      var ultA = -1, ultJ = -1;
      linhas.forEach(function (x, k) { if (x.turno === 'Almoço') ultA = k; else if (x.turno === 'Jantar') ultJ = k; });
      linhas = linhas.filter(function (x, k) { return k !== ultA && k !== ultJ; });
    }
    return linhas.map(function (x) {
      return { data: dia, unidade: L.nome, turno: x.turno, nome: x.nome, entrada: hms(x.entrada), saida: hms(x.saida), origem: 'exemplo' };
    });
  }
  function escalaDia(dia, L) {
    var salva = lerLS(dia + '|' + L.nome);
    if (salva) return salva.map(function (x) {
      return { data: dia, unidade: L.nome, turno: x.turno, nome: x.nome, entrada: hms(x.entrada), saida: hms(x.saida), origem: x.origem || 'portal' };
    });
    return escalaGerada(dia, L);
  }
  /* quem cobre cada turno da sugestao: almoco = entra as 10h; tarde = almoco que entra as 11h e vai ate as 17h;
     jantar = jantar e fechamento; madrugada nao tem pedido no restaurante de exemplo */
  function contaTurno(linhas, turno) {
    if (turno === 'Almoço') return linhas.filter(function (x) { return x.turno === 'Almoço' && minDe(x.entrada) < 660; }).length;
    if (turno === 'Tarde') return linhas.filter(function (x) { return x.turno === 'Almoço' && minDe(x.entrada) >= 660; }).length;
    if (turno === 'Jantar') return linhas.filter(function (x) { return x.turno === 'Jantar' || x.turno === 'Fecha'; }).length;
    return 0;
  }
  function motoboyPorNome(nome, L) {
    for (var i = 0; i < M.motoboys.length; i++) if (M.motoboys[i].nome === nome && (!L || M.motoboys[i].loja === L.id)) return M.motoboys[i];
    for (var j = 0; j < M.motoboys.length; j++) if (M.motoboys[j].nome === nome) return M.motoboys[j];
    return null;
  }
  /* entregas do dia por motoboy (MUNDO.pedidos) */
  var ENT = {};
  function entregasDia(dia, L) {
    var ch = dia + '|' + L.id;
    if (ENT[ch]) return ENT[ch];
    var o = {};
    M.pedidos(dia, L.id).forEach(function (p) {
      if (!p.motoboy_id || p.cancelado || p.canal === 'retirada' || !p.hora_entrega) return;
      var x = o[p.motoboy_id] || (o[p.motoboy_id] = { n: 0, primeira: null });
      x.n++;
      if (p.min_saida != null && (x.primeira == null || p.min_saida < x.primeira)) x.primeira = p.min_saida;
    });
    if (dia < M.hoje()) ENT[ch] = o;
    return o;
  }

  /* ---------------- aderencia: combinado x chegada ---------------- */
  function aderencia(de, ate) {
    var h = M.hoje(), agora = M.minutosAgora();
    var lista = [], fora = [];
    intervalo(de, ate, 92).forEach(function (dia) {
      if (dia > h) return;
      M.lojas.forEach(function (L) {
        var esc = escalaDia(dia, L), ent = entregasDia(dia, L), nomes = {};
        esc.forEach(function (e) {
          var ini = minDe(e.entrada);
          nomes[e.nome] = 1;
          if (dia === h && ini + 20 > agora) return;           /* turno de hoje que ainda nao comecou */
          var mb = motoboyPorNome(e.nome, L);
          var perfil = M.rng('escala|perfil|' + e.nome)();
          var r = M.rng('escala|ader|' + dia + '|' + L.id + '|' + e.nome + '|' + e.turno);
          var x = r(), tarde = perfil < 0.18 ? 0.35 : 0.12;
          var st, atraso = null, cheg = null, fonte = null;
          if (x < 0.035) st = 'Faltou';
          else if (x < 0.07) st = 'Sem check-in';
          else {
            if (x < 0.07 + tarde * 0.25) atraso = M.entre(r, REGRA.muitoAtraso + 1, REGRA.muitoAtraso + 35);
            else if (x < 0.07 + tarde) atraso = M.entre(r, REGRA.tolerancia + 1, REGRA.muitoAtraso);
            else atraso = M.entre(r, -15, REGRA.tolerancia);
            st = atraso <= REGRA.tolerancia ? 'No horário' : atraso <= REGRA.muitoAtraso ? 'Atrasado' : 'Muito atrasado';
            cheg = M.ts(dia, ini + atraso);
            fonte = r() < 0.72 ? 'balcão' : 'GPS do pátio';
          }
          var eu = mb ? ent[mb.id] : null;
          var trabalhou = st !== 'Faltou' && eu && eu.n > 0;
          lista.push({
            nome: e.nome, unidade: L.nome, dia_op: dia, turno: e.turno,
            entrada: e.entrada, saida: e.saida, status: st,
            atraso_min: atraso, tolerancia_min: REGRA.tolerancia,
            chegada_efetiva: cheg, fonte_chegada: fonte,
            primeira_coleta: trabalhou ? M.ts(dia, eu.primeira) : null,
            entregas: trabalhou ? eu.n : 0
          });
        });
        /* rodou sem estar na escala (troca de ultima hora) */
        if (dia < h) {
          M.motoboys.filter(function (m) { return m.loja === L.id && !nomes[m.nome]; }).forEach(function (m) {
            var eu = ent[m.id];
            if (!eu || !eu.n || M.rng('escala|fora|' + dia + '|' + m.id)() > 0.3) return;
            fora.push({ nome: m.nome, unidade: L.nome, dia_op: dia, primeira_coleta: M.ts(dia, eu.primeira), entregas: eu.n });
          });
        }
      });
    });
    lista.sort(function (a, b) {
      return a.dia_op < b.dia_op ? 1 : a.dia_op > b.dia_op ? -1 : (a.entrada < b.entrada ? -1 : a.entrada > b.entrada ? 1 : a.nome.localeCompare(b.nome, 'pt-BR'));
    });
    fora.sort(function (a, b) { return a.dia_op < b.dia_op ? 1 : a.dia_op > b.dia_op ? -1 : 0; });
    return { aderencia: lista, fora: fora };
  }

  /* ---------------- portas ---------------- */
  D.tabela('clima_vw_dia', function () {
    var l = [];
    for (var i = -40; i <= 12; i++) l.push(climaDia(M.dia(i)));
    return l;
  });

  D.rpc('foody_sugere_escala_semana', function (b, ctx) {
    var ini = b.p_ini || M.hoje(), n = Math.max(1, Math.min(31, +b.p_dias || 8));
    var out = [];
    for (var i = 0; i < n; i++) {
      var dia = M.somaDias(ini, i), hist = diasHist(dia);
      M.lojas.forEach(function (L) {
        var nd = necessidade(dia, L);
        var esc = hist.map(function (hd) { return escalaDia(hd, L); });
        TURNOS.forEach(function (T) {
          var s = nd[T.turno];
          var mh = esc.length ? M.arred(esc.reduce(function (a, l) { return a + contaTurno(l, T.turno); }, 0) / esc.length, 1) : 0;
          var o = {
            dia: dia, unidade: L.nome, turno: T.turno, clima: s.clima,
            ent_prev: s.ent_prev, motoboys_sug: s.sug, motoboys_hist: mh,
            motivo: s.motivo, h_cada: s.sug ? s.h_cada : null
          };
          if (ctx.admin) {
            o.custo_prev = M.arred(s.sug * s.h_cada * REGRA.valorHora + s.ent_prev * REGRA.taxaMedia);
            o.complemento_prev = M.arred(Math.max(0, REGRA.complementoAbaixo * s.sug * s.h_cada - s.ent_prev) * REGRA.taxaMedia);
          }
          out.push(o);
        });
      });
    }
    return out;
  });

  D.rpc('escala_consulta', function (b) {
    var acao = b.p_acao, d = b.p_dados || {};
    if (acao === 'escala') {
      var out = [];
      intervalo(d.de, d.ate, 62).forEach(function (dia) {
        M.lojas.forEach(function (L) { out = out.concat(escalaDia(dia, L)); });
      });
      return out;
    }
    if (acao === 'aderencia') return aderencia(d.de, d.ate);
    if (acao === 'salvar_dia') {
      var L = M.loja(d.unidade);
      if (!L || !d.data) throw D.erro(400, 'loja ou dia inválido');
      var linhas = (d.linhas || []).filter(function (x) { return x && x.nome; }).map(function (x) {
        return { nome: String(x.nome), turno: x.turno || 'Jantar', entrada: String(x.entrada || '').slice(0, 5), saida: String(x.saida || '').slice(0, 5), origem: 'portal' };
      });
      gravarLS(d.data + '|' + L.nome, linhas);
      return { ok: true, gravadas: linhas.length };
    }
    throw D.erro(400, 'ação desconhecida: ' + acao);
  });

  D.rpc('foody_sugere_nomes', function (b) {
    var out = [];
    M.lojas.forEach(function (L) {
      M.motoboys.filter(function (m) { return m.loja === L.id; }).forEach(function (m) {
        var r = M.rng('escala|nomes|' + m.id);
        var dias = m.fixo ? M.entre(r, 0, 3) : M.entre(r, 1, 35);
        out.push({ unidade: L.nome, turno: 'Almoço', nome: m.nome, entrada_tipica: r() < 0.6 ? '10:00:00' : '11:00:00', saida_tipica: r() < 0.5 ? '14:00:00' : '16:00:00', dias_sem_rodar: dias });
        out.push({ unidade: L.nome, turno: 'Jantar', nome: m.nome, entrada_tipica: r() < 0.7 ? '18:00:00' : '17:00:00', saida_tipica: r() < 0.7 ? '00:00:00' : '23:00:00', dias_sem_rodar: dias });
      });
    });
    return out;
  });

  D.tabela('foody_fato_fechamento_turno_dia', function (ctx) {
    var de = M.dia(-40), un = null;
    ctx.params.getAll('dia_operacional').forEach(function (v) { if (/^gte?\./.test(v)) { var x = v.replace(/^gte?\./, ''); if (x > de) de = x; } });
    var u = ctx.params.get('unidade');
    if (u && /^eq\./.test(u)) un = M.loja(u.slice(3));
    var lojas = un ? [un] : M.lojas, out = [];
    intervalo(de, M.dia(-1), 62).forEach(function (dia) {
      lojas.forEach(function (L) {
        var ent = entregasDia(dia, L);
        escalaDia(dia, L).forEach(function (e) {
          var mb = motoboyPorNome(e.nome, L);
          out.push({ dia_operacional: dia, unidade: L.nome, turno: e.turno, entregador: e.nome, entregas: mb && ent[mb.id] ? ent[mb.id].n : 0 });
        });
      });
    });
    return out;
  });
})();
