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
- **ESPN — copas y selecciones nuevas** (`source: "espn-cups"`) — cuatro competiciones que
  la base no traía: **Copa América** (`conmebol.america`, 2001 → hoy), **Eliminatorias
  Mundial CONMEBOL** (`fifa.worldq.conmebol`, 2003 → hoy), **UEFA Europa League**
  (`uefa.europa`, 2009 → hoy) y **UEFA Conference League** (`uefa.europa.conf`, 2021 → hoy).
  De la API pública de **ESPN** por `scripts/build-espn-cups.ps1`, guardadas en
  `data/espn-cups/<código>.json` (~2,2 MB). Incluyen los jugados (`STATUS_FULL_TIME` +
  `STATUS_FINAL_PEN`) **y los cruces por jugar** (alimentan la portada "Hoy"), y su entrada
  lleva **`rev`**. De las dos copas europeas se guarda **solo la fase principal**: las rondas
  previas (`qualifying`, `preliminary`, `play-off round`, `play-offs`, `first round`) se
  descartan con una lista negra sobre `season.slug` (`scripts/espn-cups.json`, campo
  `phaseExclude`). Las dos competiciones de selecciones usan un mapa de alias propio
  (vacío salvo `Venezuela`; ver más abajo).

## Cobertura (313 archivos · ~93 MB · 9 fuentes + tarjetas)

Reparto de partidos por fuente (crudo, antes de deduplicar entre fuentes):

| Fuente (`source`) | Archivos | Partidos |
|---|---|---|
| `openfootball` | 203 | 52.015 |
| `arg-espn` | 25 | 9.506 |
| `espn-season` | 21 | 2.790 |
| `espn-history` | 21 | 65.276 |
| `openfootball-extra` | 32 | 27.582 |
| `espn-sudamericana` | 1 | 2.296 |
| `espn-libertadores` | 1 | 3.200 |
| `espn-southamerica` | 5 | 30.630 |
| `espn-cups` | 4 | 3.917 |
| **Total** | **313** | **197.212** |

Además, **22 archivos de tarjetas** (`source: "cards"`, `data/cards/`, ≈1,7 MB) **no agregan
partidos**: enriquecen los ya existentes con **amarillas, rojas y córners** por equipo (≈60.600
partidos cubiertos). Se unen por `id` de ESPN al cargar. Ver [`tarjetas.md`](tarjetas.md).

Tras **deduplicar** los solapamientos entre fuentes y **fusionar variantes de nombre**,
la app queda con **192.193 partidos**, **2.089 equipos/selecciones** y
**110 competiciones** (los 3.917 crudos de `espn-cups` entran como 3.754 jugados; los
**162 por jugar** —72 de la Europa League y 90 de la Conference— los carga aparte
`AD.dataset.loadUpcoming` para la portada "Hoy", y un partido se descarta por repetido
dentro de la propia fuente).

**Variantes de nombre.** Las fuentes escriben al mismo club de dos formas
distintas (`Flamengo RJ` / `CR Flamengo`, `Botafogo RJ` / `Botafogo FR`, `Atlético Mineiro` /
`CA Mineiro`, …). La normalización genérica de `canonicalName()` (quita FC/SC/…) no siempre los
colapsa, así que el club quedaba partido en dos equipos. `js/store.js` incluye una tabla
curada (`TEAM_ALIAS`, 87 claves: 19 clubes brasileños y 2 sudamericanos; 6 alemanes, 5
austríacos y 36 más que cada fuente renombra u abrevia —openfootball pasó a usar el nombre
«largo» con ciudad o sufijo legal desde 2020-21, y ESPN añade la sigla o el país— partidos
entre su liga y las copas) y `canonicalMap()` elige como **nombre superviviente** el que no lleva paréntesis y,
a igualdad, el del club con **más partidos**. El alias se aplica también sin el sufijo
`(PAÍS)`, de modo que `AFC Ajax (NED)` y `AFC Ajax` caen en el mismo club. Los clubes que
ESPN nombra distinto según la temporada dentro de una misma liga se corrigen en el origen,
con `scripts/espn-southamerica-team-map.json` (p. ej. `Unión Wanderers` 2020 = `Santiago
Wanderers (CHI)`, `Melipilla` 2021 = `Deportes Melipilla`, `El Vigia` = `Atlético Vigía`).

**Alias de las copas nuevas (`scripts/espn-cups-team-map.json`).** `espn-cups` reutiliza
`scripts/espn-team-alias.json` y añade un mapa propio con **17 entradas** escritas con el
nombre **exacto** de la base: variantes que el resolutor difuso no acertaba (`Apoel Nicosia`
→ `APOEL Nikosia (CYP)`, `Dynamo Kyiv` → `Dinamo Kiev (UKR)`, `Sparta Prague` → `AC Sparta
Praha (CZE)`, `CFR Cluj-Napoca` → `CFR Cluj (ROU)`, …) y **dos falsos positivos** de la regla
de prefijos que apuntaban a un club equivocado: `Lillestrom` → `Lille OSC` y `Riga FC` →
`Skonto Riga` (quedan como `Lillestrøm` y `Riga FC`). El índice de resolución es el
**ampliado** (incluye `espn-history` y `espn-season`), así que los clubes que ya existían con
otro nombre **no** se recrean.

**Colisiones club / selección.** Cuando un club y una selección nacional comparten
exactamente el mismo nombre, la base los fusionaba en un solo equipo. Se corrigieron en el
origen: ESPN llamaba `Austria` al **FK Austria Wien** (`data/espn-season/at.1.json`) y
`Peru` al **AC Perugia** de la Serie A 2000-2004 (`data/espn-history/it.1.json`); y el
resolutor de nombres degradaba el club zimbabuense **Scottland FC** (así, con dos «t») a
`Scotland` (`data/openfootball-extra/af-zw.json`). Los alias de origen
(`scripts/espn-team-alias.json`, `scripts/openfootball-extra-team-map.json`) evitan que
vuelvan a ocurrir en las próximas descargas.

**Mapeos erróneos del resolutor ESPN (pendiente).** El resolutor de ESPN
(`scripts/espn-common.ps1`) empareja la similitud por tokens con una regla de «cobertura» que
da falsos positivos cuando el nombre de entrada empieza con un token corto del candidato:
`Portsmouth` → `Shanghai Port FC`, `Portuguesa` → `Shanghai Port FC`, `América (MG)` →
`CF América`, `Platanias` → `Gimnasia de La Plata`, `Tigres FC` → `Tigre`,
`Desportivo Aves` → `Deportivo Alavés` y `Atlético Minero` → `Atlético Mineiro`. Deja
partidos de una liga bajo un club de otro país. Se corrigió a mano el caso más claro
(`data/espn-history/pt.1.json`: los 34 partidos de `Deportivo Alavés` en la Primeira Liga
2017-18 pasaron a `CD Aves`), pero el arreglo de fondo es endurecer la regla de cobertura y
**reconstruir** `espn-history`/`espn-southamerica`. Aparte existe una clase de **homónimos
entre países** que la app fusiona por nombre (`CD Nacional` Portugal/Uruguay/Paraguay,
`River Plate` Argentina/Uruguay, `Llaneros` Colombia/Venezuela): requiere desambiguar en el
origen con el sufijo `(PAÍS)`.

Al sumar `espn-cups` aparecieron **tres casos más**, ya tapados con alias: `Lillestrom` →
`Lille OSC` y `Riga FC` → `Skonto Riga` (los dos falsos positivos, arriba) y la **selección
`Venezuela`** → el club `Atlético Venezuela` — la base **no tenía** la selección (nunca jugó
un Mundial) y su único equipo venezolano era ese club de liga, al que el resolutor difuso
asignaba los 35 partidos de la Copa América. Las competiciones de selecciones usan ahora su
propio mapa (`$aliasNations` en `scripts/build-espn-cups.ps1`: `venezuela` → `Venezuela`).

**Marcadores inválidos (ESPN).** Cuando ESPN no tiene el resultado de un partido
devuelve `score: -1` para el equipo sin dato (no `null`). Los generadores solo
comprobaban que el marcador fuera un entero, así que el `-1` pasaba y dejaba
partidos con goles negativos (dos casos: `Universidad de Concepción (CHI)` y
`Once Caldas`). Se endurecieron los seis generadores de ESPN
(`build-espn-*.ps1`) para descartar `score < 0`, se limpiaron los archivos
afectados y el almacén (`store.importBulk`/`importMatches` e `init`) descarta
cualquier partido con marcador negativo, de modo que instalaciones ya guardadas
se sanean al cargar.

**Procedencia por partido.** Cada partido guarda su `source`. Antes el cargador
etiquetaba todos los partidos como `openfootball`; ahora cada fila conserva la
`source` de su archivo del manifiesto (`espn-history`, `espn-season`,
`espn-southamerica`, `espn-sudamericana`, `espn-libertadores`, `espn-cups`,
`openfootball-extra`, `arg-espn`, etc.).

Cobertura por tipo:

- **Selecciones nacionales**
  - **Copa Mundial FIFA** — todas las ediciones (1930 → 2026).
  - **Eurocopa UEFA** — ediciones disponibles (2020, 2024, 2028).
  - **Copa América** (2001 → 2024) y **Eliminatorias Mundial CONMEBOL** (2003 → 2025),
    ambas de ESPN (`espn-cups`).
- **Clubes (internacional)**
  - **UEFA Champions League**, **CAF Champions League** y **CONCACAF Champions Cup**.
  - **Copa Libertadores** y **CONMEBOL Sudamericana** (ambas de ESPN, 2005 → 2026).
  - **UEFA Europa League** (2009 → 2026) y **UEFA Conference League** (2021 → 2026), de
    ESPN (`espn-cups`), **solo la fase principal** (sin rondas previas).
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
4. **Puesta al día:** al abrir, si el manifiesto trae archivos que esa instalación no tiene
   (una competición o temporada agregada después, o datos corregidos con otra `rev`), la app
   los descarga y fusiona **sin borrar nada** y sin duplicar partidos: se apoya en el registro
   `futbolityx:base:files` (`localStorage`) y en la clave fecha + equipos canónicos. También se
   puede forzar desde **Datos → Buscar datos nuevos**.

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
# 9) Copas y selecciones nuevas: Copa América, Eliminatorias CONMEBOL, Europa y Conference (ESPN)
powershell -ExecutionPolicy Bypass -File scripts\build-espn-cups.ps1
```

Cada script descarga su fuente, escribe sus archivos bajo `data/<source>/` y (re)genera
`data/manifest.json`, que es lo que lee la app (`js/dataset.js`). Es reproducible: la
fuente queda identificada en cada paso. `scripts/openfootball-extra.json` lista las
competiciones del paso 3, `scripts/espn-leagues.json` las del paso 2 y
`scripts/espn-cups.json` las del paso 9.

> Solo una corrida a la vez: los pasos 2, 3, 6, 7, 8 y 9 reescriben `data/manifest.json`;
> correrlos en paralelo deja el manifiesto inconsistente.

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
