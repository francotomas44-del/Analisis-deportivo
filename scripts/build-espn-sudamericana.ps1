param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$FromYear = 2005,
  [int]$ToYear = (Get-Date).Year,
  [string]$CacheDir = (Join-Path $env:TEMP "espn-cache-futbolityx")
)

# CONMEBOL Sudamericana (source = "espn-sudamericana").
#
# openfootball no publica la Sudamericana, asi que se baja de la API publica de
# ESPN (slug "conmebol.sudamericana"), temporadas $FromYear..$ToYear. Solo
# partidos TERMINADOS (STATUS_FULL_TIME).
#
# Los nombres de equipo se mapean al nombre EXACTO de la base con un indice
# AMPLIADO (openfootball + arg-espn + openfootball-extra: la Sudamericana la
# juegan clubes que viven en las ligas sudamericanas de openfootball-extra).
# El mapeo fino de esta copa vive en scripts/espn-sudamericana-team-map.json
# (alias especificos de la Sudamericana). A diferencia de build-espn-history.ps1,
# NO se descarta nada: si un equipo no se reconoce se conserva el nombre de ESPN
# (se agrega como equipo nuevo). La app vuelve a unificar variantes al cargar
# (store.unifyTeams / canonicalName).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\build-espn-sudamericana.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-espn-sudamericana.ps1 -FromYear 2015

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

. (Join-Path $PSScriptRoot "espn-common.ps1")

$slug = "conmebol.sudamericana"
$code = "conmebol.sudamericana"
$name = "CONMEBOL Sudamericana"
$source = "espn-sudamericana"

$outDir = Join-Path $Root ("data\" + $source)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$manPath = Join-Path $Root "data\manifest.json"
$manifest = Get-Content $manPath -Raw -Encoding UTF8 | ConvertFrom-Json
$alias = Read-TeamAlias (Join-Path $PSScriptRoot "espn-team-alias.json")
$map = Read-TeamAlias (Join-Path $PSScriptRoot "espn-sudamericana-team-map.json")
foreach ($k in $map.Keys) { $alias[$k] = $map[$k] }
$utf8 = New-Object System.Text.UTF8Encoding($false)

Write-Host "Indice de la base (openfootball + arg-espn + openfootball-extra)..."
$Index = New-BaseIndex $Root $manifest @("openfootball", "arg-espn", "openfootball-extra")

$rows = New-Object System.Collections.Generic.List[object]
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$newTeams = New-Object 'System.Collections.Generic.HashSet[string]'
$events = 0; $dropped = 0

foreach ($yr in ($FromYear..$ToYear)) {
  $ev = Get-EspnEvents $slug $yr $CacheDir
  if ($null -eq $ev) { Write-Host ("{0}  SIN RESPUESTA" -f $yr); continue }
  $yadd = 0
  foreach ($e in $ev) {
    $st = ""
    if ($e.status -and $e.status.type) { $st = [string]$e.status.type.name }
    if ($st -ne "STATUS_FULL_TIME") { continue }
    if (-not $e.competitions -or $e.competitions.Count -eq 0) { continue }
    $cp = $e.competitions[0]
    if (-not $cp.competitors) { continue }
    $d = [string]$e.date
    if ($d.Length -ge 10) { $d = $d.Substring(0, 10) }
    $rawH = $null; $rawA = $null; $hg = 0; $ag = 0; $bad = $false
    foreach ($c in @($cp.competitors)) {
      $cn = ""
      if ($c.team -and $c.team.displayName) { $cn = [string]$c.team.displayName }
      $sv = 0
      if (-not [int]::TryParse([string]$c.score, [ref]$sv)) { $bad = $true; break }
      if ($c.homeAway -eq "home") { $rawH = $cn; $hg = $sv }
      elseif ($c.homeAway -eq "away") { $rawA = $cn; $ag = $sv }
    }
    if ($bad -or [string]::IsNullOrWhiteSpace($rawH) -or [string]::IsNullOrWhiteSpace($rawA)) { $dropped++; continue }
    $hb = Resolve-TeamName $rawH $code $Index $alias
    $ab = Resolve-TeamName $rawA $code $Index $alias
    if (-not $hb) { $hb = $rawH.Trim(); [void]$newTeams.Add($hb) }
    if (-not $ab) { $ab = $rawA.Trim(); [void]$newTeams.Add($ab) }
    $id = "espn:" + $e.id
    if ($seen.Contains($id)) { continue }
    [void]$seen.Add($id)
    $rows.Add([pscustomobject]@{
      id = $id; date = $d; competition = $name; team1 = $hb; team2 = $ab
      score = [pscustomobject]@{ ft = @($hg, $ag) }
    })
    $events++; $yadd++
  }
  Write-Host ("{0}  agregados={1}  acumulado={2}" -f $yr, $yadd, $rows.Count)
}

if ($rows.Count -gt 0) {
  $obj = [pscustomobject]@{ name = $name; code = $code; source = $source; matches = $rows }
  [System.IO.File]::WriteAllText((Join-Path $outDir "$code.json"), (ConvertTo-Json -InputObject $obj -Depth 6), $utf8)
} elseif (Test-Path (Join-Path $outDir "$code.json")) {
  Remove-Item (Join-Path $outDir "$code.json") -Force
}

# Manifiesto: reemplaza la entrada de esta competicion (cualquier source previo).
$keep = New-Object System.Collections.Generic.List[object]
foreach ($e in $manifest) { if ([string]$e.code -eq $code) { continue }; $keep.Add($e) }
if ($rows.Count -gt 0) { $keep.Add([pscustomobject]@{ path = "$code.json"; code = $code; source = $source }) }
[System.IO.File]::WriteAllText($manPath, (ConvertTo-Json -InputObject $keep -Depth 6), $utf8)

Write-Host ""
Write-Host ("Listo: {0} partidos en data\{1}\{2}.json  ({3} eventos ESPN, {4} descartados)." -f $rows.Count, $source, $code, $events, $dropped)
Write-Host ("Equipos nuevos ({0}): {1}" -f $newTeams.Count, (($newTeams | Sort-Object) -join ", "))
Write-Host ("Manifest: {0} entradas." -f $keep.Count)
