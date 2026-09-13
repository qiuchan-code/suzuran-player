@echo off
chcp 65001 >nul
title ?????
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1"
if errorlevel 1 (
  echo.
  echo   ???????????
  pause >nul
)
