/* sw.js — service worker de Futbolityx (PWA)
   Cachea el "shell" de la app para que abra rápido y funcione sin conexión.
   Los archivos de datos (data/) son inmutables: se cachean de forma agresiva. */

var CACHE = "futbolityx-v38";
var CORE = [
  "./",
  "index.html",
  "css/styles.css",
  "css/v2.css",
  "img/logo.png",
  "img/icon-192.png",
  "img/icon-512.png",
  "manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  // El manifiesto cambia cuando se agregan datos: red primero, cache de respaldo.
  if (url.pathname.indexOf("/data/manifest.json") !== -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.open(CACHE).then(function (c) { return c.match(req); });
      })
    );
    return;
  }

  // Datos: cache primero (inmutables), luego red.
  if (url.pathname.indexOf("/data/") !== -1) {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && res.ok) c.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // Shell (html/css/js/img): sirve cache y actualiza en segundo plano.
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      });
    })
  );
});
