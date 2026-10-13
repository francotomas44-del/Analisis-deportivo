param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$FromYear = 2000,
  [string]$CacheDir = (Join-Path $env:TEMP "espn-cache-futbolityx"),
  [switch]$NoNewTeams
)

# HISTORIA: agrega a la base el tramo ANTERIOR al primer partido que ya tiene
# cada liga, descargado de la API publica de ESPN (data/espn-history/<code>.json,
# source = "espn-history").
#
# - Solo partidos TERMINADOS en tiempo regular (STATUS_FULL_TIME).
# - Rango de anios: de $FromYear hasta el anio del primer partido de la base.
# - Los nombres de ESPN se mapean al nombre EXACTO de la base (misma logica que
#   scripts/build-espn-season.ps1: indice por liga -> indice global -> alias).
# - Si un equipo NO esta en la base y NO se parece a ninguno (score < 0.60), se
#   agrega como equipo nuevo: son clubes de esa epoca que hoy no estan en la
#   liga. Si se parece a uno existente, el partido se descarta para no partir un
#   club en dos. Con -NoNewTeams se descartan siempre.

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

. (Join-Path $PSScriptRoot "espn-common.ps1")

$outDir = Join-Path $Root "data\espn-history"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$manPath = Join-Path $Root "data\manifest.json"
$manifest = Get-Content $manPath -Raw -Encoding UTF8 | ConvertFrom-Json
$leagues = Get-Content (Join-Path $PSScriptRoot "espn-leagues.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$alias = Read-TeamAlias (Join-Path $PSScriptRoot "espn-team-alias.json")
$utf8 = New-Object System.Text.UTF8Encoding($false)

Write-Host "Indice de la base..."
$Index = New-BaseIndex $Root $manifest

# Devuelve el nombre exacto de la base, o el nombre de ESPN si es un equipo
# claramente distinto (y se permite agregarlo), o $null si hay que descartar.
function Resolve-Hist([string]$nm, [string]$code, $added) {
  # Memo por (codigo, nombre): cada equipo aparece ~38 veces por temporada y la
  # busqueda global recorre ~1.100 equipos, asi que resolver una sola vez por
  # nombre es la diferencia entre minutos y horas.
  $mk = "$code|$nm"
  if ($script:histRes.ContainsKey($mk)) {
    $cv = $script:histRes[$mk]
    if ($cv) { return $cv }
    return $null
  }
  $r = Resolve-TeamName $nm $code $Index $alias
  if ($r) { $script:histRes[$mk] = $r; return $r }
  if ($NoNewTeams) { $script:histRes[$mk] = $null; return $null }
  $tk = Get-TeamKey $nm
  $best = 0.0
  if ($Index.cKey[$code]) { $bi = Find-BestInfoFast $tk $Index.cKey[$code] $Index.cPfx[$code]; if ($bi.score -gt $best) { $best = $bi.score } }
  $bj = Find-BestInfoFast $tk $Index.gKey $Index.gPfx
  if ($bj.score -gt $best) { $best = $bj.score }
  if ($best -lt 0.60) { [void]$added.Add($nm); $script:histRes[$mk] = $nm; return $nm }
  $script:histRes[$mk] = $null
  return $null
}

$histRes = @{}

$grandAdded = 0; $grandSkipped = 0; $grandNewTeams = 0; $files = 0

foreach ($lg in $leagues) {
  $code = [string]$lg.code
  $slug = [string]$lg.slug
  $name = [string]$lg.name
  $minDate = [string]$Index.cMin[$code]
  if (-not $minDate -or $minDate.Length -lt 4) { Write-Host ("{0,-8} sin base, se omite" -f $code); continue }
  $endYear = [int]$minDate.Substring(0, 4)
  if ($endYear -lt $FromYear) { Write-Host ("{0,-8} base empieza en {1}, nada antes" -f $code, $minDate); continue }

  $rows = New-Object System.Collections.Generic.List[object]
  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $added = New-Object System.Collections.Generic.List[string]
  $events = 0; $skipped = 0

  foreach ($yr in ($FromYear..$endYear)) {
    $ev = Get-EspnEvents $slug $yr $CacheDir
    if ($null -eq $ev) { continue }
    foreach ($e in $ev) {
      $st = ""
      if ($e.status -and $e.status.type) { $st = [string]$e.status.type.name }
      if ($st -ne "STATUS_FULL_TIME") { continue }
      if (-not $e.competitions -or $e.competitions.Count -eq 0) { continue }
      $cp = $e.competitions[0]
      if (-not $cp.competitors) { continue }
      $d = [string]$e.date
      if ($d.Length -ge 10) { $d = $d.Substring(0, 10) }
      if ($d -ge $minDate) { continue }
      $events++
      $rawH = $null; $rawA = $null; $hg = 0; $ag = 0; $bad = $false
      foreach ($c in @($cp.competitors)) {
        $cn = ""
        if ($c.team -and $c.team.displayName) { $cn = [string]$c.team.displayName }
        $sv = 0
        if (-not [int]::TryParse([string]$c.score, [ref]$sv)) { $bad = $true; break }
        if ($c.homeAway -eq "home") { $rawH = $cn; $hg = $sv }
        elseif ($c.homeAway -eq "away") { $rawA = $cn; $ag = $sv }
      }
      if ($bad -or [string]::IsNullOrWhiteSpace($rawH) -or [string]::IsNullOrWhiteSpace($rawA)) { continue }
      $hb = Resolve-Hist $rawH $code $added
      $ab = Resolve-Hist $rawA $code $added
      if (-not $hb -or -not $ab) { $skipped++; continue }
      $id = "espn:" + $e.id
      if ($seen.Contains($id)) { continue }
      [void]$seen.Add($id)
      $rows.Add([pscustomobject]@{
        id = $id; date = $d; competition = $name; team1 = $hb; team2 = $ab
        score = [pscustomobject]@{ ft = @($hg, $ag) }
      })
    }
  }

  if ($rows.Count -gt 0) {
    $obj = [pscustomobject]@{ name = "$name (historia)"; code = $code; source = "espn-history"; matches = $rows }
    [System.IO.File]::WriteAllText((Join-Path $outDir "$code.json"), (ConvertTo-Json -InputObject $obj -Depth 6), $utf8)
    $files++
  } elseif (Test-Path (Join-Path $outDir "$code.json")) {
    Remove-Item (Join-Path $outDir "$code.json") -Force
  }

  $grandAdded += $rows.Count; $grandSkipped += $skipped
  $uniqNew = @($added | Sort-Object -Unique)
  $grandNewTeams += $uniqNew.Count
  Write-Host ("{0,-8} desde<{1}  anios {2}-{3}  espn={4}  nuevos={5}  descartados={6}  equiposNuevos={7}" -f $code, $minDate, $FromYear, $endYear, $events, $rows.Count, $skipped, $uniqNew.Count)
  if ($uniqNew.Count -gt 0) { Write-Host ("           + " + ($uniqNew -join ", ")) }
}

# ---------------------------------------------------------------- manifest ---
$keep = New-Object System.Collections.Generic.List[object]
foreach ($e in $manifest) { if ($e.source -eq "espn-history") { continue }; $keep.Add($e) }
foreach ($lg in $leagues) {
  $code = [string]$lg.code
  if (Test-Path (Join-Path $outDir "$code.json")) {
    $keep.Add([pscustomobject]@{ path = "$code.json"; code = $code; source = "espn-history" })
  }
}
[System.IO.File]::WriteAllText($manPath, (ConvertTo-Json -InputObject $keep -Depth 6), $utf8)

Write-Host ""
Write-Host ("Listo: {0} partidos historicos en {1} ligas ({2} descartados; {3} equipos nuevos). Manifest: {4} entradas." -f $grandAdded, $files, $grandSkipped, $grandNewTeams, $keep.Count)
