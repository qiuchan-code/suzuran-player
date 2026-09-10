# 常驻会话监视器 · 持续输出 JSON 行
# ----------------------------------
# 为什么需要它：每次启动 PowerShell 读一次会话要 ~800ms，Node 每秒轮询一次
# 就等于每秒烧掉 800ms 的进程启动开销，切歌感知延迟接近 2 秒。
# 改成"启动一个常驻进程，内部高频轮询，只在变化时输出一行 JSON"，
# Node 侧只需读流，切歌延迟降到轮询间隔本身。
#
# 输出格式（每行一个 JSON，UTF-8）：
#   {"t":1234567890,"app":"QQMusic.exe","status":"Playing","title":"...","artist":"...","album":"...","position":12.3,"duration":188,"cover":true}
# 无会话时输出 {"t":...,"none":true}
#
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools/session-watch.ps1 [-App QQMusic] [-Interval 250]

param(
  [string]$App = '',
  [int]$Interval = 250
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
# 读封面要用的图像类型，必须显式预加载，否则脚本里引用会报"找不到类型"
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapEncoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [System.Reflection.Assembly]::LoadWithPartialName('System.Runtime.WindowsRuntime')

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

function Get-Manager {
  Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
        ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
}

function Pick($sessions) {
  if ($sessions.Count -eq 0) { return $null }
  if ($App) {
    foreach ($s in $sessions) {
      if ($s.SourceAppUserModelId -and $s.SourceAppUserModelId.ToLower().Contains($App.ToLower())) { return $s }
    }
  }
  foreach ($s in $sessions) {
    if ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') { return $s }
  }
  return $sessions[0]
}

function Snap($session) {
  $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $info = $session.GetPlaybackInfo()
  $tl = $session.GetTimelineProperties()

  # 读封面缩略图（base64）。
  #
  # 踩过的坑：
  #   1. 不能调 $ras.Dispose()——PowerShell 拿到的是 __ComObject，没这个方法
  #   2. 有些播放器（QQ 音乐）的 Thumbnail.OpenReadAsync() 给出 Size=0 的空流，
  #      所以加第二条路：用 BitmapDecoder 直接解码，拿到像素再重新编码成 PNG。
  $cover = ''
  $coverErr = ''
  if ($null -ne $props.Thumbnail) {
    # 路线 A：直接读流
    try {
      $ras = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
      $size = [uint32]$ras.Size
      if ($size -gt 0 -and $size -lt 4000000) {
        $reader = [Windows.Storage.Streams.DataReader]::new($ras.GetInputStreamAt(0))
        Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
        $bytes = New-Object byte[] $size
        $reader.ReadBytes($bytes)
        $cover = [Convert]::ToBase64String($bytes)
      } else {
        $coverErr = "stream size=$size"
      }
    } catch {
      $coverErr = $_.Exception.Message
    }

    # 路线 B：BitmapDecoder 解码后重新编码
    if ($cover -eq '') {
      try {
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($props.Thumbnail)) `
                        ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $ms = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
        $encoder = Await ([Windows.Graphics.Imaging.BitmapEncoder]::CreateAsync([Windows.Graphics.Imaging.BitmapEncoder]::PngEncoder, $ms)) `
                        ([Windows.Graphics.Imaging.BitmapEncoder])
        $encoder.SetSoftwareBitmap($bitmap)
        Await ($encoder.FlushAsync()) ([bool]) | Out-Null
        $size2 = [uint32]$ms.Size
        if ($size2 -gt 0) {
          $reader2 = [Windows.Storage.Streams.DataReader]::new($ms.GetInputStreamAt(0))
          Await ($reader2.LoadAsync($size2)) ([uint32]) | Out-Null
          $bytes2 = New-Object byte[] $size2
          $reader2.ReadBytes($bytes2)
          $cover = [Convert]::ToBase64String($bytes2)
          $coverErr = ''
        }
      } catch {
        $coverErr = "$coverErr | decoder: $($_.Exception.Message)"
      }
    }
  } else {
    $coverErr = 'no thumbnail'
  }

  [ordered]@{
    app      = $session.SourceAppUserModelId
    status   = $info.PlaybackStatus.ToString()
    title    = $props.Title
    artist   = $props.Artist
    album    = $props.AlbumTitle
    position = [math]::Round($tl.Position.TotalSeconds, 2)
    duration = [math]::Round($tl.EndTime.TotalSeconds, 2)
    cover    = ($cover -ne '')
    coverB64 = $cover
    coverErr = $coverErr
  }
}

$manager = Get-Manager
$lastLine = ''

while ($true) {
  try {
    $session = Pick $manager.GetSessions()
    if ($null -eq $session) {
      $line = '{"none":true}'
    } else {
      $snap = Snap $session
      $line = ($snap | ConvertTo-Json -Compress -Depth 3)
    }
    if ($line -ne $lastLine) {
      $lastLine = $line
      # 直接写 stdout，不走 PowerShell 管道——管道会重新编码，中文变乱码
      [Console]::Out.WriteLine($line)
      [Console]::Out.Flush()
    }
  } catch {
    # 单次读取失败不该让监视器退出
  }
  Start-Sleep -Milliseconds $Interval
}
