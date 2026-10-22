/* live.js — alineaciones y estadísticas por partido, en vivo.
   Fuente: API pública de ESPN (`summary?event=<id>`), la misma que ya usa la
   base histórica. Es gratis, no requiere clave y permite CORS, así que se
   consulta directamente desde el navegador.

   Qué trae (verificado): 11 titulares + suplentes por equipo con dorsal,
   posición, si entró/salió y 14 estadísticas por jugador; minuto a minuto
   (goles, tarjetas, cambios); y estadísticas de equipo (posesión, tiros…).

   Cómo se actualiza: bajo demanda, al abrir el partido. La respuesta se
   recorta (~12 KB por partido) y se guarda en localStorage con un tiempo de
   vida según el estado del partido: 45 s si se está jugando, 5 min si todavía
   no empezó y 10 min si terminó. Mientras el panel está abierto y el partido
   está en juego se refresca solo cada minuto.

   Namespace: window.AD.live */
(function () {
  "use strict";

  window.AD = window.AD || {};
  var S = window.AD.store;

  var API = "https://site.api.espn.com/apis/site/v2/sports/soccer/";
  var LS_PREFIX = "futbolityx:live:";
  var LS_INDEX = LS_PREFIX + "index";
  var MAX_MODELS = 24;                 // partidos guardados como máximo
  var MAX_BYTES = 1.6 * 1024 * 1024;   // tope blando para el espejo en localStorage

  var TTL = { in: 45 * 1000, pre: 5 * 60 * 1000, post: 10 * 60 * 1000 };
  var REFRESH = { in: 60 * 1000, pre: 5 * 60 * 1000, post: 0 };

  /* Código interno de competición (openfootball) -> slug de ESPN.
     Solo estos códigos tienen partidos en ESPN; el resto no muestra el botón. */
  var SLUGS = {
    "en.1": "eng.1", "es.1": "esp.1", "de.1": "ger.1", "it.1": "ita.1",
    "fr.1": "fra.1", "nl.1": "ned.1", "pt.1": "por.1", "at.1": "aut.1",
    "be.1": "bel.1", "ch.1": "sui.1", "gr.1": "gre.1", "tr.1": "tur.1",
    "sco.1": "sco.1", "ru.1": "rus.1", "mx.1": "mex.1", "ar.1": "arg.1",
    "br.1": "bra.1", "cz.1": "cze.1", "cn.1": "chn.1", "jp.1": "jpn.1",
    "au.1": "aus.1", "co.1": "col.1", "uefa.cl": "uefa.champions",
    "chi.1": "chi.1", "uru.1": "uru.1", "per.1": "per.1", "bol.1": "bol.1",
    "ven.1": "ven.1",
    "conmebol.libertadores": "conmebol.libertadores",
    "conmebol.sudamericana": "conmebol.sudamericana",
    "conmebol.america": "conmebol.america",
    "fifa.worldq.conmebol": "fifa.worldq.conmebol",
    "uefa.europa": "uefa.europa",
    "uefa.europa.conf": "uefa.europa.conf"
  };

  /* Fuentes de la base que siempre pertenecen a una competición concreta. */
  var SOURCE_CODE = {
    "arg-espn": "ar.1",
    "espn-sudamericana": "conmebol.sudamericana",
    "espn-libertadores": "conmebol.libertadores"
  };

  /* ---------- vocabulario de estadísticas ---------- */
  var STAT_KEY = {
    totalGoals: "g", goalAssists: "a", totalShots: "sh", shotsOnTarget: "sog",
    foulsCommitted: "fc", foulsSuffered: "fa", yellowCards: "yc", redCards: "rc",
    saves: "sv", goalsConceded: "gc", shotsFaced: "sf", ownGoals: "og"
  };
  var STAT_LABEL = [
    ["g", "Goles"], ["a", "Asistencias"], ["sh", "Tiros"], ["sog", "Tiros al arco"],
    ["sv", "Atajadas"], ["gc", "Goles recibidos"], ["sf", "Tiros recibidos"],
    ["fc", "Faltas cometidas"], ["fa", "Faltas recibidas"],
    ["yc", "Amarillas"], ["rc", "Rojas"], ["og", "Autogoles"]
  ];

  /* Estadísticas de equipo: de ESPN a castellano y en un orden estable. */
  var TEAM_STAT = {
    possessionPct: "Posesión",
    totalShots: "Tiros",
    shotsOnTarget: "Tiros al arco",
    wonCorners: "Córners",
    foulsCommitted: "Faltas",
    offsides: "Fueras de juego",
    yellowCards: "Amarillas",
    redCards: "Rojas",
    saves: "Atajadas",
    blockedShots: "Tiros bloqueados",
    accuratePasses: "Pases buenos",
    totalPasses: "Pases",
    passPct: "Precisión de pase",
    accurateCrosses: "Centros buenos",
    totalCrosses: "Centros",
    totalTackles: "Entradas",
    interceptions: "Intercepciones",
    totalClearance: "Despejes",
    penaltyKickGoals: "Penales convertidos",
    penaltyKickShots: "Penales ejecutados"
  };
  var TEAM_ORDER = Object.keys(TEAM_STAT);

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function hhmm(ts) {
    var d = new Date(ts || Date.now());
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\./g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function slugForCode(code) {
    return SLUGS[String(code == null ? "" : code).toLowerCase()] || null;
  }

  function idFromExternal(x) {
    var m = /^espn:(\d+)$/.exec(String(x == null ? "" : x));
    return m ? m[1] : null;
  }

  function shiftDate(date, n) {
    var p = String(date || "").split("-");
    if (p.length !== 3) return "";
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function lsGet(k) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function bytesOf(obj) { try { return JSON.stringify(obj).length; } catch (e) { return 0; } }

  /* ---------- caché de partidos ---------- */
  function modelKey(slug, id) { return LS_PREFIX + "m:" + slug + ":" + id; }

  function putModel(slug, id, model) {
    var key = modelKey(slug, id);
    if (!lsSet(key, model)) return;
    var idx = lsGet(LS_INDEX);
    if (!Array.isArray(idx)) idx = [];
    idx = idx.filter(function (x) { return x !== key; });
    idx.push(key);
    var total = 0;
    while (idx.length > MAX_MODELS) { lsDel(idx.shift()); }
    for (var i = 0; i < idx.length; i++) {
      total += (lsGet(idx[i]) ? bytesOf(lsGet(idx[i])) : 0);
      if (total > MAX_BYTES && idx.length > 1) { lsDel(idx.shift()); i = -1; total = 0; }
    }
    lsSet(LS_INDEX, idx);
  }

  function readModel(slug, id) {
    var m = lsGet(modelKey(slug, id));
    if (!m || m.slug !== slug || String(m.id) !== String(id)) return null;
    return m;
  }

  function isFresh(m) {
    if (!m || !m.ts) return false;
    var ttl = TTL[(m.status && m.status.state) || "pre"];
    if (!isFinite(ttl) || ttl <= 0) return true;
    return (Date.now() - m.ts) < ttl;
  }

  /* ---------- resolución del evento de ESPN ---------- */
  var sbCache = {};
  var idCache = {};

  function scoreboard(slug, date) {
    var k = slug + "|" + date;
    if (sbCache[k]) return Promise.resolve(sbCache[k]);
    return fetch(API + slug + "/scoreboard?dates=" + String(date).replace(/-/g, "") + "&limit=200", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        var evs = (j && j.events) || [];
        sbCache[k] = evs;
        return evs;
      })
      .catch(function () { sbCache[k] = []; return []; });
  }

  /* Normalización de nombres de equipo para emparejar la base con ESPN.
     La base usa nombres largos ("FC Bayern München") y ESPN a veces los
     traduce o abrevia ("Bayern Munich", "Athletico-PR"). */
  var GENERIC = {
    fc: 1, cf: 1, sc: 1, ac: 1, acf: 1, afc: 1, ss: 1, ssc: 1, us: 1, as: 1,
    rc: 1, rcd: 1, ca: 1, cd: 1, sd: 1, ud: 1, sv: 1, tsg: 1, vfl: 1, vfb: 1,
    fsv: 1, ogc: 1, osc: 1, bsc: 1, kv: 1, sk: 1, fk: 1, ifk: 1, bk: 1,
    club: 1, calcio: 1, football: 1, futbol: 1, clube: 1, de: 1, del: 1, du: 1,
    the: 1, della: 1, di: 1, cp: 1, ec: 1, fbc: 1, fbpa: 1, se: 1, af: 1,
    ii: 1, iii: 1, iv: 1, cf1: 1
  };
  var TRANSLATE = { munchen: "munich", koln: "cologne", lisboa: "lisbon" };

  function tokens(s) {
    var t = norm(s).replace(/\([^)]*\)/g, " ");
    var raw = t.split(" "), out = [];
    for (var i = 0; i < raw.length; i++) {
      var w = raw[i];
      if (!w || /^\d+$/.test(w) || GENERIC[w]) continue;
      out.push(TRANSLATE[w] || w);
    }
    return out;
  }

  function levRatio(a, b) {
    var m = a.length, n = b.length;
    if (!m || !n) return 0;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur;
    }
    return 1 - prev[n] / Math.max(m, n);
  }

  function tokenMatch(a, b) {
    if (a === b) return 1;
    if (a.length >= 4 && b.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return 0.9;
    if (a.length >= 5 && b.length >= 5) {
      var s = levRatio(a, b);
      if (s >= 0.85) return s;
    }
    return 0;
  }

  function teamSimilarity(a, b) {
    var A = tokens(a), B = tokens(b);
    if (!A.length || !B.length) return 0;
    var hit = 0, i, j;
    for (i = 0; i < A.length; i++) {
      var best = 0;
      for (j = 0; j < B.length; j++) best = Math.max(best, tokenMatch(A[i], B[j]));
      hit += best;
    }
    var min = Math.min(A.length, B.length), max = Math.max(A.length, B.length);
    var sim = hit / min;
    return sim * (max / min > 2 ? 0.85 : 1);
  }

  function pairScore(fh, fa, eh, ea) {
    var a = (teamSimilarity(fh, eh) + teamSimilarity(fa, ea)) / 2;
    var b = (teamSimilarity(fh, ea) + teamSimilarity(fa, eh)) / 2;
    return Math.max(a, b);
  }

  function findEvent(ctx) {
    if (!ctx.date || !ctx.home || !ctx.away) return Promise.resolve(null);
    var dates = [ctx.date, shiftDate(ctx.date, 1), shiftDate(ctx.date, -1)];
    return Promise.all(dates.map(function (d) {
      return d ? scoreboard(ctx.slug, d) : Promise.resolve([]);
    })).then(function (lists) {
      var evs = [], i, j;
      for (i = 0; i < lists.length; i++) {
        for (j = 0; j < lists[i].length; j++) evs.push(lists[i][j]);
      }
      var best = null, bestScore = 0, second = 0;
      for (i = 0; i < evs.length; i++) {
        var ev = evs[i];
        var comp = ev.competitions && ev.competitions[0];
        if (!comp || !comp.competitors) continue;
        var home = null, away = null;
        for (j = 0; j < comp.competitors.length; j++) {
          var c = comp.competitors[j];
          if (c.homeAway === "home") home = c;
          else if (c.homeAway === "away") away = c;
        }
        if (!home || !away || !home.team || !away.team) continue;
        var sc = pairScore(ctx.home, ctx.away, home.team.displayName, away.team.displayName);
        if (sc > bestScore) { second = bestScore; bestScore = sc; best = ev; }
        else if (sc > second) second = sc;
      }
      if (!best || bestScore < 0.7) return null;
      /* Si hay dos candidatos parecidos, no adivinamos. */
      if (bestScore < 0.95 && (bestScore - second) < 0.2) return null;
      return String(best.id);
    });
  }

  function resolveEvent(ctx) {
    if (ctx.eventId) return Promise.resolve(String(ctx.eventId));
    var k = ctx.slug + "|" + ctx.date + "|" + norm(ctx.home) + "|" + norm(ctx.away);
    if (idCache[k] !== undefined) return Promise.resolve(idCache[k]);
    return findEvent(ctx).then(function (id) {
      idCache[k] = id;
      return id;
    });
  }

  /* ---------- descarga + recorte ---------- */
  function fetchSummary(slug, id) {
    return fetch(API + slug + "/summary?event=" + encodeURIComponent(id), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  function trimPlayer(p) {
    var a = p.athlete || {};
    var out = {
      id: a.id || "",
      n: a.displayName || a.shortName || "",
      sh: a.shortName || "",
      j: p.jersey != null ? String(p.jersey) : "",
      pos: (p.position && p.position.abbreviation) || "",
      posN: (p.position && p.position.displayName) || "",
      st: p.starter ? 1 : 0,
      in: p.subbedIn ? 1 : 0,
      out: p.subbedOut ? 1 : 0
    };
    var st = {}, has = false;
    for (var i = 0; i < (p.stats || []).length; i++) {
      var x = p.stats[i];
      var k = STAT_KEY[x && x.name];
      if (!k) continue;
      var v = Number(x.value);
      if (isFinite(v) && v !== 0) { st[k] = v; has = true; }
    }
    if (has) out.s = st;
    return out;
  }

  function eventKind(type, text) {
    var t = String(type || "");
    var s = String(text || "").toLowerCase();
    if (t === "goal") return "goal";
    if (t === "own-goal") return "og";
    if (t === "penalty---scored" || t === "penalty---missed" || t === "penalty-kick") {
      return /miss|saved/i.test(s) ? "pen-miss" : "pen";
    }
    if (t === "yellow-card") return "yc";
    if (t === "red-card" || t === "second-yellow") return "rc";
    if (t === "substitution") return "sub";
    if (t === "var") return "var";
    return "";
  }

  function eventText(kind, names, raw) {
    var who = names.join(" ⇄ ");
    if (kind === "goal") return "Gol" + (who ? " de " + who : "");
    if (kind === "og") return "Autogol" + (who ? " de " + who : "");
    if (kind === "pen") return "Gol de penal" + (who ? " · " + who : "");
    if (kind === "pen-miss") return "Penal fallado" + (who ? " · " + who : "");
    if (kind === "yc") return "Tarjeta amarilla" + (who ? " · " + who : "");
    if (kind === "rc") return "Tarjeta roja" + (who ? " · " + who : "");
    if (kind === "sub") return "Cambio" + (who ? " · " + who : "");
    if (kind === "var") return "Revisión de VAR" + (who ? " · " + who : "");
    return String(raw || "");
  }

  function trim(summary, slug, id) {
    var s = summary || {};
    var hc = (s.header && s.header.competitions && s.header.competitions[0]) || {};
    var st = (hc.status && hc.status.type) || {};
    var model = {
      id: String(id),
      slug: slug,
      ts: Date.now(),
      status: {
        state: st.state || "pre",
        name: st.name || "",
        detail: st.detail || "",
        short: st.shortDetail || "",
        completed: !!st.completed,
        period: (hc.status && hc.status.period) || 0,
        clock: (hc.status && hc.status.displayClock) || ""
      },
      date: hc.date || "",
      venue: "",
      attendance: null,
      teams: [],
      lineups: [],
      stats: [],
      events: []
    };

    if (s.gameInfo) {
      var v = s.gameInfo.venue || {};
      model.venue = v.fullName || v.shortName || v.name || "";
      if (s.gameInfo.attendance != null && isFinite(Number(s.gameInfo.attendance))) {
        model.attendance = Number(s.gameInfo.attendance);
      }
    }

    var compBySide = {}, rosBySide = {}, i, j;
    for (i = 0; i < (hc.competitors || []).length; i++) {
      var c = hc.competitors[i];
      compBySide[c.homeAway === "away" ? "away" : "home"] = c;
    }
    for (i = 0; i < (s.rosters || []).length; i++) {
      var r = s.rosters[i];
      rosBySide[r.homeAway === "away" ? "away" : "home"] = r;
    }

    ["home", "away"].forEach(function (side) {
      var c = compBySide[side] || {};
      var r = rosBySide[side] || {};
      var t = r.team || c.team || {};
      var formation = r.formation;
      if (formation && typeof formation !== "string") formation = formation.name || formation.text || "";
      model.teams.push({
        side: side,
        id: t.id || "",
        name: t.displayName || t.name || (side === "home" ? "Local" : "Visitante"),
        short: t.shortDisplayName || t.name || "",
        abbrev: t.abbreviation || "",
        score: c.score != null && c.score !== "" ? String(c.score) : null,
        winner: !!c.winner
      });
      var players = [];
      for (var k = 0; k < (r.roster || []).length; k++) players.push(trimPlayer(r.roster[k]));
      model.lineups.push({ side: side, formation: String(formation || ""), players: players });
    });

    /* Estadísticas de equipo */
    var bsTeams = (s.boxscore && s.boxscore.teams) || [];
    for (i = 0; i < bsTeams.length; i++) {
      var bt = bsTeams[i];
      var items = [];
      for (j = 0; j < (bt.statistics || []).length; j++) {
        var x = bt.statistics[j];
        if (!x || !TEAM_STAT[x.name]) continue;
        var dv = x.displayValue != null ? String(x.displayValue) : (x.value != null ? String(x.value) : "");
        if (dv === "") continue;
        items.push([x.name, dv]);
      }
      model.stats.push({ side: bt.homeAway === "away" ? "away" : "home", items: items });
    }

    /* Minuto a minuto (solo lo que interesa: goles, tarjetas, cambios, VAR) */
    var teamById = {}, teamByName = {};
    for (i = 0; i < model.teams.length; i++) {
      teamById[model.teams[i].id] = model.teams[i];
      teamByName[norm(model.teams[i].name)] = model.teams[i];
    }
    var keys = s.keyEvents || [];
    for (i = 0; i < keys.length; i++) {
      var e = keys[i];
      var kind = eventKind(e.type && e.type.type, e.text);
      if (!kind) continue;
      var names = [];
      for (j = 0; j < (e.participants || []).length; j++) {
        var pt = e.participants[j];
        if (pt && pt.athlete && pt.athlete.displayName) names.push(pt.athlete.displayName);
      }
      if (!names.length && e.athlete && e.athlete.displayName) names.push(e.athlete.displayName);
      var team = (e.team && (teamById[e.team.id] || teamByName[norm(e.team.displayName)])) || null;
      model.events.push({
        c: (e.clock && e.clock.displayValue) || "",
        p: (e.period && e.period.number) || 0,
        k: kind,
        side: team ? team.side : "",
        team: team ? team.name : ((e.team && e.team.displayName) || ""),
        t: eventText(kind, names, e.text)
      });
    }
    model.events.reverse(); /* lo más reciente arriba */

    return model;
  }

  /* ---------- estado de la vista ---------- */
  var current = null;      // contexto del partido abierto
  var view = { model: null, tab: "lineups" };
  var loadSeq = 0;
  var timer = null;

  function ensureModal() {
    if ($("live-modal")) return;
    var d = document.createElement("div");
    d.id = "live-modal";
    d.className = "live-modal";
    d.setAttribute("aria-hidden", "true");
    d.innerHTML =
      '<div class="live-backdrop" data-live-close="1"></div>' +
      '<div class="live-sheet" role="dialog" aria-modal="true" aria-labelledby="live-title" tabindex="-1">' +
        '<div class="live-head">' +
          '<div class="live-top">' +
            '<span class="live-kicker">Partido · datos de ESPN</span>' +
            '<button class="live-x" type="button" data-live-close="1" aria-label="Cerrar">✕</button>' +
          "</div>" +
          '<h2 class="live-title" id="live-title">Partido</h2>' +
          '<div class="live-sub" id="live-sub"></div>' +
          '<div class="live-score" id="live-score"></div>' +
        "</div>" +
        '<div class="live-tabs" id="live-tabs"></div>' +
        '<div class="live-body" id="live-body"></div>' +
        '<div class="live-foot" id="live-foot"></div>' +
      "</div>";
    document.body.appendChild(d);

    d.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-live-close]")) { close(); return; }
      var tabBtn = t.closest("[data-lt]");
      if (tabBtn) { view.tab = tabBtn.getAttribute("data-lt"); renderTab(); return; }
      var lp = t.closest("[data-lp]");
      if (lp) {
        var box = lp.querySelector(".lp-stats");
        if (box) {
          var open = lp.classList.toggle("is-open");
          box.hidden = !open;
          var btn = lp.querySelector(".lp");
          if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
        }
        return;
      }
      if (t.closest("[data-live-reload]")) { load(true); }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && current) close();
    });
  }

  function openModal() {
    var d = $("live-modal");
    if (!d) return;
    d.classList.add("is-on");
    d.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    var sheet = d.querySelector(".live-sheet");
    if (sheet) { try { sheet.focus(); } catch (e) {} }
  }

  function close() {
    stopTimer();
    loadSeq++;
    current = null;
    view = { model: null, tab: "lineups" };
    var d = $("live-modal");
    if (d) { d.classList.remove("is-on"); d.setAttribute("aria-hidden", "true"); }
    document.documentElement.style.overflow = "";
  }

  function stopTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function scheduleRefresh() {
    stopTimer();
    var m = view.model;
    if (!m || !current) return;
    var state = (m.status && m.status.state) || "pre";
    var ms = REFRESH[state] || 0;
    if (!ms) return;
    /* Si todavía no empezó, no tiene sentido refrescar si falta mucho. */
    if (state === "pre" && m.date) {
      var kick = Date.parse(m.date);
      if (isFinite(kick) && kick - Date.now() > 3 * 3600 * 1000) return;
    }
    timer = setTimeout(function () { load(true); }, ms);
  }

  /* ---------- carga ---------- */
  function load(force) {
    var ctx = current;
    if (!ctx) return;
    var seq = ++loadSeq;
    stopTimer();

    var cached = ctx.eventId ? readModel(ctx.slug, ctx.eventId) : null;
    if (cached && !force && isFresh(cached)) {
      renderModel(cached);
      return;
    }
    if (cached && force && isFresh(cached) === false) {
      /* se refresca, pero si falla la red seguimos mostrando lo guardado */
    }

    setBusy(true);
    renderShell();

    resolveEvent(ctx).then(function (id) {
      if (seq !== loadSeq) return null;
      if (!id) { renderNoEvent(); return null; }
      ctx.eventId = id;

      var fromCache = readModel(ctx.slug, id);
      if (fromCache && !force && isFresh(fromCache)) { renderModel(fromCache); return null; }

      return fetchSummary(ctx.slug, id).then(function (summary) {
        var model = trim(summary, ctx.slug, id);
        putModel(ctx.slug, id, model);
        if (seq === loadSeq) renderModel(model);
      }).catch(function (err) {
        if (seq !== loadSeq) return;
        if (fromCache) renderModel(fromCache, true);
        else renderError(err);
      });
    }).catch(function (err) {
      if (seq === loadSeq) renderError(err);
    }).then(function () {
      if (seq === loadSeq) setBusy(false);
    });
  }

  function setBusy(on) {
    var f = $("live-foot");
    if (!f) return;
    if (on) {
      f.innerHTML = '<span class="live-loading">Consultando a ESPN…</span>';
    }
  }

  /* ---------- render ---------- */
  function renderShell() {
    var ctx = current;
    var m = view.model;
    if (!ctx) return;

    if ($("live-title")) $("live-title").textContent = ctx.competition || "Partido";
    if ($("live-sub")) {
      $("live-sub").textContent = m && m.date ? whenText(m.date) : whenTextFromDate(ctx.date);
    }
    var host = $("live-score");
    if (!host) return;
    if (m) { host.innerHTML = scoreHTML(m); return; }
    host.innerHTML = '<div class="live-vs">' + esc(ctx.home || "Local") + ' <b>vs</b> ' + esc(ctx.away || "Visitante") + "</div>";
  }

  function whenTextFromDate(date) {
    if (!date) return "";
    return date.split("-").reverse().join("/");
  }

  /* Reutiliza el formateo de fecha/hora de la portada (respeta el país elegido). */
  function whenText(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso || ""));
    if (!m) return whenTextFromDate(iso);
    var f = { date: m[1] + "-" + m[2] + "-" + m[3], time: m[4] + ":" + m[5] + " UTC+0" };
    if (window.AD.v2 && window.AD.v2.whenText) {
      try { return window.AD.v2.whenText(f); } catch (e) {}
    }
    return f.date.split("-").reverse().join("/") + " · " + f.time;
  }

  function statusInfo(m) {
    var st = (m && m.status) || {};
    if (st.state === "in") {
      var clock = st.clock || st.detail || "";
      return { cls: "is-live", text: "EN VIVO" + (clock ? " · " + clock : "") };
    }
    if (st.completed || st.state === "post") {
      return { cls: "is-post", text: st.short || st.detail || "Finalizado" };
    }
    return { cls: "is-pre", text: "Programado" };
  }

  function scoreHTML(m) {
    var t = m.teams || [];
    if (t.length < 2) return "";
    var st = statusInfo(m);
    var pre = (m.status && m.status.state === "pre");
    var h = t[0], a = t[1];
    var score = pre
      ? '<div class="ls-vs">vs</div>'
      : '<div class="ls-nums"><span>' + esc(h.score == null ? "–" : h.score) + "</span>" +
        '<i>:</i><span>' + esc(a.score == null ? "–" : a.score) + "</span></div>";
    return '<div class="ls-row">' +
      '<div class="ls-team home">' + badgeHTML(h) +
        '<span class="ls-name">' + esc(h.name) + "</span></div>" +
      '<div class="ls-mid">' + score +
        '<span class="live-pill ' + st.cls + '">' + esc(st.text) + "</span></div>" +
      '<div class="ls-team away">' + badgeHTML(a) +
        '<span class="ls-name">' + esc(a.name) + "</span></div>" +
      "</div>";
  }

  /* Iniciales del equipo en vez de escudo: la app no usa logos oficiales. */
  function badgeHTML(t) {
    var letters = String(t.abbrev || t.name || "")
      .replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
    return '<span class="ls-badge" aria-hidden="true">' + esc(letters) + "</span>";
  }

  function hasTeamStats(m) {
    for (var i = 0; i < m.stats.length; i++) {
      if (m.stats[i].items && m.stats[i].items.length) return true;
    }
    return false;
  }

  function renderModel(m, stale) {
    view.model = m;
    /* "Alineaciones" siempre está: si todavía no se publicaron, ahí se explica. */
    var tabs = [["lineups", "Alineaciones"]];
    if (m.events.length) tabs.push(["events", "Minuto a minuto"]);
    if (hasTeamStats(m)) tabs.push(["stats", "Estadísticas"]);

    var ok = false;
    for (var j = 0; j < tabs.length; j++) if (tabs[j][0] === view.tab) ok = true;
    if (!ok) view.tab = tabs[0][0];

    renderShell();
    var tabHost = $("live-tabs");
    if (tabHost) {
      tabHost.innerHTML = tabs.map(function (t) {
        return '<button type="button" class="live-tab' + (t[0] === view.tab ? " is-active" : "") +
          '" data-lt="' + t[0] + '">' + esc(t[1]) + "</button>";
      }).join("");
    }
    renderFooter(m, stale);
    renderTab();
    scheduleRefresh();
  }

  function renderTab() {
    var host = $("live-body");
    var m = view.model;
    if (!host) return;
    if (!m) return;

    var tabs = host.parentNode.querySelectorAll("[data-lt]");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("is-active", tabs[i].getAttribute("data-lt") === view.tab);
    }

    if (view.tab === "events") { host.innerHTML = eventsHTML(m); return; }
    if (view.tab === "stats") { host.innerHTML = statsHTML(m); return; }
    host.innerHTML = lineupsHTML(m);
  }

  function migrateNote(m) {
    return '<div class="live-empty">' +
      "<strong>Todavía no hay alineaciones publicadas.</strong>" +
      "<p>ESPN suele publicarlas cerca del inicio del partido (alrededor de una hora antes). " +
      "Cuando estén, aparecen acá automáticamente" + (m.date ? " (" + esc(whenText(m.date)) + ")" : "") + ".</p>" +
      "</div>";
  }

  function lineupsHTML(m) {
    var any = false, i;
    for (i = 0; i < m.lineups.length; i++) if (m.lineups[i].players.length) any = true;
    if (!any) return migrateNote(m);

    var parts = ['<div class="lu-grid">'];
    for (i = 0; i < m.teams.length; i++) parts.push(lineupTeam(m, i));
    parts.push("</div>");
    return parts.join("");
  }

  function lineupTeam(m, i) {
    var t = m.teams[i];
    var l = m.lineups[i] || { players: [], formation: "" };
    var start = [], subs = [], k;
    for (k = 0; k < l.players.length; k++) (l.players[k].st ? start : subs).push(l.players[k]);

    function group(title, list, from) {
      if (!list.length) return "";
      var out = ['<div class="lu-group"><h4>' + esc(title) + " <span>" + list.length + "</span></h4>"];
      for (var n = 0; n < list.length; n++) out.push(playerHTML(list[n], i + ":" + (from + n)));
      out.push("</div>");
      return out.join("");
    }

    /* El índice dentro de cada lista se usa solo como key visual; el detalle
       de cada jugador se muestra al tocarlo. */
    return '<section class="lu-team">' +
      '<header class="lu-head">' +
        badgeHTML(t) +
        '<span class="lu-team-name">' + esc(t.name) + "</span>" +
        (l.formation ? '<span class="lu-form">' + esc(l.formation) + "</span>" : "") +
      "</header>" +
      group("Titulares", start, 0) +
      group("Suplentes", subs, start.length) +
    "</section>";
  }

  function badges(p) {
    var out = "";
    var s = p.s || {};
    if (s.g) out += '<span class="bd bd-goal">⚽ ' + s.g + "</span>";
    if (s.a) out += '<span class="bd bd-assist">A ' + s.a + "</span>";
    if (s.yc) out += '<span class="bd bd-yc">🟨</span>';
    if (s.rc) out += '<span class="bd bd-rc">🟥</span>';
    if (s.og) out += '<span class="bd bd-og">AG</span>';
    if (s.sv) out += '<span class="bd bd-save">SV ' + s.sv + "</span>";
    if (p.in) out += '<span class="bd bd-in">↑</span>';
    if (p.out) out += '<span class="bd bd-out">↓</span>';
    return out;
  }

  /* Posición de ESPN (inglés) a una etiqueta corta en castellano. */
  function posLabel(p) {
    var en = String(p.posN || "").toLowerCase();
    var ab = String(p.pos || "").toUpperCase();
    if (ab === "G" || /goalkeeper/.test(en)) return "Arquero";
    if (/left back/.test(en)) return "Lateral izq.";
    if (/right back/.test(en)) return "Lateral der.";
    if (/(center|centre) left defender/.test(en)) return "Central izq.";
    if (/(center|centre) right defender/.test(en)) return "Central der.";
    if (/defender|back/.test(en)) return "Defensor";
    if (/defensive midfield/.test(en)) return "Volante central";
    if (/attacking midfield/.test(en)) return "Mediapunta";
    if (/left midfield/.test(en)) return "Volante izq.";
    if (/right midfield/.test(en)) return "Volante der.";
    if (/midfield/.test(en)) return "Volante";
    if (/left wing/.test(en)) return "Extremo izq.";
    if (/right wing/.test(en)) return "Extremo der.";
    if (/forward|striker/.test(en)) return "Delantero";
    if (/sweeper/.test(en)) return "Líbero";
    return p.posN || ab || "";
  }

  function playerHTML(p, key) {
    var id = "lp-" + String(key).replace(/[^0-9a-z]/gi, "-");
    var stats = "";
    var s = p.s || {}, rows = [], i;
    var keeper = /arquero/i.test(posLabel(p));
    for (i = 0; i < STAT_LABEL.length; i++) {
      var k = STAT_LABEL[i][0];
      /* Goles/tiros recibidos solo tienen sentido para el arquero. */
      if (!keeper && (k === "gc" || k === "sf")) continue;
      var v = s[k];
      if (v) rows.push('<span class="lp-st"><b>' + esc(v) + "</b> " + esc(STAT_LABEL[i][1]) + "</span>");
    }
    if (rows.length) stats = '<div class="lp-stats" id="' + id + '" hidden>' + rows.join("") + "</div>";

    return '<div class="lp-item" data-lp="' + esc(key) + '">' +
      '<button type="button" class="lp" aria-expanded="false">' +
        '<span class="lp-j">' + esc(p.j || "—") + "</span>" +
        '<span class="lp-main">' +
          '<span class="lp-name">' + esc(p.n) + "</span>" +
          '<span class="lp-meta">' + esc(posLabel(p)) + "</span>" +
        "</span>" +
        '<span class="lp-bd">' + badges(p) + "</span>" +
      "</button>" + stats +
    "</div>";
  }

  function eventsHTML(m) {
    if (!m.events.length) {
      return '<div class="live-empty"><strong>Sin acciones para mostrar.</strong>' +
        "<p>El minuto a minuto aparece cuando el partido arranca.</p></div>";
    }
    var out = ['<ul class="ev-list">'];
    for (var i = 0; i < m.events.length; i++) {
      var e = m.events[i];
      var icon = { goal: "⚽", og: "⚽", pen: "🎯", "pen-miss": "❌", yc: "🟨", rc: "🟥", sub: "🔄", var: "📺" }[e.k] || "•";
      out.push('<li class="ev ev-' + esc(e.k) + '">' +
        '<span class="ev-min">' + esc(e.c || "") + "</span>" +
        '<span class="ev-ico" aria-hidden="true">' + icon + "</span>" +
        '<span class="ev-txt">' + esc(e.t) +
          (e.side ? ' <i class="ev-side ' + e.side + '"></i>' : "") + "</span>" +
        "</li>");
    }
    out.push("</ul>");
    out.push('<p class="live-hint">Más reciente primero · fuente: ESPN</p>');
    return out.join("");
  }

  function statsHTML(m) {
    var home = null, away = null, i, j;
    for (i = 0; i < m.stats.length; i++) {
      if (m.stats[i].side === "home") home = m.stats[i];
      else away = m.stats[i];
    }
    if (!home && !away) {
      return '<div class="live-empty"><strong>Sin estadísticas de equipo.</strong>' +
        "<p>Se publican cuando el partido está en juego.</p></div>";
    }
    var map = {};
    function add(list, pos) {
      if (!list) return;
      for (var k = 0; k < list.items.length; k++) {
        var name = list.items[k][0];
        if (!map[name]) map[name] = [null, null];
        map[name][pos] = list.items[k][1];
      }
    }
    add(home, 0);
    add(away, 1);

    var rows = [], seen = {};
    function pushRow(name) {
      if (seen[name]) return;
      seen[name] = 1;
      var v = map[name];
      if (!v || (v[0] == null && v[1] == null)) return;
      rows.push(cmpRow(name, v[0], v[1]));
    }
    for (i = 0; i < TEAM_ORDER.length; i++) pushRow(TEAM_ORDER[i]);
    for (var name in map) { if (map.hasOwnProperty(name)) pushRow(name); }

    var t = m.teams || [];
    return '<div class="cmp-head">' +
        '<span>' + esc(t[0] ? t[0].name : "Local") + "</span>" +
        "<span>Equipo</span>" +
        '<span class="right">' + esc(t[1] ? t[1].name : "Visitante") + "</span>" +
      "</div>" +
      '<div class="cmp">' + rows.join("") + "</div>";
  }

  function num(v) {
    if (v == null) return null;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : null;
  }

  function cmpRow(name, hv, av) {
    var label = TEAM_STAT[name] || name;
    var pct = (name === "possessionPct" || name === "passPct" || name === "crossPct" || /Pct$/.test(name));
    var h = hv == null ? "—" : hv;
    var a = av == null ? "—" : av;
    if (pct) {
      var hp = num(h), ap = num(av);
      if (hp != null && hp > 0 && hp <= 1) h = Math.round(hp * 100) + "%";
      if (ap != null && ap > 0 && ap <= 1) a = Math.round(ap * 100) + "%";
    }
    var hn = num(hv), an = num(av);
    var tot = (hn || 0) + (an || 0);
    var w = tot > 0 ? Math.round(100 * (hn || 0) / tot) : 50;
    return '<div class="cmp-row">' +
      '<span class="cmp-v">' + esc(h) + "</span>" +
      '<span class="cmp-l">' + esc(label) +
        '<span class="cmp-bar"><i class="h" style="width:' + w + '%"></i><i class="a"></i></span>' +
      "</span>" +
      '<span class="cmp-v right">' + esc(a) + "</span>" +
    "</div>";
  }

  function renderFooter(m, stale) {
    var f = $("live-foot");
    if (!f) return;
    var st = statusInfo(m);
    var extra = "";
    if (m.venue) extra += " · " + esc(m.venue);
    if (m.attendance) extra += " · " + Number(m.attendance).toLocaleString("es") + " espectadores";
    var note = stale ? " · sin conexión: se muestra lo último guardado" : "";
    f.innerHTML =
      '<div class="live-meta">' +
        '<span class="live-pill ' + st.cls + '">' + esc(st.text) + "</span>" +
        '<span class="live-src">ESPN · actualizado ' + hhmm(m.ts) + (extra ? extra : "") + note + "</span>" +
      "</div>" +
      '<button type="button" class="btn btn-mini btn-ghost" data-live-reload="1">Actualizar</button>';
  }

  function renderNoEvent() {
    view.model = null;
    renderShell();
    var today = new Date().toISOString().slice(0, 10);
    var future = (current && current.date) ? current.date >= today : false;
    if ($("live-tabs")) $("live-tabs").innerHTML = "";
    if ($("live-body")) {
      $("live-body").innerHTML = '<div class="live-empty">' +
        (future
          ? "<strong>ESPN todavía no tiene la ficha de este partido.</strong>" +
            "<p>Las fichas se publican cuando se acerca la fecha. Volvé a probar el día del partido.</p>"
          : "<strong>No encontramos este partido en ESPN.</strong>" +
            "<p>Puede que no esté en su catálogo. Los partidos de las ligas con cobertura " +
            "(Europa, América y copas internacionales) sí suelen aparecer.</p>") +
        '<button type="button" class="btn btn-mini btn-ghost" data-live-reload="1">Volver a buscar</button>' +
        "</div>";
    }
    if ($("live-foot")) $("live-foot").innerHTML = '<span class="live-src">Fuente: ESPN</span>';
  }

  function renderError(err) {
    view.model = null;
    if ($("live-tabs")) $("live-tabs").innerHTML = "";
    if ($("live-body")) {
      $("live-body").innerHTML = '<div class="live-empty">' +
        "<strong>No se pudieron cargar los datos.</strong>" +
        "<p>" + esc(err && err.message ? err.message : String(err)) + "</p>" +
        '<button type="button" class="btn btn-mini btn-ghost" data-live-reload="1">Reintentar</button>' +
        "</div>";
    }
    if ($("live-foot")) $("live-foot").innerHTML = '<span class="live-src">Fuente: ESPN</span>';
  }

  /* ---------- API pública ---------- */
  function open(ctx) {
    if (!ctx || !ctx.slug) return false;
    ensureModal();
    current = {
      slug: ctx.slug,
      eventId: ctx.eventId ? String(ctx.eventId) : null,
      date: ctx.date || "",
      home: ctx.home || "",
      away: ctx.away || "",
      competition: ctx.competition || ""
    };
    view = { model: null, tab: "lineups" };
    loadSeq++;
    if ($("live-tabs")) $("live-tabs").innerHTML = "";
    if ($("live-body")) $("live-body").innerHTML = '<div class="live-empty">Cargando alineaciones…</div>';
    openModal();
    load(false);
    return true;
  }

  /* ¿Se puede mostrar el detalle de este partido? */
  function canShow(fixture) {
    if (!fixture) return false;
    if (fixture.slug) return true;
    if (fixture.code && slugForCode(fixture.code)) return true;
    return false;
  }

  /* Código interno de la competición de un partido ya guardado (no guarda
     `code`, así que se deduce por la fuente y por el nombre). */
  function codeForMatch(m) {
    if (!m) return null;
    var code = SOURCE_CODE[m.source] || null;
    if (code) return code;
    var map = nameToCode();
    code = map[norm(m.competition)] || null;
    if (!code && /\(argentina\)$/i.test(String(m.competition || ""))) code = "ar.1";
    return code;
  }

  /* Contexto a partir de un partido del historial (vista "Partidos"). */
  function contextForMatch(matchId) {
    if (!S || !S.state) return null;
    var m = null, i;
    for (i = 0; i < S.state.matches.length; i++) {
      if (String(S.state.matches[i].id) === String(matchId)) { m = S.state.matches[i]; break; }
    }
    if (!m) return null;
    var id = idFromExternal(m.externalId);
    if (!id) return null; /* solo partidos que existen en ESPN */
    var code = codeForMatch(m);
    var slug = code ? slugForCode(code) : null;
    if (!slug) return null;
    var h = S.getTeam(m.homeId), a = S.getTeam(m.awayId);
    return {
      slug: slug,
      eventId: id,
      date: m.date,
      home: h ? h.name : "",
      away: a ? a.name : "",
      competition: m.competition || ""
    };
  }

  /* ¿El partido guardado tiene ficha en ESPN? (se usa al pintar la tabla) */
  function canShowMatch(m) {
    if (!m || !idFromExternal(m.externalId)) return false;
    var code = codeForMatch(m);
    return !!(code && slugForCode(code));
  }

  var nameMapCache = null;
  function nameToCode() {
    if (nameMapCache) return nameMapCache;
    nameMapCache = {};
    var leagues = (window.AD.dataset && window.AD.dataset.leagues) || {};
    for (var code in leagues) {
      if (!leagues.hasOwnProperty(code)) continue;
      if (!slugForCode(code)) continue;
      nameMapCache[norm(leagues[code])] = code;
    }
    return nameMapCache;
  }

  function openMatch(matchId) {
    var ctx = contextForMatch(matchId);
    if (!ctx) return false;
    return open(ctx);
  }

  /* Delegación: botones "Jugadores" en la tabla de partidos. */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var b = t.closest('[data-action="live-match"]');
    if (!b) return;
    e.preventDefault();
    openMatch(b.getAttribute("data-id"));
  });

  window.AD.live = {
    open: open,
    openMatch: openMatch,
    canShow: canShow,
    canShowMatch: canShowMatch,
    contextForMatch: contextForMatch,
    slugForCode: slugForCode,
    close: close
  };
})();
