const CACHE =
  "alimentos-app-shell-v19";

const MEDIA_CACHE =
  "alimentos-media-v2";

const BASE =
  "/GEPE-controle-alimentos/";

const APP_URL =
  BASE;

const INDEX_URL =
  BASE + "index.html";

const CORE_ASSETS = [
  APP_URL,
  INDEX_URL,
  BASE + "style.css",
  BASE + "app.js",
  BASE + "manifest-v3.json",
  BASE + "icon-192.png",
  BASE + "icon-512.png"
];


// ============================================================
// INSTALAÇÃO
// ============================================================

self.addEventListener(
  "install",
  event => {

    event.waitUntil(
      (async () => {

        const cache =
          await caches.open(
            CACHE
          );


        // index.html é obrigatório
        const response =
          await fetch(
            INDEX_URL,
            {
              cache:
                "reload"
            }
          );


        if (
          !response ||
          !response.ok
        ) {
          throw new Error(
            "Falha ao salvar o aplicativo para uso offline."
          );
        }


        await cache.put(
          INDEX_URL,
          response.clone()
        );


        await cache.put(
          APP_URL,
          response.clone()
        );


        // Demais arquivos
        await Promise.allSettled(
          CORE_ASSETS
            .filter(
              item =>
                item !== INDEX_URL &&
                item !== APP_URL
            )
            .map(
              async item => {

                const asset =
                  await fetch(
                    item,
                    {
                      cache:
                        "reload"
                    }
                  );


                if (
                  asset &&
                  asset.ok
                ) {
                  await cache.put(
                    item,
                    asset.clone()
                  );
                }

              }
            )
        );


        await self.skipWaiting();

      })()
    );

  }
);


// ============================================================
// ATIVAÇÃO
// ============================================================

self.addEventListener(
  "activate",
  event => {

    event.waitUntil(
      (async () => {

        const keys =
          await caches.keys();


        await Promise.all(
          keys
            .filter(
              key =>
                key !== CACHE &&
                key !== MEDIA_CACHE
            )
            .map(
              key =>
                caches.delete(
                  key
                )
            )
        );


        await self.clients.claim();

      })()
    );

  }
);


// ============================================================
// REQUISIÇÕES
// ============================================================

self.addEventListener(
  "fetch",
  event => {

    const request =
      event.request;


    if (
      request.method !== "GET"
    ) {
      return;
    }


    const url =
      new URL(
        request.url
      );


    // --------------------------------------------------------
    // 1. TODA NAVEGAÇÃO DO APP:
    //    sempre abre index.html do cache.
    // --------------------------------------------------------

    if (
      request.mode ===
        "navigate" &&
      url.origin ===
        self.location.origin &&
      url.pathname.startsWith(
        BASE
      )
    ) {

      event.respondWith(
        (async () => {

          const cache =
            await caches.open(
              CACHE
            );


          const shell =
            (
              await cache.match(
                INDEX_URL
              )
            ) ||
            (
              await cache.match(
                APP_URL
              )
            );


          if (shell) {

            // Atualiza silenciosamente se internet existir.
            event.waitUntil(
              fetch(
                INDEX_URL,
                {
                  cache:
                    "no-store"
                }
              )
                .then(
                  async fresh => {

                    if (
                      fresh &&
                      fresh.ok
                    ) {

                      await cache.put(
                        INDEX_URL,
                        fresh.clone()
                      );

                      await cache.put(
                        APP_URL,
                        fresh.clone()
                      );

                    }

                  }
                )
                .catch(
                  () => {}
                )
            );


            return shell;

          }


          // Primeira abertura, ainda sem cache.
          try {

            const fresh =
              await fetch(
                INDEX_URL,
                {
                  cache:
                    "no-store"
                }
              );


            if (
              fresh &&
              fresh.ok
            ) {

              await cache.put(
                INDEX_URL,
                fresh.clone()
              );

              await cache.put(
                APP_URL,
                fresh.clone()
              );


              return fresh;

            }

          } catch {
            // sem internet
          }


          return new Response(
            `
              <!doctype html>
              <html lang="pt-BR">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width,initial-scale=1">
                  <title>Alimentos</title>
                </head>
                <body style="font-family:Arial,sans-serif;text-align:center;padding:40px">
                  <h2>Alimentos</h2>
                  <p>Abra o aplicativo uma vez com internet para preparar o modo offline.</p>
                </body>
              </html>
            `,
            {
              headers: {
                "Content-Type":
                  "text/html; charset=utf-8"
              }
            }
          );

        })()
      );


      return;

    }


    // --------------------------------------------------------
    // 2. SUPABASE STORAGE:
    //    mídia já visualizada pode abrir offline.
    // --------------------------------------------------------

    const isSupabaseStorage =
      (
        url.hostname.includes(
          "supabase.co"
        ) ||
        url.hostname.includes(
          "supabase.in"
        )
      ) &&
      url.pathname.includes(
        "/storage/v1/object/public/"
      );


    if (
      isSupabaseStorage
    ) {

      event.respondWith(
        (async () => {

          const cache =
            await caches.open(
              MEDIA_CACHE
            );


          const cached =
            await cache.match(
              request
            );


          if (cached) {
            return cached;
          }


          try {

            const response =
              await fetch(
                request
              );


            if (
              response &&
              response.ok
            ) {
              await cache.put(
                request,
                response.clone()
              );
            }


            return response;


          } catch {

            return new Response(
              "",
              {
                status:
                  503
              }
            );

          }

        })()
      );


      return;

    }


    // --------------------------------------------------------
    // 3. OUTRAS CHAMADAS SUPABASE:
    //    ficam com a lógica offline do app.js.
    // --------------------------------------------------------

    if (
      url.hostname.includes(
        "supabase.co"
      ) ||
      url.hostname.includes(
        "supabase.in"
      )
    ) {
      return;
    }


    // --------------------------------------------------------
    // 4. ARQUIVOS LOCAIS DO APP:
    //    cache-first.
    // --------------------------------------------------------

    if (
      url.origin ===
        self.location.origin &&
      url.pathname.startsWith(
        BASE
      )
    ) {

      event.respondWith(
        (async () => {

          const cache =
            await caches.open(
              CACHE
            );


          const cached =
            await cache.match(
              request,
              {
                ignoreSearch:
                  true
              }
            );


          if (cached) {
            return cached;
          }


          try {

            const response =
              await fetch(
                request
              );


            if (
              response &&
              response.ok
            ) {
              await cache.put(
                request,
                response.clone()
              );
            }


            return response;


          } catch {

            return new Response(
              "",
              {
                status:
                  503
              }
            );

          }

        })()
      );


      return;

    }


    // Links externos continuam online.
    event.respondWith(
      fetch(
        request
      )
    );

  }
);
