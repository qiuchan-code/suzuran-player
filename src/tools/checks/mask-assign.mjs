/*
 * 验证行内 mask-image 到底能不能生效 · mask assign test
 * 用法：node src/tools/mask-assign.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9388
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-ma')}`,
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
    const out = {}
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;inset:0;background:red;z-index:99999'
    document.body.appendChild(d)

    // 测试 1：用 style.maskImage 赋值
    const m1 = 'radial-gradient(circle 300px at 500px 500px, transparent 0%, transparent 286px, #000 300px)'
    d.style.maskImage = m1
    out.afterMaskImage = d.style.maskImage
    out.afterWebkit = d.style.webkitMaskImage
    out.computedMask = getComputedStyle(d).maskImage.slice(0, 80)

    // 测试 2：改用 setProperty
    d.style.removeProperty('mask-image')
    d.style.removeProperty('-webkit-mask-image')
    d.style.setProperty('mask-image', m1)
    d.style.setProperty('-webkit-mask-image', m1)
    out.setPropertyMask = d.style.getPropertyValue('mask-image')
    out.setPropertyWebkit = d.style.getPropertyValue('-webkit-mask-image')
    out.computed2 = getComputedStyle(d).maskImage.slice(0, 80)
    out.computed2Webkit = getComputedStyle(d).webkitMaskImage.slice(0, 80)

    // 测试 3：带空格的写法（CSS 里常见）会不会解析失败
    const m3 = 'radial-gradient(circle 300px at 500px 500px, transparent 0%, transparent 286px, rgb(0, 0, 0) 300px)'
    d.style.setProperty('mask-image', m3)
    out.withRgb = d.style.getPropertyValue('mask-image')
    out.computed3 = getComputedStyle(d).maskImage.slice(0, 80)

    d.remove()
    return JSON.stringify(out, null, 1)
  })()`,
  returnByValue: true,
})
console.log(r.result.value)

ws.close()
child.kill()
