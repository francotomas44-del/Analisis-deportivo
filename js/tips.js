/* tips.js — Botón de ayuda "!" con resumen emergente.
   Cualquier elemento marcado con data-tip="..." recibe, justo después, un
   círculo blanco con un signo "!" (más chico que el título) que muestra un
   resumen de para qué sirve esa sección o microsección al pasar el cursor o
   al enfocarlo con el teclado.

   Funciona con contenido estático y también con lo que se genera después
   (paneles del análisis, tarjetas, noticias, portada "Hoy"), gracias a un
   MutationObserver. Así no hay que repetir el botón en cada plantilla. */
(function () {
  "use strict";

  window.AD = window.AD || {};

  function badge(tip) {
    var s = document.createElement("span");
    s.className = "info-tip";
    s.setAttribute("role", "note");
    s.setAttribute("tabindex", "0");
    s.setAttribute("aria-label", "Ayuda: " + tip);
    s.setAttribute("data-tip", tip);
    s.textContent = "!";
    return s;
  }

  function addTip(el) {
    if (!el || el.nodeType !== 1 || el.__adTip) return;
    if (el.classList && el.classList.contains("info-tip")) return;
    var tip = el.getAttribute("data-tip");
    if (!tip) return;
    el.__adTip = true;
    el.appendChild(badge(tip));
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.classList && root.classList.contains("info-tip")) return;
    if (root.hasAttribute && root.hasAttribute("data-tip")) addTip(root);
    if (!root.querySelectorAll) return;
    var list = root.querySelectorAll("[data-tip]");
    for (var i = 0; i < list.length; i++) addTip(list[i]);
  }

  function enhance() {
    if (document.body) scan(document.body);
  }

  /* Coloca el globo dentro de la pantalla: lo corre en horizontal si el botón
     está cerca de un borde y lo pasa arriba si no cabe abajo. */
  function placeTip(b) {
    if (!b || !b.classList || !b.classList.contains("info-tip")) return;
    b.style.setProperty("--info-tip-shift", "0px");
    b.classList.remove("info-tip--up");
    var rect = b.getBoundingClientRect();
    if (!rect.width) return;
    var after = getComputedStyle(b, "::after");
    var w = parseFloat(after.width) || 0;
    var h = parseFloat(after.height) || 0;
    if (!w) return;
    var pad = 8;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var center = rect.left + rect.width / 2;
    var left = center - w / 2;
    var right = center + w / 2;
    var shift = 0;
    if (left < pad) shift = pad - left;
    else if (right > vw - pad) shift = (vw - pad) - right;
    if (shift) b.style.setProperty("--info-tip-shift", shift.toFixed(1) + "px");
    if (rect.bottom + 9 + h > vh && rect.top - 9 - h >= 0) b.classList.add("info-tip--up");
  }

  function nearestBadge(e) {
    var t = e && e.target;
    if (!t || !t.closest) return null;
    return t.closest(".info-tip");
  }

  function start() {
    enhance();
    if (window.MutationObserver) {
      var obs = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var nodes = mutations[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) {
            if (nodes[j].nodeType === 1) scan(nodes[j]);
          }
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    document.addEventListener("mouseover", function (e) { placeTip(nearestBadge(e)); }, true);
    document.addEventListener("focusin", function (e) { placeTip(nearestBadge(e)); }, true);
    document.addEventListener("ad:data-changed", enhance);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.AD.tips = { enhance: enhance, badge: badge };
})();