@echo off
cd /d "%~dp0"
echo Starting MASA dashboard (backend + bridge + React)...
start "MASA Backend" cmd /k "%~dp0run_backend.bat" --simulator
timeout /t 2 /nobreak >nul
start "MASA Server" cmd /k "%~dp0run_server.bat"
timeout /t 2 /nobreak >nul
start "MASA Dashboard" cmd /k npm start
echo.
echo Three windows opened. Close each window to stop that service.
