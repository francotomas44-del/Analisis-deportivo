param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

# Descarga el historial de la Liga Profesional Argentina desde la API publica de
# ESPN (arg.1) y lo guarda como datos locales en data/arg-espn/<anio>.json.
# Luego actualiza data/manifest.json:
#   - quita las entradas de ar.1 de openfootball (pocas e incompletas)
#   - agrega las temporadas bajadas de ESPN
#
# Solo se toman partidos TERMINADOS en tiempo regular (STATUS_FULL_TIME) para no
# meter ambiguedad de penales. Los nombres de equipo se normalizan con
# scripts/arg-team-map.json para que un club no quede partido en dos.
#
# Cada partido guarda ademas su TORNEO real en el campo `competition`, tomado del
# slug de temporada de ESPN (event.season.slug). Asi la seccion "Competicion"
# puede distinguir Torneo Apertura/Clausura, Inicial/Final, Superliga, Copa
# Diego Armando Maradona, Liga Profesional, Liguillas, etc. Los equipos siguen
# agrupados bajo la liga "Liga Profesional (Argentina)" (dataset.js los separa
# del torneo con el campo `league`).

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

$outDir = Join-Path $Root "data\arg-espn"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$mapPath = Join-Path $PSScriptRoot "arg-team-map.json"
$map = Get-Content $mapPath -Raw -Encoding UTF8 | ConvertFrom-Json
$canon = @{}
foreach ($p in $map.canon.PSObject.Properties) { $canon[$p.Name] = $p.Value }
$exclude = @{}
foreach ($t in $map.excludeTeams) { $exclude[[string]$t] = $true }

$years = @(2001) + (2003..2026)
$headers = @{
  "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
  "Accept"     = "application/json"
}
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Canon([string]$n) {
  if ($null -eq $n) { return $null }
  if ($canon.ContainsKey($n)) { return $canon[$n] }
  return $n
}

# "20162017" -> "2016-17"; cualquier otra cosa queda igual.
function Format-SeasonTail([string]$tail) {
  if ($tail -match '^(\d{4})(\d{2})$') { return $matches[1] + "-" + $matches[2] }
  return $tail
}

# Nombre del torneo argentino a partir del slug de ESPN (event.season.slug).
function Get-ArCompetition($ev) {
  $slug = ""
  if ($ev.season -and $ev.season.slug) { $slug = [string]$ev.season.slug }
  $sy = ""
  if ($ev.season -and $ev.season.year) { $sy = [string]$ev.season.year }
  if ([string]::IsNullOrWhiteSpace($slug)) { return "Liga Profesional (Argentina)" }

  if ($slug -match 'copa-diego-armando-maradona') { return "Copa Diego Armando Maradona 2020-21 (Argentina)" }
  if ($slug -match '^superliga-argentina-(.+)$') { return "Superliga " + (Format-SeasonTail $matches[1]) + " (Argentina)" }
  if ($slug -match 'argentine-liga-profesional') {
    if ($slug -match '((19|20)\d{2})') { return "Liga Profesional " + $matches[1] + " (Argentina)" }
    return "Liga Profesional " + $sy + " (Argentina)"
  }
  if ($slug -match '^campeonato-de-1ra-division-((19|20)\d{2})') {
    $tail = $slug.Substring("campeonato-de-1ra-division-".Length)
    return ("Campeonato de Primera Divisi" + [char]0xF3 + "n " + (Format-SeasonTail $tail) + " (Argentina)")
  }
  if ($slug -match '^torneo-de-primera-division-((19|20)\d{2})') {
    return ("Primera Divisi" + [char]0xF3 + "n " + $matches[1] + " (Argentina)")
  }
  if ($slug -match '^torneo-(apertura|clausura|inicial|final)-((19|20)\d{2})') {
    $name = $matches[1]; $yr = $matches[2]
    return "Torneo " + $name.Substring(0,1).ToUpper() + $name.Substring(1) + " " + $yr + " (Argentina)"
  }
  if ($slug -match '^torneo-(apertura|clausura)') {
    $name = $matches[1]
    return "Torneo " + $name.Substring(0,1).ToUpper() + $name.Substring(1) + " " + $sy + " (Argentina)"
  }
  if ($slug -match '^(apertura|clausura)---') {
    $name = $matches[1]
    return "Torneo " + $name.Substring(0,1).ToUpper() + $name.Substring(1) + " " + $sy + " (Argentina)"
  }
  if ($slug -match '^pre-libertadores') { return "Liguilla Pre-Libertadores " + $sy + " (Argentina)" }
  if ($slug -match '^pre-sudamericana') { return "Liguilla Pre-Sudamericana " + $sy + " (Argentina)" }
  return "Liga Profesional (Argentina)"
}

$manifestEntries = New-Object System.Collections.Generic.List[object]
$grand = 0

foreach ($y in $years) {
  $url = "https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard?limit=1000&dates=$y"
  $data = $null
  for ($try = 1; $try -le 4; $try++) {
    try { $data = Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 180; break }
    catch { Write-Host "  reintento $try para $y..."; Start-Sleep -Seconds (4 * $try) }
  }
  if ($null -eq $data) { throw "No se pudo descargar la temporada $y tras 4 intentos." }
  $rows = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  foreach ($ev in $data.events) {
    if (-not $ev.status -or $ev.status.type.name -ne "STATUS_FULL_TIME") { continue }
    if (-not $ev.competitions -or $ev.competitions.Count -eq 0) { continue }
    $comp = $ev.competitions[0]
    if (-not $comp.competitors) { continue }
    $cname = Get-ArCompetition $ev
    $hTeam = $null; $aTeam = $null; $hg = 0; $ag = 0; $bad = $false
    foreach ($c in $comp.competitors) {
      $n = ""
      if ($c.team -and $c.team.displayName) { $n = [string]$c.team.displayName }
      if ($exclude.ContainsKey($n)) { $bad = $true; break }
      $sv = 0
      # ESPN devuelve -1 cuando no tiene el marcador: no es un resultado valido.
      if (-not [int]::TryParse([string]$c.score, [ref]$sv) -or $sv -lt 0) { $bad = $true; break }
      if ($c.homeAway -eq "home") { $hTeam = Get-Canon $n; $hg = $sv }
      elseif ($c.homeAway -eq "away") { $aTeam = Get-Canon $n; $ag = $sv }
    }
    if ($bad -or [string]::IsNullOrWhiteSpace($hTeam) -or [string]::IsNullOrWhiteSpace($aTeam)) { continue }
    $id = "espn:" + $ev.id
    if ($seen.ContainsKey($id)) { continue }
    $seen[$id] = $true
    $d = ([string]$ev.date)
    if ($d.Length -ge 10) { $d = $d.Substring(0, 10) }
    $rows.Add([pscustomobject]@{
      id          = $id
      date        = $d
      competition = $cname
      team1       = $hTeam
      team2       = $aTeam
      score       = [pscustomobject]@{ ft = @($hg, $ag) }
    })
  }
  $obj = [pscustomobject]@{
    name    = "Liga Profesional (Argentina) $y"
    code    = "ar.1"
    source  = "espn"
    season  = $y
    matches = $rows
  }
  $json = ConvertTo-Json -InputObject $obj -Depth 6
  [System.IO.File]::WriteAllText((Join-Path $outDir "$y.json"), $json, $utf8)
  $manifestEntries.Add([pscustomobject]@{ path = "$y.json"; code = "ar.1"; source = "arg-espn" })
  $grand += $rows.Count
  Write-Host "$y.json -> $($rows.Count) partidos"
}

# Actualiza el manifiesto quitando la version vieja de ar.1 de openfootball.
$manifestPath = Join-Path $Root "data\manifest.json"
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$keep = New-Object System.Collections.Generic.List[object]
foreach ($e in $manifest) {
  if ($e.source -eq "arg-espn") { continue }
  if ($e.code -eq "ar.1" -and $e.source -eq "openfootball") { continue }
  $keep.Add($e)
}
foreach ($e in $manifestEntries) { $keep.Add($e) }
$json = ConvertTo-Json -InputObject $keep -Depth 6
[System.IO.File]::WriteAllText($manifestPath, $json, $utf8)

Write-Host ""
Write-Host "Listo: $grand partidos argentinos en $($manifestEntries.Count) temporadas."
Write-Host "Manifiesto: $($keep.Count) entradas."
