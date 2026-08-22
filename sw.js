const CACHE = "controle-alimentos-offline-v16";
const MEDIA_CACHE = "controle-alimentos-media-v1";

const SCOPE_URL =
  self.registration.scope;

const INDEX_URL =
  new URL(
    "index.html",
    SCOPE_URL
  ).href;

const ROOT_URL =
  SCOPE_URL;

const ASSETS = [
  ROOT_URL,
  INDEX_URL,
  new URL("style.css", SCOPE_URL).href,
  new URL("app.js", SCOPE_URL).href,
  new URL("manifest-v3.json", SCOPE_URL).href,
  new URL("icon-192.png", SCOPE_URL).href,
  new URL("icon-512.png", SCOPE_URL).href
];


self.addEventListener(
  "install",
  event => {

    event.waitUntil(
      (async () => {

        const cache =
          await caches.open(
            CACHE
          );


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
            "Não foi possível armazenar index.html para uso offline."
          );
        }


        await cache.put(
          INDEX_URL,
          indexResponse.clone()
        );

        await cache.put(
          ROOT_URL,
          indexResponse.clone()
        );


        await Promise.allSettled(
          ASSETS
            .filter(
              url =>
                url !== INDEX_URL &&
                url !== ROOT_URL
            )
            .map(
              async url => {

                const response =
                  await fetch(
                    url,
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
                    url,
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
    // SUPABASE STORAGE PÚBLICO
    //
    // Imagens/vídeos enviados pelo aparelho e já visualizados
    // ficam disponíveis offline.
    // ========================================================

    const isSupabaseStoragePublic =
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
      isSupabaseStoragePublic
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
                  503,
                statusText:
                  "Offline"
              }
            );

          }

        })()
      );

      return;

    }


    // ========================================================
    // SUPABASE REST/AUTH/API
    // Não tenta cachear chamadas de banco/autenticação.
    // O app.js usa snapshots locais quando offline.
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
    // NAVEGAÇÃO DO PWA
    //
    // IMPORTANTE:
    // Ao tocar no ícone G Alimentos instalado, sempre entrega
    // o index.html salvo no cache. Assim o PWA abre a tela real
    // do aplicativo mesmo totalmente sem internet.
    // ========================================================

    if (
      request.mode ===
      "navigate"
    ) {

      event.respondWith(
        (async () => {

          const cache =
            await caches.open(
              CACHE
            );


          let cachedIndex =
            await cache.match(
              INDEX_URL,
              {
                ignoreSearch:
                  true
              }
            );


          if (
            !cachedIndex
          ) {

            cachedIndex =
              await cache.match(
                ROOT_URL,
                {
                  ignoreSearch:
                    true
                }
              );

          }


          // Se já temos o shell do aplicativo, abre ele primeiro.
          // Quando houver internet, atualiza o cache em segundo plano.
          if (
            cachedIndex
          ) {

            if (
              self.navigator?.onLine !==
              false
            ) {

              event.waitUntil(
                fetch(
                  INDEX_URL,
                  {
                    cache:
                      "no-store"
                  }
                )
                  .then(
                    async response => {

                      if (
                        response &&
                        response.ok
                      ) {

                        await cache.put(
                          INDEX_URL,
                          response.clone()
                        );

                        await cache.put(
                          ROOT_URL,
                          response.clone()
                        );

                      }

                    }
                  )
                  .catch(
                    () => {}
                  )
              );

            }


            return cachedIndex;

          }


          // Primeira execução, caso o cache ainda não exista.
          try {

            const response =
              await fetch(
                INDEX_URL,
                {
                  cache:
                    "no-store"
                }
              );


            if (
              response &&
              response.ok
            ) {

              await cache.put(
                INDEX_URL,
                response.clone()
              );

              await cache.put(
                ROOT_URL,
                response.clone()
              );


              return response;

            }

          } catch {
            // Sem internet e ainda sem cache.
          }


          // Só aparece se o aparelho nunca conseguiu preparar o app.
          return new Response(
            `
              <!doctype html>
              <html lang="pt-BR">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width,initial-scale=1">
                  <title>ACE - Preparando modo offline</title>
                </head>
                <body style="font-family:Arial,sans-serif;padding:30px;text-align:center">
                  <h2>ACE Controle de Alimentos</h2>
                  <p>Este aparelho ainda não possui os arquivos do aplicativo salvos.</p>
                  <p>Conecte-se à internet uma vez, abra o aplicativo e aguarde alguns segundos.</p>
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
    // ARQUIVOS DO PRÓPRIO APP
    // ========================================================

    if (
      url.origin ===
      self.location.origin &&
      url.href.startsWith(
        SCOPE_URL
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
              request
            );


          if (
            cached
          ) {
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
                  503,
                statusText:
                  "Offline"
              }
            );

          }

        })()
      );

      return;

    }


    // ========================================================
    // LINKS EXTERNOS (YouTube, etc.)
    // Online somente, conforme combinado.
    // ========================================================

    event.respondWith(
      fetch(
        request
      )
    );

  }
);
