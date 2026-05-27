const CACHE_NAME = 'uniconvert-v1';
const ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './css/variables.css',
    './js/script.js',
    './js/app.js',
    './js/utils.js',
    './js/converters/image.js',
    './js/converters/office.js',
    './js/converters/video.js'
];

let coepCredentialless = false;

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (ev) => {
    if (!ev.data) {
        return;
    }
    if (ev.data.type === "deregister") {
        self.registration.unregister().then(() => {
            return self.clients.matchAll();
        }).then(clients => {
            clients.forEach(client => client.navigate(client.url));
        });
    } else if (ev.data.type === "coepCredentialless") {
        coepCredentialless = ev.data.value;
    }
});

self.addEventListener('fetch', function (event) {
    const r = event.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
        return;
    }

    const request = (coepCredentialless && r.mode === "no-cors")
        ? new Request(r, { credentials: "omit" })
        : r;

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            // Fetch from network if not in cache
            const networkResponse = fetch(request).then((response) => {
                if (response.status === 0) {
                    return response;
                }

                const newHeaders = new Headers(response.headers);
                newHeaders.set("Cross-Origin-Embedder-Policy",
                    coepCredentialless ? "credentialless" : "require-corp"
                );
                if (!coepCredentialless) {
                    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                }
                newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: newHeaders,
                });
            });

            if (cachedResponse) {
                // For cached responses, also inject the required headers
                const newHeaders = new Headers(cachedResponse.headers);
                newHeaders.set("Cross-Origin-Embedder-Policy",
                    coepCredentialless ? "credentialless" : "require-corp"
                );
                if (!coepCredentialless) {
                    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                }
                newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                return new Response(cachedResponse.body, {
                    status: cachedResponse.status,
                    statusText: cachedResponse.statusText,
                    headers: newHeaders,
                });
            }

            return networkResponse;
        }).catch((e) => {
            console.error("SW Fetch Error:", e);
        })
    );
});
