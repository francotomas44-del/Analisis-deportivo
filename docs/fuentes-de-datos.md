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
| **openfootball** (JSON en GitHub) | No | Límite de GitHub | ✅ `*` | Mundiales desde **1930** y ligas europeas, con goles y estadios | No |
| **football-data.co.uk** (CSV) | No | — | ❌ sin CORS | Histórico + **árbitro** + córners + tarjetas + cuotas | Sí |
| **ESPN** (Liga Argentina) | No | — | ✅ `*` | Próximos partidos **y resultados** de la Liga Profesional Argentina (2026) | No |

En la app están en la pestaña **Importar**:

- TheSportsDB: `lookup_all_teams.php?id=<liga>` + `eventsseason.php?id=<liga>&s=<temporada>`
- OpenLigaDB: `api.openligadb.de/getmatchdata/<liga>/<temporada>`
- openfootball: cualquier URL de JSON de `github.com/openfootball/...`
- CSV de football-data.co.uk: se descarga el archivo y se sube con **"Subir archivo"**.

### Liga Profesional Argentina (automática, portada "Hoy")

La base de openfootball **no** incluye la temporada 2026 de la Liga Profesional
Argentina ni a todos los equipos actuales (p. ej. Gimnasia y Esgrima de Mendoza),
así que la portada **"Hoy"** usa la API pública de **ESPN**:

- Endpoint: `site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard?dates=2026&limit=1000`
  (una sola petición que devuelve la temporada; la respuesta se cachea unas horas
  en el navegador).
- De esa respuesta se toman:
  - los partidos **por jugar** (fechas, equipos y horarios) para la portada; y
  - los partidos **terminados**, que se agregan al historial para que **todos los
    equipos actuales** (incluidos los que no están en openfootball, como
    Gimnasia y Esgrima de Mendoza) tengan datos reales y se les pueda calcular
    probabilidades.
- Se muestra la fuente en pantalla y se puede **desactivar** con la casilla
  "Liga Argentina (en vivo)" de la portada. Si ESPN no responde, la portada y el
  historial siguen funcionando con lo último guardado y con el resto de la base local.
- Condiciones de uso: **ESPN**.

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
