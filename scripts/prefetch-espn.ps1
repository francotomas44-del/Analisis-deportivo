param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$CacheDir = (Join-Path $env:TEMP "espn-cache-futbolityx"),
  [int]$FromYear = 2000,
  [int]$ToYear = 2011,
  [int]$Throttle = 8
)

# Pre-carga en paralelo la cache de ESPN (scoreboards por liga/anio) para que
# scripts\build-espn-history.ps1 y scripts\build-espn-season.ps1 corran rapido.
#
# Guarda el cuerpo CRUDO de la respuesta de ESPN en
#   %TEMP%\espn-cache-futbolityx\<slug>-<year>.json
# (es compatible con la cache que escribe espn-common.ps1: ambos tienen .events).

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

Add-Type -AssemblyName System.Net.Http | Out-Null

$leagues = Get-Content (Join-Path $PSScriptRoot "espn-leagues.json") -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

$pending = New-Object System.Collections.Generic.List[object]
foreach ($lg in $leagues) {
  foreach ($y in $FromYear..$ToYear) {
    $cf = Join-Path $CacheDir ("$($lg.slug)-$y.json")
    if (Test-Path $cf) { continue }
    $pending.Add([pscustomobject]@{
      slug = [string]$lg.slug
      year = $y
      url  = "https://site.api.espn.com/apis/site/v2/sports/soccer/$($lg.slug)/scoreboard?limit=1000&dates=$y"
      file = $cf
    })
  }
}

Write-Host ("A bajar: {0} scoreboards (cache en {1})" -f $pending.Count, $CacheDir)
if ($pending.Count -eq 0) { Write-Host "Nada que hacer."; return }

$handler = New-Object System.Net.Http.HttpClientHandler
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(120)
[void]$client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
$utf8 = New-Object System.Text.UTF8Encoding($false)

$done = 0; $ok = 0; $fail = 0
$i = 0
while ($i -lt $pending.Count) {
  $last = [math]::Min($i + $Throttle - 1, $pending.Count - 1)
  $batch = @($pending[$i..$last])
  $jobs = @()
  foreach ($it in $batch) {
    $jobs += [pscustomobject]@{ item = $it; task = $client.GetStringAsync($it.url) }
  }
  foreach ($x in $jobs) {
    $done++
    try {
      $body = $x.task.GetAwaiter().GetResult()
      if ($body) {
        [System.IO.File]::WriteAllText($x.item.file, $body, $utf8)
        $ok++
      } else { $fail++ }
    } catch { $fail++ }
  }
  if (($done % 40) -lt $Throttle) { Write-Host ("  {0}/{1}  ok={2} fallos={3}" -f $done, $pending.Count, $ok, $fail) }
  $i += $Throttle
}

Write-Host ("Listo: {0} bajados, {1} fallos. Cache: {2}" -f $ok, $fail, $CacheDir)
