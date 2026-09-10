/*
 * 验证：椭圆遮罩 + 全背景动效 + 主题扩散
 * 用法：node src/tools/verify-hero.mjs
 */

import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9363
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-hero')}`,
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
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 5000))

const probe = `(() => {
  const cs = getComputedStyle(document.documentElement)
  const card = document.querySelector('.card')
  const left = document.querySelector('.left')
  const day = document.getElementById('bgDay')
  const fx = document.getElementById('fx')
  return JSON.stringify({
    heroX: cs.getPropertyValue('--hero-x').trim(),
    heroY: cs.getPropertyValue('--hero-y').trim(),
    heroRx: cs.getPropertyValue('--hero-rx').trim(),
    heroRy: cs.getPropertyValue('--hero-ry').trim(),
    fxMode: fx.dataset.fx,
    fxBox: (()=>{const b=fx.getBoundingClientRect();return Math.round(b.width)+'x'+Math.round(b.height)})(),
    cardBox: (()=>{const b=card.getBoundingClientRect();return Math.round(b.width)+'x'+Math.round(b.height)})(),
    snowCount: document.getElementById('fxSnow').children.length,
    meshDisplay: getComputedStyle(document.querySelector('.fxMesh')).display,
    dayMask: getComputedStyle(day).maskImage ? getComputedStyle(day).maskImage.slice(0, 60) : 'n/a',
    decorSegExists: !!document.getElementById('decorSeg'),
  }, null, 1)
})()`
console.log('=== 初始 ===')
console.log((await call('Runtime.evaluate', { expression: probe, returnByValue: true })).result.value)

// 触发主题切换，中途截一帧看扩散
console.log('\n=== 点小铃兰（扩散中）===')
await call('Runtime.evaluate', { expression: `document.getElementById('mascot').click()` })
await new Promise(r => setTimeout(r, 220))
const mid = await call('Runtime.evaluate', {
  expression: `JSON.stringify({revealHidden: document.getElementById('reveal').hidden, snapCount: document.getElementById('reveal').children.length, bodyDark: document.body.hasAttribute('data-ds-dark-theme')})`,
  returnByValue: true,
})
console.log('  扩散中:', mid.result.value)
const shotMid = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(join('D:', 'suzuran-player', 'docs', 'shots', 'reveal-mid.png'), Buffer.from(shotMid.data, 'base64'))

await new Promise(r => setTimeout(r, 1000))
console.log('\n=== 扩散结束 ===')
const after = await call('Runtime.evaluate', {
  expression: `JSON.stringify({revealHidden: document.getElementById('reveal').hidden, snapCount: document.getElementById('reveal').children.length, bodyDark: document.body.hasAttribute('data-ds-dark-theme'), dayOpacity: getComputedStyle(document.getElementById('bgDay')).opacity, nightOpacity: getComputedStyle(document.getElementById('bgNight')).opacity, state: document.getElementById('tState').textContent, activeTier: document.querySelector('#stateSlider [aria-pressed="true"]')?.querySelector('.ssEn')?.textContent, fonts: {title: getComputedStyle(document.getElementById('trackTitle')).fontFamily.slice(0,30), clock: getComputedStyle(document.getElementById('tTime')).fontFamily.slice(0,20), lyric: getComputedStyle(document.getElementById('lyNow')).fontFamily.slice(0,20)}})`,
  returnByValue: true,
})
console.log('  ', after.result.value)
const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(join('D:', 'suzuran-player', 'docs', 'shots', 'hero-dark.png'), Buffer.from(shot.data, 'base64'))

if (logs.length) { console.log('\nconsole:'); logs.slice(0, 6).forEach(l => console.log('  ' + l)) }
console.log('\nscreenshots: docs/shots/reveal-mid.png, docs/shots/hero-dark.png')
ws.close()
child.kill()
