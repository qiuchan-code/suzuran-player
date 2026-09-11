/*
 * 抓"把歌加到歌单"的真实请求 · capture-add.mjs
 * ----------------------------------------
 * 加歌接口是关键：要拿到它的 URL、参数名（尤其是怎么传 songmid 列表）
 * 和批量上限。
 *
 * 用法：
 *   1. node --use-system-ca overlay/tools/capture-add.mjs
 *   2. 在 Edge 里：打开刚建的空歌单 → 搜索一首歌 → 添加到该歌单
 *   3. 脚本打出所有相关请求
 *
 * 过滤策略：这次不靠关键词猜，而是**记录所有 POST/PUT**，
 * 加上所有 URL 里带 diss/add/song 的请求。宁可多打，别漏。
 */

const PORT = Number(process.argv[2] ?? 9222)

/** 判断值不值得打印。 */
function interesting(url, method) {
  if (/\.(js|css|png|jpe?g|gif|webp|woff2?|svg|ico|mp3|m4a)(\?|$)/i.test(url)) return false
  if (/report|log|beacon|trace|stat|monitor|ping|pageview|pgv/i.test(url)) return false
  if (method !== 'GET') return true
  return /diss|dirinfo|DirInfo|add_song|addsong|songlist|playlist|fav|like/i.test(url)
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find(t => t.type === 'page' && /y\.qq\.com/.test(t.url))
if (!page) {
  console.log('没有 y.qq.com 的页面。先跑 launch-debug-edge.ps1')
  process.exit(1)
}
console.log(`监听页面：${page.url}\n`)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })

let id = 1
const pending = new Map()
const reqs = new Map()
const printed = new Set()

const send = (method, params = {}) => new Promise((res, rej) => {
  const n = id++
  pending.set(n, m => m.error ? rej(new Error(m.error.message)) : res(m.result))
  ws.send(JSON.stringify({ id: n, method, params }))
  setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error('超时')) } }, 20000)
})

/** 把请求体里的 data= JSON 解开，好看清参数名。 */
function prettyBody(body) {
  if (!body) return ''
  const m = /(?:^|&)data=([^&]+)/.exec(body)
  if (m) {
    try {
      const j = JSON.parse(decodeURIComponent(m[1]))
      return JSON.stringify(j, null, 1).split('\n').join('\n      ')
    } catch { /* 解不开就当普通表单 */ }
  }
  try {
    const j = JSON.parse(body)
    return JSON.stringify(j, null, 1).split('\n').join('\n      ')
  } catch { }
  return body.slice(0, 800)
}

function report(info) {
  console.log('─'.repeat(74))
  console.log(`★ ${info.method}  ${info.status ?? '?'}  ${info.url.slice(0, 170)}`)
  if (info.postData) {
    console.log('  请求体：')
    console.log('      ' + prettyBody(info.postData))
  }
  if (info.body) {
    console.log('  响应：' + info.body.replace(/\s+/g, ' ').slice(0, 400))
  }
  console.log('')
}

ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) }; return }

  if (m.method === 'Network.requestWillBeSent') {
    const r = m.params.request
    if (!interesting(r.url, r.method)) return
    reqs.set(m.params.requestId, { url: r.url, method: r.method, postData: r.postData })
  }
  if (m.method === 'Network.responseReceived') {
    const info = reqs.get(m.params.requestId)
    if (info) { info.status = m.params.response.status; info.mime = m.params.response.mimeType }
  }
  if (m.method === 'Network.loadingFinished') {
    const info = reqs.get(m.params.requestId)
    if (!info || printed.has(m.params.requestId)) return
    printed.add(m.params.requestId)
    send('Network.getResponseBody', { requestId: m.params.requestId })
      .then(r => { info.body = r.body })
      .catch(() => { })
      .finally(() => report(info))
  }
})

await send('Network.enable')

console.log('══════════════════════════════════════════════════════════════')
console.log('  请在 Edge 窗口里操作：')
console.log('    1. 打开你新建的「Chinese」歌单（现在是空的）')
console.log('    2. 搜索任意一首歌')
console.log('    3. 点「添加到歌单」→ 选 Chinese')
console.log('')
console.log('  我会把加歌请求的完整参数打出来。')
console.log('  Ctrl+C 结束。')
console.log('══════════════════════════════════════════════════════════════\n')

await new Promise(() => { })
