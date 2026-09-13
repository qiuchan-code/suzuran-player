/*
 * 播放器界面 · 暗色截图
 * 用法：node theme-lab/shoot-ui-dark.mjs [out.png] [--open-settings]
 */

import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] ?? join(HERE, 'player-ui-dark.png')
const openSettings = process.argv.includes('--open-settings')
const url = 'http://127.0.0.1:7790/player-ui.html'

const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9347
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(HERE, '.cdp-dark')}`,
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
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const n = id++
  pending.set(n, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))
  const p = { id: n, method, params }
  if (sessionId) p.sessionId = sessionId
  ws.send(JSON.stringify(p))
  setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')) } }, 60000)
})

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const call = (m, p) => send(m, p, sessionId)
await call('Runtime.enable')
await call('Page.enable')
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 3000))

await call('Runtime.evaluate', { expression: `document.querySelector('#schemeSeg [data-scheme="dark"]').click()` })
await new Promise(r => setTimeout(r, 600))
if (openSettings) {
  await call('Runtime.evaluate', { expression: `document.getElementById('settingsBtn').click()` })
  await new Promise(r => setTimeout(r, 500))
}

const probe = await call('Runtime.evaluate', {
  expression: `JSON.stringify({
    scheme: document.querySelector('#schemeSeg [aria-pressed="true"]')?.textContent,
    clockFill: getComputedStyle(document.getElementById('tTime')).color,
    clockShadow: getComputedStyle(document.getElementById('tTime')).textShadow.slice(0, 60),
    titleFill: getComputedStyle(document.getElementById('trackTitle')).color,
    artistFill: getComputedStyle(document.getElementById('trackArtist')).color,
    bg: getComputedStyle(document.body).backgroundColor,
  })`,
  returnByValue: true,
})
console.log('暗色探针:', probe.result.value)

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('screenshot:', out)

ws.close()
child.kill()
