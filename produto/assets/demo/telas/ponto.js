/* Painel RH / Ponto (demonstracao).
   Simula: tabelas fato_espelho_dia e fato_ponto_mensal; portas rh_consulta
   (eventos, espelho, categorias, pessoa), rh_caixa_porta (sugerir_nomes),
   rh_refeicao_porta (dia, mes, pendente, sem_dono) e operacao_consulta
   (cartoes, cartao_salvar). Pessoas e batidas saem de MUNDO.equipe e
   MUNDO.batidas; ex-funcionarios sao montados com pedacos desses nomes. */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG || {};

  var HOJE = M.hoje(), ONTEM = M.dia(-1);
  var DE = M.dia(-92);                       /* inicio do espelho diario */
  var D30 = M.dia(-30), D365 = M.dia(-365);
  var SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var ORDN = { SERIO: 0, GRAVE: 1, INFRACAO: 2, VERBAL: 3, CONFERIR: 4, SEM: 5 };

  /* ---------------- utilidades ---------------- */
  function NOME(n) { return String(n || '').toUpperCase(); }
  var ACC = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', SEMAC = 'AAAAAEEEEIIIIOOOOOUUUUC';
  function normN(s) {
    var t = String(s == null ? '' : s).toUpperCase(), r = '';
    for (var i = 0; i < t.length; i++) { var k = ACC.indexOf(t.charAt(i)); r += (k >= 0 ? SEMAC.charAt(k) : t.charAt(i)); }
    r = r.replace(/\([^)]*\)/g, ' ').replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
    return r.split(' ').filter(function (w) { return w.length > 1; }).join(' ');
  }
  function contem(a, b) { var pa = a.split(' '); return b.split(' ').every(function (w) { return pa.indexOf(w) >= 0; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function br(iso) { return String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7); }
  function entreDias(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5); }
  function ultimoDia(ano, mes) { return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10); }
  function semanaIso(iso) {
    var d = new Date(iso + 'T12:00:00Z'), dw = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dw + 3);
    var y = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - y) / 864e5 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
  }
  function mesesAtras(k) { /* [ano, mes] de k meses atras */
    var a = +HOJE.slice(0, 4), m = +HOJE.slice(5, 7) - k;
    while (m < 1) { m += 12; a--; }
    return [a, m];
  }
  function credOk(c) {
    var p = D.papelDoToken(c);
    if (p === 'dono' || p === 'escritorio' || c === 'demo') return;
    throw D.erro(401, 'Senha do escritório inválida', '28000');
  }
  function contrDe(p) {
    var e = M.minDe(p.entrada), s = M.minDe(p.saida); if (s <= e) s += 1440;
    return { e: e, s: s, contr: s - e - p.intervalo_min };
  }

  /* ---------------- perfis de exemplo (casos que a tela sabe mostrar) ---------------- */
  var PERFIL = {}, SEM_COMANDA = {}, SEM_HORARIO = null;
  (function () {
    var r = M.rng('ponto-perfis-v1');
    var comuns = M.equipe.filter(function (p) { return !p.cargo_confianca; });
    var novatos = comuns.filter(function (p) { return p.experiencia && p.admissao <= M.dia(-10); });
    SEM_HORARIO = novatos.length ? novatos[0] : null;
    var antigos = comuns.filter(function (p) { return p.admissao <= M.dia(-270) && p !== SEM_HORARIO; });
    function tira(l) { return l.splice(Math.floor(r() * l.length), 1)[0]; }
    ['adv3', 'adv2susp', 'cronico', 'cronico', 'atestlongo', 'reprovado'].forEach(function (pf) {
      if (antigos.length) PERFIL[tira(antigos).id] = pf;
    });
    var resto = comuns.filter(function (p) { return !PERFIL[p.id] && p !== SEM_HORARIO; });
    for (var i = 0; i < 4 && resto.length; i++) SEM_COMANDA[tira(resto).id] = true;
  })();

  /* ---------------- espelho diario (fato_espelho_dia) ---------------- */
  var ESP = null, INFO = {};
  function espelho() {
    if (ESP) return ESP;
    var linhas = [], porPessoa = {}, det = {}, seq = 0;
    var dias = M.intervalo(DE, ONTEM);
    M.equipe.forEach(function (p) {
      var hz = contrDe(p), lst = porPessoa[p.id] = [];
      var rd = M.rng('disc|' + p.id), pAut = 0.45 + rd() * 0.45, pTroca = 0.3 + rd() * 0.4;
      dias.forEach(function (dia) {
        if (dia < p.admissao) return;
        var b = M.batidas(p, dia);
        if (b.situacao === 'FOLGA') return;
        var rz = M.rng('just|' + p.id + '|' + dia), aut = rz() < pAut, troca = rz() < pTroca;
        var notas = [], temExtra = false;
        var r = {
          id: ++seq, funcionario_id: p.id, nome: NOME(p.nome), unidade: p.unidade, data: dia,
          ano: +dia.slice(0, 4), semana: semanaIso(dia), dia_semana: SEMANA[M.diaSemana(dia)],
          entrada: null, saida: null, saida_dia_seguinte: false, n_marcacoes: 0,
          intervalo_real_min: null, jornada_liquida_min: null, jornada_contratada_min: hz.contr, extra_min: 0,
          categoria: 'OK', tag: null, nivel: 'SEM', importado_em: M.ts(M.somaDias(dia, 1), 8 * 60 + 5), ativo: true
        };
        var achados = [], d = null;
        if (b.situacao === 'FALTA') {
          achados.push(['CONFERIR', 'FALTA_A_CONFIRMAR', 'sem marcação', 'Nenhuma marcação no dia — conferir folga de escala, férias ou atestado antes de tratar como falta.']);
        } else if (b.situacao === 'ATESTADO') {
          r.categoria = 'ATESTADO'; r.tag = 'atestado';
          d = 'Atestado lançado para o dia — horas abonadas.';
        } else {
          var bt = b.batidas;
          r.n_marcacoes = bt.length;
          r.entrada = bt[0] || null;
          if (bt.length >= 3) r.intervalo_real_min = b.intervalo_min;
          if (bt.length === 4) {
            r.saida = bt[3];
            r.saida_dia_seguinte = M.minDe(bt[3]) < M.minDe(bt[0]);
            r.jornada_liquida_min = b.trabalhado_min;
            r.extra_min = b.extra_min >= 10 ? b.extra_min : 0;
          }
          if (bt.length === 3) achados.push(['INFRACAO', 'BATIDA_FALTANDO', '3 de 4 marcações', 'Só 3 marcações no dia: entrada ' + bt[0] + ', intervalo ' + bt[1] + '–' + bt[2] + ' e nenhuma saída. Ajustar com justificativa.']);
          /* regra de exemplo (configuravel): ate 4 min a menos no intervalo conta como arredondamento do relogio */
          if (bt.length >= 3 && hz.contr > 360) {
            var iv = b.intervalo_min;
            if (iv <= 45) achados.push(['SERIO', 'INTERVALO_SUPRIMIDO', 'intervalo ' + iv + 'min', 'Intervalo de ' + iv + ' min (' + bt[1] + '–' + bt[2] + '), abaixo do mínimo de 60 min (Art. 71).']);
            else if (iv <= 55) achados.push(['VERBAL', 'INTERVALO_CURTO', 'intervalo ' + iv + 'min', 'Intervalo de ' + iv + ' min (' + bt[1] + '–' + bt[2] + ') — ' + (60 - iv) + ' min a menos que 1h.']);
          }
          if (bt.length === 4 && b.extra_min >= 10) {
            var saiu = M.minDe(bt[3]); if (saiu < M.minDe(bt[0])) saiu += 1440;
            var depois = saiu - hz.s;
            temExtra = true;
            if (aut) notas.push(['SEM', 'HORA_EXTRA_AUTORIZADA', 'extra autorizada', 'Extra de ' + b.extra_min + ' min (saída ' + bt[3] + ') autorizada pela gerência — vai para o banco de horas.']);
            else if (depois >= 10) achados.push(['GRAVE', 'SAIU_APOS_HORARIO', '+' + b.extra_min + 'min', 'Saiu às ' + bt[3] + ', ' + depois + ' min depois do horário (' + p.saida + '). Sem autorização de extra registrada.']);
            else achados.push(['GRAVE', 'HORA_EXTRA', '+' + b.extra_min + 'min', 'Jornada ' + b.extra_min + ' min acima da contratada (entrada ' + bt[0] + ', saída ' + bt[3] + '). Sem autorização de extra registrada.']);
          }
          if (b.atraso_min >= 6) {
            if (troca) notas.push(['SEM', 'TROCA_DE_ESCALA', 'troca de escala', 'Entrou às ' + bt[0] + ' (horário ' + p.entrada + ') — troca de escala combinada com a gerência.']);
            else achados.push(['CONFERIR', 'ATRASO', 'atraso ' + b.atraso_min + 'min', 'Entrou às ' + bt[0] + ', ' + b.atraso_min + ' min depois do horário (' + p.entrada + '). Conferir se a escala do dia mudou.']);
          }
          if (SEM_HORARIO && p.id === SEM_HORARIO.id && dia >= M.dia(-6)) {
            r.jornada_contratada_min = null; r.extra_min = 0; temExtra = false; notas = [];
            achados = achados.filter(function (a) { return a[0] === 'SERIO' || a[0] === 'VERBAL' || a[0] === 'INFRACAO'; });
            achados.push(['CONFERIR', 'HORARIO_NAO_CADASTRADO', 'sem horário', 'Horário oficial não cadastrado — sem ele não dá para apurar extra nem atraso.']);
          }
        }
        achados.sort(function (a, c) { return ORDN[a[0]] - ORDN[c[0]]; });
        var todos = achados.concat(notas);
        if (todos.length) {
          r.nivel = todos[0][0]; r.categoria = todos[0][1]; r.tag = todos[0][2];
          d = todos[0][3] + (todos.length > 1 ? ' Também: ' + todos.slice(1).map(function (a) { return a[2]; }).join(', ') + '.' : '');
        }
        INFO[r.id] = { achados: achados, b: b, extra: temExtra, aut: temExtra && aut };
        if (d) det[r.nome + '|' + dia] = d;
        lst.push(r); linhas.push(r);
      });
    });
    ESP = { linhas: linhas, porPessoa: porPessoa, det: det };
    return ESP;
  }
  function temAchado(r, nivel) { return (INFO[r.id].achados || []).some(function (a) { return a[0] === nivel; }); }

  /* ---------------- ex-funcionarios e registros antigos com nome pela metade ---------------- */
  var CARGOS = ['Auxiliar de cozinha', 'Cozinheiro(a)', 'Chapeiro(a)', 'Garçom/Garçonete', 'Cumim', 'Operador(a) de caixa', 'Atendente do delivery', 'Auxiliar de limpeza', 'Copeiro(a)'];
  var EX = [], DUVIDA = [];
  (function () {
    var r = M.rng('ponto-ex-v1');
    var gente = M.equipe.concat(M.motoboys, M.freelas);
    function uniq(l) { var o = {}; return l.filter(function (x) { if (o[x]) return false; o[x] = 1; return true; }); }
    var prim = uniq(gente.map(function (x) { return x.nome.split(' ')[0]; }));
    var sob = uniq(gente.map(function (x) { var t = x.nome.split(' '); return t[t.length - 1]; }));
    var vivos = M.equipe.map(function (p) { return normN(p.nome); });
    var todos = gente.map(function (p) { return normN(p.nome); });
    var id = 900, t = 0;
    while (EX.length < 7 && t++ < 800) {
      var n = M.escolhe(r, prim) + ' ' + M.escolhe(r, sob), nn = normN(n);
      if (todos.indexOf(nn) >= 0) continue;
      if (vivos.some(function (v) { return contem(v, nn) || contem(nn, v); })) continue;
      if (EX.some(function (e) { return normN(e.nome) === nn; })) continue;
      var fimK = M.entre(r, 4, 22), dur = M.entre(r, 3, 20), iniK = Math.min(24, fimK + dur - 1);
      var semLoja = EX.length >= 5;
      var lj = M.escolhe(r, M.lojas);
      EX.push({ id: ++id, nome: n, unidade: semLoja ? '—' : lj.nome, lojaOc: semLoja ? null : lj.nome, cargo: M.escolhe(r, CARGOS), iniK: iniK, fimK: fimK, contr: 440 });
    }
    /* registro antigo so com primeiro e ultimo nome de alguem que trabalha hoje */
    var tres = M.equipe.filter(function (p) { return p.nome.split(' ').length >= 3 && !p.cargo_confianca; });
    for (var i = 0; i < 2 && i < tres.length; i++) {
      var p = tres[(i * 5) % tres.length], w = p.nome.split(' ');
      DUVIDA.push({ nome: w[0] + ' ' + w[w.length - 1], unidade: i === 0 ? p.unidade : '—', iniK: 22 - i * 2, fimK: 17 - i * 2, contr: 440 });
    }
  })();

  /* ---------------- historico mensal (fato_ponto_mensal) ---------------- */
  var MEN = null, ESQ_ITENS = {};
  function mensal() {
    if (MEN) return MEN;
    var rows = [], seq = 0, esp = espelho();
    function linha(nome, unidade, am, dias, esq, horas) {
      rows.push({ id: ++seq, fonte: 'relogio', nome: NOME(nome), empresa: C.marca || '', unidade: unidade, ano: am[0], mes: am[1],
        dias_trabalhados: dias, total_marcacoes: Math.max(0, dias * 4 - esq), esquecimentos: esq, horas_liquidas_min: horas,
        importado_em: M.ts(ultimoDia(am[0], am[1]), 23 * 60), ativo: true });
    }
    function itensEsq(chave, am, ini, fim, esq, r) {
      var l = ESQ_ITENS[chave] = ESQ_ITENS[chave] || [];
      var span = entreDias(ini, fim);
      for (var k = 0; k < esq; k++) l.push(M.somaDias(ini, M.entre(r, 0, Math.max(0, span))));
    }
    M.equipe.forEach(function (p) {
      var r = M.rng('mensal|' + p.id), hz = contrDe(p);
      /* batidas esquecidas por mes no mesmo ritmo do espelho (cerca de 1 por mes) */
      var taxa = PERFIL[p.id] === 'cronico' ? 3.4 : (r() < 0.3 ? 1.2 : 0.7);
      for (var k = 24; k >= 1; k--) {
        var am = mesesAtras(k), ini = am[0] + '-' + pad(am[1]) + '-01', fim = ultimoDia(am[0], am[1]);
        if (fim < p.admissao) continue;
        /* parte do mes que ja esta no espelho diario */
        var doMes = esp.porPessoa[p.id].filter(function (x) { return x.data >= ini && x.data <= fim; });
        var trab = doMes.filter(function (x) { return x.n_marcacoes > 0; });
        var dias = trab.length, esq = trab.filter(function (x) { return x.n_marcacoes === 3; }).length;
        var horas = trab.reduce(function (s, x) { return s + (x.jornada_liquida_min || x.jornada_contratada_min || hz.contr); }, 0);
        /* parte do mes antes do espelho */
        if (ini < DE) {
          var ini2 = p.admissao > ini ? p.admissao : ini, fim2 = fim >= DE ? M.somaDias(DE, -1) : fim;
          var fator = fim2 >= ini2 ? (entreDias(ini2, fim2) + 1) / (entreDias(ini, fim) + 1) : 0;
          var dAnt = Math.round(M.entre(r, 22, 26) * fator);
          if (dAnt > 0) {
            var e2 = Math.max(0, Math.round(taxa * (0.3 + r() * 1.4) * fator));
            dias += dAnt; esq += e2; horas += dAnt * hz.contr + Math.round(M.entre(r, -150, 260) * fator);
            itensEsq('p' + p.id, am, ini2, fim2, e2, r);
          }
        }
        if (dias > 0) linha(p.nome, p.unidade, am, dias, esq, horas);
      }
    });
    EX.concat(DUVIDA).forEach(function (x, i) {
      var r = M.rng('mensal-ex|' + x.nome);
      for (var k = x.iniK; k >= x.fimK; k--) {
        var am = mesesAtras(k), ini = am[0] + '-' + pad(am[1]) + '-01', fim = ultimoDia(am[0], am[1]);
        var dias = M.entre(r, 19, 26), esq = Math.max(0, Math.round((r() < 0.3 ? 1.6 : 0.4) * (0.3 + r() * 1.4)));
        linha(x.nome, x.unidade, am, dias, esq, dias * x.contr + M.entre(r, -200, 200));
        if (x.id) itensEsq('x' + x.id, am, ini, fim, esq, r);
      }
    });
    MEN = rows;
    return MEN;
  }

  /* ---------------- eventos (atestados, advertencias, ferias...) ---------------- */
  var EVT = null;
  function eventos() {
    if (EVT) return EVT;
    var L = [], seq = 0, esp = espelho();
    function ev(x, tipo, data, o) {
      if (!data || data > ONTEM) return;
      if (x.admissao && data < x.admissao) return;
      o = o || {};
      var dias = o.dias || 1;
      L.push({ id: ++seq, funcionario_id: x.id || null, nome: NOME(x.nome), unidade: x.unidade, data: data,
        data_fim: dias > 1 ? M.somaDias(data, dias - 1) : null, tipo: tipo, motivo: o.motivo || '', dias: dias, detalhe: o.detalhe || null });
    }
    M.equipe.forEach(function (p) {
      var r = M.rng('eventos|' + p.id), meus = esp.porPessoa[p.id];
      meus.filter(function (x) { return x.categoria === 'ATESTADO'; }).forEach(function (x) {
        ev(p, 'ATESTADO', x.data, { motivo: 'Atestado médico', detalhe: M.escolhe(r, ['Consulta médica — 1 dia.', 'Atestado de 1 dia, CID não informado.', 'Atestado odontológico — 1 dia.']) });
      });
      var serios = meus.filter(function (x) { return x.nivel === 'SERIO'; });
      if (serios.length >= 7 && r() < 0.7) ev(p, 'ADVERTENCIA', M.somaDias(serios[2].data, M.entre(r, 1, 2)), { motivo: 'Intervalo intrajornada abaixo do mínimo (Art. 71 CLT)', detalhe: 'Advertência assinada pelo funcionário e arquivada.' });
      var desde = p.admissao > M.dia(-730) ? p.admissao : M.dia(-730), ate = M.dia(-100);
      if (desde < ate) {
        var span = entreDias(desde, ate);
        var nAt = M.pesado(r, [[0, 40], [1, 30], [2, 18], [3, 12]]);
        for (var k = 0; k < nAt; k++) {
          var dd = M.pesado(r, [[1, 60], [2, 25], [3, 15]]);
          ev(p, 'ATESTADO', M.somaDias(desde, M.entre(r, 0, span)), { dias: dd, motivo: 'Atestado médico', detalhe: dd > 1 ? 'Afastamento de ' + dd + ' dias.' : 'Consulta médica — 1 dia.' });
        }
        if (r() < 0.2) ev(p, 'FALTA', M.somaDias(desde, M.entre(r, 0, span)), { motivo: 'Falta sem justificativa', detalhe: 'Descontado o dia + DSR da semana.' });
        if (span > 300 && r() < 0.45) ev(p, 'FERIAS', M.somaDias(desde, M.entre(r, 200, span - 30)), { dias: 30, motivo: 'Férias (30 dias)' });
        if (r() < 0.18) ev(p, 'FOLGA_ABONADA', M.somaDias(desde, M.entre(r, 0, span)), { motivo: M.escolhe(r, ['Folga de aniversário', 'Compensação de banco de horas']) });
        if (r() < 0.15) ev(p, 'DECLARACAO', M.somaDias(desde, M.entre(r, 0, span)), { motivo: 'Declaração de comparecimento — 3h abonadas' });
        if (r() < 0.05) ev(p, 'LICENCA', M.somaDias(desde, M.entre(r, 0, span)), { dias: 5, motivo: 'Licença-paternidade' });
      }
      var pf = PERFIL[p.id];
      if (pf === 'adv3') {
        ev(p, 'ADVERTENCIA', M.dia(-160), { motivo: 'Atrasos reiterados na entrada', detalhe: 'Advertência assinada pelo funcionário e arquivada.' });
        ev(p, 'ADVERTENCIA', M.dia(-75), { motivo: 'Intervalo intrajornada abaixo do mínimo (Art. 71 CLT)', detalhe: 'Advertência assinada pelo funcionário e arquivada.' });
        ev(p, 'ADVERTENCIA', M.dia(-18), { motivo: 'Ausência de marcação de ponto', detalhe: 'Recusou assinar — assinada por 2 testemunhas.' });
      } else if (pf === 'adv2susp') {
        ev(p, 'ADVERTENCIA', M.dia(-250), { motivo: 'Falta sem justificativa', detalhe: 'Advertência assinada pelo funcionário e arquivada.' });
        ev(p, 'ADVERTENCIA', M.dia(-205), { motivo: 'Atrasos reiterados na entrada', detalhe: 'Advertência assinada pelo funcionário e arquivada.' });
        ev(p, 'SUSPENSAO', M.dia(-180), { motivo: 'Suspensão disciplinar de 1 dia', detalhe: 'Reincidência após 2 advertências.' });
      } else if (pf === 'cronico') {
        ev(p, 'ADVERTENCIA', M.dia(-45), { motivo: 'Reiteradas ausências de registro de ponto (Portaria 671)', detalhe: 'Advertência assinada pelo funcionário e arquivada.' });
      } else if (pf === 'atestlongo') {
        ev(p, 'ATESTADO', M.dia(-140), { dias: 15, motivo: 'Afastamento médico', detalhe: 'Atestado de 15 dias — acompanhar o retorno.' });
        ev(p, 'ATESTADO', M.dia(-210), { dias: 2, motivo: 'Atestado médico', detalhe: 'Afastamento de 2 dias.' });
      } else if (pf === 'reprovado') {
        ev(p, 'ATESTADO', M.dia(-120), { motivo: 'Atestado médico', detalhe: 'REPROVADO — atestado sem assinatura e sem CRM do profissional.' });
      }
    });
    EX.forEach(function (x) {
      var r = M.rng('eventos-ex|' + x.id);
      var a = mesesAtras(x.iniK), b = mesesAtras(x.fimK);
      var ini = a[0] + '-' + pad(a[1]) + '-01', fim = ultimoDia(b[0], b[1]), span = entreDias(ini, fim);
      var nAd = M.pesado(r, [[0, 45], [1, 30], [2, 25]]);
      for (var k = 0; k < nAd; k++) ev(x, 'ADVERTENCIA', M.somaDias(ini, M.entre(r, 0, span)), { motivo: M.escolhe(r, ['Atrasos reiterados na entrada', 'Falta sem justificativa', 'Ausência de marcação de ponto']), detalhe: 'Advertência assinada pelo funcionário e arquivada.' });
      var nAt = M.pesado(r, [[0, 40], [1, 35], [2, 25]]);
      for (k = 0; k < nAt; k++) ev(x, 'ATESTADO', M.somaDias(ini, M.entre(r, 0, span)), { motivo: 'Atestado médico', detalhe: 'Consulta médica — 1 dia.' });
      if (r() < 0.4) ev(x, 'FALTA', M.somaDias(ini, M.entre(r, 0, span)), { motivo: 'Falta sem justificativa', detalhe: 'Descontado o dia + DSR da semana.' });
    });
    L.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    EVT = L;
    return EVT;
  }

  /* ---------------- ocorrencias por pessoa (consulta por tipo e ficha) ---------------- */
  var OCO = {};
  function ocorrencias(chave) {
    if (OCO[chave]) return OCO[chave];
    var L = [], esp = espelho(); mensal();
    var ativo = chave.charAt(0) === 'p', id = +chave.slice(1);
    function it(cat, data, det, origem, aprox) { L.push({ categoria: cat, data: data, data_aproximada: !!aprox, detalhe: det, documento_url: null, origem: origem }); }
    if (ativo) {
      var p = M.pessoa(id), meus = esp.porPessoa[id] || [], r = M.rng('oco|' + id);
      var trab = 0, nH = 0, nI = 0;
      meus.forEach(function (x) {
        if (x.n_marcacoes > 0) trab++;
        if (x.categoria === 'FALTA_A_CONFIRMAR') it('FALTA', x.data, 'Dia sem nenhuma marcação.', 'Espelho do ponto');
        if (x.n_marcacoes === 3) it('BATIDA_FALTANDO', x.data, 'Só 3 de 4 marcações no dia.', 'Espelho do ponto');
        if (INFO[x.id].extra && !INFO[x.id].aut) { nH++; it('HORA_EXTRA', x.data, '+' + INFO[x.id].b.extra_min + ' min além da jornada (saída ' + x.saida + '), sem autorização.', 'Espelho do ponto'); }
        if (temAchado(x, 'SERIO') || temAchado(x, 'VERBAL')) { nI++; it('INTERVALO', x.data, 'Intervalo de ' + x.intervalo_real_min + ' min.', 'Espelho do ponto'); }
      });
      /* tres meses antes do espelho, no mesmo ritmo da pessoa */
      var desde = p.admissao > M.dia(-182) ? p.admissao : M.dia(-182), ate = M.somaDias(DE, -1);
      if (desde < ate && trab) {
        var span = entreDias(desde, ate), diasT = Math.round(span * 6 / 7);
        var qH = Math.round(diasT * nH / trab * (0.6 + r() * 0.6)), qI = Math.round(diasT * nI / trab * (0.6 + r() * 0.6));
        for (var k = 0; k < qH; k++) it('HORA_EXTRA', M.somaDias(desde, M.entre(r, 0, span)), '+' + M.entre(r, 10, 48) + ' min além da jornada, sem autorização.', 'Espelho do ponto');
        for (k = 0; k < qI; k++) it('INTERVALO', M.somaDias(desde, M.entre(r, 0, span)), 'Intervalo de ' + M.entre(r, 35, 55) + ' min.', 'Espelho do ponto');
      }
    }
    (ESQ_ITENS[chave] || []).forEach(function (d) { it('BATIDA_FALTANDO', d, 'Marcação esquecida no mês.', 'Histórico mensal'); });
    var rr = M.rng('oco-ev|' + chave);
    eventos().forEach(function (e) {
      if (String(e.funcionario_id) !== String(id)) return;
      if (['ATESTADO', 'ADVERTENCIA', 'SUSPENSAO', 'FALTA'].indexOf(e.tipo) < 0) return;
      var det = e.motivo + (e.dias > 1 ? ' — ' + e.dias + ' dias' : '') + (e.detalhe ? '. ' + e.detalhe : '');
      it(e.tipo, e.data, det, 'Evento lançado pelo escritório', e.tipo === 'ATESTADO' && e.data < DE && rr() < 0.3);
    });
    L.sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
    OCO[chave] = L;
    return L;
  }

  var CAT = null;
  function categorias() {
    if (CAT) return CAT;
    var L = [], tipos = ['FALTA', 'ATESTADO', 'ADVERTENCIA', 'SUSPENSAO', 'BATIDA_FALTANDO', 'HORA_EXTRA', 'INTERVALO'];
    var gente = M.equipe.map(function (p) { return { chave: 'p' + p.id, id: p.id, nome: p.nome, unidade: p.unidade, cargo: p.cargo }; })
      .concat(EX.map(function (x) { return { chave: 'x' + x.id, id: x.id, nome: x.nome, unidade: x.lojaOc, cargo: x.cargo }; }));
    gente.forEach(function (g) {
      var oc = ocorrencias(g.chave);
      tipos.forEach(function (t) {
        var l = oc.filter(function (o) { return o.categoria === t; });
        if (!l.length) return;
        L.push({ funcionario_id: g.id, nome: NOME(g.nome), unidade: g.unidade, cargo: g.cargo, categoria: t,
          em_30d: l.filter(function (o) { return o.data >= D30; }).length,
          em_12m: l.filter(function (o) { return o.data >= D365; }).length,
          total: l.length, ultima: l[0].data });
      });
    });
    CAT = L;
    return L;
  }

  /* ---------------- comandas do Saipos (operacao_consulta) ---------------- */
  var CHAVE_CART = 'demo_ponto_cartoes';
  function lerTrocas() { try { return JSON.parse(localStorage.getItem(CHAVE_CART) || '[]'); } catch (e) { return []; } }
  function gravarTrocas(l) { try { localStorage.setItem(CHAVE_CART, JSON.stringify(l)); } catch (e) {} }
  var CART_BASE = null;
  function cartoesBase() {
    if (CART_BASE) return CART_BASE;
    var L = [];
    M.lojas.forEach(function (l, li) {
      var cod = (li + 1) * 100, eq = M.equipe.filter(function (p) { return p.loja === l.id; });
      eq.forEach(function (p, i) {
        cod++;
        if (SEM_COMANDA[p.id]) return;
        var c = { codigo: String(cod), unidade: l.nome, nome: NOME(p.nome), funcionario_id: String(p.id), tipo: 'funcionario', ativo: true, recado: null, recado_por: null, observacao: null };
        if (i === 2) { c.recado = 'Só almoço — o jantar fica por conta do funcionário.'; c.recado_por = 'Gerência'; }
        L.push(c);
        if (i === 4) L.push({ codigo: String(li + 1) + '90', unidade: l.nome, nome: NOME(p.nome), funcionario_id: String(p.id), tipo: 'funcionario', ativo: false, recado: null, recado_por: null, observacao: 'Cartão antigo, substituído pelo ' + cod + '.' });
      });
      for (var k = 0; k < 3; k++) L.push({ codigo: String(++cod), unidade: l.nome, nome: k === 2 ? 'Reserva do caixa' : null, funcionario_id: null, tipo: 'livre', ativo: true, recado: null, recado_por: null, observacao: null });
    });
    CART_BASE = L;
    return L;
  }
  function cartoes() {
    var l = cartoesBase().map(function (c) { var o = {}; for (var k in c) o[k] = c[k]; return o; });
    lerTrocas().forEach(function (t) {
      var x = l.filter(function (c) { return c.unidade === t.unidade && String(c.codigo) === String(t.codigo); })[0];
      if (!x) { x = { codigo: String(t.codigo), unidade: t.unidade, recado: null, recado_por: null }; l.push(x); }
      x.nome = t.nome || null; x.funcionario_id = t.funcionario_id || null; x.tipo = t.tipo || 'funcionario';
      x.ativo = t.ativo !== false; x.observacao = t.observacao || null;
    });
    return l;
  }
  function temComanda(id) { return cartoes().some(function (c) { return c.ativo && String(c.funcionario_id) === String(id); }); }

  /* ---------------- refeicao (rh_refeicao_porta) ---------------- */
  var DIA_SEM_SAIPOS = M.dia(-4), LOJA_SEM_SAIPOS = M.lojas.length ? M.lojas[M.lojas.length - 1].nome : '';
  function refDia(x, comCartao) {
    if (!x.n_marcacoes) return null;
    var r = M.rng('ref|' + x.funcionario_id + '|' + x.data), sorte = r(), meio = r();
    var p = M.pessoa(x.funcionario_id) || {};
    var direito = (x.jornada_liquida_min || 0) > 540 ? 2 : 1;
    var base = p.turno === 'Noite' ? 'JANTAR' : p.turno === 'Dia' ? 'ALMOÇO' : (meio < 0.5 ? 'ALMOÇO' : 'JANTAR');
    var o = { nome: x.nome, unidade: x.unidade, dia: x.data, situacao: 'OK', refeicoes: 0, direito: direito, tipos: null };
    if (!comCartao) o.situacao = 'SEM CARTAO';
    else if (x.data === DIA_SEM_SAIPOS && x.unidade === LOJA_SEM_SAIPOS) o.situacao = 'SEM DADO DO SAIPOS';
    else if (sorte < 0.82) { o.refeicoes = direito; o.tipos = direito === 2 ? 'ALMOÇO+JANTAR' : base; }
    else if (sorte < 0.94) o.situacao = 'NAO LANCOU';
    else { o.situacao = 'ACIMA DO DIREITO'; o.refeicoes = direito + 1; o.tipos = direito === 2 ? 'ALMOÇO+JANTAR+LANCHE' : base + '+LANCHE'; }
    return o;
  }
  function mapaCartao() {
    var m = {};
    cartoes().forEach(function (c) { if (c.ativo && c.funcionario_id) m[String(c.funcionario_id)] = true; });
    return m;
  }

  /* ---------------- portas ---------------- */
  D.tabela('fato_espelho_dia', function () { return espelho().linhas; });
  D.tabela('fato_ponto_mensal', function () { return mensal(); });

  D.rpc('rh_consulta', function (b) {
    credOk(b.p_senha);
    var a = b.p_acao, d = b.p_dados || {};
    var de = d.de || '2000-01-01', ate = d.ate || '2099-12-31';
    if (a === 'eventos') return eventos().filter(function (e) { return e.data >= de && e.data <= ate; });
    if (a === 'espelho') {
      var det = espelho().det, l = [];
      Object.keys(det).forEach(function (k) {
        var i = k.lastIndexOf('|'), dia = k.slice(i + 1);
        if (dia >= de && dia <= ate) l.push({ nome: k.slice(0, i), data: dia, detalhe: det[k] });
      });
      return l;
    }
    if (a === 'categorias') return categorias();
    if (a === 'pessoa') {
      var id = Number(d.funcionario_id);
      var ehEx = EX.some(function (x) { return x.id === id; });
      return ocorrencias((ehEx ? 'x' : 'p') + id);
    }
    return [];
  });

  D.rpc('rh_caixa_porta', function (b) {
    credOk(b.p_senha);
    if (b.p_acao === 'sugerir_nomes') return M.equipe.map(function (p) { return { nome: NOME(p.nome), unidade: p.unidade }; });
    return [];
  });

  D.rpc('rh_refeicao_porta', function (b) {
    credOk(b.p_senha);
    var a = b.p_acao, d = b.p_dados || {}, esp = espelho(), cart = mapaCartao();
    if (a === 'dia') {
      return esp.linhas.filter(function (x) { return x.data === d.dia; })
        .map(function (x) { return refDia(x, cart[String(x.funcionario_id)]); }).filter(Boolean);
    }
    if (a === 'mes') {
      var ag = {};
      esp.linhas.forEach(function (x) {
        if (x.data.slice(0, 7) + '-01' < DE) return;
        var o = refDia(x, cart[String(x.funcionario_id)]); if (!o) return;
        var k = x.funcionario_id + '|' + x.data.slice(0, 7);
        var g = ag[k] = ag[k] || { nome: x.nome, unidade: x.unidade, ano: +x.data.slice(0, 4), mes: +x.data.slice(5, 7), dias_trabalhados: 0, dias_ok: 0, dias_nao_pegou: 0, dias_acima: 0, dias_sem_cartao: 0, refeicoes: 0 };
        g.dias_trabalhados++; g.refeicoes += o.refeicoes;
        if (o.situacao === 'OK') g.dias_ok++;
        else if (o.situacao === 'NAO LANCOU') g.dias_nao_pegou++;
        else if (o.situacao === 'ACIMA DO DIREITO') g.dias_acima++;
        else if (o.situacao === 'SEM CARTAO') g.dias_sem_cartao++;
      });
      return Object.keys(ag).map(function (k) { return ag[k]; })
        .sort(function (a, c) { return (c.ano * 100 + c.mes) - (a.ano * 100 + a.mes); });
    }
    if (a === 'pendente') {
      var alvo = normN(d.nome), lim = M.dia(-14);
      return esp.linhas.filter(function (x) { return x.data >= lim && normN(x.nome) === alvo; })
        .map(function (x) { return refDia(x, cart[String(x.funcionario_id)]); })
        .filter(function (o) { return o && (o.situacao === 'NAO LANCOU' || o.situacao === 'ACIMA DO DIREITO'); })
        .sort(function (a, c) { return a.dia < c.dia ? 1 : -1; })
        .map(function (o) { return { dia: o.dia, situacao: o.situacao, unidade: o.unidade, direito: o.direito, refeicoes: o.refeicoes }; });
    }
    if (a === 'sem_dono') {
      var r = M.rng('sem-dono|' + HOJE.slice(0, 7));
      return [
        { categoria: 'Motoboy', refeicoes: M.entre(r, 120, 180), com_nome_do_motoboy: M.entre(r, 70, 110) },
        { categoria: 'Taxa / freela', refeicoes: M.entre(r, 40, 75), com_nome_do_motoboy: 0 },
        { categoria: 'Cartão genérico da loja', refeicoes: M.entre(r, 10, 30), com_nome_do_motoboy: 0 }
      ];
    }
    return [];
  });

  D.rpc('operacao_consulta', function (b) {
    var a = b.p_acao, d = b.p_dados || {};
    if (a === 'cartoes') {
      var uni = d.unidade || '';
      return {
        cartoes: cartoes().filter(function (c) { return !uni || c.unidade === uni; }),
        equipe: M.equipe.filter(function (p) { return !uni || p.unidade === uni; })
          .map(function (p) { return { id: p.id, nome: NOME(p.nome), unidade: p.unidade }; })
      };
    }
    if (a === 'cartao_salvar') {
      var trocas = lerTrocas(), n = 0;
      (d.linhas || []).forEach(function (l) {
        if (!l || !l.codigo || !l.unidade) return;
        trocas = trocas.filter(function (t) { return !(t.unidade === l.unidade && String(t.codigo) === String(l.codigo)); });
        trocas.push({ unidade: l.unidade, codigo: String(l.codigo), nome: l.nome || null, funcionario_id: l.funcionario_id || null, tipo: l.tipo || 'funcionario', ativo: l.ativo !== false, observacao: l.observacao || null });
        n++;
      });
      gravarTrocas(trocas);
      return { ok: true, gravadas: n };
    }
    throw D.erro(400, 'Ação não simulada na demonstração', 'P0001');
  });
})();
