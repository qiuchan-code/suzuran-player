/*
 * 最小复现：切一次主题，看 body 到底有没有变 · minimal
 * 用法：node src/tools/switch-minimal.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9381
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-mn')}`,
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
const errs = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) }; return }
  if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails?.exception?.description ?? '').split('\n').slice(0, 4).join(' | '))
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

const state = async (label) => {
  const r = await call('Runtime.evaluate', {
    expression: `JSON.stringify({
      scheme,
      bodyDark: document.body.hasAttribute('data-ds-dark-theme'),
      bgVar: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
      titleColor: getComputedStyle(document.querySelector('.trackTitle')).color,
      revealHidden: document.getElementById('reveal').hidden,
      snapCount: document.getElementById('reveal').children.length,
      rvLogLen: (window.__rvLog || []).length,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    })`,
    returnByValue: true,
  })
  console.log(`  ${label}: ${r.result.value}`)
}

await state('切换前')
console.log('\n调用 switchScheme("dark") …')
const callR = await call('Runtime.evaluate', {
  expression: `(() => { try { switchScheme('dark'); return 'ok' } catch (e) { return 'THREW: ' + e.message } })()`,
  returnByValue: true,
})
console.log('  返回值:', callR.result.value)
await new Promise(r => setTimeout(r, 200))
await state('200ms 后')
await new Promise(r => setTimeout(r, 1400))
await state('1600ms 后')

if (errs.length) { console.log('\n异常:'); errs.slice(0, 8).forEach(e => console.log('  ' + e)) }
else console.log('\n（无异常）')

ws.close()
child.kill()
