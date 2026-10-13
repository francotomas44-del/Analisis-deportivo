param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$CacheDir = (Join-Path $env:TEMP "espn-cache-futbolityx"),
  [int]$FromYear = 2000,
  [int]$ToYear = 2026,
  [string[]]$OnlyCodes = @(),
  [switch]$NoBaseFilter
)

# TARJETAS (amarillas/rojas) y CORNERS por partido.
#
# La base histórica sólo guarda equipos, fecha y resultado. ESPN publica, en el
# "scoreboard" de cada liga/temporada (el mismo archivo que ya se cachea para
# construir la historia), el detalle de cada partido:
#   - competitions[0].details[]: jugadas con banderas `yellowCard` / `redCard`
#     y el equipo (`team.id`) que las recibió.
#   - competitions[0].competitors[].statistics[]: `wonCorners` por equipo.
#
# Este script recorre las ligas de espn-leagues.json y todas las temporadas,
# cuenta amarillas/rojas por equipo desde `details` y guarda córners, y escribe
# data/cards/<code>.json con una entrada compacta por partido presente en la base:
#
#   ["espn:<id>", amarillasLocal, amarillasVisitante, rojasLocal, rojasVisitante,
#    cornersLocal, cornersVisitante]
#
# Sólo se incluyen partidos cuyo id ya existe en la base (data/espn-*), para no
# inflar el tamaño. Los valores nulos se escriben como null.
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\build-cards.ps1
# Requiere haber corrido antes los scripts de ESPN (comparte el mismo caché).

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

. (Join-Path $PSScriptRoot "espn-common.ps1")

$outDir = Join-Path $Root "data\cards"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$manPath = Join-Path $Root "data\manifest.json"
$manifest = Get-Content $manPath -Raw -Encoding UTF8 | ConvertFrom-Json
$leagues = Get-Content (Join-Path $PSScriptRoot "espn-leagues.json") -Raw -Encoding UTF8 | ConvertFrom-Json
# Liga Profesional Argentina: se construye aparte (arg-espn), pero sus partidos
# también tienen id de ESPN, así que se suman al índice de tarjetas.
$leagues = @($leagues) + @([pscustomobject]@{ code = "ar.1"; slug = "arg.1"; name = "Liga Profesional (Argentina)" })
$utf8 = New-Object System.Text.UTF8Encoding($false)
$inv = [System.Globalization.CultureInfo]::InvariantCulture

# --- ids de ESPN presentes en la base -----------------------------------------
$baseIds = New-Object 'System.Collections.Generic.HashSet[string]'
if (-not $NoBaseFilter) {
  Write-Host "Indexando ids de la base..."
  $dataDir = Join-Path $Root "data"
  foreach ($f in (Get-ChildItem $dataDir -File -Recurse -Filter *.json)) {
    if ($f.Name -eq "manifest.json") { continue }
    if ($f.DirectoryName -like "*\cards") { continue }
    try { $j = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
    if ($j -and $j.matches) {
      foreach ($m in $j.matches) {
        $id = [string]$m.id
        if ($id -and $id.StartsWith("espn:")) { [void]$baseIds.Add($id) }
      }
    }
  }
  Write-Host ("Ids de ESPN en la base: {0}" -f $baseIds.Count)
} else {
  Write-Host "Sin filtro de base (se guardan todos los partidos con datos)."
}

function Fmt-Num($v) {
  if ($null -eq $v) { return "null" }
  return ([int]$v).ToString($inv)
}

# Cuenta tarjetas por equipo usando el id de equipo de ESPN.
function Get-CardCounts($details, [string]$homeId, [string]$awayId) {
  $hy = 0; $ay = 0; $hr = 0; $ar = 0
  if (-not $details) { return @($hy, $ay, $hr, $ar) }
  foreach ($d in @($details)) {
    $tid = ""
    if ($d.team -and $d.team.id) { $tid = [string]$d.team.id }
    elseif ($d.athletesInvolved -and @($d.athletesInvolved).Count -gt 0) {
      $a0 = @($d.athletesInvolved)[0]
      if ($a0.team -and $a0.team.id) { $tid = [string]$a0.team.id }
    }
    if ($tid -eq "") { continue }
    if ($d.yellowCard) { if ($tid -eq $homeId) { $hy++ } elseif ($tid -eq $awayId) { $ay++ } }
    if ($d.redCard) { if ($tid -eq $homeId) { $hr++ } elseif ($tid -eq $awayId) { $ar++ } }
  }
  return @($hy, $ay, $hr, $ar)
}

function Get-Stat($stats, $name) {
  if (-not $stats) { return $null }
  foreach ($s in @($stats)) {
    if ([string]$s.name -eq $name) {
      $dv = $s.displayValue
      if ($null -eq $dv -or $dv -eq "") { return $null }
      $v = 0
      if ([int]::TryParse([string]$dv, [ref]$v)) { return $v }
      return $null
    }
  }
  return $null
}

$grand = 0; $files = 0; $withCards = 0
foreach ($lg in $leagues) {
  $code = [string]$lg.code
  $slug = [string]$lg.slug
  $name = [string]$lg.name
  if ($OnlyCodes.Count -gt 0 -and ($OnlyCodes -notcontains $code)) { continue }
  $sb = New-Object System.Text.StringBuilder
  $n = 0
  foreach ($yr in ($FromYear..$ToYear)) {
    $ev = Get-EspnEvents $slug $yr $CacheDir
    if ($null -eq $ev) { continue }
    foreach ($e in $ev) {
      $st = ""
      if ($e.status -and $e.status.type) { $st = [string]$e.status.type.name }
      if ($st -ne "STATUS_FULL_TIME") { continue }
      if (-not $e.competitions -or $e.competitions.Count -eq 0) { continue }
      $cp = $e.competitions[0]
      if (-not $cp.competitors) { continue }
      $id = "espn:" + $e.id
      if (-not $NoBaseFilter -and -not $baseIds.Contains($id)) { continue }
      $homeId = ""; $awayId = ""; $hc = $null; $ac = $null
      foreach ($c in @($cp.competitors)) {
        $tid = ""
        if ($c.team -and $c.team.id) { $tid = [string]$c.team.id }
        $w = Get-Stat $c.statistics "wonCorners"
        if ($c.homeAway -eq "home") { $homeId = $tid; $hc = $w }
        elseif ($c.homeAway -eq "away") { $awayId = $tid; $ac = $w }
      }
      $cc = Get-CardCounts $cp.details $homeId $awayId
      $hy = $cc[0]; $ay = $cc[1]; $hr = $cc[2]; $ar = $cc[3]
      if ($hy -eq 0 -and $ay -eq 0 -and $hr -eq 0 -and $ar -eq 0 -and $null -eq $hc -and $null -eq $ac) { continue }
      if ($hy -gt 0 -or $ay -gt 0 -or $hr -gt 0 -or $ar -gt 0) { $withCards++ }

      if ($sb.Length -gt 0) { [void]$sb.Append(",") }
      [void]$sb.Append('["').Append($id).Append('",')
      [void]$sb.Append((Fmt-Num $hy)).Append(",")
      [void]$sb.Append((Fmt-Num $ay)).Append(",")
      [void]$sb.Append((Fmt-Num $hr)).Append(",")
      [void]$sb.Append((Fmt-Num $ar)).Append(",")
      [void]$sb.Append((Fmt-Num $hc)).Append(",")
      [void]$sb.Append((Fmt-Num $ac)).Append("]")
      $n++
    }
  }

  $target = Join-Path $outDir "$code.json"
  if ($n -gt 0) {
    $json = '{"name":"' + ($name -replace '"','\"') + '","code":"' + $code + '","source":"cards","matches":[' + $sb.ToString() + ']}'
    [System.IO.File]::WriteAllText($target, $json, $utf8)
    $files++
  } elseif (Test-Path $target) {
    Remove-Item $target -Force
  }
  $grand += $n
  Write-Host ("{0,-8} {1,6} partidos con datos" -f $code, $n)
}

# --- manifest -----------------------------------------------------------------
$keep = New-Object System.Collections.Generic.List[object]
foreach ($e in $manifest) {
  if ($e.source -eq "cards") { continue }
  $keep.Add($e)
}
foreach ($lg in $leagues) {
  $code = [string]$lg.code
  if (Test-Path (Join-Path $outDir "$code.json")) {
    $keep.Add([pscustomobject]@{ path = "$code.json"; code = $code; source = "cards" })
  }
}
[System.IO.File]::WriteAllText($manPath, (ConvertTo-Json -InputObject $keep -Depth 6), $utf8)

Write-Host ""
Write-Host ("Listo: {0} partidos con tarjetas/corners en {1} ligas ({2} con tarjetas). Manifest: {3} entradas." -f $grand, $files, $withCards, $keep.Count)
