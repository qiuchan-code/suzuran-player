/*
 * 摸清「歌单导入」页的结构 · inspect-import.mjs
 * -----------------------------------------
 * 要自动往那个粘贴框里填内容，先得知道：
 *   · 导入页的 URL
 *   · 粘贴框是什么元素（textarea？contenteditable？）
 *   · 有没有 iframe 包着
 *   · 「一键导入」按钮怎么定位
 *
 * 用法：
 *   node --use-system-ca overlay/tools/inspect-import.mjs              # 只看当前页
 *   node --use-system-ca overlay/tools/inspect-import.mjs --nav <url>  # 先导航过去
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)
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
  return { page, send, evalJs, close: () => ws.close() }
}

const { send, evalJs, close } = await connect()

/* 可选：先导航 */
const navIdx = process.argv.indexOf('--nav')
if (navIdx >= 0 && process.argv[navIdx + 1]) {
  const url = process.argv[navIdx + 1]
  console.log(`导航到 ${url} …`)
  await send('Page.enable')
  await send('Page.navigate', { url })
  await sleep(7000)
}

console.log('════════ 页面概况 ════════\n')
console.log(await evalJs(`JSON.stringify({
  url: location.href,
  title: document.title.slice(0, 70),
  readyState: document.readyState,
  iframes: [...document.querySelectorAll('iframe')].map(f => (f.src || '(空)').slice(0, 80)),
}, null, 1)`))

console.log('\n════════ 所有输入元素（不过滤可见性）════════\n')
console.log(await evalJs(`(() => {
  const els = [...document.querySelectorAll('input, textarea, [contenteditable]')]
  return JSON.stringify(els.map(e => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    return {
      tag: e.tagName.toLowerCase(),
      type: e.type || '',
      cls: String(e.className).slice(0, 60),
      ph: e.placeholder || '',
      readOnly: e.readOnly === true,
      disabled: e.disabled === true,
      visible: r.width > 0 && r.height > 0,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      maxLength: e.maxLength > 0 ? e.maxLength : null,
    }
  }), null, 1)
})()`))

console.log('\n════════ 含"导入/粘贴"字样的按钮 ════════\n')
console.log(await evalJs(`(() => {
  const out = []
  for (const e of document.querySelectorAll('button, div, span, a, [role=button]')) {
    const t = (e.textContent || '').trim()
    if (!/导入|粘贴|确定|提交|识别/.test(t)) continue
    if (t.length > 20) continue
    const r = e.getBoundingClientRect()
    if (r.width < 20) continue
    out.push({
      tag: e.tagName.toLowerCase(),
      cls: String(e.className).slice(0, 60),
      text: t,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    })
  }
  return JSON.stringify(out.slice(0, 12), null, 1)
})()`))

console.log('\n════════ 页面上带 import / 导入 的链接（从当前页找入口）════════\n')
console.log(await evalJs(`(() => {
  const out = []
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href') || ''
    const t = (a.textContent || '').trim()
    if (/import|导入|transfer|迁移/i.test(h + t)) {
      out.push({ href: h.slice(0, 100), text: t.slice(0, 30) })
    }
  }
  return JSON.stringify(out.slice(0, 15), null, 1)
})()`))

close()
process.exit(0)
