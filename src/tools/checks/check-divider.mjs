/*
 * 严格检查栏边界处有没有分界线 · strict divider check
 * ------------------------------------------------
 * 干扰源要排掉：网格动效是大块模糊色团，本身就会造成亮度起伏。
 * 所以测量时先把动效层藏掉，只留纯背景，然后逐列扫。
 *
 * 判据：在栏边界那一列，左右相邻列的跳变是否显著大于其它处。
 *
 * 用法：node src/tools/check-divider.mjs
 */

import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { makeShot } from '../lib/cdp-shot.mjs'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9369
const OUT = join('D:', 'suzuran-player', 'docs', 'shots', 'divider-strip.png')

const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-dv2')}`,
  `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' })
async function waitEndpoint() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return await r.json() } catch {}
    await new Promise(r => setTimeout(r, 150))
  }
  throw new Error('CDP 没起来')
}
const ver = await waitEndpoint()
const ws = new WebSocket(ver.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
let id = 1
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) } }
})
const send = (method, params = {}, sid) => new Promise((res, rej) => {
  const n = id++
  pending.set(n, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))
  const p = { id: n, method, params }
  if (sid) p.sessionId = sid
  ws.send(JSON.stringify(p))
  setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')) } }, 60000)
})
const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const call = (m, p) => send(m, p, sessionId)
await call('Runtime.enable')
await call('Page.enable')
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 4000))

const shot = makeShot(call, { width: 1440, height: 900 })

/**
 * @param {string} label 这一步的名字
 * @param {string} css 额外注入的 CSS（用来关掉干扰层）
 */
async function measure(label, css) {
  await call('Runtime.evaluate', {
    expression: `(() => {
      let el = document.getElementById('dbg-style')
      if (!el) { el = document.createElement('style'); el.id = 'dbg-style'; document.head.appendChild(el) }
      el.textContent = ${JSON.stringify(css)}
    })()`,
  })
  await new Promise(r => setTimeout(r, 300))

  const geo = await call('Runtime.evaluate', {
    expression: `JSON.stringify({b: Math.round(document.querySelector('.left').getBoundingClientRect().right)})`,
    returnByValue: true,
  })
  const boundary = JSON.parse(geo.result.value).b

  // 在栏边界两边各取 100px，避开文字（y=755 那条带是空的）
  const X0 = Math.max(0, boundary - 100)
  await shot.file(OUT, { clip: { x: X0, y: 755, width: 200, height: 40, scale: 1 } })

  const raw = join(process.env.TEMP ?? '.', 'divider.raw')
  execFileSync('D:\\ffmpeg\\bin\\ffmpeg.exe', ['-y', '-v', 'error', '-i', OUT, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw], { stdio: 'inherit' })
  const buf = readFileSync(raw)
  const W = 200, H = 40
  const cols = []
  for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 3
      r += buf[i]; g += buf[i + 1]; b += buf[i + 2]
    }
    cols.push([r / H, g / H, b / H])
  }
  const jump = (x) => Math.abs(cols[x][0] - cols[x - 1][0]) + Math.abs(cols[x][1] - cols[x - 1][1]) + Math.abs(cols[x][2] - cols[x - 1][2])

  // 颗粒纹理会在个别列上产生孤立尖峰（点阵），先对列均值做 3 点中值滤波，
  // 再算相邻列差分 —— 这样留下的是"台阶"（真正的分界线），而不是噪点。
  const med = cols.map((_, i) => {
    if (i === 0 || i === W - 1) return cols[i]
    const nb = [cols[i - 1][0], cols[i][0], cols[i + 1][0]].sort((a, b) => a - b)
    const ng = [cols[i - 1][1], cols[i][1], cols[i + 1][1]].sort((a, b) => a - b)
    const nbb = [cols[i - 1][2], cols[i][2], cols[i + 1][2]].sort((a, b) => a - b)
    return [nb[1], ng[1], nbb[1]]
  })
  const jumps = []
  for (let x = 1; x < W; x++) {
    jumps.push(Math.abs(med[x][0] - med[x - 1][0]) + Math.abs(med[x][1] - med[x - 1][1]) + Math.abs(med[x][2] - med[x - 1][2]))
  }
  const avg = jumps.reduce((a, b) => a + b, 0) / jumps.length
  const max = Math.max(...jumps)
  const atB = boundary - X0
  const near = jumps.slice(Math.max(0, atB - 4), atB + 4)   // 边界附近 ±4 列
  const atBoundary = Math.max(...near)
  const far = [...jumps.slice(0, Math.max(0, atB - 12)), ...jumps.slice(atB + 12)]
  const farMax = far.length > 0 ? Math.max(...far) : 0

  console.log(`\n── ${label} ──`)
  console.log(`  栏边界在页面 x=${boundary}（竖条内 x=${atB}）`)
  console.log(`  平均相邻列跳变 ${avg.toFixed(2)}  |  远处最大 ${farMax.toFixed(2)}  |  边界附近最大 ${atBoundary.toFixed(2)}`)
  const hard = atBoundary > Math.max(4, farMax * 1.6)
  console.log(`  判定：${hard ? '✗ 边界处有台阶（分界线）' : '✓ 平滑，无台阶'}`)
  const s = (x) => { const [r, g, b] = cols[x].map(v => Math.round(v)); return `rgb(${r},${g},${b})` }
  console.log(`  边界左 8px: ${s(atB - 8)}   边界右 8px: ${s(atB + 8)}`)
  return atBoundary
}

// 干扰层层层排除，最后只留纯背景
await measure('① 关掉网格动效', `.fx { display: none !important }`)
await measure('② 再关掉颗粒纹理', `.fx, .grain { display: none !important }`)
await measure('③ 再关掉整卡渐隐', `.fx, .grain, .vignette { display: none !important }`)

ws.close()
child.kill()
