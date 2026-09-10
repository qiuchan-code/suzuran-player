/*
 * 验证快照是否"冻住旧主题" · verify snap freeze
 * 用法：node src/tools/verify-snap-freeze.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9380
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-sf')}`,
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

// 采样器：切换过程中每 40ms 记录快照与实页的颜色。
// 注意两个坑：
//   1. 采样要从切换之前就开始，否则错过快照刚建立的那一小段
//   2. 选择实页元素必须用 .right 作用域 —— 快照挂在 #reveal 里，
//      #reveal 在 DOM 顺序上比 .right 靠前，querySelector('.trackTitle')
//      会先命中快照里的那个，量出来"两边一样"是假象（踩过）
await call('Runtime.evaluate', {
  expression: `(() => {
    window.__cmp = []
    const t0 = performance.now()
    window.__timer2 = setInterval(() => {
      const snap = document.querySelector('#reveal .snap')
      const live = document.querySelector('.right .trackTitle')
      const snapT = snap ? snap.querySelector('.trackTitle') : null
      const liveBg = getComputedStyle(document.querySelector('.right')).backgroundColor
      window.__cmp.push({
        t: Math.round(performance.now() - t0),
        hasSnap: !!snap,
        snapColor: snapT ? getComputedStyle(snapT).color : '-',
        liveColor: live ? getComputedStyle(live).color : '-',
        snapBgInline: snap ? (snap.style.background || '-') : '-',
        liveBgVar: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
        bodyDark: document.body.hasAttribute('data-ds-dark-theme'),
      })
    }, 40)
  })()`,
})

await call('Runtime.evaluate', { expression: `document.getElementById('mascot').click()` })
await new Promise(r => setTimeout(r, 1800))
const r = await call('Runtime.evaluate', { expression: `JSON.stringify(window.__cmp)`, returnByValue: true })
const log = JSON.parse(r.result.value)
await call('Runtime.evaluate', { expression: `clearInterval(window.__timer2)` })

console.log('  t(ms)  快照  快照歌名色            实页歌名色            实页bgVar  状态')
let frozenRows = 0
let badRows = 0
for (const e of log) {
  if (!e.hasSnap) {
    console.log(`  ${String(e.t).padStart(5)}  无    ${'-'.padEnd(20)}  ${e.liveColor.padEnd(20)}  ${e.liveBgVar.padEnd(9)} （快照已撤）`)
    continue
  }
  const differs = e.snapColor !== e.liveColor
  if (differs) frozenRows++; else badRows++
  console.log(`  ${String(e.t).padStart(5)}  有    ${e.snapColor.padEnd(20)}  ${e.liveColor.padEnd(20)}  ${e.liveBgVar.padEnd(9)} ${differs ? '✓ 冻住旧主题' : '✗ 颜色相同'}`)
}
console.log(`\n快照存在期间：${frozenRows} 帧颜色不同（冻住）、${badRows} 帧颜色相同`)
console.log(frozenRows > badRows ? '✓ 快照保持旧主题 → 扩散应该可见' : '✗ 快照仍跟着实页变化')

ws.close()
child.kill()
