/* store.js — persistencia en localStorage (JS vainilla)
   Namespace global: window.AD.store */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var KEY = "analisisDeportivo:v1";

  var state = {
    teams: [],
    matches: [],
    predictions: []
  };

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var data = JSON.parse(raw);
        state.teams = Array.isArray(data.teams) ? data.teams : [];
        state.matches = Array.isArray(data.matches) ? data.matches : [];
        state.predictions = Array.isArray(data.predictions) ? data.predictions : [];
      }
    } catch (e) {
      console.warn("No se pudo leer el almacenamiento:", e);
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("No se pudo guardar:", e);
    }
  }

  function reset() {
    state.teams = [];
    state.matches = [];
    state.predictions = [];
    save();
  }

  /* ---- Equipos ---- */
  function addTeam(name, league) {
    var t = { id: uid(), name: name.trim(), league: (league || "").trim() };
    state.teams.push(t);
    save();
    return t;
  }

  function removeTeam(id) {
    state.teams = state.teams.filter(function (t) { return t.id !== id; });
    state.matches = state.matches.filter(function (m) { return m.homeId !== id && m.awayId !== id; });
    save();
  }

  function getTeam(id) {
    for (var i = 0; i < state.teams.length; i++) if (state.teams[i].id === id) return state.teams[i];
    return null;
  }

  /* ---- Partidos ---- */
  function addMatch(m) {
    var match = {
      id: uid(),
      date: m.date || "",
      competition: m.competition || "",
      homeId: m.homeId,
      awayId: m.awayId,
      homeGoals: Number(m.homeGoals) || 0,
      awayGoals: Number(m.awayGoals) || 0,
      homeCorners: numOrNull(m.homeCorners),
      awayCorners: numOrNull(m.awayCorners),
      homeCards: numOrNull(m.homeCards),
      awayCards: numOrNull(m.awayCards)
    };
    state.matches.push(match);
    save();
    return match;
  }

  function numOrNull(v) {
    if (v === "" || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function removeMatch(id) {
    state.matches = state.matches.filter(function (m) { return m.id !== id; });
    save();
  }

  function matchesForTeam(id) {
    return state.matches.filter(function (m) { return m.homeId === id || m.awayId === id; });
  }

  /* ---- Predicciones ---- */
  function addPrediction(p) {
    var pred = {
      id: uid(),
      createdAt: new Date().toISOString(),
      kickoff: p.kickoff || "",
      homeId: p.homeId,
      awayId: p.awayId,
      homeName: p.homeName,
      awayName: p.awayName,
      input: p.input,          // parámetros usados (congelados)
      output: p.output,        // resultado del modelo (congelado)
      confidence: p.confidence,
      result: null,            // se completa al cerrar
      resultDate: null
    };
    state.predictions.push(pred);
    save();
    return pred;
  }

  function closePrediction(id, result) {
    for (var i = 0; i < state.predictions.length; i++) {
      if (state.predictions[i].id === id) {
        state.predictions[i].result = {
          homeGoals: Number(result.homeGoals),
          awayGoals: Number(result.awayGoals)
        };
        state.predictions[i].resultDate = result.date || new Date().toISOString().slice(0, 10);
        save();
        return state.predictions[i];
      }
    }
    return null;
  }

  function removePrediction(id) {
    state.predictions = state.predictions.filter(function (p) { return p.id !== id; });
    save();
  }

  /* ---- Datos de ejemplo ---- */
  function loadDemo() {
    var names = [
      ["Rojo FC", "Liga Demo"],
      ["Azul United", "Liga Demo"],
      ["Verde City", "Liga Demo"],
      ["Amarillo SC", "Liga Demo"],
      ["Negro Athletic", "Liga Demo"],
      ["Blanco Rovers", "Liga Demo"]
    ];
    state.teams = names.map(function (n) {
      return { id: uid(), name: n[0], league: n[1] };
    });

    var teamId = {};
    state.teams.forEach(function (t) { teamId[t.name] = t.id; });

    // resultados determinísticos de ejemplo: [local, visitante, gl, gv, cornersL, cornersV, cardsL, cardsV]
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
      return {
        id: uid(),
        date: d.toISOString().slice(0, 10),
        competition: "Liga Demo",
        homeId: teamId[r[0]],
        awayId: teamId[r[1]],
        homeGoals: r[2],
        awayGoals: r[3],
        homeCorners: r[4],
        awayCorners: r[5],
        homeCards: r[6],
        awayCards: r[7]
      };
    });

    state.predictions = [];
    save();
    return state;
  }

  window.AD.store = {
    load: load,
    save: save,
    reset: reset,
    state: state,
    uid: uid,
    addTeam: addTeam,
    removeTeam: removeTeam,
    getTeam: getTeam,
    addMatch: addMatch,
    removeMatch: removeMatch,
    matchesForTeam: matchesForTeam,
    addPrediction: addPrediction,
    closePrediction: closePrediction,
    removePrediction: removePrediction,
    loadDemo: loadDemo
  };
})();
