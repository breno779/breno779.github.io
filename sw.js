// Service worker da watchlist UCM — deixa o app abrir sem internet depois da primeira vez.
//
// Estratégia:
// - Pedido de recarregar com "?nocache=" (o botão 🔄 do app) nunca passa por aqui, vai
//   direto na rede — respeita a intenção de forçar a versão mais nova.
// - Abrir o app (navegação): tenta rede primeiro (pega atualização na hora se tiver
//   internet) e só cai pro cache se estiver offline.
// - Outros arquivos (manifest, ícones, fontes): serve do cache na hora (rápido) e atualiza
//   o cache em segundo plano pra próxima vez (stale-while-revalidate).
//
// Bump o CACHE_NAME sempre que fizer uma mudança que valha a pena forçar todo mundo a
// buscar de novo (ele mesmo já limpa o cache antigo quando o nome muda).
const CACHE_NAME = 'ucm-watchlist-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.searchParams.has('nocache')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone())).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone())).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
