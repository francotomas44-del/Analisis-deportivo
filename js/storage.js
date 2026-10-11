/* storage.js — persistencia con IndexedDB + respaldo en localStorage
   Namespace global: window.AD.storage
   IndexedDB permite guardar historial grande (localStorage ~5 MB es insuficiente). */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var DB_NAME = "analisisDeportivo";
  var STORE = "kv";
  var RKEY = "state";
  var LS_KEY = "analisisDeportivo:v1";
  var LS_BACKUP_LIMIT = 2000000; // 2 MB: solo espejamos si entra en localStorage

  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      if (!window.indexedDB) { resolve(null); return; }
      var req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
    return dbPromise;
  }

  function idbGet(db) {
    return new Promise(function (resolve) {
      try {
        var sq = db.transaction(STORE, "readonly").objectStore(STORE).get(RKEY);
        sq.onsuccess = function () { resolve(sq.result || null); };
        sq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  function idbPut(db, value) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, RKEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
        tx.onabort = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  function idbClear(db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  function lsGet() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function lsPut(state) {
    try {
      var s = JSON.stringify(state);
      if (s.length < LS_BACKUP_LIMIT) localStorage.setItem(LS_KEY, s);
      else localStorage.removeItem(LS_KEY); // demasiado grande: no espejar
    } catch (e) { /* ignora cuota */ }
  }

  /* Carga el estado persistido (IndexedDB primero, luego localStorage). */
  function load() {
    return openDB().then(function (db) {
      if (!db) return lsGet();
      return idbGet(db).then(function (val) {
        if (val) return val;
        var ls = lsGet();
        if (ls) return idbPut(db, ls).then(function () { return ls; });
        return null;
      });
    });
  }

  /* Guarda el estado completo. Devuelve una promesa. */
  function save(state) {
    return openDB().then(function (db) {
      lsPut(state); // respaldo (si entra)
      if (!db) return false;
      return idbPut(db, state);
    });
  }

  function clear() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    return openDB().then(function (db) {
      return db ? idbClear(db) : true;
    });
  }

  window.AD.storage = {
    load: load,
    save: save,
    clear: clear,
    available: function () { return !!window.indexedDB; }
  };
})();
