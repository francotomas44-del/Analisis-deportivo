param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$FromYear = 2005,
  [int]$ToYear = (Get-Date).Year,
  [string]$CacheDir = (Join-Path $env:TEMP "espn-cache-futbolityx")
)

# CONMEBOL Libertadores (source = "espn-libertadores").
#
# Antes la Libertadores venia de openfootball-extra (sa-lib.json), pero ese
# archivo mezclaba Libertadores Y Sudamericana (el folder "copa-libertadores/"
# del repo openfootball trae *_copal.txt y *_copas.txt) y etiquetaba TODO como
# "Copa Libertadores": el historial quedaba contaminado con partidos de la
# Sudamericana. Ademas openfootball solo publicaba 2012..2026.
#
# Ahora la fuente es la API publica de ESPN (slug "conmebol.libertadores"),
# temporadas $FromYear..$ToYear, sin solapamiento con ninguna otra fuente:
#
#   - Partidos jugados: STATUS_FULL_TIME y STATUS_FINAL_PEN (este ultimo es un
#     empate definido por penales en una llave a doble partido; se guarda el
#     resultado de ESE partido). Se incluye como partido con marcador.
#   - Partidos por jugar: lo que ESPN marca como programado / en juego
#     (STATUS_SCHEDULED, FIRST/SECOND_HALF, HALFTIME, IN_PROGRESS...). Se
#     guardan SIN marcador y con horario, para que la portada "Hoy" los muestre
#     con su pronostico. Se descartan cruces con "TBD" (final aun sin equipos).
#   - STATUS_CANCELED / POSTPONED / ABANDONED / SUSPENDED no se incluyen.
#
# Los nombres de equipo se mapean al nombre EXACTO de la base con un indice
# AMPLIADO (openfootball + arg-espn + openfootball-extra: los clubes de la
# Libertadores viven en las ligas sudamericanas de openfootball-extra). El mapeo
# fino de esta copa vive en scripts/espn-libertadores-team-map.json (alias
# especificos de la Libertadores). A diferencia de build-espn-history.ps1, NO se
# descarta nada: si un equipo no se reconoce se conserva el nombre de ESPN (se
# agrega como equipo nuevo). La app vuelve a unificar variantes al cargar
# (store.unifyTeams / canonicalName).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\build-espn-libertadores.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-espn-libertadores.ps1 -FromYear 2015

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

. (Join-Path $PSScriptRoot "espn-common.ps1")

$slug = "conmebol.libertadores"
$code = "conmebol.libertadores"
$name = "CONMEBOL Libertadores"
$source = "espn-libertadores"

# Estados de ESPN.
$finalStates = @("STATUS_FULL_TIME", "STATUS_FINAL_PEN")
$skipStates = @("STATUS_CANCELED", "STATUS_POSTPONED", "STATUS_ABANDONED", "STATUS_SUSPENDED")
$today = (Get-Date).ToString("yyyy-MM-dd")

$outDir = Join-Path $Root ("data\" + $source)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$manPath = Join-Path $Root "data\manifest.json"
$manifest = Get-Content $manPath -Raw -Encoding UTF8 | ConvertFrom-Json
$alias = Read-TeamAlias (Join-Path $PSScriptRoot "espn-team-alias.json")
# Aliases de club de la Sudamericana: son el MISMO universo de clubes sudamericanos
# (y los nombres canonicos que ya quedaron en data/espn-sudamericana/). Se reutilizan
# para que un club no quede partido en dos equipos (p. ej. "Sporting Cristal" vs
# "CS Cristal (PER)").
$saMap = Read-TeamAlias (Join-Path $PSScriptRoot "espn-sudamericana-team-map.json")
foreach ($k in $saMap.Keys) { $alias[$k] = $saMap[$k] }
$map = Read-TeamAlias (Join-Path $PSScriptRoot "espn-libertadores-team-map.json")
foreach ($k in $map.Keys) { $alias[$k] = $map[$k] }
$utf8 = New-Object System.Text.UTF8Encoding($false)

Write-Host "Indice de la base (openfootball + arg-espn + openfootball-extra)..."
$Index = New-BaseIndex $Root $manifest @("openfootball", "arg-espn", "openfootball-extra")

$rows = New-Object System.Collections.Generic.List[object]
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$newTeams = New-Object 'System.Collections.Generic.HashSet[string]'
$results = 0; $fixtures = 0; $dropped = 0

foreach ($yr in ($FromYear..$ToYear)) {
  $ev = Get-EspnEvents $slug $yr $CacheDir
  if ($null -eq $ev) { Write-Host ("{0}  SIN RESPUESTA" -f $yr); continue }
  $yRes = 0; $yFix = 0
  foreach ($e in $ev) {
    $st = ""
    if ($e.status -and $e.status.type) { $st = [string]$e.status.type.name }
    if ($skipStates -contains $st) { continue }
    $isFinal = $finalStates -contains $st

    if (-not $e.competitions -or $e.competitions.Count -eq 0) { continue }
    $cp = $e.competitions[0]
    if (-not $cp.competitors) { continue }

    # Fecha (YYYY-MM-DD) y horario (HH:MM en UTC) a partir del ISO de ESPN.
    $iso = [string]$e.date
    $mD = [regex]::Match($iso, '^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?')
    if (-not $mD.Success) { $dropped++; continue }
    $d = $mD.Groups[1].Value + "-" + $mD.Groups[2].Value + "-" + $mD.Groups[3].Value
    $time = ""
    if ($mD.Groups[4].Success -and $mD.Groups[4].Value -ne "") {
      $time = $mD.Groups[4].Value + ":" + $mD.Groups[5].Value + " UTC+0"
    }

    $rawH = $null; $rawA = $null; $hg = 0; $ag = 0; $bad = $false
    foreach ($c in @($cp.competitors)) {
      $cn = ""
      if ($c.team -and $c.team.displayName) { $cn = [string]$c.team.displayName }
      $sv = 0
      if ($isFinal -and -not [int]::TryParse([string]$c.score, [ref]$sv)) { $bad = $true; break }
      if ($c.homeAway -eq "home") { $rawH = $cn; $hg = $sv }
      elseif ($c.homeAway -eq "away") { $rawA = $cn; $ag = $sv }
    }

    if ($isFinal) {
      if ($bad -or [string]::IsNullOrWhiteSpace($rawH) -or [string]::IsNullOrWhiteSpace($rawA)) { $dropped++; continue }
    } else {
      # Proximo partido: solo con fecha de hoy en adelante y equipos reales.
      if ($d -lt $today) { continue }
      if ([string]::IsNullOrWhiteSpace($rawH) -or [string]::IsNullOrWhiteSpace($rawA)) { continue }
      if ($rawH -match '(?i)^\s*TBD' -or $rawA -match '(?i)^\s*TBD') { continue }
    }

    $hb = Resolve-TeamName $rawH $code $Index $alias
    $ab = Resolve-TeamName $rawA $code $Index $alias
    if (-not $hb) { $hb = $rawH.Trim(); [void]$newTeams.Add($hb) }
    if (-not $ab) { $ab = $rawA.Trim(); [void]$newTeams.Add($ab) }

    $id = "espn:" + $e.id
    if ($seen.Contains($id)) { continue }
    [void]$seen.Add($id)

    if ($isFinal) {
      $rows.Add([pscustomobject]@{
        id = $id; date = $d; competition = $name; team1 = $hb; team2 = $ab
        score = [pscustomobject]@{ ft = @($hg, $ag) }
      })
      $results++; $yRes++
    } else {
      $rows.Add([pscustomobject]@{
        id = $id; date = $d; time = $time; competition = $name; team1 = $hb; team2 = $ab
      })
      $fixtures++; $yFix++
    }
  }
  Write-Host ("{0}  jugados=+{1}  por jugar=+{2}  acumulado={3}" -f $yr, $yRes, $yFix, $rows.Count)
}

if ($rows.Count -gt 0) {
  $obj = [pscustomobject]@{ name = $name; code = $code; source = $source; matches = $rows }
  $json = ConvertTo-Json -InputObject $obj -Depth 6
  $outFile = Join-Path $outDir "$code.json"
  [System.IO.File]::WriteAllText($outFile, $json, $utf8)
} elseif (Test-Path (Join-Path $outDir "$code.json")) {
  Remove-Item (Join-Path $outDir "$code.json") -Force
}

# Revision del contenido (SHA1 corto). La app la usa como query (?v=rev) para
# refrescar el archivo cuando cambia: a diferencia del resto de data/ (inmutable),
# la Libertadores suma resultados y partidos por jugar en cada corrida.
$rev = ""
if ($rows.Count -gt 0) {
  $sha = [System.Security.Cryptography.SHA1]::Create()
  $hash = $sha.ComputeHash([System.IO.File]::ReadAllBytes($outFile))
  $rev = ([System.BitConverter]::ToString($hash) -replace "-", "").ToLower().Substring(0, 12)
}

# Manifiesto: reemplaza la entrada de esta competicion (cualquier source previo).
$keep = New-Object System.Collections.Generic.List[object]
foreach ($e in $manifest) { if ([string]$e.code -eq $code) { continue }; $keep.Add($e) }
if ($rows.Count -gt 0) { $keep.Add([pscustomobject]@{ path = "$code.json"; code = $code; source = $source; rev = $rev }) }
[System.IO.File]::WriteAllText($manPath, (ConvertTo-Json -InputObject $keep -Depth 6), $utf8)

Write-Host ""
Write-Host ("Listo: {0} partidos ({1} jugados, {2} por jugar) en data\{3}\{4}.json  ({5} descartados)." -f $rows.Count, $results, $fixtures, $source, $code, $dropped)
Write-Host ("Revision (rev): {0}" -f $rev)
Write-Host ("Equipos nuevos ({0}): {1}" -f $newTeams.Count, (($newTeams | Sort-Object) -join ", "))
Write-Host ("Manifest: {0} entradas." -f $keep.Count)
