// ============================================================
// ACE - SERVICE WORKER
// ATUALIZAÇÃO ONLINE + FUNCIONAMENTO OFFLINE
// ============================================================

const ACE_CACHE_VERSION =
  "controle-alimentos-inventario-assinado-20260908-v2";

const ACE_APP_BASE =
  "/GEPE-controle-alimentos-/";

const ACE_CORE_FILES = [
  ACE_APP_BASE,
  `${ACE_APP_BASE}index.html`,
  `${ACE_APP_BASE}style.css`,
  `${ACE_APP_BASE}app.js`,
  `${ACE_APP_BASE}manifest-v3.json`,
  `${ACE_APP_BASE}icon-192.png`,
  `${ACE_APP_BASE}icon-512.png`
];


self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(ACE_CACHE_VERSION)
      .then(cache =>
        Promise.all(
          ACE_CORE_FILES.map(url =>
            cache.add(
              new Request(url, { cache: "reload" })
            ).catch(error => {
              console.warn(
                "ACE - arquivo não armazenado no cache:",
                url,
                error
              );
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});


self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(names =>
        Promise.all(
          names
            .filter(name => name !== ACE_CACHE_VERSION)
            .map(name => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});


async function aceNetworkFirst(request) {
  const cache = await caches.open(ACE_CACHE_VERSION);

  try {
    const response = await fetch(
      new Request(request, { cache: "no-store" })
    );

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}


self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Supabase, vídeos e outros serviços externos continuam sob
  // responsabilidade da rede e não recebem respostas antigas do cache.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      aceNetworkFirst(request).catch(async () =>
        (await caches.match(`${ACE_APP_BASE}index.html`)) ||
        (await caches.match(ACE_APP_BASE)) ||
        Response.error()
      )
    );
    return;
  }

  // Quando existe internet, busca app.js, CSS e imagens atualizados.
  // Sem internet, usa automaticamente a última versão armazenada.
  event.respondWith(aceNetworkFirst(request));
});


self.addEventListener("message", event => {
  if (event.data?.type === "ACE_SKIP_WAITING") {
    self.skipWaiting();
  }
});
