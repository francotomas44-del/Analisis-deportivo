# Backtesting del modelo

La pestaña **Backtesting** mide el desempeño del motor del sistema sobre partidos **ya jugados**, de forma
honesta: para cada partido se calcula la predicción usando **únicamente la información anterior a su fecha**
(*walk-forward*, sin *look-ahead*). Es el mismo motor que usa el Análisis, no una versión "de prueba".

## Metodología

1. Se filtran los partidos (competición, rango de fechas) y se ordenan cronológicamente.
2. Se recorre el historial en orden. Antes de predecir cada partido, los acumuladores de cada equipo
   contienen **sólo** sus partidos con fecha **estrictamente anterior** (los partidos del mismo día no se
   usan entre sí).
3. Con ese estado se calcula el modelo exacto de la app:
   - `stats.expectedGoals` (fuerzas de ataque/defensa + localía, suavizado configurable),
   - la matriz de Poisson truncada a 0..10 goles (con corrección Dixon-Coles opcional),
   - las probabilidades 1X2 (con escalado por temperatura opcional).
4. Se compara con el resultado real y se acumulan las métricas.

El backtesting usa **acumuladores incrementales** por equipo, matemáticamente equivalentes a
`stats.teamStats` sobre el prefijo de partidos (verificado a precisión de máquina). Así el recorrido es
**O(n)** en vez de O(n²) y todo el dataset (≈158.200 partidos) se procesa en unos pocos segundos.

## Opciones

| Opción | Descripción |
| --- | --- |
| Competición | Filtra por una competición concreta o "Todas". |
| Desde / Hasta | Rango de fechas a evaluar (opcional). |
| Historial mínimo por equipo | Se descarta el partido si alguno de los dos equipos tiene menos partidos previos (por defecto 5). Evita evaluar con datos insuficientes. |
| Peso de partidos recientes | 0% = todos los partidos pesan igual; >0% da más peso a los recientes (decaimiento exponencial, igual que en el Análisis). |
| Máximo de partidos a evaluar | 0 = todos. Si es > 0, evalúa los últimos N (con toda su historia previa). |
| Detener | Corta el cálculo y muestra resultados parciales. |

## Métricas

- **Aciertos 1X2**: porcentaje de partidos en los que el resultado más probable coincide con el real.
- **Brier** (multiclase, 1X2): suma de `(p − resultado)²`. Menor es mejor. Rango 0..2.
- **Log Loss** (1X2): `−ln(p del resultado real)`. Menor es mejor.
- **MAE / RMSE de goles totales**: error medio del total de goles esperado frente al real.
- **Calibración**: agrupa por la probabilidad del resultado más probable y compara la *probabilidad media*
  con la *frecuencia observada de acierto*. Bien calibrado ⇒ ambos valores se acercan.
- **Referencia — climatología del período**: acierto de "siempre gana el local" y Brier/Log Loss de predecir
  las frecuencias base del período. Sirve para saber si el modelo aporta algo frente a una predicción ingenua.

## Comparar dos equipos

El panel **"Comparar dos equipos"** usa el mismo recorrido walk-forward y permite enfrentar a **cualquier par de
equipos de la base** (más de mil). Con los filtros activos en el panel de arriba (competición, fechas, historial
mínimo, recencia):

- **Tabla comparativa por equipo**: partidos evaluados de cada uno, aciertos 1X2, Brier, Log Loss, MAE de goles
  totales, goles a favor/en contra *esperados → reales* y desglose local/visitante.
- **Historial directo**: enfrentamientos entre ambos registrados en la muestra, victorias/empates de cada lado,
  y cómo le fue al modelo en esos partidos (aciertos y Brier), con una muestra de hasta 12 cruces.

Nota honesta: los números de cada equipo dependen de los filtros (p. ej. en "Todas" las competiciones se mezclan
ligas y torneos), y como los nombres de un mismo equipo varían entre competiciones (p. ej. *Real Madrid*,
*Real Madrid CF*, *Real Madrid (ESP)*) cada variante cuenta como un equipo distinto. Eso puede fragmentar el
historial de un club real.

## Parámetros del modelo y calibración

El motor tiene varios parámetros, todos **calibrados con este mismo backtesting** (no elegidos a ojo):

| Parámetro | Valor por defecto | Qué controla |
| --- | --- | --- |
| `smoothing` (k) | **12** | Suavizado hacia la media. Mayor = menos extremo (más regularizado). |
| `temperature` | **1,06** | Aplana las probabilidades 1X2 para corregir sobreconfianza. |
| `rho` (Dixon-Coles) | **−0,03** | Correlación en marcadores bajos (más empates 0-0/1-1, menos 1-0/0-1). |
| `elo.weight` | **0,55** | Peso del rating Elo en el ensamble del 1X2 (0 = sólo modelo de goles). |
| `elo.K` | **25** | Factor de actualización del Elo. |
| `elo.hfa` | **70** | Ventaja de localía en puntos Elo. |
| `elo.nu` | **0,7** | Parámetro de empates del modelo Davidson. |

Están en `AD.stats.config` y se pueden variar desde la consola del navegador para experimentar.

### Cómo se eligieron

1. Se recolectó, en una pasada walk-forward, los goles esperados de cada partido y su resultado real.
2. Se evaluó por grilla cada combinación de parámetros (Brier, Log Loss, aciertos).
3. **Validación:** la mejora se comprobó por separado en dos mitades temporales, para descartar sobreajuste.

Hallazgos:

- El **suavizado `k`** es el factor más importante: pasar de k=5 a k=12 mejora Brier, Log Loss y aciertos.
- La **temperatura** aporta un poco más (corrige la sobreconfianza).
- **Dixon-Coles** apenas cambia las métricas (los empates ya estaban bien calibrados: 24,5 % predicho vs 25,0 % real).
- La **localía** se probó de varias formas (ajuste global y por competición); ninguna sube los aciertos de
  forma clara y el ajuste por competición quedó apagado por defecto (ver los experimentos medidos más abajo).
- **Ponderar por recencia** (más peso a partidos recientes) **empeora** el resultado: conviene usar todo el historial.

### Ensamble con Elo (adoptado, oct 2026)

El modelo de goles usa **sólo los goles** de cada partido. Para subir los aciertos se probó un **segundo
modelo** independiente: un **rating Elo** walk-forward (resultado 1/0,5/0, `K=25`, ventaja de localía
`hfa=70`), convertido a 1X2 con el modelo **Davidson** (que admite empates, `nu=0,7`). La probabilidad final
1X2 es la **mezcla** `(1−w)·goles + w·Elo`, con `w=0,55`.

Medido (walk-forward completo y por mitades):

| Corrida | Aciertos solo-goles → ensamble | Brier → | Log Loss → |
| --- | --- | --- | --- |
| Completa (45.849) | 51,03 → **51,83 %** | 0,5977 → **0,5932** | 1,0006 → **0,9944** |
| 1ª mitad (22.467) | 51,64 → **52,26 %** | 0,5945 → **0,5912** | 0,9957 → **0,9916** |
| 2ª mitad (22.239) | 50,51 → **51,16 %** | 0,6019 → **0,5976** | 1,0068 → **1,0008** |

El ensamble mejora **a la vez** aciertos y calibración, y supera a cada modelo por separado (Elo solo:
51,64 % / 0,5975 / 1,0011). La ganancia se sostiene en ambas mitades, así que se adoptó por defecto. En el
Análisis el 1X2 se ensambla igual; los demás mercados (goles, marcadores, córners, tarjetas) siguen
derivándose del modelo de goles.

Comprobación previa: el modelo de goles está **casi perfectamente calibrado por clase** (media
local/empate/visita = 0,441/0,250/0,309 frente a 0,444/0,250/0,306 reales) y "empujar" el empate **no** sube
los aciertos (β=1 → 51,03 %; cualquier β>1 lo baja). Es decir: predecir pocos empates es correcto, y para
acertar más había que mejorar las probabilidades, no la regla de decisión.

## Resultados de referencia (dataset incluido, openfootball)

Corrida completa (todas las competiciones, historial mínimo 5, sin ponderación por recencia):

| Métrica | Modelo actual (goles + Elo) | Modelo solo goles | Referencia (climatología) |
| --- | --- | --- | --- |
| Partidos evaluados | 45.849 de 49.193 | 45.849 | — |
| Aciertos 1X2 | **51,8 %** | 51,0 % | 44,4 % (siempre local) |
| Brier | **0,593** | 0,598 | 0,647 |
| Log Loss | **0,994** | 1,001 | 1,069 |
| MAE goles totales | 1,33 | 1,33 | — |

La mejora se sostiene en **ambas mitades temporales** (p. ej. el ensamble da 52,26 % y Brier 0,5912 en la
primera mitad, y 51,16 % y Brier 0,5976 en la segunda). La magnitud es modesta y honesta: no "inventa"
precisión, sólo reduce el error de forma medible. El MAE de goles no cambia porque el ensamble ajusta el
1X2, no la distribución de goles (que sigue siendo Poisson).

## Experimentos medidos y no adoptados (oct 2026)

Con el objetivo de **subir la tasa de aciertos** se exploraron varias mejoras. El **ensamble con Elo** (sección
anterior) sí funciona y **se adoptó**; las **dos** de abajo no suben los aciertos, así que **quedaron apagadas
para el backtesting** (flag `compHomeAdv` en `false` en `AD.stats.config`). La **unificación de nombres**
(`unifyTeams`) **sí se activó por defecto** en la app por **calidad de datos** —evita que un mismo club quede
partido en varias fichas y que el usuario elija la equivocada—, aunque su efecto medido en las métricas del
backtesting sea neutro/levemente negativo.

### 1) Unificar nombres de equipos

Cada variante de nombre de un mismo club (p. ej. *Real Madrid*, *Real Madrid CF*, *Real Madrid (ESP)*) se
guarda con su propio id y fragmenta su historial: 24.478 de 49.193 partidos (49,8 %) involucran al menos una
variante. Se implementó `store.canonicalName` / `store.canonicalMap` / `store.unifyTeams` y la opción
`unifyTeams` del backtesting (remapea los ids en memoria, sin tocar los datos persistidos).

- Se auditaron los **91 grupos** de fusión: todos son el mismo club, sin falsos positivos.
- Con los tokens genéricos ampliados (`CA`, `CR`, `SC`, `SE`, `CD`, `SV`, …) la base deduplica **194 grupos /
  263 equipos**: el mismo club con/sin código de país, con/sin sigla, y nombres contaminados con goleadores
  (`"Meidericher (Metzger 83…)"`). La única coincidencia entre países es **AS Monaco (FRA/MCO)**, el mismo club.
- Con más historia por club se evalúan 245 partidos adicionales (menos descartes por historial mínimo).
- Pero el remapeo **no mejora las métricas**: al mezclar competiciones en la fuerza del club (p. ej. forma en
  Champions vs doméstica) empeora un poco incluso sobre el **mismo conjunto evaluado** (`minHistory=0`):

| minHistory=0 (49.193) | Aciertos | Brier | Log Loss |
| --- | --- | --- | --- |
| Datos actuales | **50,70 %** | **0,5998** | **1,0036** |
| Con unificación | 50,48 % | 0,6015 | 1,0061 |

La fragmentación no era la causa del error, y unificar sin re-calibrar `smoothing`/`temperature` —que se
habían ajustado sobre el dato fragmentado— penaliza. Por eso no se adoptó por defecto.

### 2) Localía por competición

La ventaja de localía global (+13 p.p. de victorias locales) no aplica igual a todas las competiciones:
Brasileirão +22,4 p.p., LaLiga +17,5, Bundesliga austríaca +9,4, Eurocopa ≈ 0 (sede neutral) y DFB-Pokal
**−30 p.p.** (el "local" habitualmente es el débil). Se implementó un promedio por competición contraído
hacia la media global (shrink `k=30`): `stats.competitionBaseline` + opción `compHomeAdv` del backtesting.
El Análisis tiene ahora un selector "Competición (opcional)" que sólo modifica la localía cuando el flag
está activo.

Medido (walk-forward completo y por mitades):

| Corrida | Aciertos base→localía×comp | Brier base→localía×comp | Log Loss base→localía×comp | MAE base→localía×comp |
| --- | --- | --- | --- | --- |
| Completa (45.849) | 51,03 → 51,01 % | 0,5977 → **0,5972** | 1,0006 → **0,9999** | 1,334 → **1,330** |
| 1ª mitad (22.467) | 51,64 → 51,64 % | 0,5945 → **0,5942** | 0,9957 → **0,9953** | 1,337 → **1,334** |
| 2ª mitad (22.239) | 50,51 → 50,44 % | 0,6019 → **0,6012** | 1,0068 → **1,0056** | 1,334 → **1,327** |

Mejora la **calibración** (Brier, Log Loss, MAE) de forma consistente en ambas mitades, pero **no sube los
aciertos 1X2**, que era el objetivo buscado. Quedó apagada por defecto (flag `compHomeAdv`), documentada y
lista para activarse si se prefiere priorizar calibración sobre aciertos exactos.

## Límites (honestidad estadística)

- El modelo **supera** a la referencia ingenua y quedó mejor calibrado tras el ajuste, aunque en el tramo alto
  de confianza la frecuencia real de acierto sigue algo por debajo de la probabilidad anunciada.
- En torneos de sede neutral (p. ej. Mundiales) el modelo sigue aplicando ventaja de localía al equipo
  nominalmente "local", por lo que **sobreestima las victorias locales**.
- Los datos de openfootball no distinguen sede neutral, y las variantes de nombre de equipo entre
  competiciones no se unifican; ambas cosas afectan a los números (los dos experimentos se midieron y no
  se adoptaron, ver la sección anterior).
- El desempeño agregado no garantiza ningún partido individual.
- La calibración se hizo sobre el mismo dataset incluido; con datos nuevos (otras ligas, otras fechas) los
  valores óptimos podrían cambiar. Conviene re-ejecutar el backtesting al ampliar la base.
