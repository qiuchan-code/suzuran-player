/*
 * 在页面里 hook 请求，记录 app 真正发出去的东西 · hook-requests.mjs
 * ------------------------------------------------------------
 * 背景：musicu 的写接口要「签名 + 加密 + URL 改写」，
 * 这套逻辑在 webpack bundle 里，逆向成本高。
 *
 * 所以不逆向，改成 **在页面最底层 hook 住 XHR 和 fetch**：
 *   · 覆盖 XMLHttpRequest.prototype.send / open
 *   · 覆盖 window.fetch
 * 这样不管上层用什么姿势发请求，我都能拿到最终 URL 和 body。
 *
 * 用法：
 *   1. node --use-system-ca overlay/tools/hook-requests.mjs
 *   2. 在 Edge 里点「添加到歌单」随便加一首
 *   3. 脚本打印捕获到的写请求（含验签参数）
 *   4. Ctrl+C 结束
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find(t => t.type === 'page' && /y\.qq\.com/.test(t.url))
if (!page) {
  console.log('没有 y.qq.com 页面。先跑 launch-debug-edge.ps1')
  process.exit(1)
}
console.log(`页面：${page.url}\n`)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })

let id = 1
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) }; return }
  // 页面里 hook 到东西会打 console.log('__HOOK__' + json)
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = (m.params.args ?? []).map(a => a.value ?? '').join(' ')
    if (typeof txt === 'string' && txt.startsWith('__HOOK__')) {
      show(txt.slice('__HOOK__'.length))
    }
  }
})
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = id++
  pending.set(n, m => m.error ? rej(new Error(m.error.message)) : res(m.result))
  ws.send(JSON.stringify({ id: n, method, params }))
  setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')) } }, 30000)
})

/** 美化输出。 */
function show(json) {
  let o
  try { o = JSON.parse(json) } catch { console.log(json); return }
  console.log('─'.repeat(76))
  console.log(`★ ${o.via}  ${o.method}  ${String(o.url).slice(0, 170)}`)
  if (o.body) {
    let pretty = o.body
    // musicu 的 data= 里是 JSON，解开
    const m = /(?:^|&)data=([^&]+)/.exec(o.body)
    if (m) {
      try { pretty = JSON.stringify(JSON.parse(decodeURIComponent(m[1])), null, 1) } catch { }
    } else if (/^\{/.test(o.body)) {
      try { pretty = JSON.stringify(JSON.parse(o.body), null, 1) } catch { }
    }
    console.log('  body:')
    console.log(String(pretty).split('\n').map(l => '    ' + l).join('\n').slice(0, 2500))
  }
  if (o.headers) {
    const h = typeof o.headers === 'string' ? o.headers : JSON.stringify(o.headers)
    if (h && h !== '{}') console.log('  头: ' + h.slice(0, 300))
  }
  console.log('')
}

await send('Runtime.enable')

/* 注入 hook —— 只记"写"请求，避免刷屏 */
const hookCode = `
(() => {
  if (window.__suzuranHooked) { console.log('__HOOK__' + JSON.stringify({ via: 'system', method: '-', url: '（hook 已经装过了，重新注入）' })); return }
  window.__suzuranHooked = true

  // 只关心写操作，或者带 sign 的请求
  function interesting(method, url) {
    if (method && method.toUpperCase() !== 'GET') return true
    if (/musicu\\.fcg|fcg_|cgi-bin/i.test(url)) return true
    return false
  }
  function shouldSkip(url) {
    return /\\.(js|css|png|jpe?g|gif|webp|woff2?|svg|ico|mp3|m4a)(\\?|$)/i.test(url)
  }
  function emit(via, method, url, body, headers) {
    if (shouldSkip(url)) return
    if (!interesting(method, url)) return
    try {
      console.log('__HOOK__' + JSON.stringify({
        via, method: String(method || 'GET').toUpperCase(), url: String(url),
        body: body == null ? null : (typeof body === 'string' ? body.slice(0, 4000) : '[非字符串:' + Object.prototype.toString.call(body) + ']'),
        headers: headers || null,
      }))
    } catch (e) {}
  }

  // ① hook XHR
  const XO = XMLHttpRequest.prototype.open
  const XS = XMLHttpRequest.prototype.send
  const XH = XMLHttpRequest.prototype.setRequestHeader
  XMLHttpRequest.prototype.open = function (m, u, ...rest) {
    this.__m = m; this.__u = u; this.__h = {}
    return XO.call(this, m, u, ...rest)
  }
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    try { this.__h[k] = v } catch (e) {}
    return XH.call(this, k, v)
  }
  XMLHttpRequest.prototype.send = function (body) {
    emit('XHR', this.__m, this.__u, body, this.__h)
    return XS.call(this, body)
  }

  // ② hook fetch
  const OF = window.fetch
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      const method = (init && init.method) || (input && input.method) || 'GET'
      const body = (init && init.body) || null
      emit('fetch', method, url, body, init && init.headers)
    } catch (e) {}
    return OF.apply(this, arguments)
  }

  // ③ hook sendBeacon
  if (navigator.sendBeacon) {
    const OB = navigator.sendBeacon.bind(navigator)
    navigator.sendBeacon = function (url, data) {
      emit('beacon', 'POST', url, data, null)
      return OB(url, data)
    }
  }

  console.log('__HOOK__' + JSON.stringify({ via: 'system', method: '-', url: 'hook 已装好（XHR / fetch / sendBeacon）' }))
})()
`

await send('Runtime.evaluate', { expression: hookCode, returnByValue: true })

console.log('══════════════════════════════════════════════════════════════')
console.log('  hook 已装好。现在去 Edge 里：')
console.log('    打开任意歌单 → 点「添加歌曲」/「添加到歌单」→ 随便加一首')
console.log('')
console.log('  我会打印 app 真正发出去的请求（含签名参数）。')
console.log('  加完一首就够，然后 Ctrl+C。')
console.log('══════════════════════════════════════════════════════════════\n')

await new Promise(() => { })
