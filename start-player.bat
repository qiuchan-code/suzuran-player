@echo off
chcp 65001 >nul
title Suzuran Player
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0src\launcher.ps1"
if errorlevel 1 (
  echo.
  echo   Failed to start. Press any key to close.
  pause >nul
)
