/*
 * 在播放器页面里直接查网络请求 · debug live
 * 用法：node theme-lab/debug-live.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9349
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-debug')}`,
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
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails?.exception?.description ?? '').split('\n').slice(0, 2).join(' | '))
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + (m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' '))
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
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 5000))

const probe = await call('Runtime.evaluate', {
  expression: `(async () => {
    const out = { href: location.href, proto: location.protocol }
    try {
      const r = await fetch('/api/state', { cache: 'no-store' })
      out.stateStatus = r.status
      const j = await r.json()
      out.track = j.track ? (j.track.title + ' - ' + j.track.artist) : null
      out.kind = j.kind
      out.coverUrl = j.coverUrl
    } catch (e) { out.stateErr = String(e) }
    try {
      out.hasCreateLive = typeof createLive
      out.hasLive = typeof live
    } catch (e) { out.liveErr = String(e) }
    return JSON.stringify(out, null, 1)
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
console.log(probe.result.value)
if (logs.length) { console.log('\n控制台:'); logs.slice(0, 10).forEach(l => console.log('  ' + l)) }

ws.close()
child.kill()
