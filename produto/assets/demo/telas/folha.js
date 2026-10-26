/* Folha do mes (demonstracao): rh/folha.html.
   Simula a porta rh_folha_porta (mes, pessoa, bonificacao).
   Precisa de telas/rhcaixa.js antes (DEMO.rhBase: pessoas e ocorrencias).
   Salarios vem de MUNDO.equipe; horas extras, adicional noturno, faltas e atrasos saem de
   MUNDO.batidas no ciclo de ponto (26 a 25). Tabelas de INSS/IRRF e regras da casa sao de
   exemplo e configuraveis (REGRA abaixo).
   Tambem acrescenta em DEMO.rhBase o calculo usado pela simulacao de rescisao e a lista de
   emprestimos da empresa (localStorage com prefixo "demo_rhresc_"). */
(function () {
  'use strict';
  if (!window.DEMO || !window.MUNDO || !window.DEMO.rhBase) return;
  var D = window.DEMO, M = window.MUNDO, B = D.rhBase;
  var HOJE = M.hoje();

  /* regras de exemplo, configuraveis */
  var REGRA = {
    horas_mes: 220, adiantamento_pct: 40, adiantamento_ate_dia: 15, gratificacao_pct: 20,
    he_pct: 70, he100_pct: 100, noturno_pct: 20, vt_pct: 6, tolerancia_min: 10,
    bonificacao_mes: 150, fgts_pct: 8, experiencia_dias: 90
  };
  var FERIADOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
  var NOMEMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var NOMEMES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var TIPOS_BON = ['ADVERTENCIA', 'SUSPENSAO', 'FALTA', 'ATESTADO'];
  var TIPO_TXT = { ADVERTENCIA: 'advertência', SUSPENSAO: 'suspensão', FALTA: 'falta', ATESTADO: 'atestado' };

  /* ---------------- utilidades ---------------- */
  function r2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtH(min) { min = Math.round(min || 0); return Math.floor(min / 60) + ':' + pad(min % 60); }
  function rs(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(v, c) { return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: c == null ? 2 : c, maximumFractionDigits: c == null ? 2 : c }); }
  function brl(iso) { return String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4); }
  function ehFeriado(d) { return FERIADOS.indexOf(String(d).slice(5, 10)) >= 0; }
  function mesDe(iso, n) { /* primeiro dia do mes de iso somado a n meses */
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7) + (n || 0);
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    return y + '-' + pad(m) + '-01';
  }
  function fimDoMes(iso) { return M.somaDias(mesDe(iso, 1), -1); }
  function diaUtilAntes(d) { var w = M.diaSemana(d); return w === 6 ? M.somaDias(d, -1) : w === 0 ? M.somaDias(d, -2) : d; }
  function quintoDiaUtil(mes1) { /* sabado conta como dia util; domingo e feriado nao */
    var d = mes1, n = 0;
    for (var i = 0; i < 20; i++) { if (M.diaSemana(d) !== 0 && !ehFeriado(d)) { n++; if (n === 5) return d; } d = M.somaDias(d, 1); }
    return d;
  }
  function ultimoDiaUtil(mes1) { var d = fimDoMes(mes1); while (M.diaSemana(d) === 0 || M.diaSemana(d) === 6 || ehFeriado(d)) d = M.somaDias(d, -1); return d; }
  function ciclo(comp) { return { ini: M.somaDias(mesDe(comp, -1), 25), fim: M.somaDias(comp, 24) }; }
  function valorHora(p) { return p.salario / REGRA.horas_mes; }
  function optaVT(p) { return M.rng('vt|' + p.id)() < 0.65; }

  /* ---------------- impostos (tabelas de exemplo) ---------------- */
  var FAIXAS_INSS = [[1518.00, 0.075], [2793.88, 0.09], [4190.83, 0.12], [8157.41, 0.14]];
  function inss(base) {
    var t = 0, ant = 0;
    for (var i = 0; i < FAIXAS_INSS.length; i++) {
      var f = FAIXAS_INSS[i];
      if (base > ant) t += (Math.min(base, f[0]) - ant) * f[1];
      ant = f[0];
    }
    return r2(t);
  }
  var FAIXAS_IR = [[2428.80, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [1e12, 0.275, 908.73]];
  function irrf(bruto, inssV) {
    var base = Math.max(0, bruto - inssV), imp = 0;
    for (var i = 0; i < FAIXAS_IR.length; i++) if (base <= FAIXAS_IR[i][0]) { imp = base * FAIXAS_IR[i][1] - FAIXAS_IR[i][2]; break; }
    imp = Math.max(0, imp);
    var red = bruto <= 5000 ? imp : bruto <= 7350 ? Math.max(0, 978.62 - 0.133145 * bruto) : 0;
    return r2(Math.max(0, imp - red));
  }

  /* ---------------- ocorrencias por pessoa ---------------- */
  function mapaOcorr() {
    var m = {};
    B.ocorrencias().forEach(function (o) {
      if (!o.pessoa_id) return;
      (m[o.pessoa_id] = m[o.pessoa_id] || []).push(o);
    });
    return m;
  }
  function faltaAbonada(lista, d) {
    return (lista || []).some(function (o) { return o.tipo === 'FALTA' && o.data === d && o.situacao === 'recusado'; });
  }

  /* ---------------- horas do ponto num periodo ---------------- */
  function horas(p, ini, fim, oc) {
    var h = { dias: 0, he70: 0, he100: 0, noturno: 0, atraso: 0, faltas: [], abonadas: 0, atestado: 0, incompletos: 0, ate: null };
    var de = p.admissao > ini ? p.admissao : ini;
    var ate = fim;
    if (p.saiu_em && p.saiu_em < ate) ate = p.saiu_em;
    var ontem = M.somaDias(HOJE, -1);
    if (ate > ontem) ate = ontem;
    if (de > ate) return h;
    h.ate = ate;
    M.intervalo(de, ate).forEach(function (d) {
      var b = M.batidas(p, d);
      if (b.situacao === 'FOLGA') return;
      if (b.situacao === 'FALTA') { if (faltaAbonada(oc, d)) h.abonadas++; else h.faltas.push(d); return; }
      if (b.situacao === 'ATESTADO') { h.atestado++; return; }
      if (!b.batidas || !b.batidas.length) return;
      h.dias++;
      if (b.batidas.length < 4) { h.incompletos++; return; }
      if (ehFeriado(d)) { h.he100 += b.trabalhado_min || 0; }
      else if (b.extra_min > REGRA.tolerancia_min) h.he70 += b.extra_min;
      if (b.atraso_min > REGRA.tolerancia_min) h.atraso += b.atraso_min;
      var e = M.minDe(b.batidas[0]), s = M.minDe(b.batidas[3]);
      if (s < e) s += 1440;
      h.noturno += Math.max(0, Math.min(s, 29 * 60) - Math.max(e, 22 * 60));
    });
    return h;
  }
  function domingosEFeriados(ini, fim) {
    var u = 0, df = 0;
    M.intervalo(ini, fim).forEach(function (d) { if (M.diaSemana(d) === 0 || ehFeriado(d)) df++; else u++; });
    return { uteis: u, dsr: df };
  }

  /* ---------------- bonificacao por mes ---------------- */
  function bonusMes(p, mes1, lista) {
    var fim = fimDoMes(mes1), mes = mes1.slice(0, 7);
    if (p.admissao > fim) return { mes: mes, antes_admissao: true, ganhou: false, valor: 0, motivos: [] };
    if (mes1 > HOJE) return { mes: mes, futuro: true, ganhou: false, valor: 0, motivos: [] };
    var mot = (lista || []).filter(function (o) {
      if (TIPOS_BON.indexOf(o.tipo) < 0 || o.situacao !== 'aprovado') return false; /* so conta o que ja foi aprovado na Caixa de entrada */
      var a = o.data, z = o.data_fim || o.data;
      return a <= fim && z >= mes1;
    }).map(function (o) { return { tipo: o.tipo, data: o.data }; })
      .sort(function (x, y) { return x.data < y.data ? -1 : 1; });
    var ganhou = !mot.length;
    return { mes: mes, ganhou: ganhou, valor: ganhou ? REGRA.bonificacao_mes : 0, motivos: mot };
  }
  function mesesDoTrimestre(ano, tri) {
    var r = [];
    for (var k = 0; k < 3; k++) r.push(ano + '-' + pad((tri - 1) * 3 + k + 1) + '-01');
    return r;
  }

  /* ---------------- emprestimos da empresa ---------------- */
  function lerE(k, padrao) { try { var v = localStorage.getItem('demo_rhresc_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravarE(k, v) { try { localStorage.setItem('demo_rhresc_' + k, JSON.stringify(v)); } catch (e) {} }
  var EMP_BASE = (function () {
    var esc = D.usuarios.escritorio.nome, l = [];
    function add(p, valor, dias, forma, obs, origem, quitado) {
      if (!p || l.some(function (x) { return x.nome === p.nome; })) return;
      l.push({ id: 700 + l.length + 1, nome: p.nome, valor: valor, data: M.dia(dias), forma: forma, obs: obs, origem: origem, criado_por: esc,
        quitado_em: quitado ? M.dia(quitado) : null, criado_em: M.dia(dias) });
    }
    add(B.comum(0, 2), 800, -75, 'PIX', 'se sair antes de devolver, o resto entra na rescisão', 'planilha antiga do escritório');
    add(B.comum(1, 6), 1500, -40, 'Transferência', 'combinado devolver em 3 vezes', 'cadastrado no portal');
    add(B.comum(0, 9), 350, -12, 'PIX', '', 'cadastrado no portal');
    add(B.comum(2, 4), 600, -160, 'Dinheiro', 'devolvido em dinheiro no caixa do escritório', 'planilha antiga do escritório', -30);
    return l;
  })();
  function emprestimos() {
    var q = lerE('quitados', {});
    return EMP_BASE.concat(lerE('emprestimos', [])).map(function (x) {
      var c = {}; for (var k in x) c[k] = x[k];
      if (!c.quitado_em && q[c.id]) c.quitado_em = q[c.id];
      return c;
    }).sort(function (a, b) { return (a.quitado_em ? 1 : 0) - (b.quitado_em ? 1 : 0) || (a.data < b.data ? 1 : -1); });
  }
  function emprestimoNovo(d, quem) {
    var l = lerE('emprestimos', []);
    var id = 800 + l.length + 1;
    l.push({ id: id, nome: d.nome, valor: r2(d.valor), data: d.data, forma: d.forma || '', obs: d.obs || '', origem: 'cadastrado no portal', criado_por: quem, quitado_em: null, criado_em: HOJE });
    gravarE('emprestimos', l);
    return id;
  }
  function emprestimoQuitar(id) { var q = lerE('quitados', {}); q[id] = HOJE; gravarE('quitados', q); }
  function abertoDe(nome) { return emprestimos().filter(function (x) { return x.nome === nome && !x.quitado_em; }); }

  /* ---------------- folha de uma pessoa num mes ---------------- */
  function calcula(p, comp, mapa) {
    mapa = mapa || mapaOcorr();
    var oc = mapa[p.id] || [];
    var cy = ciclo(comp), hora = valorHora(p);
    var linhas = [], fora = [], avisos = [];
    function L(g, r, ref, pv, dv, como) { linhas.push({ g: g, r: r, ref: ref || '', p: pv == null ? null : r2(pv), d: dv == null ? null : r2(dv), como: como || '' }); }

    /* dias pagos no ciclo */
    var de = p.admissao > cy.ini ? p.admissao : cy.ini;
    var ate = p.saiu_em && p.saiu_em < cy.fim ? p.saiu_em : cy.fim;
    var dias = Math.max(0, Math.min(30, B.difDias(de, ate) + 1));
    var sal = r2(p.salario / 30 * dias);
    var h = horas(p, cy.ini, cy.fim, oc);
    var dsrBase = domingosEFeriados(cy.ini, cy.fim);

    L('Proventos', 'Salario', dias + ' dias', sal, null,
      dias < 30 ? (p.admissao > cy.ini ? 'proporcional à admissão em ' + brl(p.admissao) : 'proporcional até a saída em ' + brl(p.saiu_em)) + ' · ' + rs(p.salario) + ' ÷ 30 × ' + dias : 'salário do cargo ' + (p.cargo || ''));
    var prov = sal;
    if (p.cargo_confianca) {
      var gr = sal * REGRA.gratificacao_pct / 100;
      L('Proventos', 'Gratificacao de funcao', REGRA.gratificacao_pct + '%', gr, null, 'cargo de confiança · ' + REGRA.gratificacao_pct + '% do salário (regra de exemplo)');
      prov += gr;
    }
    var vari = 0;
    if (h.he70 > 0) {
      var v70 = h.he70 / 60 * hora * (1 + REGRA.he_pct / 100);
      L('Proventos', 'Hora extra ' + REGRA.he_pct + '%', fmtH(h.he70), v70, null, rs(hora) + ' por hora × ' + num(1 + REGRA.he_pct / 100) + ' · passou mais de ' + REGRA.tolerancia_min + ' min da escala');
      vari += v70;
    }
    if (h.he100 > 0) {
      var v100 = h.he100 / 60 * hora * (1 + REGRA.he100_pct / 100);
      L('Proventos', 'Hora extra ' + REGRA.he100_pct + '% (feriado)', fmtH(h.he100), v100, null, 'trabalhou no feriado sem folga compensada · ' + rs(hora) + ' por hora × 2');
      vari += v100;
    }
    if (h.noturno > 0) {
      var vn = h.noturno / 52.5 * hora * REGRA.noturno_pct / 100;
      L('Proventos', 'Adicional noturno ' + REGRA.noturno_pct + '%', fmtH(h.noturno), vn, null, 'das 22h às 5h · hora noturna de 52min30s');
      vari += vn;
    }
    if (vari > 0) {
      var vd = vari / Math.max(1, dsrBase.uteis) * dsrBase.dsr;
      L('Proventos', 'DSR sobre horas extras e adicional', dsrBase.dsr + '/' + dsrBase.uteis, vd, null, rs(vari) + ' ÷ ' + dsrBase.uteis + ' dias úteis × ' + dsrBase.dsr + ' domingos e feriados');
      vari += vd;
    }
    prov += vari;

    var desc = 0, descFalta = 0;
    if (h.faltas.length) {
      var vf = p.salario / 30 * h.faltas.length;
      L('Descontos', 'Faltas', h.faltas.length + (h.faltas.length > 1 ? ' dias' : ' dia'), null, vf, 'sem justificativa: ' + h.faltas.map(M.br).join(', '));
      var vdsr = p.salario / 30 * Math.min(h.faltas.length, 4);
      L('Descontos', 'DSR das faltas', Math.min(h.faltas.length, 4) + (h.faltas.length > 1 ? ' dias' : ' dia'), null, vdsr, 'perde o descanso remunerado da semana em que faltou');
      descFalta += vf + vdsr;
    }
    if (h.atraso > 0) {
      var va = h.atraso / 60 * hora;
      L('Descontos', 'Atrasos', fmtH(h.atraso), null, va, 'atrasos acima da tolerância de ' + REGRA.tolerancia_min + ' min (regra de exemplo)');
      descFalta += va;
    }
    desc += descFalta;
    var baseInss = Math.max(0, prov - descFalta);
    var vi = inss(baseInss);
    L('Descontos', 'INSS', num(baseInss ? vi / baseInss * 100 : 0) + '%', null, vi, 'tabela progressiva de exemplo sobre ' + rs(baseInss));
    desc += vi;
    var vir = irrf(baseInss, vi);
    if (vir > 0) { L('Descontos', 'IRRF', '', null, vir, 'tabela de exemplo sobre ' + rs(baseInss - vi) + ', já com a redução para renda até R$ 7.350,00'); desc += vir; }
    else L('Descontos', 'IRRF', 'isento', null, null, 'renda do mês até R$ 5.000,00 (regra de exemplo)');
    if (optaVT(p) && sal > 0) {
      var vt = sal * REGRA.vt_pct / 100;
      L('Descontos', 'Vale-transporte', REGRA.vt_pct + '%', null, vt, REGRA.vt_pct + '% do salário · a empresa paga o resto');
      desc += vt;
    }
    var diaAdt = diaUtilAntes(M.somaDias(comp, 19));
    var adt = 0;
    if (p.admissao <= M.somaDias(comp, REGRA.adiantamento_ate_dia - 1) && !(p.saiu_em && p.saiu_em < diaAdt)) {
      adt = r2(p.salario * REGRA.adiantamento_pct / 100);
      L('Descontos', 'Adiantamento (dia 20)', REGRA.adiantamento_pct + '%', null, adt, 'pago em ' + brl(diaAdt));
      desc += adt;
    }
    L('Informativo', 'FGTS do mes', REGRA.fgts_pct + '%', null, null, 'a empresa deposita ' + rs(baseInss * REGRA.fgts_pct / 100) + ' (' + REGRA.fgts_pct + '% sobre ' + rs(baseInss) + '); não sai do salário');

    /* fora da folha */
    var trimPaga = (+comp.slice(5, 7)) % 3 === 0;
    var bonif = [];
    var tri = Math.floor((+comp.slice(5, 7) - 1) / 3) + 1;
    mesesDoTrimestre(+comp.slice(0, 4), tri).forEach(function (m1) {
      if (m1 > comp) return;
      var b = bonusMes(p, m1, oc);
      if (!b.antes_admissao && !b.futuro) bonif.push({ mes: b.mes, ganhou: b.ganhou, valor: b.valor });
    });
    var vFora = 0;
    if (trimPaga && !p.saiu) {
      var vb = bonif.reduce(function (a, b) { return a + b.valor; }, 0);
      var ganhos = bonif.filter(function (b) { return b.ganhou; }).map(function (b) { return NOMEMES3[+b.mes.slice(5) - 1]; });
      fora.push({ r: 'Bonificacao do trimestre', como: ganhos.length ? 'meses sem ocorrência: ' + ganhos.join(', ') : 'perdeu os três meses', p: vb ? r2(vb) : null, d: null });
      vFora += vb;
    }
    var rf = M.rng('fora|' + p.id);
    if (rf() < 0.18 && !p.saiu) {
      var aj = M.escolhe(rf, [150, 200, 250, 300]);
      fora.push({ r: 'Ajuda de custo combinada', como: 'combinado fora da folha (exemplo)', p: aj, d: null });
      vFora += aj;
    }

    /* avisos */
    var ciclo_ate = h.ate || null;
    if (cy.fim > HOJE) avisos.push(cy.ini >= HOJE ? 'O ciclo deste mês ainda não começou: horas extras, faltas e atrasos ainda não entram.' : 'O ciclo ainda não fechou: horas contadas de ' + M.br(cy.ini) + ' até ' + (ciclo_ate ? M.br(ciclo_ate) : M.br(cy.ini)) + '.');
    if (h.incompletos) avisos.push(h.incompletos + (h.incompletos > 1 ? ' dias com batida faltando' : ' dia com batida faltando') + ' no ponto: as horas extras desses dias só entram depois de arrumar na Caixa de entrada do RH.');
    if (h.abonadas) avisos.push(h.abonadas + (h.abonadas > 1 ? ' faltas abonadas' : ' falta abonada') + ' pelo escritório: não desconta.');
    var adv = oc.filter(function (o) { return (o.tipo === 'ADVERTENCIA' || o.tipo === 'SUSPENSAO') && o.situacao === 'aprovado' && o.data >= cy.ini && o.data <= cy.fim; });
    if (adv.length) avisos.push('No ciclo: ' + adv.map(function (o) { return TIPO_TXT[o.tipo] + ' em ' + M.br(o.data); }).join(', ') + '.');
    if (p.experiencia && !p.saiu) avisos.push('Em contrato de experiência até ' + brl(M.somaDias(p.admissao, REGRA.experiencia_dias - 1)) + '.');
    var emp = abertoDe(p.nome);
    if (emp.length) avisos.push('Tem empréstimo da empresa em aberto: ' + rs(emp.reduce(function (a, x) { return a + x.valor; }, 0)) + '. Não entra nesta folha; entra na rescisão, se a pessoa sair.');
    if (p.saiu) avisos.push('Saiu em ' + brl(p.saiu_em) + ': fica fora da conta da folha; o acerto vai na rescisão.');

    var pag = r2(prov - desc);
    return {
      pessoa: { nome: p.nome, cargo: p.cargo, empresa: B.empresa(p.loja), salario: p.salario, admissao: p.admissao },
      linhas: linhas, fora: fora, bonificacao: bonif, avisos: avisos,
      totais: { proventos: r2(prov), descontos: r2(desc), liquido: r2(pag + adt) },
      datas: { adiantamento: { dia: diaAdt, valor: adt || null }, pagamento: { dia: quintoDiaUtil(mesDe(comp, 1)), valor_folha: pag, valor_fora: r2(vFora) } },
      resumo: {
        nome: p.nome, empresa: B.empresa(p.loja), cargo: p.cargo, salario: p.salario, proventos: r2(prov), descontos: r2(desc),
        adiantamento: adt || null, pagamento_folha: pag, fora: r2(vFora), liquido: r2(pag + adt), saiu: !!p.saiu, confianca: !!p.cargo_confianca, n_avisos: adv.length
      },
      horas: h, variaveis: r2(vari)
    };
  }

  /* media das variaveis (horas extras, adicional e DSR) nos ultimos ciclos fechados */
  function mediaVariaveis(p, ateDia, n) {
    n = n || 6;
    var mapa = mapaOcorr(), comp = mesDe(ateDia, ateDia.slice(8, 10) > '25' ? 0 : -1), soma = 0, k = 0;
    for (var i = 0; i < n; i++) {
      var c = mesDe(comp, -i), cy = ciclo(c);
      if (cy.fim < p.admissao) break;
      soma += calcula(p, c, mapa).variaveis; k++;
    }
    return { media: k ? r2(soma / k) : 0, meses: k };
  }

  /* ---------------- quem pode ---------------- */
  function pessoasDoMes(comp) {
    var cy = ciclo(comp);
    return B.todos.filter(function (p) {
      if (p.admissao > cy.fim) return false;
      if (p.saiu_em && p.saiu_em < cy.ini) return false;
      return true;
    });
  }

  D.rpc('rh_folha_porta', function (b, ctx) {
    B.exige(b, ctx, 'folha');
    var a = b.p_acao, d = b.p_dados || {};
    if (a === 'mes') {
      var comp = /^\d{4}-\d{2}-01$/.test(d.competencia || '') ? d.competencia : mesDe(HOJE, 0);
      var mapa = mapaOcorr();
      var ps = pessoasDoMes(comp).map(function (p) { return calcula(p, comp, mapa).resumo; });
      ps.sort(function (x, y) { return x.empresa.localeCompare(y.empresa, 'pt-BR') || x.nome.localeCompare(y.nome, 'pt-BR'); });
      return {
        competencia: comp, fechamento: M.somaDias(comp, 24),
        dia_adiantamento: diaUtilAntes(M.somaDias(comp, 19)), dia_vt: ultimoDiaUtil(comp), dia_pagamento: quintoDiaUtil(mesDe(comp, 1)),
        trimestre_paga: (+comp.slice(5, 7)) % 3 === 0, pessoas: ps
      };
    }
    if (a === 'pessoa') {
      var p = B.porNome(d.nome);
      if (!p) throw D.erro(400, 'Pessoa não encontrada: ' + (d.nome || ''), 'P0001');
      var c = /^\d{4}-\d{2}-01$/.test(d.competencia || '') ? d.competencia : mesDe(HOJE, 0);
      var r = calcula(p, c);
      return { pessoa: r.pessoa, linhas: r.linhas, fora: r.fora, bonificacao: r.bonificacao, avisos: r.avisos, totais: r.totais, datas: r.datas };
    }
    if (a === 'bonificacao') {
      var ano = +d.ano || +HOJE.slice(0, 4), tri = Math.min(4, Math.max(1, +d.trimestre || 1));
      var meses = mesesDoTrimestre(ano, tri), mp = mapaOcorr();
      var ultimo = meses[2];
      var pagaComp = quintoDiaUtil(mesDe(ultimo, 1));
      var lista = B.ativos.filter(function (p) { return p.admissao <= fimDoMes(ultimo); }).map(function (p) {
        return { nome: p.nome, empresa: B.empresa(p.loja), meses: meses.map(function (m1) { return bonusMes(p, m1, mp[p.id]); }) };
      }).sort(function (x, y) { return x.empresa.localeCompare(y.empresa, 'pt-BR') || x.nome.localeCompare(y.nome, 'pt-BR'); });
      return {
        ano: ano, trimestre: tri, valor_mes: REGRA.bonificacao_mes,
        meses: meses.map(function (m1) { return m1.slice(0, 7); }),
        paga_em: brl(pagaComp) + ', junto com o pagamento da folha de ' + NOMEMES[+ultimo.slice(5, 7) - 1] + ' (R$ ' + REGRA.bonificacao_mes + ' por mês ganho)',
        pessoas: lista
      };
    }
    throw D.erro(400, 'Ação desconhecida: ' + a, 'P0001');
  });

  /* ---------------- para a simulacao de rescisao ---------------- */
  var X = D.rhBase;
  X.REGRA = REGRA; X.inss = inss; X.irrf = irrf; X.horas = horas; X.valorHora = valorHora; X.optaVT = optaVT;
  X.ehFeriado = ehFeriado; X.mesDe = mesDe; X.fimDoMes = fimDoMes; X.ciclo = ciclo; X.diaUtilAntes = diaUtilAntes;
  X.domingosEFeriados = domingosEFeriados; X.mediaVariaveis = mediaVariaveis; X.mapaOcorr = mapaOcorr;
  X.emprestimos = emprestimos; X.emprestimoNovo = emprestimoNovo; X.emprestimoQuitar = emprestimoQuitar; X.abertoDe = abertoDe;
  X.fmtH = fmtH; X.rs = rs; X.num = num; X.brl = brl; X.r2 = r2;
})();
