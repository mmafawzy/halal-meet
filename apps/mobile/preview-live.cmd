@echo off
cd /d "%~dp0"
set EXPO_PUBLIC_API_MODE=live
if "%EXPO_PUBLIC_API_URL%"=="" set EXPO_PUBLIC_API_URL=http://localhost:3000
set BROWSER=none
if "%PORT%"=="" set PORT=8083
call npx expo start --web --port %PORT%
