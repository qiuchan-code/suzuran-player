/*
 * 打开设置面板并截图 · CDP
 * ------------------------
 * 验证右上角齿轮点击后弹出面板（headless 直连 http 会挂，所以走 CDP）。
 *
 * 用法：node theme-lab/shoot-ui.mjs [url] [out.png] [--dark] [--open-settings]
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const url = args[0] ?? 'http://127.0.0.1:7790/player-ui.html'
const out = args[1] ?? join(HERE, 'player-ui-shot.png')
const dark = args.includes('--dark')
const openSettings = args.includes('--open-settings')

mkdirSync(dirname(out), { recursive: true })
const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => existsSync(p))
if (browser === undefined) { console.error('找不到 Chrome'); process.exit(2) }

const PORT = 9340
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-ui')}`,
  `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank',
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
const logs = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) }; return }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ${(m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ')}`)
  if (m.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? ''}`)
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
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })

await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 3500))

if (dark) {
  await call('Runtime.evaluate', { expression: `document.querySelector('#schemeSeg [data-scheme="dark"]').click()` })
  await new Promise(r => setTimeout(r, 400))
}
if (openSettings) {
  await call('Runtime.evaluate', { expression: `document.getElementById('settingsBtn').click()` })
  await new Promise(r => setTimeout(r, 500))
}

const probe = await call('Runtime.evaluate', {
  expression: `JSON.stringify({
    panelHidden: document.getElementById('settingsPanel').hidden,
    schemePressed: document.querySelector('#schemeSeg [aria-pressed="true"]')?.textContent,
    decorPressed: document.querySelector('#decorSeg [aria-pressed="true"]')?.textContent,
    lyricNow: document.querySelector('.ly-now')?.textContent,
    lyricFont: getComputedStyle(document.querySelector('.ly-now')).fontFamily.slice(0, 30),
    cardW: document.querySelector('.card').clientWidth,
    cardH: document.querySelector('.card').clientHeight,
  })`,
  returnByValue: true,
})

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log(`url: ${url}`)
console.log(`screenshot: ${out}`)
console.log(`page: ${probe.result.value}`)
if (logs.length > 0) { console.log('console:'); for (const l of logs.slice(0, 8)) console.log('  ' + l) }

ws.close()
child.kill()
