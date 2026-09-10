/*
 * 验证播放器界面：自动计时 + 状态切换 + 截图
 * 用法：node theme-lab/verify-player-ui.mjs [out.png]
 */

import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] ?? join(HERE, 'player-ui-shot.png')
const url = 'http://127.0.0.1:7790/player-ui.html'

const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9346
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-verify')}`,
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
const logs = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) }; return }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails?.exception?.description ?? ''))
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
await new Promise(r => setTimeout(r, 3500))

const read = async () => {
  const r = await call('Runtime.evaluate', {
    expression: `JSON.stringify({
      state: document.getElementById('tState')?.textContent,
      mark: document.getElementById('tMark')?.textContent,
      time: document.getElementById('tTime')?.textContent,
      date: document.getElementById('tDate')?.textContent,
      mode: document.querySelector('#modeSeg [aria-pressed="true"]')?.textContent,
      stateColor: getComputedStyle(document.getElementById('tState')).color,
      hasToggle: !!document.getElementById('tToggle'),
      hasReset: !!document.getElementById('tReset'),
    })`,
    returnByValue: true,
  })
  return r.result.value ?? 'null'
}

console.log('刚打开   :', await read())
await new Promise(r => setTimeout(r, 3000))
console.log('等 3 秒  :', await read())

await call('Runtime.evaluate', { expression: `document.querySelector('#modeSeg [data-mode="fun"]').click()` })
await new Promise(r => setTimeout(r, 2500))
console.log('切到娱乐 :', await read())

await call('Runtime.evaluate', { expression: `document.querySelector('#modeSeg [data-mode="sleep"]').click()` })
await new Promise(r => setTimeout(r, 2000))
console.log('切到睡觉 :', await read())

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('screenshot:', out)
if (logs.length) { console.log('console:'); logs.slice(0, 5).forEach(l => console.log('  ' + l)) }

ws.close()
child.kill()
