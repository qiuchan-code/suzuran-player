# 把 Electron 切到独显 · set-gpu.ps1
# ==================================
# 这台机器有核显（AMD Radeon 780M，仅 512MB）和独显（RTX 4060 Laptop，4GB）。
# Chromium 默认挑核显，512MB 根本不够 —— 直接被占满。
#
# 试过但**无效**的办法（记录一下，别再试）：
#   · Chromium 的 --gpu-preference=high-performance  → 仍选核显
#   · --use-angle=d3d11 / d3d11on12                   → 仍选核显
#   · --enable-gpu-rasterization / --ignore-gpu-blocklist → 仍选核显
#   原因：Windows 的「图形首选项」优先于 Chromium 的内部偏好。
#
# **有效**的办法：给 electron.exe 写一条 Windows 图形首选项，值为 2（高性能）。
#   位置：HKCU\Software\Microsoft\DirectX\UserGpuPreferences
#   键名：exe 完整路径
#   值  ：GpuPreference=2;   (0=让 Windows 决定  1=省电  2=高性能)
#
# 用法：
#   powershell -File set-gpu.ps1            设为高性能（独显）
#   powershell -File set-gpu.ps1 -PowerSaving  设为省电（核显）
#   powershell -File set-gpu.ps1 -Remove    删除偏好（回到默认）
#   powershell -File set-gpu.ps1 -Status    查看当前设置

param(
  [switch]$PowerSaving,
  [switch]$Remove,
  [switch]$Status
)

$ErrorActionPreference = 'Stop'

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Exe = Join-Path $Here 'node_modules\electron\dist\electron.exe'
$Key = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'

function Say([string]$m) { [Console]::Out.WriteLine($m) }

if (-not (Test-Path $Exe)) {
  Say "找不到 Electron：$Exe"
  Say "请先在 desktop 目录执行：npm install"
  exit 1
}

# ── 查看 ──
if ($Status) {
  Say "Electron：$Exe"
  if (Test-Path $Key) {
    $v = (Get-ItemProperty -Path $Key -Name $Exe -ErrorAction SilentlyContinue).$Exe
    if ($v) {
      $desc = switch -Regex ($v) {
        'GpuPreference=1' { '省电（核显）' }
        'GpuPreference=2' { '高性能（独显）' }
        'GpuPreference=0' { '让 Windows 决定' }
        default           { '未知' }
      }
      Say "当前偏好：$v  →  $desc"
    } else {
      Say "当前偏好：未设置（Windows 自己决定，实测会选核显）"
    }
  } else {
    Say "当前偏好：注册表项不存在（未设置）"
  }
  Say ""
  Say "查实际用的哪块显卡："
  Say "  `$env:ELECTRON_RUN_AS_NODE=''; .\node_modules\electron\dist\electron.exe . --no-serve --gpu-info"
  exit 0
}

# ── 删除 ──
if ($Remove) {
  if (Test-Path $Key) {
    Remove-ItemProperty -Path $Key -Name $Exe -ErrorAction SilentlyContinue
    Say "已删除偏好设置：$Exe"
  } else {
    Say "本来就没设置"
  }
  exit 0
}

# ── 设置 ──
$value = if ($PowerSaving) { 'GpuPreference=1;' } else { 'GpuPreference=2;' }
$label = if ($PowerSaving) { '省电（核显 AMD 780M）' } else { '高性能（独显 RTX 4060）' }

if (-not (Test-Path $Key)) { New-Item -Path $Key -Force | Out-Null }
New-ItemProperty -Path $Key -Name $Exe -Value $value -PropertyType String -Force | Out-Null

Say "已设置：$label"
Say "  路径：$Exe"
Say "  值  ：$value"
Say "  位置：$Key"
Say ""
Say "需要**重启应用**才生效："
Say "  · 从托盘退出当前的壁纸"
Say "  · 重新双击启动"
Say ""
Say "验证："
Say "  .\node_modules\electron\dist\electron.exe . --no-serve --gpu-info"
Say "  （应该看到 renderer 里是 NVIDIA GeForce RTX 4060）"
