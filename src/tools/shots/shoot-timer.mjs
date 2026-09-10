/*
 * 验证计时器交互 · CDP
 * --------------------
 * 点开始 → 等 3 秒 → 看时间是否在走；切休息 → 看时长与预设是否变；点预设 → 看总时长。
 *
 * 用法：node theme-lab/shoot-timer.mjs [url] [out.png]
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const url = process.argv[2] ?? 'http://127.0.0.1:7790/player-ui.html'
const out = process.argv[3] ?? join(HERE, 'timer-shot.png')
mkdirSync(dirname(out), { recursive: true })

const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => existsSync(p))
if (browser === undefined) { console.error('找不到 Chrome'); process.exit(2) }

const PORT = 9342
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-timer')}`,
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
await new Promise(r => setTimeout(r, 3000))

const read = async () => {
  const r = await call('Runtime.evaluate', {
    expression: `JSON.stringify({
      time: document.getElementById('tTime')?.textContent,
      mark: document.getElementById('tMark')?.textContent,
      date: document.getElementById('tDate')?.textContent,
      state: document.getElementById('tState')?.textContent,
      toggle: document.getElementById('tToggle')?.textContent,
      mode: document.querySelector('.tMode[aria-pressed="true"]')?.textContent,
    })`,
    returnByValue: true,
  })
  return r.result.value ?? '<无返回值>'
}

console.log('初始     :', await read())

await call('Runtime.evaluate', { expression: `document.getElementById('tToggle').click()` })
await new Promise(r => setTimeout(r, 3200))
console.log('开始 3 秒:', await read())

await call('Runtime.evaluate', { expression: `document.getElementById('tToggle').click()` })
await new Promise(r => setTimeout(r, 300))
console.log('暂停     :', await read())

await call('Runtime.evaluate', { expression: `document.querySelector('.tMode[data-mode="rest"]').click()` })
await new Promise(r => setTimeout(r, 400))
console.log('切休息   :', await read())

// 回到专注 + 开始，截个运行中的图
await call('Runtime.evaluate', { expression: `document.querySelector('.tMode[data-mode="work"]').click()` })
await new Promise(r => setTimeout(r, 300))
await call('Runtime.evaluate', { expression: `document.getElementById('tToggle').click()` })
await new Promise(r => setTimeout(r, 2500))

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log(`screenshot: ${out}`)
console.log('运行中   :', await read())
if (logs.length > 0) { console.log('console:'); for (const l of logs.slice(0, 8)) console.log('  ' + l) }

ws.close()
child.kill()
