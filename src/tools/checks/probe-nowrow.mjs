/*
 * 查 .nowRow 内部结构 · probe-nowrow.mjs
 * 用法：node src/tools/checks/probe-nowrow.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9392
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-nr')}`,
  `--remote-debugging-port=${PORT}`, '--window-size=1463,915', 'about:blank',
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
await call('Emulation.setDeviceMetricsOverride', { width: 1463, height: 915, deviceScaleFactor: 1, mobile: false })
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 5500))

const expr = `(() => {
  const out = []
  const walk = (e, d) => {
    const b = e.getBoundingClientRect()
    const cls = (typeof e.className === 'string' && e.className.trim()) ? '.' + e.className.trim().split(/\\s+/).join('.') : ''
    out.push('  '.repeat(d) + e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cls +
      '   ' + Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height))
    for (const c of e.children) walk(c, d + 1)
  }
  const row = document.querySelector('.nowRow')
  if (row) walk(row, 0)

  // 封面的实际图片/占位
  const img = document.querySelector('#coverImg') || document.querySelector('.nowRow img')
  const ph = document.querySelector('#coverPh')
  const info = (e, n) => e ? n + ': ' + (() => { const b = e.getBoundingClientRect(); return Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) })() : n + ': 无'

  return JSON.stringify({
    tree: out.join('\\n'),
    coverImg: info(img, 'coverImg'),
    coverPh: info(ph, 'coverPh'),
    stage: (() => { const b = document.querySelector('.stage').getBoundingClientRect(); return Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) })(),
  }, null, 1)
})()`

const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true })
const d = JSON.parse(r.result.value)
console.log('=== .nowRow 子树 ===')
console.log(d.tree)
console.log('\n=== 封面 ===')
console.log('  ' + d.coverImg)
console.log('  ' + d.coverPh)
console.log('  stage: ' + d.stage)

ws.close()
child.kill()
