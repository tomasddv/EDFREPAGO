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

Por defecto la app toma los archivos desde la carpeta local o unidad sincronizada:

```text
N:\tomas\DASHBOARDS\REPAGO EDF
```

Tambien se puede cambiar sin tocar codigo usando la variable `EDF_SOURCE_DIR`:

```powershell
$env:EDF_SOURCE_DIR = "N:\tomas\DASHBOARDS\REPAGO EDF"
node server.mjs 5193
```

En esa misma carpeta deben estar el semaforo, PI, clientes, EDF y los archivos de venta. El importador lee `venta.txt` como base y cualquier archivo `venta*.txt` adicional como venta diaria/reemplazo, priorizando el mas nuevo por periodo.

## Fuente Google Drive

Si el dash debe alimentarse directo desde Google Drive, configurar:

```powershell
python -m pip install -r requirements.txt
$env:GOOGLE_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1cukgXLUaPsEDK_yD7tSwgaBFZAbiDUot"
$env:EDF_SOURCE_DIR = "data\drive-source"
node server.mjs 5193
```

Con `GOOGLE_DRIVE_FOLDER_URL` activo, el boton **Importar** primero sincroniza la carpeta de Drive en `EDF_SOURCE_DIR` y despues procesa los archivos.

Archivos esperados en la carpeta:

- venta anual hasta mayo
- venta junio
- venta diaria acumulada de julio
- semaforo actualizado
- plantilla de clientes
- PI
- rutas/promotores si se usa como soporte comercial

## Importar datos

Desde la app usar el boton de importacion. El backend ejecuta:

1. `scripts/export-edf-sheets.ps1`
2. `scripts/import-edf-data.mjs`

Los datos generados quedan en `data/`, carpeta excluida de Git porque contiene informacion comercial.

## Notas para Streamlit

El repo incluye `streamlit_app.py` para que Streamlit Cloud pueda arrancar la aplicacion. Esta version inicial sincroniza Drive y muestra la base si existe `data/db.json`.

La app Node sigue siendo la version operativa completa. El port Streamlit completo requiere migrar el importador de Excel/TXT a Python para no depender de Excel/PowerShell en la nube.

## Footer

by QpiU
