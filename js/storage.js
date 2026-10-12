/* storage.js — persistencia robusta (IndexedDB + localStorage) y respaldo
   Namespace global: window.AD.storage

   Estrategia:
   - Se guarda SIEMPRE en los dos lugares cuando es posible:
       * IndexedDB  -> historial grande (localStorage ~5 MB es poco).
       * localStorage -> respaldo que funciona incluso en orígenes donde
         IndexedDB está bloqueado (p. ej. páginas abiertas como file://).
   - Cada guardado lleva una marca de tiempo (savedAt) y al cargar se elige
     la copia MÁS RECIENTE de las dos, para no perder datos por diferencias
     entre IndexedDB y localStorage.
   - Migración: los datos guardados con el nombre anterior ("Analisis Deportivo")
     se copian una sola vez a las claves nuevas ("futbolunaki") y luego se
     eliminan. Si ya hay datos nuevos, la migración no abre la base vieja
     (evita cuelgues si quedó un borrado pendiente) y sólo limpia restos. */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var DB_NAME = "futbolunaki";
  var STORE = "kv";
  var RKEY = "state";
  var LS_KEY = "futbolunaki:state";
  var LS_LEGACY = "futbolunaki:v1"; // clave de versiones anteriores
  var LS_LIMIT = 4500000; // ~4.5 MB: más que esto puede fallar el espejo
  var OLD_OPEN_TIMEOUT = 2500; // ms: si la base vieja no abre, seguimos igual
  var OPEN_TIMEOUT = 6000;     // ms: red de seguridad para la base nueva

  // Claves del nombre anterior ("Analisis Deportivo"): sólo para migrar.
  var OLD_DB_NAME = "analisisDeportivo";
  var OLD_LS_KEY = "analisisDeportivo:state";
  var OLD_LS_LEGACY = "analisisDeportivo:v1";

  var dbPromise = null;
  var migratePromise = null;
  var lastLoadedAt = null;

  /* Abre una base. Con timeout: si no responde a tiempo resolvemos null y
     cerramos la conexión cuando llegue tarde, para no colgar la app. */
  function openRaw(name, timeoutMs) {
    return new Promise(function (resolve) {
      if (!window.indexedDB) { resolve(null); return; }
      var done = false;
      var timer = null;
      function fin(v) { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(v); }
      if (timeoutMs) timer = setTimeout(function () { fin(null); }, timeoutMs);

      var req;
      try { req = indexedDB.open(name, 1); } catch (e) { fin(null); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () {
        if (done) { try { req.result.close(); } catch (e) {} return; }
        fin(req.result);
      };
      req.onerror = function () { fin(null); };
      req.onblocked = function () { fin(null); };
    });
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = openRaw(DB_NAME, OPEN_TIMEOUT);
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

  /* ---- migración desde el nombre anterior ("Analisis Deportivo") ---- */
  function readOldLsRaw() {
    try {
      var s = localStorage.getItem(OLD_LS_KEY) || localStorage.getItem(OLD_LS_LEGACY);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return null;
  }

  function removeOldKeys() {
    try {
      localStorage.removeItem(OLD_LS_KEY);
      localStorage.removeItem(OLD_LS_LEGACY);
    } catch (e) {}
  }

  function closeQuietly(db) { if (db) { try { db.close(); } catch (e) {} } }

  function deleteOldDb() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) { resolve(true); return; }
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(true); } }, 3000);
      function fin() { if (done) return; done = true; clearTimeout(timer); resolve(true); }
      try {
        var req = indexedDB.deleteDatabase(OLD_DB_NAME);
        req.onsuccess = req.onerror = req.onblocked = fin;
      } catch (e) { fin(); }
    });
  }

  // Abre la base vieja SOLO si existe, y sin colgarse si está bloqueada.
  function openOldDbIfNeeded() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (typeof indexedDB.databases === "function") {
      return indexedDB.databases().then(function (list) {
        var exists = list.some(function (d) { return d.name === OLD_DB_NAME; });
        return exists ? openRaw(OLD_DB_NAME, OLD_OPEN_TIMEOUT) : null;
      }).catch(function () { return openRaw(OLD_DB_NAME, OLD_OPEN_TIMEOUT); });
    }
    return openRaw(OLD_DB_NAME, OLD_OPEN_TIMEOUT);
  }

  /* Copia el estado viejo a las claves nuevas y limpia el viejo.
     Nunca rechaza: si algo falla, la carga sigue con las claves nuevas. */
  function migrateOldData() {
    if (migratePromise) return migratePromise;
    migratePromise = openDB().then(function (newDb) {
      var pNew = newDb ? idbGet(newDb) : Promise.resolve(null);
      return pNew.then(function (newRec) {
        var oldLsRec = readOldLsRaw();

        // Ya hay datos nuevos: no hace falta abrir la base vieja. Sólo limpiamos.
        if (newRec) {
          removeOldKeys();
          deleteOldDb();
          return true;
        }

        return openOldDbIfNeeded().then(function (oldDb) {
          var pOld = oldDb ? idbGet(oldDb) : Promise.resolve(null);
          return pOld.then(function (oldRec) {
            var hasOld = !!(oldRec || oldLsRec);
            if (!hasOld) {
              closeQuietly(oldDb);
              removeOldKeys();
              deleteOldDb();
              return true;
            }
            var pick = recTime(oldRec) >= recTime(oldLsRec) ? oldRec : oldLsRec;
            var rec = wrap(unwrap(pick));
            lsWrite(rec);
            return (newDb ? idbPut(newDb, rec) : Promise.resolve(true)).then(function () {
              closeQuietly(oldDb);
              removeOldKeys();
              deleteOldDb();
              return true;
            });
          });
        });
      });
    }).catch(function () { return true; });
    return migratePromise;
  }

  /* Carga el estado persistido eligiendo la copia más reciente. */
  function load() {
    lastLoadedAt = null;
    return migrateOldData().then(function () {
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
    removeOldKeys();
    try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_LEGACY); } catch (e) {}
    return Promise.all([
      openDB().then(function (db) { return db ? idbClear(db) : true; }),
      deleteOldDb()
    ]).then(function (res) { return res[0]; });
  }

  window.AD.storage = {
    load: load,
    save: save,
    clear: clear,
    hasIndexedDB: function () { return !!window.indexedDB; },
    lastLoadedAt: function () { return lastLoadedAt; }
  };
})();
