const CACHE_NAME = "timo-v250";
const APP_FILES = [
  "./",
  "./index.html",
  "./variables.css?v=250",
  "./theme.css?v=250",
  "./styles.css?v=250",
  "./app.js?v=250",
  "./logo.svg",
  "./icon%202.svg",
  "./goorm sans 2/Web/TTF/goorm-sans-regular.woff2",
  "./goorm sans 2/Web/TTF/goorm-sans-medium.woff2",
  "./goorm sans 2/Web/TTF/goorm-sans-bold.woff2",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
