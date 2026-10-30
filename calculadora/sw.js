/* Service worker: guarda la app en la tableta para que funcione sin conexión. */
const CACHE = "calculadora@8db850a2d4";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
const APPS = [];
const OPTS = {ignoreSearch: true, ignoreVary: true};
const BASE = new URL('./', self.location).href;
async function clean(res) {
  /* Safari no acepta respuestas redirigidas al abrir la app: se guarda una copia limpia. */
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
        if (res.ok) await c.put(new URL(f, BASE).href, await clean(res));
      } catch (err) { /* se reintenta en la próxima apertura con internet */ }
    }));
    const page = (await c.match(new URL('./index.html', BASE).href, OPTS)) || (await c.match(BASE, OPTS));
    if (!page) throw new Error('No se pudo guardar la página');
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    const pre = CACHE.split('@')[0];
    await Promise.all(ks.filter(k => k !== CACHE && (k.split('@')[0] === pre || (k.indexOf('@') < 0 && k.indexOf(pre + '-') === 0))).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
/* Busca la página de la app aunque el iPad la pida con otra forma (sin barra final, con index.html, mayúsculas…). */
async function findPage(c, url) {
  const u = new URL(url);
  let path = u.pathname.toLowerCase();
  if (path.endsWith('/index.html')) path = path.slice(0, -10);
  if (!path.endsWith('/')) path += '/';
  const tries = [];
  const base = new URL(BASE).pathname.toLowerCase();
  const rest = path.startsWith(base) ? path.slice(base.length) : '';
  const seg = rest.split('/')[0];
  if (APPS.length && seg && APPS.indexOf(seg) >= 0) tries.push(base + seg + '/');
  tries.push(path, base);
  const keys = await c.keys();
  for (const t of tries) {
    for (const k of keys) {
      const kp = new URL(k.url).pathname.toLowerCase();
      if (kp === t || kp === t + 'index.html') {
        const r = await c.match(k, OPTS);
        if (r) return r;
      }
    }
  }
  return null;
}
async function diag(c, req) {
  let keys = [];
  try { keys = (await c.keys()).map(k => new URL(k.url).pathname); } catch (e) { keys = ['(no se pudieron leer)']; }
  const all = await caches.keys().catch(() => []);
  const esc = s => String(s).replace(/[&<>]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[ch]));
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title></head>' +
    '<body style="margin:0;padding:24px 18px;background:#E2E5E1;color:#1A1F21;font:17px/1.5 system-ui,-apple-system,sans-serif">' +
    '<h1 style="font-size:24px;line-height:1.2;margin:0 0 10px">La app no encontró su copia guardada</h1>' +
    '<p style="margin:0 0 14px;max-width:60ch">Haz una captura de esta pantalla y envíasela a Claude. Después vuelve a abrir la app con internet.</p>' +
    '<pre style="white-space:pre-wrap;word-break:break-all;font-size:13px;background:#fff;border-radius:10px;padding:12px;margin:0">' +
    esc('Pedida: ' + req.url + '\nModo: ' + req.mode + '\nControla: ' + BASE + '\nVersión: ' + CACHE + '\nCachés: ' + all.join(', ') + '\nGuardado:\n  ' + keys.join('\n  ')) +
    '</pre></body></html>';
  return new Response(html, {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}});
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  const nav = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0;
  const work = (async () => {
    const c = await caches.open(CACHE);
    let hit = await c.match(req, OPTS);
    if (!hit && nav) hit = await findPage(c, req.url);
    const update = fetch(req).then(async res => {
      if (res && res.ok && res.type === 'basic') { const copy = await clean(res.clone()); await c.put(req, copy); }
      return res;
    }).catch(() => null);
    if (hit) return {res: hit, update};
    const res = await update;
    if (res) return {res, update: Promise.resolve()};
    return {res: nav ? await diag(c, req) : Response.error(), update: Promise.resolve()};
  })();
  e.respondWith(work.then(w => w.res));
  e.waitUntil(work.then(w => w.update).catch(() => {}));
});
