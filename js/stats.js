/* stats.js — motor matemático y estadístico (JS vainilla, sin dependencias)
   Namespace global: window.AD.stats */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var MAX_GOALS = 10; // matriz de marcadores 0..10

  /* Parámetros del modelo (calibrados con el backtesting, ver docs/backtesting.md).
     rho: correlación Dixon-Coles en marcadores bajos (0 = desactivada).
     temperature: escalado de las probabilidades 1X2 (1 = sin cambios, >1 = menos confiado).
     smoothing: constante k de suavizado hacia la media (mayor = más regularizado).
     compHomeAdv: localía por competición (0 = off, usar la global). */
  var config = { rho: -0.03, temperature: 1.06, smoothing: 12, compHomeAdv: false, unifyTeams: true,
    // Segundo modelo (rating Elo) ensamblado con el de goles. Medido y adoptado por subir aciertos
    // y mejorar Brier/LogLoss (ver docs/backtesting.md). weight = 0 lo desactiva.
    elo: { weight: 0.55, K: 25, hfa: 70, nu: 0.7 } };

  var K_COMP = 30; // shrink de la localía por competición hacia la global: w = n/(n+K_COMP)

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

  /* Localía por competición: promedio de goles de local/visitante solo dentro de la
     competición elegida, contraído hacia la media global (shrink w = n/(n+K_COMP)).
     Con pocos partidos de esa competición se parece a la global (evita sobreajuste). */
  function competitionBaseline(matches, competition) {
    var glob = leagueBaselines(matches);
    if (!competition) return glob;
    var n = 0, hg = 0, ag = 0;
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (m.competition === competition) { n++; hg += m.homeGoals; ag += m.awayGoals; }
    }
    if (n < 2) return glob;
    var w = n / (n + K_COMP);
    return {
      homeGoals: w * (hg / n) + (1 - w) * glob.homeGoals,
      awayGoals: w * (ag / n) + (1 - w) * glob.awayGoals,
      matches: n
    };
  }

  /* ---------- rating Elo (segundo modelo, ensamblado con el de goles) ----------
     Se acumula partido a partido en orden cronológico: R = 1500 + K·(resultado − esperado).
     hfa = ventaja de localía en puntos Elo; el resultado se codifica 1/0.5/0 (V/E/D). */
  function eloRatings(matches, params) {
    params = params || config.elo || {};
    var K = params.K != null ? params.K : 25;
    var hfa = params.hfa != null ? params.hfa : 70;
    var r = {};
    var list = matches.slice().sort(function (a, b) {
      var da = a.date || "", db = b.date || "";
      return da < db ? -1 : da > db ? 1 : 0;
    });
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var rh = r[m.homeId] != null ? r[m.homeId] : 1500;
      var ra = r[m.awayId] != null ? r[m.awayId] : 1500;
      var eH = 1 / (1 + Math.pow(10, -((rh + hfa) - ra) / 400));
      var sH = m.homeGoals > m.awayGoals ? 1 : (m.homeGoals === m.awayGoals ? 0.5 : 0);
      r[m.homeId] = rh + K * (sH - eH);
      r[m.awayId] = ra + K * ((1 - sH) - (1 - eH));
    }
    return r;
  }

  /* Probabilidades 1X2 del Elo con el modelo Davidson (admite empates) */
  function eloOneXTwo(ratingHome, ratingAway, params) {
    params = params || config.elo || {};
    var hfa = params.hfa != null ? params.hfa : 70;
    var nu = params.nu != null ? params.nu : 0.7;
    var rh = ratingHome != null ? ratingHome : 1500;
    var ra = ratingAway != null ? ratingAway : 1500;
    var x = Math.pow(10, ((rh + hfa) - ra) / 400);
    var sq = Math.sqrt(x);
    var den = x + 1 + nu * sq;
    return { homeWin: x / den, draw: nu * sq / den, awayWin: 1 / den };
  }

  /* Combina el 1X2 del modelo de goles con el del Elo (peso del Elo = w) */
  function blendElo(markets, ratingHome, ratingAway, params) {
    params = params || config.elo || {};
    var w = clamp(params.weight != null ? params.weight : 0, 0, 1);
    if (!w) return markets;
    var e = eloOneXTwo(ratingHome, ratingAway, params);
    var h = (1 - w) * markets.homeWin + w * e.homeWin;
    var d = (1 - w) * markets.draw + w * e.draw;
    var a = (1 - w) * markets.awayWin + w * e.awayWin;
    var s = h + d + a;
    var out = {};
    for (var k in markets) if (markets.hasOwnProperty(k)) out[k] = markets[k];
    out.homeWin = h / s; out.draw = d / s; out.awayWin = a / s;
    return out;
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
    var yellowFor = [], yellowAgainst = [], redFor = [], redAgainst = [];

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
      if (typeof mm.homeYellow === "number" && typeof mm.awayYellow === "number") {
        var hy = isHome ? mm.homeYellow : mm.awayYellow;
        var ay = isHome ? mm.awayYellow : mm.homeYellow;
        var hr = typeof mm.homeRed === "number" ? mm.homeRed : 0;
        var ar = typeof mm.awayRed === "number" ? mm.awayRed : 0;
        var ry = isHome ? hr : ar;
        var ra = isHome ? ar : hr;
        yellowFor.push(hy); yellowAgainst.push(ay);
        redFor.push(ry); redAgainst.push(ra);
        // El total de tarjetas sale del detalle cuando está disponible.
        if (!(typeof mm.homeCards === "number")) {
          cardsFor.push(hy + ry); cardsAgainst.push(ay + ra);
        }
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
      yellowFor: yellowFor.length ? mean(yellowFor) : null,
      yellowAgainst: yellowAgainst.length ? mean(yellowAgainst) : null,
      yellowMatches: yellowFor.length,
      redFor: redFor.length ? mean(redFor) : null,
      redAgainst: redAgainst.length ? mean(redAgainst) : null,
      redMatches: redFor.length,
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
    var k = config.smoothing || 12;
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

  /* Corrección Dixon-Coles (tau) para marcadores bajos.
     rho negativo → sube 0-0 y 1-1, baja 1-0 y 0-1 (más empates de pocos goles). */
  function dixonColesTau(i, j, lh, la, rho) {
    if (!rho) return 1;
    if (i === 0 && j === 0) return 1 - lh * la * rho;
    if (i === 0 && j === 1) return 1 + lh * rho;
    if (i === 1 && j === 0) return 1 + la * rho;
    if (i === 1 && j === 1) return 1 - rho;
    return 1;
  }

  /* Matriz de marcadores (Poisson independiente, con corrección opcional Dixon-Coles) */
  function scoreMatrix(lh, la, max, rho) {
    max = max || MAX_GOALS;
    if (rho == null) rho = config.rho;
    var ph = [], pa = [], i, j;
    for (i = 0; i <= max; i++) { ph.push(poissonPmf(i, lh)); pa.push(poissonPmf(i, la)); }
    var matrix = [], total = 0;
    for (i = 0; i <= max; i++) {
      matrix.push([]);
      for (j = 0; j <= max; j++) {
        var p = ph[i] * pa[j] * dixonColesTau(i, j, lh, la, rho);
        if (p < 0) p = 0;
        matrix[i].push(p);
        total += p;
      }
    }
    if (rho && total > 0) {
      for (i = 0; i <= max; i++) {
        for (j = 0; j <= max; j++) matrix[i][j] /= total;
      }
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
    // Escalado por temperatura de las probabilidades 1X2 (corrige sobreconfianza)
    if (config.temperature && config.temperature !== 1) {
      var T = config.temperature;
      var ph = Math.pow(Math.max(o.homeWin, 1e-12), 1 / T);
      var pd = Math.pow(Math.max(o.draw, 1e-12), 1 / T);
      var pa = Math.pow(Math.max(o.awayWin, 1e-12), 1 / T);
      var ps = ph + pd + pa;
      if (ps > 0) { o.homeWin = ph / ps; o.draw = pd / ps; o.awayWin = pa / ps; }
    }
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
    var lgYellowTotal = 4.2;   // amarillas de referencia por partido
    var lgRedTotal = 0.28;     // rojas de referencia por partido
    var hc = homeStats.cornersFor, ac = awayStats.cornersFor;
    var hcAgainst = homeStats.cornersAgainst, acAgainst = awayStats.cornersAgainst;
    var hasCorners = hc != null && ac != null;

    var homeCorners = hasCorners ? (hc + acAgainst) / 2 : lgCornersTotal / 2;
    var awayCorners = hasCorners ? (ac + hcAgainst) / 2 : lgCornersTotal / 2;

    // Amarillas: media de "a favor" del equipo y "en contra" del rival.
    var hy = homeStats.yellowFor, ay = awayStats.yellowFor;
    var hasYellow = hy != null && ay != null;
    var homeYellow = hasYellow ? (hy + awayStats.yellowAgainst) / 2 : lgYellowTotal / 2;
    var awayYellow = hasYellow ? (ay + homeStats.yellowAgainst) / 2 : lgYellowTotal / 2;

    // Rojas: igual criterio.
    var hr = homeStats.redFor, ar = awayStats.redFor;
    var hasRed = hr != null && ar != null;
    var homeRed = hasRed ? (hr + awayStats.redAgainst) / 2 : lgRedTotal / 2;
    var awayRed = hasRed ? (ar + homeStats.redAgainst) / 2 : lgRedTotal / 2;

    var cards = {
      home: homeYellow + homeRed,
      away: awayYellow + awayRed,
      total: homeYellow + awayYellow + homeRed + awayRed,
      hasData: hasYellow || hasRed
    };
    cards.yellow = { home: homeYellow, away: awayYellow, total: homeYellow + awayYellow, hasData: hasYellow };
    cards.red = { home: homeRed, away: awayRed, total: homeRed + awayRed, hasData: hasRed };

    return {
      corners: { home: homeCorners, away: awayCorners, total: homeCorners + awayCorners, hasData: hasCorners },
      cards: cards
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

  /* ---------- Cadena de Markov (secuencia de resultados V/E/D) ----------
     Modela la "racha" de un equipo como una cadena de Markov: el estado es el
     resultado de su partido anterior (W = victoria, D = empate, L = derrota) y la
     matriz de transición se estima de su historial real (suavizado de Laplace).
     Con el último estado se obtiene la distribución del PRÓXIMO resultado. */

  var M_STATES = ["W", "D", "L"];

  function resultFor(m, teamId) {
    var isHome = m.homeId === teamId;
    var gf = isHome ? m.homeGoals : m.awayGoals;
    var ga = isHome ? m.awayGoals : m.homeGoals;
    if (gf > ga) return "W";
    if (gf < ga) return "L";
    return "D";
  }

  /* Secuencia de resultados (más antiguo → más reciente). */
  function resultSequence(matches, teamId) {
    var seq = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (m.homeId !== teamId && m.awayId !== teamId) continue;
      if (m.homeGoals == null || m.awayGoals == null) continue;
      seq.push({ date: m.date || "", r: resultFor(m, teamId) });
    }
    seq.sort(function (a, b) { if (a.date === b.date) return 0; return a.date < b.date ? -1 : 1; });
    return seq;
  }

  /* Racha actual: cuántos partidos seguidos con el mismo resultado. */
  function trailingStreak(seq) {
    if (!seq.length) return { r: null, n: 0 };
    var r = seq[seq.length - 1].r, k = 1;
    for (var i = seq.length - 2; i >= 0 && seq[i].r === r; i--) k++;
    return { r: r, n: k };
  }

  /* Cadena de Markov de UN equipo. Devuelve matriz de transición, frecuencia,
     distribución estacionaria y la del próximo resultado. */
  function markovTeam(matches, teamId, opts) {
    opts = opts || {};
    var laplace = opts.laplace != null ? opts.laplace : 1;
    var recency = clamp(opts.recency || 0, 0, 1);

    var seq = resultSequence(matches, teamId);
    var n = seq.length;

    var counts = { W: 0, D: 0, L: 0 };
    for (var i = 0; i < n; i++) counts[seq[i].r]++;

    var trans = { W: { W: 0, D: 0, L: 0 }, D: { W: 0, D: 0, L: 0 }, L: { W: 0, D: 0, L: 0 } };
    var pairs = n > 1 ? n - 1 : 0;
    for (var j = 0; j + 1 < n; j++) {
      var from = seq[j].r, to = seq[j + 1].r;
      var dist = (pairs - 1) - j;                 // 0 = transición más reciente
      var w = recency > 0 ? Math.exp(-recency * dist * 0.35) : 1;
      trans[from][to] += w;
    }

    // Matriz normalizada con suavizado de Laplace (filas suman 1).
    var matrix = {};
    for (var a = 0; a < M_STATES.length; a++) {
      var s = M_STATES[a], row = trans[s];
      var tot = row.W + row.D + row.L + 3 * laplace;
      matrix[s] = { W: (row.W + laplace) / tot, D: (row.D + laplace) / tot, L: (row.L + laplace) / tot };
    }

    var freq = n ? { W: counts.W / n, D: counts.D / n, L: counts.L / n } : { W: 1 / 3, D: 1 / 3, L: 1 / 3 };

    var pairs_n = n > 1 ? n - 1 : 0;
    var last = n ? seq[n - 1].r : null;
    var next;
    if (last && pairs_n > 0) {
      // Mezcla hacia la frecuencia global cuando hay pocas transiciones (evita extremos).
      var conf = pairs_n / (pairs_n + 4);
      next = {
        W: conf * matrix[last].W + (1 - conf) * freq.W,
        D: conf * matrix[last].D + (1 - conf) * freq.D,
        L: conf * matrix[last].L + (1 - conf) * freq.L
      };
    } else {
      next = { W: freq.W, D: freq.D, L: freq.L };
    }

    // Distribución estacionaria (largo plazo) por iteración de potencias.
    var pi = { W: 1 / 3, D: 1 / 3, L: 1 / 3 };
    for (var it = 0; it < 60; it++) {
      var nw = pi.W * matrix.W.W + pi.D * matrix.D.W + pi.L * matrix.L.W;
      var nd = pi.W * matrix.W.D + pi.D * matrix.D.D + pi.L * matrix.L.D;
      var nl = pi.W * matrix.W.L + pi.D * matrix.D.L + pi.L * matrix.L.L;
      pi = { W: nw, D: nd, L: nl };
    }

    return {
      teamId: teamId,
      samples: n,
      transitions: pairs_n,
      reliable: n >= 8 && pairs_n >= 5,
      counts: counts,
      freq: freq,
      matrix: matrix,
      steady: pi,
      last: last,
      streak: trailingStreak(seq),
      sequence: seq.slice(-10).map(function (x) { return x.r; }),
      next: next
    };
  }

  /* Combina las cadenas de local y visitante en una probabilidad 1X2.
     Se normaliza el producto: local gana si su cadena marca W y la del visitante L;
     empate si ambas marcan D; visitante gana si el local marca L y el visitante W. */
  function markovForm(matches, homeId, awayId, opts) {
    var home = markovTeam(matches, homeId, opts);
    var away = markovTeam(matches, awayId, opts);
    var hw = home.next.W * away.next.L;
    var dr = home.next.D * away.next.D;
    var aw = home.next.L * away.next.W;
    var s = hw + dr + aw;
    var combined = s > 0
      ? { homeWin: hw / s, draw: dr / s, awayWin: aw / s }
      : { homeWin: 1 / 3, draw: 1 / 3, awayWin: 1 / 3 };
    return { home: home, away: away, combined: combined };
  }

  window.AD.stats = {
    MAX_GOALS: MAX_GOALS,
    config: config,
    K_COMP: K_COMP,
    clamp: clamp,
    mean: mean,
    poissonPmf: poissonPmf,
    leagueBaselines: leagueBaselines,
    competitionBaseline: competitionBaseline,
    eloRatings: eloRatings,
    eloOneXTwo: eloOneXTwo,
    blendElo: blendElo,
    teamStats: teamStats,
    expectedGoals: expectedGoals,
    scoreMatrix: scoreMatrix,
    dixonColesTau: dixonColesTau,
    outcomes: outcomes,
    derived: derived,
    setPieces: setPieces,
    simulate: simulate,
    markovForm: markovForm,
    markovTeam: markovTeam,
    headToHead: headToHead,
    confidence: confidence
  };
})();
