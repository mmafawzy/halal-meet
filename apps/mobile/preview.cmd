@echo off
cd /d "%~dp0"
set EXPO_PUBLIC_API_MODE=mock
set BROWSER=none
if "%PORT%"=="" set PORT=8081
call npx expo start --web --port %PORT%
