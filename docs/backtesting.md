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
   - `stats.expectedGoals` (fuerzas de ataque/defensa + localía, suavizado `k = 5`),
   - la matriz de Poisson truncada a 0..10 goles,
   - las probabilidades 1X2.
4. Se compara con el resultado real y se acumulan las métricas.

El backtesting usa **acumuladores incrementales** por equipo, matemáticamente equivalentes a
`stats.teamStats` sobre el prefijo de partidos (verificado a precisión de máquina). Así el recorrido es
**O(n)** en vez de O(n²) y todo el dataset (~49.000 partidos) se procesa en unos pocos segundos.

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

## Resultados de referencia (dataset incluido, openfootball)

Corrida completa (todas las competiciones, historial mínimo 5, sin ponderación por recencia):

| Métrica | Modelo | Referencia (climatología) |
| --- | --- | --- |
| Partidos evaluados | 45.849 de 49.193 | — |
| Aciertos 1X2 | **50,8 %** | 44,4 % (siempre local) |
| Brier | **0,600** | 0,647 |
| Log Loss | **1,006** | 1,069 |
| MAE goles totales | 1,35 | — |

## Límites (honestidad estadística)

- El modelo **supera** a la referencia ingenua, pero está **ligeramente sobreconfiado**: en el tramo alto de
  confianza la frecuencia real de acierto es algo menor que la probabilidad anunciada.
- En torneos de sede neutral (p. ej. Mundiales) el modelo sigue aplicando ventaja de localía al equipo
  nominalmente "local", por lo que **sobreestima las victorias locales**.
- Los datos de openfootball no distinguen sede neutral, y las variantes de nombre de equipo entre
  competiciones no se unifican; ambas cosas afectan a los números.
- El desempeño agregado no garantiza ningún partido individual.
