# Trading algorítmico — notas de investigación

> Notas de estudio (no es asesoramiento financiero). Punto de partida para retomar la
> investigación sobre **patrones de entrada / "gatillos"** en XAU/USD, BTC/USD y EUR/USD.
> Última sesión de trabajo: (pendiente de fecha). Estado: **investigación abierta**.

## 1. Qué es el trading algorítmico

Usar programas para generar y ejecutar órdenes de forma automática, siguiendo reglas definidas.

Componentes típicos:

- **Datos**: históricos (OHLCV, tick, order book) y en tiempo real vía APIs o feeds.
- **Señal / estrategia**:
  - Tendencia: cruces de medias, breakout de canales, MACD.
  - Mean reversion: Z-score, pares, bandas de Bollinger.
  - Momentum, market making, arbitraje, stat-arb.
- **Gestión de riesgo**: tamaño de posición (Kelly, volatilidad objetivo), stop-loss, límites de
  exposición y drawdown.
- **Backtesting**: validar con datos históricos evitando *look-ahead bias*, *survivorship bias* y
  costos (comisiones, slippage).
- **Ejecución**: broker/exchange, órdenes, latencia, manejo de errores.
- **Infraestructura**: Python (pandas, numpy, backtrader, vectorbt, ccxt), C++/Rust para baja
  latencia, TimescaleDB/ClickHouse, monitoreo.

Trampas frecuentes: sobreajuste al backtest, ignorar costos/liquidez, no validar con
**out-of-sample / walk-forward**.

Puente con este proyecto: comparte mucho con las apuestas deportivas — modelos de probabilidad,
detección de *value bets* (probabilidad estimada vs. cuota), gestión de bankroll y backtesting.

## 2. Pregunta central

**Estadísticamente, ¿cuál es el patrón de entrada ("gatillo") más común en los activos más
conocidos: XAU/USD, BTC/USD, EUR/USD?**

Respuesta honesta: **no existe un gatillo universal** que funcione igual en los tres. Lo que sí
existe es un conjunto pequeño de patrones con respaldo estadístico, frente a mucho folclore de
foros.

## 3. Patrones con respaldo estadístico

### 3.1 Momentum / breakout (el más robusto y replicado)

- *Time-series momentum* (Moskowitz, Ooi & Pedersen, 2012): si el activo subió en los últimos N
  días, tiende a seguir subiendo; funciona en futuros, FX, metales y cripto.
- Gatillo operativo: **breakout del rango previo** (Donchian de N días, máximo/mínimo de los
  últimos 20 días, máximos semanales). Probablemente el patrón de entrada **más probado** en los
  tres activos.

### 3.2 Opening Range Breakout (ORB) — el gatillo intradía más estudiado

- Origen: Crabel, *Day Trading with Short Term Price Patterns and ORB* (1990). Marcar el rango de
  los primeros X minutos tras la apertura de la sesión relevante y entrar al romperse.
- Es el patrón que **mejor se adapta a los tres activos a la vez** (todos tienen aperturas con
  volumen anómalo):
  - **EUR/USD**: apertura de Londres (~07:00–08:00 GMT) y el *overlap* Londres–Nueva York
    (~13:00–16:00 GMT). El breakout del **rango asiático** en la apertura de Londres es el más
    citado en FX.
  - **XAU/USD**: apertura de COMEX/NY y los fixes de Londres (10:30 y 15:00). Volatilidad intradía
    muy concentrada en la sesión americana.
  - **BTC/USD**: es 24/7 pero con patrones diurnos claros; volumen/volatilidad se concentran
    alrededor de la apertura de EE.UU. y hay efecto de fin de semana.

### 3.3 Compresión de volatilidad → expansión

- Baja volatilidad es *predecible negativamente*: tras compresión (Bollinger estrecho, ATR bajo,
  patrón NR7 de Crabel) hay mayor probabilidad de expansión direccional.
- Gatillo combinado —**"rango estrecho + ruptura de ese rango"**— es el que aparece con más
  consistencia en los tres activos, por encima de cualquier figura de chartismo.

### 3.4 Mean reversion de corto plazo (contra-ejemplo, fuerte en FX)

- Intradía, EUR/USD tiene tendencia débil y liquidez enorme → **predomina la reversión**: tocar
  extremos del rango / desviaciones Z-score sobre VWAP tienden a revertir (Lehmann 1990; Nagel
  2012).
- Es lo contrario al breakout. Resolución = **régimen**:
  - Mercado en rango → reversión en los extremos.
  - Mercado en tendencia / tras noticia → breakout.
  - El filtro de régimen importa más que el patrón en sí.

### 3.5 Reacción a niveles (muy monitoreado, edge pequeño)

- Máximo/mínimo del día previo, máximo/mínimo semanal, números redondos (xx00, xx50).
- Útil más como **filtro / gestión** que como gatillo puro.

## 4. Resumen por activo

| Activo | Gatillo intradía más común | Horizonte multi-día |
| --- | --- | --- |
| **EUR/USD** | Breakout rango asiático en apertura Londres; reversión a extremos en sesión NY | Tendencia muy débil → reversión |
| **XAU/USD** | ORB de apertura NY + reacción a noticias (CPI, NFP, FOMC) | Momentum/breakout decente |
| **BTC/USD** | Breakout tras compresión + ruptura de máximos/mínimos previos (24/7) | Momentum el más fuerte de los tres |

## 5. Magnitudes y advertencias

- Los efectos suelen ser **pequeños** (unos pocos pips/bps hasta decenas). Tras comisiones, spread y
  slippage, muchas señales quedan planas o negativas.
- El **chartismo clásico** (hombro-cabeza-hombro, triángulos, dobles suelos) tiene respaldo
  estadístico débil: en backtests rigurosos aporta poco sobre el azar.
- La mayor parte del "edge" reportado se evapora por: sobreajuste, sesgo de supervivencia,
  look-ahead bias y elegir parámetros después de ver los datos. Única validación honesta:
  **walk-forward / out-of-sample**.

## 6. Conclusión preliminar (hipótesis a testear)

> Gatillo más defendible para los tres activos a la vez:
> **Ruptura del rango de la apertura de la sesión de mayor volumen, condicionada a que ese rango sea
> estrecho (baja volatilidad previa), con filtro de régimen y entrada sobre cierre del nivel.**
> Complementado con **reversión en extremos** cuando el régimen es de rango.

## 7. Próximos pasos (retomar acá)

1. **Medirlo de verdad** con un backtest en Python que compare sobre datos históricos reales de
   XAU/USD, BTC/USD y EUR/USD el edge de cada gatillo:
   - ORB (apertura de sesión)
   - Donchian / breakout de rango previo
   - Squeeze (compresión → expansión)
   - Reversión a extremos / Z-score
   Con costos realistas y validación out-of-sample. Métricas: win rate, expectancy, Sharpe, max
   drawdown.
2. Explicar en detalle operativo algún patrón concreto.
3. Conectar con el proyecto de análisis deportivo (valor esperado, Kelly, backtesting).

## 8. Datos / herramientas a definir

- ¿Datos históricos o API disponibles? Opciones: MetaTrader, ccxt (cripto), Alpha Vantage,
  Dukascopy, Yahoo Finance.
- Definir timeframes (M1/M5 para intradía, D1 para momentum) y período histórico.

## Referencias

- Moskowitz, Ooi & Pedersen (2012) — *Time Series Momentum*.
- Crabel (1990) — *Day Trading with Short Term Price Patterns and Opening Range Breakout*.
- Jegadeesh & Titman (1993) — momentum.
- Lehmann (1990) / Nagel (2012) — short-term reversal.
- Breedon & Ranaldo (2013) — intraday patterns in FX returns and order flow.
