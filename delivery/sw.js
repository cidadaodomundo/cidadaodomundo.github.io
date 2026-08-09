const CACHE='cdm-delivery-v1';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(
    fetch(e.request).then(r=>{
      try{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}catch(_){}
      return r;
    }).catch(()=>caches.match(e.request))
  );
});
