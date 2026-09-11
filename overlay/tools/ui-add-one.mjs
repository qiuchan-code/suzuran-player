/*
 * 验证"模拟真人操作"能不能加歌 · ui-add-one.mjs
 * ------------------------------------------
 * 背景：
 *   · 文字导入限 1000 字符 —— 不够（中文 91KB）
 *   · 直接调接口 —— 请求体是 QRC 加密 + 签名，逆算法成本太高
 *   · 挖 webpack 模块 —— 能挖到模块表，但导出结构复杂
 *
 * 这条路：**用 CDP 往页面发真实输入事件**，让页面自己走完整流程
 * （搜索 → 联想 → 点添加 → 选歌单），加密由页面自己做。
 *
 * 这一版只加一首歌，验证可行性（不循环）。
 *
 * 用法：node --use-system-ca overlay/tools/ui-add-one.mjs [歌名] [歌单名]
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)
const SONG = process.argv[2] ?? '稻香'
const PLAYLIST = process.argv[3] ?? 'Chinese'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
  const page = list.find(t => t.type === 'page' && /y\.qq\.com/.test(t.url))
  if (!page) throw new Error('没有 y.qq.com 页面')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  let id = 1
  const pending = new Map()
  const logs = []
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) }; return }
    if (m.method === 'Runtime.consoleAPICalled') {
      const t = (m.params.args ?? []).map(a => a.value ?? '').join(' ')
      if (t.startsWith('__SZ__')) logs.push(t.slice(6))
    }
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
  return { ws, send, evalJs, logs, close: () => ws.close() }
}

const { send, evalJs, logs, close } = await connect()

/* ── 装一个探测器：看有没有"添加到歌单"的入口 ── */
console.log('════════ ① 探测页面上的可用入口 ════════\n')
await evalJs(`
(() => {
  if (window.__szProbe) return 'already'
  window.__szProbe = true
  window.__szLog = (m) => console.log('__SZ__' + m)
  window.__szLog('探测器已装')
  return 'ok'
})()
`)

/* 找一个能搜索的输入框 */
console.log('找搜索框…')
const searchBox = await evalJs(`
(() => {
  const cands = [
    ...document.querySelectorAll('input[type=text], input[type=search], input:not([type])'),
  ].filter(e => {
    const r = e.getBoundingClientRect()
    return r.width > 80 && r.height > 10 && r.top >= 0
  })
  const out = cands.map(e => {
    const r = e.getBoundingClientRect()
    return {
      cls: String(e.className).slice(0, 60),
      ph: e.placeholder || '',
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    }
  })
  window.__searchBox = cands[0] || null
  return JSON.stringify(out, null, 1)
})()
`)
console.log(searchBox)

if (searchBox === '[]') {
  console.log('\n✗ 页面上没有可用的搜索框。')
  console.log('  这个脚本要在**能搜索的页面**上跑（比如 y.qq.com 首页或搜索结果页）。')
  console.log('  先把 Edge 导航到 https://y.qq.com/ 再试。')
  close()
  process.exit(1)
}

console.log('\n════════ ② 往搜索框里打字（真实键盘事件）════════\n')
// 先聚焦搜索框
await evalJs(`(() => { window.__searchBox.focus(); return document.activeElement === window.__searchBox })()`)
await sleep(400)

// 用 CDP 的 Input.insertText 打字（最接近真实输入）
await send('Input.insertText', { text: SONG })
await sleep(2500)

const afterType = await evalJs(`
(() => {
  const v = window.__searchBox.value
  // 看有没有弹出联想列表
  const suggest = [...document.querySelectorAll('[class*=suggest], [class*=Suggest], [class*=autocomplete], [class*=dropdown]')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.height > 20 && r.width > 100 })
    .map(e => ({ cls: String(e.className).slice(0, 70), text: (e.textContent || '').trim().slice(0, 120) }))
  return JSON.stringify({ inputValue: v, suggestCount: suggest.length, suggest: suggest.slice(0, 4) }, null, 1)
})()
`)
console.log(afterType)

console.log('\n════════ ③ 按回车搜索 ════════\n')
await send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter' })
await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter' })
await sleep(3500)

const afterSearch = await evalJs(`
(() => {
  return JSON.stringify({
    url: location.href,
    title: document.title,
    // 找搜索结果里的歌名元素
    songCandidates: [...document.querySelectorAll('[class*=song_name], [class*=songname], [class*=songlist] a, .songlist__songname')]
      .slice(0, 8).map(e => (e.textContent || '').trim().slice(0, 50)),
  }, null, 1)
})()
`)
console.log(afterSearch)

console.log('\n════════ 探测器日志 ════════')
for (const l of logs) console.log('  ' + l)

console.log(`
════════ 结论 ════════

页面现在应该在搜索结果页了。看 Edge 窗口确认一下。

如果搜索成功 → 说明"模拟输入"这条路可行，我可以继续写：
  搜歌 → 点结果行的「…」→ 点「添加到歌单」→ 选 ${PLAYLIST} → 确认

如果不行 → 说明这条也不通，得回到逆加密那条路。
`)

close()
process.exit(0)
