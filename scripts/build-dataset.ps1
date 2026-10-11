# scripts/build-dataset.ps1
# Descarga la base historica de openfootball (datos libres y de dominio publico:
# https://github.com/openfootball) a data/openfootball y genera data/manifest.json.
#
# Fuentes (openfootball, licencia de dominio publico / CC0):
#   - football.json   -> divisiones top (.1), copas nacionales (.cup) y UEFA Champions League
#   - worldcup.json   -> todas las Copas del Mundo (1930..2026)
#   - euro.json       -> Eurocopa UEFA
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\build-dataset.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-dataset.ps1 -MaxFiles 5   (prueba)

param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$MaxFiles = 0
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

$outDir = Join-Path $Root "data\openfootball"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$rawBase = "https://raw.githubusercontent.com/"
$apiBase = "https://api.github.com/repos/"

function Get-Tree([string]$repo) {
  $url = $apiBase + $repo + "/git/trees/master?recursive=1"
  $r = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "analisis-deportivo" }
  return $r.tree | Where-Object { $_.type -eq "blob" }
}

$selected = New-Object System.Collections.Generic.List[object]

# football.json: divisiones top (.1), copas (.cup) y UEFA Champions League
$fb = Get-Tree "openfootball/football.json"
foreach ($f in $fb) {
  $parts = $f.path -split "/"
  if ($parts.Count -ne 2) { continue }
  $file = $parts[1]
  if (($file -match '^[a-z]{2,3}\.(1|cup)\.json$') -or ($file -eq "uefa.cl.json")) {
    $code = $file -replace '\.json$', ''
    $selected.Add([pscustomobject]@{ path = $f.path; code = $code; url = ($rawBase + "openfootball/football.json/master/" + $f.path) })
  }
}

# worldcup.json: todas las ediciones
$wc = Get-Tree "openfootball/worldcup.json"
foreach ($f in $wc) {
  if ($f.path -match '^\d{4}/worldcup\.json$') {
    $selected.Add([pscustomobject]@{ path = ("worldcup/" + $f.path); code = "worldcup"; url = ($rawBase + "openfootball/worldcup.json/master/" + $f.path) })
  }
}

# euro.json
$eu = Get-Tree "openfootball/euro.json"
foreach ($f in $eu) {
  if ($f.path -match '^\d{4}/euro\.json$') {
    $selected.Add([pscustomobject]@{ path = ("euro/" + $f.path); code = "euro"; url = ($rawBase + "openfootball/euro.json/master/" + $f.path) })
  }
}

Write-Host ("Archivos seleccionados: " + $selected.Count)

$list = $selected
if ($MaxFiles -gt 0) { $list = $selected | Select-Object -First $MaxFiles }

$ok = 0; $fail = 0
foreach ($it in $list) {
  $dest = Join-Path $outDir ($it.path -replace '/', '\')
  $dir = Split-Path -Parent $dest
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  try {
    Invoke-WebRequest -Uri $it.url -OutFile $dest -UseBasicParsing
    $ok++
  } catch {
    $fail++
    Write-Host ("FALLO: " + $it.path + " -> " + $_.Exception.Message)
  }
}

# manifest (solo entradas presentes en disco)
$manifest = @()
foreach ($it in $selected) {
  $dest = Join-Path $outDir ($it.path -replace '/', '\')
  if (Test-Path $dest) {
    $manifest += [pscustomobject]@{ path = $it.path; code = $it.code; source = "openfootball" }
  }
}
$manifestPath = Join-Path $Root "data\manifest.json"
$json = ConvertTo-Json -InputObject $manifest -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))

$totalBytes = 0
Get-ChildItem -Path $outDir -Recurse -File | ForEach-Object { $totalBytes += $_.Length }
Write-Host ("Descargados OK: " + $ok + "  Fallos: " + $fail)
Write-Host ("Manifest: " + $manifestPath + "  (" + $manifest.Count + " entradas)")
Write-Host ("Tamano total: " + [math]::Round($totalBytes / 1MB, 2) + " MB")
