#!/usr/bin/env node
/* Testa TODAS as telas do menu, para cada papel de demonstracao, num navegador de verdade.

   node produto/_ferramentas/testar-tudo.cjs [--papeis dono,gerente,escritorio,delivery] [--fotos pasta] [--largura 1366]

   Para cada papel: entra pelo hub (botao da demonstracao), le o menu que o papel recebe e abre cada tela.
   Em cada tela confere: erro de JavaScript, porta sem dados na demonstracao, arquivo 404, acesso proibido
   a internet, e palavras que denunciam tela quebrada (undefined, NaN, [object Object], Invalid Date).
   No fim mostra um resumo e sai com codigo 1 se alguma tela falhou. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
function opt(n, p) { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : p; }
const PAPEIS = opt('papeis', 'dono,gerente,escritorio,delivery').split(',');
const FOTOS = opt('fotos', null);
const LARG = +opt('largura', 1366);
const ESPERA = +opt('esperar', 3500);
if (FOTOS) fs.mkdirSync(FOTOS, { recursive: true });

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const servidor = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const arq = path.join(RAIZ, p);
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(arq).pipe(res);
});
const PERMITIDOS = [/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, /^https:\/\/cdnjs\.cloudflare\.com\//, /^https:\/\/cdn\.jsdelivr\.net\/npm\//, /^https:\/\/unpkg\.com\//, /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\//, /^data:/, /^blob:/, /^about:/];
const QUEBRA = /\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date/;

servidor.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${servidor.address().port}/`;
  const browser = await chromium.launch();
  const resumo = [];
  try {
    for (const papel of PAPEIS) {
      const ctx = await browser.newContext({ viewport: { width: LARG, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
      const hub = await ctx.newPage();
      await hub.goto(base + 'index.html');
      await hub.waitForTimeout(600);
      await hub.evaluate((p) => entrarComo(p), papel);
      await hub.waitForTimeout(1200);
      const mods = await hub.evaluate(() => MODULOS.map((m) => ({ id: m.id, url: m.url, nome: m.nome })));
      const token = await hub.evaluate(() => sessionStorage.getItem('pdg_token'));
      const admin = await hub.evaluate(() => sessionStorage.getItem('pdg_admin'));
      await hub.close();
      for (const m of mods) {
        const r = { papel, id: m.id, url: m.url, erros_js: [], erros_console: [], http_404: [], externos: [], faltando: [], quebra: [] };
        const pg = await ctx.newPage();
        await pg.addInitScript(([t, a]) => { try { sessionStorage.setItem('pdg_token', t); sessionStorage.setItem('pdg_admin', a); } catch (e) {} }, [token, admin]);
        pg.on('pageerror', (e) => r.erros_js.push(String(e && e.message || e).slice(0, 200)));
        pg.on('console', (c) => { if (c.type() === 'error' && !/Failed to load resource/.test(c.text())) r.erros_console.push(c.text().slice(0, 200)); });
        pg.on('request', (q) => { const u = q.url(); if (!u.startsWith(base) && !PERMITIDOS.some((re) => re.test(u))) r.externos.push(u.slice(0, 150)); });
        pg.on('websocket', (w) => r.externos.push('conexao ao vivo: ' + w.url().slice(0, 150)));
        pg.on('response', (s) => { if (s.url().startsWith(base) && s.status() === 404) r.http_404.push(s.url().replace(base, '')); });
        try {
          await pg.goto(base + m.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await pg.waitForTimeout(ESPERA);
          for (const f of pg.frames()) {
            try {
              const info = await f.evaluate(() => ({ falt: (window.DEMO && DEMO.faltando) || [], txt: (document.body && document.body.innerText) || '', url: location.pathname }));
              r.faltando.push(...info.falt);
              const mm = info.txt.match(QUEBRA);
              if (mm) { const i = info.txt.indexOf(mm[0]); r.quebra.push(info.url + ': …' + info.txt.slice(Math.max(0, i - 60), i + 40).replace(/\s+/g, ' ') + '…'); }
              if (f === pg.mainFrame()) r.chars = info.txt.length;
            } catch (e) {}
          }
          if (FOTOS) await pg.screenshot({ path: path.join(FOTOS, papel + '-' + m.id + '.png'), fullPage: false });
        } catch (e) { r.erros_js.push('falhou ao abrir: ' + String(e.message).split('\n')[0]); }
        await pg.close();
        r.faltando = [...new Set(r.faltando)];
        r.ok = !r.erros_js.length && !r.http_404.length && !r.externos.length && !r.faltando.length && !r.quebra.length && (r.chars || 0) > 80;
        resumo.push(r);
        process.stderr.write((r.ok ? '  ok  ' : ' FALHA ') + papel + ' ' + m.id + '\n');
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    servidor.close();
  }
  const falhas = resumo.filter((r) => !r.ok);
  console.log(JSON.stringify({ telas_testadas: resumo.length, falhas: falhas.length, detalhes_falhas: falhas }, null, 1));
  process.exit(falhas.length ? 1 : 0);
});
