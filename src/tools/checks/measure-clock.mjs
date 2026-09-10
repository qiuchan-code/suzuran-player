/*
 * 量时钟行是否放得下 · measure clock row
 * 用法：node src/tools/measure-clock.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9364
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-ck')}`,
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

const probe = `(() => {
  const row = document.querySelector('.clockRow')
  const t = document.getElementById('tTime')
  const d = document.getElementById('tDate')
  const st = document.querySelector('.stage')
  const r = (e) => { const b = e.getBoundingClientRect(); return {w: Math.round(b.width), x: Math.round(b.x), right: Math.round(b.right)} }
  return JSON.stringify({
    rowW: Math.round(row.clientWidth),
    rowRight: Math.round(row.getBoundingClientRect().right),
    stageRight: Math.round(st.getBoundingClientRect().right),
    time: {...r(t), fs: getComputedStyle(t).fontSize, text: t.textContent},
    date: {...r(d), fs: getComputedStyle(d).fontSize, text: d.textContent},
    sum: r(t).w + r(d).w + 16,
    overflow: r(d).right > Math.round(st.getBoundingClientRect().right),
  }, null, 1)
})()`
console.log((await call('Runtime.evaluate', { expression: probe, returnByValue: true })).result.value)
ws.close()
child.kill()
