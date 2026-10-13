# ============================================================================
#  espn-common.ps1 - utilidades compartidas por los builds de ESPN de Futbolityx
#  (normalizacion/mapeo de nombres, indices de equipos de la base y descarga
#   de la API publica de ESPN con cache en disco).
#
#  Se usa con:  . (Join-Path $PSScriptRoot "espn-common.ps1")
#  Solo ASCII: los textos acentuados viven en JSON leidos con -Encoding UTF8.
# ----------------------------------------------------------------------------

$script:EspnHeaders = @{
  "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
  "Accept"     = "application/json"
}

# Tokens genericos de club que no distinguen equipos ("FC", "CF", "AC"...).
$script:EspnTokens = @("fc","cf","ac","sc","cd","ud","sd","sad","sdc","cc","as","ss","ssc",
  "sv","vfl","vfb","tsg","bsc","fk","sk","if","bk","ff","cp","ca","ec","afc",
  "calcio","club","football","futebol","clube","utd","recreativo")

function Get-Norm([string]$n) { return ([string]$n).Trim().ToLower() }

# Clave canonica: minusculas, sin diacriticos ni parentesis, sin tokens genericos.
function Get-TeamKey([string]$n) {
  if ($null -eq $n) { return "" }
  $s = $n.ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
  $s = $s -replace '\p{Mn}', ''
  # Letras que NO se descomponen en FormD (se ponen por codigo para mantener el .ps1 en ASCII):
  $s = $s -replace ([string][char]0x0131), 'i'   # i sin punto
  $s = $s -replace ([string][char]0x0142), 'l'   # l con barra
  $s = $s -replace ([string][char]0x00F8), 'o'   # o con barra
  $s = $s -replace ([string][char]0x0111), 'd'   # d con barra
  $s = $s -replace ([string][char]0x00F0), 'd'   # eth
  $s = $s -replace ([string][char]0x00FE), 'th'  # thorn
  $s = $s -replace ([string][char]0x00E6), 'ae'  # ae
  $s = $s -replace ([string][char]0x0153), 'oe'  # oe
  $s = $s -replace ([string][char]0x00DF), 'ss'  # eszett
  $s = $s -replace '\([^)]*\)', ' '
  $s = $s -replace '[^a-z0-9 ]', ' '
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($p in ($s -split '\s+')) { if ($p -and ($script:EspnTokens -notcontains $p)) { [void]$out.Add($p) } }
  return ($out -join " ")
}

function Get-Dice([string]$a, [string]$b) {
  if ($a -eq $b) { return 1.0 }
  if (-not $a -or -not $b) { return 0.0 }
  $setA = New-Object 'System.Collections.Generic.HashSet[string]'
  $aa = " " + $a + " "
  for ($i = 0; $i -lt $aa.Length - 1; $i++) { [void]$setA.Add($aa.Substring($i, 2)) }
  $setB = New-Object 'System.Collections.Generic.HashSet[string]'
  $bb = " " + $b + " "
  for ($i = 0; $i -lt $bb.Length - 1; $i++) { [void]$setB.Add($bb.Substring($i, 2)) }
  if ($setA.Count -eq 0 -or $setB.Count -eq 0) { return 0.0 }
  $inter = 0
  foreach ($g in $setA) { if ($setB.Contains($g)) { $inter++ } }
  return (2.0 * $inter) / ($setA.Count + $setB.Count)
}

# Similitud: mezcla Dice con cobertura de tokens (tolera abreviaturas:
# "Lyon" ~ "Olympique Lyonnais", "Mainz" ~ "Mainz 05").
function Get-Score([string]$ka, [string]$kb) {
  if ($ka -eq $kb) { return 1.0 }
  $d = Get-Dice $ka $kb
  $ta = @($ka -split '\s+' | Where-Object { $_ })
  $tb = @($kb -split '\s+' | Where-Object { $_ })
  # Cobertura SOLO del nombre de entrada (ka) contra el candidato (kb): tolera
  # abreviaturas ("Dortmund" ~ "Borussia Dortmund", "Lyon" ~ "Olympique
  # Lyonnais") pero evita el falso positivo inverso ("Inter Miami" -> "Inter",
  # donde "inter" cubre todo el candidato pero se pierde "miami").
  $cov = 0.0
  if ($ta.Count -gt 0) {
    $hit = 0
    foreach ($t in $ta) {
      $found = $false
      foreach ($u in $tb) {
        if ($t -eq $u) { $found = $true; break }
        if ($t.Length -ge 4 -and $u.Length -ge 4 -and ($u.StartsWith($t) -or $t.StartsWith($u))) { $found = $true; break }
      }
      if ($found) { $hit++ }
    }
    $cov = $hit / $ta.Count
  }
  # El termino minusculo con Dice desempata cuando dos candidatos llegan a la
  # misma cobertura (1.0): gana el de mayor similitud real, p. ej. "Bayern" ->
  # "Bayern Munchen" antes que "Bayer Leverkusen".
  return [Math]::Max($d, $cov) + ($d * 0.000001)
}

function Build-KeyIndex($normMap) {
  $kid = @{}
  foreach ($kv in $normMap.GetEnumerator()) {
    $k = Get-TeamKey $kv.Key
    if ($k -and -not $kid.ContainsKey($k)) { $kid[$k] = $kv.Value }
  }
  return $kid
}

function Find-Best([string]$tk, $kid, [double]$threshold) {
  if (-not $tk) { return $null }
  if ($kid.ContainsKey($tk)) { return $kid[$tk] }
  $best = $null; $bestScore = 0.0
  foreach ($kk in $kid.Keys) {
    $s = Get-Score $tk $kk
    if ($s -gt $bestScore) { $bestScore = $s; $best = $kid[$kk] }
  }
  if ($bestScore -ge $threshold) { return $best }
  return $null
}

function Find-BestInfo([string]$tk, $kid) {
  $best = $null; $bestScore = 0.0
  foreach ($kk in $kid.Keys) {
    $s = Get-Score $tk $kk
    if ($s -gt $bestScore) { $bestScore = $s; $best = $kid[$kk] }
  }
  return @{ name = $best; score = [math]::Round($bestScore, 2) }
}

# --- Indice invertido token-prefijo -> claves -----------------------------------
# Comparar cada nombre contra TODO el universo de equipos (~1.000) hace inviable
# importar ligas/copas por pais. Como la similitud por tokens solo enlaza palabras
# iguales o con prefijo comun (>=4 letras), indexamos cada prefijo de cada token de
# cada clave y buscamos solo los candidatos que comparten algun prefijo.
function Build-PrefixIndex($kid) {
  $pfx = @{}
  foreach ($kk in $kid.Keys) {
    foreach ($t in ($kk -split '\s+')) {
      if ($t.Length -lt 4) { continue }
      for ($L = 4; $L -le $t.Length; $L++) {
        $p = $t.Substring(0, $L)
        if (-not $pfx.ContainsKey($p)) { $pfx[$p] = New-Object 'System.Collections.Generic.HashSet[string]' }
        [void]$pfx[$p].Add($kk)
      }
    }
  }
  return $pfx
}

function Get-PrefixCandidates([string]$tk, $pfx) {
  $res = New-Object 'System.Collections.Generic.HashSet[string]'
  if (-not $pfx) { return $res }
  foreach ($t in ($tk -split '\s+')) {
    if ($t.Length -lt 4) { continue }
    for ($L = 4; $L -le $t.Length; $L++) {
      $hit = $pfx[$t.Substring(0, $L)]
      if ($hit) { foreach ($kk in $hit) { [void]$res.Add($kk) } }
    }
  }
  return $res
}

function Find-BestFast([string]$tk, $kid, $pfx, [double]$threshold) {
  if (-not $tk) { return $null }
  if ($kid.ContainsKey($tk)) { return $kid[$tk] }
  $best = $null; $bestScore = 0.0
  foreach ($kk in (Get-PrefixCandidates $tk $pfx)) {
    if (-not $kid.ContainsKey($kk)) { continue }
    $s = Get-Score $tk $kk
    if ($s -gt $bestScore) { $bestScore = $s; $best = $kid[$kk] }
  }
  if ($bestScore -ge $threshold) { return $best }
  return $null
}

function Find-BestInfoFast([string]$tk, $kid, $pfx) {
  if (-not $tk) { return @{ name = $null; score = 0.0 } }
  if ($kid.ContainsKey($tk)) { return @{ name = $kid[$tk]; score = 1.0 } }
  $best = $null; $bestScore = 0.0
  foreach ($kk in (Get-PrefixCandidates $tk $pfx)) {
    if (-not $kid.ContainsKey($kk)) { continue }
    $s = Get-Score $tk $kk
    if ($s -gt $bestScore) { $bestScore = $s; $best = $kid[$kk] }
  }
  return @{ name = $best; score = [math]::Round($bestScore, 2) }
}

# Construye los indices de equipos de la base en el mismo orden en que
# js/dataset.js los importa (por `path`). Por defecto incluye la historia
# openfootball y la liga argentina (arg-espn). Devuelve:
#   gNorm/gKey  -> universo completo (todas las competiciones); usado para mapear
#   cNorm/cKey  -> por codigo de competicion (mapeo mas preciso dentro de la liga)
#   cMin/cMax   -> primera/ultima fecha con resultado por codigo
#   seen        -> set "fecha|claveEquipoA|claveEquipoB" (sin orden) de todos los
#                  partidos ya presentes, para no volver a agregarlos
function New-BaseIndex([string]$Root, $Manifest, [string[]]$Sources = @("openfootball", "arg-espn")) {
  $gNorm = @{}; $cNorm = @{}; $cMin = @{}; $cMax = @{}
  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $entries = @($Manifest | Where-Object { $Sources -contains ([string]$_.source) } | Sort-Object path)
  foreach ($entry in $entries) {
    $code = [string]$entry.code
    if (-not $cNorm.ContainsKey($code)) { $cNorm[$code] = @{}; $cMin[$code] = ""; $cMax[$code] = "" }
    $fp = Join-Path $Root ("data\" + [string]$entry.source + "\" + $entry.path)
    if (-not (Test-Path $fp)) { continue }
    $payload = Get-Content $fp -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($m in @($payload.matches)) {
      if (-not $m.team1 -or -not $m.team2) { continue }
      foreach ($nm in @($m.team1, $m.team2)) {
        $k = Get-Norm $nm; $v = ([string]$nm).Trim()
        if ($k -and -not $gNorm.ContainsKey($k)) { $gNorm[$k] = $v }
        if ($k -and -not $cNorm[$code].ContainsKey($k)) { $cNorm[$code][$k] = $v }
      }
      $scored = $false
      if ($m.score) {
        if ($m.score.ft) { $scored = $true } elseif ($m.score -is [System.Array]) { $scored = $true }
      }
      if ($scored) {
        $d = [string]$m.date
        if ($d) {
          if ($d -gt $cMax[$code]) { $cMax[$code] = $d }
          if ($cMin[$code] -eq "" -or $d -lt $cMin[$code]) { $cMin[$code] = $d }
          $k1 = Get-TeamKey $m.team1; $k2 = Get-TeamKey $m.team2
          $kk = "$k1|$k2"
          if ($k2 -lt $k1) { $kk = "$k2|$k1" }
          [void]$seen.Add("$d|$kk")
        }
      }
    }
  }
  $gKey = Build-KeyIndex $gNorm
  $cKey = @{}
  foreach ($code in $cNorm.Keys) { $cKey[$code] = Build-KeyIndex $cNorm[$code] }
  $gPfx = Build-PrefixIndex $gKey
  $cPfx = @{}
  foreach ($code in $cKey.Keys) { $cPfx[$code] = Build-PrefixIndex $cKey[$code] }
  return @{ gNorm = $gNorm; gKey = $gKey; gPfx = $gPfx; cNorm = $cNorm; cKey = $cKey; cPfx = $cPfx; cMin = $cMin; cMax = $cMax; seen = $seen }
}

# Clave anti-duplicado de un partido: "fecha|claveA|claveB" (claves ordenadas).
function New-MatchKey([string]$Date, [string]$A, [string]$B) {
  $k1 = Get-TeamKey $A; $k2 = Get-TeamKey $B
  if ($k2 -lt $k1) { return "$Date|$k2|$k1" }
  return "$Date|$k1|$k2"
}

# Descarga (o lee de cache) el scoreboard de una liga/anio de ESPN.
# Devuelve un arreglo de eventos, o $null si la descarga fallo.
function Get-EspnEvents([string]$Slug, [int]$Year, [string]$CacheDir) {
  if (-not (Test-Path $CacheDir)) { New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null }
  $cf = Join-Path $CacheDir ("$Slug-$Year.json")
  if (Test-Path $cf) {
    try {
      $j = Get-Content $cf -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($j) { if ($j.events) { return @($j.events) } else { return @() } }
    } catch { }
  }
  $url = "https://site.api.espn.com/apis/site/v2/sports/soccer/$Slug/scoreboard?limit=1000&dates=$Year"
  $data = $null
  for ($try = 1; $try -le 3; $try++) {
    try { $data = Invoke-RestMethod -Uri $url -Headers $script:EspnHeaders -TimeoutSec 90; break }
    catch { Start-Sleep -Seconds (4 * $try) }
  }
  if ($null -eq $data) { return $null }
  $ev = @()
  if ($data.events) { $ev = @($data.events) }
  $payload = [pscustomobject]@{ slug = $Slug; year = $Year; events = $ev }
  [System.IO.File]::WriteAllText($cf, (ConvertTo-Json -InputObject $payload -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
  return $ev
}

# Mapea un nombre de ESPN al nombre EXACTO de la base (o $null si no se reconoce).
function Resolve-TeamName([string]$n, [string]$code, $Index, $Alias) {
  if (-not $n) { return $null }
  $nk = Get-Norm $n
  if ($Alias.ContainsKey($nk)) { return $Alias[$nk] }
  $idx = $Index.cNorm[$code]; $kid = $Index.cKey[$code]
  if ($idx -and $idx.ContainsKey($nk)) { return $idx[$nk] }
  $tk = Get-TeamKey $n
  if ($kid) { $r = Find-BestFast $tk $kid $Index.cPfx[$code] 0.79; if ($r) { return $r } }
  if ($Index.gNorm.ContainsKey($nk)) { return $Index.gNorm[$nk] }
  $r = Find-BestFast $tk $Index.gKey $Index.gPfx 0.86
  if ($r) { return $r }
  return $null
}

function Format-Diagnose([string]$n, [string]$code, $Index) {
  $tk = Get-TeamKey $n
  if ($Index.cKey[$code]) {
    $i = Find-BestInfoFast $tk $Index.cKey[$code] $Index.cPfx[$code]
    if ($i.name -and $i.score -ge 0.5) { return "$n => $($i.name) ($($i.score))" }
  }
  $j = Find-BestInfoFast $tk $Index.gKey $Index.gPfx
  if ($j.name) { return "$n => $($j.name) ($($j.score)) [global]" }
  return "$n => ???"
}

# Lee el mapa de alias (scripts/espn-team-alias.json) a una tabla norm->nombre.
function Read-TeamAlias([string]$Path) {
  $alias = @{}
  if (Test-Path $Path) {
    $aj = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($p in $aj.PSObject.Properties) { $alias[$p.Name.Trim().ToLower()] = [string]$p.Value }
  }
  return $alias
}
