# Atribuciones y licencias de datos

Este documento detalla el **origen**, la **licencia** y las **atribuciones** de los
datos que usa Futbolityx, para que su uso (personal o público) sea trazable y
respetuoso de las condiciones de cada fuente.

> Regla del proyecto: **no inventar datos**. Cada dato debe poder rastrearse hasta
> una fuente y, cuando corresponde, citar su licencia.

---

## 1. Base histórica incluida en la app (`data/`)

### openfootball — dominio público

- **Fuente:** `https://github.com/openfootball` (repositorios `football.json`,
  `worldcup`, `euro` y las ligas por país).
  Descarga reproducida por `scripts/build-dataset.ps1`.
- **Contenido:** resultados de Copas del Mundo (1930–2026), Eurocopas,
  UEFA Champions League, copas nacionales y primeras divisiones de varias ligas
  (temporadas 2010-11 a 2026-27).
- **Licencia:** dominio público. Cita textual del repositorio
  `openfootball/football.json`:
  > *"The football.json schema, data and scripts are dedicated to the public
  > domain. Use as you please with no restrictions whatsoever."*
- **Atribución requerida:** ninguna. Aun así, acreditamos la fuente por
  transparencia: **Datos históricos: openfootball (dominio público).**

Los nombres de equipos, competiciones y ligas son **hechos** y se usan de forma
**nominativa**. Esta app **no** incluye ni muestra escudos, crestas o logos
oficiales de clubes, ligas o federaciones, y no implica afiliación ni respaldo
alguno.

## 2. Fuentes opcionales (importación manual)

Futbolityx **no** llama a estas fuentes automáticamente ni incluye sus claves:
solo permite que el usuario importe datos que ya posee o descarga, respetando los
términos de cada proveedor.

| Fuente | Licencia / condiciones | Nota |
|---|---|---|
| **TheSportsDB** | Términos del sitio; la *key* `3` es **solo para pruebas** | No usar en producción sin clave propia |
| **OpenLigaDB** | Uso libre (*fair use*) | Fútbol alemán |
| **football-data.co.uk** | Uso personal; no redistribuir comercialmente | CSV manual |
| **football-data.org / API-Football / The Odds API / etc.** | Requieren *API key* y aceptar sus términos | Claves quedan visibles en el navegador → usar proxy |

Es responsabilidad de quien importa datos **respetar las condiciones de uso** de
cada fuente (límites de peticiones, atribución, prohibición de uso comercial, etc.).

## 3. Código del proyecto

El código de Futbolityx se distribuye bajo **licencia MIT** (ver [`LICENSE`](../LICENSE)).
No cubre los datos de terceros listados arriba.

---

*Documento informativo; no constituye asesoramiento legal.*
