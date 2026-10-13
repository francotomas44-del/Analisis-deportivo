/* news.js — Contexto (análisis fundamental): últimas noticias por equipo y del partido.
   Fuente: API pública de ESPN (gratis, sin clave, con CORS). Se prioriza el español
   (region=ar, lang=es). Google News NO se puede consultar desde el navegador (bloqueo
   CORS): por eso se ofrece un enlace de búsqueda en Google News por equipo y por partido.
   Namespace global: window.AD.news */
(function () {
  "use strict";

  window.AD = window.AD || {};

  var NEWS_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
  var SEARCH_BASE = "https://site.web.api.espn.com/apis/search/v2";
  var REGION = "ar";
  var LANG = "es";

  var TTL_GLOBAL = 20 * 60 * 1000;   // noticias generales: 20 min
  var TTL_TEAM = 60 * 60 * 1000;     // por equipo: 60 min
  var LS_KEY = "ad_news_cache_v1";
  var MAX_PER_TEAM = 4;
  var TIMEOUT = 9000;

  var mem = {};

  /* ---------- caché (memoria + localStorage) ---------- */
  function lsRead() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function lsWrite(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch (e) { /* cuota llena: se ignora */ }
  }
  function cacheGet(key, ttl) {
    var e = mem[key];
    if (e && (Date.now() - e.t) < ttl) return e.v;
    var store = lsRead();
    if (store[key] && (Date.now() - store[key].t) < ttl) { mem[key] = store[key]; return store[key].v; }
    return null;
  }
  function cacheSet(key, v) {
    var e = { t: Date.now(), v: v };
    mem[key] = e;
    var store = lsRead();
    store[key] = e;
    var cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000, n = 0;
    for (var k in store) { if (!store[k] || store[k].t < cutoff) delete store[k]; else n++; }
    if (n > 300) { store = {}; store[key] = e; }   // límite defensivo
    lsWrite(store);
  }

  /* ---------- utilidades ---------- */
  function fetchJson(url) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var to = setTimeout(function () { if (ctrl) ctrl.abort(); reject(new Error("timeout")); }, TIMEOUT);
      fetch(url, ctrl ? { signal: ctrl.signal, cache: "no-store" } : { cache: "no-store" })
        .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(resolve)
        .catch(function (e) { clearTimeout(to); reject(e); });
    });
  }

  function norm(s) {
    return (s || "").toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }
  var STOP = { fc: 1, cf: 1, sc: 1, ac: 1, cd: 1, afc: 1, club: 1, de: 1, del: 1, la: 1, el: 1, los: 1, las: 1, the: 1,
    juniors: 1, junior: 1, deportivo: 1, deportiva: 1, sport: 1, sporting: 1, athletic: 1, municipal: 1 };
  function toks(name) {
    return norm(name).split(" ").filter(function (t) { return t.length >= 3 && !STOP[t]; });
  }
  /* Coincidencia de nombres estricta y tolerante a acentos/sufijos.
     Coincide sólo si: (1) son iguales normalizados, (2) uno contiene al otro
     como palabras completas ("Racing" ⊂ "Racing Club") o (3) tienen el mismo
     conjunto de palabras significativas ("Colón de Santa Fe" = "Colón Santa Fe").
     Deliberadamente NO alcanza con compartir una palabra: así "Racing Club"
     (Argentina) no se confunde con "Racing Santander". */
  function nameMatch(a, b) {
    var na = norm(a), nb = norm(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if ((" " + na + " ").indexOf(" " + nb + " ") > -1) return true;
    if ((" " + nb + " ").indexOf(" " + na + " ") > -1) return true;
    var ta = toks(a).slice().sort().join(" ");
    var tb = toks(b).slice().sort().join(" ");
    return !!(ta && tb && ta === tb);
  }

  function teamCats(article) {
    var out = [];
    (article.categories || []).forEach(function (c) {
      if (c && c.type === "team" && c.team && c.team.description) out.push(c.team.description);
    });
    return out;
  }
  function webHref(article) {
    var l = article.links;
    if (l && l.web && l.web.href) return l.web.href;
    if (l && l.api && l.api.news && l.api.news.href) return l.api.news.href;
    return "";
  }
  function truncate(s, n) {
    s = (s || "").trim();
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
  }

  function fromNews(a) {
    return {
      id: a.dataSourceIdentifier || a.id || a.headline,
      title: a.headline || "",
      detail: truncate(a.description || "", 200),
      date: a.published || a.date || "",
      url: webHref(a),
      source: "ESPN",
      teams: teamCats(a)
    };
  }
  function fromSearchItem(c) {
    var img = (c.images && c.images[0]) || {};
    return {
      id: c.id || c.nowId || c.displayName,
      title: c.displayName || "",
      detail: truncate(c.description || img.caption || "", 200),
      date: c.date || "",
      url: (c.link && c.link.web) || "",
      source: "ESPN",
      teams: []
    };
  }

  /* ---------- proveedores ---------- */
  function loadGlobal(fresh) {
    var key = "global:" + REGION + ":" + LANG;
    if (!fresh) { var hit = cacheGet(key, TTL_GLOBAL); if (hit) return Promise.resolve(hit); }
    var url = NEWS_BASE + "/all/news?limit=50&lang=" + LANG + "&region=" + REGION;
    return fetchJson(url).then(function (j) {
      var list = (j.articles || []).map(fromNews).filter(function (n) { return n.title; });
      cacheSet(key, list);
      return list;
    });
  }
  function loadTeamNews(name, fresh) {
    var key = "team:" + norm(name);
    if (!fresh) { var hit = cacheGet(key, TTL_TEAM); if (hit) return Promise.resolve(hit); }
    var url = SEARCH_BASE + "?query=" + encodeURIComponent(name) + "&limit=10&region=" + REGION + "&lang=" + LANG;
    return fetchJson(url).then(function (j) {
      var arts = [], rt = j.results || {};
      for (var k in rt) {
        var t = rt[k];
        if (t && t.type === "article") (t.contents || []).forEach(function (c) { arts.push(fromSearchItem(c)); });
      }
      arts = arts.filter(function (n) { return n.title; });
      cacheSet(key, arts);
      return arts;
    });
  }

  /* ---------- ensamblado ---------- */
  function dedupe(list) {
    var seen = {}, out = [];
    list.forEach(function (n) {
      var k = (n.url || n.title || "").toLowerCase();
      if (!k || seen[k]) return;
      seen[k] = 1; out.push(n);
    });
    return out;
  }
  function byDateDesc(a, b) {
    var da = a.date || "", db = b.date || "";
    if (da === db) return 0;
    return da < db ? 1 : -1;
  }
  /* ¿El texto menciona al equipo? Se considera mencionado si contiene como
     palabra completa alguna palabra significativa del nombre (>= 4 letras),
     p. ej. "Boca" para "Boca Juniors" o "Racing" para "Racing Club". */
  function mentions(text, name) {
    var t = toks(name).filter(function (x) { return x.length >= 4; });
    if (!t.length) t = toks(name);
    if (!t.length) return false;
    var nt = " " + norm(text) + " ";
    for (var i = 0; i < t.length; i++) if (nt.indexOf(" " + t[i] + " ") > -1) return true;
    return false;
  }
  /* Relevancia de una noticia para un equipo: por etiqueta de equipo (precisa,
     la usa la fuente general) o, si la nota no trae etiquetas (la búsqueda),
     por mención del nombre del equipo en el titular. */
  function matchesNews(n, name) {
    var teams = n.teams || [];
    if (teams.length) return teams.some(function (t) { return nameMatch(t, name); });
    return mentions(n.title, name);
  }
  function assembleSide(name, globalList, searchList) {
    var g = globalList.filter(function (n) { return matchesNews(n, name); });
    var s = searchList.filter(function (n) { return matchesNews(n, name); });
    // Las de la fuente con descripción (general) van primero.
    return dedupe(g.concat(s)).sort(byDateDesc).slice(0, MAX_PER_TEAM);
  }
  function assembleMatch(home, away, globalList, homeSearch, awaySearch) {
    var both = globalList.filter(function (n) {
      return n.teams.some(function (t) { return nameMatch(t, home); }) &&
             n.teams.some(function (t) { return nameMatch(t, away); });
    });
    if (both.length) return dedupe(both).sort(byDateDesc).slice(0, 4);
    var all = dedupe(globalList.concat(homeSearch, awaySearch));
    var m = all.filter(function (n) {
      return (mentions(n.title, home) || mentions(n.detail, home)) &&
             (mentions(n.title, away) || mentions(n.detail, away));
    });
    return m.sort(byDateDesc).slice(0, 4);
  }

  /* ---------- API pública ---------- */
  function forMatch(homeName, awayName, opts) {
    opts = opts || {};
    var fresh = !!opts.fresh;
    return Promise.all([
      loadGlobal(fresh).catch(function () { return []; }),
      loadTeamNews(homeName, fresh).catch(function () { return []; }),
      loadTeamNews(awayName, fresh).catch(function () { return []; })
    ]).then(function (res) {
      var global = res[0], hs = res[1], as = res[2];
      var homeItems = assembleSide(homeName, global, hs);
      var awayItems = assembleSide(awayName, global, as);
      var matchItems = assembleMatch(homeName, awayName, global, hs, as);
      return {
        home: { name: homeName, items: homeItems },
        away: { name: awayName, items: awayItems },
        match: matchItems,
        ok: (homeItems.length > 0 || awayItems.length > 0 || matchItems.length > 0),
        fetchedAt: new Date().toISOString(),
        sources: ["ESPN"]
      };
    });
  }

  function googleNewsUrl(query) {
    return "https://news.google.com/search?q=" + encodeURIComponent(query || "") +
      "&hl=es-419&gl=AR&ceid=AR:es-419";
  }

  window.AD.news = {
    forMatch: forMatch,
    googleNewsUrl: googleNewsUrl,
    nameMatch: nameMatch,
    _clearCache: function () { mem = {}; try { localStorage.removeItem(LS_KEY); } catch (e) {} }
  };
})();
