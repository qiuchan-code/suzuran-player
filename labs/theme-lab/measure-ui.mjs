/*
 * 量播放器界面的实际字号 · measure
 * 用法：node theme-lab/measure-ui.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const url = process.argv[2] ?? 'http://127.0.0.1:7790/player-ui.html'

const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(p => existsSync(p))

const PORT = 9345
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(HERE, '.cdp-measure')}`,
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
await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 3000))

const r = await call('Runtime.evaluate', {
  expression: `(() => {
    const right = document.querySelector('.right')
    const cs = getComputedStyle(right)
    const px = (el) => el ? getComputedStyle(el).fontSize : 'n/a'
    const dim = (el) => el ? Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height) : 'n/a'
    return JSON.stringify({
      rightW: right.clientWidth, rightH: right.clientHeight,
      varW: cs.getPropertyValue('--w').trim(),
      varClock: cs.getPropertyValue('--fs-clock').trim(),
      varTitle: cs.getPropertyValue('--fs-title').trim(),
      varState: cs.getPropertyValue('--fs-state').trim(),
      varDate: cs.getPropertyValue('--fs-date').trim(),
      varArtist: cs.getPropertyValue('--fs-artist').trim(),
      varCover: cs.getPropertyValue('--cover').trim(),
      cover: dim(document.querySelector('.coverBox')),
      titlePx: px(document.querySelector('.trackTitle')),
      artistPx: px(document.querySelector('.trackArtist')),
      statePx: px(document.querySelector('.tState')),
      markPx: px(document.querySelector('.tMark')),
      clockPx: px(document.querySelector('.tTime')),
      datePx: px(document.querySelector('.tDate')),
      lyNowPx: px(document.querySelector('.ly-now')),
      lySidePx: px(document.querySelector('.ly-prev')),
      stageH: dim(document.querySelector('.stage')),
      lyricsH: dim(document.querySelector('.lyrics')),
    }, null, 1)
  })()`,
  returnByValue: true,
})
console.log(r.result.value)

ws.close()
child.kill()
