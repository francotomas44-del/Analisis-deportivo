# Cadena de Markov (racha del equipo)

Además de la simulación de **Monte Carlo**, el sistema incorpora una **cadena de Markov** que modela la
*secuencia de resultados* de cada equipo. No reemplaza al modelo de goles: es una **lectura complementaria**
que se muestra en el análisis y se compara con Monte Carlo.

## Modelo

Para cada equipo se construye su secuencia cronológica de resultados, **desde la perspectiva del equipo**:

- **V** (victoria), **E** (empate), **D** (derrota).

El **estado** de la cadena es el resultado del partido anterior. La **matriz de transición** 3×3 se estima
contando, en todo el historial disponible, con qué frecuencia un resultado es seguido por otro:

```
        → V     → E     → D
desde V p(V|V) p(E|V) p(D|V)
desde E p(V|E) p(E|E) p(D|E)
desde D p(V|D) p(E|D) p(D|D)
```

Detalles de la estimación (en `js/stats.js`, funciones `markovTeam` y `markovForm`):

- **Suavizado de Laplace** (k = 1 por transición) para que ninguna fila tenga probabilidad cero.
- Con **pocas transiciones**, la fila se mezcla hacia la **frecuencia histórica** del equipo
  (factor `n / (n + 4)`), evitando extremos con muestras chicas.
- Si se activa el **énfasis en la forma reciente** (mismo control que usa el modelo de goles), las
  transiciones más recientes reciben más peso (decaimiento exponencial).
- Se calcula además la **distribución estacionaria** (largo plazo) por iteración de potencias, que se
  muestra como "tendencia" del equipo.

Con el **último estado** de cada equipo se obtiene la distribución de su **próximo resultado**.

## Combinación local + visitante

Las dos cadenas se combinan normalizando el producto de sus proyecciones:

- el local gana si su cadena marca **V** y la del visitante marca **D**;
- empate si **ambas** marcan **E**;
- el visitante gana si el local marca **D** y el visitante **V**.

El resultado se normaliza para obtener una probabilidad **1X2**.

## Dónde se ve

- **Pestaña Analizar:** panel *"Cadena de Markov (racha del equipo)"* con la secuencia reciente, la matriz
  de transición, la proyección del próximo resultado y el 1X2 combinado de cada equipo.
- **Pestaña Analizar — Comparación:** tabla *"Monte Carlo vs Markov"* con el modelo de goles, Monte Carlo y
  Markov, más la diferencia en puntos porcentuales (`Markov − Monte Carlo`).
- **Informe exportable:** sección *"5. Cadena de Markov"*, con las secuencias, la proyección y la
  diferencia frente a Monte Carlo.

## Limitaciones

- Es un modelo de **secuencia**, no de fuerzas de ataque/defensa: no usa goles esperados ni la calidad del
  rival, salvo a través de la cadena del otro equipo.
- Necesita **historial suficiente** por equipo. Con pocos resultados el panel lo advierte y la proyección
  es poco fiable (se mezcla hacia la frecuencia del equipo).
- **No está calibrada con el backtesting** (a diferencia del modelo de goles y de Elo): se ofrece como
  contraste, no como el motor principal.
