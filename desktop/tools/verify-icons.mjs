/*
 * 验证桌面图标是否被壁纸盖住 · verify-icons.mjs
 * ------------------------------------------
 * 用户担心挂上壁纸后桌面快捷方式被遮住。三个角度验证：
 *
 *   1. WindowFromPoint —— 在图标坐标上"命中测试"，看最上层的窗口是谁。
 *      如果命中的是 SysListView32（桌面图标控件），说明图标在最上面。
 *   2. 窗口层级 —— 列出 Progman 下所有子窗口及其 z-order。
 *   3. 截屏采样 —— 在图标区域取像素，和纯色壁纸对比，看图标有没有画出来。
 *
 * 用法：electron verify-icons.mjs
 */

import { app, BrowserWindow, screen, desktopCapturer } from 'electron'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function run(cmd, args, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d.toString('utf8') })
    p.stderr.on('data', d => { err += d.toString('utf8') })
    const t = setTimeout(() => { try { p.kill() } catch {} resolve({ code: 'T', out, err }) }, timeoutMs)
    p.on('close', code => { clearTimeout(t); resolve({ code, out, err }) })
    p.on('error', e => { clearTimeout(t); resolve({ code: 'E', out, err: String(e) }) })
  })
}

/* ── 角度 1 + 2：命中测试与层级 ── */
async function inspectLayers(hwnd) {
  const ps = `
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class L {
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindow(string c, string n);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string n);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int m);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  public static string Cls(IntPtr h){var s=new StringBuilder(256);GetClassName(h,s,256);return s.ToString();}
  public static string Txt(IntPtr h){var s=new StringBuilder(512);GetWindowText(h,s,512);return s.ToString();}
  public static string Chain(IntPtr h) {
    var sb = new StringBuilder();
    var seen = new HashSet<IntPtr>();
    while (h != IntPtr.Zero && seen.Add(h)) {
      var r = new RECT(); GetWindowRect(h, out r);
      sb.Append(Cls(h)).Append("(").Append(h).Append(" ").Append(r.R-r.L).Append("x").Append(r.B-r.T).Append(")");
      h = GetAncestor(h, 1);   // GA_PARENT
      if (h != IntPtr.Zero) sb.Append(" < ");
    }
    return sb.ToString();
  }
  public static string Siblings() {
    IntPtr prog = FindWindow("Progman", "Program Manager");
    var sb = new StringBuilder();
    // 从 z-order 顶部往下遍历 Progman 的子窗口
    IntPtr child = FindWindowEx(prog, IntPtr.Zero, null, null);
    int i = 0;
    while (child != IntPtr.Zero && i < 20) {
      var r = new RECT(); GetWindowRect(child, out r);
      sb.Append("    [").Append(i++).Append("] ").Append(Cls(child)).Append(" hwnd=").Append(child)
        .Append(" 可见=").Append(IsWindowVisible(child))
        .Append(" ").Append(r.R-r.L).Append("x").Append(r.B-r.T).Append("\\n");
      child = FindWindowEx(prog, child, null, null);
    }
    return sb.ToString();
  }
}
'@

[Console]::Out.WriteLine('  ── 命中测试（图标区域最上层是谁）──')
foreach ($pt in @(@(40,40), @(40,120), @(40,200), @(200,40), @(700,400))) {
  $p = New-Object L+POINT
  $p.X = $pt[0]; $p.Y = $pt[1]
  $hit = [L]::WindowFromPoint($p)
  $chain = [L]::Chain($hit)
  [Console]::Out.WriteLine("    ($($pt[0]),$($pt[1])) → $chain")
}

[Console]::Out.WriteLine('')
[Console]::Out.WriteLine('  ── Progman 子窗口的 z-order（0 在最上层）──')
[Console]::Out.Write([L]::Siblings())
`
  const r = await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], 30000)
  return (r.out ?? '') + (r.err ? '\n[ERR] ' + r.err.slice(0, 300) : '')
}

/* ── 角度 3：截屏采样 ── */
async function sampleShot(out) {
  const { width, height } = screen.getPrimaryDisplay().bounds
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } })
  if (sources.length === 0) return null
  const img = sources[0].thumbnail
  writeFileSync(out, img.toPNG())
  return img
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(async () => {
  const { width, height } = screen.getPrimaryDisplay().bounds

  // 壁纸窗口：故意用**纯深色**，这样亮色的桌面图标文字/阴影一旦被遮住就看得出来
  const win = new BrowserWindow({
    x: 0, y: 0, width, height,
    frame: false, show: true, skipTaskbar: true, focusable: false,
    backgroundColor: '#101018',
  })
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101018}
    .g{position:absolute;inset:0;background:
      radial-gradient(40% 35% at 25% 30%, rgba(120,80,140,.55), transparent 70%),
      radial-gradient(35% 30% at 75% 70%, rgba(60,110,100,.5), transparent 70%)}
    .t{position:absolute;right:40px;bottom:30px;font:700 28px sans-serif;color:#8fa;
       letter-spacing:.1em;opacity:.5}
  </style></head><body>
    <div class="g"></div><div class="t">WALLPAPER LAYER</div>
  </body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await sleep(1500)

  const hwnd = win.getNativeWindowHandle().readBigInt64LE(0).toString()
  console.log('壁纸窗口句柄:', hwnd)

  console.log('\n══════ 挂载前 ══════')
  console.log(await inspectLayers(hwnd))

  const before = await sampleShot(join(HERE, '..', 'shots', 'icons-before.png'))
  console.log('  截图: icons-before.png')

  console.log('\n══════ 挂载 ══════')
  const r = await run('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', join(HERE, '..', 'attach-desktop.ps1'), '-WindowHandle', hwnd,
  ], 25000)
  console.log('  ' + (r.out ?? '').trim().split('\n').join('\n  '))
  await sleep(2500)

  console.log('\n══════ 挂载后 ══════')
  console.log(await inspectLayers(hwnd))

  const after = await sampleShot(join(HERE, '..', 'shots', 'icons-after.png'))
  console.log('  截图: icons-after.png')

  // 对比：在图标区域取像素，看有没有变化
  if (before && after) {
    const bs = before.getSize(), as = after.getSize()
    console.log(`\n  截图尺寸 前=${bs.width}x${bs.height} 后=${as.width}x${as.height}`)
    const bmpB = before.toBitmap(), bmpA = after.toBitmap()
    const W = bs.width
    /** 取某点像素。 */
    const px = (bmp, x, y) => {
      const i = (y * W + x) * 4
      return [bmp[i + 2], bmp[i + 1], bmp[i]]   // BGRA → RGB
    }
    // Windows 桌面图标默认从左上角开始，间距约 75-110px
    const spots = [[36, 36], [36, 110], [36, 185], [36, 260], [36, 335], [600, 400]]
    console.log('  图标区域像素对比（前 → 后）：')
    for (const [x, y] of spots) {
      const a = px(bmpB, x, y), b = px(bmpA, x, y)
      const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
      console.log(`    (${String(x).padStart(4)},${String(y).padStart(4)})  rgb(${a.join(',')}) → rgb(${b.join(',')})   差=${d}${d > 30 ? '  ← 这里变了' : ''}`)
    }
  }

  console.log('\n看你的屏幕：桌面图标应该仍然可见、可双击。6 秒后退出。')
  setTimeout(() => app.quit(), 6000)
})

app.on('window-all-closed', () => app.quit())
