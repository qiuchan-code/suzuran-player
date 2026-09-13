/*
 * 看界面里的 video 元素 · inspect-videos.mjs
 * ----------------------------------------
 * 量性能时发现有**两个 video 都在播**，都是 810x1080。
 * 如果壁纸视频被渲染了两份，那是白白多一倍解码开销。
 *
 * 顺便看：页面实际刷新率、是不是有元素在用 GPU 合成层。
 *
 * 用法：node --use-system-ca desktop/tools/inspect-videos.mjs [端口]
 */

const PORT = Number(process.argv[2] ?? 9333)

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
  ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }))
  setTimeout(() => { if (pend.has(n)) { pend.delete(n); rej(new Error('超时')) } }, 20000)
})

console.log('════════ video 元素 ════════\n')
const vids = JSON.parse(await js(`JSON.stringify(
  [...document.querySelectorAll('video')].map(v => {
    const r = v.getBoundingClientRect()
    const cs = getComputedStyle(v)
    return {
      id: v.id || '(无)',
      cls: String(v.className).slice(0, 50),
      paused: v.paused,
      loop: v.loop,
      muted: v.muted,
      src: (v.currentSrc || v.src || '').split('/').pop().slice(0, 50),
      intrinsic: v.videoWidth + 'x' + v.videoHeight,
      rendered: Math.round(r.width) + 'x' + Math.round(r.height),
      at: Math.round(r.left) + ',' + Math.round(r.top),
      display: cs.display,
      opacity: cs.opacity,
      visibility: cs.visibility,
      parentCls: v.parentElement ? String(v.parentElement.className).slice(0, 40) : '',
    }
  }), null, 1)`))
for (const v of vids) console.log('  ' + JSON.stringify(v))

console.log('\n════════ 实际刷新率 ════════\n')
const fps = await js(`
  new Promise(res => {
    const times = []
    let n = 0
    const loop = (t) => { times.push(t); if (++n < 70) requestAnimationFrame(loop)
      else { const d = []; for (let i = 1; i < times.length; i++) d.push(times[i] - times[i-1])
        d.sort((a,b)=>a-b)
        const med = d[Math.floor(d.length/2)]
        res(JSON.stringify({ median: +med.toFixed(2), min: +d[0].toFixed(2), max: +d[d.length-1].toFixed(2),
          fpsMedian: Math.round(1000/med), fpsMax: Math.round(1000/d[0]) })) } }
    requestAnimationFrame(loop)
  })
`)
console.log('  ' + fps)

console.log('\n════════ 有合成层的元素（会常驻显存）════════\n')
const layers = JSON.parse(await js(`JSON.stringify(
  [...document.querySelectorAll('*')].filter(e => {
    const cs = getComputedStyle(e)
    return cs.willChange !== 'auto' || cs.transform !== 'none' && cs.position === 'fixed'
      || cs.filter !== 'none' || cs.backdropFilter && cs.backdropFilter !== 'none'
      || cs.mixBlendMode !== 'normal' || cs.isolation === 'isolate'
  }).slice(0, 20).map(e => ({
    tag: e.tagName.toLowerCase(),
    cls: String(e.className).slice(0, 40),
    willChange: getComputedStyle(e).willChange,
    filter: getComputedStyle(e).filter.slice(0, 30),
    blend: getComputedStyle(e).mixBlendMode,
  })), null, 1)`))
for (const l of layers) console.log('  ' + JSON.stringify(l))

console.log('\n════════ 正在跑的动画 ════════\n')
const anims = JSON.parse(await js(`JSON.stringify(
  document.getAnimations().map(a => ({
    name: a.animationName || a.constructor.name,
    target: a.effect?.target ? (a.effect.target.tagName.toLowerCase() + '.' + String(a.effect.target.className).slice(0,30)) : '?',
    state: a.playState,
    duration: a.effect?.getTiming?.().duration,
  })).slice(0, 25), null, 1)`))
console.log(`  共 ${anims.length} 个在跑：`)
for (const a of anims) console.log('    ' + JSON.stringify(a))

ws.close()
process.exit(0)
