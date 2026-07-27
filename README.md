# EDF Control Dashboard

Dashboard operativo para control de EDF, stock, comodatos, repago, PI y seguimiento comercial.

## Requisitos

- Node.js 18 o superior
- Archivos fuente en la carpeta configurada por los scripts de importacion

## Ejecutar local

```bash
npm start
```

Por defecto el servidor usa el puerto `5173`. Tambien se puede indicar un puerto:

```bash
node server.mjs 5193
```

## Carpeta fuente

Por defecto la app toma los archivos desde:

```text
N:\tomas\DASHBOARDS\REPAGO EDF
```

Tambien se puede cambiar sin tocar codigo usando la variable `EDF_SOURCE_DIR`:

```powershell
$env:EDF_SOURCE_DIR = "N:\tomas\DASHBOARDS\REPAGO EDF"
node server.mjs 5193
```

En esa misma carpeta deben estar el semaforo, PI, clientes, EDF y los archivos de venta. El importador lee `venta.txt` como base y cualquier archivo `venta*.txt` adicional como venta diaria/reemplazo, priorizando el mas nuevo por periodo.

## Importar datos

Desde la app usar el boton de importacion. El backend ejecuta:

1. `scripts/export-edf-sheets.ps1`
2. `scripts/import-edf-data.mjs`

Los datos generados quedan en `data/`, carpeta excluida de Git porque contiene informacion comercial.

## Notas para Streamlit

Esta version esta construida con frontend React/JS vanilla y backend Node.js. Para publicarla en Streamlit hay que portar la interfaz y la logica a Python/Streamlit o dejar este repo como base de referencia y crear una app Streamlit separada.

## Footer

by QpiU
