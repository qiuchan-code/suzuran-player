/*
 * 主题过渡全流程日志 · transition log
 * ---------------------------------
 * 在 change 触发的整段时间里，按 ~60ms 采样一次：
 *   · 快照是否存在、它的遮罩半径
 *   · 快照自己的计算背景色（判断克隆的是新主题还是旧主题）
 *   · 卡片上的 switching 类
 *   · 屏幕中央的像素
 * 目的是搞清楚"扩散为什么看不见"。
 *
 * 用法：node src/tools/transition-log.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { makeShot } from '../lib/cdp-shot.mjs'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9376
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-tl')}`,
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

// 在页面里埋一个采样器：每 50ms 记录一次状态，写到 window.__log
await call('Runtime.evaluate', {
  expression: `(() => {
    window.__log = []
    const t0 = performance.now()
    window.__timer = setInterval(() => {
      const rv = document.getElementById('reveal')
      const sn = rv.querySelector('.snap')
      const card = document.querySelector('.card')
      let snapBg = 'null'
      let maskLen = 0
      let maskR = ''
      if (sn) {
        const cs = getComputedStyle(sn)
        snapBg = cs.backgroundColor
        const mi = sn.style.maskImage || sn.style.webkitMaskImage || ''
        maskLen = mi.length
        const mm = /circle ([\\d.]+)px/.exec(mi)
        maskR = mm ? mm[1] : ''
      }
      window.__log.push({
        t: Math.round(performance.now() - t0),
        snap: !!sn,
        snapBg,
        maskLen,
        maskR,
        switching: card.classList.contains('switching'),
        bodyDark: document.body.hasAttribute('data-ds-dark-theme'),
        rvHidden: rv.hidden,
      })
    }, 50)
    return 'ok'
  })()`,
})
console.log('采样器已装好，触发切换…')

await call('Runtime.evaluate', { expression: `document.getElementById('mascot').click()` })
await new Promise(r => setTimeout(r, 2000))

const r = await call('Runtime.evaluate', { expression: `JSON.stringify(window.__log)`, returnByValue: true })
const log = JSON.parse(r.result.value)
await call('Runtime.evaluate', { expression: `clearInterval(window.__timer)` })

console.log('\n  t(ms)  快照  快照底色              遮罩长度  半径   switching  暗色')
for (const e of log) {
  console.log(`  ${String(e.t).padStart(5)}  ${e.snap ? '有' : '无'}    ${e.snapBg.padEnd(20)}  ${String(e.maskLen).padStart(6)}   ${String(e.maskR).padStart(6)}  ${String(e.switching).padStart(8)}  ${e.bodyDark}`)
}

ws.close()
child.kill()
