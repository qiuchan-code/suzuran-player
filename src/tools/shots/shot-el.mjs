/*
 * 滚动截图指定元素 · shot-el.mjs
 * 用法：node src/tools/shot-el.mjs <url> <选择器> <out.png> [--dark]
 */

import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = process.argv[2]
const sel = process.argv[3]
const out = process.argv[4]
const dark = process.argv.includes('--dark')
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9361
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-el')}`,
  `--remote-debugging-port=${PORT}`, '--window-size=1400,1000', 'about:blank',
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
await call('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false })
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 3500))
if (dark) {
  await call('Runtime.evaluate', { expression: `document.getElementById('darkBtn')?.click()` })
  await new Promise(r => setTimeout(r, 1200))
}
await call('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({block:'center'})` })
await new Promise(r => setTimeout(r, 1500))

// 裁到该元素
const rect = await call('Runtime.evaluate', {
  expression: `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'null';const r=e.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height})})()`,
  returnByValue: true,
})
const r = JSON.parse(rect.result.value)
const shot = await call('Page.captureScreenshot', {
  format: 'png',
  clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.w, height: r.h, scale: 2 },
})
writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('screenshot:', out, `${Math.round(r.w)}x${Math.round(r.h)}`)
ws.close()
child.kill()
