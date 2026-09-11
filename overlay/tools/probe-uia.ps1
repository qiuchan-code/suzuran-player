# 试着从 QQ 音乐界面读出歌单 · probe-uia.ps1
# =========================================
# QQ 音乐是 CEF（Chromium）应用，CEF 能把 DOM 暴露成 UIA 无障碍树。
# 如果这条路通，就能直接读到用户可见的歌单，不用破解加密数据库。

$ErrorActionPreference = 'Continue'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$UIA  = [System.Windows.Automation.AutomationElement]
$Tree = [System.Windows.Automation.TreeScope]
$Cond = [System.Windows.Automation.Condition]::TrueCondition

function Say([string]$m) { [Console]::Out.WriteLine($m) }

Say '=== 顶层窗口 ==='
$root = $UIA::RootElement
$kids = $root.FindAll($Tree::Children, $Cond)
foreach ($w in $kids) {
  try {
    $n = $w.Current.Name
    $c = $w.Current.ClassName
    $p = $w.Current.ProcessId
    if ($n -or $c) { Say ("  pid={0,-8} cls={1,-28} name={2}" -f $p, $c, $n) }
  } catch { }
}

Say ''
Say '=== 找 QQ 音乐的窗口 ==='
$qq = $null
foreach ($w in $kids) {
  try {
    $pn = (Get-Process -Id $w.Current.ProcessId -ErrorAction SilentlyContinue).ProcessName
    if ($pn -eq 'QQMusic') {
      $qq = $w
      Say ("  ✓ pid={0} cls={1} name={2}" -f $w.Current.ProcessId, $w.Current.ClassName, $w.Current.Name)
    }
  } catch { }
}

if (-not $qq) {
  Say '  ✗ 没找到 QQ 音乐顶层窗口（可能最小化到托盘了）'
  Say ''
  Say '  所有可见进程名：'
  foreach ($w in $kids) {
    try {
      $pn = (Get-Process -Id $w.Current.ProcessId -ErrorAction SilentlyContinue).ProcessName
      if ($pn) { Say "    $pn" }
    } catch { }
  }
  exit 1
}

Say ''
Say '=== 展开子树，统计元素类型 ==='
$all = $qq.FindAll($Tree::Descendants, $Cond)
Say "  子元素总数: $($all.Count)"

if ($all.Count -eq 0) {
  Say '  ✗ 空空如也 —— CEF 没开无障碍，这条路不通'
  Say '    （CEF 默认不开 UIA，除非检测到屏幕阅读器）'
  exit 2
}

$byType = @{}
foreach ($e in $all) {
  try {
    $t = $e.Current.ControlType.ProgrammaticName -replace 'ControlType\.',''
    # 注意：PowerShell 5.1 不支持 ?? 运算符，用显式判断
    if ($byType.ContainsKey($t)) { $byType[$t] = $byType[$t] + 1 } else { $byType[$t] = 1 }
  } catch { }
}
Say '  元素类型分布：'
$byType.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 15 | ForEach-Object {
  Say ("    {0,-20} {1}" -f $_.Key, $_.Value)
}

Say ''
Say '=== 猜哪些是歌单项（有名字的 ListItem / Text / Button）==='
$shown = 0
foreach ($e in $all) {
  if ($shown -ge 40) { break }
  try {
    $t = $e.Current.ControlType.ProgrammaticName -replace 'ControlType\.',''
    $n = $e.Current.Name
    if (-not $n) { continue }
    if ($t -notin @('ListItem','Text','Button','TreeItem','Group','DataItem')) { continue }
    $r = $e.Current.BoundingRectangle
    if ($r.Width -le 0) { continue }
    Say ("    [{0,-8}] {1}" -f $t, $n)
    $shown++
  } catch { }
}
if ($shown -eq 0) { Say '    （没有带名字的可见元素）' }
