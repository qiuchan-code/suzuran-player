/*
 * 看清 QQ 音乐首页有哪些可交互元素 · inspect-page.mjs
 * ------------------------------------------------
 * 前几次都在猜元素选择器，猜一次错一次。这个脚本把页面结构**如实列出来**：
 *   · 所有 input（含隐藏的）
 *   · 所有 contenteditable
 *   · 所有带"搜索"字样的元素
 *   · 页面上有没有 iframe
 *   · 主要的 class 前缀（了解用了什么 UI 框架）
 *
 * 用法：node --use-system-ca overlay/tools/inspect-page.mjs
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
  const pages = list.filter(t => t.type === 'page' && /y\.qq\.com/.test(t.url))
  if (!pages.length) throw new Error('没有 y.qq.com 页面')
  const page = pages[0]
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
    pending.set(n, m => m.error ? rej(new Error(m.error.message)) : res(m.result))
    ws.send(JSON.stringify({ id: n, method, params }))
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')) } }, 60000)
  })
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? 'eval 失败')
    return r.result.value
  }
  return { ws, evalJs, close: () => ws.close() }
}

const { evalJs, close } = await connect()

console.log('════════ 页面概况 ════════\n')
console.log(await evalJs(`JSON.stringify({
  url: location.href,
  title: document.title,
  readyState: document.readyState,
  bodyLen: document.body ? document.body.innerHTML.length : 0,
  iframes: [...document.querySelectorAll('iframe')].map(f => f.src.slice(0, 90)),
  shadows: [...document.querySelectorAll('*')].filter(e => e.shadowRoot).length,
}, null, 1)`))

console.log('\n════════ 所有 input / textarea / contenteditable ════════\n')
console.log(await evalJs(`(() => {
  const els = [...document.querySelectorAll('input, textarea, [contenteditable]')]
  return JSON.stringify(els.map(e => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    return {
      tag: e.tagName.toLowerCase(),
      type: e.type || '',
      cls: String(e.className).slice(0, 70),
      id: e.id || '',
      ph: e.placeholder || '',
      visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      parentCls: e.parentElement ? String(e.parentElement.className).slice(0, 60) : '',
    }
  }), null, 1)
})()`))

console.log('\n════════ 含"搜索"字样的元素（前 15 个）════════\n')
console.log(await evalJs(`(() => {
  const out = []
  for (const e of document.querySelectorAll('*')) {
    const t = (e.textContent || '').trim()
    const ph = e.placeholder || ''
    const cls = String(e.className || '')
    if (!/搜索|search|Search/.test(t + ph + cls)) continue
    if (e.children.length > 3) continue   // 跳过容器
    const r = e.getBoundingClientRect()
    out.push({
      tag: e.tagName.toLowerCase(),
      cls: cls.slice(0, 70),
      text: t.slice(0, 40),
      ph: ph.slice(0, 40),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    })
    if (out.length >= 15) break
  }
  return JSON.stringify(out, null, 1)
})()`))

console.log('\n════════ 页面用的什么 UI 框架（class 前缀统计）════════\n')
console.log(await evalJs(`(() => {
  const pref = {}
  for (const e of document.querySelectorAll('[class]')) {
    for (const c of String(e.className).split(/\\s+/)) {
      if (!c) continue
      const p = c.split(/[-_]/)[0]
      if (p.length < 2) continue
      pref[p] = (pref[p] || 0) + 1
    }
  }
  return JSON.stringify(Object.entries(pref).sort((a,b)=>b[1]-a[1]).slice(0, 22), null, 1)
})()`))

console.log('\n════════ 页面上有哪些可点的按钮（前 20）════════\n')
console.log(await evalJs(`(() => {
  const els = [...document.querySelectorAll('button, a, [role=button], [class*=btn], [class*=Btn]')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 10 && r.width < 400 })
  return JSON.stringify(els.slice(0, 20).map(e => {
    const r = e.getBoundingClientRect()
    return {
      tag: e.tagName.toLowerCase(),
      cls: String(e.className).slice(0, 60),
      text: (e.textContent || '').trim().slice(0, 30),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    }
  }), null, 1)
})()`))

close()
process.exit(0)
