const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'chegada/index.html'),'utf8');
const hellen=fs.readFileSync(path.join(root,'hellen/index.html'),'utf8');
const start=src.indexOf('function direitosVisiveis('),end=src.indexOf('function listaSimples(',start);
assert.ok(start>=0&&end>start,'Renderizador essencial removido');
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const ctx={D:{somente_consulta:false},ABERTO:{},esc,
valeGarantido:l=>l.garantido_manual??!l.garantido_perdido,
valeRango:l=>l.rango_manual??(l.direito!=='perdeu'),
situacao:()=> 'semprova',horaChegou:l=>l.chegou_txt||l.anotado_txt||'',
chaveL:l=>l.unidade+'|'+l.entregador+'|'+l.n_turno,
porQue:()=> 'Conferir as fontes',medHora:()=> '10:10:00',cartaoChegada:()=> 'detalhes'};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
const l={entregador:'Pessoa de teste',unidade:'Loja',n_turno:1,na_escala:true,escala_txt:'10:00',escala_saida_txt:'14:00',chegou_txt:'10:14:25',direito:'ok',tempo_registrado_min:221};
const html=ctx.linhaSimples(l,0,true);
for(const field of ['entrada','c1','c2','tempo','garantido','refeicao'])assert.ok(html.includes('class="'+field+'"'),'Campo essencial ausente: '+field);
assert.ok(html.includes('10:00')&&html.includes('14:00')&&html.includes('10:14:25'));
assert.ok(html.includes('3h41'));
assert.ok(ctx.saidaDetalhada({ultimo_sinal_txt:'17:00'}).includes('Não registrada'),'Sinal virou saida indevidamente');
assert.ok(ctx.saidaDetalhada({saida_registrada_txt:'17:03:00'}).includes('saída registrada por QR'));
assert.ok(ctx.direitosVisiveis({...l,na_escala:false},'garantido').includes('A conferir'));
assert.ok(ctx.direitosVisiveis({...l,direito:'sem_prova'},'rango').includes('sem corte automático'));
assert.ok(ctx.direitosVisiveis({...l,rango_manual:false},'rango').includes('Não'));
assert.ok(ctx.tempoRegistrado({}).includes('Não informado'));
assert.ok(!ctx.linhaSimples({...l,entregador:'<script>falha</script>'},0,true).includes('<script>falha</script>'));
ctx.D.somente_consulta=true;
const consulta=ctx.linhaSimples(l,0,true);
assert.ok(!consulta.includes('data-cdm-livre'),'Consulta nao deve oferecer edicao de anotacao');
assert.ok(consulta.includes('Consulta da Hellen'));
assert.ok(src.includes("'hellen_chegada'")&&src.includes('D.consulta_detalhada'));
assert.ok(hellen.includes('href="/chegada/"'),'Atalho da Hellen ausente');
assert.ok(src.includes('@media(max-width:1100px)'),'Layout movel do contrato ausente');
console.log('Contrato da Chegada validado: campos permanentes, saida identificada e consulta Hellen.');

assert.ok(ctx.direitosVisiveis({...l,direito:'ok'},'garantido').includes('class="vd">Sim'));
assert.ok(ctx.direitosVisiveis({...l,direito:'sem_prova'},'rango').includes('class="vd">Sim'));
assert.ok(ctx.direitosVisiveis({...l,rango_manual:false},'rango').includes('class="vm">Não'));
assert.ok(ctx.linhaSimples({...l,chegada_fila_txt:'10:07:42'},0,true).includes('10:07:42'));
vm.runInContext(src.slice(src.indexOf('function listaSimples('),src.indexOf('function desenha(){')),ctx);
ctx.UNI='Loja';ctx.D={linhas:[l,{...l,entregador:'Outro',na_escala:false}]};
assert.ok(!ctx.listaSimples(true).includes('lj2">Fora da escala'));
assert.ok(ctx.listaSimples(true).includes('fora da escala'));
ctx.UNI='Loja';
assert.equal((ctx.listaSimples(true).match(/class="lst"/g)||[]).length,1);
assert.ok(src.includes("setTimeout(function(){puxa(true)},10000)"));
assert.ok(!src.includes('atualiza a cada minuto'));
assert.ok(!src.includes('h+=resumoSimples'));
assert.ok(src.includes('Motoboys rodando no dia'));
