# Dónde se guardan tus datos (persistencia)

La app guarda todo **en tu navegador**. No hay servidor ni nube: tus equipos,
partidos, árbitros y predicciones quedan en el almacenamiento local del navegador.

## Cómo se guarda

Se usa **doble almacenamiento**, con marca de tiempo en cada guardado:

| Almacén | Para qué | Límite aproximado |
|---|---|---|
| **IndexedDB** | Historial grande (miles de partidos) | Cientos de MB |
| **localStorage** | Respaldo, funciona incluso donde IndexedDB está bloqueado | ~5 MB |

Al abrir la app se elige la copia **más reciente** de las dos, así no se pierde
nada por diferencias entre almacenes.

Además, la app **vuelca los datos pendientes** al cerrar/ocultar la pestaña, y los
importadores guardan **inmediatamente** al terminar. Arriba a la derecha verás
`Guardado ✓ hh:mm:ss` cuando se escribió.

## Por qué a veces "desaparecen": el ORIGEN

El navegador guarda los datos **por origen**. Son orígenes **distintos** (y por lo
tanto almacenamientos distintos):

- `file:///C:/Analisis Deportivo/index.html` (abrir el archivo directamente)
- `http://localhost:8765/`
- `http://localhost:8766/`

Si cargás datos en un origen y después abrís la app desde otro, **no aparecen**
(no se borraron: están en el otro origen).

### Solución: usá siempre la misma dirección

Ejecutá **`iniciar-servidor.bat`** (doble clic). Levanta un servidor local en el
**puerto fijo 8766** y abre `http://localhost:8766/`. Usá siempre esa URL.

> Abrir el archivo directamente (`file://`) es lo menos confiable: muchos navegadores
> bloquean IndexedDB en ese modo. La app te avisa con un cartel si lo detecta.

## Copia de seguridad (a prueba de todo)

En la pestaña **Fuentes → Copia de seguridad y guardado**:

- **Descargar copia (JSON):** guarda todo el contenido en un archivo.
- **Restaurar copia:** carga ese archivo y reemplaza los datos actuales.

Recomendación: descargá una copia después de importar mucho historial. Si cambiás
de navegador, de PC o limpiás los datos del navegador, restaurás la copia y listo.

## Si borraste datos por error

- Se pueden recuperar desde una **copia JSON** previa (Restaurar copia).
- Sin copia previa, los datos borrados no se pueden reconstruir; hay que volver a
  importarlos con los conectores de la pestaña **Importar**.
