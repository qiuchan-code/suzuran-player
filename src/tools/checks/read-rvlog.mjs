/*
 * 读过渡诊断日志 · read rv log
 * 用法：node src/tools/read-rvlog.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9378
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-rl')}`,
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
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 4500))

await call('Runtime.evaluate', { expression: `document.getElementById('mascot').click()` })
await new Promise(r => setTimeout(r, 1800))

const r = await call('Runtime.evaluate', { expression: `JSON.stringify(window.__rvLog || null)`, returnByValue: true })
const log = JSON.parse(r.result.value)
if (log === null) { console.log('__rvLog 不存在（说明 revealTheme 里的代码没跑到）'); }
else {
  console.log(`共 ${log.length} 条记录\n`)
  console.log('  #   t(ms)     p      r      maskImage 前缀')
  for (const e of log.slice(0, 30)) {
    console.log(`  ${String(log.indexOf(e)).padStart(2)}  ${String(e.t).padStart(5)}  ${String(e.p ?? '').padStart(6)}  ${String(e.r ?? '').padStart(6)}   ${e.mi ?? e.ev ?? ''}`)
  }
  if (log.length > 30) console.log(`  … 还有 ${log.length - 30} 条`)
  const last = log[log.length - 1]
  console.log(`\n最后一帧: t=${last.t}ms  p=${last.p}  r=${last.r}`)
  if (last.r === 0) console.log('  ✗ 半径一直是 0 —— tick 没有被反复调用，或 far 算成了 0')
  else console.log('  ✓ 半径有增长')
  console.log(`  far=${log[0].far}  ox=${log[0].ox}  oy=${log[0].oy}`)
}

ws.close()
child.kill()
