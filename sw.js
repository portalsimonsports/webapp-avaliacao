const CACHE = "webapp-avaliacao-v4";
const CORE = ["./","./index.html","./manifest.webmanifest","./icon-192.svg","./icon-512.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;

  // HTML/JS/config sempre buscam a versão mais nova; demais arquivos podem cair no cache.
  const noStore = /(?:index\.html|app\.js|config\.js|sw\.js)$/.test(url.pathname) || url.pathname.endsWith('/webapp-avaliacao/');

  if(noStore){
    event.respondWith(fetch(event.request, {cache:"no-store"}).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
