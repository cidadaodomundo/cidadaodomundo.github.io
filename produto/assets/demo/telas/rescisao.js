/* Simular rescisao (demonstracao): rh/rescisao.html.
   Simula a porta rh_rescisao_porta (pessoas, simular, emprestimos, emprestimo_novo, emprestimo_quitar).
   Precisa de telas/rhcaixa.js e telas/folha.js antes (DEMO.rhBase: pessoas, ocorrencias,
   horas do ponto, tabelas de exemplo e emprestimos da empresa).
   O calculo segue as regras gerais da CLT de forma simplificada: e uma estimativa de exemplo,
   quem fecha o valor oficial e a contabilidade. */
(function () {
  'use strict';
  if (!window.DEMO || !window.MUNDO || !window.DEMO.rhBase || !window.DEMO.rhBase.horas) return;
  var D = window.DEMO, M = window.MUNDO, B = D.rhBase;
  var R = B.REGRA, HOJE = M.hoje();
  var r2 = B.r2, rs = B.rs, brl = B.brl, fmtH = B.fmtH, num = B.num;
  var EXP = ['fim_experiencia', 'exp_antecipada_empresa', 'exp_antecipada_empregado'];

  /* ---------------- datas ---------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function diasNoMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function somaMeses(iso, n) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7) + n, d = +iso.slice(8, 10);
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    return y + '-' + pad(m) + '-' + pad(Math.min(d, diasNoMes(y, m)));
  }
  function anosEntre(a, b) {
    var n = +b.slice(0, 4) - +a.slice(0, 4);
    if (b.slice(5) < a.slice(5)) n--;
    return Math.max(0, n);
  }
  function mesesEntre(a, b) { return Math.max(0, (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)) - (b.slice(8) < a.slice(8) ? 1 : 0)); }
  function ultimoAniversario(adm, data) {
    var a = data.slice(0, 4) + adm.slice(4);
    if (a > data) a = (+data.slice(0, 4) - 1) + adm.slice(4);
    return a < adm ? adm : a;
  }
  /* avos de ferias: meses do periodo aquisitivo; fracao de 15 dias ou mais conta 1 */
  function avosFerias(ini, fim) {
    var avos = 0, cur = ini;
    for (var i = 0; i < 13 && cur <= fim; i++) {
      var prox = somaMeses(cur, 1);
      if (M.somaDias(prox, -1) <= fim) avos++;
      else if (B.difDias(cur, fim) + 1 >= 15) avos++;
      cur = prox;
    }
    return Math.min(12, avos);
  }
  /* avos de 13o: meses do ano em que trabalhou 15 dias ou mais */
  function avos13(ini, fim) {
    var avos = 0, y = fim.slice(0, 4);
    for (var m = 1; m <= 12; m++) {
      var m1 = y + '-' + pad(m) + '-01', mf = y + '-' + pad(m) + '-' + pad(diasNoMes(+y, m));
      var a = ini > m1 ? ini : m1, z = fim < mf ? fim : mf;
      if (a <= z && B.difDias(a, z) + 1 >= 15) avos++;
    }
    return avos;
  }

  /* ---------------- a simulacao ---------------- */
  function simular(d) {
    var p = B.porNome(d.nome);
    if (!p) throw D.erro(400, 'Pessoa não encontrada: ' + (d.nome || ''), 'P0001');
    var data = String(d.data || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw D.erro(400, 'Data de saída inválida', 'P0001');
    if (data < p.admissao) throw D.erro(400, 'A data de saída (' + brl(data) + ') é antes da admissão (' + brl(p.admissao) + ').', 'P0001');
    var motivo = String(d.motivo || ''), aviso = String(d.aviso || ''), op = d.opcoes || {};
    var ehExp = EXP.indexOf(motivo) >= 0;
    if (!ehExp && ['pedido', 'sem_justa_causa', 'justa_causa', 'acordo'].indexOf(motivo) < 0) throw D.erro(400, 'Motivo desconhecido', 'P0001');

    var sal = p.salario, grat = p.cargo_confianca ? sal * R.gratificacao_pct / 100 : 0, rem = sal + grat;
    var hora = B.valorHora(p);
    var anos = anosEntre(p.admissao, data), meses = mesesEntre(p.admissao, data);
    var mapa = B.mapaOcorr(), oc = mapa[p.id] || [];
    var linhas = [], avisos = [];
    function L(g, r, ref, pv, dv, como) { linhas.push({ g: g, r: r, ref: ref || '', p: pv == null ? null : r2(pv), d: dv == null ? null : r2(dv), como: como || '' }); }

    /* ---- verbas do mes ---- */
    var m1 = data.slice(0, 8) + '01';
    var ini = p.admissao > m1 ? p.admissao : m1;
    var ultimoDoMes = data.slice(0, 8) + pad(diasNoMes(+data.slice(0, 4), +data.slice(5, 7)));
    var dias = ini === m1 && data === ultimoDoMes ? 30 : Math.min(30, B.difDias(ini, data) + 1);
    var saldo = sal / 30 * dias;
    var G1 = 'Verbas do mes';
    L(G1, 'Saldo de salario', dias + ' dias', saldo, null, 'de ' + M.br(ini) + ' a ' + M.br(data) + ' · ' + rs(sal) + ' ÷ 30 × ' + dias);
    var baseMes = saldo;
    if (grat) { L(G1, 'Gratificação de função', R.gratificacao_pct + '%', grat / 30 * dias, null, 'cargo de confiança, proporcional aos dias'); baseMes += grat / 30 * dias; }

    /* horas: do inicio do ciclo de ponto da folha deste mes (dia 26 do mes anterior) ate a saida */
    var cIni = M.somaDias(B.mesDe(m1, -1), 25);
    var hs = d.horas && typeof d.horas === 'object' ? d.horas : null;
    var h = B.horas(p, cIni, data, oc);
    var he70 = h.he70, he100 = h.he100, not = h.noturno, faltasMin = 0, atraso = h.atraso;
    var horasDe;
    if (hs) {
      he70 = (+hs.he70_h || 0) * 60; he100 = (+hs.he100_h || 0) * 60; not = (+hs.noturno_h || 0) * 60;
      faltasMin = (+hs.faltas_h || 0) * 60; atraso = (+hs.faltas_parcial_h || 0) * 60;
      horasDe = 'digitadas por você (no lugar do Flash)';
      avisos.push('Usando as horas que você digitou, no lugar do Flash.');
    } else {
      horasDe = h.ate ? 'Flash (ponto) de ' + M.br(cIni) + ' a ' + M.br(h.ate) : 'sem batidas no Flash desde ' + M.br(cIni);
    }
    var vari = 0;
    if (he70 > 0) { var v1 = he70 / 60 * hora * (1 + R.he_pct / 100); L(G1, 'Hora extra ' + R.he_pct + '%', fmtH(he70), v1, null, rs(hora) + ' por hora × ' + num(1 + R.he_pct / 100)); vari += v1; }
    if (he100 > 0) { var v2 = he100 / 60 * hora * (1 + R.he100_pct / 100); L(G1, 'Hora extra ' + R.he100_pct + '% (domingo e feriado)', fmtH(he100), v2, null, rs(hora) + ' por hora × 2'); vari += v2; }
    if (not > 0) { var v3 = not / 52.5 * hora * R.noturno_pct / 100; L(G1, 'Adicional noturno ' + R.noturno_pct + '%', fmtH(not), v3, null, 'das 22h às 5h · hora noturna de 52min30s'); vari += v3; }
    if (vari > 0) {
      var df = B.domingosEFeriados(cIni, data);
      var vd = vari / Math.max(1, df.uteis) * df.dsr;
      L(G1, 'DSR sobre horas extras e adicional', df.dsr + '/' + df.uteis, vd, null, rs(vari) + ' ÷ ' + df.uteis + ' dias úteis × ' + df.dsr + ' domingos e feriados');
      vari += vd;
    }
    baseMes += vari;

    /* ---- aviso previo ---- */
    var G2 = 'Aviso previo';
    var diasLei = Math.min(90, 30 + 3 * anos);
    var diasAviso = 0, projecao = null, avisoInd = 0, descAviso = 0;
    if (motivo === 'sem_justa_causa') {
      diasAviso = diasLei;
      if (aviso === 'trabalhado') {
        L(G2, 'Aviso previo trabalhado', '30 dias', null, null, 'os dias trabalhados já entram no saldo de salário; a jornada cai 2 horas por dia (ou 7 dias corridos de folga no fim)');
        if (diasLei > 30) {
          avisoInd = rem / 30 * (diasLei - 30);
          L(G2, 'Aviso previo indenizado (dias a mais por tempo de casa)', (diasLei - 30) + ' dias', avisoInd, null, '3 dias por ano completo de casa (' + anos + (anos === 1 ? ' ano' : ' anos') + ')');
          projecao = M.somaDias(data, diasLei - 30);
        }
      } else {
        avisoInd = rem / 30 * diasLei;
        L(G2, 'Aviso previo indenizado', diasLei + ' dias', avisoInd, null, '30 dias + 3 por ano completo de casa (' + anos + (anos === 1 ? ' ano' : ' anos') + ') · a pessoa não trabalha');
        projecao = M.somaDias(data, diasLei);
      }
    } else if (motivo === 'acordo') {
      diasAviso = Math.round(diasLei / 2);
      avisoInd = rem / 30 * diasLei / 2;
      L(G2, 'Aviso previo indenizado pela metade', diasAviso + ' dias', avisoInd, null, 'metade de ' + diasLei + ' dias (acordo entre as partes, art. 484-A da CLT)');
      projecao = M.somaDias(data, diasAviso);
    } else if (motivo === 'pedido') {
      diasAviso = 30;
      if (aviso === 'descontado') {
        descAviso = sal;
        L(G2, 'Aviso previo nao cumprido', '30 dias', null, descAviso, 'pediu as contas e não vai trabalhar o aviso: a empresa pode descontar 30 dias (art. 487, §2º)');
      } else if (aviso === 'parcial') {
        var feitos = Math.max(0, Math.min(30, parseInt(op.dias_cumpridos, 10) || 0));
        descAviso = sal / 30 * (30 - feitos);
        L(G2, 'Aviso previo cumprido em parte', (30 - feitos) + ' dias', null, descAviso || null, 'trabalhou ' + feitos + ' de 30 dias; desconta os que faltaram');
      } else if (aviso === 'dispensado') {
        L(G2, 'Aviso previo dispensado', '', null, null, 'a empresa liberou do aviso, sem desconto (guarde a carta de dispensa assinada)');
      } else {
        L(G2, 'Aviso previo cumprido', '30 dias', null, null, 'trabalhou os 30 dias; já entram no saldo de salário');
      }
    }

    /* ---- experiencia ---- */
    var fimCtr = op.fim_contrato && /^\d{4}-\d{2}-\d{2}$/.test(op.fim_contrato) ? op.fim_contrato : M.somaDias(p.admissao, R.experiencia_dias - 1);
    if (ehExp) {
      var G3 = 'Contrato de experiencia';
      var falta = Math.max(0, B.difDias(data, fimCtr));
      if (data > fimCtr) avisos.push('A data de saída passou do fim do contrato de experiência (' + brl(fimCtr) + '): o contrato virou por prazo indeterminado. Use pedido de demissão ou demissão.');
      if (motivo === 'fim_experiencia') {
        L(G3, 'Fim do contrato de experiencia', '', null, null, 'termina no prazo combinado (' + brl(fimCtr) + '): sem aviso prévio e sem multa do FGTS');
        if (data !== fimCtr && data <= fimCtr) avisos.push('O último dia do contrato é ' + brl(fimCtr) + ', mas a data de saída é ' + brl(data) + '. Se a saída for antes, escolha "A empresa encerra antes do fim" ou "O funcionário sai antes do fim".');
      } else if (motivo === 'exp_antecipada_empresa') {
        var v479 = rem / 30 * falta / 2;
        L(G3, 'Indenizacao art. 479 (metade dos dias que faltavam)', falta + ' dias ÷ 2', v479 || null, null, 'a empresa encerrou ' + falta + ' dias antes de ' + brl(fimCtr));
        avisoInd += v479;
      } else {
        var v480 = rem / 30 * falta / 2;
        L(G3, 'Indenizacao art. 480 (prejuizo da empresa)', falta + ' dias ÷ 2', null, v480 || null, 'até metade dos dias que faltavam; é opcional — a empresa pode não cobrar');
        descAviso += v480;
      }
    } else if (B.difDias(p.admissao, data) < R.experiencia_dias && motivo !== 'justa_causa') {
      avisos.push('Ainda em experiência até ' + brl(fimCtr) + ': talvez o certo seja encerrar a experiência (custa menos que demitir).');
    }

    /* ---- 13o ---- */
    var G4 = '13o salario';
    var fimCont = projecao && projecao.slice(0, 4) === data.slice(0, 4) ? projecao : (projecao ? data.slice(0, 4) + '-12-31' : data);
    var ini13 = p.admissao > data.slice(0, 4) + '-01-01' ? p.admissao : data.slice(0, 4) + '-01-01';
    var mv = B.mediaVariaveis(p, data);
    var base13 = rem + mv.media;
    var v13 = 0, a13 = 0;
    if (motivo === 'justa_causa') {
      L(G4, '13o salario proporcional', '', null, null, 'na justa causa a pessoa perde o 13º proporcional');
    } else {
      a13 = avos13(ini13, fimCont);
      v13 = base13 / 12 * a13;
      L(G4, '13o salario proporcional', a13 + '/12', v13 || null, null, '(' + rs(rem) + (mv.media ? ' + média das variáveis ' + rs(mv.media) : '') + ') ÷ 12 × ' + a13 + (projecao ? ' · conta a projeção do aviso até ' + M.br(fimCont) : ''));
      if (data >= data.slice(0, 4) + '-11-30') {
        L(G4, 'Adiantamento do 13o (1ª parcela)', '', null, sal / 2, 'pago até 30/11');
      }
    }

    /* ---- ferias ---- */
    var G5 = 'Ferias';
    var aqIni = ultimoAniversario(p.admissao, data);
    var baseF = rem + mv.media;
    var vencida = anos >= 1 && M.rng('ferias|' + p.id)() < 0.3;
    var vFer = 0;
    if (vencida) {
      var vIni = somaMeses(aqIni, -12), vFim = M.somaDias(aqIni, -1);
      L(G5, 'Ferias vencidas', '30 dias', baseF, null, 'período de ' + brl(vIni) + ' a ' + brl(vFim) + ' ainda não tirado');
      L(G5, '1/3 das ferias vencidas', '', baseF / 3, null, 'um terço constitucional');
      vFer += baseF * 4 / 3;
      avisos.push('Tem férias vencidas (período de ' + brl(vIni) + ' a ' + brl(vFim) + '): se passar do prazo de concessão, pagam em dobro.');
    }
    if (motivo === 'justa_causa') {
      L(G5, 'Ferias proporcionais', '', null, null, 'na justa causa a pessoa perde as férias proporcionais (as vencidas continuam)');
    } else {
      var aF = avosFerias(aqIni, projecao || data);
      if (aF > 0) {
        var vf = baseF / 12 * aF;
        L(G5, 'Ferias proporcionais', aF + '/12', vf, null, 'período aquisitivo desde ' + brl(aqIni) + (projecao ? ', com a projeção do aviso' : ''));
        L(G5, '1/3 das ferias proporcionais', '', vf / 3, null, 'um terço constitucional');
        vFer += vf * 4 / 3;
      }
    }

    /* ---- descontos ---- */
    var G6 = 'Descontos';
    var descFalta = 0;
    if (!hs && h.faltas.length) {
      var vfa = sal / 30 * h.faltas.length, vds = sal / 30 * Math.min(h.faltas.length, 4);
      L(G6, 'Faltas', h.faltas.length + (h.faltas.length > 1 ? ' dias' : ' dia'), null, vfa, 'sem justificativa: ' + h.faltas.map(M.br).join(', '));
      L(G6, 'DSR das faltas', Math.min(h.faltas.length, 4) + (h.faltas.length > 1 ? ' dias' : ' dia'), null, vds, 'perde o descanso da semana em que faltou');
      descFalta += vfa + vds;
    } else if (faltasMin > 0) {
      var vfh = faltasMin / 60 * hora;
      L(G6, 'Faltas', fmtH(faltasMin), null, vfh, 'horas digitadas · ' + rs(hora) + ' por hora');
      descFalta += vfh;
    }
    if (atraso > 0) {
      var vat = atraso / 60 * hora;
      L(G6, 'Faltas parciais (atrasos)', fmtH(atraso), null, vat, hs ? 'horas digitadas' : 'atrasos acima da tolerância de ' + R.tolerancia_min + ' min (regra de exemplo)');
      descFalta += vat;
    }
    var baseInss = Math.max(0, baseMes - descFalta);
    var vInss = B.inss(baseInss);
    L(G6, 'INSS sobre o mes', num(baseInss ? vInss / baseInss * 100 : 0) + '%', null, vInss || null, 'tabela de exemplo sobre ' + rs(baseInss) + ' (aviso indenizado e férias indenizadas não entram)');
    var vInss13 = v13 ? B.inss(v13) : 0;
    if (vInss13) L(G6, 'INSS sobre o 13o', num(vInss13 / v13 * 100) + '%', null, vInss13, 'calculado à parte, sobre ' + rs(v13));
    var vIr = B.irrf(baseInss, vInss) + (v13 ? B.irrf(v13, vInss13) : 0);
    if (vIr > 0) L(G6, 'IRRF', '', null, vIr, 'tabela de exemplo; o 13º é tributado à parte');
    else L(G6, 'IRRF', 'isento', null, null, 'renda até R$ 5.000,00 no mês (regra de exemplo)');
    var vt = 0;
    if (B.optaVT(p) && saldo > 0) { vt = saldo * R.vt_pct / 100; L(G6, 'Vale-transporte', R.vt_pct + '%', null, vt, R.vt_pct + '% do saldo de salário'); }
    var diaAdt = B.diaUtilAntes(M.somaDias(m1, 19)), adt = 0;
    if (data >= diaAdt && p.admissao <= M.somaDias(m1, R.adiantamento_ate_dia - 1)) {
      adt = sal * R.adiantamento_pct / 100;
      L(G6, 'Adiantamento do mes', R.adiantamento_pct + '%', null, adt, 'pago em ' + brl(diaAdt));
    }
    var emp = B.abertoDe(p.nome), totEmp = 0, limite = rem;
    if (emp.length) {
      var usado = 0;
      emp.forEach(function (x) {
        var v = Math.min(x.valor, Math.max(0, limite - usado));
        usado += v;
        L(G6, 'Emprestimo da empresa', brl(x.data), null, v || null, (x.forma ? x.forma + ' · ' : '') + (x.obs || 'em aberto') + (v < x.valor ? ' · descontado só ' + rs(v) + ' de ' + rs(x.valor) : ''));
      });
      totEmp = emp.reduce(function (a, x) { return a + x.valor; }, 0);
      avisos.push('Empréstimo da empresa em aberto entra como desconto: ' + rs(totEmp) + '.');
      if (totEmp > limite) avisos.push('O desconto de empréstimo ficou limitado a 1 mês de remuneração (' + rs(limite) + ', art. 477 par. 5 da CLT). O resto (' + rs(totEmp - limite) + ') precisa ser combinado à parte.');
    }

    /* ---- totais ---- */
    var prov = 0, desc = 0;
    linhas.forEach(function (l) { prov += l.p || 0; desc += l.d || 0; });
    prov = r2(prov); desc = r2(desc);
    var liq = r2(prov - desc);
    if (liq < 0) avisos.push('Os descontos passaram dos proventos: a pessoa não teria nada a receber. Confira com a contabilidade antes de decidir.');

    /* ---- custo da empresa ---- */
    var multa = motivo === 'sem_justa_causa' || motivo === 'exp_antecipada_empresa' ? 40 : motivo === 'acordo' ? 20 : 0;
    var baseFgts = Math.max(0, baseMes - descFalta) + avisoInd + v13;
    var fgtsResc = r2(baseFgts * R.fgts_pct / 100);
    var saldoEst = r2(rem * R.fgts_pct / 100 * Math.max(1, meses));
    var como = 'FGTS de ' + R.fgts_pct + '% sobre ' + rs(baseFgts) + ' (verbas do mês, aviso indenizado e 13º). Saldo estimado: ' + R.fgts_pct + '% do salário × ' + Math.max(1, meses) + (meses === 1 ? ' mês' : ' meses') + ' de casa, sem correção e sem saques — confira o extrato do FGTS antes de recolher a multa.';
    if (motivo === 'acordo') como += ' No acordo a pessoa saca 80% do FGTS e não tem seguro-desemprego.';
    if (motivo === 'pedido' || motivo === 'justa_causa' || motivo === 'exp_antecipada_empregado') como += ' Neste motivo não tem multa e a pessoa não saca o FGTS.';

    /* ---- outros avisos ---- */
    if (motivo === 'justa_causa') {
      var desde = M.somaDias(data, -180);
      var nAdv = oc.filter(function (o) { return o.tipo === 'ADVERTENCIA' && o.situacao === 'aprovado' && o.data >= desde; }).length;
      var nSus = oc.filter(function (o) { return o.tipo === 'SUSPENSAO' && o.situacao === 'aprovado' && o.data >= desde; }).length;
      avisos.push(nAdv || nSus
        ? 'Justa causa precisa de prova e de gradação (orientação, advertência, suspensão). Nos últimos 6 meses: ' + nAdv + ' advertência(s) e ' + nSus + ' suspensão(ões) registradas. Converse com a contabilidade antes.'
        : 'Nenhuma advertência ou suspensão registrada nos últimos 6 meses: justa causa sem histórico costuma cair na Justiça do Trabalho. Converse com a contabilidade antes.');
    }
    if (!hs && data > M.somaDias(HOJE, -1)) avisos.push('A data de saída é hoje ou depois: horas extras e faltas contadas só até ontem.');
    if (!hs && h.incompletos) avisos.push(h.incompletos + (h.incompletos > 1 ? ' dias com batida faltando' : ' dia com batida faltando') + ' no ponto desde o fechamento: arrume na Caixa de entrada do RH antes de fechar a conta.');
    var pend = oc.filter(function (o) { return o.situacao === 'novo'; }).length;
    if (pend) avisos.push('Tem ' + pend + (pend > 1 ? ' registros' : ' registro') + ' desta pessoa esperando decisão na Caixa de entrada do RH.');
    avisos.push('Prazo para pagar: até ' + brl(M.somaDias(data, 10)) + ' (10 dias depois do último dia, art. 477 da CLT).');

    return {
      pessoa: { nome: p.nome, cargo: p.cargo, empresa: B.empresa(p.loja), admissao: p.admissao, anos_de_casa: anos, salario: sal },
      entrada: { motivo: motivo, aviso: ehExp ? '' : aviso, data: data, dias_aviso: diasAviso || null, projecao: projecao, horas_de: horasDe },
      linhas: linhas,
      totais: { proventos: prov, descontos: desc, liquido: liq },
      empresa: { fgts_pct: R.fgts_pct, fgts_rescisao: fgtsResc, multa_pct: multa, saldo_fgts_estimado: saldoEst, multa_estimada: r2((saldoEst + fgtsResc) * multa / 100), como: como },
      avisos: avisos
    };
  }

  D.rpc('rh_rescisao_porta', function (b, ctx) {
    var u = B.exige(b, ctx, 'rescisao');
    var a = b.p_acao, d = b.p_dados || {};
    if (a === 'pessoas') {
      return B.ativos.map(function (p) { return { nome: p.nome, cargo: p.cargo }; })
        .sort(function (x, y) { return x.nome.localeCompare(y.nome, 'pt-BR'); });
    }
    if (a === 'simular') return simular(d);
    if (a === 'emprestimos') return B.emprestimos();
    if (a === 'emprestimo_novo') {
      if (!B.porNome(d.nome)) throw D.erro(400, 'Escolha a pessoa', 'P0001');
      if (!(+d.valor > 0)) throw D.erro(400, 'Valor inválido', 'P0001');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.data || ''))) throw D.erro(400, 'Data inválida', 'P0001');
      return { ok: true, id: B.emprestimoNovo(d, u.nome) };
    }
    if (a === 'emprestimo_quitar') {
      if (!B.emprestimos().some(function (x) { return x.id === +d.id; })) throw D.erro(400, 'Empréstimo não encontrado', 'P0001');
      B.emprestimoQuitar(+d.id);
      return { ok: true };
    }
    throw D.erro(400, 'Ação desconhecida: ' + a, 'P0001');
  });
})();
