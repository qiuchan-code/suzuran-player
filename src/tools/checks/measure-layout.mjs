/*
 * 量播放器界面的布局坐标 · measure-layout.mjs
 * -----------------------------------------
 * 给"悬浮控件条"定位用 —— 需要知道封面上方那块空白的确切坐标。
 *
 * 用法：node src/tools/checks/measure-layout.mjs [宽] [高]
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const W = Number(process.argv[2] ?? 1463)
const H = Number(process.argv[3] ?? 915)
const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9391
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-ml')}`,
  `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, 'about:blank',
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
await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 5500))

const expr = `(() => {
  const box = (s) => {
    const e = document.querySelector(s)
    if (!e) return null
    const b = e.getBoundingClientRect()
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }
  }
  return JSON.stringify({
    viewport: { w: innerWidth, h: innerHeight },
    right: box('.right'),
    stage: box('.stage'),
    cover: box('.cover'),
    nowRow: box('.nowRow'),
    nowInfo: box('.nowInfo'),
    title: box('.trackTitle'),
    artist: box('.trackArtist'),
    state: box('.tState'),
    mark: box('.tMark'),
    clockRow: box('.clockRow'),
    viz: box('.viz'),
    meta: box('.meta'),
    lyrics: box('.lyrics'),
    slider: box('#stateSlider'),
    mascot: box('#mascot'),
    cardRight: box('.card'),
  }, null, 1)
})()`

const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true })
const d = JSON.parse(r.result.value)

console.log(`视口 ${d.viewport.w}x${d.viewport.h}\n`)
const rows = ['right', 'stage', 'cover', 'nowRow', 'nowInfo', 'title', 'artist', 'state', 'mark', 'clockRow', 'viz', 'meta', 'lyrics', 'slider', 'mascot']
console.log('元素              x      y      宽     高    右边   下边')
for (const k of rows) {
  const b = d[k]
  if (!b) { console.log(`  ${k.padEnd(14)} （无）`); continue }
  console.log(`  ${k.padEnd(14)} ${String(b.x).padStart(5)} ${String(b.y).padStart(6)} ${String(b.w).padStart(6)} ${String(b.h).padStart(6)} ${String(b.right).padStart(6)} ${String(b.bottom).padStart(6)}`)
}

console.log('\n=== 封面上方那块区域 ===')
const c = d.cover
if (c) {
  console.log(`  封面: x=${c.x}..${c.right}  y=${c.y}..${c.bottom}`)
  console.log(`  封面上沿 y = ${c.y}，往上到 stage 顶部 y = ${d.stage.y}`)
  console.log(`  那块空隙高度 = ${c.y - d.stage.y}px，宽度可用 = ${d.right.right - c.x}px`)
  console.log(`\n  建议悬浮条位置：`)
  console.log(`    x = ${c.x}   （和封面左对齐）`)
  console.log(`    y = ${c.y - 70}   （贴在封面上沿上方，高 56px + 留 14px 间隙）`)
  console.log(`    宽 = ${c.w}   高 = 56`)
}

ws.close()
child.kill()
