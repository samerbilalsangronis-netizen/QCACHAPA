const CACHE = 'qcachapa-shell-12';
const lunchCovers = ['lomo','pollo','pabellon','pescado'].map(dish => '/portada/'+dish+'.webp');
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch('/', {cache:'reload'});
    const html = await response.clone().text();
    const assets = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g), match => match[1]);
    await cache.put('/', response);
    await cache.addAll([...assets,...lunchCovers,'/logo-qcachapas.webp',...['lomo','pollo','pabellon','pescado','queso','chicharron','mechada'].map(dish => '/plato-'+dish+'.webp'),...['pabellon','pollo','asado','pescado'].map(dish => '/almuerzo-'+dish+'.webp'),'/cachapa.webp','/cachapa-portada.webp','/cachapa-portada-movil.webp','/manifest.webmanifest','/icon-192.png','/icon-512.png']);
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('qcachapa-shell-') && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const localAsset = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/menu/') || lunchCovers.includes(url.pathname);
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/')) ?? Response.error()));
  } else if (localAsset || /\/(logo-qcachapas\.webp|(?:almuerzo|plato)-[a-z]+\.webp|cachapa(?:-portada(?:-movil)?)?\.webp|manifest.webmanifest|icon-\d+.png)$/.test(url.pathname)) {
    event.respondWith((async () => {
      if (!localAsset) {
        try { return await fetch(request); } catch { return (await caches.match(request.url,{ignoreVary:true})) ?? Response.error(); }
      }
      const existing = await caches.match(request.url,{ignoreVary:true});
      if (existing) return existing;
      const response = await fetch(request);
      if (response.ok) await (await caches.open(CACHE)).put(request,response.clone());
      return response;
    })());
  }
});
