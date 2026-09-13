/*
 * 精确数 vizFrame 的调用频率 · count-vizcalls.mjs
 * -------------------------------------------
 * 上一个工具用 MutationObserver 数 style 写入，暂停时反而数出 4447 次/秒 ——
 * 不合理，说明那个观察器在数别的东西（合成器的 sub-pixel 抖动之类）。
 *
 * 换成直接给 vizFrame 打点：用 CDP 的 Debugger 域在函数入口下断点太重，
 * 改用轻量办法 —— 从控制器里把 vizBars 的 transform 值读出来对比，
 * 值变了才算真的重画了一帧。
 *
 * 用法：node --use-system-ca desktop/tools/count-vizcalls.mjs [端口]
 */

const PORT = Number(process.argv[2] ?? 9333)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(4000) })).json()
const page = list.find(t => t.type === 'page' && /player-ui/.test(t.url))
if (!page) throw new Error('没找到界面页面')

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
let id = 1
const pend = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pend.get(m.id); if (w) { pend.delete(m.id); w(m) } }
})
const js = (expr) => new Promise((res, rej) => {
  const n = id++
  pend.set(n, m => m.error ? rej(new Error(m.error.message)) : res(m.result.result.value))
  ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }))
  setTimeout(() => { if (pend.has(n)) { pend.delete(n); rej(new Error('超时')) } }, 25000)
})

/**
 * 在界面里装一个采样器：每帧读所有柱子的 transform 拼成一个字符串，
 * 和上一帧不同就记一次"真的变了"。这比 MutationObserver 可靠。
 */
await js(`
  (() => {
    if (window.__cvTimer) clearInterval(window.__cvTimer)
    window.__cvChanges = 0
    window.__cvTicks = 0
    window.__cvLast = ''
    window.__cvTimer = setInterval(() => {
      window.__cvTicks++
      const bars = document.querySelectorAll('#viz span')
      let sig = ''
      for (const b of bars) sig += b.style.transform
      if (sig !== window.__cvLast) { window.__cvChanges++; window.__cvLast = sig }
    }, 16)   // 每 16ms 采一次，够捕捉 60fps
    return 'installed'
  })()
`)

async function sample(label, secs = 5) {
  await js(`(() => { window.__cvChanges = 0; window.__cvTicks = 0; return 'reset' })()`)
  await sleep(secs * 1000)
  const r = JSON.parse(await js(`JSON.stringify({ changes: window.__cvChanges, ticks: window.__cvTicks, bars: document.querySelectorAll('#viz span').length })`))
  console.log(`  ${label.padEnd(12)} 采样 ${r.ticks} 次 / ${secs}s   柱子变了 ${r.changes} 次  →  ${(r.changes / secs).toFixed(0)} 帧/秒   （${r.bars} 根柱子）`)
  return r.changes / secs
}

console.log('════════ 频谱真实重画频率 ════════\n')

await js(`window.__forcePlaying(true)`)
await sleep(1500)
const playing = await sample('播放中', 5)

await js(`window.__forcePlaying(false)`)
await sleep(1800)
const paused = await sample('暂停', 5)

await js(`window.postMessage({ type: 'power', state: 'suspended' }, '*')`)
await sleep(1800)
const sleeping = await sample('息屏', 4)

await js(`window.postMessage({ type: 'power', state: 'active' }, '*'); window.__forcePlaying(null)`)
await sleep(1500)
const back = await sample('恢复后', 4)

console.log('\n════════ 判读 ════════\n')
console.log(`  播放中  ${playing.toFixed(0)} 帧/秒   （期望 ≈60，受 FPS_CAP 约束）`)
console.log(`  暂停    ${paused.toFixed(0)} 帧/秒   （期望 0）`)
console.log(`  息屏    ${sleeping.toFixed(0)} 帧/秒   （期望 0）`)
console.log(`  恢复    ${back.toFixed(0)} 帧/秒   （期望回到 ≈60）`)
console.log('')
const ok = [
  [playing > 40 && playing < 70, '播放中受 60fps 上限约束'],
  [paused < 2, '暂停时完全停止重画'],
  [sleeping < 2, '息屏时完全停止重画'],
  [back > 40, '恢复后回到正常帧率'],
]
for (const [pass, label] of ok) console.log(`  ${pass ? '✓' : '✗'} ${label}`)

await js(`(() => { clearInterval(window.__cvTimer); return 'ok' })()`)
ws.close()
process.exit(ok.every(([p]) => p) ? 0 : 1)
