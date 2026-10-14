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
  // Marca ligera (cabe siempre en localStorage): indica que HAY datos guardados,
  // aunque el estado completo no pueda espejarse en localStorage. Sirve para no
  // confundir "primer uso" con "no se pudieron leer los datos" (evita que la app
  // reimporte la base y borre las predicciones por una lectura fallida).
  var HASDATA_KEY = "futbolunaki:hasData";

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
    dbPromise = openRaw(DB_NAME, OPEN_TIMEOUT).then(function (db) {
      // Si la apertura falló (timeout/bloqueo), no la memorizamos: así un
      // reintento posterior (p. ej. tras una recarga) puede volver a intentar.
      if (!db) dbPromise = null;
      return db;
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

  /* Marca de "hay datos": se pone cuando algo se guardó de verdad (IndexedDB o
     espejo) y se quita al quedar vacío. Siempre cabe en localStorage. */
  function setHasDataFlag(on) {
    try { if (on) localStorage.setItem(HASDATA_KEY, "1"); else localStorage.removeItem(HASDATA_KEY); } catch (e) {}
  }
  function hasStoredData() {
    try { return localStorage.getItem(HASDATA_KEY) === "1"; } catch (e) { return false; }
  }
  function hasContent(state) {
    return !!(state && ((state.teams && state.teams.length) ||
      (state.matches && state.matches.length) || (state.predictions && state.predictions.length)));
  }
  function isVacant(state) { return !hasContent(state); }

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
            // Nunca dejar que una copia vacía/zombi (p. ej. un espejo viejo en
            // localStorage) le gane a una copia con contenido, aunque su fecha
            // sea más nueva: eso hacía que la app reimportara y borrara datos.
            var idbVacant = isVacant(idbVal), lsVacant = isVacant(lsVal);
            if (idbVacant && !lsVacant) { chosen = lsVal; chosenRec = lsRec; }
            else if (lsVacant && !idbVacant) { chosen = idbVal; chosenRec = idbRec; }
            else if (recTime(idbRec) >= recTime(lsRec)) { chosen = idbVal; chosenRec = idbRec; }
            else { chosen = lsVal; chosenRec = lsRec; }
          } else if (idbVal) { chosen = idbVal; chosenRec = idbRec; }
          else { chosen = lsVal; chosenRec = lsRec; }

          // Si lo elegido vino de localStorage y hay IndexedDB, migrarlo... pero
          // nunca sobrescribir con un estado vacío un IndexedDB que tenía datos.
          if (db && chosenRec === lsRec && recTime(lsRec) > recTime(idbRec) &&
              !(isVacant(chosen) && !isVacant(idbVal))) {
            idbPut(db, wrap(chosen));
          }
          if (hasContent(chosen)) setHasDataFlag(true);
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
    var mirrored = lsWrite(rec);
    if (!mirrored) {
      // El estado no cabe en localStorage (base grande). Quitamos el registro
      // viejo para que un estado vacío/zombi no "gane" por fecha a IndexedDB.
      try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_LEGACY); } catch (e) {}
    }
    return openDB().then(function (db) {
      var p = db ? idbPut(db, rec) : Promise.resolve(false);
      return p.then(function (ok) {
        // Marca "hay datos" sólo si algo se guardó de verdad.
        setHasDataFlag((ok || mirrored) && hasContent(state));
        return ok;
      });
    });
  }

  function clear() {
    removeOldKeys();
    setHasDataFlag(false);
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
    hasStoredData: hasStoredData,
    lastLoadedAt: function () { return lastLoadedAt; }
  };
})();
