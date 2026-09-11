/*
 * 检查 QQ 音乐登录态 + 找建歌单接口 · qq-login-check.mjs
 * ---------------------------------------------------
 * 通过 CDP 连到调试 Edge，在 y.qq.com 页面上下文里：
 *   1. 看登录状态（读 cookie 里的 uin / 页面上的昵称）
 *   2. 探测建歌单 / 加歌的接口
 *
 * 用法：node --use-system-ca overlay/tools/qq-login-check.mjs [调试端口]
 */

const PORT = Number(process.argv[2] ?? 9222)

const api = async (path) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, { signal: AbortSignal.timeout(5000) })
  return r.json()
}

console.log(`连调试端口 ${PORT} …`)
let ver
try {
  ver = await api('/json/version')
} catch (e) {
  console.log('✗ 连不上调试端口。先跑：')
  console.log('    powershell -File overlay/tools/launch-debug-edge.ps1')
  process.exit(1)
}
console.log(`  ✓ ${ver.Browser}\n`)

const tabs = await api('/json/list')
const pages = tabs.filter(t => t.type === 'page')
console.log('打开的页面：')
for (const p of pages) console.log(`  ${p.url}`)

/* 找一个 y.qq.com 的页面；没有就开一个 */
let target = pages.find(p => /y\.qq\.com/.test(p.url))
if (!target) {
  console.log('\n没有 y.qq.com 的页面，新开一个…')
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?https://y.qq.com/`, { method: 'PUT', signal: AbortSignal.timeout(8000) })
  if (!r.ok) { console.log('  ✗ 开不了新页面'); process.exit(1) }
  target = await r.json()
  await new Promise(r => setTimeout(r, 4000))
}
console.log(`\n用页面：${target.url}`)

/* 连 WebSocket */
const ws = new WebSocket(target.webSocketDebuggerUrl)
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
  setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')) } }, 30000)
})

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? 'eval 失败')
  return r.result.value
}

/* ── ① 登录态 ── */
console.log('\n════════ 登录态 ════════\n')
const loginInfo = await evalJs(`(() => {
  const out = {}
  // cookie
  const ck = document.cookie || ''
  out.hasCookie = ck.length > 0
  out.cookieNames = ck.split(';').map(s => s.trim().split('=')[0]).filter(Boolean)
  // 关键 cookie 在 httpOnly 里，document.cookie 看不到，所以另外测
  return JSON.stringify(out)
})()`)
const li = JSON.parse(loginInfo)
console.log('  document.cookie 里的项：')
console.log('    ' + (li.cookieNames.join(', ') || '(空 —— 关键 cookie 都是 httpOnly，看不到是正常的)'))

/* 用接口验登录：登录后这个接口会带出昵称 */
console.log('\n  用登录态接口验证…')
const whoami = await evalJs(`(async () => {
  try {
    const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
      comm: { ct: 24, cv: 0 },
      req_1: { module: 'music.UserInfo.userInfoServer', method: 'GetLoginUserInfo', param: {} }
    })), { credentials: 'include' })
    const j = await r.json()
    return JSON.stringify({ code: j.req_1?.code, data: j.req_1?.data })
  } catch (e) { return JSON.stringify({ error: e.message }) }
})()`)
console.log('    ' + whoami)

/* 再试一个已知能反映登录态的接口：个人歌单列表 */
console.log('\n  用「我的歌单」接口验证…')
const myPlaylists = await evalJs(`(async () => {
  try {
    const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
      comm: { ct: 24, cv: 0 },
      req_1: { module: 'music.musicasset.PlaylistBaseRead', method: 'GetPlaylistByUin', param: { uin: '', num: 5 } }
    })), { credentials: 'include' })
    const j = await r.json()
    return JSON.stringify(j).slice(0, 400)
  } catch (e) { return JSON.stringify({ error: e.message }) }
})()`)
console.log('    ' + myPlaylists)

/* ── ② 页面上的登录元素 ── */
console.log('\n════════ 页面上的登录痕迹 ════════\n')
const dom = await evalJs(`(() => {
  const out = []
  // 找昵称、头像之类的元素
  for (const sel of ['.user_name','.mod_header__user','[class*=user]','[class*=login]','[class*=avatar]']) {
    const els = document.querySelectorAll(sel)
    if (els.length) out.push(sel + ' → ' + els.length + ' 个，首个文本："' + (els[0].textContent || '').trim().slice(0, 40) + '"')
  }
  out.push('页面标题：' + document.title)
  out.push('当前 URL：' + location.href)
  return out.join('\\n')
})()`)
console.log(dom.split('\n').map(l => '  ' + l).join('\n'))

console.log('\n════════ 结论 ════════')
const loggedIn = /"code":0/.test(whoami) && !/"data":null/.test(whoami)
console.log(loggedIn ? '  ✓ 看起来已登录' : '  ✗ 看起来没登录（或接口需要额外参数）')
console.log('\n  如果没登录：在弹出的 Edge 窗口里登录 QQ 音乐，然后重跑这个脚本。')

ws.close()
process.exit(0)
