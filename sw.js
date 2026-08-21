const CACHE = "controle-alimentos-offline-v9";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest-v3.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // API/Supabase não entra no cache de arquivos estáticos.
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in")
  ) {
    return;
  }

  // Navegação: ONLINE pega a versão nova.
  // OFFLINE cai no index.html salvo.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => {
          const copy = response.clone();

          caches.open(CACHE)
            .then(cache =>
              cache.put("./index.html", copy)
            );

          return response;
        })
        .catch(() =>
          caches.match("./index.html")
        )
    );
    return;
  }

  // Arquivos principais do app:
  // NETWORK-FIRST para não ficar preso em app.js antigo.
  const isCoreAsset =
    url.origin === self.location.origin &&
    (
      url.pathname.endsWith("/app.js") ||
      url.pathname.endsWith("/style.css") ||
      url.pathname.endsWith("/manifest-v3.json") ||
      url.pathname.endsWith("/sw.js")
    );

  if (isCoreAsset) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => {
          const copy = response.clone();

          caches.open(CACHE)
            .then(cache =>
              cache.put(request, copy)
            );

          return response;
        })
        .catch(() =>
          caches.match(request)
        )
    );
    return;
  }

  // Outros arquivos estáticos: cache-first.
  event.respondWith(
    caches
      .match(request)
      .then(cached => {
        if (cached) {
          return cached;
        }

        return fetch(request)
          .then(response => {
            if (
              response &&
              response.status === 200 &&
              response.type === "basic"
            ) {
              const copy = response.clone();

              caches.open(CACHE)
                .then(cache =>
                  cache.put(request, copy)
                );
            }

            return response;
          });
      })
  );
});
