/*
 * 打印 body 直接子元素 + .card 内部结构 · dom dump
 * 用法：node src/tools/dom-dump.mjs
 */

import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9385
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-dd')}`,
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

/** 生成一棵简化的树。 */
const tree = (rootSel, depth) => `(() => {
  const root = document.querySelector(${JSON.stringify(rootSel)})
  if (!root) return '（找不到 ' + ${JSON.stringify(rootSel)} + '）'
  const line = (e, d) => {
    const pad = '  '.repeat(d)
    const id = e.id ? '#' + e.id : ''
    const cls = (typeof e.className === 'string' && e.className.trim()) ? '.' + e.className.trim().split(/\\s+/).join('.') : ''
    const b = e.getBoundingClientRect()
    return pad + e.tagName.toLowerCase() + id + cls + '  ' + Math.round(b.width) + 'x' + Math.round(b.height)
  }
  const walk = (e, d) => {
    if (d > ${depth}) return []
    const out = [line(e, d)]
    for (const c of e.children) out.push(...walk(c, d + 1))
    return out
  }
  return walk(root, 0).join('\\n')
})()`

console.log('═══ body 的直接子元素 ═══')
let r = await call('Runtime.evaluate', {
  expression: `[...document.body.children].map(e => e.tagName.toLowerCase() + (e.id ? '#'+e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.'+e.className.trim().split(/\\s+/).join('.') : '')).join('\\n')`,
  returnByValue: true,
})
console.log(r.result.value)

console.log('\n═══ .card 内部（3 层）═══')
r = await call('Runtime.evaluate', { expression: tree('.card', 2), returnByValue: true })
console.log(r.result.value)

console.log('\n═══ .card 里 .trackTitle 的所有实例 ═══')
r = await call('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('.trackTitle')].map((e,i) => {
    const inReveal = !!e.closest('#reveal')
    const b = e.getBoundingClientRect()
    return i + ': inReveal=' + inReveal + ' color=' + getComputedStyle(e).color + ' box=' + Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height)
  }).join('\\n')`,
  returnByValue: true,
})
console.log(r.result.value)

ws.close()
child.kill()
