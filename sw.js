const CACHE = "controle-alimentos-offline-v18";
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

        // O shell do app é obrigatório.
        const indexResponse =
          await fetch(
            INDEX_URL,
            {
              cache: "reload"
            }
          );

        if (
          !indexResponse ||
          !indexResponse.ok
        ) {
          throw new Error(
            "Falha ao preparar index.html para uso offline."
          );
        }

        await cache.put(
          INDEX_URL,
          indexResponse.clone()
        );

        // Salva também a raiz do escopo apontando para o mesmo shell.
        await cache.put(
          ROOT_URL,
          indexResponse.clone()
        );

        // Demais arquivos são cacheados individualmente.
        const optionalAssets =
          ASSETS.filter(
            url =>
              url !== INDEX_URL &&
              url !== ROOT_URL
          );

        await Promise.allSettled(
          optionalAssets.map(
            async url => {

              const response =
                await fetch(
                  url,
                  {
                    cache: "reload"
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
    // NAVEGAÇÃO DO PWA / ÍCONE INSTALADO
    //
    // O ícone "Alimentos" abre ./index.html. Para qualquer
    // navegação dentro do escopo, o Service Worker entrega
    // imediatamente o App Shell cacheado, inclusive sem rede.
    // ========================================================

    if (
      request.mode === "navigate" &&
      url.origin === self.location.origin &&
      url.href.startsWith(SCOPE_URL)
    ) {

      event.respondWith(
        (async () => {

          const cache =
            await caches.open(
              CACHE
            );

          let shell =
            await cache.match(
              INDEX_URL,
              {
                ignoreSearch: true
              }
            );

          if (!shell) {
            shell =
              await cache.match(
                ROOT_URL,
                {
                  ignoreSearch: true
                }
              );
          }

          if (shell) {

            // Atualiza silenciosamente quando houver rede.
            event.waitUntil(
              fetch(
                INDEX_URL,
                {
                  cache: "no-store"
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

            return shell;
          }

          // Só ocorre se o PWA ainda não tiver preparado o cache.
          try {

            const response =
              await fetch(
                INDEX_URL,
                {
                  cache: "no-store"
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
            // Sem rede e sem shell ainda.
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
                <body style="font-family:Arial,sans-serif;padding:30px;text-align:center">
                  <h2>Alimentos</h2>
                  <p>Abra o aplicativo uma vez com internet para concluir o modo offline.</p>
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
