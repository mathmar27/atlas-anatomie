// Atlas 3D — cache hors ligne : page et données en « réseau d'abord », modèles et scripts en « cache puis mise à jour »
const C='atlas-v4';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url),own=u.origin===location.origin,cdn=u.hostname==='cdn.jsdelivr.net';if(!own&&!cdn)return;
  const nf=own&&(r.mode==='navigate'||/\.(html|json|webmanifest)$/.test(u.pathname)||u.pathname.endsWith('/'));
  e.respondWith(caches.open(C).then(async c=>{
    if(nf){try{const n=await fetch(r);if(n.ok)c.put(r,n.clone());return n}catch(x){return (await c.match(r,{ignoreSearch:true}))||Response.error()}}
    const hit=await c.match(r),net=fetch(r).then(n=>{if(n.ok)c.put(r,n.clone());return n}).catch(()=>null);
    return hit||(await net)||Response.error()}))});
