/*
 * 看清导入页的完整结构 · dump-import.mjs
 * -----------------------------------
 * 这个页面有多套导入方式（虾米/其他），textareas 一部分是隐藏的。
 * 需要看清：页面文案、可见的输入框、可点的按钮、分别是什么用途。
 *
 * 用法：node --use-system-ca overlay/tools/dump-import.mjs
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
const page = list.find(t => t.type === 'page' && /songlist_import|y\.qq\.com/.test(t.url))
if (!page) throw new Error('没找到页面')

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

console.log(`页面：${await evalJs('location.href')}\n`)

console.log('════════ 页面正文（前 1500 字）════════\n')
console.log(await evalJs(`(document.body.innerText || '').replace(/\\n{2,}/g, '\\n').slice(0, 1500)`))

console.log('\n════════ 所有"可见的"输入元素 ════════\n')
console.log(await evalJs(`(() => {
  const els = [...document.querySelectorAll('input, textarea, [contenteditable]')]
  const vis = els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
  return JSON.stringify(vis.map(e => {
    const r = e.getBoundingClientRect()
    return {
      tag: e.tagName.toLowerCase(),
      type: e.type || '',
      cls: String(e.className).slice(0, 60),
      id: e.id || '',
      ph: e.placeholder || '',
      name: e.name || '',
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      parentCls: e.parentElement ? String(e.parentElement.className).slice(0, 60) : '',
      parentText: e.parentElement ? (e.parentElement.innerText || '').replace(/\\s+/g,' ').slice(0, 80) : '',
    }
  }), null, 1)
})()`))

console.log('\n════════ 所有按钮 / 链接 ════════\n')
console.log(await evalJs(`(() => {
  const els = [...document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit], [class*=btn], [class*=Btn]')]
  const vis = els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 8 })
  return JSON.stringify(vis.map(e => {
    const r = e.getBoundingClientRect()
    return {
      tag: e.tagName.toLowerCase(),
      cls: String(e.className).slice(0, 50),
      id: e.id || '',
      text: ((e.innerText || e.value || '') + '').trim().slice(0, 40),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    }
  }), null, 1)
})()`))

console.log('\n════════ 页面里的全局函数（可能有导入入口）════════\n')
console.log(await evalJs(`JSON.stringify(
  Object.keys(window).filter(k => /import|Import|transfer|xiami|songlist|submit/i.test(k)).slice(0, 30)
, null, 1)`))

console.log('\n════════ 页面加载了哪些 JS ════════\n')
console.log(await evalJs(`JSON.stringify(
  [...document.querySelectorAll('script[src]')].map(s => s.src.slice(0, 110))
, null, 1)`))

ws.close()
process.exit(0)
