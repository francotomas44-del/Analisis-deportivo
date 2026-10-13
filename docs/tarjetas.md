# Tarjetas y córners por partido

La base histórica original sólo guardaba **equipos, fecha y resultado**. Para pronosticar tarjetas
con fundamento (y mejorar córners), se construyó una base de **tarjetas amarillas y rojas** (y
córners) por partido y equipo a partir de la **API pública de ESPN**.

## De dónde salen los datos

ESPN publica, en el `scoreboard` de cada liga/temporada (el mismo archivo que se cachea para
construir la historia), el detalle de cada partido:

- `competitions[0].details[]`: jugadas con banderas `yellowCard` / `redCard` y el equipo
  (`team.id`) que las recibió. También admite `athletesInvolved[]` como respaldo.
- `competitions[0].competitors[].statistics[]`: `wonCorners` por equipo.

En el `scoreboard`, las estadísticas de equipo **no** traen `yellowCards`/`redCards` (sólo el
endpoint `summary`, que es una llamada por partido). Por eso las tarjetas se cuentan desde
`details`, que sí funciona en todas las temporadas.

## Cómo se construye

```
powershell -ExecutionPolicy Bypass -File scripts\build-cards.ps1
```

- Reutiliza el caché `%TEMP%\espn-cache-futbolityx` (22 ligas × 26 temporadas) creado por
  `scripts/prefetch-espn.ps1` / los builds de ESPN, y agrega la Liga Profesional Argentina
  (`arg.1`, que se construye aparte).
- Recorre ligas y temporadas, cuenta amarillas/rojas por equipo e incluye córners.
- Sólo guarda partidos cuyo `id` de ESPN ya existe en la base (salvo con `-NoBaseFilter`), para no
  inflar el tamaño.
- Escribe `data/cards/<code>.json` con una entrada compacta por partido:

  ```json
  ["espn:<id>", amarillasLocal, amarillasVisitante, rojasLocal, rojasVisitante, cornersLocal, cornersVisitante]
  ```

- Actualiza `data/manifest.json` (agrega/quita las entradas `source: "cards"`).

Parámetros útiles: `-OnlyCodes ar.1 -NoBaseFilter` procesa sólo una liga sin reindexar la base.

Tamaño actual: **≈1,7 MB** en 22 archivos; **≈60.600 partidos** con tarjetas. Promedios: **≈4,1
amarillas** y **≈0,28 rojas** por partido (realistas).

## Cómo lo usa la app

- `js/dataset.js`: `loadCards()` lee los archivos `source: "cards"` y `applyCards()` enriquece las
  filas por `id` de ESPN; `importBulk` (en `js/store.js`) transporta los campos.
- Campos por partido: `homeYellow`, `awayYellow`, `homeRed`, `awayRed`, `homeCorners`,
  `awayCorners`. Se conserva `homeCards`/`awayCards` como **total** (amarillas + rojas).
- `js/stats.js`: `teamStats` promedia amarillas/rojas a favor y en contra; `setPieces` estima
  **amarillas y rojas por separado** (equipo "a favor" + rival "en contra") y, si no hay datos,
  cae en valores de referencia (≈4,2 amarillas y ≈0,28 rojas por partido) avisando en las notas.
- `js/app.js`: el panel **"Córners y tarjetas (estimaciones)"** muestra amarillas y rojas (local,
  visitante, total); la pestaña **Equipos** muestra "Amarillas/part." y "Rojas/part."; el informe
  exportable agrega el desglose.

## Límites

- Cobertura sólo donde ESPN tiene el detalle: 22 ligas principales + Argentina. Otras competiciones
  (Hungría, varios de Centroamérica/Sudamérica/África/Asia, copas) pueden no tener datos; en esos
  casos se usan valores de referencia.
- Los partidos sin `id` de ESPN (tramos de openfootball sin equivalente) no reciben tarjetas.
- Los promedios son **medias históricas por equipo**, sin árbitro ni contexto del partido; son una
  referencia cuantitativa, no una certeza.
