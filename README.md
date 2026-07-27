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

## Importar datos

Desde la app usar el boton de importacion. El backend ejecuta:

1. `scripts/export-edf-sheets.ps1`
2. `scripts/import-edf-data.mjs`

Los datos generados quedan en `data/`, carpeta excluida de Git porque contiene informacion comercial.

## Notas para Streamlit

Esta version esta construida con frontend React/JS vanilla y backend Node.js. Para publicarla en Streamlit hay que portar la interfaz y la logica a Python/Streamlit o dejar este repo como base de referencia y crear una app Streamlit separada.

## Footer

by QpiU
