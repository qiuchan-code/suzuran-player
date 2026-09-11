# 安装 / 卸载开机自启 · install-autostart.ps1
# ==========================================
# 把「桌面壁纸」注册成开机自启。
#
# 为什么用启动文件夹而不是注册表 Run：
#   · 启动文件夹看得见、好管理（想关掉直接删快捷方式）
#   · 可以传延迟参数（等服务就绪）
# 为什么指向 .vbs 而不是 .bat：
#   · .bat 会闪黑框；.vbs 通过 wscript 启动完全不闪
#
# ⚠️ 不要用 Start-Process -WindowStyle Hidden 来避免闪框 ——
#    那样 Electron 的 BrowserWindow 也会被隐藏，壁纸压根不显示（踩过）。
#
# 用法：
#   powershell -File install-autostart.ps1            安装（延迟 15 秒）
#   powershell -File install-autostart.ps1 -Delay 30  自定义延迟
#   powershell -File install-autostart.ps1 -Remove    卸载
#   powershell -File install-autostart.ps1 -Status    查看状态

param(
  [int]$Delay = 15,
  [switch]$Remove,
  [switch]$Status
)

$ErrorActionPreference = 'Stop'

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $Here
$Vbs = Join-Path $Here 'launch-desktop.vbs'
$StartupDir = [Environment]::GetFolderPath('Startup')
$LnkPath = Join-Path $StartupDir '铃兰播放器·桌面壁纸.lnk'

function Say([string]$m) { [Console]::Out.WriteLine($m) }

# ── 查看状态 ──
if ($Status) {
  Say "启动文件夹：$StartupDir"
  if (Test-Path $LnkPath) {
    $sh = New-Object -ComObject WScript.Shell
    $s = $sh.CreateShortcut($LnkPath)
    Say "  已安装 ✓"
    Say "    目标：$($s.TargetPath)"
    Say "    参数：$($s.Arguments)"
  } else {
    Say "  未安装"
  }
  Say ""
  Say "启动器：$Vbs  $(if (Test-Path $Vbs) { '存在 ✓' } else { '缺失 ✗' })"
  exit 0
}

# ── 卸载 ──
if ($Remove) {
  if (Test-Path $LnkPath) {
    Remove-Item $LnkPath -Force
    Say "已移除开机自启：$LnkPath"
  } else {
    Say "本来就没安装"
  }
  exit 0
}

# ── 安装 ──
if (-not (Test-Path $Vbs)) {
  Say "找不到启动器：$Vbs"
  exit 1
}

$exe = Join-Path $Here 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $exe)) {
  Say "找不到 Electron：$exe"
  Say "请先在 desktop 目录执行：npm install"
  exit 1
}

$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut($LnkPath)
$lnk.TargetPath = 'wscript.exe'
$lnk.Arguments = '"{0}" {1}' -f $Vbs, $Delay
$lnk.WorkingDirectory = $Here
$lnk.WindowStyle = 7          # 最小化（配合 wscript 实际不显示任何窗口）
$lnk.Description = '铃兰播放器 · 桌面壁纸（开机自启）'
$lnk.Save()

Say "已安装开机自启 ✓"
Say "  快捷方式：$LnkPath"
Say "  执行命令：wscript.exe `"$Vbs`" $Delay"
Say "  延迟    ：$Delay 秒（等 explorer 和桌面 WorkerW 就绪）"
Say ""
Say "关掉自启：powershell -File `"$PSCommandPath`" -Remove"
