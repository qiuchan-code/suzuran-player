/*
 * 主题过渡逐帧采样 · transition frames
 * ----------------------------------
 * 在过渡过程中按时间点截多帧，量左右两侧的像素，
 * 判断"扩散"到底有没有铺满整个屏幕，还是只在一个角落。
 *
 * 用法：node src/tools/transition-frames.mjs
 * 产物：docs/shots/trans-*.png
 */

import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { makeShot } from '../lib/cdp-shot.mjs'

const OUTDIR = join('D:', 'suzuran-player', 'docs', 'shots')
mkdirSync(OUTDIR, { recursive: true })

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9375
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-tf')}`,
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
await new Promise(r => setTimeout(r, 4500))

const shot = makeShot(call, { width: 1440, height: 900 })

/** 取 4 个采样点的颜色：左上、右上、左下、右下（都避开文字）。 */
async function samplePoints(tag) {
  const pts = [
    { name: '左上', x: 100, y: 90 },
    { name: '右上', x: 1340, y: 90 },
    { name: '左下', x: 100, y: 820 },
    { name: '右下', x: 1340, y: 700 },
    // 扩散原点（滑块）附近
    { name: '原点', x: 1100, y: 840 },
    // 屏幕正中
    { name: '中央', x: 720, y: 450 },
  ]
  const png = join(process.env.TEMP ?? '.', `tf-${tag}.png`)
  const raw = join(process.env.TEMP ?? '.', `tf-${tag}.raw`)
  await shot.file(png, {})
  execFileSync('D:\\ffmpeg\\bin\\ffmpeg.exe', ['-y', '-v', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw], { stdio: 'inherit' })
  const buf = readFileSync(raw)
  const W = 1440
  const px = (x, y) => { const i = (y * W + x) * 3; return [buf[i], buf[i + 1], buf[i + 2]] }
  return pts.map(p => ({ name: p.name, rgb: px(p.x, p.y) }))
}

const before = await samplePoints('before')
console.log('切换前：')
for (const p of before) console.log(`  ${p.name}: rgb(${p.rgb.join(',')})`)

// 触发切换，然后在若干时间点采样
await call('Runtime.evaluate', { expression: `document.getElementById('mascot').click()` })

const TIMES = [150, 400, 700, 1000, 1400]
let prev = 0
for (const t of TIMES) {
  await new Promise(r => setTimeout(r, t - prev))
  prev = t
  const snap = await samplePoints(`t${t}`)
  const info = await call('Runtime.evaluate', {
    expression: `(() => {
      const rv = document.getElementById('reveal')
      const sn = rv.querySelector('.snap')
      return JSON.stringify({
        hidden: rv.hidden,
        snapExists: !!sn,
        maskHead: sn ? (sn.style.maskImage || sn.style.webkitMaskImage || '').slice(0, 70) : '',
        switching: document.querySelector('.card').classList.contains('switching'),
      })
    })()`,
    returnByValue: true,
  })
  const j = JSON.parse(info.result.value)
  console.log(`\nt=${t}ms  快照=${j.snapExists ? '有' : '无'} hidden=${j.hidden} switching=${j.switching}`)
  console.log(`  mask: ${j.maskHead}`)
  for (const p of snap) console.log(`  ${p.name}: rgb(${p.rgb.join(',')})`)
  // 存一张整屏图
  await shot.file(join(OUTDIR, `trans-${String(t).padStart(4, '0')}ms.png`), {})
}

ws.close()
child.kill()
