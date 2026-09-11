/*
 * 从 webpack 里挖出签名/加密函数 · extract-crypto.mjs
 * ------------------------------------------------
 * 抓包看到的是：
 *   POST //u6.y.qq.com/cgi-bin/musics.fcg?encoding=ag-1&sign=zzc...
 *   body = QRC 密文
 *
 * 所以要先拿到两个函数：
 *   getSecuritySign(data)  → 出 sign
 *   encrypt(data)          → 出密文
 *
 * 这两个都在 webpack bundle 里。思路是把 webpack 的模块表挖出来，
 * 找到那个模块再把函数导出来。
 *
 * 用法：node --use-system-ca overlay/tools/extract-crypto.mjs
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)

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

const { ws, evalJs, close } = await connect()

console.log('════════ ① 找 webpack 的模块表 ════════\n')
console.log(await evalJs(`(() => {
  const out = {}
  // webpack 5 用 webpackChunk<name> 数组推模块
  out.chunkKeys = Object.keys(window).filter(k => /^webpackChunk/.test(k))
  // 老的用 webpackJsonp
  out.jsonpKeys = Object.keys(window).filter(k => /webpackJsonp/.test(k))
  // 有没有现成的 require
  out.hasWebpackRequire = typeof window.__webpack_require__ !== 'undefined'
  out.hasRequire = typeof window.require !== 'undefined'
  // 常见宿主对象
  out.hosts = Object.keys(window).filter(k => /^(__|webpack|module|cache)/i.test(k)).slice(0, 30)
  return JSON.stringify(out, null, 1)
})()`))

console.log('\n════════ ② 尝试拿到 require 函数 ════════\n')
const got = await evalJs(`(() => {
  const keys = Object.keys(window).filter(k => /^webpackChunk/.test(k))
  if (!keys.length) return JSON.stringify({ ok: false, why: '没有 webpackChunk*' })

  const arr = window[keys[0]]
  if (!Array.isArray(arr)) return JSON.stringify({ ok: false, why: '不是数组' })

  // 推一个探针模块进去，借它的 require 参数拿到模块表
  let req = null
  let mods = null
  try {
    arr.push([[Symbol('probe')], {}, (r) => { req = r; if (r && r.m) mods = r.m }])
  } catch (e) { return JSON.stringify({ ok: false, why: 'push 失败: ' + e.message }) }

  window.__suzuranReq = req
  return JSON.stringify({
    ok: !!req,
    hasM: !!(req && req.m),
    moduleCount: mods ? Object.keys(mods).length : 0,
    // 看看 require 上挂了什么
    reqKeys: req ? Object.keys(req).slice(0, 20) : [],
  }, null, 1)
})()`)
console.log(got)

const g = JSON.parse(got)
if (!g.ok) {
  console.log('\n拿不到 webpack require，换策略。')
  close()
  process.exit(1)
}

console.log('\n════════ ③ 在模块里搜 getSecuritySign / encrypt ════════\n')
console.log(await evalJs(`(() => {
  const req = window.__suzuranReq
  const out = []
  const mods = req.m || {}
  for (const id of Object.keys(mods)) {
    let src = ''
    try {
      const fn = mods[id]
      src = typeof fn === 'function' ? fn.toString() : ''
    } catch (e) { continue }
    if (!src) continue
    if (/getSecuritySign|securitySign|zzc/i.test(src)) {
      out.push({
        id,
        len: src.length,
        // 把可疑片段截出来
        hits: ['getSecuritySign', 'securitySign', 'zzc', 'encrypt']
          .map(k => { const i = src.indexOf(k); return i >= 0 ? k + '@' + i : null })
          .filter(Boolean),
        head: src.slice(0, 300).replace(/\\s+/g, ' '),
      })
    }
  }
  return JSON.stringify({ total: Object.keys(mods).length, found: out.slice(0, 12) }, null, 1)
})()`))

console.log('\n════════ ④ 直接试着调用一下 ════════\n')
console.log(await evalJs(`(() => {
  const req = window.__suzuranReq
  const mods = req.m || {}
  const report = []
  for (const id of Object.keys(mods)) {
    let fn
    try { fn = mods[id] } catch { continue }
    if (typeof fn !== 'function') continue
    let src = ''
    try { src = fn.toString() } catch { continue }
    if (!/getSecuritySign/.test(src)) continue
    // 这个模块大概率是入口，试着 require 它
    try {
      const exp = req(id)
      report.push({
        id,
        expType: typeof exp,
        expKeys: exp && typeof exp === 'object' ? Object.keys(exp).slice(0, 20) : [],
        hasGetSecuritySign: !!(exp && typeof exp.getSecuritySign === 'function'),
        hasEncrypt: !!(exp && typeof exp.encrypt === 'function'),
      })
    } catch (e) {
      report.push({ id, error: String(e).slice(0, 100) })
    }
  }
  return JSON.stringify(report, null, 1)
})()`))

close()
process.exit(0)
