/* dataset.js — base histórica integrada
   Carga los JSON locales bajo data/ y los convierte al modelo del sistema
   usando AD.store.importBulk. Cada entrada de data/manifest.json trae su
   carpeta de origen (`source`):
     - openfootball: resto del mundo (data/openfootball/…), descargado por
       scripts/build-dataset.ps1. Datos libres (dominio público/CC0).
     - openfootball-extra: competiciones que la base no traía (África, MLS,
       CONCACAF, Sudamérica, Asia…), mismas fuentes libres
       (data/openfootball-extra/<slug>.json), por scripts/build-openfootball-extra.ps1.
     - arg-espn: Liga Profesional Argentina (data/arg-espn/<año>.json),
       descargada por scripts/build-arg-espn.ps1 desde la API pública de ESPN
       (2001 y 2003..2026). Cada partido guarda su id de ESPN en `id` para no
       duplicar lo que luego se refresca en vivo.
     - espn-season: temporada en curso de las ligas ya presentes (data/espn-season/),
       por scripts/build-espn-season.ps1.
     - espn-history: tramo anterior al primer partido de cada liga (data/espn-history/),
       por scripts/build-espn-history.ps1.
     - espn-sudamericana: CONMEBOL Sudamericana (data/espn-sudamericana/), de la API
       pública de ESPN; openfootball no la publica. La baja
       scripts/build-espn-sudamericana.ps1 (historial 2005..2026). Junto con la
       Libertadores, es una de las fuentes que **cambia** (suma resultados y cruces
       a medida que se juega),
       así que su entrada del manifiesto lleva `rev` (hash del contenido); la app
       la agrega como query (?v=rev) para refrescar el archivo, y sus partidos por
       jugar (sin marcador) alimentan la portada "Hoy".
     - espn-libertadores: CONMEBOL Libertadores (data/espn-libertadores/), de la
       API pública de ESPN (historial 2005..2026), por
       scripts/build-espn-libertadores.ps1. Reemplaza a la antigua entrada de
       openfootball-extra (sa-lib.json), que mezclaba Libertadores y Sudamericana
       bajo un mismo código; igual que la Sudamericana, lleva `rev` y sus
       fixtures alimentan "Hoy".
   - espn-southamerica: primeras divisiones de Chile, Uruguay, Perú, Bolivia y
      Venezuela (data/espn-southamerica/<código>.json), que la base no traía
      (sus clubes aparecían SOLO en las copas CONMEBOL). De la API pública de
      ESPN (2005..hoy), por scripts/build-espn-southamerica.ps1. Lleva `rev` y
      sus cruces por jugar alimentan la portada "Hoy".
    - espn-cups: competiciones que la base no traía y que sí son importantes:
      Copa América, Eliminatorias Mundial CONMEBOL, UEFA Europa League y UEFA
      Conference League (data/espn-cups/<código>.json), de la API pública de
      ESPN (Copa América 2001..hoy, Eliminatorias 2003..hoy, Europa League
      2009..hoy, Conference League 2021..hoy), por scripts/build-espn-cups.ps1.
      De las copas europeas se guarda la FASE PRINCIPAL (se descartan las rondas
      previas). Lleva `rev` y sus cruces por jugar alimentan la portada "Hoy".
    Los solapamientos entre fuentes se deduplican al cargar (ver dedupeRows).
   No requiere API key y no envía nada a servidores externos (los archivos son locales).

   Namespace: window.AD.dataset */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var BASE = "data/";
  var MANIFEST = BASE + "manifest.json";

  /* Nombres legibles por código de competición (códigos de openfootball) */
  var LEAGUES = {
    "en.1": "Premier League (Inglaterra)",
    "es.1": "LaLiga (España)",
    "de.1": "Bundesliga (Alemania)",
    "it.1": "Serie A (Italia)",
    "fr.1": "Ligue 1 (Francia)",
    "nl.1": "Eredivisie (Países Bajos)",
    "pt.1": "Primeira Liga (Portugal)",
    "at.1": "Bundesliga (Austria)",
    "be.1": "Pro League (Bélgica)",
    "ch.1": "Super League (Suiza)",
    "gr.1": "Super League (Grecia)",
    "tr.1": "Süper Lig (Turquía)",
    "sco.1": "Premiership (Escocia)",
    "ru.1": "Premier League (Rusia)",
    "mx.1": "Liga MX (México)",
    "ar.1": "Liga Profesional (Argentina)",
    "br.1": "Brasileirão (Brasil)",
    "cz.1": "Liga (Chequia)",
    "hu.1": "NB I (Hungría)",
    "cn.1": "Super League (China)",
    "jp.1": "J1 League (Japón)",
    "au.1": "A-League (Australia)",
    "co.1": "Primera A (Colombia)",
    "chi.1": "Primera División (Chile)",
    "uru.1": "Primera División (Uruguay)",
    "per.1": "Liga 1 (Perú)",
    "bol.1": "Primera División (Bolivia)",
    "ven.1": "Primera División (Venezuela)",
    "dz.1": "Ligue 1 (Argelia)",
    "eg.1": "Premier League (Egipto)",
    "ma.1": "Botola (Marruecos)",
    "uefa.cl": "UEFA Champions League",
    "at.cup": "Copa de Austria",
    "de.cup": "DFB-Pokal (Alemania)",
    "worldcup": "Copa Mundial FIFA",
    "euro": "Eurocopa UEFA",
    "conmebol.sudamericana": "CONMEBOL Sudamericana",
    "conmebol.libertadores": "CONMEBOL Libertadores",
    "conmebol.america": "Copa América",
    "fifa.worldq.conmebol": "Eliminatorias Mundial (CONMEBOL)",
    "uefa.europa": "UEFA Europa League",
    "uefa.europa.conf": "UEFA Conference League"
  };

  function compName(code) { return LEAGUES[code] || code; }

  /* URL de un archivo de datos. Si la entrada del manifiesto trae `rev`
     (revisión del contenido), se agrega como query para forzar la descarga
     cuando el archivo cambió: los data/ se cachean de forma agresiva
     (force-cache + service worker), y una URL nueva es la única forma de
     refrescar un archivo que sí cambia (p. ej. CONMEBOL Sudamericana, con
     partidos por jugar y resultados recientes). */
  function dataURL(source, entry) {
    return BASE + (source || "openfootball") + "/" + entry.path + (entry.rev ? ("?v=" + entry.rev) : "");
  }

  /* Convierte el JSON de openfootball en partidos SIN resultado (fixtures futuros).
     Son los que todavía no se jugaron: no tienen "score". Se usan para la portada
     "Hoy" (próximos partidos + pronóstico), sin inventar datos. */
  function convertFixtures(payload, comp, code) {
    var arr = payload && payload.matches;
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i];
      if (!m || !m.team1 || !m.team2) continue;
      var played = (m.score && Array.isArray(m.score.ft)) || Array.isArray(m.score);
      if (played) continue;
      out.push({
        date: m.date || "",
        time: m.time || "",
        competition: m.competition ? String(m.competition) : comp,
        code: code || "",
        home: String(m.team1).trim(),
        away: String(m.team2).trim(),
        /* Las fuentes ESPN traen el id del evento: con eso el detalle del partido
           (alineaciones y stats) se pide directo, sin buscarlo por nombre. */
        externalId: m.id != null ? String(m.id) : null
      });
    }
    return out;
  }

  /* Convierte el JSON de la base a filas del modelo del sistema.
     `comp` es la competicion de la liga (por codigo del manifiesto); `league`
     es la liga a la que pertenecen los equipos (normalmente igual a `comp`).
     Si el partido trae su propio torneo en `m.competition` (p. ej. los torneos
     argentinos: Apertura/Clausura/Superliga/...), se usa ese como competicion
     del partido, pero los equipos quedan agrupados bajo `league`. */
  function convert(payload, comp, league) {
    var arr = payload && payload.matches;
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i];
      if (!m || !m.team1 || !m.team2) continue;
      var gh = null, ga = null;
      if (m.score && Array.isArray(m.score.ft)) { gh = m.score.ft[0]; ga = m.score.ft[1]; }
      else if (Array.isArray(m.score)) { gh = m.score[0]; ga = m.score[1]; }
      if (gh == null || ga == null || !isFinite(Number(gh)) || !isFinite(Number(ga))) continue;
      out.push({
        date: m.date || "",
        competition: m.competition ? String(m.competition) : comp,
        league: league || comp,
        home: String(m.team1).trim(),
        away: String(m.team2).trim(),
        homeGoals: Number(gh),
        awayGoals: Number(ga),
        externalId: m.id != null ? String(m.id) : null
      });
    }
    return out;
  }

  /* Normaliza un nombre igual que el store (trim + minúsculas): así el dedupe por
     filas coincide con la identidad de equipo que arma importBulk. */
  function normName(s) { return String(s == null ? "" : s).trim().toLowerCase(); }

  /* ---------- registro de archivos importados ----------
     La base se importa una sola vez por instalación. Para que una instalación
     vieja reciba lo que se agregue después (competiciones, temporadas o datos
     corregidos) sin volver a bajar todo, se anota qué archivos ya entraron en
     `localStorage` y sync() completa solo lo que falta. */
  var FILES_KEY = "futbolityx:base:files";

  function entryKey(e) {
    return (e.source || "openfootball") + "|" + e.path + "|" + (e.rev || "");
  }

  function readImported() {
    try {
      var raw = localStorage.getItem(FILES_KEY);
      var o = raw ? JSON.parse(raw) : null;
      return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }

  function writeImported(map) {
    try { localStorage.setItem(FILES_KEY, JSON.stringify(map)); } catch (e) {}
  }

  /* Quita el mismo partido cuando dos fuentes se solapan (p. ej. openfootball y ESPN
     cubren la misma liga/temporada). Criterio: fecha + local + visitante normalizados.
     Si hay dos copias, se conserva la que trae `externalId` (más trazable). */
  function dedupeRows(rows) {
    var seen = {}, out = [];
    for (var i = 0; i < rows.length; i++) {
      var m = rows[i];
      var key = (m.date || "") + "|" + normName(m.home) + "|" + normName(m.away);
      if (!(key in seen)) { seen[key] = out.length; out.push(m); continue; }
      if (!out[seen[key]].externalId && m.externalId) out[seen[key]] = m;
    }
    return out;
  }

  /* Tarjetas (amarillas/rojas) y córners por partido.
     data/cards/<code>.json trae, por cada id de ESPN presente en la base, un
     arreglo compacto: [id, amarillasLocal, amarillasVisitante, rojasLocal,
     rojasVisitante, cornersLocal, cornersVisitante]. Se combinan por id externo
     para enriquecer las filas de la base sin duplicar archivos de partidos. */
  function loadCards(manifest) {
    var entries = (manifest || []).filter(function (e) { return e && e.source === "cards"; });
    var map = {};
    var chain = Promise.resolve();
    entries.forEach(function (entry) {
      chain = chain.then(function () {
        return fetch(BASE + "cards/" + entry.path, { cache: "force-cache" })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function (p) {
            var arr = (p && p.matches) || [];
            for (var i = 0; i < arr.length; i++) {
              var a = arr[i];
              if (a && a[0]) map[a[0]] = a;
            }
          })
          .catch(function () {});
      });
    });
    return chain.then(function () { return map; });
  }

  function applyCards(rows, map) {
    var applied = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.externalId) continue;
      var c = map[r.externalId];
      if (!c) continue;
      if (typeof c[1] === "number" && typeof c[2] === "number") { r.homeYellow = c[1]; r.awayYellow = c[2]; }
      if (typeof c[3] === "number" && typeof c[4] === "number") { r.homeRed = c[3]; r.awayRed = c[4]; }
      if (typeof c[5] === "number" && typeof c[6] === "number") { r.homeCorners = c[5]; r.awayCorners = c[6]; }
      applied++;
    }
    return applied;
  }

  var loading = false;

  /* Carga la base completa. onProgress(done, total, matchesSoFar) */
  function load(onProgress) {
    if (loading) return Promise.reject(new Error("La base ya se está cargando."));
    loading = true;

    return fetch(MANIFEST, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("No se encontró data/manifest.json (HTTP " + r.status + "). ¿Ejecutaste scripts/build-dataset.ps1?");
        return r.json();
      })
      .then(function (manifest) {
        if (!Array.isArray(manifest) || !manifest.length) throw new Error("El manifiesto de la base está vacío.");
        var files = manifest.filter(function (e) { return !e || e.source !== "cards"; })
          .sort(function (a, b) { return (a.path < b.path ? -1 : 1); });
        var rows = [];
        var done = 0, failed = 0;
        var imported = {};   /* archivos que sí se leyeron (para no repetirlos) */
        var chain = Promise.resolve();

        files.forEach(function (entry) {
          chain = chain.then(function () {
            var comp = compName(entry.code);
            return fetch(dataURL(entry.source, entry), { cache: "force-cache" })
              .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
              .then(function (p) {
                var c = convert(p, comp);
                for (var i = 0; i < c.length; i++) { c[i].source = entry.source; rows.push(c[i]); }
                imported[entryKey(entry)] = 1;
              })
              .catch(function () { failed++; })
              .then(function () {
                done++;
                if (typeof onProgress === "function") onProgress(done, files.length, rows.length);
              });
          });
        });

        return chain.then(function () { return { rows: rows, failed: failed, files: files.length, manifest: manifest, imported: imported }; });
      })
      .then(function (res) {
        return loadCards(res.manifest).then(function (cardMap) {
          var cardsApplied = applyCards(res.rows, cardMap);
          var out = window.AD.store.importBulk(dedupeRows(res.rows.filter(function (r) { return !isSelfMatch(r); })), "openfootball");
          writeImported(res.imported);
          loading = false;
          return {
            inserted: out.added,
            teamsAdded: out.teamsAdded,
            totalTeams: out.teams,
            totalMatches: out.matches,
            totalComps: window.AD.store.state.competitions.length,
            files: res.files,
            filesFailed: res.failed,
            cardsApplied: cardsApplied
          };
        });
      })
      .catch(function (e) { loading = false; throw e; });
  }

  /* Próximos partidos (fixtures sin resultado) de la temporada en curso.
     Carga liviana: lee solo los archivos de las temporadas recientes (no las 207).
     Incluye las competiciones que traen partidos por jugar de otra fuente
     (p. ej. CONMEBOL Sudamericana y Libertadores, de ESPN, en
     data/espn-sudamericana/ y data/espn-libertadores/).
     No persiste nada: es para la portada "Hoy". */
  var upcomingCache = null;

  function loadUpcoming(opts) {
    opts = opts || {};
    if (upcomingCache && !opts.force) return Promise.resolve(upcomingCache);

    return fetch(MANIFEST, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("No se encontró data/manifest.json (HTTP " + r.status + ").");
        return r.json();
      })
      .then(function (manifest) {
        if (!Array.isArray(manifest) || !manifest.length) return [];
        var today = new Date().toISOString().slice(0, 10);

        /* Cada trabajo lleva su carpeta de origen: openfootball (temporada en
           curso) o fuentes que publican sus propios partidos por jugar. */
        var jobs = [];
        manifest.forEach(function (e) {
          if (!e || typeof e.path !== "string") return;
          var src = e.source || "openfootball";
          if (src === "espn-sudamericana" || src === "espn-libertadores" || src === "espn-southamerica" || src === "espn-cups") { jobs.push({ folder: src, entry: e }); return; }
          if (src !== "openfootball") return;
          if (e.path.indexOf("2026-27/") === 0 || e.path.indexOf("2026/") === 0) {
            jobs.push({ folder: "openfootball", entry: e });
          }
        });

        var fixtures = [];
        var chain = Promise.resolve();
        jobs.forEach(function (job) {
          chain = chain.then(function () {
            return fetch(dataURL(job.folder, job.entry), { cache: "force-cache" })
              .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
              .then(function (p) {
                var f = convertFixtures(p, compName(job.entry.code), job.entry.code);
                for (var i = 0; i < f.length; i++) {
                  if (f[i].date >= today) fixtures.push(f[i]);
                }
              })
              .catch(function () {});
          });
        });

        return chain.then(function () {
          fixtures.sort(function (a, b) {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return (a.time || "99:99") < (b.time || "99:99") ? -1 : 1;
          });
          upcomingCache = fixtures;
          return fixtures;
        });
      });
  }

  /* ---------- puesta al día de una base ya importada ----------
     La base se importa una sola vez por instalación (load()). Si después se
     agregan archivos al manifiesto —una competición nueva, una temporada más,
     datos corregidos—, esa instalación no los vería nunca. sync() compara el
     registro local (FILES_KEY) con el manifiesto y baja solo lo que falta,
     sin borrar nada:
       - los partidos que ya están no se duplican (fecha + equipos canónicos);
       - si la copia nueva trae un id de ESPN que la vieja no tenía, se lo
         adopta (así el detalle de jugadores queda disponible también ahí);
       - si la copia nueva trae tarjetas/córners y la vieja no, se completan. */
  var canonCache = {};
  function canonCached(name) {
    var k = normName(name);
    if (!(k in canonCache)) {
      var S = window.AD.store;
      canonCache[k] = (S && S.canonicalName) ? S.canonicalName(name) : normName(name);
    }
    return canonCache[k];
  }

  function rowKey(r) {
    return (r.date || "") + "|" + canonCached(r.home) + "|" + canonCached(r.away);
  }

  /* Un partido con el mismo club en las dos puntas es un error de la fuente
     (p. ej. "Deportivo" resuelto como "Deportivo Alavés"): no se importa. */
  function isSelfMatch(r) {
    return !!r && canonCached(r.home) === canonCached(r.away);
  }

  /* Índice de lo que ya está guardado, por la misma clave que usa el dedupe. */
  function indexExisting() {
    var S = window.AD.store;
    var names = {}, out = {}, i;
    for (i = 0; i < S.state.teams.length; i++) names[S.state.teams[i].id] = S.state.teams[i].name;
    for (i = 0; i < S.state.matches.length; i++) {
      var m = S.state.matches[i];
      var k = (m.date || "") + "|" + canonCached(names[m.homeId] || "") + "|" + canonCached(names[m.awayId] || "");
      if (!out[k]) out[k] = m;
    }
    return out;
  }

  function fillMissing(prev, row) {
    var pairs = [["homeCorners", "awayCorners"], ["homeCards", "awayCards"],
      ["homeYellow", "awayYellow"], ["homeRed", "awayRed"]];
    var n = 0;
    for (var i = 0; i < pairs.length; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      if (prev[a] == null && prev[b] == null && row[a] != null && row[b] != null) {
        prev[a] = row[a]; prev[b] = row[b]; n++;
      }
    }
    return n;
  }

  /* Mezcla las filas nuevas con lo ya guardado: ni duplica ni pisa datos. */
  function syncMerge(rows, existing) {
    var out = [], at = {}, adopted = 0, filled = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.home || !row.away) continue;
      if (isSelfMatch(row)) continue;
      var k = rowKey(row);

      var prev = existing[k];
      if (prev) {
        if (row.externalId && !prev.externalId) { prev.externalId = String(row.externalId); adopted++; }
        filled += fillMissing(prev, row);
        continue;
      }

      if (k in at) {
        /* Dos copias del mismo partido entre los archivos nuevos: gana la que
           trae id de ESPN (más trazable y habilita el detalle). */
        var cur = out[at[k]];
        if (!cur.externalId && row.externalId) out[at[k]] = row;
        continue;
      }
      at[k] = out.length;
      out.push(row);
    }
    return { rows: out, adopted: adopted, filled: filled };
  }

  /* Devuelve { checked, pending, added, teamsAdded, adopted, filled, failed }. */
  function sync(onProgress) {
    if (loading) return Promise.resolve({ busy: true, pending: 0, added: 0, teamsAdded: 0, adopted: 0, filled: 0 });
    loading = true;

    var S = window.AD.store;
    var imported = readImported();

    return fetch(MANIFEST, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("No se encontró data/manifest.json (HTTP " + r.status + ").");
        return r.json();
      })
      .then(function (manifest) {
        if (!Array.isArray(manifest) || !manifest.length) throw new Error("El manifiesto de la base está vacío.");

        /* Sin partidos guardados no hay nada que completar: la base completa la
           importa load(). Se olvida el registro para que esa importación se
           anote entera (p. ej. después de "Borrar todo"). */
        if (!S.state.matches.length) {
          writeImported({});
          loading = false;
          return { checked: 0, pending: 0, added: 0, teamsAdded: 0, adopted: 0, filled: 0, empty: true };
        }

        var dataFiles = manifest.filter(function (e) {
          return e && typeof e.path === "string" && e.source !== "cards";
        });
        var pending = dataFiles.filter(function (e) { return !imported[entryKey(e)]; });
        if (!pending.length) {
          loading = false;
          return { checked: dataFiles.length, pending: 0, added: 0, teamsAdded: 0, adopted: 0, filled: 0 };
        }

        var existing = indexExisting();
        var rows = [];
        var done = 0, failed = 0;
        var chain = Promise.resolve();

        pending.forEach(function (entry) {
          chain = chain.then(function () {
            return fetch(dataURL(entry.source, entry), { cache: "force-cache" })
              .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
              .then(function (p) {
                var c = convert(p, compName(entry.code));
                for (var i = 0; i < c.length; i++) { c[i].source = entry.source; rows.push(c[i]); }
                imported[entryKey(entry)] = 1;
              })
              .catch(function () { failed++; })
              .then(function () {
                done++;
                if (typeof onProgress === "function") onProgress(done, pending.length, rows.length);
              });
          });
        });

        return chain.then(function () {
          var merged = syncMerge(rows, existing);
          /* Las tarjetas/córners se guardan por id de ESPN: si entran partidos
             nuevos, se aplican igual que en la carga completa para que dos
             instalaciones no queden con coberturas distintas. */
          var prep = merged.rows.length ? loadCards(manifest) : Promise.resolve(null);
          return prep.then(function (cardMap) {
            if (cardMap) applyCards(merged.rows, cardMap);
            var out = S.importBulk(merged.rows, "openfootball");
            if (merged.adopted || merged.filled) S.saveNow();
            writeImported(imported);
            loading = false;
            return {
              checked: dataFiles.length,
              pending: pending.length,
              added: out.added,
              teamsAdded: out.teamsAdded,
              adopted: merged.adopted,
              filled: merged.filled,
              failed: failed
            };
          });
        });
      })
      .catch(function (e) { loading = false; throw e; });
  }

  window.AD.dataset = {
    load: load,
    sync: sync,
    loadUpcoming: loadUpcoming,
    convert: convert,
    convertFixtures: convertFixtures,
    compName: compName,
    leagues: LEAGUES,
    isLoading: function () { return loading; }
  };
})();
