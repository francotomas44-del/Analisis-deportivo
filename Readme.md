# ⚽ Futbolityx

## 1. Descripción del proyecto

**Futbolityx** es un proyecto orientado al desarrollo de un sistema integral de análisis futbolístico, diseñado para estudiar partidos, evaluar el rendimiento de los equipos y estimar posibles escenarios mediante el procesamiento de datos estadísticos, información contextual, acontecimientos recientes y variables de incertidumbre.

El sistema tendrá como objetivo analizar cualquier partido de fútbol para generar resultados fundamentados, cuantificables y verificables, diferenciando entre datos conocidos, estimaciones estadísticas y acontecimientos que no pueden predecirse con certeza.

La finalidad no será únicamente pronosticar al ganador, sino construir un modelo capaz de evaluar múltiples factores relevantes para comprender y anticipar el desarrollo de un encuentro.

## 2. Objetivo principal

Desarrollar un sistema de análisis futbolístico que recopile, procese y relacione información relevante para producir predicciones y estimaciones sobre partidos de fútbol.

El sistema deberá:

- Identificar los factores que influyen en el rendimiento de cada equipo.
- Analizar estadísticas históricas y tendencias recientes.
- Incorporar información de última hora antes del comienzo del partido.
- Evaluar variables tácticas, físicas, ambientales y contextuales.
- Considerar la incertidumbre, los acontecimientos aleatorios y los escenarios excepcionales.
- Estimar resultados y eventos específicos mediante modelos estadísticos.
- Asignar niveles de confianza y probabilidades a las predicciones.
- Registrar los resultados reales para evaluar y mejorar continuamente la precisión del sistema.

## 3. Factores de análisis

### 3.1. Estadísticas históricas

- Victorias, empates y derrotas.
- Goles a favor y en contra.
- Promedio de goles por partido.
- Goles esperados (xG) y goles esperados concedidos (xGA).
- Remates totales y remates al arco.
- Efectividad ofensiva y defensiva.
- Posesión del balón.
- Córners.
- Faltas y tarjetas amarillas y rojas.
- Rendimiento como local y visitante.
- Resultados frente a rivales de características similares.
- Enfrentamientos directos, considerando su antigüedad y relevancia.

### 3.2. Rendimiento reciente

- Últimos partidos disputados.
- Evolución del rendimiento ofensivo y defensivo.
- Regularidad y variabilidad de los resultados.
- Calidad de los rivales enfrentados.
- Carga de partidos y días de descanso.
- Tendencias positivas o negativas.
- Diferencias entre el rendimiento reciente y el rendimiento histórico.

El sistema deberá evitar interpretar una racha corta como una garantía de rendimiento futuro.

### 3.3. Variables tácticas

- Formación inicial y sistema de juego.
- Estilo de presión.
- Bloque defensivo y altura de la línea defensiva.
- Transiciones ofensivas y defensivas.
- Vulnerabilidad ante contraataques.
- Fortalezas y debilidades por bandas y zonas centrales.
- Balón parado.
- Compatibilidad táctica entre ambos equipos.
- Cambios de entrenador y modificaciones en el planteamiento.

### 3.4. Jugadores y disponibilidad

- Alineaciones confirmadas o probables.
- Lesiones y suspensiones.
- Jugadores que regresan a la competición.
- Importancia de las bajas para el funcionamiento colectivo.
- Estado físico y minutos acumulados.
- Participación de suplentes y profundidad del plantel.
- Impacto de los cambios durante el partido.

La ausencia de un jugador deberá evaluarse según su importancia real para el equipo, no únicamente por su reputación.

### 3.5. Información de última hora

El sistema deberá actualizar su análisis con información disponible antes del comienzo del encuentro:

- Alineaciones oficiales.
- Lesiones durante el calentamiento.
- Cambios de último momento.
- Condiciones meteorológicas.
- Estado del campo de juego.
- Noticias relevantes de los clubes.
- Declaraciones oficiales que aporten información verificable.
- Cambios de sede u horario.
- Variaciones relevantes en las cuotas de mercado, cuando se disponga de datos fiables.

Cada dato deberá incluir, cuando sea posible, su fuente, fecha y hora de publicación, y hora de consulta.

### 3.6. Factores externos y aleatorios

El fútbol presenta acontecimientos cuyo momento exacto y resultado no pueden conocerse de antemano.

El análisis contemplará:

- Expulsiones.
- Penales.
- Desvíos y goles en contra.
- Errores individuales.
- Lesiones durante el encuentro.
- Decisiones arbitrales.
- Variabilidad en la definición.
- Condiciones climáticas cambiantes.
- Eventos inesperados que alteren el planteamiento táctico.

Estos factores deberán modelarse mediante escenarios, distribuciones de probabilidad o simulaciones, en lugar de asignarles certezas artificiales.

## 4. Resultados que deberá generar el sistema

El sistema deberá permitir analizar, según la disponibilidad y calidad de los datos:

| Categoría | Resultado esperado |
|---|---|
| Resultado final | Probabilidad de victoria local, empate y victoria visitante |
| Marcador | Marcadores exactos más probables |
| Goles | Goles esperados por equipo y total esperado |
| Más/menos goles | Probabilidades para diferentes líneas de goles |
| Ambos marcan | Probabilidad de que ambos equipos anoten |
| Primer gol | Probabilidad de que cada equipo marque primero |
| Córners | Estimación de córners totales y por equipo |
| Tarjetas | Estimación de tarjetas totales y por equipo |
| Remates | Estimaciones de remates y remates al arco |
| Primer tiempo | Resultados y eventos probables durante la primera mitad |
| Evolución del partido | Escenarios de desarrollo según el marcador y los acontecimientos |
| Confianza | Grado de incertidumbre de cada estimación |

La disponibilidad de cada predicción dependerá de los datos existentes y de la capacidad de validación del modelo.

## 5. Clasificación de los resultados

Cada resultado generado deberá clasificarse en una de estas categorías:

**A. Datos exactos conocidos**

Información histórica u oficial que puede verificarse directamente, como el resultado de un partido finalizado, una alineación confirmada o las estadísticas publicadas por una fuente fiable.

**B. Estimaciones cuantitativas**

Valores calculados mediante modelos, como goles esperados, cantidad probable de córners o distribución de tarjetas.

**C. Predicciones probabilísticas**

Probabilidades asignadas a resultados futuros, como la victoria de un equipo o la posibilidad de que ambos marquen.

**D. Escenarios condicionales**

Proyecciones que dependen de acontecimientos específicos, como una expulsión temprana, un gol inicial o la ausencia de un jugador importante.

El sistema no deberá presentar una predicción como si fuera un hecho confirmado.

## 6. Metodología de análisis

El procesamiento de cada partido seguirá un flujo de trabajo estructurado:

1. **Identificación:** determinar equipos, competición, fecha, sede y horario.
2. **Recopilación:** obtener estadísticas, antecedentes, noticias y datos contextuales.
3. **Validación:** verificar la calidad, actualidad, consistencia y procedencia de la información.
4. **Normalización:** unificar formatos, períodos, métricas y criterios de comparación.
5. **Análisis individual:** evaluar por separado el rendimiento de cada equipo.
6. **Análisis comparativo:** identificar ventajas, debilidades y enfrentamientos tácticos relevantes.
7. **Modelado estadístico:** estimar goles, resultados y otros eventos mediante métodos apropiados.
8. **Evaluación contextual:** incorporar alineaciones, bajas, descanso y acontecimientos recientes.
9. **Simulación:** generar escenarios alternativos (Monte Carlo) y proyectar secuencias con una cadena de Markov sobre la racha del equipo, midiendo la variabilidad de los resultados.
10. **Informe final:** presentar predicciones, probabilidades, fundamentos y limitaciones.
11. **Evaluación posterior:** comparar las estimaciones con el resultado real y registrar los errores.

## 7. Arquitectura prevista

El proyecto podrá desarrollarse progresivamente mediante los siguientes módulos:

- **Data Collector:** recopilación de estadísticas, resultados, noticias y datos en tiempo real.
- **Data Validator:** control de calidad, integridad y consistencia de los datos.
- **Team Analyzer:** análisis individual y comparativo de los equipos.
- **Context Engine:** evaluación de alineaciones, bajas, calendario y factores externos.
- **Statistical Engine:** cálculo de métricas y estimaciones estadísticas.
- **Prediction Engine:** generación de probabilidades y escenarios.
- **Simulation Engine:** simulación de posibles desarrollos del partido.
- **Markov Engine:** modelo de secuencia (cadena de Markov) sobre la racha del equipo (victoria/empate/derrota) y su proyección del próximo resultado.
- **News Engine (Contexto):** análisis fundamental — últimas noticias del partido y de cada equipo desde la API pública de ESPN (en español), con enlace de búsqueda en Google News; se incluye en el informe.
- **Cards Engine (tarjetas):** base de tarjetas amarillas y rojas (y córners) por partido y equipo, construida desde el detalle público de ESPN (`scripts/build-cards.ps1` → `data/cards/`); el análisis estima amarillas y rojas por separado y la pestaña Equipos muestra el promedio por partido.
- **Live Engine (alineaciones):** al abrir un partido se piden a ESPN sus alineaciones, estadísticas por jugador, minuto a minuto y estadísticas de equipo (`js/live.js`); se cachean con TTL corto y se refrescan solas mientras el partido está en juego.
- **Data Updater (base al día):** la base histórica se importa una sola vez; al abrir, la app compara el manifiesto con lo ya guardado y descarga **solo lo nuevo** (una competición o temporada agregada después), sin duplicar ni borrar (`AD.dataset.sync`, registro `futbolityx:base:files`). También manual en **Datos → Buscar datos nuevos**.
- **Confidence Engine:** evaluación de incertidumbre y fiabilidad de las predicciones.
- **Reporting Engine:** generación de informes comprensibles y estructurados.
- **Evaluation Engine:** seguimiento del rendimiento histórico de los modelos y detección de errores.

Los módulos deberán diseñarse para poder actualizarse y mejorarse de manera independiente.

## 8. Fuentes y calidad de los datos

Se priorizarán fuentes oficiales y proveedores de datos deportivos fiables.

Cada fuente deberá evaluarse según:

- Precisión.
- Frecuencia de actualización.
- Cobertura de competiciones.
- Disponibilidad histórica.
- Consistencia entre proveedores.
- Acceso mediante API o mecanismos autorizados.
- Coste y condiciones de uso.

Los datos incompletos, contradictorios o desactualizados deberán identificarse explícitamente. Cuando un dato crítico no esté disponible, el sistema deberá reducir la confianza de las estimaciones o abstenerse de producir determinadas predicciones.

No se inventarán estadísticas, alineaciones, noticias ni resultados.

## 9. Validación y mejora continua

El rendimiento del sistema deberá medirse con partidos cuyo resultado ya se conozca, manteniendo una separación temporal entre los datos utilizados para construir el modelo y los empleados para evaluarlo.

Se utilizarán métricas adecuadas para cada tipo de predicción, entre ellas:

- **Brier Score:** evaluación de la calidad de las probabilidades.
- **Log Loss:** penalización de probabilidades asignadas incorrectamente.
- **Calibración:** comparación entre probabilidades estimadas y frecuencias observadas.
- **MAE:** error absoluto medio para estimaciones numéricas.
- **RMSE:** evaluación de errores numéricos con mayor penalización de desviaciones grandes.
- **Comparación con referencias:** evaluación frente a modelos sencillos y probabilidades de mercado, cuando estén disponibles.

Se evitará utilizar información que todavía no existía al momento de realizar cada predicción. Esto permitirá reducir el sesgo retrospectivo y obtener una evaluación más realista.

El sistema deberá registrar sus predicciones antes del partido y conservarlas sin modificaciones para su posterior auditoría.

## 10. Principios fundamentales

1. **Evidencia antes que intuición:** toda conclusión deberá apoyarse en datos o hipótesis explícitas.
2. **Probabilidad antes que certeza:** los resultados futuros se expresarán mediante probabilidades.
3. **Actualidad:** la información reciente podrá modificar el análisis cuando sea relevante y verificable.
4. **Transparencia:** cada predicción deberá explicar sus principales fundamentos.
5. **Trazabilidad:** se conservarán fuentes, marcas temporales, versiones de modelos y resultados.
6. **Control de sesgos:** se evitará seleccionar únicamente estadísticas que confirmen una hipótesis.
7. **Mejora continua:** los modelos deberán evaluarse y actualizarse a partir de resultados reales.
8. **Honestidad estadística:** si la información no permite una estimación fiable, el sistema deberá reconocerlo.
9. **Reproducibilidad:** un análisis histórico deberá poder reconstruirse con los datos disponibles en ese momento.

## 11. Alcance y limitaciones

El objetivo es maximizar la precisión, consistencia y utilidad de las estimaciones, no prometer predicciones infalibles.

Un resultado exacto de fútbol no puede garantizarse de manera sistemática. Incluso un modelo bien calibrado puede fallar en partidos individuales debido a la incertidumbre inherente al deporte.

El sistema deberá distinguir entre acertar un resultado particular y demostrar que un modelo tiene capacidad predictiva a lo largo de una muestra amplia de partidos.

## 12. Hoja de ruta

### Fase 1 — Fundamentos
- Definir las competiciones y los mercados de análisis.
- Seleccionar las primeras fuentes de datos.
- Establecer el formato de entrada y salida.
- Diseñar el registro histórico de partidos y predicciones.

### Fase 2 — Modelo estadístico inicial
- Implementar estadísticas de rendimiento.
- Construir un modelo probabilístico de goles.
- Calcular probabilidades de victoria, empate y derrota.
- Generar los primeros informes de partidos.

### Fase 3 — Contexto y actualidad
- Incorporar alineaciones, lesiones y suspensiones.
- Añadir variables tácticas, calendario y descanso.
- Implementar controles de actualidad y calidad de los datos.

### Fase 4 — Modelos avanzados
- Incorporar modelos específicos para córners, tarjetas y remates.
- Implementar simulaciones de escenarios.
- Combinar modelos estadísticos y contextuales.

### Fase 5 — Validación y optimización
- Automatizar las evaluaciones históricas.
- Medir calibración y errores.
- Comparar diferentes modelos.
- Optimizar el rendimiento sin comprometer la validez estadística.

### Fase 6 — Automatización
- Automatizar la recopilación de datos.
- Actualizar análisis antes del partido.
- Generar informes automáticamente.
- Implementar seguimiento histórico y alertas de última hora.

## 13. Criterio de éxito

El proyecto se considerará exitoso cuando pueda producir análisis reproducibles, utilizar información verificable, generar estimaciones probabilísticas bien calibradas y demostrar su rendimiento mediante evaluaciones históricas rigurosas.

La prioridad será construir un sistema confiable y medible antes de aumentar su complejidad.

**Objetivo final:** desarrollar una herramienta integral de inteligencia futbolística que combine estadística, contexto, modelado probabilístico y simulación para ofrecer la evaluación más rigurosa posible de cada partido analizado.

## 14. Licencia, datos y avisos legales

- **Código:** licencia **MIT** (ver [`LICENSE`](LICENSE)).
- **Datos históricos:** la base combina **openfootball** (dedicada al **dominio
  público**: Mundiales, copas, primeras divisiones y competiciones extra de África,
  MLS, CONCACAF, Sudamérica y Asia) con la API pública de **ESPN** (Liga Profesional
  Argentina 2001 y 2003–2026, historia previa y temporada en curso de otras 21
  divisiones). Atribución y detalle de todas las fuentes en
  [`docs/atribuciones.md`](docs/atribuciones.md).
- **Naturaleza:** herramienta **informativa y estadística**. Sus salidas son
  **estimaciones probabilísticas**, no hechos ni garantías.
- **Sin apuestas:** no es un servicio de apuestas, no procesa pagos ni muestra
  cuotas, y no ofrece consejos de apuestas. Si se usa con fines de apuestas, es
  responsabilidad del usuario (debe ser legal en su país y ser mayor de 18 años).
- **Privacidad:** no recolecta datos personales; todo se guarda en el navegador.
- **Marcas:** los nombres de equipos y competiciones se usan de forma nominativa;
  no se usan escudos ni logos oficiales ni se implica afiliación alguna.

> El aviso completo también está dentro de la app, en la pestaña **Acerca de → Aviso legal y privacidad**.

