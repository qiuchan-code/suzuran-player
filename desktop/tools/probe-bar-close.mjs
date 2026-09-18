/*
 * 验证悬浮条上的关闭按钮 · probe-bar-close.mjs
 * -----------------------------------------
 * 检查关闭按钮在不在、点了会不会真的退出播放器。
 *
 * ⚠️ 默认只"侦察"不点击 —— 真的点下去会退出播放器。
 *    要实测退出，加 --click。
 *
 * 用法：
 *   node --use-system-ca desktop/tools/probe-bar-close.mjs 9333
 *   node --use-system-ca desktop/tools/probe-bar-close.mjs 9333 --click
 */

const PORT = Number(process.argv[2] ?? 9333)
const DO_CLICK = process.argv.includes('--click')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json()

console.log('════════ 打开的页面 ════════\n')
for (const t of list) {
  if (t.type !== 'page') continue
  console.log(`  ${t.url.startsWith('data:') ? '(内联 HTML)' : t.url.slice(0, 60)}`)
}

/* 悬浮条是 data: URL 的内联页面；播放器界面是 http://127.0.0.1:7790 */
const barPage = list.find(t => t.type === 'page' && t.url.startsWith('data:'))
if (!barPage) {
  console.log('\n✗ 没找到悬浮条页面（它应该是 data: 开头的内联 HTML）')
  process.exit(1)
}

const ws = new WebSocket(barPage.webSocketDebuggerUrl)
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
  setTimeout(() => { if (pend.has(n)) { pend.delete(n); rej(new Error('超时')) } }, 15000)
})

console.log('\n════════ 悬浮条上的按钮 ════════\n')
const btns = JSON.parse(await js(`JSON.stringify(
  [...document.querySelectorAll('button')].map(b => {
    const r = b.getBoundingClientRect()
    const cs = getComputedStyle(b)
    return {
      id: b.id, title: b.title, text: b.textContent.trim(),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none',
    }
  }), null, 1)`))
for (const b of btns) {
  console.log(`  ${b.visible ? '✓' : '✗'} #${b.id.padEnd(8)} 「${b.text}」  ${b.rect[2]}x${b.rect[3]} @${b.rect[0]},${b.rect[1]}   title="${b.title}"`)
}

const close = btns.find(b => b.id === 'close')
console.log('')
if (!close) {
  console.log('  ✗ 没有 #close 按钮')
  process.exit(1)
}
console.log(`  ${close.visible ? '✓' : '✗'} 关闭按钮存在且可见`)
console.log(`     文字「${close.text}」  尺寸 ${close.rect[2]}x${close.rect[3]}`)
console.log(`     提示「${close.title}」`)

/* 检查有没有绑定事件处理 */
const hasHandler = await js(`
  (() => {
    const b = document.getElementById('close')
    if (!b) return false
    // 没法直接读 addEventListener 的回调，改用 getEventListeners（仅 DevTools 控制台有）
    try { return getEventListeners(b).click?.length > 0 } catch { return 'unknown' }
  })()
`)
console.log(`     点击处理：${hasHandler === true ? '✓ 已绑定' : hasHandler === 'unknown' ? '? 读不到（正常，脚本里没这个 API）' : '✗ 没绑定'}`)

/* 整体布局：确认没把滑块挤没 */
console.log('\n════════ 布局 ════════\n')
console.log('  ' + await js(`(() => {
    const t = document.getElementById('track')
    const r = t.getBoundingClientRect()
    return '档位滑块 ' + Math.round(r.width) + 'px 宽，' + (r.width > 60 ? '✓ 够宽' : '✗ 被挤没了')
  })()`))

if (!DO_CLICK) {
  console.log('\n════════ 下一步 ════════\n')
  console.log('  想实测"点了会不会退出"，加 --click：')
  console.log(`    node --use-system-ca desktop/tools/probe-bar-close.mjs ${PORT} --click`)
  console.log('  （会真的退出播放器，需要重新启动）')
  ws.close()
  process.exit(0)
}

console.log('\n════════ 实测点击 ════════\n')
const before = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).length
console.log(`  点击前：${before} 个页面`)
await js(`document.getElementById('close').click()`)
console.log('  已触发点击，等 5 秒看进程有没有退…')
await sleep(5000)
ws.close()

let alive = 0
try {
  const after = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(3000) })).json()
  alive = after.filter(t => t.type === 'page').length
} catch {
  alive = 0
}
console.log(`  点击后：调试端口 ${alive === 0 ? '已关闭 → ✓ 进程退出了' : alive + ' 个页面 → ✗ 还活着'}`)
process.exit(alive === 0 ? 0 : 1)
