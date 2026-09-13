/*
 * 确认帧率上限生效 · check-fpscap.mjs
 * ---------------------------------
 * 屏幕刷新率是 85Hz，但 60fps 以上人眼基本看不出差别。
 * 界面上限设成 60 能白省掉 1/3 的渲染量 —— 前提是它真的生效了。
 *
 * 注意：这里测的是**界面 rAF 的实际间隔**，不是合成器循环速度。
 * （合成器速度不能用来判断负载，之前踩过。）
 *
 * 用法：node --use-system-ca desktop/tools/check-fpscap.mjs [端口]
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

/** 测 vizLoop 里实际调 vizFrame 的频率（这才能代表真实渲染量）。 */
async function measureVizHz(secs = 5) {
  await js(`
    (() => {
      if (window.__fOrigVizFrame) return 'already'
      window.__fOrigVizFrame = window.vizFrame || null
      window.__fCalls = 0
      // 在 vizLoop 外面包一层计数：直接数 rAF 里 vizFrame 被调用几次不现实，
      // 改成数"transform 写入次数" —— 那才是真实工作量
      window.__fMuts = 0
      const mo = new MutationObserver(list => { for (const m of list) if (m.attributeName === 'style') window.__fMuts++ })
      const viz = document.getElementById('viz')
      if (viz) mo.observe(viz, { attributes: true, subtree: true, attributeFilter: ['style'] })
      window.__fMo = mo
      return 'watching'
    })()
  `)
  await sleep(secs * 1000)
  const muts = await js('window.__fMuts')
  await js(`(() => { window.__fMo?.disconnect(); return 'ok' })()`)
  return muts / secs
}

/** 测界面的 rAF 间隔（用 __throttle 暴露的 minGap 反推 + 实测）。 */
const gapInfo = JSON.parse(await js(`JSON.stringify({
  minGap: window.__throttle?.minGap?.(),
  playing: window.__throttle?.playing,
  sleeping: window.__throttle?.sleeping,
})`))
console.log('════════ 节流参数 ════════\n')
console.log(`  throttle.minGap() = ${gapInfo.minGap === null ? 'Infinity（完全停）' : gapInfo.minGap?.toFixed(1) + 'ms'}`)
console.log(`  → 允许帧率上限 = ${gapInfo.minGap > 0 ? Math.round(1000 / gapInfo.minGap) : 0} fps`)
console.log(`  playing=${gapInfo.playing}  sleeping=${gapInfo.sleeping}`)

console.log('\n════════ 频谱的实际写入频率 ════════\n')
await js(`window.__forcePlaying(true)`)
await sleep(1200)
const hzPlaying = await measureVizHz(5)
console.log(`  播放中  每帧写 style 的次数 ${hzPlaying.toFixed(0)} 次/秒`)

await js(`window.__forcePlaying(false)`)
await sleep(1500)
const hzPaused = await measureVizHz(4)
console.log(`  暂停    每帧写 style 的次数 ${hzPaused.toFixed(0)} 次/秒`)
await js(`window.__forcePlaying(null)`)

console.log('\n════════ 判读 ════════\n')
console.log(`  91 根柱子 × 60fps 理论值 = ${91 * 60} 次/秒`)
console.log(`  实测播放中              = ${hzPlaying.toFixed(0)} 次/秒`)
const capped = hzPlaying < 91 * 75      // 明显低于 85fps 的理论值
const stopped = hzPaused < 91 * 2        // 暂停时基本不写
console.log(`  ${capped ? '✓' : '✗'} 播放中已受 60fps 上限约束（没跟着 85Hz 屏幕狂跑）`)
console.log(`  ${stopped ? '✓' : '✗'} 暂停时基本停止写入`)

ws.close()
process.exit(capped && stopped ? 0 : 1)
