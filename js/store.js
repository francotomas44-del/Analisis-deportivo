/* store.js — modelo de datos y persistencia (JS vainilla)
   Namespace global: window.AD.store
   Persiste vía AD.storage (IndexedDB con respaldo en localStorage). */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var state = {
    teams: [],
    competitions: [],
    referees: [],
    matches: [],
    predictions: []
  };

  var saveTimer = null;
  var lastSavedAt = null;
  var onSavedCb = null;

  function markSaved() {
    lastSavedAt = new Date();
    if (typeof onSavedCb === "function") { try { onSavedCb(lastSavedAt); } catch (e) {} }
  }

  function persist() {
    return window.AD.storage.save(state).then(function (ok) { markSaved(); return ok; });
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function norm(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  /* ---------- nombres de equipo "canónicos" ----------
     Variantes del mismo club (p. ej. "Bayern München (GER)", "FC Bayern München",
     "Bayern München") se guardaban cada una con su propio id, fragmentando el
     historial del club. canonicalName() colapsa esas variantes a una misma clave;
     canonicalMap() y unifyTeams() la usan para agrupar/fusionar. */
  var TEAM_TOKENS = ["fc", "cf", "ac", "afc", "sad", "sdc", "cc", "club", "calcio",
    "football", "futebol", "clube", "utd", "recreativo",
    // prefijos/sufijos genéricos de club (no aportan identidad): CA/CR/CD/SC/SE/...
    // Se verificó que en la base no producen fusiones entre clubes de países distintos.
    "ca", "cr", "cd", "rc", "sd", "ud", "rcd", "as", "bc", "cp", "kv", "sv",
    "sc", "se", "ssc", "ss", "cs", "tsv", "vfl", "vfb", "bsc", "rsc", "tsg",
    "ifk", "fk", "sk", "nk", "msv", "vfr", "fsv", "hsc", "osc"];

  /* Alias curado para clubes que TEAM_TOKENS no alcanza a unificar porque cada
     fuente los abrevia distinto (sufijos de estado/provincia, siglas propias):
     p. ej. "Flamengo RJ" / "CR Flamengo", "Atlético Mineiro" / "CA Mineiro".
     La clave es el nombre en minúsculas y sin acentos; el valor es el nombre al
     que se reduce el equipo antes de aplicar el stripping habitual (o sea, la
     clave canónica compartida). Se verificó que no fusiona clubes distintos
     (América Mineiro ≠ Atlético Mineiro, Botafogo-SP ≠ Botafogo-RJ, Fortaleza FC
     de Colombia ≠ Fortaleza CE de Brasil, Grêmio Barueri ≠ Grêmio Porto Alegre).

     - Los 19 primeros son clubes brasileños cuyo historial quedaba partido entre
       dos nombres.
     - Los 2 siguientes son clubes sudamericanos partidos entre su liga nueva y las
       copas CONMEBOL (cada fuente los nombra distinto). Los demás casos de esas
       ligas se corrigen en el origen, con scripts/espn-southamerica-team-map.json.
     - Los 6 siguientes son alemanes y los 5 siguientes austríacos: el mismo club
       escrito distinto según la fuente (año de fundación, país, renombres).
     - Los 23 siguientes son clubes que openfootball fue renombrando temporada a
       temporada (sobre todo desde 2020-21, cuando pasó a usar el nombre "largo",
       con ciudad o sufijo legal): el historial del mismo club quedaba partido en
       dos. Verificado por fuentes/competiciones (temporadas complementarias).
     - Los 13 últimos separan el mismo club por sigla, año de fundación o país.
     Las copas nuevas (espn-cups) se corrigen en el origen con
     scripts/espn-cups-team-map.json (17 alias, dos de ellos falsos positivos del
     resolutor difuso) y las selecciones con el mapa de país del propio generador. */
  var TEAM_ALIAS = {
    "flamengo rj": "flamengo", "cr flamengo": "flamengo",
    "botafogo rj": "botafogo", "botafogo fr": "botafogo",
    "atletico mineiro": "atletico mineiro", "ca mineiro": "atletico mineiro",
    "cruzeiro": "cruzeiro", "cruzeiro ec": "cruzeiro",
    "corinthians sp": "corinthians", "sc corinthians paulista": "corinthians",
    "coritiba pr": "coritiba", "coritiba fbc": "coritiba",
    "criciuma": "criciuma", "criciuma ec": "criciuma",
    "cuiaba ec": "cuiaba", "cuiaba mt": "cuiaba",
    "ceara ce": "ceara", "ceara sc": "ceara",
    "chapecoense": "chapecoense", "chapecoense af": "chapecoense",
    "fluminense rj": "fluminense", "fluminense fc": "fluminense",
    "fortaleza ce": "fortaleza ce", "fortaleza ec": "fortaleza ce",
    "gremio fbpa": "gremio fbpa", "gremio porto alegre": "gremio fbpa",
    "nautico": "nautico", "nautico pe": "nautico",
    "vasco da gama rj": "vasco da gama", "cr vasco da gama": "vasco da gama",
    "athletico paranaense": "athletico paranaense", "ca paranaense": "athletico paranaense",
    "sport recife pe": "sport recife", "sc recife": "sport recife",
    "bahia ba": "bahia", "ec bahia": "bahia",
    "red bull bragantino": "bragantino", "rb bragantino": "bragantino",
    // Perú: ESPN "Melgar" (2014-) y las copas "FBC Melgar (PER)" (2005-2013).
    "melgar": "FBC Melgar (PER)",
    // Venezuela: ESPN "CD Lara" (2009-2013) y "Deportivo Lara" (2014-).
    "cd lara": "Deportivo Lara",
    // Alemanes: unas fuentes agregan el año de fundación ("Bayer 04") y otras no;
    // y las de ESPN pueden sumarle el país ("(GER)").
    "bayer 04 leverkusen": "Bayer Leverkusen",
    "bayer 04 leverkusen (ger)": "Bayer Leverkusen",
    "borussia monchengladbach": "Bor. Mönchengladbach",
    "spvgg greuther furth 1903": "SpVgg Greuther Fürth",
    "vfl bochum 1848": "VfL Bochum",
    "fc st. pauli 1910": "FC St. Pauli",
    // Austríacos: mismo club renombrado entre fuentes o temporadas.
    "lask linz": "LASK",
    "wsg wattens": "WSG Tirol",
    "sc magna wiener neustadt": "1. Wiener Neustädter SC",
    "fc trenkwalder admira": "FC Admira Wacker",
    "fc red bull salzburg (aut)": "RB Salzburg",
    // openfootball, nombre corto -> nombre "largo" (temporadas complementarias).
    "afc ajax": "Ajax Amsterdam",
    "bologna fc 1909": "Bologna FC",
    "central espanol futbol club": "Central Español",
    "derby": "Derby County FC",
    "fc twente '65": "FC Twente",
    "feyenoord": "Feyenoord Rotterdam",
    "kairat almaty": "FK Kairat",
    "fk ural": "FC Ural Ekaterinburg",
    "gd estoril praia": "GD Estoril",
    "henan jianye": "Henan FC",
    "parma calcio 1913": "Parma FC",
    "rc celta": "RC Celta de Vigo",
    "rc strasbourg alsace": "RC Strasbourg",
    "rayo vallecano de madrid": "Rayo Vallecano",
    "real betis balompie": "Real Betis",
    "real sociedad de futbol": "Real Sociedad",
    "sc cambuur-leeuwarden": "SC Cambuur",
    "lazio roma": "SS Lazio",
    "samartex (gha)": "FC Samartex 1996",
    "sporting clube de portugal": "Sporting CP",
    "sporting clube de braga": "Sporting Braga",
    "stade rennais fc 1901": "Stade Rennais",
    "willem ii tilburg": "Willem II",
    // Sigla / año de fundación / país por delante del mismo club.
    "cd alaves": "Deportivo Alavés",
    "club atletico de madrid": "Atlético Madrid",
    "rcd espanyol de barcelona": "Espanyol Barcelona",
    "uc sampdoria": "Sampdoria",
    "sbv vitesse": "Vitesse",
    "jorge wilstermann (bol)": "Wilstermann",
    "us sassuolo calcio": "Sassuolo Calcio",
    "big bullets fc (mwi)": "Nyasa Big Bullets FC",
    "csd comunicaciones (gua)": "Comunicaciones (GUA)",
    "gnk dinamo zagreb (cro)": "Dinamo Zagreb (CRO)",
    "atiker konyaspor": "Konyaspor",
    "ska-energiya khabarovsk": "SKA-Khabarovsk",
    "olympique de marseille": "Olympique Marseille"
  };

  /* Nombre en minúsculas, sin acentos y con espacios normalizados. Se usa solo
     para consultar TEAM_ALIAS; no cambia el nombre que se guarda ni se muestra. */
  function deaccentLower(s) {
    s = String(s == null ? "" : s).toLowerCase();
    if (s.normalize) s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return s.replace(/\s+/g, " ").trim();
  }

  function canonicalName(name) {
    var probe = deaccentLower(name);
    if (!Object.prototype.hasOwnProperty.call(TEAM_ALIAS, probe)) {
      // Segundo intento sin el sufijo de pais/estado entre parentesis: asi las
      // variantes tipo "AFC Ajax (NED)" o "Bologna FC 1909 (ITA)" tambien pasan
      // por el alias (el primer intento las conserva tal cual por las claves que
      // SI llevan parentesis, p. ej. "Samartex (GHA)").
      var stripped = deaccentLower(String(name == null ? "" : name).replace(/\([^)]*\)/g, " "));
      if (stripped !== probe && Object.prototype.hasOwnProperty.call(TEAM_ALIAS, stripped)) probe = stripped;
    }
    if (Object.prototype.hasOwnProperty.call(TEAM_ALIAS, probe)) name = TEAM_ALIAS[probe];
    var s = String(name == null ? "" : name).toLowerCase();
    s = s.replace(/\s*\([^)]*\)\s*/g, " ");                // quita "(ESP)", "(AUT)", "(GER)"...
    s = s.replace(/(^|[\s.])f\.?c\.?($|[\s.])/g, " ");     // f.c. / fc
    s = s.replace(/(^|[\s.])c\.?f\.?($|[\s.])/g, " ");     // c.f. / cf
    s = s.replace(/(^|[\s.])a\.?c\.?($|[\s.])/g, " ");     // a.c. / ac
    s = s.replace(/[.·]/g, " ");                           // puntos restantes
    var parts = s.split(/\s+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p && TEAM_TOKENS.indexOf(p) === -1) out.push(p);
    }
    return out.join(" ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }

  /* Cuenta partidos por equipo (una sola pasada). Se usa para elegir, entre
     varias variantes del mismo club, el nombre con más historial. */
  function teamMatchCounts() {
    var c = {};
    state.matches.forEach(function (m) {
      c[m.homeId] = (c[m.homeId] || 0) + 1;
      c[m.awayId] = (c[m.awayId] || 0) + 1;
    });
    return c;
  }

  /* ¿Es `a` un nombre "mejor" que `b` para representar al club unificado?
     Primero el que no lleva paréntesis ("Bayern München" sobre "FC Bayern
     München (GER)"); después el que tiene más partidos, así sobrevive el nombre
     con más historial (p. ej. "Flamengo RJ" 602 sobre "CR Flamengo" 301). */
  function betterTeamName(a, b, counts) {
    var pa = a.name.indexOf("(") !== -1, pb = b.name.indexOf("(") !== -1;
    if (pa !== pb) return !pa;
    return (counts[a.id] || 0) > (counts[b.id] || 0);
  }

  /* Mapa id -> id canónico. Solo incluye variantes duplicadas; no muta nada. */
  function canonicalMap() {
    var map = {}, groups = {};
    state.teams.forEach(function (t) {
      var k = canonicalName(t.name);
      if (!k) return;
      (groups[k] = groups[k] || []).push(t);
    });
    var counts = null;
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 2) return;
      if (!counts) counts = teamMatchCounts();
      var best = g[0];
      for (var i = 1; i < g.length; i++) {
        if (betterTeamName(g[i], best, counts)) best = g[i];
      }
      for (var j = 0; j < g.length; j++) {
        if (g[j].id !== best.id) map[g[j].id] = best.id;
      }
    });
    return map;
  }

  /* Fusiona físicamente las variantes duplicadas (migración). Idempotente:
     en la segunda llamada canonicalMap() devuelve {} y no cambia nada. */
  function unifyTeams(opts) {
    opts = opts || {};
    var map = canonicalMap();
    var idsToRemove = {};
    Object.keys(map).forEach(function (id) { idsToRemove[id] = true; });
    var merged = Object.keys(map).length;
    if (!merged) {
      // Sin variantes que fusionar, pero puede haber partidos repetidos entre
      // fuentes (p. ej. openfootball y ESPN cubren la misma liga/temporada).
      var removedDup = 0;
      if (opts.dedupe) {
        var seenDup = {}, beforeDup = state.matches.length;
        state.matches = state.matches.filter(function (m) {
          var key = (m.date || "") + "|" + m.homeId + "|" + m.awayId;
          if (seenDup[key]) return false;
          seenDup[key] = true;
          return true;
        });
        removedDup = beforeDup - state.matches.length;
        if (removedDup) saveNow();
      }
      return { merged: 0, removedMatches: removedDup, teamsAfter: state.teams.length, matchesAfter: state.matches.length };
    }

    var seen = {};
    var before = state.matches.length;
    state.matches = state.matches.filter(function (m) {
      var hid = map[m.homeId] || m.homeId;
      var aid = map[m.awayId] || m.awayId;
      m.homeId = hid; m.awayId = aid;
      if (hid === aid) return false;                 // mismo club en ambas puntas (no debería ocurrir)
      var key = (m.date || "") + "|" + hid + "|" + aid;
      if (opts.dedupe && seen[key]) return false;    // partido duplicado tras la fusión
      seen[key] = true;
      return true;
    });
    var removedMatches = before - state.matches.length;

    state.predictions.forEach(function (p) {
      if (map[p.homeId]) p.homeId = map[p.homeId];
      if (map[p.awayId]) p.awayId = map[p.awayId];
    });
    state.teams = state.teams.filter(function (t) { return !idsToRemove[t.id]; });
    canonIndex = null;

    saveNow();
    return { merged: merged, removedMatches: removedMatches, teamsAfter: state.teams.length, matchesAfter: state.matches.length };
  }

  /* ---------- reparación de partidos fantasma ----------
     Dos nombres que la fuente usa para un club y que el importador guardó como
     otro club. Las filas ya corregidas vienen en los datos actuales; acá se
     retira la fila equivocada cuando en la misma fecha el club correcto jugó
     contra el mismo rival (no puede repetirse en la misma liga, así que la
     regla no toca partidos legítimos). Idempotente: si no hay fantasmas, no
     hace nada. Los casos y la verificación están en docs/base-historica.md. */
  var PHANTOM_FIXES = [
    { wrong: ["Deportivo Alavés", "CD Alavés"], right: "Deportivo La Coruña", from: "2000-01-01", to: "2012-12-31", comp: /LaLiga/i },
    { wrong: ["Athletico Paranaense"], right: "Paraná", from: "2006-01-01", to: "2021-12-31", comp: /Brasileir/i }
  ];

  function repairPhantoms() {
    /* Se compara por nombre canónico y no por id de equipo: durante un sync,
       importBulk puede crear un equipo "variante" para un nombre que la base
       ya tenía canonizado (todavía no corrió unifyTeams), y entonces el mismo
       rival tiene dos ids. La agrupación canónica es la misma que usa
       unifyTeams, así que la reparación es inmune a esos ids transitorios. */
    var canonById = {}, idsByCanon = {}, i;
    for (i = 0; i < state.teams.length; i++) {
      var t0 = state.teams[i];
      var c0 = canonicalName(t0.name) || t0.name;
      canonById[t0.id] = c0;
      (idsByCanon[c0] = idsByCanon[c0] || []).push(t0.id);
    }
    function canonOf(id) { return canonById[id] || id; }
    function idsOf(name) { return idsByCanon[canonicalName(name) || name] || []; }

    var removed = 0;
    PHANTOM_FIXES.forEach(function (fix) {
      var rid = {};
      idsOf(fix.right).forEach(function (id) { rid[id] = true; });
      var wid = {};
      (fix.wrong || []).forEach(function (n) {
        idsOf(n).forEach(function (id) { wid[id] = true; });
      });
      if (!Object.keys(rid).length || !Object.keys(wid).length) return;
      var real = {};
      state.matches.forEach(function (m) {
        if (!m.date || m.date < fix.from || m.date > fix.to) return;
        if (!fix.comp.test(m.competition || "")) return;
        if (wid[m.homeId] || wid[m.awayId]) return; // el rival correcto no es el club equivocado
        if (rid[m.homeId] && !rid[m.awayId]) real[m.date + "|" + canonOf(m.awayId)] = true;
        else if (rid[m.awayId] && !rid[m.homeId]) real[m.date + "|" + canonOf(m.homeId)] = true;
      });
      if (!Object.keys(real).length) return;
      state.matches = state.matches.filter(function (m) {
        if (!m.date || m.date < fix.from || m.date > fix.to) return true;
        if (!fix.comp.test(m.competition || "")) return true;
        var opp = null;
        if (wid[m.homeId] !== wid[m.awayId]) opp = wid[m.homeId] ? m.awayId : m.homeId;
        if (!opp) return true;
        if (real[m.date + "|" + canonOf(opp)]) { removed++; return false; }
        return true;
      });
    });
    if (removed) saveNow();
    return removed;
  }

  /* ---------- carga / guardado ---------- */
  function init() {
    return window.AD.storage.load().then(function (data) {
      canonIndex = null;
      if (data) {
        state.teams = Array.isArray(data.teams) ? data.teams : [];
        state.competitions = Array.isArray(data.competitions) ? data.competitions : [];
        state.referees = Array.isArray(data.referees) ? data.referees : [];
        state.matches = Array.isArray(data.matches) ? data.matches : [];
        state.predictions = Array.isArray(data.predictions) ? data.predictions : [];
      }
      // refleja en el indicador la fecha del último guardado encontrado
      var loadedAt = window.AD.storage.lastLoadedAt ? window.AD.storage.lastLoadedAt() : null;
      if (loadedAt) lastSavedAt = new Date(loadedAt);
      // normaliza campos por compatibilidad
      state.teams.forEach(function (t) {
        if (!t.external) t.external = {};
        if (t.formedYear === undefined) t.formedYear = null;
      });
      // Descarta partidos con marcador inválido (p. ej. el -1 que ESPN devuelve
      // cuando no tiene el resultado). Sanea instalaciones ya guardadas.
      var matchCount = state.matches.length;
      state.matches = state.matches.filter(function (m) {
        return !(Number(m.homeGoals) < 0 || Number(m.awayGoals) < 0);
      });
      if (state.matches.length !== matchCount) saveNow();
      return state;
    });
  }

  /* Guardado con antirrebote (debounce) para no escribir en cada operación */
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      persist();
    }, 150);
  }

  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return persist();
  }

  function reset() {
    state.teams = [];
    canonIndex = null;
    state.competitions = [];
    state.referees = [];
    state.matches = [];
    state.predictions = [];
    return saveNow();
  }

  /* Reemplaza todo el contenido (para restaurar una copia de seguridad). */
  function replaceState(data) {
    if (!data || typeof data !== "object") return Promise.resolve(false);
    canonIndex = null;
    state.teams = Array.isArray(data.teams) ? data.teams : [];
    state.competitions = Array.isArray(data.competitions) ? data.competitions : [];
    state.referees = Array.isArray(data.referees) ? data.referees : [];
    state.matches = Array.isArray(data.matches) ? data.matches : [];
    state.predictions = Array.isArray(data.predictions) ? data.predictions : [];
    state.teams.forEach(function (t) {
      if (!t.external) t.external = {};
      if (t.formedYear === undefined) t.formedYear = null;
    });
    return saveNow();
  }

  /* ---------- búsquedas ---------- */
  function find(list, fn) {
    for (var i = 0; i < list.length; i++) if (fn(list[i])) return list[i];
    return null;
  }

  function byExternal(list, source, extId) {
    if (extId === null || extId === undefined || extId === "") return null;
    return find(list, function (x) { return x.external && String(x.external[source]) === String(extId); });
  }

  function getTeam(id) { return find(state.teams, function (t) { return t.id === id; }); }
  function getTeamByName(name) { return find(state.teams, function (t) { return norm(t.name) === norm(name); }); }

  /* Índice por nombre canónico: permite resolver los nombres que traen los
     fixtures de ESPN ("Kairat Almaty") al equipo de la base ("FK Kairat"). */
  var canonIndex = null;
  function canonicalIndex() {
    if (canonIndex) return canonIndex;
    var idx = {};
    for (var i = 0; i < state.teams.length; i++) {
      var k = canonicalName(state.teams[i].name);
      if (k && !(k in idx)) idx[k] = state.teams[i];
    }
    canonIndex = idx;
    return idx;
  }

  function getCompetition(id) { return find(state.competitions, function (c) { return c.id === id; }); }
  function getReferee(id) { return find(state.referees, function (r) { return r.id === id; }); }

  /* ---------- equipos / competiciones / árbitros (ensure = crea si no existe) ----------
     ensureTeam acepta dos formas:
       ensureTeam(nombre, liga, {source, id})        (uso interno)
       ensureTeam(nombre, {league, source, formedYear}) (uso del importador) */
  function ensureTeam(name, league, external) {
    if (!name) return null;

    var formedYear = null, source = null, extId = null;
    if (league && typeof league === "object") {
      var o = league;
      formedYear = o.formedYear || null;
      source = o.source != null ? o.source : null;
      if (o.id != null) extId = o.id;
      league = o.league || "";
    } else {
      league = league || "";
    }
    if (external && external.source != null) {
      source = external.source;
      if (external.id != null) extId = external.id;
    }

    if (source != null && extId != null) {
      var ex = byExternal(state.teams, source, extId);
      if (ex) {
        if (league && !ex.league) ex.league = league;
        if (formedYear && !ex.formedYear) ex.formedYear = formedYear;
        return ex;
      }
    }
    var t = getTeamByName(name);
    if (t) {
      if (league && !t.league) t.league = league;
      if (formedYear && !t.formedYear) t.formedYear = formedYear;
      if (source != null && extId != null) t.external[source] = extId;
      return t;
    }
    t = { id: uid(), name: String(name).trim(), league: league || "", formedYear: formedYear || null, external: {} };
    if (source != null && extId != null) t.external[source] = extId;
    state.teams.push(t);
    canonIndex = null;
    return t;
  }

  /* Busca un equipo por nombre. Primero exacto; si no, por nombre canónico:
     "Kairat Almaty" cae en "FK Kairat" y "SL Benfica (POR)" en "Benfica". */
  function findTeamByName(name) {
    var t = getTeamByName(name);
    if (t) return t;
    var k = canonicalName(name);
    if (!k) return null;
    var idx = canonicalIndex();
    return (Object.prototype.hasOwnProperty.call(idx, k) ? idx[k] : null);
  }

  function ensureCompetition(name, code) {
    if (!name && !code) return null;
    var c = find(state.competitions, function (x) {
      return (code && x.code === code) || (name && norm(x.name) === norm(name));
    });
    if (c) return c;
    c = { id: uid(), name: name || code, code: code || "", external: {} };
    state.competitions.push(c);
    return c;
  }

  function ensureReferee(name, nationality, external) {
    if (!name) return null;
    if (external && external.source != null) {
      var ex = byExternal(state.referees, external.source, external.id);
      if (ex) return ex;
    }
    var r = find(state.referees, function (x) { return norm(x.name) === norm(name); });
    if (r) return r;
    r = { id: uid(), name: String(name).trim(), nationality: nationality || "", external: {} };
    if (external && external.source != null) r.external[external.source] = external.id;
    state.referees.push(r);
    return r;
  }

  function addTeam(name, league) {
    var t = ensureTeam(name, league);
    save();
    return t;
  }

  function removeTeam(id) {
    state.teams = state.teams.filter(function (t) { return t.id !== id; });
    canonIndex = null;
    state.matches = state.matches.filter(function (m) { return m.homeId !== id && m.awayId !== id; });
    save();
  }

  /* ---------- partidos ---------- */
  function numOrNull(v) {
    if (v === "" || v === null || v === undefined) return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function matchExists(desc) {
    if (desc.externalId && desc.source) {
      var ex = find(state.matches, function (m) {
        return m.source === desc.source && String(m.externalId) === String(desc.externalId);
      });
      if (ex) return true;
    }
    return !!find(state.matches, function (m) {
      return m.date === (desc.date || "") && m.homeId === desc.homeId && m.awayId === desc.awayId;
    });
  }

  function buildMatch(desc) {
    var hy = numOrNull(desc.homeYellow), ay = numOrNull(desc.awayYellow);
    var hr = numOrNull(desc.homeRed), ar = numOrNull(desc.awayRed);
    var hCards = numOrNull(desc.homeCards);
    var aCards = numOrNull(desc.awayCards);
    // Si no vino el total pero sí el detalle, el total es amarillas + rojas.
    if (hCards == null && hy != null) hCards = hy + (hr || 0);
    if (aCards == null && ay != null) aCards = ay + (ar || 0);
    return {
      id: uid(),
      date: desc.date || "",
      competition: desc.competition || "",
      competitionId: desc.competitionId || null,
      homeId: desc.homeId,
      awayId: desc.awayId,
      homeGoals: Number(desc.homeGoals) || 0,
      awayGoals: Number(desc.awayGoals) || 0,
      homeCorners: numOrNull(desc.homeCorners),
      awayCorners: numOrNull(desc.awayCorners),
      homeCards: hCards,
      awayCards: aCards,
      homeYellow: hy,
      awayYellow: ay,
      homeRed: hr,
      awayRed: ar,
      refereeId: desc.refereeId || null,
      refereeName: desc.refereeName || "",
      neutral: !!desc.neutral,
      source: desc.source || "manual",
      externalId: desc.externalId || null
    };
  }

  function addMatch(m) {
    var match = buildMatch(m);
    state.matches.push(match);
    save();
    return match;
  }

  function removeMatch(id) {
    state.matches = state.matches.filter(function (m) { return m.id !== id; });
    save();
  }

  function matchesForTeam(id) {
    return state.matches.filter(function (m) { return m.homeId === id || m.awayId === id; });
  }

  /* Deduplicación por clave externa (usada por el importador) */
  function hasMatchKey(key) {
    if (key == null) return false;
    return !!find(state.matches, function (m) { return String(m.externalId) === String(key); });
  }

  /* Alta de un partido ya resuelto a IDs (usada por el importador) */
  function importMatch(d) {
    var home = getTeam(d.homeId), away = getTeam(d.awayId);
    if (!home || !away) return null;
    var comp = d.competition ? ensureCompetition(d.competition) : null;
    var ref = d.referee ? ensureReferee(d.referee) : null;
    var match = buildMatch({
      date: d.date || "",
      competition: d.competition || "",
      competitionId: comp ? comp.id : null,
      homeId: d.homeId,
      awayId: d.awayId,
      homeGoals: d.homeGoals,
      awayGoals: d.awayGoals,
      homeCorners: d.homeCorners,
      awayCorners: d.awayCorners,
      homeCards: d.homeCards,
      awayCards: d.awayCards,
      refereeId: ref ? ref.id : null,
      refereeName: d.referee || "",
      neutral: d.neutral,
      source: d.source || "import",
      externalId: d.externalId != null ? String(d.externalId) : null
    });
    state.matches.push(match);
    save();
    return match;
  }

  /* ---------- importación masiva ----------
     descriptors: [{date, homeName, awayName, homeGoals, awayGoals, competition,
                    referee, homeCorners, awayCorners, homeCards, awayCards,
                    source, externalId, neutral, homeExternal, awayExternal}] */
  function importMatches(descriptors) {
    var added = 0, skipped = 0, teamsAdded = 0, refsAdded = 0;
    var teamsBefore = state.teams.length, refsBefore = state.referees.length;

    for (var i = 0; i < descriptors.length; i++) {
      var d = descriptors[i];
      if (!d.homeName || !d.awayName) { skipped++; continue; }
      if (d.homeGoals == null || d.awayGoals == null) { skipped++; continue; }
      // Un marcador negativo (p. ej. el -1 que usa ESPN para "sin resultado") no es válido.
      if (Number(d.homeGoals) < 0 || Number(d.awayGoals) < 0) { skipped++; continue; }

      var homeExt = d.homeExternal != null ? { source: d.source, id: d.homeExternal } : null;
      var awayExt = d.awayExternal != null ? { source: d.source, id: d.awayExternal } : null;
      var home = ensureTeam(d.homeName, d.competition, homeExt);
      var away = ensureTeam(d.awayName, d.competition, awayExt);
      if (!home || !away || home.id === away.id) { skipped++; continue; }

      var comp = d.competition ? ensureCompetition(d.competition) : null;
      var ref = d.referee ? ensureReferee(d.referee) : null;

      var desc = {
        date: d.date || "",
        competition: d.competition || "",
        competitionId: comp ? comp.id : null,
        homeId: home.id,
        awayId: away.id,
        homeGoals: d.homeGoals,
        awayGoals: d.awayGoals,
        homeCorners: d.homeCorners,
        awayCorners: d.awayCorners,
        homeCards: d.homeCards,
        awayCards: d.awayCards,
        refereeId: ref ? ref.id : null,
        refereeName: d.referee || "",
        neutral: d.neutral,
        source: d.source || "import",
        externalId: d.externalId
      };

      if (matchExists(desc)) { skipped++; continue; }
      state.matches.push(buildMatch(desc));
      added++;
    }

    teamsAdded = state.teams.length - teamsBefore;
    refsAdded = state.referees.length - refsBefore;
    saveNow();
    return { added: added, skipped: skipped, teamsAdded: teamsAdded, refereesAdded: refsAdded };
  }

  /* ---------- carga masiva (base histórica) ----------
     Eficiente: usa índices por nombre en memoria (O(n) en total, no O(n²)).
     rows: [{date, competition, league, home, away, homeGoals, awayGoals, source, externalId}]
     `source` (opcional) etiqueta el origen de cada partido; si falta se usa el
     `source` del lote. `competition` es el torneo del partido; `league` (opcional)
     es la liga a la que se asigna el equipo nuevo (por defecto, la competición). */
  function importBulk(rows, source) {
    var byName = {};
    state.teams.forEach(function (t) { var k = norm(t.name); if (!(k in byName)) byName[k] = t; });
    var byComp = {};
    state.competitions.forEach(function (c) { var k = norm(c.name); if (!(k in byComp)) byComp[k] = c; });

    var added = 0, teamsAdded = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r.home || !r.away) continue;
      if (r.homeGoals == null || r.awayGoals == null) continue;
      // Un marcador negativo (p. ej. el -1 que usa ESPN para "sin resultado") no es válido.
      if (Number(r.homeGoals) < 0 || Number(r.awayGoals) < 0) continue;
      var hk = norm(r.home), ak = norm(r.away);
      if (!hk || !ak || hk === ak) continue;

      var lg = r.league || r.competition || "";
      var ht = byName[hk];
      if (!ht) { ht = { id: uid(), name: String(r.home).trim(), league: lg, formedYear: null, external: {} }; state.teams.push(ht); byName[hk] = ht; teamsAdded++; }
      var at = byName[ak];
      if (!at) { at = { id: uid(), name: String(r.away).trim(), league: lg, formedYear: null, external: {} }; state.teams.push(at); byName[ak] = at; teamsAdded++; }

      var comp = null;
      if (r.competition) {
        var ck = norm(r.competition);
        comp = byComp[ck];
        if (!comp) { comp = { id: uid(), name: r.competition, code: "", external: {} }; state.competitions.push(comp); byComp[ck] = comp; }
      }

      state.matches.push(buildMatch({
        date: r.date || "",
        competition: r.competition || "",
        competitionId: comp ? comp.id : null,
        homeId: ht.id,
        awayId: at.id,
        homeGoals: r.homeGoals,
        awayGoals: r.awayGoals,
        homeCorners: r.homeCorners,
        awayCorners: r.awayCorners,
        homeCards: r.homeCards,
        awayCards: r.awayCards,
        homeYellow: r.homeYellow,
        awayYellow: r.awayYellow,
        homeRed: r.homeRed,
        awayRed: r.awayRed,
        source: r.source || source || "bulk",
        externalId: r.externalId != null ? String(r.externalId) : null
      }));
      added++;
    }
    if (teamsAdded) canonIndex = null;
    saveNow();
    return { added: added, teamsAdded: teamsAdded, teams: state.teams.length, matches: state.matches.length };
  }

  /* ---------- predicciones ---------- */
  function addPrediction(p) {
    var pred = {
      id: uid(),
      createdAt: new Date().toISOString(),
      kickoff: p.kickoff || "",
      homeId: p.homeId,
      awayId: p.awayId,
      homeName: p.homeName,
      awayName: p.awayName,
      input: p.input,
      output: p.output,
      confidence: p.confidence,
      result: null,
      resultDate: null
    };
    state.predictions.push(pred);
    /* Los análisis se guardan al instante: si el usuario cierra la pestaña
       justo después, no se pierde nada. */
    saveNow();
    return pred;
  }

  function closePrediction(id, result) {
    var p = find(state.predictions, function (x) { return x.id === id; });
    if (!p) return null;
    p.result = { homeGoals: Number(result.homeGoals), awayGoals: Number(result.awayGoals) };
    p.resultDate = result.date || new Date().toISOString().slice(0, 10);
    saveNow();
    return p;
  }

  function removePrediction(id) {
    state.predictions = state.predictions.filter(function (p) { return p.id !== id; });
    saveNow();
  }

  /* ---------- datos de ejemplo ---------- */
  function loadDemo() {
    var names = [
      ["Rojo FC", "Liga Demo"], ["Azul United", "Liga Demo"], ["Verde City", "Liga Demo"],
      ["Amarillo SC", "Liga Demo"], ["Negro Athletic", "Liga Demo"], ["Blanco Rovers", "Liga Demo"]
    ];
    state.teams = names.map(function (n) { return { id: uid(), name: n[0], league: n[1], formedYear: null, external: {} }; });
    canonIndex = null;
    state.competitions = []; state.referees = []; state.predictions = [];
    var comp = ensureCompetition("Liga Demo");
    var refs = ["Juan Pérez", "María Gómez", "Luis Fernández"].map(function (n) { return ensureReferee(n); });

    var id = {};
    state.teams.forEach(function (t) { id[t.name] = t.id; });

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
      var ref = refs[idx % refs.length];
      return buildMatch({
        date: d.toISOString().slice(0, 10),
        competition: "Liga Demo", competitionId: comp.id,
        homeId: id[r[0]], awayId: id[r[1]],
        homeGoals: r[2], awayGoals: r[3],
        homeCorners: r[4], awayCorners: r[5], homeCards: r[6], awayCards: r[7],
        refereeId: ref.id, refereeName: ref.name,
        source: "demo"
      });
    });

    return saveNow().then(function () { return state; });
  }

  window.AD.store = {
    init: init,
    save: save,
    saveNow: saveNow,
    reset: reset,
    state: state,
    uid: uid,
    getTeam: getTeam,
    getTeamByName: getTeamByName,
    findTeamByName: findTeamByName,
    canonicalName: canonicalName,
    canonicalMap: canonicalMap,
    unifyTeams: unifyTeams,
    repairPhantoms: repairPhantoms,
    getCompetition: getCompetition,
    getReferee: getReferee,
    ensureTeam: ensureTeam,
    ensureCompetition: ensureCompetition,
    ensureReferee: ensureReferee,
    addTeam: addTeam,
    removeTeam: removeTeam,
    addMatch: addMatch,
    removeMatch: removeMatch,
    matchesForTeam: matchesForTeam,
    hasMatchKey: hasMatchKey,
    importMatch: importMatch,
    importMatches: importMatches,
    importBulk: importBulk,
    replaceState: replaceState,
    getLastSavedAt: function () { return lastSavedAt; },
    setOnSaved: function (fn) { onSavedCb = fn; },
    addPrediction: addPrediction,
    closePrediction: closePrediction,
    removePrediction: removePrediction,
    loadDemo: loadDemo
  };
})();
