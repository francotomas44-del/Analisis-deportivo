# Fuentes de datos e integración

Este documento lista las fuentes de datos del proyecto **Futbolityx**, cuáles
ya están integradas en la app y cuáles requieren una **API key**.

> Recordatorio: la app es 100% frontend. Una llamada funciona directo desde el
> navegador **solo si la API envía la cabecera CORS** (`Access-Control-Allow-Origin`).
> Si no, hace falta un **proxy/backend** intermedio.

---

## 1. Integradas y sin API key (funcionan desde el navegador)

| Fuente | Clave | Límite gratis | CORS | Aporta | Árbitro |
|---|---|---|---|---|---|
| **TheSportsDB** | test `3` | ~30 req/min | ✅ `*` | Equipos, **año de fundación** (`intFormedYear`), ligas, historial de resultados, escudos | Sí (`strOfficial`, si está cargado) |
| **OpenLigaDB** | No | Fair use | ✅ `*` | Bundesliga 1/2 y más ligas alemanas, partidos detallados, temporadas históricas | No |
| **openfootball** (JSON en GitHub) | No | Límite de GitHub | ✅ `*` | Mundiales desde **1930**, ligas europeas y **competiciones nuevas** (`openfootball-extra`): MLS, CONCACAF, CAF, Brasil (A/B, Copa do Brasil), Colombia, Ecuador, Paraguay, Costa Rica, Kazajistán, Israel, Arabia Saudita y ligas de África | No |
| **football-data.co.uk** (CSV) | No | — | ❌ sin CORS | Histórico + **árbitro** + córners + tarjetas + cuotas | Sí |
| **ESPN** (Liga Argentina + resto) | No | — | ✅ `*` | Liga Profesional Argentina (**historial 2001 y 2003–2026**, `data/arg-espn/`) + **historia previa** (`espn-history`) y **temporada en curso** (`espn-season`) de 21 divisiones/competiciones + **CONMEBOL Sudamericana** (`data/espn-sudamericana/`), **CONMEBOL Libertadores** (`data/espn-libertadores/`), **Sudamérica doméstica** (`data/espn-southamerica/`: Chile, Uruguay, Perú, Bolivia y Venezuela) y **copas y selecciones** (`data/espn-cups/`: Copa América, Eliminatorias CONMEBOL, Europa League y Conference League), todas con historial 2005–2026 + temporada en curso en vivo | No |

En la app están en la pestaña **Importar**:

- TheSportsDB: `lookup_all_teams.php?id=<liga>` + `eventsseason.php?id=<liga>&s=<temporada>`
- OpenLigaDB: `api.openligadb.de/getmatchdata/<liga>/<temporada>`
- openfootball: cualquier URL de JSON de `github.com/openfootball/...`
- CSV de football-data.co.uk: se descarga el archivo y se sube con **"Subir archivo"**.

### Portada "Hoy": partidos terminados

"Hoy" se arma con los partidos por jugar de la base empaquetada. Como esos archivos se
regeneran por lotes, un partido puede seguir en el archivo después del pitazo final. Para los
partidos de la ventana de cierre (entre 1 h 40 y 3 h desde el inicio) la app consulta el
**estado real a ESPN**: una petición por competición y día, como máximo cada 2 minutos, que
devuelve todos los partidos de esa jornada. Si el partido figura como terminado (`FT`) la
tarjeta se retira en el acto; si sigue en juego (alargue/penales) se mantiene. Si ESPN no
responde, se usa la duración máxima habitual (**≈2 h 05**) y un tope de 3 h. No se borra nada:
el partido queda en **Partidos** y los **análisis guardados** siguen en **Mis predicciones**.

### Liga Profesional Argentina (historial + portada "Hoy")

La base de openfootball solo trae **3 temporadas** argentinas, así que la Liga
Profesional Argentina se arma desde la API pública de **ESPN**:

- **Historial (descargado):** `scripts/build-arg-espn.ps1` baja las temporadas
  **2001 y 2003–2026** y las guarda en `data/arg-espn/<año>.json`
  (**9.505 partidos**; solo `STATUS_FULL_TIME`). Se registran en `data/manifest.json`
  con `source: "arg-espn"` y cada partido guarda su `id` de ESPN.
- **En vivo (temporada en curso):**
  `site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard?dates=2026&limit=1000`
  (una sola petición que devuelve la temporada; la respuesta se cachea unas horas
  en el navegador). De ahí se toman:
  - los partidos **por jugar** (fechas, equipos y horarios) para la portada; y
  - los partidos **terminados**, que se agregan al historial. Los que ya están en
    el paquete descargado se detectan por su `id` de ESPN y **no se duplican**.
- **Nombres de equipo:** `scripts/arg-team-map.json` (replicado en `js/v2.js`)
  lleva cada rótulo de ESPN a un nombre canónico para no partir el historial de un
  club en dos. Se descartan partidos de equipos ajenos a la liga que ESPN mezcla por
  error (p. ej. clubes brasileños en 2013).
- Se muestra la fuente en pantalla y la parte **en vivo** se puede **desactivar**
  con la casilla "Liga Argentina (en vivo)" de la portada. Si ESPN no responde, la
  portada y el historial siguen funcionando con lo último guardado y con el resto
  de la base local.
- Condiciones de uso: **ESPN**.

### Alineaciones y estadísticas por partido (en vivo, sin descarga)

El detalle de cada partido se pide **bajo demanda** a ESPN, al abrir el panel del partido, con
`site.api.espn.com/apis/site/v2/sports/soccer/<liga>/summary?event=<id>`:

- Trae **alineaciones** (11 titulares + suplentes, con formación y cambios), **estadísticas por
  jugador** (goles, asistencias, tiros, atajadas, tarjetas…), **minuto a minuto** (goles, penales,
  tarjetas, cambios, VAR) y **28 estadísticas de equipo**.
- No requiere clave y permite CORS, así que se llama directo desde el navegador.
- **No** se guarda en el repositorio ni en el manifiesto: es dato efímero. Se cachea en el navegador
  con un TTL corto (45 s en juego, 5 min antes, 10 min después) y se refresca solo mientras el
  partido está en vivo.
- Los partidos de las fuentes ESPN se abren por su `id`; los de openfootball, buscando el evento del
  día por nombre de equipo. La cobertura histórica de alineaciones depende de ESPN.
- Código: `js/live.js` (`AD.live`). Detalle técnico en [`apis-datos.md`](apis-datos.md#6-detalle-por-partido-alineaciones-y-estadísticas-de-jugadores-espn).

### Análisis en vivo en la portada "Hoy"

Las tarjetas de **Hoy** de los partidos **en juego** o que **empiezan dentro de la próxima hora**
muestran un bloque de análisis que se actualiza solo. No requiere clave ni backend: usa la misma
ficha pública de ESPN (`summary?event=<id>`, CORS) que el detalle del partido.

- **Cuándo consulta:** partidos empezados hace menos de 3 h y partidos que arrancan en ≤ 60 min.
  Se priorizan los que ya están en juego (hasta 12) y se reservan hasta 8 lugares para los
  próximos; el total simultáneo se limita a 20. Se consultan como máximo **3 fichas a la vez**.
- **Cada cuánto:** **40 s** en juego, **2 min** antes de empezar y **60 s** si la hora de inicio ya
  pasó y ESPN todavía no lo dio por comenzado. Se **pausa** con la pestaña oculta o fuera de
  "Hoy" y se reanuda al volver. Los errores se reintentan con espera creciente (15 s → 5 min).
- **Qué muestra la tarjeta:** minuto y marcador; posesión, tiros, tiros al arco, **xG estimado**,
  remates dentro del área, córners, faltas, tarjetas y atajadas; lectura corta; últimos 3 eventos;
  probabilidades 1X2 **recalculadas** con su variación en puntos respecto del pronóstico previo.
  Antes de empezar: cuenta regresiva, estado de las alineaciones e historial entre ambos equipos.
- **Detalle:** el botón **Detalle** abre el panel del partido en la pestaña **"Análisis en vivo"**,
  con el minuto a minuto, estadísticas completas, arqueros, presión de los últimos 10 minutos,
  historial y **mercados en vivo** (próximo gol, más de 2,5 goles y ambos marcan).

**xG estimado (no es un dato oficial).** ESPN no publica xG por equipo, solo el de algunos
jugadores. La app lo estima sumando el valor de **cada remate** según:
la posición `fieldPositionX/Y` (0–100, arco en x=100, siempre desde el ataque del equipo),
la distancia y el ángulo al arco (7,32 m), si fue **cabeza** (×0,78), si fue **bloqueado**
(×0,7), si fue **ángulo difícil** (×0,6) y si fue **penal** (0,78). Los goles de juego abierto
llegan como tipo `goal` y también suman. Se muestra siempre como **"xG estimado"**.

**Modelo en juego.** Es un Poisson sobre los goles que faltan:
- la fuerza previa del partido (`lh`/`la`) se escala por el tiempo restante, con descuento y un
  empuje final;
- se corrige por el xG generado hasta el momento, con suavizado y atenuación (el xG temprano es
  ruido);
- se ajusta por **expulsiones** (0,74 por roja propia, 1,16 por roja rival) y por el marcador;
- se aplica un **piso de goles restantes** para no cerrar de más un partido parejo en los minutos
  finales;
- de la distribución se obtienen 1X2, próximo gol, más/menos 2,5 y ambos marcan.
- En **tanda de penales** el 1X2 se considera cerrado en empate y no se recalculan goles.

**Límites:** el xG es una estimación transparente (no un proveedor oficial); si ESPN no publica
la jugada con ubicación, se usa un valor por tiros al arco/tiros totales. Los proveedores con xG
oficial (Sportmonks, API-Football, football-data.org) requieren una **clave paga**; en una web
estática quedaría visible, así que no se incluyen. Código: `js/livehoy.js` (`AD.livehoy`).
Detalle técnico en [`analisis-en-vivo.md`](analisis-en-vivo.md).

La interfaz no repite el nombre del proveedor: muestra el estado del dato
(**"Datos actualizados"** o **"Datos aún no disponibles"**) y, en la sección de fuentes y noticias,
lo describe como **API pública**. La atribución detallada queda en [`atribuciones.md`](atribuciones.md).

### Base histórica ampliada (actualizada)

Además del paquete original de openfootball y de la Liga Argentina, la base integrada se
amplió con varios pasos reproducibles:

- **Historia previa (`espn-history`)** — `scripts/build-espn-history.ps1` baja de ESPN el
  tramo anterior al primer partido que ya tenía cada liga (21 ligas/competiciones,
  **65.276 partidos**), guardado en `data/espn-history/<código>.json`.
- **Competiciones nuevas (`openfootball-extra`)** — `scripts/build-openfootball-extra.ps1`
  descarga de openfootball (misma licencia de dominio público) 32 competiciones que la base
  no traía —**MLS**, **CONCACAF Champions Cup**, **CAF Champions League**, Brasil (Serie A
  y B, Copa do Brasil), Colombia, Ecuador, Paraguay, Costa Rica, Kazajistán, Israel, Arabia
  Saudita y ligas de **Nigeria, Ghana, Kenia, Malaui, Ruanda, Senegal, Tanzania, Uganda,
  Zambia, Zimbabue y Sudáfrica**— (**27.582 partidos**), en `data/openfootball-extra/<slug>.json`.
  (Antes incluía también la carpeta `copa-libertadores/`, hoy reemplazada por ESPN.)
- **CONMEBOL Sudamericana (`espn-sudamericana`)** — openfootball no la publica, así que
  `scripts/build-espn-sudamericana.ps1` baja de ESPN las **22 temporadas 2005–2026** a
  `data/espn-sudamericana/conmebol.sudamericana.json`: **2.293 partidos jugados**
  (`STATUS_FULL_TIME` + `STATUS_FINAL_PEN`, estos últimos son llaves a doble partido
  definidas por penales, y se guarda el resultado de ese partido) **+ los partidos por
  jugar** sin marcador, para que la portada **"Hoy"** los muestre con su pronóstico.
  Los equipos se mapean contra un índice ampliado (openfootball + arg-espn + openfootball-extra,
  porque la juegan clubes de esas ligas) más los alias de
  `scripts/espn-sudamericana-team-map.json`; un equipo no reconocido se agrega como nuevo.
  Como esta copa **sí cambia** (suma resultados y cruces a medida que se juega), su entrada
  del manifiesto lleva una **`rev`** (hash del contenido) que la app usa como query (`?v=rev`)
  para refrescar el archivo: el resto de `data/` es inmutable y se cachea de forma agresiva.
- **CONMEBOL Libertadores (`espn-libertadores`)** — tampoco está en openfootball (su carpeta
  `copa-libertadores/` mezclaba Libertadores y Sudamericana), así que
  `scripts/build-espn-libertadores.ps1` baja de ESPN las temporadas **2005–2026** a
  `data/espn-libertadores/conmebol.libertadores.json`: **3.196 partidos jugados** + los
  cruces por jugar, con la misma mecánica de alias (`scripts/espn-libertadores-team-map.json`,
  que además reutiliza los del archivo de la Sudamericana) y de **`rev`** que la Sudamericana.
  Antes de este paso se quitó la entrada `sa-lib` de `scripts/openfootball-extra.json`.

- **Sudamérica doméstica (`espn-southamerica`)** — las primeras divisiones de **Chile**
  (`chi.1`), **Uruguay** (`uru.1`), **Perú** (`per.1`), **Bolivia** (`bol.1`) y **Venezuela**
  (`ven.1`), que la base no traía (sus clubes aparecían solo en las copas CONMEBOL).
  `scripts/build-espn-southamerica.ps1` baja de ESPN las temporadas **2005–2026** a
  `data/espn-southamerica/<código>.json`: **≈30.600 partidos** y **≈76 equipos nuevos**.
  Reutiliza los alias de las copas y lleva **`rev`**, igual que las dos copas.

- **Copas y selecciones nuevas (`espn-cups`)** — cuatro competiciones que la base no traía:
  **Copa América** (`conmebol.america`, 2001 → 2024), **Eliminatorias Mundial CONMEBOL**
  (`fifa.worldq.conmebol`, 2003 → 2025), **UEFA Europa League** (`uefa.europa`, 2009 → 2026)
  y **UEFA Conference League** (`uefa.europa.conf`, 2021 → 2026). `scripts/build-espn-cups.ps1`
  baja de ESPN **3.917 partidos crudos** a `data/espn-cups/<código>.json` (~2,2 MB): los
  jugados + los cruces por jugar (portada "Hoy"), con **`rev`**. De las dos copas europeas se
  guarda **solo la fase principal**, descartando las rondas previas por `season.slug` (campo
  `phaseExclude` de `scripts/espn-cups.json`). Los clubes se resuelven contra el índice
  ampliado (incluye `espn-history` y `espn-season`) + `scripts/espn-cups-team-map.json`
  (**17 alias**); las dos competiciones de selecciones usan un mapa de país propio
  (`venezuela` → `Venezuela`), porque la base **no** aplica ahí el alias de clubes.

En total, la base queda con **313 archivos** (≈93 MB) y, tras deduplicar los solapamientos
entre fuentes y unificar variantes de nombre, **192.202 partidos**, **2.089 equipos** y
**110 competiciones**. Ver `docs/base-historica.md`.

**Puesta al día automática.** La base se importa una sola vez por instalación (IndexedDB).
Para que las instalaciones que ya la tienen reciban lo que se agregue después —una competición
nueva como la Conference League, una temporada más o datos corregidos— la app guarda en
`localStorage` (`futbolityx:base:files`) qué archivos entraron y, al abrir, compara ese
registro con el manifiesto: descarga **solo los que faltan** y los fusiona sin duplicar
(fecha + equipos canónicos), conservando lo guardado y adoptando el `externalId` de ESPN
cuando la copia nueva lo trae. También se puede forzar desde **Datos → Buscar datos nuevos**.
Los partidos con el mismo club en las dos puntas (error de una fuente) se descartan al importar.

**Nombres de los partidos futuros.** Los fixtures que llegan de ESPN traen el nombre del
evento (`Kairat Almaty`, `SL Benfica (POR)`), que no siempre es el nombre guardado en la base
(`FK Kairat`, `Benfica`). La portada los resuelve con `canonicalName()` (`AD.store.findTeamByName`):
busca el nombre exacto y, si no está, el canónico. Así todos los partidos de "Hoy" tienen
pronóstico aunque el rótulo de la fuente sea distinto.

---

## 2. Requieren **API key** (hay que registrarse)

| Fuente | Dónde conseguir la key | Límite gratis | CORS | Cobertura | Árbitro |
|---|---|---|---|---|---|
| **football-data.org** | https://www.football-data.org/client/register | 10 req/min (100 req/día anónimo) | ❌ sin CORS → proxy | 12 competiciones top, temporada actual | No |
| **API-Football** (api-sports.io) | https://dashboard.api-football.com/register | 100 req/día | ❌ sin CORS → proxy | +1100 ligas, alineaciones, eventos | Sí |
| **Highlightly** | https://highlightly.net/ | ~100 req/día | Revisar | Amplia, con estadísticas | Parcial |
| **Zafronix** | https://api.zafronix.com/ | ~50 req/día | ✅ `*` | Ligas top + copas | No |
| **The Odds API** | https://the-odds-api.com/ | 500 req/mes | ✅ `*` | Cuotas de casas de apuestas | No |
| **SportMonks** | https://www.sportmonks.com/ | Prueba | Varía | Muy amplia (mayormente pago) | Sí |

**Cómo usar una key en la app:** la clave se debería ingresar en la app (o en un
proxy propio). Importante: en un frontend las claves quedan **visibles** para el
usuario, así que para uso público conviene un **proxy** que oculte la clave.
Para uso personal/local, alcanza con incluirla en la petición.

---

## 3. Sin API pública (no integrables de forma automática)

| Fuente | Situación | Motivo |
|---|---|---|
| **Promiedos** (`promiedos.com.ar`) | No integrable automáticamente | Web Next.js; los datos vienen de `api.promiedos.com.ar`, **no documentada** y que bloquea/limita el acceso automatizado |
| **Olé** (`ole.com.ar`) | No integrable | Sus estadísticas las sirve su proveedor *LilaX* (`ole.lilax.io`) por JavaScript; **sin CORS** y sin datos en el HTML → imposible desde una app 100 % frontend |
| **El Nine** (`elnine.com.ar`) | No integrable | Detrás de **Cloudflare** (`403`), **sin CORS** y `robots.txt` que **prohíbe `/api/`** |

En ambos casos los datos se pueden cargar de forma **legítima y manual** con
**"Pegar JSON"**, **"Subir archivo"** o **"Descargar desde URL"**, y quedan
etiquetados con su campo `fuente` para mantener la trazabilidad.

---

## 4. Formato de importación aceptado

La app detecta automáticamente arreglos/objetos con las claves
`matches`, `events`, `games`, `partidos`, `data`, `response` o `results`, o un
arreglo directo de partidos.

Campos reconocidos por partido (nombres alternativos soportados):

| Campo | Alternativas |
|---|---|
| Equipo local | `home`, `homeTeam`, `HomeTeam`, `team1`, `strHomeTeam`, `local` |
| Equipo visitante | `away`, `awayTeam`, `AwayTeam`, `team2`, `strAwayTeam`, `visitante` |
| Goles local / visitante | `homeGoals`, `FTHG`, `intHomeScore`, `pointsTeam1`, `score.ft[0]` |
| Fecha | `date`, `dateEvent`, `matchDateTime`, `Date` (`dd/mm/yyyy` o ISO) |
| Competición | `competition`, `league`, `strLeague`, `leagueName`, `Div` |
| Árbitro | `referee`, `Referee`, `strOfficial`, `arbitro` |
| Córners | `homeCorners`/`awayCorners`, `HC`/`AC` |
| Tarjetas | `homeCards`/`awayCards`, `HY`/`AY` |

Ejemplo mínimo:

```json
{
  "source": "Promiedos",
  "matches": [
    { "date": "2026-10-10", "home": "Boca", "away": "River",
      "homeGoals": 1, "awayGoals": 0, "referee": "Pérez" }
  ]
}
```
