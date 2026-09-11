/*
 * 挖 webpack 模块（webpack 4 版）· extract-webpack4.mjs
 * --------------------------------------------------
 * 页面用的是 webpackJsonp（webpack 4），不是 webpackChunk*（webpack 5）。
 * webpack 4 的模块表结构不一样，这个脚本按 webpack 4 的方式挖。
 *
 * 目标：拿到 getSecuritySign 和 encrypt 两个函数，
 * 这样就能自己构造合法的写请求，不用逆向算法。
 *
 * 用法：node --use-system-ca overlay/tools/extract-webpack4.mjs
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

console.log('════════ ① webpackJsonp 长什么样 ════════\n')
console.log(await evalJs(`(() => {
  const j = window.webpackJsonp
  return JSON.stringify({
    type: typeof j,
    isArray: Array.isArray(j),
    isFn: typeof j === 'function',
    keys: j && typeof j === 'object' ? Object.keys(j).slice(0, 20) : [],
    len: j && j.length,
    protoKeys: j ? Object.getOwnPropertyNames(Object.getPrototypeOf(j) || {}).slice(0, 20) : [],
    ownKeys: j ? Object.getOwnPropertyNames(j).slice(0, 20) : [],
  }, null, 1)
})()`))

console.log('\n════════ ② 挖模块表 ════════\n')
const dig = await evalJs(`(() => {
  const j = window.webpackJsonp
  if (!j) return JSON.stringify({ ok: false, why: 'no webpackJsonp' })

  let req = null
  // webpack 4 的 push 签名是 push([[chunkId], modules, runtime])
  // 借它把 require 钓出来
  try {
    j.push([['__probe__'], {}, function (r) { req = r }])
  } catch (e) {
    return JSON.stringify({ ok: false, why: 'push 失败: ' + e.message })
  }

  if (!req) return JSON.stringify({ ok: false, why: 'push 回调没拿到 require' })

  window.__szReq = req
  const mods = req.m || {}
  return JSON.stringify({
    ok: true,
    hasM: !!req.m,
    hasC: !!req.c,
    moduleCount: mods ? Object.keys(mods).length : 0,
    cachedCount: req.c ? Object.keys(req.c).length : 0,
    reqKeys: Object.keys(req).slice(0, 25),
  }, null, 1)
})()`)
console.log(dig)

const d = JSON.parse(dig)
if (!d.ok) {
  console.log('\n挖不到模块表。')
  close()
  process.exit(1)
}

console.log('\n════════ ③ 在模块源码里搜签名/加密 ════════\n')
console.log(await evalJs(`(() => {
  const req = window.__szReq
  const mods = req.m || {}
  const found = []
  for (const id of Object.keys(mods)) {
    let src = ''
    try { src = String(mods[id]) } catch { continue }
    if (!src.includes('getSecuritySign')) continue
    found.push({
      id,
      len: src.length,
      head: src.slice(0, 500).replace(/\\s+/g, ' '),
    })
  }
  return JSON.stringify({ scanned: Object.keys(mods).length, found }, null, 1)
})()`))

console.log('\n════════ ④ 试着 require 出来看有没有那两个函数 ════════\n')
console.log(await evalJs(`(() => {
  const req = window.__szReq
  const mods = req.m || {}
  const out = []
  for (const id of Object.keys(mods)) {
    let src = ''
    try { src = String(mods[id]) } catch { continue }
    if (!src.includes('getSecuritySign')) continue
    try {
      const exp = req(id)
      out.push({
        id,
        type: typeof exp,
        keys: exp && typeof exp === 'object' ? Object.keys(exp).slice(0, 25) : null,
        getSecuritySign: typeof exp?.getSecuritySign,
        encrypt: typeof exp?.encrypt,
        defaultKeys: exp?.default && typeof exp.default === 'object' ? Object.keys(exp.default).slice(0, 25) : null,
      })
    } catch (e) {
      out.push({ id, err: String(e).slice(0, 120) })
    }
  }
  return JSON.stringify(out, null, 1)
})()`))

close()
process.exit(0)
