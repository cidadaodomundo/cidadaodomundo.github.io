#!/usr/bin/env node
/* Testa uma tela do portal em modo demonstracao, num navegador de verdade (Playwright/Chromium).

   node produto/_ferramentas/testar-tela.cjs <tela> [opcoes]
     <tela>            caminho a partir da pasta do portal: fila/  ·  delivery/central.html?embed=equipe  ·  index.html
     --papel dono      entra como dono | gerente | escritorio | delivery (padrao: dono)
     --esperar 3000    quantos milissegundos esperar depois de abrir
     --shot arq.png    salva uma foto da tela inteira
     --largura 1366    largura da janela (use 390 para ver como celular)
     --altura 900      altura da janela (ex.: 1080 para a TV)
     --clicar "sel"    clica num seletor CSS depois de abrir (pode repetir; espera 1,2 s apos cada clique)
     --js "expr"       avalia uma expressao JavaScript na pagina e mostra o resultado
     --sem-login       nao entra automaticamente (para testar a tela de entrada)

   Mostra um relatorio JSON: erros do console, erros de JavaScript, portas sem dados (DEMO.faltando),
   enderecos bloqueados e qualquer tentativa de acessar a internet fora do permitido.
   Sai com codigo 1 se houver erro de JavaScript, porta sem dados, ou acesso externo proibido. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const tela = args[0] && !args[0].startsWith('--') ? args[0] : 'index.html';
function opt(nome, padrao) { const i = args.indexOf('--' + nome); return i >= 0 ? args[i + 1] : padrao; }
function opts(nome) { const r = []; args.forEach((a, i) => { if (a === '--' + nome) r.push(args[i + 1]); }); return r; }
const PAPEL = opt('papel', 'dono');
const ESPERA = +opt('esperar', 3000);
const SHOT = opt('shot', null);
const LARG = +opt('largura', 1366);
const ALT = +opt('altura', 900);
const JS = opt('js', null);
const CLIQUES = opts('clicar');
const SEM_LOGIN = args.includes('--sem-login');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown; charset=utf-8' };
const servidor = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const arq = path.join(RAIZ, p);
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end('nao achei'); return; }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(arq).pipe(res);
});

const PERMITIDOS = [/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, /^https:\/\/cdnjs\.cloudflare\.com\//, /^https:\/\/cdn\.jsdelivr\.net\/npm\//, /^https:\/\/unpkg\.com\//, /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\//, /^data:/, /^blob:/, /^about:/];

servidor.listen(0, '127.0.0.1', async () => {
  const porta = servidor.address().port;
  const base = `http://127.0.0.1:${porta}/`;
  const r = { tela, papel: PAPEL, erros_console: [], erros_js: [], avisos_demo: [], externos_proibidos: [], falhas_rede: [], http_404: [] };
  let browser;
  try {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: LARG, height: ALT }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    if (!SEM_LOGIN) {
      await ctx.addInitScript((p) => {
        try {
          if (!sessionStorage.getItem('pdg_token')) {
            sessionStorage.setItem('pdg_token', 'demo-' + p);
            sessionStorage.setItem('pdg_admin', p === 'dono' ? '1' : '0');
          }
        } catch (e) {}
      }, PAPEL);
    }
    const page = await ctx.newPage();
    page.on('console', (m) => {
      const t = m.text();
      if (/^\[DEMO\]/.test(t)) r.avisos_demo.push(t);
      else if (m.type() === 'error') r.erros_console.push(t.slice(0, 300));
    });
    page.on('pageerror', (e) => r.erros_js.push(String(e && e.stack || e).slice(0, 500)));
    page.on('request', (q) => {
      const u = q.url();
      if (u.startsWith(base)) return;
      if (!PERMITIDOS.some((re) => re.test(u))) r.externos_proibidos.push(u.slice(0, 200));
    });
    page.on('websocket', (w) => r.externos_proibidos.push('conexao ao vivo: ' + w.url().slice(0, 200)));
    page.on('requestfailed', (q) => { const u = q.url(); if (u.startsWith(base)) r.falhas_rede.push(u.replace(base, '') + ' ' + (q.failure() || {}).errorText); });
    page.on('response', (s) => { const u = s.url(); if (u.startsWith(base) && s.status() === 404) r.http_404.push(u.replace(base, '')); });

    await page.goto(base + tela, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(ESPERA);
    for (const sel of CLIQUES) {
      try { await page.click(sel, { timeout: 5000 }); } catch (e) { r.erros_console.push('nao consegui clicar em ' + sel + ': ' + String(e.message).split('\n')[0]); }
      await page.waitForTimeout(1200);
    }
    const frames = [];
    for (const f of page.frames()) {
      try {
        const info = await f.evaluate(() => ({
          url: location.pathname + location.search,
          titulo: document.title,
          faltando: (window.DEMO && window.DEMO.faltando) ? window.DEMO.faltando.slice() : null,
          bloqueados: (window.DEMO && window.DEMO.bloqueados) ? window.DEMO.bloqueados.slice() : null,
          texto_chars: (document.body && document.body.innerText || '').length,
          texto_inicio: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500)
        }));
        frames.push(info);
      } catch (e) { frames.push({ url: f.url(), erro: String(e.message).split('\n')[0] }); }
    }
    r.frames = frames;
    r.faltando = [...new Set(frames.flatMap((f) => f.faltando || []))];
    r.bloqueados = [...new Set(frames.flatMap((f) => f.bloqueados || []))];
    if (JS) { try { r.resultado_js = await page.evaluate(JS); } catch (e) { r.resultado_js = 'ERRO: ' + e.message; } }
    if (SHOT) { await page.screenshot({ path: SHOT, fullPage: true }); r.foto = SHOT; }
  } catch (e) {
    r.erro_teste = String(e && e.stack || e);
  } finally {
    if (browser) await browser.close();
    servidor.close();
  }
  r.ok = !r.erro_teste && !r.erros_js.length && !(r.faltando || []).length && !r.externos_proibidos.length && !r.http_404.length;
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
});
