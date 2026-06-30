@echo off
title DolvinBash - Local Server
cd /d "%~dp0"

echo.
echo  DolvinBash local server starting...
echo  Open: http://localhost:8765
echo  Close this window to stop the server.
echo.

start "" "http://localhost:8765"
python -m http.server 8765
