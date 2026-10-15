param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$FromYear = 2005,
  [int]$ToYear = (Get-Date).Year,
  [string]$CacheDir = (Join-Path $env:TEMP "espn-cache-futbolityx"),
  [string]$Only = ""
)

# LIGAS SUDAMERICANAS que la base todavia no traia, desde la API publica de
# ESPN (source = "espn-southamerica"). Completa el ecosistema de la
# CONMEBOL Libertadores / Sudamericana: los clubes de estos paises aparecian
# SOLO en las copas, asi que su historial domestico estaba vacio.
#
# Ligas y codigos: scripts/espn-southamerica.json
#   chi.1  Primera Division (Chile)      2005..hoy
#   uru.1  Primera Division (Uruguay)    2005..hoy
#   per.1  Liga 1 (Peru)                 2005..hoy
#   bol.1  Primera Division (Bolivia)    2005..hoy
#   ven.1  Primera Division (Venezuela)  2005..hoy
#
# - Se guardan los partidos JUGADOS (STATUS_FULL_TIME / STATUS_FINAL_PEN) de
#   todas las temporadas $FromYear..$ToYear.
# - Tambien los PROXIMOS (sin marcador, fecha de hoy en adelante) con su
#   horario, para que la portada "Hoy" los muestre con su pronostico (igual
#   que espn-sudamericana / espn-libertadores).
# - Los nombres de equipo se mapean al nombre EXACTO de la base con el indice
#   AMPLIADO (openfootball + arg-espn + openfootball-extra + las dos copas
#   CONMEBOL) y los mapas de alias de las copas: asi un club que ya existe
#   (p. ej. "Universidad Catolica (CHI)") NO queda partido en dos equipos. Si
#   un equipo no se reconoce se conserva el nombre de ESPN (equipo nuevo).
# - El archivo cambia en cada corrida (suma resultados y cruces), asi que su
#   entrada del manifiesto lleva `rev` (hash) y la app lo refresca con ?v=rev.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\build-espn-southamerica.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-espn-southamerica.ps1 -Only "chi.1,per.1"
#   (con -File, PowerShell no parte listas por coma: se pasa como un solo
#    string "chi.1,per.1" y el script lo separa.)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

. (Join-Path $PSScriptRoot "espn-common.ps1")

$source = "espn-southamerica"
$leagues = Get-Content (Join-Path $PSScriptRoot "espn-southamerica.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$onlyList = @("chi.1", "uru.1", "per.1", "bol.1", "ven.1")
if ($Only) { $onlyList = @($Only -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }

$finalStates = @("STATUS_FULL_TIME", "STATUS_FINAL_PEN")
$skipStates = @("STATUS_CANCELED", "STATUS_POSTPONED", "STATUS_ABANDONED", "STATUS_SUSPENDED")
$today = (Get-Date).ToString("yyyy-MM-dd")

$outDir = Join-Path $Root ("data\" + $source)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$manPath = Join-Path $Root "data\manifest.json"
$manifestRead = Get-Content $manPath -Raw -Encoding UTF8 | ConvertFrom-Json
# El manifiesto se mantiene SIEMPRE como List[object]: ConvertTo-Json (-InputObject)
# envuelve un Object[] crudo en {"value":[...]} (comportamiento de PS 5.1) y
# romperia el archivo.
$manifest = New-Object System.Collections.Generic.List[object]
foreach ($e in $manifestRead) { $manifest.Add($e) }
$alias = Read-TeamAlias (Join-Path $PSScriptRoot "espn-team-alias.json")
$saMap = Read-TeamAlias (Join-Path $PSScriptRoot "espn-sudamericana-team-map.json")
foreach ($k in $saMap.Keys) { $alias[$k] = $saMap[$k] }
$libMap = Read-TeamAlias (Join-Path $PSScriptRoot "espn-libertadores-team-map.json")
foreach ($k in $libMap.Keys) { $alias[$k] = $libMap[$k] }
$utf8 = New-Object System.Text.UTF8Encoding($false)

Write-Host "Indice de la base (openfootball + arg-espn + openfootball-extra + copas CONMEBOL)..."
$Index = New-BaseIndex $Root $manifest @("openfootball", "arg-espn", "openfootball-extra", "espn-sudamericana", "espn-libertadores")

$grandTotal = 0
foreach ($lg in $leagues) {
  $slug = [string]$lg.slug
  $code = [string]$lg.code
  $name = [string]$lg.name
  if ($onlyList -notcontains $code) { continue }

  $rows = New-Object System.Collections.Generic.List[object]
  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $newTeams = New-Object 'System.Collections.Generic.HashSet[string]'
  $results = 0; $fixtures = 0; $dropped = 0

  foreach ($yr in ($FromYear..$ToYear)) {
    $ev = Get-EspnEvents $slug $yr $CacheDir
    if ($null -eq $ev) { Write-Host ("{0} {1}  SIN RESPUESTA" -f $code, $yr); continue }
    $yRes = 0; $yFix = 0
    foreach ($e in $ev) {
      $st = ""
      if ($e.status -and $e.status.type) { $st = [string]$e.status.type.name }
      if ($skipStates -contains $st) { continue }
      $isFinal = $finalStates -contains $st

      if (-not $e.competitions -or $e.competitions.Count -eq 0) { continue }
      $cp = $e.competitions[0]
      if (-not $cp.competitors) { continue }

      # Fecha (YYYY-MM-DD) y horario (HH:MM UTC) a partir del ISO de ESPN.
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
    if ($yRes -or $yFix) { Write-Host ("  {0} {1}  jugados=+{2}  por jugar=+{3}  acumulado={4}" -f $code, $yr, $yRes, $yFix, $rows.Count) }
  }

  $outFile = Join-Path $outDir "$code.json"
  if ($rows.Count -gt 0) {
    $obj = [pscustomobject]@{ name = $name; code = $code; source = $source; matches = $rows }
    [System.IO.File]::WriteAllText($outFile, (ConvertTo-Json -InputObject $obj -Depth 6), $utf8)
  } elseif (Test-Path $outFile) {
    Remove-Item $outFile -Force
  }

  # Revision del contenido (SHA1 corto): la app la usa como query (?v=rev) para
  # refrescar el archivo cuando cambia (suma resultados y cruces por jugar).
  $rev = ""
  if ($rows.Count -gt 0) {
    $sha = [System.Security.Cryptography.SHA1]::Create()
    $hash = $sha.ComputeHash([System.IO.File]::ReadAllBytes($outFile))
    $rev = ([System.BitConverter]::ToString($hash) -replace "-", "").ToLower().Substring(0, 12)
  }

  # Manifiesto: reemplaza la entrada de este codigo (cualquier source previo).
  $keep = New-Object System.Collections.Generic.List[object]
  foreach ($e in $manifest) { if ([string]$e.code -eq $code) { continue }; $keep.Add($e) }
  if ($rows.Count -gt 0) { $keep.Add([pscustomobject]@{ path = "$code.json"; code = $code; source = $source; rev = $rev }) }
  $manifest = $keep

  $grandTotal += $rows.Count
  Write-Host ("-> {0}: {1} partidos ({2} jugados, {3} por jugar), {4} descartados, rev {5}" -f $name, $rows.Count, $results, $fixtures, $dropped, $rev)
  Write-Host ("   Equipos nuevos ({0}): {1}" -f $newTeams.Count, (($newTeams | Sort-Object) -join ", "))
}

[System.IO.File]::WriteAllText($manPath, (ConvertTo-Json -InputObject $manifest -Depth 6), $utf8)
Write-Host ""
Write-Host ("Listo: {0} partidos en data\{1}\  Manifest: {2} entradas." -f $grandTotal, $source, $manifest.Count)
