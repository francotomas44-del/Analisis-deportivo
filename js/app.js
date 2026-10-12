/* app.js — interfaz y orquestación (JS vainilla, sin dependencias)
   Usa window.AD.stats, window.AD.metrics y window.AD.store */
(function () {
  "use strict";

  var S = window.AD.store;
  var ST = window.AD.stats;
  var M = window.AD.metrics;
  var DS = window.AD.dataset;
  var BT = window.AD.backtest;

  var lastAnalysis = null; // resultado del último análisis (para guardar)

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pct(x) { return (100 * (x || 0)).toFixed(1) + "%"; }
  function num2(x) { return (x || 0).toFixed(2); }
  function today() { return new Date().toISOString().slice(0, 10); }

  function barRow(label, p) {
    var w = Math.max(0, Math.min(1, p || 0)) * 100;
    return '<div class="bar-row"><span class="bar-label">' + esc(label) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + w.toFixed(1) + '%"></span></span>' +
      '<span class="bar-val">' + pct(p) + '</span></div>';
  }

  function card(title, inner) {
    return '<div class="market"><div class="title">' + esc(title) + '</div>' + inner + '</div>';
  }

  /* ---------- navegación ---------- */
  function showView(name) {
    var views = document.querySelectorAll(".view");
    for (var i = 0; i < views.length; i++) views[i].classList.remove("is-active");
    var tabs = document.querySelectorAll(".tab");
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].classList.toggle("is-active", tabs[j].getAttribute("data-view") === name);
    }
    var v = $("view-" + name);
    if (v) v.classList.add("is-active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- inicio ---------- */
  function renderInicio() {
    var st = S.state;
    var closed = st.predictions.filter(function (p) { return p.result; }).length;
    var cards = [
      { n: st.teams.length, l: "Equipos" },
      { n: st.matches.length, l: "Partidos registrados" },
      { n: st.predictions.length, l: "Predicciones" },
      { n: closed, l: "Predicciones evaluadas" }
    ];
    $("inicio-cards").innerHTML = cards.map(function (c) {
      return '<div class="stat-card"><div class="num">' + c.n + '</div><div class="lbl">' + c.l + "</div></div>";
    }).join("");

    var principios = [
      "Evidencia antes que intuición",
      "Probabilidad antes que certeza",
      "Transparencia",
      "Trazabilidad",
      "Control de sesgos",
      "Honestidad estadística",
      "Reproducibilidad"
    ];
    $("inicio-principios").innerHTML = principios.map(function (p) {
      return '<span class="chip">' + esc(p) + "</span>";
    }).join("");
  }

  /* ---------- equipos ---------- */
  /* Agregados por equipo en una sola pasada (rápido con miles de partidos) */
  function buildTeamAggregates() {
    var agg = {};
    function get(id) { return agg[id] || (agg[id] = { matches: 0, gf: 0, ga: 0, cornerForSum: 0, cornerForN: 0, cardForSum: 0, cardForN: 0 }); }
    var ms = S.state.matches;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      var h = get(m.homeId), a = get(m.awayId);
      h.matches++; a.matches++;
      h.gf += m.homeGoals; h.ga += m.awayGoals;
      a.gf += m.awayGoals; a.ga += m.homeGoals;
      if (typeof m.homeCorners === "number" && typeof m.awayCorners === "number") {
        h.cornerForSum += m.homeCorners; h.cornerForN++;
        a.cornerForSum += m.awayCorners; a.cornerForN++;
      }
      if (typeof m.homeCards === "number" && typeof m.awayCards === "number") {
        h.cardForSum += m.homeCards; h.cardForN++;
        a.cardForSum += m.awayCards; a.cardForN++;
      }
    }
    return agg;
  }

  function renderEquipos() {
    var st = S.state;
    var host = $("tabla-equipos");
    if (!st.teams.length) { host.innerHTML = '<p class="empty">Todavía no cargaste equipos.</p>'; return; }

    var agg = buildTeamAggregates();
    var rows = st.teams.map(function (t) {
      var s = agg[t.id] || { matches: 0 };
      var gf = s.matches ? (s.gf / s.matches) : 0;
      var ga = s.matches ? (s.ga / s.matches) : 0;
      var cf = s.cornerForN ? (s.cornerForSum / s.cornerForN) : null;
      var kf = s.cardForN ? (s.cardForSum / s.cardForN) : null;
      return "<tr>" +
        "<td><strong>" + esc(t.name) + "</strong><br><span class='muted'>" + esc(t.league || "—") +
        (t.formedYear ? " · fund. " + t.formedYear : "") + "</span></td>" +
        "<td>" + s.matches + "</td>" +
        "<td>" + (s.matches ? num2(gf) : "—") + "</td>" +
        "<td>" + (s.matches ? num2(ga) : "—") + "</td>" +
        "<td>" + (cf != null ? num2(cf) : "—") + "</td>" +
        "<td>" + (kf != null ? num2(kf) : "—") + "</td>" +
        '<td><button class="btn btn-mini btn-danger-ghost" data-action="del-team" data-id="' + t.id + '">Eliminar</button></td>' +
        "</tr>";
    }).join("");

    host.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
      "<th>Equipo</th><th>PJ</th><th>GF/part.</th><th>GC/part.</th><th>Córners/part.</th><th>Tarjetas/part.</th><th></th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  /* ---------- partidos ---------- */
  function fillTeamSelects() {
    var st = S.state;
    var opts = '<option value="">— elegí —</option>' + st.teams.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.name) + "</option>";
    }).join("");

    ["partido-local", "partido-visitante", "an-local", "an-visitante"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var prev = el.value;
      el.innerHTML = opts;
      if (prev && st.teams.some(function (t) { return t.id === prev; })) el.value = prev;
    });

    $("partido-hint").textContent = st.teams.length < 2
      ? "Necesitás al menos 2 equipos para registrar partidos."
      : "";
  }

  var PARTIDOS_LIMIT = 300; // límite de filas renderizadas (con miles de partidos)

  function renderPartidos() {
    var st = S.state;
    var host = $("tabla-partidos");
    var nota = $("partidos-nota");
    if (!st.matches.length) {
      host.innerHTML = '<p class="empty">Todavía no registraste partidos.</p>';
      if (nota) nota.textContent = "";
      return;
    }

    var f = $("partidos-filtro") && $("partidos-filtro").value
      ? $("partidos-filtro").value.trim().toLowerCase() : "";
    var teamName = {};
    st.teams.forEach(function (t) { teamName[t.id] = (t.name || "").toLowerCase(); });

    var list = st.matches.filter(function (m) {
      if (!f) return true;
      var hn = teamName[m.homeId] || "", an = teamName[m.awayId] || "";
      return hn.indexOf(f) > -1 || an.indexOf(f) > -1 || (m.competition || "").toLowerCase().indexOf(f) > -1;
    });
    list.sort(function (a, b) { if (a.date === b.date) return 0; return a.date < b.date ? 1 : -1; });

    var total = list.length;
    var shown = list.slice(0, PARTIDOS_LIMIT);
    var rows = shown.map(function (m) {
      var h = S.getTeam(m.homeId), a = S.getTeam(m.awayId);
      var hn = h ? h.name : "?";
      var an = a ? a.name : "?";
      var cor = (m.homeCorners != null && m.awayCorners != null) ? (m.homeCorners + " - " + m.awayCorners) : "—";
      var tar = (m.homeCards != null && m.awayCards != null) ? (m.homeCards + " - " + m.awayCards) : "—";
      return "<tr>" +
        "<td>" + esc(m.date || "—") + "<br><span class='muted'>" + esc(m.competition || "") + "</span></td>" +
        "<td>" + esc(hn) + "</td>" +
        "<td><strong>" + m.homeGoals + " - " + m.awayGoals + "</strong></td>" +
        "<td>" + esc(an) + "</td>" +
        "<td>" + cor + "</td>" +
        "<td>" + tar + "</td>" +
        '<td><button class="btn btn-mini btn-danger-ghost" data-action="del-match" data-id="' + m.id + '">Eliminar</button></td>' +
        "</tr>";
    }).join("");

    host.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
      "<th>Fecha</th><th>Local</th><th>Resultado</th><th>Visitante</th><th>Córners</th><th>Tarjetas</th><th></th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";

    if (nota) {
      nota.textContent = "Mostrando " + shown.length.toLocaleString("es") + " de " + total.toLocaleString("es") +
        " partidos" + (f ? " (filtro: «" + f + "»)" : "") +
        (total > PARTIDOS_LIMIT ? ". Afiná el filtro para ver otros." : ".");
    }
  }

  /* ---------- análisis: motor ---------- */
  function computeAnalysis(cfg) {
    var matches = S.state.matches;
    var home = S.getTeam(cfg.homeId), away = S.getTeam(cfg.awayId);
    var base = ST.leagueBaselines(matches);
    var hs = ST.teamStats(cfg.homeId, matches, cfg.recency);
    var as = ST.teamStats(cfg.awayId, matches, cfg.recency);

    var eg = ST.expectedGoals(hs, as, base);
    var lh = eg.home, la = eg.away;

    var adjustments = [];
    if (cfg.homeBajas) { lh *= 0.94; adjustments.push("Bajas importantes del local: −6% en su ataque esperado."); }
    if (cfg.awayBajas) { la *= 0.94; adjustments.push("Bajas importantes del visitante: −6% en su ataque esperado."); }
    if (cfg.meteo) { lh *= 0.96; la *= 0.96; adjustments.push("Clima adverso previsto: −4% en los goles esperados de ambos."); }
    var restDiff = (cfg.restHome || 0) - (cfg.restAway || 0);
    if (restDiff >= 3) { lh *= 1.02; adjustments.push("El local descansó " + restDiff + " días más: +2% en su ataque esperado."); }
    else if (restDiff <= -3) { lh *= 0.98; adjustments.push("El local descansó " + Math.abs(restDiff) + " días menos: −2% en su ataque esperado."); }

    lh = ST.clamp(lh, 0.05, 6);
    la = ST.clamp(la, 0.05, 6);

    var matrix = ST.scoreMatrix(lh, la);
    var d = ST.derived(matrix, lh, la);
    var sp = ST.setPieces(hs, as, base);
    var sim = ST.simulate(lh, la, 10000, { redCardProb: 0.06 });
    var h2h = ST.headToHead(matches, cfg.homeId, cfg.awayId);

    var conf = ST.confidence({
      homeStats: hs, awayStats: as,
      hasCornersData: sp.corners.hasData,
      hasCardsData: sp.cards.hasData,
      lineupsConfirmed: cfg.lineups,
      homeBajas: cfg.homeBajas,
      awayBajas: cfg.awayBajas,
      meteo: cfg.meteo
    });

    var notes = [];
    if (hs.matches < 4) notes.push({ warn: true, text: "El local tiene pocos partidos registrados (" + hs.matches + "): estimación poco fiable." });
    if (as.matches < 4) notes.push({ warn: true, text: "El visitante tiene pocos partidos registrados (" + as.matches + "): estimación poco fiable." });
    if (!sp.corners.hasData) notes.push({ warn: true, text: "Sin datos de córners: se usan valores de referencia de la liga." });
    if (!sp.cards.hasData) notes.push({ warn: true, text: "Sin datos de tarjetas: se usan valores de referencia de la liga." });
    if (!cfg.lineups) notes.push({ warn: false, text: "Alineaciones no confirmadas: la confianza es menor." });
    if (matches.length < 10) notes.push({ warn: true, text: "Pocos partidos en la liga (" + matches.length + "): los promedios base son frágiles." });
    if (h2h.total) notes.push({ warn: false, text: "Cruces directos registrados: " + h2h.total + " (" + h2h.aWins + " para " + (home ? home.name : "el local") + ", " + h2h.draws + " empates, " + h2h.bWins + " para " + (away ? away.name : "el visitante") + ")." });
    else notes.push({ warn: true, text: "Sin cruces directos registrados entre estos equipos: el historial de enfrentamientos no aporta información." });

    return {
      input: {
        homeId: cfg.homeId, awayId: cfg.awayId,
        homeName: home ? home.name : "Local", awayName: away ? away.name : "Visitante",
        kickoff: cfg.kickoff || "",
        restHome: cfg.restHome, restAway: cfg.restAway,
        recency: cfg.recency, lineups: cfg.lineups,
        homeBajas: cfg.homeBajas, awayBajas: cfg.awayBajas, meteo: cfg.meteo,
        generatedAt: new Date().toISOString()
      },
      output: {
        expectedHome: lh,
        expectedAway: la,
        expectedTotal: lh + la,
        markets: d.markets,
        overLines: d.overLines,
        noGoals: d.noGoals,
        firstGoalHome: d.firstGoalHome,
        firstGoalAway: d.firstGoalAway,
        firstGoalNone: d.firstGoalNone,
        setPieces: sp,
        simulation: sim
      },
      homeStats: hs,
      awayStats: as,
      baseline: base,
      confidence: conf,
      headToHead: h2h,
      adjustments: adjustments,
      notes: notes
    };
  }

  /* ---------- análisis: render ---------- */
  function renderAnalysis(r) {
    var m = r.output.markets;
    var hn = r.input.homeName, an = r.input.awayName;

    var head = '<div class="panel">' +
      '<div class="result-head">' +
      '<div><div class="teams-line">' + esc(hn) + '<span class="vs">vs</span>' + esc(an) + "</div>" +
      '<div class="muted">Generado: ' + esc(new Date(r.input.generatedAt).toLocaleString()) + "</div></div>" +
      '<div><span class="badge ' + badgeClass(r.confidence.label) + '">Confianza ' + r.confidence.label + " · " + r.confidence.score.toFixed(0) + "/100</span></div>" +
      "</div>" +
      '<div class="kv">' +
      kv("Goles esperados local", num2(r.output.expectedHome)) +
      kv("Goles esperados visitante", num2(r.output.expectedAway)) +
      kv("Total esperado", num2(r.output.expectedTotal)) +
      kv("Marcador sin goles", pct(r.output.noGoals)) +
      "</div>" +
      '<p class="muted">La clasificación de resultados del sistema: las probabilidades son <strong>estimaciones</strong> (categoría C), no hechos confirmados.</p>' +
      "</div>";

    var market =
      '<div class="panel"><h2>Probabilidades principales</h2><div class="market-grid">' +
      card("Resultado final (1X2)",
        barRow(hn + " (1)", m.homeWin) + barRow("Empate (X)", m.draw) + barRow(an + " (2)", m.awayWin)) +
      card("Más / menos goles",
        barRow("Más 2.5", m.over25) + barRow("Menos 2.5", m.under25)) +
      card("Ambos marcan",
        barRow("Sí", m.btts) + barRow("No", m.noBtts)) +
      card("Primer gol",
        barRow(hn, r.output.firstGoalHome) + barRow(an, r.output.firstGoalAway) + barRow("Sin goles", r.output.firstGoalNone)) +
      "</div></div>";

    // líneas de goles
    var linesRows = Object.keys(r.output.overLines).map(function (L) {
      var ol = r.output.overLines[L];
      return "<tr><td>" + L + "</td><td>" + pct(ol.over) + "</td><td>" + pct(ol.under) + "</td></tr>";
    }).join("");

    // marcadores exactos
    var scores = m.correct.map(function (c) {
      return "<tr><td>" + c.h + " - " + c.a + "</td><td>" + pct(c.p) + "</td></tr>";
    }).join("");

    var markets2 = '<div class="panel"><h2>Goles y marcadores</h2><div class="market-grid">' +
      card("Líneas de goles totales",
        '<div class="table-wrap"><table><thead><tr><th>Línea</th><th>Más</th><th>Menos</th></tr></thead><tbody>' + linesRows + "</tbody></table></div>") +
      card("Marcadores más probables",
        '<div class="table-wrap"><table><thead><tr><th>Resultado</th><th>Prob.</th></tr></thead><tbody>' + scores + "</tbody></table></div>") +
      "</div></div>";

    // córners y tarjetas
    var sp = r.output.setPieces;
    var setp = '<div class="panel"><h2>Córners y tarjetas (estimaciones)</h2><div class="market-grid">' +
      card("Córners",
        kv("Local", num2(sp.corners.home)) + kv("Visitante", num2(sp.corners.away)) + kv("Total", num2(sp.corners.total)) +
        '<p class="muted">' + (sp.corners.hasData ? "Basado en datos históricos de córners." : "Sin datos: valores de referencia.") + "</p>") +
      card("Tarjetas",
        kv("Local", num2(sp.cards.home)) + kv("Visitante", num2(sp.cards.away)) + kv("Total", num2(sp.cards.total)) +
        '<p class="muted">' + (sp.cards.hasData ? "Basado en datos históricos de tarjetas." : "Sin datos: valores de referencia.") + "</p>") +
      "</div></div>";

    // simulación
    var sim = r.output.simulation;
    var simPanel = '<div class="panel"><h2>Escenarios (simulación de Monte Carlo)</h2>' +
      '<p class="muted">' + sim.runs.toLocaleString() + " partidos simulados. Incluye un escenario de expulsión temprana (prob. 6%).</p>" +
      '<div class="market-grid">' +
      card("1X2 simulado",
        barRow(hn, sim.homeWin) + barRow("Empate", sim.draw) + barRow(an, sim.awayWin)) +
      card("Otros escenarios",
        kv("Total medio de goles", num2(sim.avgTotal)) +
        kv("Portería a cero " + hn, pct(sim.cleanSheetHome)) +
        kv("Portería a cero " + an, pct(sim.cleanSheetAway))) +
      "</div></div>";

    // contexto
    var ctx = '<div class="panel"><h2>Contexto y datos usados</h2>';
    ctx += "<h3>Ajustes contextuales</h3>";
    ctx += r.adjustments.length
      ? '<ul class="steps">' + r.adjustments.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>"
      : '<p class="muted">No se aplicaron ajustes contextuales.</p>';
    ctx += "<h3>Datos base</h3>";
    ctx += '<div class="table-wrap"><table><thead><tr><th>Métrica</th><th>' + esc(hn) + "</th><th>" + esc(an) + "</th></tr></thead><tbody>" +
      statRow("Partidos registrados", r.homeStats.matches, r.awayStats.matches) +
      statRow("Goles a favor / part.", num2(r.homeStats.goalsForAvg), num2(r.awayStats.goalsForAvg)) +
      statRow("Goles en contra / part.", num2(r.homeStats.goalsAgainstAvg), num2(r.awayStats.goalsAgainstAvg)) +
      statRow("Ataque (local / visitante)", num2(r.homeStats.homeFor) + " / " + num2(r.homeStats.awayFor), num2(r.awayStats.homeFor) + " / " + num2(r.awayStats.awayFor)) +
      "</tbody></table></div>";
    ctx += '<p class="muted">Promedio de goles de la liga — local: ' + num2(r.baseline.homeGoals) + " · visitante: " + num2(r.baseline.awayGoals) + " (sobre " + r.baseline.matches + " partidos).</p>";
    if (r.notes.length) {
      ctx += "<h3>Advertencias y limitaciones</h3><ul class='notes'>" +
        r.notes.map(function (n) { return '<li class="' + (n.warn ? "warn" : "") + '">' + esc(n.text) + "</li>"; }).join("") + "</ul>";
    }
    ctx += "</div>";

    // enfrentamientos directos
    var h2h = r.headToHead;
    var h2hPanel;
    if (h2h && h2h.total) {
      var h2hRows = h2h.matches.map(function (mm) {
        var hh = S.getTeam(mm.homeId), aa = S.getTeam(mm.awayId);
        return "<tr><td>" + esc(mm.date || "—") + "</td><td>" + esc(hh ? hh.name : "?") +
          "</td><td><strong>" + mm.homeGoals + " - " + mm.awayGoals + "</strong></td><td>" + esc(aa ? aa.name : "?") +
          "</td><td>" + esc(mm.competition || "") + "</td></tr>";
      }).join("");
      h2hPanel = '<div class="panel"><h2>Enfrentamientos directos (historial)</h2>' +
        '<div class="kv">' +
        kv("Partidos totales", h2h.total) +
        kv("Victorias " + hn, h2h.aWins) +
        kv("Empates", h2h.draws) +
        kv("Victorias " + an, h2h.bWins) +
        kv("Goles " + hn + " / " + an, h2h.aGoals + " / " + h2h.bGoals) +
        kv("Promedio de goles", num2(h2h.avgTotal)) +
        "</div>" +
        '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Local</th><th>Resultado</th><th>Visitante</th><th>Competición</th></tr></thead><tbody>' +
        h2hRows + "</tbody></table></div>" +
        '<p class="muted">Resultados ya ocurridos (categoría A). Cuantos más cruces cargues, más sólida es esta lectura.</p></div>';
    } else {
      h2hPanel = '<div class="panel"><h2>Enfrentamientos directos (historial)</h2>' +
        '<p class="muted">No hay cruces registrados entre estos equipos en la base.</p></div>';
    }

    $("resultado-analisis").innerHTML = head + market + markets2 + setp + simPanel + h2hPanel + ctx;
  }

  function statRow(k, a, b) {
    return "<tr><td>" + esc(k) + "</td><td>" + a + "</td><td>" + b + "</td></tr>";
  }
  function kv(k, v) {
    return '<div><div class="k">' + esc(k) + '</div><div class="v">' + v + "</div></div>";
  }
  function badgeClass(label) {
    return ({ "Alta": "alta", "Media": "media", "Baja": "baja", "Muy baja": "muy-baja" })[label] || "pending";
  }

  /* ---------- guardar / listar predicciones ---------- */
  function savePrediction() {
    if (!lastAnalysis) return;
    var r = lastAnalysis;
    S.addPrediction({
      kickoff: r.input.kickoff,
      homeId: r.input.homeId,
      awayId: r.input.awayId,
      homeName: r.input.homeName,
      awayName: r.input.awayName,
      input: r.input,
      output: r.output,
      confidence: r.confidence
    });
    lastAnalysis = null;
    $("btn-guardar-pred").disabled = true;
    $("analisis-hint").textContent = "Predicción guardada. Ya podés cargar el resultado real en la pestaña Predicciones.";
    renderInicio();
    renderPredicciones();
    renderInformeSelect();
    showView("predicciones");
  }

  function renderPredicciones() {
    var st = S.state;
    var host = $("tabla-predicciones");
    if (!st.predictions.length) { host.innerHTML = '<p class="empty">Todavía no hay predicciones guardadas.</p>'; return; }

    var rows = st.predictions.slice().reverse().map(function (p) {
      var m = p.output.markets;
      var probs = num2(m.homeWin) + " / " + num2(m.draw) + " / " + num2(m.awayWin);
      var status = p.result
        ? '<span class="badge ok">Cerrada</span>'
        : '<span class="badge pending">Pendiente</span>';
      var fav = M.argmaxOutcome(m);
      var favName = fav === "home" ? p.homeName : fav === "away" ? p.awayName : "Empate";
      var favProb = fav === "home" ? m.homeWin : fav === "away" ? m.awayWin : m.draw;
      var real = p.result ? (p.result.homeGoals + " - " + p.result.awayGoals) : "—";
      var actions;
      if (p.result) {
        actions = '<button class="btn btn-mini btn-danger-ghost" data-action="del-pred" data-id="' + p.id + '">Eliminar</button>';
      } else {
        actions = '<div style="display:flex;gap:.3rem;align-items:center;flex-wrap:wrap">' +
          '<input type="number" min="0" max="20" value="0" style="width:52px" data-gl="' + p.id + '" title="Goles local">' +
          '<input type="number" min="0" max="20" value="0" style="width:52px" data-gv="' + p.id + '" title="Goles visitante">' +
          '<button class="btn btn-mini btn-primary" data-action="close-pred" data-id="' + p.id + '">Cerrar</button>' +
          '<button class="btn btn-mini btn-danger-ghost" data-action="del-pred" data-id="' + p.id + '">Eliminar</button>' +
          "</div>";
      }
      var kick = p.kickoff ? esc(p.kickoff.replace("T", " ")) : "—";
      return "<tr>" +
        "<td>" + esc(p.homeName) + " vs " + esc(p.awayName) + "<br><span class='muted'>Partido: " + kick + "</span></td>" +
        "<td>" + probs + "</td>" +
        "<td>" + esc(favName) + " <span class='muted'>(" + pct(favProb) + ")</span></td>" +
        "<td><span class='badge " + badgeClass(p.confidence.label) + "'>" + p.confidence.label + "</span></td>" +
        "<td>" + status + "</td>" +
        "<td>" + real + "</td>" +
        "<td>" + actions + "</td>" +
        "</tr>";
    }).join("");

    host.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
      "<th>Partido</th><th>1 / X / 2</th><th>Favorito</th><th>Conf.</th><th>Estado</th><th>Real</th><th>Acciones</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function closePrediction(id) {
    var gl = document.querySelector('[data-gl="' + id + '"]');
    var gv = document.querySelector('[data-gv="' + id + '"]');
    if (!gl || !gv) return;
    S.closePrediction(id, { homeGoals: gl.value, awayGoals: gv.value, date: today() });
    renderPredicciones();
    renderEvaluacion();
    renderInicio();
  }

  /* ---------- evaluación ---------- */
  function renderEvaluacion() {
    var st = S.state;
    var res = M.evaluate(st.predictions);
    var host = $("metricas-globales");

    if (!res.count) {
      host.innerHTML = '<p class="empty">Todavía no hay predicciones cerradas con resultado real.</p>';
      $("tabla-evaluacion").innerHTML = "";
      return;
    }

    var cards = [
      { n: (res.accuracy * 100).toFixed(1) + "%", l: "Aciertos 1X2 (más probable)" },
      { n: res.brier.toFixed(3), l: "Brier Score (menor mejor)" },
      { n: res.logloss.toFixed(3), l: "Log Loss (menor mejor)" },
      { n: res.maeTotal.toFixed(2), l: "MAE goles totales" },
      { n: res.rmseTotal.toFixed(2), l: "RMSE goles totales" },
      { n: res.count, l: "Partidos evaluados" }
    ];
    host.innerHTML = '<div class="grid-cards">' + cards.map(function (c) {
      return '<div class="stat-card"><div class="num">' + c.n + '</div><div class="lbl">' + c.l + "</div></div>";
    }).join("") + "</div>" +
      '<p class="muted">Sobre ' + res.count + " partido(s). MAE local: " + res.maeHome.toFixed(2) + " · MAE visitante: " + res.maeAway.toFixed(2) + ".</p>";

    var detail = res.perPred.map(function (p) {
      return "<tr>" +
        "<td>" + esc(p.label) + "<br><span class='muted'>" + esc(p.date || "") + "</span></td>" +
        "<td>" + outcomeName(p.predicted) + "</td>" +
        "<td>" + outcomeName(p.actual) + "</td>" +
        "<td>" + (p.hit ? '<span class="badge ok">Sí</span>' : '<span class="badge fail">No</span>') + "</td>" +
        "<td>" + p.brier.toFixed(3) + "</td>" +
        "<td>" + p.logloss.toFixed(3) + "</td>" +
        "<td>" + p.expTotal.toFixed(2) + " / " + p.actTotal + "</td>" +
        "</tr>";
    }).join("");
    $("tabla-evaluacion").innerHTML = '<div class="table-wrap"><table><thead><tr>' +
      "<th>Partido</th><th>Predicho</th><th>Real</th><th>Acierto</th><th>Brier</th><th>LogLoss</th><th>Goles esp./real</th>" +
      "</tr></thead><tbody>" + detail + "</tbody></table></div>";
  }

  function outcomeName(o) {
    return o === "home" ? "Local" : o === "away" ? "Visitante" : "Empate";
  }

  /* ---------- backtesting ---------- */
  var btStop = false;

  function fillBacktestComp() {
    var sel = $("bt-comp");
    if (!sel) return;
    var prev = sel.value;
    var comps = S.state.competitions.slice().sort(function (a, b) {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    sel.innerHTML = '<option value="">Todas</option>' + comps.map(function (c) {
      return '<option value="' + esc(c.name) + '">' + esc(c.name) + "</option>";
    }).join("");
    if (prev) sel.value = prev;

    // rango de fechas sugerido
    var from = $("bt-from"), to = $("bt-to");
    if (from && to && S.state.matches.length) {
      var minD = "", maxD = "";
      for (var i = 0; i < S.state.matches.length; i++) {
        var d = S.state.matches[i].date || "";
        if (!d) continue;
        if (!minD || d < minD) minD = d;
        if (!maxD || d > maxD) maxD = d;
      }
      if (minD) { from.setAttribute("min", minD); from.setAttribute("max", maxD); }
      if (maxD) { to.setAttribute("min", minD); to.setAttribute("max", maxD); }
    }
  }

  function runBacktest() {
    if (!BT) return;
    var comp = $("bt-comp").value;
    var from = $("bt-from").value;
    var to = $("bt-to").value;
    var minHistory = parseInt($("bt-minhistory").value, 10);
    if (isNaN(minHistory)) minHistory = 5;
    var recency = (parseInt($("bt-recency").value, 10) || 0) / 100;
    var max = parseInt($("bt-max").value, 10);
    if (isNaN(max)) max = 0;

    btStop = false;
    $("btn-bt-run").disabled = true;
    $("btn-bt-stop").disabled = false;
    $("bt-status").textContent = "Procesando…";
    setOverlay(true, "Ejecutando backtesting…", "Preparando el recorrido cronológico…", 0);

    BT.run({
      competition: comp, from: from, to: to,
      recency: recency, minHistory: minHistory, max: max,
      shouldStop: function () { return btStop; }
    }, function (done, total, agg) {
      var frac = total ? done / total : 0;
      setOverlay(true, "Ejecutando backtesting…",
        "Evaluados " + done.toLocaleString("es") + " de " + total.toLocaleString("es") + " partidos…", frac);
    }).then(function (res) {
      setOverlay(false);
      $("btn-bt-run").disabled = false;
      $("btn-bt-stop").disabled = true;
      renderBacktest(res);
    }).catch(function (e) {
      setOverlay(false);
      $("btn-bt-run").disabled = false;
      $("btn-bt-stop").disabled = true;
      $("bt-status").textContent = "Error: " + (e && e.message ? e.message : e);
    });
  }

  function renderBacktest(res) {
    if (!res || !res.count) {
      $("bt-metricas").innerHTML = '<p class="empty">No hay partidos evaluables con los filtros elegidos' +
        (res && res.skippedLowHistory ? " (" + res.skippedLowHistory.toLocaleString("es") + " descartados por historial insuficiente)." : ".") + "</p>";
      $("bt-baseline").textContent = "";
      $("bt-calibracion").innerHTML = "";
      $("bt-detalle").innerHTML = "";
      $("bt-detalle-nota").textContent = "";
      $("bt-status").textContent = "Sin resultados.";
      return;
    }

    var n = res.count;
    $("bt-status").textContent = "Backtesting completado · " + n.toLocaleString("es") + " partidos evaluados.";

    var cards = [
      { n: n.toLocaleString("es"), l: "Partidos evaluados" },
      { n: (res.accuracy * 100).toFixed(1) + "%", l: "Aciertos 1X2" },
      { n: res.brier.toFixed(3), l: "Brier (menor mejor)" },
      { n: res.logloss.toFixed(3), l: "Log Loss (menor mejor)" },
      { n: res.maeTotal.toFixed(2), l: "MAE goles totales" },
      { n: res.rmseTotal.toFixed(2), l: "RMSE goles totales" }
    ];
    $("bt-metricas").innerHTML = cards.map(function (c) {
      return '<div class="stat-card"><div class="num">' + c.n + '</div><div class="lbl">' + c.l + "</div></div>";
    }).join("");

    var b = res.baseline;
    var op = res.options || {};
    var txt = "Modelo: suavizado k=" + (op.smoothing != null ? op.smoothing : "—") +
      ", temperatura=" + (op.temperature != null ? op.temperature : "—") +
      ", ρ (Dixon-Coles)=" + (op.rho != null ? op.rho : "—") + ". ";
    txt += "Evaluados " + n.toLocaleString("es") + " de " + res.pool.toLocaleString("es") + " partidos del conjunto filtrado.";
    if (res.skippedLowHistory) txt += " Descartados por historial insuficiente: " + res.skippedLowHistory.toLocaleString("es") + ".";
    if (res.stopped) txt += " (detenido por el usuario: resultados parciales).";
    if (b) {
      txt += " Referencia — «climatología del período»: acierto de «siempre gana el local» " + (b.homeAccuracy * 100).toFixed(1) +
        "%, Brier " + b.climatologyBrier.toFixed(3) + ", Log Loss " + b.climatologyLogLoss.toFixed(3) + ".";
      txt += " Distribución real: local " + (b.rates.home * 100).toFixed(1) + "% / empate " + (b.rates.draw * 100).toFixed(1) +
        "% / visitante " + (b.rates.away * 100).toFixed(1) + "%.";
    }
    txt += " Cálculo: " + (res.elapsedMs / 1000).toFixed(1) + " s.";
    $("bt-baseline").textContent = txt;

    // calibración
    var calRows = res.calibration.map(function (r) {
      return "<tr><td>" + r.rango + "</td><td>" + r.n.toLocaleString("es") + "</td><td>" +
        (r.probMedia != null ? pct(r.probMedia) : "—") + "</td><td>" +
        (r.frecObs != null ? pct(r.frecObs) : "—") + "</td></tr>";
    }).join("");
    $("bt-calibracion").innerHTML = '<div class="table-wrap"><table><thead><tr>' +
      "<th>Confianza</th><th>N</th><th>Prob. media</th><th>Frec. observada</th>" +
      "</tr></thead><tbody>" + calRows + "</tbody></table></div>";

    // detalle (muestra)
    $("bt-detalle-nota").textContent = "Muestra de " + res.detail.length.toLocaleString("es") + " partido(s).";
    var dRows = res.detail.map(function (x) {
      return "<tr>" +
        "<td>" + esc(x.date) + "<br><span class='muted'>" + esc(x.competition) + "</span></td>" +
        "<td>" + esc(x.home) + " <strong>" + x.hg + " - " + x.ag + "</strong> " + esc(x.away) + "</td>" +
        "<td>" + outcomeName(x.predicted) + "</td>" +
        "<td>" + outcomeName(x.actual) + "</td>" +
        "<td>" + (x.hit ? '<span class="badge ok">Sí</span>' : '<span class="badge fail">No</span>') + "</td>" +
        "<td>" + x.brier.toFixed(3) + "</td>" +
        "<td>" + x.expTotal.toFixed(2) + " / " + x.actTotal + "</td>" +
        "</tr>";
    }).join("");
    $("bt-detalle").innerHTML = '<div class="table-wrap"><table><thead><tr>' +
      "<th>Fecha</th><th>Partido</th><th>Predicho</th><th>Real</th><th>Acierto</th><th>Brier</th><th>Goles esp./real</th>" +
      "</tr></thead><tbody>" + dRows + "</tbody></table></div>";
  }

  /* ---------- informe ---------- */
  function renderInformeSelect() {
    var st = S.state;
    var sel = $("informe-select");
    var prev = sel.value;
    if (!st.predictions.length) {
      sel.innerHTML = '<option value="">— sin predicciones —</option>';
      return;
    }
    sel.innerHTML = st.predictions.slice().reverse().map(function (p) {
      var tag = p.result ? " (cerrada)" : " (pendiente)";
      return '<option value="' + p.id + '">' + esc(p.homeName + " vs " + p.awayName) + " · " + esc((p.kickoff || p.createdAt).slice(0, 10)) + tag + "</option>";
    }).join("");
    if (prev) sel.value = prev;
  }

  function generateReport() {
    var id = $("informe-select").value;
    var p = null;
    for (var i = 0; i < S.state.predictions.length; i++) if (S.state.predictions[i].id === id) p = S.state.predictions[i];
    var out = $("informe-salida");
    if (!p) { out.textContent = "No hay predicción seleccionada."; return; }
    var text = buildReportText(p);
    out.textContent = text;
    $("btn-informe-copiar").disabled = false;
    $("btn-informe-imprimir").disabled = false;
  }

  function buildReportText(p) {
    var o = p.output, m = o.markets, sp = o.setPieces, sim = o.simulation;
    var L = [];
    L.push("INFORME DE ANÁLISIS — ANÁLISIS DEPORTIVO");
    L.push("=========================================");
    L.push("Partido: " + p.homeName + " (local) vs " + p.awayName + " (visitante)");
    L.push("Fecha del partido: " + (p.kickoff || "no especificada"));
    L.push("Predicción registrada: " + new Date(p.createdAt).toLocaleString());
    L.push("");
    L.push("1. DATOS EXACTOS CONOCIDOS (categoría A)");
    L.push("   - Partidos considerados por equipo y promedios de goles (ver base).");
    L.push("");
    L.push("2. ESTIMACIONES CUANTITATIVAS (categoría B)");
    L.push("   - Goles esperados: " + p.homeName + " " + num2(o.expectedHome) + " — " + p.awayName + " " + num2(o.expectedAway));
    L.push("   - Total esperado de goles: " + num2(o.expectedTotal));
    L.push("   - Córners estimados: " + num2(sp.corners.total) + " (local " + num2(sp.corners.home) + " / visitante " + num2(sp.corners.away) + ")");
    L.push("   - Tarjetas estimadas: " + num2(sp.cards.total) + " (local " + num2(sp.cards.home) + " / visitante " + num2(sp.cards.away) + ")");
    L.push("");
    L.push("3. PREDICCIONES PROBABILÍSTICAS (categoría C)");
    L.push("   - Victoria " + p.homeName + " (1): " + pct(m.homeWin));
    L.push("   - Empate (X): " + pct(m.draw));
    L.push("   - Victoria " + p.awayName + " (2): " + pct(m.awayWin));
    L.push("   - Más de 2.5 goles: " + pct(m.over25) + " | Menos de 2.5: " + pct(m.under25));
    L.push("   - Ambos marcan: " + pct(m.btts) + " | No ambos: " + pct(m.noBtts));
    L.push("   - Primer gol: " + p.homeName + " " + pct(o.firstGoalHome) + " | " + p.awayName + " " + pct(o.firstGoalAway) + " | sin goles " + pct(o.noGoals));
    L.push("   - Marcadores más probables:");
    m.correct.slice(0, 5).forEach(function (c) {
      L.push("       " + c.h + "-" + c.a + "  " + pct(c.p));
    });
    L.push("");
    L.push("4. ESCENARIOS CONDICIONALES (categoría D) — Monte Carlo (" + sim.runs.toLocaleString() + " sim.)");
    L.push("   - 1X2 simulado: " + pct(sim.homeWin) + " / " + pct(sim.draw) + " / " + pct(sim.awayWin));
    L.push("   - Total medio simulado: " + num2(sim.avgTotal));
    L.push("");
    L.push("5. CONFIANZA");
    L.push("   - Nivel: " + p.confidence.label + " (" + p.confidence.score.toFixed(0) + "/100)");
    L.push("");
    L.push("6. FUNDAMENTOS");
    if (p.input && p.input.generatedAt) {
      L.push("   - Configuración: énfasis forma reciente " + (((p.input.recency || 0) * 100).toFixed(0)) + "%; descanso local " + (p.input.restHome) + " días, visitante " + (p.input.restAway) + " días.");
      L.push("   - Alineaciones confirmadas: " + (p.input.lineups ? "sí" : "no") + ".");
      L.push("   - Bajas importantes — local: " + (p.input.homeBajas ? "sí" : "no") + ", visitante: " + (p.input.awayBajas ? "sí" : "no") + ".");
      L.push("   - Clima adverso: " + (p.input.meteo ? "sí" : "no") + ".");
    }
    L.push("");
    L.push("7. LIMITACIONES");
    L.push("   - Las predicciones son estimaciones probabilísticas, no hechos confirmados.");
    L.push("   - Acontecimientos aleatorios (expulsiones, penales, errores) no pueden predecirse.");
    L.push("   - La fiabilidad del modelo se demuestra sobre muestras amplias de partidos.");
    if (p.result) {
      L.push("");
      L.push("8. RESULTADO REAL Y EVALUACIÓN");
      L.push("   - Resultado: " + p.result.homeGoals + " - " + p.result.awayGoals);
      var actual = M.outcomeFromScore(p.result.homeGoals, p.result.awayGoals);
      L.push("   - Resultado observado: " + outcomeName(actual));
      L.push("   - Brier: " + M.brier1x2(p.output.markets, actual).toFixed(3) + " | Log Loss: " + M.logLoss1x2(p.output.markets, actual).toFixed(3));
    }
    return L.join("\n");
  }

  /* ---------- fuentes / API ---------- */
  function renderFuentes() {
    var st = S.state;
    var host = $("fuentes-resumen");
    if (!host) return;
    var closed = st.predictions.filter(function (p) { return p.result; }).length;
    var cards = [
      { n: st.teams.length, l: "Equipos" },
      { n: st.competitions.length, l: "Competiciones" },
      { n: st.referees.length, l: "Árbitros" },
      { n: st.matches.length, l: "Partidos" },
      { n: st.predictions.length, l: "Predicciones" },
      { n: closed, l: "Predicciones evaluadas" }
    ];
    host.innerHTML = cards.map(function (c) {
      return '<div class="stat-card"><div class="num">' + c.n + '</div><div class="lbl">' + c.l + "</div></div>";
    }).join("");
  }

  function fmtTime(d) { return d.toLocaleTimeString(); }

  function updateSaveIndicator() {
    var el = $("save-indicator");
    if (!el) return;
    var hasData = S.state.teams.length || S.state.matches.length;
    var d = S.getLastSavedAt();
    el.classList.remove("dirty");
    if (!hasData && !d) { el.classList.remove("ok"); el.textContent = "Sin datos"; return; }
    el.classList.add("ok");
    el.textContent = d ? ("Guardado \u2713 " + fmtTime(d)) : "Guardado \u2713";
  }

  function setBackupStatus(msg) { var el = $("backup-status"); if (el) el.textContent = msg; }
  function setBaseStatus(msg) { var el = $("base-status"); if (el) el.textContent = msg; }

  function setOverlay(show, title, msg, frac) {
    var ov = $("base-overlay");
    if (!ov) return;
    ov.style.display = show ? "flex" : "none";
    var t = $("base-overlay-title");
    if (t && title != null) t.textContent = title;
    if (msg != null) { var m = $("base-overlay-msg"); if (m) m.textContent = msg; }
    if (frac != null) { var f = $("base-overlay-fill"); if (f) f.style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + "%"; }
  }

  /* Carga (o recarga) la base histórica integrada. */
  function loadBase(silent) {
    if (DS.isLoading()) return Promise.resolve();
    if (!silent && (S.state.teams.length || S.state.matches.length) &&
        !confirm("Esto reemplaza los datos actuales por la base histórica completa. ¿Continuar?")) return Promise.resolve();

    var btns = [$("btn-load-base"), $("btn-load-base-home")].filter(function (b) { return !!b; });
    btns.forEach(function (b) { b.disabled = true; });
    setOverlay(true, "Cargando base histórica…", "Preparando…", 0);

    return S.reset().then(function () {
      return DS.load(function (done, total, matches) {
        setOverlay(true, "Cargando base histórica…", "Leyendo " + done + " de " + total + " archivos · " + matches.toLocaleString("es") + " partidos…", done / total);
      });
    }).then(function (res) {
      setOverlay(false);
      refreshAll();
      var msg = "Base cargada: " + res.totalTeams.toLocaleString("es") + " equipos/selecciones, " +
        res.totalComps + " competiciones, " + res.totalMatches.toLocaleString("es") + " partidos.";
      if (res.filesFailed) msg += " (" + res.filesFailed + " archivos no se pudieron leer)";
      setBaseStatus(msg);
      return res;
    }).catch(function (e) {
      setOverlay(false);
      setBaseStatus("No se pudo cargar la base: " + (e && e.message ? e.message : e));
    }).then(function (x) {
      btns.forEach(function (b) { b.disabled = false; });
      return x;
    });
  }

  /* ---------- acciones globales ---------- */
  function refreshAll() {
    renderInicio();
    renderEquipos();
    fillTeamSelects();
    renderPartidos();
    renderPredicciones();
    renderEvaluacion();
    fillBacktestComp();
    renderInformeSelect();
    renderFuentes();
  }

  function resetAnalysis() {
    lastAnalysis = null;
    $("btn-guardar-pred").disabled = true;
    $("analisis-hint").textContent = "";
  }

  /* ---------- init ---------- */
  function init() {
    // Aviso de origen: file:// no es confiable para el guardado interno
    if (location.protocol === "file:") {
      var w = $("origin-warning");
      if (w) {
        w.style.display = "block";
        w.innerHTML = "<strong>Atención:</strong> abriste la app como archivo local (<code>file://</code>). " +
          "En muchas configuraciones el navegador bloquea el guardado interno, por lo que los datos podrían NO conservarse al recargar. " +
          "Para que se guarden siempre: ejecutá <code>iniciar-servidor.bat</code> y usá siempre <code>http://localhost:8766/</code>. " +
          "Además, descargá una copia de seguridad en la pestaña <strong>Fuentes</strong>.";
      }
    }

    // tabs
    $("tabs").addEventListener("click", function (e) {
      var t = e.target.closest(".tab");
      if (t) showView(t.getAttribute("data-view"));
    });

    // equipos
    $("form-equipo").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("equipo-nombre").value.trim();
      if (!name) return;
      S.addTeam(name, $("equipo-liga").value);
      $("equipo-nombre").value = "";
      $("equipo-liga").value = "";
      refreshAll();
    });

    // partidos
    $("partido-fecha").value = today();
    $("form-partido").addEventListener("submit", function (e) {
      e.preventDefault();
      var hl = $("partido-local").value, av = $("partido-visitante").value;
      if (!hl || !av) { alert("Elegí equipo local y visitante."); return; }
      if (hl === av) { alert("El local y el visitante deben ser distintos."); return; }
      S.addMatch({
        date: $("partido-fecha").value,
        competition: $("partido-comp").value,
        homeId: hl, awayId: av,
        homeGoals: $("partido-gl").value, awayGoals: $("partido-gv").value,
        homeCorners: $("partido-cl").value, awayCorners: $("partido-cv").value,
        homeCards: $("partido-tl").value, awayCards: $("partido-tv").value
      });
      ["partido-gl", "partido-gv", "partido-cl", "partido-cv", "partido-tl", "partido-tv"].forEach(function (id) { $(id).value = ""; });
      $("partido-gl").value = "0"; $("partido-gv").value = "0";
      refreshAll();
      showView("partidos");
    });

    // análisis
    $("an-forma").addEventListener("input", function () {
      $("an-forma-val").textContent = this.value;
      resetAnalysis();
    });
    ["an-local", "an-visitante", "an-kickoff", "an-descanso-local", "an-descanso-visitante",
      "an-alineaciones", "an-bajas-local", "an-bajas-visitante", "an-meteo"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", resetAnalysis);
    });

    $("btn-analizar").addEventListener("click", function () {
      var hl = $("an-local").value, av = $("an-visitante").value;
      if (!hl || !av) { alert("Elegí equipo local y visitante."); return; }
      if (hl === av) { alert("El local y el visitante deben ser distintos."); return; }

      lastAnalysis = computeAnalysis({
        homeId: hl, awayId: av,
        kickoff: $("an-kickoff").value,
        restHome: Number($("an-descanso-local").value) || 0,
        restAway: Number($("an-descanso-visitante").value) || 0,
        recency: Number($("an-forma").value) / 100,
        lineups: $("an-alineaciones").checked,
        homeBajas: $("an-bajas-local").checked,
        awayBajas: $("an-bajas-visitante").checked,
        meteo: $("an-meteo").checked
      });
      renderAnalysis(lastAnalysis);
      $("btn-guardar-pred").disabled = false;
      $("analisis-hint").textContent = "Análisis generado. Guardá la predicción antes del partido para poder evaluarla.";
    });

    $("btn-guardar-pred").addEventListener("click", savePrediction);

    // informe
    $("btn-informe").addEventListener("click", generateReport);
    $("btn-informe-copiar").addEventListener("click", function () {
      var t = $("informe-salida").textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () {
        $("btn-informe-copiar").textContent = "Copiado ✓";
        setTimeout(function () { $("btn-informe-copiar").textContent = "Copiar"; }, 1500);
      });
    });
    $("btn-informe-imprimir").addEventListener("click", function () { window.print(); });

    // delegación de acciones dinámicas
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      var id = btn.getAttribute("data-id");
      if (action === "del-team") {
        if (confirm("¿Eliminar el equipo y todos sus partidos?")) { S.removeTeam(id); refreshAll(); }
      } else if (action === "del-match") {
        if (confirm("¿Eliminar este partido?")) { S.removeMatch(id); refreshAll(); }
      } else if (action === "close-pred") {
        closePrediction(id);
      } else if (action === "del-pred") {
        if (confirm("¿Eliminar esta predicción?")) { S.removePrediction(id); refreshAll(); }
      }
    });

    // ---- Fuentes / export ----
    S.setOnSaved(updateSaveIndicator);

    $("btn-export").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(S.state, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "analisis-deportivo-" + today() + ".json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
      setBackupStatus("Copia descargada. Guardala en un lugar seguro.");
    });

    $("btn-save-now").addEventListener("click", function () {
      S.saveNow().then(function () { setBackupStatus("Guardado manualmente a las " + fmtTime(new Date()) + "."); });
    });

    $("restore-file").addEventListener("change", function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(String(reader.result)); }
        catch (e) { setBackupStatus("Archivo inválido: " + e.message); return; }
        if (!data || (!Array.isArray(data.teams) && !Array.isArray(data.matches))) {
          setBackupStatus("El archivo no parece una copia de este sistema."); return;
        }
        if (!confirm("Esto reemplaza los datos actuales por los de la copia. ¿Continuar?")) return;
        S.replaceState(data).then(function () {
          resetAnalysis();
          $("resultado-analisis").innerHTML = "";
          refreshAll();
          setBackupStatus("Copia restaurada: " + S.state.teams.length + " equipos y " + S.state.matches.length + " partidos.");
        });
      };
      reader.onerror = function () { setBackupStatus("No se pudo leer el archivo."); };
      reader.readAsText(f);
      this.value = "";
    });

    // Volcado al cerrar/ocultar la pestaña para no perder lo pendiente.
    function flush() { try { S.saveNow(); } catch (e) {} }
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });

    // base histórica / borrar todo
    [$("btn-load-base"), $("btn-load-base-home")].forEach(function (b) {
      if (b) b.addEventListener("click", function () { loadBase(false); });
    });

    // filtro del historial de partidos
    var pfiltro = $("partidos-filtro");
    if (pfiltro) pfiltro.addEventListener("input", function () { renderPartidos(); });

    // backtesting
    if ($("btn-bt-run")) $("btn-bt-run").addEventListener("click", runBacktest);
    if ($("btn-bt-stop")) $("btn-bt-stop").addEventListener("click", function () { btStop = true; $("bt-status").textContent = "Deteniendo…"; });
    var btr = $("bt-recency");
    if (btr) btr.addEventListener("input", function () { $("bt-recency-out").textContent = (btr.value || 0) + "%"; });

    $("btn-wipe").addEventListener("click", function () {
      if (!confirm("¿Borrar TODOS los equipos, partidos y predicciones?")) return;
      S.reset();
      resetAnalysis();
      $("resultado-analisis").innerHTML = "";
      setBaseStatus("");
      refreshAll();
      showView("inicio");
    });

    document.addEventListener("ad:data-changed", refreshAll);

    // carga inicial desde IndexedDB (o localStorage)
    S.init().then(function () {
      refreshAll();
      updateSaveIndicator();
      // Primera vez (base vacía): cargar automáticamente la base histórica integrada.
      if (S.state.matches.length === 0 && S.state.teams.length === 0) {
        loadBase(true);
      }
    });
    showView("inicio");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
