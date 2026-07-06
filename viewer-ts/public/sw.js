// kdhelp service worker — best-effort offline support (runtime caching).
// Registered only in the built app when config.pwa is true.
const CACHE = "kdhelp-v1";

// Don't auto-activate: a fresh install with no controller activates immediately,
// but an *update* (a controller already runs) parks in "waiting" so the app can
// prompt the user. On their nod the app posts `skip-waiting` and we take over.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "skip-waiting") self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Navigations (the app shell) are network-first: a new deploy's index.html
  // references freshly-hashed bundles, so it must win the moment it's reachable —
  // otherwise the "update ready" prompt would activate a new worker that still
  // serves the old shell. Hashed assets & docsets are immutable → cache-first.
  const navigation =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      if (navigation) {
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return (
            (await cache.match(req)) ||
            (await cache.match("index.html")) ||
            Response.error()
          );
        }
      }
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const fallback = await cache.match(req);
        if (fallback) return fallback;
        throw err;
      }
    }),
  );
});
