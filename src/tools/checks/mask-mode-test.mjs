/*
 * 检验遮罩是不是"按亮度"而不是"按 alpha" · mask-mode test
 * ------------------------------------------------------
 * 用户发现：壁纸里偏白的区域能正常变透明，偏黑的区域不怎么透明。
 * 理论上线性 alpha 混合不该受 RGB 影响。可能是：
 *   A. mask-mode 被当成亮度（luminance）而不是 alpha
 *   B. 视觉错觉（深色在浅背景上淡出，观感差异大）
 *   C. 其它合成问题
 *
 * 实验：造一张"左半纯黑、右半纯白"的图，跑完全相同的径向遮罩，
 * 然后逐列量 RGB。判据：
 *   · 若两侧都朝背景色收敛 → 是 alpha 混合（正常）
 *   · 若白侧收敛而黑侧几乎不变 → 遮罩按亮度工作（A，是 bug）
 *
 * 用法：node src/tools/mask-mode-test.mjs
 */

import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { makeShot } from '../lib/cdp-shot.mjs'

const HERE = 'D:/suzuran-player'
const OUTDIR = join(HERE, 'docs', 'shots')

// ── 造测试图：512x512，左半黑、右半白，中间硬分界 ──
const testPng = join(OUTDIR, 'mask-test-art.png')
// 用 ffmpeg 生成：左半黑右半白
execFileSync('D:\\ffmpeg\\bin\\ffmpeg.exe', [
  '-y', '-v', 'error',
  '-f', 'lavfi', '-i', 'color=c=black:s=256x512',
  '-f', 'lavfi', '-i', 'color=c=white:s=256x512',
  '-filter_complex', '[0:v][1:v]hstack=inputs=2',
  '-frames:v', '1', testPng,
], { stdio: 'inherit' })
console.log('测试图已生成:', testPng)

// ── 造一个测试页：把这张图按同样的遮罩规则铺上 ──
const testHtml = join(OUTDIR, 'mask-test.html')
writeFileSync(testHtml, `<!doctype html><html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; }
  /* 背景用已知的浅粉色 —— 和播放器里一样 */
  body { background: #fff9fa; position: relative; }
  /* 层 A：img + 径向遮罩（alpha 模式，默认） */
  .test {
    position: absolute; inset: 0;
    -webkit-mask-image: radial-gradient(ellipse 460px 576px at 331px 414px,
      #000 0%, #000 34%, rgba(0,0,0,.86) 50%, rgba(0,0,0,.5) 64%,
      rgba(0,0,0,.2) 78%, rgba(0,0,0,.05) 90%, transparent 100%);
    mask-image: radial-gradient(ellipse 460px 576px at 331px 414px,
      #000 0%, #000 34%, rgba(0,0,0,.86) 50%, rgba(0,0,0,.5) 64%,
      rgba(0,0,0,.2) 78%, rgba(0,0,0,.05) 90%, transparent 100%);
  }
  .test img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style></head><body>
<div class="test"><img src="./mask-test-art.png" alt=""></div>
</body></html>`, 'utf8')

const browser = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => existsSync(p))
const PORT = 9374
const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  `--user-data-dir=${join(process.env.TEMP ?? '.', 'suzuran-cdp-mm')}`,
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
await call('Page.navigate', { url: 'http://127.0.0.1:7790/docs/shots/mask-test.html' })
await new Promise(r => setTimeout(r, 3000))

// 顺便读一下浏览器对 mask-mode 的解析
const mode = await call('Runtime.evaluate', {
  expression: `(() => {
    const e = document.querySelector('.test')
    const cs = getComputedStyle(e)
    return JSON.stringify({
      maskMode: cs.maskMode, webkitMaskMode: cs.webkitMaskMode,
      maskImage: (cs.maskImage || '').slice(0, 60),
      maskType: cs.maskType,
    }, null, 1)
  })()`,
  returnByValue: true,
})
console.log('\nmask 相关计算样式:')
console.log(mode.result.value)

const shot = makeShot(call, { width: 1440, height: 900 })

/**
 * 在 y 处横向量一条线，返回每列 RGB。
 * 用两张图对比：黑区（图像左半）和白区（右半），
 * 但遮罩是椭圆，圆心在左半，所以左右两处遮罩强度不同……
 * 改成：**在同一个遮罩强度处比较黑与白**。
 *
 * 更好的设计：遮罩圆心在左半图像中心，那么沿竖直方向，
 * 图像左半（黑）和右半（白）在相同半径处强度相同。
 * 所以取一条水平线，找出半径相同的两个点（关于圆心对称）—— 一个落在黑区一个落在白区。
 */
const CX = 331, CY = 414, RX = 460, RY = 576
const Y = CY
// 半径 r 处、两侧对称的两个 x
const probes = [200, 300, 400, 500, 600].map(r => ({
  r,
  xLeft: Math.round(CX - r),   // 落在黑区（x<768 是黑，但图像铺满 1440，左半=黑 0..720）
  xRight: Math.round(CX + r),  // 落在白区
}))

console.log('\n图像分布：0..720 纯黑，720..1440 纯白（object-fit: cover 铺满 1440 宽）')
console.log('遮罩圆心 x=331，所以 x<331 在椭圆内侧、x>331 往外衰减')

const png = join(process.env.TEMP ?? '.', 'mm.png')
const raw = join(process.env.TEMP ?? '.', 'mm.raw')
await shot.file(png, { clip: { x: 0, y: Y - 4, width: 1440, height: 8, scale: 1 } })
execFileSync('D:\\ffmpeg\\bin\\ffmpeg.exe', ['-y', '-v', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw], { stdio: 'inherit' })
const buf = readFileSync(raw)
const W = 1440, H = 8
const col = (x) => {
  let r = 0, g = 0, b = 0
  for (let y = 0; y < H; y++) { const k = (y * W + x) * 3; r += buf[k]; g += buf[k + 1]; b += buf[k + 2] }
  return [r / H, g / H, b / H]
}

/** 由混合式反推 alpha：result = fg*a + bg*(1-a)。
 *  已知 fg（黑=0 或白=255）、bg（#fff9fa = 255,249,250），用 R 通道算。 */
const BG_R = 255
const alphaFrom = (res, fg) => fg === BG_R ? null : (res - BG_R) / (fg - BG_R)

console.log('\n逐点反推 alpha（用 R 通道，背景 R=255）：')
console.log('  x     半径   R值   理论遮罩  反推alpha   落在')
for (const p of probes) {
  for (const [x, zone] of [[p.xLeft, '黑区'], [p.xRight, '白区']]) {
    if (x < 0 || x >= W) continue
    const c = col(x)
    const dist = Math.hypot((x - CX) / RX, (Y - CY) / RY)   // 归一化半径
    // 由 CSS 里的渐变 stop 估算理论 alpha
    const stops = [[0, 1], [.34, 1], [.50, .86], [.64, .5], [.78, .2], [.90, .05], [1, 0]]
    let th = 0
    for (let i = 0; i < stops.length - 1; i++) {
      if (dist >= stops[i][0] && dist <= stops[i + 1][0]) {
        const t = (dist - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
        th = stops[i][1] + t * (stops[i + 1][1] - stops[i][1])
        break
      }
    }
    if (dist > 1) th = 0
    const fg = x < 720 ? 0 : 255
    const a = alphaFrom(c[0], fg)
    console.log(`  ${String(x).padStart(4)}  ${dist.toFixed(3)}  ${String(Math.round(c[0])).padStart(3)}   ${th.toFixed(3)}     ${a === null ? '  n/a' : a.toFixed(3)}    ${zone}`)
  }
}

console.log('\n判读：如果「反推alpha」在黑白两侧接近（差异 < 0.08），说明是正常的 alpha 混合；')
console.log('      如果白侧明显更小（更透明）、黑侧接近 1，说明遮罩被当成亮度用了（bug）。')

ws.close()
child.kill()
