/*
 * 量真实壁纸进程的开销 · measure-live.mjs
 * ------------------------------------
 * 为什么不用合成基准：试过在隐藏窗口里加载界面测，但 Chromium
 * 对不可见窗口把 rAF 节流到 1fps —— 数字全是假的（测出"每帧 1001ms"）。
 * **要量真实负载，只能连真实进程。**
 *
 * 用法：
 *   1. 用调试端口起壁纸：cd desktop; electron . --debug-port=9333
 *   2. node --use-system-ca desktop/tools/measure-live.mjs 9333
 *
 * 量这些：
 *   · 界面 rAF 的实际帧间隔和 fps
 *   · 各功能的开关对帧耗时的影响（在真实进程里关，量完恢复）
 *   · 播放 vs 暂停 两种状态的差别
 *   · 页面可见性和焦点
 */

const PORT = Number(process.argv[2] ?? 9333)

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(4000) })).json()
  const page = list.find(t => t.type === 'page' && /player-ui|7790|8080/.test(t.url))
  if (!page) throw new Error('没找到播放器界面页面。现有的：' + list.map(t => t.url).join(', '))
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  let id = 1
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) } }
  })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = id++
    pending.set(n, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))
    ws.send(JSON.stringify({ id: n, method, params }))
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')) } }, 40000)
  })
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? 'eval 失败')
    return r.result.value
  }
  return { page, send, js, close: () => ws.close() }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let c
try {
  c = await connect()
} catch (e) {
  console.log('✗ ' + e.message)
  console.log('\n先用调试端口起壁纸：')
  console.log('  cd desktop')
  console.log('  npx electron . --debug-port=9333')
  process.exit(1)
}

console.log(`连上了：${c.page.url}\n`)

/** 量一段时间内的帧间隔。 */
async function measureFrame(ms = 6000) {
  await c.js(`
    (() => {
      if (window.__mLoop) cancelAnimationFrame(window.__mLoop)
      window.__mS = []
      let last = performance.now()
      const loop = () => { const n = performance.now(); window.__mS.push(n - last); last = n; window.__mLoop = requestAnimationFrame(loop) }
      window.__mLoop = requestAnimationFrame(loop)
    })()
  `)
  await sleep(ms)
  const s = await c.js('window.__mS.slice(8)')
  if (!s || !s.length) return { fps: 0, ms: 0, samples: 0 }
  const avg = s.reduce((a, b) => a + b, 0) / s.length
  return { fps: Math.round(1000 / avg), ms: +avg.toFixed(2), samples: s.length }
}

console.log('════════ 页面状态 ════════\n')
const state = JSON.parse(await c.js(`JSON.stringify({
  hidden: document.hidden,
  visibility: document.visibilityState,
  focused: document.hasFocus(),
  playing: (typeof lastLive !== 'undefined') ? lastLive?.playing : null,
  title: (typeof lastLive !== 'undefined') ? lastLive?.track?.title : null,
  videos: [...document.querySelectorAll('video')].map(v => ({ paused: v.paused, w: v.videoWidth, h: v.videoHeight })),
  vizBars: (typeof vizBars !== 'undefined') ? vizBars.length : null,
})`))
for (const [k, v] of Object.entries(state)) console.log(`  ${k.padEnd(12)} ${JSON.stringify(v)}`)

console.log('\n════════ 基线 ════════\n')
const base = await measureFrame(6000)
console.log(`  当前状态          帧 ${String(base.fps).padStart(4)}  每帧 ${base.ms}ms`)

/* ── 逐个关掉功能 ── */
const CASES = [
  ['停频谱', `(() => { const v=document.getElementById('viz'); if(v) v.style.display='none'; try{vizBars.length=0}catch(e){} })()`],
  ['停 CSS 动画', `(() => { const s=document.createElement('style'); s.id='__bench'; s.textContent='*{animation:none!important;transition:none!important}'; document.head.appendChild(s) })()`],
  ['停视频', `(() => { document.querySelectorAll('video').forEach(v=>{try{v.pause()}catch(e){}}) })()`],
  ['停粒子', `(() => { document.querySelectorAll('[class*=snow],[class*=particle],[class*=blob],[class*=grain],[class*=fx]').forEach(e=>{e.style.display='none'}) })()`],
  ['停模糊/混合', `(() => { const s=document.createElement('style'); s.id='__bench2'; s.textContent='*{filter:none!important;backdrop-filter:none!important;mix-blend-mode:normal!important}'; document.head.appendChild(s) })()`],
]

console.log('\n════════ 逐个关掉（累积，行与行是叠加效果）════════\n')
const results = [['（基线）', base]]
for (const [name, code] of CASES) {
  try { await c.js(code) } catch (e) { console.log(`  ⚠ ${name} 失败: ${e.message}`) }
  await sleep(500)
  const r = await measureFrame(5000)
  results.push([name, r])
  const d = r.ms - base.ms
  console.log(`  关掉 ${name.padEnd(12)} 帧 ${String(r.fps).padStart(4)}  每帧 ${String(r.ms).padStart(6)}ms   ${d >= 0 ? '+' : ''}${d.toFixed(2)}ms`)
}

/* 恢复 */
await c.js(`
  (() => {
    document.getElementById('__bench')?.remove()
    document.getElementById('__bench2')?.remove()
    location.reload()
  })()
`).catch(() => { })

console.log('\n════════ 判读 ════════\n')
const worst = results.slice(1).map(([n, r]) => ({ n, saved: r.ms - (results[results.indexOf(results.find(x => x[0] === n)) - 1][1].ms) }))
  .sort((a, b) => b.saved - a.saved)
for (const w of worst) {
  if (Math.abs(w.saved) < 0.05) continue
  console.log(`  ${w.n.padEnd(14)} 省 ${w.saved.toFixed(2)}ms/帧`)
}
console.log('\n  注意这是"累积关闭"的相邻差值，看的是边际成本。')

c.close()
process.exit(0)
