/* Teste de tela da Reunião Semanal (reuniao/index.html) com o banco SIMULADO: nenhuma chamada real sai daqui.
   Rodar: node tests/reuniao-tela.cjs            (sobe um servidor local sozinho; precisa do playwright instalado)
   Confere: os 9 blocos da reunião dos gerentes, R$ só para o dono, fonte parada escrita como "parado desde" e nunca zero,
   combinados (gravar / marcar feito), folha da equipe sem dinheiro e sem nome de quem errou, celular sem transbordar.
   Pedido do Fábio em 13/11/2026 (duas reuniões: gerentes, e gerente com a equipe). Não remover para contornar falha. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
let BASE = process.argv[2] || '';
const SHOT = process.argv[3] || '';
function sobeServidor() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(RAIZ, p);
      if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('nao achei'); }
      r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const seg = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(12, 0, 0, 0); return x; };
const mais = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const M = seg(new Date());            // semana corrente (a da reunião)
const S = mais(M, -7), P = mais(M, -14);   // semana dos dados e a anterior
const dS = n => iso(mais(S, n)), dP = n => iso(mais(P, n));

function fixtures(o) {
  const lojas = [{ id_loja: 1, unidade: 'Água Verde', nome: 'Burger AV' }, { id_loja: 2, unidade: 'Ahú', nome: 'Burger Ahú' }, { id_loja: 3, unidade: 'São Braz', nome: 'Burger SB' }];
  const av = [
    { id_loja: 1, nota: 2, tags: [], comentario: 'Chegou frio e ainda paguei R$ 50,00 <img src=x onerror=window.__xss=1>', data_avaliacao: dS(1) },
    { id_loja: 1, nota: 1, tags: [], comentario: 'Faltou a batata do pedido', data_avaliacao: dS(2) },
    { id_loja: 2, nota: 3, tags: [], comentario: 'Demorou muito, esperei 1 hora', data_avaliacao: dS(3) },
    { id_loja: 1, nota: 5, tags: ['Comida saborosa'], comentario: 'Melhor hambúrguer da cidade, parabéns a todos!', data_avaliacao: dS(3) },
    { id_loja: 1, nota: 5, tags: ['Comida saborosa', 'Boa embalagem'], comentario: '', data_avaliacao: dS(4) },
    { id_loja: 1, nota: 2, tags: [], comentario: 'Veio frio', data_avaliacao: dP(1) },
  ];
  const es = [
    { unidade: 'Água Verde', data: dS(0), categoria: 'HORA_EXTRA', nivel: 'ACAO' }, { unidade: 'Água Verde', data: dS(1), categoria: 'OK', nivel: 'OK' },
    { unidade: 'Ahú', data: dS(1), categoria: 'ATRASO', nivel: 'CONFERIR' }, { unidade: 'Água Verde', data: dP(1), categoria: 'HORA_EXTRA', nivel: 'ACAO' }, { unidade: 'Água Verde', data: dP(2), categoria: 'HORA_EXTRA', nivel: 'ACAO' },
  ];
  const semana = {
    ini: iso(S), fim: dS(6), ant_ini: iso(P), ant_fim: dP(6), dono: !!o.dono, lido_em: '13/11 04:00',
    lojas: [
      { unidade: 'Água Verde', vendas: 2669, vendas_ant: 2615, vendas_dias: 7, fat_var_pct: 3, pedidos: 2105, pedidos_ant: 1942, cancelados: 28, cancelados_ant: 28, preparo_min: 16.4, preparo_min_ant: 14.9, cobranca: 13, cobranca_ant: 19, manut_abertos: 159, manut_novos: 32, manut_resolvidos: 11, desperdicio_lanc: null, desperdicio_lanc_ant: null },
      { unidade: 'Ahú', vendas: 388, vendas_ant: 304, vendas_dias: 6, fat_var_pct: 35, pedidos: 368, pedidos_ant: 281, cancelados: 6, cancelados_ant: 2, preparo_min: 12.7, preparo_min_ant: 13.4, cobranca: 2, cobranca_ant: 3, manut_abertos: 16, manut_novos: 1, manut_resolvidos: 0, desperdicio_lanc: null, desperdicio_lanc_ant: null },
      { unidade: 'São Braz', vendas: 601, vendas_ant: 488, vendas_dias: 6, fat_var_pct: 28, pedidos: 339, pedidos_ant: 272, cancelados: 2, cancelados_ant: 0, preparo_min: 15.2, preparo_min_ant: 14.6, cobranca: 7, cobranca_ant: 3, manut_abertos: 9, manut_novos: 0, manut_resolvidos: 0, desperdicio_lanc: null, desperdicio_lanc_ant: null },
    ],
    fontes: { avaliacao: dS(6), cancel_motivo: '2026-10-19', chamados: '2026-08-30', pedidos_oficial: '2026-08-03', selo: '2026-08-10', google: iso(new Date()), ponto: dS(6), vendas: iso(new Date()), ifood_api: dS(6), preparo: dS(6), cobranca: dS(6), manutencao: dS(6), desperdicio: '2026-08-28', atraso: '2026-09-18' },
  };
  if (o.dono) { semana.lojas[0].fat = 167527; semana.lojas[0].fat_ant = 162377; semana.lojas[1].fat = 24992; semana.lojas[1].fat_ant = 18531; semana.lojas[2].fat = 51031; semana.lojas[2].fat_ant = 40018; }
  const comb = [
    { id: 901, semana: iso(S), categoria: 'iFood', titulo: 'Conferir a sacola com a comanda antes de lacrar', detalhe: 'Água Verde' },
    { id: 902, semana: iso(S), categoria: 'RH', titulo: 'Ninguém sai depois do horário sem avisar', detalhe: 'Todas' },
    { id: 903, semana: iso(M), categoria: 'Delivery', titulo: 'Chapa ligada 15 min antes de abrir', detalhe: 'Ahú' },
  ];
  const dec = [
    { id: 801, pauta_id: 901, responsavel: 'Gerente AV', prazo: '2026-01-10', concluido: false },
    { id: 802, pauta_id: 902, responsavel: 'Gerentes', prazo: null, concluido: true },
    { id: 803, pauta_id: 903, responsavel: 'Gerente Ahú', prazo: '2099-01-01', concluido: false },
  ];
  const pauta = [{ id: 700, semana: iso(M), ordem: 10, origem: 'auto', categoria: 'Delivery', titulo: 'Fulano Detal (Ahú): 7 atrasos acima de 30 min', detalhe: null, fonte: 'foody_vw_prazo_real_dia', gravidade: 'critico', status: 'aberto' }];
  return { lojas, av, es, semana, comb, dec, pauta };
}

async function abre(browser, o) {
  const F = fixtures(o), posts = [], erros = [];
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1280, height: 900 }, deviceScaleFactor: o.dsf || 1 });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('cdm_token', 'tok-teste'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  await page.route('**/*supabase.co/**', async route => {
    const u = route.request().url(), m = route.request().method();
    const J = (b, s) => route.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('/rpc/portal_eu')) return J({ usuario: 'teste', nome: 'Teste', admin: !!o.dono, modulos: o.semModulo ? [] : [{ id: 'reuniao' }] });
    if (u.includes('/rpc/reuniao_semana')) return o.portaCai ? J({ code: '42501', message: 'sem acesso à Reunião Semanal' }, 403) : J(F.semana);
    if (u.includes('/rpc/reuniao_combinado')) { posts.push(JSON.parse(route.request().postData() || '{}')); return J({ ok: true }); }
    if (u.includes('/rpc/')) return J({});
    if (m !== 'GET') return J({});
    if (u.includes('/ifood_dim_loja')) return J(F.lojas);
    if (u.includes('/ifood_fato_avaliacao')) return J(F.av);
    if (u.includes('/fato_espelho_dia')) return J(F.es);
    if (u.includes('/google_fato_avaliacao')) return J([{ unidade: 'Água Verde', nota: 4.6, num_avaliacoes: 5210, data_coleta: iso(new Date()) }]);
    if (u.includes('/ifood_fato_super_status')) return J([{ id_loja: 1, nome: 'Burger AV', e_super: true, status: 'SUPER', nivel: 3, tipo: 'nivel_atual', media_avaliacoes: 4.8, pct_cancelamento: 0.01, pct_chamados: 0.02, referencia: '2026-08-10' }]);
    if (u.includes('/reuniao_pauta')) return J(u.includes('fonte=eq.combinado') ? F.comb : F.pauta);
    if (u.includes('/reuniao_decisao')) return J(u.includes('700') ? [] : F.dec);
    return J([]);
  });
  await page.route('**/assets/portal.js*', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto(BASE + '/reuniao/index.html');
  await page.waitForFunction(() => /Combinados da semana passada|O que combinamos|Entre no portal/.test(document.body.innerText) || location.pathname === '/index.html', null, { timeout: 15000 });
  return { page, ctx, posts, erros };
}

let falhas = 0;
const ok = (c, nome, extra) => { if (!c) falhas++; console.log((c ? '  ok   ' : '  FALHA') + ' ' + nome + (c || !extra ? '' : '  -> ' + extra)); };

(async () => {
  let srv = null;
  if (!BASE) { srv = await sobeServidor(); BASE = 'http://127.0.0.1:' + srv.address().port; }
  const browser = await chromium.launch();

  console.log('1) Reunião dos gerentes, login do DONO');
  let t = await abre(browser, { dono: true });
  let tx = (await t.page.innerText('#app')).toLowerCase();
  for (const b of ['1 · ', '2 · ', '3 · ', '4 · ', '5 · ', '6 · ', '7 · ', '8 · ', '9 · ']) ok(tx.includes(b), 'bloco ' + b.trim() + ' aparece');
  ok(/r\$ 243\.550/.test(tx), 'dono vê o faturamento somado (R$ 243.550)', tx.match(/r\$ [\d.]+/g));
  ok(tx.includes('parado desde 28/08'), 'desperdício escrito como "parado desde 28/08"');
  ok(tx.includes('parado desde 30/08'), 'chamados do iFood escritos como "parado desde 30/08"');
  ok(tx.includes('parado desde 18/09'), 'atraso de entrega escrito como "parado desde 18/09"');
  ok(/chamados no ifood\s*\n\s*—/.test(tx), 'cartão de chamados mostra traço, não zero', (tx.match(/chamados no ifood[\s\S]{0,40}/) || [''])[0]);
  ok(tx.includes('conferir a sacola com a comanda antes de lacrar') && tx.includes('vencido'), 'combinado da semana passada aparece e o prazo vencido é marcado');
  ok(/clientes insatisfeitos nesta semana: 1 → 2/.test(tx), 'combinado mostra o número do tema (insatisfeitos 1 → 2)', (tx.match(/clientes insatisfeitos nesta semana[^\n]*/) || [''])[0]);
  ok(tx.includes('chapa ligada 15 min antes de abrir'), 'combinado desta reunião aparece no bloco 9');
  ok(await t.page.evaluate(() => !window.__xss) && !(await t.page.$('#app img')), 'comentário do cliente não vira código na tela');
  ok((await t.page.innerText('#pauta')).includes('Fulano Detal') && !(await t.page.innerText('#pauta')).includes('Chapa ligada'), 'pauta detalhada continua embaixo e não repete combinado');
  await t.page.fill('#cbtx', 'Dupla conferência da sacola no pico');
  await t.page.selectOption('#cblj', 'São Braz'); await t.page.selectOption('#cbtm', 'iFood');
  await t.page.fill('#cbdn', 'Gerente SB'); await t.page.fill('#cbpz', '2026-11-20');
  await t.page.click('text=Gravar combinado'); await t.page.waitForTimeout(400);
  const p = t.posts[0] || {};
  ok(p.p_token === 'tok-teste' && p.p_acao === 'criar' && p.p_dados && p.p_dados.unidade === 'São Braz' && p.p_dados.tema === 'iFood' && p.p_dados.combinado === 'Dupla conferência da sacola no pico' && p.p_dados.dono === 'Gerente SB' && p.p_dados.prazo === '2026-11-20' && p.p_dados.semana === iso(M), 'gravar combinado manda loja, tema, dono, prazo e a semana da reunião', JSON.stringify(p));
  await t.page.click('.cbi input[type=checkbox]'); await t.page.waitForTimeout(400);
  const p2 = t.posts[1] || {};
  ok(p2.p_acao === 'feito' && p2.p_dados && p2.p_dados.decisao_id === 801 && p2.p_dados.feito === true, 'marcar feito manda o combinado certo', JSON.stringify(p2));
  ok(t.erros.length === 0, 'nenhum erro de javascript', t.erros.join(' | '));
  if (SHOT) await t.page.screenshot({ path: SHOT + '/reuniao-gerentes.png', fullPage: true });
  await t.ctx.close();

  console.log('2) Reunião dos gerentes, login de GERENTE (não é dono)');
  t = await abre(browser, { dono: false });
  tx = (await t.page.innerText('#app')).toLowerCase();
  ok(!/r\$\s?\d/.test(tx), 'gerente não vê nenhum valor em reais', (tx.match(/r\$\s?\d[\d.,]*/g) || []).join(' '));
  ok(tx.includes('+35%') && tx.includes('só a variação'), 'gerente vê só a variação do faturamento');
  ok(t.erros.length === 0, 'nenhum erro de javascript', t.erros.join(' | '));
  await t.ctx.close();

  console.log('3) Folha da equipe');
  t = await abre(browser, { dono: true });
  await t.page.click('#bmodo'); await t.page.waitForFunction(() => document.body.innerText.includes('O que combinamos'));
  tx = (await t.page.innerText('body')).toLowerCase();
  ok(tx.includes('folha da equipe · água verde'), 'abre na loja, sem a opção Todas');
  ok(!/r\$\s?\d/.test(tx), 'folha não mostra nenhum valor em reais (nem o citado pelo cliente)', (tx.match(/r\$\s?\d[\d.,]*/g) || []).join(' '));
  ok(tx.includes('r$ —'), 'valor citado no comentário do cliente vira traço');
  ok(!tx.includes('fulano detal') && !(await t.page.isVisible('#pauta')), 'folha não mostra a pauta com nome de quem errou');
  ok(tx.includes('ninguém sai depois do horário') && !tx.includes('chapa ligada 15 min'), 'folha mostra o combinado de todas as lojas e esconde o de outra loja');
  ok(!(await t.page.$('#app input[type=checkbox]')) && !(await t.page.$('#cbtx')), 'folha é só leitura (sem caixa de marcar nem formulário)');
  ok(tx.includes('expedição') && tx.includes('destaque da semana'), 'folha traz a área da reclamação e a linha do destaque');
  await t.page.click('text=Ahú'); await t.page.waitForFunction(() => document.body.innerText.includes('Folha da equipe · Ahú'));
  tx = (await t.page.innerText('body')).toLowerCase();
  ok(tx.includes('chapa ligada 15 min antes de abrir') && !tx.includes('conferir a sacola'), 'trocar de loja troca os combinados');
  ok(t.erros.length === 0, 'nenhum erro de javascript', t.erros.join(' | '));
  if (SHOT) { await t.page.click('text=Água Verde'); await t.page.waitForFunction(() => document.body.innerText.includes('Folha da equipe · Água Verde')); await t.page.screenshot({ path: SHOT + '/reuniao-folha-equipe.png', fullPage: true }); }
  await t.ctx.close();

  console.log('4) Porta do banco recusa (sem acesso)');
  t = await abre(browser, { dono: false, portaCai: true });
  tx = (await t.page.innerText('#app')).toLowerCase();
  ok(tx.includes('não consegui ler os números por loja'), 'avisa que não leu os números');
  ok(!/pedidos no ifood\s*\n\s*0/.test(tx) && /pedidos no ifood\s*\n\s*—/.test(tx), 'sem leitura vira traço, nunca zero', (tx.match(/pedidos no ifood[\s\S]{0,30}/) || [''])[0]);
  ok(t.erros.filter(e => !/403/.test(e)).length === 0, 'nenhum erro de javascript', t.erros.join(' | '));
  await t.ctx.close();

  console.log('5) Celular 390x844');
  t = await abre(browser, { dono: true, viewport: { width: 390, height: 844 } });
  const larg = await t.page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 392, 'reunião não transborda a largura do celular', 'largura ' + larg + ' · ' + await t.page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 392 && !e.closest('.tw')).slice(0, 4).map(e => e.tagName + '.' + e.className + ':' + Math.round(e.getBoundingClientRect().right)).join(', ')));
  await t.page.click('#bmodo'); await t.page.waitForFunction(() => document.body.innerText.includes('O que combinamos'));
  const larg2 = await t.page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg2 <= 392, 'folha da equipe não transborda a largura do celular', 'largura ' + larg2);
  await t.ctx.close();

  console.log('6) Quem não é dono e não tem o módulo é mandado para fora');
  const F2 = await abre(browser, { dono: false, semModulo: true }).catch(e => ({ falhou: e.message }));
  ok(F2.page && new URL(F2.page.url()).pathname === '/index.html', 'sem acesso volta para a entrada do portal', F2.page ? F2.page.url() : F2.falhou);
  if (F2.ctx) await F2.ctx.close();

  await browser.close();
  if (srv) srv.close();
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO PASSOU');
  process.exit(falhas ? 1 : 0);
})();
