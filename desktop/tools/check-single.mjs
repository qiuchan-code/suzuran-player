/*
 * 检查有没有重复实例 / 重复悬浮条 · check-single.mjs
 * -----------------------------------------------
 * 场景：壁纸崩了但悬浮条活下来，再启动一次就有两条。
 * 只有最上层那条能收到鼠标事件，所以僵尸条会把能用的挡住。
 *
 * **判据是"可见窗口"，不是"主进程数"。**
 * 写这个脚本时踩了三个坑，都记在这儿：
 *
 *   ① PowerShell 里 `[uint]` 不是有效类型转换，得写 `[uint32]`。
 *      写错之后整条管道静默失败、数量读成 0。
 *
 *   ② **不能按"不带 --type= 就算主进程"来数实例**。实测有 2 个辅助进程
 *      也不带 --type=（命令行看起来就是个裸 electron.exe），
 *      按这个数会把 1 个实例算成 3 个。
 *      正确做法是按**可见窗口归属**分组：能挡点击的是窗口，不是进程。
 *
 *   ③ **判定不能只看"数量 ≤ 1 就通过"**。前面读成 0（因为炸了）也满足 ≤1，
 *      于是报"✓ 正常" —— 假阳性比不报还糟。必须区分"检测到 0"和"检测失败"。
 *
 * 用法：node --use-system-ca desktop/tools/check-single.mjs
 */

import { execFileSync } from 'node:child_process'

/** 跑一段 PowerShell，失败时返回带 __FAIL__ 前缀的说明。 */
function ps(script) {
  try {
    return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8', timeout: 30000,
    }).trim()
  } catch (e) {
    return '__FAIL__' + ((e.stdout ?? '') + (e.stderr ?? '') + (e.message ?? '')).slice(0, 400)
  }
}
const failed = (s) => typeof s === 'string' && s.startsWith('__FAIL__')

/* ── 一次把所有信息取回来 ── */
const raw = ps(`
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class S {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(P pt);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr h, StringBuilder s, int m);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
  public static string Cls(IntPtr h){var s=new StringBuilder(256);GetClassName(h,s,256);return s.ToString();}
  public static string At(int x,int y){var p=new P();p.X=x;p.Y=y;var h=WindowFromPoint(p);uint wp;GetWindowThreadProcessId(h,out wp);return h+"|"+wp+"|"+Cls(h);}
  public static List<string> Wins(uint[] pids) {
    var l = new List<string>();
    EnumWindows((h,x) => {
      uint wp; GetWindowThreadProcessId(h, out wp);
      bool mine=false; foreach(var p in pids) if(p==wp){mine=true;break;}
      if(!mine) return true;
      if (GetParent(h) != IntPtr.Zero) return true;
      if (!IsWindowVisible(h)) return true;
      var r=new RECT(); GetWindowRect(h,out r);
      l.Add(h+"|"+wp+"|"+(r.R-r.L)+"|"+(r.B-r.T)+"|"+r.L+"|"+r.T+"|"+Cls(h));
      return true;
    }, IntPtr.Zero);
    return l;
  }
}
'@

$pids = @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -like '*suzuran-player*' } | Select-Object -ExpandProperty ProcessId)
Write-Output ("PROC=" + $pids.Count)

$wins = @([S]::Wins([uint32[]]$pids))
Write-Output ("WINS=" + $wins.Count)
$wins | ForEach-Object { Write-Output ("W|" + $_) }

# 对每个"条候选窗口"的中心点做命中测试
foreach ($w in $wins) {
  $f = $w -split '\\|'
  $w2 = [int]$f[2]; $h2 = [int]$f[3]; $x = [int]$f[4]; $y = [int]$f[5]
  if ($w2 -gt 250 -and $w2 -lt 700 -and $h2 -gt 30 -and $h2 -lt 100) {
    $cx = $x + [int]($w2/2); $cy = $y + [int]($h2/2)
    Write-Output ("HIT|" + $f[0] + "|" + $cx + "|" + $cy + "|" + [S]::At($cx,$cy))
  }
}
`)

if (failed(raw)) {
  console.log('✗ 检测失败：\n' + raw.slice(8, 400))
  process.exit(1)
}

/* ── 解析 ── */
const procCount = Number((/PROC=(\d+)/.exec(raw) ?? [])[1] ?? -1)
const wins = []
const hits = []
for (const line of raw.split('\n')) {
  const t = line.trim()
  if (t.startsWith('W|')) {
    const [, hwnd, pid, w, h, x, y, cls] = t.split('|')
    wins.push({ hwnd, pid, w: +w, h: +h, x: +x, y: +y, cls })
  } else if (t.startsWith('HIT|')) {
    const [, hwnd, cx, cy, at] = t.split('|')
    const [ah, apid, acls] = (at ?? '').split('|')
    hits.push({ hwnd, cx: +cx, cy: +cy, atHwnd: ah, atPid: apid, atCls: acls })
  }
}

/** 悬浮条候选：尺寸像条，且是顶层可见窗口。 */
const bars = wins.filter(w => w.w > 250 && w.w < 700 && w.h > 30 && w.h < 100)
/** 真正的实例：拥有"播放器主窗口"（大窗口）的那些 pid。 */
const mains = [...new Set(wins.filter(w => w.w > 900 && w.h > 500).map(w => w.pid))]
/** 兜底：没有大窗口（壁纸挂在桌面层时不是顶层窗口），就用条所属的 pid。 */
const instances = mains.length ? mains : [...new Set(bars.map(b => b.pid))]

/* ── 报告 ── */
console.log(`进程数：${procCount}   （一个正常实例约 5-7 个）\n`)

console.log(`顶层可见窗口（${wins.length} 个）：`)
for (const w of wins) {
  const kind = (w.w > 250 && w.w < 700 && w.h > 30 && w.h < 100) ? ' ← 像悬浮条'
    : (w.w > 900 && w.h > 500) ? ' ← 像主窗口' : ''
  console.log(`  pid=${String(w.pid).padEnd(8)} ${String(w.w + 'x' + w.h).padEnd(11)} @${w.x},${w.y}  ${w.cls}${kind}`)
}

console.log(`\n悬浮条窗口：${bars.length} 条`)
for (const b of bars) console.log(`  hwnd=${b.hwnd}  pid=${b.pid}  ${b.w}x${b.h}  @${b.x},${b.y}`)

console.log('\n命中测试（光标压在条中心，谁收事件）：')
console.log('  注：① 在终端里跑这个脚本时，终端窗口本身常压在最上层，会把命中结果')
console.log('        抢走 —— 那是测量环境的干扰，不代表悬浮条被挡住。')
console.log('      ② 悬浮条是「光标压到控件上才接收点击」（动态穿透），')
console.log('        所以"上面压着别的窗口"在多数时候是正常的。')
console.log('      → 这一项仅供参考。真要判断能不能点，**直接去点一下**最快。')
for (const h of hits) {
  const bar = bars.find(b => b.hwnd === h.hwnd)
  const mine = h.atHwnd === h.hwnd || (bar && h.atPid && h.atPid === bar.pid)
  console.log(`  hwnd=${h.hwnd} 中心(${h.cx},${h.cy}) → ${mine ? '命中它自己 ✓' : '上层是别的窗口（见上注）'}`)
}

/* ── 判读 ── */
console.log('\n════ 判读 ════')
console.log(`  实例数：${instances.length}（按顶层窗口归属统计）`)

if (procCount === 0) {
  console.log('  · 没有实例在跑（壁纸没启动）')
} else if (instances.length === 1 && bars.length === 1) {
  console.log('  ✓ 正常：一个实例、一条悬浮条')
} else if (instances.length > 1) {
  console.log(`  ✗ 有 ${instances.length} 个实例在跑 —— 僵尸条可能挡住能用的那条`)
  console.log('')
  console.log('     全部清掉再重启（main.mjs 的单实例保护会保证只有一个）：')
  console.log('       Get-CimInstance Win32_Process -Filter "Name=\'electron.exe\'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }')
  process.exit(1)
} else if (bars.length > 1) {
  console.log(`  ✗ 一个实例但有 ${bars.length} 条悬浮条`)
  process.exit(1)
} else if (bars.length === 0) {
  console.log('  ⚠ 有实例但没窗口（壁纸挂在桌面层时顶层窗口本来就少，属正常）')
} else {
  console.log('  ✓ 正常')
}
