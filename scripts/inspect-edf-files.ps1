param(
  [string]$SourceDir = $(if ($env:EDF_SOURCE_DIR) { $env:EDF_SOURCE_DIR } else { "N:\Tomas\DASHBOARDS\REPAGO EDF" }),
  [string]$OutputPath = "data\inspect-output.json"
)

$ErrorActionPreference = "Stop"

function Convert-CellValue($value) {
  if ($null -eq $value) { return "" }
  return [string]$value
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $files = Get-ChildItem -LiteralPath $SourceDir -File |
    Where-Object { $_.Name -notlike "~$*" -and ($_.Extension -in ".xlsx", ".xlsb", ".xls") }

  $result = @()
  foreach ($file in $files) {
    $workbook = $excel.Workbooks.Open($file.FullName, $null, $true)
    try {
      $sheets = @()
      foreach ($sheet in $workbook.Worksheets) {
        $used = $sheet.UsedRange
        $rows = [Math]::Min([int]$used.Rows.Count, 6)
        $cols = [Math]::Min([int]$used.Columns.Count, 40)
        $preview = @()
        for ($r = 1; $r -le $rows; $r++) {
          $line = @()
          for ($c = 1; $c -le $cols; $c++) {
            $line += Convert-CellValue $used.Cells.Item($r, $c).Text
          }
          $preview += ,$line
        }
        $sheets += [pscustomobject]@{
          name = $sheet.Name
          rows = [int]$used.Rows.Count
          cols = [int]$used.Columns.Count
          preview = $preview
        }
      }
      $result += [pscustomobject]@{
        file = $file.Name
        sheets = $sheets
      }
    } finally {
      $workbook.Close($false)
    }
  }
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

$dir = Split-Path -Parent $OutputPath
if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$result | ConvertTo-Json -Depth 8 | Set-Content -Path $OutputPath -Encoding UTF8
Write-Output $OutputPath
