/*
 * GPU 内存与窗口面积的关系 · bench-size.mjs
 * --------------------------------------
 * 假设：GPU 内存 ≈ k × 窗口面积（合成器后台缓冲）。若成立，则是渲染管线开销，
 * 不是某个元素的错，减小窗口/降分辨率就能线性降下来。
 *
 * 用法：electron bench-size.mjs
 */

import { app, BrowserWindow, screen } from 'electron'

const mb = (n) => Math.round(n / 1024 / 1024)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

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

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

const rows = []

app.whenReady().then(async () => {
  const full = screen.getPrimaryDisplay().bounds
  const win = new BrowserWindow({
    x: 0, y: 0, width: full.width, height: full.height,
    frame: false, show: true, skipTaskbar: true, focusable: false,
    backgroundColor: '#fff9fa',
    webPreferences: { backgroundThrottling: false },
  })
  await win.loadURL('http://127.0.0.1:7790/player-ui.html')
  await sleep(8000)

  for (const scale of [1.0, 0.75, 0.5, 0.35, 0.25]) {
    const w = Math.round(full.width * scale)
    const h = Math.round(full.height * scale)
    win.setSize(w, h)
    await sleep(6000)   // 等重排 + 合成器重建

    const ts = [], bys = []
    for (let i = 0; i < 3; i++) {
      await sleep(1200)
      const s = procSet()
      ts.push(s.total); bys.push(s.by)
    }
    ts.sort((a, b) => a - b)
    const med = ts[Math.floor(ts.length / 2)]
    const gpu = bys.map(o => o.GPU ?? 0).sort((a, b) => a - b)[1]
    const px = w * h
    console.log(`${String(w).padStart(5)}x${String(h).padStart(4)}  (${(scale * 100).toFixed(0).padStart(3)}%)  合计 ${String(mb(med)).padStart(5)} MB   GPU ${String(mb(gpu)).padStart(5)} MB   ${(med / px * 1000).toFixed(1)} MB/百万像素`)
    rows.push({ w, h, px, med, gpu })
  }

  // 线性拟合（用 GPU 值）
  const n = rows.length
  const sx = rows.reduce((a, r) => a + r.px, 0)
  const sy = rows.reduce((a, r) => a + r.gpu, 0)
  const sxy = rows.reduce((a, r) => a + r.px * r.gpu, 0)
  const sxx = rows.reduce((a, r) => a + r.px * r.px, 0)
  const k = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  const b = (sy - k * sx) / n
  console.log(`\nGPU ≈ ${(k * 1e6 / 1024 / 1024).toFixed(2)} MB / 百万像素 + ${mb(b)} MB 固定开销`)
  console.log(`满屏(${full.width}x${full.height})预测 GPU = ${mb(k * full.width * full.height + b)} MB`)

  app.quit()
})

app.on('window-all-closed', () => { /* 流程控制 */ })
