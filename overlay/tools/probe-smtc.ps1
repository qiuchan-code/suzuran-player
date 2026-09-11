# 探明媒体会话暴露了哪些信息 · probe-smtc.ps1
# ==========================================
# 现在的歌词服务只读了 标题/歌手/专辑。这个脚本把 WinRT 媒体会话
# 能拿到的字段**全部**打出来，看看有没有歌单相关的信息。

$ErrorActionPreference = 'Continue'

# WinRT 类型必须显式预加载
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Media.MediaPlaybackType, Windows.Media, ContentType = WindowsRuntime]

Add-Type -AssemblyName System.Runtime.WindowsRuntime

# WinRT 的 IAsyncOperation 要走这个辅助函数
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, $type) {
  $m = $asTaskGeneric.MakeGenericMethod($type)
  $task = $m.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

[Console]::Out.WriteLine('=== 取会话管理器 ===')
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
[Console]::Out.WriteLine("  OK: $mgr")

$sessions = $mgr.GetSessions()
[Console]::Out.WriteLine("  会话数: $($sessions.Count)")
[Console]::Out.WriteLine('')

foreach ($s in $sessions) {
  [Console]::Out.WriteLine("════════════════════════════════════════")
  [Console]::Out.WriteLine("  源应用: $($s.SourceAppUserModelId)")
  [Console]::Out.WriteLine("════════════════════════════════════════")

  # ── 媒体属性 ──
  $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  if ($props) {
    [Console]::Out.WriteLine('  ── 媒体属性 ──')
    [Console]::Out.WriteLine("    Title            = $($props.Title)")
    [Console]::Out.WriteLine("    Artist           = $($props.Artist)")
    [Console]::Out.WriteLine("    AlbumArtist      = $($props.AlbumArtist)")
    [Console]::Out.WriteLine("    AlbumTitle       = $($props.AlbumTitle)")
    [Console]::Out.WriteLine("    TrackNumber      = $($props.TrackNumber)")
    [Console]::Out.WriteLine("    AlbumTrackCount  = $($props.AlbumTrackCount)")
    [Console]::Out.WriteLine("    Genres           = $($props.Genres -join ', ')")
    [Console]::Out.WriteLine("    PlaybackType     = $($props.PlaybackType)")
    [Console]::Out.WriteLine("    Subtitle         = $($props.Subtitle)")

    # 缩略图（QQ音乐是空流，之前验证过）
    try {
      $ref = $props.Thumbnail
      if ($ref) {
        $stream = Await ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        [Console]::Out.WriteLine("    Thumbnail        = 有，大小 $($stream.Size) 字节")
      } else { [Console]::Out.WriteLine('    Thumbnail        = null') }
    } catch { [Console]::Out.WriteLine("    Thumbnail        = 读取失败: $($_.Exception.Message)") }
  }
  [Console]::Out.WriteLine('')

  # ── 播放信息 ──
  $info = $s.GetPlaybackInfo()
  if ($info) {
    [Console]::Out.WriteLine('  ── 播放信息 ──')
    [Console]::Out.WriteLine("    Status           = $($info.PlaybackStatus)")
    [Console]::Out.WriteLine("    Rate             = $($info.PlaybackRate)")
    [Console]::Out.WriteLine("    AutoRepeatMode   = $($info.AutoRepeatMode)")
    [Console]::Out.WriteLine("    ShuffleActive    = $($info.IsShuffleActive)")
    [Console]::Out.WriteLine("    MinSeekTime      = $($info.MinSeekTime)")
    [Console]::Out.WriteLine("    MaxSeekTime      = $($info.MaxSeekTime)")
    [Console]::Out.WriteLine("    Position         = $($info.Position)")
    [Console]::Out.WriteLine("    Controls         = $($info.Controls -join ', ')")
  }
  [Console]::Out.WriteLine('')

  # ── 时间线 ──
  $tl = $s.GetTimelineProperties()
  if ($tl) {
    [Console]::Out.WriteLine('  ── 时间线 ──')
    [Console]::Out.WriteLine("    StartTime        = $($tl.StartTime)")
    [Console]::Out.WriteLine("    EndTime          = $($tl.EndTime)")
    [Console]::Out.WriteLine("    Position         = $($tl.Position)")
    [Console]::Out.WriteLine("    LastUpdatedTime  = $($tl.LastUpdatedTime)")
  }
  [Console]::Out.WriteLine('')
}
