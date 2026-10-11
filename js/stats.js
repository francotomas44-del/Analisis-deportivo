/* stats.js — motor matemático y estadístico (JS vainilla, sin dependencias)
   Namespace global: window.AD.stats */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var MAX_GOALS = 10; // matriz de marcadores 0..10

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function logFactorial(n) {
    var s = 0;
    for (var i = 2; i <= n; i++) s += Math.log(i);
    return s;
  }

  /* Distribución de Poisson: P(X = k) */
  function poissonPmf(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    var logp = -lambda + k * Math.log(lambda) - logFactorial(k);
    return Math.exp(logp);
  }

  /* Baselines de liga: goles promedio de local y de visitante */
  function leagueBaselines(matches) {
    var home = [];
    var away = [];
    for (var i = 0; i < matches.length; i++) {
      home.push(matches[i].homeGoals);
      away.push(matches[i].awayGoals);
    }
    var lh = home.length ? mean(home) : 1.5;
    var la = away.length ? mean(away) : 1.15;
    return {
      homeGoals: lh < 0.2 ? 1.5 : lh,
      awayGoals: la < 0.2 ? 1.15 : la,
      matches: matches.length
    };
  }

  /* Estadísticas de un equipo a partir de sus partidos.
     recency: 0..1  → peso exponencial a partidos recientes */
  function teamStats(teamId, matches, recency) {
    var played = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (m.homeId === teamId || m.awayId === teamId) played.push(m);
    }
    // ordenar por fecha descendente (más reciente primero)
    played.sort(function (a, b) {
      var da = a.date || "";
      var db = b.date || "";
      if (da === db) return 0;
      return da < db ? 1 : -1;
    });

    var r = clamp(recency || 0, 0, 1);
    var wFor = 0, wAg = 0;          // goles a favor / en contra ponderados
    var weightSum = 0;
    var wHomeFor = 0, wHomeAg = 0, wHome = 0;
    var wAwayFor = 0, wAwayAg = 0, wAway = 0;
    var cornersFor = [], cornersAgainst = [], cardsFor = [], cardsAgainst = [];

    for (var j = 0; j < played.length; j++) {
      var mm = played[j];
      var w = Math.exp(-r * j * 0.35); // decaimiento suave si recency > 0
      var isHome = mm.homeId === teamId;
      var gf = isHome ? mm.homeGoals : mm.awayGoals;
      var ga = isHome ? mm.awayGoals : mm.homeGoals;

      wFor += w * gf; wAg += w * ga; weightSum += w;

      if (isHome) { wHomeFor += w * gf; wHomeAg += w * ga; wHome += w; }
      else        { wAwayFor += w * gf; wAwayAg += w * ga; wAway += w; }

      if (typeof mm.homeCorners === "number" && typeof mm.awayCorners === "number") {
        cornersFor.push(isHome ? mm.homeCorners : mm.awayCorners);
        cornersAgainst.push(isHome ? mm.awayCorners : mm.homeCorners);
      }
      if (typeof mm.homeCards === "number" && typeof mm.awayCards === "number") {
        cardsFor.push(isHome ? mm.homeCards : mm.awayCards);
        cardsAgainst.push(isHome ? mm.awayCards : mm.homeCards);
      }
    }

    var n = played.length;
    return {
      teamId: teamId,
      matches: n,
      goalsForAvg: weightSum ? wFor / weightSum : 0,
      goalsAgainstAvg: weightSum ? wAg / weightSum : 0,
      homeFor: wHome ? wHomeFor / wHome : 0,
      homeAgainst: wHome ? wHomeAg / wHome : 0,
      awayFor: wAway ? wAwayFor / wAway : 0,
      awayAgainst: wAway ? wAwayAg / wAway : 0,
      cornersFor: cornersFor.length ? mean(cornersFor) : null,
      cornersAgainst: cornersAgainst.length ? mean(cornersAgainst) : null,
      cornersMatches: cornersFor.length,
      cardsFor: cardsFor.length ? mean(cardsFor) : null,
      cardsAgainst: cardsAgainst.length ? mean(cardsAgainst) : null,
      cardsMatches: cardsFor.length,
      homeGames: countSide(played, teamId, true),
      awayGames: countSide(played, teamId, false)
    };
  }

  function countSide(played, teamId, home) {
    var c = 0;
    for (var i = 0; i < played.length; i++) {
      if (home ? played[i].homeId === teamId : played[i].awayId === teamId) c++;
    }
    return c;
  }

  /* Goles esperados (modelo tipo Dixon-Coles simplificado, sin correlación) */
  function expectedGoals(homeStats, awayStats, base) {
    // fuerza de ataque local = goles en casa / promedio local de la liga
    var homeAttack = homeStats.homeGames ? (homeStats.homeFor / base.homeGoals) : null;
    var homeDefense = homeStats.homeGames ? (homeStats.homeAgainst / base.awayGoals) : null;
    var awayAttack = awayStats.awayGames ? (awayStats.awayFor / base.awayGoals) : null;
    var awayDefense = awayStats.awayGames ? (awayStats.awayAgainst / base.homeGoals) : null;

    // fallback a 1 si no hay datos de ese lado
    homeAttack = homeAttack == null || !isFinite(homeAttack) ? 1 : homeAttack;
    homeDefense = homeDefense == null || !isFinite(homeDefense) ? 1 : homeDefense;
    awayAttack = awayAttack == null || !isFinite(awayAttack) ? 1 : awayAttack;
    awayDefense = awayDefense == null || !isFinite(awayDefense) ? 1 : awayDefense;

    // suavizado hacia 1 según cantidad de datos (evita sobreajuste con pocos partidos)
    var k = 5;
    var sHome = homeStats.matches / (homeStats.matches + k);
    var sAway = awayStats.matches / (awayStats.matches + k);
    homeAttack = 1 + (homeAttack - 1) * sHome;
    homeDefense = 1 + (homeDefense - 1) * sHome;
    awayAttack = 1 + (awayAttack - 1) * sAway;
    awayDefense = 1 + (awayDefense - 1) * sAway;

    var lh = base.homeGoals * homeAttack * awayDefense;
    var la = base.awayGoals * awayAttack * homeDefense;

    return {
      home: clamp(lh, 0.05, 6),
      away: clamp(la, 0.05, 6),
      homeAttack: homeAttack,
      awayAttack: awayAttack,
      homeDefense: homeDefense,
      awayDefense: awayDefense,
      smoothed: { home: sHome, away: sAway }
    };
  }

  /* Matriz de marcadores (Poisson independiente) */
  function scoreMatrix(lh, la, max) {
    max = max || MAX_GOALS;
    var ph = [], pa = [], i, j;
    for (i = 0; i <= max; i++) { ph.push(poissonPmf(i, lh)); pa.push(poissonPmf(i, la)); }
    var matrix = [];
    for (i = 0; i <= max; i++) {
      matrix.push([]);
      for (j = 0; j <= max; j++) matrix[i].push(ph[i] * pa[j]);
    }
    return matrix;
  }

  /* Convierte la matriz en todos los mercados */
  function outcomes(matrix) {
    var homeWin = 0, draw = 0, awayWin = 0, over = 0, under = 0, btts = 0;
    var totalDist = {};
    var homeDist = {};
    var awayDist = {};
    var correct = [];
    var n = matrix.length;

    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var p = matrix[i][j];
        if (i > j) homeWin += p; else if (i === j) draw += p; else awayWin += p;
        var tot = i + j;
        totalDist[tot] = (totalDist[tot] || 0) + p;
        homeDist[i] = (homeDist[i] || 0) + p;
        awayDist[j] = (awayDist[j] || 0) + p;
        if (tot > 2.5) over += p; else under += p;
        if (i > 0 && j > 0) btts += p;
        correct.push({ h: i, a: j, p: p });
      }
    }
    correct.sort(function (a, b) { return b.p - a.p; });
    return {
      homeWin: homeWin,
      draw: draw,
      awayWin: awayWin,
      over25: over,
      under25: under,
      btts: btts,
      noBtts: 1 - btts,
      totalDist: totalDist,
      homeDist: homeDist,
      awayDist: awayDist,
      correct: correct.slice(0, 8)
    };
  }

  /* Probabilidades derivadas */
  function derived(matrix, lh, la) {
    var o = outcomes(matrix);
    // Más/menos por líneas habituales
    var lines = [0.5, 1.5, 2.5, 3.5, 4.5];
    var overLines = {};
    lines.forEach(function (L) {
      var over = 0;
      Object.keys(o.totalDist).forEach(function (k) {
        if (parseInt(k, 10) > L) over += o.totalDist[k];
      });
      overLines[L] = { over: over, under: 1 - over };
    });
    // primer gol (condicional a que haya al menos un gol)
    var noGoals = matrix[0][0];
    var firstHome = (lh + la) > 0 ? (lh / (lh + la)) * (1 - noGoals) : 0;
    var firstAway = (lh + la) > 0 ? (la / (lh + la)) * (1 - noGoals) : 0;
    return {
      markets: o,
      overLines: overLines,
      noGoals: noGoals,
      firstGoalHome: firstHome,
      firstGoalAway: firstAway,
      firstGoalNone: noGoals,
      expectedHome: lh,
      expectedAway: la,
      expectedTotal: lh + la
    };
  }

  /* Córners y tarjetas estimados */
  function setPieces(homeStats, awayStats, base) {
    var lgCornersTotal = 10.4; // promedio genérico de referencia
    var lgCardsTotal = 4.2;
    var hc = homeStats.cornersFor, ac = awayStats.cornersFor;
    var hcAgainst = homeStats.cornersAgainst, acAgainst = awayStats.cornersAgainst;
    var hasCorners = hc != null && ac != null;

    var homeCorners = hasCorners ? (hc + acAgainst) / 2 : lgCornersTotal / 2;
    var awayCorners = hasCorners ? (ac + hcAgainst) / 2 : lgCornersTotal / 2;

    var ht = homeStats.cardsFor, at = awayStats.cardsFor;
    var hasCards = ht != null && at != null;
    var homeCards = hasCards ? (ht + awayStats.cardsAgainst) / 2 : lgCardsTotal / 2;
    var awayCards = hasCards ? (at + homeStats.cardsAgainst) / 2 : lgCardsTotal / 2;

    return {
      corners: { home: homeCorners, away: awayCorners, total: homeCorners + awayCorners, hasData: hasCorners },
      cards: { home: homeCards, away: awayCards, total: homeCards + awayCards, hasData: hasCards }
    };
  }

  /* Simulación de Monte Carlo (escenarios) */
  function simulate(lh, la, runs, extra) {
    runs = runs || 10000;
    extra = extra || {};
    var homeWin = 0, draw = 0, awayWin = 0, totalGoals = 0;
    var cleanSheetsHome = 0, cleanSheetsAway = 0;
    var redCardProb = extra.redCardProb || 0;

    function pois(lambda) {
      // Knuth
      var L = Math.exp(-lambda), k = 0, p = 1;
      do { k++; p *= Math.random(); } while (p > L);
      return k - 1;
    }

    for (var i = 0; i < runs; i++) {
      var h = pois(lh), a = pois(la);
      // escenario: expulsión temprana reduce algo el ataque
      if (redCardProb > 0 && Math.random() < redCardProb) {
        if (Math.random() < 0.5) h = Math.max(0, h - 1); else a = Math.max(0, a - 1);
      }
      if (h > a) homeWin++; else if (h === a) draw++; else awayWin++;
      totalGoals += h + a;
      if (a === 0) cleanSheetsHome++;
      if (h === 0) cleanSheetsAway++;
    }
    return {
      runs: runs,
      homeWin: homeWin / runs,
      draw: draw / runs,
      awayWin: awayWin / runs,
      avgTotal: totalGoals / runs,
      cleanSheetHome: cleanSheetsHome / runs,
      cleanSheetAway: cleanSheetsAway / runs
    };
  }

  /* Enfrentamientos directos (H2H) entre dos equipos, desde la perspectiva de A */
  function headToHead(matches, aId, bId) {
    var list = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      var isAb = (m.homeId === aId && m.awayId === bId);
      var isBa = (m.homeId === bId && m.awayId === aId);
      if (isAb || isBa) list.push(m);
    }
    list.sort(function (a, b) {
      if (a.date === b.date) return 0;
      return a.date < b.date ? 1 : -1;
    });

    var aWins = 0, draws = 0, bWins = 0, aGoals = 0, bGoals = 0;
    for (var j = 0; j < list.length; j++) {
      var mm = list[j];
      var aHome = mm.homeId === aId;
      var ga = aHome ? mm.homeGoals : mm.awayGoals;
      var gb = aHome ? mm.awayGoals : mm.homeGoals;
      aGoals += ga; bGoals += gb;
      if (ga > gb) aWins++; else if (ga < gb) bWins++; else draws++;
    }
    return {
      total: list.length,
      aWins: aWins, draws: draws, bWins: bWins,
      aGoals: aGoals, bGoals: bGoals,
      avgTotal: list.length ? (aGoals + bGoals) / list.length : 0,
      matches: list.slice(0, 10)
    };
  }

  /* Motor de confianza (0-100) */
  function confidence(ctx) {
    var home = ctx.homeStats, away = ctx.awayStats;
    var score = 30;
    score += 20 * Math.min(home.matches, 8) / 8;
    score += 20 * Math.min(away.matches, 8) / 8;
    if (ctx.hasCornersData) score += 8;
    if (ctx.hasCardsData) score += 4;
    if (ctx.lineupsConfirmed) score += 10;
    if (!ctx.homeBajas) score += 4;
    if (!ctx.awayBajas) score += 4;
    if (ctx.meteo) score -= 5;
    score = clamp(score, 5, 98);
    var label;
    if (score >= 75) label = "Alta";
    else if (score >= 55) label = "Media";
    else if (score >= 35) label = "Baja";
    else label = "Muy baja";
    return { score: score, label: label };
  }

  window.AD.stats = {
    MAX_GOALS: MAX_GOALS,
    clamp: clamp,
    mean: mean,
    poissonPmf: poissonPmf,
    leagueBaselines: leagueBaselines,
    teamStats: teamStats,
    expectedGoals: expectedGoals,
    scoreMatrix: scoreMatrix,
    outcomes: outcomes,
    derived: derived,
    setPieces: setPieces,
    simulate: simulate,
    headToHead: headToHead,
    confidence: confidence
  };
})();
