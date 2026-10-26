/* Painel do Dono (demonstracao).
   Simula a porta painel_dono {p_token, p_acao:'listar'} ->
     { agora, conectados:[{nome, usuario, tela, ha_min, aberturas_hoje}],
       pessoas:[{nome, usuario, hoje, total7, ultima, ultima_tela, dias_sem_entrar}],
       resolveram:[{quem, quantos, ultima}],
       parados:[{dias, texto, tipo, setor, desde}] }
   Quem usa o portal, quando entrou e quantas telas abriu saem das portas da tela Acessos
   (portal_admin e portal_uso, telas/acessos.js), para as duas telas mostrarem as mesmas pessoas
   e os mesmos horarios. Sem essas portas, usa gente de MUNDO.equipe com uso sorteado por dia.
   So o dono le esta porta (ctx.admin). */
(function () {
  if (!window.DEMO) return;
  var M = window.MUNDO, C = window.PORTAL_CFG;

  /* ---------------- quem usa o portal ---------------- */
  var PAPEIS_TELAS = {
    gerente: ['agora', 'salao', 'rh', 'escala', 'cozinha', 'manutencao', 'cancelcaixa', 'escala-mensal', 'estoque'],
    cozinha: ['cozinha', 'producao', 'estoque', 'tv', 'operacao'],
    caixa: ['cancelcaixa', 'caixadia', 'salao'],
    delivery: ['agora', 'fila', 'turno', 'pausados', 'cancelados', 'avaliacoes']
  };
  function primeiro(lojaId, filtro) {
    for (var i = 0; i < M.equipe.length; i++) { var p = M.equipe[i]; if (p.loja === lojaId && filtro(p)) return p; }
    return null;
  }
  function usuarios() {
    var lista = [];
    M.lojas.forEach(function (L, i) {
      var g = primeiro(L.id, function (p) { return p.cargo === 'Gerente da loja'; });
      var c = primeiro(L.id, function (p) { return p.cargo === 'Líder de cozinha'; }) || primeiro(L.id, function (p) { return p.setor === 'Cozinha'; });
      var d = primeiro(L.id, function (p) { return p.setor === 'Delivery'; });
      var x = i === 0 ? primeiro(L.id, function (p) { return p.setor === 'Caixa'; }) : null;
      [[g, 'gerente'], [c, 'cozinha'], [d, 'delivery'], [x, 'caixa']].forEach(function (par) {
        if (par[0]) lista.push({ p: par[0], papel: par[1] });
      });
    });
    return lista;
  }

  /* ---------------- relogio ---------------- */
  function quando(dia, min) {
    var hm = M.hm(min);
    if (dia === M.hoje()) return 'hoje às ' + hm;
    if (dia === M.dia(-1)) return 'ontem às ' + hm;
    return M.br(dia) + ' às ' + hm;
  }

  /* ---------------- uso de cada pessoa (repetivel no dia) ---------------- */
  function uso(u, idx, total) {
    var hoje = M.hoje(), agora = M.minutosAgora();
    var r = M.rng('painel-uso|' + hoje + '|' + u.p.id);
    var abertoDesde = 8 * 60;                 /* ninguem entra antes das 8h no exemplo */
    var o = { nome: u.p.nome, usuario: u.p.apelido.toLowerCase(), hoje: 0, total7: 0, ultima: null, ultima_tela: null, dias_sem_entrar: null };
    var telas = PAPEIS_TELAS[u.papel];

    /* casos de exemplo: o ultimo da lista nunca entrou; o penultimo esta sumido ha alguns dias */
    if (idx === total - 1) return o;
    if (idx === total - 2) {
      var dias = 3 + (M.hash(hoje) % 4);
      o.total7 = dias >= 7 ? 0 : M.entre(r, 1, 4);
      o.dias_sem_entrar = dias;
      o.ultima_tela = M.escolhe(r, telas);
      o._dia = M.dia(-dias); o._min = M.entre(r, 10 * 60, 21 * 60);
      o.ultima = quando(o._dia, o._min);
      return o;
    }

    var ativo = u.papel === 'gerente' ? 0.95 : 0.7;
    var entrouHoje = agora > abertoDesde + 20 && r() < ativo;
    var semana = M.entre(r, u.papel === 'gerente' ? 18 : 6, u.papel === 'gerente' ? 45 : 22);
    if (entrouHoje) {
      var janela = agora - abertoDesde;
      var conectado = r() < (u.papel === 'gerente' ? 0.5 : 0.25);
      var ha = conectado ? M.entre(r, 0, 14) : M.entre(r, 16, Math.max(17, Math.min(janela - 5, 360)));
      o.hoje = Math.max(1, Math.round(M.entre(r, 2, 10) * Math.min(1, janela / 480)));
      o._min = agora - ha; o._dia = hoje; o.ha_min = ha;
      o.dias_sem_entrar = 0;
    } else {
      o._dia = M.dia(-1); o._min = M.entre(r, 11 * 60, 23 * 60);
      o.dias_sem_entrar = 1;
    }
    o.total7 = semana + o.hoje;
    o.ultima_tela = M.escolhe(r, telas);
    o.ultima = quando(o._dia, o._min);
    o._resolvidos = u.papel === 'gerente' ? M.entre(r, 6, 24) : M.entre(r, 0, 9);
    return o;
  }

  /* ---------------- o que esta parado (exemplos) ---------------- */
  function parados() {
    var L = M.lojas, n = L.length, prato = (M.cardapio[1] || { nome: 'um lanche' }).nome;
    function loja(i) { return L[i % n].nome; }
    var base = [
      [23, 'Trocar a borracha da porta da câmara fria', 'Manutenção', loja(0) + ' · Cozinha'],
      [16, 'Orçamento para pintar a fachada', 'Manutenção', loja(1) + ' · Loja'],
      [11, 'Comprar 2 cubas GN para a linha quente', 'Compra', loja(2) + ' · Cozinha'],
      [9, 'Lâmpada queimada no banheiro dos clientes', 'Manutenção', loja(1) + ' · Salão'],
      [8, 'Atualizar a ficha técnica do ' + prato, 'Pendência', loja(0) + ' · Cozinha'],
      [6, 'Exame admissional de um funcionário novo', 'RH', loja(2) + ' · RH'],
      [4, 'Encomenda de 40 lanches para evento: confirmar o sinal', 'Encomenda', loja(0) + ' · Delivery'],
      [3, 'Conserto da impressora de pedidos', 'Manutenção', loja(2) + ' · Delivery'],
      [2, 'Repor uniformes (3 camisetas G)', 'Compra', loja(1) + ' · Salão'],
      [1, 'Revisar a escala do fim de semana', 'Pendência', loja(0) + ' · Gerência']
    ];
    return base.map(function (x) {
      return { dias: x[0], texto: x[1], tipo: x[2], setor: x[3], desde: M.br(M.dia(-x[0])) };
    });
  }

  /* ---------------- uso vindo da tela Acessos (mesmas pessoas, mesmos horarios) ---------------- */
  function chamar(nome, ctx, corpo) {
    corpo.p_token = ctx.token;
    return fetch(C.rest + 'rpc/' + nome, {
      method: 'POST', headers: { apikey: C.chave, Authorization: 'Bearer ' + C.chave, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (r) { if (!r.ok) throw new Error(nome + ' ' + r.status); return r.json(); });
  }
  function difDias(a, b) { return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5); }
  /* sorteio repetivel com peso: telas mais abertas na semana tem mais chance de ser a ultima */
  function telaProvavel(r, telas) {
    var tot = 0; telas.forEach(function (t) { tot += t.vezes; });
    var x = r() * tot;
    for (var i = 0; i < telas.length; i++) { x -= telas[i].vezes; if (x <= 0) return telas[i].tela; }
    return telas.length ? telas[telas.length - 1].tela : null;
  }
  function pelosAcessos(ctx) {
    return Promise.all([
      chamar('portal_admin', ctx, { p_acao: 'listar', p_dados: {} }),
      chamar('portal_uso', ctx, {})
    ]).then(function (rs) {
      var hoje = M.hoje(), agora = M.minutosAgora(), uso7 = {};
      ((rs[1] && rs[1].pessoas) || []).forEach(function (p) { uso7[p.id] = p; });
      return (rs[0] || []).filter(function (u) { return u.ativo; }).map(function (u) {
        var x = uso7[u.id] || {};
        var r = M.rng('painel-uso|' + hoje + '|' + u.id);
        var o = { nome: u.nome, usuario: u.usuario, hoje: 0, total7: x.toques7 || 0, ultima: null, ultima_tela: null, dias_sem_entrar: null };
        var ult = x.ultimo_acesso || u.ultimo_acesso;
        if (!ult) return o;
        o._dia = ult.slice(0, 10); o._min = (+ult.slice(11, 13)) * 60 + (+ult.slice(14, 16));
        o.dias_sem_entrar = Math.max(0, difDias(hoje, o._dia));
        o.ultima = quando(o._dia, o._min);
        /* aberturas de tela hoje = visitas de hoje x telas por visita na semana */
        var porVisita = x.visitas7 ? (x.toques7 || 0) / x.visitas7 : 1;
        o.hoje = x.hoje ? Math.max(x.hoje, Math.round(x.hoje * porVisita)) : 0;
        if (o._dia === hoje) o.ha_min = Math.max(0, agora - o._min);
        var telas = (x.telas7 || []).filter(function (t) { return t.tela !== 'inicio'; });
        /* quem esta olhando agora esta nesta tela */
        o.ultima_tela = u.usuario === ctx.papel && o.ha_min != null && o.ha_min <= 15 ? 'painel' : (telaProvavel(r, telas) || (u.modulos || [])[0] || null);
        /* itens resolvidos na semana: so quem mexe em mais de uma tela */
        o._resolvidos = (u.modulos || []).length > 1 && o.total7 > 0 ? M.entre(r, 0, Math.max(1, Math.round(o.total7 / 4))) : 0;
        return o;
      });
    });
  }

  function montar(pes) {
    var conectados = pes.filter(function (p) { return p.ha_min != null && p.ha_min <= 15; })
      .sort(function (a, b) { return a.ha_min - b.ha_min; })
      .map(function (p) { return { nome: p.nome, usuario: p.usuario, tela: p.ultima_tela, ha_min: p.ha_min, aberturas_hoje: p.hoje }; });

    /* quem resolveu: so quem entrou na semana; a ultima vez e um pouco antes do ultimo acesso */
    var resolveram = pes.filter(function (p) { return p._resolvidos > 0 && p.total7 > 0; })
      .map(function (p) { return { quem: p.nome, quantos: p._resolvidos, ultima: quando(p._dia, Math.max(0, p._min - (p._resolvidos % 7) * 6)) }; })
      .sort(function (a, b) { return b.quantos - a.quantos; });

    /* lista: quem entrou ha menos tempo primeiro; quem nunca entrou por ultimo */
    function chave(p) { return p.ultima == null ? 1e9 : (p.dias_sem_entrar || 0) * 1440 + (1440 - p._min); }
    var pessoas = pes.slice().sort(function (a, b) { return chave(a) - chave(b); }).map(function (p) {
      return { nome: p.nome, usuario: p.usuario, hoje: p.hoje, total7: p.total7, ultima: p.ultima, ultima_tela: p.ultima_tela, dias_sem_entrar: p.dias_sem_entrar };
    });

    return {
      agora: 'às ' + M.hm(M.minutosAgora()),
      conectados: conectados,
      pessoas: pessoas,
      resolveram: resolveram,
      parados: parados()
    };
  }

  DEMO.rpc('painel_dono', function (corpo, ctx) {
    if (!ctx.admin) throw DEMO.erro(403, 'Só o dono vê esta tela', '42501');
    function sorteado() {
      var us = usuarios();
      return montar(us.map(function (u, i) { return uso(u, i, us.length); }));
    }
    if (DEMO.tem('rpc', 'portal_admin') && DEMO.tem('rpc', 'portal_uso')) {
      return pelosAcessos(ctx).then(montar).catch(sorteado);
    }
    return sorteado();
  });
})();
