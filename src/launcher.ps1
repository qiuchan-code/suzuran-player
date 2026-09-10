# 启动播放器 · launcher.ps1
# ----------------
# 一键拉起整个播放器：
#   1. 歌词服务（读 SMTC 会话 + 取歌词）      127.0.0.1:7788
#   2. 界面静态服务（并反向代理 /api/*）      127.0.0.1:7790
#   3. 打开浏览器到播放器界面
#
# 用已存在的进程会先清理，避免端口占用。
#
# 用法：powershell -ExecutionPolicy Bypass -File launcher.ps1
#       powershell -ExecutionPolicy Bypass -File launcher.ps1 -NoBrowser
#       powershell -ExecutionPolicy Bypass -File launcher.ps1 -App QQMusic -LyricPort 7788 -UiPort 7790

param(
  [string]$App = 'QQMusic',
  [int]$LyricPort = 7788,
  [int]$UiPort = 7790,
  [int]$Poll = 250,
  [switch]$NoBrowser,
  [switch]$Verbose
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ── 路径 ──
# 本脚本在 src/ 下，项目根是它的上一级
$Root = Split-Path -Parent $PSScriptRoot
$LyricServer = Join-Path $Root 'overlay\src\server.mjs'
$UiServer = Join-Path $PSScriptRoot 'serve.mjs'
$UiRoot = $Root

foreach ($f in @($LyricServer, $UiServer, (Join-Path $Root 'player-ui.html'))) {
  if (-not (Test-Path $f)) {
    Write-Host "找不到文件：$f" -ForegroundColor Red
    Write-Host '  提示：先运行  node src\build-player-ui.mjs  生成界面' -ForegroundColor Yellow
    exit 1
  }
}

Write-Host ''
Write-Host '  铃兰播放器' -ForegroundColor Magenta
Write-Host '  ──────────────────────────────────────' -ForegroundColor DarkGray

# ── 清理已在监听的目标端口 ──
function Clear-Port([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($null -ne $proc) {
      Write-Host ("  清理端口 {0}（{1}，PID {2}）" -f $Port, $proc.ProcessName, $proc.Id) -ForegroundColor DarkGray
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
  if ($conns) { Start-Sleep -Milliseconds 800 }
}

Clear-Port $LyricPort
Clear-Port $UiPort

# ── 启动歌词服务 ──
$lyricArgs = @($LyricServer, '--port', "$LyricPort", '--poll', "$Poll")
if ($App -ne '') { $lyricArgs += @('--app', $App) }
if ($Verbose) { $lyricArgs += '--verbose' }

Write-Host ("  启动歌词服务  :{0}" -f $LyricPort) -ForegroundColor Green
$lyric = Start-Process -FilePath 'node' -ArgumentList $lyricArgs -PassThru -WindowStyle Hidden

# ── 等歌词服务就绪 ──
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$LyricPort/api/state" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch { }
  if ($lyric.HasExited) {
    Write-Host "  歌词服务启动失败（进程已退出）" -ForegroundColor Red
    exit 1
  }
}
if (-not $ready) { Write-Host '  歌词服务没在超时内就绪，仍继续启动界面' -ForegroundColor Yellow }

# ── 启动界面静态服务（带 /api 代理）──
Write-Host ("  启动界面服务  :{0}" -f $UiPort) -ForegroundColor Green
$uiArgs = @($UiServer, "$UiPort", $UiRoot, "http://127.0.0.1:$LyricPort")
$ui = Start-Process -FilePath 'node' -ArgumentList $uiArgs -PassThru -WindowStyle Hidden

$uiReady = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$UiPort/player-ui.html" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $uiReady = $true; break }
  } catch { }
  if ($ui.HasExited) {
    Write-Host "  界面服务启动失败（进程已退出）" -ForegroundColor Red
    if (-not $lyric.HasExited) { Stop-Process -Id $lyric.Id -Force -ErrorAction SilentlyContinue }
    exit 1
  }
}

$url = "http://127.0.0.1:$UiPort/player-ui.html"
Write-Host '  ──────────────────────────────────────' -ForegroundColor DarkGray
if ($uiReady) {
  Write-Host "  就绪：$url" -ForegroundColor Cyan
} else {
  Write-Host "  界面服务可能没就绪，仍尝试打开：$url" -ForegroundColor Yellow
}

if (-not $NoBrowser) {
  Start-Process $url
  Write-Host '  已打开浏览器' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '  在 QQ 音乐里播放任意歌曲，界面会实时跟唱。' -ForegroundColor DarkGray
Write-Host '  关掉这个窗口即停止全部服务。' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  按 Ctrl+C 或关闭窗口退出' -ForegroundColor DarkGray

# ── 守着子进程：任一个挂了就一起收摊 ──
try {
  while ($true) {
    Start-Sleep -Seconds 2
    if ($lyric.HasExited) { Write-Host '  歌词服务已退出' -ForegroundColor Yellow; break }
    if ($ui.HasExited) { Write-Host '  界面服务已退出' -ForegroundColor Yellow; break }
  }
} finally {
  Write-Host '  正在停止服务…' -ForegroundColor DarkGray
  if (-not $lyric.HasExited) { Stop-Process -Id $lyric.Id -Force -ErrorAction SilentlyContinue }
  if (-not $ui.HasExited) { Stop-Process -Id $ui.Id -Force -ErrorAction SilentlyContinue }
  Write-Host '  已停止' -ForegroundColor DarkGray
}
