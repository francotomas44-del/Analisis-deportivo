# Base histórica integrada

El sistema ya **no requiere importar datos a mano**: viene con una base de resultados
históricos reales, descargada de fuentes libres y confiables, lista para analizar.

## Fuentes

- **[openfootball](https://github.com/openfootball)** — datos **libres / de dominio público**
  (licencia CC0), sin API key, en JSON estático. Se descargan y quedan **locales** en
  `data/openfootball/`, por lo que la app **no consulta internet en tiempo de uso**.
  Reproducido por `scripts/build-dataset.ps1`.
- **ESPN — historia anterior** (`source: "espn-history"`) — tramo que
  openfootball no publica (divisiones antiguas y temporadas previas a 2010-11),
  descargado de la API pública de **ESPN** por `scripts/build-espn-history.ps1` y
  guardado en `data/espn-history/<código>.json`.
- **openfootball — competiciones nuevas** (`source: "openfootball-extra"`) — ligas y
  copas que la base no traía (África, MLS, CONCACAF, Sudamérica, Asia…), descargadas
  de openfootball por `scripts/build-openfootball-extra.ps1` y guardadas en
  `data/openfootball-extra/<slug>.json`.
- **ESPN "al día"** (`source: "espn-season"`) — temporada en curso y tramo reciente de
  las 21 primeras divisiones/competiciones que la base ya tiene
  (`scripts/build-espn-season.ps1`, `data/espn-season/<código>.json`).
- **ESPN — Liga Profesional Argentina** (`source: "arg-espn"`) — historial 2001 y
  2003–2026 por torneo (`scripts/build-arg-espn.ps1`, `data/arg-espn/<año>.json`).
- **ESPN — CONMEBOL Sudamericana** (`source: "espn-sudamericana"`) — la Sudamericana no
  está en openfootball, así que se baja de la API pública de **ESPN** por
  `scripts/build-espn-sudamericana.ps1` (temporadas **2005–2026**) y se guarda en
  `data/espn-sudamericana/conmebol.sudamericana.json`. Incluye los partidos jugados
  (`STATUS_FULL_TIME` + `STATUS_FINAL_PEN`) **y los cruces por jugar** sin marcador, que
  alimentan la portada **"Hoy"**. Su entrada del manifiesto lleva **`rev`** (hash del
  contenido) porque cambia con el tiempo (suma resultados y cruces por jugar).
- **ESPN — CONMEBOL Libertadores** (`source: "espn-libertadores"`) — también de la API
  pública de **ESPN** por `scripts/build-espn-libertadores.ps1` (temporadas **2005–2026**),
  guardada en `data/espn-libertadores/conmebol.libertadores.json`. Reemplaza a la antigua
  entrada `sa-lib` de `openfootball-extra`: ese archivo juntaba los `*_copal.txt`
  (Libertadores) **y** los `*_copas.txt` (Sudamericana) del repositorio openfootball bajo un
  mismo código "Copa Libertadores", con lo que el historial quedaba contaminado con partidos
  de la Sudamericana. Igual que la Sudamericana, incluye jugados (`STATUS_FULL_TIME` +
  `STATUS_FINAL_PEN`) y cruces por jugar, y su entrada lleva **`rev`**.
- **ESPN — Sudamérica doméstica** (`source: "espn-southamerica"`) — primeras divisiones de
  **Chile** (`chi.1`), **Uruguay** (`uru.1`), **Perú** (`per.1`), **Bolivia** (`bol.1`) y
  **Venezuela** (`ven.1`), que la base no traía: sus clubes aparecían **solo** en las copas
  CONMEBOL. Se bajan de la API pública de **ESPN** por `scripts/build-espn-southamerica.ps1`
  (temporadas **2005–2026**) a `data/espn-southamerica/<código>.json` (~30.600 partidos).
  Reutiliza los alias de las copas para no partir clubes, incluye los jugados
  (`STATUS_FULL_TIME` + `STATUS_FINAL_PEN`) **y los cruces por jugar**, y su entrada lleva
  **`rev`**.

## Cobertura (309 archivos · ~93 MB · 8 fuentes + tarjetas)

Reparto de partidos por fuente (crudo, antes de deduplicar entre fuentes):

| Fuente (`source`) | Archivos | Partidos |
|---|---|---|
| `openfootball` | 203 | 52.015 |
| `arg-espn` | 25 | 9.506 |
| `espn-season` | 21 | 2.790 |
| `espn-history` | 21 | 65.277 |
| `openfootball-extra` | 32 | 27.639 |
| `espn-sudamericana` | 1 | 2.296 |
| `espn-libertadores` | 1 | 3.200 |
| `espn-southamerica` | 5 | 30.631 |
| **Total** | **309** | **193.354** |

Además, **22 archivos de tarjetas** (`source: "cards"`, `data/cards/`, ≈1,7 MB) **no agregan
partidos**: enriquecen los ya existentes con **amarillas, rojas y córners** por equipo (≈60.600
partidos cubiertos). Se unen por `id` de ESPN al cargar. Ver [`tarjetas.md`](tarjetas.md).

Tras **deduplicar** los solapamientos entre fuentes y **fusionar variantes de nombre**,
la app queda con **≈188.500 partidos**, **≈2.190 equipos/selecciones** y
**106 competiciones**.

**Variantes de nombre brasileñas.** Las fuentes escriben al mismo club de dos formas
distintas (`Flamengo RJ` / `CR Flamengo`, `Botafogo RJ` / `Botafogo FR`, `Atlético Mineiro` /
`CA Mineiro`, …). La normalización genérica de `canonicalName()` (quita FC/SC/…) no siempre los
colapsa, así que el club quedaba partido en dos equipos. `js/store.js` incluye ahora una tabla
curada (`TEAM_ALIAS`, 19 clubes brasileños) y `canonicalMap()` elige como **nombre
superviviente** el del club con **más partidos**.

Cobertura por tipo:

- **Selecciones nacionales**
  - **Copa Mundial FIFA** — todas las ediciones (1930 → 2026).
  - **Eurocopa UEFA** — ediciones disponibles (2020, 2024, 2028).
- **Clubes (internacional)**
  - **UEFA Champions League**, **CAF Champions League** y **CONCACAF Champions Cup**.
  - **Copa Libertadores** y **CONMEBOL Sudamericana** (ambas de ESPN, 2005 → 2026).
- **Ligas nacionales — primera división**
  - **Europa** (2010-11 → 2026-27, según disponibilidad): Inglaterra, España, Alemania,
    Italia, Francia, Países Bajos, Portugal, Austria, Bélgica, Suiza, Grecia, Turquía,
    Escocia y Rusia.
  - **Resto del mundo** (nuevas, `openfootball-extra`): **MLS** (EE. UU.), Brasil (Serie A
    y B), Colombia, Ecuador, Paraguay, Costa Rica, Kazajistán, Israel, Arabia Saudita,
    **Nigeria, Ghana, Kenia, Malaui, Ruanda, Senegal, Tanzania, Uganda, Zambia,
    Zimbabue y Sudáfrica**, más México, China, Japón, Australia, Argelia, Egipto y Marruecos.
- **Historia anterior (ESPN, `espn-history`)** — ligas europeas y americanas en años
  previos a 2010-11, ancladas al primer partido que ya tiene cada liga.
- **Copas nacionales** — FA Cup (Inglaterra), Copa do Brasil y copas de Austria.

Cada dato es real; nada se inventa.

## Cómo se carga

1. **Automático:** la **primera vez** que abrís la app con la base vacía, se cargan los
   archivos solos (verás una barra de progreso).
2. **Manual:** botón **«Cargar base»** en la barra superior (o el botón del primer uso,
   «Cargar partidos y empezar»). Reemplaza los datos actuales (pide confirmación).
3. Una vez cargada, se guarda **en el navegador (IndexedDB)** y persiste entre sesiones.

> Usá siempre `http://localhost:8766/` (ver `docs/persistencia.md`). El almacenamiento del
> navegador depende del **origen**: `file://`, `localhost` y `127.0.0.1` guardan por separado.

## Cómo regenerar / actualizar la base

```powershell
# 1) Base openfootball (resto del mundo)
powershell -ExecutionPolicy Bypass -File scripts\build-dataset.ps1
# 2) Historia previa (ESPN) para cada liga
powershell -ExecutionPolicy Bypass -File scripts\build-espn-history.ps1
# 3) Competiciones nuevas de openfootball (África, MLS, CONCACAF, Sudamérica, Asia…)
powershell -ExecutionPolicy Bypass -File scripts\build-openfootball-extra.ps1
# 4) Temporada en curso de las ligas ya cubiertas (ESPN)
powershell -ExecutionPolicy Bypass -File scripts\build-espn-season.ps1
# 5) Tarjetas (amarillas/rojas) y córners por partido (ESPN)
powershell -ExecutionPolicy Bypass -File scripts\build-cards.ps1
# 6) CONMEBOL Sudamericana (ESPN; openfootball no la publica)
powershell -ExecutionPolicy Bypass -File scripts\build-espn-sudamericana.ps1
# 7) CONMEBOL Libertadores (ESPN; reemplaza la antigua entrada sa-lib de openfootball-extra)
powershell -ExecutionPolicy Bypass -File scripts\build-espn-libertadores.ps1
# 8) Sudamérica doméstica: Chile, Uruguay, Perú, Bolivia y Venezuela (ESPN)
powershell -ExecutionPolicy Bypass -File scripts\build-espn-southamerica.ps1
```

Cada script descarga su fuente, escribe sus archivos bajo `data/<source>/` y (re)genera
`data/manifest.json`, que es lo que lee la app (`js/dataset.js`). Es reproducible: la
fuente queda identificada en cada paso. `scripts/openfootball-extra.json` lista las
competiciones del paso 3 y `scripts/espn-leagues.json` las del paso 2.

> Solo una corrida a la vez: los pasos 2, 3, 6, 7 y 8 reescriben `data/manifest.json`; correrlos
> en paralelo deja el manifiesto inconsistente.

## Límites (honestidad estadística)

- Las ligas domésticas de openfootball llegan hasta **2010-11**; ESPN cubre hacia atrás
  (`espn-history`) y hacia adelante (`espn-season`), pero **ESPN no tiene** Hungría,
  Argelia, Egipto ni Marruecos, y Chequia devuelve 0 partidos.
- **No** hay alineaciones, árbitros ni cuotas en esta base (eso requeriría otras fuentes:
  ver `docs/apis-datos.md`).
- Los nombres de equipos provienen de las fuentes y **pueden variar** (p. ej. un club con
  dos grafías). La app **fusiona** las variantes que comparten nombre canónico
  (`unifyTeams`) y **descarta** los partidos repetidos entre fuentes.
- Los datos son de **resultados** (marcadores), no de eventos minuto a minuto.
