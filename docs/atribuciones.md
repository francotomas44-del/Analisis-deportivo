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

La base histórica de openfootball **no** incluye la temporada 2026 de la Liga
Profesional Argentina ni a todos sus equipos actuales (por ejemplo, Gimnasia y
Esgrima de Mendoza). Para cubrirla sin inventar datos, la portada **"Hoy"** usa
la API pública de **ESPN**:

- **Fuente:** `https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard`
- **Qué se pide:** el calendario completo de la temporada (una sola petición,
  `dates=2026&limit=1000`). De ahí se usan:
  - los partidos **por jugar** para armar la portada "Hoy"; y
  - los partidos **ya terminados** ("results") para que **todos los equipos
    actuales** tengan historial real y se puedan calcular probabilidades.
- La petición es **anónima** (no envía datos del usuario) y se hace al abrir la
  portada; la respuesta se cachea unas horas en el navegador.
- **Condiciones:** datos y términos de **ESPN**. Se usan de forma **nominativa**
  (solo nombres de equipos, horarios y resultados) y se **muestra la fuente** en
  pantalla. Es un dato "en vivo": si ESPN no responde, la portada y el historial
  siguen funcionando con lo último guardado y con la base local.
- **Cómo desactivarla:** casilla "Liga Argentina (en vivo)" en la portada.

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
