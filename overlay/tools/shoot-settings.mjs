/*
 * 验证浮层设置面板 · CDP
 * 用法：node lyric-overlay/tools/shoot-settings.mjs [url] [out.png]
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const url = process.argv[2] ?? 'http://127.0.0.1:7788/'
const out = process.argv[3] ?? join(HERE, '..', 'shots', 'settings.png')
mkdirSync(dirname(out), { recursive: true })

const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => existsSync(p))
if (browser === undefined) { console.error('找不到 Chrome'); process.exit(2) }

const PORT = 9341
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${join(HERE, '..', 'shots', '.cdp-settings')}`,
  `--remote-debugging-port=${PORT}`, '--window-size=520,760', 'about:blank',
], { stdio: 'ignore' })

async function waitEndpoint() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return await r.json() } catch { /* retry */ }
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
function send(method, params = {}, sessionId) {
  const n = id++
  return new Promise((res, rej) => {
    pending.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)))
    const p = { id: n, method, params }
    if (sessionId) p.sessionId = sessionId
    ws.send(JSON.stringify(p))
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(`${method} 超时`)) } }, 60000)
  })
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const call = (m, p) => send(m, p, sessionId)

await call('Runtime.enable')
await call('Page.enable')
await call('Emulation.setDeviceMetricsOverride', { width: 520, height: 760, deviceScaleFactor: 2, mobile: false })
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 3500))

await call('Runtime.evaluate', { expression: `document.getElementById('settingsBtn').click()` })
await new Promise(r => setTimeout(r, 700))

const probe = await call('Runtime.evaluate', {
  expression: `JSON.stringify({
    panelHidden: document.getElementById('settingsPanel').hidden,
    labels: [...document.querySelectorAll('.fieldLabel')].map(e => e.textContent),
    decor: [...document.querySelectorAll('#decorSeg button')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '✓' : '')),
    scheme: [...document.querySelectorAll('#schemeSeg button')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '✓' : '')),
    offset: document.getElementById('offsetRead').textContent,
    font: getComputedStyle(document.querySelector('.title')).fontFamily.slice(0, 24),
  })`,
  returnByValue: true,
})

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log(`screenshot: ${out}`)
console.log(`panel: ${probe.result.value}`)

ws.close()
child.kill()
