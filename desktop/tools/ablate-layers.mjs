/*
 * 逐个关掉视觉层，看各自占多少 · ablate-layers.mjs
 * ---------------------------------------------
 * 进程级拆解显示：一半 CPU 在 gpu-process 里（1.45 核），
 * 说明"合成阶段"很贵。嫌疑是这几类：
 *   · 4 个 blur(46px) 的光斑层（滤波器每帧都要跑）
 *   · grain 的 mix-blend-mode: multiply（全卡面积，强制混合）
 *   · vignette
 *   · 91 个频谱柱（各自独立合成层）
 *
 * 逐个关掉、每次都量 renderer 和 gpu-process 的核数，看谁最贵。
 *
 * 用法：node --use-system-ca desktop/tools/ablate-layers.mjs [端口]
 */

import { execFileSync } from 'node:child_process'

const PORT = Number(process.argv[2] ?? 9333)
const SAMPLE_S = 6
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** 取 renderer / gpu-process 的累计 CPU 秒。 */
function cpuSnapshot() {
  const ps = `
$r = 0; $g = 0
Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
  if (-not $p) { return }
  $cl = $_.CommandLine
  if ($cl -match '--type=gpu-process') { $g += $p.CPU }
  elseif ($cl -match '--type=renderer') { $r += $p.CPU }
}
"$([math]::Round($r,3))|$([math]::Round($g,3))"
`
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 20000 }).trim()
    const [r, g] = out.split('|').map(Number)
    return { r: r || 0, g: g || 0 }
  } catch { return null }
}

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
  setTimeout(() => { if (pend.has(n)) { pend.delete(n); rej(new Error('超时')) } }, 30000)
})

/** 强制"正在播放"，保证每次测的都是活跃态。 */
await js(`window.__forcePlaying(true)`)

/** 测一次。 */
async function measure(label) {
  const a = cpuSnapshot()
  const t0 = Date.now()
  await sleep(SAMPLE_S * 1000)
  const b = cpuSnapshot()
  const secs = (Date.now() - t0) / 1000
  if (!a || !b) return { label, r: -1, g: -1, t: -1 }
  const r = (b.r - a.r) / secs
  const g = (b.g - a.g) / secs
  return { label, r, g, t: r + g }
}

/** 注入样式（带 id，方便逐个撤）。 */
const hide = (cssId, css) => js(`
  (() => {
    let s = document.getElementById(${JSON.stringify(cssId)})
    if (!s) { s = document.createElement('style'); s.id = ${JSON.stringify(cssId)}; document.head.appendChild(s) }
    s.textContent = ${JSON.stringify(css)}
    return 'ok'
  })()
`)
const unhide = (cssId) => js(`(() => { document.getElementById(${JSON.stringify(cssId)})?.remove(); return 'ok' })()`)

/* 先重置到已知状态 */
for (const k of ['a1', 'a2', 'a3', 'a4', 'a5']) await unhide(k)
await sleep(1500)

console.log(`每次采样 ${SAMPLE_S} 秒，测的是 renderer + gpu-process 的平均核数\n`)
console.log('  场景                    renderer   gpu     合计    相对基线')
console.log('  ' + '─'.repeat(66))

const base = await measure('基线（全开）')
const print = (x, b) => {
  const rel = b.t > 0 ? Math.round((1 - x.t / b.t) * 100) : 0
  console.log(`  ${x.label.padEnd(22)} ${x.r.toFixed(3).padStart(8)} ${x.g.toFixed(3).padStart(7)} ${x.t.toFixed(3).padStart(8)}   ${x === b ? '' : (rel > 0 ? '省 ' + rel + '%' : '多 ' + (-rel) + '%')}`)
}
print(base, base)

const CASES = [
  ['关掉 blur 光斑', 'a1', '.fxMesh{display:none!important}'],
  ['关掉 grain 混合', 'a2', '.grain{display:none!important}'],
  ['关掉 vignette', 'a3', '.vignette{display:none!important}'],
  ['关掉频谱', 'a4', '#viz{display:none!important}'],
  ['关掉壁纸视频', 'a5', '.hero .bgVid{display:none!important}'],
]

const results = []
for (const [label, cid, css] of CASES) {
  await hide(cid, css)
  await sleep(1200)
  const x = await measure(label)
  results.push(x)
  print(x, base)
}

/* 全部关掉看下限 */
await hide('a1', '.fxMesh{display:none!important}')
await hide('a2', '.grain{display:none!important}')
await hide('a3', '.vignette{display:none!important}')
await hide('a4', '#viz{display:none!important}')
await hide('a5', '.hero .bgVid{display:none!important}')
await sleep(1500)
const allOff = await measure('全部关掉')
print(allOff, base)

/* 恢复 */
for (const k of ['a1', 'a2', 'a3', 'a4', 'a5']) await unhide(k)
await js(`window.__forcePlaying(null)`)

console.log('\n════════ 排序（省得最多的排前面）════════\n')
for (const r of results.map(x => ({ ...x, saved: base.t - x.t })).sort((a, b) => b.saved - a.saved)) {
  const pct = base.t > 0 ? Math.round(r.saved / base.t * 100) : 0
  console.log(`  ${r.label.padEnd(18)} 省 ${r.saved.toFixed(3)} 核  (${pct}%)`)
}
console.log(`\n  全部关掉：${allOff.t.toFixed(3)} 核（比基线省 ${Math.round((1 - allOff.t / base.t) * 100)}%）`)

ws.close()
process.exit(0)
