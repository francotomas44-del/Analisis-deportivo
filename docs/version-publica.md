# Futbolityx — versión pública

Esta es la **versión oficial y única** del proyecto (rama `main`). Toma la app técnica y la
vuelve **atractiva y entendible para cualquiera**, sin romper nada de lo que ya funcionaba.

## Qué cambió (a lo grande)

| Área | Antes | Ahora |
|---|---|---|
| **Portada** | Texto sobre "estadística honesta" | **"Hoy": próximos partidos con pronóstico 1X2** |
| **Datos nuevos** | Solo partidos jugados | Se detectan los **partidos futuros** de la base (openfootball 2026-27) y se pronostican |
| **Base ampliada** | ~31 competiciones / ~49.000 partidos | **100 competiciones / ≈155.500 partidos**: historia previa desde ESPN (`espn-history`, 65.277) + competiciones nuevas de openfootball (`openfootball-extra`, 30.437: MLS, CONCACAF, CAF, Sudamérica, Asia y África) |
| **Liga Argentina** | No aparecía en "Hoy" (openfootball no tiene la temporada 2026) | **Historial completo 2001 y 2003–2026 desde ESPN** (9.505 partidos, descargado) + temporada en curso en vivo, con la misma tarjeta y pronóstico (se puede desactivar) |
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
- La primera vez carga la base histórica (~70 MB, una sola vez).
- El botón **Modo avanzado** (arriba) muestra las herramientas técnicas (Evaluación, Rendimiento, Informe, Datos).

## Liga Argentina (ESPN)

La base de openfootball solo trae 3 temporadas argentinas y no tiene la **2026**.
Para tener el **máximo historial real**, la Liga Profesional Argentina se arma
desde la **API pública de ESPN** (gratis, sin clave, con CORS):

- **Historial descargado:** `scripts/build-arg-espn.ps1` baja las temporadas
  **2001 y 2003–2026** (**9.505 partidos**, solo partidos terminados en tiempo
  regular) y las guarda en `data/arg-espn/<año>.json` (declaradas en
  `data/manifest.json` con `source: "arg-espn"`). No hace falta internet para verlas.
- **En vivo:** al abrir la portada, una sola petición trae la temporada en curso
  (`dates=2026&limit=1000`); la respuesta se guarda en caché unas horas. De ahí se
  usan los partidos **por jugar** (portada) y los **ya terminados** (historial). Los
  que ya están descargados se detectan por su `id` de ESPN y **no se duplican**.
- **Nombres de equipo:** `scripts/arg-team-map.json` (replicado en `js/v2.js`)
  normaliza cada rótulo de ESPN a un nombre canónico para no partir el historial de
  un club en dos; el nombre visible se corrige con `DISPLAY_NAME` (ESPN dice
  "Gimnasia (Mendoza)" → se muestra **"Gimnasia y Esgrima de Mendoza"**). Los equipos
  sin datos siguen mostrando **"Sin historial suficiente"**.
- Se muestra la fuente en pantalla y la parte **en vivo** se puede **desactivar**
  con la casilla "Liga Argentina (en vivo)". Ver [`atribuciones.md`](atribuciones.md).

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

## Cadena de Markov (nueva)

Además de la simulación de **Monte Carlo**, el motor incorpora una **cadena de Markov** sobre la secuencia de
resultados (victoria/empate/derrota) de cada equipo: estima su matriz de transición, proyecta el próximo
resultado y combina local y visitante en una probabilidad 1X2. Se muestra en un panel propio del análisis, en
una tabla que la **compara con Monte Carlo** (diferencia en puntos porcentuales) y en el **informe exportable**.
Ver [`markov.md`](markov.md).

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
