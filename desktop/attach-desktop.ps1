# 把窗口挂到桌面层（WorkerW）· attach-desktop.ps1
# ---------------------------------------------
# 原理：
#
#   桌面窗口层级（Win11 24H2 实测）：
#
#     Progman  (标题 "Program Manager")
#       ├── SHELLDLL_DefView ── SysListView32   桌面图标
#       └── WorkerW                              ← 壁纸层，窗口挂这里
#
#   注意两个坑：
#     1. FindWindow('Progman', null) 在 Win11 上返回 0，
#        必须给标题 'Program Manager'。
#     2. 老教程说 WorkerW 是"含 DefView 的顶层窗口的下一个兄弟"，
#        那是 Win10 的结构；Win11 24H2 改成 Progman 的直接子窗口了。
#        所以这里先按 Win11 找，找不到再退回 Win10 的找法。
#
# 用法：
#   powershell -File attach-desktop.ps1 -WindowTitle "铃兰播放器"
#   powershell -File attach-desktop.ps1 -WindowHandle 123456
#   powershell -File attach-desktop.ps1 -WindowTitle "..." -Detach

param(
  [string]$WindowTitle = '',
  [long]$WindowHandle = 0,
  [switch]$Detach,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

function Say([string]$msg) {
  if (-not $Quiet) { [Console]::Out.WriteLine($msg) }
}

# ── Win32 声明（用唯一类名，避免重复 Add-Type 冲突）──
if (-not ('SuzuranDesk' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class SuzuranDesk {
    [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
    public static extern IntPtr FindWindow(string cls, string name);

    [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
    public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam,
        uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern IntPtr SetParent(IntPtr child, IntPtr parent);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumProc cb, IntPtr l);

    public delegate bool EnumProc(IntPtr h, IntPtr l);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr h);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int index);

    [DllImport("user32.dll", SetLastError=true)]
    public static extern bool GetWindowRect(IntPtr h, out RECT r);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll", CharSet=CharSet.Auto)]
    public static extern int GetClassName(IntPtr h, StringBuilder s, int m);

    [DllImport("user32.dll", CharSet=CharSet.Auto)]
    public static extern int GetWindowText(IntPtr h, StringBuilder s, int m);

    public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
    public static string Txt(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }

    public static IntPtr[] Tops() {
        var list = new List<IntPtr>();
        EnumWindows((h, l) => { list.Add(h); return true; }, IntPtr.Zero);
        return list.ToArray();
    }

    /// 按窗口标题前缀找一个可见窗口（精确标题优先）。
    public static IntPtr FindByTitlePrefix(string prefix) {
        IntPtr exact = FindWindow(null, prefix);
        if (exact != IntPtr.Zero) return exact;
        IntPtr hit = IntPtr.Zero;
        foreach (var h in Tops()) {
            if (!IsWindowVisible(h)) continue;
            string t = Txt(h);
            if (t.Length > 0 && t.StartsWith(prefix)) { hit = h; break; }
        }
        return hit;
    }

    /// 找到垫在桌面图标下的壁纸层 WorkerW。
    public static IntPtr FindWallpaperWorkerW() {
        // 先让 Progman 把 WorkerW 准备好（0x052C 是未公开消息，但很稳定）
        IntPtr progman = FindWindow("Progman", "Program Manager");
        if (progman == IntPtr.Zero) progman = FindWindow("Progman", null);
        if (progman == IntPtr.Zero) return IntPtr.Zero;

        IntPtr unused;
        SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out unused);

        // ① Win11 24H2：WorkerW 是 Progman 的直接子窗口
        IntPtr w = FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);
        if (w != IntPtr.Zero) return w;

        // ② Win10：WorkerW 是"含 SHELLDLL_DefView 的顶层窗口"的下一个兄弟
        IntPtr target = IntPtr.Zero;
        foreach (var h in Tops()) {
            if (FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) {
                IntPtr sib = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
                if (sib != IntPtr.Zero) { target = sib; break; }
            }
        }
        if (target != IntPtr.Zero) return target;

        // ③ 兜底：任意一个可见的 WorkerW
        foreach (var h in Tops()) {
            if (Cls(h) == "WorkerW" && IsWindowVisible(h)) return h;
        }
        return IntPtr.Zero;
    }
}
'@
}

# ── 定位目标窗口 ──
$hwnd = [IntPtr]::Zero
if ($WindowHandle -ne 0) {
  $hwnd = [IntPtr]$WindowHandle
} elseif ($WindowTitle) {
  $hwnd = [SuzuranDesk]::FindByTitlePrefix($WindowTitle)
} else {
  Write-Error '必须给 -WindowTitle 或 -WindowHandle'
}

if ($hwnd -eq [IntPtr]::Zero) {
  Say "FAIL 找不到窗口：$WindowTitle"
  exit 2
}
Say "目标窗口 hwnd=$hwnd  「$([SuzuranDesk]::Txt($hwnd))」"

# ── 摘下来 ──
if ($Detach) {
  [SuzuranDesk]::SetParent($hwnd, [IntPtr]::Zero) | Out-Null
  Say 'DETACHED 已从桌面层摘除'
  exit 0
}

# ── 找壁纸层 ──
# 注意：C# 的 FindWindowEx 找不到时返回 IntPtr.Zero，但 PowerShell 在某些
# 调用路径下会把它变成**真 $null**，而 "$null -eq [IntPtr]::Zero" 并不可靠，
# 会漏过守卫、把空值传进 GetWindowRect 然后报 "Cannot convert null to IntPtr"。
# 所以这里用显式的空值判断 + 数值化比较。
$worker = [SuzuranDesk]::FindWallpaperWorkerW()
$workerIsNull = ($null -eq $worker) -or ([IntPtr]$worker -eq [IntPtr]::Zero)
if ($workerIsNull) {
  Say 'FAIL 找不到 WorkerW 壁纸层'
  exit 1
}
Say "壁纸层 WorkerW=$worker"

# ── 挂载 ──
Say "SetParent($hwnd, $worker) ..."
[Console]::Out.Flush()
[SuzuranDesk]::SetParent([IntPtr]$hwnd, [IntPtr]$worker) | Out-Null
Say '  SetParent 返回'
[Console]::Out.Flush()

# 铺满桌面。
#
# 三个注意点：
#   · 不用 MoveWindow —— 对刚 SetParent 过来的跨进程窗口调它会同步等待，
#     目标线程忙的时候直接阻塞。改用 SetWindowPos。
#   · **不要加 SWP_ASYNCWINDOWPOS** —— 异步模式下系统只是投递请求，
#     我们读到的是旧尺寸、也看不出失败。实测异步时窗口停在 1464x868 没铺满。
#     同步调用（会等对方线程，但对方此刻是空闲的）才真正生效。
#   · 尺寸直接用屏幕尺寸 GetSystemMetrics，不去量 WorkerW ——
#     Win11 上 WorkerW 的 GetWindowRect 有时返回"工作区"（少一条任务栏）。
$scrW = [int][SuzuranDesk]::GetSystemMetrics(0)   # SM_CXSCREEN
$scrH = [int][SuzuranDesk]::GetSystemMetrics(1)   # SM_CYSCREEN
if ($scrW -le 0) { $scrW = 1920 }
if ($scrH -le 0) { $scrH = 1080 }
Say "  屏幕尺寸 ${scrW}x${scrH}，SetWindowPos（同步）..."
[Console]::Out.Flush()

# SWP_NOACTIVATE=0x0010  SWP_FRAMECHANGED=0x0020  SWP_SHOWWINDOW=0x0040
$ok = [SuzuranDesk]::SetWindowPos([IntPtr]$hwnd, [IntPtr]::Zero, 0, 0, $scrW, $scrH, 0x0070)
Say "  SetWindowPos 返回 $ok"
[Console]::Out.Flush()

# 回读确认真的生效（异步或被拒绝时不至于默默失败）
$chk = New-Object SuzuranDesk+RECT
[SuzuranDesk]::GetWindowRect([IntPtr]$hwnd, [ref]$chk) | Out-Null
$gotW = $chk.Right - $chk.Left
$gotH = $chk.Bottom - $chk.Top
Say "  回读尺寸 ${gotW}x${gotH}"
[Console]::Out.Flush()

if ($gotW -eq $scrW -and $gotH -eq $scrH) {
  Say "OK 已挂到桌面层，铺满 ${scrW}x${scrH}"
  # ASCII 标记行：调用方（Node）拿到的 stdout 可能被按 GBK 解码，中文会变乱码，
  # 所以成功/失败判定一律匹配这一行 ASCII，不要去匹配中文。
  [Console]::Out.WriteLine("RESULT=OK new=${gotW}x${gotH} want=${scrW}x${scrH}")
} else {
  Say "WARN 已挂到桌面层，但尺寸 ${gotW}x${gotH}（期望 ${scrW}x${scrH}）"
  [Console]::Out.WriteLine("RESULT=OK_SIZE_MISMATCH new=${gotW}x${gotH} want=${scrW}x${scrH}")
}
