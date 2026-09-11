/*
 * 用真实鼠标事件操作搜索 · ui-search.mjs
 * ------------------------------------
 * 上次的问题：搜索框宽度是 0（折叠状态），我用 width>80 过滤把它滤掉了。
 * 这次：
 *   1. 先找到 input.search_input__input（不按宽度过滤）
 *   2. 用 CDP 的 Input.dispatchMouseEvent 在它坐标上**真的点一下**（展开）
 *   3. 再用 Input.insertText 打字
 *   4. 看联想列表出来没
 *
 * 为什么要用真实鼠标事件：React 的合成事件系统对
 * element.dispatchEvent(new MouseEvent(...)) 有时不响应，
 * 但 CDP 发的是**浏览器层面的真实输入**，一定进 React 的事件流。
 *
 * 用法：node --use-system-ca overlay/tools/ui-search.mjs [关键词]
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)
const KW = process.argv[2] ?? '稻香'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
  const page = list.find(t => t.type === 'page' && /y\.qq\.com/.test(t.url))
  if (!page) throw new Error('没有 y.qq.com 页面')
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
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')) } }, 60000)
  })
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? 'eval 失败')
    return r.result.value
  }
  return { send, evalJs, close: () => ws.close() }
}

const { send, evalJs, close } = await connect()

/** 在指定坐标做一次真实点击。 */
async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
  await sleep(120)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await sleep(80)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

const box = async () => JSON.parse(await evalJs(`(() => {
  const e = document.querySelector('input.search_input__input')
  if (!e) return JSON.stringify({ found: false })
  const r = e.getBoundingClientRect()
  return JSON.stringify({
    found: true,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    value: e.value,
    focused: document.activeElement === e,
  })
})()`))

console.log('════════ ① 搜索框当前状态 ════════\n')
let b = await box()
console.log('  ' + JSON.stringify(b))

/* 如果宽度是 0，就点它左边那片的父容器（折叠时整个搜索区是个图标） */
if (b.found && b.rect[2] < 20) {
  console.log('\n  宽度为 0（折叠状态），找它外层可点的容器…')
  const wrap = JSON.parse(await evalJs(`(() => {
    const e = document.querySelector('input.search_input__input')
    let p = e
    for (let i = 0; i < 5 && p; i++) {
      const r = p.getBoundingClientRect()
      if (r.width > 40 && r.height > 10) {
        return JSON.stringify({ cls: String(p.className).slice(0,70), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] })
      }
      p = p.parentElement
    }
    return JSON.stringify({ none: true })
  })()`))
  console.log('  ' + JSON.stringify(wrap))

  if (wrap.rect) {
    const [wx, wy, ww, wh] = wrap.rect
    const cx = Math.round(wx + ww / 2)
    const cy = Math.round(wy + wh / 2)
    console.log(`\n  在上面容器中心 (${cx}, ${cy}) 点一下…`)
    await clickAt(cx, cy)
    await sleep(1200)
    b = await box()
    console.log('  点击后：' + JSON.stringify(b))
  }
}

console.log('\n════════ ② 聚焦搜索框 ════════\n')
const focus = await evalJs(`(() => {
  const e = document.querySelector('input.search_input__input')
  if (!e) return 'no input'
  e.focus()
  return document.activeElement === e ? 'focused' : 'focus failed'
})()`)
console.log('  ' + focus)
await sleep(400)

console.log('\n════════ ③ 打字（CDP insertText，等同真人输入）════════\n')
console.log(`  输入「${KW}」`)
await send('Input.insertText', { text: KW })
await sleep(2600)

console.log('\n════════ ④ 看联想列表 ════════\n')
console.log(await evalJs(`(() => {
  const input = document.querySelector('input.search_input__input')
  const out = {
    inputValue: input ? input.value : null,
    // 联想列表一般是搜索框附近的浮层
    candidates: [],
  }
  const ir = input ? input.getBoundingClientRect() : null
  if (ir) {
    for (const e of document.querySelectorAll('div, ul, li, a')) {
      const r = e.getBoundingClientRect()
      if (r.width < 150 || r.height < 30) continue
      // 必须在搜索框下方附近
      if (r.top < ir.bottom - 10) continue
      if (r.top > ir.bottom + 500) continue
      const t = (e.textContent || '').trim()
      if (!t || t.length > 300) continue
      const cls = String(e.className)
      if (!/suggest|Suggest|search|Search|list|List|popup|Popup|dropdown/i.test(cls)) continue
      out.candidates.push({
        cls: cls.slice(0, 70),
        text: t.slice(0, 140),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      })
      if (out.candidates.length >= 6) break
    }
  }
  return JSON.stringify(out, null, 1)
})()`))

console.log('\n════════ ⑤ 按回车 ════════\n')
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter' })
await send('Input.dispatchKeyEvent', { type: 'char', text: '\r' })
await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter' })
await sleep(4000)

console.log(await evalJs(`JSON.stringify({
  url: location.href,
  title: document.title.slice(0, 60),
  // 搜索结果里的歌名
  songs: [...document.querySelectorAll('[class*=song_name], [class*=songlist__songname], .songlist__songname_txt')]
    .slice(0, 10).map(e => (e.textContent || '').trim().slice(0, 40)),
}, null, 1)`))

close()
process.exit(0)
