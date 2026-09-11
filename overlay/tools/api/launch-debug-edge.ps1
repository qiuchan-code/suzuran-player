# 启动一个可调式的 Edge 实例 · launch-debug-edge.ps1
# =================================================
# 为什么不用现有 Edge：
#   · Edge 152 的 cookie 用 App-Bound Encryption（ABE），解密要提权调系统服务，走不通
#   · 主 profile 被占用，cookie 文件锁着读不了
#
# 所以开一个**独立 profile** 的 Edge，带调试端口。
# 你在里面登录一次 QQ 音乐，之后就能在页面上下文里直接调 API：
#   · 同源（都在 y.qq.com 下）→ 没有跨域问题
#   · 自动带 cookie → 不用碰加密
#
# 用法：
#   powershell -File launch-debug-edge.ps1          启动（独立 profile）
#   powershell -File launch-debug-edge.ps1 -Kill    关掉
#   powershell -File launch-debug-edge.ps1 -Status  看状态
#
# ⚠️ 本文件必须用 # 注释。PowerShell 不认 C 风格的块注释，
#    而且它的语法检查器会把 /* 当成命令名**放过去**，很难发现（踩过两次）。

param(
  [switch]$Kill,
  [switch]$Status,
  [int]$Port = 9222
)

$ErrorActionPreference = 'Continue'

$ProfileDir = Join-Path $env:LOCALAPPDATA 'suzuran-debug-edge'
$Edge = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

function Say([string]$m) { [Console]::Out.WriteLine($m) }

function Get-DebugInfo([int]$p) {
  try {
    return Invoke-RestMethod "http://127.0.0.1:$p/json/version" -TimeoutSec 2 -ErrorAction Stop
  } catch { return $null }
}

# ── 状态 ──
if ($Status) {
  $info = Get-DebugInfo $Port
  if ($info) {
    Say "调试端口 $Port 已开 ✓"
    Say "  浏览器：$($info.Browser)"
    Say "  WebSocket：$($info.webSocketDebuggerUrl)"
    Say "  已打开的页面："
    try {
      $tabs = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
      foreach ($t in $tabs) { if ($t.type -eq 'page') { Say "    $($t.url)" } }
    } catch { }
  } else {
    Say "调试端口 $Port 没开"
  }
  Say ""
  Say "独立 profile：$ProfileDir"
  Say "  存在：$(Test-Path $ProfileDir)"
  exit 0
}

# ── 关闭 ──
if ($Kill) {
  $found = $false
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.CommandLine -and $_.CommandLine -like "*$ProfileDir*") {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      $found = $true
    }
  }
  if ($found) { Say '已关闭调试用的 Edge' } else { Say '没找到在跑的调试 Edge' }
  exit 0
}

# ── 启动 ──
if (-not $Edge) { Say '找不到 msedge.exe'; exit 1 }

if (Get-DebugInfo $Port) {
  Say "调试端口 $Port 已经在开了，直接用就行"
  Say "如果里面还没登录 QQ 音乐，去那个窗口登录一下"
  exit 0
}

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

Say "启动 Edge（独立 profile + 调试端口 $Port）"
Say "  profile：$ProfileDir"
Say "  调试口：http://127.0.0.1:$Port"

# ⚠️ 必须用**单个字符串**传参，不能用 @(数组)。
#    用数组时 PowerShell 会把 --remote-debugging-port=9222 拆坏，
#    Edge 收到的命令行变成 `--remote-debugging-port=`（值丢了），端口起不来。
#    这个坑很难发现 —— 只有去看进程的实际命令行才看得出来。
$argLine = '--remote-debugging-port=' + $Port +
           ' --user-data-dir="' + $ProfileDir + '"' +
           ' --no-first-run --no-default-browser-check --remote-allow-origins=*' +
           ' --new-window https://y.qq.com/'

Say "  参数：$argLine"
Start-Process -FilePath $Edge -ArgumentList $argLine | Out-Null

# 等端口起来
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (Get-DebugInfo $Port) { $ok = $true; break }
}

Say ''
if ($ok) {
  Say '✓ 已启动，调试端口可用'
  Say ''
  Say '接下来要做的：'
  Say '  1. 在弹出的 Edge 窗口里**登录 QQ 音乐**（扫码或账号密码）'
  Say '  2. 登录完告诉我，我来验证登录态并找建歌单的接口'
  Say ''
  Say '⚠️ 这个 profile 是全新的，不会带你主 Edge 的登录态，需要重新登一次。'
  Say '   关掉它：powershell -File launch-debug-edge.ps1 -Kill'
} else {
  Say '✗ 端口没起来，可能是 Edge 已经在跑（同一 profile 只能一个实例）'
  Say '  试试先 -Kill 再启动'
  exit 1
}
