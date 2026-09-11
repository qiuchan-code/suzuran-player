/*
 * 最小基线测试 · bench-min.mjs
 * --------------------------
 * 之前测出"只留文字也要 GPU 803MB"，对一个静态页面来说不可能。
 * 怀疑是 Chromium 的 GPU 内存上报口径问题（共享池 / 预算值，不是实际占用）。
 *
 * 这版从最小场景往上加，看清基线到底是多少。
 *
 * 用法：electron bench-min.mjs
 */

import { app, BrowserWindow, screen } from 'electron'

const mb = (n) => Math.round(n / 1024 / 1024)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** 所有进程的 workingSet（任务管理器里看到的那个）。 */
function procSet() {
  const m = app.getAppMetrics()
  const by = {}
  let total = 0
  for (const p of m) {
    const w = (p.memory?.workingSetSize ?? 0) * 1024
    by[p.type] = (by[p.type] ?? 0) + w
    total += w
  }
  return { total, by }
}

const CASES = [
  { name: '1 空白页', html: '<!doctype html><body style="margin:0;background:#fff"></body>' },
  { name: '2 静态渐变背景', html: '<!doctype html><body style="margin:0;background:linear-gradient(135deg,#f9a8c8,#7ec8a0)"></body>' },
  { name: '3 壁纸视频（无遮罩）', html: `<!doctype html><body style="margin:0;overflow:hidden;background:#000">
      <video autoplay loop muted playsinline style="width:100vw;height:100vh;object-fit:cover"
        src="file:///D:/suzuran-player/assets/wallpaper/suzuran_yukihare_34_day.mp4"></video></body>` },
  { name: '4 壁纸视频 + 椭圆遮罩', html: `<!doctype html><body style="margin:0;overflow:hidden;background:#fff9fa">
      <video autoplay loop muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
        -webkit-mask-image:radial-gradient(ellipse 397px 540px at 331px 414px,#000 0%,#000 34%,rgba(0,0,0,.5) 64%,transparent 100%)"
        src="file:///D:/suzuran-player/assets/wallpaper/suzuran_yukihare_34_day.mp4"></video></body>` },
  { name: '5 视频 + 模糊色团', html: `<!doctype html><body style="margin:0;overflow:hidden;background:#fff9fa">
      <video autoplay loop muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"
        src="file:///D:/suzuran-player/assets/wallpaper/suzuran_yukihare_34_day.mp4"></video>
      <div style="position:absolute;inset:0;filter:blur(60px);opacity:.5">
        <i style="position:absolute;width:60%;height:60%;left:-10%;top:-10%;border-radius:50%;background:#ffb3c6"></i>
        <i style="position:absolute;width:50%;height:50%;right:-8%;top:20%;border-radius:50%;background:#a8e6cf"></i>
      </div></body>` },
]

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

const rows = []

app.whenReady().then(async () => {
  const { width, height } = screen.getPrimaryDisplay().bounds

  for (const c of CASES) {
    const win = new BrowserWindow({
      x: 0, y: 0, width, height,
      frame: false, show: true, skipTaskbar: true, focusable: false,
      backgroundColor: '#fff9fa',
      webPreferences: { backgroundThrottling: false },
    })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(c.html))
    await sleep(7000)

    const ts = [], bys = []
    for (let i = 0; i < 4; i++) {
      await sleep(1200)
      const s = procSet()
      ts.push(s.total); bys.push(s.by)
    }
    ts.sort((a, b) => a - b)
    const med = ts[Math.floor(ts.length / 2)]
    const types = new Set(bys.flatMap(o => Object.keys(o)))
    const tm = {}
    for (const k of types) {
      const v = bys.map(o => o[k] ?? 0).sort((a, b) => a - b)
      tm[k] = v[Math.floor(v.length / 2)]
    }
    const detail = Object.entries(tm).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${mb(v)}`).join(' ')
    console.log(`${c.name.padEnd(26)} ${String(mb(med)).padStart(5)} MB   ${detail}`)
    rows.push({ name: c.name, med })

    win.destroy()
    await sleep(2500)
  }

  console.log('\n=== 增量分析 ===')
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i].med - rows[i - 1].med
    console.log(`  ${rows[i].name.padEnd(26)} 比上一档 ${d >= 0 ? '+' : ''}${mb(d)} MB`)
  }

  app.quit()
})

app.on('window-all-closed', () => { /* 流程控制 */ })
