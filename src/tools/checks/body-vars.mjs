/*
 * 查过渡期间 body 的行内变量 · body vars
 * 用法：node src/tools/body-vars.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9383
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-bv')}`,
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

/*
 * 采样时选择"实页元素"必须避开快照里的副本 —— 快照内部也有 .right/.trackTitle。
 * 用 closest('#reveal') 排除法最稳。
 */
const sample = `(() => {
  const body = document.body
  const cs = getComputedStyle(body)
  const live = document.querySelector('.card > .right > .stage .trackTitle')
  const snap = document.querySelector('#reveal .snap')
  const snapT = live && snap ? snap.querySelector('.trackTitle') : null
  const inSnap = (el) => !!(el && el.closest && el.closest('#reveal'))
  return JSON.stringify({
    inlineInk: body.style.getPropertyValue('--ink-title-fill') || '(空)',
    computedInk: cs.getPropertyValue('--ink-title-fill').trim(),
    liveColor: live ? getComputedStyle(live).color : '-',
    liveInSnap: inSnap(live),
    snapColor: snapT ? getComputedStyle(snapT).color : '-',
    bodyDark: body.hasAttribute('data-ds-dark-theme'),
  })
})()`

console.log('切换前 :', (await call('Runtime.evaluate', { expression: sample, returnByValue: true })).result.value)

await call('Runtime.evaluate', { expression: `document.getElementById('mascot').click()` })
for (const ms of [60, 250, 600, 1000, 1400]) {
  await new Promise(r => setTimeout(r, ms === 60 ? 60 : 0))
  if (ms !== 60) await new Promise(r => setTimeout(r, 0))
  const r = await call('Runtime.evaluate', { expression: sample, returnByValue: true })
  console.log(`切换后 ${String(ms).padStart(4)}ms:`, r.result.value)
  await new Promise(r => setTimeout(r, ms === 60 ? 190 : 0))
}

ws.close()
child.kill()
