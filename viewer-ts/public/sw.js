// kdhelp service worker — best-effort offline support (runtime caching).
// Registered only in the built app when config.pwa is true.
const CACHE = "kdhelp-v2";

// Don't auto-activate: a fresh install with no controller activates immediately,
// but an *update* (a controller already runs) parks in "waiting" so the app can
// prompt the user. On their nod the app posts `skip-waiting` and we take over.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "skip-waiting") self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Old cache generations (e.g. kdhelp-v1, which held config.json
      // cache-first and could pin a stale locked/unlocked state) are dropped.
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
          ),
        ),
    ]),
  ),
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;
  // Page-level streaming (`Range:` reads of a .khb/.khba) goes straight to the
  // network: the Cache API can't store partial (206) responses, and `cache.match`
  // ignores the Range header — a whole-file copy cached earlier would answer a
  // 4 KB page read with the full 200 body. Streamed books are online-only.
  if (req.headers.has("range")) return;

  // Navigations (the app shell) are network-first: a new deploy's index.html
  // references freshly-hashed bundles, so it must win the moment it's reachable —
  // otherwise the "update ready" prompt would activate a new worker that still
  // serves the old shell. The manifests (config.json + docsets.json) are
  // mutable per-deploy state — also network-first, cached under their bare
  // pathname so the app's cache-busting query still finds the offline
  // fallback. Hashed assets & docsets are immutable → cache-first.
  const navigation =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");
  const url = new URL(req.url);
  const manifest = /\/(?:config|docsets)\.json$/.test(url.pathname);

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      if (navigation || manifest) {
        const key = manifest ? url.pathname : req;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(key, res.clone());
          return res;
        } catch {
          const fallback = await cache.match(key);
          if (fallback) return fallback;
          return navigation
            ? (await cache.match("index.html")) || Response.error()
            : Response.error();
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
