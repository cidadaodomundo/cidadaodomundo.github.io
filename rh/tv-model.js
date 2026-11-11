(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CDMTv=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SECTIONS=['rh','movimento','ponto','erros'],DURATION=30000;
function count(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isInteger(v)?v:null}
function list(v){return Array.isArray(v)?v:[]}
function page(items,index,size){items=list(items);const pages=Math.max(1,Math.ceil(items.length/size));const current=((index%pages)+pages)%pages;return{items:items.slice(current*size,(current+1)*size),index:current,pages:pages,next:(current+1)%pages}}
function dateMs(value){if(typeof value!=='string'||!value)return NaN;let s=value.replace(' ','T');if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s))s+='-03:00';return Date.parse(s)}
function freshness(value,maxAge,now){const t=dateMs(value);if(!Number.isFinite(t))return'missing';if(t>now+60000)return'unknown';return now-t>maxAge?'stale':'ok'}
function dayAt(value,offsetHours){const t=typeof value==='number'?value:dateMs(value);if(!Number.isFinite(t))return'';return new Date(t-(3+(offsetHours||0))*3600000).toISOString().slice(0,10)}
function source(value,maxAge,now,day,offset){const f=freshness(value,maxAge,now);if(f!=='ok')return f;return day&&day!==dayAt(now,offset)?'stale':'ok'}
function validate(d){if(!d||typeof d!=='object'||Array.isArray(d)||!d.rh||!Array.isArray(d.rh.itens)||!d.erros||!Array.isArray(d.erros.itens))throw Error('Resposta incompleta');return d}
function initials(name){const parts=String(name||'Sem identificação').trim().split(/\s+/);return parts.length>2?parts[0]+' '+parts[parts.length-1]:parts.join(' ')}
function status(p){return p.no_intervalo===true?'No intervalo':p.dentro===true?'Na loja':count(p.batidas)>0?'Já saiu':'Sem leitura'}
function accept(state,event,now){if(event.kind==='unauthorized')return{data:null,lastGood:null,error:'Código da TV recusado'};if(event.kind==='error')return Object.assign({},state,{error:event.message||'Não foi possível atualizar'});return{data:validate(event.data),lastGood:now,error:''}}
return{SECTIONS:SECTIONS,DURATION:DURATION,count:count,list:list,page:page,dateMs:dateMs,freshness:freshness,source:source,dayAt:dayAt,validate:validate,initials:initials,status:status,accept:accept};
});

