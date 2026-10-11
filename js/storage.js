/* storage.js — persistencia robusta (IndexedDB + localStorage) y respaldo
   Namespace global: window.AD.storage

   Estrategia:
   - Se guarda SIEMPRE en los dos lugares cuando es posible:
       * IndexedDB  -> historial grande (localStorage ~5 MB es poco).
       * localStorage -> respaldo que funciona incluso en orígenes donde
         IndexedDB está bloqueado (p. ej. páginas abiertas como file://).
   - Cada guardado lleva una marca de tiempo (savedAt) y al cargar se elige
     la copia MÁS RECIENTE de las dos, para no perder datos por diferencias
     entre IndexedDB y localStorage. */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var DB_NAME = "analisisDeportivo";
  var STORE = "kv";
  var RKEY = "state";
  var LS_KEY = "analisisDeportivo:state";
  var LS_LEGACY = "analisisDeportivo:v1"; // clave de versiones anteriores
  var LS_LIMIT = 4500000; // ~4.5 MB: más que esto puede fallar el espejo

  var dbPromise = null;
  var lastLoadedAt = null;

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

  /* ---- formato del registro guardado: { savedAt, data } ---- */
  function wrap(state) { return { savedAt: Date.now(), data: state }; }
  function unwrap(rec) {
    if (!rec) return null;
    if (rec.data && typeof rec.savedAt === "number") return rec.data;
    return rec; // compatibilidad con datos guardados sin envoltorio
  }
  function recTime(rec) {
    if (rec && typeof rec.savedAt === "number") return rec.savedAt;
    return 0;
  }

  function lsReadRaw() {
    try {
      var a = localStorage.getItem(LS_KEY);
      if (a) return JSON.parse(a);
      var b = localStorage.getItem(LS_LEGACY);
      if (b) return JSON.parse(b);
    } catch (e) {}
    return null;
  }

  function lsWrite(rec) {
    try {
      var s = JSON.stringify(rec);
      // Si es demasiado grande para localStorage, no espejamos (IndexedDB lo guarda igual).
      if (s.length > LS_LIMIT) return false;
      localStorage.setItem(LS_KEY, s);
      return true;
    } catch (e) { return false; }
  }

  /* Carga el estado persistido eligiendo la copia más reciente. */
  function load() {
    lastLoadedAt = null;
    return openDB().then(function (db) {
      var pIdb = db ? idbGet(db) : Promise.resolve(null);
      return pIdb.then(function (idbRec) {
        var lsRec = lsReadRaw();
        var idbVal = unwrap(idbRec);
        var lsVal = unwrap(lsRec);
        if (!idbVal && !lsVal) return null;

        var chosen, chosenRec;
        if (idbVal && lsVal) {
          if (recTime(idbRec) >= recTime(lsRec)) { chosen = idbVal; chosenRec = idbRec; }
          else { chosen = lsVal; chosenRec = lsRec; }
        } else if (idbVal) { chosen = idbVal; chosenRec = idbRec; }
        else { chosen = lsVal; chosenRec = lsRec; }

        // Si lo elegido vino de localStorage y hay IndexedDB, migrarlo.
        if (db && chosenRec === lsRec && recTime(lsRec) > recTime(idbRec)) {
          idbPut(db, wrap(chosen));
        }
        // Limpia la clave heredada una vez migrada.
        try { if (lsRec && localStorage.getItem(LS_LEGACY)) localStorage.removeItem(LS_LEGACY); } catch (e) {}
        lastLoadedAt = recTime(chosenRec) || null;
        return chosen;
      });
    });
  }

  /* Guarda el estado en ambos almacenes. Devuelve una promesa. */
  function save(state) {
    var rec = wrap(state);
    lsWrite(rec);
    return openDB().then(function (db) {
      if (!db) return false;
      return idbPut(db, rec);
    });
  }

  function clear() {
    try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_LEGACY); } catch (e) {}
    return openDB().then(function (db) { return db ? idbClear(db) : true; });
  }

  window.AD.storage = {
    load: load,
    save: save,
    clear: clear,
    hasIndexedDB: function () { return !!window.indexedDB; },
    lastLoadedAt: function () { return lastLoadedAt; }
  };
})();
