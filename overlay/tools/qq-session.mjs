/*
 * 连接调试 Edge，取登录态 · qq-session.mjs
 * -------------------------------------
 * 从浏览器里把 cookie 抠出来，供后续在 Node 里直接调 API。
 *
 * 为什么能抠：y.qq.com 的关键 cookie（uin / qm_keyst）**不是 httpOnly**，
 * document.cookie 读得到。所以不用碰浏览器的加密 cookie 库。
 *
 * 用法（作为模块）：
 *   import { getSession, listPlaylists } from './qq-session.mjs'
 *
 * 用法（直接跑，看当前登录态和歌单）：
 *   node --use-system-ca overlay/tools/qq-session.mjs
 */

const PORT = Number(process.env.QQ_DEBUG_PORT ?? 9222)

/* ── 连 CDP ── */

async function cdp() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
  let page = list.find(t => t.type === 'page' && /y\.qq\.com/.test(t.url))
  if (!page) {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?https://y.qq.com/`, { method: 'PUT', signal: AbortSignal.timeout(8000) })
    page = await r.json()
    await new Promise(r => setTimeout(r, 4000))
  }

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
    setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')) } }, 30000)
  })
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? 'eval 失败')
    return r.result.value
  }
  return { ws, evalJs, close: () => ws.close() }
}

/**
 * 取登录态：cookie 字符串 + uin。
 * @returns {Promise<{cookie: string, uin: string, nick: string, raw: object}>}
 */
export async function getSession() {
  const { ws, evalJs, close } = await cdp()
  try {
    const data = await evalJs(`(async () => {
      const ck = document.cookie || ''
      const get = (n) => {
        const m = new RegExp('(?:^|;\\\\s*)' + n + '=([^;]*)').exec(ck)
        return m ? decodeURIComponent(m[1]) : ''
      }
      // 顺便把昵称也取出来（验证登录有效）
      let nick = ''
      try {
        const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
          comm: { ct: 24, cv: 0 },
          req_1: { module: 'music.UserInfo.userInfoServer', method: 'GetLoginUserInfo', param: {} }
        })), { credentials: 'include' })
        const j = await r.json()
        nick = j.req_1?.data?.info?.nick ?? ''
      } catch (e) { /* 忽略 */ }
      return JSON.stringify({ cookie: ck, uin: get('uin') || get('wxuin') || get('euin'), nick })
    })()`)
    const d = JSON.parse(data)
    // 清理 uin 前面的 o（有些情况是 o0123456789 这种）
    const uin = String(d.uin).replace(/^o/, '')
    return { cookie: d.cookie, uin, nick: d.nick, raw: d }
  } finally {
    close()
  }
}

/* ── 带登录态调 musicu ── */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/**
 * 调 musicu.fcg（带登录 cookie）。
 * @param {object} reqObj 请求体
 * @param {string} cookie 从 getSession() 拿到的 cookie
 */
export async function musicuAuthed(reqObj, cookie) {
  const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify(reqObj))
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://y.qq.com/',
      Cookie: cookie,
      Accept: 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(20000),
  })
  return r.json()
}

/**
 * 带登录态调老式 fcg 接口。
 * @param {string} path 以 / 开头的路径（含查询串）
 * @param {string} cookie
 */
export async function fcgAuthed(path, cookie) {
  const r = await fetch('https://c.y.qq.com' + path, {
    headers: {
      'User-Agent': UA,
      Referer: 'https://y.qq.com/',
      Cookie: cookie,
      Accept: 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(20000),
  })
  return r.json()
}

/** 列出当前账号的歌单。 */
export async function listPlaylists(uin, cookie) {
  const j = await musicuAuthed({
    comm: { ct: 24, cv: 0 },
    req_1: {
      module: 'music.musicasset.PlaylistBaseRead',
      method: 'GetPlaylistByUin',
      param: { uin: String(uin), num: 100, page: 0, onlySelf: false },
    },
  }, cookie)
  const d = j.req_1?.data
  if (!d) return { error: `code=${j.req_1?.code}`, raw: j }
  return {
    total: d.total,
    playlists: (d.v_playlist ?? []).map(p => ({
      dirId: p.dirId,
      tid: p.tid,
      name: p.dirName,
      songNum: p.songNum,
      createTime: p.createTime,
      updateTime: p.updateTime,
      dirShow: p.dirShow,
      // tid 是歌单的对外 id，分享链接里用的就是它
    })),
  }
}

/* ── 直接跑：看登录态 ── */

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isMain || process.argv.includes('--run')) {
  console.log(`连调试端口 ${PORT} …\n`)
  try {
    const s = await getSession()
    console.log('════════ 登录态 ════════\n')
    console.log(`  昵称  ${s.nick || '(空 —— 可能没登录)'}`)
    console.log(`  uin   ${s.uin || '(空)'}`)
    console.log(`  cookie 长度  ${s.cookie.length} 字节`)
    console.log(`  关键项  ${['uin', 'qm_keyst', 'qqmusic_key', 'wxuin', 'euin'].map(k => {
      const m = new RegExp('(?:^|;\\s*)' + k + '=').test(s.cookie)
      return k + (m ? '✓' : '✗')
    }).join('  ')}`)

    if (!s.uin) {
      console.log('\n  ✗ 没拿到 uin —— 去调试 Edge 窗口里登录 QQ 音乐，然后重跑')
      process.exit(1)
    }

    console.log('\n════════ 我的歌单 ════════\n')
    const pl = await listPlaylists(s.uin, s.cookie)
    if (pl.error) {
      console.log('  ' + pl.error)
      console.log('  ' + JSON.stringify(pl.raw).slice(0, 300))
    } else {
      console.log(`  共 ${pl.total} 个\n`)
      console.log('  dirId    tid           曲目   名称')
      for (const p of pl.playlists) {
        console.log(`  ${String(p.dirId).padEnd(8)} ${String(p.tid).padEnd(14)} ${String(p.songNum).padStart(4)}   ${p.name}`)
      }
      console.log('\n  （tid 是歌单的对外 id，分享链接里用的就是它）')
    }
  } catch (e) {
    console.log('✗ ' + e.message)
    console.log('\n先确保调试 Edge 在跑：')
    console.log('  powershell -File overlay/tools/launch-debug-edge.ps1')
    process.exit(1)
  }
  process.exit(0)
}
