# 探测 WinRT 媒体相关类型能不能用 · probe-winrt.ps1
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools/probe-winrt.ps1

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Output '=== 载入 WinRT 类型 ==='
$types = @(
  'Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime',
  'Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime',
  'Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime',
  'Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime',
  'Windows.Graphics.Imaging.BitmapEncoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime',
  'Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime'
)
foreach ($t in $types) {
  $name = ($t -split ',')[0]
  try {
    $null = [type]::GetType($t, $true)
    # 用 PowerShell 的类型字面量方式再试一次
    $null = Invoke-Expression "[$t]"
    Write-Output "  OK   $name"
  } catch {
    Write-Output "  FAIL $name  → $($_.Exception.Message)"
  }
}

Write-Output ''
Write-Output '=== 载入 System.Runtime.WindowsRuntime ==='
try {
  $null = [System.Reflection.Assembly]::LoadWithPartialName('System.Runtime.WindowsRuntime')
  Write-Output '  OK'
} catch { Write-Output "  FAIL $($_.Exception.Message)" }

Write-Output ''
Write-Output '=== 检查 Windows.Graphics.Imaging 是否在系统里 ==='
$p = "$env:windir\System32\WinMetadata\Windows.Graphics.Imaging.winmd"
if (Test-Path $p) { Write-Output "  存在: $p" } else { Write-Output "  不存在: $p" }
