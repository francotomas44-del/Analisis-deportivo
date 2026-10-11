/* metrics.js — evaluación de predicciones (JS vainilla)
   Namespace global: window.AD.metrics */
(function () {
  "use strict";

  window.AD = window.AD || {};

  function clip(p, eps) {
    eps = eps || 1e-15;
    return Math.max(eps, Math.min(1 - eps, p));
  }

  /* Brier score multiclase para 1X2: suma de (p - o)^2 sobre 3 clases.
     Menor es mejor. Rango 0..2. */
  function brier1x2(probs, actual) {
    var o = {
      homeWin: actual === "home" ? 1 : 0,
      draw: actual === "draw" ? 1 : 0,
      awayWin: actual === "away" ? 1 : 0
    };
    var s = 0;
    s += Math.pow(probs.homeWin - o.homeWin, 2);
    s += Math.pow(probs.draw - o.draw, 2);
    s += Math.pow(probs.awayWin - o.awayWin, 2);
    return s;
  }

  /* Log Loss del resultado real usando las probabilidades 1X2 */
  function logLoss1x2(probs, actual) {
    return -Math.log(clip(probs[actual === "home" ? "homeWin" : actual === "draw" ? "draw" : "awayWin"]));
  }

  function outcomeFromScore(hg, ag) {
    if (hg > ag) return "home";
    if (hg < ag) return "away";
    return "draw";
  }

  /* Resumen de métricas sobre un conjunto de predicciones cerradas */
  function evaluate(list) {
    var closed = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].result && typeof list[i].result.homeGoals === "number") closed.push(list[i]);
    }
    if (!closed.length) return { count: 0 };

    var sumBrier = 0, sumLogLoss = 0, hits = 0;
    var absErr = 0, sqErr = 0, absErrHome = 0, absErrAway = 0;
    var brier = [], logloss = [], perPred = [];

    for (i = 0; i < closed.length; i++) {
      var p = closed[i];
      var probs = p.output.markets;
      var actual = outcomeFromScore(p.result.homeGoals, p.result.awayGoals);

      var b = brier1x2(probs, actual);
      var ll = logLoss1x2(probs, actual);
      sumBrier += b; sumLogLoss += ll; brier.push(b); logloss.push(ll);

      var predicted = argmaxOutcome(probs);
      var hit = predicted === actual;
      if (hit) hits++;

      var expTotal = p.output.expectedTotal;
      var actTotal = p.result.homeGoals + p.result.awayGoals;
      absErr += Math.abs(expTotal - actTotal);
      sqErr += Math.pow(expTotal - actTotal, 2);
      absErrHome += Math.abs(p.output.expectedHome - p.result.homeGoals);
      absErrAway += Math.abs(p.output.expectedAway - p.result.awayGoals);

      perPred.push({
        id: p.id,
        label: p.homeName + " vs " + p.awayName,
        actual: actual,
        predicted: predicted,
        hit: hit,
        brier: b,
        logloss: ll,
        expTotal: expTotal,
        actTotal: actTotal,
        date: p.resultDate || p.kickoff || p.createdAt
      });
    }

    var n = closed.length;
    return {
      count: n,
      accuracy: hits / n,
      brier: sumBrier / n,
      logloss: sumLogLoss / n,
      maeTotal: absErr / n,
      rmseTotal: Math.sqrt(sqErr / n),
      maeHome: absErrHome / n,
      maeAway: absErrAway / n,
      brierList: brier,
      loglossList: logloss,
      perPred: perPred
    };
  }

  function argmaxOutcome(probs) {
    if (probs.homeWin >= probs.draw && probs.homeWin >= probs.awayWin) return "home";
    if (probs.awayWin >= probs.draw && probs.awayWin >= probs.homeWin) return "away";
    return "draw";
  }

  /* Calibración: agrupa predicciones en bins de probabilidad y compara
     con la frecuencia observada (para el resultado más probable). */
  function calibration(list, bins) {
    bins = bins || 5;
    var rows = [];
    for (var b = 0; b < bins; b++) rows.push({ lo: b / bins, hi: (b + 1) / bins, n: 0, probSum: 0, hitSum: 0 });
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p.result) continue;
      var probs = p.output.markets;
      var predicted = argmaxOutcome(probs);
      var conf = probs[predicted === "home" ? "homeWin" : predicted === "away" ? "awayWin" : "draw"];
      var actual = outcomeFromScore(p.result.homeGoals, p.result.awayGoals);
      var idx = Math.min(bins - 1, Math.floor(conf * bins));
      rows[idx].n++;
      rows[idx].probSum += conf;
      rows[idx].hitSum += (predicted === actual) ? 1 : 0;
    }
    return rows.map(function (r) {
      return {
        rango: (r.lo * 100).toFixed(0) + "-" + (r.hi * 100).toFixed(0) + "%",
        n: r.n,
        probMedia: r.n ? r.probSum / r.n : null,
        frecObs: r.n ? r.hitSum / r.n : null
      };
    });
  }

  window.AD.metrics = {
    outcomeFromScore: outcomeFromScore,
    argmaxOutcome: argmaxOutcome,
    brier1x2: brier1x2,
    logLoss1x2: logLoss1x2,
    evaluate: evaluate,
    calibration: calibration
  };
})();
