# Servidor LAN de Futbolityx - sirve la app a tu red WiFi/local.
# Usa TcpListener (socket crudo) en 0.0.0.0 para poder escuchar en la red
# SIN permisos de administrador (HttpListener no lo permite fuera de localhost).
#
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File servidor-lan.ps1 -Port 8766
param(
  [int]$Port = 8766,
  [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) { $Root = (Get-Location).Path }
$rootResolved = [System.IO.Path]::GetFullPath($Root)

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
try {
  $listener.Start()
} catch {
  Write-Host "No se pudo iniciar el servidor en el puerto $Port."
  Write-Host "Puede que ya haya otro proceso usandolo. Cerralo o cambia el puerto."
  Write-Host $_.Exception.Message
  Read-Host "Enter para salir"
  exit 1
}

$ips = @()
try {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress
} catch {}

Write-Host "Futbolityx - servidor de red (WiFi/LAN)"
Write-Host "En esta PC:            http://localhost:$Port/"
foreach ($ip in $ip) { Write-Host "Para tus amigos (misma red):  http://${ip}:$Port/" }
Write-Host "Carpeta: $Root"
Write-Host "Dejá esta ventana abierta mientras la usas. Cerrala para detener el servidor."
Write-Host ""

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".gif"  = "image/gif"
  ".ico"  = "image/x-icon"
  ".txt"  = "text/plain; charset=utf-8"
  ".map"  = "application/json"
  ".woff" = "font/woff"
  ".woff2" = "font/woff2"
}
$rootResolved = [System.IO.Path]::GetFullPath($Root)

while ($true) {
  $client = $null
  try {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()

    # Lee la primera línea (request line) y drena la cabecera.
    $sr = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $line = $sr.ReadLine()
    if (-not $line) { continue }
    $parts = $line.Split(' ')
    $method = $parts[0]
    $rawPath = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
    $h = ''
    do { $h = $sr.ReadLine() } while ($h -ne $null -and $h -ne "")

    $q = $rawPath.IndexOf('?')
    if ($q -ge 0) { $rawPath = $rawPath.Substring(0, $q) }
    $path = [System.Uri]::UnescapeDataString($rawPath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }

    $full = [System.IO.Path]::GetFullPath((Join-Path $rootResolved $path))
    $status = "200 OK"
    $ctype = "application/octet-stream"
    $body = $null

    if (-not $full.StartsWith($rootResolved)) {
      $status = "403 Forbidden"
      $body = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
      $ctype = "text/plain; charset=utf-8"
    } elseif (Test-Path $full -PathType Leaf) {
      $body = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      if ($mime.ContainsKey($ext)) { $ctype = $mime[$ext] }
    } else {
      $status = "404 Not Found"
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $ctype = "text/plain; charset=utf-8"
    }

    $header = "HTTP/1.1 $status`r`n" +
              "Content-Type: $ctype`r`n" +
              "Content-Length: $($body.Length)`r`n" +
              "Cache-Control: no-store`r`n" +
              "Connection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($hb, 0, $hb.Length)
    if ($method -ne "HEAD") { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
  } catch {
    # sigue sirviendo ante errores puntuales
  } finally {
    if ($client) { try { $client.Close() } catch {} }
  }
}
