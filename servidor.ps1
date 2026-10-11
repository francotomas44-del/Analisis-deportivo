param(
  [int]$Port = 8766,
  [string]$Root = $PSScriptRoot
)
if (-not $Root -or $Root -eq "") { $Root = (Get-Location).Path }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "No se pudo iniciar el servidor en el puerto $Port."
  Write-Host "Puede que ya haya otro proceso usandolo. Cerralo o cambia el puerto."
  Write-Host $_.Exception.Message
  Read-Host "Enter para salir"
  exit 1
}

Write-Host "Analisis Deportivo - servidor local"
Write-Host "URL:  http://localhost:$Port/"
Write-Host "Carpeta: $Root"
Write-Host "Deja esta ventana abierta mientras usas la app. Cerrala para detener el servidor."
Write-Host ""

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $path = $req.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
    $full = Join-Path $Root $path
    # evita salir de la carpeta
    $fullResolved = [System.IO.Path]::GetFullPath($full)
    $rootResolved = [System.IO.Path]::GetFullPath($Root)
    if (-not $fullResolved.StartsWith($rootResolved)) {
      $ctx.Response.StatusCode = 403; $ctx.Response.Close(); continue
    }
    if (Test-Path $fullResolved -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($fullResolved)
      $ext = [System.IO.Path]::GetExtension($fullResolved).ToLower()
      $ct = switch ($ext) {
        ".html" { "text/html; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".js"   { "application/javascript; charset=utf-8" }
        ".json" { "application/json; charset=utf-8" }
        ".svg"  { "image/svg+xml" }
        ".png"  { "image/png" }
        ".ico"  { "image/x-icon" }
        default { "application/octet-stream" }
      }
      $ctx.Response.ContentType = $ct
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.Close()
  } catch {
    # sigue sirviendo ante errores puntuales
  }
}
