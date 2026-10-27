const CACHE_NAME = "ina-reporta-v15";
const APP_FILES = [
  "./",
  "./index.html",
  "./teacher.html",
  "./styles.css",
  "./teacher.css",
  "./app.js?v=6",
  "./teacher.js?v=2",
  "./cloud-config.js",
  "./cloud-client.js",
  "./manifest.json",
  "./icons/ina-192.svg",
  "./icons/ina-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)),
      self.skipWaiting(),
    ]),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request);
    }),
  );
});
