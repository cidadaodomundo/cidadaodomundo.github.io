/* Escala do Mes (demonstracao): molde da semana por dia, dias com data do mes, domingos em rodizio,
   folgas semanais do cadastro, freelancers por setor e equipe (quem e chave e o que sabe fazer).
   Simula a rpc escala_semana_consulta, acoes: ler, equipe, taxas_ler, taxas_salvar, perfil_ler,
   perfil_salvar, funcoes_historico, salvar_dia e gerar_mes.
   As pessoas sao as de MUNDO.equipe e MUNDO.freelas (inventadas), com folga e turno do proprio MUNDO.
   O que se grava na tela fica so neste navegador (localStorage, chave demo_escala_mensal). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  var DIASN = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  /* catalogo de funcoes de exemplo, por setor */
  var FUNCOES = [
    ['GER_ABRE', 'Abertura da loja', 'Gerência'], ['GER_FECHA', 'Fechamento da loja', 'Gerência'], ['GER_ESC', 'Escala e equipe', 'Gerência'],
    ['GER_COMPRAS', 'Pedido de compras', 'Gerência'],
    ['COZ_CHAPA', 'Chapa', 'Cozinha'], ['COZ_MONT', 'Montagem dos lanches', 'Cozinha'], ['COZ_FRIT', 'Fritura', 'Cozinha'],
    ['COZ_PREP', 'Pré-preparo', 'Cozinha'], ['COZ_LIDER', 'Liderança da cozinha', 'Cozinha'], ['COZ_LOUCA', 'Lavagem de louça', 'Cozinha'],
    ['PRO_MOLHO', 'Molhos da casa', 'Produção'], ['PRO_CARNE', 'Porcionar carnes', 'Produção'], ['PRO_PAO', 'Pães e insumos', 'Produção'],
    ['BAR_DRINK', 'Drinks', 'Bar'], ['BAR_COPA', 'Copa', 'Bar'], ['BAR_SHAKE', 'Milkshakes e sobremesas', 'Bar'],
    ['CX_CAIXA', 'Caixa', 'Caixa'], ['CX_CONF', 'Conferência do caixa', 'Caixa'],
    ['DEL_ATEND', 'Atendimento do delivery', 'Delivery'], ['DEL_EXP', 'Expedição e embalagem', 'Delivery'], ['DEL_CONF', 'Conferência dos pedidos', 'Delivery'],
    ['SAL_MESA', 'Atendimento de mesas', 'Salão'], ['SAL_CUMIM', 'Cumim (apoio ao garçom)', 'Salão'], ['SAL_RECEP', 'Recepção e fila', 'Salão'],
    ['SAL_CONTA', 'Fechar conta na mesa', 'Salão'],
    ['LIM_SALAO', 'Limpeza do salão', 'Limpeza'], ['LIM_COZ', 'Limpeza da cozinha', 'Limpeza'], ['LIM_BANH', 'Banheiros', 'Limpeza']
  ].map(function (f) { return { codigo: f[0], nome: f[1], setor: f[2] }; });
  var PRINCIPAL = {
    'Cozinheiro(a)': 'COZ_MONT', 'Auxiliar de cozinha': 'COZ_PREP', 'Chapeiro(a)': 'COZ_CHAPA', 'Líder de cozinha': 'COZ_LIDER',
    'Garçom/Garçonete': 'SAL_MESA', 'Cumim': 'SAL_CUMIM', 'Recepcionista': 'SAL_RECEP', 'Operador(a) de caixa': 'CX_CAIXA',
    'Atendente do delivery': 'DEL_ATEND', 'Expedição': 'DEL_EXP', 'Bartender': 'BAR_DRINK', 'Copeiro(a)': 'BAR_COPA',
    'Auxiliar de limpeza': 'LIM_SALAO', 'Gerente da loja': 'GER_ESC'
  };
  var SETOR_FREELA = { 'Garçom/Garçonete': 'Salão', 'Auxiliar de cozinha': 'Cozinha', 'Chapeiro(a)': 'Cozinha', 'Copeiro(a)': 'Bar', 'Motoboy': 'Delivery', 'Bartender': 'Bar' };

  /* ---------------- estado guardado neste navegador ---------------- */
  var CHAVE = 'demo_escala_mensal';
  function ler() {
    try { var o = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (o && o.lojas) return o; } catch (e) {}
    return { lojas: {}, perfil: {}, taxas: {}, seq: 9000 };
  }
  var ST = ler();
  function grava() { try { localStorage.setItem(CHAVE, JSON.stringify(ST)); } catch (e) {} }
  function stLoja(L) { return ST.lojas[L.id] || (ST.lojas[L.id] = { molde: {}, dias: {}, gerados: {} }); }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }

  function lojaDe(d) { return M.loja(d && (d.loja || d.unidade)) || M.lojas[0]; }
  function lojaIdx(L) { for (var i = 0; i < M.lojas.length; i++) if (M.lojas[i].id === L.id) return i; return 0; }
  function mesDe(iso) { return String(iso).slice(0, 7); }
  function mesSeguinte() {
    var p = M.hoje().split('-'), a = +p[0], m = +p[1] + 1;
    if (m > 12) { m = 1; a++; }
    return a + '-' + (m < 10 ? '0' : '') + m;
  }
  function diasDoMes(mes) {
    var p = mes.split('-'), n = new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(), r = [];
    for (var d = 1; d <= n; d++) r.push(mes + '-' + (d < 10 ? '0' : '') + d);
    return r;
  }

  /* ---------------- equipe da loja ---------------- */
  function gente(L) {
    return M.equipe.filter(function (p) { return p.loja === L.id && p.ativo; });
  }
  function turnoDe(p) { return p.turno === 'Dia' ? 'Dia' : 'Noite'; } /* intermediario entra na escala da noite */
  function rodaDomingo(p) { return p.setor === 'Gerência' || M.rng('dom|' + p.id)() < 0.8; }
  function nivelBase(p, L) {
    if (p.cargo === 'Gerente da loja' || p.cargo === 'Líder de cozinha' || p.cargo === 'Chapeiro(a)') return 'CHAVE';
    if (p.experiencia) return 'APRENDIZ';
    var primeiroCoz = gente(L).filter(function (x) { return x.cargo === 'Cozinheiro(a)'; })[0];
    if (primeiroCoz && primeiroCoz.id === p.id) return 'CHAVE';
    if (p.cargo === 'Bartender' || p.cargo === 'Operador(a) de caixa') return 'CHAVE';
    return 'NORMAL';
  }
  function funcoesBase(p) {
    if (p.experiencia) return [];
    var r = M.rng('func|' + p.id), pri = PRINCIPAL[p.cargo], out = pri ? [pri] : [];
    var mesmas = FUNCOES.filter(function (f) { return f.setor === p.setor && f.codigo !== pri; });
    var extra = M.entre(r, 0, 2);
    for (var i = 0; i < extra && mesmas.length; i++) {
      var f = mesmas.splice(Math.floor(r() * mesmas.length), 1)[0];
      out.push(f.codigo);
    }
    if (p.setor === 'Cozinha' && r() < 0.5) out.push(M.escolhe(r, ['PRO_MOLHO', 'PRO_CARNE', 'PRO_PAO']));
    return out;
  }
  function perfilDe(p, L) {
    var g = ST.perfil[p.id];
    return { nivel: (g && g.nivel) || nivelBase(p, L), funcoes: (g && Array.isArray(g.funcoes)) ? g.funcoes.slice() : funcoesBase(p) };
  }
  function nivelPorId(id) {
    var p = M.pessoa(id); if (!p) return null;
    return perfilDe(p, M.loja(p.loja)).nivel;
  }

  /* ---------------- freelancers (taxas) ---------------- */
  function taxasBase(L) {
    var r = M.rng('taxas-escala|' + L.id);
    var OBS = ['só fins de semana', 'já cobriu férias na casa', 'prefere a noite', '', 'chega cedo, confiável'];
    return M.freelas.filter(function (f) { return !f.loja || f.loja === L.id; }).map(function (f, i) {
      var semSetor = !f.loja && f.funcao === 'Copeiro(a)';
      var turno = M.pesado(r, [['noite', 5], ['dia', 2], ['dia e noite', 2]]);
      var obs = M.escolhe(r, OBS);
      return {
        id: f.id, apelido: f.apelido, nome_completo: f.nome,
        telefone: i === 3 ? '' : f.telefone,
        setor: semSetor ? null : (SETOR_FREELA[f.funcao] || null), turno: turno,
        obs: (obs ? obs + ' · ' : '') + 'diária R$ ' + f.valor_dia
      };
    });
  }
  function taxasDe(L) { return ST.taxas[L.id] ? copia(ST.taxas[L.id]) : taxasBase(L); }

  /* ---------------- linhas da escala ---------------- */
  function ordemDe(p, i) {
    return (p.cargo === 'Gerente da loja' || p.cargo === 'Líder de cozinha' ? 1 : p.cargo === 'Chapeiro(a)' ? 2 : 10) + i;
  }
  function linhaPessoa(p, i, dow) {
    return {
      dia_semana: dow, data: null, turno: turnoDe(p), setor: p.setor, funcao: p.cargo,
      funcionario_id: p.id, nome: p.nome,
      entrada: p.entrada, int_ini: null, int_fim: null, saida: p.saida, intervalo_min: p.intervalo_min,
      marcacao: dow === p.folga ? 'FOLGA' : null, ordem: ordemDe(p, i), obs: null
    };
  }
  function linhasTaxa(L, dow) {
    var ts = taxasDe(L).filter(function (t) { return ['Salão', 'Cozinha', 'Bar'].indexOf(t.setor) >= 0 && t.nome_completo; });
    var r = [];
    if (dow === 5 || dow === 6) {
      ts.slice(0, dow === 6 ? 2 : 1).forEach(function (t, i) {
        r.push({ dia_semana: dow, data: null, turno: 'Noite', setor: t.setor, funcao: 'Taxa', funcionario_id: null, nome: t.nome_completo,
          entrada: '18:00', int_ini: null, int_fim: null, saida: '23:30', intervalo_min: 0, marcacao: 'TAXA', ordem: 100 + i, obs: null });
      });
    }
    if (dow === 0) {
      ts.slice(0, 2).forEach(function (t, i) {
        var dia = i === 0;
        r.push({ dia_semana: 0, data: null, turno: dia ? 'Dia' : 'Noite', setor: t.setor, funcao: 'Taxa', funcionario_id: null, nome: t.nome_completo,
          entrada: dia ? '11:00' : '18:00', int_ini: null, int_fim: null, saida: dia ? '16:00' : '23:30', intervalo_min: 0, marcacao: 'TAXA', ordem: 100 + i, obs: null });
      });
    }
    return r;
  }
  function moldeBase(L, dow) {
    return gente(L).map(function (p, i) { return linhaPessoa(p, i, dow); }).concat(linhasTaxa(L, dow));
  }
  function moldeAtual(L, dow, ov) {
    var o = ov || stLoja(L).molde;
    return o[dow] ? copia(o[dow]) : moldeBase(L, dow);
  }

  /* quem esta de ferias (uma pessoa por loja, periodo de exemplo) */
  function ferias(L) {
    var li = lojaIdx(L);
    if (li % 3 === 2) return null;
    var cand = gente(L).filter(function (p) { return p.setor !== 'Gerência' && !p.experiencia; });
    if (!cand.length) return null;
    var p = cand[(li * 5 + 3) % cand.length];
    var mes = li % 3 === 0 ? mesSeguinte() : mesDe(M.hoje());
    var ini = li % 3 === 0 ? 9 : 5;
    return { id: p.id, de: mes + '-' + (ini < 10 ? '0' : '') + ini, ate: mes + '-' + (ini + 14) };
  }

  /* domingo de folga de cada um no mes: chaves do mesmo setor e turno caem em domingos diferentes */
  function rodizio(L, mes) {
    var doms = diasDoMes(mes).filter(function (d) { return M.diaSemana(d) === 0; });
    var ps = gente(L).filter(rodaDomingo).map(function (p) { return { p: p, chave: perfilDe(p, L).nivel === 'CHAVE' }; });
    ps.sort(function (a, b) {
      var ka = a.p.setor + '|' + turnoDe(a.p), kb = b.p.setor + '|' + turnoDe(b.p);
      if (ka !== kb) return ka < kb ? -1 : 1;
      if (a.chave !== b.chave) return a.chave ? -1 : 1;
      return a.p.id - b.p.id;
    });
    var off = M.hash(L.id + mes) % Math.max(1, doms.length), r = {};
    ps.forEach(function (x, k) { r[x.p.id] = doms[(k + off) % doms.length]; });
    return r;
  }

  function linhasDoDia(L, iso, ov, rod, fer) {
    var dow = M.diaSemana(iso);
    var ls = dow === 0
      ? gente(L).map(function (p, i) { var l = linhaPessoa(p, i, 0); l.marcacao = rod[p.id] === iso ? 'FOLGA' : null; return l; }).concat(linhasTaxa(L, 0))
      : moldeAtual(L, dow, ov);
    var domSemana = M.somaDias(iso, -dow);
    return ls.map(function (l) {
      l = copia(l); l.data = iso; l.dia_semana = dow;
      var id = l.funcionario_id;
      if (id && dow !== 0 && l.marcacao === 'FOLGA' && rod[id] === domSemana) l.marcacao = 'JA_FOLGOU';
      if (id && fer && fer.id === id && iso >= fer.de && iso <= fer.ate) {
        l.marcacao = 'FERIAS'; l.entrada = null; l.saida = null; l.int_ini = null; l.int_fim = null; l.intervalo_min = null;
      }
      return l;
    });
  }

  function mesMontado(L, mes) {
    var g = stLoja(L).gerados;
    if (g[mes]) return g[mes];
    return mes <= mesSeguinte() ? { molde: {} } : null;
  }
  function linhasDoMes(L, mes) {
    var g = mesMontado(L, mes); if (!g) return [];
    var st = stLoja(L), rod = rodizio(L, mes), fer = ferias(L), out = [];
    diasDoMes(mes).forEach(function (iso) {
      var ls = st.dias[iso] ? copia(st.dias[iso]) : linhasDoDia(L, iso, g.molde, rod, fer);
      out = out.concat(ls);
    });
    return out;
  }
  function comNivel(l) {
    l.nivel = l.funcionario_id ? nivelPorId(l.funcionario_id) : null;
    return l;
  }
  function limpaLinha(l, dow, data) {
    function h(v) { return v && /^\d{1,2}:\d{2}/.test(String(v)) ? String(v).slice(0, 5) : null; }
    var id = l.funcionario_id != null && l.funcionario_id !== '' ? +l.funcionario_id : null;
    return {
      dia_semana: dow, data: data || null, turno: l.turno === 'Dia' ? 'Dia' : 'Noite', setor: String(l.setor || 'Sem setor'),
      funcao: String(l.funcao || ''), funcionario_id: id, nome: String(l.nome || ''),
      entrada: h(l.entrada), int_ini: h(l.int_ini), int_fim: h(l.int_fim), saida: h(l.saida),
      intervalo_min: l.intervalo_min != null && l.intervalo_min !== '' ? +l.intervalo_min : null,
      marcacao: ['FOLGA', 'TAXA', 'JA_FOLGOU', 'FERIAS'].indexOf(l.marcacao) >= 0 ? l.marcacao : null,
      ordem: l.ordem != null ? +l.ordem : 100, obs: l.obs || null
    };
  }

  /* ---------------- a porta ---------------- */
  var ACOES = {
    ler: function (d) {
      var L = lojaDe(d), mes = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : mesSeguinte();
      var molde = [];
      for (var dow = 1; dow <= 6; dow++) molde = molde.concat(moldeAtual(L, dow).map(function (l) { l.dia_semana = dow; l.data = null; return l; }));
      var dias = linhasDoMes(L, mes);
      return molde.concat(dias).map(comNivel).sort(function (a, b) {
        var da = a.data || '', db = b.data || '';
        if (da !== db) return da < db ? -1 : 1;
        if (a.dia_semana !== b.dia_semana) return a.dia_semana - b.dia_semana;
        return (a.ordem || 0) - (b.ordem || 0);
      });
    },
    equipe: function (d) {
      var L = lojaDe(d);
      return gente(L).map(function (p) {
        return { id: p.id, nome: p.nome, setor: p.setor, nivel: perfilDe(p, L).nivel, noturno: turnoDe(p) === 'Noite',
          folgas: DIASN[p.folga] + (rodaDomingo(p) ? ' + 1 domingo' : '') };
      });
    },
    taxas_ler: function (d) { return taxasDe(lojaDe(d)); },
    taxas_salvar: function (d) {
      var L = lojaDe(d), lista = taxasDe(L);
      (d.linhas || []).forEach(function (n) {
        lista.forEach(function (t) {
          if (String(t.id) !== String(n.id)) return;
          ['apelido', 'nome_completo', 'telefone', 'setor', 'turno', 'obs'].forEach(function (k) { if (n[k] !== undefined) t[k] = n[k]; });
        });
      });
      (d.novos || []).forEach(function (n) {
        if (!n.apelido) return;
        lista.push({ id: ++ST.seq, apelido: n.apelido, nome_completo: n.nome_completo || '', telefone: n.telefone || '',
          setor: n.setor && n.setor !== 'Sem setor' ? n.setor : null, turno: n.turno || '', obs: n.obs || '' });
      });
      ST.taxas[L.id] = lista; grava();
      return { ok: true, gravadas: (d.linhas || []).length + (d.novos || []).length };
    },
    perfil_ler: function (d) {
      var L = lojaDe(d);
      return {
        funcoes: copia(FUNCOES),
        pessoas: gente(L).map(function (p) { var g = perfilDe(p, L); return { id: p.id, nome: p.nome, setor: p.setor, nivel: g.nivel, funcoes: g.funcoes }; })
      };
    },
    perfil_salvar: function (d) {
      var L = lojaDe(d), n = 0;
      (d.pessoas || []).forEach(function (x) {
        var p = M.pessoa(x.id); if (!p || p.loja !== L.id) return;
        ST.perfil[p.id] = { nivel: ['CHAVE', 'NORMAL', 'APRENDIZ'].indexOf(x.nivel) >= 0 ? x.nivel : 'NORMAL', funcoes: Array.isArray(x.funcoes) ? x.funcoes.map(String) : [] };
        n++;
      });
      grava();
      return { ok: true, gravadas: n };
    },
    funcoes_historico: function (d) {
      var L = lojaDe(d), novos = 0, com = 0;
      gente(L).forEach(function (p) {
        var g = perfilDe(p, L), pri = PRINCIPAL[p.cargo];
        if (pri && g.funcoes.indexOf(pri) < 0) { g.funcoes.push(pri); novos++; ST.perfil[p.id] = g; }
        if (g.funcoes.length) com++;
      });
      grava();
      return { ok: true, vinculos_novos: novos, pessoas_com_funcao: com, dias: d.dias || 120 };
    },
    salvar_dia: function (d) {
      var L = lojaDe(d), st = stLoja(L), ls = d.linhas || [];
      if (d.data) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data)) throw D.erro(400, 'Data inválida', 'P0001');
        var dw = M.diaSemana(d.data);
        st.dias[d.data] = ls.map(function (l) { return limpaLinha(l, dw, d.data); });
      } else {
        var dow = +d.dia_semana;
        if (!(dow >= 0 && dow <= 6)) throw D.erro(400, 'Dia da semana inválido', 'P0001');
        st.molde[dow] = ls.map(function (l) { return limpaLinha(l, dow, null); });
      }
      grava();
      return { ok: true, gravadas: ls.length };
    },
    gerar_mes: function (d) {
      var L = lojaDe(d), st = stLoja(L), mes = d.mes;
      if (!/^\d{4}-\d{2}$/.test(mes || '')) throw D.erro(400, 'Mês inválido', 'P0001');
      st.gerados[mes] = { molde: copia(st.molde), em: M.agoraISO() };
      diasDoMes(mes).forEach(function (iso) { delete st.dias[iso]; });
      grava();
      var dias = diasDoMes(mes);
      return { ok: true, linhas_mes: linhasDoMes(L, mes).length, domingos: dias.filter(function (x) { return M.diaSemana(x) === 0; }).length, dias: dias.length };
    }
  };

  D.rpc('escala_semana_consulta', function (b, ctx) {
    var acao = String(b.p_acao || 'ler'), d = b.p_dados || {};
    if (!ctx.papel) throw D.erro(401, 'Sessão expirada', '28000');
    var fn = ACOES[acao];
    if (!fn) throw D.erro(400, 'Ação desconhecida: ' + acao, 'P0001');
    return fn(d, ctx);
  });
})();
