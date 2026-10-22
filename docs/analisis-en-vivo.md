# Análisis en vivo en "Hoy"

Documento técnico del bloque que aparece en las tarjetas de la portada **Hoy** para los partidos
**en juego** o que **empiezan dentro de la próxima hora**. Código: `js/livehoy.js`
(`window.AD.livehoy`), con apoyo de `js/live.js` y `js/v2.js`.

> La app es 100 % frontend. Todo lo de este documento se hace desde el navegador, sin claves y
> sin backend, con la API pública de ESPN (CORS). El xG es **estimado** por la app, no oficial.

---

## 1. Qué partidos entran

`livehoy.start(items)` recibe las tarjetas que acaba de renderizar `v2.js`. Un partido es
candidato (`isCandidate`) si:

- tiene `slug` de ESPN e identificador o se puede resolver por fecha/equipos;
- empezó hace menos de **3 h** (mismo tope que la portada);
- o empieza dentro de los próximos **60 min**.

La selección no es simplemente "los primeros 30": se separan los que ya empezaron de los
próximos y se eligen:

| Grupo | Tope | Orden |
|---|---|---|
| En juego / ya empezados | 12 | más recientes primero |
| Empiezan en ≤ 60 min | 8 | más próximos primero |
| Total consultado a la vez | 20 | — |

Si hay menos de 12 en juego, los lugares libres se completan con más partidos ya empezados.
Así los partidos de la próxima hora no quedan afuera cuando hay una jornada cargada.

## 2. Consulta y refresco

- Ficha: `site.api.espn.com/apis/site/v2/sports/soccer/<slug>/summary?event=<id>`.
- **40 s** si el partido está en juego.
- **2 min** si todavía no empezó.
- **60 s** si la hora de inicio ya pasó y ESPN aún lo da como `pre` (demora).
- Si el partido terminó (`post`): no se vuelve a pedir; la tarjeta se retira.
- **Concurrencia máxima: 3**. El resto espera en una cola.
- **Backoff** ante errores: 15 s, 30 s, 60 s, 120 s y 5 min como tope.
- Se **pausa** si `document.visibilityState === "hidden"` o si la vista activa no es `Hoy`.
  Al volver a la pestaña, el evento `visibilitychange` refresca de inmediato.
- Se cachea el modelo en memoria (`state.byKey`) para no repetir la petición al abrir el detalle.
  `AD.live.fetchModel` además cachea en `localStorage` con TTL corto.

La ficha se resuelve por `id` de ESPN si la tarjeta lo trae; si no, `AD.live.resolveEvent`
busca el evento del día por competición, fecha y nombres (y guarda el `id` para la próxima).

## 3. Datos que se extraen

De `header.competitions[0]`:

- estado (`pre`/`in`/`post`), período, reloj y detalle (`FT`, `HT`, `45'+2'`, etc.);
- marcador de ambos equipos.

De `boxscore.teams[].statistics` (28 métricas de equipo) se usan:

- posesión, tiros totales, tiros al arco, córners, faltas, amarillas, rojas, fueras de juego;
- pases buenos, precisión de pase, centros, entradas, intercepciones, atajadas.

De `commentary[].play` se guardan solo las jugadas útiles (`PLAY_KEEP` en `js/live.js`):

| Tipo ESPN | Uso |
|---|---|
| `goal` | gol de juego abierto: cuenta como remate y suma xG |
| `own-goal` | se conserva como evento, **no** suma xG |
| `shot-on-target`, `shot-off-target`, `shot-blocked` | remates |
| `penalty---scored`, `penalty---missed` | penales |
| `corner-awarded`, `foul`, `offside`, `substitution` | presión, eventos y lecturas |

Cada jugada guarda, si existe, `x`/`y` (posición), `x2`/`y2`, minuto (`c`), lado (`s`), jugador
(`n`), texto (`txt`), gol (`g`) y tanda (`so`). Los penales de una **tanda** (`so`) no cuentan
como goles ni xG del partido.

De `rosters` se obtiene el arquero (titular si está) y sus atajadas. Los goles recibidos se toman
del **marcador rival**, porque `goalsConceded`/`shotsFaced` de ESPN no son confiables.
De `keyEvents` salen los eventos del minuto a minuto (goles, tarjetas, cambios, VAR).
El historial entre los dos equipos se calcula con la **base local** (`AD.store.state.matches`),
no con ESPN: últimos 6 cruces, orientados al local actual.

## 4. xG estimado

ESPN no da xG por equipo. Para cada remate se estima:

```
dx = (100 - x) * 1.05            // cancha 105 m
dy = |y - 50| * 0.68             // cancha 68 m
d  = sqrt(dx² + dy²)
ang = 2 * atan2(3.66, max(0.6, d))
xg = sigmoide(0.7 - 0.15 * d) * clamp(ang / 0.65, 0.3, 1.15)
```

Ajustes:

- **penal**: 0,78 (sin fórmula);
- **cabeza** (`header`): ×0,78;
- **ángulo difícil**: ×0,6;
- **bloqueado** (`shot-blocked`): ×0,7;
- límites: 0,004 – 0,9.

Se suma por equipo y se muestra con 1 decimal en la tarjeta y 2 en el detalle. Si no hay ninguna
jugada con ubicación, se usa una estimación por tiros: **0,22 por tiro al arco** y **0,045 por
tiro restante**. El texto de la app siempre dice **"xG estimado"**.

Validación hecha con partidos reales: los penales aparecen en `x≈88,5` (punto penal), los
remates del visitante también tienen el arco en `x=100` (p. ej. remate de Freiburg en `x=96,1`),
y los goles llegan como tipo `goal` (no como `shot-on-target`). Esto último se corrigió: antes
los goles no sumaban xG.

**Remates al área**: tiros con `x >= 84` más los penales. No es "tiros dentro del área" oficial,
es una aproximación por coordenada.

**Presión (últimos 10')**: remates + córners de cada equipo con minuto `>= minuto actual - 10`.
**Intensidad**: entradas + intercepciones (se muestra en el detalle).

## 5. Modelo de probabilidades en juego

Poisson independiente sobre los goles que faltan. Con `pm.lh`/`pm.la` (goles esperados previos
del local/visitante), `minuto`, `xG` observado y rojas:

```
R      = (alargue ? 120 : 94) - minuto
played = max(1, minuto)
eh     = pm.lh * played / 94
ea     = pm.la * played / 94

mh = clamp((xgh + 0.55) / (eh + 0.55), 0.55, 1.75)
ma = clamp((xga + 0.55) / (ea + 0.55), 0.55, 1.75)
damp = min(1, played / 20)
mh = 1 + (mh - 1) * damp * 0.75
ma = 1 + (ma - 1) * damp * 0.75

adjH = 0.74^rojas_local * 1.16^rojas_visitante
adjA = 0.74^rojas_visitante * 1.16^rojas_local
// ajuste por marcador: el que va perdiendo empuja; el que gana se repliega
// ajuste extra si R <= 15

scale = min(1, ((R + 4) / 94)^0.9)
lh = pm.lh * scale * mh * adjH
la = pm.la * scale * ma * adjA

minT = clamp(0.5 + 0.32 * (R / 20), 0.5, 0.82)
si lh + la < minT: se escalan ambos hasta minT
```

Con `lh` y `la` se calculan las probabilidades de **1X2**, **próximo gol**, **más de 2,5 goles**
y **ambos marcan** (Poisson 0..8; se normaliza la masa). La variación que se muestra
(`-25`, `+29`, etc.) es la diferencia en **puntos porcentuales** contra el pronóstico previo
del partido. En **tanda de penales** no se calculan probabilidades: el 1X2 queda cerrado en
empate.

El piso de goles restantes y el exponente 0,9 evitan el problema típico de escalar linealmente:
sin ellos, un 1-1 a los 80' quedaba con 79 % de empate y un 1-3 con 99 % para el que gana. Con
la calibración actual, un partido parejo a los 80' ronda 50-55 % de empate y las ventajas de
2-3 goles quedan en 95-99 %, más cerca de lo que se ve en el mercado.

## 6. Lectura automática

Se generan hasta 3 frases cortas:

- quién genera más peligro según el xG (con umbral 0,45);
- expulsiones (cuántos y a quién);
- últimos 10 minutos (remates y córners de cada uno);
- arquero con 3+ atajadas;
- antes de empezar: cuenta regresiva y estado de alineaciones.

No se inventan narrativas: solo se describen los datos anteriores.

## 7. UI e integración

En `js/v2.js`, cada tarjeta de "Hoy" lleva:

- `data-fk` (clave del partido), `data-fkwhen` (píldora de hora/estado), `data-fktag` (tags de %);
- un contenedor `.fxl` para el bloque en vivo;
- `.fx-static-body` con el pronóstico previo, que se **oculta** cuando el partido está en vivo
  (`article.fx.has-live`) para no duplicar información;
- tras renderizar, `AD.livehoy.start(items)`.

El bloque se repinta por partes (host `.fxl`, píldora de estado y tags de probabilidad) y el clic
de **Detalle** es delegado a `document`, así no se pierden listeners al actualizar.
Cuando ESPN confirma el final, `livehoy` llama a `AD.v2.matchEnded(fk)`: la tarjeta se retira y la lista se rellena
con el siguiente partido. Los análisis guardados del usuario no se tocan.

El botón **Detalle** abre `AD.live.open(..., { tab: "analysis" })`; `js/live.js` agrega la pestaña
**"Análisis en vivo"** y usa `AD.livehoy.htmlFor(slug, id)` para el contenido. Si el partido no
está en la ventana activa (o el modelo aún no llegó), la pestaña no se agrega.

Estilos en `css/v2.css` (`.fxl*`, `.lh-*`), con estadísticas en 2 columnas en pantallas anchas,
1 columna en móvil y pie con `flex-wrap`.

## 8. Privacidad, límites y mantenimiento

- Las peticiones son anónimas y directas a ESPN; no se envía nada del usuario.
- No hay claves en el código ni en el repositorio.
- Si ESPN no responde, la tarjeta muestra "Sin datos en vivo por ahora" y reintenta; el
  pronóstico previo y el resto de la app siguen funcionando.
- El xG es una estimación por ubicación: no reemplaza un proveedor oficial. Para xG oficial haría
  falta una API con clave (Sportmonks, API-Football, football-data.org) y, en una web estática,
  un backend/proxy que la oculte.
- Los datos son efímeros: no se guardan en la base histórica ni en el manifiesto.
- Al cambiar `js/livehoy.js`, `js/live.js`, `js/v2.js` o `css/v2.css` hay que subir la versión en
  `index.html` (`?v=`) y en `sw.js` (`CACHE`) para que las instalaciones reciban el cambio.

## 9. Verificación realizada

- 18 tarjetas en vivo simultáneas con minuto, marcador, xG, estadísticas y probabilidades.
- Refresco automático a los 40 s (se verificó que `at` cambia y el minuto avanza).
- Pausa real con pestaña oculta: 86 s sin ninguna consulta; al volver, refresco en 5 s.
- Retiro por `matchEnded` y por tiempo; la lista se rellena sola.
- Modo previo inyectado con un partido real de ESPN: cuenta regresiva, alineaciones, historial.
- Penal revisado: `penalty---scored`, x≈88,5, xG 0,78; roja a los 3' reflejada.
- Goles de juego abierto (`goal`) incluidos en el xG (Monaco 3-0: 1,6 vs 2,0).
- Sin desbordes horizontales; tarjeta en vivo ≈546 px de alto en escritorio (2 columnas de
  estadísticas), contra 651 px con una sola columna.
- `node --check` en `livehoy.js`, `live.js`, `v2.js` y `sw.js`.

## 10. Archivos

| Archivo | Rol |
|---|---|
| `js/livehoy.js` | detección, cola, polling, modelo, xG, lectura, render de tarjeta y detalle |
| `js/live.js` | ficha ESPN, `fetchModel`, `resolveEvent`, jugadas, pestaña de análisis |
| `js/v2.js` | tarjetas de "Hoy", `data-*`, `livehoy.start`, `matchEnded` |
| `css/v2.css` | estilos `.fxl*` y `.lh-*` |
| `index.html` | versiones `?v=` de los scripts y del CSS |
| `sw.js` | `CACHE` del service worker |
