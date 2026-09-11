/*
 * 监听"新建歌单"的真实请求 · capture-create.mjs
 * ------------------------------------------
 * 猜接口不如抓。这个脚本挂在调试 Edge 上，监听所有请求，
 * 然后你在页面上手动新建一个歌单，我就能看到真正的接口和参数。
 *
 * 用法：
 *   1. node --use-system-ca overlay/tools/capture-create.mjs
 *   2. 在弹出的页面里点「新建歌单」，输入名字，确定
 *   3. 脚本会把捕获到的请求打出来
 */

const PORT = Number(process.argv[2] ?? 9222)
const PATTERN = new RegExp(process.argv[3] ?? 'playlist|Playlist|dirinfo|DirInfo|create|Create|add|Add', 'i')

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
let page = list.find(t => t.type === 'page' && /y\.qq\.com/.test(t.url))
if (!page) {
  console.log('没有 y.qq.com 的页面。先跑：powershell -File overlay/tools/launch-debug-edge.ps1')
  process.exit(1)
}
console.log(`监听页面：${page.url}`)
console.log(`过滤关键词：${PATTERN}\n`)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })

let id = 1
const pending = new Map()
/** requestId → 请求信息，等响应回来时配对 */
const reqs = new Map()
/** 已经打印过的，避免重复 */
const printed = new Set()

ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined) { const w = pending.get(m.id); if (w) { pending.delete(m.id); w(m) }; return }

  // 记录发出去的请求
  if (m.method === 'Network.requestWillBeSent') {
    const r = m.params.request
    if (!PATTERN.test(r.url)) return
    if (/\.(js|css|png|jpg|jpeg|gif|webp|woff2?|svg|ico)(\?|$)/i.test(r.url)) return   // 别抓静态资源
    reqs.set(m.params.requestId, { url: r.url, method: r.method, postData: r.postData, ts: Date.now() })
  }

  // 配对响应
  if (m.method === 'Network.responseReceived') {
    const info = reqs.get(m.params.requestId)
    if (!info) return
    info.status = m.params.response.status
    info.mime = m.params.response.mimeType
  }
  if (m.method === 'Network.loadingFinished') {
    const info = reqs.get(m.params.requestId)
    if (!info || printed.has(m.params.requestId)) return
    printed.add(m.params.requestId)
    // 取响应体（有些接口会回显结果，很有用）
    send('Network.getResponseBody', { requestId: m.params.requestId })
      .then(r => { info.body = r.body })
      .catch(() => { })
      .finally(() => report(info))
  }
})

const send = (method, params = {}) => new Promise((res, rej) => {
  const n = id++
  pending.set(n, m => m.error ? rej(new Error(m.error.message)) : res(m.result))
  ws.send(JSON.stringify({ id: n, method, params }))
  setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error('超时')) } }, 20000)
})

function report(info) {
  console.log('─'.repeat(70))
  console.log(`${info.method}  ${info.status ?? '?'}   ${info.url.slice(0, 160)}`)
  if (info.postData) {
    console.log('  请求体：')
    // 如果是 data= 包着 JSON，解开好看点
    let body = info.postData
    const m = /(?:^|&)data=([^&]+)/.exec(body)
    if (m) {
      try {
        const j = JSON.parse(decodeURIComponent(m[1]))
        console.log('    ' + JSON.stringify(j, null, 1).split('\n').join('\n    '))
      } catch { console.log('    ' + body.slice(0, 600)) }
    } else {
      console.log('    ' + body.slice(0, 600))
    }
  }
  if (info.body) {
    const b = info.body.slice(0, 500)
    console.log('  响应体：' + b.replace(/\s+/g, ' '))
  }
  console.log('')
}

await send('Network.enable')

console.log('══════════════════════════════════════════════════════')
console.log('  现在去那个 Edge 窗口里操作：')
console.log('    1. 打开「我的音乐」→「我创建的歌单」')
console.log('    2. 点「新建歌单」')
console.log('    3. 随便输个名字（比如 test123），确定')
console.log('')
console.log('  我会把发出去的请求和参数打出来。')
console.log('  按 Ctrl+C 结束监听。')
console.log('══════════════════════════════════════════════════════\n')

// 一直跑，别退出
await new Promise(() => { })
