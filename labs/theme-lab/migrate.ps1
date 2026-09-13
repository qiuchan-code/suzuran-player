# 迁移项目到 D:\suzuran-player · migrate.ps1
# ------------------------------------------
# 把 theme-lab + lyric-overlay 合并成一个独立项目，理顺目录结构，
# 顺手丢掉中间产物（样张截图、字体分片缓存等）。
#
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File migrate.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Src = 'D:\deepseek_harness'
$Dst = 'D:\suzuran-player'

if (Test-Path $Dst) {
  Write-Host "  目标已存在，先删掉：$Dst" -ForegroundColor Yellow
  Remove-Item $Dst -Recurse -Force
}

# ── 目录骨架 ──
$dirs = @(
  "$Dst",
  "$Dst\src",
  "$Dst\src\tools",
  "$Dst\assets",
  "$Dst\assets\fonts",
  "$Dst\assets\fonts\theme",
  "$Dst\assets\fonts\pickers",
  "$Dst\assets\wallpaper",
  "$Dst\assets\character",
  "$Dst\assets\character\expressions",
  "$Dst\docs"
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Write-Host '  目录骨架已建' -ForegroundColor Green

function Copy-ItemSafe($from, $to) {
  if (-not (Test-Path $from)) { Write-Host "  跳过（不存在）：$from" -ForegroundColor DarkGray; return }
  Copy-Item $from $to -Recurse -Force
}

# ── 1. 歌词服务（整个目录）──
Copy-ItemSafe "$Src\lyric-overlay" "$Dst\overlay"
Write-Host '  overlay/ 已复制' -ForegroundColor Green

# ── 2. 播放器构建脚本 + 运行时资源 ──
$buildScripts = @(
  'build-player-ui.mjs',
  'serve.mjs',
  'palettes.mjs',
  'launcher.ps1',
  'start-player.bat',
  'make-shortcut.ps1'
)
foreach ($f in $buildScripts) { Copy-ItemSafe "$Src\theme-lab\$f" "$Dst\src\$f" }

# 工具脚本
Get-ChildItem "$Src\theme-lab" -File -Filter '*.mjs' |
  Where-Object { $_.Name -match '^(verify|measure|check|debug|shoot|export|preview|list|fetch)' } |
  ForEach-Object { Copy-ItemSafe $_.FullName "$Dst\src\tools\$_.Name" }

Copy-ItemSafe "$Src\theme-lab\src\timer.mjs" "$Dst\src\timer.mjs"
Copy-ItemSafe "$Src\theme-lab\src\timer-inline.mjs" "$Dst\src\timer-inline.mjs"
Write-Host '  src/ 构建脚本已复制' -ForegroundColor Green

# ── 3. 字体 ──
# 主题用字体（文楷 + 荆南麦圆）
Copy-ItemSafe "$Src\theme-lab\fonts\raw\KNMaiyuan-Regular.ttf" "$Dst\assets\fonts\theme\"
# 字体挑选器需要的分片（build-font-picker 依赖）
foreach ($d in @(
  'cn-fontsource-maoken-zhuyuan-ti-regular',
  'cn-fontsource-975-maru-sc-regular',
  'cn-fontsource-975-maru-sc-medium-regular',
  'cn-fontsource-975-maru-sc-bold',
  'cn-fontsource-logo-sc-long-zhu-ti-zhs-regular',
  'cn-fontsource-mdmd-wu-feng-ti-regular',
  'cn-fontsource-ding-talk-jin-bu-ti-regular'
)) {
  Copy-ItemSafe "$Src\theme-lab\fonts\$d" "$Dst\assets\fonts\pickers\$d"
}
Write-Host '  字体已复制' -ForegroundColor Green

# ── 4. 壁纸（方版 + 竖版）──
Copy-ItemSafe "$Src\theme-lab\characters\wallpaper\*" "$Dst\assets\wallpaper\"
# 铃兰表情（用户新给的睁眼/闭眼）
foreach ($g in @('1789035395834.gif', '1789035408407.gif')) {
  Copy-ItemSafe "$Src\theme-lab\$g" "$Dst\assets\character\expressions\$g"
}
Write-Host '  壁纸与表情已复制' -ForegroundColor Green

# ── 5. 最终产物 html ──
Copy-ItemSafe "$Src\theme-lab\player-ui.html" "$Dst\player-ui.html"
Write-Host '  player-ui.html 已复制' -ForegroundColor Green

Write-Host ''
Write-Host "  迁移完成：$Dst" -ForegroundColor Cyan
$f = Get-ChildItem $Dst -Recurse -File -ErrorAction SilentlyContinue
Write-Host ("  共 {0} 个文件，{1} MB" -f $f.Count, [math]::Round(($f | Measure-Object Length -Sum).Sum / 1MB, 1)) -ForegroundColor DarkGray
