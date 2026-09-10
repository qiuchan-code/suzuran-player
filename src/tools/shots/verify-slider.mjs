/*
 * 验证状态滑块 + 层次 + 主题过渡
 * 用法：node src/tools/verify-slider.mjs
 */

import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9365
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-sl')}`,
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
await new Promise(r => setTimeout(r, 4500))

const probe = `(() => {
  const g = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).zIndex : 'x' }
  const box = (sel) => { const e = document.querySelector(sel); if(!e) return 'x'; const b=e.getBoundingClientRect(); return Math.round(b.width)+'x'+Math.round(b.height)+' @'+Math.round(b.x)+','+Math.round(b.y)+' bottom='+Math.round(b.bottom) }
  const names = [...document.querySelectorAll('#ssNames span')].map(s => s.textContent + (s.classList.contains('on') ? '*' : ''))
  const track = document.getElementById('ssTrack')
  return JSON.stringify({
    layers: { grain: g('.grain'), fx: g('#fx'), left: g('.left'), right: g('.right'), reveal: g('#reveal'), slider: g('#stateSlider') },
    slider: box('#stateSlider'),
    track: box('#ssTrack'),
    trackHitH: track ? Math.round(track.getBoundingClientRect().height + 30) : 0,
    mascot: box('#mascot'),
    hasEndLabels: !!document.getElementById('ssEndL') || !!document.getElementById('ssEndR'),
    hasCf: !!document.getElementById('ssCf'),
    hasPanel: !!document.querySelector('.stateSlider .ssPanel'),
    thumb: document.getElementById('ssThumb').style.left,
    names,
    state: document.getElementById('tState').textContent,
    thumbColor: getComputedStyle(document.getElementById('stateSlider')).getPropertyValue('--ss-color').trim(),
    heroVideos: document.querySelectorAll('.left .bgVid').length,
  }, null, 1)
})()`
console.log('=== 初始 ===')
console.log((await call('Runtime.evaluate', { expression: probe, returnByValue: true })).result.value)

// 拖到最左（luna）
console.log('\n=== 拖到最左 ===')
const tr = await call('Runtime.evaluate', {
  expression: `(()=>{const b=document.getElementById('ssTrack').getBoundingClientRect();return JSON.stringify({left:b.left,right:b.right,mid:b.top+b.height/2})})()`,
  returnByValue: true,
})
const t = JSON.parse(tr.result.value)
await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.left + 2, y: t.mid, button: 'left', clickCount: 1 })
await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: t.left + 2, y: t.mid, button: 'left' })
await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.left + 2, y: t.mid, button: 'left', clickCount: 1 })
await new Promise(r => setTimeout(r, 700))
console.log((await call('Runtime.evaluate', { expression: probe, returnByValue: true })).result.value)

// 拖到中间偏右
console.log('\n=== 拖到 2/3 处 ===')
await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.left + (t.right - t.left) * 0.66, y: t.mid, button: 'left', clickCount: 1 })
await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.left + (t.right - t.left) * 0.66, y: t.mid, button: 'left', clickCount: 1 })
await new Promise(r => setTimeout(r, 700))
console.log((await call('Runtime.evaluate', { expression: probe, returnByValue: true })).result.value)

// 切主题，看 switching 类是否生效
console.log('\n=== 点铃兰切主题（过渡中）===')
await call('Runtime.evaluate', { expression: `document.getElementById('mascot').click()` })
await new Promise(r => setTimeout(r, 250))
const mid = await call('Runtime.evaluate', {
  expression: `JSON.stringify({switching: document.querySelector('.card').classList.contains('switching'), fxVisibility: getComputedStyle(document.getElementById('fx')).visibility, snapCount: document.getElementById('reveal').children.length, bodyDark: document.body.hasAttribute('data-ds-dark-theme')})`,
  returnByValue: true,
})
console.log('  ', mid.result.value)
const shotMid = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(join('D:', 'suzuran-player', 'docs', 'shots', 'reveal-mid.png'), Buffer.from(shotMid.data, 'base64'))

await new Promise(r => setTimeout(r, 900))
const done = await call('Runtime.evaluate', {
  expression: `JSON.stringify({switching: document.querySelector('.card').classList.contains('switching'), fxVisibility: getComputedStyle(document.getElementById('fx')).visibility, snapCount: document.getElementById('reveal').children.length})`,
  returnByValue: true,
})
console.log('  过渡结束:', done.result.value)

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(join('D:', 'suzuran-player', 'docs', 'shots', 'slider-dark.png'), Buffer.from(shot.data, 'base64'))
if (logs.length) { console.log('\nconsole:'); logs.slice(0, 6).forEach(l => console.log('  ' + l)) }
ws.close()
child.kill()
