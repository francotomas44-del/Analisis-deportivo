# Contexto — análisis fundamental (noticias)

La pestaña **Analizar** incluye, además de las probabilidades, una sección de **análisis
fundamental** llamada **"Contexto"**: las últimas noticias relacionadas con el partido y con
cada equipo (mínimo 2 por equipo cuando la fuente las tiene), con **título + pequeño detalle +
fuente + fecha + enlace**.

## De dónde salen las noticias

- **Fuente: ESPN** (API pública `site.api.espn.com` / `site.web.api.espn.com`). Es gratis, no
  pide clave y **habilita CORS**, así que se puede consultar directamente desde el navegador.
  Se piden en **español** (`region=ar`, `lang=es`), que es como las publica ESPN Deportes.
- Se combinan dos consultas:
  1. **Por equipo:** `search/v2?query=<equipo>` → titulares, fecha, enlace y, cuando está, el
     pie de foto como detalle.
  2. **General del fútbol:** `soccer/all/news` → notas con **descripción** (el "pequeño
     detalle") y **etiquetas de equipo**, que permiten filtrar por local y visitante.
- El módulo (`js/news.js`) cruza ambas, quita duplicados por enlace, ordena por fecha y arma
  tres bloques: **Partido**, **Local** y **Visitante**.

## Por qué no se lee Google directamente

Google News **no permite consultas desde el navegador** (bloqueo CORS: el sitio no manda las
cabeceras que el navegador exige para leer la respuesta desde otro dominio). Tampoco hay
backend en este proyecto (es 100 % estático). Por eso, en cada bloque se ofrece un botón
**"Buscar en Google News →"** que abre la búsqueda ya armada (equipo o cruce) en una pestaña
nueva. Así se usa Google sin depender de un intermediario.

> Se probaron varios *proxies* CORS públicos para leer el RSS de Google News; los disponibles
> hoy exigen clave, están caídos o limitan el uso. No se usan para no depender de terceros
> frágiles.

## Caché y comportamiento

- Las consultas se cachean en memoria y en `localStorage` (`ad_news_cache_v1`): general ~20 min,
  por equipo ~60 min. El botón **"Actualizar noticias"** fuerza una consulta nueva.
- Si no hay internet o la fuente falla, el bloque muestra un aviso y el enlace a Google; **nunca
  se inventan noticias**.
- El módulo se completa **después** de mostrar el análisis (el panel aparece con
  "Cargando noticias…"). Para que las noticias queden en el **informe exportable**, guardá la
  predicción **después** de que carguen (quedan dentro de la predicción). El informe incluye la
  sección **"5. CONTEXTO (análisis fundamental)"**.

## Límites

- Es una **lectura cualitativa** complementaria, no entra en las probabilidades ni en el motor
  (goles/Elo/Monte Carlo/Markov).
- La cobertura depende de ESPN: los equipos muy chicos pueden no tener notas recientes.
- El idioma y la disponibilidad pueden variar según la región del usuario.
