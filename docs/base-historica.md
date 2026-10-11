# Base histórica integrada

El sistema ya **no requiere importar datos a mano**: viene con una base de resultados
históricos reales, descargada de fuentes libres y confiables, lista para analizar.

## Fuente

- **[openfootball](https://github.com/openfootball)** — datos **libres / de dominio público**
  (licencia CC0), sin API key, en JSON estático. Se descargan y quedan **locales** en
  `data/openfootball/`, por lo que la app **no consulta internet en tiempo de uso**.

## Cobertura (206 archivos · ~14 MB)

- **Selecciones nacionales**
  - **Copa Mundial FIFA** — todas las ediciones (1930 → 2026).
  - **Eurocopa UEFA** — ediciones disponibles (2020, 2024, 2028).
- **Clubes (internacional)**
  - **UEFA Champions League** (10 temporadas).
- **Ligas nacionales — primera división (2010-11 → 2026-27, según disponibilidad)**
  - Inglaterra, España, Alemania, Italia, Francia, Países Bajos, Portugal, Austria,
    Bélgica, Suiza, Grecia, Turquía, Escocia, Rusia, México, Argentina, Brasil,
    Chequia, Hungría, China, Japón, Australia, Colombia, Argelia, Egipto y Marruecos.
- **Copas nacionales** — Austria y Alemania (DFB-Pokal).

Resultado típico de la carga: **~1.070 equipos/selecciones**, **~31 competiciones** y
**~49.000 partidos** (cada conjunto es un dato real; nada está inventado).

## Cómo se carga

1. **Automático:** la **primera vez** que abrís la app con la base vacía, se cargan los
   archivos solos (verás una barra de progreso).
2. **Manual:** botón **«Cargar base histórica»** en la barra superior o en la pestaña
   **Inicio**. Reemplaza los datos actuales (pide confirmación).
3. Una vez cargada, se guarda **en el navegador (IndexedDB)** y persiste entre sesiones.

> Usá siempre `http://localhost:8766/` (ver `docs/persistencia.md`). El almacenamiento del
> navegador depende del **origen**: `file://`, `localhost` y `127.0.0.1` guardan por separado.

## Cómo regenerar / actualizar la base

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-dataset.ps1
```

El script consulta la API de GitHub, descarga los archivos de openfootball a
`data/openfootball/` y (re)genera `data/manifest.json`, que es lo que lee la app
(`js/dataset.js`). Es reproducible: la fuente queda identificada en cada paso.

## Límites (honestidad estadística)

- Las ligas domésticas llegan hasta **2010-11**; no hay divisiones inferiores ni
  temporadas anteriores de clubes en esta fuente.
- **No** hay alineaciones, árbitros ni cuotas en esta base (eso requeriría otras fuentes:
  ver `docs/apis-datos.md`).
- Los nombres de equipos provienen de openfootball y **pueden variar entre competiciones**
  (p. ej. un club con dos grafías). El sistema los trata como registros distintos; no
  se fusionan automáticamente.
- Los datos son de **resultados** (marcadores), no de eventos minuto a minuto.
