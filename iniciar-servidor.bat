@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   Analisis Deportivo - inicio del servidor local
echo ============================================================
echo.
echo   La app quedara en:  http://localhost:8766/
echo   IMPORTANTE: usa SIEMPRE esta direccion para que tus datos
echo   se guarden en el mismo lugar y no "desaparezcan".
echo.
echo   Se abrira una ventana minimizada con el servidor.
echo   Para detenerlo, cerra esa ventana.
echo.

start "Analisis Deportivo - Servidor" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" -Port 8766

timeout /t 2 /nobreak >nul
start "" http://localhost:8766/

echo   Listo. Si el navegador no abre solo, entra a mano a la URL.
echo.
timeout /t 3 /nobreak >nul
