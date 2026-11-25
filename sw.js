/* AMIR Dastyar — service worker (v3.42)
   Caches the app shell (the page itself, the manifest and the icons) so the
   installed app opens instantly, like a native app, and still opens when
   the phone is offline. Since v3.41 page loads are stale-while-revalidate:
   the cached shell is served the moment the app is tapped, and the fresh
   copy is fetched in the background and kept for the next open, so opening
   never waits on the network. Two kinds of request always go straight to
   the network and are never stored, exactly as the site's update system
   expects: the version-check probes (?__v=) and the update button's
   cache-busting reload (?__upd=). Live data inside the page (weather,
   rates, news) keeps coming from the network whenever there is a
   connection; only the shell is served from the cache. v3.42: the cache
   name moves with the site version, so installing this worker deletes the
   previous shell outright — one less way for an old build to linger and
   re-ask for an update it already has. */
var CACHE = "amir-dastyar-shell-v3.42";
var SHELL = [
  "./",
  "./index.html",
  "./assets/manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/logo-orb.webp"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  /* Version-check probes carry a one-off ?__v= stamp and must reach the
     server untouched (and never be stored — each one is a full page copy
     under a unique URL). Let the browser handle them directly. */
  if (req.url.indexOf("__v=") !== -1) return;
  if (req.mode === "navigate") {
    /* The update button's reload carries ?__upd=: it must bring the fresh
       page, not the cached shell — network first, cache only as a fallback,
       and the fresh copy replaces the cached shell. */
    if (req.url.indexOf("__upd=") !== -1) {
      e.respondWith(
        fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
          return res;
        }).catch(function () {
          return caches.match("./index.html").then(function (hit) {
            return hit || caches.match("./");
          });
        })
      );
      return;
    }
    /* Every other open: stale-while-revalidate — the cached shell answers
       at once (instant, native-feeling open, offline included) while a
       fresh copy is fetched in the background for the next open. */
    e.respondWith(
      caches.match("./index.html").then(function (hit) {
        var fresh = fetch(req).then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put("./index.html", copy); });
          }
          return res;
        }).catch(function () {
          return hit || caches.match("./");
        });
        return hit || fresh;
      })
    );
    return;
  }
  /* Everything else: cache first, then network (and remember fresh copies). */
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && req.url.indexOf(self.location.origin) === 0) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
