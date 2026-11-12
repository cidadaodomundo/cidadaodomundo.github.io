// Teste sintetico da coluna "Chegada GPS" (1a aparicao no patio no dia). Sem dados reais.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'chegada/index.html'),'utf8');
const sql=path.join(root,'supabase/patches/chegada-gps-dia.sql');
const start=src.indexOf('function direitosVisiveis('),end=src.indexOf('function listaSimples(',start);
assert.ok(start>=0&&end>start,'Renderizador removido');
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const ctx={D:{somente_consulta:false,dia:'2026-01-01'},ABERTO:{},esc,
valeGarantido:l=>l.garantido_manual??!l.garantido_perdido,
valeRango:l=>l.rango_manual??(l.direito!=='perdeu'),
situacao:()=> 'ok',horaChegou:l=>l.chegou_txt||l.anotado_txt||'',
chaveL:l=>l.unidade+'|'+l.entregador+'|'+l.n_turno,
porQue:()=> '',medHora:()=> '',cartaoChegada:()=> ''};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
vm.runInContext(src.slice(src.indexOf('function listaSimples('),src.indexOf('function desenha(){')),ctx);
const base={entregador:'Pessoa Teste',unidade:'Loja',n_turno:1,na_escala:true,escala_txt:'10:00',escala_saida_txt:'14:00',chegou_txt:'10:14:25',direito:'ok'};

// 1) render com segundos, rotulo e Chegada (fila) separada
const comGps={...base,chegada_fila_txt:'10:07:42',chegada_gps_dia_txt:'09:41:07',chegada_gps_dia_em:'2026-01-01T12:41:07Z'};
let h=ctx.linhaSimples(comGps,0,true);
assert.ok(h.includes('class="gps"')&&h.includes('09:41:07'),'GPS com segundos ausente');
assert.ok(h.includes('1ª aparição no pátio no dia'),'Rotulo ausente');
assert.ok(h.includes('10:07:42')&&h.includes('fila do Track'),'Chegada pela fila foi afetada');
assert.ok(h.indexOf('class="c1"')<h.indexOf('class="gps"')&&h.indexOf('class="gps"')<h.indexOf('class="c2"'),'Coluna deve ficar logo apos Chegada');
for(const f of ['entrada','c1','c2','tempo','garantido','refeicao'])assert.ok(h.includes('class="'+f+'"'),'Contrato: campo ausente '+f);

// 2) sem dado => "Sem registro GPS"; campo ausente => "GPS indisponivel"
assert.ok(ctx.linhaSimples({...base,chegada_gps_dia_txt:null,chegada_gps_dia_em:null},0,true).includes('Sem registro GPS'));
assert.ok(ctx.linhaSimples({...base,chegada_gps_dia_txt:''},0,true).includes('Sem registro GPS'));
assert.ok(ctx.linhaSimples(base,0,true).includes('GPS indisponível'));

// 3) acesso restrito (sem dono/consulta_detalhada): nem coluna, nem cabecalho, nem valor
const restrito=ctx.linhaSimples(comGps,0,false);
assert.ok(!restrito.includes('class="gps"')&&!restrito.includes('09:41:07')&&!restrito.includes('GPS indisponível'),'GPS vazou para acesso restrito');
assert.ok(restrito.includes('class="ls sg"'),'Grade restrita ausente');
ctx.UNI='Loja';
ctx.D={linhas:[comGps]};
assert.ok(ctx.listaSimples(false).includes('class="ls cab sg"')&&!ctx.listaSimples(false).includes('Chegada GPS'));
assert.ok(ctx.listaSimples(true).includes('<div>Chegada</div><div>Chegada GPS</div><div>Saída</div>'),'Cabecalho dono');

// 4) dois turnos da mesma pessoa: mesma 1a aparicao do dia
ctx.D={linhas:[{...comGps,n_turno:1},{...comGps,n_turno:2,escala_txt:'18:00',escala_saida_txt:'22:00',chegou_txt:'18:03:00',chegada_fila_txt:'18:01:10'}]};
const lista=ctx.listaSimples(true);
assert.equal((lista.match(/09:41:07/g)||[]).length,2,'Dois turnos devem repetir o mesmo horario do dia');
assert.ok(lista.includes('10:07:42')&&lista.includes('18:01:10'),'Filas por turno preservadas');

// 5) XSS
assert.ok(!ctx.chegadaGps({chegada_gps_dia_txt:'<b>x</b>'}).includes('<b>x</b>'));

// 6) responsivo: colunas fixas e nao ocultadas
assert.ok(src.includes('@media(max-width:1100px)')&&src.includes('@media(min-width:1101px)'));
assert.ok(!/\.gps\s*\{[^}]*display\s*:\s*none/.test(src),'Coluna GPS nao pode ser escondida');

// 7) contrato do SQL (estatico)
const q=fs.readFileSync(sql,'utf8');
assert.ok(q.includes("'chegada_gps_dia_em'")&&q.includes("'chegada_gps_dia_txt'"));
assert.ok(/min\(p\.visto_em\)/.test(q)&&q.includes('p.dia_operacional=v_dia')&&q.includes('p.no_patio is true')&&q.includes('p.lat is not null')&&q.includes('p.lng is not null'));
assert.equal((q.match(/from public\.foody_presenca/g)||[]).length,1,'foody_presenca deve ser varrida uma vez no bloco novo');
assert.ok(q.includes("- 'chegada_gps_dia_em' - 'chegada_gps_dia_txt'"),'ELSE do balcao deve remover os campos');
assert.ok(q.includes('SECURITY DEFINER')&&q.includes("portal_pode(p_token,'hellen_chegada')")&&q.includes('portal_sessao_usuario(p_token)'));
assert.ok(!/\bgrant\b|\brevoke\b|create table|alter table/i.test(q.replace(/--.*$/gm,'')),'Sem ACL/tabelas novas');
console.log('Chegada GPS validada: render, sem dado, acesso restrito, dois turnos e contrato SQL.');
