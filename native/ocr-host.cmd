@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where py >nul 2>&1
if %ERRORLEVEL%==0 (
  py -3 -u "%~dp0ocr-host.py"
  exit /b %ERRORLEVEL%
)
where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python -u "%~dp0ocr-host.py"
  exit /b %ERRORLEVEL%
)
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0ocr-host.ps1"
