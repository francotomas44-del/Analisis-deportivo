# Futbolityx — versión pública

Esta es la **versión oficial y única** del proyecto (rama `main`). Toma la app técnica y la
vuelve **atractiva y entendible para cualquiera**, sin romper nada de lo que ya funcionaba.

## Qué cambió (a lo grande)

| Área | Antes | Ahora |
|---|---|---|
| **Portada** | Texto sobre "estadística honesta" | **"Hoy": próximos partidos con pronóstico 1X2** |
| **Datos nuevos** | Solo partidos jugados | Se detectan los **partidos futuros** de la base (openfootball 2026-27) y se pronostican |
| **Liga Argentina** | No aparecía en "Hoy" (openfootball no tiene la temporada 2026) | Próximos partidos **y resultados** de la temporada **desde ESPN**, con la misma tarjeta y pronóstico (se puede desactivar) |
| **Menú** | 10 pestañas técnicas | **Modo simple (6 pestañas)** + **modo avanzado** con un clic |
| **Lenguaje** | Jerga al frente | Frases claras: "Gana X", "Goles esperados", "Marcador probable" |
| **Horarios** | Hora local de la sede, sin contexto | **Convertidos a la hora del país del usuario**; se elige el país (por defecto se detecta solo) |
| **Visual** | Tablas | **Tarjetas** con barra de probabilidad 1X2 y semáforo de confianza |
| **Compartir** | Nada | Botón **Compartir** (texto/imagen) + **tarjeta PNG** descargable |
| **Móvil / PWA** | Solo escritorio | Estilos móviles + **instalable** (manifest + service worker) |
| **Marca** | "Futbolunaki" | **"Futbolityx"** (se cambia en 1 lugar) |
| **Primer uso** | "Cargar base" como requisito | **Onboarding** claro + carga automática con progreso |

## Cómo verla

- Público: **https://francotomas44-del.github.io/Futbolityx/** (GitHub Pages, desde `main`).
- Local: **http://localhost:8766/** (o el servidor LAN).
- La primera vez carga la base histórica (~14 MB, una sola vez).
- El botón **Modo avanzado** (arriba) muestra las herramientas técnicas (Evaluación, Rendimiento, Informe, Datos).

## Liga Argentina (ESPN)

La base de openfootball no incluye la temporada **2026** de la Liga Profesional
Argentina ni a todos sus equipos actuales. Para que igual aparezca en la portada
y tenga historial real, **Hoy** usa la **API pública de ESPN** (gratis, sin clave,
con CORS):

- Una sola petición al abrir la portada (calendario completo de la temporada); la
  respuesta se guarda en caché unas horas (y sirve sin internet con lo último
  descargado).
- De esa respuesta se usan los partidos **por jugar** (portada) y los **ya
  terminados** (historial), de modo que **todos** los equipos actuales —incluidos
  los que no están en openfootball, como **Gimnasia y Esgrima de Mendoza**— tengan
  historial y probabilidades. Nunca se inventan datos.
- Los nombres de equipo de ESPN se mapean a los de la base (`ESPN_ALIAS` en
  `js/v2.js`) para reutilizar el historial; el nombre visible se corrige con
  `DISPLAY_NAME` (ESPN dice "Gimnasia (Mendoza)" → se muestra **"Gimnasia y
  Esgrima de Mendoza"**). Los equipos sin datos siguen mostrando
  **"Sin historial suficiente"**.
- Se muestra la fuente en pantalla y se puede **desactivar** con la casilla
  "Liga Argentina (en vivo)". Ver [`atribuciones.md`](atribuciones.md).

> **olé.com.ar** se evaluó como base para las ligas argentinas, pero sus datos los
> sirve *LilaX* (`ole.lilax.io`) por JavaScript y **no son accesibles desde el
> navegador** (bloqueo CORS; el HTML no trae los datos). No es viable en una app
> 100 % frontend, por lo que se usa ESPN.

## Horarios por país

Los partidos de **Hoy** se muestran con la hora convertida a la zona horaria del usuario.

- El selector **🌐** de la barra superior permite elegir el país. Por defecto usa la zona del
  navegador ("Automático").
- La base openfootball trae la hora **local de la sede**. Para las ligas de un solo país se usa la
  zona de ese país (mapa `VENUE_TZ` en `js/v2.js`). Los partidos que ya traen offset explícito
  (p. ej. `"20:00 UTC-4"` del Mundial) se convierten con ese dato exacto.
- El subtítulo de la portada indica la zona activa (ej. `horarios en Argentina (GMT-03:00)`).
- La elección se guarda en el navegador (`localStorage`, junto al modo simple/avanzado).

## Cómo está hecho (sin dependencias nuevas)

- `js/dataset.js`: nueva `loadUpcoming()` — lee solo los archivos de la temporada en curso y
  devuelve los partidos **sin resultado** (fixtures futuros). No inventa nada.
- `js/v2.js`: capa pública. Portada "Hoy", motor de pronóstico (reutiliza `AD.stats`),
  compartir, modo simple/avanzado, marca y registro del service worker.
- `css/v2.css`: estilos de tarjetas, barras, onboarding, móvil y modo simple/avanzado.
- `sw.js` + `manifest.webmanifest`: PWA (instalable, offline para el shell).
- `js/app.js`: cambios mínimos (la portada por defecto es `hoy` y se avisa a `AD.v2`).

## Cambiar la marca

En `js/v2.js`:

```js
var BRAND = {
  name: "Futbolityx",
  claim: "Pronósticos de fútbol, claros y honestos",
  url: "https://francotomas44-del.github.io/Futbolityx/"
};
```

Cambiá `name`/`claim` y cambia en toda la interfaz (header, título, footer, textos).

## Pendiente / ideas siguientes

- **Dominio propio** y reserva de la marca "Futbolityx".
- **i18n** (español/inglés y más).
- **Datos "vivos"**: la **Liga Argentina** ya usa datos en vivo (ESPN); para el resto, el
  pronóstico sale de la base histórica empaquetada, así que para reflejar la jornada real haría
  falta un build precomputado (GitHub Actions) o más fuentes en vivo.
- **Retención**: favoritos, "mi equipo", avisos.
- **Repositorio**: renombrado a `Futbolityx` (hecho) para que la URL coincida con la marca.
