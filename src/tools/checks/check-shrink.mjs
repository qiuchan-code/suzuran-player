/*
 * 检查歌名/歌词的自动缩字号 · check shrink
 * 用法：node theme-lab/check-shrink.mjs
 */

import { existsSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9350
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-shrink')}`,
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
await new Promise(r => setTimeout(r, 5000))

/** 读各元素字号 + 是否溢出。 */
const measure = `(() => {
  const info = (id) => {
    const el = document.getElementById(id)
    if (!el) return null
    const box = el.parentElement
    return {
      text: (el.textContent || '').slice(0, 24),
      font: getComputedStyle(el).fontSize,
      scrollW: el.scrollWidth,
      boxW: box ? box.clientWidth : 0,
      overflow: box ? el.scrollWidth > box.clientWidth : false,
    }
  }
  return JSON.stringify({
    title: info('trackTitle'),
    artist: info('trackArtist'),
    lyNow: info('lyNow'),
    lyPrev: info('lyPrev'),
    lyNext: info('lyNext'),
  }, null, 1)
})()`

console.log('=== 当前曲目 ===')
console.log((await call('Runtime.evaluate', { expression: measure, returnByValue: true })).result.value)

// 塞一个超长歌名，验证缩字号真的生效
await call('Runtime.evaluate', {
  expression: `document.getElementById('trackTitle').textContent = '这是一个非常非常长的歌名字测试自动缩字号功能到底有没有生效'`,
})
await new Promise(r => setTimeout(r, 500))
await call('Runtime.evaluate', { expression: `fitTexts()` })
await new Promise(r => setTimeout(r, 300))

console.log('\n=== 塞超长歌名后 ===')
console.log((await call('Runtime.evaluate', { expression: measure, returnByValue: true })).result.value)

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(join(HERE, 'shrink-test.png'), Buffer.from(shot.data, 'base64'))
console.log('\nscreenshot: shrink-test.png')

ws.close()
child.kill()
