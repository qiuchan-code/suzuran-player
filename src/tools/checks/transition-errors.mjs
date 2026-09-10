/*
 * 抓过渡动画里的异常 · catch transition errors
 * 用法：node src/tools/transition-errors.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9377
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-te')}`,
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
const events = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) }; return }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails
    events.push('EXCEPTION: ' + (d.exception?.description ?? d.text ?? '').split('\n').slice(0, 3).join(' | '))
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    events.push('[' + m.params.type + '] ' + (m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' '))
  }
  if (m.method === 'Log.entryAdded') {
    events.push('LOG[' + m.params.entry.level + ']: ' + m.params.entry.text)
  }
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
await call('Log.enable')
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 4500))

// 手动把 tick 的循环跑一遍，看会不会抛
console.log('=== 直接调 revealTheme 并跟踪每帧 ===')
const r = await call('Runtime.evaluate', {
  expression: `(() => {
    const out = { frames: 0, errors: [], radii: [] }
    const origRAF = window.requestAnimationFrame
    window.requestAnimationFrame = function (cb) {
      return origRAF.call(window, (t) => {
        try { cb(t) } catch (e) { out.errors.push(String(e && e.stack ? e.stack.split('\\n').slice(0,3).join(' | ') : e)); throw e }
      })
    }
    // 也包一下 setInterval 里那个 setTimeout 收尾
    try {
      switchScheme('dark')
      out.frames = -1   // 标记已触发
    } catch (e) {
      out.errors.push('switchScheme threw: ' + String(e))
    }
    return JSON.stringify(out)
  })()`,
  returnByValue: true,
})
console.log(r.result.value)

await new Promise(r => setTimeout(r, 1500))
console.log('\n=== 控制台/异常事件 ===')
if (events.length === 0) console.log('  （无）')
for (const e of events.slice(0, 15)) console.log('  ' + e)

ws.close()
child.kill()
