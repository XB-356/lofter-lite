@echo off
setlocal
cd /d "%~dp0"

rem LOFTER Lite 测试端 launcher (build with built-in csc.exe, no SDK required)
if exist "desktop\LOFTER-Lite-Launcher.exe" goto run

echo [build] compiling desktop launcher ...
powershell -NoProfile -ExecutionPolicy Bypass -File "desktop\build.ps1"
if errorlevel 1 (
  echo [error] build failed
  pause
  exit /b 1
)

:run
start "" "desktop\LOFTER-Lite-Launcher.exe"
exit /b 0
