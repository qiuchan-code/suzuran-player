/*
 * 验证设置面板与背景动效 · verify-settings.mjs
 * 用法：node src/tools/verify-settings.mjs
 */

import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9362
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-set')}`,
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
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails?.exception?.description ?? '').split('\n')[0])
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
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 4500))

const probe = async (label) => {
  const r = await call('Runtime.evaluate', {
    expression: `JSON.stringify({
      panelHidden: document.getElementById('settingsPanel')?.hidden,
      mascotExpanded: document.getElementById('mascot')?.getAttribute('aria-expanded'),
      gearExists: !!document.getElementById('settingsBtn'),
      fx: document.getElementById('fx')?.dataset.fx,
      snowCount: document.getElementById('fxSnow')?.children.length,
      meshVisible: document.querySelector('.fxMesh') ? getComputedStyle(document.querySelector('.fxMesh')).display : 'n/a',
      snowVisible: document.querySelector('.fxSnow') ? getComputedStyle(document.querySelector('.fxSnow')).display : 'n/a',
      mascotBox: (()=>{const e=document.getElementById('mascot');if(!e)return'x';const b=e.getBoundingClientRect();return Math.round(b.width)+'x'+Math.round(b.height)+' @'+Math.round(b.x)+','+Math.round(b.y)})(),
      panelBox: (()=>{const e=document.getElementById('settingsPanel');if(!e||e.hidden)return'hidden';const b=e.getBoundingClientRect();return Math.round(b.width)+'x'+Math.round(b.height)+' @'+Math.round(b.x)+','+Math.round(b.y)})(),
    })`,
    returnByValue: true,
  })
  console.log(label.padEnd(14) + ':', r.result.value)
}

await probe('初始')
await call('Runtime.evaluate', { expression: `document.getElementById('mascot').click()` })
await new Promise(r => setTimeout(r, 500))
await probe('点铃兰')
await call('Runtime.evaluate', { expression: `document.querySelector('#fxSeg [data-fx="both"]').click()` })
await new Promise(r => setTimeout(r, 800))
await probe('开双动效')

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(join('D:', 'suzuran-player', 'fx-settings.png'), Buffer.from(shot.data, 'base64'))
console.log('screenshot: fx-settings.png')
if (logs.length) { console.log('console:'); logs.slice(0, 6).forEach(l => console.log('  ' + l)) }

ws.close()
child.kill()
