/* Acessos (demonstracao): quem entra no portal e quais telas cada pessoa ve.
   Simula as rpcs portal_admin (acoes listar, modulos, sessoes, permissao, criar, editar,
   resetar_senha, desbloquear, apagar) e portal_uso (tempo e telas abertas nos ultimos 7 dias).
   Usa os usuarios de demonstracao (DEMO.usuarios), alguns usuarios ficticios a mais tirados
   da equipe inventada (MUNDO.equipe) e os modulos de DEMO.modulos.
   Nenhuma senha e guardada: a senha nova e sorteada e mostrada uma vez.
   O que se muda na tela fica so neste navegador (localStorage, chave demo_acessos). */
(function () {
  'use strict';
  if (!window.DEMO) return;
  var D = window.DEMO, M = window.MUNDO;

  /* o portal_eu devolve o nome de entrada (texto), como no banco de verdade */
  D.rpc('portal_eu', function (b) {
    var p = D.papelDoToken(b.p_token);
    if (!p) throw D.erro(401, 'Sessão expirada', '28000');
    var s = D.sessao(p);
    s.usuario = p;
    return s;
  });

  var SESSAO_MIN = 14 * 60;       /* quanto tempo vale uma entrada no portal (regra de exemplo) */
  var SENHA_MIN = 6;              /* senha digitada: minimo de letras/numeros */
  var SENHA_GERADA = 8;           /* senha sorteada pelo portal */

  /* ---------------- modulos ---------------- */
  function modulos() {
    return D.modulos.slice().sort(function (a, b) { return a.ordem - b.ordem; }).map(function (m) {
      return { id: m.id, nome: m.nome, icone: m.icone, grupo: m.grupo.charAt(0) === '_' ? 'Dentro de outras telas' : m.grupo, ordem: m.ordem };
    });
  }
  function ids(papel) {
    var ok = D.papeis[papel];
    return D.modulos.filter(function (m) { return !ok || ok.indexOf(m.id) >= 0; }).map(function (m) { return m.id; });
  }
  function menos(lista, tirar) { return lista.filter(function (x) { return tirar.indexOf(x) < 0; }); }

  /* ---------------- pessoas ---------------- */
  function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function login(p) {
    var t = String(p.nome).split(/\s+/);
    return semAcento(t[0] + '.' + t[t.length - 1]);
  }
  function curto(p) { var t = String(p.nome).split(/\s+/); return t[0] + ' ' + t[t.length - 1]; }
  function lojaNome(i) { var l = M.lojas[Math.min(i, M.lojas.length - 1)]; return l ? l.nome : ''; }

  var gerentes = M.equipe.filter(function (p) { return p.cargo === 'Gerente da loja'; });
  var lideres = M.equipe.filter(function (p) { return p.cargo === 'Líder de cozinha'; });
  var atend = M.equipe.filter(function (p) { return p.setor === 'Delivery'; });
  var salao = M.equipe.filter(function (p) { return p.setor === 'Salão'; });

  /* perfil de uso: f = visitas por dia, d = minutos por visita, t = telas abertas por visita, fav = telas preferidas */
  var BASE = [
    { id: 1, nome: D.usuarios.dono.nome, usuario: 'dono', admin: true, unidade: '', modulos: ids('dono'),
      uso: { f: 3, d: [4, 35], t: [2, 6], fav: ['hoje', 'painel', 'placar', 'agora', 'qualidade', 'cobranca', 'acessos', 'ifood'], agora: true } },
    { id: 2, nome: D.usuarios.gerente.nome, usuario: 'gerente', unidade: lojaNome(0), modulos: ids('gerente'),
      uso: { f: 4, d: [3, 25], t: [2, 5], fav: ['agora', 'fila', 'turno', 'cancelados', 'pausados', 'escala', 'rh', 'manutencao'] } },
    { id: 3, nome: D.usuarios.escritorio.nome, usuario: 'escritorio', unidade: '', modulos: ids('escritorio'),
      uso: { f: 2, d: [10, 60], t: [2, 7], fav: ['ponto', 'folha', 'rhcaixa', 'pagamento', 'contas', 'conferencia'], uteis: true } },
    { id: 4, nome: D.usuarios.delivery.nome, usuario: 'delivery', unidade: lojaNome(0), modulos: ids('delivery'),
      uso: { f: 5, d: [5, 40], t: [1, 3], fav: ['agora', 'fila', 'pausados', 'turno', 'chegada'] } }
  ];
  if (gerentes[1]) BASE.push({ id: 11, nome: curto(gerentes[1]), usuario: login(gerentes[1]), unidade: gerentes[1].unidade,
    modulos: menos(ids('gerente'), ['escala-mensal', 'estoque', 'producao']),
    uso: { f: 3, d: [3, 30], t: [2, 5], fav: ['agora', 'turno', 'salao', 'cancelados', 'rh', 'freelas'] } });
  if (gerentes[2]) BASE.push({ id: 12, nome: curto(gerentes[2]), usuario: login(gerentes[2]), unidade: gerentes[2].unidade,
    modulos: ids('gerente'), bloqueado: true,
    uso: { f: 2, d: [3, 20], t: [2, 4], fav: ['agora', 'fila', 'manutencao', 'escala'], parou: 2 } });
  if (lideres[0]) BASE.push({ id: 13, nome: curto(lideres[0]), usuario: login(lideres[0]), unidade: lideres[0].unidade,
    modulos: ['cozinha', 'tv', 'producao', 'estoque', 'operacao', 'encomendas'],
    uso: { f: 1.5, d: [3, 15], t: [1, 3], fav: ['cozinha', 'producao', 'estoque', 'tv'] } });
  if (atend[3]) BASE.push({ id: 14, nome: curto(atend[3]), usuario: login(atend[3]), unidade: atend[3].unidade,
    modulos: ids('delivery'), precisa_trocar: true, uso: null });
  BASE.push({ id: 15, nome: 'Contabilidade (externa)', usuario: 'contabilidade', unidade: '',
    modulos: ['folha', 'ponto', 'contas', 'receber'],
    uso: { f: 0, d: [35, 55], t: [4, 8], fav: ['folha', 'ponto', 'contas'], unica: 5 } });
  BASE.push({ id: 16, nome: 'TV da Cozinha · ' + lojaNome(0), usuario: 'tv.' + semAcento(M.lojas[0] ? M.lojas[0].id : 'loja'), unidade: lojaNome(0),
    modulos: ['tv'], uso: { f: 1, d: [1, 4], t: [1, 2], fav: ['tv'], tv: true } });
  if (salao[0]) BASE.push({ id: 17, nome: curto(salao[0]), usuario: login(salao[0]), unidade: salao[0].unidade,
    modulos: ['agora', 'fila', 'salao'], ativo: false, uso: { f: 0, d: [5, 10], t: [1, 2], fav: ['salao'], longe: 40 } });

  /* ---------------- o que mudou nesta demonstracao (so neste navegador) ---------------- */
  var CHAVE = 'demo_acessos';
  function ler() {
    try { var o = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (o && o.mud) return o; } catch (e) {}
    return { mud: {}, novos: [], fora: [], seq: 100 };
  }
  var EST = ler();
  function grava() { try { localStorage.setItem(CHAVE, JSON.stringify(EST)); } catch (e) {} }

  function copia(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
  function todos() {
    var fora = EST.fora.map(function (f) { return f.id; });
    return BASE.concat(EST.novos).filter(function (u) { return fora.indexOf(u.id) < 0; }).map(function (u) {
      var x = copia(u), m = EST.mud[u.id] || {};
      for (var k in m) x[k] = m[k];
      x.modulos = (x.modulos || []).slice();
      x.ativo = x.ativo !== false;
      x.bloqueado = !!x.bloqueado;
      x.precisa_trocar = !!x.precisa_trocar;
      x.admin = !!x.admin;
      return x;
    });
  }
  function acha(id) {
    var l = todos();
    for (var i = 0; i < l.length; i++) if (l[i].id === +id) return l[i];
    throw D.erro(404, 'Essa pessoa não existe mais no portal.', 'P0002');
  }
  function muda(id, campos) {
    var m = EST.mud[id] || (EST.mud[id] = {});
    for (var k in campos) m[k] = campos[k];
    grava();
  }
  function senhaNova() {
    var c = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
    for (var i = 0; i < SENHA_GERADA; i++) s += c.charAt(Math.floor(Math.random() * c.length));
    return s;
  }

  /* ---------------- uso do portal (inventado, repetivel no mesmo dia) ---------------- */
  var CACHE = {};
  function uso(u) {
    var k = u.id + '|' + M.hoje();
    if (CACHE[k]) return CACHE[k];
    var p = u.uso, agora = M.minutosAgora();
    var r = M.rng('acessos-uso|' + k);
    var visitas = [];   /* {ini, dur, telas[]} — ini em minutos a partir de hoje 00:00 (negativo = dias antes) */
    var mods = u.modulos;
    var fav = ((p && p.fav) || []).filter(function (x) { return mods.indexOf(x) >= 0; });
    if (!fav.length) fav = mods.slice(0, 4);
    function telas(n) {
      var l = ['inicio'];
      for (var i = 1; i < n; i++) {
        var x = r() < 0.8 && fav.length ? fav[Math.min(fav.length - 1, Math.floor(Math.pow(r(), 1.6) * fav.length))] : mods[Math.floor(r() * mods.length)];
        if (x) l.push(x);
      }
      return l;
    }
    function visita(dia, ini) {
      var dur = M.entre(r, p.d[0], p.d[1]);
      if (dia === 0 && ini + dur > agora) dur = Math.max(1, agora - ini);
      visitas.push({ ini: ini - dia * 1440, dur: dur, telas: telas(M.entre(r, p.t[0], p.t[1])) });
    }
    if (p) {
      for (var dia = 6; dia >= 0; dia--) {
        var iso = M.dia(-dia), dow = M.diaSemana(iso);
        if (p.parou && dia < p.parou) continue;
        if (p.uteis && (dow === 0 || dow === 6)) continue;
        var n = p.unica ? (dia === p.unica ? 1 : 0) : Math.max(0, Math.round(p.f + (r() - 0.5) * 2));
        if (p.tv) n = 1;
        var fim = dia === 0 ? agora - 3 : 23 * 60 + 30;
        for (var j = 0; j < n; j++) {
          var ini = p.tv ? 10 * 60 + M.entre(r, 15, 40) : M.entre(r, 10 * 60, 23 * 60);
          if (ini <= fim) visita(dia, ini);
        }
      }
      if (p.agora) visitas.push({ ini: agora - 25, dur: 24, telas: ['inicio', 'hoje', 'painel', 'acessos'] });
    }
    visitas.sort(function (a, b) { return a.ini - b.ini; });

    var o = { visitas7: visitas.length, hoje: 0, minutos7: 0, maior_visita7: 0, toques7: 0, cont: {}, ultimo: null, desde: null };
    visitas.forEach(function (v) {
      if (v.ini >= 0) o.hoje++;
      o.minutos7 += v.dur;
      if (v.dur > o.maior_visita7) o.maior_visita7 = v.dur;
      o.toques7 += v.telas.length;
      v.telas.forEach(function (t) { o.cont[t] = (o.cont[t] || 0) + 1; });
    });
    if (visitas.length) {
      var ult = visitas[visitas.length - 1];
      o.ultimo = ult.ini + ult.dur;
      /* a entrada (login) vale do primeiro uso do dia da ultima visita */
      var diaUlt = Math.floor(ult.ini / 1440);
      for (var i = 0; i < visitas.length; i++) if (Math.floor(visitas[i].ini / 1440) === diaUlt) { o.desde = visitas[i].ini; break; }
    } else if (p && p.longe) {
      o.ultimo = -p.longe * 1440 + 19 * 60 + 12;
    }
    CACHE[k] = o;
    return o;
  }
  function quando(min) { return min == null ? null : M.ts(M.hoje(), min); }

  function linhaUsuario(u) {
    var x = uso(u);
    return {
      id: u.id, nome: u.nome, usuario: u.usuario, unidade: u.unidade || '', admin: u.admin,
      ativo: u.ativo, bloqueado: u.bloqueado, precisa_trocar: u.precisa_trocar,
      modulos: u.modulos.slice(), ultimo_acesso: quando(x.ultimo)
    };
  }

  function sessoes() {
    var agora = M.minutosAgora();
    var l = [];
    todos().forEach(function (u) {
      if (!u.ativo || u.bloqueado) return;
      var x = uso(u);
      if (x.desde == null || x.ultimo == null) return;
      if (x.desde + SESSAO_MIN <= agora || x.ultimo < agora - SESSAO_MIN) return;
      /* senha nova ou desligamento derrubam a entrada que estava aberta */
      if (u.caiu && Date.parse(quando(x.desde)) <= u.caiu) return;
      l.push({ usuario_id: u.id, nome: u.nome, desde: quando(x.desde), expira: quando(x.desde + SESSAO_MIN) });
    });
    return l.sort(function (a, b) { return a.desde < b.desde ? 1 : -1; });
  }

  function so_dono(ctx) {
    if (!ctx.admin) throw D.erro(403, 'Só o dono do portal mexe nos acessos.', '42501');
  }

  /* ---------------- portal_admin ---------------- */
  D.rpc('portal_admin', function (b, ctx) {
    so_dono(ctx);
    var a = String(b.p_acao || ''), d = b.p_dados || {}, u;
    switch (a) {
      case 'listar':
        return todos().sort(function (x, y) {
          if (x.admin !== y.admin) return x.admin ? -1 : 1;
          if (x.ativo !== y.ativo) return x.ativo ? -1 : 1;
          return x.id - y.id;
        }).map(linhaUsuario);

      case 'modulos':
        return modulos();

      case 'sessoes':
        return sessoes();

      case 'permissao':
        u = acha(d.usuario_id);
        if (!D.modulos.some(function (m) { return m.id === d.modulo_id; })) throw D.erro(400, 'Tela desconhecida.', 'P0001');
        var ms = menos(u.modulos, [d.modulo_id]);
        if (d.marcado) ms.push(d.modulo_id);
        muda(u.id, { modulos: ms });
        return { ok: true, modulos: ms.length };

      case 'editar':
        u = acha(d.usuario_id);
        if (d.ativo === false && u.admin) throw D.erro(400, 'A conta de dono do portal não pode ser desligada.', 'P0001');
        var c = {};
        if (typeof d.ativo === 'boolean') c.ativo = d.ativo;
        if (d.ativo === false) c.caiu = Date.now();
        if (d.nome) c.nome = String(d.nome).trim();
        if (d.unidade != null) c.unidade = String(d.unidade).trim();
        muda(u.id, c);
        return { ok: true };

      case 'desbloquear':
        u = acha(d.usuario_id);
        muda(u.id, { bloqueado: false });
        return { ok: true };

      case 'resetar_senha':
        u = acha(d.usuario_id);
        /* na demonstracao a propria entrada de quem esta testando nao cai */
        var rs = { bloqueado: false, precisa_trocar: true };
        if (u.usuario !== ctx.papel) rs.caiu = Date.now();
        muda(u.id, rs);
        return { ok: true, senha_provisoria: senhaNova() };

      case 'criar':
        var nome = String(d.nome || '').trim(), login = String(d.usuario || '').trim().toLowerCase();
        if (nome.length < 2) throw D.erro(400, 'Escreva o nome da pessoa.', 'P0001');
        if (!/^[a-z0-9][a-z0-9.\-]{2,29}$/.test(login)) throw D.erro(400, 'Nome de entrada inválido: use de 3 a 30 letras minúsculas, números, ponto ou hífen, sem espaço e sem acento.', 'P0001');
        if (D.usuarios[login] || todos().some(function (x) { return String(x.usuario).toLowerCase() === login; }))
          throw D.erro(409, 'Já existe alguém com o nome de entrada "' + login + '". Escolha outro.', '23505');
        var senha = d.senha ? String(d.senha) : '';
        if (senha && senha.length < SENHA_MIN) throw D.erro(400, 'A senha precisa ter pelo menos ' + SENHA_MIN + ' letras ou números (ou deixe vazio para o portal inventar uma).', 'P0001');
        var mods = (Array.isArray(d.modulos) ? d.modulos : []).filter(function (id) { return D.modulos.some(function (m) { return m.id === id; }); });
        var id = ++EST.seq;
        EST.novos.push({ id: id, nome: nome, usuario: login, unidade: String(d.unidade || ''), modulos: mods, precisa_trocar: true, uso: null });
        grava();
        return { ok: true, id: id, senha_provisoria: senha || senhaNova() };

      case 'apagar':
        u = acha(d.usuario_id);
        if (u.admin) throw D.erro(400, 'A conta de dono do portal não pode ser apagada.', 'P0001');
        EST.fora.push({ id: u.id, nome: u.nome });
        delete EST.mud[u.id];
        EST.novos = EST.novos.filter(function (x) { return x.id !== u.id; });
        grava();
        return { ok: true };
    }
    throw D.erro(400, 'Ação desconhecida: ' + a, 'P0001');
  });

  /* ---------------- portal_uso: ultimos 7 dias ---------------- */
  D.rpc('portal_uso', function (b, ctx) {
    so_dono(ctx);
    var vivos = todos();
    /* quem foi apagado continua no registro de uso (sem botao de senha) */
    var apagados = BASE.filter(function (u) { return EST.fora.some(function (f) { return f.id === u.id; }); })
      .map(function (u) { var x = copia(u); x.ativo = false; x.modulos = u.modulos.slice(); return x; });
    var pessoas = vivos.concat(apagados).map(function (u) {
      var x = uso(u);
      var telas = Object.keys(x.cont).map(function (t) { return { tela: t, vezes: x.cont[t] }; })
        .sort(function (a, c) { return c.vezes - a.vezes || (a.tela < c.tela ? -1 : 1); });
      return {
        id: u.id, nome: u.nome, ativo: u.ativo !== false,
        hoje: x.hoje, visitas7: x.visitas7, minutos7: x.minutos7, maior_visita7: x.maior_visita7,
        ultimo_acesso: quando(x.ultimo), toques7: x.toques7, telas7: telas, sem_nome7: 0
      };
    });
    return { dias: 7, pessoas: pessoas };
  });
})();
