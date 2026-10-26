/* Contas a Pagar e a Receber (demonstracao).
   Simula as portas:
     contas_pagar_consulta  {meses}                     resumo fornecedor x loja x mes, buracos, auditoria, pedidos
                            {boletos:{chave,loja,mes}}  boleto por boleto de uma celula da tabela
                            {dia:{loja,ano,mes,escopo}} agenda "Vence hoje" (so o que nao foi baixado)
     contas_pagar_acao      auditar, corrigir, situacao, pedido, conta_nova, liberar, recusar,
                            perguntar, responder, conferir, cancelar
     contas_linha_pagto     forma de pagamento e anotacao de uma conta
     contas_baixadas        contas ja baixadas: {mes,loja} -> dias ; {dia,loja} -> lista
     contas_receber         {mes,loja} -> calendario ; {dia,loja} -> lista + banco ; {aberto} -> lista
   Fornecedores, clientes e contas bancarias ficticios. As vendas do "a receber" saem de
   MUNDO.pedidos e MUNDO.salao. O que a pessoa grava fica so neste navegador ('demo_contas_v1'). */
(function () {
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;
  var LOJAS = M.lojas;

  /* ---------------- utilidades ---------------- */
  var SEMANA = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function z(n) { return (n < 10 ? '0' : '') + n; }
  function ddmm(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }
  function ddmmaa(iso) { return ddmm(iso) + '/' + iso.slice(0, 4); }
  function somaMes(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + z(m + 1);
  }
  function difMeses(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }
  function diasNoMes(ym) { return new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(); }
  function diaDoMes(ym, d) { return ym + '-' + z(Math.min(d, diasNoMes(ym))); }
  function difDias(a, b) { return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5); }
  function nomeMes(ym) { return NOMES_MES[+ym.slice(5, 7) - 1]; }
  function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function agoraTxt() { return ddmm(M.hoje()) + ' ' + M.agoraISO().slice(11, 16); }
  function lojaPorNome(n) {
    if (!n) return null;
    for (var i = 0; i < LOJAS.length; i++) if (LOJAS[i].nome === n || LOJAS[i].id === n) return LOJAS[i];
    return null;
  }
  function nomesLojas() { return LOJAS.map(function (l) { return l.nome; }); }
  var ESCRITORIO = (D.usuarios.escritorio || {}).nome || 'Escritório';
  var DONO = (D.usuarios.dono || {}).nome || 'Dono';
  var ASSISTENTE = 'Assistente automático';

  /* ---------------- o que a pessoa gravou (so neste navegador) ---------------- */
  var CH = 'demo_contas_v1';
  var ST = {};
  try { ST = JSON.parse(localStorage.getItem(CH) || '{}') || {}; } catch (e) { ST = {}; }
  ST.aud = ST.aud || {}; ST.forn = ST.forn || {}; ST.linha = ST.linha || {}; ST.sit = ST.sit || {};
  ST.seq = ST.seq || 300;
  function grava() { try { localStorage.setItem(CH, JSON.stringify(ST)); } catch (e) {} }

  /* ---------------- fornecedores (inventados) ---------------- */
  /* regra: mensal (dia do mes) | semana [dias da semana, 0=dom] | dias [dias do mes] | quinzenal (dia da semana) */
  var F = [
    { id: 'alug', nome: function (L) { return 'Aluguel Loja ' + L.nome; }, tipo: 'fixo', cat: 'Aluguel', met: 'Boleto', regra: { mensal: 5 }, base: 14000, vr: 0, emails: 1, reajuste: { mes: 8, pct: 0.045 },
      desc: function (c) { return 'Aluguel de ' + nomeMes(c.ym); }, obs: 'Contrato com reajuste anual em agosto (exemplo).' },
    { id: 'luz', nome: 'Energia Elétrica', tipo: 'fixo', cat: 'Energia elétrica', met: 'Débito automático', regra: { mensal: 12 }, base: 5200, vr: 0.12, emails: 2, provisao: 10,
      desc: function (c) { return 'Conta de luz — consumo de ' + nomeMes(somaMes(c.ym, -1)); } },
    { id: 'agua', nome: 'Água e Esgoto', tipo: 'fixo', cat: 'Água e esgoto', met: 'Boleto', regra: { mensal: 18 }, base: 1150, vr: 0.15, emails: 1, provisao: 10,
      desc: function (c) { return 'Conta de água — consumo de ' + nomeMes(somaMes(c.ym, -1)); } },
    { id: 'net', nome: 'Internet Conecta', tipo: 'fixo', cat: 'Telefone e internet', met: 'Débito automático', regra: { mensal: 10 }, base: 199.9, vr: 0, fixo: true, emails: 1,
      desc: function () { return 'Internet fibra — mensalidade'; } },
    { id: 'cont', nome: 'Contabilidade Exemplo', tipo: 'fixo', cat: 'Serviços contábeis', met: 'Pix', regra: { mensal: 10 }, base: 2850, vr: 0, fixo: true, unica: true, emails: 2,
      desc: function (c) { return 'Honorários de ' + nomeMes(somaMes(c.ym, -1)); }, obs: 'Cobra todas as lojas num boleto só.' },
    { id: 'soft', nome: 'Software de Gestão Exemplo', tipo: 'fixo', cat: 'Sistemas', met: 'Cartão de crédito', regra: { mensal: 7 }, base: 349, vr: 0, fixo: true, emails: 1,
      desc: function () { return 'Mensalidade do sistema de gestão'; } },
    { id: 'ded', nome: 'Dedetização Limpa Já', tipo: 'fixo', cat: 'Manutenção e limpeza', met: 'Boleto', regra: { mensal: 22 }, base: 280, vr: 0, fixo: true, emails: 0,
      desc: function () { return 'Controle de pragas — visita mensal'; } },
    { id: 'seg', nome: 'Seguro Loja Protegida', tipo: 'fixo', cat: 'Seguros', met: 'Boleto', regra: { mensal: 15 }, base: 640, vr: 0, emails: 1, parcelas: { inicio: -5, total: 10 },
      desc: function () { return 'Seguro empresarial da loja'; } },
    { id: 'das', nome: 'Simples Nacional (DAS)', tipo: 'fixo', cat: 'Impostos', met: 'Boleto', regra: { mensal: 20 }, base: 9200, vr: 0.1, emails: 1, provisao: 15,
      desc: function (c) { return 'DAS — competência ' + nomeMes(somaMes(c.ym, -1)); } },
    { id: 'lav', nome: 'Lavanderia Branca', tipo: 'fixo', cat: 'Uniformes e enxoval', met: 'Pix', regra: { mensal: 25 }, base: 420, vr: 0.1, emails: 0,
      desc: function () { return 'Lavagem de uniformes e panos'; } },
    { id: 'fin', nome: 'Financiamento Forno Combinado', tipo: 'fixo', cat: 'Equipamentos', met: 'Boleto', regra: { mensal: 8 }, base: 1890, vr: 0, fixo: true, unica: true, emails: 1, parcelas: { inicio: -14, total: 24 },
      desc: function () { return 'Forno combinado — financiamento'; } },

    { id: 'dist', nome: 'Distribuidora Exemplo', tipo: 'mercadoria', cat: 'Mercadoria', met: 'Boleto', regra: { semana: [4] }, base: 7100, vr: 0.25, emails: 6,
      desc: function (c) { return 'NF ' + c.nf + ' — secos, molhos e congelados'; }, obs: 'Entrega às quintas; boleto com 14 dias.' },
    { id: 'frig', nome: 'Frigorífico Modelo', tipo: 'mercadoria', cat: 'Carnes', met: 'Boleto', regra: { semana: [2, 5] }, base: 5300, vr: 0.25, emails: 9,
      desc: function (c) { return 'NF ' + c.nf + ' — carne bovina e blend de hambúrguer'; } },
    { id: 'hort', nome: 'Hortifruti Bom Preço', tipo: 'mercadoria', cat: 'Hortifruti', met: 'Pix', regra: { semana: [1, 3, 5] }, base: 880, vr: 0.3, emails: 0,
      desc: function (c) { return 'Pedido ' + c.nf.slice(-4) + ' — folhas, tomate e cebola'; }, obs: 'Paga no Pix no dia da entrega.' },
    { id: 'gas', nome: 'Gás Fácil', tipo: 'mercadoria', cat: 'Gás', met: 'Boleto', regra: { dias: [1, 11, 21] }, base: 1100, vr: 0.2, emails: 3,
      desc: function (c) { return 'NF ' + c.nf + ' — 2 botijões P45'; } },
    { id: 'emb', nome: 'Embalagens Brasil', tipo: 'mercadoria', cat: 'Embalagens', met: 'Boleto', regra: { quinzenal: 1 }, base: 2800, vr: 0.2, emails: 4,
      desc: function (c) { return 'NF ' + c.nf + ' — caixas, sacos kraft e copos'; } },
    { id: 'pao', nome: 'Padaria Pão Dourado', tipo: 'mercadoria', cat: 'Pães', met: 'Pix', regra: { semana: [1] }, base: 1650, vr: 0.2, emails: 0,
      desc: function () { return 'Pães de hambúrguer — pedido da semana'; } },
    { id: 'lat', nome: 'Laticínios Vale Verde', tipo: 'mercadoria', cat: 'Laticínios', met: 'Boleto', regra: { semana: [3] }, base: 2450, vr: 0.2, emails: 5,
      desc: function (c) { return 'NF ' + c.nf + ' — cheddar, muçarela e manteiga'; } },
    { id: 'beb', nome: 'Bebidas Gelada Distribuidora', tipo: 'mercadoria', cat: 'Bebidas', met: 'Boleto', regra: { quinzenal: 5 }, base: 4400, vr: 0.2, emails: 3,
      desc: function (c) { return 'NF ' + c.nf + ' — refrigerantes, sucos e cervejas'; } },
    { id: 'limp', nome: 'Limpeza Total Produtos', tipo: 'mercadoria', cat: 'Limpeza', met: 'Boleto', regra: { mensal: 14 }, base: 900, vr: 0.2, emails: 1,
      desc: function (c) { return 'NF ' + c.nf + ' — detergente, desengordurante e papel'; } }
  ];

  /* fornecedores que mandaram cobranca por e-mail e nao tem lancamento no Saipos */
  function buracosBase() {
    return [
      { chave: 'Gráfica Rápida Exemplo', tipo: 'boleto', emails: 2, primeiro: M.dia(-19), ultimo: M.dia(-4), observacao: 'Cardápios e panfletos impressos' },
      { chave: 'Manutenção Refrigeração Polar', tipo: 'nota fiscal', emails: 3, primeiro: M.dia(-33), ultimo: M.dia(-2), observacao: 'Conserto da câmara fria' },
      { chave: 'Uniformes Avental Forte', tipo: 'cobrança', emails: 1, primeiro: M.dia(-8), ultimo: M.dia(-8), observacao: '' },
      { chave: 'Sorvetes Gelato Fornecedor', tipo: 'boleto', emails: 4, primeiro: M.dia(-41), ultimo: M.dia(-6), observacao: 'Sorvete das sobremesas' },
      { chave: 'Marketing Digital Exemplo', tipo: 'nota fiscal', emails: 1, primeiro: M.dia(-12), ultimo: M.dia(-12), observacao: 'Impulsionamento de posts' }
    ];
  }

  function chaveDe(f, L) { return typeof f.nome === 'function' ? f.nome(L) : f.nome; }
  function tipoPadrao(chave) {
    for (var i = 0; i < F.length; i++) {
      if (typeof F[i].nome === 'function') { if (/^Aluguel Loja /.test(chave)) return F[i].tipo; }
      else if (F[i].nome === chave) return F[i].tipo;
    }
    return '';
  }
  function tipoDe(chave) { var o = ST.forn[chave]; return (o && o.tipo) || tipoPadrao(chave) || 'fixo'; }

  function datasDe(regra, ym) {
    var r = [], n = diasNoMes(ym), d, iso;
    if (regra.mensal) return [diaDoMes(ym, regra.mensal)];
    if (regra.dias) { regra.dias.forEach(function (x) { iso = diaDoMes(ym, x); if (r.indexOf(iso) < 0) r.push(iso); }); return r; }
    for (d = 1; d <= n; d++) {
      iso = ym + '-' + z(d);
      var dow = M.diaSemana(iso);
      if (regra.semana && regra.semana.indexOf(dow) >= 0) r.push(iso);
      if (regra.quinzenal != null && dow === regra.quinzenal && Math.floor(Date.parse(iso + 'T12:00:00Z') / 864e5 / 7) % 2 === 0) r.push(iso);
    }
    return r;
  }

  /* ---------------- lancamentos a pagar ---------------- */
  var CACHE = null, CACHE_DIA = '';
  var FORMA_DO_METODO = { 'Boleto': 'boleto', 'Pix': 'pix', 'Débito automático': 'debito_automatico', 'Transferência': 'transferencia' };
  var PREFIXO = { boleto: 'PAGTO BOLETO', pix: 'PIX ENVIADO', debito_automatico: 'DEB AUTOMATICO', transferencia: 'TED ENVIADA', outro: 'PAGAMENTO' };

  function novo(f, L, ym, dia, mesHoje) {
    var chave = chaveDe(f, L);
    var id = f.id + '-' + L.id + '-' + dia.replace(/-/g, '');
    var r = M.rng('cp|' + id);
    var valor = M.arred(f.base * (f.fixo ? 1 : L.peso) * (1 + f.vr * (r() * 2 - 1)));
    if (!f.vr) valor = Math.round(valor * 100) / 100;
    if (f.reajuste) { /* reajuste anual: meses antes do ultimo mes de reajuste pagam o valor antigo */
      var aR = +mesHoje.slice(0, 4) - (+mesHoje.slice(5, 7) < f.reajuste.mes ? 1 : 0);
      if (ym < aR + '-' + z(f.reajuste.mes)) valor = M.arred(valor / (1 + f.reajuste.pct));
    }
    var parcela = null;
    if (f.parcelas) {
      var idx = difMeses(somaMes(mesHoje, f.parcelas.inicio), ym) + 1;
      if (idx < 1 || idx > f.parcelas.total) return null;
      parcela = idx + '/' + f.parcelas.total;
    }
    var nf = String(10000 + Math.floor(r() * 89999));
    return { id: id, f: f, chave: chave, L: L, dia: dia, valor: valor, categoria: f.cat, metodo: f.met,
             descricao: f.desc({ ym: ym, nf: nf }), parcela: parcela, provisao: false, dobro: false, sem_valor: false,
             baixado: false, baixa: null, extrato: null, seed: {} };
  }

  function situacao(l, hoje, ontem) {
    var r = M.rng('st|' + l.id);
    var x = r(), idade = difDias(hoje, l.dia);
    var cartao = /cart/i.test(l.metodo);
    if (idade > 0) {
      var pAb = idade <= 3 ? 0.22 : idade <= 15 ? 0.06 : idade <= 60 ? 0.015 : 0.004;
      if (l.metodo === 'Débito automático') pAb = pAb / 2;
      l.baixado = x >= pAb;
    } else if (idade === 0) l.baixado = x < 0.3;
    else l.baixado = idade >= -5 && x < 0.06;
    var pago = null;
    if (l.baixado) {
      pago = idade > 0 ? M.somaDias(l.dia, r() < 0.2 ? -1 : 0) : M.somaDias(hoje, -1 - Math.floor(r() * 2)); /* o que vence hoje e ja foi baixado foi pago antes */
      var bx = M.somaDias(pago, Math.floor(r() * 3));
      l.baixa = bx > hoje ? hoje : bx;
    } else if (idade > 0 && r() < 0.55) {
      pago = l.dia; /* saiu do banco, mas ninguem deu baixa no Saipos */
    }
    if (pago && !cartao && pago <= ontem) {
      var forma = FORMA_DO_METODO[l.metodo] || 'outro';
      var y = r();
      var valorBate = y >= 0.06, mesmoNome = !(y >= 0.06 && y < 0.12);
      l.extrato = {
        data: ddmm(pago), forma: forma,
        descricao: mesmoNome ? (PREFIXO[forma] + ' ' + semAcento(l.chave).toUpperCase()).slice(0, 42) : PREFIXO[forma] + ' ' + (1000 + Math.floor(r() * 8999)) + '-' + (10 + Math.floor(r() * 89)),
        conta: 'Conta ' + l.L.nome,
        valor: valorBate ? l.valor : M.arred(l.valor * 1.021),
        valor_bate: valorBate, mesmo_nome: mesmoNome
      };
    }
    if (l.f.provisao && difDias(l.dia, hoje) > l.f.provisao) l.provisao = true;
  }

  function lancamentos() {
    var hoje = M.hoje();
    if (CACHE && CACHE_DIA === hoje) return CACHE;
    var ontem = M.dia(-1), mesHoje = hoje.slice(0, 7), lista = [];
    for (var k = -6; k <= 2; k++) {
      var ym = somaMes(mesHoje, k);
      LOJAS.forEach(function (L, li) {
        F.forEach(function (f) {
          if (f.unica && li > 0) return;
          datasDe(f.regra, ym).forEach(function (dia) {
            /* nota de mercadoria so existe depois da entrega: no maximo ~2 semanas a frente */
            if (f.tipo === 'mercadoria' && difDias(dia, hoje) > 16) return;
            var l = novo(f, L, ym, dia, mesHoje);
            if (l) lista.push(l);
          });
        });
      });
    }
    /* toda loja tem algo vencendo hoje */
    var HORT = F.filter(function (f) { return f.id === 'hort'; })[0];
    LOJAS.forEach(function (L) {
      if (lista.some(function (l) { return l.L === L && l.dia === hoje; })) return;
      var l = novo(HORT, L, mesHoje, hoje, mesHoje);
      l.id = 'hortx-' + L.id + '-' + hoje.replace(/-/g, '');
      l.descricao = 'Pedido avulso — reposição de folhas e tomate';
      lista.push(l);
    });
    lista.forEach(function (l) { situacao(l, hoje, ontem); });

    /* casos de exemplo para a tela mostrar os seus avisos */
    function primeira(fn) { for (var i = 0; i < lista.length; i++) if (fn(lista[i])) return lista[i]; return null; }
    var ordem = function (a, b) { return a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0; };
    lista.sort(ordem);
    var dup = primeira(function (l) { return l.f.id === 'hort' && l.L === LOJAS[0] && l.dia >= hoje && l.dia.slice(0, 7) === mesHoje && !l.baixado; });
    if (dup) {
      var c = {}; for (var kk in dup) c[kk] = dup[kk];
      c.id = dup.id + '-2'; c.seed = {};
      dup.dobro = true; c.dobro = true;
      lista.push(c);
    }
    var sv = primeira(function (l) { return l.f.id === 'lat' && l.dia >= hoje && !l.baixado; });
    if (sv) sv.sem_valor = true;
    var hj = primeira(function (l) { return l.dia === hoje && !l.baixado && !/cart/i.test(l.metodo); });
    if (hj) hj.seed.forma = { forma: 'pix', forma_por: ESCRITORIO, forma_origem: 'manual' };
    var ob = primeira(function (l) { return l.f.id === 'frig' && l.dia >= hoje && !l.baixado; });
    if (ob) ob.seed.obs = { obs: 'Conferir com o pedido de compra: veio 5 kg a mais de blend.', obs_por: ESCRITORIO, obs_em: ddmm(M.dia(-1)) + ' 16:20' };
    var at = primeira(function (l) { return l.dia < hoje && !l.baixado && !l.extrato && !/cart/i.test(l.metodo); });
    if (at) at.seed.obs = { obs: 'O fornecedor reemitiu o boleto; aguardando o novo para pagar.', obs_por: ESCRITORIO, obs_em: ddmm(M.dia(-2)) + ' 10:05' };
    lista.forEach(function (l) {
      if (l.extrato && !l.baixado && !l.seed.forma) l.seed.forma = { forma: l.extrato.forma, forma_por: null, forma_origem: 'auto' };
    });
    var cartaoBx = lista.filter(function (l) { return l.baixado && /cart/i.test(l.metodo); });
    cartaoBx.forEach(function (l) { l.seed.forma = { forma: 'cartao', forma_por: ESCRITORIO, forma_origem: 'manual' }; });

    lista.sort(function (a, b) { return ordem(a, b) || (a.L.nome < b.L.nome ? -1 : a.L.nome > b.L.nome ? 1 : 0) || (a.chave < b.chave ? -1 : 1); });
    CACHE = lista; CACHE_DIA = hoje;
    return lista;
  }

  function marcas(l) {
    var o = { forma: null, forma_por: null, forma_origem: null, obs: null, obs_por: null, obs_em: null };
    var s = l.seed || {};
    if (s.forma) { o.forma = s.forma.forma; o.forma_por = s.forma.forma_por; o.forma_origem = s.forma.forma_origem; }
    if (s.obs) { o.obs = s.obs.obs; o.obs_por = s.obs.obs_por; o.obs_em = s.obs.obs_em; }
    var g = ST.linha[l.id];
    if (g) {
      if (g.tem_forma) { o.forma = g.forma; o.forma_por = g.forma_por; o.forma_origem = 'manual'; }
      if (g.tem_obs) { o.obs = g.obs; o.obs_por = g.obs_por; o.obs_em = g.obs_em; }
    }
    return o;
  }

  function linhaAgenda(l, hoje) {
    var m = marcas(l), ontem = M.dia(-1);
    return {
      id: l.id, dia: l.dia, vencimento: ddmm(l.dia), loja: l.L.nome, fornecedor: l.chave, categoria: l.categoria,
      descricao: l.descricao, valor: l.valor, metodo: l.metodo, provisao: l.provisao, parcela: l.parcela,
      sem_valor_no_saipos: l.sem_valor, atraso_dias: l.dia < hoje ? difDias(hoje, l.dia) : 0,
      extrato: l.extrato, extrato_ate_iso: ontem, extrato_ate: ddmm(ontem), dobro: l.dobro,
      forma: m.forma, forma_por: m.forma_por, forma_origem: m.forma_origem, obs: m.obs, obs_por: m.obs_por, obs_em: m.obs_em
    };
  }
  function linhaBaixada(l) {
    var m = marcas(l);
    return {
      id: l.id, vencimento: ddmm(l.dia), loja: l.L.nome, fornecedor: l.chave, categoria: l.categoria, descricao: l.descricao,
      valor: l.valor, metodo: l.metodo, baixa: ddmm(l.baixa), extrato: l.extrato,
      forma: l.extrato && m.forma_origem !== 'manual' ? null : m.forma, forma_por: m.forma_por, obs: m.obs, obs_por: m.obs_por
    };
  }
  function diaInfo(dia, hoje) { return { dia: dia, rotulo: dia.slice(8, 10), diasem: SEMANA[M.diaSemana(dia)], hoje: dia === hoje }; }
  function porDia(lista, hoje) {
    var g = {}, ks = [];
    lista.forEach(function (l) {
      if (!g[l.dia]) { g[l.dia] = diaInfo(l.dia, hoje); g[l.dia].n = 0; g[l.dia].total = 0; ks.push(l.dia); }
      g[l.dia].n++; g[l.dia].total = M.arred(g[l.dia].total + l.valor);
    });
    ks.sort();
    return ks.map(function (k) { return g[k]; });
  }
  function filtraLoja(lista, nome) {
    var L = lojaPorNome(nome);
    return L ? lista.filter(function (l) { return l.L === L; }) : lista;
  }
  function saiposCarga() { return M.minutosAgora() >= 460 ? ddmm(M.hoje()) + ' 07:40' : ddmm(M.dia(-1)) + ' 22:10'; }

  /* ---------------- agenda "Vence hoje" ---------------- */
  function agenda(q) {
    var hoje = M.hoje(), mesHoje = hoje.slice(0, 7), anoHoje = +hoje.slice(0, 4);
    var mes = /^\d{4}-\d{2}$/.test(String(q.mes || '')) ? q.mes : (q.ano && +q.ano !== anoHoje ? q.ano + '-01' : mesHoje);
    var ano = +mes.slice(0, 4);
    var todas = filtraLoja(lancamentos(), q.loja);
    var abertas = todas.filter(function (l) { return !l.baixado; });
    var anos = [];
    abertas.concat([{ dia: hoje }]).forEach(function (l) { var y = +l.dia.slice(0, 4); if (anos.indexOf(y) < 0) anos.push(y); });
    anos.sort();
    var cont = {};
    abertas.forEach(function (l) { if (+l.dia.slice(0, 4) === ano) { var m = l.dia.slice(0, 7); cont[m] = (cont[m] || 0) + 1; } });
    var meses = Object.keys(cont).sort().map(function (m) { return { mes: m, rotulo: m.slice(5, 7), n: cont[m] }; });
    var doMes = abertas.filter(function (l) { return l.dia.slice(0, 7) === mes; });
    var vencidas = abertas.filter(function (l) { return l.dia < hoje; });
    var tot = 0; vencidas.forEach(function (l) { tot += l.valor; });
    var escopo = q.escopo === 'nao_baixados' ? 'nao_baixados' : 'mes';
    var lista = escopo === 'nao_baixados' ? vencidas : doMes;
    var fim = somaMes(mesHoje, 2);
    return {
      lojas: nomesLojas(), anos: anos, ano: ano, meses: meses, mes: mes, escopo: escopo,
      nao_baixados: { n: vencidas.length, total: M.arred(tot) },
      dias: porDia(doMes, hoje),
      lista: lista.map(function (l) { return linhaAgenda(l, hoje); }),
      hoje_iso: hoje, saipos_importado_em: saiposCarga(), saipos_ate_vencimento: ddmmaa(diaDoMes(fim, 31))
    };
  }

  /* ---------------- tabela fornecedor x loja x mes ---------------- */
  function emailsDe(l) {
    var b = l.f.emails || 0;
    return b ? b + (LOJAS.indexOf(l.L) % 2) : 0;
  }
  function resumo(n, ctx) {
    var hoje = M.hoje(), mesHoje = hoje.slice(0, 7);
    n = Math.max(1, Math.min(12, +n || 5));
    var meses = [];
    for (var i = n - 1; i >= 0; i--) meses.push(somaMes(mesHoje, -i));
    var g = {}, ordem = [];
    lancamentos().forEach(function (l) {
      var ym = l.dia.slice(0, 7);
      if (meses.indexOf(ym) < 0) return;
      var k = l.chave + '|' + l.L.nome + '|' + ym;
      if (!g[k]) { g[k] = { tipo: tipoDe(l.chave), chave: l.chave, loja: l.L.nome, mes: ym, valor: 0, em_aberto: 0, d: [], da: [], emails: 0 }; ordem.push(k); }
      var x = g[k];
      x.valor = M.arred(x.valor + l.valor);
      var dd = l.dia.slice(8, 10);
      if (x.d.indexOf(dd) < 0) x.d.push(dd);
      if (!l.baixado) { x.em_aberto++; if (x.da.indexOf(dd) < 0) x.da.push(dd); }
      if (ym === mesHoje) x.emails = emailsDe(l);
    });
    var linhas = ordem.map(function (k) {
      var x = g[k];
      return { tipo: x.tipo, chave: x.chave, loja: x.loja, mes: x.mes, valor: x.valor, em_aberto: x.em_aberto,
               dias: x.d.sort().join(' · '), dias_abertos: x.da.sort().join(' · '), emails: x.emails };
    });
    var bur = buracosBase().filter(function (b) { return !ST.sit[b.chave]; }).map(function (b) {
      return { chave: b.chave, tipo: b.tipo, emails: b.emails, primeiro: ddmm(b.primeiro), ultimo: ddmm(b.ultimo), observacao: b.observacao };
    });
    var em = 0; linhas.forEach(function (l) { em += l.emails; }); bur.forEach(function (b) { em += b.emails; });
    return {
      meses: meses, linhas: linhas, buracos: bur,
      email_total: em + 38, email_ate: ddmm(M.minutosAgora() >= 450 ? hoje : M.dia(-1)) + ' 07:32',
      saipos_ate: saiposCarga(), agora: agoraTxt(),
      auditoria: auditoria(), fornecedores: fornecedores(), acoes: acoes(),
      eu: { id: ctx.usuario, nome: ctx.nome }, dono: !!ctx.admin
    };
  }

  function boletos(q) {
    var L = lojaPorNome(q.loja);
    return lancamentos().filter(function (l) { return l.chave === q.chave && l.L === L && l.dia.slice(0, 7) === q.mes; })
      .map(function (l) {
        return { vencimento: ddmmaa(l.dia), texto: l.descricao + (l.parcela ? ' · parcela ' + l.parcela : '') + (l.provisao ? ' · valor previsto' : ''), valor: l.valor, pago: l.baixado };
      });
  }

  /* ---------------- auditoria, fornecedores, pedidos ---------------- */
  function audSemente() {
    var L0 = LOJAS[0], L1 = LOJAS[1] || LOJAS[0], L2 = LOJAS[2] || LOJAS[0];
    var r = {};
    function p(chave, L, o) { o.chave = chave; o.loja = L.nome; r[chave + '|' + L.nome] = o; }
    p('Aluguel Loja ' + L0.nome, L0, { conferido: true, conferido_por: ESCRITORIO, conferido_em: ddmm(M.dia(-9)) + ' 11:12', situacao: 'ok', data_certa: null, observacao: 'Conferido contra o contrato: reajuste de 4,5% em agosto.' });
    p('Energia Elétrica', L1, { conferido: false, conferido_por: null, conferido_em: null, situacao: 'erro', data_certa: null, observacao: 'Conta do mês passado veio bem acima do normal; pedimos revisão da leitura.' });
    p('Frigorífico Modelo', L2, { conferido: true, conferido_por: ESCRITORIO, conferido_em: ddmm(M.dia(-3)) + ' 15:40', situacao: 'data', data_certa: M.dia(4), observacao: 'Um boleto foi lançado com vencimento errado no Saipos.' });
    p('Distribuidora Exemplo', L0, { conferido: true, conferido_por: DONO, conferido_em: ddmm(M.dia(-5)) + ' 09:02', situacao: 'ok', data_certa: null, observacao: '' });
    return r;
  }
  function auditoria() {
    var s = audSemente(), k;
    for (k in ST.aud) s[k] = ST.aud[k];
    return Object.keys(s).map(function (x) { return s[x]; });
  }
  function fornecedores() {
    var lista = [], vistos = {};
    LOJAS.forEach(function (L) {
      F.forEach(function (f) {
        var c = chaveDe(f, L);
        if (vistos[c]) return; vistos[c] = 1;
        lista.push({ chave: c, tipo: f.tipo, observacao: f.obs || '', ativo: true });
      });
    });
    buracosBase().forEach(function (b) { if (!vistos[b.chave]) { vistos[b.chave] = 1; lista.push({ chave: b.chave, tipo: 'fixo', observacao: b.observacao || '', ativo: true }); } });
    return lista.map(function (f) {
      var o = ST.forn[f.chave];
      if (o) { if (o.tipo) f.tipo = o.tipo; if (o.observacao != null) f.observacao = o.observacao; if (o.ativo != null) f.ativo = o.ativo; }
      return f;
    });
  }

  function q(diasAtras, hhmm) { return ddmm(M.dia(-diasAtras)) + ' ' + hhmm; }
  function ordemDe(diasAtras, hhmm) { return Date.parse(M.dia(-diasAtras) + 'T' + hhmm + ':00-03:00'); }
  function acoesSemente() {
    var L0 = LOJAS[0], L1 = LOJAS[1] || LOJAS[0], L2 = LOJAS[LOJAS.length - 1];
    function a(id, d, h, o) {
      o.id = id; o.quando = q(d, h); o.ord = ordemDe(d, h);
      o.antes = o.antes || null; o.depois = o.depois || null; o.resposta = o.resposta || null;
      o.tratado_em = o.tratado_em || null; o.falas = o.falas || []; o.chave = o.chave || null; o.texto = o.texto || null;
      return o;
    }
    return [
      a(101, 12, '10:14', { acao: 'pedido', quem: ESCRITORIO, usuario_id: 3, chave: 'Energia Elétrica', status: 'fechado',
        texto: 'A conta de luz da loja ' + L1.nome + ' veio bem acima do normal. Comparar com os últimos 6 meses e me avisar.',
        resposta: 'Comparei: o consumo subiu 18% desde a câmara fria nova. O valor confere com a leitura.', tratado_em: q(11, '12:00'),
        falas: [{ quem: ESCRITORIO, papel: 'ficou_bom', quando: q(11, '14:30'), texto: 'Ótimo, obrigada.' }] }),
      a(102, 10, '09:41', { acao: 'corrigir', quem: ESCRITORIO, usuario_id: 3, chave: 'Gás Fácil', status: 'feito',
        antes: { tipo: 'fixo', observacao: '', ativo: true }, depois: { tipo: 'mercadoria', observacao: '', ativo: true } }),
      a(103, 9, '16:05', { acao: 'situacao', quem: ESCRITORIO, usuario_id: 3, chave: 'Papelaria Central', status: 'feito',
        depois: { situacao: 'pago' }, texto: 'Pago no cartão da loja; a nota está no envelope do mês.' }),
      a(104, 8, '11:20', { acao: 'auditar', quem: ESCRITORIO, usuario_id: 3, chave: 'Aluguel Loja ' + L0.nome, status: 'feito',
        depois: { conferido: true, observacao: 'Conferido contra o contrato: reajuste de 4,5% em agosto.' } }),
      a(105, 7, '14:02', { acao: 'pedido', quem: DONO, usuario_id: 1, status: 'recusado',
        texto: 'Apagar os lançamentos antigos que estão em duplicidade.',
        falas: [{ quem: DONO, papel: 'recusar', quando: q(7, '18:10'), texto: 'Prefiro conferir um por um antes de apagar.' }] }),
      a(106, 6, '10:30', { acao: 'pedido', quem: ESCRITORIO, usuario_id: 3, chave: 'Bebidas Gelada Distribuidora', status: 'nao_deu',
        texto: 'Separar os boletos deles por loja.',
        resposta: 'Os boletos chegam sem indicar a loja; não consegui separar sozinho.', tratado_em: q(6, '12:00') }),
      a(107, 5, '15:47', { acao: 'pedido', quem: ESCRITORIO, usuario_id: 3, chave: 'Distribuidora Exemplo', status: 'pronto',
        texto: 'Juntar "Distribuidora Exemplo Ltda" e "Distribuidora Exemplo": é a mesma empresa.',
        resposta: 'Juntei as duas: agora aparece uma linha só por loja.', tratado_em: q(5, '18:00') }),
      a(108, 4, '09:15', { acao: 'pedido', quem: ESCRITORIO, usuario_id: 3, chave: 'Embalagens Brasil', status: 'perguntei',
        texto: 'Parar de contar os e-mails de propaganda deles.',
        falas: [{ quem: ASSISTENTE, papel: 'perguntar', quando: q(4, '10:00'), texto: 'Quer esconder só as promoções ou todo e-mail que não traz boleto?' }] }),
      a(109, 3, '17:22', { acao: 'pedido', quem: DONO, usuario_id: 1, chave: 'Simples Nacional (DAS)', status: 'liberado',
        texto: 'Avisar quando o imposto estiver a 3 dias de vencer.',
        falas: [{ quem: DONO, papel: 'liberar', quando: q(3, '17:30'), texto: 'pode fazer.' }] }),
      a(110, 2, '11:48', { acao: 'conta_nova', quem: ESCRITORIO, usuario_id: 3, status: 'precisa_dono',
        depois: { fornecedor: 'Chaveiro Rápido', loja: L2.nome, vencimento: ddmmaa(M.dia(3)), valor: 180, descricao: 'Cópias das chaves da porta dos fundos' } }),
      a(111, 1, '16:33', { acao: 'pedido', quem: ESCRITORIO, usuario_id: 3, chave: 'Hortifruti Bom Preço', status: 'so_dono',
        texto: 'Dar baixa no Saipos de todos os pagamentos da Hortifruti que já saíram do banco.',
        resposta: 'Baixa de conta no Saipos mexe com dinheiro: fica para o dono decidir.', tratado_em: q(1, '18:00') }),
      a(112, 1, '09:05', { acao: 'pedido', quem: DONO, usuario_id: 1, status: 'cancelado',
        texto: 'Mostrar o total do mês no topo da tela.' }),
      a(113, 0, '08:12', { acao: 'pedido', quem: ESCRITORIO, usuario_id: 3, chave: null, status: 'novo',
        texto: 'Anotar quando vence o aluguel da loja ' + L2.nome + ' e avisar dois dias antes.' })
    ];
  }
  function listaAcoes() {
    if (!ST.acoes) ST.acoes = acoesSemente();
    return ST.acoes;
  }
  function acoes() {
    return listaAcoes().slice().sort(function (a, b) { return (b.ord || 0) - (a.ord || 0); }).map(function (x) {
      var o = {}; for (var k in x) if (k !== 'ord') o[k] = x[k];
      return o;
    });
  }
  function registra(ctx, o) {
    var lista = listaAcoes();
    ST.seq = (ST.seq || 300) + 1;
    o.id = ST.seq; o.quando = agoraTxt(); o.ord = Date.now();
    o.quem = ctx.nome; o.usuario_id = ctx.usuario;
    o.chave = o.chave || null; o.texto = o.texto || null; o.antes = o.antes || null; o.depois = o.depois || null;
    o.resposta = o.resposta || null; o.tratado_em = o.tratado_em || null; o.falas = o.falas || [];
    lista.push(o);
    grava();
    return o;
  }
  function acaoPorId(id) {
    var l = listaAcoes();
    for (var i = 0; i < l.length; i++) if (String(l[i].id) === String(id)) return l[i];
    throw D.erro(404, 'Pedido não encontrado.', 'P0002');
  }

  /* ---------------- portas: contas a pagar ---------------- */
  D.rpc('contas_pagar_consulta', function (b, ctx) {
    var d = b.p_dados || {};
    if (d.boletos) return { boletos: boletos(d.boletos) };
    if (d.dia) return agenda(d.dia);
    return resumo(d.meses || 5, ctx);
  });

  D.rpc('contas_pagar_acao', function (b, ctx) {
    var a = String(b.p_acao || ''), d = b.p_dados || {};
    var txt = String(d.texto || '').trim();
    var hoje = M.hoje();
    switch (a) {
      case 'auditar': {
        var k = d.chave + '|' + d.loja;
        var antes = auditoria().filter(function (x) { return x.chave === d.chave && x.loja === d.loja; })[0] || {};
        var o = { chave: d.chave, loja: d.loja, observacao: String(d.observacao || '').trim() || null, conferido: !!d.conferido,
                  conferido_por: d.conferido ? (antes.conferido ? antes.conferido_por : ctx.nome) : null,
                  conferido_em: d.conferido ? (antes.conferido ? antes.conferido_em : agoraTxt()) : null,
                  situacao: d.situacao || null, data_certa: d.situacao === 'data' ? (d.data_certa || null) : null };
        ST.aud[k] = o;
        registra(ctx, { acao: 'auditar', chave: d.chave, status: 'feito', antes: antes, depois: { conferido: o.conferido, observacao: o.observacao } });
        return { ok: true };
      }
      case 'corrigir': {
        var atual = fornecedores().filter(function (f) { return f.chave === d.chave; })[0] || { tipo: '', observacao: '', ativo: true };
        var novoF = { tipo: d.tipo || atual.tipo, observacao: String(d.observacao || ''), ativo: d.ativo !== false };
        ST.forn[d.chave] = novoF;
        registra(ctx, { acao: 'corrigir', chave: d.chave, status: 'feito',
          antes: { tipo: atual.tipo, observacao: atual.observacao, ativo: atual.ativo }, depois: novoF });
        return { ok: true };
      }
      case 'situacao': {
        var mot = String(d.motivo || '').trim();
        if (mot.length < 3) throw D.erro(400, 'Escreva o porquê — é obrigatório.', 'P0001');
        ST.sit[d.chave] = d.situacao;
        registra(ctx, { acao: 'situacao', chave: d.chave, status: 'feito', texto: mot, depois: { situacao: d.situacao } });
        return { ok: true };
      }
      case 'pedido': {
        if (txt.length < 3) throw D.erro(400, 'Escreva o que você precisa, com suas palavras.', 'P0001');
        var soDono = /baix|pag[ao]|senha|apag|exclu|dinheiro|saipos/i.test(txt);
        registra(ctx, { acao: 'pedido', chave: d.chave || null, texto: txt, status: soDono ? 'so_dono' : 'novo',
          resposta: soDono ? 'Envolve dinheiro, baixa de conta, Saipos, senha ou apagar coisa: fica para o dono decidir.' : null,
          tratado_em: soDono ? agoraTxt() : null });
        return { ok: true };
      }
      case 'conta_nova': {
        var val = Number(String(d.valor || '').replace(',', '.'));
        if (!String(d.fornecedor || '').trim() || !d.vencimento || !(val > 0)) throw D.erro(400, 'Preencha fornecedor, vencimento e valor.', 'P0001');
        registra(ctx, { acao: 'conta_nova', status: 'novo',
          depois: { fornecedor: String(d.fornecedor).trim(), loja: d.loja || '', vencimento: ddmmaa(d.vencimento), valor: val, descricao: String(d.descricao || '').trim() } });
        return { ok: true };
      }
      case 'liberar': case 'recusar': case 'perguntar': {
        if (!ctx.admin) throw D.erro(403, 'Só o dono pode decidir este pedido.', '42501');
        var r1 = acaoPorId(d.id);
        r1.falas = (r1.falas || []).concat([{ quem: ctx.nome, papel: a, quando: agoraTxt(), texto: txt || (a === 'liberar' ? 'pode fazer.' : '') }]);
        r1.status = a === 'liberar' ? 'liberado' : a === 'recusar' ? 'recusado' : 'perguntei';
        r1.tratado_em = agoraTxt();
        grava();
        return { ok: true };
      }
      case 'responder': {
        var r2 = acaoPorId(d.id);
        r2.falas = (r2.falas || []).concat([{ quem: ctx.nome, papel: 'responder', quando: agoraTxt(), texto: txt }]);
        r2.status = 'precisa_dono'; r2.tratado_em = agoraTxt();
        grava();
        return { ok: true };
      }
      case 'conferir': {
        var r3 = acaoPorId(d.id);
        r3.falas = (r3.falas || []).concat([{ quem: ctx.nome, papel: d.ok ? 'ficou_bom' : 'nao_e_isso', quando: agoraTxt(), texto: d.ok ? 'ficou bom.' : txt }]);
        r3.status = d.ok ? 'fechado' : 'liberado'; r3.tratado_em = agoraTxt();
        grava();
        return { ok: true };
      }
      case 'cancelar': {
        var r4 = acaoPorId(d.id);
        if (r4.status !== 'novo') throw D.erro(400, 'Este pedido já foi tratado e não pode mais ser cancelado.', 'P0001');
        r4.status = 'cancelado'; r4.tratado_em = agoraTxt();
        grava();
        return { ok: true };
      }
    }
    throw D.erro(400, 'Ação desconhecida: ' + a, 'P0001');
  });

  D.rpc('contas_linha_pagto', function (b, ctx) {
    var d = b.p_dados || {}, id = String(d.id || '');
    if (!id) throw D.erro(400, 'Conta sem identificação.', 'P0001');
    var o = ST.linha[id] || {};
    if ('forma' in d) { o.tem_forma = true; o.forma = d.forma || null; o.forma_por = d.forma ? ctx.nome : null; }
    if ('obs' in d) { var t = String(d.obs || '').trim(); o.tem_obs = true; o.obs = t || null; o.obs_por = t ? ctx.nome : null; o.obs_em = t ? agoraTxt() : null; }
    ST.linha[id] = o; grava();
    return { id: id, forma: o.forma || null, forma_por: o.forma_por || null, obs: o.obs || null, obs_por: o.obs_por || null, obs_em: o.obs_em || null };
  });

  D.rpc('contas_baixadas', function (b) {
    var d = b.p_dados || {}, hoje = M.hoje();
    var bx = filtraLoja(lancamentos(), d.loja).filter(function (l) { return l.baixado; });
    if (d.dia) return { lista: bx.filter(function (l) { return l.dia === d.dia; }).map(linhaBaixada) };
    var mes = d.mes || hoje.slice(0, 7);
    return { dias: porDia(bx.filter(function (l) { return l.dia.slice(0, 7) === mes; }), hoje) };
  });

  /* ---------------- a receber ---------------- */
  var FORMAS_RC = [
    { k: 'ifood', onde: 'iFood', quem: 'Vendas do delivery pelo iFood', metodo: 'Online (iFood)' },
    { k: 'credito', onde: 'Cartão de crédito', quem: 'Vendas no crédito (salão e entrega)', metodo: 'Crédito' },
    { k: 'debito', onde: 'Cartão de débito', quem: 'Vendas no débito (salão e entrega)', metodo: 'Débito' },
    { k: 'pix', onde: 'Pix', quem: 'Vendas no Pix', metodo: 'Pix' },
    { k: 'dinheiro', onde: 'Dinheiro', quem: 'Vendas em dinheiro', metodo: 'Dinheiro' },
    { k: 'vale', onde: 'Vale-refeição', quem: 'Vendas no vale-refeição (salão)', metodo: 'Vale-refeição' }
  ];
  var CLIENTES = ['Academia Corpo Ativo', 'Escola Pequeno Saber', 'Clínica Bem-Estar', 'Construtora Pedra Firme', 'Escritório Horizonte', 'Coworking Ponto de Encontro', 'Associação Vila Nova', 'Agência Criativa Exemplo'];
  var EVENTOS = ['Coffee break para %n pessoas', 'Encomenda de %n lanches', 'Almoço de confraternização (%n pessoas)', 'Kit lanche para evento (%n un.)'];

  var VENDAS = {};
  function vendasDia(dia, L) {
    var k = dia + '|' + L.id;
    if (VENDAS[k]) return VENDAS[k];
    var v = { ifood: 0, credito: 0, debito: 0, pix: 0, dinheiro: 0, vale: 0, npix: 0 };
    if (dia <= M.hoje()) {
      var r = M.rng('rc|' + k);
      M.pedidos(dia, L.id).forEach(function (p) {
        if (p.cancelado) return;
        if (p.pagamento === 'online') v.ifood += p.total;
        else if (p.pagamento === 'cartao_na_entrega') { if (r() < 0.6) v.credito += p.total; else v.debito += p.total; }
        else if (p.pagamento === 'pix') { v.pix += p.total; v.npix++; }
        else v.dinheiro += p.total;
      });
      var f = M.salao(dia, L.id).faturamento || 0;
      var pc = 0.42 + r() * 0.08, pd = 0.27 + r() * 0.06, pp = 0.13 + r() * 0.04, pv = 0.05 + r() * 0.03;
      v.credito += f * pc; v.debito += f * pd; v.pix += f * pp; v.vale += f * pv; v.dinheiro += f * Math.max(0, 1 - pc - pd - pp - pv);
      v.npix += Math.round(f * pp / 85);
      ['ifood', 'credito', 'debito', 'pix', 'dinheiro', 'vale'].forEach(function (x) { v[x] = M.arred(v[x]); });
    }
    VENDAS[k] = v;
    return v;
  }

  function linhasVenda(dia, L) {
    var hoje = M.hoje(), ontem = M.dia(-1);
    if (dia > hoje) return [];
    var v = vendasDia(dia, L), r = [];
    FORMAS_RC.forEach(function (f, i) {
      if (!(v[f.k] > 0)) return;
      var rec = dia < hoje;
      r.push({ id: 'rc-' + L.id + '-' + dia + '-' + i, dia: dia, vencimento: ddmm(dia), loja: L.nome, onde: f.onde, quem: f.quem,
               categoria: 'Vendas', metodo: f.metodo, valor: v[f.k], recebido: rec, baixa: rec ? ddmm(dia) : null,
               banco: f.k === 'pix' && dia <= ontem ? { data: ddmm(dia), descricao: 'Pix recebidos no dia', conta: 'Conta ' + L.nome } : null });
    });
    return r;
  }

  var FAT = {};
  function faturados(ym, L) {
    var k = ym + '|' + L.id;
    if (FAT[k]) return FAT[k];
    var hoje = M.hoje(), ontem = M.dia(-1);
    var r = M.rng('fat|' + k), n = 1 + Math.floor(r() * 3), lista = [];
    for (var i = 0; i < n; i++) {
      var dia = diaDoMes(ym, 3 + Math.floor(r() * 25));
      var cli = CLIENTES[Math.floor(r() * CLIENTES.length)];
      var qtd = 20 + Math.floor(r() * 60);
      var ev = EVENTOS[Math.floor(r() * EVENTOS.length)].replace('%n', qtd);
      var valor = M.arred(qtd * (28 + r() * 12));
      var idade = difDias(hoje, dia), x = r();
      var rec = idade > 0 && x < (idade > 30 ? 0.95 : 0.7);
      var baixa = null, banco = null;
      if (rec) {
        baixa = M.somaDias(dia, Math.floor(r() * 3));
        if (baixa > hoje) baixa = hoje;
        if (baixa <= ontem) banco = { data: ddmm(baixa), descricao: 'TED recebida — ' + cli, conta: 'Conta ' + L.nome, iso: baixa };
      }
      lista.push({ id: 'fat-' + L.id + '-' + ym + '-' + i, dia: dia, vencimento: ddmm(dia), loja: L.nome, onde: 'Faturado (boleto)',
                   quem: ev + ' — ' + cli, categoria: 'Encomendas', metodo: 'Boleto', valor: valor, recebido: rec,
                   baixa: baixa ? ddmm(baixa) : null, banco: banco });
    }
    FAT[k] = lista;
    return lista;
  }

  function linhasReceber(dia, L) {
    return linhasVenda(dia, L).concat(faturados(dia.slice(0, 7), L).filter(function (f) { return f.dia === dia; }));
  }
  function semIso(l) {
    var o = {}; for (var k in l) if (k !== 'dia') o[k] = l[k];
    if (o.banco) { var b = {}; for (var j in o.banco) if (j !== 'iso') b[j] = o.banco[j]; o.banco = b; }
    return o;
  }

  /* o que entrou no banco num dia, conta por conta (sempre todas as lojas) */
  var BANCO = {};
  function somaVendas(L, de, ate, campo) {
    var t = 0;
    M.intervalo(de, ate).forEach(function (d) { t += vendasDia(d, L)[campo]; });
    return t;
  }
  function bancoDoDia(dia) {
    if (dia > M.dia(-1)) return [];
    if (BANCO[dia]) return BANCO[dia];
    var dow = M.diaSemana(dia), r = [];
    LOJAS.forEach(function (L) {
      var n = 0, t = 0, ant = M.somaDias(dia, -1);
      var v = vendasDia(dia, L), va = vendasDia(ant, L);
      if (v.pix > 0) { n += Math.max(1, v.npix); t += v.pix; }
      var maq = (va.credito + va.debito) * 0.976;
      if (maq > 0) { n += 2; t += maq; }
      if (dow === 3) { var ifd = somaVendas(L, M.somaDias(dia, -9), M.somaDias(dia, -3), 'ifood') * 0.83; if (ifd > 0) { n++; t += ifd; } }
      if (dow === 1 || dow === 4) { var din = somaVendas(L, M.somaDias(dia, dow === 1 ? -4 : -3), ant, 'dinheiro'); if (din > 0) { n++; t += din; } }
      if (dow === 5) { var vr = somaVendas(L, M.somaDias(dia, -11), M.somaDias(dia, -5), 'vale') * 0.95; if (vr > 0) { n++; t += vr; } }
      faturados(dia.slice(0, 7), L).concat(faturados(somaMes(dia.slice(0, 7), -1), L)).forEach(function (f) {
        if (f.banco && f.banco.iso === dia) { n++; t += f.valor; }
      });
      if (n) r.push({ conta: 'Conta ' + L.nome, n: n, total: M.arred(t) });
    });
    BANCO[dia] = r;
    return r;
  }
  function totalBanco(dia) { var t = 0; bancoDoDia(dia).forEach(function (b) { t += b.total; }); return M.arred(t); }

  function lojasFiltro(nome) { var L = lojaPorNome(nome); return L ? [L] : LOJAS; }

  D.rpc('contas_receber', function (b) {
    var d = b.p_dados || {}, hoje = M.hoje(), ontem = M.dia(-1), mesHoje = hoje.slice(0, 7);
    var LS = lojasFiltro(d.loja);
    if (d.aberto) {
      var ab = [];
      var de = M.somaDias(hoje, -180), ate = M.somaDias(hoje, 60);
      for (var k = -7; k <= 2; k++) {
        var ym = somaMes(mesHoje, k);
        LS.forEach(function (L) { faturados(ym, L).forEach(function (f) { if (!f.recebido && f.dia >= de && f.dia <= ate) ab.push(f); }); });
      }
      LS.forEach(function (L) { linhasVenda(hoje, L).forEach(function (l) { if (!l.recebido) ab.push(l); }); });
      ab.sort(function (x, y) { return x.dia < y.dia ? -1 : x.dia > y.dia ? 1 : 0; });
      return { lista: ab.map(semIso), banco_ate: ddmm(ontem) };
    }
    if (d.dia) {
      var lista = [];
      LS.forEach(function (L) { lista = lista.concat(linhasReceber(d.dia, L)); });
      return { lista: lista.map(semIso), banco_do_dia: bancoDoDia(d.dia), banco_ate: ddmm(ontem) };
    }
    var mes = /^\d{4}-\d{2}$/.test(String(d.mes || '')) ? d.mes : mesHoje;
    var meses = [];
    for (var j = -3; j <= 1; j++) {
      var m = somaMes(mesHoje, j), cnt = 0;
      M.intervalo(m + '-01', diaDoMes(m, 31)).forEach(function (dia) { LS.forEach(function (L) { cnt += linhasVenda(dia, L).length; }); });
      LS.forEach(function (L) { cnt += faturados(m, L).length; });
      meses.push({ mes: m, n: cnt });
    }
    var dias = [];
    M.intervalo(mes + '-01', diaDoMes(mes, 31)).forEach(function (dia) {
      var ls = [];
      LS.forEach(function (L) { ls = ls.concat(linhasReceber(dia, L)); });
      var bk = totalBanco(dia);
      if (!ls.length && !bk) return;
      var o = diaInfo(dia, hoje);
      o.n_ab = 0; o.t_ab = 0; o.n_rc = 0; o.t_rc = 0;
      ls.forEach(function (l) { if (l.recebido) { o.n_rc++; o.t_rc += l.valor; } else { o.n_ab++; o.t_ab += l.valor; } });
      o.t_ab = M.arred(o.t_ab); o.t_rc = M.arred(o.t_rc); o.banco = bk || null;
      dias.push(o);
    });
    var abn = 0, abt = 0;
    var de2 = M.somaDias(hoje, -180), ate2 = M.somaDias(hoje, 60);
    for (var k2 = -7; k2 <= 2; k2++) {
      var ym2 = somaMes(mesHoje, k2);
      LS.forEach(function (L) { faturados(ym2, L).forEach(function (f) { if (!f.recebido && f.dia >= de2 && f.dia <= ate2) { abn++; abt += f.valor; } }); });
    }
    LS.forEach(function (L) { linhasVenda(hoje, L).forEach(function (l) { if (!l.recebido) { abn++; abt += l.valor; } }); });
    return { mes: mes, hoje_iso: hoje, lojas: nomesLojas(), meses: meses, aberto: { n: abn, total: M.arred(abt) }, dias: dias, banco_ate: ddmm(ontem) };
  });
})();
