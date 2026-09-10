/*
 * 检查快照克隆体里到底有什么 · snap audit
 * 用法：node src/tools/snap-audit.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9379
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-sa')}`,
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

// 手动造一个克隆，逐步检查 —— 复现 revealTheme 的做法
const r = await call('Runtime.evaluate', {
  expression: `(() => {
    const card = document.querySelector('.card')
    const out = {}
    out.cardChildren = card.children.length
    out.cardRect = (() => { const b = card.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height) })()

    const snap = card.cloneNode(true)
    out.snapChildren = snap.children.length
    out.snapRect = (() => { const b = snap.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height) })()

    snap.removeAttribute('id')
    snap.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))
    snap.setAttribute('aria-hidden', 'true')
    snap.classList.add('snap')

    // 关键：有没有 .snap 的 CSS 规则把它们藏起来？
    const snapCss = [...document.styleSheets].flatMap(ss => {
      try { return [...ss.cssRules] } catch { return [] }
    }).filter(r => r.selectorText && r.selectorText.includes('.snap'))
      .map(r => r.selectorText + ' { ' + r.style.cssText + ' }')
    out.snapCssRules = snapCss

    // 挂上去，看尺寸
    const reveal = document.getElementById('reveal')
    reveal.hidden = false
    reveal.appendChild(snap)
    out.afterAppendRect = (() => { const b = snap.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height) + ' @' + Math.round(b.x) + ',' + Math.round(b.y) })()

    // 克隆里第一个子元素（.grain）和 .right 的可见性
    const kids = [...snap.children].map(e => {
      const cs = getComputedStyle(e)
      const b = e.getBoundingClientRect()
      return (e.className || e.tagName) + ': ' + Math.round(b.width) + 'x' + Math.round(b.height) +
        ' display=' + cs.display + ' vis=' + cs.visibility + ' op=' + cs.opacity
    })
    out.snapKids = kids

    // reveal 自己的样式
    const rcs = getComputedStyle(reveal)
    out.revealStyle = { display: rcs.display, vis: rcs.visibility, op: rcs.opacity, z: rcs.zIndex, pos: rcs.position }

    // 量一下克隆体某个可见文字的颜色，判断它是新主题还是旧主题
    const t = snap.querySelector('.trackTitle')
    out.snapTitleColor = t ? getComputedStyle(t).color : 'n/a'
    const lt = document.querySelector('.trackTitle')
    out.liveTitleColor = lt ? getComputedStyle(lt).color : 'n/a'

    reveal.hidden = true
    reveal.innerHTML = ''
    return JSON.stringify(out, null, 1)
  })()`,
  returnByValue: true,
})
console.log(r.result.value)

ws.close()
child.kill()
