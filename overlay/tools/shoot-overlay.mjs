/*
 * 歌词浮层截图 · CDP
 * ------------------
 * 用 DevTools 协议打开浮层页面并截图，顺便把页面读到的状态打出来。
 * 为什么不用 chrome --headless --screenshot：直连本地 HTTP 会挂住（老坑）。
 *
 * 用法：node tools/shoot-overlay.mjs [url] [out.png] [--dark] [--decor=soft] [--w=520] [--h=760]
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const url = args[0] ?? 'http://127.0.0.1:7788/'
const out = args[1] ?? join(HERE, '..', 'shots', 'overlay.png')
const flag = (name, dflt) => {
  const hit = args.find(a => a.startsWith(`--${name}=`))
  return hit === undefined ? dflt : hit.split('=')[1]
}
const dark = args.includes('--dark')
const decor = flag('decor', 'soft')
const W = Number(flag('w', 520))
const H = Number(flag('h', 760))

mkdirSync(dirname(out), { recursive: true })

const browser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => existsSync(p))
if (browser === undefined) { console.error('找不到 Chrome/Edge'); process.exit(2) }

const PORT = 9336
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${join(HERE, '..', 'shots', '.profile')}`,
  `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' })

async function waitEndpoint() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return await r.json() } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 150))
  }
  throw new Error('CDP 端口没起来')
}
const version = await waitEndpoint()

const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })

let id = 1
const pending = new Map()
const logs = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) }; return }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ${(m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ')}`)
  if (m.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? ''}`)
})
function send(method, params = {}, sessionId) {
  const n = id++
  return new Promise((res, rej) => {
    pending.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)))
    const p = { id: n, method, params }
    if (sessionId) p.sessionId = sessionId
    ws.send(JSON.stringify(p))
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(`${method} 超时`)) } }, 60_000)
  })
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const call = (m, p) => send(m, p, sessionId)
await call('Runtime.enable')
await call('Page.enable')
await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false })

await call('Page.navigate', { url })
await new Promise(r => setTimeout(r, 4000))

// 切主题/装饰档
await call('Runtime.evaluate', {
  expression: `
    if (${dark}) document.getElementById('schemeBtn').click();
    document.querySelector('[data-decor="${decor}"]')?.click();
    'ok'
  `,
})
await new Promise(r => setTimeout(r, 900))

const probe = await call('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: document.getElementById('title').textContent,
    artist: document.getElementById('artist').textContent,
    now: document.getElementById('lineNow').textContent.slice(0, 40),
    next: document.getElementById('lineNext').textContent.slice(0, 40),
    status: document.getElementById('statusText').textContent,
    pos: document.getElementById('pos').textContent,
    dur: document.getElementById('dur').textContent,
    bar: document.getElementById('barFill').style.width,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    font: getComputedStyle(document.body).fontFamily.slice(0, 40),
  })`,
  returnByValue: true,
})

const shot = await call('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.data, 'base64'))

console.log(`url: ${url}`)
console.log(`screenshot: ${out}  (${W}x${H}@2x, ${dark ? 'dark' : 'light'}, ${decor})`)
console.log(`page: ${probe.result.value}`)
if (logs.length > 0) { console.log('console:'); for (const l of logs.slice(0, 12)) console.log('  ' + l) }

ws.close()
child.kill()
