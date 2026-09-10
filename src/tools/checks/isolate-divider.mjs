/*
 * 实证：分界线到底由哪一层造成 · isolate
 * ------------------------------------
 * 逐个把层藏掉，每次量同一批像素（边界前后各 6 列），
 * 看哪一层消失后台阶就没了。
 *
 * 用法：node src/tools/isolate-divider.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { makeShot } from '../lib/cdp-shot.mjs'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9373
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-iso')}`,
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

/** 量边界前后各 6 列的均值，返回 {left, right, step}。 */
async function sample(boundary) {
  const X0 = boundary - 6
  const W = 12, H = 10
  const png = join(process.env.TEMP ?? '.', 'iso.png')
  const raw = join(process.env.TEMP ?? '.', 'iso.raw')
  await shot.file(png, { clip: { x: X0, y: 755, width: W, height: H, scale: 1 } })
  execFileSync('D:\\ffmpeg\\bin\\ffmpeg.exe', ['-y', '-v', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw], { stdio: 'inherit' })
  const buf = readFileSync(raw)
  const col = (i) => {
    let r = 0, g = 0, b = 0
    for (let y = 0; y < H; y++) { const k = (y * W + i) * 3; r += buf[k]; g += buf[k + 1]; b += buf[k + 2] }
    return [r / H, g / H, b / H]
  }
  const avg = (from, to) => {
    const s = [0, 0, 0]
    for (let i = from; i <= to; i++) { const c = col(i); s[0] += c[0]; s[1] += c[1]; s[2] += c[2] }
    const n = to - from + 1
    return s.map(v => v / n)
  }
  const L = avg(0, 5)          // 边界左侧 6 列
  const R = avg(6, 11)         // 边界右侧 6 列
  const step = Math.abs(L[0] - R[0]) + Math.abs(L[1] - R[1]) + Math.abs(L[2] - R[2])
  return { L, R, step }
}

const STEPS = [
  { tag: '基线（原样）', css: '' },
  { tag: '藏掉 .left', css: `.left { display: none !important }` },
  { tag: '藏掉视频壁纸', css: `.left .bgVid { display: none !important }` },
  { tag: '藏掉 .fx/.grain/.vignette', css: `.fx, .grain, .vignette { display: none !important }` },
  { tag: '藏掉 .card::after（呼吸光斑）', css: `.card::after { display: none !important }` },
  { tag: '藏掉 .card::before（底色渐变）', css: `.card::before { display: none !important }` },
  { tag: '全藏，只剩 .card 纯色', css: `.left, .right, .fx, .grain, .vignette, .card::before, .card::after { display: none !important }` },
]

for (const s of STEPS) {
  await call('Runtime.evaluate', {
    expression: `(() => {
      let el = document.getElementById('iso-style')
      if (!el) { el = document.createElement('style'); el.id = 'iso-style'; document.head.appendChild(el) }
      el.textContent = ${JSON.stringify(s.css)}
    })()`,
  })
  await new Promise(r => setTimeout(r, 250))
  const geo = await call('Runtime.evaluate', {
    expression: `JSON.stringify({b: Math.round(document.querySelector('.left').getBoundingClientRect().right)})`,
    returnByValue: true,
  })
  const b = JSON.parse(geo.result.value).b
  if (b === 0) { console.log(`  ${s.tag.padEnd(28)} 左栏已隐藏，跳过`); continue }
  const r = await sample(b)
  const f = (c) => c.map(v => String(Math.round(v)).padStart(3)).join(',')
  console.log(`  ${s.tag.padEnd(28)} 左 rgb(${f(r.L)})  右 rgb(${f(r.R)})  台阶 ${r.step.toFixed(1)}${r.step > 6 ? '  ✗' : '  ✓'}`)
}

ws.close()
child.kill()
