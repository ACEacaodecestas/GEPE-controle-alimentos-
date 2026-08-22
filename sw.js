const CACHE =
  "alimentos-app-shell-v20";

const MEDIA_CACHE =
  "alimentos-media-v2";

const BASE =
  "/GEPE-controle-alimentos-/";

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


        // Salva obrigatoriamente o index.html.
        const indexResponse =
          await fetch(
            INDEX_URL,
            {
              cache:
                "reload"
            }
          );


        if (
          !indexResponse ||
          !indexResponse.ok
        ) {

          throw new Error(
            "Não foi possível salvar o aplicativo para uso offline."
          );

        }


        await cache.put(
          INDEX_URL,
          indexResponse.clone()
        );


        // A raiz do aplicativo usa o mesmo App Shell.
        await cache.put(
          APP_URL,
          indexResponse.clone()
        );


        // Salva os demais arquivos.
        await Promise.allSettled(
          CORE_ASSETS
            .filter(
              asset =>
                asset !== INDEX_URL &&
                asset !== APP_URL
            )
            .map(
              async asset => {

                const response =
                  await fetch(
                    asset,
                    {
                      cache:
                        "reload"
                    }
                  );


                if (
                  response &&
                  response.ok
                ) {

                  await cache.put(
                    asset,
                    response.clone()
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
// FETCH
// ============================================================

self.addEventListener(
  "fetch",
  event => {

    const request =
      event.request;


    if (
      request.method !==
      "GET"
    ) {
      return;
    }


    const url =
      new URL(
        request.url
      );


    // ========================================================
    // 1. ABERTURA PELO ÍCONE INSTALADO
    //
    // Qualquer navegação dentro do caminho REAL do app
    // recebe index.html do cache, mesmo sem internet.
    // ========================================================

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
                INDEX_URL,
                {
                  ignoreSearch:
                    true
                }
              )
            ) ||
            (
              await cache.match(
                APP_URL,
                {
                  ignoreSearch:
                    true
                }
              )
            );


          if (shell) {

            // Atualiza o HTML em segundo plano quando houver rede.
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


          // Somente se este aparelho ainda não tiver o cache.
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
            // Sem internet.
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
                <body style="
                  font-family:Arial,sans-serif;
                  padding:40px;
                  text-align:center;
                ">
                  <h2>Alimentos</h2>
                  <p>
                    Abra o aplicativo uma vez com internet
                    para concluir a preparação offline.
                  </p>
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


    // ========================================================
    // 2. SUPABASE STORAGE
    // ========================================================

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


    // ========================================================
    // 3. OUTRAS CHAMADAS DO SUPABASE
    // ========================================================

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


    // ========================================================
    // 4. ARQUIVOS LOCAIS DO APP
    // ========================================================

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


    // Links externos continuam dependentes da internet.
    event.respondWith(
      fetch(
        request
      )
    );

  }
);
