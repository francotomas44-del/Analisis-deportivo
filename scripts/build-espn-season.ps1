param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$Year = 2026,
  [string]$CacheDir = (Join-Path $env:TEMP "espn-cache-futbolityx")
)

# Pone "al dia" cada liga de la base con la API publica de ESPN.
# Agrega SOLO los partidos posteriores al ultimo que ya tiene la base, en
# data/espn-season/<code>.json (source = "espn-season" en data/manifest.json).
#
# Solo partidos TERMINADOS en tiempo regular (STATUS_FULL_TIME). Los nombres de
# ESPN se mapean al nombre EXACTO de la base (scripts/espn-team-alias.json puede
# forzar casos). Si un equipo no se reconoce, el partido se descarta, para no
# partir un club en dos.
#
# ESPN no cubre hoy: Hungria, Argelia, Egipto, Marruecos (sin slug) ni Suiza y
# Chequia (slug sin datos). Se omiten.
#
# Uso:  powershell -File scripts\build-espn-season.ps1 [-Year 2026]

. (Join-Path $PSScriptRoot "espn-common.ps1")

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

$outDir = Join-Path $Root "data\espn-season"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$manPath = Join-Path $Root "data\manifest.json"
$manifest = Get-Content $manPath -Raw -Encoding UTF8 | ConvertFrom-Json
$leagues = Get-Content (Join-Path $PSScriptRoot "espn-leagues.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$alias = Read-TeamAlias (Join-Path $PSScriptRoot "espn-team-alias.json")
$utf8 = New-Object System.Text.UTF8Encoding($false)

Write-Host "Indice de la base..."
$Index = New-BaseIndex $Root $manifest

$grandAdded = 0; $grandSkipped = 0; $grandEvents = 0; $files = 0

foreach ($lg in $leagues) {
  $code = [string]$lg.code
  $slug = [string]$lg.slug
  $name = [string]$lg.name
  $maxDate = [string]$Index.cMax[$code]

  $startYear = $Year - 1
  if ($maxDate.Length -ge 4) { $startYear = [int]$maxDate.Substring(0, 4) }
  if ($startYear -lt ($Year - 8)) { $startYear = $Year - 8 }
  if ($startYear -gt $Year) { $startYear = $Year }

  $allEvents = New-Object System.Collections.Generic.List[object]
  $got = $false
  foreach ($yr in ($startYear..$Year)) {
    $ev = Get-EspnEvents $slug $yr $CacheDir
    if ($null -eq $ev) { continue }
    $got = $true
    foreach ($e in $ev) { [void]$allEvents.Add($e) }
  }
  if (-not $got) { Write-Host ("{0,-8} base<={1}  SIN RESPUESTA" -f $code, $maxDate); continue }

  $rows = New-Object System.Collections.Generic.List[object]
  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $events = 0; $skipped = 0
  $unresolved = New-Object System.Collections.Generic.List[string]

  foreach ($ev in $allEvents) {
    $st = ""
    if ($ev.status -and $ev.status.type) { $st = [string]$ev.status.type.name }
    if ($st -ne "STATUS_FULL_TIME") { continue }
    if (-not $ev.competitions -or $ev.competitions.Count -eq 0) { continue }
    $cp = $ev.competitions[0]
    if (-not $cp.competitors) { continue }
    $d = [string]$ev.date
    if ($d.Length -ge 10) { $d = $d.Substring(0, 10) }
    if ($maxDate -and $d -le $maxDate) { continue }
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
    $hb = Resolve-TeamName $rawH $code $Index $alias
    $ab = Resolve-TeamName $rawA $code $Index $alias
    if (-not $hb -or -not $ab) {
      $skipped++
      if (-not $hb) { $unresolved.Add((Format-Diagnose $rawH $code $Index)) }
      if (-not $ab) { $unresolved.Add((Format-Diagnose $rawA $code $Index)) }
      continue
    }
    $id = "espn:" + $ev.id
    if ($seen.Contains($id)) { continue }
    [void]$seen.Add($id)
    $rows.Add([pscustomobject]@{
      id = $id; date = $d; competition = $name; team1 = $hb; team2 = $ab
      score = [pscustomobject]@{ ft = @($hg, $ag) }
    })
  }

  if ($rows.Count -gt 0) {
    $obj = [pscustomobject]@{ name = "$name $Year"; code = $code; source = "espn"; season = $Year; matches = $rows }
    [System.IO.File]::WriteAllText((Join-Path $outDir "$code.json"), (ConvertTo-Json -InputObject $obj -Depth 6), $utf8)
    $files++
  } elseif (Test-Path (Join-Path $outDir "$code.json")) {
    Remove-Item (Join-Path $outDir "$code.json") -Force
  }

  $grandAdded += $rows.Count; $grandSkipped += $skipped; $grandEvents += $events
  Write-Host ("{0,-8} base<={1}  espn={2}  nuevos={3}  descartados={4}" -f $code, $maxDate, $events, $rows.Count, $skipped)
  foreach ($u in ($unresolved | Sort-Object -Unique)) { Write-Host ("           $u") }
}

# Manifiesto: quita entradas previas (espn-season) y agrega las nuevas.
$keep = New-Object System.Collections.Generic.List[object]
foreach ($e in $manifest) { if ($e.source -eq "espn-season") { continue }; $keep.Add($e) }
foreach ($lg in $leagues) {
  $code = [string]$lg.code
  if (Test-Path (Join-Path $outDir "$code.json")) {
    $keep.Add([pscustomobject]@{ path = "$code.json"; code = $code; source = "espn-season" })
  }
}
[System.IO.File]::WriteAllText($manPath, (ConvertTo-Json -InputObject $keep -Depth 6), $utf8)

Write-Host ""
Write-Host ("Listo: {0} partidos nuevos en {1} ligas ({2} eventos ESPN, {3} descartados). Manifest: {4} entradas." -f $grandAdded, $files, $grandEvents, $grandSkipped, $keep.Count)
