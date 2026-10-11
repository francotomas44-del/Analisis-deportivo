/* dataset.js — base histórica integrada (openfootball)
   Carga los JSON locales en data/openfootball/ (descargados por scripts/build-dataset.ps1)
   y los convierte al modelo del sistema usando AD.store.importBulk.

   Fuente: openfootball (https://github.com/openfootball) — datos libres de dominio público.
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

  /* Convierte el JSON de openfootball a filas del modelo del sistema */
  function convert(payload, comp) {
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
        competition: comp,
        home: String(m.team1).trim(),
        away: String(m.team2).trim(),
        homeGoals: Number(gh),
        awayGoals: Number(ga)
      });
    }
    return out;
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
        var files = manifest.slice().sort(function (a, b) { return (a.path < b.path ? -1 : 1); });
        var rows = [];
        var done = 0, failed = 0;
        var chain = Promise.resolve();

        files.forEach(function (entry) {
          chain = chain.then(function () {
            var comp = compName(entry.code);
            return fetch(BASE + "openfootball/" + entry.path, { cache: "force-cache" })
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

        return chain.then(function () { return { rows: rows, failed: failed, files: files.length }; });
      })
      .then(function (res) {
        var out = window.AD.store.importBulk(res.rows, "openfootball");
        loading = false;
        return {
          inserted: out.added,
          teamsAdded: out.teamsAdded,
          totalTeams: out.teams,
          totalMatches: out.matches,
          totalComps: window.AD.store.state.competitions.length,
          files: res.files,
          filesFailed: res.failed
        };
      })
      .catch(function (e) { loading = false; throw e; });
  }

  window.AD.dataset = {
    load: load,
    compName: compName,
    leagues: LEAGUES,
    isLoading: function () { return loading; }
  };
})();
