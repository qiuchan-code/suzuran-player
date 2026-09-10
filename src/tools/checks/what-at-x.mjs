/*
 * 找出 x=693 处是什么元素 · what is at x
 * 用法：node src/tools/what-at-x.mjs [x]
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const X = Number(process.argv[2] ?? 693)
const Y = Number(process.argv[3] ?? 730)

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9368
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-wx')}`,
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

const r = await call('Runtime.evaluate', {
  expression: `(() => {
    const hits = document.elementsFromPoint(${X}, ${Y})
    return JSON.stringify(hits.map(e => {
      const b = e.getBoundingClientRect()
      const cs = getComputedStyle(e)
      return {
        el: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : ''),
        box: Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height),
        z: cs.zIndex, bg: cs.backgroundColor, bgImg: cs.backgroundImage.slice(0, 40),
        display: cs.display, visibility: cs.visibility,
      }
    }), null, 1)
  })()`,
  returnByValue: true,
})
console.log(`(${X}, ${Y}) 处的元素（从上层到下层）：`)
console.log(r.result.value)

// 再量几个关键元素的边界
const geo = await call('Runtime.evaluate', {
  expression: `(() => {
    const g = (s) => { const e = document.querySelector(s); if (!e) return 'x'; const b = e.getBoundingClientRect(); return Math.round(b.left) + '→' + Math.round(b.right) }
    return JSON.stringify({
      card: g('.card'), left: g('.left'), right: g('.right'), stage: g('.stage'),
      rightPadLeft: getComputedStyle(document.querySelector('.right')).paddingLeft,
      rightPadRight: getComputedStyle(document.querySelector('.right')).paddingRight,
      bodyPad: getComputedStyle(document.body).padding,
    }, null, 1)
  })()`,
  returnByValue: true,
})
console.log('\n关键边界：')
console.log(geo.result.value)
ws.close()
child.kill()
