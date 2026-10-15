param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$CacheDir = (Join-Path $env:TEMP "ofb-extra-futbolityx"),
  [int]$MaxFiles = 0
)

# PASO 2: agrega competiciones nuevas de los repos "por pais" de openfootball
# (data/openfootball-extra/<slug>.json, source = "openfootball-extra").
#
# Solo RESULTADOS (partidos jugados) de archivos .txt en formato Football.TXT:
#   = English Premier League 2010/11
#   * Matchday 1
#   Sat Aug 15
#     Arsenal FC   2-4   Norwich City FC
# o bien (con " v " y hora):
#     20:30  Bayern Munchen   v VfL Wolfsburg   2-1 (1-0)
#
# Los nombres se mapean al nombre EXACTO de la base (indice por liga -> global
# -> alias). Si un equipo no esta en la base y no se parece a ninguno
# (score < 0.60) se agrega como equipo nuevo. Los partidos que ya estan en la
# base (misma fecha y mismos equipos) se descartan para no duplicar.
#
# Uso:  powershell -File scripts\build-openfootball-extra.ps1 [-MaxFiles 20]

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

. (Join-Path $PSScriptRoot "espn-common.ps1")

$manPath = Join-Path $Root "data\manifest.json"
$manifest = Get-Content $manPath -Raw -Encoding UTF8 | ConvertFrom-Json
$config = Get-Content (Join-Path $PSScriptRoot "openfootball-extra.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$alias = Read-TeamAlias (Join-Path $PSScriptRoot "espn-team-alias.json")
$teamMapPath = Join-Path $PSScriptRoot "openfootball-extra-team-map.json"
$teamMap = $null
if (Test-Path $teamMapPath) { $teamMap = Get-Content $teamMapPath -Raw -Encoding UTF8 | ConvertFrom-Json }
$utf8 = New-Object System.Text.UTF8Encoding($false)

$outDir = Join-Path $Root "data\openfootball-extra"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$repoCache = Join-Path $CacheDir "repos"
$rawCache = Join-Path $CacheDir "raw"
New-Item -ItemType Directory -Force -Path $repoCache, $rawCache | Out-Null

function Get-CachedText([string]$Url, [string]$CacheFile) {
  if (Test-Path $CacheFile) {
    $c = Get-Content $CacheFile -Raw -Encoding UTF8
    if ($c) { return $c }
  }
  $headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  $txt = $null
  for ($i = 1; $i -le 3; $i++) {
    try { $r = Invoke-WebRequest -Uri $Url -Headers $headers -TimeoutSec 60 -UseBasicParsing; $txt = [string]$r.Content; break }
    catch { Start-Sleep -Seconds (2 * $i) }
  }
  if ($null -eq $txt) { return $null }
  [System.IO.File]::WriteAllText($CacheFile, $txt, $utf8)
  return $txt
}

function Get-RepoTree([string]$Repo) {
  $cf = Join-Path $repoCache ("tree-" + $Repo + ".json")
  $json = Get-CachedText ("https://api.github.com/repos/openfootball/" + $Repo + "/git/trees/master?recursive=1") $cf
  if (-not $json) { return @() }
  $j = $json | ConvertFrom-Json
  return @($j.tree | Where-Object { $_.type -eq "blob" -and ([string]$_.path).EndsWith(".txt") } | ForEach-Object { [string]$_.path })
}

$script:Months = @{ "Jan" = 1; "Feb" = 2; "Mar" = 3; "Apr" = 4; "May" = 5; "Jun" = 6; "Jul" = 7; "Aug" = 8; "Sep" = 9; "Oct" = 10; "Nov" = 11; "Dec" = 12 }

function Parse-FootballTxt([string]$text) {
  $res = New-Object System.Collections.Generic.List[object]
  $startY = 0; $endY = 0
  $curM = 0; $curD = 0; $curY = 0
  $inComment = $false
  foreach ($rawLine in ($text -split "`r`n|`n")) {
    $line = $rawLine
    if ($line.Contains("<!--")) { $inComment = $true }
    if ($inComment) {
      if ($line.Contains("-->")) { $inComment = $false }
      continue
    }
    $t = $line.Trim()
    if (-not $t) { continue }
    if ($t[0] -eq [char]0x23) {   # '#'
      if ($startY -eq 0 -and $t -match '(\d{4})') { $startY = [int]$Matches[1]; $endY = [int]$Matches[1] }
      continue
    }
    if ($t[0] -eq [char]0x3D) {   # '='
      $m = [regex]::Match($t, '(\d{4})(?:\s*[\/\-]\s*(\d{2,4}))?')
      if ($m.Success) {
        $y1 = [int]$m.Groups[1].Value
        $startY = $y1; $endY = $y1
        if ($m.Groups[2].Success) {
          $s2 = $m.Groups[2].Value
          if ($s2.Length -le 2) { $y2 = [int]([math]::Floor($y1 / 100) * 100 + [int]$s2) } else { $y2 = [int]$s2 }
          if ($y2 -lt $y1) { $y2 += 100 }
          $endY = $y2
        }
      }
      continue
    }
    $c0 = $t[0]
    if ($c0 -eq [char]0x25AA -or $c0 -eq [char]0x2022 -or $c0 -eq [char]0x00B7 -or $c0 -eq [char]0x2A) { continue }

    # linea de fecha: "Sat Aug 15" | "Thu Sep 19 2024" | "Nov 11"
    $dm = [regex]::Match($t, '^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s+)?([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:\s+(\d{4}))?\s*$')
    if ($dm.Success) {
      $mn = $dm.Groups[1].Value
      $mn = $mn.Substring(0, 1).ToUpper() + $mn.Substring(1).ToLower()
      if ($script:Months.ContainsKey($mn)) {
        $curM = $script:Months[$mn]
        $curD = [int]$dm.Groups[2].Value
        if ($dm.Groups[3].Success) { $curY = [int]$dm.Groups[3].Value }
        elseif ($startY -eq 0) { $curY = 0 }
        elseif ($curM -ge 7) { $curY = $startY }
        else { $curY = $endY }
      }
      continue
    }

    if ($curY -eq 0) { continue }
    $clean = $t
    $clean = $clean -replace '\s+@\s+.*$', ' '
    # Anotacion de goleadores: puede quedar SIN cerrar (se corta y continua en la
    # linea siguiente) o llevar solo UN espacio antes del parentesis; solo se
    # elimina cuando el parentesis alcanza el final de la linea (asi no se toca un
    # nombre con parentesis en medio) y se respeta el apendice de anios de algunos
    # clubes historicos ("Accrington FC (1878-1896)").
    $clean = $clean -replace '\s+\([^)]*$', ' '
    $clean = $clean -replace '\s+\((?!\d{4}-\d{4}\))\s*[^)]*\)\s*$', ' '
    $clean = $clean -replace '\[[^\]]*\]', ' '
    $clean = $clean.Trim()
    $ht = $null; $away = $null; $hg = 0; $ag = 0
    if ($clean.Contains(" v ")) {
      $m2 = [regex]::Match($clean, '^(?:\d{1,2}:\d{2}\s+)?(.+?)\s+v\s+(.+?)\s+(\d{1,2})\s*-\s*(\d{1,2})(?:\s*\(\s*\d{1,2}\s*-\s*\d{1,2}\s*\))?\s*$')
      if ($m2.Success) {
        $ht = $m2.Groups[1].Value.Trim(); $away = $m2.Groups[2].Value.Trim()
        $hg = [int]$m2.Groups[3].Value; $ag = [int]$m2.Groups[4].Value
      }
    } else {
      $m3 = [regex]::Match($clean, '^(?:\d{1,2}:\d{2}\s+)?(.+?)\s+(\d{1,2})\s*-\s*(\d{1,2})\s+(.+?)\s*$')
      if ($m3.Success) {
        $ht = $m3.Groups[1].Value.Trim(); $away = $m3.Groups[4].Value.Trim()
        $hg = [int]$m3.Groups[2].Value; $ag = [int]$m3.Groups[3].Value
      }
    }
    if (-not $ht -or -not $away) { continue }
    $res.Add([pscustomobject]@{ date = ("{0:D4}-{1:D2}-{2:D2}" -f $curY, $curM, $curD); home = $ht; away = $away; hg = $hg; ag = $ag })
  }
  return $res
}

function Resolve-NameExtra([string]$nm, [string]$code, $Index, $alias, $addedList) {
  # Memo por (codigo, nombre): un equipo aparece decenas de veces y buscar en el
  # indice global (~1.000 equipos) por partido haria el import inviable.
  $mk = "$code|$nm"
  if ($script:extraRes.ContainsKey($mk)) {
    $cv = $script:extraRes[$mk]
    if ($cv) { return $cv }
    return $null
  }
  $r = Resolve-TeamName $nm $code $Index $alias
  if ($r) { $script:extraRes[$mk] = $r; return $r }
  $tk = Get-TeamKey $nm
  $best = 0.0
  if ($code -and $Index.cKey[$code]) { $bi = Find-BestInfoFast $tk $Index.cKey[$code] $Index.cPfx[$code]; if ($bi.score -gt $best) { $best = $bi.score } }
  $bj = Find-BestInfoFast $tk $Index.gKey $Index.gPfx
  if ($bj.score -gt $best) { $best = $bj.score }
  if ($best -lt 0.60) { [void]$addedList.Add($nm); $script:extraRes[$mk] = $nm; return $nm }
  $script:extraRes[$mk] = $null
  return $null
}

function Get-MapTarget($map, [string]$slug, [string]$name) {
  # Mapa curado por slug (scripts/openfootball-extra-team-map.json). Fuerza el
  # nombre EXACTO de la base para abreviaturas que el resolutor no reconoce o
  # asigna mal (p. ej. "Meidericher" -> "MSV Duisburg", "Austria W" -> "Austria
  # Wien"). Si no hay entrada, devuelve $null y se usa el resolutor normal.
  if (-not $map -or -not $slug -or -not $name) { return $null }
  $s = $map.PSObject.Properties[$slug]
  if (-not $s) { return $null }
  $p = $s.Value.PSObject.Properties[$name]
  if (-not $p) { return $null }
  $t = [string]$p.Value
  if (-not $t) { return $null }
  return $t
}

Write-Host "Indice de la base..."
$Index = New-BaseIndex $Root $manifest
$extraRes = @{}

$slugs = @{}
$runSeen = New-Object 'System.Collections.Generic.HashSet[string]'
$trees = @{}
$filesDone = 0

foreach ($cfg in $config) {
  $repo = [string]$cfg.repo
  if (-not $trees.ContainsKey($repo)) { $trees[$repo] = @(Get-RepoTree $repo) }
  $paths = @($trees[$repo] | Where-Object { $_.Contains([string]$cfg.include) })
  if (($cfg.PSObject.Properties.Name -contains "name") -and $cfg.name) {
    $paths = @($paths | Where-Object { (($_ -split '/')[-1]) -match [string]$cfg.name })
  }

  $slug = [string]$cfg.slug
  if (-not $slugs.ContainsKey($slug)) {
    $slugs[$slug] = [pscustomobject]@{
      code = [string]$cfg.code; leagueCode = [string]$cfg.leagueCode
      rows = (New-Object System.Collections.Generic.List[object])
      added = (New-Object System.Collections.Generic.List[string])
      skipped = 0; dupes = 0; events = 0; files = 0
    }
  }
  $acc = $slugs[$slug]
  Write-Host ("[{0}] {1} :: {2} archivos" -f $slug, $cfg.include, $paths.Count)

  foreach ($p in $paths) {
    if ($MaxFiles -gt 0 -and $filesDone -ge $MaxFiles) { break }
    $rawKey = ($repo + "~" + ($p -replace '[\\/:*?"<>|]', '_'))
    $raw = Get-CachedText ("https://raw.githubusercontent.com/openfootball/" + $repo + "/master/" + $p) (Join-Path $rawCache ($rawKey + ".txt"))
    if ($null -eq $raw) { Write-Host ("   ! no se pudo bajar {0}" -f $p); continue }
    $acc.files++
    $filesDone++
    $parsed = Parse-FootballTxt $raw
    foreach ($mm in $parsed) {
      $acc.events++
      $hb = Get-MapTarget $teamMap $slug $mm.home
      if (-not $hb) { $hb = Resolve-NameExtra $mm.home $acc.leagueCode $Index $alias $acc.added }
      $ab = Get-MapTarget $teamMap $slug $mm.away
      if (-not $ab) { $ab = Resolve-NameExtra $mm.away $acc.leagueCode $Index $alias $acc.added }
      if (-not $hb -or -not $ab) { $acc.skipped++; continue }
      $k1 = Get-TeamKey $hb; $k2 = Get-TeamKey $ab
      $kk = "$k1|$k2"
      if ($k2 -lt $k1) { $kk = "$k2|$k1" }
      $key = "$($mm.date)|$kk"
      if ($Index.seen.Contains($key) -or $runSeen.Contains($key)) { $acc.dupes++; continue }
      [void]$runSeen.Add($key)
      $acc.rows.Add([pscustomobject]@{ date = $mm.date; team1 = $hb; team2 = $ab; score = [pscustomobject]@{ ft = @($mm.hg, $mm.ag) } })
    }
  }
}

# Escribe un JSON por slug y actualiza el manifiesto.
$keep = New-Object System.Collections.Generic.List[object]
foreach ($e in $manifest) { if ($e.source -eq "openfootball-extra") { continue }; $keep.Add($e) }

$totalAdded = 0
foreach ($slug in ($slugs.Keys | Sort-Object)) {
  $acc = $slugs[$slug]
  $uniq = @($acc.added | Sort-Object -Unique)
  if ($acc.rows.Count -gt 0) {
    $obj = [pscustomobject]@{ name = $acc.code; code = $acc.code; source = "openfootball-extra"; matches = $acc.rows }
    [System.IO.File]::WriteAllText((Join-Path $outDir "$slug.json"), (ConvertTo-Json -InputObject $obj -Depth 6), $utf8)
    $keep.Add([pscustomobject]@{ path = "$slug.json"; code = $acc.code; source = "openfootball-extra" })
    $totalAdded += $acc.rows.Count
  } elseif (Test-Path (Join-Path $outDir "$slug.json")) {
    Remove-Item (Join-Path $outDir "$slug.json") -Force
  }
  Write-Host ("{0,-12} {1,-42} archivos={2}  jugados={3}  nuevos={4}  duplicados={5}  descartados={6}  equiposNuevos={7}" -f $slug, $acc.code, $acc.files, $acc.events, $acc.rows.Count, $acc.dupes, $acc.skipped, $uniq.Count)
}

[System.IO.File]::WriteAllText($manPath, (ConvertTo-Json -InputObject $keep -Depth 6), $utf8)
Write-Host ""
Write-Host ("Listo: {0} partidos nuevos, manifiesto con {1} entradas." -f $totalAdded, $keep.Count)
