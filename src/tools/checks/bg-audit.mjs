/*
 * 查 .left / .right / .card 到底画了什么背景 · bg audit
 * 用法：node src/tools/bg-audit.mjs
 */

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const url = 'http://127.0.0.1:7790/player-ui.html'
const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9372
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-ba')}`,
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
await new Promise(r => setTimeout(r, 4000))

/** 拿元素上所有可能影响背景/裁剪的样式 + 伪元素。 */
const dump = (sel) => `(() => {
  const e = document.querySelector(${JSON.stringify(sel)})
  if (!e) return '（找不到）'
  const keys = ['backgroundColor','backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat',
    'mixBlendMode','opacity','filter','zIndex','isolation','boxShadow','borderTopWidth','borderRightWidth',
    'borderImageSource','clipPath','maskImage','webkitMaskImage','transform','position','inset']
  const pick = (cs) => Object.fromEntries(keys.map(k => [k, String(cs[k]).slice(0, 90)]).filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)'))
  return JSON.stringify({
    main: pick(getComputedStyle(e)),
    before: pick(getComputedStyle(e, '::before')),
    after: pick(getComputedStyle(e, '::after')),
  }, null, 1)
})()`

for (const sel of ['.card', '.left', '.right', '.left .bgVid', '#bgDay', '.cover', '.stage']) {
  const r = await call('Runtime.evaluate', { expression: dump(sel), returnByValue: true })
  console.log(`\n═══ ${sel} ═══`)
  const v = r.result.value
  if (v === '（找不到）') { console.log('  （页面上没有这个元素）'); continue }
  const o = JSON.parse(v)
  for (const [tag, obj] of [['元素', o.main], ['::before', o.before], ['::after', o.after]]) {
    const ks = Object.keys(obj)
    if (ks.length === 0) continue
    console.log(`  ${tag}:`)
    for (const k of ks) console.log(`    ${k}: ${obj[k]}`)
  }
}

ws.close()
child.kill()
