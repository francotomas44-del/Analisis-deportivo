/* backtest.js — backtesting walk-forward del modelo (JS vainilla)
   Namespace global: window.AD.backtest

   Evalúa el modelo sobre partidos ya jugados usando, para cada partido,
   ÚNICAMENTE la información anterior a su fecha (sin look-ahead).

   Reutiliza exactamente el mismo motor que el Análisis (AD.stats.expectedGoals,
   scoreMatrix, derived) y las métricas de AD.metrics, de modo que el backtesting
   mide el modelo real que usa la app.

   Eficiencia: recorre el historial en orden cronológico manteniendo acumuladores
   incrementales por equipo equivalentes a stats.teamStats() sobre el prefijo de
   partidos, en O(n) en total (no O(n²)). */
(function () {
  "use strict";

  window.AD = window.AD || {};

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /* Factor de decaimiento por partido, equivalente a stats.teamStats:
     w = exp(-recency * j * 0.35)  ⇒  w_j = decay^j  con decay = exp(-recency*0.35). */
  function decayFor(recency) { return Math.exp(-clamp(recency || 0, 0, 1) * 0.35); }

  /* ---------- acumuladores incrementales ---------- */
  function newAccum() {
    return { byTeam: {}, homeGoalsSum: 0, awayGoalsSum: 0, n: 0 };
  }

  function teamSlot(acc, id) {
    var s = acc.byTeam[id];
    if (!s) {
      s = {
        matches: 0, wsum: 0, forSum: 0, agSum: 0,
        hw: 0, hwf: 0, hwa: 0, aw: 0, awf: 0, awa: 0,
        homeGames: 0, awayGames: 0
      };
      acc.byTeam[id] = s;
    }
    return s;
  }

  function decaySlot(s, d) {
    if (d === 1) return;
    s.wsum *= d; s.forSum *= d; s.agSum *= d;
    s.hw *= d; s.hwf *= d; s.hwa *= d;
    s.aw *= d; s.awf *= d; s.awa *= d;
  }

  function applyMatch(acc, m, d) {
    var h = teamSlot(acc, m.homeId);
    var a = teamSlot(acc, m.awayId);
    decaySlot(h, d); decaySlot(a, d);

    h.matches++; h.wsum += 1; h.forSum += m.homeGoals; h.agSum += m.awayGoals;
    h.homeGames++; h.hw += 1; h.hwf += m.homeGoals; h.hwa += m.awayGoals;

    a.matches++; a.wsum += 1; a.forSum += m.awayGoals; a.agSum += m.homeGoals;
    a.awayGames++; a.aw += 1; a.awf += m.awayGoals; a.awa += m.homeGoals;

    acc.homeGoalsSum += m.homeGoals;
    acc.awayGoalsSum += m.awayGoals;
    acc.n++;
  }

  function statsFor(acc, id) {
    var s = acc.byTeam[id];
    if (!s || !s.matches) {
      return {
        teamId: id, matches: 0, goalsForAvg: 0, goalsAgainstAvg: 0,
        homeFor: 0, homeAgainst: 0, awayFor: 0, awayAgainst: 0,
        cornersFor: null, cornersAgainst: null, cornersMatches: 0,
        cardsFor: null, cardsAgainst: null, cardsMatches: 0,
        homeGames: 0, awayGames: 0
      };
    }
    return {
      teamId: id,
      matches: s.matches,
      goalsForAvg: s.wsum ? s.forSum / s.wsum : 0,
      goalsAgainstAvg: s.wsum ? s.agSum / s.wsum : 0,
      homeFor: s.hw ? s.hwf / s.hw : 0,
      homeAgainst: s.hw ? s.hwa / s.hw : 0,
      awayFor: s.aw ? s.awf / s.aw : 0,
      awayAgainst: s.aw ? s.awa / s.aw : 0,
      cornersFor: null, cornersAgainst: null, cornersMatches: 0,
      cardsFor: null, cardsAgainst: null, cardsMatches: 0,
      homeGames: s.homeGames, awayGames: s.awayGames
    };
  }

  function baseFor(acc) {
    var lh = acc.n ? acc.homeGoalsSum / acc.n : 1.5;
    var la = acc.n ? acc.awayGoalsSum / acc.n : 1.15;
    return {
      homeGoals: lh < 0.2 ? 1.5 : lh,
      awayGoals: la < 0.2 ? 1.15 : la,
      matches: acc.n
    };
  }

  function teamName(S, id) { var t = S.getTeam(id); return t ? t.name : "?"; }

  /* Tabla de log-factoriales 0..MAXG (evita recalcularla en cada Poisson). */
  var MAXG = 10;
  var LF = (function () {
    var a = [0];
    for (var n = 1; n <= MAXG; n++) a[n] = a[n - 1] + Math.log(n);
    return a;
  })();

  function poissonPmf(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return Math.exp(-lambda + k * Math.log(lambda) - LF[k]);
  }

  /* Probabilidades 1X2 idénticas a stats.derived(scoreMatrix(lh,la,_,rho)).markets
     (misma matriz Poisson truncada a 0..MAXG + corrección Dixon-Coles), pero sin
     construir la matriz ni ordenar 121 objetos. expectedTotal = lh + la. */
  function tau(i, j, lh, la, rho) {
    if (!rho) return 1;
    if (i === 0 && j === 0) return 1 - lh * la * rho;
    if (i === 0 && j === 1) return 1 + lh * rho;
    if (i === 1 && j === 0) return 1 + la * rho;
    if (i === 1 && j === 1) return 1 - rho;
    return 1;
  }

  function oneXTwo(lh, la, rho) {
    var ph = new Array(MAXG + 1), pa = new Array(MAXG + 1), i, j;
    for (i = 0; i <= MAXG; i++) { ph[i] = poissonPmf(i, lh); pa[i] = poissonPmf(i, la); }
    var hw = 0, dr = 0, aw = 0, total = 0;
    for (i = 0; i <= MAXG; i++) {
      var phi = ph[i];
      for (j = 0; j <= MAXG; j++) {
        var p = phi * pa[j] * tau(i, j, lh, la, rho);
        if (p < 0) p = 0;
        if (i > j) hw += p; else if (i === j) dr += p; else aw += p;
        total += p;
      }
    }
    if (rho && total > 0) { hw /= total; dr /= total; aw /= total; }
    return { homeWin: hw, draw: dr, awayWin: aw, expectedTotal: lh + la };
  }

  /* Escalado por temperatura de las probabilidades 1X2 (igual que stats.derived). */
  function applyTemperature(probs, T) {
    if (!T || T === 1) return probs;
    var h = Math.pow(Math.max(probs.homeWin, 1e-12), 1 / T);
    var d = Math.pow(Math.max(probs.draw, 1e-12), 1 / T);
    var a = Math.pow(Math.max(probs.awayWin, 1e-12), 1 / T);
    var s = h + d + a;
    if (s <= 0) return probs;
    return { homeWin: h / s, draw: d / s, awayWin: a / s };
  }

  /* Registra métricas por equipo (para comparar equipos) y su historial directo.
     Solo anota los equipos "foco" (agg.focusSet); el resto se ignora. */
  function recordFocus(agg, m, lh, la, b, ll, predicted, actual) {
    var fs = agg.focusSet;
    if (!fs) return;
    var hit = predicted === actual ? 1 : 0;

    function upd(id, isHome) {
      if (!fs[id]) return;
      var t = agg.byTeam[id];
      if (!t) {
        t = agg.byTeam[id] = {
          n: 0, hits: 0, sumBrier: 0, sumLogLoss: 0, absTotal: 0,
          expFor: 0, actFor: 0, expAgainst: 0, actAgainst: 0, homeN: 0, awayN: 0
        };
      }
      var ef = isHome ? lh : la;
      var ea = isHome ? la : lh;
      var af = isHome ? m.homeGoals : m.awayGoals;
      var aa = isHome ? m.awayGoals : m.homeGoals;
      t.n++; t.hits += hit; t.sumBrier += b; t.sumLogLoss += ll;
      t.expFor += ef; t.actFor += af; t.expAgainst += ea; t.actAgainst += aa;
      t.absTotal += Math.abs((lh + la) - (m.homeGoals + m.awayGoals));
      if (isHome) t.homeN++; else t.awayN++;
    }
    upd(m.homeId, true);
    upd(m.awayId, false);

    if (agg.pairA && agg.pairB) {
      var isPair = (m.homeId === agg.pairA && m.awayId === agg.pairB) ||
                   (m.homeId === agg.pairB && m.awayId === agg.pairA);
      if (isPair) {
        var h = agg.h2h;
        var aIsHome = m.homeId === agg.pairA;
        var ga = aIsHome ? m.homeGoals : m.awayGoals;
        var gb = aIsHome ? m.awayGoals : m.homeGoals;
        h.n++; h.hits += hit; h.sumBrier += b;
        h.expFor += aIsHome ? lh : la; h.actFor += ga;
        h.expAgainst += aIsHome ? la : lh; h.actAgainst += gb;
        if (ga > gb) h.aWins++; else if (ga < gb) h.bWins++; else h.draws++;
        if (h.matches.length < 12) {
          h.matches.push({
            date: m.date || "", competition: m.competition || "",
            homeId: m.homeId, awayId: m.awayId,
            hg: m.homeGoals, ag: m.awayGoals,
            predicted: predicted, hit: predicted === actual
          });
        }
      }
    }
  }

  /* Evalúa UN partido con el estado acumulado (historia previa). */
  function evaluateOne(m, acc, agg, cal, bins, detail, detailLimit, minHistory, rho, temperature) {
    var ST = window.AD.stats;
    var M = window.AD.metrics;
    var S = window.AD.store;

    var hs = statsFor(acc, m.homeId);
    var as = statsFor(acc, m.awayId);
    if (hs.matches < minHistory || as.matches < minHistory) { agg.skipped++; return; }

    var base = baseFor(acc);
    var eg = ST.expectedGoals(hs, as, base);
    var lh = eg.home, la = eg.away;
    var o = oneXTwo(lh, la, rho);
    var probs = applyTemperature({ homeWin: o.homeWin, draw: o.draw, awayWin: o.awayWin }, temperature);
    var expTotal = o.expectedTotal;

    var actual = M.outcomeFromScore(m.homeGoals, m.awayGoals);
    var b = M.brier1x2(probs, actual);
    var ll = M.logLoss1x2(probs, actual);
    var predicted = M.argmaxOutcome(probs);

    agg.n++;
    agg.sumBrier += b;
    agg.sumLogLoss += ll;
    if (predicted === actual) agg.hits++;
    if (predicted === "home") agg.predHome++; else if (predicted === "away") agg.predAway++; else agg.predDraw++;
    if (actual === "home") agg.actHome++; else if (actual === "away") agg.actAway++; else agg.actDraw++;

    var actTotal = m.homeGoals + m.awayGoals;
    agg.absTot += Math.abs(expTotal - actTotal);
    agg.sqTot += Math.pow(expTotal - actTotal, 2);
    agg.absHome += Math.abs(lh - m.homeGoals);
    agg.absAway += Math.abs(la - m.awayGoals);

    var conf = probs[predicted === "home" ? "homeWin" : predicted === "away" ? "awayWin" : "draw"];
    var bi = Math.min(bins - 1, Math.floor(conf * bins));
    if (bi < 0) bi = 0;
    cal[bi].n++;
    cal[bi].probSum += conf;
    cal[bi].hitSum += (predicted === actual) ? 1 : 0;

    if (agg.focusSet) recordFocus(agg, m, lh, la, b, ll, predicted, actual);

    if (detail.length < detailLimit) {
      detail.push({
        date: m.date || "",
        competition: m.competition || "",
        home: teamName(S, m.homeId),
        away: teamName(S, m.awayId),
        hg: m.homeGoals, ag: m.awayGoals,
        actual: actual, predicted: predicted, hit: predicted === actual,
        brier: b, logloss: ll,
        expTotal: expTotal, actTotal: actTotal
      });
    }
  }

  function makeResult(o) {
    var count = o.agg.n;
    var res = {
      options: o.options,
      pool: o.pool,
      evaluated: count,
      skippedLowHistory: o.agg.skipped,
      stopped: !!o.stopped,
      count: count,
      accuracy: count ? o.agg.hits / count : 0,
      brier: count ? o.agg.sumBrier / count : 0,
      logloss: count ? o.agg.sumLogLoss / count : 0,
      maeTotal: count ? o.agg.absTot / count : 0,
      rmseTotal: count ? Math.sqrt(o.agg.sqTot / count) : 0,
      maeHome: count ? o.agg.absHome / count : 0,
      maeAway: count ? o.agg.absAway / count : 0,
      actual: { home: o.agg.actHome, draw: o.agg.actDraw, away: o.agg.actAway },
      predicted: { home: o.agg.predHome, draw: o.agg.predDraw, away: o.agg.predAway },
      calibration: o.cal.map(function (r) {
        return {
          rango: (r.lo * 100).toFixed(0) + "-" + (r.hi * 100).toFixed(0) + "%",
          n: r.n,
          probMedia: r.n ? r.probSum / r.n : null,
          frecObs: r.n ? r.hitSum / r.n : null
        };
      }),
      baseline: null,
      detail: o.detail,
      elapsedMs: o.elapsedMs
    };

    if (count) {
      var rates = {
        home: o.agg.actHome / count,
        draw: o.agg.actDraw / count,
        away: o.agg.actAway / count
      };
      // Referencia: predecir siempre las frecuencias base del período (climatología).
      var cb =
        Math.pow(rates.home, 2) * (count - o.agg.actHome) + Math.pow(1 - rates.home, 2) * o.agg.actHome +
        Math.pow(rates.draw, 2) * (count - o.agg.actDraw) + Math.pow(1 - rates.draw, 2) * o.agg.actDraw +
        Math.pow(rates.away, 2) * (count - o.agg.actAway) + Math.pow(1 - rates.away, 2) * o.agg.actAway;
      cb /= count;
      var eps = 1e-15;
      var cl = -Math.log(Math.max(eps, rates.home)) * rates.home
             - Math.log(Math.max(eps, rates.draw)) * rates.draw
             - Math.log(Math.max(eps, rates.away)) * rates.away;
      res.baseline = {
        rates: rates,
        homeAccuracy: rates.home,     // acierto de "siempre gana el local"
        climatologyBrier: cb,
        climatologyLogLoss: cl
      };
    }

    // Métricas por equipo (comparación de equipos)
    res.byTeam = {};
    if (o.agg.focusSet) {
      Object.keys(o.agg.byTeam).forEach(function (id) {
        var t = o.agg.byTeam[id];
        res.byTeam[id] = {
          n: t.n,
          accuracy: t.n ? t.hits / t.n : 0,
          brier: t.n ? t.sumBrier / t.n : 0,
          logloss: t.n ? t.sumLogLoss / t.n : 0,
          maeTotal: t.n ? t.absTotal / t.n : 0,
          expForAvg: t.n ? t.expFor / t.n : 0,
          actForAvg: t.n ? t.actFor / t.n : 0,
          expAgainstAvg: t.n ? t.expAgainst / t.n : 0,
          actAgainstAvg: t.n ? t.actAgainst / t.n : 0,
          homeN: t.homeN, awayN: t.awayN
        };
      });
    }

    // Historial directo entre los dos equipos comparados (desde la perspectiva de A)
    if (o.agg.focusSet && o.agg.pairA) {
      var h = o.agg.h2h;
      res.headToHead = {
        teamA: o.agg.pairA,
        teamB: o.agg.pairB,
        n: h.n,
        accuracy: h.n ? h.hits / h.n : 0,
        brier: h.n ? h.sumBrier / h.n : 0,
        aWins: h.aWins, draws: h.draws, bWins: h.bWins,
        expForAvg: h.n ? h.expFor / h.n : 0,
        actForAvg: h.n ? h.actFor / h.n : 0,
        expAgainstAvg: h.n ? h.expAgainst / h.n : 0,
        actAgainstAvg: h.n ? h.actAgainst / h.n : 0,
        matches: h.matches
      };
    }

    return res;
  }

  /* Ejecuta el backtesting.
     opts: { competition, from, to, recency, minHistory, max, detailLimit, shouldStop }
     onProgress(done, total, aggParcial)
     Devuelve una Promesa con el resultado. */
  function run(opts, onProgress) {
    opts = opts || {};
    var ST = window.AD.stats;
    var S = window.AD.store;

    var recency = clamp(opts.recency || 0, 0, 1);
    var d = decayFor(recency);
    var minHistory = opts.minHistory != null ? Math.max(0, opts.minHistory) : 5;
    var SC = ST.config || {};
    var rho = opts.rho != null ? opts.rho : (SC.rho || 0);
    var temperature = opts.temperature != null ? opts.temperature : (SC.temperature || 1);
    var comp = opts.competition || "";
    var from = opts.from || "";
    var to = opts.to || "";
    var max = opts.max || 0;
    var detailLimit = opts.detailLimit || 400;
    var focusTeams = (opts.focusTeams && opts.focusTeams.length) ? opts.focusTeams.slice(0, 4) : null;
    var CHUNK = 4000;

    // 1) Filtrar y ordenar cronológicamente (solo partidos con marcador).
    var all = S.state.matches;
    var ms = [];
    for (var i = 0; i < all.length; i++) {
      var m = all[i];
      if (comp && m.competition !== comp) continue;
      if (from && (m.date || "") < from) continue;
      if (to && (m.date || "") > to) continue;
      if (typeof m.homeGoals !== "number" || typeof m.awayGoals !== "number") continue;
      ms.push(m);
    }
    ms.sort(function (a, b) {
      var da = a.date || "", db = b.date || "";
      return da < db ? -1 : da > db ? 1 : 0;
    });

    var n = ms.length;
    var startIdx = 0;
    if (max > 0 && n > max) startIdx = n - max; // evaluar los últimos `max`, con toda la historia previa

    return new Promise(function (resolve) {
      var acc = newAccum();
      var committed = 0;
      var idx = 0; // recorre desde 0 para construir la historia; solo evalúa desde startIdx
      var bins = 10;
      var cal = [];
      for (var b = 0; b < bins; b++) cal.push({ lo: b / bins, hi: (b + 1) / bins, n: 0, probSum: 0, hitSum: 0 });
      var agg = {
        n: 0, hits: 0, sumBrier: 0, sumLogLoss: 0,
        absTot: 0, sqTot: 0, absHome: 0, absAway: 0,
        actHome: 0, actDraw: 0, actAway: 0,
        predHome: 0, predDraw: 0, predAway: 0,
        skipped: 0,
        focusSet: null, pairA: null, pairB: null,
        byTeam: {},
        h2h: { n: 0, hits: 0, sumBrier: 0, expFor: 0, actFor: 0, expAgainst: 0, actAgainst: 0, aWins: 0, draws: 0, bWins: 0, matches: [] }
      };
      if (focusTeams) {
        agg.focusSet = {};
        focusTeams.forEach(function (id) { agg.focusSet[id] = true; });
        if (focusTeams.length === 2) { agg.pairA = focusTeams[0]; agg.pairB = focusTeams[1]; }
      }
      var detail = [];
      var options = { competition: comp, from: from, to: to, recency: recency, minHistory: minHistory, max: max, rho: rho, temperature: temperature, smoothing: SC.smoothing || 12 };
      var t0 = Date.now();

      function finish(stopped) {
        resolve(makeResult({
          agg: agg, cal: cal, detail: detail, pool: n, stopped: stopped,
          options: options, elapsedMs: Date.now() - t0
        }));
      }

      function step() {
        var processed = 0;
        while (idx < n && processed < CHUNK) {
          var curDate = ms[idx].date || "";
          // commit de todos los partidos con fecha ESTRICTAMENTE anterior (evita look-ahead intra-día)
          while (committed < n && (ms[committed].date || "") < curDate) {
            applyMatch(acc, ms[committed], d);
            committed++;
          }
          if (idx >= startIdx) {
            evaluateOne(ms[idx], acc, agg, cal, bins, detail, detailLimit, minHistory, rho, temperature);
          }
          idx++;
          processed++;
        }

        if (onProgress) {
          try { onProgress(idx - startIdx, n - startIdx, agg); } catch (e) {}
        }
        if (opts.shouldStop && opts.shouldStop()) { finish(true); return; }
        if (idx < n) { setTimeout(step, 0); }
        else { finish(false); }
      }

      setTimeout(step, 0);
    });
  }

  window.AD.backtest = {
    run: run,
    // expuestos para pruebas
    _newAccum: newAccum,
    _applyMatch: applyMatch,
    _statsFor: statsFor,
    _baseFor: baseFor,
    _decayFor: decayFor,
    _oneXTwo: oneXTwo,
    _applyTemperature: applyTemperature
  };
})();
