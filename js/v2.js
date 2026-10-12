/* v2.js — capa pública "amistosa" (portada "Hoy", modo simple/avanzado,
   compartir pronósticos y PWA). Es una capa ADITIVA: no reemplaza las vistas
   originales; se apoya en los motores existentes (AD.store, AD.stats, AD.dataset).

   Namespace: window.AD.v2 */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var S = window.AD.store;
  var ST = window.AD.stats;
  var DS = window.AD.dataset;

  /* ===== Marca ==================================================
     Cambiá estas líneas y cambia en TODA la interfaz. */
  var BRAND = {
    name: "Futbolityx",
    claim: "Pronósticos de fútbol, claros y honestos",
    url: "https://francotomas44-del.github.io/Futbolityx/"
  };

  var OLD_NAME = "Futbolunaki"; // nombre anterior, para reemplazar el texto visible

  var MAX_CARDS = 30;   // cuántos próximos partidos se muestran con pronóstico
  var RECENCY = 0.35;   // énfasis en forma reciente (igual que la pestaña Análisis)

  /* ===== Preferencias de interfaz (persistidas) ================= */
  var PREF_KEY = "futbolunaki:ui";
  var prefs = { mode: "simple" };
  try {
    var rawPref = localStorage.getItem(PREF_KEY);
    if (rawPref) {
      var parsed = JSON.parse(rawPref);
      if (parsed && typeof parsed === "object") prefs = Object.assign(prefs, parsed);
    }
  } catch (e) { /* ignora */ }

  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {} }

  /* ===== utilidades ============================================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pct1(x) { return String(Math.round(100 * (x || 0))); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  /* ===== Zonas horarias ========================================
     La base openfootball indica la hora LOCAL del partido. Para las
     ligas cuyos equipos están en un solo país usamos la zona horaria de
     ese país (VENUE_TZ) para pasar la hora local a un instante UTC.
     Los partidos que ya traen offset explícito (ej. "20:00 UTC-4") se
     convierten con ese dato exacto. El usuario elige su país (o deja
     "Automático", que usa la zona horaria de su navegador). */
  var VENUE_TZ = {
    "en.1": "Europe/London", "sco.1": "Europe/London",
    "es.1": "Europe/Madrid", "de.1": "Europe/Berlin", "it.1": "Europe/Rome",
    "fr.1": "Europe/Paris", "nl.1": "Europe/Amsterdam", "pt.1": "Europe/Lisbon",
    "at.1": "Europe/Vienna", "be.1": "Europe/Brussels", "ch.1": "Europe/Zurich",
    "gr.1": "Europe/Athens", "tr.1": "Europe/Istanbul", "ru.1": "Europe/Moscow",
    "mx.1": "America/Mexico_City", "ar.1": "America/Argentina/Buenos_Aires",
    "br.1": "America/Sao_Paulo", "cz.1": "Europe/Prague", "hu.1": "Europe/Budapest",
    "cn.1": "Asia/Shanghai", "jp.1": "Asia/Tokyo", "au.1": "Australia/Sydney",
    "co.1": "America/Bogota", "dz.1": "Africa/Algiers", "eg.1": "Africa/Cairo",
    "ma.1": "Africa/Casablanca"
  };

  var COUNTRIES = [
    { code: "AR", name: "Argentina", flag: "🇦🇷", tz: "America/Argentina/Buenos_Aires" },
    { code: "UY", name: "Uruguay", flag: "🇺🇾", tz: "America/Montevideo" },
    { code: "CL", name: "Chile", flag: "🇨🇱", tz: "America/Santiago" },
    { code: "PY", name: "Paraguay", flag: "🇵🇾", tz: "America/Asuncion" },
    { code: "BO", name: "Bolivia", flag: "🇧🇴", tz: "America/La_Paz" },
    { code: "PE", name: "Perú", flag: "🇵🇪", tz: "America/Lima" },
    { code: "CO", name: "Colombia", flag: "🇨🇴", tz: "America/Bogota" },
    { code: "EC", name: "Ecuador", flag: "🇪🇨", tz: "America/Guayaquil" },
    { code: "VE", name: "Venezuela", flag: "🇻🇪", tz: "America/Caracas" },
    { code: "MX", name: "México", flag: "🇲🇽", tz: "America/Mexico_City" },
    { code: "US", name: "Estados Unidos (Este)", flag: "🇺🇸", tz: "America/New_York" },
    { code: "BR", name: "Brasil", flag: "🇧🇷", tz: "America/Sao_Paulo" },
    { code: "ES", name: "España", flag: "🇪🇸", tz: "Europe/Madrid" },
    { code: "PT", name: "Portugal", flag: "🇵🇹", tz: "Europe/Lisbon" },
    { code: "GB", name: "Reino Unido", flag: "🇬🇧", tz: "Europe/London" },
    { code: "FR", name: "Francia", flag: "🇫🇷", tz: "Europe/Paris" },
    { code: "DE", name: "Alemania", flag: "🇩🇪", tz: "Europe/Berlin" },
    { code: "IT", name: "Italia", flag: "🇮🇹", tz: "Europe/Rome" },
    { code: "NL", name: "Países Bajos", flag: "🇳🇱", tz: "Europe/Amsterdam" },
    { code: "BE", name: "Bélgica", flag: "🇧🇪", tz: "Europe/Brussels" },
    { code: "CH", name: "Suiza", flag: "🇨🇭", tz: "Europe/Zurich" },
    { code: "AT", name: "Austria", flag: "🇦🇹", tz: "Europe/Vienna" },
    { code: "GR", name: "Grecia", flag: "🇬🇷", tz: "Europe/Athens" },
    { code: "TR", name: "Turquía", flag: "🇹🇷", tz: "Europe/Istanbul" },
    { code: "RU", name: "Rusia", flag: "🇷🇺", tz: "Europe/Moscow" },
    { code: "CZ", name: "Chequia", flag: "🇨🇿", tz: "Europe/Prague" },
    { code: "HU", name: "Hungría", flag: "🇭🇺", tz: "Europe/Budapest" },
    { code: "JP", name: "Japón", flag: "🇯🇵", tz: "Asia/Tokyo" },
    { code: "CN", name: "China", flag: "🇨🇳", tz: "Asia/Shanghai" },
    { code: "AU", name: "Australia (Sídney)", flag: "🇦🇺", tz: "Australia/Sydney" },
    { code: "EG", name: "Egipto", flag: "🇪🇬", tz: "Africa/Cairo" },
    { code: "MA", name: "Marruecos", flag: "🇲🇦", tz: "Africa/Casablanca" },
    { code: "DZ", name: "Argelia", flag: "🇩🇿", tz: "Africa/Algiers" }
  ];

  var WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  function detectTz() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
  }
  var detectedTz = detectTz() || "UTC";

  function countryByCode(code) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].code === code) return COUNTRIES[i];
    return null;
  }
  function currentTz() {
    var c = prefs.country ? countryByCode(prefs.country) : null;
    return c ? c.tz : detectedTz;
  }
  function tzLabel() {
    var c = prefs.country ? countryByCode(prefs.country) : null;
    return c ? c.name : detectedTz;
  }

  var dtfCache = {};
  function partsInTz(ms, tz) {
    tz = tz || currentTz();
    var f = dtfCache[tz];
    if (f === undefined) {
      try {
        f = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz, hour12: false,
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit"
        });
      } catch (e) { f = null; }
      dtfCache[tz] = f;
    }
    if (!f) {
      var d = new Date(ms);
      return { year: String(d.getFullYear()), month: pad2(d.getMonth() + 1), day: pad2(d.getDate()),
        hour: pad2(d.getHours()), minute: pad2(d.getMinutes()), second: pad2(d.getSeconds()) };
    }
    var parts = f.formatToParts(new Date(ms));
    var o = {};
    for (var i = 0; i < parts.length; i++) if (parts[i].type !== "literal") o[parts[i].type] = parts[i].value;
    var h = parseInt(o.hour, 10); if (h === 24) h = 0;
    o.hour = pad2(h);
    return o;
  }
  function dateKeyInTz(ms, tz) {
    var p = partsInTz(ms, tz);
    return p.year + "-" + p.month + "-" + p.day;
  }
  function timeInTz(ms, tz) {
    var p = partsInTz(ms, tz);
    return p.hour + ":" + p.minute;
  }
  function tzOffsetMs(tz, ts) {
    var p = partsInTz(ts, tz);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) -
      Math.floor(ts / 1000) * 1000;
  }
  function zonedTimeToUtc(y, mo, da, hh, mm, tz) {
    var guess = Date.UTC(y, mo - 1, da, hh, mm);
    var o1 = tzOffsetMs(tz, guess);
    var ts = guess - o1;
    var o2 = tzOffsetMs(tz, ts);
    return o2 !== o1 ? guess - o2 : ts;
  }
  function gmtLabel(tz) {
    var off = Math.round(tzOffsetMs(tz || currentTz(), Date.now()) / 60000);
    var a = Math.abs(off);
    return "GMT" + (off < 0 ? "-" : "+") + pad2(Math.floor(a / 60)) + ":" + pad2(a % 60);
  }

  /* Instante (ms) del partido. exact=false => no se pudo ubicar la zona
     de la sede (se muestra la hora local tal cual, sin convertir).
     Se memoriza por partido (no depende de la zona elegida por el usuario). */
  function kickoff(f) {
    if (f && f._ko && f._kdate === f.date && f._ktime === f.time) return f._ko;
    var res = computeKickoff(f);
    if (f) { f._ko = res; f._kdate = f.date; f._ktime = f.time; }
    return res;
  }
  function computeKickoff(f) {
    var t = (f && f.time) ? String(f.time) : "";
    var m = /(\d{1,2}):(\d{2})(?:\s*UTC([+-]?\d{1,2})(?::?(\d{2}))?)?/.exec(t);
    if (!f || !f.date || !m) return { ms: null, hasTime: false };
    var ymd = f.date.split("-");
    var y = +ymd[0], mo = +ymd[1], da = +ymd[2];
    if (!y || !mo || !da) return { ms: null, hasTime: false };
    var hh = +m[1], mi = +m[2];
    if (m[3] !== undefined && m[3] !== "") {
      var oh = parseInt(m[3], 10), om = m[4] ? parseInt(m[4], 10) : 0;
      var sign = oh < 0 ? -1 : 1;
      var offMin = sign * (Math.abs(oh) * 60 + om);
      return { ms: Date.UTC(y, mo - 1, da, hh, mi) - offMin * 60000, hasTime: true, exact: true };
    }
    var venue = VENUE_TZ[f.code];
    if (venue) return { ms: zonedTimeToUtc(y, mo, da, hh, mi, venue), hasTime: true, exact: true };
    return { ms: null, hasTime: true, exact: false };
  }

  /* Etiquetas de "Hoy / Mañana / Ayer" según la zona elegida. */
  var _todayKey = null, _tomKey = null, _yesKey = null;
  function refreshDayKeys() {
    var now = Date.now();
    _todayKey = dateKeyInTz(now);
    _tomKey = dateKeyInTz(now + 86400000);
    _yesKey = dateKeyInTz(now - 86400000);
  }
  function dayLabel(dateStr) {
    if (!_todayKey) refreshDayKeys();
    if (dateStr === _todayKey) return "Hoy";
    if (dateStr === _tomKey) return "Mañana";
    if (dateStr === _yesKey) return "Ayer";
    var d = new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return WEEKDAYS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1);
  }

  /* Texto de fecha/hora del partido, ya en la zona del usuario. */
  function whenText(f) {
    var k = kickoff(f);
    if (k.ms) return dayLabel(dateKeyInTz(k.ms)) + " · " + timeInTz(k.ms);
    if (k.hasTime) return dayLabel(f.date) + " · " + f.time + " (hora local)";
    return dayLabel(f.date) + " · hora por confirmar";
  }
  /* Clave de agrupación por día (en la zona del usuario). */
  function groupKey(f) {
    var k = kickoff(f);
    return k.ms ? dateKeyInTz(k.ms) : f.date;
  }
  function slug(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("v2-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "v2-toast";
      el.className = "v2-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("is-on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 2600);
  }

  /* ===== Marca y modo simple/avanzado ========================== */
  function rebrandText(root) {
    if (!root) root = document.body;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var v = node.nodeValue;
      if (v && v.indexOf(OLD_NAME) !== -1) node.nodeValue = v.split(OLD_NAME).join(BRAND.name);
    });
  }

  function applyBrand() {
    try {
      document.title = BRAND.name + " — " + BRAND.claim;
      var h1 = document.querySelector(".brand h1");
      if (h1) h1.textContent = BRAND.name;
      var sub = document.querySelector(".brand-sub");
      if (sub) sub.textContent = BRAND.claim;
      var logo = document.querySelector(".brand img");
      if (logo) logo.alt = BRAND.name;
      rebrandText(document.body);
    } catch (e) { /* ignora */ }
  }

  function isAdvanced() { return prefs.mode === "avanzado"; }

  function applyMode() {
    document.body.classList.toggle("simple", !isAdvanced());
    var btn = $("btn-mode");
    if (btn) {
      btn.textContent = isAdvanced() ? "Modo simple" : "Modo avanzado";
      btn.setAttribute("aria-pressed", isAdvanced() ? "true" : "false");
    }
  }

  function toggleMode() {
    prefs.mode = isAdvanced() ? "simple" : "avanzado";
    savePrefs();
    applyMode();
    if (!isAdvanced()) {
      var active = document.querySelector(".view.is-active");
      if (active && active.hasAttribute("data-adv")) {
        var t = document.querySelector('.tabs .tab[data-view="hoy"]');
        if (t) t.click();
      }
    }
  }

  /* ===== Motor de pronóstico (reutiliza AD.stats) ============== */
  var ctx = null;

  function buildContext() {
    var matches = S.state.matches;
    return { matches: matches, ratings: ST.eloRatings(matches), compBase: {}, globalBase: null };
  }

  function baseFor(comp) {
    if (!ctx) return null;
    if (!comp) {
      if (!ctx.globalBase) ctx.globalBase = ST.leagueBaselines(ctx.matches);
      return ctx.globalBase;
    }
    if (!(comp in ctx.compBase)) ctx.compBase[comp] = ST.competitionBaseline(ctx.matches, comp);
    return ctx.compBase[comp];
  }

  function predict(homeId, awayId, comp) {
    var matches = ctx.matches;
    var base = baseFor(comp);
    var hs = ST.teamStats(homeId, matches, RECENCY);
    var as = ST.teamStats(awayId, matches, RECENCY);
    var eg = ST.expectedGoals(hs, as, base);
    var d = ST.derived(ST.scoreMatrix(eg.home, eg.away), eg.home, eg.away);
    d.markets = ST.blendElo(d.markets, ctx.ratings[homeId] || 1500, ctx.ratings[awayId] || 1500);
    var conf = ST.confidence({
      homeStats: hs, awayStats: as, hasCornersData: false, hasCardsData: false,
      lineupsConfirmed: false, homeBajas: false, awayBajas: false, meteo: false
    });
    return {
      lh: eg.home, la: eg.away,
      hw: d.markets.homeWin, dr: d.markets.draw, aw: d.markets.awayWin,
      over25: d.markets.over25, btts: d.markets.btts,
      top: d.markets.correct, conf: conf, homeMatches: hs.matches, awayMatches: as.matches
    };
  }

  function favorite(p) {
    if (p.hw >= p.dr && p.hw >= p.aw) return "home";
    if (p.aw >= p.hw && p.aw >= p.dr) return "away";
    return "draw";
  }

  function confSlug(label) {
    return ({ "Alta": "alta", "Media": "media", "Baja": "baja", "Muy baja": "muybaja" })[label] || "media";
  }

  /* ===== Portada "Hoy" ======================================== */
  var cache = { fixtures: null, filter: "" };

  function isActive() {
    var v = $("view-hoy");
    return !!v && v.classList.contains("is-active");
  }

  function onShowView() { renderHoy(); }

  function onDataChanged() {
    ctx = null;
    cache.fixtures = null;
    if (isActive()) renderHoy();
  }

  function renderHoy() {
    var host = $("hoy-root");
    if (!host) return;
    if (!S.state.matches.length) { renderOnboarding(host); return; }

    host.innerHTML =
      '<div class="hoy-head">' +
        '<div><h2 class="hoy-title">Partidos y pronósticos</h2>' +
        '<p class="muted" id="hoy-sub">Cargando próximos partidos…</p></div>' +
      "</div>" +
      '<div id="hoy-list">' + skeleton(4) + "</div>";

    DS.loadUpcoming()
      .then(function (fx) { cache.fixtures = fx || []; renderList(); })
      .catch(function (e) {
        var list = $("hoy-list"), sub = $("hoy-sub");
        if (sub) sub.textContent = "No se pudieron cargar los próximos partidos.";
        if (list) host.innerHTML = '<div class="panel"><p class="muted">' +
          esc(e && e.message ? e.message : String(e)) + "</p></div>";
      });
  }

  function renderOnboarding(host) {
    host.innerHTML =
      '<section class="onboard">' +
        '<div class="onboard-orb" aria-hidden="true"></div>' +
        '<span class="hero-pill">&#9917; ' + esc(BRAND.name) + "</span>" +
        '<h2 class="onboard-title">Pronósticos de fútbol en segundos</h2>' +
        '<p class="onboard-sub">Mirá las probabilidades de los próximos partidos, calculadas 100% en tu navegador. ' +
          "Sin registro, sin cuentas, gratis.</p>" +
        '<div class="onboard-actions">' +
          '<button class="btn btn-primary btn-lg" id="onboard-start" type="button">Cargar partidos y empezar</button>' +
          '<button class="btn btn-ghost btn-lg" type="button" data-goto="acerca">Cómo funciona</button>' +
        "</div>" +
        '<p class="muted onboard-note">La primera vez descarga la base histórica (~14 MB, una sola vez). ' +
        "Después queda guardada en este navegador y abre al instante.</p>" +
        '<p class="muted" id="base-status"></p>' +
      "</section>";

    var b = $("onboard-start");
    if (b) b.addEventListener("click", function () {
      var top = $("btn-load-base");
      if (top) top.click();
    });
  }

  function skeleton(n) {
    var out = "";
    for (var i = 0; i < n; i++) {
      out += '<div class="fx-skel"><div class="sk-line w40"></div><div class="sk-line w80"></div>' +
        '<div class="sk-bar"></div><div class="sk-line w60"></div></div>';
    }
    return out;
  }

  function compOptions(fixtures) {
    var seen = {}, names = [];
    fixtures.forEach(function (f) {
      if (f.competition && !seen[f.competition]) { seen[f.competition] = true; names.push(f.competition); }
    });
    names.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
    return '<option value="">Todas las competiciones</option>' + names.map(function (n) {
      return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
    }).join("");
  }

  function renderList() {
    var listEl = $("hoy-list");
    if (!listEl) return;
    var fixtures = cache.fixtures || [];
    var sub = $("hoy-sub");

    if (!fixtures.length) {
      if (sub) sub.textContent = "No hay partidos próximos en la base.";
      listEl.innerHTML = '<div class="panel"><p class="muted">La base no incluye partidos futuros. ' +
        "Podés analizar cualquier cruce desde <strong>Analizar</strong>.</p></div>";
      return;
    }

    var filter = cache.filter || "";
    var filtered = filter ? fixtures.filter(function (f) { return f.competition === filter; }) : fixtures;

    refreshDayKeys();

    /* Ordena por el instante real (ya convertido a la zona del usuario) y
       agrupa por día en esa misma zona. */
    var decorated = filtered.map(function (f) {
      var k = kickoff(f);
      return { f: f, ms: k.ms, key: groupKey(f) };
    });
    decorated.sort(function (a, b) {
      var av = a.ms != null ? a.ms : Date.parse(a.f.date + "T12:00:00");
      var bv = b.ms != null ? b.ms : Date.parse(b.f.date + "T12:00:00");
      if (av !== bv) return av - bv;
      return a.f.competition < b.f.competition ? -1 : 1;
    });
    var shown = decorated.slice(0, MAX_CARDS);

    if (!ctx) ctx = buildContext();

    var items = shown.map(function (d) {
      var f = d.f;
      var ht = S.getTeamByName(f.home), at = S.getTeamByName(f.away);
      var p = null;
      if (ht && at) { try { p = predict(ht.id, at.id, f.competition); } catch (e) { p = null; } }
      return { f: f, ht: ht, at: at, p: p, key: d.key };
    });

    if (sub) {
      sub.textContent = filtered.length.toLocaleString("es") +
        (filtered.length === 1 ? " próximo partido" : " próximos partidos") +
        (filtered.length > MAX_CARDS ? " · mostrando los primeros " + MAX_CARDS : "") +
        " · horarios en " + tzLabel() + " (" + gmtLabel() + ")";
    }

    var parts = [];
    parts.push('<div class="hoy-tools"><label class="hoy-field">' +
      '<span>Competición</span><select id="hoy-comp">' + compOptions(fixtures) + "</select></label></div>");

    var lastDay = null;
    items.forEach(function (it, i) {
      if (it.key !== lastDay) {
        lastDay = it.key;
        parts.push('<div class="day-sep"><span>' + esc(dayLabel(it.key)) + "</span><i></i></div>");
      }
      parts.push(cardHTML(it, i));
    });

    listEl.innerHTML = parts.join("");

    var sel = $("hoy-comp");
    if (sel) {
      sel.value = filter;
      sel.addEventListener("change", function () { cache.filter = sel.value; renderList(); });
    }

    listEl.querySelectorAll("[data-fx]").forEach(function (btn) {
      btn.addEventListener("click", function () { onCardAction(btn, items); });
    });
  }

  function cardHTML(it, i) {
    var f = it.f, p = it.p;
    var when = whenText(f);

    var head = '<div class="fx-top"><span class="fx-comp">' + esc(f.competition) + "</span>" +
      '<span class="fx-when">' + esc(when) + "</span></div>";

    var teams = '<div class="fx-teams">' +
      '<div class="fx-team home"><span class="fx-name">' + esc(f.home) + "</span>" +
        (p ? '<span class="fx-tag">' + pct1(p.hw) + "%</span>" : "") + "</div>" +
      '<div class="fx-vs">VS</div>' +
      '<div class="fx-team away"><span class="fx-name">' + esc(f.away) + "</span>" +
        (p ? '<span class="fx-tag">' + pct1(p.aw) + "%</span>" : "") + "</div>" +
      "</div>";

    var body;
    if (!p) {
      body = '<div class="fx-nodata">Sin historial suficiente para estimar ' +
        "(igual podés analizarlo a mano).</div>";
    } else {
      var hw = pct1(p.hw), dr = pct1(p.dr), aw = pct1(p.aw);
      var top = p.top && p.top[0] ? (p.top[0].h + " - " + p.top[0].a) : "—";
      var topP = p.top && p.top[0] ? pct1(p.top[0].p) + "%" : "";
      var fav = favorite(p);
      var favLabel = fav === "home" ? "Gana " + f.home : fav === "away" ? "Gana " + f.away : "Empate";

      body =
        '<div class="prob-bar">' +
          '<span class="seg seg-home" style="width:' + hw + '%"><b>' + hw + "%</b></span>" +
          '<span class="seg seg-draw" style="width:' + dr + '%"><b>' + dr + "%</b></span>" +
          '<span class="seg seg-away" style="width:' + aw + '%"><b>' + aw + "%</b></span>" +
        "</div>" +
        '<div class="prob-legend"><span class="lg-home">1 · Local</span>' +
          '<span class="lg-draw">X · Empate</span><span class="lg-away">2 · Visita</span></div>' +
        '<div class="fx-stats">' +
          "<span><b>" + esc(favLabel) + "</b></span>" +
          "<span>Goles esperados " + p.lh.toFixed(1) + "–" + p.la.toFixed(1) + "</span>" +
          "<span>Marcador probable <b>" + (p.top && p.top[0] ? p.top[0].h + "-" + p.top[0].a : "—") +
            "</b> (" + (p.top && p.top[0] ? pct1(p.top[0].p) + "%" : "—") + ")</span>" +
          '<span class="badge conf-' + confSlug(p.conf.label) + '">Confianza ' + p.conf.label + "</span>" +
        "</div>";
    }

    var actions = '<div class="fx-actions">' +
      '<button class="btn btn-primary btn-mini" type="button" data-fx="analizar" data-i="' + i + '">Analizar completo</button>' +
      '<button class="btn btn-secondary btn-mini" type="button" data-fx="compartir" data-i="' + i + '">Compartir</button>' +
      '<button class="btn btn-ghost btn-mini" type="button" data-fx="imagen" data-i="' + i + '">Imagen</button>' +
      "</div>";

    return '<article class="fx' + (p ? "" : " fx--nodata") + '">' + head + teams + body + actions + "</article>";
  }

  function onCardAction(btn, items) {
    var i = Number(btn.getAttribute("data-i"));
    var it = items[i];
    if (!it) return;
    var action = btn.getAttribute("data-fx");
    if (action === "analizar") analyzeTeams(it);
    else if (action === "compartir") shareFixture(it);
    else if (action === "imagen") downloadCard(it);
  }

  function analyzeTeams(it) {
    if (!it.ht || !it.at) { toast("No se encontraron esos equipos en la base."); return; }
    var l = $("an-local"), v = $("an-visitante");
    if (l) l.value = it.ht.id;
    if (v) v.value = it.at.id;
    var tab = document.querySelector('.tabs .tab[data-view="analisis"]');
    if (tab) tab.click();
    var go = $("btn-analizar");
    if (go) go.click();
  }

  /* ===== Compartir ============================================ */
  function buildShareText(it) {
    var f = it.f, p = it.p;
    var lines = [BRAND.name + " · " + f.home + " vs " + f.away];
    lines.push(f.competition);
    lines.push("Cuándo: " + whenText(f) + " (hora " + tzLabel() + ")");
    if (p) {
      lines.push("Local " + pct1(p.hw) + "% · Empate " + pct1(p.dr) + "% · Visita " + pct1(p.aw) + "%");
      if (p.top && p.top[0]) lines.push("Marcador más probable: " + p.top[0].h + "-" + p.top[0].a);
    }
    lines.push("Estimación estadística, no es una garantía.");
    lines.push(BRAND.url);
    return lines.join("\n");
  }

  function fallbackCopy(t) {
    var ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed"; ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Pronóstico copiado."); }
    catch (e) { window.prompt("Copiá el pronóstico:", t); }
    ta.remove();
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast("Pronóstico copiado."); }, function () { fallbackCopy(t); });
    } else fallbackCopy(t);
  }

  function shareFixture(it) {
    var text = buildShareText(it);
    makeCardBlob(it).then(function (blob) {
      var file = null;
      try { file = new File([blob], "pronostico.png", { type: "image/png" }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], text: text, title: BRAND.name }).catch(function () {});
      } else if (navigator.share) {
        navigator.share({ title: BRAND.name + ": " + it.f.home + " vs " + it.f.away, text: text, url: BRAND.url })
          .catch(function () {});
      } else {
        copyText(text);
      }
    }).catch(function () { copyText(text); });
  }

  function downloadCard(it) {
    makeCardBlob(it).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "pronostico-" + slug(it.f.home) + "-vs-" + slug(it.f.away) + ".png";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
      toast("Imagen descargada.");
    }).catch(function () { toast("No se pudo generar la imagen."); });
  }

  /* ===== Imagen compartible (canvas) ========================== */
  function makeCardBlob(it) {
    return new Promise(function (resolve, reject) {
      try {
        var c = drawCard(it);
        if (c.toBlob) c.toBlob(function (b) { b ? resolve(b) : resolve(dataURLtoBlob(c.toDataURL("image/png"))); }, "image/png");
        else resolve(dataURLtoBlob(c.toDataURL("image/png")));
      } catch (e) { reject(e); }
    });
  }

  function dataURLtoBlob(dataUrl) {
    var parts = dataUrl.split(",");
    var bin = atob(parts[1]);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: "image/png" });
  }

  function roundRect(x, rx, ry, w, h, r) {
    x.beginPath();
    x.moveTo(rx + r, ry);
    x.arcTo(rx + w, ry, rx + w, ry + h, r);
    x.arcTo(rx + w, ry + h, rx, ry + h, r);
    x.arcTo(rx, ry + h, rx, ry, r);
    x.arcTo(rx, ry, rx + w, ry, r);
    x.closePath();
  }

  function fitText(x, text, cx, y, size, maxW, weight) {
    var s = size;
    do {
      x.font = (weight ? weight + " " : "") + s + "px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      if (x.measureText(text).width <= maxW) break;
      s -= 2;
    } while (s > 24);
    x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.fillText(text, cx, y);
  }

  function segLabel(x, text, cx, cy, w) { if (w > 84) x.fillText(text, cx, cy); }

  function drawCard(it) {
    var f = it.f, p = it.p;
    var W = 1080, H = 1350;
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var x = c.getContext("2d");

    var g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#071019"); g.addColorStop(0.55, "#0d1b2e"); g.addColorStop(1, "#08131f");
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    var rg = x.createRadialGradient(W / 2, 430, 40, W / 2, 430, 560);
    rg.addColorStop(0, "rgba(34,227,154,0.30)"); rg.addColorStop(1, "rgba(34,227,154,0)");
    x.fillStyle = rg; x.beginPath(); x.arc(W / 2, 430, 560, 0, Math.PI * 2); x.fill();

    x.textAlign = "left"; x.textBaseline = "alphabetic";
    x.fillStyle = "#22e39a"; x.font = "bold 46px system-ui, sans-serif";
    x.fillText(BRAND.name, 80, 132);
    x.fillStyle = "#8da3c0"; x.font = "26px system-ui, sans-serif";
    x.fillText(BRAND.claim, 80, 172);

    x.textAlign = "center";
    x.fillStyle = "#cfe0f5"; x.font = "34px system-ui, sans-serif";
    x.fillText(f.competition, W / 2, 300);
    x.fillStyle = "#8da3c0"; x.font = "30px system-ui, sans-serif";
    x.fillText(whenText(f), W / 2, 350);
    x.fillStyle = "#6b7f99"; x.font = "25px system-ui, sans-serif";
    x.fillText("hora " + tzLabel() + " · " + gmtLabel(), W / 2, 388);

    x.fillStyle = "#ffffff";
    fitText(x, f.home, W / 2, 480, 78, 920, "bold");
    x.fillStyle = "#8da3c0"; x.font = "40px system-ui, sans-serif"; x.textAlign = "center";
    x.fillText("vs", W / 2, 545);
    x.fillStyle = "#ffffff";
    fitText(x, f.away, W / 2, 635, 78, 920, "bold");

    var bx = 90, bw = W - 180, by = 720, bh = 92;
    if (p) {
      var sum = (p.hw + p.dr + p.aw) || 1;
      var w1 = bw * p.hw / sum, w2 = bw * p.dr / sum, w3 = bw * p.aw / sum;
      roundRect(x, bx, by, bw, bh, 18); x.save(); x.clip();
      x.fillStyle = "#22e39a"; x.fillRect(bx, by, w1, bh);
      x.fillStyle = "#ffc857"; x.fillRect(bx + w1, by, w2, bh);
      x.fillStyle = "#6d8cff"; x.fillRect(bx + w1 + w2, by, w3, bh);
      x.restore();

      x.textAlign = "center"; x.textBaseline = "middle";
      x.font = "bold 42px system-ui, sans-serif"; x.fillStyle = "#032018";
      segLabel(x, pct1(p.hw) + "%", bx + w1 / 2, by + bh / 2, w1);
      x.fillStyle = "#3a2a00";
      segLabel(x, pct1(p.dr) + "%", bx + w1 + w2 / 2, by + bh / 2, w2);
      x.fillStyle = "#071033";
      segLabel(x, pct1(p.aw) + "%", bx + w1 + w2 + w3 / 2, by + bh / 2, w3);

      x.textBaseline = "alphabetic"; x.textAlign = "left"; x.font = "30px system-ui, sans-serif";
      x.fillStyle = "#22e39a"; x.fillText("1 Local", bx, by + 150);
      x.fillStyle = "#ffc857"; x.fillText("X Empate", bx + 300, by + 150);
      x.fillStyle = "#6d8cff"; x.fillText("2 Visita", bx + 660, by + 150);

      x.textAlign = "center";
      x.fillStyle = "#eaf2fb"; x.font = "34px system-ui, sans-serif";
      x.fillText("Marcador más probable", W / 2, 990);
      x.fillStyle = "#ffffff"; x.font = "bold 130px system-ui, sans-serif";
      x.fillText(p.top && p.top[0] ? p.top[0].h + " - " + p.top[0].a : "—", W / 2, 1110);
      x.fillStyle = "#8da3c0"; x.font = "30px system-ui, sans-serif";
      x.fillText("Goles esperados " + p.lh.toFixed(1) + " – " + p.la.toFixed(1) +
        "   ·   Confianza " + p.conf.label, W / 2, 1165);
    } else {
      x.textAlign = "center"; x.fillStyle = "#8da3c0"; x.font = "40px system-ui, sans-serif";
      x.fillText("Sin historial suficiente para estimar", W / 2, 800);
      x.textAlign = "left";
    }

    x.textAlign = "center";
    x.fillStyle = "#6b7f99"; x.font = "27px system-ui, sans-serif";
    x.fillText("Estimación estadística · no es una garantía · +18 si se usa en apuestas", W / 2, 1252);
    x.fillStyle = "#22e39a"; x.font = "30px system-ui, sans-serif";
    x.fillText(BRAND.url.replace(/^https?:\/\//, "").replace(/\/$/, ""), W / 2, 1302);

    return c;
  }

  /* ===== PWA ================================================== */
  function registerSW() {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.register) return;
    var ok = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!ok) return;
    navigator.serviceWorker.register("sw.js").catch(function () { /* ignora */ });
  }

  /* ===== Selector de país / zona horaria ====================== */
  function buildCountrySelect() {
    var sel = $("sel-country");
    if (!sel) return;
    var opts = ['<option value="">🌐 Automático · ' + esc(detectedTz) + "</option>"];
    COUNTRIES.forEach(function (c) {
      opts.push('<option value="' + c.code + '">' + c.flag + " " + esc(c.name) + "</option>");
    });
    sel.innerHTML = opts.join("");
    sel.value = prefs.country || "";
    sel.addEventListener("change", function () {
      prefs.country = sel.value;
      savePrefs();
      refreshDayKeys();
      toast("Horarios en hora de " + tzLabel() + " (" + gmtLabel() + ").");
      if (isActive()) renderHoy();
    });
  }

  /* ===== init ================================================= */
  function init() {
    applyBrand();
    applyMode();
    refreshDayKeys();
    buildCountrySelect();
    var btn = $("btn-mode");
    if (btn) btn.addEventListener("click", toggleMode);
    registerSW();
  }

  window.AD.v2 = {
    onShowView: onShowView,
    onDataChanged: onDataChanged,
    renderHoy: renderHoy,
    toggleMode: toggleMode,
    applyMode: applyMode,
    brand: BRAND
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
