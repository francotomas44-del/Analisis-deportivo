/* store.js — modelo de datos y persistencia (JS vainilla)
   Namespace global: window.AD.store
   Persiste vía AD.storage (IndexedDB con respaldo en localStorage). */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var state = {
    teams: [],
    competitions: [],
    referees: [],
    matches: [],
    predictions: []
  };

  var saveTimer = null;
  var lastSavedAt = null;
  var onSavedCb = null;

  function markSaved() {
    lastSavedAt = new Date();
    if (typeof onSavedCb === "function") { try { onSavedCb(lastSavedAt); } catch (e) {} }
  }

  function persist() {
    return window.AD.storage.save(state).then(function (ok) { markSaved(); return ok; });
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function norm(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  /* ---------- carga / guardado ---------- */
  function init() {
    return window.AD.storage.load().then(function (data) {
      if (data) {
        state.teams = Array.isArray(data.teams) ? data.teams : [];
        state.competitions = Array.isArray(data.competitions) ? data.competitions : [];
        state.referees = Array.isArray(data.referees) ? data.referees : [];
        state.matches = Array.isArray(data.matches) ? data.matches : [];
        state.predictions = Array.isArray(data.predictions) ? data.predictions : [];
      }
      // refleja en el indicador la fecha del último guardado encontrado
      var loadedAt = window.AD.storage.lastLoadedAt ? window.AD.storage.lastLoadedAt() : null;
      if (loadedAt) lastSavedAt = new Date(loadedAt);
      // normaliza campos por compatibilidad
      state.teams.forEach(function (t) {
        if (!t.external) t.external = {};
        if (t.formedYear === undefined) t.formedYear = null;
      });
      return state;
    });
  }

  /* Guardado con antirrebote (debounce) para no escribir en cada operación */
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      persist();
    }, 150);
  }

  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return persist();
  }

  function reset() {
    state.teams = [];
    state.competitions = [];
    state.referees = [];
    state.matches = [];
    state.predictions = [];
    return saveNow();
  }

  /* Reemplaza todo el contenido (para restaurar una copia de seguridad). */
  function replaceState(data) {
    if (!data || typeof data !== "object") return Promise.resolve(false);
    state.teams = Array.isArray(data.teams) ? data.teams : [];
    state.competitions = Array.isArray(data.competitions) ? data.competitions : [];
    state.referees = Array.isArray(data.referees) ? data.referees : [];
    state.matches = Array.isArray(data.matches) ? data.matches : [];
    state.predictions = Array.isArray(data.predictions) ? data.predictions : [];
    state.teams.forEach(function (t) {
      if (!t.external) t.external = {};
      if (t.formedYear === undefined) t.formedYear = null;
    });
    return saveNow();
  }

  /* ---------- búsquedas ---------- */
  function find(list, fn) {
    for (var i = 0; i < list.length; i++) if (fn(list[i])) return list[i];
    return null;
  }

  function byExternal(list, source, extId) {
    if (extId === null || extId === undefined || extId === "") return null;
    return find(list, function (x) { return x.external && String(x.external[source]) === String(extId); });
  }

  function getTeam(id) { return find(state.teams, function (t) { return t.id === id; }); }
  function getTeamByName(name) { return find(state.teams, function (t) { return norm(t.name) === norm(name); }); }
  function getCompetition(id) { return find(state.competitions, function (c) { return c.id === id; }); }
  function getReferee(id) { return find(state.referees, function (r) { return r.id === id; }); }

  /* ---------- equipos / competiciones / árbitros (ensure = crea si no existe) ----------
     ensureTeam acepta dos formas:
       ensureTeam(nombre, liga, {source, id})        (uso interno)
       ensureTeam(nombre, {league, source, formedYear}) (uso del importador) */
  function ensureTeam(name, league, external) {
    if (!name) return null;

    var formedYear = null, source = null, extId = null;
    if (league && typeof league === "object") {
      var o = league;
      formedYear = o.formedYear || null;
      source = o.source != null ? o.source : null;
      if (o.id != null) extId = o.id;
      league = o.league || "";
    } else {
      league = league || "";
    }
    if (external && external.source != null) {
      source = external.source;
      if (external.id != null) extId = external.id;
    }

    if (source != null && extId != null) {
      var ex = byExternal(state.teams, source, extId);
      if (ex) {
        if (league && !ex.league) ex.league = league;
        if (formedYear && !ex.formedYear) ex.formedYear = formedYear;
        return ex;
      }
    }
    var t = getTeamByName(name);
    if (t) {
      if (league && !t.league) t.league = league;
      if (formedYear && !t.formedYear) t.formedYear = formedYear;
      if (source != null && extId != null) t.external[source] = extId;
      return t;
    }
    t = { id: uid(), name: String(name).trim(), league: league || "", formedYear: formedYear || null, external: {} };
    if (source != null && extId != null) t.external[source] = extId;
    state.teams.push(t);
    return t;
  }

  function findTeamByName(name) { return getTeamByName(name); }

  function ensureCompetition(name, code) {
    if (!name && !code) return null;
    var c = find(state.competitions, function (x) {
      return (code && x.code === code) || (name && norm(x.name) === norm(name));
    });
    if (c) return c;
    c = { id: uid(), name: name || code, code: code || "", external: {} };
    state.competitions.push(c);
    return c;
  }

  function ensureReferee(name, nationality, external) {
    if (!name) return null;
    if (external && external.source != null) {
      var ex = byExternal(state.referees, external.source, external.id);
      if (ex) return ex;
    }
    var r = find(state.referees, function (x) { return norm(x.name) === norm(name); });
    if (r) return r;
    r = { id: uid(), name: String(name).trim(), nationality: nationality || "", external: {} };
    if (external && external.source != null) r.external[external.source] = external.id;
    state.referees.push(r);
    return r;
  }

  function addTeam(name, league) {
    var t = ensureTeam(name, league);
    save();
    return t;
  }

  function removeTeam(id) {
    state.teams = state.teams.filter(function (t) { return t.id !== id; });
    state.matches = state.matches.filter(function (m) { return m.homeId !== id && m.awayId !== id; });
    save();
  }

  /* ---------- partidos ---------- */
  function numOrNull(v) {
    if (v === "" || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function matchExists(desc) {
    if (desc.externalId && desc.source) {
      var ex = find(state.matches, function (m) {
        return m.source === desc.source && String(m.externalId) === String(desc.externalId);
      });
      if (ex) return true;
    }
    return !!find(state.matches, function (m) {
      return m.date === (desc.date || "") && m.homeId === desc.homeId && m.awayId === desc.awayId;
    });
  }

  function buildMatch(desc) {
    return {
      id: uid(),
      date: desc.date || "",
      competition: desc.competition || "",
      competitionId: desc.competitionId || null,
      homeId: desc.homeId,
      awayId: desc.awayId,
      homeGoals: Number(desc.homeGoals) || 0,
      awayGoals: Number(desc.awayGoals) || 0,
      homeCorners: numOrNull(desc.homeCorners),
      awayCorners: numOrNull(desc.awayCorners),
      homeCards: numOrNull(desc.homeCards),
      awayCards: numOrNull(desc.awayCards),
      refereeId: desc.refereeId || null,
      refereeName: desc.refereeName || "",
      neutral: !!desc.neutral,
      source: desc.source || "manual",
      externalId: desc.externalId || null
    };
  }

  function addMatch(m) {
    var match = buildMatch(m);
    state.matches.push(match);
    save();
    return match;
  }

  function removeMatch(id) {
    state.matches = state.matches.filter(function (m) { return m.id !== id; });
    save();
  }

  function matchesForTeam(id) {
    return state.matches.filter(function (m) { return m.homeId === id || m.awayId === id; });
  }

  /* Deduplicación por clave externa (usada por el importador) */
  function hasMatchKey(key) {
    if (key == null) return false;
    return !!find(state.matches, function (m) { return String(m.externalId) === String(key); });
  }

  /* Alta de un partido ya resuelto a IDs (usada por el importador) */
  function importMatch(d) {
    var home = getTeam(d.homeId), away = getTeam(d.awayId);
    if (!home || !away) return null;
    var comp = d.competition ? ensureCompetition(d.competition) : null;
    var ref = d.referee ? ensureReferee(d.referee) : null;
    var match = buildMatch({
      date: d.date || "",
      competition: d.competition || "",
      competitionId: comp ? comp.id : null,
      homeId: d.homeId,
      awayId: d.awayId,
      homeGoals: d.homeGoals,
      awayGoals: d.awayGoals,
      homeCorners: d.homeCorners,
      awayCorners: d.awayCorners,
      homeCards: d.homeCards,
      awayCards: d.awayCards,
      refereeId: ref ? ref.id : null,
      refereeName: d.referee || "",
      neutral: d.neutral,
      source: d.source || "import",
      externalId: d.externalId != null ? String(d.externalId) : null
    });
    state.matches.push(match);
    save();
    return match;
  }

  /* ---------- importación masiva ----------
     descriptors: [{date, homeName, awayName, homeGoals, awayGoals, competition,
                    referee, homeCorners, awayCorners, homeCards, awayCards,
                    source, externalId, neutral, homeExternal, awayExternal}] */
  function importMatches(descriptors) {
    var added = 0, skipped = 0, teamsAdded = 0, refsAdded = 0;
    var teamsBefore = state.teams.length, refsBefore = state.referees.length;

    for (var i = 0; i < descriptors.length; i++) {
      var d = descriptors[i];
      if (!d.homeName || !d.awayName) { skipped++; continue; }
      if (d.homeGoals == null || d.awayGoals == null) { skipped++; continue; }

      var homeExt = d.homeExternal != null ? { source: d.source, id: d.homeExternal } : null;
      var awayExt = d.awayExternal != null ? { source: d.source, id: d.awayExternal } : null;
      var home = ensureTeam(d.homeName, d.competition, homeExt);
      var away = ensureTeam(d.awayName, d.competition, awayExt);
      if (!home || !away || home.id === away.id) { skipped++; continue; }

      var comp = d.competition ? ensureCompetition(d.competition) : null;
      var ref = d.referee ? ensureReferee(d.referee) : null;

      var desc = {
        date: d.date || "",
        competition: d.competition || "",
        competitionId: comp ? comp.id : null,
        homeId: home.id,
        awayId: away.id,
        homeGoals: d.homeGoals,
        awayGoals: d.awayGoals,
        homeCorners: d.homeCorners,
        awayCorners: d.awayCorners,
        homeCards: d.homeCards,
        awayCards: d.awayCards,
        refereeId: ref ? ref.id : null,
        refereeName: d.referee || "",
        neutral: d.neutral,
        source: d.source || "import",
        externalId: d.externalId
      };

      if (matchExists(desc)) { skipped++; continue; }
      state.matches.push(buildMatch(desc));
      added++;
    }

    teamsAdded = state.teams.length - teamsBefore;
    refsAdded = state.referees.length - refsBefore;
    saveNow();
    return { added: added, skipped: skipped, teamsAdded: teamsAdded, refereesAdded: refsAdded };
  }

  /* ---------- carga masiva (base histórica) ----------
     Eficiente: usa índices por nombre en memoria (O(n) en total, no O(n²)).
     rows: [{date, competition, home, away, homeGoals, awayGoals, externalId}] */
  function importBulk(rows, source) {
    var byName = {};
    state.teams.forEach(function (t) { var k = norm(t.name); if (!(k in byName)) byName[k] = t; });
    var byComp = {};
    state.competitions.forEach(function (c) { var k = norm(c.name); if (!(k in byComp)) byComp[k] = c; });

    var added = 0, teamsAdded = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r.home || !r.away) continue;
      if (r.homeGoals == null || r.awayGoals == null) continue;
      var hk = norm(r.home), ak = norm(r.away);
      if (!hk || !ak || hk === ak) continue;

      var ht = byName[hk];
      if (!ht) { ht = { id: uid(), name: String(r.home).trim(), league: r.competition || "", formedYear: null, external: {} }; state.teams.push(ht); byName[hk] = ht; teamsAdded++; }
      var at = byName[ak];
      if (!at) { at = { id: uid(), name: String(r.away).trim(), league: r.competition || "", formedYear: null, external: {} }; state.teams.push(at); byName[ak] = at; teamsAdded++; }

      var comp = null;
      if (r.competition) {
        var ck = norm(r.competition);
        comp = byComp[ck];
        if (!comp) { comp = { id: uid(), name: r.competition, code: "", external: {} }; state.competitions.push(comp); byComp[ck] = comp; }
      }

      state.matches.push(buildMatch({
        date: r.date || "",
        competition: r.competition || "",
        competitionId: comp ? comp.id : null,
        homeId: ht.id,
        awayId: at.id,
        homeGoals: r.homeGoals,
        awayGoals: r.awayGoals,
        source: source || "bulk",
        externalId: r.externalId != null ? String(r.externalId) : null
      }));
      added++;
    }
    saveNow();
    return { added: added, teamsAdded: teamsAdded, teams: state.teams.length, matches: state.matches.length };
  }

  /* ---------- predicciones ---------- */
  function addPrediction(p) {
    var pred = {
      id: uid(),
      createdAt: new Date().toISOString(),
      kickoff: p.kickoff || "",
      homeId: p.homeId,
      awayId: p.awayId,
      homeName: p.homeName,
      awayName: p.awayName,
      input: p.input,
      output: p.output,
      confidence: p.confidence,
      result: null,
      resultDate: null
    };
    state.predictions.push(pred);
    save();
    return pred;
  }

  function closePrediction(id, result) {
    var p = find(state.predictions, function (x) { return x.id === id; });
    if (!p) return null;
    p.result = { homeGoals: Number(result.homeGoals), awayGoals: Number(result.awayGoals) };
    p.resultDate = result.date || new Date().toISOString().slice(0, 10);
    save();
    return p;
  }

  function removePrediction(id) {
    state.predictions = state.predictions.filter(function (p) { return p.id !== id; });
    save();
  }

  /* ---------- datos de ejemplo ---------- */
  function loadDemo() {
    var names = [
      ["Rojo FC", "Liga Demo"], ["Azul United", "Liga Demo"], ["Verde City", "Liga Demo"],
      ["Amarillo SC", "Liga Demo"], ["Negro Athletic", "Liga Demo"], ["Blanco Rovers", "Liga Demo"]
    ];
    state.teams = names.map(function (n) { return { id: uid(), name: n[0], league: n[1], formedYear: null, external: {} }; });
    state.competitions = []; state.referees = []; state.predictions = [];
    var comp = ensureCompetition("Liga Demo");
    var refs = ["Juan Pérez", "María Gómez", "Luis Fernández"].map(function (n) { return ensureReferee(n); });

    var id = {};
    state.teams.forEach(function (t) { id[t.name] = t.id; });

    var rows = [
      ["Rojo FC", "Azul United", 2, 1, 6, 4, 2, 3],
      ["Verde City", "Amarillo SC", 1, 1, 5, 5, 1, 2],
      ["Negro Athletic", "Blanco Rovers", 3, 0, 8, 2, 3, 1],
      ["Azul United", "Verde City", 0, 2, 3, 7, 4, 2],
      ["Amarillo SC", "Rojo FC", 1, 2, 4, 6, 2, 2],
      ["Blanco Rovers", "Negro Athletic", 1, 1, 5, 5, 1, 3],
      ["Rojo FC", "Verde City", 1, 1, 5, 5, 2, 2],
      ["Azul United", "Amarillo SC", 2, 0, 6, 3, 1, 3],
      ["Negro Athletic", "Rojo FC", 0, 2, 4, 6, 3, 2],
      ["Blanco Rovers", "Azul United", 2, 2, 4, 4, 2, 2],
      ["Verde City", "Negro Athletic", 3, 1, 7, 3, 1, 2],
      ["Amarillo SC", "Blanco Rovers", 1, 1, 5, 5, 2, 1],
      ["Rojo FC", "Blanco Rovers", 2, 0, 7, 2, 1, 2],
      ["Azul United", "Negro Athletic", 1, 1, 4, 4, 2, 2],
      ["Verde City", "Amarillo SC", 2, 1, 6, 4, 1, 3],
      ["Negro Athletic", "Amarillo SC", 2, 0, 5, 4, 2, 2],
      ["Blanco Rovers", "Verde City", 0, 2, 2, 8, 3, 1],
      ["Rojo FC", "Azul United", 1, 0, 5, 5, 2, 3]
    ];

    var base = new Date();
    state.matches = rows.map(function (r, idx) {
      var d = new Date(base.getTime() - (rows.length - idx) * 7 * 86400000);
      var ref = refs[idx % refs.length];
      return buildMatch({
        date: d.toISOString().slice(0, 10),
        competition: "Liga Demo", competitionId: comp.id,
        homeId: id[r[0]], awayId: id[r[1]],
        homeGoals: r[2], awayGoals: r[3],
        homeCorners: r[4], awayCorners: r[5], homeCards: r[6], awayCards: r[7],
        refereeId: ref.id, refereeName: ref.name,
        source: "demo"
      });
    });

    return saveNow().then(function () { return state; });
  }

  window.AD.store = {
    init: init,
    save: save,
    saveNow: saveNow,
    reset: reset,
    state: state,
    uid: uid,
    getTeam: getTeam,
    getTeamByName: getTeamByName,
    findTeamByName: findTeamByName,
    getCompetition: getCompetition,
    getReferee: getReferee,
    ensureTeam: ensureTeam,
    ensureCompetition: ensureCompetition,
    ensureReferee: ensureReferee,
    addTeam: addTeam,
    removeTeam: removeTeam,
    addMatch: addMatch,
    removeMatch: removeMatch,
    matchesForTeam: matchesForTeam,
    hasMatchKey: hasMatchKey,
    importMatch: importMatch,
    importMatches: importMatches,
    importBulk: importBulk,
    replaceState: replaceState,
    getLastSavedAt: function () { return lastSavedAt; },
    setOnSaved: function (fn) { onSavedCb = fn; },
    addPrediction: addPrediction,
    closePrediction: closePrediction,
    removePrediction: removePrediction,
    loadDemo: loadDemo
  };
})();
