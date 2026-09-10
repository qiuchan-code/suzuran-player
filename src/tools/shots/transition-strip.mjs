/*
 * 过渡期间整屏逐帧截图 · transition strip
 * -------------------------------------
 * 不再绕弯子查样式，直接连续截 6 帧存下来看。
 * 用法：node src/tools/transition-strip.mjs
 */

import { existsSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { makeShot } from '../lib/cdp-shot.mjs'

const OUTDIR = join('D:', 'suzuran-player', 'docs', 'shots', 'trans')
mkdirSync(OUTDIR, { recursive: true })

const url = 'http://127.0.0.1:7790/player-ui.html?slow=4'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9386
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-ts')}`,
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
await shot.file(join(OUTDIR, '00-before.png'))
console.log('已存 00-before.png')

// 用「定时器 + 截图」不行（截图本身耗时），改成：把动画时长拉长到 6 秒，
// 这样截图慢一点也能抓到中间过程。
await call('Runtime.evaluate', {
  expression: `(() => {
    // 把 DUR 放大：临时改写 revealTheme 里的时间不现实，改用 CSS 慢放思路 ——
    // 直接加大 requestAnimationFrame 的时间基准做不到，所以这里改用另一种办法：
    // 连续触发后立刻高频截图由外层负责。这里只是标记。
    window.__slow = true
    return 'ok'
  })()`,
})

await call('Runtime.evaluate', { expression: `document.getElementById('mascot').click()` })
// slow=4 → 总时长约 4400ms，按 600ms 间隔抓 7 帧
for (let i = 1; i <= 7; i++) {
  await new Promise(r => setTimeout(r, 600))
  await shot.file(join(OUTDIR, `${String(i).padStart(2, '0')}-t${i * 600}ms.png`))
  console.log(`已存 ${String(i).padStart(2, '0')}-t${i * 600}ms.png`)
}

ws.close()
child.kill()
