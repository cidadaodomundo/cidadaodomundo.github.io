#!/usr/bin/env node
/* Gera CONTRATO-DE-DADOS.md: para cada tela, as portas (funcoes SQL via /rest/v1/rpc), tabelas e Edge Functions
   que ela usa, lidas dos arquivos de demonstracao (assets/demo/telas/*.js) e das proprias telas.

   node produto/_ferramentas/gerar-contrato.cjs [descricoes.json]
   descricoes.json (padrao: _ferramentas/descricoes-das-portas.json): { "nome_da_porta": "o que devolve", ... }. */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const ARQ_DESC = process.argv[2] || path.join(__dirname, 'descricoes-das-portas.json');
const DESC = fs.existsSync(ARQ_DESC) ? JSON.parse(fs.readFileSync(ARQ_DESC, 'utf8')) : {};

function html(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'assets' || e.name.startsWith('_') ? [] : html(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}
function registros(arquivo) {
  const t = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '';
  const r = { rpc: new Set(), tabela: new Set(), funcao: new Set() };
  const re = /\b[A-Za-z_$][\w$]*\.(rpc|tabela|funcao)\(\s*['"]([A-Za-z0-9_-]+)['"]/g;
  let m;
  while ((m = re.exec(t))) r[m[1]].add(m[2]);
  return r;
}
function chamadas(texto) {
  const r = new Set();
  /* rpc/<nome> na URL, porta('<nome>') e rpc('<nome>'); nome de porta sempre tem "_" (evita confundir com nome de acao) */
  const re = /(?:rpc\/['"]?|porta\(\s*['"]|rpc\(\s*['"])([a-z0-9]+_[a-z_0-9]+)/g;
  let m;
  while ((m = re.exec(texto))) if (m[1] !== 'portal_eu') r.add(m[1]);
  return r;
}

const comum = registros(path.join(RAIZ, 'assets/demo/comum.js'));
const linhas = [];
linhas.push('# Contrato de dados — o que cada tela pede ao banco', '');
linhas.push('Gerado por `_ferramentas/gerar-contrato.cjs` a partir das telas e dos arquivos de demonstração.', '');
linhas.push('* **Porta** = função SQL chamada por `POST /rest/v1/rpc/<porta>` com corpo JSON (quase sempre `{p_token, ...}`).');
linhas.push('* **Tabela** = leitura direta `GET /rest/v1/<tabela>?select=...` (só para dado sem informação pessoal).');
linhas.push('* **Função** = Edge Function `POST /functions/v1/<nome>`.');
linhas.push('* O formato exato de cada resposta está no arquivo de demonstração indicado (é o "molde" do que o banco devolve).', '');
linhas.push('## Portas comuns a todas as telas', '');
linhas.push('Arquivo de demonstração: `assets/demo/comum.js`', '');
[...comum.rpc].sort().forEach((n) => linhas.push('- porta `' + n + '`' + (DESC[n] ? ' — ' + DESC[n] : '')));
[...comum.tabela].sort().forEach((n) => linhas.push('- tabela `' + n + '`' + (DESC[n] ? ' — ' + DESC[n] : '')));
linhas.push('');

const paginas = html(RAIZ).map((p) => path.relative(RAIZ, p).replace(/\\/g, '/')).filter((p) => p !== 'sobre.html').sort();
const todas = { rpc: new Set(), tabela: new Set(), funcao: new Set() };
linhas.push('## Telas', '');
for (const pg of paginas) {
  const txt = fs.readFileSync(path.join(RAIZ, pg), 'utf8');
  const tit = ((txt.match(/<title>([^<]*)/) || [])[1] || pg).replace(/\s*·\s*Portal de Gestão\s*$/, '');
  const dd = (txt.match(/data-demo="([^"]*)"/) || [])[1] || '';
  const arqs = dd.split(/\s+/).filter(Boolean);
  const reg = { rpc: new Set(), tabela: new Set(), funcao: new Set() };
  arqs.forEach((a) => { const r = registros(path.join(RAIZ, 'assets/demo', a)); for (const k in r) r[k].forEach((x) => reg[k].add(x)); });
  const usadas = chamadas(txt);
  const textoDemo = arqs.map((a) => { const f = path.join(RAIZ, 'assets/demo', a); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }).join('\n');
  /* nome chamado pela tela que nao e porta registrada: se o arquivo de demonstracao trata como acao de outra porta, tudo bem */
  usadas.forEach((u) => { if (!reg.rpc.has(u) && !comum.rpc.has(u) && textoDemo.indexOf(u) < 0) reg.rpc.add(u + ' ⚠ sem molde'); });
  linhas.push('### ' + tit + ' — `' + pg + '`', '');
  if (arqs.length) linhas.push('Demonstração: ' + arqs.map((a) => '`assets/demo/' + a + '`').join(', '), '');
  const item = (tipo, n) => '- ' + tipo + ' `' + n + '`' + (DESC[n.replace(/ ⚠.*/, '')] ? ' — ' + DESC[n.replace(/ ⚠.*/, '')] : '');
  [...reg.rpc].sort().forEach((n) => { linhas.push(item('porta', n)); todas.rpc.add(n); });
  [...reg.tabela].sort().forEach((n) => { linhas.push(item('tabela', n)); todas.tabela.add(n); });
  [...reg.funcao].sort().forEach((n) => { linhas.push(item('função', n)); todas.funcao.add(n); });
  if (!reg.rpc.size && !reg.tabela.size && !reg.funcao.size) linhas.push('- só as portas comuns');
  linhas.push('');
}
linhas.push('## Totais', '');
linhas.push('- ' + todas.rpc.size + ' portas, ' + todas.tabela.size + ' tabelas, ' + todas.funcao.size + ' Edge Functions (sem contar as comuns).');
fs.writeFileSync(path.join(RAIZ, 'CONTRATO-DE-DADOS.md'), linhas.join('\n') + '\n');
console.log('CONTRATO-DE-DADOS.md: ' + paginas.length + ' telas, ' + todas.rpc.size + ' portas, ' + todas.tabela.size + ' tabelas, ' + todas.funcao.size + ' funcoes');
