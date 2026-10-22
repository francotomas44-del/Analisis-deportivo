/* livehoy.js — análisis en vivo para la portada "Hoy".
   ---------------------------------------------------------------
   Qué hace
   - Detecta los partidos que están en juego o que empiezan dentro de la
     próxima hora (los primeros 30 de la portada, que son los que se ven).
   - Consulta la ficha pública de ESPN (`summary?event=<id>`) y arma, para
     cada partido, un análisis con: minuto, marcador, posesión, tiros, tiros
     al arco, xG estimado, remates dentro del área, córners, faltas, tarjetas,
     atajadas, presión de los últimos 10 minutos, rendimiento del arquero,
     cambios, eventos e historial entre los dos equipos.
   - Recalcula las probabilidades 1X2 con el marcador y el minuto actuales
     (modelo de Poisson sobre los goles que faltan, ajustado por xG, rojas y
     resultado), y muestra cuánto se movieron respecto del pronóstico previo.
   - Se actualiza solo: cada 40 s si el partido está en juego y cada 2 min si
     todavía no empezó. Se pausa con la pestaña en segundo plano y se retoma
     al volver.

   Por qué ESPN
   Es la misma fuente que ya usa la app: gratuita, sin clave y con CORS. No
   publica xG oficial por equipo, así que el xG se ESTIMA sumando el valor de
   cada remate según su ubicación (x/y que publica ESPN), el tipo de remate
   (cabeza/pie) y si fue bloqueado. Es una estimación transparente, no un dato
   oficial: se muestra siempre como "xG estimado".
   Los proveedores con xG oficial (Sportmonks, API-Football) requieren una
   clave paga; en una web estática la clave quedaría visible para cualquiera,
   por eso no se incluyen. Ver docs/fuentes-de-datos.md.

   Namespace: window.AD.livehoy */
(function () {
  "use strict";

  window.AD = window.AD || {};
  var S = window.AD.store;

  var AHEAD_MS = 60 * 60000;       /* partidos que empiezan dentro de 1 h */
  var HARD_MS = 180 * 60000;       /* mismo tope que la portada (3 h) */
  var POLL_LIVE = 40 * 1000;
  var POLL_PRE = 120 * 1000;
  var POLL_NEAR = 60 * 1000;       /* ya debería haber arrancado */
  var MAX_ACTIVE = 20;             /* tope de partidos consultados a la vez */
  var LIVE_CAP = 12;               /* partidos ya empezados */
  var PRE_CAP = 8;                 /* partidos que empiezan en la próxima hora */
  var MAX_PAR = 3;                 /* peticiones simultáneas a ESPN */
  var RETRY_MAX = 5 * 60000;
  var TICK = 20 * 1000;

  var state = {
    plan: [],
    byKey: {},
    byDom: {},
    byEvent: {},
    queue: [],
    running: 0,
    timer: null
  };

  /* ---------- utilidades ---------- */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function num(v) {
    if (v == null) return null;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : null;
  }

  function n0(v) { var n = num(v); return n == null ? 0 : n; }

  function pct(x) { return String(Math.max(1, Math.min(99, Math.round(100 * (x || 0))))); }
  function pct100(x) { return String(Math.max(0, Math.min(100, Math.round(100 * (x || 0))))); }

  function toInt(v) {
    var n = parseInt(String(v == null ? "" : v), 10);
    return isFinite(n) ? n : 0;
  }

  function ago(ts) {
    var s = Math.max(0, Math.round((Date.now() - (ts || Date.now())) / 1000));
    if (s < 5) return "recién";
    if (s < 60) return "hace " + s + " s";
    var m = Math.round(s / 60);
    return "hace " + m + " min";
  }

  function countdown(ms) {
    var d = (ms || 0) - Date.now();
    if (d <= 0) return "instantes";
    var m = Math.round(d / 60000);
    if (m < 1) return "menos de 1 min";
    if (m >= 60) return Math.floor(m / 60) + " h " + (m % 60) + " min";
    return m + " min";
  }

  function fmtDate(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ""));
    return m ? m[3] + "/" + m[2] + "/" + m[1] : String(d || "");
  }

  function clockNum(c) {
    var m = /(\d+)/.exec(String(c || ""));
    return m ? parseInt(m[1], 10) : 0;
  }

  function isActiveView() {
    var v = document.getElementById("view-hoy");
    return !!v && v.classList.contains("is-active");
  }

  function isCandidate(it, ms) {
    if (!it || !it.slug || !it.ms) return false;
    ms = ms || Date.now();
    var el = ms - it.ms;
    return el >= -AHEAD_MS && el < HARD_MS;
  }

  /* ---------- modelo de probabilidades en juego ---------- */
  var FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
  function pois(k, l) { return Math.exp(-l) * Math.pow(l, k) / FACT[k]; }

  /* Goles que faltan: Poisson independiente con la fuerza previa del partido,
     corregida por el xG generado hasta ahora (con suavizado), las rojas, el
     marcador y el empujón final del que va perdiendo. */
  function inPlay(pm, sh, sa, minute, xgh, xga, rch, rca, st) {
    var R = st.period >= 3 ? Math.max(1, 120 - minute) : Math.max(1, 94 - minute);
    var played = Math.max(1, minute);
    var eh = pm.lh * played / 94, ea = pm.la * played / 94;

    var mh = clamp((xgh + 0.55) / (eh + 0.55), 0.55, 1.75);
    var ma = clamp((xga + 0.55) / (ea + 0.55), 0.55, 1.75);
    /* Al principio el xG es ruido: se acerca a 1. Después se atenúa un 25%
       porque es una estimación por zona, no un dato oficial. */
    var damp = Math.min(1, played / 20);
    mh = 1 + (mh - 1) * damp * 0.75;
    ma = 1 + (ma - 1) * damp * 0.75;

    var adjH = Math.pow(0.74, rch) * Math.pow(1.16, rca);
    var adjA = Math.pow(0.74, rca) * Math.pow(1.16, rch);

    var diff = sh - sa;
    if (diff < 0) adjH *= (diff <= -2 ? 1.16 : 1.09);
    if (diff > 0) adjH *= (diff >= 2 ? 0.88 : 0.94);
    if (diff > 0) adjA *= (diff >= 2 ? 1.16 : 1.09);
    if (diff < 0) adjA *= (diff <= -2 ? 0.88 : 0.94);
    if (R <= 15) { if (diff < 0) adjH *= 1.08; if (diff > 0) adjA *= 1.08; }

    /* El reloj no es lineal: hay descuento y el que va perdiendo empuja. */
    var scale = Math.min(1, Math.pow((R + 4) / 94, 0.9));
    var lh = pm.lh * scale * mh * adjH;
    var la = pm.la * scale * ma * adjA;

    /* Piso de goles restantes: evita que un 1-1 a los 80' quede casi cerrado. */
    var minT = clamp(0.5 + 0.32 * (R / 20), 0.5, 0.82);
    var tot = lh + la;
    if (tot > 0 && tot < minT) {
      var k = minT / tot;
      lh *= k; la *= k;
    }
    lh = clamp(lh, 0.02, 6);
    la = clamp(la, 0.02, 6);

    var ph = 0, pd = 0, pa = 0, po = 0, pb = 0, i, j;
    for (i = 0; i <= 8; i++) {
      for (j = 0; j <= 8; j++) {
        var pr = pois(i, lh) * pois(j, la);
        var H = sh + i, A = sa + j;
        if (H > A) ph += pr; else if (H === A) pd += pr; else pa += pr;
        if (H + A >= 3) po += pr;
        if (H >= 1 && A >= 1) pb += pr;
      }
    }
    var sum = ph + pd + pa;
    if (sum > 0) { ph /= sum; pd /= sum; pa /= sum; po /= sum; pb /= sum; }

    var ls = lh + la;
    var none = Math.exp(-ls);
    return {
      hw: ph, dr: pd, aw: pa, over25: po, btts: pb,
      nextH: ls > 0 ? (1 - none) * lh / ls : 0,
      nextA: ls > 0 ? (1 - none) * la / ls : 0,
      none: none,
      lhR: lh, laR: la
    };
  }

  /* ---------- xG estimado por remate ---------- */
  function isPen(p) { return /^penalty---/.test(String(p && p.t || "")); }
  function isShot(p) { return /^shot-/.test(String(p && p.t || "")) || p.t === "goal" || isPen(p); }

  function shotXg(p) {
    if (isPen(p)) return 0.78;
    var txt = String(p.txt || "");
    var x = Number(p.x), y = Number(p.y), xg;
    if (isFinite(x) && isFinite(y)) {
      var dx = (100 - x) * 1.05;              /* cancha 105 x 68 m */
      var dy = Math.abs(y - 50) * 0.68;
      var d = Math.sqrt(dx * dx + dy * dy);
      var ang = 2 * Math.atan2(3.66, Math.max(0.6, d)); /* arco de 7,32 m */
      var logit = 0.7 - 0.15 * d;
      xg = (1 / (1 + Math.exp(-logit))) * clamp(ang / 0.65, 0.3, 1.15);
    } else if (/six-yard/i.test(txt)) {
      xg = 0.35;
    } else if (/centre of the box|center of the box/i.test(txt)) {
      xg = 0.13;
    } else if (/outside the box/i.test(txt)) {
      xg = 0.035;
    } else {
      xg = 0.06;
    }
    if (/header/i.test(txt)) xg *= 0.78;
    if (/difficult angle|acute angle|tight angle/i.test(txt)) xg *= 0.6;
    if (p.t === "shot-blocked") xg *= 0.7;   /* el remate no llegó al arco */
    return clamp(xg, 0.004, 0.9);
  }

  /* ---------- lectura de la ficha de ESPN ---------- */
  function statsMap(m) {
    var out = { h: {}, a: {} };
    (m.stats || []).forEach(function (t) {
      var k = t.side === "away" ? "a" : "h";
      (t.items || []).forEach(function (pair) {
        out[k][pair[0]] = num(pair[1]);
      });
    });
    return out;
  }

  function minuteOf(m) {
    var st = m.status || {};
    if (st.state === "pre") return 0;
    var c = String(st.clock || st.detail || "");
    var mm = /(\d+)/.exec(c);
    var min = mm ? parseInt(mm[1], 10) : 0;
    if (st.period === 3 && min < 45) min = 90 + min;       /* alargue: reloj reiniciado */
    else if (st.period === 4 && min < 45) min = 105 + min;
    else if (st.period >= 2 && min < 45) min = 45 + min;   /* segundo tiempo */
    if (st.period <= 1 && /half|entretiempo|descanso/i.test(st.detail || "")) min = 45;
    return Math.max(0, Math.min(120, min));
  }

  function countShots(plays, side) {
    var n = 0;
    (plays || []).forEach(function (p) {
      if (p.s === side && isShot(p) && !p.so) n++;
    });
    return n;
  }

  function countCorners(plays, side) {
    var n = 0;
    (plays || []).forEach(function (p) {
      if (p.s === side && p.t === "corner-awarded") n++;
    });
    return n;
  }

  function lineupReady(m) {
    for (var i = 0; i < (m.lineups || []).length; i++) {
      if ((m.lineups[i].players || []).length >= 11) return true;
    }
    return false;
  }

  function keeperOf(m, side, conceded) {
    var l = null, i;
    for (i = 0; i < (m.lineups || []).length; i++) {
      if (m.lineups[i].side === side) { l = m.lineups[i]; break; }
    }
    if (!l) return null;
    var gk = null;
    for (i = 0; i < (l.players || []).length; i++) {
      var p = l.players[i];
      if (/^G$/.test(String(p.pos || "")) || /goalkeeper/i.test(String(p.posN || ""))) {
        if (!gk || (p.st && !gk.st)) gk = p;
      }
    }
    if (!gk) return null;
    return {
      name: gk.n || "",
      saves: gk.s && gk.s.sv ? gk.s.sv : 0,
      conceded: conceded
    };
  }

  function redInfo(m, side) {
    var evs = m.events || [];
    for (var i = 0; i < evs.length; i++) {
      if (evs[i].k === "rc" && evs[i].side === side) return evs[i].c || "";
    }
    return "";
  }

  function analyze(it, m) {
    var st = m.status || {};
    var live = st.state === "in";
    var pre = st.state === "pre";
    var post = st.state === "post" || !!st.completed;
    var sides = {}, i;
    for (i = 0; i < (m.teams || []).length; i++) sides[m.teams[i].side] = m.teams[i];
    var home = sides.home || {}, away = sides.away || {};
    var sh = toInt(home.score), sa = toInt(away.score);
    var minute = minuteOf(m);
    var shootout = !!(st.period >= 5 || /penalt/i.test(st.detail || ""));
    var stats = statsMap(m);
    var plays = m.plays || [];

    var xg = { h: 0, a: 0 }, pens = { h: 0, a: 0 }, box = { h: 0, a: 0 }, shotN = { h: 0, a: 0 };
    plays.forEach(function (p) {
      if (p.so || !isShot(p)) return;
      var side = p.s === "home" ? "h" : (p.s === "away" ? "a" : "");
      if (!side) return;
      shotN[side]++;
      var pen = isPen(p);
      xg[side] += pen ? 0.78 : shotXg(p);
      if (pen) { pens[side]++; box[side]++; }
      else if (p.x != null && Number(p.x) >= 84) box[side]++;
    });

    /* Si ESPN no publicó jugadas con ubicación, se estima con los tiros. */
    var th = stats.h, ta = stats.a;
    if (xg.h + xg.a === 0 && (n0(th.totalShots) + n0(ta.totalShots)) > 0) {
      xg.h = n0(th.shotsOnTarget) * 0.22 + Math.max(0, n0(th.totalShots) - n0(th.shotsOnTarget)) * 0.045;
      xg.a = n0(ta.shotsOnTarget) * 0.22 + Math.max(0, n0(ta.totalShots) - n0(ta.shotsOnTarget)) * 0.045;
    }

    var cards = {
      h: { y: n0(th.yellowCards), r: n0(th.redCards) },
      a: { y: n0(ta.yellowCards), r: n0(ta.redCards) }
    };
    if (th.yellowCards == null || th.redCards == null || ta.yellowCards == null || ta.redCards == null) {
      (m.events || []).forEach(function (e) {
        if (e.side !== "home" && e.side !== "away") return;
        var k = e.side === "home" ? "h" : "a", s = e.side === "home" ? th : ta;
        if (e.k === "yc" && s.yellowCards == null) cards[k].y++;
        if (e.k === "rc" && s.redCards == null) cards[k].r++;
      });
    }

    /* Presión de los últimos 10 minutos. */
    var recent = { h: { shots: 0, corners: 0 }, a: { shots: 0, corners: 0 } };
    var lo = Math.max(0, minute - 10);
    plays.forEach(function (p) {
      if (p.s !== "home" && p.s !== "away") return;
      if (clockNum(p.c) < lo) return;
      var k = p.s === "home" ? "h" : "a";
      if (isShot(p) && !p.so) recent[k].shots++;
      else if (p.t === "corner-awarded") recent[k].corners++;
    });

    var pm = it.p ? {
      hw: it.p.hw, dr: it.p.dr, aw: it.p.aw,
      over25: it.p.over25, btts: it.p.btts, lh: it.p.lh, la: it.p.la
    } : { hw: 0.4, dr: 0.28, aw: 0.32, lh: 1.35, la: 1.1 };

    var probs = live && !shootout ? inPlay(pm, sh, sa, minute, xg.h, xg.a, cards.h.r, cards.a.r, st) : null;
    if (probs && it.p) {
      probs.dhw = Math.round(100 * (probs.hw - it.p.hw));
      probs.ddr = Math.round(100 * (probs.dr - it.p.dr));
      probs.daw = Math.round(100 * (probs.aw - it.p.aw));
    }

    var a = {
      live: live, pre: pre, post: post, shootout: shootout,
      minute: minute, sh: sh, sa: sa,
      xg: xg, pens: pens, box: box, shotN: shotN,
      cards: cards, recent: recent,
      probs: probs, preProbs: pm,
      h2h: it.h2h || null,
      lineups: lineupReady(m),
      keeper: {
        h: keeperOf(m, "home", sa),
        a: keeperOf(m, "away", sh)
      },
      rc: { h: redInfo(m, "home"), a: redInfo(m, "away") },
      stats: {
        h: {
          pos: th.possessionPct, shots: th.totalShots != null ? th.totalShots : shotN.h,
          sot: th.shotsOnTarget != null ? th.shotsOnTarget : 0,
          corners: th.wonCorners != null ? th.wonCorners : countCorners(plays, "home"),
          fouls: th.foulsCommitted, saves: th.saves,
          passes: th.accuratePasses, passPct: th.passPct,
          crosses: th.totalCrosses, tackles: th.totalTackles,
          interceptions: th.interceptions, offsides: th.offsides
        },
        a: {
          pos: ta.possessionPct, shots: ta.totalShots != null ? ta.totalShots : shotN.a,
          sot: ta.shotsOnTarget != null ? ta.shotsOnTarget : 0,
          corners: ta.wonCorners != null ? ta.wonCorners : countCorners(plays, "away"),
          fouls: ta.foulsCommitted, saves: ta.saves,
          passes: ta.accuratePasses, passPct: ta.passPct,
          crosses: ta.totalCrosses, tackles: ta.totalTackles,
          interceptions: ta.interceptions, offsides: ta.offsides
        }
      },
      events: (m.events || []).slice(0, 40)
    };

    a.read = readFor(a, it);
    return a;
  }

  /* ---------- textos ---------- */
  function delta(d) {
    if (d == null || !isFinite(d) || d === 0) return "";
    return '<em class="' + (d > 0 ? "up" : "down") + '">' + (d > 0 ? "+" : "") + d + "</em>";
  }

  function readFor(a, it) {
    var out = [], H = it.f.home, A = it.f.away;

    if (a.live) {
      if (a.shootout) {
        out.push("Definición por penales: el 1X2 del partido ya quedó cerrado en empate.");
        return out;
      }
      var d = a.xg.h - a.xg.a;
      if (d > 0.45) {
        out.push(H + " lleva la iniciativa: " + a.xg.h.toFixed(1) + " de xG estimado contra " + a.xg.a.toFixed(1) + ".");
      } else if (d < -0.45) {
        out.push(A + " genera más peligro: " + a.xg.a.toFixed(1) + " de xG contra " + a.xg.h.toFixed(1) + ".");
      } else {
        out.push("Partido parejo en peligro: " + a.xg.h.toFixed(1) + " de xG para " + H + " y " + a.xg.a.toFixed(1) + " para " + A + ".");
      }

      var rh = a.rc.h, ra = a.rc.a;
      if (a.cards.h.r) out.push(H + " tiene " + a.cards.h.r + " expulsado" + (a.cards.h.r > 1 ? "s" : "") +
        (rh ? " (última, " + rh + ")" : "") + ".");
      if (a.cards.a.r) out.push(A + " tiene " + a.cards.a.r + " expulsado" + (a.cards.a.r > 1 ? "s" : "") +
        (ra ? " (última, " + ra + ")" : "") + ".");

      var rH = a.recent.h, rA = a.recent.a;
      if (rH.shots + rA.shots + rH.corners + rA.corners > 0) {
        out.push("Últimos 10': " + rH.shots + " remates y " + rH.corners + " córners de " + H +
          "; " + rA.shots + " y " + rA.corners + " de " + A + ".");
      }

      var kh = a.keeper.h, ka = a.keeper.a;
      if (kh && kh.saves >= 3) out.push(kh.name + " sostiene a " + H + " con " + kh.saves + " atajadas.");
      else if (ka && ka.saves >= 3) out.push(ka.name + " sostiene a " + A + " con " + ka.saves + " atajadas.");
    } else if (a.pre) {
      out.push("Arranca en " + countdown(it.ms) + ". " + (a.lineups ? "Alineaciones confirmadas." : "Alineaciones todavía sin publicar."));
    }

    return out.slice(0, 3);
  }

  function h2hLine(h) {
    if (!h || !h.n) return "Sin antecedentes en la base";
    return h.w + "V · " + h.d + "E · " + h.l + "D en " + h.n + " partidos";
  }

  /* ---------- historial entre los dos equipos ---------- */
  function buildH2H(items) {
    var pairs = {}, keys;
    items.forEach(function (it) {
      if (!it.ht || !it.at) return;
      keys = String(it.ht.id) + "|" + String(it.at.id);
      if (!pairs[keys]) pairs[keys] = { h: String(it.ht.id), a: String(it.at.id), games: [] };
    });
    keys = Object.keys(pairs);
    if (!keys.length) return;

    var ms = (S && S.state && S.state.matches) || [];
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.homeGoals == null || m.awayGoals == null) continue;
      var h = String(m.homeId), a = String(m.awayId);
      var k = pairs[h + "|" + a] ? h + "|" + a : (pairs[a + "|" + h] ? a + "|" + h : "");
      if (!k) continue;
      pairs[k].games.push({
        date: m.date, comp: m.competition,
        h: m.homeGoals, a: m.awayGoals,
        swapped: k !== h + "|" + a
      });
    }

    items.forEach(function (it) {
      if (!it.ht || !it.at) return;
      var o = pairs[String(it.ht.id) + "|" + String(it.at.id)];
      if (!o) return;
      o.games.sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); });
      var g = o.games.slice(0, 6);
      var r = { n: g.length, w: 0, d: 0, l: 0, gf: 0, ga: 0, last: g[0] || null, games: g };
      g.forEach(function (x) {
        var gf = x.swapped ? x.a : x.h;
        var ga = x.swapped ? x.h : x.a;
        r.gf += gf; r.ga += ga;
        if (gf > ga) r.w++; else if (gf === ga) r.d++; else r.l++;
      });
      it.h2h = r;
    });
  }

  /* ---------- consulta y refresco ---------- */
  function resolveId(it) {
    if (it.id) return Promise.resolve(String(it.id));
    if (it.espnId) return Promise.resolve(it.espnId);
    var L = window.AD.live;
    if (!L || !L.resolveEvent) return Promise.resolve(null);
    return L.resolveEvent({
      slug: it.slug, date: it.f.date, home: it.f.home, away: it.f.away
    }).then(function (id) {
      if (id) it.espnId = String(id);
      return id;
    });
  }

  function ttlFor(it, rec) {
    if (!rec) return 800;
    var st = rec.model && rec.model.status ? rec.model.status.state : "";
    if (st === "post") return 0;
    if (st === "in") return POLL_LIVE;
    if (st === "pre") return Date.now() >= it.ms ? POLL_NEAR : POLL_PRE;
    return 30000;
  }

  function pushQueue(it) {
    if (!it || it._busy || it._queued) return;
    it._queued = true;
    state.queue.push(it);
  }

  function pump() {
    if (document.visibilityState === "hidden") return;
    var ms = Date.now();
    state.plan.forEach(function (it) {
      if (it._busy || it._queued) return;
      var rec = state.byKey[it.fk];
      var ttl = ttlFor(it, rec);
      if (!ttl) return;
      if (rec && ms - rec.at < ttl) return;
      if (rec && rec.next && ms < rec.next) return;
      pushQueue(it);
    });
    runQueue();
  }

  function runQueue() {
    while (state.running < MAX_PAR && state.queue.length) {
      var it = state.queue.shift();
      it._queued = false;
      if (!state.byDom[it.domId] || it._busy) continue;
      fetchOne(it);
    }
  }

  function fetchOne(it) {
    state.running++;
    it._busy = true;
    resolveId(it).then(function (id) {
      if (!id) throw new Error("ESPN todavía no tiene la ficha");
      return window.AD.live.fetchModel(it.slug, id).then(function (m) {
        it.espnId = String(id);
        var rec = {
          at: Date.now(), model: m, fail: 0, next: 0,
          key: it.fk, slug: it.slug, id: String(id), domId: it.domId, it: it
        };
        rec.analysis = analyze(it, m);
        state.byKey[it.fk] = rec;
        state.byEvent[it.slug + "|" + id] = rec;
        paint(it);
        if (rec.analysis.post && window.AD.v2 && window.AD.v2.matchEnded) {
          try { window.AD.v2.matchEnded(it.fk); } catch (e) {}
        }
      });
    }).catch(function (err) {
      var rec = state.byKey[it.fk] || {};
      var fail = (rec.fail || 0) + 1;
      rec.at = Date.now();
      rec.fail = fail;
      rec.err = err && err.message ? err.message : String(err);
      rec.next = Date.now() + Math.min(RETRY_MAX, 15000 * Math.pow(2, Math.min(4, fail - 1)));
      rec.key = it.fk;
      state.byKey[it.fk] = rec;
      paint(it);
    }).then(function () {
      it._busy = false;
      state.running--;
      runQueue();
    });
  }

  function tick() {
    state.timer = null;
    if (!state.plan.length) return;
    if (!isActiveView()) {
      state.timer = setTimeout(tick, TICK * 2);
      return;
    }
    paintAll();
    pump();
    state.timer = setTimeout(tick, TICK);
  }

  function start(items) {
    var ms = Date.now(), next = [], seen = {};
    (items || []).forEach(function (it) {
      if (!it || !it.fk || !isCandidate(it, ms)) return;
      if (seen[it.fk]) return;
      seen[it.fk] = 1;
      next.push(it);
    });

    /* Prioridad: los que ya empezaron (más recientes primero) y, además,
       los que arrancan dentro de la próxima hora. */
    var started = [], upcoming = [];
    next.forEach(function (it) { (it.ms <= ms + 120000 ? started : upcoming).push(it); });
    started.sort(function (a, b) { return b.ms - a.ms; });
    upcoming.sort(function (a, b) { return a.ms - b.ms; });

    var chosen = started.slice(0, LIVE_CAP).concat(upcoming.slice(0, PRE_CAP));
    if (chosen.length < MAX_ACTIVE) {
      chosen = chosen.concat(started.slice(LIVE_CAP, LIVE_CAP + (MAX_ACTIVE - chosen.length)));
    }
    next = chosen;

    state.plan = next;
    state.byDom = {};
    next.forEach(function (it) { state.byDom[it.domId] = it; });

    if (!next.length) {
      if (state.timer) { clearTimeout(state.timer); state.timer = null; }
      return;
    }

    buildH2H(next);
    paintAll();
    pump();
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(tick, TICK);
  }

  function stop() {
    state.plan = [];
    state.queue = [];
    state.byDom = {};
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  }

  /* Al volver a la pestaña, refresca ya (los navegadores frenan los timers). */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (!state.plan.length || !isActiveView()) return;
    paintAll();
    pump();
  });

  /* ---------- pintado de la tarjeta ---------- */
  function artFor(domId) {
    var list = document.querySelectorAll(".fx[data-fk]");
    for (var i = 0; i < list.length; i++) {
      if (list[i].getAttribute("data-fk") === domId) return list[i];
    }
    return null;
  }

  function paintAll() {
    state.plan.forEach(function (it) { paint(it); });
  }

  function paint(it) {
    /* Si la lista se volvió a pintar, el índice de la tarjeta puede haber
       cambiado: solo se pinta si este ítem sigue siendo el de ese lugar. */
    var cur = state.byDom[it.domId];
    if (!cur || cur.fk !== it.fk) return;
    var art = artFor(it.domId);
    if (!art) return;
    var rec = state.byKey[it.fk];
    var a = rec && rec.analysis;
    art.classList.toggle("has-live", !!(a && a.live));

    var host = art.querySelector(".fxl");
    if (host) host.innerHTML = inner(it, rec, a);

    var when = art.querySelector("[data-fkwhen]");
    if (when && a) {
      if (a.live) {
        when.innerHTML = '<span class="fxl-inline is-live"><i></i>EN VIVO · ' + esc(a.minute) + "'</span>";
      } else if (a.pre) {
        when.innerHTML = '<span class="fxl-inline is-pre">Empieza en ' + esc(countdown(it.ms)) + "</span>";
      }
    }

    if (a && a.probs) {
      var th = art.querySelector('[data-fktag="h"]');
      var ta = art.querySelector('[data-fktag="a"]');
      if (th) th.textContent = pct(a.probs.hw) + "%";
      if (ta) ta.textContent = pct(a.probs.aw) + "%";
    }
  }

  function inner(it, rec, a) {
    if (!a) {
      if (rec && rec.err) {
        return '<div class="fxl-load">Sin datos en vivo por ahora · se reintenta solo.</div>';
      }
      return '<div class="fxl-load"><span class="fxl-dot"></span>Consultando el partido en ESPN…</div>';
    }
    if (a.post) {
      return '<div class="fxl-top"><span class="fxl-pill is-post">Finalizado</span>' +
        '<span class="fxl-score">' + a.sh + '<i>:</i>' + a.sa + "</span>" +
        '<span class="fxl-upd">' + esc(ago(rec.at)) + "</span></div>" +
        '<div class="fxl-foot"><span>Resultado final confirmado por ESPN</span></div>';
    }
    if (a.live) return liveInner(it, rec, a);
    return preInner(it, a);
  }

  var ICON = { goal: "⚽", og: "⚽", pen: "🎯", "pen-miss": "❌", yc: "🟨", rc: "🟥", sub: "🔄", var: "📺" };

  function liveInner(it, rec, a) {
    var out = [];
    out.push('<div class="fxl-top">' +
      '<span class="fxl-score">' + a.sh + '<i>:</i>' + a.sa + "</span>" +
      '<span class="fxl-upd">' + esc(ago(rec.at)) + " · actualizado</span>" +
    "</div>");

    var p = a.probs;
    if (p) {
      var hw = pct(p.hw), dr = pct(p.dr), aw = pct(p.aw);
      out.push('<div class="prob-bar fxl-bar">' +
        '<span class="seg seg-home" style="width:' + hw + '%"><b>' + hw + "%</b></span>" +
        '<span class="seg seg-draw" style="width:' + dr + '%"><b>' + dr + "%</b></span>" +
        '<span class="seg seg-away" style="width:' + aw + '%"><b>' + aw + "%</b></span>" +
      "</div>");
      out.push('<div class="prob-legend fxl-legend">' +
        '<span class="lg-home">1 · Local <b>' + hw + "%</b>" + delta(p.dhw) + "</span>" +
        '<span class="lg-draw">X · Empate <b>' + dr + "%</b>" + delta(p.ddr) + "</span>" +
        '<span class="lg-away">2 · Visita <b>' + aw + "%</b>" + delta(p.daw) + "</span>" +
      "</div>");
    }

    var sh = a.stats.h, sa = a.stats.a;
    var rows = [
      statRow("Posesión", pctVal(sh.pos, 1), pctVal(sa.pos, 1), sh.pos != null && sa.pos != null),
      statRow("Tiros", sh.shots, sa.shots),
      statRow("Al arco", sh.sot, sa.sot),
      statRow("xG estimado", a.xg.h.toFixed(1), a.xg.a.toFixed(1)),
      statRow("Remates al área", a.box.h, a.box.a),
      statRow("Córners", sh.corners, sa.corners),
      statRow("Faltas", sh.fouls, sa.fouls),
      statRow("Tarjetas", cardVal(a.cards.h), cardVal(a.cards.a), false),
      statRow("Atajadas", sh.saves, sa.saves)
    ];
    out.push('<div class="fxl-stats">' + rows.join("") + "</div>");

    if (a.read && a.read.length) {
      out.push('<p class="fxl-read">' + esc(a.read.join(" ")) + "</p>");
    }

    if (a.events && a.events.length) {
      var evs = a.events.slice(0, 3).map(function (e) {
        return '<div class="fxl-ev"><span>' + (ICON[e.k] || "•") + "</span>" +
          '<b>' + esc(e.c || "") + "</b> " + esc(e.t) + "</div>";
      });
      out.push('<div class="fxl-events">' + evs.join("") + "</div>");
    }

    out.push('<div class="fxl-foot"><span>xG estimado por zona del remate · ESPN</span>' +
      '<button type="button" data-fxl-detail="' + esc(it.domId) + '">Detalle</button></div>');
    return out.join("");
  }

  function preInner(it, a) {
    var h = a.h2h;
    var out = [];
    out.push('<div class="fxl-pre-row"><b>Alineaciones</b> ' +
      (a.lineups ? "confirmadas" : "se publican cerca del inicio") + "</div>");
    out.push('<div class="fxl-pre-row"><b>Historial</b> ' + esc(h2hLine(h)) + "</div>");
    if (h && h.last) {
      var lh = h.last.swapped ? h.last.a : h.last.h;
      var la = h.last.swapped ? h.last.h : h.last.a;
      out.push('<div class="fxl-pre-row"><b>Último cruce</b> ' + esc(fmtDate(h.last.date)) +
        " · " + lh + "-" + la + "</div>");
    }
    if (a.read && a.read.length) out.push('<p class="fxl-read">' + esc(a.read.join(" ")) + "</p>");
    out.push('<div class="fxl-foot"><span>Datos: ESPN · se actualiza cada 2 min</span>' +
      '<button type="button" data-fxl-detail="' + esc(it.domId) + '">Detalle</button></div>');
    return out.join("");
  }

  function pctVal(v, scale) {
    if (v == null) return null;
    var n = num(v);
    if (n == null) return null;
    if (scale && n > 0 && n < 1) n = n * 100;
    return Math.round(n) + "%";
  }

  function cardVal(c) {
    if (!c) return null;
    var s = (c.y || 0) + "A";
    if (c.r) s += " + " + c.r + "R";
    return s;
  }

  function statRow(label, hv, av, cmp) {
    var hn = num(hv), an = num(av);
    var w = 50;
    if (cmp !== false) {
      var t = (hn == null ? 0 : hn) + (an == null ? 0 : an);
      if (t > 0) w = Math.round(100 * (hn == null ? 0 : hn) / t);
    }
    return '<div class="fxl-stat">' +
      '<span class="v">' + esc(hv == null ? "—" : hv) + "</span>" +
      '<span class="l">' + esc(label) +
        (cmp === false ? "" : '<i><s style="width:' + w + '%"></s></i>') + "</span>" +
      '<span class="v a">' + esc(av == null ? "—" : av) + "</span>" +
    "</div>";
  }

  /* ---------- detalle (pestaña del panel de partido) ---------- */
  function detailHTML(rec) {
    if (!rec || !rec.analysis) return "";
    var a = rec.analysis, it = rec.it, m = rec.model;
    var out = [];
    out.push('<div class="lh-top">' +
      (a.live
        ? '<span class="fxl-pill"><i></i>EN VIVO · ' + esc(a.minute) + "'</span>"
        : a.post
          ? '<span class="fxl-pill is-post">Finalizado</span>'
          : '<span class="fxl-pill is-pre">Empieza en ' + esc(countdown(it.ms)) + "</span>") +
      '<span class="lh-score">' + esc(it.f.home) + " <b>" + a.sh + " : " + a.sa + "</b> " + esc(it.f.away) + "</span>" +
      '<span class="fxl-upd">' + esc(ago(rec.at)) + "</span>" +
    "</div>");

    var p = a.probs;
    if (p) {
      var hw = pct(p.hw), dr = pct(p.dr), aw = pct(p.aw);
      out.push('<div class="prob-bar">' +
        '<span class="seg seg-home" style="width:' + hw + '%"><b>' + hw + "%</b></span>" +
        '<span class="seg seg-draw" style="width:' + dr + '%"><b>' + dr + "%</b></span>" +
        '<span class="seg seg-away" style="width:' + aw + '%"><b>' + aw + "%</b></span>" +
      "</div>");
      out.push('<div class="prob-legend fxl-legend">' +
        '<span class="lg-home">1 · Local <b>' + hw + "%</b>" + delta(p.dhw) + "</span>" +
        '<span class="lg-draw">X · Empate <b>' + dr + "%</b>" + delta(p.ddr) + "</span>" +
        '<span class="lg-away">2 · Visita <b>' + aw + "%</b>" + delta(p.daw) + "</span>" +
      "</div>");
      out.push('<p class="lh-note">Probabilidad recalculada con el marcador y el minuto actuales. ' +
        "La variación (en puntos) es contra el pronóstico previo al partido.</p>");
      out.push('<h4 class="lh-h">Mercados en vivo</h4>');
      out.push('<div class="lh-markets">' +
        '<div class="lh-keeper"><b>Próximo gol</b><span>Local ' + pct100(p.nextH) + "% · Visita " + pct100(p.nextA) +
          "% · Ninguno " + pct100(p.none) + "%</span></div>" +
        '<div class="lh-keeper"><b>Más de 2.5 goles</b><span>' + (a.sh + a.sa >= 3 ? "Ya ocurrió" : pct100(p.over25) + "%") + "</span></div>" +
        '<div class="lh-keeper"><b>Ambos equipos marcan</b><span>' + (a.sh > 0 && a.sa > 0 ? "Ya ocurrió" : pct100(p.btts) + "%") + "</span></div>" +
      "</div>");
    }

    var sh = a.stats.h, sa = a.stats.a;
    if (!a.pre) {
      out.push('<h4 class="lh-h">Estadísticas del partido</h4>');
      out.push('<div class="cmp-head"><span>' + esc(it.f.home) + "</span><span>Equipo</span><span class=\"right\">" + esc(it.f.away) + "</span></div>");
      out.push('<div class="cmp">' + [
        cmpRow("Posesión", pctVal(sh.pos, 1), pctVal(sa.pos, 1)),
        cmpRow("Tiros", sh.shots, sa.shots),
        cmpRow("Tiros al arco", sh.sot, sa.sot),
        cmpRow("xG estimado", a.xg.h.toFixed(2), a.xg.a.toFixed(2)),
        cmpRow("Remates al área", a.box.h, a.box.a),
        cmpRow("Penales ejecutados", a.pens.h, a.pens.a),
        cmpRow("Córners", sh.corners, sa.corners),
        cmpRow("Faltas", sh.fouls, sa.fouls),
        cmpRow("Amarillas", a.cards.h.y, a.cards.a.y),
        cmpRow("Rojas", a.cards.h.r, a.cards.a.r),
        cmpRow("Fueras de juego", sh.offsides, sa.offsides),
        cmpRow("Pases buenos", sh.passes, sa.passes),
        cmpRow("Precisión de pase", pctVal(sh.passPct, 1), pctVal(sa.passPct, 1)),
        cmpRow("Centros", sh.crosses, sa.crosses),
        cmpRow("Entradas", sh.tackles, sa.tackles),
        cmpRow("Intercepciones", sh.interceptions, sa.interceptions),
        cmpRow("Atajadas", sh.saves, sa.saves)
      ].join("") + "</div>");
    }

    if (a.read && a.read.length) {
      out.push('<h4 class="lh-h">Lectura</h4>');
      out.push('<p class="fxl-read">' + esc(a.read.join(" ")) + "</p>");
    }

    if (!a.pre) {
      out.push('<h4 class="lh-h">Arqueros</h4>');
      out.push('<div class="lh-keepers">' +
        keeperHTML(it.f.home, a.keeper.h) + keeperHTML(it.f.away, a.keeper.a) + "</div>");

      out.push('<h4 class="lh-h">Presión e intensidad (últimos 10′)</h4>');
      out.push('<p class="fxl-read">' + esc(it.f.home) + ": " + a.recent.h.shots + " remates y " + a.recent.h.corners + " córners. " +
        esc(it.f.away) + ": " + a.recent.a.shots + " remates y " + a.recent.a.corners + " córners. " +
        "Duelos: " + n0(sh.tackles) + "+" + n0(sh.interceptions) + " para " + esc(it.f.home) + " y " +
        n0(sa.tackles) + "+" + n0(sa.interceptions) + " para " + esc(it.f.away) + ".</p>");
    }

    var h = a.h2h;
    if (h && h.n) {
      out.push('<h4 class="lh-h">Historial reciente</h4>');
      out.push('<p class="fxl-read">' + esc(h2hLine(h)) + " (desde la perspectiva de " + esc(it.f.home) + ").</p>");
      out.push('<div class="lh-h2h">');
      h.games.forEach(function (g) {
        var gf = g.swapped ? g.a : g.h;
        var ga = g.swapped ? g.h : g.a;
        var res = gf > ga ? "G" : gf === ga ? "E" : "P";
        out.push('<div class="lh-h2h-row"><span>' + esc(fmtDate(g.date)) + "</span>" +
          '<i class="lh-res lh-' + res + '">' + res + "</i>" +
          "<span>" + gf + "-" + ga + "</span>" +
          "<span>" + esc(g.comp || "") + "</span></div>");
      });
      out.push("</div>");
    }

    if (a.events && a.events.length) {
      out.push('<h4 class="lh-h">Minuto a minuto</h4>');
      out.push('<ul class="ev-list">' + a.events.map(function (e) {
        return '<li class="ev ev-' + esc(e.k) + '"><span class="ev-min">' + esc(e.c || "") + "</span>" +
          '<span class="ev-ico">' + (ICON[e.k] || "•") + "</span>" +
          '<span class="ev-txt">' + esc(e.t) + "</span></li>";
      }).join("") + "</ul>");
    }

    out.push('<p class="lh-note">xG estimado: se suma el valor de cada remate según su ubicación, ' +
      "tipo de remate y si fue bloqueado (ESPN no publica xG oficial por equipo). " +
      "Datos: API pública de ESPN.</p>");
    return '<div class="lh">' + out.join("") + "</div>";
  }

  function keeperHTML(name, k) {
    if (!k) return '<div class="lh-keeper"><b>' + esc(name) + '</b><span>Arquero no informado</span></div>';
    return '<div class="lh-keeper"><b>' + esc(name) + "</b><span>" + esc(k.name) + " · " +
      k.saves + " atajadas · " + k.conceded + " goles recibidos</span></div>";
  }

  function cmpRow(label, hv, av) {
    var hn = num(hv), an = num(av);
    var t = (hn == null ? 0 : hn) + (an == null ? 0 : an);
    var w = t > 0 ? Math.round(100 * (hn == null ? 0 : hn) / t) : 50;
    return '<div class="cmp-row">' +
      '<span class="cmp-v">' + esc(hv == null ? "—" : hv) + "</span>" +
      '<span class="cmp-l">' + esc(label) +
        '<span class="cmp-bar"><i class="h" style="width:' + w + '%"></i><i class="a"></i></span>' +
      "</span>" +
      '<span class="cmp-v right">' + esc(av == null ? "—" : av) + "</span>" +
    "</div>";
  }

  function htmlFor(slug, id) {
    var rec = state.byEvent[String(slug) + "|" + String(id)];
    if (!rec) return "";
    return detailHTML(rec);
  }

  /* ---------- abrir el detalle desde la tarjeta ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var b = t.closest("[data-fxl-detail]");
    if (!b) return;
    e.preventDefault();
    var it = state.byDom[b.getAttribute("data-fxl-detail")];
    if (!it || !window.AD.live) return;
    var rec = state.byKey[it.fk];
    window.AD.live.open({
      slug: it.slug,
      eventId: rec && rec.id ? rec.id : (it.espnId || it.id || null),
      date: it.f.date,
      home: it.f.home,
      away: it.f.away,
      competition: it.f.competition,
      tab: "analysis"
    });
  });

  window.AD.livehoy = {
    start: start,
    stop: stop,
    isCandidate: isCandidate,
    htmlFor: htmlFor,
    /* Para pruebas y para un futuro adaptador de otro proveedor. */
    _state: state
  };
})();
