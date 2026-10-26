/* Central do RH (demonstracao): rh/index.html, rh/equipe.html, rh/escala.html e rh/manual.html.
   Simula as tabelas fato_espelho_dia e dim_funcionario e as portas rh_consulta (espelho, eventos,
   refeicao, refeicao_itens, experiencia), rh_experiencia_decidir, rh_funcionario_porta,
   rh_refeicao_porta, escala_consulta (posicao, salvar_posicao) e operacao_consulta (ponto ao vivo,
   resolucoes do cartao, comandas, refeicao da equipe e "nao pegou refeicao").
   Pessoas e batidas vem do MUNDO; o que a tela grava fica no localStorage com prefixo "demo_". */
(function () {
  'use strict';
  if (!window.DEMO || !window.MUNDO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* ---------------- utilidades ---------------- */
  function ler(k, padrao) { try { var v = localStorage.getItem('demo_rh_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravar(k, v) { try { localStorage.setItem('demo_rh_' + k, JSON.stringify(v)); } catch (e) {} }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtH(m) { m = Math.round(m || 0); return Math.floor(m / 60) + 'h' + pad(m % 60); }
  function difDias(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
  function ddmm(iso) { return String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7); }
  function hojeBR() { return M.hoje(); }
  var DIAS_SEM = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  var DIAS_CURTO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var DSEM_UP = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];
  function nomeLoja(x) { var l = M.loja(x); return l ? l.nome : ''; }
  function idLoja(x) { var l = M.loja(x); return l ? l.id : ''; }
  function outraLoja(lojaId, r) {
    var o = M.lojas.filter(function (l) { return l.id !== lojaId; });
    return o.length ? M.escolhe(r, o).nome : '';
  }
  function quandoAgora() { var a = M.agoraISO(); return ddmm(a) + ' ' + a.slice(11, 16); }

  /* cardapio da refeicao da equipe (o mesmo exemplo que a tela mostra; vale para a primeira loja) */
  var LOJA1 = M.lojas[0] ? M.lojas[0].id : '';
  var PRATO = { DOMINGO: 'MACARRONADA À BOLONHESA', SEGUNDA: 'STROGONOFF DE FRANGO', TERCA: 'CARNE DE PANELA', QUARTA: 'FEIJOADA LEVE', QUINTA: 'PEIXE EMPANADO', SEXTA: 'BIFE ACEBOLADO', SABADO: 'FRANGO ASSADO' };
  var LANCHES = ['CLÁSSICO DA CASA', 'DUPLO SMASH', 'SALADA LEVE'];
  function produtoRefeicao(p, dia, r, errado) {
    var dw = M.diaSemana(dia);
    if (p.loja !== LOJA1) return r() < 0.7 ? 'PRATO DO DIA FUNCIONÁRIOS' : M.escolhe(r, LANCHES) + ' FUNCIONÁRIOS';
    if (errado) return DSEM_UP[dw] + ' - ' + PRATO[DSEM_UP[(dw + 3) % 7]] + ' FUNCIONÁRIOS';
    return r() < 0.75 ? DSEM_UP[dw] + ' - ' + PRATO[DSEM_UP[dw]] + ' FUNCIONÁRIOS' : M.escolhe(r, LANCHES) + ' FUNCIONÁRIOS';
  }

  /* ---------------- quem e quem ---------------- */
  var EQUIPE = M.equipe;
  var POR_ID = {};
  EQUIPE.forEach(function (p) { POR_ID[p.id] = p; });

  /* ex-funcionarios (para "mostrar desligados"): nomes montados com pedacos do proprio MUNDO */
  var DESLIGADOS = [];
  (function () {
    /* primeiro nome que ninguem da equipe usa (tirado de freelas e motoboys do MUNDO) + sobrenome da equipe */
    var usados = {}; EQUIPE.forEach(function (p) { usados[p.apelido] = 1; });
    var livres = [];
    M.freelas.concat(M.motoboys).forEach(function (x) { if (!usados[x.apelido] && livres.indexOf(x.apelido) < 0) livres.push(x.apelido); });
    var setores = ['Cozinha', 'Salão'];
    for (var k = 0; k < 2 && k < livres.length && EQUIPE.length > 12; k++) {
      var b = EQUIPE[(k * 11 + 9) % EQUIPE.length];
      var sob = b.nome.split(' '), nome = livres[livres.length - 1 - k] + ' ' + sob[sob.length - 1];
      var a = { apelido: nome.split(' ')[0] };
      var l = M.lojas[k % M.lojas.length];
      DESLIGADOS.push({ id: 901 + k, nome: nome, apelido: a.apelido, loja: l.id, unidade: l.nome, setor: setores[k], cargo: k ? 'Garçom/Garçonete' : 'Auxiliar de cozinha',
        turno: 'Dia', entrada: '10:00', saida: '18:20', intervalo_min: 60, folga: 2, admissao: M.dia(-400 + k * 90), cargo_confianca: false, desligado_base: M.dia(-25 - k * 30),
        motivo_base: k ? 'Pediu as contas' : 'Acordo entre as partes' });
      POR_ID[901 + k] = DESLIGADOS[DESLIGADOS.length - 1];
    }
  })();

  /* candidatos estaveis para os casos de exemplo (fora gerente e fora quem ja esta em experiencia) */
  var COMUNS = EQUIPE.filter(function (p) { return !p.cargo_confianca && !p.experiencia; });
  function comumDaLoja(lojaId, n) { var l = COMUNS.filter(function (p) { return p.loja === lojaId; }); return l.length ? l[n % l.length] : null; }

  /* afastamentos de exemplo, sempre em volta de hoje */
  var AFAST_BASE = {};
  (function () {
    var a = comumDaLoja(M.lojas[0] && M.lojas[0].id, 2), b = comumDaLoja(M.lojas[1] && M.lojas[1].id, 1);
    if (a) AFAST_BASE[a.id] = { desde: M.dia(-9), ate: M.dia(11), motivo: 'Férias' };
    if (b) AFAST_BASE[b.id] = { desde: M.dia(-1), ate: M.dia(2), motivo: 'Atestado' };
  })();
  /* quem nao tem comanda cadastrada (aparece como "sem cartao") */
  var SEM_CARTAO = {};
  (function () {
    M.lojas.slice(0, 2).forEach(function (l, i) { var p = comumDaLoja(l.id, 4 + i); if (p && !AFAST_BASE[p.id]) SEM_CARTAO[p.id] = 1; });
  })();
  /* "ja avisaram que saiu" */
  var AVISO_SAIDA = (function () {
    var p = comumDaLoja(M.lojas[M.lojas.length - 1].id, 0);
    if (!p || AFAST_BASE[p.id] || SEM_CARTAO[p.id]) return null;
    return { id: p.id, nome: p.nome, unidade: p.unidade, fonte: 'Gerente da loja', texto: 'Avisou que não volta mais — pediu as contas no sábado.' };
  })();
  var OBS_BASE = {};
  (function () {
    var x = comumDaLoja(M.lojas[0].id, 0), y = comumDaLoja(M.lojas[0].id, 5);
    if (x) OBS_BASE[x.id] = 'Horário combinado: às sextas sai 30 min antes para a faculdade.';
    if (y && y !== x) OBS_BASE[y.id] = 'Uniforme novo entregue; falta assinar o termo.';
  })();

  /* estado gravado pela tela */
  function funcEstado() { return ler('func', {}); }
  function ativo(p) { var o = funcEstado()[p.id]; if (o && o.ativo != null) return !!o.ativo; return !p.desligado_base; }
  function afast(p) {
    var o = funcEstado()[p.id];
    if (o && o.afast !== undefined) return o.afast;   /* null = tirado na tela */
    return AFAST_BASE[p.id] || null;
  }
  function afastadoNoDia(p, dia) { var a = afast(p); return a && a.desde <= dia && (!a.ate || a.ate >= dia) ? a : null; }
  function todos() { return EQUIPE.concat(DESLIGADOS); }

  /* ---------------- espelho do ponto ---------------- */
  function contratado(p) { var e = M.minDe(p.entrada), s = M.minDe(p.saida); if (s < e) s += 1440; return s - e - p.intervalo_min; }
  var RESP_BASE = ['Orientei a pessoa sobre o intervalo.', 'Esqueceu de bater; horário confirmado com o gerente.', 'Hora extra autorizada pelo gerente — fechamento do caixa.', 'Erro de batida, já corrigido no sistema de ponto.', 'Trocou de turno com um colega, combinado com o gerente.'];

  function linhaEspelho(p, dia) {
    var base = {
      nome: p.nome, unidade: p.unidade, data: dia, dia_semana: DIAS_SEM[M.diaSemana(dia)], ativo: ativo(p),
      jornada_contratada_min: contratado(p), jornada_liquida_min: null, intervalo_real_min: null, extra_min: null,
      categoria: 'NORMAL', nivel: 'SEM', tag: '',
      /* parte protegida (vem pela porta rh_consulta) */
      detalhe: '', marcacoes_txt: '', esc_entrada: p.entrada + ':00', esc_saida: p.saida + ':00', esc_intervalo_min: p.intervalo_min,
      combinado: null, motivo_doc: null, resposta: null
    };
    var r = M.rng('rh-esp|' + p.id + '|' + dia);
    var af = afastadoNoDia(p, dia);
    if (af) { base.categoria = 'SEM_MARCACAO'; base.nivel = 'CONFERIR'; base.tag = 'sem marcações'; base.detalhe = 'Nenhuma batida — ' + af.motivo.toLowerCase() + ' registrado(a) no sistema de RH.'; return base; }
    var b = M.batidas(p, dia);
    if (b.situacao === 'FOLGA') { base.categoria = 'FOLGA'; base.nivel = 'SEM'; base.tag = 'folga'; base.jornada_contratada_min = null; base.esc_entrada = null; base.esc_saida = null; return base; }
    if (b.situacao === 'FALTA' || b.situacao === 'SEM_BATIDA') { base.categoria = 'FALTA'; base.nivel = 'CONFERIR'; base.tag = 'sem marcações'; base.detalhe = 'Nenhuma batida no dia e nada registrado (férias, atestado ou folga).'; return base; }
    if (b.situacao === 'ATESTADO') { base.categoria = 'SEM_MARCACAO'; base.nivel = 'CONFERIR'; base.tag = 'sem marcações'; base.detalhe = 'Nenhuma batida no dia.'; base.motivo_doc = 'Atestado médico de 1 dia entregue ao escritório.'; return base; }
    base.marcacoes_txt = b.batidas.join(' ');
    base.intervalo_real_min = b.batidas.length >= 3 ? b.intervalo_min : null;
    if (b.batidas.length < 4) {
      base.categoria = 'BATIDA_FALTANDO'; base.nivel = 'INFRACAO'; base.tag = 'falta 1 batida';
      base.detalhe = 'Só ' + b.batidas.length + ' marcações no dia — falta a batida de saída.';
      if (r() < 0.3) base.motivo_doc = 'Declaração de comparecimento (consulta médica) entregue.';
      return base;
    }
    var dur = b.intervalo_min, trab = b.trabalhado_min, extra = b.extra_min, atraso = b.atraso_min;
    base.jornada_liquida_min = trab; base.extra_min = extra;
    if (dur < 50) {
      base.categoria = 'INTERVALO_MENOR'; base.nivel = 'SERIO'; base.tag = 'intervalo ' + dur + ' min';
      base.detalhe = 'Intervalo de ' + dur + ' min — o mínimo legal é 60 min (Art. 71 CLT).';
    } else if (extra > 30) {
      base.categoria = 'HORA_EXTRA'; base.nivel = 'GRAVE'; base.tag = '+' + extra + ' min';
      base.detalhe = 'Saiu ' + b.batidas[3] + ', a escala prevê ' + p.saida + ': trabalhou ' + fmtH(trab) + ' para ' + fmtH(contratado(p)) + ' contratadas.';
    } else if (dur < 57) {
      base.categoria = 'INTERVALO_CURTO'; base.nivel = 'VERBAL'; base.tag = 'intervalo ' + dur + ' min';
      base.detalhe = 'Intervalo de ' + dur + ' min, abaixo de 1h.';
    } else if (atraso > 15) {
      base.categoria = 'BATEU_DIFERENTE'; base.nivel = 'CONFERIR'; base.tag = 'entrada ' + b.batidas[0];
      base.detalhe = 'Entrou ' + b.batidas[0] + ', a escala prevê ' + p.entrada + '. Confira se a escala do dia mudou.';
      var x = r();
      if (x < 0.25) base.combinado = 'Cobriu a loja ' + outraLoja(p.loja, r) + ' neste dia';
      else if (x < 0.45) base.combinado = 'Combinado fixo: às ' + DIAS_CURTO[M.diaSemana(dia)].toLowerCase() + 's entra mais tarde';
    }
    return base;
  }

  /* resolucoes do cartao ("o que aconteceu?"): exemplos + o que a tela gravar */
  function resolucoes() {
    var out = [];
    var ontem = M.dia(-1);
    M.intervalo(M.dia(-8), M.dia(-2)).forEach(function (dia) {
      EQUIPE.forEach(function (p) {
        var l = linhaEspelho(p, dia);
        if (l.nivel === 'SEM' || l.combinado) return;
        var r = M.rng('rh-res|' + p.id + '|' + dia);
        if (r() < 0.65) out.push({ nome_citado: p.nome, dia: dia, texto: M.escolhe(r, RESP_BASE), de_quem: 'Gerente da loja', onde: 'portal', decisao: 'orientado' });
      });
    });
    /* ontem: uma falta ja comentada (nao vira justificado: espera o ok do dono) */
    var falta = EQUIPE.filter(function (p) { return linhaEspelho(p, ontem).categoria === 'FALTA'; })[0];
    if (falta) out.push({ nome_citado: falta.nome, dia: ontem, texto: 'Não veio — avisou que estava doente e vai trazer atestado.', de_quem: 'Gerente da loja', onde: 'portal', decisao: 'falta' });
    return out.concat(ler('resol', []));
  }

  function espelho(de, ate, comDetalhe) {
    var fim = M.dia(-1);
    if (!ate || ate > fim) ate = fim;
    if (!de) de = M.dia(-7);
    var res = {};
    if (comDetalhe) resolucoes().forEach(function (x) { if (x.decisao !== 'falta') res[x.nome_citado + '|' + x.dia] = x.texto + ' — ' + x.de_quem; });
    var out = [];
    M.intervalo(de, ate).forEach(function (dia) {
      todos().forEach(function (p) {
        if (p.desligado_base && dia >= p.desligado_base) return;
        if (dia < p.admissao) return;
        var l = linhaEspelho(p, dia);
        if (comDetalhe) { l.resposta = res[p.nome + '|' + dia] || null; out.push(l); return; }
        out.push({ nome: l.nome, unidade: l.unidade, data: l.data, dia_semana: l.dia_semana, categoria: l.categoria, nivel: l.nivel, tag: l.tag,
          jornada_liquida_min: l.jornada_liquida_min, intervalo_real_min: l.intervalo_real_min, jornada_contratada_min: l.jornada_contratada_min, extra_min: l.extra_min, ativo: l.ativo });
      });
    });
    return out;
  }

  D.tabela('fato_espelho_dia', function () { return espelho(M.dia(-35), M.dia(-1), false); });

  /* ---------------- cadastro ---------------- */
  function folgaTxt(p) { return p.cargo_confianca ? null : DIAS_CURTO[p.folga]; }
  function noturno(p) { return p.entrada >= '15:00' || p.saida < p.entrada; }
  D.tabela('dim_funcionario', function () {
    return todos().map(function (p) {
      var a = afast(p);
      return { id: p.id, nome: p.nome, unidade: p.unidade, setor: p.setor, cargo: p.cargo, folgas: folgaTxt(p),
        entrada: p.entrada + ':00', saida: p.saida + ':00', noturno: noturno(p), jornada_contratada_min: contratado(p),
        afastado_desde: a ? a.desde : null, afastado_ate: a ? a.ate : null, ativo: ativo(p) };
    });
  });

  /* ---------------- refeicao da equipe ---------------- */
  function trabalhou(p, dia) { if (afastadoNoDia(p, dia)) return null; var b = M.batidas(p, dia); return b.batidas.length >= 3 ? b : null; }
  function sitRef(p, dia) {
    var b = trabalhou(p, dia); if (!b) return null;
    var r = M.rng('rh-ref|' + p.id + '|' + dia), x = r();
    var tipo = noturno(p) ? 'jantar' : 'almoço';
    var o = { p: p, b: b, dia: dia, tipos: tipo, n: 1, situacao: 'OK', onde_lancou: null, r: r };
    if (SEM_CARTAO[p.id]) { o.situacao = 'SEM CARTAO'; o.n = 0; o.tipos = ''; }
    else if (x < 0.09) { o.situacao = 'NAO LANCOU'; o.n = 0; o.tipos = ''; }
    else if (x < 0.13) { o.situacao = 'ACIMA DO DIREITO'; o.n = 2; o.tipos = tipo + ' + lanche'; }
    else if (x < 0.16) { o.onde_lancou = outraLoja(p.loja, r); }
    return o;
  }
  function horasTxt(b) { var m = b.trabalhado_min || ((M.minDe(b.batidas[b.batidas.length - 1]) - M.minDe(b.batidas[0]) + 1440) % 1440); return String(Math.round(m / 6) / 10).replace('.', ','); }
  function refeicaoDias(de, ate) {
    var fim = M.dia(-1); if (!ate || ate > fim) ate = fim;
    var out = [];
    M.intervalo(de || M.dia(-7), ate).forEach(function (dia) {
      EQUIPE.forEach(function (p) {
        if (!ativo(p)) return;
        var s = sitRef(p, dia); if (!s) return;
        out.push({ dia: dia, nome: p.nome, unidade: p.unidade, situacao: s.situacao, tipos: s.tipos,
          entrada: s.b.batidas[0] + ':00', saida: s.b.batidas[s.b.batidas.length - 1] + ':00' });
      });
    });
    return out;
  }
  function refeicaoItens(dia) {
    var out = [];
    EQUIPE.forEach(function (p) {
      if (!ativo(p)) return;
      var s = sitRef(p, dia); if (!s || !s.n || s.onde_lancou) return;
      for (var i = 0; i < s.n; i++) out.push({ produto: i ? M.escolhe(s.r, LANCHES) + ' FUNCIONÁRIOS' : produtoRefeicao(p, dia, s.r, s.r() < 0.06), dono_nome: p.nome, motoboy_nome: null, grupo: 'funcionario', unidade: p.unidade });
    });
    M.lojas.forEach(function (l) {
      var r = M.rng('rh-itens-mb|' + l.id + '|' + dia);
      var mbs = M.motoboys.filter(function (m) { return m.loja === l.id; });
      var n = Math.min(mbs.length, M.entre(r, 2, 4));
      for (var i = 0; i < n; i++) out.push({ produto: M.escolhe(r, LANCHES) + ' FUNCIONÁRIOS', dono_nome: null, motoboy_nome: mbs[i].nome, grupo: 'motoboys', unidade: l.nome });
      if (r() < 0.7) out.push({ produto: 'PRATO DO DIA FUNCIONÁRIOS', dono_nome: null, motoboy_nome: null, grupo: '', unidade: l.nome });
    });
    return out;
  }

  /* ---------------- contrato de experiencia (30 + 60 dias, regra de exemplo) ---------------- */
  var ADM = {};   /* admissao usada no aviso: a do MUNDO, ou uma recente quando faltar exemplo */
  function marcosDe(adm) { return [M.somaDias(adm, 29), M.somaDias(adm, 89)]; }
  var EXP_BASE_DEC = {};
  function expPessoas() {
    var hoje = hojeBR(), dec = ler('exp', {});
    function entrada(p) {
      var adm = ADM[p.id] || p.admissao, mk = marcosDe(adm);
      if (difDias(hoje, mk[1]) < -10) return null;
      function d(m) { return dec[p.nome + '|' + m] || EXP_BASE_DEC[p.nome + '|' + m] || null; }
      var marco = 1, dd = d(1);
      if (dd && dd.decisao === 'prorrogado') { marco = 2; dd = d(2); }
      var q = difDias(hoje, mk[marco - 1]);
      return { nome: p.nome, nome_ponto: p.nome, unidade: p.unidade, admissao: adm, marco: marco, data_marco: mk[marco - 1], dias_para_marco: q,
        situacao: q < 0 ? 'PASSOU DO PRAZO' : (q <= 3 ? 'AVISO' : 'EM EXPERIENCIA'), alerta_etapa_1: marco === 1 && q <= 7,
        divergente_com_o_ponto: false, decisao: dd ? dd.decisao : null, decidido_por: dd ? dd.quem : null, decisao_texto: dd ? dd.texto : null };
    }
    var l = [];
    EQUIPE.forEach(function (p) { if (ativo(p) && (p.experiencia || ADM[p.id])) { var e = entrada(p); if (e) l.push(e); } });
    return l;
  }
  (function () {
    var hoje = hojeBR();
    /* marco 1 vencido ha mais de 10 dias: a decisao "prorrogar" ja foi tomada */
    EQUIPE.forEach(function (p) { if (p.experiencia && difDias(hoje, marcosDe(p.admissao)[0]) < -10) EXP_BASE_DEC[p.nome + '|1'] = { decisao: 'prorrogado', quem: 'Gerente da loja', texto: 'Prorrogado por mais 60 dias.' }; });
    var precisa = expPessoas().filter(function (e) { return !e.decisao && e.dias_para_marco <= 7 && e.dias_para_marco >= -10; }).length;
    /* um caso por loja (na ordem do config), para a tela travada numa loja tambem mostrar o aviso */
    var extras = [[-25, 1], [-86, 2], [-30, 1]];
    for (var k = 0; k < extras.length && precisa < 3; k++) {
      var lid = M.lojas[k % M.lojas.length].id;
      var p = COMUNS.filter(function (q) {
        return q.loja === lid && !ADM[q.id] && !AFAST_BASE[q.id] && !SEM_CARTAO[q.id] && !(AVISO_SAIDA && AVISO_SAIDA.id === q.id) && !OBS_BASE[q.id];
      })[1];
      if (!p) continue;
      ADM[p.id] = M.dia(extras[k][0]);
      if (extras[k][1] === 2) EXP_BASE_DEC[p.nome + '|1'] = { decisao: 'prorrogado', quem: 'Gerente da loja', texto: 'Prorrogado: ainda aprendendo a chapa.' };
      precisa++;
    }
  })();

  /* ---------------- porta rh_consulta (detalhe protegido) ---------------- */
  function credOk(senha) {
    var papel = D.papelDoToken(senha);
    if (papel) return papel === 'dono' || papel === 'escritorio';   /* gerente precisa da senha do escritorio */
    return !!String(senha || '').trim();                             /* demonstracao: qualquer senha vale */
  }
  D.rpc('rh_consulta', function (b) {
    if (!credOk(b.p_senha)) throw D.erro(401, 'Senha do escritório necessária', '28000');
    var d = b.p_dados || {}, acao = b.p_acao;
    if (acao === 'espelho') return espelho(d.de, d.ate, true);
    if (acao === 'eventos') {
      var ev = [];
      todos().forEach(function (p) {
        var a = afast(p);
        if (a) ev.push({ nome: p.nome, data: a.desde, tipo: a.motivo === 'Férias' ? 'FERIAS' : (a.motivo === 'Atestado' ? 'ATESTADO' : 'LICENCA'), dias: difDias(a.desde, a.ate || a.desde) + 1 });
      });
      M.intervalo(M.dia(-8), M.dia(-1)).forEach(function (dia) {
        EQUIPE.forEach(function (p) { if (!afastadoNoDia(p, dia) && M.batidas(p, dia).situacao === 'ATESTADO') ev.push({ nome: p.nome, data: dia, tipo: 'ATESTADO', dias: 1 }); });
      });
      var x = comumDaLoja(M.lojas[0].id, 3);
      if (x) ev.push({ nome: x.nome, data: M.dia(-3), tipo: 'FOLGA_ABONADA', dias: 1 });
      return ev;
    }
    if (acao === 'refeicao') return refeicaoDias(d.de, d.ate);
    if (acao === 'refeicao_itens') return refeicaoItens(d.ate || M.dia(-1));
    if (acao === 'experiencia') return expPessoas();
    throw D.erro(400, 'ação desconhecida: ' + acao);
  });

  D.rpc('rh_experiencia_decidir', function (b, ctx) {
    var d = b.p_dados || {};
    if (['efetivado', 'prorrogado', 'nao_renovado'].indexOf(d.decisao) < 0) throw D.erro(400, 'decisão inválida');
    var dec = ler('exp', {});
    dec[d.nome + '|' + (d.marco || 1)] = { decisao: d.decisao, texto: d.observacao || '', quem: ctx.nome };
    gravar('exp', dec);
    return { ok: true };
  });

  /* ---------------- porta rh_funcionario_porta ---------------- */
  D.rpc('rh_funcionario_porta', function (b, ctx) {
    var d = b.p_dados || {}, acao = b.p_acao, est = funcEstado();
    if (acao === 'listar') {
      var lista = todos().map(function (p) {
        var o = est[p.id] || {}, a = afast(p);
        var obs = o.obs != null ? o.obs : (OBS_BASE[p.id] || '');
        var ult = o.ultima || (p.desligado_base ? { acao: 'desligado: ' + p.motivo_base.toLowerCase(), quem: 'Escritório', quando: ddmm(p.desligado_base) } : (OBS_BASE[p.id] ? { acao: 'observação', quem: 'Escritório', quando: ddmm(M.dia(-6)) } : null));
        return { id: p.id, nome: p.nome, unidade: p.unidade, setor: p.setor, ativo: ativo(p), entrada: p.entrada, saida: p.saida, folgas: folgaTxt(p),
          afastado_desde: a ? a.desde : null, afastado_ate: a ? a.ate : null, afastado_motivo: a ? a.motivo : null, obs: obs, ultima: ult };
      });
      var avisos = [];
      if (AVISO_SAIDA && ativo(POR_ID[AVISO_SAIDA.id])) avisos.push(AVISO_SAIDA);
      return { lista: lista, avisos: avisos };
    }
    var p = POR_ID[d.id];
    if (!p) throw D.erro(404, 'funcionário não encontrado');
    var o = est[p.id] = est[p.id] || {};
    var quem = ctx.nome, quando = quandoAgora();
    if (acao === 'desligar') { o.ativo = false; o.ultima = { acao: 'desligado' + (d.texto ? ': ' + d.texto : ''), quem: quem, quando: quando }; }
    else if (acao === 'reativar') { o.ativo = true; o.ultima = { acao: 'reativado', quem: quem, quando: quando }; }
    else if (acao === 'ferias') {
      if (!d.de || !d.ate) throw D.erro(400, 'preencha o primeiro dia e o dia da volta');
      o.afast = { desde: d.de, ate: d.ate, motivo: d.motivo || 'Férias' };
      o.ultima = { acao: (d.motivo || 'Férias').toLowerCase() + ' ' + ddmm(d.de) + ' a ' + ddmm(d.ate), quem: quem, quando: quando };
    }
    else if (acao === 'tirar_ferias') { o.afast = null; o.ultima = { acao: 'férias/afastamento retirado', quem: quem, quando: quando }; }
    else if (acao === 'obs') { o.obs = String(d.texto || ''); o.ultima = { acao: 'observação', quem: quem, quando: quando }; }
    else throw D.erro(400, 'ação desconhecida: ' + acao);
    gravar('func', est);
    return { ok: true };
  });

  /* ---------------- escala de posicoes ---------------- */
  function posicaoSugerida(p, dia) {
    var b = M.batidas(p, dia);
    if (b.situacao === 'FOLGA') return 'FOLGA';
    if (b.situacao === 'FALTA' || b.situacao === 'ATESTADO') return 'Falta/Ausente';
    var c = p.cargo || '';
    if (p.setor === 'Gerência') return 'Gerência';
    if (p.setor === 'Cozinha') {
      if (/Chapeiro/.test(c)) return 'Chapa';
      if (/Líder/.test(c)) return 'Chapa, Montagem de burgers';
      if (/Auxiliar/.test(c)) return 'Produção/Cozinha (apoio), Fritadeira';
      return 'Montagem de burgers, Montagem de marmitas/pratos';
    }
    if (p.setor === 'Delivery') return /Expedi/.test(c) ? 'Separação de pacotes/expedição' : 'Separação de pacotes/expedição, Atendimento/Caixa';
    if (p.setor === 'Limpeza') return 'Limpeza';
    return 'Atendimento/Caixa';
  }
  function escalaDoDia(dia, unidade) {
    var g = ler('escala', {}), k = dia + '|' + unidade;
    if (g[k]) return Object.keys(g[k]).map(function (n) { return { nome: n, posicao: g[k][n] }; });
    var lid = idLoja(unidade);
    if (dia > hojeBR() || (dia === hojeBR() && lid !== LOJA1)) return [];
    return EQUIPE.filter(function (p) { return p.loja === lid && ativo(p) && !afastadoNoDia(p, dia); })
      .map(function (p) { return { nome: p.nome, posicao: posicaoSugerida(p, dia) }; });
  }
  D.rpc('escala_consulta', function (b) {
    var d = b.p_dados || {};
    if (b.p_acao === 'posicao') return escalaDoDia(d.data || hojeBR(), d.unidade || '');
    if (b.p_acao === 'salvar_posicao') {
      var g = ler('escala', {}), n = 0, vistos = {};
      (d.linhas || []).forEach(function (l) {
        var k = l.data + '|' + l.unidade;
        if (!vistos[k]) { g[k] = {}; vistos[k] = 1; }
        g[k][l.nome] = l.posicao; n++;
      });
      gravar('escala', g);
      return { ok: true, gravados: n };
    }
    throw D.erro(400, 'ação desconhecida: ' + b.p_acao);
  });

  /* ---------------- comandas (cartoes de refeicao) ---------------- */
  function comandasBase(lojaId) {
    var l = M.loja(lojaId); if (!l) return [];
    var i = M.lojas.indexOf(l), cod = 100, out = [];
    todos().forEach(function (p) {
      if (p.loja !== l.id) return;
      cod++;
      if (SEM_CARTAO[p.id]) return;
      var sob = p.nome.split(' ');
      out.push({ id: (i + 1) * 1000 + cod, codigo: cod, nome: (p.apelido + ' ' + sob[sob.length - 1].charAt(0) + '.').toUpperCase(), funcionario_id: p.id,
        tipo: p.cargo_confianca ? 'confianca' : 'funcionario', ativo: !p.desligado_base, unidade: l.nome, recado: null, recado_por: null, recado_em: null });
    });
    [['MOTOBOYS', 'motoboys'], ['CORTESIA', 'cortesia'], ['COMANDA RESERVA', 'funcionario']].forEach(function (x) {
      cod++; out.push({ id: (i + 1) * 1000 + cod, codigo: cod, nome: x[0], funcionario_id: null, tipo: x[1], ativo: true, unidade: l.nome, recado: null, recado_por: null, recado_em: null });
    });
    if (i === 0 && out[2]) { out[2].recado = 'Comanda quebrada — trocar por uma nova.'; out[2].recado_por = 'Gerente da loja'; out[2].recado_em = M.dia(-2); }
    return out;
  }
  function comandas(lojaId) {
    var l = M.loja(lojaId); if (!l) return [];
    var g = ler('cartoes', {}), mudou = g[l.id] || {};
    var lista = comandasBase(l.id).filter(function (c) { return !(mudou[c.codigo] && mudou[c.codigo].apagado); });
    Object.keys(mudou).forEach(function (k) {
      var m = mudou[k], c = lista.filter(function (x) { return String(x.codigo) === String(k); })[0];
      if (m.apagado) return;
      if (!c) { c = { id: 9000 + (+k || 0) + M.lojas.indexOf(l) * 100000, codigo: +k || k, nome: '', funcionario_id: null, tipo: 'funcionario', ativo: true, unidade: l.nome }; lista.push(c); }
      for (var f in m) c[f] = m[f];
    });
    return lista.sort(function (a, b) { return (+a.codigo) - (+b.codigo); });
  }
  function mudaComanda(lojaId, codigo, campos) {
    var l = M.loja(lojaId); if (!l) throw D.erro(400, 'loja desconhecida');
    var g = ler('cartoes', {}); g[l.id] = g[l.id] || {};
    var m = g[l.id][codigo] = g[l.id][codigo] || {};
    for (var f in campos) m[f] = campos[f];
    gravar('cartoes', g);
  }
  function offsets() {
    var g = ler('offset', {});
    return M.lojas.map(function (l, i) { return { unidade: l.nome, offset_card: g[l.id] != null ? g[l.id] : (i === 0 ? 51000 : null) }; });
  }
  function equipeAtiva(unidade) {
    var lid = unidade ? idLoja(unidade) : '';
    return EQUIPE.filter(function (p) { return ativo(p) && (!lid || p.loja === lid); }).map(function (p) { return { id: p.id, nome: p.nome, unidade: p.unidade }; });
  }

  /* ---------------- porta operacao_consulta ---------------- */
  function batidasAte(p, dia, agora) {
    var b = M.batidas(p, dia);
    if (dia === hojeBR()) return b;
    var e = M.minDe(p.entrada);
    return { situacao: b.situacao, batidas: b.batidas.filter(function (h) { var m = M.minDe(h); if (m < e - 180) m += 1440; return m <= agora; }) };
  }
  function pontoAoVivo(unidade) {
    var L = M.loja(unidade) || M.lojas[0];
    var agora = M.minutosAgora(), dia = hojeBR();
    if (agora < 300) { dia = M.dia(-1); agora += 1440; }
    var gente = [];
    EQUIPE.forEach(function (p) {
      if (p.loja !== L.id || !ativo(p)) return;
      var x = { nome: p.nome, esc_entrada: p.entrada, batidas: 0, dentro: false, no_intervalo: false, entrou: null, saida: null, int_saiu: null, int_voltou: null, int_min: null, evento: null, situacao: '' };
      var af = afastadoNoDia(p, dia);
      if (af) { x.situacao = af.motivo === 'Férias' ? 'FERIAS' : (af.motivo === 'Atestado' ? 'ATESTADO' : 'LICENCA'); gente.push(x); return; }
      var b = batidasAte(p, dia, agora), l = b.batidas;
      if (b.situacao === 'FOLGA') x.situacao = 'FOLGA';
      else if (b.situacao === 'ATESTADO') x.situacao = 'ATESTADO';
      else if (!l.length) x.situacao = agora > M.minDe(p.entrada) + 10 && agora < M.minDe(p.entrada) + 600 ? 'ATRASADO' : 'NAO_CHEGOU';
      else {
        x.batidas = l.length; x.entrou = l[0]; x.situacao = 'TRABALHANDO';
        if (l.length === 1) x.dentro = true;
        if (l.length === 2) { x.no_intervalo = true; x.dentro = true; x.int_saiu = l[1]; }
        if (l.length >= 3) { x.int_saiu = l[1]; x.int_voltou = l[2]; x.int_min = (M.minDe(l[2]) - M.minDe(l[1]) + 1440) % 1440; x.dentro = l.length === 3; }
        if (l.length >= 4) x.saida = l[3];
      }
      gente.push(x);
    });
    /* um taxa (freela) do dia, quando a loja esta aberta */
    var fr = M.freelas.filter(function (f) { return f.loja === L.id; })[0];
    if (fr && agora >= 18 * 60 && agora < 23 * 60 + 30) gente.push({ nome: fr.nome, esc_marcacao: 'TAXA', situacao: 'TAXA', batidas: 1, dentro: true, no_intervalo: false, entrou: '18:00', esc_entrada: '18:00' });
    function ordem(x) { return x.no_intervalo ? 1 : (x.dentro ? 0 : (x.batidas ? 2 : (x.situacao === 'ATRASADO' ? 3 : (x.situacao === 'NAO_CHEGOU' ? 4 : 5)))); }
    gente.sort(function (a, b) { return ordem(a) - ordem(b) || String(a.entrou || a.esc_entrada || '').localeCompare(String(b.entrou || b.esc_entrada || '')) || a.nome.localeCompare(b.nome); });
    return { gente: gente, lido_em: M.ts(dia, Math.floor(agora / 60) * 60), dia: dia };
  }
  function refeicaoLancadaHoje(unidade) {
    var L = M.loja(unidade) || M.lojas[0], agora = M.minutosAgora(), dia = hojeBR();
    if (agora < 300) { dia = M.dia(-1); agora += 1440; }
    var out = [];
    EQUIPE.forEach(function (p) {
      if (p.loja !== L.id || !ativo(p) || afastadoNoDia(p, dia) || SEM_CARTAO[p.id]) return;
      var b = batidasAte(p, dia, agora);
      if (b.batidas.length < 2) return;
      var r = M.rng('rh-vivo-ref|' + p.id + '|' + dia);
      if (r() < 0.18) return;
      out.push({ dono_nome: p.nome, tipo_refeicao: noturno(p) ? 'JANTAR' : 'ALMOCO', produto: produtoRefeicao(p, dia, r, false), quantidade: 1 });
    });
    return out;
  }
  function naoPegou(dia) {
    var out = [];
    EQUIPE.forEach(function (p) {
      if (!ativo(p)) return;
      var s = sitRef(p, dia); if (!s) return;
      if (s.situacao === 'NAO LANCOU' || s.situacao === 'SEM CARTAO') out.push({ nome: p.nome, situacao: s.situacao, horas: horasTxt(s.b), onde_lancou: null });
      else if (s.onde_lancou) out.push({ nome: p.nome, situacao: 'OK', horas: horasTxt(s.b), onde_lancou: s.onde_lancou });
    });
    return out;
  }

  /* refeicao: visao "dia a dia", sem dono, motoboys, cortesias */
  function lojasDo(unidade) { var l = unidade ? M.loja(unidade) : null; return l ? [l] : M.lojas; }
  function semDonoBase(unidade, de, ate) {
    var out = [];
    lojasDo(unidade).forEach(function (l, i) {
      var r = M.rng('rh-semdono|' + l.id);
      var gente = EQUIPE.filter(function (p) { return p.loja === l.id && ativo(p); });
      var p = gente[M.entre(r, 0, gente.length - 1)];
      out.push({ chave: l.id + '|c', unidade: l.nome, codigo: 160 + i, nome_cartao: 'COMANDA ' + (160 + i), nome_digitado: null, refeicoes: M.entre(r, 2, 6), de: M.dia(-M.entre(r, 12, 20)), ate: M.dia(-1), sugestao_id: null });
      if (p) out.push({ chave: l.id + '|n', unidade: l.nome, codigo: null, nome_cartao: null, nome_digitado: p.apelido.toLowerCase() + ' ' + (p.setor === 'Cozinha' ? 'cozinha' : 'salão'), refeicoes: M.entre(r, 1, 4), de: M.dia(-M.entre(r, 5, 9)), ate: M.dia(-2), sugestao_id: p.id });
      if (i === 0) out.push({ chave: l.id + '|v', unidade: l.nome, codigo: null, nome_cartao: null, nome_digitado: 'nutricionista', refeicoes: 2, de: M.dia(-14), ate: M.dia(-7), sugestao_id: null });
    });
    var feitos = ler('semdono', {});
    return out.filter(function (x) { return !feitos[x.chave]; });
  }
  function refeicaoDiaResumo(de, ate, unidade) {
    var fim = M.dia(-1); if (!ate || ate > fim) ate = fim;
    var out = [], dias = M.intervalo(de || M.dia(-14), ate).reverse();
    dias.forEach(function (dia) {
      lojasDo(unidade).forEach(function (l, i) {
        var t = 0, nao = 0, sc = 0, acima = 0, ref = 0;
        EQUIPE.forEach(function (p) {
          if (p.loja !== l.id || !ativo(p)) return;
          var s = sitRef(p, dia); if (!s) return;
          t++; ref += s.onde_lancou ? 0 : s.n;
          if (s.situacao === 'NAO LANCOU') nao++; else if (s.situacao === 'SEM CARTAO') sc++; else if (s.situacao === 'ACIMA DO DIREITO') acima++;
        });
        var r = M.rng('rh-refdia|' + l.id + '|' + dia), sd = M.entre(r, 0, 2);
        var semDado = i === 1 && dia === M.dia(-4);
        out.push({ dia: dia, unidade: l.nome, trabalharam: t, refeicoes_total: ref + sd, nao_lancaram: nao, sem_cartao: sc, lancaram_demais: acima, sem_dono: sd,
          tem_dado_saipos: !semDado, alerta: (nao || sc) ? [nao ? nao + ' sem lançar' : '', sc ? sc + ' sem cartão' : ''].filter(Boolean).join(' · ') : 'OK' });
      });
    });
    return out;
  }
  function refeicaoPessoa(dia, unidade) {
    var l = M.loja(unidade); if (!l) return [];
    var cods = {}; comandas(l.id).forEach(function (c) { if (c.funcionario_id) cods[c.funcionario_id] = c.codigo; });
    var out = [];
    EQUIPE.forEach(function (p) {
      if (p.loja !== l.id || !ativo(p)) return;
      var s = sitRef(p, dia); if (!s) return;
      out.push({ nome: p.nome, entrada: s.b.batidas[0], saida: s.b.batidas[s.b.batidas.length - 1], horas: horasTxt(s.b), codigo: cods[p.id] != null ? cods[p.id] : null,
        direito: 1, refeicoes: s.onde_lancou ? 1 : s.n, tipos: s.tipos || '—', origem_dono: s.n ? (s.r() < 0.8 ? 'comanda' : 'nome digitado') : '—',
        situacao: s.onde_lancou ? 'OK' : s.situacao });
    });
    return out.sort(function (a, b) { return a.nome.localeCompare(b.nome); });
  }
  function refeicaoMotoboy(de, ate, unidade) {
    var fim = M.dia(-1); if (!ate || ate > fim) ate = fim;
    var out = [];
    M.intervalo(de || M.dia(-14), ate).reverse().forEach(function (dia) {
      lojasDo(unidade).forEach(function (l) {
        var peds = M.pedidos(dia, l.id).filter(function (x) { return !x.cancelado && x.canal !== 'retirada'; });
        [['Dia', function (x) { return x.min_pedido < 16 * 60; }], ['Noite', function (x) { return x.min_pedido >= 16 * 60; }]].forEach(function (bl) {
          var ps = peds.filter(bl[1]), mb = {};
          ps.forEach(function (x) { if (x.motoboy_id) mb[x.motoboy_id] = 1; });
          var n = Object.keys(mb).length, r = M.rng('rh-mbref|' + l.id + '|' + dia + '|' + bl[0]);
          var lanc = Math.max(0, n + M.pesado(r, [[0, 70], [1, 12], [-1, 18]]));
          out.push({ dia: dia, unidade: l.nome, bloco: bl[0], motoboys_rodaram: n, entregas: ps.length, refeicoes_lancadas: lanc, diferenca: lanc - n });
        });
      });
    });
    return out;
  }
  function clientesGrupo() {
    var g = ler('clientes', null);
    if (!g) g = [{ id: 1, nome: 'MOTOBOYS', grupo: 'motoboys', obs: 'cliente padrão dos motoboys' }];
    return g.map(function (c) { var r = M.rng('rh-cli|' + c.nome); return { id: c.id, nome: c.nome, grupo: c.grupo, refeicoes: M.entre(r, 40, 120), obs: c.obs }; });
  }
  function clientesCandidatos() {
    var marcados = {}; clientesGrupo().forEach(function (c) { marcados[c.nome] = 1; });
    return [
      { cliente: 'MOTOBOYS NOITE', refeicoes: 18, lojas: 2, de: M.dia(-21), ate: M.dia(-1) },
      { cliente: 'Consumidor não identificado', refeicoes: 9, lojas: M.lojas.length, de: M.dia(-29), ate: M.dia(-1) },
      { cliente: 'EQUIPE MANUTENÇÃO', refeicoes: 3, lojas: 1, de: M.dia(-12), ate: M.dia(-5) }
    ].filter(function (c) { return !marcados[c.cliente]; });
  }
  function comandasSaipos(unidade) {
    var l = M.loja(unidade); if (!l) return [];
    var off = (offsets().filter(function (o) { return o.unidade === l.nome; })[0] || {}).offset_card || 51000;
    var cad = {}; comandas(l.id).forEach(function (c) { cad[c.codigo] = c.nome; });
    var r = M.rng('rh-saipos|' + l.id), out = [];
    comandas(l.id).filter(function (c) { return c.ativo && c.funcionario_id; }).slice(0, 8).forEach(function (c) {
      out.push({ id_card: +off + (+c.codigo), codigo: c.codigo, refeicoes: M.entre(r, 6, 26), nomes_digitados: null, ja_cadastrado: c.nome });
    });
    [190, 191].forEach(function (cod) { out.push({ id_card: +off + cod, codigo: cod, refeicoes: M.entre(r, 1, 5), nomes_digitados: null, ja_cadastrado: cad[cod] || null }); });
    out.push({ id_card: null, codigo: null, refeicoes: M.entre(r, 2, 7), nomes_digitados: 'balcão · ficha avulsa', ja_cadastrado: null });
    return out;
  }
  function cortesias(de, ate, unidade) {
    var base = [
      [-2, 0, 'Guarda municipal', null, null, 'cortesia', 2, 'Clássico da Casa · Refrigerante Lata'],
      [-4, 1, 'Técnico da coifa', 'Prestador — manutenção', '(00) 90000-4321', 'prestador', 1, 'Duplo Smash'],
      [-6, 0, 'Visita do fornecedor', null, null, 'visita', 1, 'Salada Leve'],
      [-9, 2, 'Nutricionista', 'Consultoria de cardápio', '(00) 90000-8765', 'prestador', 1, 'Prato do Dia'],
      [-15, 1, 'Bombeiro civil (vistoria)', null, null, 'cortesia', 2, 'Clássico da Casa']
    ];
    var lids = lojasDo(unidade).map(function (l) { return l.id; });
    return base.map(function (x) { var l = M.lojas[x[1] % M.lojas.length]; return { dia: M.dia(x[0]), lojaId: l.id, unidade: l.nome, nome_digitado: x[2], cliente: x[3], telefone: x[4], rotulo: x[5], refeicoes: x[6], produtos: x[7] }; })
      .filter(function (c) { return lids.indexOf(c.lojaId) >= 0 && (!de || c.dia >= de); });
  }

  D.rpc('operacao_consulta', function (b, ctx) {
    var d = b.p_dados || {}, acao = b.p_acao;
    switch (acao) {
      case 'ponto_ao_vivo': return pontoAoVivo(d.unidade);
      case 'refeicao_lancada': return refeicaoLancadaHoje(d.unidade);
      case 'nao_pegou': return naoPegou(d.dia || M.dia(-1));
      case 'ponto_resolucoes':
        return resolucoes().filter(function (x) { return (!d.de || x.dia >= d.de) && (!d.ate || x.dia <= d.ate); })
          .map(function (x) { return { nome_citado: x.nome_citado, texto: x.texto, de_quem: x.de_quem, onde: x.onde, dia: x.dia }; });
      case 'ponto_resolver': {
        if (!d.nome || !d.dia || !String(d.texto || '').trim()) return { ok: false, erro: 'faltou o nome, o dia ou o texto' };
        var l = ler('resol', []);
        var txt = String(d.texto).trim() + (d.decisao === 'cobriu_loja' && d.loja ? ' (loja ' + d.loja + ')' : '');
        l.push({ nome_citado: d.nome, dia: d.dia, texto: txt, de_quem: d.quem || ctx.nome, onde: 'portal', decisao: d.decisao || 'outro' });
        gravar('resol', l);
        return { ok: true };
      }
      case 'cartoes': {
        var lid = d.unidade ? idLoja(d.unidade) : '';
        var cs = lid ? comandas(lid) : [].concat.apply([], M.lojas.map(function (x) { return comandas(x.id); }));
        return { cartoes: cs, equipe: equipeAtiva(d.unidade), offset: offsets() };
      }
      case 'cartao_recado':
        mudaComanda(d.unidade, d.codigo, { recado: d.recado || '', recado_por: d.quem || ctx.nome, recado_em: hojeBR() });
        return { ok: true };
      case 'cartao_salvar':
        (d.linhas || []).forEach(function (x) {
          mudaComanda(x.unidade || d.unidade, x.codigo, { nome: x.nome || '', funcionario_id: x.funcionario_id ? +x.funcionario_id : null, tipo: x.tipo || 'funcionario', ativo: x.ativo !== false, apagado: false });
        });
        return { ok: true, gravados: (d.linhas || []).length };
      case 'cartao_del': {
        var alvo = null;
        M.lojas.forEach(function (x) { comandas(x.id).forEach(function (c) { if (String(c.id) === String(d.id)) alvo = c; }); });
        if (!alvo) throw D.erro(404, 'código não encontrado');
        mudaComanda(alvo.unidade, alvo.codigo, { apagado: true });
        return { ok: true };
      }
      case 'offset_salvar': { var g = ler('offset', {}); g[idLoja(d.unidade)] = +d.offset_card; gravar('offset', g); return { ok: true }; }
      case 'descobrir_offset': {
        var off = (+d.id_card) - (+d.codigo);
        if (!isFinite(off)) throw D.erro(400, 'preencha o id interno e o número da comanda');
        var g2 = ler('offset', {}); g2[idLoja(d.unidade)] = off; gravar('offset', g2);
        return { ok: true, offset: off };
      }
      case 'comandas_saipos': return comandasSaipos(d.unidade);
      case 'importar_comandas': {
        var novos = 0;
        comandasSaipos(d.unidade).forEach(function (x) { if (x.codigo != null && !x.ja_cadastrado) { mudaComanda(d.unidade, x.codigo, { nome: 'COMANDA ' + x.codigo, tipo: 'funcionario', ativo: true, apagado: false }); novos++; } });
        return { ok: true, novos: novos };
      }
      case 'refeicao_dia': return refeicaoDiaResumo(d.de, d.ate, d.unidade);
      case 'refeicao_pessoa': return refeicaoPessoa(d.dia, d.unidade);
      case 'sem_dono': return semDonoBase(d.unidade, d.de, d.ate).map(function (x) { var o = {}; for (var k in x) if (k !== 'chave') o[k] = x[k]; return o; });
      case 'resolver_dono': {
        var f = ler('semdono', {});
        semDonoBase('', null, null).forEach(function (x) {
          if (x.unidade !== d.unidade) return;
          if ((d.tipo === 'comanda' && String(x.codigo) === String(d.codigo)) || (d.tipo !== 'comanda' && x.nome_digitado && (x.nome_digitado === d.texto))) f[x.chave] = d.tipo;
        });
        gravar('semdono', f);
        if (d.tipo === 'comanda' && d.funcionario_id) mudaComanda(d.unidade, d.codigo, { nome: 'COMANDA ' + d.codigo, funcionario_id: +d.funcionario_id, tipo: 'funcionario', ativo: true, apagado: false });
        return { ok: true };
      }
      case 'refeicao_motoboy': return refeicaoMotoboy(d.de, d.ate, d.unidade);
      case 'clientes_grupo': return clientesGrupo();
      case 'clientes_candidatos': return clientesCandidatos();
      case 'cliente_grupo_salvar': {
        var cg = ler('clientes', null) || [{ id: 1, nome: 'MOTOBOYS', grupo: 'motoboys', obs: 'cliente padrão dos motoboys' }];
        cg.push({ id: 100 + cg.length, nome: d.nome, grupo: d.grupo || 'motoboys', obs: d.obs || '' });
        gravar('clientes', cg); return { ok: true };
      }
      case 'cliente_grupo_del': {
        var cg2 = (ler('clientes', null) || [{ id: 1, nome: 'MOTOBOYS', grupo: 'motoboys', obs: 'cliente padrão dos motoboys' }]).filter(function (c) { return String(c.id) !== String(d.id); });
        gravar('clientes', cg2); return { ok: true };
      }
      case 'cortesias': return cortesias(d.de, d.ate, d.unidade);
    }
    throw D.erro(400, 'ação desconhecida na demonstração: ' + acao);
  });

  /* ---------------- refeicao fechada por mes ---------------- */
  D.rpc('rh_refeicao_porta', function (b) {
    if (!credOk(b.p_senha)) throw D.erro(401, 'Senha do escritório necessária', '28000');
    if (b.p_acao === 'mes') {
      var out = [], h = hojeBR(), ano = +h.slice(0, 4), mes = +h.slice(5, 7);
      for (var k = 1; k <= 3; k++) {
        var a = ano, m = mes - k; while (m < 1) { m += 12; a--; }
        EQUIPE.forEach(function (p) {
          if (p.admissao > a + '-' + pad(m) + '-28') return;
          var r = M.rng('rh-mes|' + p.id + '|' + a + '-' + m);
          var dias = M.entre(r, 21, 26), nao = M.pesado(r, [[0, 55], [1, 25], [2, 12], [3, 8]]), acima = M.pesado(r, [[0, 70], [1, 20], [2, 10]]);
          out.push({ ano: a, mes: m, nome: p.nome, dias_trabalhados: dias, dias_ok: dias - nao, dias_nao_pegou: nao, dias_acima: acima, refeicoes: dias - nao + acima });
        });
      }
      return out;
    }
    if (b.p_acao === 'sem_dono') return [
      { categoria: 'taxa / freela', refeicoes: 34 }, { categoria: 'cortesia', refeicoes: 12 },
      { categoria: 'visitante / prestador', refeicoes: 7 }, { categoria: 'sem identificação', refeicoes: 5 }
    ];
    throw D.erro(400, 'ação desconhecida: ' + b.p_acao);
  });
})();
