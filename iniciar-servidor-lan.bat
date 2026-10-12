@echo off
chcp 65001 >nul
title Futbolityx - Servidor para red (WiFi)
cd /d "%~dp0"

echo =========================================================
echo    Futbolityx - servidor para tu red WiFi / local
echo =========================================================
echo.
echo  Deja esta ventana ABIERTA mientras tus amigos usan la app.
echo  Al cerrarla, el servidor se detiene.
echo.
echo  Este script muestra arriba la IP; el link para compartir es:
echo      http://TU-IP-LOCAL:8766/
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor-lan.ps1" -Port 8766

echo.
echo Servidor detenido.
pause
