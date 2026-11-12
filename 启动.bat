@echo off
cd /d "%~dp0"
title guitar-tabs
where python >nul 2>&1 && set "PY=python" && goto serve
where py >nul 2>&1 && set "PY=py" && goto serve
echo Python was not found.
echo Install Python 3 from https://www.python.org/downloads/
echo Tick "Add python.exe to PATH", then double-click this file again.
pause
exit /b 1

:serve
echo.
powershell -NoProfile -Command "Write-Host (-join ([char]0x7535,[char]0x8111,[char]0x6D4F,[char]0x89C8,[char]0x5668,[char]0x6253,[char]0x5F00) + ': http://127.0.0.1:8765/')"
powershell -NoProfile -Command "Write-Host (-join ([char]0x8FD9,[char]0x4E2A,[char]0x7A97,[char]0x53E3,[char]0x8981,[char]0x4E00,[char]0x76F4,[char]0x5F00,[char]0x7740,[char]0x3002,[char]0x5173,[char]0x6389,[char]0xFF0C,[char]0x7F51,[char]0x9875,[char]0x5C31,[char]0x6253,[char]0x4E0D,[char]0x5F00,[char]0x4E86,[char]0x3002))"
echo Phone: same network, port 8765. Allow the firewall prompt.
echo Use Ethernet or Wi-Fi. Skip VMware and Radmin:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } | ForEach-Object { 'http://' + $_.IPAddress + ':8765/' }"
echo.
start "" cmd /c "ping -n 2 127.0.0.1 >nul & start http://127.0.0.1:8765/"
%PY% -m http.server 8765 --bind 0.0.0.0
echo.
echo Server stopped. If the port is already in use, open http://127.0.0.1:8765/
pause
