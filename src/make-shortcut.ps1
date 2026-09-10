# 创建桌面快捷方式 · make-shortcut.ps1
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File src\make-shortcut.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $Root 'start-player.bat'
$Desktop = [Environment]::GetFolderPath('Desktop')
$Link = Join-Path $Desktop '铃兰播放器.lnk'

if (-not (Test-Path $Target)) { Write-Host "找不到 $Target" -ForegroundColor Red; exit 1 }

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($Link)
$sc.TargetPath = $Target
$sc.WorkingDirectory = $Root
$sc.Description = '铃兰播放器 · 实时歌词 + 计时器'
$sc.WindowStyle = 1
# 用系统图标里比较像"音乐"的一个
$sc.IconLocation = "$env:SystemRoot\System32\imageres.dll,171"
$sc.Save()

Write-Host "  已创建快捷方式：$Link" -ForegroundColor Green
Write-Host "  指向：$Target" -ForegroundColor DarkGray
