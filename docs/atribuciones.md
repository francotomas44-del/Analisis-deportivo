# Atribuciones y licencias de datos

Este documento detalla el **origen**, la **licencia** y las **atribuciones** de los
datos que usa Futbolityx, para que su uso (personal o público) sea trazable y
respetuoso de las condiciones de cada fuente.

> Regla del proyecto: **no inventar datos**. Cada dato debe poder rastrearse hasta
> una fuente y, cuando corresponde, citar su licencia.

---

## 1. Base histórica incluida en la app (`data/`)

### openfootball — dominio público

- **Fuente:** `https://github.com/openfootball` (repositorios `football.json`,
  `worldcup`, `euro` y las ligas por país).
  Descarga reproducida por `scripts/build-dataset.ps1`.
- **Contenido:** resultados de Copas del Mundo (1930–2026), Eurocopas,
  UEFA Champions League, copas nacionales y primeras divisiones de varias ligas
  (temporadas 2010-11 a 2026-27).
- **Licencia:** dominio público. Cita textual del repositorio
  `openfootball/football.json`:
  > *"The football.json schema, data and scripts are dedicated to the public
  > domain. Use as you please with no restrictions whatsoever."*
- **Atribución requerida:** ninguna. Aun así, acreditamos la fuente por
  transparencia: **Datos históricos: openfootball (dominio público).**

Los nombres de equipos, competiciones y ligas son **hechos** y se usan de forma
**nominativa**. Esta app **no** incluye ni muestra escudos, crestas o logos
oficiales de clubes, ligas o federaciones, y no implica afiliación ni respaldo
alguno.

## 2. Liga Profesional Argentina (ESPN)

La base histórica de openfootball solo trae **3 temporadas** argentinas
(2018-19, 2019-20 y 2025). Para tener el máximo historial real, la Liga
Profesional Argentina se arma desde la API pública de **ESPN** y se guarda
**descargada** en la propia app (`data/arg-espn/<año>.json`), reproducida por
`scripts/build-arg-espn.ps1`.

- **Fuente:** `https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard`
- **Historial incluido:** temporadas **2001 y 2003–2026** (ESPN no tiene 2002 ni
  años anteriores), solo partidos **terminados en tiempo regular**
  (`STATUS_FULL_TIME`) para no introducir ambigüedad de penales.
  Total: **9.505 partidos** de 25 temporadas.
- **En vivo (temporada en curso):** además, al abrir la portada se pide la
  temporada actual (`dates=2026&limit=1000`) para armar "Hoy" (partidos por jugar)
  y sumar los resultados nuevos. Los partidos ya presentes se detectan por su
  `id` de ESPN y **no se duplican**.
- **Nombres de equipo:** un mapa (`scripts/arg-team-map.json`, replicado en
  `js/v2.js`) lleva cada rótulo de ESPN a un **nombre canónico**, así el historial
  de un club no queda partido en dos equipos. Se descartan partidos de equipos
  ajenos a la liga que ESPN mezcla por error (p. ej. clubes brasileños en 2013).
- **Condiciones:** datos y términos de **ESPN**. Se usan de forma **nominativa**
  (nombres, fechas, horarios y resultados) y se **muestra la fuente** en pantalla.
  Si ESPN no responde, la app sigue funcionando con el historial ya descargado.
- **Cómo desactivar lo "en vivo":** casilla "Liga Argentina (en vivo)" en la portada
  (el historial ya descargado queda como dato local).

> Nota: **olé.com.ar** se evaluó como fuente para las ligas argentinas, pero sus
> datos los sirve su proveedor *LilaX* (`ole.lilax.io`) mediante JavaScript y
> **no son accesibles desde el navegador** (bloqueo CORS y sin datos en el HTML);
> por eso no puede usarse en una app 100 % frontend. Se eligió ESPN, que sí es
> accesible de forma directa. Se usa el nombre completo **"Gimnasia y Esgrima de
> Mendoza"** en pantalla.

## 3. Fuentes opcionales (importación manual)

Futbolityx **no** llama automáticamente al resto de estas fuentes ni incluye sus
claves:
solo permite que el usuario importe datos que ya posee o descarga, respetando los
términos de cada proveedor.

| Fuente | Licencia / condiciones | Nota |
|---|---|---|
| **TheSportsDB** | Términos del sitio; la *key* `3` es **solo para pruebas** | No usar en producción sin clave propia |
| **OpenLigaDB** | Uso libre (*fair use*) | Fútbol alemán |
| **football-data.co.uk** | Uso personal; no redistribuir comercialmente | CSV manual |
| **football-data.org / API-Football / The Odds API / etc.** | Requieren *API key* y aceptar sus términos | Claves quedan visibles en el navegador → usar proxy |

Es responsabilidad de quien importa datos **respetar las condiciones de uso** de
cada fuente (límites de peticiones, atribución, prohibición de uso comercial, etc.).

## 4. Código del proyecto

El código de Futbolityx se distribuye bajo **licencia MIT** (ver [`LICENSE`](../LICENSE)).
No cubre los datos de terceros listados arriba.

---

*Documento informativo; no constituye asesoramiento legal.*
