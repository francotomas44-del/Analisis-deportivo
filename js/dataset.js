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
    "dz.1": "Ligue 1 (Argelia)",
    "eg.1": "Premier League (Egipto)",
    "ma.1": "Botola (Marruecos)",
    "uefa.cl": "UEFA Champions League",
    "at.cup": "Copa de Austria",
    "de.cup": "DFB-Pokal (Alemania)",
    "worldcup": "Copa Mundial FIFA",
    "euro": "Eurocopa UEFA"
  };

  function compName(code) { return LEAGUES[code] || code; }

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
        away: String(m.team2).trim()
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
        var chain = Promise.resolve();

        files.forEach(function (entry) {
          chain = chain.then(function () {
            var comp = compName(entry.code);
            return fetch(BASE + (entry.source || "openfootball") + "/" + entry.path, { cache: "force-cache" })
              .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
              .then(function (p) {
                var c = convert(p, comp);
                for (var i = 0; i < c.length; i++) rows.push(c[i]);
              })
              .catch(function () { failed++; })
              .then(function () {
                done++;
                if (typeof onProgress === "function") onProgress(done, files.length, rows.length);
              });
          });
        });

        return chain.then(function () { return { rows: rows, failed: failed, files: files.length, manifest: manifest }; });
      })
      .then(function (res) {
        return loadCards(res.manifest).then(function (cardMap) {
          var cardsApplied = applyCards(res.rows, cardMap);
          var out = window.AD.store.importBulk(dedupeRows(res.rows), "openfootball");
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
     No persiste nada: es para la portada "Hoy". */
  var upcomingCache = null;

  function loadUpcoming(opts) {
    opts = opts || {};
    if (upcomingCache && !opts.force) return Promise.resolve(upcomingCache);

    return fetch(MANIFEST, { cache: "force-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("No se encontró data/manifest.json (HTTP " + r.status + ").");
        return r.json();
      })
      .then(function (manifest) {
        if (!Array.isArray(manifest) || !manifest.length) return [];
        var today = new Date().toISOString().slice(0, 10);
        var entries = manifest.filter(function (e) {
          if (!e || typeof e.path !== "string") return false;
          return e.path.indexOf("2026-27/") === 0 || e.path.indexOf("2026/") === 0;
        });

        var fixtures = [];
        var chain = Promise.resolve();
        entries.forEach(function (entry) {
          chain = chain.then(function () {
            return fetch(BASE + "openfootball/" + entry.path, { cache: "force-cache" })
              .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
              .then(function (p) {
                var f = convertFixtures(p, compName(entry.code), entry.code);
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

  window.AD.dataset = {
    load: load,
    loadUpcoming: loadUpcoming,
    convert: convert,
    convertFixtures: convertFixtures,
    compName: compName,
    leagues: LEAGUES,
    isLoading: function () { return loading; }
  };
})();
