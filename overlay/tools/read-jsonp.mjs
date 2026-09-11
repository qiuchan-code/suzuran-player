/*
 * 直接读 webpackJsonp 的既有内容 · read-jsonp.mjs
 * --------------------------------------------
 * webpackJsonp 是数组且已有 4 项，说明模块早就装进去了。
 * 不用 push 探针，直接遍历它就能拿到模块定义和 require。
 *
 * 用法：node --use-system-ca overlay/tools/read-jsonp.mjs
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

console.log('════════ ① webpackJsonp 每项的结构 ════════\n')
console.log(await evalJs(`(() => {
  const j = window.webpackJsonp
  const out = []
  for (let i = 0; i < j.length; i++) {
    const it = j[i]
    out.push({
      i,
      type: typeof it,
      isArray: Array.isArray(it),
      len: it && it.length,
      // 典型的 webpack 4 结构：[ [chunkIds], {moduleId: fn}, runtimeFn ]
      item0: it && it[0] ? (Array.isArray(it[0]) ? '[chunkIds x' + it[0].length + ']' : typeof it[0]) : null,
      item1Type: it && it[1] ? typeof it[1] : null,
      item1Count: it && it[1] && typeof it[1] === 'object' ? Object.keys(it[1]).length : null,
      item2Type: it && it[2] ? typeof it[2] : null,
    })
  }
  return JSON.stringify(out, null, 1)
})()`))

console.log('\n════════ ② 借第 3 项（runtime 函数）拿 require ════════\n')
const got = await evalJs(`(() => {
  const j = window.webpackJsonp
  let req = null
  // runtime 函数通常在 it[2]，签名是 (require) => {...}
  for (let i = 0; i < j.length; i++) {
    const it = j[i]
    if (it && typeof it[2] === 'function') {
      try {
        // 传一个假的 require，看它会不会回填真的
        const fake = function () {}
        fake.m = {}
        fake.c = {}
        it[2](fake)
        // 有些 runtime 会把真的 require 挂到 fake 上，或者直接用传入的
        req = fake
        break
      } catch (e) { /* 换下一个 */ }
    }
  }
  // 更可靠：很多 webpack 4 bundle 会把 require 挂在 window 上（如 window.webpackJsonp.push 内部）
  // 退化方案：从模块函数里反查。模块函数形如 function(module, exports, require){...}
  if (!req && j[0] && j[0][1]) {
    const mods = j[0][1]
    const firstId = Object.keys(mods)[0]
    // 无法直接拿 require，只能报告
  }
  window.__szReq2 = req
  return JSON.stringify({
    gotReq: !!req,
    reqKeys: req ? Object.keys(req).slice(0, 25) : [],
    moduleCount: req && req.m ? Object.keys(req.m).length : 0,
  }, null, 1)
})()`)
console.log(got)

console.log('\n════════ ③ 换个思路：搜 script 源码里的加密模块 ════════\n')
console.log(await evalJs(`(async () => {
  // 模块函数不一定在 window 上，但 chunk 文件可以重新下载再 grep
  const urls = performance.getEntriesByType('resource')
    .map(e => e.name).filter(u => /\\.js(\\?|$)/.test(u))
  const report = []
  for (const u of urls) {
    try {
      const t = await (await fetch(u)).text()
      if (!t.includes('getSecuritySign')) continue
      const i = t.indexOf('getSecuritySign')
      report.push({
        url: u.slice(0, 130),
        size: t.length,
        excerpt: t.slice(Math.max(0, i - 400), i + 400).replace(/\\s+/g, ' '),
      })
    } catch (e) {}
  }
  return JSON.stringify(report, null, 1)
})()`))

console.log('\n════════ ④ 也找找 encrypt / QRC 相关 ════════\n')
console.log(await evalJs(`(async () => {
  const urls = performance.getEntriesByType('resource')
    .map(e => e.name).filter(u => /\\.js(\\?|$)/.test(u))
  const report = []
  for (const u of urls) {
    try {
      const t = await (await fetch(u)).text()
      for (const kw of ['ag-1', 'musics.fcg', 'qrc', 'QRC', 'teaEncrypt', 'Encrypt(']) {
        const i = t.indexOf(kw)
        if (i >= 0) {
          report.push({ url: u.slice(0, 110), kw, excerpt: t.slice(Math.max(0, i - 200), i + 300).replace(/\\s+/g, ' ') })
          break
        }
      }
    } catch (e) {}
  }
  return JSON.stringify(report, null, 1)
})()`))

close()
process.exit(0)
