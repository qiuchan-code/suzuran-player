/*
 * 检查快照行内样式 · snap inline audit
 * 用法：node src/tools/snap-inline.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9382
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-si')}`,
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
    out.paintedLen = typeof painted !== 'undefined' ? painted.length : 'painted 不在作用域'
    out.paintedHasInk = typeof painted !== 'undefined' ? painted.includes('--ink-title-fill') : null
    out.bodyInk = getComputedStyle(document.body).getPropertyValue('--ink-title-fill').trim()
    out.bodyBg = getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim()

    // 手动复现一次快照，看行内样式写了什么
    const card = document.querySelector('.card')
    const snap = card.cloneNode(true)
    const bodyCS = getComputedStyle(document.body)
    let wrote = 0
    const wroteProps = []
    if (typeof painted !== 'undefined') {
      for (const prop of painted) {
        const v = bodyCS.getPropertyValue(prop)
        if (v) { snap.style.setProperty(prop, v.trim()); wrote++; wroteProps.push(prop) }
      }
    }
    out.wroteCount = wrote
    out.snapInlineAttrLen = snap.getAttribute('style') ? snap.getAttribute('style').length : 0
    out.snapInlineHead = (snap.getAttribute('style') || '').slice(0, 200)
    out.snapInkAfterWrite = snap.style.getPropertyValue('--ink-title-fill')
    out.snapBgAfterWrite = snap.style.getPropertyValue('--dsw-alias-bg-base')

    // 挂上去看实际计算值
    document.getElementById('reveal').hidden = false
    document.getElementById('reveal').appendChild(snap)
    snap.classList.add('snap')
    const t = snap.querySelector('.trackTitle')
    out.snapTitleColor = t ? getComputedStyle(t).color : 'n/a'
    const liveT = document.querySelector('.right .trackTitle')
    out.liveTitleColor = liveT ? getComputedStyle(liveT).color : 'n/a'
    // 算一下这个是新还是旧
    out.expectLight = 'rgb(239, 125, 154)'
    out.expectDark = 'rgb(247, 168, 184)'
    document.getElementById('reveal').hidden = true
    document.getElementById('reveal').innerHTML = ''
    return JSON.stringify(out, null, 1)
  })()`,
  returnByValue: true,
})
console.log(r.result.value)

ws.close()
child.kill()
