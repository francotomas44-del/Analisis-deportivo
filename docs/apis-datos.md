# APIs y fuentes de datos para importar al sistema

> Investigación realizada el 11/10/2026. Los límites de los planes gratuitos cambian: verificá siempre la documentación oficial antes de depender de ellos.

Este documento es la base para el **Data Collector** del proyecto (sección 7 del `Readme.md`). Ordena las opciones **gratuitas** para importar datos, con foco en lo que necesita el sistema: resultados históricos, enfrentamientos directos (cruces), equipos/selecciones, competiciones y árbitros.

> **Nota (11/10/2026):** el sistema ya **no tiene pestaña «Importar»**. En su lugar incorpora
> una **base histórica integrada** de openfootball, cargada automáticamente (ver
> `docs/base-historica.md`). Este documento se conserva como referencia de fuentes para
> ampliaciones futuras.

---

## 1. Resumen rápido (REST APIs gratuitas)

| Proveedor | Base URL | Auth | Límite gratis | Cobertura | Historia | Árbitros | CORS¹ |
|---|---|---|---|---|---|---|---|
| **football-data.org** | `https://api.football-data.org/v4` | Header `X-Auth-Token` | 10 req/min · 12 competiciones | 12 competiciones top (5 grandes ligas + CL + WC + otras) | Temporadas anteriores (`?season=`) | Sí (campo `referees` en el partido) | ❌ **bloqueada** (probado) |
| **API-Football (api-sports.io)** | `https://v3.football.api-sports.io` | Header `x-apisports-key` | 100 req/día | 1.200+ ligas y copas | Sí, por temporada | Sí (`fixture.referee` + árbitros) | ⚠️ Probable, verificar |
| **API-Football vía RapidAPI** | `https://api-football-v1.p.rapidapi.com/v3` | `x-rapidapi-key` + host | 100 req/día | Igual que arriba | Igual | Igual | ✅ (RapidAPI habilita navegador) |
| **OpenLigaDB** | `https://api.openligadb.de` | Ninguna | No publica límite | Solo fútbol alemán | Fases recientes | ❌ | ✅ |
| **TheSportsDB** | `https://www.thesportsdb.com/api/v1/json/{key}` | Key en la URL (`123` = gratis) | 30 req/min + **tope de resultados por consulta** | 617 ligas (crowd-sourced) | Parcial | ❌ | ✅ |
| **ESPN (no oficial)** | `https://site.api.espn.com/apis/site/v2/sports/soccer/{liga}/scoreboard` | Ninguna | No documentado | Muchas competiciones | Por temporada (probado: arg.1 desde 2001) | ❌ | ✅ **(base de la Liga Argentina: historial 2001 y 2003–2026 descargado + temporada en curso en vivo; alineaciones y stats por jugador con `summary?event=`, ver §6)** |

¹ **CORS** = permite llamar la API directamente desde el navegador (crítico para un proyecto *full frontend*).

### Notas clave por proveedor

- **football-data.org** — JSON limpio y trae **árbitros + head2head**, pero en nuestra prueba (11/10/2026) **no permitió la llamada desde el navegador**: un `fetch` simple a `/v4/competitions` falla por CORS. Es decir, **no sirve para un proyecto 100 % frontend sin un proxy**. Queda como opción solo si agregás un backend mínimo.
- **API-Football** — la más completa en un solo proveedor (1.200+ ligas, `fixtures/headtohead`, eventos, alineaciones, árbitro por partido). Su límite de **100 req/día** la hace apta para sincronizaciones puntuales, no para uso masivo. (CORS no verificado; probablemente requiere proxy.)
- **TheSportsDB** — ✅ **funciona desde el navegador**. Útil para equipos, **año de fundación**, escudos e historial. La clave gratuita limita severamente las búsquedas (por ejemplo, `searchteams` gratis solo responde a "Arsenal"), y `lookup_all_teams` devuelve el plantel de una liga.
- **OpenLigaDB** — ✅ **funciona desde el navegador**, sin API key, pero **solo fútbol alemán**.
- **openfootball** (GitHub raw) — ✅ **funciona desde el navegador**: JSON estático con Mundiales y ligas desde 1930.
- **ESPN (no oficial)** — ✅ **funciona desde el navegador** (con `User-Agent` de navegador; sin key). Es la base de la **Liga Profesional Argentina**: `scripts/build-arg-espn.ps1` descarga las temporadas **2001 y 2003–2026** (9.505 partidos, solo partidos terminados) y las empaqueta en `data/arg-espn/`. La temporada en curso se refresca en vivo (misma API). No tiene CORS restringido y devuelve la temporada completa en una sola petición (`dates=<año>&limit=1000`). Además: `scripts/build-espn-season.ps1` usa la misma API para poner **al día** 21 primeras divisiones/competiciones (Inglaterra, España, Alemania, Italia, Francia, Países Bajos, Portugal, Austria, Bélgica, Grecia, Turquía, Escocia, Rusia, México, Brasil, China, Japón, Australia, Colombia, Suiza y Champions League), agregando **solo** los partidos terminados posteriores al último que ya tiene la base; y `scripts/build-espn-history.ps1` descarga el **tramo anterior** al primer partido de cada liga (65.276 partidos, 21 ligas) para tener historia más profunda. ESPN **no** cubre hoy Hungría, Argelia, Egipto ni Marruecos, ni devuelve partidos de Chequia. Para las competiciones que openfootball no traía (África, MLS, CONCACAF, Sudamérica, Asia…) se usa `scripts/build-openfootball-extra.ps1` (misma fuente openfootball, guiada por `scripts/openfootball-extra.json`).

### Resultado de la prueba de conectividad (desde el navegador)

| Endpoint probado | Resultado |
|---|---|
| `api.openligadb.de/getavailableleagues` | ✅ HTTP 200 |
| `thesportsdb.com/api/v1/json/3/lookup_all_teams.php?id=4328` | ✅ HTTP 200 |
| `raw.githubusercontent.com/openfootball/...` | ✅ HTTP 200 |
| `api.football-data.org/v4/competitions` | ❌ `Failed to fetch` (CORS) |
| `site.api.espn.com/.../summary?event=<id>` | ✅ HTTP 200 (alineaciones + stats por jugador) |

---

## 2. Fuentes para historia masiva (no son REST)

Para "cruces históricos" y modelos estadísticos, los datasets abiertos rinden mucho más que las APIs:

| Fuente | Qué aporta | Formato | Notas |
|---|---|---|---|
| **openfootball** (`github.com/openfootball`) | Mundiales, Eurocopas y varias ligas históricas | JSON / texto | Dominio público, sin key. Base sin fricción. |
| **football-data.co.uk** | Décadas de resultados de ligas de clubes **+ cuotas** | CSV | El mejor punto de partida para entrenar el modelo. Sin key. |
| **Kaggle: "International football results 1872→hoy"** (`martj42`) | Selecciones nacionales desde 1872 | CSV | Lo más cercano a "selecciones desde su nacimiento". Sin key. |
| **StatsBomb Open Data** (`github.com/statsbomb/open-data`) | Eventos con xG de algunos Mundiales/competiciones | JSON | Datos profundos para features avanzadas. Sin key. |
| **Club Elo** (`clubelo.com/API`) | Fuerza de equipos (ratings Elo) diaria | JSON | Feature numérico limpio, sin scraping. Sin key. |
| **FBref / Understat** | xG y estadísticas avanzadas | HTML (scraping) | No es API; scraping frágil y con riesgo de ToS. |

---

## 3. Stack recomendado para este proyecto (full frontend)

1. **Fuente base (equipos, año de fundación, escudos, historial):** `TheSportsDB` — funciona desde el navegador.
2. **Partidos detallados:** `OpenLigaDB` (fútbol alemán, sin clave) — funciona desde el navegador.
3. **Historia de Mundiales y ligas desde 1930:** `openfootball` (JSON en GitHub raw) — funciona desde el navegador.
4. **Historia masiva offline:** CSV de `football-data.co.uk` + dataset de selecciones desde 1872 (importación por archivo).
5. **Solo con proxy/backend:** `football-data.org` y `API-Football` (verificados como **no utilizables** directamente desde el navegador).

---

## 4. Consideraciones de integración (importante para *full frontend*)

- **CORS:** verificado en la app: `TheSportsDB`, `OpenLigaDB` y `openfootball` (GitHub raw) **sí** funcionan; `football-data.org` **no** (requiere proxy).
- **Clave expuesta:** en una app 100% frontend, cualquier API key queda visible en el navegador. Para uso local/personal es aceptable; para publicar en internet conviene un proxy mínimo.
- **Almacenamiento:** `localStorage` (~5 MB) **no alcanza** para historial masivo. El sistema ya usa **IndexedDB** (con respaldo en localStorage).
- **Etiqueta de uso:** cachear resultados localmente y respetar los límites por minuto/día (cada registro guarda su **fuente** para trazabilidad).
- **Verificación cruzada:** conviene confirmar marcadores finales con dos fuentes antes de fijarlos como "dato exacto" (categoría A).

---

## 5. Recordatorio honesto

Ninguna API gratuita cubre "todos los partidos y árbitros del mundo desde el nacimiento de cada equipo". La cobertura completa solo existe en proveedores pagos con licencia. El sistema debe registrar **qué fuente, con qué cobertura**, respalda cada dato, y bajar la confianza cuando falten datos — tal como exige el `Readme.md`.

---

## 6. Detalle por partido: alineaciones y estadísticas de jugadores (ESPN)

Verificado el 22/10/2026 desde el navegador (sin clave y con CORS abierto).

```
GET https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/summary?event={id}
```

Qué devuelve (caso probado: Everton–Chelsea, `eng.1`):

| Bloque | Contenido |
|---|---|
| `rosters[]` | 11 titulares + 9 suplentes por equipo: `athlete{id,name}`, `jersey`, `position`, `starter`, `active`, `formationPlace`, `subbedIn/Out` y **14 estadísticas por jugador** (`totalGoals`, `goalAssists`, `totalShots`, `shotsOnTarget`, `saves`, `goalsConceded`, `foulsCommitted`, `foulsSuffered`, `yellowCards`, `redCards`, `ownGoals`…). También `formation`. |
| `keyEvents[]` | Minuto a minuto: goles, penales, tarjetas, cambios y VAR (con `clock.displayValue`, `participants[]` y `team`). |
| `boxscore.teams[].statistics[]` | 28 estadísticas de equipo (posesión, tiros, tiros al arco, córners, faltas, pases, precisión…). |
| `gameInfo` | Sede y asistencia. |
| `header.competitions[0]` | Marcador, estado (`STATUS_IN_PROGRESS`, `STATUS_FULL_TIME`, `STATUS_SCHEDULED`…), reloj y ganador. |

**Lo que NO trae:** árbitro (`officials` no viene en `scoreboard` ni en `summary`/`header`), rating del jugador y xG. Para árbitros habría que recurrir a API-Football (100 req/día, con clave y proxy) u otro proveedor pago.

Notas operativas:

- El `scoreboard` **no** incluye `rosters`: hace falta **una petición por partido**.
- Payload crudo: ~414 KB (partido jugado) / ~191 KB (programado). Recortado a lo que usa la app: **~9–13 KB**.
- En un partido `STATUS_SCHEDULED` las alineaciones vienen **vacías**; se publican cerca del inicio (≈1 h antes) y se van completando durante el partido.
- La cobertura histórica de alineaciones **varía por competición**: en `arg.1` hay desde 2005; en Bundesliga 2000 no hay. Regla de la app: se pide "si ESPN lo tiene".
- Solo se puede pedir directo si el partido de la base trae `externalId = "espn:<id>"`. Para los que vienen de openfootball (sin id) la app busca el evento en el `scoreboard` del día (ventana de ±1 día) y empareja por nombre de equipo. Esa búsqueda acierta ~95 % de los casos; si no, lo dice.

**Implementación en la app:** `js/live.js` (`AD.live`) pide el `summary` al abrir el detalle del partido, lo recorta, lo cachea en `localStorage` (45 s si está en juego, 5 min si no empezó, 10 min si terminó) y refresca solo cada minuto mientras el partido está en vivo y el panel abierto. No se guarda nada en el repositorio: es dato efímero, se descarta solo.

**Fuentes descartadas para esto:** API-Football (100 req/día + clave expuesta en el cliente), Highlightly y Sportmonks (pago).
