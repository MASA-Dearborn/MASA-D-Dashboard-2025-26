@echo off
cd /d "%~dp0"
if not defined MASA_SERIAL_PORT set MASA_SERIAL_PORT=COM6
echo Starting MASA dashboard with Teensy on %MASA_SERIAL_PORT%...
start "MASA Backend (Teensy)" cmd /k "set MASA_SERIAL_PORT=%MASA_SERIAL_PORT% && %~dp0run_backend.bat"
timeout /t 2 /nobreak >nul
start "MASA Server" cmd /k "%~dp0run_server.bat"
timeout /t 2 /nobreak >nul
start "MASA Dashboard" cmd /k "set REACT_APP_TEENSY_MODE=true&& npm start"
echo.
echo Three windows opened. Close each window to stop that service.
