param(
  [string]$SourceDir = $(if ($env:EDF_SOURCE_DIR) { $env:EDF_SOURCE_DIR } else { "N:\Tomas\DASHBOARDS\REPAGO EDF" }),
  [string]$OutputPath = "data\db.json"
)

$ErrorActionPreference = "Stop"

$repaymentTargets = [ordered]@{
  "Vertical grande" = 2.5
  "Mostrador" = 1.6
  "Slim" = 1.2
  "Sahara" = 1.2
  "Doble puerta" = 3.2
  "Horizontal" = 1.9
  "3 bandejas" = 1.6
  "Baby visu" = 1.6
  "Vertical mediana" = 1.9
  "Check out" = 1.6
  "Full glass" = 2.5
  "Gondola de calidad" = 3.2
}

function Normalize-Key($value) {
  $text = ([string]$value).Trim().ToLowerInvariant()
  $text = $text.Normalize([Text.NormalizationForm]::FormD)
  $chars = $text.ToCharArray() | Where-Object { [Globalization.CharUnicodeInfo]::GetUnicodeCategory($_) -ne [Globalization.UnicodeCategory]::NonSpacingMark }
  -join $chars -replace "[^a-z0-9]+", ""
}

function Clean-Value($value) {
  $text = ([string]$value).Trim()
  $text = $text -replace "[\x00-\x1F\x7F]", ""
  return $text.Trim()
}

function Clean-Code($value) {
  $text = Clean-Value $value
  if ($text -match "^\((\d+)\)") { $text = $Matches[1] }
  $text = $text.Trim()
  if ($text -match "^\d+$") { $text = $text.TrimStart("0"); if (-not $text) { return "0" } }
  return $text
}

function Normalize-Status($value) {
  $text = ([string]$value).Trim().ToUpperInvariant()
  if ($text -match "PDV|COLOC|CLIENT") { return "PDV" }
  if ($text -match "REPAR") { return "REPARACION" }
  if ($text -match "BAJA") { return "BAJA DEFINITIVA" }
  if ($text -match "DEPOS|DEP") { return "DEPOSITO" }
  if ($text -match "STOCK|DISPON") { return "STOCK" }
  return $(if ($text) { $text } else { "STOCK" })
}

function Normalize-Deposit($value) {
  $text = ([string]$value).Trim().ToUpperInvariant()
  if ($text -match "MADRYN|PMY") { return "MADRYN" }
  if ($text -match "TRELEW|REL|TREL") { return "TRELEW" }
  if ($text -match "INTERIOR|INT") { return "INTERIOR" }
  return "INTERIOR"
}

function Get-FirstValue($row, [string[]]$keys) {
  foreach ($key in $keys) {
    if ($row.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace([string]$row[$key])) {
      return Clean-Value $row[$key]
    }
  }
  return ""
}

function Convert-UsedRangeToRows($sheet) {
  $used = $sheet.UsedRange
  $rowCount = [int]$used.Rows.Count
  $colCount = [int]$used.Columns.Count
  if ($rowCount -lt 1 -or $colCount -lt 1) { return @() }

  $headerRow = 1
  $bestScore = -1
  for ($r = 1; $r -le [Math]::Min(12, $rowCount); $r++) {
    $score = 0
    for ($c = 1; $c -le $colCount; $c++) {
      $key = Normalize-Key $used.Cells.Item($r, $c).Text
      if ($key -match "cliente|activo|serie|serial|estado|localidad|direccion|ruta|vendedor|modelo|nombre|codigo") { $score++ }
    }
    if ($score -gt $bestScore) {
      $bestScore = $score
      $headerRow = $r
    }
  }

  $headers = @()
  for ($c = 1; $c -le $colCount; $c++) {
    $header = Normalize-Key $used.Cells.Item($headerRow, $c).Text
    if (-not $header) { $header = "col$c" }
    $headers += $header
  }

  $rows = @()
  for ($r = $headerRow + 1; $r -le $rowCount; $r++) {
    $row = @{}
    $hasValue = $false
    for ($c = 1; $c -le $colCount; $c++) {
      $value = Clean-Value $used.Cells.Item($r, $c).Text
      if ($value) { $hasValue = $true }
      $row[$headers[$c - 1]] = $value
    }
    if ($hasValue) { $rows += $row }
  }
  return $rows
}

function Read-WorkbookRows($excel, $path, [string[]]$IncludeSheets = @()) {
  $workbook = $excel.Workbooks.Open($path, $null, $true)
  try {
    $allRows = @()
    foreach ($sheet in $workbook.Worksheets) {
      if ($IncludeSheets.Count -gt 0 -and $IncludeSheets -notcontains $sheet.Name) { continue }
      $rows = Convert-UsedRangeToRows $sheet
      foreach ($row in $rows) {
        $row["__sheet"] = $sheet.Name
        $allRows += $row
      }
    }
    return $allRows
  } finally {
    $workbook.Close($false)
  }
}

function Guess-Model($row) {
  $raw = Get-FirstValue $row @("modelo", "modeloequipo", "tipo", "descripcion", "descripcionequipo", "familia", "tipodeactivo")
  foreach ($model in $repaymentTargets.Keys) {
    if ($raw -and (Normalize-Key $raw).Contains((Normalize-Key $model))) { return $model }
  }
  if ($raw -match "VERT.*GRAN|VGR") { return "Vertical grande" }
  if ($raw -match "VERT.*MED|VM") { return "Vertical mediana" }
  if ($raw -match "DOBLE|2") { return "Doble puerta" }
  if ($raw -match "FULL|GLASS") { return "Full glass" }
  if ($raw -match "HORIZ") { return "Horizontal" }
  if ($raw -match "SLIM") { return "Slim" }
  if ($raw -match "MOST") { return "Mostrador" }
  return "Mostrador"
}

function Parse-Hl($value) {
  $text = ([string]$value).Trim() -replace "\.", "" -replace ",", "."
  $number = 0.0
  if ([double]::TryParse($text, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return [Math]::Round($number, 2)
  }
  return 0
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $semaforoFile = Get-ChildItem -LiteralPath $SourceDir -File | Where-Object { $_.Name -like "Sem*Activos Comerciales*xlsx" } | Select-Object -First 1
  $edfFiles = Get-ChildItem -LiteralPath $SourceDir -File | Where-Object { $_.Name -match "^edf [12]\.xlsx$" }
  $clientsFile = Get-ChildItem -LiteralPath $SourceDir -File | Where-Object { $_.Name -like "*plantillaClientesAR.xlsx" } | Select-Object -First 1
  $piFile = Get-ChildItem -LiteralPath $SourceDir -File | Where-Object { $_.Name -like "PI 2026*.xlsb" } | Select-Object -First 1

  $semaforoRows = if ($semaforoFile) { Read-WorkbookRows $excel $semaforoFile.FullName @("Page1") } else { @() }
  $edfRows = @()
  foreach ($file in $edfFiles) { $edfRows += Read-WorkbookRows $excel $file.FullName @("Browser") }
  $clientRows = if ($clientsFile) { Read-WorkbookRows $excel $clientsFile.FullName @("Clientes") } else { @() }
  $piRows = if ($piFile) { Read-WorkbookRows $excel $piFile.FullName @("Colocaciones 2026 - DISTRIS") } else { @() }
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

$assetBySerial = @{}
foreach ($row in $edfRows) {
  $serial = Get-FirstValue $row @("numerodeserie", "serie", "nroserie", "numeroserie", "serial", "nrodeserie", "ultimacolumna")
  if (-not $serial) {
    $lastKey = ($row.Keys | Where-Object { $_ -like "col*" } | Sort-Object { [int]($_ -replace "col", "") } | Select-Object -Last 1)
    if ($lastKey) { $serial = Clean-Value $row[$lastKey] }
  }
  $asset = Get-FirstValue $row @("numerodeactivo", "activo", "nroactivo", "numeroactivo", "codigoactivo", "activosap", "codactivo")
  if ($serial -and $asset -and -not $assetBySerial.ContainsKey($serial)) { $assetBySerial[$serial] = $asset }
}

$customers = @{}
foreach ($row in $clientRows) {
  $id = Clean-Code (Get-FirstValue $row @("cliente", "codcliente", "codigocliente", "numerocliente", "nrocliente", "codigo"))
  if (-not $id) { continue }
  $customers[$id] = [ordered]@{
    id = $id
    name = Get-FirstValue $row @("nombre", "razonsocial", "cliente", "nombrefantasia")
    address = Get-FirstValue $row @("direccion", "domicilio", "calle")
    city = (Get-FirstValue $row @("localidad", "ciudad", "poblacion"))
    route = Get-FirstValue $row @("ruta", "recorrido", "zona")
    seller = Get-FirstValue $row @("vendedor", "preventista", "representante")
    pi = $false
    potentialPi = $false
    annualHl = 0
    categories = @()
    brands = @()
  }
}

$piCustomerIds = New-Object System.Collections.Generic.HashSet[string]
foreach ($row in $piRows) {
  $distributorCode = Clean-Code (Get-FirstValue $row @("codigodistribuidor", "coddistribuidor", "distribuidorcodigo"))
  $distributorName = Get-FirstValue $row @("distribuidor")
  if ($distributorCode -ne "70549" -and (Normalize-Key $distributorName) -notlike "*distribuidoradelvalle*") { continue }
  $id = Clean-Code (Get-FirstValue $row @("cliente", "codcliente", "codigocliente", "numerocliente", "nrocliente", "codigo", "codcliente"))
  if ($id) { [void]$piCustomerIds.Add($id) }
}
foreach ($id in $piCustomerIds) {
  if ($customers.ContainsKey($id)) {
    $customers[$id].pi = $true
  }
}

$salesFile = Join-Path $SourceDir "venta.txt"
if (Test-Path -LiteralPath $salesFile) {
  $reader = [System.IO.File]::OpenText($salesFile)
  try {
    $headerLine = $reader.ReadLine()
    $headers = if ($headerLine) { $headerLine -split "`t|;" } else { @() }
    $headerMap = @{}
    for ($i = 0; $i -lt $headers.Length; $i++) {
      $key = Normalize-Key $headers[$i]
      if (-not $headerMap.ContainsKey($key)) { $headerMap[$key] = $i }
    }
    $lineNumber = 0
    while (($line = $reader.ReadLine()) -ne $null) {
      $lineNumber++
      $cols = $line -split "`t|;"
      $customerIndex = if ($headerMap.ContainsKey("codcliente")) { $headerMap["codcliente"] } else { 4 }
      $hlIndex = if ($headerMap.ContainsKey("cantidadestotales")) { $headerMap["cantidadestotales"] } else { 40 }
      $categoryIndex = 26
      $brandIndex = 20
      $routeIndex = if ($headerMap.ContainsKey("ruta")) { $headerMap["ruta"] } else { 8 }
      $sellerIndex = if ($headerMap.ContainsKey("descripcionvendedor")) { $headerMap["descripcionvendedor"] } else { 15 }
      $nameIndex = if ($headerMap.ContainsKey("descripcion")) { $headerMap["descripcion"] } else { 5 }
      $addressIndex = if ($headerMap.ContainsKey("domicilio")) { $headerMap["domicilio"] } else { 10 }
      $customerId = if ($cols.Length -gt $customerIndex) { Clean-Code $cols[$customerIndex] } else { "" }
      $hl = if ($cols.Length -gt $hlIndex) { Parse-Hl $cols[$hlIndex] } else { 0 }
      if ($customerId -and $customers.ContainsKey($customerId)) {
        $customers[$customerId].annualHl = [Math]::Round(([double]$customers[$customerId].annualHl + $hl), 2)
        if (-not $customers[$customerId].route -and $cols.Length -gt $routeIndex) { $customers[$customerId].route = Clean-Value $cols[$routeIndex] }
        if (-not $customers[$customerId].seller -and $cols.Length -gt $sellerIndex) { $customers[$customerId].seller = Clean-Value $cols[$sellerIndex] }
        if ($cols.Length -gt $categoryIndex) {
          $cat = (Clean-Value $cols[$categoryIndex]).ToLowerInvariant()
          if ($cat -and -not $customers[$customerId].categories.Contains($cat)) { $customers[$customerId].categories += $cat }
        }
        if ($cols.Length -gt $brandIndex) {
          $brand = Clean-Value $cols[$brandIndex]
          if ($brand -and -not $customers[$customerId].brands.Contains($brand)) { $customers[$customerId].brands += $brand }
        }
      }
      if ($customerId -and -not $customers.ContainsKey($customerId)) {
        $customers[$customerId] = [ordered]@{
          id = $customerId
          name = $(if ($cols.Length -gt $nameIndex) { Clean-Value $cols[$nameIndex] } else { "" })
          address = $(if ($cols.Length -gt $addressIndex) { Clean-Value $cols[$addressIndex] } else { "" })
          city = ""
          route = $(if ($cols.Length -gt $routeIndex) { Clean-Value $cols[$routeIndex] } else { "" })
          seller = $(if ($cols.Length -gt $sellerIndex) { Clean-Value $cols[$sellerIndex] } else { "" })
          pi = $piCustomerIds.Contains($customerId)
          potentialPi = $false
          annualHl = $hl
          categories = @($(if ($cols.Length -gt $categoryIndex) { (Clean-Value $cols[$categoryIndex]).ToLowerInvariant() } else { "" }) | Where-Object { $_ })
          brands = @($(if ($cols.Length -gt $brandIndex) { Clean-Value $cols[$brandIndex] } else { "" }) | Where-Object { $_ })
        }
      }
    }
  } finally {
    $reader.Close()
  }
}

$edfs = @()
$seen = New-Object System.Collections.Generic.HashSet[string]
foreach ($row in $semaforoRows) {
  $serial = Get-FirstValue $row @("nroserie", "numerodeserie", "serie", "numeroserie", "serial", "nrodeserie")
  $asset = Get-FirstValue $row @("nrodeactivo", "nroactivo", "numeroactivo", "codigoactivo", "activosap", "codactivo", "activo")
  if (-not $asset -and $serial -and $assetBySerial.ContainsKey($serial)) { $asset = $assetBySerial[$serial] }
  if (-not $serial -and -not $asset) { continue }
  $key = if ($serial) { $serial } else { $asset }
  if ($seen.Contains($key)) { continue }
  [void]$seen.Add($key)

  $customerId = Clean-Code (Get-FirstValue $row @("codcliente", "cliente", "codigocliente", "numerocliente", "nrocliente", "codigo"))
  if ($customerId -eq "0") { $customerId = "" }
  if ($customerId -and -not $customers.ContainsKey($customerId)) {
    $customers[$customerId] = [ordered]@{
      id = $customerId
      name = Get-FirstValue $row @("nombre", "razonsocial", "cliente")
      address = Get-FirstValue $row @("direccion", "domicilio")
      city = Get-FirstValue $row @("localidad", "ciudad")
      route = Get-FirstValue $row @("ruta")
      seller = Get-FirstValue $row @("vendedor", "preventista")
      pi = $piCustomerIds.Contains($customerId)
      potentialPi = $false
      annualHl = 0
      categories = @()
      brands = @()
    }
  }

  $location = Get-FirstValue $row @("ubicacion", "origen", "descdeposito", "relaciondeposucursal")
  $status = if ($customerId) { "PDV" } else { Normalize-Status $location }
  if ($status -notin @("STOCK", "PDV", "DEPOSITO", "REPARACION", "BAJA DEFINITIVA")) {
    $status = if ($customerId) { "PDV" } else { "STOCK" }
  }

  $edfs += [ordered]@{
    id = "edf_$($edfs.Count + 1)"
    asset = $asset
    serial = $serial
    model = Guess-Model $row
    status = $status
    deposit = Normalize-Deposit (Get-FirstValue $row @("deposito", "localidad", "ubicacion", "centro"))
    customerId = $(if ($customerId) { $customerId } else { $null })
    source = "REPAGO EDF"
  }
}

foreach ($customer in $customers.Values) {
  if (-not $customer.pi -and [double]$customer.annualHl -ge 1.2) {
    $customer.potentialPi = $true
  }
}

$db = [ordered]@{
  users = @(
    [ordered]@{ id = "u_admin"; name = "Operador EDF"; role = "admin" }
  )
  customers = @($customers.Values | Sort-Object id)
  edfs = $edfs
  recipients = @(
    [ordered]@{ city = "TRELEW"; recipients = "operaciones.trelew@empresa.com; ventas.trelew@empresa.com" },
    [ordered]@{ city = "MADRYN"; recipients = "operaciones.madryn@empresa.com" },
    [ordered]@{ city = "INTERIOR"; recipients = "logistica.interior@empresa.com" }
  )
  movements = @()
  audit = @(
    [ordered]@{
      id = [guid]::NewGuid().ToString()
      action = "IMPORTAR_REPAGO_EDF"
      user = "Sistema"
      at = (Get-Date).ToUniversalTime().ToString("o")
      changes = [ordered]@{
        sourceDir = $SourceDir
        edfs = $edfs.Count
        customers = $customers.Count
        semaforoRows = $semaforoRows.Count
        edfRows = $edfRows.Count
        piRows = $piRows.Count
      }
    }
  )
  piEvents = @()
}

$dir = Split-Path -Parent $OutputPath
if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$db | ConvertTo-Json -Depth 12 | Set-Content -Path $OutputPath -Encoding UTF8
Write-Output "Importado: EDF=$($edfs.Count) Clientes=$($customers.Count) PI=$($piCustomerIds.Count)"
