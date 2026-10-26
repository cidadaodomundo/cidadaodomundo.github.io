/* Quadro "Avaliacoes do dia" — Portal de Gestao
   Usado na tela Inicio (hub), na tela avaliacoes/ e dentro da Central Salao (com o Google em destaque).
   Um arquivo so, para as telas nao divergirem. Mexeu aqui? Suba o ?v= em index.html e avaliacoes/index.html.
   Porta: inicio_avaliacoes(p_token, p_dados{quando:'hoje'|'ontem'}) — qualquer usuario logado.
   iFood: conta as avaliacoes que CHEGARAM no dia (o iFood libera cerca de 1 dia depois do pedido) — zero de hoje
   aparece como "—" e nao como 0. Google: nota e total da leitura diaria; "novas" = diferenca para a leitura
   anterior. Accon: ainda sem leitura — o cartao diz isso. Foto da loja vem da porta; sem ela, o logo.
   Enderecos (banco, funcoes, logo) vem de PORTAL_CFG (config.js).
   Uso: AVD.montar(elemento, {loja:'<nome da loja>'|'' , foco:'google'|'ifood', aoVencer:function(){...}, aoDesenhar:fn}) */
(function(){
  'use strict';
  var CFG=window.PORTAL_CFG||{};
  var SB=CFG.rest;
  var KEY=CFG.chave;
  var LOGO=CFG.logoUrl||'';
  var FUNCOES=CFG.funcoes;
  var CSS=".avd{max-width:1180px;margin:24px auto 0;text-align:left}\n.avd-top{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:10px}\n.avd-top h2{font-family:'Anton',Impact,'Arial Black',sans-serif;font-weight:400;text-transform:uppercase;font-size:22px;letter-spacing:.02em}\n.avd-top .sub{color:var(--muted);font-size:12.5px;font-weight:600}\n.avd-chips{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}\n.avd-chip{display:inline-flex;align-items:center;gap:6px;background:var(--s1);border:1px solid var(--line);color:var(--text);border-radius:999px;padding:7px 12px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit}\n.avd-chip:hover{border-color:#5a5952}\n.avd-chip.on{background:#fff;color:#111;border-color:#fff}\n.avd-chip .ct{background:#2c2c29;color:var(--text2);border-radius:999px;padding:1px 7px;font-size:11.5px;font-weight:800}\n.avd-chip.on .ct{background:#111;color:#fff}\n.avd-sep{width:1px;background:var(--line);margin:0 3px}\n.avd-aviso{background:#4a3a12;color:#ffd98a;border-radius:12px;padding:8px 12px;font-size:13px;margin-bottom:10px}\n.avd-loja{display:grid;grid-template-columns:190px repeat(3,minmax(0,1fr));gap:11px;background:#151514;border:1px solid var(--line);border-radius:20px;padding:11px;margin-bottom:12px}\n.avd-foto{position:relative;border-radius:15px;overflow:hidden;background:#000;min-height:170px}\n.avd-foto img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}\n.avd-foto img.logo{object-fit:contain;padding:28px;opacity:.55}\n.avd-foto .avd-nm{position:absolute;left:0;right:0;bottom:0;padding:26px 12px 10px;background:linear-gradient(transparent,rgba(0,0,0,.85));font-family:'Anton',Impact,sans-serif;text-transform:uppercase;font-size:21px;line-height:1.05;letter-spacing:.02em}\n.avd-foto .avd-nm small{display:block;font-family:'Barlow',sans-serif;text-transform:none;font-size:11.5px;color:var(--text2);font-weight:600;letter-spacing:0;margin-top:3px}\n.avd-c{background:var(--s1);border:1px solid var(--line);border-radius:16px;padding:13px;display:flex;flex-direction:column;gap:8px;min-width:0;overflow-wrap:anywhere}\n.avd-c.avd-sem{border:1.5px dashed #4a4943;background:transparent}\n.avd-ch{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px}\n.avd-ch .fonte{color:var(--muted);font-size:11.5px;font-weight:600;margin-left:auto;text-align:right}\n.avd-big{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}\n.avd-big b{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:34px;line-height:1}\n.avd-big .st{color:var(--brand);font-size:15px;font-weight:800}\n.avd-big .lb{color:var(--text2);font-size:13px;font-weight:600}\n.avd-notas{display:flex;gap:5px;flex-wrap:wrap}\n.avd-n{background:var(--s2);border:1px solid var(--line);color:var(--text2);border-radius:9px;padding:3px 8px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit}\n.avd-n.r{color:#ff9a9a}.avd-n.m{color:var(--warn,#e5be6d)}.avd-n.b{color:#7fe0aa}\n.avd-n.on{background:#fff;color:#111;border-color:#fff}\n.avd-n.zero{opacity:.4;cursor:default}\n.avd-tg{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;border-radius:9px;padding:3px 8px;background:rgba(229,190,109,.12);color:#e5be6d;align-self:flex-start}\n.avd-tg.ok{background:rgba(37,163,95,.15);color:#7fe0aa}\n.avd-it{border-top:1px solid var(--line);padding-top:8px;font-size:13.5px;line-height:1.4;color:var(--text2)}\n.avd-it .h{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--muted);font-weight:600;margin-bottom:2px}\n.avd-it .h .es{font-size:13px;letter-spacing:-1px}\n.avd-it .h .es.r{color:#ff7a7a}.avd-it .h .es.m{color:#e5be6d}.avd-it .h .es.b{color:var(--brand)}\n.avd-it .tx{color:var(--text);overflow-wrap:anywhere}\n.avd-it .tx.avd-vazio{color:var(--muted);font-style:italic}\n.avd-it .tgs{color:var(--muted);font-size:11.5px;margin-top:2px}\n.avd-it img{max-width:100%;max-height:160px;border-radius:10px;margin-top:6px;display:block}\n.avd-bt{background:var(--s2);border:1px solid #56554e;color:var(--text);border-radius:11px;padding:6px 10px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;align-self:flex-start}\n.avd-bt:hover{border-color:#fff}\n.avd-fb{background:transparent;border:1px solid var(--line);color:var(--text);border-radius:9px;padding:2px 7px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit}\n.avd-vz{color:var(--muted);font-size:13px;line-height:1.45}\n.avd-rod{color:var(--muted);font-size:11.5px;border-top:1px solid var(--line);padding-top:7px;margin-top:auto;line-height:1.45}\n@media(max-width:1000px){.avd-loja{grid-template-columns:150px repeat(3,minmax(0,1fr))}}\n@media(max-width:820px){.avd-loja{grid-template-columns:1fr}.avd-foto{min-height:120px}}\n.avd-c.foco{border-color:rgba(224,168,28,.55)}\n.avd-embed .avd{margin-top:0}\n";
  if(!document.getElementById('avd-css')){var st=document.createElement('style');st.id='avd-css';st.textContent=CSS;document.head.appendChild(st)}

  var EL=null, OP={}, D=null, LOJA='', QUANDO='hoje', NOTA={}, ABRE={}, T=null;
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function arr(r){return Array.isArray(r)?r:[]}
  function tok(){try{return sessionStorage.getItem('pdg_token')||''}catch(e){return ''}}
  /* aceita https:// ou imagem embutida (data:image/...) sem aspas nem espacos */
  function urlOk(u){return typeof u==='string'&&(/^https:\/\/[^\s"'()<>]+$/.test(u)||/^data:image\/(png|jpeg|webp|svg\+xml)[;,][^\s"'<>]+$/.test(u))}
  function num(v,c){if(v==null||v==='')return '—';var n=Number(v);return isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:c||0,maximumFractionDigits:c||0}):'—'}
  function est(n){n=Math.max(0,Math.min(5,Number(n)||0));var k=n<=2?'r':n===3?'m':'b';return '<span class="es '+k+'">'+'★'.repeat(n)+'<span style="opacity:.25">'+'★'.repeat(5-n)+'</span></span>'}
  function vivo(){return EL&&document.body.contains(EL)}
  function pare(){if(T){clearInterval(T);T=null}}

  async function buscar(quieto){
    if(!vivo()){pare();return}
    var pedido=QUANDO;
    try{
      var r=await fetch(SB+'rpc/inicio_avaliacoes',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({p_token:tok(),p_dados:{quando:pedido}})});
      var j=null;try{j=await r.json()}catch(e){}
      if(!r.ok){var er=new Error((j&&j.message)||'falha');er.code=(j&&j.code)||'';throw er}
      if(!vivo())return;
      /* resposta velha (ex.: clicou Ontem e logo Hoje) nao sobrescreve a nova */
      if(!j||j.quando!==QUANDO)return;
      D=j;desenha();
    }catch(e){
      if(!vivo())return;
      if(e.code==='28000'){pare();if(typeof OP.aoVencer==='function')OP.aoVencer();else EL.innerHTML='';return}
      if(quieto&&D)return;
      EL.innerHTML='<div class="avd-top"><h2>⭐ Avaliações do dia</h2></div><div class="avd-aviso">Não deu para buscar as avaliações agora. <button class="avd-bt" onclick="AVD._buscar()">Tentar de novo</button></div>';
      if(typeof OP.aoDesenhar==='function')OP.aoDesenhar();
    }
  }

  function desenha(){
    if(!vivo()||!D)return;
    var J=D, L=arr(J.lojas), hoje=J.quando==='hoje', fixa=!!OP.loja;
    var h='<div class="avd-top"><h2>⭐ Avaliações do dia'+(fixa?' · '+esc(OP.loja):'')+'</h2><span class="sub">'+(hoje?'Hoje':'Ontem')+', '+esc(J.dia||'')+' · iFood lido '+esc(J.ifood_lido_em||'—')+' · atualiza sozinho a cada 5 min</span></div>';
    h+='<div class="avd-chips">';
    if(!fixa){
      h+='<button class="avd-chip'+(LOJA===''?' on':'')+'" onclick="AVD._loja(-1)">🏪 Todas as lojas</button>';
      L.forEach(function(l,i){var n=(l.ifood&&l.ifood.n)||0;h+='<button class="avd-chip'+(LOJA===l.unidade?' on':'')+'" onclick="AVD._loja('+i+')">'+esc(l.unidade)+(n?' <span class="ct">'+n+'</span>':'')+'</button>'});
      h+='<span class="avd-sep"></span>';
    }
    h+='<button class="avd-chip'+(hoje?' on':'')+'" onclick="AVD._quando(\'hoje\')">Hoje</button><button class="avd-chip'+(!hoje?' on':'')+'" onclick="AVD._quando(\'ontem\')">Ontem</button></div>';
    if(J.ifood_lido_min!=null&&Number(J.ifood_lido_min)>180)h+='<div class="avd-aviso">⚠ A leitura das avaliações do iFood está parada desde '+esc(J.ifood_lido_em||'—')+'. O que aparece aqui pode estar faltando.</div>';
    var alvo=fixa?OP.loja:LOJA, algum=false;
    L.forEach(function(l,i){if(alvo&&l.unidade!==alvo)return;algum=true;h+=linha(l,i,hoje,!!alvo)});
    if(!algum)h+='<div class="avd-vz">Nenhuma loja para mostrar.</div>';
    EL.innerHTML=h;
    if(typeof OP.aoDesenhar==='function')OP.aoDesenhar();
  }

  function cIfood(l,i,hoje,sozinha){
    var f=l.ifood||{}, n=f.n||0, it=arr(f.itens), nt=arr(f.notas), fil=NOTA[i]||0;
    var h='<div class="avd-c"><div class="avd-ch">🛵 iFood<span class="fonte">'+(hoje?'chegaram hoje':'chegaram ontem')+'</span></div>';
    if(!n){
      h+='<div class="avd-big"><b>—</b><span class="lb">'+(hoje?'nenhuma chegou ainda hoje':'nenhuma chegou nesse dia')+'</span></div>';
      h+='<div class="avd-vz">'+(hoje?'O iFood libera a avaliação cerca de 1 dia depois do pedido. Ontem chegaram <b>'+num(f.ontem)+'</b>. <button class="avd-fb" onclick="AVD._quando(\'ontem\')">ver ontem</button>':'')+'</div>';
    }else{
      h+='<div class="avd-big"><b>'+num(n)+'</b><span class="lb">avaliaç'+(n===1?'ão':'ões')+'</span><span class="st">★ '+num(f.media,2)+'</span></div>';
      h+='<div class="avd-notas">'+[1,2,3,4,5].map(function(k){var q=nt[k-1]||0,c=k<=2?'r':k===3?'m':'b';return '<button class="avd-n '+c+(fil===k?' on':'')+(q?'':' zero')+'"'+(q?' onclick="AVD._nota('+i+','+k+')"':'')+' title="'+q+' com nota '+k+'">'+k+'★ '+q+'</button>'}).join('')+'</div>';
      if(f.sem_resposta)h+='<span class="avd-tg">💬 '+f.sem_resposta+' com comentário sem resposta</span>';
      var lista=fil?it.filter(function(x){return x.nota===fil}):it;
      var aberto=sozinha||ABRE[i]||fil;
      var mostra=aberto?lista:lista.slice(0,3);
      mostra.forEach(function(x){
        var u=/^[0-9a-f-]{36}$/i.test(x.uuid||'')?x.uuid:'';
        h+='<div class="avd-it"><div class="h">'+est(x.nota)+'<span>'+esc(x.marca||'')+' · pedido '+esc(x.pedido_em||'')+'</span>'+(x.sem_resposta?'<span style="color:#e5be6d">· sem resposta</span>':'')+(u?' <button class="avd-fb" onclick="AVD._fotos(\''+u+'\',this)">📷 fotos</button>':'')+'</div>'+
          (x.texto?'<div class="tx">'+esc(x.texto)+'</div>':'<div class="tx avd-vazio">sem comentário</div>')+
          (arr(x.tags).length?'<div class="tgs">'+arr(x.tags).map(esc).join(' · ')+'</div>':'')+'</div>';
      });
      if(!sozinha&&lista.length>3)h+='<button class="avd-bt" onclick="AVD._abre('+i+')">'+(aberto?'mostrar menos':'ver todas ('+lista.length+')')+'</button>';
      if(n>it.length)h+='<div class="avd-vz">Mostrando as '+it.length+' piores de '+n+'.</div>';
    }
    return h+'<div class="avd-rod">Pedidos do iFood avaliados pelo cliente · todas as marcas da loja</div></div>';
  }
  function cGoogle(l,sozinha){
    var g=l.google, muitos=sozinha||OP.foco==='google';
    var h='<div class="avd-c'+(OP.foco==='google'?' foco':'')+'"><div class="avd-ch">🔎 Google<span class="fonte">'+(g?'leitura de '+esc(g.lido||'—'):'')+'</span></div>';
    if(!g){h+='<div class="avd-vz">Sem leitura do Google para esta loja.</div>'}
    else{
      h+='<div class="avd-big"><b>'+num(g.nota,1)+'</b><span class="st">★</span><span class="lb">'+num(g.total)+' avaliações no total</span></div>';
      if(g.lido_hoje&&g.novas!=null)h+='<span class="avd-tg'+(g.novas>0?' ok':'')+'">'+(g.novas>0?'+'+num(g.novas)+' nova'+(g.novas===1?'':'s')+' desde a leitura anterior':g.novas<0?'o total caiu '+num(-g.novas)+' desde a leitura anterior (o Google tirou avaliações)':'nenhuma nova desde a leitura anterior')+'</span>';
      else h+='<span class="avd-tg">a leitura deste dia ainda não chegou</span>';
      arr(g.destaques).slice(0,muitos?6:2).forEach(function(d){
        h+='<div class="avd-it"><div class="h">'+esc(d.autor||'')+(d.quando?' · '+esc(d.quando):'')+'</div><div class="tx">'+esc(d.texto||'')+'</div>'+(urlOk(d.foto)?'<img src="'+esc(d.foto)+'" alt="" loading="lazy">':'')+'</div>';
      });
    }
    return h+'<div class="avd-rod">'+(g&&g.perfil?'Perfil: '+esc(g.perfil)+' · ':'')+'o Google mostra só a nota geral e alguns comentários em destaque</div></div>';
  }
  function cAccon(){
    return '<div class="avd-c avd-sem"><div class="avd-ch">🌐 Accon<span class="fonte">site próprio</span></div><div class="avd-big"><b>—</b><span class="lb">ainda sem leitura</span></div><div class="avd-vz">As avaliações do Accon ainda não chegam ao portal. Quando a leitura do Accon for ligada, elas aparecem aqui sozinhas.</div></div>';
  }
  function linha(l,i,hoje,sozinha){
    var foto=urlOk(l.foto)?l.foto:'';
    var h='<div class="avd-loja"><div class="avd-foto">'+(foto?'<img src="'+esc(foto)+'" alt="" loading="lazy">':'<img class="logo" src="'+LOGO+'" alt="">')+'<div class="avd-nm">'+esc(l.unidade)+'<small>'+(foto?'':'foto da fachada ainda não carregada')+'</small></div></div>';
    /* com foco=google (Central Salao) o Google vem primeiro; nas outras telas, o iFood */
    if(OP.foco==='google')h+=cGoogle(l,sozinha)+cIfood(l,i,hoje,sozinha);
    else h+=cIfood(l,i,hoje,sozinha)+cGoogle(l,sozinha);
    return h+cAccon()+'</div>';
  }

  async function fotos(uuid,bt){
    if(!/^[0-9a-f-]{36}$/i.test(uuid||''))return;
    var cx=document.getElementById('__fotos');
    if(!cx){cx=document.createElement('div');cx.id='__fotos';document.body.appendChild(cx)}
    cx.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;overflow:auto;padding:16px;text-align:center';
    /* dentro de outra tela (moldura alta do Salao) o "fixo" fica no topo da moldura, fora da vista: abre perto do botao */
    if(window.top!==window&&bt&&bt.getBoundingClientRect){var y=Math.max(0,bt.getBoundingClientRect().top+window.scrollY-40);cx.style.cssText='position:absolute;left:0;right:0;top:'+y+'px;min-height:70vh;background:rgba(0,0,0,.94);z-index:9999;padding:16px;text-align:center;border-radius:14px'}
    cx.innerHTML='<div style="color:#fff;margin-bottom:10px">Buscando as fotos do pedido…</div>';
    cx.onclick=function(){cx.remove()};
    try{
      var r=await fetch(FUNCOES+'guardar-foto-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'ver',token_portal:tok(),uuid_pedido:uuid})});
      var j=await r.json();
      if(!j.ok||!j.fotos||!j.fotos.length){cx.innerHTML='<div style="color:#fff">Não achei foto guardada deste pedido.<div style="color:#bbb;font-size:12px;margin-top:6px">Toque para fechar.</div></div>';return}
      cx.innerHTML='<div style="color:#fff;margin-bottom:10px">📷 O que o cliente mandou — toque em qualquer lugar para fechar</div>'+j.fotos.map(function(f){return urlOk(f.link)?'<img src="'+esc(f.link)+'" style="max-width:96%;max-height:80vh;margin:8px auto;display:block;border-radius:8px">':''}).join('');
    }catch(e){cx.innerHTML='<div style="color:#fff">Não deu para buscar as fotos. Toque para fechar.</div>'}
  }

  window.AVD={
    montar:function(el,op){
      if(!el)return;
      var trocou=EL!==el; EL=el; OP=op||{};
      pare();
      T=setInterval(function(){if(!vivo()){pare();return}if(!document.hidden)buscar(true)},5*60*1000);
      if(D&&D.quando===QUANDO&&!trocou)desenha();
      else{D=(D&&D.quando===QUANDO)?D:null;if(D)desenha();else el.innerHTML='<div class="avd-top"><h2>⭐ Avaliações do dia</h2><span class="sub">buscando…</span></div>'}
      buscar(false);
    },
    _buscar:function(){buscar(false)},
    _loja:function(i){var L=arr(D&&D.lojas);LOJA=(i>=0&&L[i])?L[i].unidade:'';desenha()},
    _quando:function(q){if(q!=='hoje'&&q!=='ontem'||q===QUANDO)return;QUANDO=q;NOTA={};ABRE={};var s=EL&&EL.querySelector('.avd-top .sub');if(s)s.textContent='buscando…';buscar(false)},
    _nota:function(i,n){NOTA[i]=(NOTA[i]===n?0:n);ABRE[i]=true;desenha()},
    _abre:function(i){ABRE[i]=!ABRE[i];desenha()},
    _fotos:fotos
  };
})();
