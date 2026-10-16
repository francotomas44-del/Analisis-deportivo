# Futbolityx — versión pública

Esta es la **versión oficial y única** del proyecto (rama `main`). Toma la app técnica y la
vuelve **atractiva y entendible para cualquiera**, sin romper nada de lo que ya funcionaba.

## Qué cambió (a lo grande)

| Área | Antes | Ahora |
|---|---|---|
| **Portada** | Texto sobre "estadística honesta" | **"Hoy": próximos partidos con pronóstico 1X2** |
| **Datos nuevos** | Solo partidos jugados | Se detectan los **partidos futuros** de la base (openfootball 2026-27) y se pronostican |
| **Base ampliada** | ~31 competiciones / ~49.000 partidos | **110 competiciones / 192.179 partidos**: historia previa desde ESPN (`espn-history`, 65.276) + competiciones nuevas de openfootball (`openfootball-extra`, 27.582: MLS, CONCACAF, CAF, Brasil, Colombia, Ecuador, Paraguay, Asia y África) + **CONMEBOL Sudamericana y Libertadores** desde ESPN (2.293 + 3.196) + **primeras divisiones de Chile, Uruguay, Perú, Bolivia y Venezuela** desde ESPN (30.630) + **Copa América, Eliminatorias CONMEBOL, Europa League y Conference League** desde ESPN (`espn-cups`, 3.917) |
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

## Contexto — análisis fundamental (noticias)

La pestaña **Analizar** suma una sección de **análisis fundamental** llamada **"Contexto"**: las
últimas noticias del **partido** y de **cada equipo** (mínimo 2 por equipo cuando hay), con
título, pequeño detalle, fuente, fecha y enlace. Se alimenta de la **API pública de ESPN** en
español (gratis, con CORS) y se cachea. Google News no se puede leer desde el navegador (bloqueo
CORS), así que cada bloque incluye un botón **"Buscar en Google News →"**. También aparece en el
informe exportable (sección 5). Ver [`contexto.md`](contexto.md).

## Tarjetas amarillas y rojas (base nueva)

La base histórica sólo guardaba equipos, fecha y resultado. Ahora incorpora **tarjetas (amarillas y
rojas) y córners por partido y equipo** para las ligas con cobertura de ESPN, tomados del detalle
público de cada partido (banderas `yellowCard`/`redCard` con su equipo, y `wonCorners`).

- Se construye con `scripts/build-cards.ps1`, que reutiliza el mismo caché de `scoreboard` que la
  historia (`%TEMP%\espn-cache-futbolityx`) y escribe `data/cards/<code>.json` (una entrada compacta
  por partido: id de ESPN + amarillas/rojas/córners de cada equipo).
- La app las une por `id` de ESPN en `js/dataset.js` y las integra a cada partido, así que el motor
  (`js/stats.js`) deja de usar valores de referencia.
- En **Analizar**, las tarjetas se estiman **por separado**: amarillas y rojas de cada equipo,
  combinando lo que recibe con lo que concede el rival. En **Equipos** se ve el promedio por partido
  de cada club. Si un equipo no tiene datos, se usa un valor de referencia y se avisa en las notas.

Cobertura actual: **≈60.600 partidos** con tarjetas en 22 ligas (más Argentina), con promedios
realistas (≈4,1 amarillas y ≈0,28 rojas por partido). Ver [`tarjetas.md`](tarjetas.md).

## Ayuda en cada sección (icono «!»)

Al lado del título de **cada sección y microsección** hay un pequeño círculo blanco con un signo **!**
(más chico que el título). Al pasar el cursor por encima —o al enfocarlo— aparece un **resumen** de para
qué sirve esa parte: qué mide, de dónde salen los datos y cómo leerla.

- Se implementa en `js/tips.js`: cualquier elemento marcado con `data-tip="..."` recibe el botón, tanto en
  el HTML estático como en lo que se genera después (paneles del análisis, tarjetas de mercados, noticias
  y portada «Hoy»), mediante un `MutationObserver`.
- Estilos en `css/styles.css` (`.info-tip` + tooltip con `::after`). Se oculta al imprimir.

## Cuotas y valor (EV + Kelly)

El análisis pasó de "probabilidades" a **decisiones de apuesta**. En **Analizar**, debajo de las
probabilidades, hay un panel **Cuotas y valor**:

- Se ingresan las cuotas **1 / X / 2** que ofrece la casa (y, opcionalmente, **Más/Menos 2.5** y
  **Ambos marcan**). Acepta coma o punto decimal (`3,10` o `3.10`).
- Para cada mercado se calcula: **cuota justa** (1 ÷ probabilidad), **Edge** (puntos porcentuales
  por encima/debajo de lo que paga), **valor esperado (EV)** y **stake de Kelly** (completo, medio o
  cuarto) según la **banca** que se indique.
- Cada mercado se marca como **Valor** (EV ≥ +2%), **Justo** o **Sin valor** (EV ≤ −2%), se destaca
  la **mejor apuesta** y se muestra el **margen de la casa** (1X2).
- Las cuotas ingresadas quedan guardadas en el pronóstico (**Guardar predicción**).
- Es una herramienta **estadística**, no una recomendación de apuesta (ver texto de responsabilidad
  en *Acerca de*). Fórmulas: `EV = p × cuota − 1`; `Kelly = (p × cuota − 1) ÷ (cuota − 1)`.

## Equipos unificados por defecto

Un mismo club podía aparecer partido en varias fichas (`Liverpool FC` y `Liverpool FC (ENG)`,
`Peñarol (URU)` y `CA Peñarol (URU)`, nombres contaminados con goleadores, etc.), fragmentando su
historial y haciendo fácil elegir la ficha equivocada. Ahora `AD.stats.config.unifyTeams` está
**encendido por defecto**: al iniciar (o al cargar la base) se fusionan las variantes y se remapean
sus partidos. Se ampliaron los tokens genéricos de club (`CA`, `CR`, `SC`, `SE`, `CD`, `SV`, …) en
`js/store.js`. Resultado sobre la base actual: **263 equipos fusionados**, sin fusiones entre clubes
de países distintos (la única coincidencia entre países es **AS Monaco (FRA/MCO)**, el mismo club).
Ver [`backtesting.md`](backtesting.md).

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
