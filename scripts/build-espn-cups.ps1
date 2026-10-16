param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$FromYear = 2000,
  [int]$ToYear = (Get-Date).Year,
  [string]$CacheDir = (Join-Path $env:TEMP "espn-cache-futbolityx"),
  [string]$Only = ""
)

# COPA AMERICA + ELIMINATORIAS CONMEBOL + UEFA EUROPA / CONFERENCE LEAGUE
# (source = "espn-cups"): competiciones importantes que la base no traia.
# La base ya tenia las ligas y las copas de clubes CONMEBOL; estas quedaban
# afuera:
#   conmebol.america        Copa America                    (ESPN 2001..hoy)
#   fifa.worldq.conmebol    Eliminatorias Mundial CONMEBOL  (ESPN 2003..hoy)
#   uefa.europa             UEFA Europa League              (ESPN 2009..hoy)
#   uefa.europa.conf        UEFA Conference League          (ESPN 2021..hoy)
# Ligas y codigos: scripts/espn-cups.json
#
# - Se guardan los partidos JUGADOS (STATUS_FULL_TIME / STATUS_FINAL_PEN) y los
#   PROXIMOS (sin marcador, fecha de hoy en adelante) con su horario, para que la
#   portada "Hoy" los muestre con su pronostico (igual que espn-sudamericana /
#   espn-libertadores).
# - Los nombres de equipo se mapean al nombre EXACTO de la base con el indice
#   AMPLIADO (openfootball + arg-espn + openfootball-extra + las copas CONMEBOL +
#   espn-history/espn-season, donde viven los clubes de las 21 ligas y de la
#   Champions). Si un equipo no se reconoce se conserva el nombre de ESPN (nuevo).
# - Las copas de SELECCIONES (campo "national": true) usan su propio mapa alias:
#   ahi la base NO usa alias de clubes (seria un error: "peru" => "Perugia",
#   "austria" => "Austria Wien"). Solo hay un caso: la base no tiene la seleccion
#   "Venezuela" (nunca jugo un Mundial) y su unico equipo venezolano es el CLUB
#   "Atletico Venezuela", al que el resolutor difuso mapeaba la seleccion.
# - Las copas europeas usan el alias de clubes de ESPN (espn-team-alias.json, p.
#   ej. "FC Cologne" => "1. FC Koeln") + espn-cups-team-map.json (nombre en
#   ingles de ESPN -> nombre local de la base). Este ultimo incluye dos casos en
#   los que el resolutor difuso daba un falso positivo (por prefijo de palabra):
#   "Lillestrom" -> "Lille OSC" y "Riga FC" -> "Skonto Riga"; el alias los deja
#   con su nombre real.
# - De las copas europeas SOLO se guarda la FASE PRINCIPAL: el campo
#   "phaseExclude" del JSON descarta las rondas previas (qualifying, preliminary,
#   play-off round, play-offs, first round) mediante una lista negra. Las
#   competiciones de selecciones no lo usan (sus temporadas son clasificatorias).
# - El archivo cambia en cada corrida (suma resultados y cruces), asi que su
#   entrada del manifiesto lleva `rev` (hash) y la app lo refresca con ?v=rev.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\build-espn-cups.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-espn-cups.ps1 -Only "uefa.europa"
#   (con -File, PowerShell no parte listas por coma: se pasa como un solo
#    string "uefa.europa,uefa.europa.conf" y el script lo separa.)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

. (Join-Path $PSScriptRoot "espn-common.ps1")

$source = "espn-cups"
$leagues = Get-Content (Join-Path $PSScriptRoot "espn-cups.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$onlyList = @($leagues | ForEach-Object { [string]$_.code })
if ($Only) { $onlyList = @($Only -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }

$finalStates = @("STATUS_FULL_TIME", "STATUS_FINAL_PEN")
$skipStates = @("STATUS_CANCELED", "STATUS_POSTPONED", "STATUS_ABANDONED", "STATUS_SUSPENDED")
# Nombres que ESPN usa como comodin y que NO son equipos ("Bulgaria No. 3",
# "TBD", "Winner", ...): el partido se descarta.
$junkRe = [regex]'(?i)^\s*(tbd|winner|runner|loser)\b|\bno\.?\s*\d+\s*$'
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

# Alias de clubes (solo copas europeas): nombres en ingles de ESPN que la base
# guarda distinto.
$aliasClubs = Read-TeamAlias (Join-Path $PSScriptRoot "espn-team-alias.json")
$cupsMap = Read-TeamAlias (Join-Path $PSScriptRoot "espn-cups-team-map.json")
foreach ($k in $cupsMap.Keys) { $aliasClubs[$k] = $cupsMap[$k] }
# Competiciones de selecciones: ESPN acierta el nombre del pais y la base NO usa
# alias de clubes ahi (seria un error, p. ej. "peru" => "Perugia"). Unico caso:
# la base no tiene la seleccion "Venezuela" y el unico equipo venezolano es el
# CLUB "Atletico Venezuela", al que el resolutor difuso mapeaba los partidos.
$aliasNations = @{ "venezuela" = "Venezuela" }
$utf8 = New-Object System.Text.UTF8Encoding($false)

Write-Host "Indice de la base (openfootball + arg-espn + openfootball-extra + copas CONMEBOL + ligas ESPN)..."
# Incluye espn-history/espn-season: ahi viven los clubes de las 21 ligas de ESPN y
# de la Champions League (uefa.cl). Sin ellos, clubes ya presentes en la app
# (p. ej. "Hertha BSC", "CFR Cluj (ROU)", "Rosenborg", "Hajduk Split") se
# volverian a crear con el nombre en ingles de ESPN ("Hertha Berlin"...).
$Index = New-BaseIndex $Root $manifest @("openfootball", "arg-espn", "openfootball-extra", "espn-sudamericana", "espn-libertadores", "espn-history", "espn-season")

$grandTotal = 0
foreach ($lg in $leagues) {
  $slug = [string]$lg.slug
  $code = [string]$lg.code
  $name = [string]$lg.name
  if ($onlyList -notcontains $code) { continue }

  $isNational = $false
  if ($lg.PSObject.Properties.Name -contains "national") { $isNational = [bool]$lg.national }
  $alias = $aliasClubs
  if ($isNational) { $alias = $aliasNations }

  # Filtro de fase (opcional, campo "phaseExclude"): regex contra season.slug.
  # Las copas europeas usan una LISTA NEGRA (fail-open) para quedarse con la fase
  # principal y saltear la previa: "qualif|prelimin|first-round|^play-?offs?$|^play-off-round$".
  # Ojo: "knockout-round-playoffs" (dieciseisavos de la fase principal) NO debe
  # caer; por eso los "play-offs" van anclados al slug completo. No se usa en las
  # competiciones de selecciones (sus temporadas son clasificatorias).
  $phaseRe = $null
  if ($lg.PSObject.Properties.Name -contains "phaseExclude") {
    $phaseRe = [regex]([string]$lg.phaseExclude)
  }

  $rows = New-Object System.Collections.Generic.List[object]
  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  $newTeams = New-Object 'System.Collections.Generic.HashSet[string]'
  $results = 0; $fixtures = 0; $dropped = 0; $skippedPhase = 0

  foreach ($yr in ($FromYear..$ToYear)) {
    $ev = Get-EspnEvents $slug $yr $CacheDir
    if ($null -eq $ev) { Write-Host ("{0} {1}  SIN RESPUESTA" -f $code, $yr); continue }
    $yRes = 0; $yFix = 0
    foreach ($e in $ev) {
      $st = ""
      if ($e.status -and $e.status.type) { $st = [string]$e.status.type.name }
      if ($skipStates -contains $st) { continue }
      $isFinal = $finalStates -contains $st

      # Filtro de fase (fase principal vs previa).
      if ($phaseRe) {
        $ss = ""
        if ($e.season -and $e.season.slug) { $ss = [string]$e.season.slug }
        if ($phaseRe.IsMatch($ss)) { $skippedPhase++; continue }
      }

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
        # ESPN devuelve -1 cuando no tiene el marcador: no es un resultado valido.
        if ($isFinal -and (-not [int]::TryParse([string]$c.score, [ref]$sv) -or $sv -lt 0)) { $bad = $true; break }
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
      # Nombres comodin de ESPN ("Bulgaria No. 3"): no son equipos.
      if ($junkRe.IsMatch($rawH) -or $junkRe.IsMatch($rawA)) { $dropped++; continue }

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
  Write-Host ("-> {0}: {1} partidos ({2} jugados, {3} por jugar), {4} descartados, {5} de previa, rev {6}" -f $name, $rows.Count, $results, $fixtures, $dropped, $skippedPhase, $rev)
  Write-Host ("   Equipos nuevos ({0}): {1}" -f $newTeams.Count, (($newTeams | Sort-Object) -join ", "))
}

[System.IO.File]::WriteAllText($manPath, (ConvertTo-Json -InputObject $manifest -Depth 6), $utf8)
Write-Host ""
Write-Host ("Listo: {0} partidos en data\{1}\  Manifest: {2} entradas." -f $grandTotal, $source, $manifest.Count)
