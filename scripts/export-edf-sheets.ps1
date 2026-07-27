param(
  [string]$SourceDir = $(if ($env:EDF_SOURCE_DIR) { $env:EDF_SOURCE_DIR } else { "N:\Tomas\DASHBOARDS\REPAGO EDF" }),
  [string]$OutDir = "data\staging"
)

$ErrorActionPreference = "Stop"
$xlUnicodeText = 42

function Export-Sheet($excel, $filePath, $sheetName, $outPath) {
  $workbook = $excel.Workbooks.Open($filePath, $null, $true)
  try {
    $sheet = $workbook.Worksheets.Item($sheetName)
    $sheet.Activate() | Out-Null
    $resolvedOut = (Resolve-Path -LiteralPath (Split-Path -Parent $outPath)).Path + "\" + (Split-Path -Leaf $outPath)
    if (Test-Path -LiteralPath $resolvedOut) { Remove-Item -LiteralPath $resolvedOut -Force }
    $workbook.SaveAs($resolvedOut, $xlUnicodeText)
  } finally {
    $workbook.Close($false)
  }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$semaforoFile = Get-ChildItem -LiteralPath $SourceDir -File | Where-Object { $_.Name -like "Sem*Activos Comerciales*xlsx" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$clientesFile = Get-ChildItem -LiteralPath $SourceDir -File | Where-Object { $_.Name -like "*plantillaClientesAR.xlsx" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$piFile = Get-ChildItem -LiteralPath $SourceDir -File | Where-Object { $_.Name -like "PI 2026*.xlsb" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  Export-Sheet $excel $semaforoFile.FullName "Page1" (Join-Path $OutDir "semaforo.tsv")
  Export-Sheet $excel (Join-Path $SourceDir "edf 1.xlsx") "Browser" (Join-Path $OutDir "edf1.tsv")
  Export-Sheet $excel (Join-Path $SourceDir "edf 2.xlsx") "Browser" (Join-Path $OutDir "edf2.tsv")
  Export-Sheet $excel $clientesFile.FullName "Clientes" (Join-Path $OutDir "clientes.tsv")
  Export-Sheet $excel $piFile.FullName "CZA" (Join-Path $OutDir "pi-cza.tsv")
  Export-Sheet $excel $piFile.FullName "UNG" (Join-Path $OutDir "pi-ung.tsv")
  Export-Sheet $excel $piFile.FullName "RB" (Join-Path $OutDir "pi-rb.tsv")
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

Write-Output "Exportadas hojas a $OutDir"
