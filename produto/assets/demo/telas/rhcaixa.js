/* Caixa de entrada do RH (demonstracao): rh/caixa.html.
   Simula a porta rh_caixa_porta (contagem, sugerir_nomes, alertas, listar, nome, responder,
   aprovar, recusar, aprovar_explicados).
   Tambem monta DEMO.rhBase, a base de RH usada pelas telas de folha e rescisao:
   pessoas (MUNDO.equipe + dois desligados), empresa de cada loja e as ocorrencias do RH
   (faltas, atestados e batidas tiradas de MUNDO.batidas; orientacoes, advertencias etc.).
   O que a tela decide fica no localStorage com prefixo "demo_rhcaixa_". */
(function () {
  'use strict';
  if (!window.DEMO || !window.MUNDO) return;
  var D = window.DEMO, M = window.MUNDO, C = window.PORTAL_CFG || {};

  /* ---------------- utilidades ---------------- */
  function ler(k, padrao) { try { var v = localStorage.getItem('demo_rhcaixa_' + k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  function gravar(k, v) { try { localStorage.setItem('demo_rhcaixa_' + k, JSON.stringify(v)); } catch (e) {} }
  function difDias(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
  var ACC = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', SEMAC = 'AAAAAEEEEIIIIOOOOOUUUUC';
  function flash(n) { /* nome como o sistema de ponto escreve: maiusculo e sem acento */
    var t = String(n || '').toUpperCase(), r = '';
    for (var i = 0; i < t.length; i++) { var k = ACC.indexOf(t.charAt(i)); r += k >= 0 ? SEMAC.charAt(k) : t.charAt(i); }
    return r;
  }
  function hms(hm) { return hm ? String(hm).slice(0, 5) + ':00' : null; }
  function isoDe(dia, hhmm) { return dia + 'T' + (hhmm || '10:00') + ':00-03:00'; }

  var HOJE = M.hoje();
  /* janela de ocorrencias: do dia 1 de quatro meses atras ate hoje (cobre o trimestre anterior) */
  var INI = (function () {
    var y = +HOJE.slice(0, 4), m = +HOJE.slice(5, 7) - 4;
    while (m < 1) { m += 12; y--; }
    return y + '-' + (m < 10 ? '0' : '') + m + '-01';
  })();

  /* ---------------- pessoas ---------------- */
  var ATIVOS = M.equipe.slice();
  var SAIRAM = [];
  (function () {
    var usados = {}; ATIVOS.forEach(function (p) { usados[p.apelido] = 1; });
    var livres = [];
    M.motoboys.concat(M.freelas).forEach(function (x) { if (!usados[x.apelido] && livres.indexOf(x.apelido) < 0) livres.push(x.apelido); });
    var cargos = [['Cozinha', 'Auxiliar de cozinha'], ['Salão', 'Garçom/Garçonete']];
    for (var k = 0; k < 2 && k < livres.length && ATIVOS.length > 10; k++) {
      var base = ATIVOS[(k * 13 + 7) % ATIVOS.length];
      var sob = base.nome.split(' ');
      var l = M.lojas[(k + 1) % M.lojas.length];
      var nome = livres[k * 2] + ' ' + sob[sob.length - 1];
      SAIRAM.push({
        id: 951 + k, nome: nome, apelido: nome.split(' ')[0], loja: l.id, unidade: l.nome,
        setor: cargos[k][0], cargo: cargos[k][1], turno: 'Dia', entrada: '10:00', saida: '18:20', intervalo_min: 60,
        folga: 2 + k, admissao: M.dia(-420 - k * 200), cartao: 'C' + (1951 + k), matricula: String(951 + k),
        cargo_confianca: false, salario: k ? 1900 : 1950, ativo: false, experiencia: false,
        saiu: true, saiu_em: M.dia(-20 - k * 28)
      });
    }
  })();
  var TODOS = ATIVOS.concat(SAIRAM);
  var POR_ID = {}, POR_NOME = {};
  TODOS.forEach(function (p) { POR_ID[p.id] = p; POR_NOME[p.nome] = p; });
  function gerenteDe(lojaId) {
    for (var i = 0; i < ATIVOS.length; i++) if (ATIVOS[i].loja === lojaId && ATIVOS[i].cargo_confianca) return ATIVOS[i];
    return null;
  }
  function empresa(lojaId) { var l = M.loja(lojaId); return (C.marca || 'Restaurante') + ' ' + (l ? l.nome : ''); }
  var COMUNS = ATIVOS.filter(function (p) { return !p.cargo_confianca && !p.experiencia; });
  function comum(lojaIdx, n) {
    var l = M.lojas[lojaIdx % M.lojas.length];
    var x = COMUNS.filter(function (p) { return p.loja === l.id; });
    return x.length ? x[n % x.length] : COMUNS[n % COMUNS.length];
  }

  /* ---------------- documento de exemplo (fica so no navegador) ---------------- */
  var DOCS = {};
  function documento(id, titulo, nome, periodo) {
    if (DOCS[id]) return DOCS[id];
    try {
      var e = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842" viewBox="0 0 595 842">'
        + '<rect width="595" height="842" fill="#fff"/><rect x="30" y="30" width="535" height="782" fill="none" stroke="#999" stroke-dasharray="6 4"/>'
        + '<text x="297" y="110" font-family="Arial" font-size="26" font-weight="bold" text-anchor="middle" fill="#222">' + e(titulo) + '</text>'
        + '<text x="297" y="150" font-family="Arial" font-size="15" text-anchor="middle" fill="#c0392b">DOCUMENTO DE EXEMPLO · DEMONSTRAÇÃO</text>'
        + '<text x="70" y="240" font-family="Arial" font-size="16" fill="#222">Funcionário(a): ' + e(nome) + '</text>'
        + '<text x="70" y="275" font-family="Arial" font-size="16" fill="#222">Período: ' + e(periodo) + '</text>'
        + '<text x="70" y="310" font-family="Arial" font-size="16" fill="#222">Empresa: ' + e(C.marca || '') + '</text>'
        + '<text x="297" y="760" font-family="Arial" font-size="12" text-anchor="middle" fill="#777">Documento fictício, gerado na hora pela demonstração do portal.</text></svg>';
      DOCS[id] = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    } catch (x) { DOCS[id] = null; }
    return DOCS[id];
  }

  /* ---------------- ocorrencias (base, sempre igual para o mesmo dia) ---------------- */
  var TIPOS_CARTAO = ['PARA_O_FLASH', 'COMBINADO', 'COBERTURA', 'ORIENTACAO', 'AVISOU_ANTES', 'ERRO_CORRIGIDO'];
  var FONTE_CARTAO = 'portal · cartao do ponto';
  var OBS_RECUSA = ['era folga trocada com colega, combinada com a gerência', 'já estava ajustado no Flash', 'pessoa errada: era outra pessoa da escala', 'estava cobrindo outra loja nesse dia'];
  var OBS_FALTA = ['trocou a folga com colega, a gerência confirmou', 'estava cobrindo outra loja nesse dia', 'falta abonada: entregou declaração depois'];
  var BASE = null;

  function gerar() {
    var itens = [], ids = {};
    function add(o) {
      var id = 10000 + (M.hash(o.tipo + '|' + (o.pid || o.nome_lido) + '|' + o.data) % 890000);
      while (ids[id]) id++;
      ids[id] = 1; o.id = id; itens.push(o);
      return o;
    }
    function escrito(texto, p) { var g = gerenteDe(p.loja); return texto + ' — escrito por ' + (g ? g.apelido + ' (gerência)' : 'gerência'); }

    TODOS.forEach(function (p) {
      var ate = p.saiu_em && p.saiu_em < HOJE ? p.saiu_em : HOJE;
      var de = p.admissao > INI ? p.admissao : INI;
      var faltas = [], ultimoAtestado = null, ultimaMedida = '', teveAdv = false;
      M.intervalo(de, ate).forEach(function (d) {
        var b = M.batidas(p, d), r = M.rng('rhcaixa|' + p.id + '|' + d);
        var passado = d < HOJE;
        if (b.situacao === 'FALTA' && passado) {
          /* parte das faltas o escritorio abona (troca de folga, cobertura); essas nao pesam */
          var rf = M.rng('rhcaixa-falta|' + p.id + '|' + d), velha = difDias(d, HOJE) > 5;
          var abonada = rf() < 0.45;
          add({ tipo: 'FALTA', pid: p.id, data: d, motivo: 'sem nenhuma batida num dia de escala', fonte: 'leitura do ponto (Flash)', nome_lido: flash(p.nome),
            o_que_aconteceu: 'Nenhuma batida no dia. Escala: ' + p.entrada + ' às ' + p.saida + '.',
            _sit: velha ? (abonada ? 'recusado' : 'aprovado') : undefined });
          if (abonada && velha) return;
          var antes = faltas.filter(function (f) { return difDias(f, d) <= 30; }).length;
          var antes60 = faltas.filter(function (f) { return difDias(f, d) <= 60; }).length;
          faltas.push(d);
          var medida = rf();
          if (ultimaMedida && difDias(ultimaMedida, d) < 30) medida = 1; /* no maximo uma medida por mes */
          /* gradacao: suspensao so depois de uma advertencia */
          if (teveAdv && antes60 >= 1 && medida < 0.5 && M.somaDias(d, 2) < HOJE) {
            ultimaMedida = d;
            add({ tipo: 'SUSPENSAO', pid: p.id, data: M.somaDias(d, 2), data_fim: M.somaDias(d, 2), motivo: 'nova falta sem justificativa depois de advertência', fonte: 'Central do RH', nome_lido: p.nome, documento: 'SUSPENSÃO DISCIPLINAR',
              _sit: velha ? 'aprovado' : undefined });
          } else if (!teveAdv && antes >= 1 && medida < 0.5 && M.somaDias(d, 1) < HOJE) {
            ultimaMedida = d; teveAdv = true;
            add({ tipo: 'ADVERTENCIA', pid: p.id, data: M.somaDias(d, 1), motivo: 'segunda falta sem justificativa em 30 dias', fonte: 'Central do RH', nome_lido: p.nome, documento: 'ADVERTÊNCIA DISCIPLINAR',
              _sit: velha ? 'aprovado' : undefined });
          }
          return;
        }
        if (b.situacao === 'ATESTADO') {
          if (ultimoAtestado && M.somaDias(ultimoAtestado.data_fim || ultimoAtestado.data, 1) === d) { ultimoAtestado.data_fim = d; return; }
          ultimoAtestado = add({ tipo: 'ATESTADO', pid: p.id, data: d, motivo: 'atestado médico', fonte: 'atestado enviado pelo portal', nome_lido: p.nome, documento: 'ATESTADO MÉDICO' });
          return;
        }
        if (!passado || !b.batidas || !b.batidas.length) return;
        if (b.situacao === 'INCOMPLETO' && b.batidas.length === 3 && r() < 0.6) {
          add({ tipo: 'BATIDA', pid: p.id, data: d, hora_ini: hms(b.batidas[2]), motivo: 'faltou a batida de saída', fonte: 'leitura do ponto (Flash)', nome_lido: flash(p.nome),
            o_que_aconteceu: 'Bateu ' + b.batidas.join(', ') + ' e não bateu a saída. Escala até ' + p.saida + '.' });
          return;
        }
        if (b.atraso_min >= 20 && r() < 0.4) {
          add({ tipo: 'ORIENTACAO', pid: p.id, data: d, hora_ini: hms(b.batidas[0]), motivo: 'atraso de ' + b.atraso_min + ' min', fonte: FONTE_CARTAO, nome_lido: p.apelido,
            detalhe: escrito('Chegou ' + b.atraso_min + ' min atrasado(a). Conversei e orientei sobre o horário de entrada.', p) });
          return;
        }
        if (b.extra_min >= 40 && b.batidas.length === 4 && r() < 0.3) {
          add({ tipo: 'PARA_O_FLASH', pid: p.id, data: d, hora_ini: hms(p.saida), hora_fim: hms(b.batidas[3]), motivo: 'hora extra autorizada (' + b.extra_min + ' min)', fonte: FONTE_CARTAO, nome_lido: p.apelido,
            detalhe: escrito('Ficou até ' + b.batidas[3] + ' para cobrir o movimento; hora extra autorizada por mim.', p) });
          return;
        }
        var x = r();
        if (x < 0.004) {
          add({ tipo: 'AVISOU_ANTES', pid: p.id, data: d, hora_ini: hms(b.batidas[0]), motivo: 'avisou antes que chegaria mais tarde', fonte: FONTE_CARTAO, nome_lido: p.apelido,
            detalhe: escrito('Avisou no dia anterior que chegaria mais tarde por causa de consulta; combinado comigo.', p) });
        } else if (x < 0.007 && M.lojas.length > 1) {
          var outra = M.lojas.filter(function (l) { return l.id !== p.loja; })[Math.floor(r() * (M.lojas.length - 1))];
          add({ tipo: 'COBERTURA', pid: p.id, data: d, motivo: 'cobriu a loja ' + outra.nome + ' no fechamento', fonte: FONTE_CARTAO, nome_lido: p.apelido,
            detalhe: escrito('Foi cobrir a loja ' + outra.nome + ' no fechamento; as batidas aparecem na outra loja.', p) });
        } else if (x < 0.010) {
          add({ tipo: 'ERRO_CORRIGIDO', pid: p.id, data: d, hora_ini: hms(b.batidas[1]), motivo: 'batida em duplicidade', fonte: FONTE_CARTAO, nome_lido: p.apelido,
            detalhe: escrito('Bateu duas vezes na volta do intervalo; já corrigi no Flash.', p) });
        } else if (x < 0.012) {
          add({ tipo: 'DECLARACAO', pid: p.id, data: d, hora_ini: hms(b.batidas[0]), hora_fim: hms(M.hm(M.minDe(b.batidas[0]) + 120)), motivo: 'declaração de comparecimento (consulta)', fonte: 'atestado enviado pelo portal', nome_lido: p.nome, documento: 'DECLARAÇÃO DE COMPARECIMENTO' });
        }
      });
    });

    /* casos fixos para a tela mostrar todos os recursos */
    var a = comum(1, 3);
    if (a) {
      [[-6, 'atraso de 18 min', 'Chegou 18 min atrasado(a). Conversei e orientei sobre o horário.'],
       [-3, 'uso do celular na praça', 'Estava no celular na praça durante o pico. Orientei sobre a regra do celular.'],
       [-1, 'uniforme incompleto', 'Veio sem o avental e o boné. Orientei sobre o uniforme.']].forEach(function (o) {
        var g = gerenteDe(a.loja);
        add({ tipo: 'ORIENTACAO', pid: a.id, data: M.dia(o[0]), motivo: o[1], fonte: FONTE_CARTAO, nome_lido: a.apelido,
          detalhe: o[2] + ' — escrito por ' + (g ? g.apelido + ' (gerência)' : 'gerência'), _sit: o[0] === -6 ? 'aprovado' : 'novo' });
      });
    }
    var f = comum(0, 5);
    if (f) add({ tipo: 'FERIAS', pid: f.id, data: M.dia(12), data_fim: M.dia(41), motivo: 'férias programadas (30 dias)', fonte: 'Central do RH', nome_lido: f.nome, _sit: 'novo' });
    var fo = comum(2, 1);
    if (fo) add({ tipo: 'FOLGA_ABONADA', pid: fo.id, data: M.dia(3), motivo: 'folga em troca do feriado trabalhado', fonte: FONTE_CARTAO, nome_lido: fo.apelido,
      detalhe: 'Trabalhou no feriado e combinamos a folga para esse dia — escrito por ' + ((gerenteDe(fo.loja) || {}).apelido || 'gerência') + ' (gerência)', _sit: 'novo' });
    var co = comum(0, 8);
    if (co) add({ tipo: 'COMBINADO', pid: co.id, data: M.dia(-2), hora_ini: '17:30:00', motivo: 'sai 30 min mais cedo às quintas (curso)', fonte: FONTE_CARTAO, nome_lido: co.apelido,
      detalhe: 'Combinado fixo: às quintas sai às 17:30 por causa do curso e compensa no sábado — escrito por ' + ((gerenteDe(co.loja) || {}).apelido || 'gerência') + ' (gerência)', _sit: 'novo' });
    if (SAIRAM[0]) {
      var s = SAIRAM[0];
      add({ tipo: 'SAIU', pid: s.id, data: M.dia(-1), motivo: 'desligado em ' + M.br(s.saiu_em) + ' e ainda ativo no Flash', fonte: 'conferência do cadastro', nome_lido: flash(s.nome), _sit: 'novo' });
    }
    (function () {
      var usados = {}; TODOS.forEach(function (p) { usados[p.apelido] = 1; });
      var livre = null;
      M.freelas.forEach(function (x) { if (!livre && !usados[x.apelido]) livre = x; });
      var l = M.lojas[M.lojas.length > 1 ? 1 : 0];
      var sob = (ATIVOS[5] || ATIVOS[0]).nome.split(' ');
      if (livre) add({ tipo: 'ENTROU', pid: null, data: M.dia(-3), motivo: 'apareceu batendo ponto e não está no cadastro', fonte: 'leitura do ponto (Flash)',
        nome_lido: flash(livre.apelido + ' ' + sob[sob.length - 1]), unidade: l.nome, _sit: 'novo',
        o_que_aconteceu: 'Bateu ponto 3 dias seguidos na loja ' + l.nome + ', mas não tem ficha no cadastro.' });
    })();
    var l0 = M.lojas[0];
    add({ tipo: 'SEM_DONO', pid: null, data: M.dia(-1), motivo: 'refeição da equipe lançada na comanda C1999, que não é de ninguém', fonte: 'conferência das comandas', nome_lido: 'Comanda C1999', unidade: l0 ? l0.nome : '', _sit: 'novo' });

    /* situacao de partida, decisoes antigas e casamento de nome */
    itens.forEach(function (o) {
      var p = o.pid ? POR_ID[o.pid] : null, r = M.rng('rhcaixa-sit|' + o.id);
      o.unidade = o.unidade || (p ? p.unidade : '');
      var idade = difDias(o.data, HOJE);
      var sit = o._sit;
      if (!sit) {
        if (idade <= 5) sit = r() < 0.3 ? 'aprovado' : 'novo';
        else sit = r() < 0.92 ? 'aprovado' : 'recusado';
      }
      delete o._sit;
      o.situacao = sit;
      /* o leitor automatico casa o nome com o cadastro; alguns ficam para escolher na mao */
      o.nome_oficial = p ? p.nome : null;
      if (p && sit === 'novo' && o.fonte === 'atestado enviado pelo portal' && r() < 0.4) {
        o.nome_oficial = null;
        o.nome_lido = p.apelido + ' (' + String(p.setor).toLowerCase() + ')';
      }
      if (sit !== 'novo') {
        var dec = M.somaDias(o.data, M.entre(r, 1, 3));
        if (dec > HOJE) dec = HOJE;
        o.decidido_em = isoDe(dec, M.hm(M.entre(r, 9 * 60, 17 * 60)));
        o.decidido_por = r() < 0.7 ? D.usuarios.escritorio.nome : D.usuarios.dono.nome;
        o.observacao = sit === 'recusado' ? M.escolhe(r, o.tipo === 'FALTA' ? OBS_FALTA : OBS_RECUSA) : '';
        if (sit === 'aprovado' && (o.tipo === 'AVISOU_ANTES' || o.tipo === 'ATESTADO') && r() < 0.5) {
          o.resposta = o.tipo === 'ATESTADO' ? 'Atestado conferido e lançado no Flash.' : 'Ok, registrado. Combinado com a gerência.';
          o.respondido_por = o.decidido_por; o.respondido_em = o.decidido_em;
        }
      }
      if (o.documento) {
        o._doc = o.documento;
        delete o.documento;
      }
    });
    itens.sort(function (x, y) { return x.data < y.data ? 1 : x.data > y.data ? -1 : x.id - y.id; });
    return itens;
  }
  function base() { if (!BASE) BASE = gerar(); return BASE; }

  /* ---------------- estado da demonstracao (decisoes desta pessoa) ---------------- */
  function estado() { return ler('estado', { dec: {}, nome: {}, resp: {} }); }
  function ocorrencias() {
    var st = estado();
    return base().map(function (o) {
      var c = {}; for (var k in o) if (k.charAt(0) !== '_') c[k] = o[k];
      if (st.nome[o.id]) { c.nome_oficial = st.nome[o.id].nome_oficial || null; if (st.nome[o.id].unidade) c.unidade = st.nome[o.id].unidade; }
      if (st.dec[o.id]) { var d = st.dec[o.id]; c.situacao = d.situacao; c.decidido_por = d.decidido_por; c.decidido_em = d.decidido_em; c.observacao = d.observacao || ''; }
      if (st.resp[o.id]) { var r = st.resp[o.id]; c.resposta = r.resposta; c.respondido_por = r.respondido_por; c.respondido_em = r.respondido_em; }
      if (o._doc) {
        var p = POR_ID[o.pid];
        c.documento_url = documento(o.id, o._doc, p ? p.nome : o.nome_lido, M.br(o.data) + (o.data_fim && o.data_fim !== o.data ? ' a ' + M.br(o.data_fim) : '') + '/' + o.data.slice(0, 4));
      }
      var pe = o.pid ? POR_ID[o.pid] : null;
      c.pessoa_id = o.pid || null;
      c.vezes_orientado_7d = pe ? orientado7(o.pid) : 0;
      return c;
    });
  }
  var ORI7 = null;
  function orientado7(pid) {
    if (!ORI7) {
      ORI7 = {};
      var st = estado();
      base().forEach(function (o) {
        var sit = st.dec[o.id] ? st.dec[o.id].situacao : o.situacao;
        if (o.tipo === 'ORIENTACAO' && sit !== 'recusado' && difDias(o.data, HOJE) < 7 && o.data <= HOJE) {
          var a = ORI7[o.pid] = ORI7[o.pid] || { vezes: 0, ultima: o.data };
          a.vezes++; if (o.data > a.ultima) a.ultima = o.data;
        }
      });
    }
    return ORI7[pid] ? ORI7[pid].vezes : 0;
  }
  function explicado(r) {
    return r.situacao === 'novo' && TIPOS_CARTAO.indexOf(r.tipo) >= 0 && !!r.nome_oficial && r.fonte === FONTE_CARTAO && /— escrito por /.test(r.detalhe || '');
  }

  /* ---------------- quem pode ---------------- */
  function papelDe(b, ctx) { return D.papelDoToken(b && b.p_senha) || ctx.papel; }
  function exige(b, ctx, modulo) {
    var papel = papelDe(b, ctx);
    if (!D.papelDoToken(b && b.p_senha) && b && b.p_senha !== 'demo') throw D.erro(401, 'Entre pelo portal', '28000');
    var ok = D.papeis ? D.papeis[papel] : null;
    if (ok && ok.indexOf(modulo) < 0) throw D.erro(401, 'Você não tem acesso a este módulo', '28000');
    return D.usuarios[papel] || D.usuarios.dono;
  }

  /* ---------------- a porta ---------------- */
  D.rpc('rh_caixa_porta', function (b, ctx) {
    var u = exige(b, ctx, 'rhcaixa');
    var a = b.p_acao, d = b.p_dados || {};
    ORI7 = null;
    if (a === 'sugerir_nomes') {
      return ATIVOS.map(function (p) { return { nome: p.nome, unidade: p.unidade }; })
        .sort(function (x, y) { return x.nome.localeCompare(y.nome, 'pt-BR'); });
    }
    var lista = ocorrencias();
    if (a === 'contagem') {
      var c = { novo: 0, aprovado: 0, recusado: 0, quem: u.nome };
      lista.forEach(function (o) { c[o.situacao] = (c[o.situacao] || 0) + 1; });
      return c;
    }
    if (a === 'alertas') {
      orientado7(0);
      return Object.keys(ORI7).filter(function (k) { return ORI7[k].vezes >= 3; }).map(function (k) {
        var p = POR_ID[k];
        return { nome: p.nome, unidade: p.unidade, vezes: ORI7[k].vezes, ultima: ORI7[k].ultima };
      });
    }
    if (a === 'listar') {
      var sit = d.situacao || 'novo';
      var l = lista.filter(function (o) { return o.situacao === sit; });
      if (sit === 'novo') l.sort(function (x, y) { return x.data < y.data ? -1 : x.data > y.data ? 1 : x.id - y.id; });
      else l.sort(function (x, y) { return String(y.decidido_em || '').localeCompare(String(x.decidido_em || '')) || (y.data < x.data ? -1 : 1); });
      return l.slice(0, 60);
    }
    var st = estado();
    var item = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === +d.id) item = lista[i];
    if (a === 'nome') {
      if (!item) throw D.erro(400, 'Registro não encontrado', 'P0001');
      st.nome[item.id] = { nome_oficial: d.nome_oficial || null, unidade: d.unidade || '' };
      gravar('estado', st);
      return { ok: true };
    }
    if (a === 'responder') {
      if (!item) return { ok: false, erro: 'registro não encontrado' };
      if (!String(d.texto || '').trim()) return { ok: false, erro: 'escreva alguma coisa antes' };
      st.resp[item.id] = { resposta: String(d.texto).trim(), respondido_por: u.nome, respondido_em: M.agoraISO() };
      gravar('estado', st);
      return { ok: true };
    }
    if (a === 'aprovar' || a === 'recusar') {
      if (!item) return { ok: false, erro: 'registro não encontrado' };
      if (item.situacao !== 'novo') return { ok: false, erro: 'esse registro já foi decidido' };
      if (a === 'aprovar' && !item.nome_oficial) return { ok: false, erro: 'escolha a pessoa antes de aprovar' };
      st.dec[item.id] = { situacao: a === 'aprovar' ? 'aprovado' : 'recusado', decidido_por: u.nome, decidido_em: M.agoraISO(), observacao: d.observacao || '' };
      gravar('estado', st);
      return { ok: true };
    }
    if (a === 'aprovar_explicados') {
      var n = 0;
      lista.filter(explicado).forEach(function (o) {
        st.dec[o.id] = { situacao: 'aprovado', decidido_por: u.nome, decidido_em: M.agoraISO(), observacao: 'aprovado em lote (já explicado no cartão do ponto)' };
        n++;
      });
      gravar('estado', st);
      return { ok: true, aprovados: n };
    }
    throw D.erro(400, 'Ação desconhecida: ' + a, 'P0001');
  });

  /* ---------------- base para as outras telas do escritorio ---------------- */
  D.rhBase = {
    hoje: HOJE, inicio: INI,
    ativos: ATIVOS, sairam: SAIRAM, todos: TODOS,
    porId: function (id) { return POR_ID[id] || null; },
    porNome: function (n) { return POR_NOME[n] || null; },
    empresa: empresa, gerenteDe: gerenteDe, comum: comum, flash: flash, difDias: difDias,
    ocorrencias: function () { ORI7 = null; return ocorrencias(); },
    exige: exige
  };
})();
