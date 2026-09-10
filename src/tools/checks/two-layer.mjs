/*
 * 精确对比快照层与 Live 层 · two-layer compare
 * ------------------------------------------
 * 关键：如何可靠地拿到 Live 层的元素？
 *   快照挂在 #reveal 里，#reveal 位于 .card 内、在 .right 之前，
 *   所以 document.querySelector('.right .trackTitle') 可能命中快照里的副本。
 *   用 elementsFromPoint 在"已知是 Live 元素"的坐标上取，最可靠。
 *
 * 用法：node src/tools/two-layer.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html?slow=4'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9387
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-2l')}`,
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

/*
 * 采样逻辑写在页面里：每 120ms 记录
 *   · 快照根节点的遮罩半径（从 style.maskImage 里抽）
 *   · 快照里的歌名颜色（snap.querySelector）
 *   · Live 层的歌名颜色 —— 用快照元素的 nextSibling 链定位：
 *     live 元素 = 不在 #reveal 内的那个 .trackTitle
 */
await call('Runtime.evaluate', {
  expression: `(() => {
    window.__2l = []
    const t0 = performance.now()
    window.__t2l = setInterval(() => {
      const rv = document.getElementById('reveal')
      const snap = rv.querySelector('.snap')
      const all = [...document.querySelectorAll('.trackTitle')]
      const liveEl = all.find(e => !e.closest('#reveal'))
      const snapEl = all.find(e => e.closest('#reveal'))
      let r = ''
      if (snap) {
        const mi = snap.style.maskImage || snap.style.webkitMaskImage || ''
        const m = /circle ([\\d.]+)px/.exec(mi)
        r = m ? m[1] : ''
      }
      window.__2l.push({
        t: Math.round(performance.now() - t0),
        snap: !!snap,
        r,
        snapColor: snapEl ? getComputedStyle(snapEl).color : '-',
        liveColor: liveEl ? getComputedStyle(liveEl).color : '-',
        snapBg: snap ? getComputedStyle(snap).backgroundColor : '-',
        liveBgVar: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
      })
    }, 120)
    return 'ok'
  })()`,
})
console.log('采样器已装，触发切换（slow=4，总时长约 4.4 秒）…')

await call('Runtime.evaluate', { expression: `document.getElementById('mascot').click()` })
await new Promise(r => setTimeout(r, 5200))

const r = await call('Runtime.evaluate', { expression: `JSON.stringify(window.__2l)`, returnByValue: true })
const log = JSON.parse(r.result.value)
await call('Runtime.evaluate', { expression: `clearInterval(window.__t2l)` })

console.log('\n  t(ms)  快照  遮罩半径   快照歌名色             Live歌名色             快照底色')
for (const e of log) {
  console.log(`  ${String(e.t).padStart(5)}  ${e.snap ? '有' : '无'}   ${String(e.r).padStart(7)}   ${e.snapColor.padEnd(20)}  ${e.liveColor.padEnd(20)}  ${e.snapBg}`)
}

const withSnap = log.filter(e => e.snap)
if (withSnap.length > 0) {
  const same = withSnap.filter(e => e.snapColor === e.liveColor).length
  console.log(`\n快照存在期间 ${withSnap.length} 个样本，其中 ${same} 个两层颜色相同`)
  console.log(same === 0 ? '✓ 两层颜色始终不同 → 快照确实冻在旧主题' : '✗ 有样本两层相同（可能是快照未冻结，或取到了同一个元素）')
}

ws.close()
child.kill()
