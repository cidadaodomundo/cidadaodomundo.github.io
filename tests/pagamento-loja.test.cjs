'use strict';
// Dados 100% sintéticos. Extrai só os helpers puros de loja de pagamento/index.html.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','pagamento','index.html'),'utf8');
const m=src.match(/\/\*LOJA-HELPERS-BEGIN\*\/([\s\S]*?)\/\*LOJA-HELPERS-END\*\//);
assert.ok(m,'bloco de helpers não encontrado');
const ctx=vm.createContext({});
vm.runInContext(m[1]+';this.H={PR_LOJAS,lojaId,lojaRotulo,prLojasDe,prParticiona,prMesmaLoja,prLimpaAcerto,prSomaNosso}',ctx);
const H=ctx.H;
const L=[
 {pessoa:'A',dia:'2026-01-01',unidade:'Agua Verde',nosso:10},
 {pessoa:'B',dia:'2026-01-01',unidade:'Água Verde',nosso:20},
 {pessoa:'C',dia:'2026-01-01',lojas:'Sao Braz',nosso:30},
 {pessoa:'D',dia:'2026-01-01',jornadas_lacradas:[{unidade:'Ahú'}],nosso:40},
 {pessoa:'E',dia:'2026-01-01',lojas:'Agua Verde + Sao Braz',nosso:50},
 {pessoa:'F',dia:'2026-01-01',lojas:'Ahú, São Braz',nosso:60},
 {pessoa:'G',dia:'2026-01-01',nosso:70}
];
test('IDs canônicos sem acento e rótulos separados',()=>{
  assert.deepEqual(Array.from(H.PR_LOJAS),['Agua Verde','Ahú','Sao Braz']);
  assert.equal(H.lojaId('Água Verde'),'Agua Verde');assert.equal(H.lojaId(' SÃO  braz '),'Sao Braz');assert.equal(H.lojaId('AHU'),'Ahú');assert.equal(H.lojaId('xyz'),'');
  assert.equal(H.lojaRotulo('Sao Braz'),'São Braz');assert.equal(H.lojaRotulo('Agua Verde'),'Água Verde');
});
test('linha só com lojas, unidade com/sem acento, jornadas, múltiplas e sem identificação',()=>{
  assert.deepEqual(Array.from(H.prLojasDe(L[0])),['Agua Verde']);assert.deepEqual(Array.from(H.prLojasDe(L[1])),['Agua Verde']);
  assert.deepEqual(Array.from(H.prLojasDe(L[2])),['Sao Braz']);assert.deepEqual(Array.from(H.prLojasDe(L[3])),['Ahú']);
  assert.equal(H.prLojasDe(L[4]).length,2);assert.equal(H.prLojasDe(L[5]).length,2);assert.equal(H.prLojasDe(L[6]).length,0);
});
test('cada seletor: totais filtrados, consolidadas e sem loja fora do total',()=>{
  const av=H.prParticiona(L,'Agua Verde');assert.equal(H.prSomaNosso(av.lista),30);
  assert.equal(av.multi.length,2);assert.equal(av.sem.length,1);
  assert.equal(H.prSomaNosso(H.prParticiona(L,'Água Verde').lista),30);
  assert.equal(H.prSomaNosso(H.prParticiona(L,'Sao Braz').lista),30);
  assert.equal(H.prSomaNosso(H.prParticiona(L,'Ahú').lista),40);
});
test('seletor sem dados da loja devolve vazio, mas mantém multi e sem',()=>{
  const o=H.prParticiona([L[0],L[4],L[6]],'Ahú');
  assert.equal(o.lista.length,0);assert.equal(o.multi.length,1);assert.equal(o.sem.length,1);
});
test('Todas preserva todas as linhas e o total geral',()=>{
  const o=H.prParticiona(L,'');assert.equal(o.lista.length,L.length);assert.equal(H.prSomaNosso(o.lista),280);
  assert.equal(o.multi.length+o.sem.length,0);
});
test('acerto: não casa lojas distintas e é limpo ao trocar filtro',()=>{
  assert.equal(H.prMesmaLoja(L[0],L[1]),true);assert.equal(H.prMesmaLoja(L[0],L[2]),false);assert.equal(H.prMesmaLoja(L[4],L[5]),false);
  const x={_acerto:'2026-01-02'};H.prLimpaAcerto([x]);assert.equal('_acerto' in x,false);
});
