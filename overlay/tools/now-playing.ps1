# 读取当前系统媒体会话（SMTC / GSMTC）
# -------------------------------------
# 只读，不改任何东西；Windows 11 自带 API，不需要管理员权限。
#
# 用法（注意本文件必须是 UTF-8 **带 BOM**，否则 PowerShell 5.1 会把中文当 ANSI）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\now-playing.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\now-playing.ps1 -Watch
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\now-playing.ps1 -List

param(
  [switch]$Watch,
  [switch]$List,
  [string]$App = ''
)

$ErrorActionPreference = 'Stop'

# 输出用 UTF-8，否则 Node 侧读到的中文是乱码（PowerShell 5.1 默认走 OEM 代码页）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# WinRT 投影 + 异步等待器
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [System.Reflection.Assembly]::LoadWithPartialName('System.Runtime.WindowsRuntime')

# 找到单参数的 AsTask(IAsyncOperation<T>) 重载
$asyncOpName = 'IAsyncOperation' + [char]96 + '1'
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq $asyncOpName
  } | Select-Object -First 1

if ($null -eq $asTask) { throw '找不到 AsTask(IAsyncOperation<T>) 重载' }

function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

function Get-SessionManager {
  Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
        ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
}

function Read-Session($session) {
  $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $info = $session.GetPlaybackInfo()
  $tl = $session.GetTimelineProperties()
  [pscustomobject]@{
    App      = $session.SourceAppUserModelId
    Status   = $info.PlaybackStatus
    Title    = $props.Title
    Artist   = $props.Artist
    Album    = $props.AlbumTitle
    Position = $tl.Position.TotalSeconds
    Duration = $tl.EndTime.TotalSeconds
    Cover    = ($null -ne $props.Thumbnail)
  }
}

function Pick-Session($sessions, $appId) {
  if ($sessions.Count -eq 0) { return $null }
  if ($appId) {
    foreach ($s in $sessions) {
      if ($s.SourceAppUserModelId -and $s.SourceAppUserModelId.ToLower().Contains($appId.ToLower())) { return $s }
    }
  }
  foreach ($s in $sessions) {
    if ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') { return $s }
  }
  return $sessions[0]
}

if ($List) {
  $sessions = (Get-SessionManager).GetSessions()
  Write-Output "会话数：$($sessions.Count)"
  foreach ($s in $sessions) { Write-Output "  $($s.SourceAppUserModelId)" }
  exit 0
}

if (-not $Watch) {
  $sessions = (Get-SessionManager).GetSessions()
  $s = Pick-Session $sessions $App
  if ($null -eq $s) { Write-Output '（没有媒体会话）'; exit 0 }
  $f = Read-Session $s
  Write-Output '----------------------------------------'
  Write-Output "  App      : $($f.App)"
  Write-Output "  Status   : $($f.Status)"
  Write-Output "  Title    : $($f.Title)"
  Write-Output "  Artist   : $($f.Artist)"
  Write-Output "  Album    : $($f.Album)"
  Write-Output ("  Position : {0:0.0}s / {1:0.0}s" -f $f.Position, $f.Duration)
  Write-Output "  Cover    : $($f.Cover)"
  exit 0
}

Write-Output '轮询中（Ctrl+C 停止）…'
$last = ''
while ($true) {
  try {
    $sessions = (Get-SessionManager).GetSessions()
    $s = Pick-Session $sessions $App
    if ($null -eq $s) { $line = '（无会话）' }
    else {
      $f = Read-Session $s
      $line = "$($f.App) | $($f.Status) | $($f.Title) - $($f.Artist) | $([math]::Round($f.Position,1))/$([math]::Round($f.Duration,1))"
    }
    if ($line -ne $last) {
      $last = $line
      Write-Output "$(Get-Date -Format 'HH:mm:ss')  $line"
    }
  } catch {
    Write-Output "$(Get-Date -Format 'HH:mm:ss')  读取失败: $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 800
}
