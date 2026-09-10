/*
 * 调试新元素：频谱 / 表情 / 昼夜壁纸
 * 用法：node src/tools/debug-parts.mjs
 */

import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9360
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-parts')}`,
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
  if (m.method === 'Log.entryAdded') logs.push('LOG[' + m.params.entry.level + ']: ' + m.params.entry.text)
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
await call('Log.enable')
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 6000))

const probe = `(() => {
  const box = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return 'MISSING'
    const r = el.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }
  }
  const viz = document.getElementById('viz')
  const bar = viz?.querySelector('span')
  const mascot = document.getElementById('mascot')
  const imgs = [...document.querySelectorAll('.mascot img')].map(i => ({
    cls: i.className, complete: i.complete, nw: i.naturalWidth, nh: i.naturalHeight,
    opacity: getComputedStyle(i).opacity,
  }))
  return JSON.stringify({
    viz: box('#viz'),
    vizBarCount: viz ? viz.children.length : 0,
    vizBar0: bar ? { h: bar.getBoundingClientRect().height, transform: getComputedStyle(bar).transform } : 'none',
    mascot: box('#mascot'),
    mStack: box('.mStack'),
    mStackTransform: document.querySelector('.mStack') ? getComputedStyle(document.querySelector('.mStack')).transform : 'none',
    mascotImgs: imgs,
    videos: [...document.querySelectorAll('.bgVid')].map(v => ({
      id: v.id, opacity: getComputedStyle(v).opacity, paused: v.paused,
      readyState: v.readyState, w: v.videoWidth, h: v.videoHeight,
    })),
    playingClass: document.querySelector('.card')?.classList.contains('playing'),
  }, null, 1)
})()`

console.log((await call('Runtime.evaluate', { expression: probe, returnByValue: true })).result.value)
if (logs.length) { console.log('\n控制台:'); logs.slice(0, 12).forEach(l => console.log('  ' + l)) }

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(join(HERE, '..', '..', 'debug-parts.png'), Buffer.from(shot.data, 'base64'))
console.log('\nscreenshot: debug-parts.png')

ws.close()
child.kill()
