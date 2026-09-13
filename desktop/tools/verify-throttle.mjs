/*
 * 验证省电效果 · verify-throttle.mjs
 * --------------------------------
 * 走过的两条弯路（记下来，别再犯）：
 *
 *   ① 拿"界面 rAF 的帧率"当指标 —— 完全反直觉：冻住动画后帧率
 *      反而从 101 涨到 230。因为那个数字测的是**合成器循环速度**，
 *      不是负载。活儿少了它转得更快。**页面帧率不能用来衡量功耗。**
 *
 *   ② 拿 Windows 的 GPU Engine 计数器 —— 恒报 ~50%，怎么改状态都不动。
 *      那个值不可信（大概率在报某个共享引擎）。
 *
 * 最终用**进程 CPU 时间增量**：稳定、可信、而且直接和发热挂钩。
 *
 * 用法：node --use-system-ca desktop/tools/verify-throttle.mjs [端口]
 */

import { execFileSync } from 'node:child_process'

const PORT = Number(process.argv[2] ?? 9333)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** electron 全部进程的累计 CPU 秒数（总核数计）。 */
function electronCpuSeconds() {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      `$p = Get-Process electron -ErrorAction SilentlyContinue | Measure-Object -Property CPU -Sum; ` +
      `if ($p.Sum) { [math]::Round($p.Sum, 2) } else { -1 }`
    ], { encoding: 'utf8', timeout: 12000 }).trim()
    const v = parseFloat(out)
    return Number.isFinite(v) ? v : -1
  } catch { return -1 }
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(4000) })).json()
const page = list.find(t => t.type === 'page' && /player-ui/.test(t.url))
if (!page) throw new Error('没找到界面页面（先用 --debug-port 起壁纸）')

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
  setTimeout(() => { if (pend.has(n)) { pend.delete(n); rej(new Error('超时')) } }, 30000)
})

const snap = async () => JSON.parse(await js(`JSON.stringify({
  frozen: document.documentElement.classList.contains('sz-frozen'),
  playing: window.__throttle?.playing,
  sleeping: window.__throttle?.sleeping,
  runningAnims: document.getAnimations().filter(a => a.playState === 'running').length,
  totalAnims: document.getAnimations().length,
  decodingVids: [...document.querySelectorAll('.hero .bgVid')].filter(v => !v.paused).length,
})`))

/** 测一段时间的 CPU 增量 → 换算成"平均占用几个核"。 */
async function phase(label, ms = 8000) {
  const c0 = electronCpuSeconds()
  const t0 = Date.now()
  await sleep(ms)
  const c1 = electronCpuSeconds()
  const secs = (Date.now() - t0) / 1000
  const delta = c1 - c0
  const cores = delta / secs                    // 平均占用核数
  const pct = cores * 100                       // 相对单核的百分比
  return { label, delta, secs, cores, pct, c0, c1, valid: c0 >= 0 && c1 >= 0 }
}

console.log('════════ 实测 ════════')
console.log('（指标：electron 全部进程的 CPU 时间增量 → 平均占用几个核）\n')

/* ① 播放中 */
await js(`window.__forcePlaying(null)`)
await sleep(1500)
let s = await snap()
console.log(`① 播放中   frozen=${String(s.frozen).padEnd(5)} 动画 ${s.runningAnims}/${s.totalAnims}  解码视频 ${s.decodingVids}`)
const A = await phase('', 8000)
console.log(`   → CPU 增量 ${A.delta.toFixed(2)}s / ${A.secs.toFixed(1)}s = 平均 ${A.cores.toFixed(3)} 核\n`)

/* ② 暂停 */
console.log(`② 暂停     注入 __forcePlaying(false)`)
console.log(`   ` + JSON.stringify(await js('window.__forcePlaying(false)')))
await sleep(2000)
s = await snap()
console.log(`   frozen=${String(s.frozen).padEnd(5)} 动画 ${s.runningAnims}/${s.totalAnims}  解码视频 ${s.decodingVids}`)
const B = await phase('', 8000)
console.log(`   → CPU 增量 ${B.delta.toFixed(2)}s / ${B.secs.toFixed(1)}s = 平均 ${B.cores.toFixed(3)} 核\n`)

/* ③ 息屏 */
console.log(`③ 息屏     注入 power=suspended`)
await js(`window.postMessage({ type: 'power', state: 'suspended' }, '*')`)
await sleep(2000)
s = await snap()
console.log(`   frozen=${String(s.frozen).padEnd(5)} sleeping=${s.sleeping} 动画 ${s.runningAnims}/${s.totalAnims}  解码视频 ${s.decodingVids}`)
const C = await phase('', 8000)
console.log(`   → CPU 增量 ${C.delta.toFixed(2)}s / ${C.secs.toFixed(1)}s = 平均 ${C.cores.toFixed(3)} 核\n`)

/* ④ 恢复 */
console.log(`④ 恢复`)
await js(`window.postMessage({ type: 'power', state: 'active' }, '*'); window.__forcePlaying(null)`)
await sleep(2500)
s = await snap()
console.log(`   frozen=${String(s.frozen).padEnd(5)} 动画 ${s.runningAnims}/${s.totalAnims}  解码视频 ${s.decodingVids}`)
const D = await phase('', 6000)
console.log(`   → CPU 增量 ${D.delta.toFixed(2)}s / ${D.secs.toFixed(1)}s = 平均 ${D.cores.toFixed(3)} 核\n`)

console.log('════════ 结果 ════════\n')
console.log('  状态       平均占用核数   CPU 相对播放中')
console.log('  ' + '─'.repeat(46))
for (const [name, r] of [['播放中', A], ['暂停', B], ['息屏', C], ['恢复后', D]]) {
  const rel = A.cores > 0 ? Math.round((1 - r.cores / A.cores) * 100) : 0
  console.log(`  ${name.padEnd(10)} ${r.cores.toFixed(3).padStart(8)} 核   ${r === A ? '(基线)' : (rel > 0 ? '↓' : '↑') + Math.abs(rel) + '%'}`)
}

const ok1 = B.cores < A.cores * 0.7
const ok2 = C.cores < A.cores * 0.5
const ok3 = D.cores > C.cores * 1.5
console.log('')
console.log(`  ${ok1 ? '✓' : '✗'} 暂停时 CPU 明显下降`)
console.log(`  ${ok2 ? '✓' : '✗'} 息屏时降到基线一半以下`)
console.log(`  ${ok3 ? '✓' : '✗'} 恢复后回到活跃状态`)

ws.close()
process.exit(ok1 && ok2 && ok3 ? 0 : 1)
