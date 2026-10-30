/* Service worker: guarda la app en la tableta para que funcione sin conexión. */
const CACHE = "presupuestos-468f785579";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
const OPTS = {ignoreSearch: true, ignoreVary: true};
async function clean(res) {
  /* Safari no acepta respuestas redirigidas para abrir la app: se guarda una copia limpia. */
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, {status: res.status, statusText: res.statusText, headers: res.headers});
}
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(FILES.map(async f => {
      try {
        const res = await fetch(new Request(f, {cache: 'reload'}));
        if (res.ok) await c.put(f, await clean(res));
      } catch (err) { /* se reintenta en la próxima apertura */ }
    }));
    const page = (await c.match('./index.html', OPTS)) || (await c.match('./', OPTS));
    if (!page) throw new Error('No se pudo guardar la página');
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  const work = (async () => {
    const c = await caches.open(CACHE);
    let hit = await c.match(req, OPTS);
    if (!hit && req.mode === 'navigate') hit = (await c.match('./index.html', OPTS)) || (await c.match('./', OPTS));
    const update = fetch(req).then(async res => {
      if (res && res.ok && res.type === 'basic') { const copy = await clean(res.clone()); await c.put(req, copy); }
      return res;
    }).catch(() => null);
    if (hit) return {res: hit, update};
    const res = await update;
    return {res: res || Response.error(), update: Promise.resolve()};
  })();
  e.respondWith(work.then(w => w.res));
  e.waitUntil(work.then(w => w.update).catch(() => {}));
});
