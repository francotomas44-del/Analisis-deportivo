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

$manifestEntries = New-Object System.Collections.Generic.List[object]
$grand = 0

foreach ($y in $years) {
  $url = "https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard?limit=1000&dates=$y"
  $data = Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 120
  $rows = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  foreach ($ev in $data.events) {
    if (-not $ev.status -or $ev.status.type.name -ne "STATUS_FULL_TIME") { continue }
    if (-not $ev.competitions -or $ev.competitions.Count -eq 0) { continue }
    $comp = $ev.competitions[0]
    if (-not $comp.competitors) { continue }
    $hTeam = $null; $aTeam = $null; $hg = 0; $ag = 0; $bad = $false
    foreach ($c in $comp.competitors) {
      $n = ""
      if ($c.team -and $c.team.displayName) { $n = [string]$c.team.displayName }
      if ($exclude.ContainsKey($n)) { $bad = $true; break }
      $sv = 0
      if (-not [int]::TryParse([string]$c.score, [ref]$sv)) { $bad = $true; break }
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
      id    = $id
      date  = $d
      team1 = $hTeam
      team2 = $aTeam
      score = [pscustomobject]@{ ft = @($hg, $ag) }
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
  Write-Host ("$y : " + $rows.Count + " partidos")
}

$manifestPath = Join-Path $Root "data\manifest.json"
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$kept = @()
foreach ($e in $manifest) {
  if ($e.code -eq "ar.1" -and $e.source -eq "openfootball") { continue }
  $kept += $e
}
foreach ($e in $manifestEntries) { $kept += $e }
[System.IO.File]::WriteAllText($manifestPath, (ConvertTo-Json -InputObject $kept -Depth 4), $utf8)

Write-Host ("TOTAL Argentina (ESPN): " + $grand + " partidos en " + $manifestEntries.Count + " temporadas")
Write-Host ("Manifest: " + $manifestPath + "  (" + $kept.Count + " entradas)")
