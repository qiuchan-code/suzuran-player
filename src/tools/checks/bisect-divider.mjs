/*
 * 逐层隐藏定位分界线 · bisect
 * -------------------------
 * 用户反馈左栏右缘有一条竖直分界线。这里依次把可疑元素都去掉，
 * 每个状态截一张图，看哪一层消失后分界线就没了。
 *
 * 用法：node src/tools/bisect-divider.mjs
 * 产物：docs/shots/bisect-*.png
 */

import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9366
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-bi')}`,
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

/**
 * 每一步：注入一段 CSS 关掉某些东西，然后在分界线附近取一条 120px 宽的竖条截图。
 * 用像素差来判断：如果这条竖条里左右两半的亮度有明显跳变，说明分界线还在。
 */
const STEPS = [
  { tag: '00-baseline', label: '原样', css: '' },
  { tag: '01-no-left-after', label: '去掉 .left::after（右缘渐隐）', css: `.left::after { display: none !important }` },
  { tag: '02-no-left-before', label: '再去掉 .left::before（上下压暗）', css: `.left::after, .left::before { display: none !important }` },
  { tag: '03-no-left-bg', label: '左栏彻底透明（含伪元素）', css: `.left, .left::before, .left::after { background: none !important; box-shadow: none !important; border: 0 !important }` },
  { tag: '04-no-grid', label: '左栏不占位（display:none）', css: `.left { display: none !important }` },
  { tag: '05-no-right-pad', label: '右栏去掉左边距', css: `.right { padding-left: 0 !important }` },
]

const results = []
for (const s of STEPS) {
  await call('Runtime.evaluate', {
    expression: `(() => {
      let el = document.getElementById('bisect-style')
      if (!el) { el = document.createElement('style'); el.id = 'bisect-style'; document.head.appendChild(el) }
      el.textContent = ${JSON.stringify(s.css)}
    })()`,
  })
  await new Promise(r => setTimeout(r, 400))
  const shot = await call('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 620, y: 200, width: 160, height: 500, scale: 1 },   // 跨 46% (662px) 两侧
  })
  const file = join('D:', 'suzuran-player', 'docs', 'shots', `bisect-${s.tag}.png`)
  writeFileSync(file, Buffer.from(shot.data, 'base64'))

  // 顺便量一下分界线两侧的实际像素色：用 canvas 读截图不行，改用量 DOM 背景
  const info = await call('Runtime.evaluate', {
    expression: `(() => {
      const l = document.querySelector('.left'), r = document.querySelector('.right')
      const cs = (e, p) => getComputedStyle(e).getPropertyValue(p)
      return JSON.stringify({
        leftW: Math.round(l.getBoundingClientRect().width),
        leftAfterBg: cs(l, 'backgroundImage').slice(0, 50),
        leftBg: cs(l, 'backgroundColor'),
        rightBg: cs(r, 'backgroundColor'),
      })
    })()`,
    returnByValue: true,
  })
  results.push({ tag: s.tag, label: s.label, info: info.result.value })
  console.log(`✓ ${s.label}`)
}

console.log('\n各步骤的 DOM 状态：')
for (const r of results) console.log(`  ${r.tag}: ${r.info}`)
console.log('\n截图在 docs/shots/bisect-*.png（160x500 的竖条，跨分界线）')
ws.close()
child.kill()
