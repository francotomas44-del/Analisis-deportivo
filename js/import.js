/* import.js — módulo de importación de datos (JS vainilla)
   Fuentes integradas (accesibles desde el navegador):
     - TheSportsDB (equipos + año de fundación + historial)
     - OpenLigaDB (partidos detallados, sin clave)
     - openfootball (JSON estático en GitHub raw)
   Fuentes sin API pública (Promiedos / El Nine): se cargan pegando JSON/CSV o por URL.
   Namespace: window.AD.importer */
(function () {
  "use strict";

  window.AD = window.AD || {};
  var S = window.AD.store;

  var TSDB_KEY = "3"; // clave de prueba pública de TheSportsDB

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }

  function pick(o, keys) {
    if (!o) return undefined;
    for (var i = 0; i < keys.length; i++) {
      var v = o[keys[i]];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  }

  function toNum(v) {
    if (v === undefined || v === null || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function toIsoDate(v) {
    if (!v) return "";
    var s = String(v).trim();
    var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) return iso[0];
    var dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
    if (dmy) {
      var y = dmy[3];
      if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
      var d = dmy[1].padStart(2, "0");
      var m = dmy[2].padStart(2, "0");
      if (Number(m) > 12 && Number(d) <= 12) { var t = d; d = m; m = t; }
      return y + "-" + m + "-" + d;
    }
    return s.slice(0, 10);
  }

  function log(msg, type) {
    var host = $("imp-log");
    if (!host) return;
    var cls = type === "err" ? "badge fail" : type === "ok" ? "badge ok" : "badge pending";
    var line = document.createElement("div");
    line.style.margin = "0.3rem 0";
    line.innerHTML = '<span class="' + cls + '" style="margin-right:0.5rem">' + (type === "err" ? "Error" : type === "ok" ? "OK" : "Info") + "</span>" + msg;
    host.appendChild(line);
    host.scrollTop = host.scrollHeight;
  }

  function clearLog() { var host = $("imp-log"); if (host) host.innerHTML = ""; }

  /* ---------- normalización ---------- */
  function normalize(m, formed) {
    var h = pick(m, ["home", "homeTeam", "HomeTeam", "home_team", "hometeam", "team1", "strHomeTeam", "local", "equipo1", "equipo_local", "Home"]);
    var a = pick(m, ["away", "awayTeam", "AwayTeam", "away_team", "awayteam", "team2", "strAwayTeam", "visitante", "equipo2", "equipo_visitante", "Away"]);
    if (h && typeof h === "object") h = h.teamName || h.name;
    if (a && typeof a === "object") a = a.teamName || a.name;

    var gh = pick(m, ["homeGoals", "fthg", "FTHG", "intHomeScore", "homeScore", "home_score", "home_goals", "golesLocal", "goles_local", "pointsTeam1", "HG"]);
    var ga = pick(m, ["awayGoals", "ftag", "FTAG", "intAwayScore", "awayScore", "away_score", "away_goals", "golesVisitante", "goles_visitante", "pointsTeam2", "AG"]);
    if (gh === undefined || ga === undefined) {
      if (Array.isArray(m.score)) { gh = m.score[0]; ga = m.score[1]; }
      else if (m.score && m.score.ft) { gh = m.score.ft[0]; ga = m.score.ft[1]; }
    }

    var homeName = h ? String(h).trim() : "";
    var awayName = a ? String(a).trim() : "";

    return {
      externalId: pick(m, ["externalId", "idEvent", "id", "matchID", "ID"]),
      date: toIsoDate(pick(m, ["date", "dateEvent", "matchDateTime", "matchDateTimeUTC", "fecha", "Date", "DateUtc"])),
      competition: pick(m, ["competition", "league", "strLeague", "leagueName", "torneo", "Div", "div", "tournament", "competicion"]) || "",
      home: homeName,
      away: awayName,
      homeGoals: toNum(gh),
      awayGoals: toNum(ga),
      homeCorners: toNum(pick(m, ["homeCorners", "hc", "HC", "cornersHome"])),
      awayCorners: toNum(pick(m, ["awayCorners", "ac", "AC", "cornersAway"])),
      homeCards: toNum(pick(m, ["homeCards", "hy", "HY"])),
      awayCards: toNum(pick(m, ["awayCards", "ay", "AY"])),
      referee: pick(m, ["referee", "Referee", "refereeName", "strOfficial", "arbitro", "arbitroName"]) || "",
      homeFormed: formed && formed[homeName.toLowerCase()] ? formed[homeName.toLowerCase()] : null,
      awayFormed: formed && formed[awayName.toLowerCase()] ? formed[awayName.toLowerCase()] : null
    };
  }

  function extractMatches(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    for (var i = 0; i < ["matches", "events", "games", "partidos", "data", "response", "results"].length; i++) {
      var k = ["matches", "events", "games", "partidos", "data", "response", "results"][i];
      if (Array.isArray(payload[k])) return payload[k];
    }
    if (payload.home || payload.homeTeam || payload.strHomeTeam || payload.team1) return [payload];
    return [];
  }

  function formedFromTeams(payload) {
    var map = {};
    var teams = payload && (payload.teams || payload.equipos);
    if (Array.isArray(teams)) {
      teams.forEach(function (t) {
        var name = (t.name || t.strTeam || t.equipo || "").toString().trim().toLowerCase();
        var y = parseInt(t.formedYear || t.intFormedYear || t.fundacion, 10);
        if (name && y) map[name] = y;
      });
    }
    return map;
  }

  /* ---------- aplicación a la base local ---------- */
  function applyNormalized(list, source, formed) {
    var teamsAdded = 0, matchesAdded = 0, skipped = 0;
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (!n.home || !n.away || n.homeGoals === null || n.awayGoals === null) { skipped++; continue; }

      var hadHome = !!S.findTeamByName(n.home);
      var ht = S.ensureTeam(n.home, { league: n.competition, source: source, formedYear: n.homeFormed });
      if (!hadHome) teamsAdded++;

      var hadAway = !!S.findTeamByName(n.away);
      var at = S.ensureTeam(n.away, { league: n.competition, source: source, formedYear: n.awayFormed });
      if (!hadAway) teamsAdded++;

      var key = n.externalId || (n.date + "|" + ht.id + "|" + at.id);
      if (S.hasMatchKey(String(key))) { skipped++; continue; }

      S.importMatch({
        date: n.date, competition: n.competition,
        homeId: ht.id, awayId: at.id,
        homeGoals: n.homeGoals, awayGoals: n.awayGoals,
        homeCorners: n.homeCorners, awayCorners: n.awayCorners,
        homeCards: n.homeCards, awayCards: n.awayCards,
        referee: n.referee, source: source, externalId: String(key)
      });
      matchesAdded++;
    }
    return { teamsAdded: teamsAdded, matchesAdded: matchesAdded, skipped: skipped };
  }

  function finish(res, source) {
    if (!res.matchesAdded && !res.teamsAdded) {
      log("No se agregaron datos nuevos (posibles duplicados o campos faltantes). Omitidos: <strong>" + res.skipped + "</strong>.", "info");
    } else {
      log("Fuente <strong>" + source + "</strong>: " + res.matchesAdded + " partidos y " + res.teamsAdded + " equipos nuevos. Omitidos: " + res.skipped + ".", "ok");
    }
    document.dispatchEvent(new Event("ad:data-changed"));
  }

  /* ---------- importación genérica ---------- */
  function importJsonText(text, source) {
    var payload;
    try { payload = JSON.parse(text); }
    catch (e) { log("JSON inválido: " + e.message, "err"); return; }
    var formed = formedFromTeams(payload);
    var raw = extractMatches(payload);
    if (!raw.length) { log("El JSON no contiene un arreglo de partidos (busqué 'matches', 'events', etc.).", "err"); return; }
    var norm = raw.map(function (m) { return normalize(m, formed); });
    finish(applyNormalized(norm, source, formed), source);
  }

  function stripBOM(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

  function detectDelim(line) {
    var cands = [",", ";", "\t", "|"], best = ",", bestN = -1;
    cands.forEach(function (c) {
      var n = line.split(c).length - 1;
      if (n > bestN) { bestN = n; best = c; }
    });
    return best;
  }

  function parseCsv(text) {
    text = stripBOM(text);
    var lines = text.replace(/\r/g, "").split("\n").filter(function (l) { return l.trim() !== ""; });
    if (!lines.length) return [];
    var delim = detectDelim(lines[0]);
    function split(line) {
      var out = [], cur = "", q = false;
      for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (c === '"') {
          if (q && line[i + 1] === '"') { cur += '"'; i++; continue; }
          q = !q; continue;
        }
        if (c === delim && !q) { out.push(cur); cur = ""; continue; }
        cur += c;
      }
      out.push(cur);
      return out;
    }
    var headers = split(lines[0]).map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (l) {
      var cells = split(l);
      var o = {};
      headers.forEach(function (h, i) { o[h] = (cells[i] || "").trim(); });
      return o;
    });
  }

  function importCsvText(text, source) {
    var rows = parseCsv(text);
    if (!rows.length) { log("El CSV está vacío o no tiene filas de datos.", "err"); return; }
    var norm = rows.map(function (m) { return normalize(m, null); });
    finish(applyNormalized(norm, source, null), source);
  }

  function importFile(file) {
    var source = ($("imp-source").value || "").trim() || "Archivo: " + file.name;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result);
      var isCsv = /\.csv$/i.test(file.name) || (text.indexOf("{") !== 0 && text.indexOf(",") > -1);
      log("Archivo <strong>" + file.name + "</strong> leído (" + text.length + " caracteres).", "info");
      if (isCsv) importCsvText(text, source);
      else importJsonText(text, source);
    };
    reader.onerror = function () { log("No se pudo leer el archivo.", "err"); };
    reader.readAsText(file);
  }

  function fetchText(url) {
    return fetch(url, { headers: { Accept: "*/*" } }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  function importFromUrl(url, source) {
    log("Descargando " + url + " …", "info");
    return fetchText(url).then(function (text) {
      var isJson = text.trim().charAt(0) === "{ " || text.trim().charAt(0) === "{" || text.trim().charAt(0) === "[";
      if (isJson) importJsonText(text, source); else importCsvText(text, source);
    }).catch(function (e) {
      log("No se pudo descargar (posible CORS o red): " + e.message + ". Probá pegando el contenido o subiendo el archivo.", "err");
    });
  }

  /* ---------- conectores ---------- */
  function importTheSportsDB(leagueId, season) {
    var source = "TheSportsDB";
    log("TheSportsDB: consultando liga " + leagueId + (season ? " (" + season + ")" : "") + " …", "info");
    var teamsUrl = "https://www.thesportsdb.com/api/v1/json/" + TSDB_KEY + "/lookup_all_teams.php?id=" + encodeURIComponent(leagueId);
    var eventsUrl = season
      ? "https://www.thesportsdb.com/api/v1/json/" + TSDB_KEY + "/eventsseason.php?id=" + encodeURIComponent(leagueId) + "&s=" + encodeURIComponent(season)
      : "https://www.thesportsdb.com/api/v1/json/" + TSDB_KEY + "/eventspastleague.php?id=" + encodeURIComponent(leagueId);

    return Promise.all([fetchText(teamsUrl), fetchText(eventsUrl)]).then(function (parts) {
      var teamsPayload = JSON.parse(parts[0]);
      var eventsPayload = JSON.parse(parts[1]);
      var formed = formedFromTeams(teamsPayload);

      // Dar de alta todos los equipos de la liga con su año de fundación
      var teamsArr = (teamsPayload && teamsPayload.teams) || [];
      var catalogAdded = 0;
      teamsArr.forEach(function (t) {
        if (!t || !t.strTeam) return;
        var had = !!S.findTeamByName(t.strTeam);
        S.ensureTeam(t.strTeam, {
          league: t.strLeague || "",
          source: source,
          formedYear: parseInt(t.intFormedYear, 10) || null
        });
        if (!had) catalogAdded++;
      });

      var events = extractMatches(eventsPayload);
      var norm = events.map(function (m) { return normalize(m, formed); });
      log("TheSportsDB: " + teamsArr.length + " equipos (" + catalogAdded + " nuevos), " + events.length + " eventos, " + Object.keys(formed).length + " años de fundación.", "info");
      var res = applyNormalized(norm, source, formed);
      res.teamsAdded += catalogAdded;
      finish(res, source);
    }).catch(function (e) {
      log("TheSportsDB falló: " + e.message, "err");
    });
  }

  function importOpenLigaDB(shortcut, season) {
    var source = "OpenLigaDB";
    var url = "https://api.openligadb.de/getmatchdata/" + encodeURIComponent(shortcut) + "/" + encodeURIComponent(season);
    log("OpenLigaDB: descargando " + shortcut + " " + season + " …", "info");
    return fetchText(url).then(function (text) {
      var data = JSON.parse(text);
      if (!Array.isArray(data)) { log("OpenLigaDB: respuesta inesperada.", "err"); return; }
      var norm = data.map(function (m) {
        var res = m.matchResults || [];
        var final = null;
        for (var i = 0; i < res.length; i++) if (res[i].resultTypeID === 2) { final = res[i]; break; }
        if (!final && res.length) final = res[res.length - 1];
        return normalize({
          externalId: "oldb-" + m.matchID,
          date: m.matchDateTime,
          competition: m.leagueName,
          home: m.team1 && m.team1.teamName,
          away: m.team2 && m.team2.teamName,
          homeGoals: final ? final.pointsTeam1 : null,
          awayGoals: final ? final.pointsTeam2 : null
        }, null);
      });
      log("OpenLigaDB: " + norm.length + " partidos leídos.", "info");
      finish(applyNormalized(norm, source, null), source);
    }).catch(function (e) {
      log("OpenLigaDB falló: " + e.message, "err");
    });
  }

  function importOpenfootball(url) {
    var source = "openfootball";
    log("openfootball: descargando " + url + " …", "info");
    return fetchText(url).then(function (text) {
      var payload = JSON.parse(text);
      var raw = extractMatches(payload);
      if (!raw.length) { log("openfootball: no encontré partidos en el JSON.", "err"); return; }
      var norm = raw.map(function (m) { return normalize(m, null); });
      log("openfootball: " + raw.length + " partidos en '" + (payload.name || "?") + "'.", "info");
      finish(applyNormalized(norm, source, null), source);
    }).catch(function (e) {
      log("openfootball falló: " + e.message, "err");
    });
  }

  /* ---------- init ---------- */
  function init() {
    if (!$("view-importar")) return;

    $("imp-json-run").addEventListener("click", function () {
      var text = $("imp-json").value.trim();
      if (!text) { log("Pegá primero un JSON.", "err"); return; }
      var source = ($("imp-source").value || "").trim() || "Pegado (JSON)";
      importJsonText(text, source);
    });

    $("imp-file").addEventListener("change", function () {
      if (this.files && this.files[0]) importFile(this.files[0]);
    });

    $("imp-url-run").addEventListener("click", function () {
      var url = $("imp-url").value.trim();
      if (!url) { log("Ingresá una URL.", "err"); return; }
      var source = ($("imp-source").value || "").trim() || "URL";
      importFromUrl(url, source);
    });

    $("imp-tsdb-run").addEventListener("click", function () {
      var id = $("imp-tsdb-league").value.trim();
      if (!id) { log("Ingresá el ID de liga de TheSportsDB (ej: 4328).", "err"); return; }
      importTheSportsDB(id, $("imp-tsdb-season").value.trim());
    });

    $("imp-oldb-run").addEventListener("click", function () {
      importOpenLigaDB($("imp-oldb-league").value.trim() || "bl1", $("imp-oldb-season").value.trim() || "2023");
    });

    $("imp-oftb-run").addEventListener("click", function () {
      var url = $("imp-oftb-url").value.trim();
      if (!url) { log("Ingresá la URL del JSON de openfootball.", "err"); return; }
      importOpenfootball(url);
    });

    $("imp-clear").addEventListener("click", clearLog);
  }

  window.AD.importer = {
    importJsonText: importJsonText,
    importCsvText: importCsvText,
    applyNormalized: applyNormalized,
    normalize: normalize,
    importFromUrl: importFromUrl,
    importTheSportsDB: importTheSportsDB,
    importOpenLigaDB: importOpenLigaDB,
    importOpenfootball: importOpenfootball
  };

  document.addEventListener("DOMContentLoaded", init);
})();
