/*
 * 找 QQ 音乐 web 端的签名函数 · find-sign.mjs
 * ----------------------------------------
 * 写操作（加歌、建歌单）返回 500003/860100001 —— 说明缺签名/CSRF。
 * QQ 音乐 web 端用 JS 算 sign，先把它找出来。
 *
 * 思路：
 *   1. 看 window 上有哪些可疑的全局函数
 *   2. 看加载了哪些 JS bundle，grep 里面的 sign 相关代码
 *   3. 试着直接调用找到的函数验证
 *
 * 用法：node --use-system-ca overlay/tools/find-sign.mjs
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
  let page = list.find(t => t.type === 'page' && /y\.qq\.com/.test(t.url))
  if (!page) throw new Error('没有 y.qq.com 页面，先跑 launch-debug-edge.ps1')
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
  return { ws, evalJs, send, close: () => ws.close() }
}

const { ws, evalJs, close } = await connect()

console.log('════════ ① 页面基本信息 ════════\n')
console.log(await evalJs(`JSON.stringify({
  url: location.href,
  origin: location.origin,
  hasJQuery: typeof jQuery !== 'undefined',
  globals: Object.keys(window).filter(k => /sign|Sign|tk|TK|token|Token|csrf/i.test(k)).slice(0, 40),
}, null, 1)`))

console.log('\n════════ ② 看看有哪些全局对象可能是 SDK ════════\n')
console.log(await evalJs(`(() => {
  const out = []
  for (const k of Object.keys(window)) {
    try {
      const v = window[k]
      if (!v || typeof v !== 'object') continue
      const keys = Object.keys(v)
      if (keys.some(x => /sign|encrypt|Encrypt|getSign/i.test(x))) {
        out.push(k + ' → ' + keys.filter(x => /sign|encrypt/i.test(x)).join(', '))
      }
    } catch (e) {}
  }
  return JSON.stringify(out, null, 1)
})()`))

console.log('\n════════ ③ 翻 script 里有没有 sign 相关代码 ════════\n')
console.log(await evalJs(`(() => {
  const out = []
  const scripts = [...document.querySelectorAll('script')]
  for (const s of scripts) {
    if (s.src) out.push('外链: ' + s.src.slice(0, 110))
    else if (s.textContent && s.textContent.length > 100) out.push('内联: ' + s.textContent.length + ' 字节')
  }
  return JSON.stringify(out, null, 1)
})()`))

console.log('\n════════ ④ 从已加载的 JS 里 grep "sign" ════════\n')
const grepResult = await evalJs(`(async () => {
  const found = []
  const urls = performance.getEntriesByType('resource')
    .map(e => e.name)
    .filter(u => /\\.js(\\?|$)/.test(u) && /y\\.qq\\.com|qqmusic/.test(u))
  for (const u of urls.slice(0, 25)) {
    try {
      const t = await (await fetch(u)).text()
      if (!/sign/i.test(t)) continue
      // 找一些可能定义签名的片段
      const pats = [
        /sign\\s*[:=]\\s*function[^}]{0,200}/,
        /function\\s+\\w*[Ss]ign\\w*\\s*\\([^)]*\\)\\s*\\{[^}]{0,300}/,
        /getSign\\s*[:=]\\s*function[^}]{0,200}/,
        /['"]sign['"]\\s*:/,
        /_sign\\s*=/,
      ]
      const hits = []
      for (const p of pats) {
        const m = p.exec(t)
        if (m) hits.push(m[0].replace(/\\s+/g, ' ').slice(0, 220))
      }
      if (hits.length) found.push({ url: u.slice(0, 130), size: t.length, hits: hits.slice(0, 3) })
    } catch (e) {}
  }
  return JSON.stringify(found, null, 1)
})()`)
console.log(grepResult)

console.log('\n════════ ⑤ 已知的 qm_sign 实现位置 ════════\n')
console.log(await evalJs(`(async () => {
  // QQ音乐 web 的签名函数通常在某个 bundle 里叫 getSecuritySign / qm_sign
  const urls = performance.getEntriesByType('resource').map(e => e.name).filter(u => /\\.js/.test(u))
  const hits = []
  for (const u of urls.slice(0, 30)) {
    try {
      const t = await (await fetch(u)).text()
      for (const kw of ['qm_sign', 'getSecuritySign', 'securitySign', 'zzc_sign', 'getSign']) {
        const i = t.indexOf(kw)
        if (i >= 0) { hits.push(u.slice(0, 110) + '  @' + i + '  …' + t.slice(i, i + 150).replace(/\\s+/g, ' ')); break }
      }
    } catch (e) {}
  }
  return JSON.stringify(hits, null, 1)
})()`))

close()
process.exit(0)
