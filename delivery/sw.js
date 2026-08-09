const CACHE='cdm-delivery-v2';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const ks=await caches.keys();
  await Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  // HTML e dados: sempre rede primeiro (nunca serve HTML velho)
  e.respondWith(fetch(e.request).then(r=>{
    try{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}catch(_){}
    return r;
  }).catch(()=>caches.match(e.request)));
});
