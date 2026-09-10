/*
 * 打印边界附近的逐列像素 · dump columns
 * 用法：node src/tools/dump-columns.mjs [y] [halfWidth]
 */

import { existsSync, readFileSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { makeShot } from '../lib/cdp-shot.mjs'

const Y = Number(process.argv[2] ?? 755)
const HALF = Number(process.argv[3] ?? 30)

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9371
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-dc')}`,
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

// 全部干扰层关掉，只剩纯背景
await call('Runtime.evaluate', {
  expression: `(() => {
    const el = document.createElement('style')
    el.textContent = '.fx, .grain, .vignette { display: none !important }'
    document.head.appendChild(el)
  })()`,
})
await new Promise(r => setTimeout(r, 300))

const geo = await call('Runtime.evaluate', {
  expression: `JSON.stringify({b: Math.round(document.querySelector('.left').getBoundingClientRect().right)})`,
  returnByValue: true,
})
const boundary = JSON.parse(geo.result.value).b
const X0 = boundary - HALF
const W = HALF * 2
const H = 12

const shot = makeShot(call, { width: 1440, height: 900 })
const raw = join(process.env.TEMP ?? '.', 'dump.raw')
const png = join(process.env.TEMP ?? '.', 'dump.png')
await shot.file(png, { clip: { x: X0, y: Y, width: W, height: H, scale: 1 } })
execFileSync('D:\\ffmpeg\\bin\\ffmpeg.exe', ['-y', '-v', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw], { stdio: 'inherit' })
const buf = readFileSync(raw)

console.log(`y=${Y}，x 从 ${X0} 到 ${X0 + W}（栏边界在 ${boundary}）\n`)
console.log('  x      rgb              与前一刻的差')
let prev = null
for (let i = 0; i < W; i++) {
  let r = 0, g = 0, b = 0
  for (let y = 0; y < H; y++) {
    const k = (y * W + i) * 3
    r += buf[k]; g += buf[k + 1]; b += buf[k + 2]
  }
  const c = [r / H, g / H, b / H]
  const d = prev ? Math.abs(c[0] - prev[0]) + Math.abs(c[1] - prev[1]) + Math.abs(c[2] - prev[2]) : 0
  const pageX = X0 + i
  const mark = pageX === boundary ? '  ← 栏边界' : (d > 3 ? '  ← 跳变' : '')
  const col = c.map(v => String(Math.round(v)).padStart(3)).join(',')
  console.log(`  ${String(pageX).padStart(5)}  rgb(${col})   ${d.toFixed(2).padStart(6)}${mark}`)
  prev = c
}

ws.close()
child.kill()
