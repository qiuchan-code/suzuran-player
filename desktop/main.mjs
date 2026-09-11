/*
 * 铃兰播放器 · 桌面壁纸模式 · main.mjs
 * ----------------------------------
 * 把播放器界面挂到 Windows 桌面层（WorkerW），替代 Wallpaper Engine。
 *
 * 架构：
 *   1. 先确保背后两个服务在跑（歌词 :7788 / 界面 :7790）
 *      —— 不在就自己拉起来，退出时再关掉自己拉的那些
 *   2. 开一个无边框窗口加载 http://127.0.0.1:7790/player-ui.html
 *   3. 用 attach-desktop.ps1 把窗口 SetParent 到 WorkerW
 *   4. 盯着 explorer：它重启（改分辨率、崩溃恢复）会把窗口挤出来，要重新挂
 *
 * 两个关键坑（都踩过）：
 *   · **不能用 spawnSync** —— 它会阻塞 Electron 主线程，
 *     而 SetParent 需要目标窗口线程处理同步消息，主线程不转就死锁。
 *     必须用异步 spawn。
 *   · **句柄要按 readBigInt64LE 读** —— getNativeWindowHandle() 返回的
 *     Buffer 在 Windows x64 上是 8 字节指针。
 *
 * 用法：
 *   cd desktop
 *   npx electron .                  # 正常启动
 *   npx electron . --windowed       # 不挂桌面层，开个普通窗口（调试用）
 *   npx electron . --no-serve       # 不自动拉服务（服务已在别处跑）
 */

import { app, BrowserWindow, screen, Tray, Menu, nativeImage } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LOG_DIR = join(HERE, 'logs')
const LOG_FILE = join(LOG_DIR, 'desktop.log')

/*
 * 日志实现抽到 log.mjs —— 放这里时被脚本批量替换误伤过（console.log → log 变成自递归）。
 */
import { log } from './log.mjs'

const argv = process.argv.slice(1)
const WINDOWED = argv.includes('--windowed')
const NO_SERVE = argv.includes('--no-serve')
const barEnabled = !argv.includes('--no-bar')   // 悬浮控件条（默认开）

const UI_PORT = 7790
const LYRIC_PORT = 7788
const UI_URL = `http://127.0.0.1:${UI_PORT}/player-ui.html`
const ATTACH_PS = join(HERE, 'attach-desktop.ps1')

const mb = (n) => (n / 1024 / 1024).toFixed(0) + ' MB'

/** 我们拉起来的子进程，退出时要收掉。 */
const owned = []
let win = null
let tray = null
let attachTimer = null

/* 悬浮控件条相关 */
let bar = null              // control-bar 模块返回的对象
let barCollapsed = false
let barTimer = null
let barReposition = null

/* ── 工具 ── */

/** 异步跑命令（绝不 spawnSync）。 */
function run(cmd, args, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true })
    let out = '', err = ''
    p.stdout.on('data', d => { out += d.toString('utf8') })
    p.stderr.on('data', d => { err += d.toString('utf8') })
    const t = setTimeout(() => { try { p.kill() } catch {} resolve({ code: 'TIMEOUT', out, err }) }, timeoutMs)
    p.on('close', code => { clearTimeout(t); resolve({ code, out, err }) })
    p.on('error', e => { clearTimeout(t); resolve({ code: 'ERR', out, err: String(e) }) })
  })
}

/** 端口有人在听吗。 */
async function portAlive(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1200) })
    return r.status > 0
  } catch { return false }
}

/** 等端口起来。 */
async function waitPort(port, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await portAlive(port)) return true
    await new Promise(r => setTimeout(r, 400))
  }
  return false
}

/* ── 服务 ── */

async function ensureServers() {
  if (NO_SERVE) { log('[serve] --no-serve，跳过'); return }

  if (await portAlive(LYRIC_PORT)) {
    log(`[serve] 歌词服务 ${LYRIC_PORT} 已在跑`)
  } else {
    const script = join(ROOT, 'overlay', 'src', 'server.mjs')
    if (!existsSync(script)) { log(`[serve] 找不到 ${script}`); }
    else {
      log(`[serve] 启动歌词服务 ${LYRIC_PORT} ...`)
      const p = spawn(process.execPath, [script, '--port', String(LYRIC_PORT), '--app', 'QQMusic'], {
        cwd: ROOT, windowsHide: true, stdio: 'ignore',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      })
      owned.push(p)
    }
  }

  if (await portAlive(UI_PORT)) {
    log(`[serve] 界面服务 ${UI_PORT} 已在跑`)
  } else {
    const script = join(ROOT, 'src', 'serve.mjs')
    if (!existsSync(script)) { log(`[serve] 找不到 ${script}`); }
    else {
      log(`[serve] 启动界面服务 ${UI_PORT} ...`)
      // 注意：serve.mjs 用的是**位置参数**（argv[2]=端口 argv[3]=根目录），
      // 不是 --port。传错了端口会变成 NaN，服务起不来（踩过）。
      const p = spawn(process.execPath, [script, String(UI_PORT), ROOT], {
        cwd: ROOT, windowsHide: true, stdio: 'ignore',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      })
      owned.push(p)
    }
  }

  const okL = await waitPort(LYRIC_PORT)
  const okU = await waitPort(UI_PORT)
  log(`[serve] 歌词=${okL ? '✓' : '✗'}  界面=${okU ? '✓' : '✗'}`)
  if (!okU) throw new Error('界面服务没起来，没法加载界面')
}

/* ── 桌面挂载 ── */

/** 把窗口挂到桌面层。返回是否成功。 */
async function attachToDesktop(hwnd) {
  const r = await run('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', ATTACH_PS, '-WindowHandle', String(hwnd),
  ], 25000)

  const out = (r.out ?? '').trim()
  /*
   * 成功判据用 ASCII 标记行 `RESULT=OK`（或 RESULT=OK_SIZE_MISMATCH）。
   *
   * 不能用中文匹配：Node 默认按 utf8 解码子进程 stdout，而 PowerShell 5.1
   * 的 `-File` 输出是 GBK，中文会变乱码 —— 匹配 '已挂到桌面层' 永远失败，
   * 于是明明挂上了却被当成失败、退回普通窗口显示。
   *
   * 尺寸不精确不算失败：Chromium 会拒绝外部进程改尺寸（实测返回 True 但
   * 尺寸不变），尺寸本来就该在 Electron 自己那边定（见 setBounds 那段）。
   */
  const m = /RESULT=(OK|OK_SIZE_MISMATCH)\s+new=(\d+)x(\d+)\s+want=(\d+)x(\d+)/.exec(out)
  if (r.code !== 0 || !m) {
    log('[attach] 挂载失败:')
    log('  exit=' + r.code)
    if (out) log('  out: ' + out.replace(/\n/g, '\n       '))
    if (r.err) log('  err: ' + r.err.trim().slice(0, 300))
    return false
  }

  const [, kind, nw, nh, ww, wh] = m
  if (kind === 'OK') log(`[attach] 已挂到桌面层，铺满 ${nw}x${nh}`)
  else log(`[attach] 已挂到桌面层，尺寸 ${nw}x${nh}（期望 ${ww}x${wh}，忽略）`)
  return true
}

/**
 * 确认窗口确实在桌面层。
 * 判据：GetAncestor(hwnd, GA_ROOT) 返回的是 Progman 而不是窗口自己。
 */
async function verifyAttached(hwnd) {
  const ps = `$h=[IntPtr]${hwnd}
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;using System.Text;
public static class V{
 [DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint f);
 [DllImport("user32.dll",CharSet=CharSet.Auto)]public static extern int GetClassName(IntPtr h,StringBuilder s,int m);
 public static string Cls(IntPtr h){var s=new StringBuilder(256);GetClassName(h,s,256);return s.ToString();}}'
$r=[V]::GetAncestor($h,2)
"$r|$([V]::Cls($r))"`
  const r = await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps])
  const line = (r.out ?? '').trim().split('\n').pop() ?? ''
  const cls = line.split('|')[1] ?? ''
  return { root: line.split('|')[0], cls, ok: cls === 'Progman' }
}

/** 定期检查挂载是否还在（explorer 重启会掉）。 */
function watchAttachment(hwnd) {
  let wasAttached = true
  attachTimer = setInterval(async () => {
    const v = await verifyAttached(hwnd)
    if (!v.ok && wasAttached) {
      log('[watch] 检测到已被挤出桌面层（explorer 重启？），重新挂载…')
      wasAttached = false
      const ok = await attachToDesktop(hwnd)
      wasAttached = ok
    } else if (v.ok) {
      wasAttached = true
    }
  }, 5000)
}

/* ── 悬浮控件条 ── */

/**
 * 量出".stage 顶边 → 封面上沿"那块空白，悬浮条就放这儿。
 *
 * 为什么不写死坐标：窗口尺寸变了布局就变（字号/封面尺寸都是按右栏宽推导的），
 * 所以要现量。这块空隙高度约 136px，够放 56px 高的条。
 */
async function measureBarLayout() {
  const expr = `(() => {
    const st = document.querySelector('.stage')
    const cov = document.querySelector('#coverBox') || document.querySelector('#coverImg')
    const right = document.querySelector('.right')
    if (!st || !cov || !right) return 'null'
    const s = st.getBoundingClientRect()
    const c = cov.getBoundingClientRect()
    const r = right.getBoundingClientRect()
    return JSON.stringify({
      x: Math.round(s.x),
      y: Math.round(s.y),
      w: Math.round(r.right - s.x),
      coverTop: Math.round(c.y),
      gap: Math.round(c.y - s.y),
    })
  })()`
  const raw = await win.webContents.executeJavaScript(expr)
  if (!raw || raw === 'null') return null
  return JSON.parse(raw)
}

/** 建立悬浮条并接好双向同步。 */
async function setupControlBar() {
  const geo = await measureBarLayout()
  if (!geo) { log('[bar] 量不到布局，跳过'); return }

  const BAR_H = 56
  const GAP = 14
  // 竖直居中放在封面上方那块空隙里
  const y = geo.y + Math.max(4, Math.round((geo.gap - BAR_H) / 2))
  // 宽度取内容区的一半 —— 之前和内容区同宽（763px）太长了，看着像把标题区盖住
  const w = Math.max(420, Math.round(geo.w * 0.5))

  log(`[bar] 空隙 y=${geo.y}..${geo.coverTop}（${geo.gap}px），悬浮条放 ${geo.x},${y} ${w}x${BAR_H}`)

  const mod = await import('./control-bar.mjs')
  bar = await mod.createControlBar({
    layout: { x: geo.x, y, w },

    // 拖滑块 / 点轨道 → 切档位
    onTier: async (i) => {
      log(`[bar] 切档位 → ${['luna','terra','sol','astra'][i] ?? i}`)
      try {
        await win.webContents.executeJavaScript(`setTier(${i}, true); true`)
      } catch (e) { log('[bar] 切换失败: ' + e.message) }
      await syncBar()
    },

    // 点明暗按钮 → 切主题
    onTheme: async () => {
      try {
        const dark = await win.webContents.executeJavaScript(`scheme === 'dark'`)
        const to = dark ? 'light' : 'dark'
        log(`[bar] 切主题 → ${to}`)
        // revealTheme 是异步动画，不等它
        await win.webContents.executeJavaScript(`switchScheme('${to}'); true`)
      } catch (e) { log('[bar] 切主题失败: ' + e.message) }
      // 动画 5 秒，等它走完再同步状态
      setTimeout(syncBar, 5600)
    },
  })

  await syncBar()

  /*
   * 提一次层级。
   * 浮条现在是普通窗口层级（不压全屏应用），但壁纸挂到 WorkerW 之后
   * 会占住 z-order 靠下的位置 —— 调 moveTop() 保证浮条压在壁纸上。
   * 之后别的普通窗口盖过来就会盖住它，这正是想要的行为。
   */
  bar.raise()
  setTimeout(() => bar?.raise(), 1500)   // 壁纸刚挂完还会再动一次，补一次

  // 窗口尺寸变化后重新定位
  barReposition = () => { repositionBar().catch(() => {}) }
  screen.on('display-metrics-changed', barReposition)
  win.on('resize', () => { clearTimeout(barTimer); barTimer = setTimeout(barReposition, 800) })

  log('[bar] 悬浮控件条已就绪（普通层级；控件可点，其余穿透）')
}

/** 把播放器当前状态同步到悬浮条。 */
async function syncBar() {
  if (!bar) return
  try {
    const st = await win.webContents.executeJavaScript(
      `JSON.stringify({ tier: currentTierIndex(), dark: scheme === 'dark' })`
    )
    const s = JSON.parse(st)
    await bar.setState({ tierIndex: s.tier, dark: s.dark })
  } catch (e) { log('[bar] 同步状态失败: ' + e.message) }
}

/** 重新量布局并挪悬浮条。 */
async function repositionBar() {
  if (!bar) return
  const geo = await measureBarLayout()
  if (!geo) return
  const y = geo.y + Math.max(4, Math.round((geo.gap - bar.BAR_H) / 2))
  bar.reposition({ x: geo.x, y, w: geo.w })
  log(`[bar] 重新定位 → ${geo.x},${y} ${geo.w}x${bar.BAR_H}`)
}

/* ── 内存报告 ── */

function reportMemory() {
  const m = app.getAppMetrics()
  let total = 0
  const lines = []
  for (const p of m) {
    const w = (p.memory?.workingSetSize ?? 0) * 1024
    total += w
    lines.push(`  ${(p.type + ' #' + p.pid).padEnd(18)} ${mb(w).padStart(8)}`)
  }
  log('\n── 内存 ──')
  log(lines.join('\n'))
  log(`  ${'合计'.padEnd(18)} ${mb(total).padStart(8)}`)
  return total
}

/* ── 启动 ── */

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

app.whenReady().then(async () => {
  try {
    await ensureServers()
  } catch (e) {
    log('[fatal] ' + e.message)
    app.quit()
    return
  }

  /*
   * 尺寸与位置。
   *
   * 坑：`screen.getPrimaryDisplay().bounds` 在这台机器上返回的是**工作区**
   * （1463x867，去掉任务栏），不是完整屏幕。壁纸必须铺满整屏，
   * 所以用 display 里最大的那个尺寸兜底。
   */
  const disp = screen.getPrimaryDisplay()
  const b = disp.bounds
  const wa = disp.workArea
  const width = Math.max(b.width, wa.width)
  const height = Math.max(b.height, wa.height)
  const dx = b.x, dy = b.y

  log(`[win] 屏幕 ${width}x${height} (bounds ${b.width}x${b.height} 工作区 ${wa.width}x${wa.height})  模式=${WINDOWED ? '普通窗口' : '桌面壁纸'}`)

  win = new BrowserWindow({
    x: dx, y: dy, width, height,
    frame: false,
    show: false,
    skipTaskbar: !WINDOWED,
    resizable: WINDOWED,
    movable: WINDOWED,
    minimizable: WINDOWED,
    maximizable: WINDOWED,
    focusable: WINDOWED,        // 壁纸不该抢焦点
    backgroundColor: '#fff9fa',
    title: '铃兰播放器',
    webPreferences: {
      backgroundThrottling: false,   // 壁纸要一直动，别被节流
    },
  })

  /*
   * 再显式 setBounds 一次。
   *
   * 为什么不能只靠 BrowserWindow 构造参数：Chromium 会按"工作区"约束窗口，
   * 构造出来往往是 1464x868（少一条任务栏）。而且挂到 WorkerW 之后
   * **从外部进程调 SetWindowPos 改不动它** —— 实测返回 True 但尺寸不变
   * （Chromium 拒绝了跨进程的尺寸请求）。所以尺寸必须在这里、在 Electron
   * 自己的进程里定好。
   */
  if (!WINDOWED) {
    win.setBounds({ x: dx, y: dy, width, height })
    await new Promise(r => setTimeout(r, 300))
    const got = win.getBounds()
    log(`[win] setBounds 后实际 ${got.width}x${got.height}`)
    if (got.height !== height) {
      log(`[win] ⚠ 高度没到位（期望 ${height}）—— 挂载后会再试一次`)
    }
  }

  try {
    await win.loadURL(UI_URL)
  } catch (e) {
    log('[fatal] 加载界面失败: ' + e.message)
    app.quit()
    return
  }
  log('[win] 界面已载入')

  // 等视频起播、布局稳定
  await new Promise(r => setTimeout(r, 3000))

  if (WINDOWED) {
    win.show()
    log('[win] --windowed：不挂桌面层')
  } else {
    win.showInactive()
    await new Promise(r => setTimeout(r, 500))
    const hwnd = win.getNativeWindowHandle().readBigInt64LE(0).toString()
    log('[win] 句柄 ' + hwnd)

    const ok = await attachToDesktop(hwnd)
    if (ok) {
      const v = await verifyAttached(hwnd)
      log(`[verify] root=${v.root} 类=${v.cls}  ${v.ok ? '✓ 确实在桌面层' : '✗ 不在桌面层'}`)
      if (v.ok) watchAttachment(hwnd)
    } else {
      log('[win] 挂载失败，退回普通窗口显示')
      win.show()
    }
  }

  await new Promise(r => setTimeout(r, 3000))
  reportMemory()

  // ── 悬浮控件条 ──
  // 壁纸层收不到鼠标事件，状态滑块和明暗切换得靠这个浮在上面的小条补回来。
  if (!WINDOWED && barEnabled) {
    try {
      await setupControlBar()
    } catch (e) {
      log('[bar] 建立悬浮条失败: ' + e.message)
    }
  }

  // 托盘：壁纸模式下没有窗口可点，得给个退出入口
  try {
    const icon = nativeImage.createEmpty()
    tray = new Tray(icon)
    tray.setToolTip('铃兰播放器 · 桌面壁纸')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '重挂到桌面层', click: async () => {
          const hwnd = win.getNativeWindowHandle().readBigInt64LE(0).toString()
          await attachToDesktop(hwnd)
        } },
      { label: '显示 / 隐藏悬浮条', click: () => { barCollapsed = !barCollapsed; bar?.setCollapsed(barCollapsed) } },
      { label: '重新定位悬浮条', click: () => repositionBar() },
      { label: '打开普通窗口', click: () => { win.setSkipTaskbar(false); win.show() } },
      { type: 'separator' },
      { label: '显示内存占用', click: () => reportMemory() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]))
    log('[tray] 托盘图标已建立（右键退出）')
  } catch (e) {
    log('[tray] 建立托盘失败: ' + e.message)
  }
})

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  if (attachTimer) clearInterval(attachTimer)
  for (const p of owned) { try { p.kill() } catch {} }
  log('[exit] 已收掉自己拉起的服务进程')
})
